import { pathToFileURL } from 'node:url';
import process from 'node:process';

import { readJsonWithinLimit } from './read-json-with-limit.mjs';

const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';
const OPENROUTER_COMPLETIONS_URL = `${OPENROUTER_API_BASE}/chat/completions`;
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_RESPONSE_BYTES = 512 * 1024;
export const MAX_CANDIDATES = 4;
export const FIXTURES_PER_CANDIDATE = 2;
export const MAX_GENERATION_REQUESTS =
  MAX_CANDIDATES * FIXTURES_PER_CANDIDATE;
export const MINIMUM_CONTEXT_LENGTH = 32_768;

const MODEL_ID_PATTERN =
  /^[A-Za-z0-9._-]+\/[A-Za-z0-9._:-]+:free$/;
const PRICE_FIELDS = ['prompt', 'completion', 'request'];
const ACTION_VERBS = [
  'Analyze',
  'Apply',
  'Compare',
  'Construct',
  'Create',
  'Demonstrate',
  'Design',
  'Evaluate',
  'Explain',
  'Identify',
  'Implement',
  'Interpret',
  'Solve',
];
const ACTION_VERB_PATTERN = `^(${ACTION_VERBS.join('|')})\\b`;

const PLAIN_FIXTURE = {
  task: 'plain',
  messages: [
    {
      role: 'system',
      content:
        'You are being evaluated as a concise curriculum-writing assistant. Follow the user request exactly and do not add headings, lists, or JSON.',
    },
    {
      role: 'user',
      content:
        'In one sentence of 12 to 45 words, explain why measurable course outcomes help curriculum review. Use both the words "outcomes" and "review".',
    },
  ],
};

const STRUCTURED_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    slos: {
      type: 'array',
      minItems: 2,
      maxItems: 2,
      items: {
        type: 'string',
        minLength: 12,
        maxLength: 240,
        pattern: ACTION_VERB_PATTERN,
      },
    },
  },
  required: ['slos'],
};

const STRUCTURED_FIXTURE = {
  task: 'structured',
  messages: [
    {
      role: 'system',
      content:
        'Draft exactly two distinct, observable student learning outcomes from the supplied synthetic course data. Return only the required JSON object.',
    },
    {
      role: 'user',
      content:
        'Course: TEST 100, Curriculum Workflow Fundamentals. Topics: measurable learning outcomes; local curriculum review workflow. Each outcome must begin with an action verb allowed by the response schema.',
    },
  ],
};

export class EvaluationConfigurationError extends Error {}

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
      ...(fixture.task === 'structured'
        ? { require_parameters: true }
        : {}),
    },
    stream: false,
    temperature: 0,
    max_tokens: fixture.task === 'plain' ? 160 : 400,
    ...(fixture.task === 'structured'
      ? {
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'calricula_model_evaluation_slos',
              strict: true,
              schema: STRUCTURED_SCHEMA,
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

function validatePlainContent(content) {
  if (
    content.length < 20 ||
    content.length > 600 ||
    content.includes('\n') ||
    !/\boutcomes\b/i.test(content) ||
    !/\breview\b/i.test(content)
  ) {
    return false;
  }
  const words = content.split(/\s+/).filter(Boolean);
  return words.length >= 12 && words.length <= 45;
}

function validateStructuredContent(content) {
  let value;
  try {
    value = JSON.parse(content);
  } catch {
    return false;
  }
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 1 ||
    !Array.isArray(value.slos) ||
    value.slos.length !== 2
  ) {
    return false;
  }
  const normalized = [];
  for (const slo of value.slos) {
    if (
      typeof slo !== 'string' ||
      slo.length < 12 ||
      slo.length > 240 ||
      !new RegExp(ACTION_VERB_PATTERN).test(slo)
    ) {
      return false;
    }
    normalized.push(slo.trim().toLowerCase());
  }
  return new Set(normalized).size === normalized.length;
}

async function evaluateFixture({
  apiKey,
  model,
  fixture,
  fetchFn,
  now,
}) {
  const started = now();
  let passed = false;
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
    const content = extractCompletion(payload, model);
    passed =
      fixture.task === 'plain'
        ? validatePlainContent(content)
        : validateStructuredContent(content);
  } catch {
    passed = false;
  }
  return {
    passed,
    latencyMs: Math.max(0, Math.round(now() - started)),
  };
}

export async function evaluateCandidates({
  apiKey,
  candidates,
  fetchFn = globalThis.fetch.bind(globalThis),
  now = () => performance.now(),
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
    const plain = await evaluateFixture({
      apiKey: apiKey.trim(),
      model,
      fixture: PLAIN_FIXTURE,
      fetchFn,
      now,
    });
    const structured = await evaluateFixture({
      apiKey: apiKey.trim(),
      model,
      fixture: STRUCTURED_FIXTURE,
      fetchFn,
      now,
    });
    const passedCount = Number(plain.passed) + Number(structured.passed);
    results.push({
      model,
      pass: {
        plain: plain.passed,
        structured: structured.passed,
        rate: passedCount / FIXTURES_PER_CANDIDATE,
      },
      latencyMs: {
        plain: plain.latencyMs,
        structured: structured.latencyMs,
        mean: Math.round((plain.latencyMs + structured.latencyMs) / 2),
      },
    });
  }
  return results;
}

function usage() {
  console.log(`Usage:
  OPENROUTER_API_KEY=... npm run ai:evaluate -- --models model/name:free[,model/name:free]

The command revalidates one to four concrete candidates against the authenticated
and ZDR-filtered catalogs, then makes exactly one fixed plain request and one
strict JSON-schema request per model. It never retries and never prints content.`);
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

export async function runCli(argv = process.argv.slice(2)) {
  const candidates = parseArguments(argv);
  if (candidates === null) return;
  const results = await evaluateCandidates({
    apiKey: process.env.OPENROUTER_API_KEY ?? '',
    candidates,
  });
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
