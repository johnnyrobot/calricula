import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  CloudflareTargetError,
  acquireReleaseLifecycleLock,
  assertReleaseLifecycleLease,
  assertOfficialCloudflareEnvironment,
  confirmBootstrapNonexistence,
  confirmReleaseVersionAbsent,
  parseDeployOutput,
  parseDeploymentStatus,
  parseReleaseVersionAbsence,
  parseVersionDeployOutput,
  parseVersionUploadOutput,
  parseVersionProof,
  parseWranglerIdentity,
  reconcilePublishedVersion,
  resolveReleaseVersionByMessage,
  resolveCloudflareTargetSelection,
  validateOwnershipRecord,
  wranglerReadOnlyEnvironment,
} from './cloudflare-release-target.mjs';

const ACCOUNT_ID = '0123456789abcdef0123456789abcdef';
const DEPLOYMENT_ID = '11111111-1111-4111-8111-111111111111';
const VERSION_ID = '22222222-2222-4222-8222-222222222222';
const ATTEMPT_ID = '55555555-5555-4555-8555-555555555555';

function result(payload, exitCode = 0, stderr = '') {
  return {
    exitCode,
    stderr,
    stdout:
      typeof payload === 'string' ? payload : JSON.stringify(payload),
  };
}

describe('Cloudflare release target evidence', () => {
  it('blocks a live publisher and recovers its mkdir lease after SIGKILL', async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), 'calricula-release-lock-'),
    );
    const lockPath = path.join(directory, 'publisher.lock');
    try {
      const publisherLease = await acquireReleaseLifecycleLock({
        host: 'release-test-host',
        isProcessAlive: () => true,
        lockPath,
        pid: 424_242,
      });
      await publisherLease.setPublisherPid(424_243);
      await expect(
        acquireReleaseLifecycleLock({
          host: 'release-test-host',
          isProcessAlive: (pid) => pid === 424_243,
          lockPath,
          pid: 434_343,
        }),
      ).rejects.toThrow('still active');

      const recovered = await acquireReleaseLifecycleLock({
        host: 'release-test-host',
        isProcessAlive: () => false,
        lockPath,
        pid: 434_343,
      });
      await expect(
        assertReleaseLifecycleLease(recovered),
      ).resolves.toBe(true);
      await recovered.release();
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  // The scrub, including which Cloudflare credentials survive for Wrangler, is
  // owned by `wranglerChildEnvironment` and asserted in
  // child-environment.test.mjs. This asserts only the read-only flags added here.
  it('marks read-only Wrangler children as non-interactive', () => {
    expect(
      wranglerReadOnlyEnvironment({
        CLOUDFLARE_API_TOKEN: 'cloudflare-token',
        SAFE_WRANGLER_CONTEXT: 'kept',
      }),
    ).toEqual({
      CI: '1',
      NO_COLOR: '1',
      CLOUDFLARE_API_TOKEN: 'cloudflare-token',
      SAFE_WRANGLER_CONTEXT: 'kept',
    });
  });

  it('rejects ambient Wrangler API and environment selectors', () => {
    expect(assertOfficialCloudflareEnvironment({})).toBe(true);
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
      expect(() =>
        assertOfficialCloudflareEnvironment({
          [name]: 'unexpected',
        }),
      ).toThrow(`${name} must be unset`);
    }
  });

  it('requires environment-only account selection and the exact effective Worker name', () => {
    const environment = { CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID };
    expect(
      resolveCloudflareTargetSelection({
        wranglerConfig: `{
          // "name": "comment-decoy",
          "name": "calricula-demo"
        }`,
        environment,
      }),
    ).toEqual({
      accountId: ACCOUNT_ID,
      workerName: 'calricula-demo',
    });
    expect(() =>
      resolveCloudflareTargetSelection({
        wranglerConfig: `{
          "name": "calricula-demo",
          "account_id": "${ACCOUNT_ID}"
        }`,
        environment,
      }),
    ).toThrow('must not set account_id');
    expect(() =>
      resolveCloudflareTargetSelection({
        wranglerConfig: '{"name":"different-worker"}',
        environment,
      }),
    ).toThrow('exactly calricula-demo');
  });

  it('requires the explicitly selected authenticated account', () => {
    expect(
      parseWranglerIdentity(
        result({
          loggedIn: true,
          accounts: [{ id: ACCOUNT_ID, name: 'Expected account' }],
        }),
        ACCOUNT_ID,
      ),
    ).toEqual({ accountId: ACCOUNT_ID });
    expect(() =>
      parseWranglerIdentity(
        result({ loggedIn: true, accounts: [] }),
        ACCOUNT_ID,
      ),
    ).toThrow('not authenticated');
    expect(() =>
      parseWranglerIdentity(
        result({ loggedIn: true, accounts: [] }),
        '',
      ),
    ).toThrow('CLOUDFLARE_ACCOUNT_ID');
  });

  it('allows bootstrap only after exact Cloudflare 10007 nonexistence', () => {
    expect(
      confirmBootstrapNonexistence(
        result('', 1, 'Cloudflare API error [code: 10007]'),
      ),
    ).toEqual({ exists: false, errorCode: 10007 });
    expect(() =>
      confirmBootstrapNonexistence(result({ versions: [] })),
    ).toThrow('already exists');
    expect(() =>
      confirmBootstrapNonexistence(
        result('', 1, 'authentication failed [code: 9109]'),
      ),
    ).toThrow('not confirmed');
  });

  it('requires one unambiguous 100 percent current version', () => {
    expect(
      parseDeploymentStatus(
        result({
          id: DEPLOYMENT_ID,
          created_on: '2026-07-30T06:00:00.000Z',
          versions: [{ version_id: VERSION_ID, percentage: 100 }],
        }),
      ),
    ).toEqual({
      createdOn: '2026-07-30T06:00:00.000Z',
      deploymentId: DEPLOYMENT_ID,
      versionId: VERSION_ID,
    });
    expect(() =>
      parseDeploymentStatus(
        result({
          id: DEPLOYMENT_ID,
          created_on: '2026-07-30T06:00:00.000Z',
          versions: [
            { version_id: VERSION_ID, percentage: 50 },
            {
              version_id: '33333333-3333-4333-8333-333333333333',
              percentage: 50,
            },
          ],
        }),
      ),
    ).toThrow('unambiguous');
  });

  it('reconciles Wrangler deploy output with the exact target and message', async () => {
    expect(
      parseDeployOutput(
        JSON.stringify({
          type: 'deploy',
          version: 1,
          worker_name: 'calricula-demo',
          version_id: VERSION_ID,
          targets: [
            { url: 'https://calricula-demo.owner.workers.dev' },
          ],
        }),
        'calricula-demo',
      ),
    ).toEqual({
      origin: 'https://calricula-demo.owner.workers.dev',
      versionId: VERSION_ID,
    });
    const versionOutput = [
      JSON.stringify({
        type: 'version-upload',
        version: 1,
        worker_name: 'calricula-demo',
        version_id: VERSION_ID,
        preview_url:
          'https://22222222-calricula-demo.owner.workers.dev',
      }),
      JSON.stringify({
        type: 'version-deploy',
        version: 1,
        worker_name: 'calricula-demo',
        deployment_id: DEPLOYMENT_ID,
        version_traffic: {},
      }),
    ].join('\n');
    expect(
      parseVersionUploadOutput(versionOutput, 'calricula-demo'),
    ).toEqual({
      origin: 'https://calricula-demo.owner.workers.dev',
      previewOrigin:
        'https://22222222-calricula-demo.owner.workers.dev',
      versionId: VERSION_ID,
    });
    expect(
      parseVersionDeployOutput(
        versionOutput,
        'calricula-demo',
        VERSION_ID,
      ),
    ).toEqual({
      deploymentId: DEPLOYMENT_ID,
      versionId: VERSION_ID,
    });
    expect(() =>
      parseVersionUploadOutput(
        `${versionOutput}\n${versionOutput.split('\n')[0]}`,
        'calricula-demo',
      ),
    ).toThrow('unambiguous');
    expect(
      parseVersionProof(
        result([
          {
            id: VERSION_ID,
            metadata: { source: 'wrangler' },
            annotations: { 'workers/message': 'calricula-full-proof' },
          },
        ]),
        VERSION_ID,
        'calricula-full-proof',
      ),
    ).toEqual({ versionId: VERSION_ID });
    await expect(
      resolveReleaseVersionByMessage({
        workerName: 'calricula-demo',
        releaseMessage: 'calricula-full-proof',
        runReadOnly: async () =>
          result([
            {
              id: VERSION_ID,
              metadata: { source: 'wrangler' },
              annotations: {
                'workers/message': 'calricula-full-proof',
              },
            },
          ]),
      }),
    ).resolves.toEqual({ versionId: VERSION_ID });
    await expect(
      resolveReleaseVersionByMessage({
        workerName: 'calricula-demo',
        releaseMessage: 'calricula-full-proof',
        runReadOnly: async () =>
          result([
            {
              id: VERSION_ID,
              metadata: { source: 'wrangler' },
              annotations: {
                'workers/message': 'calricula-full-proof',
              },
            },
            {
              id: '33333333-3333-4333-8333-333333333333',
              metadata: { source: 'wrangler' },
              annotations: {
                'workers/message': 'calricula-full-proof',
              },
            },
          ]),
      }),
    ).rejects.toThrow('unambiguous');
    expect(
      parseReleaseVersionAbsence(
        result([
          {
            id: VERSION_ID,
            annotations: {
              'workers/message': 'a-different-release',
            },
          },
        ]),
        'calricula-full-proof',
      ),
    ).toEqual({
      absent: true,
      releaseMessage: 'calricula-full-proof',
    });
    expect(() =>
      parseReleaseVersionAbsence(
        result([
          {
            id: VERSION_ID,
            annotations: {
              'workers/message': 'calricula-full-proof',
            },
          },
        ]),
        'calricula-full-proof',
      ),
    ).toThrow('already contains a version');
  });

  it('proves cancellation absence against the exact Worker version list', async () => {
    const calls = [];
    await expect(
      confirmReleaseVersionAbsent({
        workerName: 'calricula-demo',
        releaseMessage: 'calricula-full-proof',
        runReadOnly: async (args) => {
          calls.push(args);
          return result([]);
        },
      }),
    ).resolves.toEqual({
      absent: true,
      releaseMessage: 'calricula-full-proof',
    });
    expect(calls).toEqual([
      [
        'versions',
        'list',
        '--name',
        'calricula-demo',
        '--json',
      ],
    ]);
  });

  it('refuses an unexpected existing or changed Worker version', () => {
    const identity = { accountId: ACCOUNT_ID };
    const ownership = {
      schemaVersion: 1,
      attemptId: ATTEMPT_ID,
      accountId: ACCOUNT_ID,
      workerName: 'calricula-demo',
      origin: 'https://calricula-demo.owner.workers.dev',
      bootstrapDeploymentId: DEPLOYMENT_ID,
      bootstrapVersionId: VERSION_ID,
    };
    const current = {
      schemaVersion: 1,
      attemptId: ATTEMPT_ID,
      accountId: ACCOUNT_ID,
      workerName: 'calricula-demo',
      origin: ownership.origin,
      deploymentId: DEPLOYMENT_ID,
      versionId: VERSION_ID,
    };
    expect(
      validateOwnershipRecord({
        ownership,
        current,
        identity,
        workerName: 'calricula-demo',
        origin: ownership.origin,
        deployment: {
          deploymentId: DEPLOYMENT_ID,
          versionId: VERSION_ID,
        },
      }),
    ).toEqual({ current, ownership });
    expect(() =>
      validateOwnershipRecord({
        ownership,
        current,
        identity,
        workerName: 'calricula-demo',
        origin: ownership.origin,
        deployment: {
          deploymentId: DEPLOYMENT_ID,
          versionId:
            '33333333-3333-4333-8333-333333333333',
        },
      }),
    ).toThrow(CloudflareTargetError);
  });

  it('polls boundedly until the exact published version and message are visible', async () => {
    const calls = [];
    const responses = [
      result('', 1, 'temporary read error'),
      result({
        id: DEPLOYMENT_ID,
        created_on: '2026-07-30T06:00:00.000Z',
        versions: [{ version_id: VERSION_ID, percentage: 100 }],
      }),
      result([
        {
          id: VERSION_ID,
          metadata: { source: 'wrangler' },
          annotations: { 'workers/message': 'calricula-full-proof' },
        },
      ]),
    ];
    await expect(
      reconcilePublishedVersion({
        workerName: 'calricula-demo',
        versionId: VERSION_ID,
        releaseMessage: 'calricula-full-proof',
        attempts: 2,
        intervalMs: 0,
        runReadOnly: async (args) => {
          calls.push(args);
          return responses.shift();
        },
        wait: async () => {},
      }),
    ).resolves.toMatchObject({ versionId: VERSION_ID });
    expect(calls).toHaveLength(3);
  });

  it('recovers an uncertain publish by proving the new current version and exact message', async () => {
    const previousVersion =
      '33333333-3333-4333-8333-333333333333';
    const responses = [
      result({
        id: DEPLOYMENT_ID,
        created_on: '2026-07-30T06:00:00.000Z',
        versions: [{ version_id: VERSION_ID, percentage: 100 }],
      }),
      result([
        {
          id: VERSION_ID,
          metadata: { source: 'wrangler' },
          annotations: {
            'workers/message': 'calricula-full-proof',
          },
        },
      ]),
    ];
    await expect(
      reconcilePublishedVersion({
        workerName: 'calricula-demo',
        versionId: null,
        releaseMessage: 'calricula-full-proof',
        previous: {
          deploymentId:
            '44444444-4444-4444-8444-444444444444',
          versionId: previousVersion,
        },
        attempts: 1,
        intervalMs: 0,
        runReadOnly: async () => responses.shift(),
        wait: async () => {},
      }),
    ).resolves.toMatchObject({ versionId: VERSION_ID });
  });
});
