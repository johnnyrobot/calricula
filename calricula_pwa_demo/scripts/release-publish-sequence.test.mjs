import { describe, expect, it, vi } from 'vitest';

import {
  ReleaseDeploymentError,
  promoteUploadedVersion,
  publishWorker,
} from './release-deploy.mjs';

const VERSION_ID = '22222222-2222-4222-8222-222222222222';
const DEPLOYMENT_ID = '33333333-3333-4333-8333-333333333333';
const ATTEMPT_ID = '55555555-5555-4555-8555-555555555555';
const OUTPUT_PATH = '/tmp/calricula-wrangler-output.json';

const UPLOAD_ENTRY = JSON.stringify({
  type: 'version-upload',
  version: 1,
  worker_name: 'calricula-demo',
  version_id: VERSION_ID,
  preview_url: 'https://22222222-calricula-demo.owner.workers.dev',
});
const DEPLOY_ENTRY = JSON.stringify({
  type: 'version-deploy',
  version: 1,
  worker_name: 'calricula-demo',
  deployment_id: DEPLOYMENT_ID,
  version_traffic: {},
});

const SEALED_PUBLICATION = {
  configPath: '/tmp/calricula-sealed/wrangler.jsonc',
  fingerprint: 'sha256:publication',
};

/**
 * Records the order of every outside effect, so a test can assert what
 * happened *after* an upload as precisely as whether it happened at all. The
 * publish sequence's whole purpose is ordering: nothing may run before the
 * two preconditions, and the deploy may not run before the pending record has
 * been told which version was uploaded.
 */
function publisherDouble({
  exitCodes = [0, 0],
  output = `${UPLOAD_ENTRY}\n${DEPLOY_ENTRY}`,
  assertReleaseInputsTracked = async () => undefined,
  assertOfficialEnvironment = () => undefined,
} = {}) {
  const log = [];
  const remaining = [...exitCodes];
  const publisher = {
    assertReleaseInputsTracked: async () => {
      log.push('assert-inputs');
      return assertReleaseInputsTracked();
    },
    assertOfficialEnvironment: (environment) => {
      log.push('assert-environment');
      return assertOfficialEnvironment(environment);
    },
    childEnvironment: () => ({ CLOUDFLARE_API_TOKEN: 'token' }),
    executable: () => '/repo/node_modules/.bin/wrangler',
    run: vi.fn(async ({ args }) => {
      log.push(`run:${args[1]}`);
      return remaining.shift() ?? 0;
    }),
    readOutput: async () => {
      log.push('read-output');
      return output;
    },
  };
  return { log, publisher };
}

function lease() {
  return { setPublisherPid: vi.fn() };
}

describe('publishWorker sequencing', () => {
  it('uploads, records the uploaded version, then deploys it', async () => {
    const { log, publisher } = publisherDouble();
    const onUploaded = vi.fn(async () => {
      log.push('record-pending');
    });

    const receipt = await publishWorker(
      {
        attemptId: ATTEMPT_ID,
        lifecycleLease: lease(),
        message: 'calricula-full',
        onUploaded,
        outputPath: OUTPUT_PATH,
        sealedPublication: SEALED_PUBLICATION,
      },
      publisher,
    );

    expect(log).toEqual([
      'assert-inputs',
      'assert-environment',
      'run:upload',
      'read-output',
      'record-pending',
      'run:deploy',
      'read-output',
    ]);
    expect(receipt).toEqual({
      origin: 'https://calricula-demo.owner.workers.dev',
      previewOrigin: 'https://22222222-calricula-demo.owner.workers.dev',
      versionId: VERSION_ID,
      deploymentId: DEPLOYMENT_ID,
    });
  });

  it('tells the pending record the version id before anything is deployed', async () => {
    const { publisher } = publisherDouble();
    const onUploaded = vi.fn(async () => undefined);

    await publishWorker(
      {
        attemptId: ATTEMPT_ID,
        lifecycleLease: lease(),
        message: 'calricula-full',
        onUploaded,
        outputPath: OUTPUT_PATH,
        sealedPublication: SEALED_PUBLICATION,
      },
      publisher,
    );

    expect(onUploaded).toHaveBeenCalledWith({
      origin: 'https://calricula-demo.owner.workers.dev',
      previewOrigin: 'https://22222222-calricula-demo.owner.workers.dev',
      versionId: VERSION_ID,
    });
    expect(onUploaded.mock.invocationCallOrder[0]).toBeLessThan(
      publisher.run.mock.invocationCallOrder[1],
    );
  });

  it('never uploads when the release inputs are not tracked', async () => {
    const { log, publisher } = publisherDouble({
      assertReleaseInputsTracked: async () => {
        throw new Error('Release input is untracked: scripts/scratch.mjs');
      },
    });

    await expect(
      publishWorker(
        {
          attemptId: ATTEMPT_ID,
          lifecycleLease: lease(),
          message: 'calricula-full',
          onUploaded: vi.fn(),
          outputPath: OUTPUT_PATH,
          sealedPublication: SEALED_PUBLICATION,
        },
        publisher,
      ),
    ).rejects.toThrow('untracked');

    expect(log).toEqual(['assert-inputs']);
    expect(publisher.run).not.toHaveBeenCalled();
  });

  it('never uploads from an unofficial Cloudflare environment', async () => {
    const { log, publisher } = publisherDouble({
      assertOfficialEnvironment: () => {
        throw new Error('CLOUDFLARE_API_TOKEN is not the official credential.');
      },
    });

    await expect(
      publishWorker(
        {
          attemptId: ATTEMPT_ID,
          lifecycleLease: lease(),
          message: 'calricula-full',
          onUploaded: vi.fn(),
          outputPath: OUTPUT_PATH,
          sealedPublication: SEALED_PUBLICATION,
        },
        publisher,
      ),
    ).rejects.toThrow('official credential');

    expect(log).toEqual(['assert-inputs', 'assert-environment']);
    expect(publisher.run).not.toHaveBeenCalled();
  });

  it('stops before the deploy when the upload exits non-zero', async () => {
    const { publisher } = publisherDouble({ exitCodes: [1, 0] });
    const onUploaded = vi.fn();

    await expect(
      publishWorker(
        {
          attemptId: ATTEMPT_ID,
          lifecycleLease: lease(),
          message: 'calricula-full',
          onUploaded,
          outputPath: OUTPUT_PATH,
          sealedPublication: SEALED_PUBLICATION,
        },
        publisher,
      ),
    ).rejects.toThrow(ReleaseDeploymentError);

    expect(publisher.run).toHaveBeenCalledTimes(1);
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it('reports a failed deploy after the version is already uploaded', async () => {
    const { publisher } = publisherDouble({ exitCodes: [0, 1] });
    const onUploaded = vi.fn(async () => undefined);

    await expect(
      publishWorker(
        {
          attemptId: ATTEMPT_ID,
          lifecycleLease: lease(),
          message: 'calricula-full',
          onUploaded,
          outputPath: OUTPUT_PATH,
          sealedPublication: SEALED_PUBLICATION,
        },
        publisher,
      ),
    ).rejects.toThrow('Wrangler versions deploy exited with code 1.');

    // The upload happened and was recorded. That is what makes the attempt
    // recoverable rather than lost, so it must not be rolled back here.
    expect(onUploaded).toHaveBeenCalledTimes(1);
  });

  it('does not deploy when recording the uploaded version fails', async () => {
    const { publisher } = publisherDouble();
    const onUploaded = vi.fn(async () => {
      throw new Error('Pending record could not be written.');
    });

    await expect(
      publishWorker(
        {
          attemptId: ATTEMPT_ID,
          lifecycleLease: lease(),
          message: 'calricula-full',
          onUploaded,
          outputPath: OUTPUT_PATH,
          sealedPublication: SEALED_PUBLICATION,
        },
        publisher,
      ),
    ).rejects.toThrow('Pending record could not be written.');

    expect(publisher.run).toHaveBeenCalledTimes(1);
  });

  it('points Wrangler at the attempt output file for both commands', async () => {
    const { publisher } = publisherDouble();

    await publishWorker(
      {
        attemptId: ATTEMPT_ID,
        lifecycleLease: lease(),
        message: 'calricula-full',
        onUploaded: vi.fn(async () => undefined),
        outputPath: OUTPUT_PATH,
        sealedPublication: SEALED_PUBLICATION,
      },
      publisher,
    );

    for (const call of publisher.run.mock.calls) {
      expect(call[0].environment.WRANGLER_OUTPUT_FILE_PATH).toBe(OUTPUT_PATH);
      expect(call[0].executable).toBe('/repo/node_modules/.bin/wrangler');
    }
  });
});

describe('promoteUploadedVersion sequencing', () => {
  it('deploys the already-uploaded version without uploading again', async () => {
    const { log, publisher } = publisherDouble();

    const deployment = await promoteUploadedVersion(
      {
        lifecycleLease: lease(),
        message: 'calricula-full',
        outputPath: OUTPUT_PATH,
        sealedPublication: SEALED_PUBLICATION,
        versionId: VERSION_ID,
      },
      publisher,
    );

    expect(log).toEqual([
      'assert-inputs',
      'assert-environment',
      'run:deploy',
      'read-output',
    ]);
    expect(deployment).toEqual({
      deploymentId: DEPLOYMENT_ID,
      versionId: VERSION_ID,
    });
  });

  it('refuses to promote from an untracked working tree', async () => {
    const { publisher } = publisherDouble({
      assertReleaseInputsTracked: async () => {
        throw new Error('Release input is untracked: scripts/scratch.mjs');
      },
    });

    await expect(
      promoteUploadedVersion(
        {
          lifecycleLease: lease(),
          message: 'calricula-full',
          outputPath: OUTPUT_PATH,
          sealedPublication: SEALED_PUBLICATION,
          versionId: VERSION_ID,
        },
        publisher,
      ),
    ).rejects.toThrow('untracked');

    expect(publisher.run).not.toHaveBeenCalled();
  });

  it('reports a non-zero deploy rather than claiming the version is live', async () => {
    const { publisher } = publisherDouble({ exitCodes: [125] });

    await expect(
      promoteUploadedVersion(
        {
          lifecycleLease: lease(),
          message: 'calricula-full',
          outputPath: OUTPUT_PATH,
          sealedPublication: SEALED_PUBLICATION,
          versionId: VERSION_ID,
        },
        publisher,
      ),
    ).rejects.toThrow('Wrangler versions deploy exited with code 125.');
  });

  it('rejects output that does not prove the requested version was deployed', async () => {
    const { publisher } = publisherDouble({ output: UPLOAD_ENTRY });

    await expect(
      promoteUploadedVersion(
        {
          lifecycleLease: lease(),
          message: 'calricula-full',
          outputPath: OUTPUT_PATH,
          sealedPublication: SEALED_PUBLICATION,
          versionId: VERSION_ID,
        },
        publisher,
      ),
    ).rejects.toThrow('unambiguous');
  });
});
