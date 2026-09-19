import { describe, expect, it } from 'vitest';

import { CHILD_SECRET_KEYS } from './child-environment.mjs';
import {
  LighthouseAssertionError,
  assertLighthouseReport,
  assertLighthouseSummary,
  lighthouseChildEnvironment,
} from './run-lighthouse.mjs';

const thresholds = {
  formFactor: 'mobile',
  routes: ['/', '/dashboard/', '/courses/'],
  categories: {
    performance: 0.9,
    accessibility: 1,
    'best-practices': 0.9,
    seo: 0.9,
  },
  audits: {
    'largest-contentful-paint': 2_500,
    'cumulative-layout-shift': 0.1,
    'total-blocking-time': 300,
  },
};

function report(scores = {}, metrics = {}) {
  return {
    categories: {
      performance: { score: scores.performance ?? 0.92 },
      accessibility: { score: scores.accessibility ?? 1 },
      'best-practices': {
        score: scores['best-practices'] ?? 0.95,
      },
      seo: { score: scores.seo ?? 1 },
    },
    audits: {
      'largest-contentful-paint': {
        numericValue: metrics.lcp ?? 2_100,
      },
      'cumulative-layout-shift': {
        numericValue: metrics.cls ?? 0.05,
      },
      'total-blocking-time': {
        numericValue: metrics.tbt ?? 180,
      },
    },
  };
}

describe('Lighthouse threshold assertions', () => {
  it('returns per-route scores and metrics when every threshold passes', () => {
    expect(assertLighthouseReport(report(), thresholds, '/')).toEqual({
      route: '/',
      categories: {
        performance: 0.92,
        accessibility: 1,
        'best-practices': 0.95,
        seo: 1,
      },
      audits: {
        'largest-contentful-paint': 2_100,
        'cumulative-layout-shift': 0.05,
        'total-blocking-time': 180,
      },
    });
  });

  it('reports category and web-vital failures for the affected route', () => {
    expect(() =>
      assertLighthouseReport(
        report(
          { performance: 0.89, accessibility: 0.99 },
          { lcp: 2_501, cls: 0.101, tbt: 301 },
        ),
        thresholds,
        '/dashboard/',
      ),
    ).toThrow(
      'Lighthouse thresholds failed for /dashboard/: performance 0.89 is below 0.90; accessibility 0.99 is below 1.00; LCP 2501.00ms exceeds 2500.00ms; CLS 0.10 exceeds 0.10; TBT 301.00ms exceeds 300.00ms',
    );
  });

  it('rejects runtime errors, missing metrics, and weakened hard thresholds', () => {
    expect(() =>
      assertLighthouseReport(
        { runtimeError: { code: 'ERRORED_DOCUMENT' } },
        thresholds,
      ),
    ).toThrow(LighthouseAssertionError);
    expect(() =>
      assertLighthouseReport({ categories: {} }, thresholds),
    ).toThrow('has no valid score');
    expect(() =>
      assertLighthouseReport(report(), {
        ...thresholds,
        categories: {
          ...thresholds.categories,
          accessibility: 0.99,
        },
      }),
    ).toThrow('accessibility threshold must remain exactly 1.0');
  });

  it('requires the committed mobile route order in a saved summary', () => {
    const result = assertLighthouseReport(report(), thresholds, '/');
    const summary = {
      schemaVersion: 1,
      formFactor: 'mobile',
      collectedAt: new Date().toISOString(),
      origin: 'https://calricula-demo.example',
      results: thresholds.routes.map((route) => ({
        ...result,
        route,
        url: `https://calricula-demo.example${route}`,
      })),
    };
    expect(
      assertLighthouseSummary(summary, thresholds, {
        expectedOrigin: 'https://calricula-demo.example',
      }),
    ).toHaveLength(3);
    expect(() =>
      assertLighthouseSummary(
        { ...summary, results: summary.results.slice(0, 2) },
        thresholds,
      ),
    ).toThrow('committed route order');
    expect(() =>
      assertLighthouseSummary(summary, thresholds, {
        expectedOrigin: 'https://different.example',
      }),
    ).toThrow('different origin');
    expect(() =>
      assertLighthouseSummary(
        {
          ...summary,
          collectedAt: '2020-01-01T00:00:00.000Z',
        },
        thresholds,
      ),
    ).toThrow('stale');
  });
});

describe('Lighthouse child environment', () => {
  const source = {
    PATH: '/usr/bin',
    CHROME_PATH: '/opt/chrome',
    OPENROUTER_API_KEY: 'sk-or-v1-not-a-real-key',
    CLOUDFLARE_API_TOKEN: 'cf-token',
    AI_SESSION_HMAC_SECRET: 'hmac',
  };

  it('denies every release secret to headless Chrome', () => {
    const environment = lighthouseChildEnvironment(source, '/fallback/chrome');

    for (const name of CHILD_SECRET_KEYS) {
      expect(environment, `${name} must not reach Chrome`).not.toHaveProperty(
        name,
      );
    }
  });

  it('keeps what Lighthouse needs to run', () => {
    const environment = lighthouseChildEnvironment(source, '/fallback/chrome');

    expect(environment.PATH).toBe('/usr/bin');
    expect(environment.CHROME_PATH).toBe('/opt/chrome');
    expect(environment.CI).toBe('1');
  });

  it('falls back to the bundled browser when CHROME_PATH is unset', () => {
    const withoutChrome = { ...source };
    delete withoutChrome.CHROME_PATH;

    expect(
      lighthouseChildEnvironment(withoutChrome, '/fallback/chrome').CHROME_PATH,
    ).toBe('/fallback/chrome');
  });
});
