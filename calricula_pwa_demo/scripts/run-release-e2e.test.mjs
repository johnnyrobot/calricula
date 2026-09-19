import { describe, expect, it } from 'vitest';

import {
  STATIC_PROJECTS,
  WRANGLER_ISOLATED_TEST,
  WRANGLER_PROJECTS,
  browserProjectWorkers,
  releaseE2eArguments,
  releaseE2eEnvironment,
} from './run-release-e2e.mjs';

describe('local release E2E topology', () => {
  it('covers every configured browser project exactly once', () => {
    const projects = [...WRANGLER_PROJECTS, ...STATIC_PROJECTS];
    expect(new Set(projects).size).toBe(5);
    expect(projects.sort()).toEqual(
      [
        'chromium',
        'firefox',
        'mobile-chromium',
        'mobile-webkit',
        'webkit',
      ].sort(),
    );
  });

  it('removes stale remote-target and server-reuse overrides', () => {
    const environment = releaseE2eEnvironment(
      {
        PLAYWRIGHT_BASE_URL: 'https://stale.example',
        PLAYWRIGHT_REUSE_SERVER: 'true',
      },
      'static',
    );
    expect(environment.PLAYWRIGHT_BASE_URL).toBeUndefined();
    expect(environment.PLAYWRIGHT_REUSE_SERVER).toBeUndefined();
    expect(environment.CALRICULA_E2E_SERVER).toBe('static');
    expect(environment.PLAYWRIGHT_PORT).toBe('4178');
  });

  it('isolates the network-disruptive service-worker reload check', () => {
    expect(
      releaseE2eArguments(WRANGLER_PROJECTS, {
        grepInvert: WRANGLER_ISOLATED_TEST,
      }),
    ).toEqual([
      'test',
      '--project=chromium',
      '--project=firefox',
      '--project=mobile-chromium',
      '--grep-invert',
      WRANGLER_ISOLATED_TEST,
    ]);
    expect(
      releaseE2eArguments(WRANGLER_PROJECTS, {
        grep: WRANGLER_ISOLATED_TEST,
        workers: 1,
      }),
    ).toEqual([
      'test',
      '--project=chromium',
      '--project=firefox',
      '--project=mobile-chromium',
      '--grep',
      WRANGLER_ISOLATED_TEST,
      '--workers=1',
    ]);
  });

  it('caps browser workers below Playwright\'s CPU default', () => {
    // Playwright defaults to ceil(cores / 2). That heuristic assumes one
    // lightweight browser; this suite drives three, and each spawns several
    // processes. On a 12-core machine the default (6) pushed load average past
    // 21 and stretched the slowest test to 24.1s against a 30s timeout, so a
    // different test timed out on roughly half of all runs.
    expect(browserProjectWorkers(12)).toBe(4);
    expect(browserProjectWorkers(12)).toBeLessThan(Math.ceil(12 / 2));
  });

  it('keeps at least two workers on small machines and scales on large ones', () => {
    expect(browserProjectWorkers(1)).toBe(2);
    expect(browserProjectWorkers(2)).toBe(2);
    expect(browserProjectWorkers(4)).toBe(2);
    expect(browserProjectWorkers(32)).toBe(10);
  });

  it('applies the cap to both browser groups but never to the serial check', () => {
    expect(
      releaseE2eArguments(WRANGLER_PROJECTS, {
        workers: browserProjectWorkers(12),
      }),
    ).toContain('--workers=4');
    expect(
      releaseE2eArguments(STATIC_PROJECTS, {
        workers: browserProjectWorkers(12),
      }),
    ).toContain('--workers=4');
    expect(
      releaseE2eArguments(WRANGLER_PROJECTS, { workers: 1 }),
    ).toContain('--workers=1');
  });

  it('denies release secrets to browser and server children', () => {
    // These children run third-party code (browsers, wrangler, npm). The
    // release invariant is that no spawn site forwards a provider or
    // Cloudflare credential, so this environment is built from the shared
    // scrubber rather than a raw copy of process.env.
    const scrubbed = releaseE2eEnvironment({
      OPENROUTER_API_KEY: 'sk-or-v1-must-not-reach-a-browser',
      TURNSTILE_SECRET_KEY: 'turnstile-secret',
      AI_SESSION_HMAC_SECRET: 'hmac-secret',
      CLOUDFLARE_API_TOKEN: 'cloudflare-token',
      CALRICULA_SECRETS_FILE: '/tmp/secrets',
      PATH: '/usr/bin',
    });
    for (const key of [
      'OPENROUTER_API_KEY',
      'TURNSTILE_SECRET_KEY',
      'AI_SESSION_HMAC_SECRET',
      'CLOUDFLARE_API_TOKEN',
      'CALRICULA_SECRETS_FILE',
    ]) {
      expect(scrubbed).not.toHaveProperty(key);
    }
    // The child still needs an ordinary working environment.
    expect(scrubbed.PATH).toBe('/usr/bin');
    expect(scrubbed.CALRICULA_E2E_SERVER).toBe('wrangler');
  });
});
