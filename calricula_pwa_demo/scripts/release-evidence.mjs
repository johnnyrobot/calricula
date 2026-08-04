import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmod,
  mkdir,
  readFile,
  rename,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

import { EVAL_FIXTURES } from './ai-eval-fixtures.mjs';
import { childEnvironment } from './child-environment.mjs';
import { normalizeProductionOrigin } from './verify-production.mjs';
import { parseWranglerJsonc } from './wrangler-config.mjs';
import { collectReleaseInputFiles } from './release-inputs.mjs';

/**
 * Every AI task route a user can reach. Evaluation evidence must carry a
 * verdict for each one, and each verdict must be true, before a release may
 * proceed — a model that fails one route fails that whole feature in
 * production.
 */
const EVALUATION_TASKS = EVAL_FIXTURES.map((fixture) => fixture.task);

function hasEveryEvaluationTask(byTask) {
  return (
    isRecord(byTask) &&
    EVALUATION_TASKS.every((task) => typeof byTask[task] === 'boolean')
  );
}

const EVIDENCE_SCHEMA_VERSION = 2;
const EVIDENCE_DIRECTORY = path.resolve(
  process.cwd(),
  '.release-evidence',
);
const MAX_CAPTURE_BYTES = 5 * 1024 * 1024;
const DISCOVERY_EVALUATION_MAX_AGE_MS = 24 * 60 * 60 * 1_000;
const CANARY_MAX_AGE_MS = 2 * 60 * 60 * 1_000;
const MODEL_ID_PATTERN =
  /^[A-Za-z0-9._-]+\/[A-Za-z0-9._:-]+:free$/;
const SAFE_KEY_STATUS_FIELDS = [
  'accountTier',
  'authenticated',
  'documentedFreeModelLimits',
  'freeModelDailyRemaining',
  'keyExpirationStatus',
  'keySpendLimitReset',
  'keySpendLimitStatus',
].sort();
const CHECKS = {
  discover: {
    script: 'scripts/discover-openrouter-models.mjs',
    evidence: 'ai-discover.json',
  },
  evaluate: {
    script: 'scripts/ai-evaluate.mjs',
    evidence: 'ai-evaluate.json',
  },
  canary: {
    script: 'scripts/ai-canary.mjs',
    evidence: 'ai-canary.json',
  },
};
const TOOL_DEPENDENCIES = {
  lighthouse: 'lighthouse',
  playwright: '@playwright/test',
  wrangler: 'wrangler',
};

export class ReleaseEvidenceError extends Error {}

export function aiCheckEnvironment(check, source = process.env) {
  const environment = childEnvironment(source);
  if (check === 'discover' || check === 'evaluate') {
    if (source.OPENROUTER_API_KEY !== undefined) {
      environment.OPENROUTER_API_KEY = source.OPENROUTER_API_KEY;
    }
  } else if (check === 'canary') {
    for (const name of [
      'CALRICULA_AI_SESSION_COOKIE',
      'CALRICULA_TURNSTILE_TOKEN',
    ]) {
      if (source[name] !== undefined) {
        environment[name] = source[name];
      }
    }
  }
  return environment;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeOpenRouterKeyStatus(value) {
  if (
    !isRecord(value) ||
    JSON.stringify(Object.keys(value).sort()) !==
      JSON.stringify(SAFE_KEY_STATUS_FIELDS) ||
    value.authenticated !== true ||
    (value.accountTier !== 'free' &&
      value.accountTier !== 'credit-enabled') ||
    !isRecord(value.documentedFreeModelLimits) ||
    JSON.stringify(
      Object.keys(value.documentedFreeModelLimits).sort(),
    ) !== JSON.stringify(['requestsPerDay', 'requestsPerMinute']) ||
    value.documentedFreeModelLimits.requestsPerMinute !== 20 ||
    value.documentedFreeModelLimits.requestsPerDay !==
      (value.accountTier === 'free' ? 50 : 1_000) ||
    value.freeModelDailyRemaining !==
      'not-exposed-by-key-endpoint' ||
    (value.keySpendLimitStatus !== 'not-configured' &&
      value.keySpendLimitStatus !== 'available') ||
    (value.keySpendLimitReset !== null &&
      value.keySpendLimitReset !== 'daily' &&
      value.keySpendLimitReset !== 'weekly' &&
      value.keySpendLimitReset !== 'monthly') ||
    (value.keySpendLimitStatus === 'not-configured' &&
      value.keySpendLimitReset !== null) ||
    (value.keyExpirationStatus !== 'not-configured' &&
      value.keyExpirationStatus !== 'valid')
  ) {
    return false;
  }
  return true;
}

export function deriveToolVersions(
  packageJson,
  nodeVersion = process.versions.node,
) {
  if (!isRecord(packageJson)) {
    throw new ReleaseEvidenceError('package.json has an invalid shape.');
  }
  const packageManager = packageJson.packageManager;
  const npmMatch =
    typeof packageManager === 'string'
      ? packageManager.match(/^npm@([0-9]+\.[0-9]+\.[0-9]+)$/)
      : null;
  if (!npmMatch) {
    throw new ReleaseEvidenceError(
      'packageManager must pin one exact npm version.',
    );
  }
  const versions = {
    node: nodeVersion,
    npm: npmMatch[1],
  };
  for (const [label, dependency] of Object.entries(TOOL_DEPENDENCIES)) {
    const version = packageJson.devDependencies?.[dependency];
    if (
      typeof version !== 'string' ||
      !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$/.test(version)
    ) {
      throw new ReleaseEvidenceError(
        `${dependency} must be pinned to one exact version.`,
      );
    }
    versions[label] = version;
  }
  return versions;
}

export async function currentToolVersions() {
  const expected = deriveToolVersions(
    JSON.parse(
      await readFile(path.resolve(process.cwd(), 'package.json'), 'utf8'),
    ),
  );
  const localBinary = (name) =>
    path.join(
      process.cwd(),
      'node_modules',
      '.bin',
      process.platform === 'win32' ? `${name}.cmd` : name,
    );
  const npmCommand = process.env.npm_execpath
    ? [process.execPath, [process.env.npm_execpath, '--version']]
    : [
        process.platform === 'win32' ? 'npm.cmd' : 'npm',
        ['--version'],
      ];
  const commands = {
    npm: npmCommand,
    lighthouse: [localBinary('lighthouse'), ['--version']],
    playwright: [localBinary('playwright'), ['--version']],
    wrangler: [localBinary('wrangler'), ['--version']],
  };
  const observed = {};
  await Promise.all(
    Object.entries(commands).map(async ([label, [command, args]]) => {
      const child = spawn(command, args, {
        cwd: process.cwd(),
        env: childEnvironment(),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      child.stdout?.on('data', (chunk) => {
        output += String(chunk);
      });
      child.stderr?.on('data', (chunk) => {
        output += String(chunk);
      });
      const exitCode = await new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', (code) => resolve(code ?? 1));
      });
      const match = output.match(/\b([0-9]+\.[0-9]+\.[0-9]+)\b/);
      if (exitCode !== 0 || !match) {
        throw new ReleaseEvidenceError(
          `Could not verify the executed ${label} version.`,
        );
      }
      observed[label] = match[1];
    }),
  );
  const actual = {
    node: process.versions.node,
    npm: observed.npm,
    lighthouse: observed.lighthouse,
    playwright: observed.playwright,
    wrangler: observed.wrangler,
  };
  for (const [label, version] of Object.entries(expected)) {
    if (actual[label] !== version) {
      throw new ReleaseEvidenceError(
        `Executed ${label} ${actual[label] ?? 'unknown'} does not match pinned ${version}.`,
      );
    }
  }
  return actual;
}

export async function computeReleaseFingerprint(options = {}) {
  const files = await collectReleaseInputFiles(
    options.cwd ?? process.cwd(),
  );

  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file.relativePath);
    hash.update('\0');
    hash.update(await readFile(file.absolutePath));
    hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}

function parseJsonOutput(output, label) {
  try {
    return JSON.parse(output);
  } catch {
    throw new ReleaseEvidenceError(
      `${label} did not produce one JSON result.`,
    );
  }
}

export function validateRecordedResult(check, result) {
  if (check === 'discover') {
    if (
      !isRecord(result) ||
      !Array.isArray(result.selectedOrderedChain) ||
      typeof result.wranglerPreferredModelsValue !== 'string' ||
      typeof result.selectionBasis !== 'string' ||
      !isSafeOpenRouterKeyStatus(result.keyStatus)
    ) {
      throw new ReleaseEvidenceError(
        'Discovery result or authenticated key status has an invalid shape.',
      );
    }
    return result;
  }
  if (check === 'evaluate') {
    if (
      !Array.isArray(result) ||
      result.length < 1 ||
      result.some(
        (entry) =>
          !isRecord(entry) ||
          typeof entry.model !== 'string' ||
          !isRecord(entry.pass) ||
          typeof entry.pass.rate !== 'number' ||
          !hasEveryEvaluationTask(entry.pass.byTask) ||
          !isRecord(entry.latencyMs),
      )
    ) {
      throw new ReleaseEvidenceError(
        'Evaluation result has an invalid shape.',
      );
    }
    return result;
  }
  if (check === 'canary') {
    if (
      !isRecord(result) ||
      typeof result.baseOrigin !== 'string' ||
      !Array.isArray(result.generations) ||
      result.generations.length !== 2
    ) {
      throw new ReleaseEvidenceError('Canary result has an invalid shape.');
    }
    return result;
  }
  throw new ReleaseEvidenceError(`Unknown AI check: ${check}`);
}

async function runCheck(check, args) {
  const definition = CHECKS[check];
  if (!definition) {
    throw new ReleaseEvidenceError(`Unknown AI check: ${check}`);
  }
  const child = spawn(
    process.execPath,
    [path.resolve(process.cwd(), definition.script), ...args],
    {
      cwd: process.cwd(),
      env: aiCheckEnvironment(check),
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (chunk) => {
    stdout += String(chunk);
    if (Buffer.byteLength(stdout, 'utf8') > MAX_CAPTURE_BYTES) {
      child.kill('SIGTERM');
    }
  });
  child.stderr?.on('data', (chunk) => {
    stderr += String(chunk);
    if (Buffer.byteLength(stderr, 'utf8') > MAX_CAPTURE_BYTES) {
      child.kill('SIGTERM');
    }
  });
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0) {
    const lastLine =
      stderr
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .at(-1) ?? `${check} exited with code ${exitCode}.`;
    throw new ReleaseEvidenceError(lastLine.slice(0, 500));
  }
  return validateRecordedResult(check, parseJsonOutput(stdout, check));
}

export async function recordAiCheck(check, args = []) {
  const definition = CHECKS[check];
  if (!definition) {
    throw new ReleaseEvidenceError(`Unknown AI check: ${check}`);
  }
  const [fingerprintBefore, toolVersions] = await Promise.all([
    computeReleaseFingerprint(),
    currentToolVersions(),
  ]);
  const apiKey =
    check === 'discover' || check === 'evaluate'
      ? process.env.OPENROUTER_API_KEY?.trim()
      : '';
  if (
    (check === 'discover' || check === 'evaluate') &&
    !apiKey
  ) {
    throw new ReleaseEvidenceError(
      'OPENROUTER_API_KEY is required to bind credentialed release evidence.',
    );
  }
  const result = await runCheck(check, args);
  const fingerprintAfter = await computeReleaseFingerprint();
  if (fingerprintBefore !== fingerprintAfter) {
    throw new ReleaseEvidenceError(
      'Release source changed while the AI check was running; rerun it.',
    );
  }

  const evidence = {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    check,
    recordedAt: new Date().toISOString(),
    sourceFingerprint: fingerprintAfter,
    toolVersions,
    credentialFingerprint: apiKey
      ? `sha256:${createHash('sha256').update(apiKey).digest('hex')}`
      : null,
    result,
  };
  await mkdir(EVIDENCE_DIRECTORY, { recursive: true });
  const destination = path.join(EVIDENCE_DIRECTORY, definition.evidence);
  const temporary = `${destination}.tmp`;
  await writeFile(temporary, `${JSON.stringify(evidence, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await rename(temporary, destination);
  await chmod(destination, 0o600);
  return destination;
}

export function parseWranglerReleaseConfig(text) {
  const parsed = parseWranglerJsonc(text);
  if (
    typeof parsed.vars !== 'object' ||
    parsed.vars === null ||
    Array.isArray(parsed.vars)
  ) {
    throw new ReleaseEvidenceError(
      'wrangler.jsonc is missing its vars object.',
    );
  }
  function variable(name) {
    const value = parsed.vars[name];
    if (typeof value !== 'string') {
      throw new ReleaseEvidenceError(
        `wrangler.jsonc is missing ${name}.`,
      );
    }
    return value.trim();
  }
  const enabled = variable('AI_ENABLED');
  const appOrigin = variable('APP_ORIGIN');
  const configuredModels = [
    ...new Set(
      variable('OPENROUTER_FREE_MODELS')
        .split(/[\s,]+/)
        .map((model) => model.trim())
        .filter(Boolean),
    ),
  ];
  if (enabled !== 'true') {
    throw new ReleaseEvidenceError(
      'AI_ENABLED must be true before a release deployment.',
    );
  }
  const normalizedOrigin = normalizeProductionOrigin(appOrigin);
  if (!normalizedOrigin.startsWith('https://')) {
    throw new ReleaseEvidenceError(
      'APP_ORIGIN must be the exact HTTPS production origin.',
    );
  }
  if (
    configuredModels.length !== 2 ||
    configuredModels.some(
      (model) =>
        model === 'openrouter/free' || !MODEL_ID_PATTERN.test(model),
    )
  ) {
    throw new ReleaseEvidenceError(
      'OPENROUTER_FREE_MODELS must contain exactly two distinct concrete exact :free models in fallback order.',
    );
  }
  return {
    appOrigin: normalizedOrigin,
    configuredModels,
  };
}

function verifyEvidenceEnvelope(
  evidence,
  check,
  fingerprint,
  now,
  maximumAgeMs,
  toolVersions,
) {
  if (
    !isRecord(evidence) ||
    evidence.schemaVersion !== EVIDENCE_SCHEMA_VERSION ||
    evidence.check !== check ||
    evidence.sourceFingerprint !== fingerprint ||
    JSON.stringify(evidence.toolVersions) !==
      JSON.stringify(toolVersions) ||
    typeof evidence.recordedAt !== 'string'
  ) {
    throw new ReleaseEvidenceError(
      `${check} evidence is missing, malformed, or belongs to different source.`,
    );
  }
  const recordedAt = Date.parse(evidence.recordedAt);
  if (
    Number.isNaN(recordedAt) ||
    recordedAt > now + 5 * 60 * 1_000 ||
    now - recordedAt > maximumAgeMs
  ) {
    throw new ReleaseEvidenceError(
      `${check} evidence is stale or has an invalid timestamp.`,
    );
  }
  return validateRecordedResult(check, evidence.result);
}

function sameOrderedValues(left, right) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export function verifyReleaseEvidence({
  records,
  phase,
  sourceFingerprint,
  wranglerConfig,
  now = Date.now(),
  baseOrigin,
  toolVersions,
  canaryNotBefore,
  expectedCredentialFingerprint,
}) {
  if (phase !== 'predeploy' && phase !== 'complete') {
    throw new ReleaseEvidenceError(
      'Evidence phase must be predeploy or complete.',
    );
  }
  const config = parseWranglerReleaseConfig(wranglerConfig);
  if (
    baseOrigin &&
    normalizeProductionOrigin(baseOrigin) !== config.appOrigin
  ) {
    throw new ReleaseEvidenceError(
      'Release base URL does not match APP_ORIGIN.',
    );
  }

  const discovery = verifyEvidenceEnvelope(
    records.discover,
    'discover',
    sourceFingerprint,
    now,
    DISCOVERY_EVALUATION_MAX_AGE_MS,
    toolVersions,
  );
  const evaluation = verifyEvidenceEnvelope(
    records.evaluate,
    'evaluate',
    sourceFingerprint,
    now,
    DISCOVERY_EVALUATION_MAX_AGE_MS,
    toolVersions,
  );
  const discoveryCredential = records.discover?.credentialFingerprint;
  const evaluationCredential = records.evaluate?.credentialFingerprint;
  if (
    !/^sha256:[0-9a-f]{64}$/.test(discoveryCredential ?? '') ||
    discoveryCredential !== evaluationCredential ||
    (expectedCredentialFingerprint &&
      discoveryCredential !== expectedCredentialFingerprint)
  ) {
    throw new ReleaseEvidenceError(
      'Discovery and evaluation evidence is not bound to the deployed OpenRouter credential.',
    );
  }

  if (
    discovery.selectionBasis !== 'configured-eval-approved' ||
    discovery.wranglerPreferredModelsValue !==
      config.configuredModels.join(',') ||
    !sameOrderedValues(discovery.selectedOrderedChain, [
      ...config.configuredModels,
      'openrouter/free',
    ])
  ) {
    throw new ReleaseEvidenceError(
      'Discovery evidence does not approve the configured model order.',
    );
  }
  if (
    !sameOrderedValues(
      evaluation.map((entry) => entry.model),
      config.configuredModels,
    ) ||
    evaluation.some(
      (entry) =>
        entry.pass.rate !== 1 ||
        EVALUATION_TASKS.some((task) => entry.pass.byTask[task] !== true),
    )
  ) {
    throw new ReleaseEvidenceError(
      'Evaluation evidence does not fully pass the configured model order.',
    );
  }

  if (phase === 'complete') {
    const canary = verifyEvidenceEnvelope(
      records.canary,
      'canary',
      sourceFingerprint,
      now,
      CANARY_MAX_AGE_MS,
      toolVersions,
    );
    if (
      normalizeProductionOrigin(canary.baseOrigin) !== config.appOrigin ||
      canary.health?.status !== 'ok' ||
      canary.session?.status !== 'ok' ||
      !sameOrderedValues(
        canary.generations.map((generation) => generation.task),
        ['chat', 'slos'],
      ) ||
      canary.generations.some(
        (generation) =>
          typeof generation.model !== 'string' ||
          !MODEL_ID_PATTERN.test(generation.model),
      )
    ) {
      throw new ReleaseEvidenceError(
        'Canary evidence does not prove both production AI task shapes.',
      );
    }
    if (canaryNotBefore) {
      const minimum = Date.parse(canaryNotBefore);
      const recordedAt = Date.parse(records.canary.recordedAt);
      if (Number.isNaN(minimum) || recordedAt < minimum) {
        throw new ReleaseEvidenceError(
          'Canary evidence was not recorded after the current deployment.',
        );
      }
    }
  }
  return {
    appOrigin: config.appOrigin,
    models: config.configuredModels,
    phase,
  };
}

async function readEvidence(check) {
  const definition = CHECKS[check];
  try {
    return JSON.parse(
      await readFile(
        path.join(EVIDENCE_DIRECTORY, definition.evidence),
        'utf8',
      ),
    );
  } catch {
    return undefined;
  }
}

export async function verifyRecordedEvidence({
  phase,
  baseOrigin,
  canaryNotBefore,
  expectedCredentialFingerprint,
}) {
  const [
    sourceFingerprint,
    toolVersions,
    wranglerConfig,
    discover,
    evaluate,
    canary,
  ] =
    await Promise.all([
      computeReleaseFingerprint(),
      currentToolVersions(),
      readFile(path.resolve(process.cwd(), 'wrangler.jsonc'), 'utf8'),
      readEvidence('discover'),
      readEvidence('evaluate'),
      readEvidence('canary'),
    ]);
  return verifyReleaseEvidence({
    records: { canary, discover, evaluate },
    phase,
    sourceFingerprint,
    wranglerConfig,
    baseOrigin,
    toolVersions,
    canaryNotBefore,
    expectedCredentialFingerprint,
  });
}

function parseVerifyArguments(argv) {
  let phase = '';
  let baseOrigin = process.env.CALRICULA_RELEASE_BASE_URL ?? '';
  const canaryNotBefore =
    process.env.CALRICULA_RELEASE_PUBLISHED_AT ?? '';
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--phase') {
      phase = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (argv[index] === '--base-url') {
      baseOrigin = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    throw new ReleaseEvidenceError(`Unknown argument: ${argv[index]}`);
  }
  return { baseOrigin, canaryNotBefore, phase };
}

export async function runEvidenceCli(argv = process.argv.slice(2)) {
  const command = argv[0];
  if (command === 'record') {
    const check = argv[1];
    const destination = await recordAiCheck(check, argv.slice(2));
    console.log(
      `[release-evidence] Recorded ${check} evidence at ${path.relative(
        process.cwd(),
        destination,
      )}.`,
    );
    return;
  }
  if (command === 'verify') {
    const result = await verifyRecordedEvidence(
      parseVerifyArguments(argv.slice(1)),
    );
    console.log(
      `[release-evidence] ${result.phase} evidence passed for ${result.models.length} model(s) and ${result.appOrigin}.`,
    );
    return;
  }
  throw new ReleaseEvidenceError(
    'Use `record <discover|evaluate|canary>` or `verify --phase <predeploy|complete>`.',
  );
}

const entryPoint = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : '';
if (import.meta.url === entryPoint) {
  runEvidenceCli().catch((error) => {
    console.error(
      `[release-evidence] ${
        error instanceof Error ? error.message : 'Evidence command failed.'
      }`,
    );
    process.exitCode = 1;
  });
}
