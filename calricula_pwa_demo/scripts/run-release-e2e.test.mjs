import { describe, expect, it } from 'vitest';

import {
  STATIC_PROJECTS,
  WRANGLER_ISOLATED_TEST,
  WRANGLER_PROJECTS,
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
});
