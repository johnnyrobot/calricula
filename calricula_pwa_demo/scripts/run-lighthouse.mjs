import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

import { chromium } from '@playwright/test';

import { childEnvironment } from './child-environment.mjs';
import { withLocalProduction } from './local-production.mjs';
import { normalizeProductionOrigin } from './verify-production.mjs';

const DEFAULT_REPORT_PATH = path.resolve(
  process.cwd(),
  '.release-artifacts',
  'lighthouse',
  'summary.json',
);
const DEFAULT_THRESHOLDS_PATH = path.resolve(
  process.cwd(),
  'lighthouse.thresholds.json',
);
const CATEGORIES = [
  'performance',
  'accessibility',
  'best-practices',
  'seo',
];
const AUDITS = {
  'largest-contentful-paint': {
    label: 'LCP',
    unit: 'ms',
  },
  'cumulative-layout-shift': {
    label: 'CLS',
    unit: '',
  },
  'total-blocking-time': {
    label: 'TBT',
    unit: 'ms',
  },
};
const SUMMARY_MAX_AGE_MS = 24 * 60 * 60 * 1_000;

export class LighthouseAssertionError extends Error {}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateThresholds(thresholds) {
  if (
    !isRecord(thresholds) ||
    thresholds.formFactor !== 'mobile' ||
    !Array.isArray(thresholds.routes) ||
    thresholds.routes.length < 2 ||
    thresholds.routes.length > 5 ||
    new Set(thresholds.routes).size !== thresholds.routes.length ||
    thresholds.routes.some(
      (route) =>
        typeof route !== 'string' ||
        !route.startsWith('/') ||
        route.includes('?') ||
        route.includes('#'),
    ) ||
    !isRecord(thresholds.categories) ||
    !isRecord(thresholds.audits)
  ) {
    throw new LighthouseAssertionError(
      'Lighthouse thresholds must define mobile, two to five unique routes, categories, and audits.',
    );
  }
  for (const category of CATEGORIES) {
    const threshold = thresholds.categories[category];
    if (
      typeof threshold !== 'number' ||
      !Number.isFinite(threshold) ||
      threshold < 0 ||
      threshold > 1
    ) {
      throw new LighthouseAssertionError(
        `Lighthouse threshold for ${category} must be from 0 to 1.`,
      );
    }
  }
  if (thresholds.categories.accessibility !== 1) {
    throw new LighthouseAssertionError(
      'The Lighthouse accessibility threshold must remain exactly 1.0.',
    );
  }
  if (thresholds.categories.performance < 0.9) {
    throw new LighthouseAssertionError(
      'The Lighthouse performance threshold must remain at least 0.90.',
    );
  }
  for (const audit of Object.keys(AUDITS)) {
    const threshold = thresholds.audits[audit];
    if (
      typeof threshold !== 'number' ||
      !Number.isFinite(threshold) ||
      threshold < 0
    ) {
      throw new LighthouseAssertionError(
        `Lighthouse maximum for ${audit} must be a non-negative number.`,
      );
    }
  }
  if (thresholds.audits['largest-contentful-paint'] > 2_500) {
    throw new LighthouseAssertionError(
      'The Lighthouse LCP maximum must remain at or below 2500 ms.',
    );
  }
  if (thresholds.audits['cumulative-layout-shift'] > 0.1) {
    throw new LighthouseAssertionError(
      'The Lighthouse CLS maximum must remain at or below 0.1.',
    );
  }
  return thresholds;
}

export function assertLighthouseReport(
  report,
  thresholds,
  route = '/',
  options = {},
) {
  const checkedThresholds = validateThresholds(thresholds);
  if (!isRecord(report) || report.runtimeError) {
    throw new LighthouseAssertionError(
      `Lighthouse report for ${route} contains a runtime error or invalid shape.`,
    );
  }
  if (options.expectedUrl) {
    let expected;
    let actual;
    try {
      expected = new URL(options.expectedUrl).href;
      actual = new URL(
        report.finalDisplayedUrl ?? report.finalUrl,
      ).href;
    } catch {
      throw new LighthouseAssertionError(
        `Lighthouse report for ${route} has no valid final URL.`,
      );
    }
    if (actual !== expected) {
      throw new LighthouseAssertionError(
        `Lighthouse report for ${route} audited the wrong final URL.`,
      );
    }
  }

  const categories = {};
  const audits = {};
  const failures = [];
  for (const category of CATEGORIES) {
    const score = report.categories?.[category]?.score;
    if (
      typeof score !== 'number' ||
      !Number.isFinite(score) ||
      score < 0 ||
      score > 1
    ) {
      failures.push(`${category} has no valid score`);
      continue;
    }
    categories[category] = score;
    if (score < checkedThresholds.categories[category]) {
      failures.push(
        `${category} ${score.toFixed(2)} is below ${checkedThresholds.categories[
          category
        ].toFixed(2)}`,
      );
    }
  }
  for (const [audit, definition] of Object.entries(AUDITS)) {
    const value = report.audits?.[audit]?.numericValue;
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < 0
    ) {
      failures.push(`${definition.label} has no valid numeric value`);
      continue;
    }
    audits[audit] = value;
    if (value > checkedThresholds.audits[audit]) {
      failures.push(
        `${definition.label} ${value.toFixed(2)}${definition.unit} exceeds ${checkedThresholds.audits[
          audit
        ].toFixed(2)}${definition.unit}`,
      );
    }
  }
  if (failures.length > 0) {
    throw new LighthouseAssertionError(
      `Lighthouse thresholds failed for ${route}: ${failures.join('; ')}.`,
    );
  }
  return { audits, categories, route };
}

export function assertLighthouseSummary(
  summary,
  thresholds,
  options = {},
) {
  const checkedThresholds = validateThresholds(thresholds);
  if (
    !isRecord(summary) ||
    summary.schemaVersion !== 1 ||
    summary.formFactor !== checkedThresholds.formFactor ||
    !Array.isArray(summary.results)
  ) {
    throw new LighthouseAssertionError(
      'Lighthouse summary has an invalid shape or form factor.',
    );
  }
  const collectedAt = Date.parse(summary.collectedAt ?? '');
  if (
    Number.isNaN(collectedAt) ||
    collectedAt > (options.now ?? Date.now()) + 5 * 60 * 1_000 ||
    (options.now ?? Date.now()) - collectedAt >
      (options.maximumAgeMs ?? SUMMARY_MAX_AGE_MS)
  ) {
    throw new LighthouseAssertionError(
      'Lighthouse summary is stale or has an invalid timestamp.',
    );
  }
  const summaryOrigin = normalizeProductionOrigin(summary.origin);
  if (
    options.expectedOrigin &&
    summaryOrigin !== normalizeProductionOrigin(options.expectedOrigin)
  ) {
    throw new LighthouseAssertionError(
      'Lighthouse summary belongs to a different origin.',
    );
  }
  const routes = summary.results.map((result) => result?.route);
  if (
    routes.length !== checkedThresholds.routes.length ||
    routes.some(
      (route, index) => route !== checkedThresholds.routes[index],
    )
  ) {
    throw new LighthouseAssertionError(
      'Lighthouse summary does not cover the committed route order.',
    );
  }
  for (const result of summary.results) {
    const expectedUrl = `${summaryOrigin}${result.route}`;
    if (result.url !== expectedUrl) {
      throw new LighthouseAssertionError(
        `Lighthouse summary for ${result.route} belongs to a different URL.`,
      );
    }
    assertLighthouseReport(
      {
        categories: Object.fromEntries(
          CATEGORIES.map((category) => [
            category,
            { score: result.categories?.[category] },
          ]),
        ),
        audits: Object.fromEntries(
          Object.keys(AUDITS).map((audit) => [
            audit,
            { numericValue: result.audits?.[audit] },
          ]),
        ),
      },
      checkedThresholds,
      result.route,
    );
  }
  return summary.results;
}

async function loadJson(filePath, label) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    throw new LighthouseAssertionError(`${label} is not valid JSON.`);
  }
}

function lighthouseExecutable() {
  return path.join(
    process.cwd(),
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'lighthouse.cmd' : 'lighthouse',
  );
}

/**
 * Build the environment for the Lighthouse child, which in turn launches
 * headless Chrome — the widest third-party surface in the release path. It gets
 * the same scrubbed environment as every other release child, plus the two keys
 * Lighthouse itself needs. `CHROME_PATH` is not a secret and survives the
 * scrub; the fallback is Playwright's bundled browser.
 */
export function lighthouseChildEnvironment(source, fallbackChromePath) {
  return {
    ...childEnvironment(source),
    CHROME_PATH: source.CHROME_PATH || fallbackChromePath,
    CI: '1',
  };
}

async function runCommand(command, args, env) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  const errors = [];
  child.stderr?.on('data', (chunk) => {
    errors.push(String(chunk));
    if (errors.length > 40) errors.shift();
  });
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0) {
    const details = errors.join('').trim();
    throw new LighthouseAssertionError(
      `Lighthouse exited with code ${exitCode}${
        details ? `: ${details.slice(-2_000)}` : '.'
      }`,
    );
  }
}

function routeFileName(route) {
  if (route === '/') return 'landing';
  return route.replace(/^\/|\/$/g, '').replace(/[^a-z0-9]+/gi, '-');
}

async function collectAndAssert(origin, reportPath, thresholdsPath) {
  const normalizedOrigin = normalizeProductionOrigin(origin);
  const thresholds = validateThresholds(
    await loadJson(thresholdsPath, 'Lighthouse thresholds'),
  );
  const rawDirectory = path.join(path.dirname(reportPath), 'raw');
  await mkdir(rawDirectory, { recursive: true });

  const results = [];
  for (const route of thresholds.routes) {
    const rawReportPath = path.join(
      rawDirectory,
      `${routeFileName(route)}.json`,
    );
    await runCommand(
      lighthouseExecutable(),
      [
        `${normalizedOrigin}${route}`,
        '--quiet',
        '--form-factor=mobile',
        '--only-categories=performance,accessibility,best-practices,seo',
        '--output=json',
        `--output-path=${rawReportPath}`,
        '--max-wait-for-load=45000',
        '--chrome-flags=--headless=new --no-sandbox --disable-dev-shm-usage',
      ],
      lighthouseChildEnvironment(process.env, chromium.executablePath()),
    );
    const expectedUrl = `${normalizedOrigin}${route}`;
    const result = assertLighthouseReport(
      await loadJson(rawReportPath, `Lighthouse report for ${route}`),
      thresholds,
      route,
      { expectedUrl },
    );
    results.push({
      ...result,
      url: expectedUrl,
      rawReport: path.relative(process.cwd(), rawReportPath),
    });
  }

  const summary = {
    schemaVersion: 1,
    collectedAt: new Date().toISOString(),
    origin: normalizedOrigin,
    formFactor: thresholds.formFactor,
    results,
  };
  await writeFile(reportPath, `${JSON.stringify(summary, null, 2)}\n`);
  return results;
}

function parseArguments(argv) {
  let local = false;
  let assertOnly = false;
  let baseUrl = process.env.CALRICULA_RELEASE_BASE_URL ?? '';
  let baseUrlExplicit = false;
  let reportPath = DEFAULT_REPORT_PATH;
  let thresholdsPath = DEFAULT_THRESHOLDS_PATH;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--local') {
      local = true;
      continue;
    }
    if (argument === '--assert-only') {
      assertOnly = true;
      continue;
    }
    if (argument === '--base-url') {
      baseUrl = argv[index + 1] ?? '';
      baseUrlExplicit = true;
      index += 1;
      continue;
    }
    if (argument === '--report') {
      reportPath = path.resolve(argv[index + 1] ?? '');
      index += 1;
      continue;
    }
    if (argument === '--thresholds') {
      thresholdsPath = path.resolve(argv[index + 1] ?? '');
      index += 1;
      continue;
    }
    throw new LighthouseAssertionError(`Unknown argument: ${argument}`);
  }
  if (local && baseUrlExplicit) {
    throw new LighthouseAssertionError(
      'Use either --local or --base-url, not both.',
    );
  }
  if (assertOnly && local) {
    throw new LighthouseAssertionError(
      '--assert-only cannot start a local server.',
    );
  }
  if (assertOnly && !baseUrl) {
    throw new LighthouseAssertionError(
      '--assert-only requires --base-url or CALRICULA_RELEASE_BASE_URL.',
    );
  }
  if (local) baseUrl = '';
  return {
    assertOnly,
    baseUrl,
    local,
    reportPath,
    thresholdsPath,
  };
}

function scoreSummary(results) {
  return results
    .map(
      (result) =>
        `${result.route} performance=${result.categories.performance.toFixed(
          2,
        )}, accessibility=${result.categories.accessibility.toFixed(
          2,
        )}, LCP=${Math.round(
          result.audits['largest-contentful-paint'],
        )}ms, CLS=${result.audits[
          'cumulative-layout-shift'
        ].toFixed(3)}, TBT=${Math.round(
          result.audits['total-blocking-time'],
        )}ms`,
    )
    .join(' | ');
}

export async function runLighthouse(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  let results;
  if (options.assertOnly) {
    const [summary, thresholds] = await Promise.all([
      loadJson(options.reportPath, 'Lighthouse summary'),
      loadJson(options.thresholdsPath, 'Lighthouse thresholds'),
    ]);
    results = assertLighthouseSummary(summary, thresholds, {
      expectedOrigin: options.baseUrl,
    });
  } else if (options.local) {
    results = await withLocalProduction((origin) =>
      collectAndAssert(
        origin,
        options.reportPath,
        options.thresholdsPath,
      ),
    );
  } else {
    results = await collectAndAssert(
      options.baseUrl,
      options.reportPath,
      options.thresholdsPath,
    );
  }
  console.log(
    `[lighthouse] Mobile thresholds passed: ${scoreSummary(results)}.`,
  );
}

const entryPoint = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : '';
if (import.meta.url === entryPoint) {
  runLighthouse().catch((error) => {
    console.error(
      `[lighthouse] ${
        error instanceof Error ? error.message : 'Audit failed.'
      }`,
    );
    process.exitCode = 1;
  });
}
