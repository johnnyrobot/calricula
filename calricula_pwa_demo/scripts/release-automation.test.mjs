import {
  mkdtemp,
  lstat,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  BOOTSTRAP_POSTDEPLOY_STEPS,
  POSTDEPLOY_STEPS,
  PUBLISH_RECONCILIATION_WINDOW_MS,
  STAGE_POSTDEPLOY_STEPS,
  ReleaseDeploymentError,
  cancelPendingNoChange,
  commitReleaseResultMarker,
  finalizePendingDeployment,
  parseDeploymentArguments,
  postdeployEnvironment,
  runPausedPublisher,
  validateCurrentReleaseBinding,
  validateDeploymentEnvironment,
  validateLocalGateEvidence,
  validateStageVerificationMarkers,
  wranglerVersionDeployArguments,
  wranglerVersionUploadArguments,
} from './release-deploy.mjs';
import {
  BOOTSTRAP_RELEASE_GATE_STEPS,
  RELEASE_GATE_STEPS,
  releaseGateEnvironment,
} from './release-gate.mjs';
import {
  acquireReleaseLifecycleLock,
  releaseMessage,
} from './cloudflare-release-target.mjs';

const MODELS = ['provider/alpha:free', 'provider/beta:free'];
const CONFIG = `{
  "name": "calricula-demo",
  "vars": {
    "AI_ENABLED": "true",
    "APP_ORIGIN": "https://calricula-demo.example",
    "OPENROUTER_FREE_MODELS": "${MODELS.join(',')}"
  }
}`;
const BOOTSTRAP_CONFIG = CONFIG.replace(
  '"AI_ENABLED": "true"',
  '"AI_ENABLED": "false"',
);
const TOOL_VERSIONS = {
  node: '22.23.0',
  npm: '10.9.8',
  lighthouse: '13.3.0',
  playwright: '1.62.0',
  wrangler: '4.115.0',
};
const ARTIFACTS = {
  fingerprint: 'sha256:artifact',
  files: 100,
  totalBytes: 1_000_000,
};
const PUBLICATION = {
  fingerprint: 'sha256:publication',
  files: 99,
  totalBytes: 900_000,
};
const GIT = {
  commit: 'a'.repeat(40),
  tree: 'b'.repeat(40),
};
const ATTEMPT_ID = '55555555-5555-4555-8555-555555555555';
const SESSION_COOKIE = `__Host-calricula_ai_session=${'a'.repeat(64)}.${'b'.repeat(43)}`;

describe('release command topology', () => {
  it('runs all local browser projects and production checks before evidence sealing', () => {
    expect(RELEASE_GATE_STEPS).toEqual(
      expect.arrayContaining([
        'release:clean-generated',
        'test:e2e:full',
        'verify:production:local',
        'lighthouse:local',
        'release:evidence:predeploy',
      ]),
    );
    expect(RELEASE_GATE_STEPS).not.toContain('test:e2e:smoke');
    expect(BOOTSTRAP_RELEASE_GATE_STEPS).not.toContain(
      'release:evidence:predeploy',
    );
    expect(POSTDEPLOY_STEPS).toEqual([
      'ai:canary:record',
      'verify:production',
      'lighthouse:production',
      'test:e2e:remote',
      'release:evidence:complete',
    ]);
    expect(STAGE_POSTDEPLOY_STEPS).toEqual([
      'verify:production',
      'lighthouse:production',
      'test:e2e:remote',
    ]);
    expect(STAGE_POSTDEPLOY_STEPS).not.toContain(
      'release:evidence:complete',
    );
    expect(STAGE_POSTDEPLOY_STEPS).not.toContain('ai:canary:record');
    expect(BOOTSTRAP_POSTDEPLOY_STEPS).toContain(
      'test:e2e:remote',
    );
  });

  // Secret scrubbing is owned by `childEnvironment` and asserted in
  // child-environment.test.mjs. This asserts only what the gate adds on top.
  it('removes stale deployed Playwright targeting from the local gate', () => {
    const environment = releaseGateEnvironment({
      PLAYWRIGHT_BASE_URL: 'https://stale.example',
      PLAYWRIGHT_REUSE_SERVER: 'true',
      CALRICULA_E2E_SERVER: 'static',
      SAFE_GATE_CONTEXT: 'kept',
    });
    expect(environment.PLAYWRIGHT_BASE_URL).toBeUndefined();
    expect(environment.PLAYWRIGHT_REUSE_SERVER).toBeUndefined();
    expect(environment.CALRICULA_E2E_SERVER).toBeUndefined();
    expect(environment.SAFE_GATE_CONTEXT).toBe('kept');
  });

  it('exposes exactly one canary credential only to the canary subprocess', () => {
    const source = {
      CALRICULA_AI_SESSION_COOKIE: SESSION_COOKIE,
      OPENROUTER_API_KEY: 'provider-secret',
      CLOUDFLARE_API_TOKEN: 'cloud-secret',
    };
    const canary = postdeployEnvironment(
      source,
      'ai:canary:record',
      'https://calricula-demo.example',
      '2026-07-30T06:00:00.000Z',
      true,
    );
    // Only the restore is asserted here; the scrub it builds on is owned by
    // `childEnvironment` and asserted in child-environment.test.mjs.
    expect(canary.CALRICULA_AI_SESSION_COOKIE).toBe(
      SESSION_COOKIE,
    );
    expect(canary.CALRICULA_TURNSTILE_TOKEN).toBeUndefined();
    expect(canary.CALRICULA_EXPECT_AI_ENABLED).toBe('true');
    const lighthouse = postdeployEnvironment(
      source,
      'lighthouse:production',
      'https://calricula-demo.example',
      '2026-07-30T06:00:00.000Z',
      true,
    );
    expect(lighthouse.CALRICULA_TURNSTILE_TOKEN).toBeUndefined();
    expect(lighthouse.CALRICULA_AI_SESSION_COOKIE).toBeUndefined();
  });

  it('keeps staging distinct from bootstrap and final verification', () => {
    expect(parseDeploymentArguments(['--stage'])).toEqual({
      bootstrap: false,
      cancelNoChange: false,
      stage: true,
      verifyOnly: false,
    });
    expect(
      parseDeploymentArguments(['--stage', '--verify-only']),
    ).toEqual({
      bootstrap: false,
      cancelNoChange: false,
      stage: true,
      verifyOnly: true,
    });
    expect(() =>
      parseDeploymentArguments(['--stage', '--bootstrap']),
    ).toThrow(ReleaseDeploymentError);
    expect(
      parseDeploymentArguments(['--cancel-pending-no-change']),
    ).toEqual({
      bootstrap: false,
      cancelNoChange: true,
      stage: false,
      verifyOnly: false,
    });
    expect(() =>
      parseDeploymentArguments([
        '--cancel-pending-no-change',
        '--verify-only',
      ]),
    ).toThrow(ReleaseDeploymentError);
  });

  it('requires recoverable staged state and refuses contradictory completion evidence', () => {
    expect(
      validateStageVerificationMarkers({
        hasComplete: false,
        hasPending: true,
        hasStaged: false,
      }),
    ).toBe(true);
    expect(
      validateStageVerificationMarkers({
        hasComplete: false,
        hasPending: false,
        hasStaged: true,
      }),
    ).toBe(true);
    expect(() =>
      validateStageVerificationMarkers({
        hasComplete: true,
        hasPending: false,
        hasStaged: true,
      }),
    ).toThrow('already marked complete');
    expect(() =>
      validateStageVerificationMarkers({
        hasComplete: false,
        hasPending: false,
        hasStaged: false,
      }),
    ).toThrow('existing pending attempt or staged release');
  });

  it('cancels an unresolved attempt only after repeated exact no-change proof', async () => {
    const createdAt = '2026-07-30T06:00:00.000Z';
    const pending = {
      schemaVersion: 1,
      mode: 'full',
      attemptId: ATTEMPT_ID,
      createdAt,
      reconciliationNotBefore: new Date(
        Date.parse(createdAt) +
          PUBLISH_RECONCILIATION_WINDOW_MS,
      ).toISOString(),
      versionId: null,
      accountId: 'a'.repeat(32),
      workerName: 'calricula-demo',
      origin: 'https://calricula-demo.example',
      previousDeploymentId:
        '11111111-1111-4111-8111-111111111111',
      previousVersionId:
        '22222222-2222-4222-8222-222222222222',
      sourceFingerprint: 'sha256:source',
      artifactFingerprint: 'sha256:artifact',
      publicationFingerprint: 'sha256:publication',
      gitCommit: GIT.commit,
      releaseMessage: releaseMessage({
        mode: 'full',
        attemptId: ATTEMPT_ID,
        sourceFingerprint: 'sha256:source',
        artifactFingerprint: 'sha256:artifact',
        publicationFingerprint: 'sha256:publication',
        gitCommit: GIT.commit,
      }),
    };
    const inspectTarget = vi.fn(async () => ({
      deployment: {
        deploymentId: pending.previousDeploymentId,
        versionId: pending.previousVersionId,
      },
      identity: { accountId: pending.accountId },
      workerName: pending.workerName,
    }));
    const archiveAttempt = vi.fn(async () => '/private/archived.json');
    const confirmVersionAbsent = vi.fn(async () => ({
      absent: true,
    }));
    await expect(
      cancelPendingNoChange({
        archiveAttempt,
        assertLifecycleLease: async () => true,
        attempts: 3,
        confirmVersionAbsent,
        environment: {},
        inspectTarget,
        intervalMs: 0,
        readConfig: async () => '{}',
        readPending: async () => pending,
        now: () =>
          Date.parse(pending.reconciliationNotBefore),
        wait: async () => {},
        withLifecycleLock: async (action) =>
          action({ token: 'test-lease' }),
      }),
    ).resolves.toBe('/private/archived.json');
    expect(inspectTarget).toHaveBeenCalledTimes(3);
    expect(confirmVersionAbsent).toHaveBeenCalledTimes(3);
    expect(confirmVersionAbsent).toHaveBeenLastCalledWith({
      workerName: pending.workerName,
      releaseMessage: pending.releaseMessage,
    });
    expect(archiveAttempt).toHaveBeenCalledWith(pending);

    inspectTarget.mockResolvedValueOnce({
      deployment: {
        deploymentId:
          '33333333-3333-4333-8333-333333333333',
        versionId: pending.previousVersionId,
      },
      identity: { accountId: pending.accountId },
      workerName: pending.workerName,
    });
    await expect(
      cancelPendingNoChange({
        archiveAttempt,
        assertLifecycleLease: async () => true,
        attempts: 1,
        confirmVersionAbsent,
        environment: {},
        inspectTarget,
        intervalMs: 0,
        readConfig: async () => '{}',
        readPending: async () => pending,
        now: () =>
          Date.parse(pending.reconciliationNotBefore),
        wait: async () => {},
        withLifecycleLock: async (action) =>
          action({ token: 'test-lease' }),
      }),
    ).rejects.toThrow('Cloudflare changed');
  });

  it('waits out the recorded propagation window before checking cancellation', async () => {
    const createdAt = Date.parse('2026-07-30T06:00:00.000Z');
    const waits = [];
    const inspectTarget = vi.fn(async () => ({
      deployment: {
        deploymentId:
          '11111111-1111-4111-8111-111111111111',
        versionId:
          '22222222-2222-4222-8222-222222222222',
      },
      identity: { accountId: 'a'.repeat(32) },
      workerName: 'calricula-demo',
    }));
    await cancelPendingNoChange({
      archiveAttempt: async () => '/private/archived.json',
      assertLifecycleLease: async () => true,
      attempts: 1,
      inspectTarget,
      now: () => createdAt + 5_000,
      propagationWindowMs: 10_000,
      readConfig: async () => '{}',
      readPending: async () => ({
        schemaVersion: 1,
        mode: 'full',
        attemptId: ATTEMPT_ID,
        createdAt: new Date(createdAt).toISOString(),
        reconciliationNotBefore: new Date(
          createdAt + 10_000,
        ).toISOString(),
        versionId: null,
        accountId: 'a'.repeat(32),
        workerName: 'calricula-demo',
        origin: 'https://calricula-demo.example',
        previousDeploymentId:
          '11111111-1111-4111-8111-111111111111',
        previousVersionId:
          '22222222-2222-4222-8222-222222222222',
        sourceFingerprint: 'sha256:source',
        artifactFingerprint: 'sha256:artifact',
        publicationFingerprint: 'sha256:publication',
        gitCommit: GIT.commit,
        releaseMessage: releaseMessage({
          mode: 'full',
          attemptId: ATTEMPT_ID,
          sourceFingerprint: 'sha256:source',
          artifactFingerprint: 'sha256:artifact',
          publicationFingerprint: 'sha256:publication',
          gitCommit: GIT.commit,
        }),
      }),
      confirmVersionAbsent: async () => ({ absent: true }),
      wait: async (milliseconds) => {
        waits.push(milliseconds);
        expect(inspectTarget).not.toHaveBeenCalled();
      },
      withLifecycleLock: async (action) =>
        action({ token: 'test-lease' }),
    });
    expect(waits).toEqual([5_000]);
    expect(inspectTarget).toHaveBeenCalledOnce();
  });

  it('keeps pending recovery durable until staged evidence exists', async () => {
    const events = [];
    const pending = {
      schemaVersion: 1,
      mode: 'full',
      attemptId: ATTEMPT_ID,
      createdAt: '2026-07-30T06:00:00.000Z',
      accountId: 'a'.repeat(32),
      workerName: 'calricula-demo',
      origin: 'https://calricula-demo.example',
      previousDeploymentId:
        '11111111-1111-4111-8111-111111111111',
      previousVersionId:
        '22222222-2222-4222-8222-222222222222',
      releaseMessage: 'calricula-full-proof',
      sourceFingerprint: 'sha256:source',
      artifactFingerprint: 'sha256:artifact',
      publicationFingerprint: 'sha256:publication',
      gitCommit: 'a'.repeat(40),
      openRouterCredentialFingerprint: `sha256:${'b'.repeat(64)}`,
    };
    const deployment = {
      deploymentId:
        '33333333-3333-4333-8333-333333333333',
      versionId:
        '44444444-4444-4444-8444-444444444444',
    };
    const options = {
      readRecords: async () => ({}),
      appendHistory: async () => events.push('history'),
      writeCurrent: async () => events.push('current'),
      writeStagedEvidence: async () => events.push('staged'),
      archivePending: async () => events.push('archive'),
    };
    await finalizePendingDeployment(pending, deployment, options);
    expect(events).toEqual([
      'history',
      'current',
      'staged',
      'archive',
    ]);

    events.length = 0;
    await expect(
      finalizePendingDeployment(pending, deployment, {
        ...options,
        writeStagedEvidence: async () => {
          events.push('staged');
          throw new Error('simulated marker interruption');
        },
      }),
    ).rejects.toThrow('simulated marker interruption');
    expect(events).toEqual(['history', 'current', 'staged']);
  });

  it('commits complete and staged markers as exclusive lease-bound states', async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), 'calricula-result-markers-'),
    );
    const completePath = path.join(directory, 'complete.json');
    const stagedPath = path.join(directory, 'staged.json');
    const lifecycleLease = await acquireReleaseLifecycleLock({
      lockPath: path.join(directory, 'release.lock'),
    });
    try {
      await writeFile(stagedPath, '{"status":"staged"}\n', {
        mode: 0o600,
      });
      await commitReleaseResultMarker({
        completePath,
        evidence: { status: 'complete' },
        lifecycleLease,
        markerKind: 'complete',
        stagedPath,
      });
      await expect(readFile(stagedPath, 'utf8')).rejects.toMatchObject({
        code: 'ENOENT',
      });
      await expect(
        readFile(completePath, 'utf8').then(JSON.parse),
      ).resolves.toEqual({ status: 'complete' });
      expect((await lstat(completePath)).mode & 0o777).toBe(0o600);
      await expect(
        commitReleaseResultMarker({
          completePath,
          evidence: { status: 'staged' },
          lifecycleLease,
          markerKind: 'staged',
          stagedPath,
        }),
      ).rejects.toThrow('refusing to recreate staged evidence');
      await expect(readFile(stagedPath, 'utf8')).rejects.toMatchObject({
        code: 'ENOENT',
      });
    } finally {
      await lifecycleLease.release();
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('keeps Wrangler paused until its durable publisher PID is recorded', async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), 'calricula-paused-publisher-'),
    );
    const sentinel = path.join(directory, 'publisher-started.txt');
    let allowPersistence;
    let reportPublisherPid;
    const persistenceAllowed = new Promise((resolve) => {
      allowPersistence = resolve;
    });
    const publisherPidReported = new Promise((resolve) => {
      reportPublisherPid = resolve;
    });
    const publisherPids = [];
    try {
      const publication = runPausedPublisher({
        args: [
          '-e',
          `require("node:fs").writeFileSync(${JSON.stringify(
            sentinel,
          )}, "started")`,
        ],
        environment: {},
        executable: process.execPath,
        lifecycleLease: {
          async setPublisherPid(pid) {
            publisherPids.push(pid);
            if (pid !== null) {
              reportPublisherPid();
              await persistenceAllowed;
            }
          },
        },
      });
      await publisherPidReported;
      await expect(readFile(sentinel, 'utf8')).rejects.toMatchObject({
        code: 'ENOENT',
      });
      allowPersistence();
      await expect(publication).resolves.toBe(0);
      await expect(readFile(sentinel, 'utf8')).resolves.toBe('started');
      expect(publisherPids).toHaveLength(2);
      expect(publisherPids[0]).toEqual(expect.any(Number));
      expect(publisherPids[1]).toBeNull();

      const blockedSentinel = path.join(
        directory,
        'publisher-must-not-start.txt',
      );
      await expect(
        runPausedPublisher({
          args: [
            '-e',
            `require("node:fs").writeFileSync(${JSON.stringify(
              blockedSentinel,
            )}, "started")`,
          ],
          environment: {},
          executable: process.execPath,
          lifecycleLease: {
            async setPublisherPid(pid) {
              if (pid !== null) {
                throw new Error('simulated lease persistence failure');
              }
            },
          },
        }),
      ).rejects.toThrow('simulated lease persistence failure');
      await expect(
        readFile(blockedSentinel, 'utf8'),
      ).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      allowPersistence?.();
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('uploads and promotes only the sealed package and exact version ID', () => {
    const sealedPublication = {
      configPath: '/private/sealed/wrangler.jsonc',
    };
    expect(
      wranglerVersionUploadArguments({
        attemptId: ATTEMPT_ID,
        message: 'calricula-full-proof',
        sealedPublication,
        secretsFile: '/private/sealed.env',
      }),
    ).toEqual([
      'versions',
      'upload',
      '--config',
      '/private/sealed/wrangler.jsonc',
      '--name',
      'calricula-demo',
      '--no-bundle',
      '--strict',
      '--tag',
      `release-${ATTEMPT_ID}`,
      '--message',
      'calricula-full-proof',
      '--secrets-file',
      '/private/sealed.env',
    ]);
    expect(
      wranglerVersionDeployArguments({
        message: 'calricula-full-proof',
        sealedPublication,
        versionId:
          '44444444-4444-4444-8444-444444444444',
      }),
    ).toEqual([
      'versions',
      'deploy',
      '44444444-4444-4444-8444-444444444444@100',
      '--config',
      '/private/sealed/wrangler.jsonc',
      '--name',
      'calricula-demo',
      '--message',
      'calricula-full-proof',
      '--yes',
    ]);
  });

  it('makes otherwise identical release retries attempt-unique', () => {
    const binding = {
      mode: 'full',
      sourceFingerprint: 'sha256:source',
      artifactFingerprint: 'sha256:artifact',
      publicationFingerprint: 'sha256:publication',
      gitCommit: GIT.commit,
    };
    expect(
      releaseMessage({
        ...binding,
        attemptId: ATTEMPT_ID,
      }),
    ).not.toBe(
      releaseMessage({
        ...binding,
        attemptId: '66666666-6666-4666-8666-666666666666',
      }),
    );
  });
});

describe('release deployment preflight', () => {
  it('binds verify-only checks to the exact sealed release message', () => {
    const localGate = {
      sourceFingerprint: 'sha256:source',
      artifacts: ARTIFACTS,
      publication: PUBLICATION,
      git: GIT,
    };
    const current = {
      attemptId: ATTEMPT_ID,
      artifactFingerprint: localGate.artifacts.fingerprint,
      publicationFingerprint: localGate.publication.fingerprint,
      gitCommit: localGate.git.commit,
      releaseMessage: releaseMessage({
        mode: 'full',
        attemptId: ATTEMPT_ID,
        sourceFingerprint: localGate.sourceFingerprint,
        artifactFingerprint: localGate.artifacts.fingerprint,
        publicationFingerprint: localGate.publication.fingerprint,
        gitCommit: localGate.git.commit,
      }),
      sourceFingerprint: localGate.sourceFingerprint,
    };
    expect(
      validateCurrentReleaseBinding({
        current,
        mode: 'full',
        localGate,
      }),
    ).toBe(current.releaseMessage);
    expect(() =>
      validateCurrentReleaseBinding({
        current,
        mode: 'full',
        localGate: {
          ...localGate,
          sourceFingerprint: 'sha256:changed-source',
        },
      }),
    ).toThrow('not bound to this sealed local release');
    expect(() =>
      validateCurrentReleaseBinding({
        current: {
          ...current,
          artifactFingerprint: 'sha256:older-artifact',
        },
        mode: 'full',
        localGate,
      }),
    ).toThrow('fingerprints do not match');
  });

  it('requires exact HTTPS origin, one canary credential, and a real site key for final AI verification', () => {
    expect(
      validateDeploymentEnvironment({
        environment: {
          CALRICULA_RELEASE_BASE_URL:
            'https://calricula-demo.example',
          CALRICULA_AI_SESSION_COOKIE: SESSION_COOKIE,
        },
        wranglerConfig: CONFIG,
        siteKey: '0x4AAAAAAReleaseVerificationSiteKey',
      }),
    ).toMatchObject({
      aiEnabled: true,
      baseOrigin: 'https://calricula-demo.example',
      canaryCredentialKind: 'existing-session-cookie',
      models: MODELS,
    });
    expect(() =>
      validateDeploymentEnvironment({
        environment: {
          CALRICULA_RELEASE_BASE_URL:
            'https://calricula-demo.example',
          CALRICULA_AI_SESSION_COOKIE: SESSION_COOKIE,
        },
        wranglerConfig: CONFIG,
        siteKey: 'replace-with-a-turnstile-site-key',
      }),
    ).toThrow('real non-placeholder');
    expect(() =>
      validateDeploymentEnvironment({
        environment: {
          CALRICULA_RELEASE_BASE_URL: 'http://remote.example',
          CALRICULA_AI_SESSION_COOKIE: SESSION_COOKIE,
        },
        wranglerConfig: CONFIG,
        siteKey: '0x4AAAAAAReleaseVerificationSiteKey',
      }),
    ).toThrow();
  });

  it('allows a credential-free stage but not a credential-free final verification', () => {
    expect(
      validateDeploymentEnvironment({
        environment: {
          CALRICULA_RELEASE_BASE_URL:
            'https://calricula-demo.example',
        },
        wranglerConfig: CONFIG,
        siteKey: '0x4AAAAAAReleaseVerificationSiteKey',
        requireCanaryCredential: false,
      }),
    ).toMatchObject({
      aiEnabled: true,
      baseOrigin: 'https://calricula-demo.example',
      canaryCredentialKind: null,
    });
    expect(() =>
      validateDeploymentEnvironment({
        environment: {
          CALRICULA_RELEASE_BASE_URL:
            'https://calricula-demo.example',
        },
        wranglerConfig: CONFIG,
        siteKey: '0x4AAAAAAReleaseVerificationSiteKey',
      }),
    ).toThrow('exactly one AI canary credential');
  });

  it('allows only an explicit AI-disabled first hostname bootstrap without a site key', () => {
    expect(
      validateDeploymentEnvironment({
        environment: {},
        wranglerConfig: BOOTSTRAP_CONFIG,
        siteKey: '',
        bootstrap: true,
        requireBaseOrigin: false,
      }),
    ).toEqual({ aiEnabled: false, baseOrigin: '' });
    expect(() =>
      validateDeploymentEnvironment({
        environment: {},
        wranglerConfig: CONFIG,
        siteKey: '',
        bootstrap: true,
        requireBaseOrigin: false,
      }),
    ).toThrow('AI_ENABLED=false');
  });

  it('rejects mutated artifacts and site-key mismatches after a gate seal', () => {
    const evidence = {
      schemaVersion: 3,
      mode: 'full',
      completedAt: '2026-07-30T06:00:00.000Z',
      sourceFingerprint: 'sha256:source',
      toolVersions: TOOL_VERSIONS,
      artifacts: ARTIFACTS,
      publication: PUBLICATION,
      git: GIT,
      turnstileSiteKeyDigest: 'sha256:site-key',
      steps: RELEASE_GATE_STEPS,
    };
    const options = {
      evidence,
      mode: 'full',
      sourceFingerprint: 'sha256:source',
      toolVersions: TOOL_VERSIONS,
      artifacts: ARTIFACTS,
      publication: PUBLICATION,
      git: GIT,
      turnstileSiteKeyDigest: 'sha256:site-key',
      now: Date.parse('2026-07-30T06:30:00.000Z'),
    };
    expect(validateLocalGateEvidence(options)).toBe(evidence);
    expect(() =>
      validateLocalGateEvidence({
        ...options,
        artifacts: {
          ...ARTIFACTS,
          fingerprint: 'sha256:mutated',
        },
      }),
    ).toThrow(ReleaseDeploymentError);
    expect(() =>
      validateLocalGateEvidence({
        ...options,
        publication: {
          ...PUBLICATION,
          fingerprint: 'sha256:mutated-publication',
        },
      }),
    ).toThrow(ReleaseDeploymentError);
    expect(() =>
      validateLocalGateEvidence({
        ...options,
        turnstileSiteKeyDigest: 'sha256:different-site-key',
      }),
    ).toThrow(ReleaseDeploymentError);
  });
});
