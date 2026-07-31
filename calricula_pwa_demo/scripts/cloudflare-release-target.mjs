import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  appendFile,
  chmod,
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { hostname } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { parseWranglerJsonc } from './wrangler-config.mjs';

const MAX_OUTPUT_BYTES = 5 * 1024 * 1024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACCOUNT_ID_PATTERN = /^[0-9a-f]{32}$/i;
const WORKER_NOT_FOUND_PATTERN = /\[code:\s*10007\]/;

export const OWNERSHIP_RECORD_PATH = path.resolve(
  process.cwd(),
  '.release-evidence',
  'worker-ownership.json',
);
export const CURRENT_DEPLOYMENT_PATH = path.resolve(
  process.cwd(),
  '.release-evidence',
  'current-deployment.json',
);
export const PENDING_DEPLOYMENT_PATH = path.resolve(
  process.cwd(),
  '.release-evidence',
  'pending-deployment.json',
);
export const DEPLOYMENT_HISTORY_PATH = path.resolve(
  process.cwd(),
  '.release-evidence',
  'deployment-history.jsonl',
);
const PENDING_DEPLOYMENT_LOCK_PATH = path.resolve(
  process.cwd(),
  '.release-evidence',
  'pending-deployment.lock',
);
export const RELEASE_LIFECYCLE_LOCK_PATH = path.resolve(
  process.cwd(),
  '.release-evidence',
  'release-lifecycle.lock',
);
const RELEASE_LIFECYCLE_OWNER_FILE = 'owner.json';

export class CloudflareTargetError extends Error {}

const WRANGLER_READ_ONLY_SECRET_KEYS = [
  'AI_SESSION_HMAC_SECRET',
  'CALRICULA_AI_SESSION_COOKIE',
  'CALRICULA_SECRETS_FILE',
  'CALRICULA_TURNSTILE_TOKEN',
  'CF_ACCOUNT_ID',
  'CF_API_KEY',
  'CF_API_BASE_URL',
  'CF_API_TOKEN',
  'CF_EMAIL',
  'CLOUDFLARE_API_BASE_URL',
  'CLOUDFLARE_COMPLIANCE_REGION',
  'CLOUDFLARE_ENV',
  'OPENROUTER_API_KEY',
  'TURNSTILE_SECRET_KEY',
  'WRANGLER_API_ENVIRONMENT',
  'WRANGLER_CI_OVERRIDE_NAME',
  'WRANGLER_OUTPUT_FILE_PATH',
];

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    if (error?.code === 'EPERM') return true;
    throw error;
  }
}

async function readLifecycleLockOwner(lockPath) {
  const ownerPath = path.join(lockPath, RELEASE_LIFECYCLE_OWNER_FILE);
  let lockStat;
  let ownerStat;
  let text;
  try {
    [lockStat, ownerStat, text] = await Promise.all([
      lstat(lockPath),
      lstat(ownerPath),
      readFile(ownerPath, 'utf8'),
    ]);
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined;
    throw new CloudflareTargetError(
      'The release lifecycle lock could not be inspected safely.',
    );
  }
  if (
    !lockStat.isDirectory() ||
    lockStat.isSymbolicLink() ||
    (lockStat.mode & 0o077) !== 0 ||
    !ownerStat.isFile() ||
    ownerStat.isSymbolicLink() ||
    (ownerStat.mode & 0o077) !== 0
  ) {
    throw new CloudflareTargetError(
      'The release lifecycle lock must be a private directory with a private owner record.',
    );
  }
  let owner;
  try {
    owner = JSON.parse(text);
  } catch {
    throw new CloudflareTargetError(
      'The release lifecycle lock owner record is invalid.',
    );
  }
  if (
    owner?.schemaVersion !== 1 ||
    !UUID_PATTERN.test(owner.token ?? '') ||
    !Number.isSafeInteger(owner.pid) ||
    owner.pid <= 0 ||
    (owner.childPid !== null &&
      (!Number.isSafeInteger(owner.childPid) ||
        owner.childPid <= 0)) ||
    typeof owner.hostname !== 'string' ||
    !owner.hostname ||
    Number.isNaN(Date.parse(owner.createdAt ?? ''))
  ) {
    throw new CloudflareTargetError(
      'The release lifecycle lock owner record is invalid.',
    );
  }
  return owner;
}

export async function assertReleaseLifecycleLease(lease) {
  if (
    !lease ||
    typeof lease.lockPath !== 'string' ||
    !UUID_PATTERN.test(lease.token ?? '')
  ) {
    throw new CloudflareTargetError(
      'A valid release lifecycle lease is required.',
    );
  }
  const owner = await readLifecycleLockOwner(lease.lockPath);
  if (
    !owner ||
    owner.token !== lease.token ||
    owner.pid !== lease.pid ||
    owner.hostname !== lease.hostname
  ) {
    throw new CloudflareTargetError(
      'The release lifecycle lease is no longer owned by this process.',
    );
  }
  return true;
}

export async function acquireReleaseLifecycleLock({
  lockPath = RELEASE_LIFECYCLE_LOCK_PATH,
  pid = process.pid,
  host = hostname(),
  now = () => new Date(),
  isProcessAlive = processIsAlive,
  token = randomUUID(),
} = {}) {
  if (
    !Number.isSafeInteger(pid) ||
    pid <= 0 ||
    typeof host !== 'string' ||
    !host ||
    !UUID_PATTERN.test(token)
  ) {
    throw new CloudflareTargetError(
      'Release lifecycle lock ownership is invalid.',
    );
  }
  await mkdir(path.dirname(lockPath), { recursive: true });
  const owner = {
    schemaVersion: 1,
    token,
    pid,
    childPid: null,
    hostname: host,
    createdAt: now().toISOString(),
  };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const candidate = `${lockPath}.candidate-${token}`;
    await mkdir(candidate, { mode: 0o700 });
    await writeFile(
      path.join(candidate, RELEASE_LIFECYCLE_OWNER_FILE),
      `${JSON.stringify(owner, null, 2)}\n`,
      { encoding: 'utf8', flag: 'wx', mode: 0o600 },
    );
    try {
      await rename(candidate, lockPath);
    } catch (error) {
      await rm(candidate, { force: true, recursive: true });
      if (
        error?.code !== 'EEXIST' &&
        error?.code !== 'ENOTEMPTY'
      ) {
        throw new CloudflareTargetError(
          'The release lifecycle lock could not be acquired safely.',
        );
      }
      const existing = await readLifecycleLockOwner(lockPath);
      if (!existing) {
        continue;
      }
      if (existing.hostname !== host) {
        throw new CloudflareTargetError(
          'Another host owns the release lifecycle lock.',
        );
      }
      if (
        isProcessAlive(existing.pid) ||
        (existing.childPid !== null &&
          isProcessAlive(existing.childPid))
      ) {
        throw new CloudflareTargetError(
          'Another release process is still active.',
        );
      }
      const stalePath = `${lockPath}.stale-${randomUUID()}`;
      try {
        await rename(lockPath, stalePath);
      } catch (renameError) {
        if (renameError?.code === 'ENOENT') continue;
        throw new CloudflareTargetError(
          'A stale release lifecycle lock could not be recovered safely.',
        );
      }
      await rm(stalePath, { force: true, recursive: true });
      continue;
    }

    let released = false;
    return {
      ...owner,
      lockPath,
      async setPublisherPid(childPid) {
        if (
          childPid !== null &&
          (!Number.isSafeInteger(childPid) || childPid <= 0)
        ) {
          throw new CloudflareTargetError(
            'The Wrangler publisher PID is invalid.',
          );
        }
        const current = await readLifecycleLockOwner(lockPath);
        if (!current || current.token !== token) {
          throw new CloudflareTargetError(
            'Refusing to update a lifecycle lock owned by another process.',
          );
        }
        const ownerPath = path.join(
          lockPath,
          RELEASE_LIFECYCLE_OWNER_FILE,
        );
        const temporary = `${ownerPath}.${token}.tmp`;
        await writeFile(
          temporary,
          `${JSON.stringify(
            { ...current, childPid },
            null,
            2,
          )}\n`,
          { encoding: 'utf8', flag: 'wx', mode: 0o600 },
        );
        await rename(temporary, ownerPath);
        await chmod(ownerPath, 0o600);
        owner.childPid = childPid;
      },
      async release() {
        if (released) return;
        const current = await readLifecycleLockOwner(lockPath);
        if (!current || current.token !== token) {
          throw new CloudflareTargetError(
            'Refusing to release a lifecycle lock owned by another process.',
          );
        }
        const releasedPath = `${lockPath}.released-${token}`;
        await rename(lockPath, releasedPath);
        await rm(releasedPath, { force: true, recursive: true });
        released = true;
      },
    };
  }
  throw new CloudflareTargetError(
    'The release lifecycle lock changed repeatedly; try again.',
  );
}

export async function withReleaseLifecycleLock(
  action,
  options = {},
) {
  const lease = await acquireReleaseLifecycleLock(options);
  try {
    return await action(lease);
  } finally {
    await lease.release();
  }
}

async function withPendingDeploymentLock(action) {
  return withReleaseLifecycleLock(
    () => action(),
    { lockPath: PENDING_DEPLOYMENT_LOCK_PATH },
  );
}

function samePendingAttempt(left, right) {
  return (
    left?.schemaVersion === right?.schemaVersion &&
    left?.mode === right?.mode &&
    left?.attemptId === right?.attemptId &&
    left?.createdAt === right?.createdAt &&
    left?.accountId === right?.accountId &&
    left?.workerName === right?.workerName &&
    left?.previousDeploymentId === right?.previousDeploymentId &&
    left?.previousVersionId === right?.previousVersionId &&
    left?.releaseMessage === right?.releaseMessage &&
    left?.sourceFingerprint === right?.sourceFingerprint &&
    left?.artifactFingerprint === right?.artifactFingerprint &&
    left?.gitCommit === right?.gitCommit &&
    left?.reconciliationNotBefore ===
      right?.reconciliationNotBefore &&
    left?.openRouterCredentialFingerprint ===
      right?.openRouterCredentialFingerprint
  );
}

function wranglerExecutable() {
  return path.join(
    process.cwd(),
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler',
  );
}

export function wranglerReadOnlyEnvironment(source = process.env) {
  const environment = { ...source, CI: '1', NO_COLOR: '1' };
  for (const name of WRANGLER_READ_ONLY_SECRET_KEYS) {
    delete environment[name];
  }
  return environment;
}

export function assertOfficialCloudflareEnvironment(
  environment = process.env,
) {
  for (const name of [
    'CF_API_BASE_URL',
    'CF_ACCOUNT_ID',
    'CF_API_KEY',
    'CF_API_TOKEN',
    'CF_EMAIL',
    'CLOUDFLARE_API_BASE_URL',
    'CLOUDFLARE_COMPLIANCE_REGION',
    'CLOUDFLARE_ENV',
    'WRANGLER_API_ENVIRONMENT',
    'WRANGLER_CI_OVERRIDE_NAME',
  ]) {
    if (environment[name]?.trim()) {
      throw new CloudflareTargetError(
        `${name} must be unset for a guarded Calricula release.`,
      );
    }
  }
  return true;
}

export async function runWranglerReadOnly(args) {
  assertOfficialCloudflareEnvironment();
  const child = spawn(wranglerExecutable(), args, {
    cwd: process.cwd(),
    env: wranglerReadOnlyEnvironment(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  let overflow = false;
  const collect = (target, chunk) => {
    const next = `${target}${String(chunk)}`;
    if (Buffer.byteLength(next, 'utf8') > MAX_OUTPUT_BYTES) {
      overflow = true;
      child.kill('SIGTERM');
      return target;
    }
    return next;
  };
  child.stdout?.on('data', (chunk) => {
    stdout = collect(stdout, chunk);
  });
  child.stderr?.on('data', (chunk) => {
    stderr = collect(stderr, chunk);
  });
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
  if (overflow) {
    throw new CloudflareTargetError(
      'Wrangler read-only output exceeded its safety limit.',
    );
  }
  return { exitCode, stderr, stdout };
}

function parseSuccessfulJson(result, label) {
  if (result.exitCode !== 0) {
    throw new CloudflareTargetError(
      `${label} failed; refusing to publish.`,
    );
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new CloudflareTargetError(
      `${label} returned invalid JSON; refusing to publish.`,
    );
  }
}

export function parseWranglerIdentity(
  result,
  expectedAccountId,
) {
  if (!ACCOUNT_ID_PATTERN.test(expectedAccountId ?? '')) {
    throw new CloudflareTargetError(
      'Set CLOUDFLARE_ACCOUNT_ID to the exact 32-character account ID.',
    );
  }
  const payload = parseSuccessfulJson(result, 'Wrangler identity check');
  if (
    payload?.loggedIn !== true ||
    !Array.isArray(payload.accounts) ||
    !payload.accounts.some(
      (account) => account?.id === expectedAccountId,
    )
  ) {
    throw new CloudflareTargetError(
      'Wrangler is not authenticated to the explicitly selected Cloudflare account.',
    );
  }
  return { accountId: expectedAccountId };
}

export function confirmBootstrapNonexistence(result) {
  if (
    result.exitCode !== 0 &&
    WORKER_NOT_FOUND_PATTERN.test(result.stderr)
  ) {
    return { exists: false, errorCode: 10007 };
  }
  if (result.exitCode === 0) {
    throw new CloudflareTargetError(
      'Refusing hostname bootstrap because calricula-demo already exists.',
    );
  }
  throw new CloudflareTargetError(
    'Worker nonexistence was not confirmed by Cloudflare error 10007.',
  );
}

export function parseDeploymentStatus(result) {
  const deployment = parseSuccessfulJson(
    result,
    'Cloudflare deployment status',
  );
  if (
    !isRecord(deployment) ||
    !UUID_PATTERN.test(deployment.id ?? '') ||
    !Array.isArray(deployment.versions) ||
    deployment.versions.length !== 1 ||
    !UUID_PATTERN.test(deployment.versions[0]?.version_id ?? '') ||
    deployment.versions[0]?.percentage !== 100 ||
    Number.isNaN(Date.parse(deployment.created_on ?? ''))
  ) {
    throw new CloudflareTargetError(
      'Cloudflare current deployment is not one unambiguous 100% version.',
    );
  }
  return {
    createdOn: deployment.created_on,
    deploymentId: deployment.id,
    versionId: deployment.versions[0].version_id,
  };
}

export function parseDeployOutput(text, workerName) {
  const entries = String(text)
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return undefined;
      }
    })
    .filter(Boolean);
  const deploy = entries.find(
    (entry) =>
      entry.type === 'deploy' &&
      entry.version === 1 &&
      entry.worker_name === workerName,
  );
  if (
    !deploy ||
    !UUID_PATTERN.test(deploy.version_id ?? '') ||
    !Array.isArray(deploy.targets)
  ) {
    throw new CloudflareTargetError(
      'Wrangler did not record an unambiguous deploy result.',
    );
  }
  const origins = [
    ...new Set(
      deploy.targets
        .flatMap((target) =>
          typeof target === 'string'
            ? [target]
            : Object.values(target ?? {}).filter(
                (value) => typeof value === 'string',
              ),
        )
        .map((value) => {
          try {
            const url = new URL(value);
            if (
              url.protocol === 'https:' &&
              url.hostname.startsWith(`${workerName}.`) &&
              url.hostname.endsWith('.workers.dev')
            ) {
              return url.origin;
            }
          } catch {
            return undefined;
          }
          return undefined;
        })
        .filter(Boolean),
    ),
  ];
  return {
    origin: origins.length === 1 ? origins[0] : '',
    versionId: deploy.version_id,
  };
}

export function parseVersionProof(result, versionId, releaseMessage) {
  const versions = parseSuccessfulJson(
    result,
    'Cloudflare version proof',
  );
  if (!Array.isArray(versions)) {
    throw new CloudflareTargetError(
      'Cloudflare versions response has an invalid shape.',
    );
  }
  const version = versions.find((entry) => entry?.id === versionId);
  if (
    !version ||
    version.metadata?.source !== 'wrangler' ||
    version.annotations?.['workers/message'] !== releaseMessage
  ) {
    throw new CloudflareTargetError(
      'The current Cloudflare version does not belong to this release invocation.',
    );
  }
  return { versionId };
}

export function parseReleaseVersionAbsence(result, releaseMessage) {
  const versions = parseSuccessfulJson(
    result,
    'Cloudflare version absence proof',
  );
  if (
    !Array.isArray(versions) ||
    typeof releaseMessage !== 'string' ||
    !releaseMessage
  ) {
    throw new CloudflareTargetError(
      'Cloudflare versions response has an invalid shape.',
    );
  }
  if (
    versions.some(
      (entry) =>
        entry?.annotations?.['workers/message'] === releaseMessage,
    )
  ) {
    throw new CloudflareTargetError(
      'Cloudflare already contains a version from this release attempt.',
    );
  }
  return { absent: true, releaseMessage };
}

export async function confirmReleaseVersionAbsent({
  workerName,
  releaseMessage: expectedMessage,
  runReadOnly = runWranglerReadOnly,
}) {
  return parseReleaseVersionAbsence(
    await runReadOnly([
      'versions',
      'list',
      '--name',
      workerName,
      '--json',
    ]),
    expectedMessage,
  );
}

function workerNameFromConfig(wranglerConfig) {
  const config = parseWranglerJsonc(wranglerConfig);
  if (config.name !== 'calricula-demo') {
    throw new CloudflareTargetError(
      'The release target must remain exactly calricula-demo.',
    );
  }
  return config.name;
}

function accountIdFromConfiguration(wranglerConfig, environment) {
  const config = parseWranglerJsonc(wranglerConfig);
  const environmentValue =
    environment.CLOUDFLARE_ACCOUNT_ID?.trim() ?? '';
  if (Object.hasOwn(config, 'account_id')) {
    throw new CloudflareTargetError(
      'wrangler.jsonc must not set account_id; use the explicit CLOUDFLARE_ACCOUNT_ID environment selector.',
    );
  }
  return environmentValue;
}

export function resolveCloudflareTargetSelection({
  wranglerConfig,
  environment = process.env,
}) {
  assertOfficialCloudflareEnvironment(environment);
  return {
    accountId: accountIdFromConfiguration(
      wranglerConfig,
      environment,
    ),
    workerName: workerNameFromConfig(wranglerConfig),
  };
}

async function readOptionalJson(filePath) {
  let fileStat;
  let text;
  try {
    [fileStat, text] = await Promise.all([
      lstat(filePath),
      readFile(filePath, 'utf8'),
    ]);
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined;
    throw new CloudflareTargetError(
      `${path.basename(filePath)} could not be read safely.`,
    );
  }
  if (
    !fileStat.isFile() ||
    fileStat.isSymbolicLink() ||
    (fileStat.mode & 0o077) !== 0
  ) {
    throw new CloudflareTargetError(
      `${path.basename(filePath)} must be a private regular file.`,
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new CloudflareTargetError(
      `${path.basename(filePath)} contains invalid JSON.`,
    );
  }
}

export async function readTargetRecords() {
  const [ownership, current, pending] = await Promise.all([
    readOptionalJson(OWNERSHIP_RECORD_PATH),
    readOptionalJson(CURRENT_DEPLOYMENT_PATH),
    readOptionalJson(PENDING_DEPLOYMENT_PATH),
  ]);
  return { current, ownership, pending };
}

export function validateOwnershipRecord({
  ownership,
  current,
  identity,
  workerName,
  origin,
  deployment,
}) {
  if (
    !isRecord(ownership) ||
    ownership.schemaVersion !== 1 ||
    ownership.accountId !== identity.accountId ||
    ownership.workerName !== workerName ||
    ownership.origin !== origin ||
    !UUID_PATTERN.test(ownership.attemptId ?? '') ||
    !UUID_PATTERN.test(ownership.bootstrapDeploymentId ?? '') ||
    !UUID_PATTERN.test(ownership.bootstrapVersionId ?? '') ||
    !isRecord(current) ||
    current.schemaVersion !== 1 ||
    current.accountId !== identity.accountId ||
    current.workerName !== workerName ||
    current.origin !== origin ||
    !UUID_PATTERN.test(current.attemptId ?? '') ||
    current.deploymentId !== deployment.deploymentId ||
    current.versionId !== deployment.versionId ||
    !UUID_PATTERN.test(current.deploymentId ?? '') ||
    !UUID_PATTERN.test(current.versionId ?? '')
  ) {
    throw new CloudflareTargetError(
      'Cloudflare target ownership or current-version evidence does not match; refusing to overwrite it.',
    );
  }
  return { current, ownership };
}

export async function inspectCloudflareTarget({
  wranglerConfig,
  environment = process.env,
  bootstrap,
  verifyOnly,
  origin,
}) {
  const { identity, workerName } = await inspectCloudflareIdentity({
    wranglerConfig,
    environment,
  });
  const statusResult = await runWranglerReadOnly([
    'deployments',
    'status',
    '--name',
    workerName,
    '--json',
  ]);
  if (bootstrap && !verifyOnly) {
    const [ownership, current] = await Promise.all([
      readOptionalJson(OWNERSHIP_RECORD_PATH),
      readOptionalJson(CURRENT_DEPLOYMENT_PATH),
    ]);
    if (ownership || current) {
      throw new CloudflareTargetError(
        'Local ownership evidence already exists; refusing a second bootstrap.',
      );
    }
    confirmBootstrapNonexistence(statusResult);
    return { identity, workerName };
  }

  const deployment = parseDeploymentStatus(statusResult);
  const [ownership, current] = await Promise.all([
    readOptionalJson(OWNERSHIP_RECORD_PATH),
    readOptionalJson(CURRENT_DEPLOYMENT_PATH),
  ]);
  validateOwnershipRecord({
    ownership,
    current,
    identity,
    workerName,
    origin,
    deployment,
  });
  return {
    current,
    deployment,
    identity,
    ownership,
    workerName,
  };
}

export async function inspectCloudflareIdentity({
  wranglerConfig,
  environment = process.env,
}) {
  const {
    accountId: expectedAccountId,
    workerName,
  } = resolveCloudflareTargetSelection({
    wranglerConfig,
    environment,
  });
  const identity = parseWranglerIdentity(
    await runWranglerReadOnly(['whoami', '--json']),
    expectedAccountId,
  );
  return { identity, workerName };
}

export async function readPendingDeployment() {
  return readOptionalJson(PENDING_DEPLOYMENT_PATH);
}

export async function writePendingDeployment(record) {
  await mkdir(path.dirname(PENDING_DEPLOYMENT_PATH), {
    recursive: true,
  });
  try {
    await writeFile(
      PENDING_DEPLOYMENT_PATH,
      `${JSON.stringify(record, null, 2)}\n`,
      { encoding: 'utf8', flag: 'wx', mode: 0o600 },
    );
  } catch {
    throw new CloudflareTargetError(
      'A pending deployment already exists; reconcile it before publishing again.',
    );
  }
}

export async function updatePendingDeployment(record) {
  return withPendingDeploymentLock(async () => {
    const existing = await readOptionalJson(PENDING_DEPLOYMENT_PATH);
    if (
      !samePendingAttempt(existing, record) ||
      (existing.origin &&
        existing.origin !== record.origin) ||
      (existing.versionId !== null &&
        existing.versionId !== record.versionId)
    ) {
      throw new CloudflareTargetError(
        'Pending deployment changed unexpectedly before reconciliation.',
      );
    }
    const temporary = `${PENDING_DEPLOYMENT_PATH}.tmp`;
    await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    await rename(temporary, PENDING_DEPLOYMENT_PATH);
    await chmod(PENDING_DEPLOYMENT_PATH, 0o600);
  });
}

export async function archivePendingDeployment(record) {
  const directory = path.resolve(
    process.cwd(),
    '.release-artifacts',
    'wrangler',
  );
  await mkdir(directory, { recursive: true });
  const destination = path.join(
    directory,
    `reconciled-${record.versionId}.json`,
  );
  await withPendingDeploymentLock(async () => {
    const existing = await readOptionalJson(PENDING_DEPLOYMENT_PATH);
    if (
      !samePendingAttempt(existing, record) ||
      existing.origin !== record.origin ||
      existing.versionId !== record.versionId
    ) {
      throw new CloudflareTargetError(
        'Pending deployment changed before it could be archived.',
      );
    }
    try {
      await rename(PENDING_DEPLOYMENT_PATH, destination);
      await chmod(destination, 0o400);
    } catch {
      throw new CloudflareTargetError(
        'The reconciled pending deployment could not be archived.',
      );
    }
  });
  return destination;
}

export async function archiveUnpublishedAttempt(record) {
  const directory = path.resolve(
    process.cwd(),
    '.release-artifacts',
    'wrangler',
  );
  await mkdir(directory, { recursive: true });
  const destination = path.join(
    directory,
    `not-published-${randomUUID()}.json`,
  );
  await withPendingDeploymentLock(async () => {
    const existing = await readOptionalJson(PENDING_DEPLOYMENT_PATH);
    if (
      !samePendingAttempt(existing, record) ||
      existing.origin !== record.origin ||
      existing.versionId !== null ||
      record.versionId !== null
    ) {
      throw new CloudflareTargetError(
        'Pending deployment changed before no-change cancellation could be archived.',
      );
    }
    const cancelled = {
      ...existing,
      outcome: 'confirmed-not-published',
      resolvedAt: new Date().toISOString(),
    };
    const temporary = `${PENDING_DEPLOYMENT_PATH}.tmp`;
    await writeFile(
      temporary,
      `${JSON.stringify(cancelled, null, 2)}\n`,
      { encoding: 'utf8', mode: 0o600 },
    );
    await rename(temporary, PENDING_DEPLOYMENT_PATH);
    try {
      await rename(PENDING_DEPLOYMENT_PATH, destination);
      await chmod(destination, 0o400);
    } catch {
      throw new CloudflareTargetError(
        'The confirmed unpublished attempt could not be archived.',
      );
    }
  });
  return destination;
}

export async function reconcilePublishedVersion({
  workerName,
  versionId,
  releaseMessage: expectedMessage,
  previous,
  attempts = 20,
  intervalMs = 1_500,
  runReadOnly = runWranglerReadOnly,
  wait = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const deployment = parseDeploymentStatus(
        await runReadOnly([
          'deployments',
          'status',
          '--name',
          workerName,
          '--json',
        ]),
      );
      if (
        (versionId && deployment.versionId !== versionId) ||
        (previous &&
          (previous.deploymentId === deployment.deploymentId ||
            previous.versionId === deployment.versionId))
      ) {
        throw new CloudflareTargetError(
          'Cloudflare has not exposed the new deployment version yet.',
        );
      }
      parseVersionProof(
        await runReadOnly([
          'versions',
          'list',
          '--name',
          workerName,
          '--json',
        ]),
        versionId || deployment.versionId,
        expectedMessage,
      );
      return deployment;
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) {
        await wait(intervalMs);
      }
    }
  }
  throw new CloudflareTargetError(
    `Published version could not be reconciled after bounded polling: ${
      lastError instanceof Error ? lastError.message : 'unknown error'
    }`,
  );
}

export function releaseMessage({
  mode,
  attemptId,
  sourceFingerprint,
  artifactFingerprint,
  gitCommit,
}) {
  if (!UUID_PATTERN.test(attemptId ?? '')) {
    throw new CloudflareTargetError(
      'A unique release attempt ID is required.',
    );
  }
  const digest = createHash('sha256')
    .update(
      [
        mode,
        attemptId,
        sourceFingerprint,
        artifactFingerprint,
        gitCommit,
      ].join('\0'),
    )
    .digest('hex')
    .slice(0, 24);
  return `calricula-${mode}-${digest}`;
}

export async function createWranglerOutputPath() {
  const directory = path.resolve(
    process.cwd(),
    '.release-artifacts',
    'wrangler',
  );
  await mkdir(directory, { recursive: true });
  return path.join(directory, `deploy-${randomUUID()}.jsonl`);
}

export async function inspectPublishedDeployment({
  workerName,
  outputPath,
  releaseMessage: expectedMessage,
  previous,
}) {
  const deployOutput = parseDeployOutput(
    await readFile(outputPath, 'utf8'),
    workerName,
  );
  const deployment = await reconcilePublishedVersion({
    workerName,
    versionId: deployOutput.versionId,
    releaseMessage: expectedMessage,
    previous,
  });
  return { deployOutput, deployment };
}

export async function writeOwnershipRecord(record) {
  await mkdir(path.dirname(OWNERSHIP_RECORD_PATH), {
    recursive: true,
  });
  try {
    await writeFile(
      OWNERSHIP_RECORD_PATH,
      `${JSON.stringify(record, null, 2)}\n`,
      { encoding: 'utf8', flag: 'wx', mode: 0o600 },
    );
  } catch {
    throw new CloudflareTargetError(
      'Immutable Worker ownership evidence already exists or could not be created.',
    );
  }
  await chmod(OWNERSHIP_RECORD_PATH, 0o400);
}

export async function writeCurrentDeployment(record) {
  await mkdir(path.dirname(CURRENT_DEPLOYMENT_PATH), {
    recursive: true,
  });
  const temporary = `${CURRENT_DEPLOYMENT_PATH}.tmp`;
  await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await rename(temporary, CURRENT_DEPLOYMENT_PATH);
  await chmod(CURRENT_DEPLOYMENT_PATH, 0o600);
}

export async function appendDeploymentHistory(record) {
  await mkdir(path.dirname(DEPLOYMENT_HISTORY_PATH), {
    recursive: true,
  });
  let existing = '';
  try {
    existing = await readFile(DEPLOYMENT_HISTORY_PATH, 'utf8');
  } catch {
    // The first deployment creates the append-only history.
  }
  const duplicate = existing
    .split(/\r?\n/)
    .filter(Boolean)
    .some((line) => {
      try {
        return JSON.parse(line).versionId === record.versionId;
      } catch {
        throw new CloudflareTargetError(
          'Deployment history is malformed; refusing to append.',
        );
      }
    });
  if (!duplicate) {
    await appendFile(
      DEPLOYMENT_HISTORY_PATH,
      `${JSON.stringify(record)}\n`,
      { encoding: 'utf8', mode: 0o600 },
    );
  }
  await chmod(DEPLOYMENT_HISTORY_PATH, 0o600);
}
