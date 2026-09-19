import { describe, expect, it } from 'vitest';

import { EVAL_FIXTURES } from './ai-eval-fixtures.mjs';
import {
  ReleaseEvidenceError,
  aiCheckEnvironment,
  deriveToolVersions,
  parseWranglerReleaseConfig,
  verifyReleaseEvidence,
} from './release-evidence.mjs';

const MODELS = ['provider/alpha:free', 'provider/beta:free'];
const EVAL_TASKS = EVAL_FIXTURES.map((fixture) => fixture.task);

function passingByTask() {
  return Object.fromEntries(EVAL_TASKS.map((task) => [task, true]));
}
const FINGERPRINT = 'sha256:release-source';
const CREDENTIAL_FINGERPRINT = `sha256:${'c'.repeat(64)}`;
const NOW = Date.parse('2026-07-30T06:00:00.000Z');
const TOOL_VERSIONS = {
  node: '22.23.0',
  npm: '10.9.8',
  lighthouse: '13.3.0',
  playwright: '1.62.0',
  wrangler: '4.115.0',
};
const WRANGLER_CONFIG = `{
  "vars": {
    "AI_ENABLED": "true",
    "APP_ORIGIN": "https://calricula-demo.example",
    "OPENROUTER_FREE_MODELS": "${MODELS.join(',')}"
  }
}`;

function envelope(check, result, overrides = {}) {
  return {
    schemaVersion: 2,
    check,
    recordedAt: '2026-07-30T05:30:00.000Z',
    sourceFingerprint: FINGERPRINT,
    toolVersions: TOOL_VERSIONS,
    credentialFingerprint:
      check === 'canary' ? null : CREDENTIAL_FINGERPRINT,
    result,
    ...overrides,
  };
}

function records() {
  return {
    discover: envelope('discover', {
      selectionBasis: 'configured-eval-approved',
      wranglerPreferredModelsValue: MODELS.join(','),
      selectedOrderedChain: [...MODELS, 'openrouter/free'],
      keyStatus: {
        authenticated: true,
        accountTier: 'free',
        documentedFreeModelLimits: {
          requestsPerMinute: 20,
          requestsPerDay: 50,
        },
        freeModelDailyRemaining: 'not-exposed-by-key-endpoint',
        keySpendLimitStatus: 'not-configured',
        keySpendLimitReset: null,
        keyExpirationStatus: 'not-configured',
      },
    }),
    evaluate: envelope(
      'evaluate',
      MODELS.map((model) => ({
        model,
        pass: { rate: 1, byTask: passingByTask() },
        checks: Object.fromEntries(
          EVAL_TASKS.map((task) => [
            task,
            [{ id: 'exact-keys', workerEnforced: true, passed: true }],
          ]),
        ),
        latencyMs: {
          byTask: Object.fromEntries(EVAL_TASKS.map((task) => [task, 100])),
          mean: 100,
        },
      })),
    ),
    canary: envelope('canary', {
      baseOrigin: 'https://calricula-demo.example',
      health: { status: 'ok' },
      session: { status: 'ok' },
      generations: [
        { task: 'chat', model: MODELS[0] },
        { task: 'slos', model: MODELS[1] },
      ],
    }),
  };
}

function verifyOptions(phase, evidence = records()) {
  return {
    records: evidence,
    phase,
    sourceFingerprint: FINGERPRINT,
    wranglerConfig: WRANGLER_CONFIG,
    now: NOW,
    baseOrigin: 'https://calricula-demo.example',
    toolVersions: TOOL_VERSIONS,
    expectedCredentialFingerprint: CREDENTIAL_FINGERPRINT,
  };
}

describe('release AI evidence', () => {
  it('exposes credentials only to the AI check that consumes them', () => {
    const source = {
      CALRICULA_AI_SESSION_COOKIE: 'session-cookie',
      CALRICULA_TURNSTILE_TOKEN: 'turnstile-token',
      CLOUDFLARE_API_TOKEN: 'cloudflare-token',
      OPENROUTER_API_KEY: 'provider-secret',
      SAFE_CONTEXT: 'kept',
      TURNSTILE_SECRET_KEY: 'turnstile-secret',
    };
    expect(aiCheckEnvironment('discover', source)).toEqual({
      OPENROUTER_API_KEY: 'provider-secret',
      SAFE_CONTEXT: 'kept',
    });
    expect(aiCheckEnvironment('canary', source)).toEqual({
      CALRICULA_AI_SESSION_COOKIE: 'session-cookie',
      CALRICULA_TURNSTILE_TOKEN: 'turnstile-token',
      SAFE_CONTEXT: 'kept',
    });
  });

  it('accepts fresh source- and tool-bound predeploy and complete evidence', () => {
    expect(verifyReleaseEvidence(verifyOptions('predeploy'))).toEqual({
      appOrigin: 'https://calricula-demo.example',
      models: MODELS,
      phase: 'predeploy',
    });
    expect(verifyReleaseEvidence(verifyOptions('complete'))).toEqual({
      appOrigin: 'https://calricula-demo.example',
      models: MODELS,
      phase: 'complete',
    });
    expect(
      verifyReleaseEvidence({
        ...verifyOptions('complete'),
        canaryNotBefore: '2026-07-30T05:00:00.000Z',
      }),
    ).toMatchObject({ phase: 'complete' });
    expect(() =>
      verifyReleaseEvidence({
        ...verifyOptions('complete'),
        canaryNotBefore: '2026-07-30T05:45:00.000Z',
      }),
    ).toThrow('after the current deployment');
  });

  it('rejects stale, source-mismatched, and tool-mismatched evidence', () => {
    const stale = records();
    stale.discover.recordedAt = '2026-07-28T05:00:00.000Z';
    expect(() =>
      verifyReleaseEvidence(verifyOptions('predeploy', stale)),
    ).toThrow('stale');

    const changedSource = records();
    changedSource.evaluate.sourceFingerprint = 'sha256:different';
    expect(() =>
      verifyReleaseEvidence(verifyOptions('predeploy', changedSource)),
    ).toThrow('different source');

    const changedTool = records();
    changedTool.canary.toolVersions = {
      ...TOOL_VERSIONS,
      lighthouse: '13.2.0',
    };
    expect(() =>
      verifyReleaseEvidence(verifyOptions('complete', changedTool)),
    ).toThrow('different source');
  });

  it('requires exactly two distinct configured exact free model IDs', () => {
    expect(parseWranglerReleaseConfig(WRANGLER_CONFIG).configuredModels).toEqual(
      MODELS,
    );
    for (const models of [
      'provider/alpha:free',
      'provider/alpha:free,provider/alpha:free',
      'provider/alpha,provider/beta:free',
      'provider/alpha:free,openrouter/free',
    ]) {
      expect(() =>
        parseWranglerReleaseConfig(
          WRANGLER_CONFIG.replace(MODELS.join(','), models),
        ),
      ).toThrow('exactly two distinct');
    }
  });

  it('binds discovery and evaluation to the credential deployed by Wrangler', () => {
    const mismatch = records();
    mismatch.evaluate.credentialFingerprint = `sha256:${'d'.repeat(64)}`;
    expect(() =>
      verifyReleaseEvidence(verifyOptions('predeploy', mismatch)),
    ).toThrow('deployed OpenRouter credential');
    expect(() =>
      verifyReleaseEvidence({
        ...verifyOptions('predeploy'),
        expectedCredentialFingerprint: `sha256:${'e'.repeat(64)}`,
      }),
    ).toThrow('deployed OpenRouter credential');
  });

  it('requires every AI task route to pass for every configured model', () => {
    // A model that fails one route reaches users as UPSTREAM_INVALID_RESPONSE
    // on that feature, so the gate must not accept a partial pass.
    for (const task of EVAL_TASKS) {
      const oneRouteFailing = records();
      oneRouteFailing.evaluate.result[0].pass.byTask[task] = false;
      oneRouteFailing.evaluate.result[0].pass.rate = 6 / 7;
      expect(() =>
        verifyReleaseEvidence(verifyOptions('predeploy', oneRouteFailing)),
      ).toThrow('does not fully pass');
    }

    const ratePadded = records();
    ratePadded.evaluate.result[0].pass.byTask['top-code'] = false;
    // A rate of 1 must not rescue a byTask verdict that says otherwise.
    expect(() =>
      verifyReleaseEvidence(verifyOptions('predeploy', ratePadded)),
    ).toThrow('does not fully pass');
  });

  it('rejects evaluation evidence that omits a task route', () => {
    const missingRoute = records();
    delete missingRoute.evaluate.result[0].pass.byTask['compliance-explanation'];
    expect(() =>
      verifyReleaseEvidence(verifyOptions('predeploy', missingRoute)),
    ).toThrow(ReleaseEvidenceError);

    const supersededShape = records();
    supersededShape.evaluate.result[0].pass = {
      plain: true,
      structured: true,
      rate: 1,
    };
    expect(() =>
      verifyReleaseEvidence(verifyOptions('predeploy', supersededShape)),
    ).toThrow('invalid shape');
  });

  it('records no model-generated content in evaluation evidence', () => {
    const serialized = JSON.stringify(records().evaluate);
    // Only task names, check IDs, booleans, latencies, and model IDs.
    for (const task of EVAL_TASKS) {
      expect(serialized).toContain(task);
    }
    expect(serialized).not.toMatch(/[.!?]\s|\bthe\b/i);
  });

  it('requires safe authenticated key-tier evidence from discovery', () => {
    const missing = records();
    delete missing.discover.result.keyStatus;
    expect(() =>
      verifyReleaseEvidence(verifyOptions('predeploy', missing)),
    ).toThrow('authenticated key status');

    const wrongTierLimit = records();
    wrongTierLimit.discover.result.keyStatus.documentedFreeModelLimits.requestsPerDay =
      1_000;
    expect(() =>
      verifyReleaseEvidence(verifyOptions('predeploy', wrongTierLimit)),
    ).toThrow('authenticated key status');

    const leakingIdentity = records();
    leakingIdentity.discover.result.keyStatus.label =
      'private OpenRouter key label';
    expect(() =>
      verifyReleaseEvidence(verifyOptions('predeploy', leakingIdentity)),
    ).toThrow('authenticated key status');
  });

  it('derives exact recorded tool versions from pinned package metadata', () => {
    expect(
      deriveToolVersions(
        {
          packageManager: 'npm@10.9.8',
          devDependencies: {
            lighthouse: '13.3.0',
            '@playwright/test': '1.62.0',
            wrangler: '4.115.0',
          },
        },
        '22.23.0',
      ),
    ).toEqual(TOOL_VERSIONS);
    expect(() =>
      deriveToolVersions({
        packageManager: 'npm@10',
        devDependencies: {},
      }),
    ).toThrow(ReleaseEvidenceError);
  });
});
