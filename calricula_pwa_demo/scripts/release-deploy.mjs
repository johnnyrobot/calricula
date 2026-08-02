import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

import {
  appendDeploymentHistory,
  archivePendingDeployment,
  archiveUnpublishedAttempt,
  assertReleaseLifecycleLease,
  assertOfficialCloudflareEnvironment,
  confirmReleaseVersionAbsent,
  confirmReleaseVersion,
  createWranglerOutputPath,
  inspectCloudflareIdentity,
  inspectCloudflareTarget,
  parseVersionDeployOutput,
  parseVersionUploadOutput,
  readPendingDeployment,
  readTargetRecords,
  reconcilePublishedVersion,
  releaseMessage,
  resolveReleaseVersionByMessage,
  updatePendingDeployment,
  writePendingDeployment,
  writeCurrentDeployment,
  writeOwnershipRecord,
  withReleaseLifecycleLock,
} from './cloudflare-release-target.mjs';
import {
  childEnvironment,
  wranglerChildEnvironment,
} from './child-environment.mjs';
import {
  BOOTSTRAP_RELEASE_GATE_STEPS,
  LOCAL_GATE_EVIDENCE_PATH,
  RELEASE_GATE_STEPS,
  runNpmScript,
} from './release-gate.mjs';
import {
  computeReleaseFingerprint,
  currentToolVersions,
  parseWranglerReleaseConfig,
  verifyRecordedEvidence,
} from './release-evidence.mjs';
import {
  computeArtifactFingerprint,
  inspectGitReleaseState,
  isRealTurnstileSiteKey,
  requireCleanGitReleaseState,
  resolveReleaseSecretsFile,
  resolveTurnstileSiteKey,
  sealReleaseSecretsFile,
  siteKeyDigest,
  verifySealedPublicationPackage,
} from './release-state.mjs';
import { normalizeProductionOrigin } from './verify-production.mjs';
import { resolveAiCanaryCredential } from './ai-canary-credential.mjs';
import { parseWranglerJsonc } from './wrangler-config.mjs';
import { assertTrackedReleaseInputs } from './release-inputs.mjs';

const LOCAL_GATE_MAX_AGE_MS = 2 * 60 * 60 * 1_000;
export const PUBLISH_RECONCILIATION_WINDOW_MS = 45_000;
const OPENROUTER_CREDENTIAL_FINGERPRINT_PATTERN =
  /^sha256:[0-9a-f]{64}$/;
const RELEASE_ATTEMPT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMPLETE_EVIDENCE_PATH = path.resolve(
  process.cwd(),
  '.release-artifacts',
  'release-complete.json',
);
const STAGED_EVIDENCE_PATH = path.resolve(
  process.cwd(),
  '.release-artifacts',
  'release-staged.json',
);
export const POSTDEPLOY_STEPS = [
  'ai:canary:record',
  'verify:production',
  'lighthouse:production',
  'test:e2e:remote',
  'release:evidence:complete',
];
export const STAGE_POSTDEPLOY_STEPS = [
  'verify:production',
  'lighthouse:production',
  'test:e2e:remote',
];
export const BOOTSTRAP_POSTDEPLOY_STEPS = [
  'verify:production',
  'lighthouse:production',
  'test:e2e:remote',
];

export class ReleaseDeploymentError extends Error {}

function variable(text, name) {
  const parsed = parseWranglerJsonc(text);
  const value = parsed.vars?.[name];
  if (typeof value !== 'string') {
    throw new ReleaseDeploymentError(
      `wrangler.jsonc is missing ${name}.`,
    );
  }
  return value.trim();
}

export function validateDeploymentEnvironment({
  environment,
  wranglerConfig,
  siteKey,
  bootstrap = false,
  requireBaseOrigin = !bootstrap,
  requireCanaryCredential = !bootstrap,
}) {
  const aiEnabled = variable(wranglerConfig, 'AI_ENABLED');
  let baseOrigin = '';
  const suppliedBaseOrigin =
    environment.CALRICULA_RELEASE_BASE_URL?.trim() ?? '';
  if (suppliedBaseOrigin) {
    baseOrigin = normalizeProductionOrigin(suppliedBaseOrigin);
    if (!baseOrigin.startsWith('https://')) {
      throw new ReleaseDeploymentError(
        'The deployed release URL must use HTTPS.',
      );
    }
  } else if (requireBaseOrigin) {
    throw new ReleaseDeploymentError(
      'Set CALRICULA_RELEASE_BASE_URL to the exact HTTPS Worker origin.',
    );
  }

  if (bootstrap) {
    if (aiEnabled !== 'false') {
      throw new ReleaseDeploymentError(
        'A hostname bootstrap requires AI_ENABLED=false.',
      );
    }
    return { aiEnabled: false, baseOrigin };
  }

  const config = parseWranglerReleaseConfig(wranglerConfig);
  if (baseOrigin !== config.appOrigin) {
    throw new ReleaseDeploymentError(
      'CALRICULA_RELEASE_BASE_URL must exactly match APP_ORIGIN.',
    );
  }
  if (!isRealTurnstileSiteKey(siteKey)) {
    throw new ReleaseDeploymentError(
      'An AI-enabled release requires a real non-placeholder NEXT_PUBLIC_TURNSTILE_SITE_KEY.',
    );
  }
  let canaryCredentialKind = null;
  if (requireCanaryCredential) {
    try {
      canaryCredentialKind =
        resolveAiCanaryCredential(environment).kind;
    } catch (error) {
      throw new ReleaseDeploymentError(
        error instanceof Error
          ? error.message
          : 'A valid AI canary credential is required.',
      );
    }
  }
  return {
    aiEnabled: true,
    baseOrigin,
    canaryCredentialKind,
    models: config.configuredModels,
  };
}

export function validateLocalGateEvidence({
  evidence,
  mode,
  sourceFingerprint,
  toolVersions,
  artifacts,
  publication,
  git,
  turnstileSiteKeyDigest,
  now = Date.now(),
}) {
  const expectedSteps =
    mode === 'bootstrap'
      ? BOOTSTRAP_RELEASE_GATE_STEPS
      : RELEASE_GATE_STEPS;
  const completedAt = Date.parse(evidence?.completedAt ?? '');
  if (
    !evidence ||
    evidence.schemaVersion !== 3 ||
    evidence.mode !== mode ||
    evidence.sourceFingerprint !== sourceFingerprint ||
    JSON.stringify(evidence.toolVersions) !==
      JSON.stringify(toolVersions) ||
    JSON.stringify(evidence.artifacts) !== JSON.stringify(artifacts) ||
    JSON.stringify(evidence.publication) !==
      JSON.stringify(publication) ||
    evidence.git?.commit !== git.commit ||
    evidence.git?.tree !== git.tree ||
    evidence.turnstileSiteKeyDigest !== turnstileSiteKeyDigest ||
    JSON.stringify(evidence.steps) !== JSON.stringify(expectedSteps) ||
    Number.isNaN(completedAt) ||
    completedAt > now + 5 * 60 * 1_000 ||
    now - completedAt > LOCAL_GATE_MAX_AGE_MS
  ) {
    throw new ReleaseDeploymentError(
      `A fresh matching ${mode} local release gate record is required.`,
    );
  }
  return evidence;
}

export function validateCurrentReleaseBinding({
  current,
  mode,
  localGate,
}) {
  const expectedReleaseMessage = releaseMessage({
    mode,
    attemptId: current?.attemptId,
    sourceFingerprint: localGate.sourceFingerprint,
    artifactFingerprint: localGate.artifacts.fingerprint,
    publicationFingerprint: localGate.publication.fingerprint,
    gitCommit: localGate.git.commit,
  });
  if (current?.releaseMessage !== expectedReleaseMessage) {
    throw new ReleaseDeploymentError(
      'The current Cloudflare deployment is not bound to this sealed local release.',
    );
  }
  if (
    current.sourceFingerprint !== localGate.sourceFingerprint ||
    current.artifactFingerprint !== localGate.artifacts.fingerprint ||
    current.publicationFingerprint !== localGate.publication.fingerprint ||
    current.gitCommit !== localGate.git.commit
  ) {
    throw new ReleaseDeploymentError(
      'The current Cloudflare deployment fingerprints do not match this sealed local release.',
    );
  }
  return expectedReleaseMessage;
}

export function validateStageVerificationMarkers({
  hasComplete,
  hasPending,
  hasStaged,
}) {
  if (hasComplete) {
    throw new ReleaseDeploymentError(
      'The current release is already marked complete; refusing to create contradictory staged evidence.',
    );
  }
  if (!hasPending && !hasStaged) {
    throw new ReleaseDeploymentError(
      'Stage verification requires an existing pending attempt or staged release marker.',
    );
  }
  return true;
}

async function releaseResultExists(destination) {
  try {
    await readFile(destination);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw new ReleaseDeploymentError(
      `${path.basename(destination)} could not be checked safely.`,
    );
  }
}

async function validateRecordedLocalGate(mode, siteKey) {
  const [
    evidence,
    sourceFingerprint,
    toolVersions,
    artifacts,
    git,
  ] = await Promise.all([
    readFile(LOCAL_GATE_EVIDENCE_PATH, 'utf8')
      .then(JSON.parse)
      .catch(() => undefined),
    computeReleaseFingerprint(),
    currentToolVersions(),
    computeArtifactFingerprint(),
    inspectGitReleaseState().then(requireCleanGitReleaseState),
    assertTrackedReleaseInputs(),
  ]);
  const sealedPublication = await verifySealedPublicationPackage({
    ...evidence?.publication,
    directory: path.join(
      process.cwd(),
      '.release-artifacts',
      'sealed',
      String(evidence?.publication?.fingerprint ?? '').replace(
        /^sha256:/,
        '',
      ),
    ),
  });
  return {
    ...validateLocalGateEvidence({
    evidence,
    mode,
    sourceFingerprint,
    toolVersions,
    artifacts,
    publication: {
      fingerprint: sealedPublication.fingerprint,
      files: sealedPublication.files,
      totalBytes: sealedPublication.totalBytes,
    },
    git,
    turnstileSiteKeyDigest:
      mode === 'full' ? siteKeyDigest(siteKey) : null,
    }),
    sealedPublication,
  };
}

function wranglerExecutable() {
  return path.join(
    process.cwd(),
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler',
  );
}

/**
 * Everything the two publishing steps do to the world outside this module:
 * the two preconditions they refuse to run without, the child environment they
 * hand Wrangler, the gated child process itself, and reading back what it
 * wrote. Substituting this is the only way to exercise the publish sequence
 * without a Cloudflare account, which is why it is one value rather than six
 * threaded parameters.
 */
export const WRANGLER_PUBLISHER = {
  assertReleaseInputsTracked: assertTrackedReleaseInputs,
  assertOfficialEnvironment: assertOfficialCloudflareEnvironment,
  childEnvironment: wranglerChildEnvironment,
  executable: wranglerExecutable,
  run: runPausedPublisher,
  readOutput: (outputPath) => readFile(outputPath, 'utf8'),
};

async function prepareWranglerInvocation(publisher, outputPath) {
  await publisher.assertReleaseInputsTracked();
  publisher.assertOfficialEnvironment(process.env);
  const environment = publisher.childEnvironment(process.env);
  environment.WRANGLER_OUTPUT_FILE_PATH = outputPath;
  return environment;
}

export async function publishWorker(
  {
    attemptId,
    lifecycleLease,
    message,
    onUploaded,
    outputPath,
    sealedPublication,
    secretsFile = '',
  },
  publisher = WRANGLER_PUBLISHER,
) {
  const environment = await prepareWranglerInvocation(publisher, outputPath);
  const uploadExitCode = await publisher.run({
    args: wranglerVersionUploadArguments({
      attemptId,
      message,
      sealedPublication,
      secretsFile,
    }),
    environment,
    executable: publisher.executable(),
    lifecycleLease,
  });
  if (uploadExitCode !== 0) {
    throw new ReleaseDeploymentError(
      `Wrangler versions upload exited with code ${uploadExitCode}.`,
    );
  }
  const uploaded = parseVersionUploadOutput(
    await publisher.readOutput(outputPath),
    'calricula-demo',
  );
  await onUploaded(uploaded);
  const deployExitCode = await publisher.run({
    args: wranglerVersionDeployArguments({
      message,
      sealedPublication,
      versionId: uploaded.versionId,
    }),
    environment,
    executable: publisher.executable(),
    lifecycleLease,
  });
  if (deployExitCode !== 0) {
    throw new ReleaseDeploymentError(
      `Wrangler versions deploy exited with code ${deployExitCode}.`,
    );
  }
  const deployed = parseVersionDeployOutput(
    await publisher.readOutput(outputPath),
    'calricula-demo',
    uploaded.versionId,
  );
  return { ...uploaded, ...deployed };
}

export async function promoteUploadedVersion(
  {
    lifecycleLease,
    message,
    outputPath,
    sealedPublication,
    versionId,
  },
  publisher = WRANGLER_PUBLISHER,
) {
  const environment = await prepareWranglerInvocation(publisher, outputPath);
  const exitCode = await publisher.run({
    args: wranglerVersionDeployArguments({
      message,
      sealedPublication,
      versionId,
    }),
    environment,
    executable: publisher.executable(),
    lifecycleLease,
  });
  if (exitCode !== 0) {
    throw new ReleaseDeploymentError(
      `Wrangler versions deploy exited with code ${exitCode}.`,
    );
  }
  return parseVersionDeployOutput(
    await publisher.readOutput(outputPath),
    'calricula-demo',
    versionId,
  );
}

export async function runPausedPublisher({
  args,
  environment,
  executable,
  lifecycleLease,
  spawnProcess = spawn,
}) {
  if (process.platform === 'win32') {
    throw new ReleaseDeploymentError(
      'Guarded Wrangler publication requires a POSIX release host.',
    );
  }
  const child = spawnProcess(
    '/bin/sh',
    [
      '-c',
      'if IFS= read -r gate && [ "$gate" = start ]; then exec "$@"; else exit 125; fi',
      'calricula-wrangler-gate',
      executable,
      ...args,
    ],
    {
      cwd: process.cwd(),
      env: environment,
      stdio: ['pipe', 'inherit', 'inherit'],
    },
  );
  const exitResult = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
  if (
    !Number.isSafeInteger(child.pid) ||
    child.pid <= 0 ||
    !child.stdin
  ) {
    child.stdin?.destroy();
    child.kill('SIGTERM');
    await exitResult.catch(() => undefined);
    throw new ReleaseDeploymentError(
      'Wrangler publisher did not expose a valid process ID.',
    );
  }
  try {
    await lifecycleLease.setPublisherPid(child.pid);
  } catch (error) {
    child.stdin.destroy();
    await exitResult.catch(() => undefined);
    throw error;
  }
  let exitCode = 1;
  try {
    try {
      await new Promise((resolve, reject) => {
        child.stdin.end('start\n', (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    } catch (error) {
      child.stdin.destroy();
      child.kill('SIGTERM');
      await exitResult.catch(() => undefined);
      throw error;
    }
    exitCode = await exitResult;
  } finally {
    await lifecycleLease.setPublisherPid(null);
  }
  return exitCode;
}

export function wranglerVersionUploadArguments({
  attemptId,
  message,
  sealedPublication,
  secretsFile = '',
}) {
  if (
    !RELEASE_ATTEMPT_ID_PATTERN.test(attemptId ?? '') ||
    !sealedPublication?.configPath
  ) {
    throw new ReleaseDeploymentError(
      'A sealed publication and release attempt ID are required.',
    );
  }
  const args = [
    'versions',
    'upload',
    '--config',
    sealedPublication.configPath,
    '--name',
    'calricula-demo',
    '--no-bundle',
    '--strict',
    '--tag',
    `release-${attemptId}`,
    '--message',
    message,
  ];
  if (secretsFile) {
    args.push('--secrets-file', secretsFile);
  }
  return args;
}

export function wranglerVersionDeployArguments({
  message,
  sealedPublication,
  versionId,
}) {
  if (
    !RELEASE_ATTEMPT_ID_PATTERN.test(versionId ?? '') ||
    !sealedPublication?.configPath
  ) {
    throw new ReleaseDeploymentError(
      'An uploaded version ID and sealed publication are required.',
    );
  }
  return [
    'versions',
    'deploy',
    `${versionId}@100`,
    '--config',
    sealedPublication.configPath,
    '--name',
    'calricula-demo',
    '--message',
    message,
    '--yes',
  ];
}

export function postdeployEnvironment(
  source,
  step,
  baseOrigin,
  publishedAt,
  aiEnabled,
) {
  const environment = childEnvironment(source);
  Object.assign(environment, {
    CALRICULA_CANARY_BASE_URL: baseOrigin,
    CALRICULA_EXPECT_AI_ENABLED: aiEnabled ? 'true' : 'false',
    CALRICULA_RELEASE_BASE_URL: baseOrigin,
    CALRICULA_RELEASE_PUBLISHED_AT: publishedAt,
    PLAYWRIGHT_BASE_URL: baseOrigin,
  });
  if (step === 'ai:canary:record') {
    const credential = resolveAiCanaryCredential(source);
    if (credential.kind === 'turnstile-token') {
      environment.CALRICULA_TURNSTILE_TOKEN = credential.value;
    } else {
      environment.CALRICULA_AI_SESSION_COOKIE = credential.value;
    }
  }
  delete environment.PLAYWRIGHT_REUSE_SERVER;
  delete environment.CALRICULA_E2E_SERVER;
  return environment;
}

async function runPostdeploySteps(
  steps,
  baseOrigin,
  publishedAt,
  aiEnabled,
) {
  for (const step of steps) {
    console.log(`[release-deploy] Running npm run ${step}.`);
    await runNpmScript(step, {
      env: postdeployEnvironment(
        process.env,
        step,
        baseOrigin,
        publishedAt,
        aiEnabled,
      ),
    });
  }
}

async function writeReleaseResultEvidence({
  mode,
  status,
  baseOrigin,
  checks,
  publishedAt,
  deployment,
  destination,
  lifecycleLease,
  markerKind,
}) {
  const [sourceFingerprint, toolVersions, artifacts, git] =
    await Promise.all([
    computeReleaseFingerprint(),
    currentToolVersions(),
    computeArtifactFingerprint(),
    inspectGitReleaseState().then(requireCleanGitReleaseState),
  ]);
  const evidence = {
    schemaVersion: 1,
    mode,
    status,
    completedAt: new Date().toISOString(),
    publishedAt,
    origin: baseOrigin,
    sourceFingerprint,
    toolVersions,
    artifacts,
    git: {
      commit: git.commit,
      tree: git.tree,
    },
    checks,
    deployment: {
      attemptId: deployment.attemptId,
      deploymentId: deployment.deploymentId,
      versionId: deployment.versionId,
      versionTag: deployment.versionTag ?? null,
      rollbackDeploymentId:
        deployment.rollbackDeploymentId ?? null,
      rollbackVersionId: deployment.rollbackVersionId ?? null,
      publicationFingerprint:
        deployment.publicationFingerprint,
      openRouterCredentialFingerprint:
        deployment.openRouterCredentialFingerprint ?? null,
    },
  };
  if (
    destination !==
    (markerKind === 'complete'
      ? COMPLETE_EVIDENCE_PATH
      : STAGED_EVIDENCE_PATH)
  ) {
    throw new ReleaseDeploymentError(
      'Release result marker destination does not match its transition.',
    );
  }
  await commitReleaseResultMarker({
    completePath: COMPLETE_EVIDENCE_PATH,
    evidence,
    lifecycleLease,
    markerKind,
    stagedPath: STAGED_EVIDENCE_PATH,
  });
}

async function removeReleaseResultEvidence(destination) {
  try {
    await unlink(destination);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
}

export async function commitReleaseResultMarker({
  evidence,
  lifecycleLease,
  markerKind,
  completePath = COMPLETE_EVIDENCE_PATH,
  stagedPath = STAGED_EVIDENCE_PATH,
}) {
  if (markerKind !== 'staged' && markerKind !== 'complete') {
    throw new ReleaseDeploymentError(
      'Release result marker must be staged or complete.',
    );
  }
  await assertReleaseLifecycleLease(lifecycleLease);
  const destination =
    markerKind === 'complete' ? completePath : stagedPath;
  await mkdir(path.dirname(destination), { recursive: true });
  if (
    markerKind === 'staged' &&
    (await releaseResultExists(completePath))
  ) {
    throw new ReleaseDeploymentError(
      'The current release is already marked complete; refusing to recreate staged evidence.',
    );
  }
  const temporary = `${destination}.${lifecycleLease.token}.tmp`;
  await writeFile(temporary, `${JSON.stringify(evidence, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });
  try {
    await assertReleaseLifecycleLease(lifecycleLease);
    if (markerKind === 'staged') {
      if (await releaseResultExists(completePath)) {
        throw new ReleaseDeploymentError(
          'Completion evidence appeared before staged evidence could be committed.',
        );
      }
    } else {
      await removeReleaseResultEvidence(stagedPath);
      await assertReleaseLifecycleLease(lifecycleLease);
      if (await releaseResultExists(stagedPath)) {
        throw new ReleaseDeploymentError(
          'Staged evidence reappeared during completion; refusing a contradictory marker state.',
        );
      }
    }
    await rename(temporary, destination);
  } catch (error) {
    await removeReleaseResultEvidence(temporary);
    throw error;
  }
}

/**
 * One publish attempt and its recoverable record on disk.
 *
 * The pending record is the only thing that makes a half-finished publish
 * recoverable, so who may write it and in what order is the safety property
 * that matters. Both the publish path and the recovery path used to build,
 * mutate, and persist it inline; each mutation was three field assignments
 * followed by an update call that a reader had to match up by eye.
 *
 * An attempt is opened before the first mutating Wrangler command and lives
 * until it is finalized. `recordUpload` is the durable point that turns a lost
 * publish into a recoverable one, which is why it persists rather than
 * deferring: it is called from inside the publish, between the upload and the
 * deploy.
 */
export class ReleaseAttempt {
  #record;
  #cwd;
  #write;
  #update;
  #finalize;

  constructor(record, options = {}) {
    this.#record = record;
    this.#cwd = options.cwd;
    this.#write = options.writePending ?? writePendingDeployment;
    this.#update = options.updatePending ?? updatePendingDeployment;
    this.#finalize = options.finalizePending ?? finalizePendingDeployment;
  }

  /** Build the record for a new attempt and make it durable before publishing. */
  static async open(
    {
      mode,
      attemptId,
      startedAt,
      target,
      origin,
      outputPath,
      message,
      gate,
      openRouterCredentialFingerprint = null,
    },
    options = {},
  ) {
    const attempt = new ReleaseAttempt(
      {
        schemaVersion: 1,
        mode,
        attemptId,
        createdAt: startedAt.toISOString(),
        reconciliationNotBefore: new Date(
          startedAt.getTime() + PUBLISH_RECONCILIATION_WINDOW_MS,
        ).toISOString(),
        accountId: target.identity.accountId,
        workerName: target.workerName,
        origin,
        wranglerOutputPath: outputPath,
        versionId: null,
        versionTag: null,
        previousDeploymentId: target.deployment?.deploymentId ?? null,
        previousVersionId: target.deployment?.versionId ?? null,
        releaseMessage: message,
        sourceFingerprint: gate.sourceFingerprint,
        artifactFingerprint: gate.artifacts.fingerprint,
        publicationFingerprint: gate.publication.fingerprint,
        gitCommit: gate.git.commit,
        openRouterCredentialFingerprint,
      },
      options,
    );
    await attempt.#write(attempt.#record, { cwd: attempt.#cwd });
    return attempt;
  }

  /** Adopt a pending record left behind by an earlier process. */
  static resume(record, options = {}) {
    return new ReleaseAttempt(record, options);
  }

  get record() {
    return this.#record;
  }

  get publishedAt() {
    return this.#record.createdAt;
  }

  get origin() {
    return this.#record.origin;
  }

  get versionId() {
    return this.#record.versionId;
  }

  /**
   * Bind this attempt to the version Wrangler uploaded, durably. After this
   * returns, a crash leaves enough on disk to promote or cancel that exact
   * version instead of guessing.
   */
  async recordUpload({ origin, versionId }) {
    this.#record.origin = origin;
    this.#record.versionId = versionId;
    this.#record.versionTag = `release-${this.#record.attemptId}`;
    await this.#update(this.#record, { cwd: this.#cwd });
  }

  /** Promote the attempt to the current deployment and archive its record. */
  async finalize(deployment, options = {}) {
    return this.#finalize(this.#record, deployment, options);
  }
}

export async function finalizePendingDeployment(
  pending,
  deployment,
  options = {},
) {
  const readRecords = options.readRecords ?? readTargetRecords;
  const writeOwnership =
    options.writeOwnership ?? writeOwnershipRecord;
  const appendHistory =
    options.appendHistory ?? appendDeploymentHistory;
  const writeCurrent =
    options.writeCurrent ?? writeCurrentDeployment;
  const archivePending =
    options.archivePending ?? archivePendingDeployment;
  const writeStagedEvidence =
    options.writeStagedEvidence ??
    ((current) =>
      writeReleaseResultEvidence({
        mode: 'full',
        status: 'verification-incomplete',
        baseOrigin: pending.origin,
        checks: [],
        publishedAt: pending.createdAt,
        deployment: current,
        destination: STAGED_EVIDENCE_PATH,
        lifecycleLease: options.lifecycleLease,
        markerKind: 'staged',
      }));
  const records = await readRecords();
  if (pending.mode === 'bootstrap') {
    const expectedOwnership = {
      attemptId: pending.attemptId,
      accountId: pending.accountId,
      workerName: pending.workerName,
      origin: pending.origin,
      bootstrapDeploymentId: deployment.deploymentId,
      bootstrapVersionId: deployment.versionId,
    };
    if (!records.ownership) {
      await writeOwnership({
        schemaVersion: 1,
        createdAt: pending.createdAt,
        ...expectedOwnership,
        sourceFingerprint: pending.sourceFingerprint,
        artifactFingerprint: pending.artifactFingerprint,
        publicationFingerprint: pending.publicationFingerprint,
        gitCommit: pending.gitCommit,
        releaseMessage: pending.releaseMessage,
      });
    } else if (
      Object.entries(expectedOwnership).some(
        ([key, value]) => records.ownership[key] !== value,
      )
    ) {
      throw new ReleaseDeploymentError(
        'Existing immutable ownership evidence does not match the pending bootstrap.',
      );
    }
  }

  const current = {
    schemaVersion: 1,
    recordedAt: new Date().toISOString(),
    publishedAt: pending.createdAt,
    attemptId: pending.attemptId,
    accountId: pending.accountId,
    workerName: pending.workerName,
    origin: pending.origin,
    deploymentId: deployment.deploymentId,
    versionId: deployment.versionId,
    versionTag: pending.versionTag ?? null,
    rollbackDeploymentId:
      pending.previousDeploymentId ?? null,
    rollbackVersionId: pending.previousVersionId ?? null,
    releaseMessage: pending.releaseMessage,
    sourceFingerprint: pending.sourceFingerprint,
    artifactFingerprint: pending.artifactFingerprint,
    publicationFingerprint: pending.publicationFingerprint,
    gitCommit: pending.gitCommit,
    openRouterCredentialFingerprint:
      pending.openRouterCredentialFingerprint ?? null,
  };
  await appendHistory({
    schemaVersion: 1,
    mode: pending.mode,
    publishedAt: pending.createdAt,
    attemptId: pending.attemptId,
    accountId: pending.accountId,
    workerName: pending.workerName,
    origin: pending.origin,
    deploymentId: current.deploymentId,
    versionId: current.versionId,
    versionTag: current.versionTag,
    rollbackDeploymentId: current.rollbackDeploymentId,
    rollbackVersionId: current.rollbackVersionId,
    releaseMessage: current.releaseMessage,
    sourceFingerprint: pending.sourceFingerprint,
    artifactFingerprint: pending.artifactFingerprint,
    publicationFingerprint: pending.publicationFingerprint,
    gitCommit: pending.gitCommit,
    openRouterCredentialFingerprint:
      pending.openRouterCredentialFingerprint ?? null,
  });
  await writeCurrent(current);
  if (pending.mode === 'full') {
    // Keep the recoverable pending record in place until staged evidence is
    // durable. A crash can therefore leave pending+staged, never neither.
    await writeStagedEvidence(current);
  }
  await archivePending(pending);
  return current;
}

async function recoverPendingDeployment({
  pending,
  bootstrap,
  configuration,
  localGate,
  lifecycleLease,
  wranglerConfig,
  allowPromotion = false,
}) {
  const mode = bootstrap ? 'bootstrap' : 'full';
  const expectedReleaseMessage = releaseMessage({
    mode,
    attemptId: pending.attemptId,
    sourceFingerprint: localGate.sourceFingerprint,
    artifactFingerprint: localGate.artifacts.fingerprint,
    publicationFingerprint: localGate.publication.fingerprint,
    gitCommit: localGate.git.commit,
  });
  if (
    pending.schemaVersion !== 1 ||
    pending.mode !== mode ||
    !RELEASE_ATTEMPT_ID_PATTERN.test(pending.attemptId ?? '') ||
    pending.sourceFingerprint !== localGate.sourceFingerprint ||
    pending.artifactFingerprint !== localGate.artifacts.fingerprint ||
    pending.publicationFingerprint !== localGate.publication.fingerprint ||
    pending.gitCommit !== localGate.git.commit ||
    pending.releaseMessage !== expectedReleaseMessage ||
    (bootstrap
      ? pending.openRouterCredentialFingerprint !== null
      : !OPENROUTER_CREDENTIAL_FINGERPRINT_PATTERN.test(
          pending.openRouterCredentialFingerprint ?? '',
        ))
  ) {
    throw new ReleaseDeploymentError(
      'Pending deployment does not belong to this sealed release.',
    );
  }
  const { identity, workerName } = await inspectCloudflareIdentity({
    wranglerConfig,
    environment: process.env,
  });
  if (
    pending.accountId !== identity.accountId ||
    pending.workerName !== workerName
  ) {
    throw new ReleaseDeploymentError(
      'Pending deployment belongs to a different Cloudflare target.',
    );
  }
  if (
    typeof pending.wranglerOutputPath !== 'string' ||
    !path
      .resolve(pending.wranglerOutputPath)
      .startsWith(
        `${path.resolve(
          process.cwd(),
          '.release-artifacts',
          'wrangler',
        )}${path.sep}`,
      )
  ) {
    throw new ReleaseDeploymentError(
      'Pending deployment is missing its private Wrangler receipt path.',
    );
  }
  const attempt = ReleaseAttempt.resume(pending);
  try {
    const upload = parseVersionUploadOutput(
      await readFile(pending.wranglerOutputPath, 'utf8'),
      workerName,
    );
    if (
      pending.versionId &&
      pending.versionId !== upload.versionId
    ) {
      throw new ReleaseDeploymentError(
        'Pending deployment version conflicts with its Wrangler receipt.',
      );
    }
    await attempt.recordUpload({
      origin: pending.origin || upload.origin,
      versionId: upload.versionId,
    });
  } catch (error) {
    if (error instanceof ReleaseDeploymentError) throw error;
    // A process may have stopped before Wrangler wrote its receipt. The exact
    // release-message lookup below is the authoritative recovery fallback.
  }
  const origin = configuration.baseOrigin || pending.origin;
  if (!origin || (pending.origin && pending.origin !== origin)) {
    throw new ReleaseDeploymentError(
      'Pending deployment origin does not match the requested release.',
    );
  }
  pending.origin = origin;
  if (!pending.versionId) {
    // No usable Wrangler receipt: the release message is the only remaining
    // way to identify the exact version this attempt uploaded.
    const resolved = await resolveReleaseVersionByMessage({
      workerName,
      releaseMessage: pending.releaseMessage,
    });
    await attempt.recordUpload({
      origin,
      versionId: resolved.versionId,
    });
  }
  const previous = pending.previousVersionId
    ? {
        deploymentId: pending.previousDeploymentId,
        versionId: pending.previousVersionId,
      }
    : undefined;
  let deployment;
  try {
    deployment = await reconcilePublishedVersion({
      workerName,
      versionId: pending.versionId,
      releaseMessage: pending.releaseMessage,
      previous,
      attempts: 1,
    });
  } catch {
    await confirmReleaseVersion({
      workerName,
      versionId: pending.versionId,
      releaseMessage: pending.releaseMessage,
    });
    if (!allowPromotion) {
      throw new ReleaseDeploymentError(
        'The sealed Worker version was uploaded but is not active. Rerun the matching deploy command to promote that exact version.',
      );
    }
    await promoteUploadedVersion({
      lifecycleLease,
      message: pending.releaseMessage,
      outputPath: await createWranglerOutputPath(),
      sealedPublication: localGate.sealedPublication,
      versionId: pending.versionId,
    });
    deployment = await reconcilePublishedVersion({
      workerName,
      versionId: pending.versionId,
      releaseMessage: pending.releaseMessage,
      previous,
    });
  }
  await attempt.recordUpload({
    origin,
    versionId: deployment.versionId,
  });
  return {
    current: await attempt.finalize(deployment, { lifecycleLease }),
    origin,
  };
}

export async function cancelPendingNoChange(options = {}) {
  const withLifecycleLock =
    options.withLifecycleLock ?? withReleaseLifecycleLock;
  const assertLifecycleLease =
    options.assertLifecycleLease ?? assertReleaseLifecycleLease;
  return withLifecycleLock(async (lifecycleLease) => {
  const environment = options.environment ?? process.env;
  const readPending =
    options.readPending ?? readPendingDeployment;
  const readConfig =
    options.readConfig ??
    (() =>
      readFile(
        path.resolve(process.cwd(), 'wrangler.jsonc'),
        'utf8',
      ));
  const inspectTarget =
    options.inspectTarget ?? inspectCloudflareTarget;
  const confirmVersionAbsent =
    options.confirmVersionAbsent ?? confirmReleaseVersionAbsent;
  const archiveAttempt =
    options.archiveAttempt ?? archiveUnpublishedAttempt;
  const wait =
    options.wait ??
    ((milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const attempts = options.attempts ?? 3;
  const intervalMs = options.intervalMs ?? 2_000;
  const propagationWindowMs =
    options.propagationWindowMs ??
    PUBLISH_RECONCILIATION_WINDOW_MS;
  const now = options.now ?? Date.now;
  const [pending, wranglerConfig] = await Promise.all([
    readPending(),
    readConfig(),
  ]);
  if (
    !pending ||
    pending.schemaVersion !== 1 ||
    (pending.mode !== 'bootstrap' && pending.mode !== 'full') ||
    !RELEASE_ATTEMPT_ID_PATTERN.test(pending.attemptId ?? '') ||
    pending.versionId !== null
  ) {
    throw new ReleaseDeploymentError(
      'Cancellation requires one unresolved pending publish attempt without a Wrangler version ID.',
    );
  }
  const expectedReleaseMessage = releaseMessage({
    mode: pending.mode,
    attemptId: pending.attemptId,
    sourceFingerprint: pending.sourceFingerprint,
    artifactFingerprint: pending.artifactFingerprint,
    publicationFingerprint: pending.publicationFingerprint,
    gitCommit: pending.gitCommit,
  });
  if (pending.releaseMessage !== expectedReleaseMessage) {
    throw new ReleaseDeploymentError(
      'Pending cancellation evidence has an invalid attempt-unique release message.',
    );
  }
  const createdAt = Date.parse(pending.createdAt ?? '');
  const reconciliationNotBefore = Date.parse(
    pending.reconciliationNotBefore ?? '',
  );
  if (
    Number.isNaN(createdAt) ||
    Number.isNaN(reconciliationNotBefore) ||
    reconciliationNotBefore - createdAt < propagationWindowMs
  ) {
    throw new ReleaseDeploymentError(
      'Pending evidence is missing its guarded Cloudflare reconciliation window.',
    );
  }
  const remainingPropagationMs =
    reconciliationNotBefore - now();
  if (remainingPropagationMs > 0) {
    await wait(remainingPropagationMs);
  }
  await assertLifecycleLease(lifecycleLease);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const target = await inspectTarget({
      wranglerConfig,
      environment,
      bootstrap: pending.mode === 'bootstrap',
      verifyOnly: pending.mode !== 'bootstrap',
      origin: pending.origin,
    });
    if (
      target.identity?.accountId !== pending.accountId ||
      target.workerName !== pending.workerName
    ) {
      throw new ReleaseDeploymentError(
        'Pending attempt belongs to a different Cloudflare target.',
      );
    }
    if (
      pending.mode === 'bootstrap'
        ? pending.previousDeploymentId !== null ||
          pending.previousVersionId !== null
        : target.deployment?.deploymentId !==
            pending.previousDeploymentId ||
          target.deployment?.versionId !== pending.previousVersionId
    ) {
      throw new ReleaseDeploymentError(
        'Cloudflare changed after the publish attempt; refusing to cancel pending evidence.',
      );
    }
    await confirmVersionAbsent({
      workerName: pending.workerName,
      releaseMessage: pending.releaseMessage,
    });
    if (attempt + 1 < attempts) {
      await wait(intervalMs);
    }
  }
  await assertLifecycleLease(lifecycleLease);
  const destination = await archiveAttempt(pending);
  console.log(
    `[release-deploy] Cloudflare remained unchanged across ${attempts} guarded checks; archived the unpublished attempt at ${destination}.`,
  );
  return destination;
  });
}

export function parseDeploymentArguments(argv) {
  let bootstrap = false;
  let cancelNoChange = false;
  let stage = false;
  let verifyOnly = false;
  for (const argument of argv) {
    if (argument === '--bootstrap') {
      bootstrap = true;
      continue;
    }
    if (argument === '--cancel-pending-no-change') {
      cancelNoChange = true;
      continue;
    }
    if (argument === '--stage') {
      stage = true;
      continue;
    }
    if (argument === '--verify-only') {
      verifyOnly = true;
      continue;
    }
    throw new ReleaseDeploymentError(`Unknown argument: ${argument}`);
  }
  if (stage && bootstrap) {
    throw new ReleaseDeploymentError(
      '--stage cannot be combined with --bootstrap.',
    );
  }
  if (
    cancelNoChange &&
    (bootstrap || stage || verifyOnly || argv.length !== 1)
  ) {
    throw new ReleaseDeploymentError(
      '--cancel-pending-no-change must be used by itself.',
    );
  }
  return { bootstrap, cancelNoChange, stage, verifyOnly };
}

async function runReleaseDeploymentWithLease(
  { bootstrap, stage, verifyOnly },
  lifecycleLease,
) {
  const [wranglerConfig, siteKey] = await Promise.all([
    readFile(path.resolve(process.cwd(), 'wrangler.jsonc'), 'utf8'),
    resolveTurnstileSiteKey(process.env),
  ]);
  const configuration = validateDeploymentEnvironment({
    environment: process.env,
    wranglerConfig,
    siteKey,
    bootstrap,
    requireBaseOrigin: verifyOnly || !bootstrap,
    requireCanaryCredential: !bootstrap && !stage,
  });
  const pendingAtStart = await readPendingDeployment();
  const releaseSecrets =
    !bootstrap && !verifyOnly && !pendingAtStart
      ? await resolveReleaseSecretsFile(process.env)
      : undefined;
  await runNpmScript('verify:artifacts');
  const localGate = await validateRecordedLocalGate(
    bootstrap ? 'bootstrap' : 'full',
    siteKey,
  );
  if (stage && verifyOnly) {
    const [hasComplete, hasStaged] = await Promise.all([
      releaseResultExists(COMPLETE_EVIDENCE_PATH),
      releaseResultExists(STAGED_EVIDENCE_PATH),
    ]);
    validateStageVerificationMarkers({
      hasComplete,
      hasPending: Boolean(pendingAtStart),
      hasStaged,
    });
  }
  let recoveredAtStart;
  if (pendingAtStart) {
    recoveredAtStart = await recoverPendingDeployment({
      pending: pendingAtStart,
      bootstrap,
      configuration,
      localGate,
      lifecycleLease,
      wranglerConfig,
      allowPromotion: !verifyOnly,
    });
  }

  let targetBefore = await inspectCloudflareTarget({
    wranglerConfig,
    environment: process.env,
    bootstrap,
    verifyOnly: verifyOnly || Boolean(recoveredAtStart),
    origin: configuration.baseOrigin,
  });
  if (verifyOnly) {
    validateCurrentReleaseBinding({
      current: targetBefore.current,
      mode: bootstrap ? 'bootstrap' : 'full',
      localGate,
    });
  }
  if (!bootstrap) {
    const expectedCredentialFingerprint =
      releaseSecrets?.openRouterCredentialFingerprint ??
      targetBefore.current?.openRouterCredentialFingerprint;
    if (
      !OPENROUTER_CREDENTIAL_FINGERPRINT_PATTERN.test(
        expectedCredentialFingerprint ?? '',
      )
    ) {
      throw new ReleaseDeploymentError(
        'The current full deployment is missing its bound OpenRouter credential fingerprint.',
      );
    }
    await verifyRecordedEvidence({
      phase: 'predeploy',
      baseOrigin: configuration.baseOrigin,
      expectedCredentialFingerprint,
    });
  }

  let publishAttempted = false;
  let published = false;
  let reconciled = false;
  let publishedAt =
    recoveredAtStart?.current?.publishedAt ??
    targetBefore.current?.publishedAt ??
    targetBefore.current?.recordedAt ??
    new Date().toISOString();
  let releaseOrigin =
    recoveredAtStart?.origin || configuration.baseOrigin;
  let activeDeployment =
    recoveredAtStart?.current ?? targetBefore.current;
  if (recoveredAtStart) {
    published = true;
    reconciled = true;
  }
  try {
    if (!verifyOnly && !recoveredAtStart) {
      // Revalidate the exact sealed artifact after the read-only remote target
      // check and immediately before the only mutating command.
      await runNpmScript('verify:artifacts');
      await validateRecordedLocalGate(
        bootstrap ? 'bootstrap' : 'full',
        siteKey,
      );
      const targetImmediatelyBefore = await inspectCloudflareTarget({
        wranglerConfig,
        environment: process.env,
        bootstrap,
        verifyOnly: false,
        origin: configuration.baseOrigin,
      });
      if (
        !bootstrap &&
        (targetImmediatelyBefore.deployment.deploymentId !==
          targetBefore.deployment.deploymentId ||
          targetImmediatelyBefore.deployment.versionId !==
            targetBefore.deployment.versionId)
      ) {
        throw new ReleaseDeploymentError(
          'Cloudflare target changed during preflight; refusing to publish.',
        );
      }
      targetBefore = targetImmediatelyBefore;
      const attemptId = randomUUID();
      const message = releaseMessage({
        mode: bootstrap ? 'bootstrap' : 'full',
        attemptId,
        sourceFingerprint: localGate.sourceFingerprint,
        artifactFingerprint: localGate.artifacts.fingerprint,
        publicationFingerprint: localGate.publication.fingerprint,
        gitCommit: localGate.git.commit,
      });
      const outputPath = await createWranglerOutputPath();
      const sealedSecrets = releaseSecrets
        ? await sealReleaseSecretsFile(releaseSecrets)
        : undefined;
      if (!bootstrap) {
        // Invalidate prior result markers before the sole mutating command.
        // An uncertain publish must never leave an older release marked
        // complete.
        await assertReleaseLifecycleLease(lifecycleLease);
        await removeReleaseResultEvidence(COMPLETE_EVIDENCE_PATH);
        await removeReleaseResultEvidence(STAGED_EVIDENCE_PATH);
      }
      const publishStartedAt = new Date();
      publishedAt = publishStartedAt.toISOString();
      const attempt = await ReleaseAttempt.open({
        mode: bootstrap ? 'bootstrap' : 'full',
        attemptId,
        startedAt: publishStartedAt,
        target: targetBefore,
        origin: configuration.baseOrigin,
        outputPath,
        message,
        gate: localGate,
        openRouterCredentialFingerprint:
          releaseSecrets?.openRouterCredentialFingerprint ?? null,
      });
      let publicationReceipt;
      try {
        publishAttempted = true;
        publicationReceipt = await publishWorker({
          attemptId,
          lifecycleLease,
          message,
          onUploaded: async (uploaded) => {
            if (
              configuration.baseOrigin &&
              configuration.baseOrigin !== uploaded.origin
            ) {
              throw new ReleaseDeploymentError(
                'Wrangler uploaded to a different origin than CALRICULA_RELEASE_BASE_URL.',
              );
            }
            await attempt.recordUpload({
              origin: configuration.baseOrigin || uploaded.origin,
              versionId: uploaded.versionId,
            });
          },
          outputPath,
          sealedPublication: localGate.sealedPublication,
          secretsFile: sealedSecrets?.path,
        });
      } finally {
        await sealedSecrets?.cleanup();
      }
      published = true;
      releaseOrigin =
        configuration.baseOrigin || publicationReceipt.origin;
      if (!releaseOrigin) {
        throw new ReleaseDeploymentError(
          'Wrangler did not report one exact workers.dev origin.',
        );
      }
      if (
        configuration.baseOrigin &&
        publicationReceipt.origin &&
        configuration.baseOrigin !== publicationReceipt.origin
      ) {
        throw new ReleaseDeploymentError(
          'Wrangler deployed a different origin than CALRICULA_RELEASE_BASE_URL.',
        );
      }
      await attempt.recordUpload({
        origin: releaseOrigin,
        versionId: publicationReceipt.versionId,
      });
      const deployment = await reconcilePublishedVersion({
        workerName: targetBefore.workerName,
        versionId: publicationReceipt.versionId,
        releaseMessage: message,
        previous: targetBefore.deployment,
      });
      activeDeployment = await attempt.finalize(deployment, {
        lifecycleLease,
      });
      reconciled = true;
    }
    const steps = bootstrap
      ? BOOTSTRAP_POSTDEPLOY_STEPS
      : stage
        ? STAGE_POSTDEPLOY_STEPS
        : POSTDEPLOY_STEPS;
    await runPostdeploySteps(
      steps,
      releaseOrigin,
      publishedAt,
      configuration.aiEnabled,
    );
    if (stage) {
      await writeReleaseResultEvidence({
        mode: 'full',
        status: 'verification-incomplete',
        baseOrigin: releaseOrigin,
        checks: steps,
        publishedAt,
        deployment: activeDeployment,
        destination: STAGED_EVIDENCE_PATH,
        lifecycleLease,
        markerKind: 'staged',
      });
    } else {
      await writeReleaseResultEvidence({
        mode: bootstrap ? 'bootstrap' : 'full',
        status: 'complete',
        baseOrigin: releaseOrigin,
        checks: steps,
        publishedAt,
        deployment: activeDeployment,
        destination: COMPLETE_EVIDENCE_PATH,
        lifecycleLease,
        markerKind: 'complete',
      });
    }
    console.log(
      `[release-deploy] ${
        bootstrap
          ? 'AI-disabled bootstrap verification'
          : stage
            ? 'AI-enabled Worker staging checks'
            : 'AI-enabled release'
      } ${
        stage
          ? `passed for ${releaseOrigin}; the release is published but verification is incomplete until the credentialed canary succeeds.`
          : `completed for ${releaseOrigin}.`
      }`,
    );
  } catch (error) {
    if (published || publishAttempted) {
      throw new ReleaseDeploymentError(
        `${
          reconciled
            ? 'Worker was published, but the release is incomplete'
            : 'Worker publish was attempted and remote state may have changed; the release is incomplete and its pending record must be reconciled'
        }: ${
          error instanceof Error ? error.message : 'post-deploy check failed'
        }`,
      );
    }
    throw error;
  }
}

export async function runReleaseDeployment(
  argv = process.argv.slice(2),
) {
  const parsed = parseDeploymentArguments(argv);
  if (parsed.cancelNoChange) {
    return cancelPendingNoChange();
  }
  return withReleaseLifecycleLock((lifecycleLease) =>
    runReleaseDeploymentWithLease(parsed, lifecycleLease),
  );
}

const entryPoint = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : '';
if (import.meta.url === entryPoint) {
  runReleaseDeployment().catch((error) => {
    console.error(
      `[release-deploy] ${
        error instanceof Error ? error.message : 'Release failed.'
      }`,
    );
    process.exitCode = 1;
  });
}
