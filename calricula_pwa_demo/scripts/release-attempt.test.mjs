import { chmod, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  PUBLISH_RECONCILIATION_WINDOW_MS,
  ReleaseAttempt,
} from './release-deploy.mjs';
import {
  readPendingDeployment,
} from './cloudflare-release-target.mjs';

const roots = [];
const ACCOUNT_ID = 'a'.repeat(32);
const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const VERSION_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_VERSION_ID = '44444444-4444-4444-8444-444444444444';
const DEPLOYMENT_ID = '33333333-3333-4333-8333-333333333333';
const STARTED_AT = new Date('2026-07-31T00:00:00.000Z');

async function root() {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'calricula-release-attempt-'),
  );
  roots.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map(async (directory) => {
      await chmod(directory, 0o700).catch(() => undefined);
      await rm(directory, { force: true, recursive: true });
    }),
  );
});

const TARGET = {
  identity: { accountId: ACCOUNT_ID },
  workerName: 'calricula-demo',
  deployment: {
    deploymentId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    versionId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  },
};

const GATE = {
  sourceFingerprint: 'sha256:source',
  artifacts: { fingerprint: 'sha256:artifact' },
  publication: { fingerprint: 'sha256:publication' },
  git: { commit: 'c'.repeat(40) },
};

function openOptions(cwd, overrides = {}) {
  return {
    mode: 'full',
    attemptId: ATTEMPT_ID,
    startedAt: STARTED_AT,
    target: TARGET,
    origin: 'https://calricula-demo.example',
    outputPath: path.join(cwd, '.release-artifacts', 'wrangler', 'out.json'),
    message: 'calricula-full',
    gate: GATE,
    openRouterCredentialFingerprint: `sha256:${'d'.repeat(64)}`,
    ...overrides,
  };
}

describe('ReleaseAttempt', () => {
  it('makes the attempt recoverable before any Wrangler command runs', async () => {
    const cwd = await root();

    const attempt = await ReleaseAttempt.open(openOptions(cwd), { cwd });

    expect(await readPendingDeployment({ cwd })).toEqual({
      schemaVersion: 1,
      mode: 'full',
      attemptId: ATTEMPT_ID,
      createdAt: '2026-07-31T00:00:00.000Z',
      reconciliationNotBefore: new Date(
        STARTED_AT.getTime() + PUBLISH_RECONCILIATION_WINDOW_MS,
      ).toISOString(),
      accountId: ACCOUNT_ID,
      workerName: 'calricula-demo',
      origin: 'https://calricula-demo.example',
      wranglerOutputPath: attempt.record.wranglerOutputPath,
      versionId: null,
      versionTag: null,
      previousDeploymentId: TARGET.deployment.deploymentId,
      previousVersionId: TARGET.deployment.versionId,
      releaseMessage: 'calricula-full',
      sourceFingerprint: 'sha256:source',
      artifactFingerprint: 'sha256:artifact',
      publicationFingerprint: 'sha256:publication',
      gitCommit: 'c'.repeat(40),
      openRouterCredentialFingerprint: `sha256:${'d'.repeat(64)}`,
    });
  });

  it('carries no version until one has actually been uploaded', async () => {
    const cwd = await root();

    const attempt = await ReleaseAttempt.open(openOptions(cwd), { cwd });

    expect(attempt.versionId).toBeNull();
    expect(attempt.record.versionTag).toBeNull();
    expect(attempt.publishedAt).toBe('2026-07-31T00:00:00.000Z');
  });

  it('records a bootstrap with no prior deployment to roll back to', async () => {
    const cwd = await root();

    const attempt = await ReleaseAttempt.open(
      openOptions(cwd, {
        mode: 'bootstrap',
        target: { ...TARGET, deployment: undefined },
        openRouterCredentialFingerprint: null,
      }),
      { cwd },
    );

    expect(attempt.record.previousDeploymentId).toBeNull();
    expect(attempt.record.previousVersionId).toBeNull();
    expect(attempt.record.openRouterCredentialFingerprint).toBeNull();
  });

  it('refuses to open a second attempt over an unreconciled one', async () => {
    const cwd = await root();
    await ReleaseAttempt.open(openOptions(cwd), { cwd });

    await expect(
      ReleaseAttempt.open(
        openOptions(cwd, {
          attemptId: '99999999-9999-4999-8999-999999999999',
        }),
        { cwd },
      ),
    ).rejects.toThrow('reconcile it before publishing again');
  });

  it('binds the uploaded version to disk, not only in memory', async () => {
    const cwd = await root();
    const attempt = await ReleaseAttempt.open(openOptions(cwd), { cwd });

    await attempt.recordUpload({
      origin: 'https://calricula-demo.example',
      versionId: VERSION_ID,
    });

    expect(await readPendingDeployment({ cwd })).toMatchObject({
      versionId: VERSION_ID,
      versionTag: `release-${ATTEMPT_ID}`,
      origin: 'https://calricula-demo.example',
    });
  });

  it('accepts the same version twice, as the publish path records it', async () => {
    const cwd = await root();
    const attempt = await ReleaseAttempt.open(openOptions(cwd), { cwd });
    const upload = {
      origin: 'https://calricula-demo.example',
      versionId: VERSION_ID,
    };

    await attempt.recordUpload(upload);
    await expect(attempt.recordUpload(upload)).resolves.toBeUndefined();

    expect(attempt.versionId).toBe(VERSION_ID);
  });

  it('refuses to rebind an attempt to a different version', async () => {
    const cwd = await root();
    const attempt = await ReleaseAttempt.open(openOptions(cwd), { cwd });
    await attempt.recordUpload({
      origin: 'https://calricula-demo.example',
      versionId: VERSION_ID,
    });

    await expect(
      attempt.recordUpload({
        origin: 'https://calricula-demo.example',
        versionId: OTHER_VERSION_ID,
      }),
    ).rejects.toThrow('changed unexpectedly');
  });

  it('refuses to move a bound attempt to a different origin', async () => {
    const cwd = await root();
    const attempt = await ReleaseAttempt.open(openOptions(cwd), { cwd });

    await expect(
      attempt.recordUpload({
        origin: 'https://somewhere-else.example',
        versionId: VERSION_ID,
      }),
    ).rejects.toThrow('changed unexpectedly');
  });

  it('adopts a record left behind by an earlier process', async () => {
    const cwd = await root();
    const first = await ReleaseAttempt.open(openOptions(cwd), { cwd });

    const resumed = ReleaseAttempt.resume(await readPendingDeployment({ cwd }), {
      cwd,
    });
    await resumed.recordUpload({
      origin: first.origin,
      versionId: VERSION_ID,
    });

    expect(await readPendingDeployment({ cwd })).toMatchObject({
      attemptId: ATTEMPT_ID,
      versionId: VERSION_ID,
    });
  });

  it('hands the whole record to finalization, not just the version', async () => {
    const cwd = await root();
    const finalizePending = vi.fn(async () => ({ recordedAt: 'now' }));
    const attempt = await ReleaseAttempt.open(openOptions(cwd), {
      cwd,
      finalizePending,
    });
    await attempt.recordUpload({
      origin: 'https://calricula-demo.example',
      versionId: VERSION_ID,
    });
    const deployment = { deploymentId: DEPLOYMENT_ID, versionId: VERSION_ID };
    const lifecycleLease = { token: 'lease' };

    const current = await attempt.finalize(deployment, { lifecycleLease });

    expect(current).toEqual({ recordedAt: 'now' });
    expect(finalizePending).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId: ATTEMPT_ID,
        versionId: VERSION_ID,
        versionTag: `release-${ATTEMPT_ID}`,
      }),
      deployment,
      { lifecycleLease },
    );
  });
});
