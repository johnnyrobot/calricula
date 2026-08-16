import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  CloudflareTargetError,
  appendDeploymentHistory,
  archivePendingDeployment,
  archiveUnpublishedAttempt,
  readPendingDeployment,
  readTargetRecords,
  releaseRecordPaths,
  updatePendingDeployment,
  writeCurrentDeployment,
  writeOwnershipRecord,
  writePendingDeployment,
} from './cloudflare-release-target.mjs';

const roots = [];
const ACCOUNT_ID = 'a'.repeat(32);
const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const VERSION_ID = '22222222-2222-4222-8222-222222222222';
const DEPLOYMENT_ID = '33333333-3333-4333-8333-333333333333';

async function root() {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'calricula-release-records-'),
  );
  roots.push(directory);
  return directory;
}

function pendingRecord(overrides = {}) {
  return {
    schemaVersion: 1,
    mode: 'release',
    attemptId: ATTEMPT_ID,
    createdAt: '2026-07-31T00:00:00.000Z',
    accountId: ACCOUNT_ID,
    workerName: 'calricula-demo',
    origin: 'https://calricula-demo.example',
    previousDeploymentId: null,
    previousVersionId: null,
    releaseMessage: 'calricula-demo release',
    sourceFingerprint: 'sha256:source',
    artifactFingerprint: 'sha256:artifact',
    gitCommit: 'c'.repeat(40),
    reconciliationNotBefore: '2026-07-31T00:00:00.000Z',
    openRouterCredentialFingerprint: `sha256:${'d'.repeat(64)}`,
    versionId: null,
    ...overrides,
  };
}

async function mode(target) {
  return (await stat(target)).mode & 0o777;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map(async (directory) => {
      // Ownership and archive records are deliberately written read-only.
      await chmod(directory, 0o700).catch(() => undefined);
      await rm(directory, { force: true, recursive: true });
    }),
  );
});

describe('release target records', () => {
  it('resolves every record beneath the supplied working directory', async () => {
    const cwd = await root();
    const paths = releaseRecordPaths(cwd);
    for (const target of [
      paths.ownership,
      paths.current,
      paths.pending,
      paths.history,
      paths.lifecycleLock,
      paths.artifacts,
    ]) {
      expect(target.startsWith(cwd)).toBe(true);
    }
  });

  it('claims a pending attempt exactly once', async () => {
    const cwd = await root();
    const record = pendingRecord();

    await writePendingDeployment(record, { cwd });
    await expect(readPendingDeployment({ cwd })).resolves.toEqual(record);
    await expect(mode(releaseRecordPaths(cwd).pending)).resolves.toBe(0o600);

    await expect(
      writePendingDeployment(pendingRecord(), { cwd }),
    ).rejects.toThrow('A pending deployment already exists');
  });

  it('reports no pending attempt when none was claimed', async () => {
    const cwd = await root();
    await expect(readPendingDeployment({ cwd })).resolves.toBeUndefined();
    await expect(readTargetRecords({ cwd })).resolves.toEqual({
      current: undefined,
      ownership: undefined,
      pending: undefined,
    });
  });

  it('records the uploaded version against the same attempt', async () => {
    const cwd = await root();
    await writePendingDeployment(pendingRecord(), { cwd });

    const uploaded = pendingRecord({ versionId: VERSION_ID });
    await updatePendingDeployment(uploaded, { cwd });

    await expect(readPendingDeployment({ cwd })).resolves.toEqual(uploaded);
    await expect(mode(releaseRecordPaths(cwd).pending)).resolves.toBe(0o600);
  });

  it.each([
    ['a different attempt', { attemptId: '44444444-4444-4444-8444-444444444444' }],
    ['a different origin', { origin: 'https://elsewhere.example' }],
    ['a different artifact', { artifactFingerprint: 'sha256:other' }],
  ])('refuses to update a pending attempt with %s', async (_label, overrides) => {
    const cwd = await root();
    await writePendingDeployment(pendingRecord(), { cwd });

    await expect(
      updatePendingDeployment(pendingRecord(overrides), { cwd }),
    ).rejects.toBeInstanceOf(CloudflareTargetError);
  });

  it('archives a reconciled attempt as a read-only artifact', async () => {
    const cwd = await root();
    const uploaded = pendingRecord({ versionId: VERSION_ID });
    await writePendingDeployment(uploaded, { cwd });

    const destination = await archivePendingDeployment(uploaded, { cwd });

    expect(destination).toBe(
      path.join(releaseRecordPaths(cwd).artifacts, `reconciled-${VERSION_ID}.json`),
    );
    await expect(mode(destination)).resolves.toBe(0o400);
    await expect(readPendingDeployment({ cwd })).resolves.toBeUndefined();
  });

  it('archives a confirmed unpublished attempt and states the outcome', async () => {
    const cwd = await root();
    const record = pendingRecord();
    await writePendingDeployment(record, { cwd });

    const destination = await archiveUnpublishedAttempt(record, { cwd });

    const archived = JSON.parse(await readFile(destination, 'utf8'));
    expect(archived).toMatchObject({
      attemptId: ATTEMPT_ID,
      outcome: 'confirmed-not-published',
      versionId: null,
    });
    expect(typeof archived.resolvedAt).toBe('string');
    await expect(mode(destination)).resolves.toBe(0o400);
    await expect(readPendingDeployment({ cwd })).resolves.toBeUndefined();
  });

  it('refuses to cancel an attempt that already uploaded a version', async () => {
    const cwd = await root();
    const uploaded = pendingRecord({ versionId: VERSION_ID });
    await writePendingDeployment(uploaded, { cwd });

    await expect(
      archiveUnpublishedAttempt(uploaded, { cwd }),
    ).rejects.toThrow('no-change cancellation');
  });

  it('seals ownership read-only and keeps the current deployment replaceable', async () => {
    const cwd = await root();
    const ownership = {
      schemaVersion: 1,
      accountId: ACCOUNT_ID,
      workerName: 'calricula-demo',
      attemptId: ATTEMPT_ID,
    };
    const current = {
      schemaVersion: 1,
      accountId: ACCOUNT_ID,
      deploymentId: DEPLOYMENT_ID,
      versionId: VERSION_ID,
    };

    await writeOwnershipRecord(ownership, { cwd });
    await writeCurrentDeployment(current, { cwd });
    await expect(mode(releaseRecordPaths(cwd).ownership)).resolves.toBe(0o400);
    await expect(mode(releaseRecordPaths(cwd).current)).resolves.toBe(0o600);

    const replacement = { ...current, deploymentId: ATTEMPT_ID };
    await writeCurrentDeployment(replacement, { cwd });

    await expect(readTargetRecords({ cwd })).resolves.toEqual({
      current: replacement,
      ownership,
      pending: undefined,
    });
  });

  it('appends each published version to the history exactly once', async () => {
    const cwd = await root();
    const entry = { versionId: VERSION_ID, deploymentId: DEPLOYMENT_ID };

    await appendDeploymentHistory(entry, { cwd });
    await appendDeploymentHistory(entry, { cwd });
    await appendDeploymentHistory({ ...entry, versionId: ATTEMPT_ID }, { cwd });

    const lines = (await readFile(releaseRecordPaths(cwd).history, 'utf8'))
      .split('\n')
      .filter(Boolean);
    expect(lines.map((line) => JSON.parse(line).versionId)).toEqual([
      VERSION_ID,
      ATTEMPT_ID,
    ]);
    await expect(mode(releaseRecordPaths(cwd).history)).resolves.toBe(0o600);
  });

  it('refuses to append to a malformed history', async () => {
    const cwd = await root();
    const paths = releaseRecordPaths(cwd);
    await mkdir(paths.evidence, { recursive: true });
    await writeFile(paths.history, 'not json\n', { mode: 0o600 });

    await expect(
      appendDeploymentHistory({ versionId: VERSION_ID }, { cwd }),
    ).rejects.toThrow('Deployment history is malformed');
  });
});
