import { describe, expect, it } from 'vitest';

import {
  LighthouseAssertionError,
  assertLighthouseReport,
  assertLighthouseSummary,
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
