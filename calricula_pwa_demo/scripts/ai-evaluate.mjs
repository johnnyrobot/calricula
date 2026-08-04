import { pathToFileURL } from 'node:url';
import process from 'node:process';

import { EVAL_FIXTURES, scoreFixture } from './ai-eval-fixtures.mjs';
import { readJsonWithinLimit } from './read-json-with-limit.mjs';

const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';
const OPENROUTER_COMPLETIONS_URL = `${OPENROUTER_API_BASE}/chat/completions`;
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_RESPONSE_BYTES = 512 * 1024;
export const MAX_CANDIDATES = 4;
export const FIXTURES_PER_CANDIDATE = EVAL_FIXTURES.length;
export const MAX_GENERATION_REQUESTS =
  MAX_CANDIDATES * FIXTURES_PER_CANDIDATE;
export const MINIMUM_CONTEXT_LENGTH = 32_768;
/**
 * Free-tier providers rate-limit around 20 requests per minute. Seven routes
 * per candidate is well inside that, but the requests are paced anyway so a
 * four-candidate run cannot trip a limit and score a model as failing for a
 * reason that has nothing to do with its output quality.
 */
export const REQUEST_SPACING_MS = 3_000;

const MODEL_ID_PATTERN =
  /^[A-Za-z0-9._-]+\/[A-Za-z0-9._:-]+:free$/;
const PRICE_FIELDS = ['prompt', 'completion', 'request'];

export class EvaluationConfigurationError extends Error {}

function defaultSleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringArray(value) {
  return Array.isArray(value)
    ? value.filter((entry) => typeof entry === 'string')
    : [];
}

function isZeroPrice(value) {
  if (value === undefined || value === null || value === '') {
    return false;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric === 0;
}

function hasOnlyZeroRuntimePrices(pricing) {
  if (!isRecord(pricing)) return false;
  if (!isZeroPrice(pricing.prompt) || !isZeroPrice(pricing.completion)) {
    return false;
  }
  if (!isZeroPrice(pricing.request)) return false;

  if (pricing.overrides !== undefined) {
    if (!Array.isArray(pricing.overrides)) return false;
    for (const override of pricing.overrides) {
      if (!isRecord(override)) return false;
      for (const field of PRICE_FIELDS) {
        if (!isZeroPrice(override[field])) return false;
      }
    }
  }
  return true;
}

function isTextArchitecture(architecture) {
  if (!isRecord(architecture)) return false;
  const inputModalities = stringArray(architecture.input_modalities);
  const outputModalities = stringArray(architecture.output_modalities);
  return (
    inputModalities.includes('text') && outputModalities.includes('text')
  );
}

function isSafeCatalogCandidate(model) {
  const supportedParameters = stringArray(model.supported_parameters);
  return (
    typeof model.id === 'string' &&
    MODEL_ID_PATTERN.test(model.id) &&
    Number.isInteger(model.context_length) &&
    model.context_length >= MINIMUM_CONTEXT_LENGTH &&
    isTextArchitecture(model.architecture) &&
    hasOnlyZeroRuntimePrices(model.pricing) &&
    supportedParameters.includes('response_format') &&
    supportedParameters.includes('structured_outputs')
  );
}

export function parseCandidateModels(value) {
  const candidates = [
    ...new Set(
      value
        .split(/[\s,]+/)
        .map((model) => model.trim())
        .filter(Boolean),
    ),
  ];
  if (candidates.length === 0) {
    throw new EvaluationConfigurationError(
      'Provide at least one concrete candidate model.',
    );
  }
  if (candidates.length > MAX_CANDIDATES) {
    throw new EvaluationConfigurationError(
      `At most ${MAX_CANDIDATES} candidate models may be evaluated at once.`,
    );
  }
  if (
    candidates.some(
      (model) => model === 'openrouter/free' || !MODEL_ID_PATTERN.test(model),
    )
  ) {
    throw new EvaluationConfigurationError(
      'Every candidate must be a concrete exact :free model ID.',
    );
  }
  return candidates;
}

function parseModelList(value, label) {
  if (!isRecord(value) || !Array.isArray(value.data)) {
    throw new EvaluationConfigurationError(
      `${label} returned an unexpected response shape.`,
    );
  }
  return value.data.filter(isRecord);
}

async function fetchJson(fetchFn, url, apiKey, options = {}) {
  const response = await fetchFn(url, {
    ...options,
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      'x-title': 'Calricula model evaluation',
      ...options.headers,
    },
    redirect: 'error',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const payload = await readJsonWithinLimit(
    response,
    'OpenRouter response',
    MAX_RESPONSE_BYTES,
  );
  if (!response.ok) {
    throw new Error(`OpenRouter returned HTTP ${response.status}.`);
  }
  return payload;
}

async function validateLiveCandidates(candidates, apiKey, fetchFn) {
  const userCatalogUrl = new URL(`${OPENROUTER_API_BASE}/models/user`);
  userCatalogUrl.searchParams.set('offset', '0');
  userCatalogUrl.searchParams.set('limit', '1000');

  const zdrCatalogUrl = new URL(`${OPENROUTER_API_BASE}/models`);
  zdrCatalogUrl.searchParams.set('offset', '0');
  zdrCatalogUrl.searchParams.set('limit', '1000');
  zdrCatalogUrl.searchParams.set('input_modalities', 'text');
  zdrCatalogUrl.searchParams.set('output_modalities', 'text');
  zdrCatalogUrl.searchParams.set('zdr', 'true');

  const [userPayload, zdrPayload] = await Promise.all([
    fetchJson(fetchFn, userCatalogUrl, apiKey),
    fetchJson(fetchFn, zdrCatalogUrl, apiKey),
  ]);
  const userIds = new Set(
    parseModelList(userPayload, 'Authenticated model catalog')
      .map((model) => model.id)
      .filter((id) => typeof id === 'string'),
  );
  const safeZdrIds = new Set(
    parseModelList(zdrPayload, 'ZDR model catalog')
      .filter(isSafeCatalogCandidate)
      .map((model) => model.id),
  );

  const rejected = candidates.filter(
    (model) => !userIds.has(model) || !safeZdrIds.has(model),
  );
  if (rejected.length > 0) {
    throw new EvaluationConfigurationError(
      `${rejected.length} candidate model(s) failed the live account, free-price, ZDR, text, or structured-output checks.`,
    );
  }
}

function baseCompletionBody(model, fixture) {
  const structured = fixture.kind === 'structured';
  return {
    model,
    messages: fixture.messages,
    provider: {
      allow_fallbacks: false,
      data_collection: 'deny',
      zdr: true,
      max_price: {
        prompt: 0,
        completion: 0,
        request: 0,
      },
      ...(structured ? { require_parameters: true } : {}),
    },
    stream: false,
    temperature: 0,
    max_tokens: fixture.maxTokens,
    ...(structured
      ? {
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: `calricula_eval_${fixture.task.replace(/-/g, '_')}`,
              strict: true,
              schema: fixture.schema,
            },
          },
        }
      : {}),
  };
}

function extractCompletion(payload, model) {
  if (!isRecord(payload) || payload.model !== model) {
    throw new Error('OpenRouter did not confirm the evaluated model.');
  }
  if (
    isRecord(payload.usage) &&
    Object.hasOwn(payload.usage, 'cost') &&
    payload.usage.cost !== null &&
    payload.usage.cost !== 0
  ) {
    throw new Error('OpenRouter reported a non-zero evaluation cost.');
  }
  if (isRecord(payload.usage) && isRecord(payload.usage.cost_details)) {
    for (const value of Object.values(payload.usage.cost_details)) {
      if (
        value !== null &&
        (typeof value !== 'number' ||
          !Number.isFinite(value) ||
          value !== 0)
      ) {
        throw new Error('OpenRouter reported a non-zero evaluation cost.');
      }
    }
  }
  if (
    !Array.isArray(payload.choices) ||
    !isRecord(payload.choices[0]) ||
    payload.choices[0].finish_reason === 'content_filter' ||
    !isRecord(payload.choices[0].message) ||
    (typeof payload.choices[0].message.refusal === 'string' &&
      payload.choices[0].message.refusal.trim()) ||
    typeof payload.choices[0].message.content !== 'string'
  ) {
    throw new Error('OpenRouter returned an invalid completion shape.');
  }
  return payload.choices[0].message.content.trim();
}

/**
 * Scores one task route. A transport, policy, or shape failure is scored as a
 * failed fixture with every check false — the evaluator never retries, so a
 * flaky provider reads as a failing candidate rather than a silent pass.
 */
async function evaluateFixture({
  apiKey,
  model,
  fixture,
  fetchFn,
  now,
}) {
  const started = now();
  let score = null;
  try {
    const payload = await fetchJson(
      fetchFn,
      OPENROUTER_COMPLETIONS_URL,
      apiKey,
      {
        method: 'POST',
        body: JSON.stringify(baseCompletionBody(model, fixture)),
      },
    );
    score = scoreFixture(fixture, extractCompletion(payload, model));
  } catch {
    score = {
      passed: false,
      checks: fixture.checks.map((check) => ({
        id: check.id,
        workerEnforced: check.workerEnforced,
        passed: false,
      })),
    };
  }
  return {
    passed: score.passed,
    checks: score.checks,
    latencyMs: Math.max(0, Math.round(now() - started)),
  };
}

export async function evaluateCandidates({
  apiKey,
  candidates,
  fetchFn = globalThis.fetch.bind(globalThis),
  now = () => performance.now(),
  sleep = defaultSleep,
}) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new EvaluationConfigurationError(
      'Set OPENROUTER_API_KEY before evaluation.',
    );
  }
  if (
    !Array.isArray(candidates) ||
    candidates.length === 0 ||
    candidates.length > MAX_CANDIDATES ||
    new Set(candidates).size !== candidates.length ||
    candidates.some(
      (model) =>
        typeof model !== 'string' ||
        model === 'openrouter/free' ||
        !MODEL_ID_PATTERN.test(model),
    )
  ) {
    throw new EvaluationConfigurationError(
      'Candidate input must contain one to four concrete exact :free model IDs.',
    );
  }

  await validateLiveCandidates(candidates, apiKey.trim(), fetchFn);

  const results = [];
  for (const model of candidates) {
    const byTask = {};
    const checks = {};
    const latencyByTask = {};
    let passedCount = 0;

    for (const [index, fixture] of EVAL_FIXTURES.entries()) {
      if (index > 0) {
        await sleep(REQUEST_SPACING_MS);
      }
      const outcome = await evaluateFixture({
        apiKey: apiKey.trim(),
        model,
        fixture,
        fetchFn,
        now,
      });
      byTask[fixture.task] = outcome.passed;
      checks[fixture.task] = outcome.checks;
      latencyByTask[fixture.task] = outcome.latencyMs;
      passedCount += Number(outcome.passed);
    }

    const latencies = Object.values(latencyByTask);
    results.push({
      model,
      pass: {
        rate: passedCount / FIXTURES_PER_CANDIDATE,
        byTask,
      },
      checks,
      latencyMs: {
        byTask: latencyByTask,
        mean: Math.round(
          latencies.reduce((total, value) => total + value, 0) /
            latencies.length,
        ),
      },
    });
  }
  return results;
}

function usage() {
  console.log(`Usage:
  OPENROUTER_API_KEY=... npm run ai:evaluate -- --models model/name:free[,model/name:free]

The command revalidates one to four concrete candidates against the authenticated
and ZDR-filtered catalogs, then makes exactly one fixed request per AI task route
per model (${FIXTURES_PER_CANDIDATE} routes, at most ${MAX_GENERATION_REQUESTS} generation requests), paced to respect
free-tier limits. It never retries and never prints prompts or model content.

A candidate is eligible only when pass.rate is 1 — every route.`);
}

function parseArguments(argv) {
  let models = process.env.OPENROUTER_EVAL_CANDIDATES ?? '';
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      usage();
      return null;
    }
    if (argument === '--models') {
      models = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    throw new EvaluationConfigurationError(`Unknown argument: ${argument}`);
  }
  return parseCandidateModels(models);
}

export async function runCli(argv = process.argv.slice(2), options = {}) {
  const candidates = parseArguments(argv);
  if (candidates === null) return;
  const results = await evaluateCandidates({
    apiKey: options.apiKey ?? process.env.OPENROUTER_API_KEY ?? '',
    candidates,
    ...(options.fetchFn ? { fetchFn: options.fetchFn } : {}),
    ...(options.now ? { now: options.now } : {}),
    ...(options.sleep ? { sleep: options.sleep } : {}),
  });
  // Only task names, check IDs, booleans, and latencies — never content.
  console.log(JSON.stringify(results, null, 2));
  if (results.some((result) => result.pass.rate !== 1)) {
    process.exitCode = 1;
  }
}

const entryPoint = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : '';
if (import.meta.url === entryPoint) {
  runCli().catch((error) => {
    const message =
      error instanceof EvaluationConfigurationError
        ? error.message
        : 'Evaluation could not be completed.';
    console.error(`[ai-evaluate] ${message}`);
    process.exitCode = 1;
  });
}
