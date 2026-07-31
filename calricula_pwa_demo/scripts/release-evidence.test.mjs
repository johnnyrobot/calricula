import { describe, expect, it } from 'vitest';

import {
  ReleaseEvidenceError,
  aiCheckEnvironment,
  deriveToolVersions,
  parseWranglerReleaseConfig,
  releaseEvidenceToolEnvironment,
  verifyReleaseEvidence,
} from './release-evidence.mjs';

const MODELS = ['provider/alpha:free', 'provider/beta:free'];
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
        pass: { plain: true, structured: true, rate: 1 },
        latencyMs: { plain: 100, structured: 200 },
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
    expect(releaseEvidenceToolEnvironment(source)).toEqual({
      SAFE_CONTEXT: 'kept',
    });
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
