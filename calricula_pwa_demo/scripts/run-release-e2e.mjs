import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

import { childEnvironment } from './child-environment.mjs';

/**
 * Worker count for the browser project groups.
 *
 * Playwright defaults to `ceil(cores / 2)`, a heuristic that assumes one
 * relatively light browser. This suite drives three projects per group and each
 * Playwright worker runs a full browser that itself spawns several processes,
 * so that default oversubscribes the machine: on a 12-core host it produced a
 * load average above 21 and stretched the slowest test from 7.8s (serial) to
 * 24.1s, against a 30s default timeout. With only ~6s of headroom, ordinary
 * scheduling jitter pushed some test past the deadline on roughly half of all
 * runs — and which test failed was effectively random.
 *
 * Dividing by three instead keeps the slowest test near 10s. This is a capacity
 * fix, not a deadline extension: no timeout is raised, no test is retried, and
 * the tests do the same work as before.
 */
export function browserProjectWorkers(coreCount = cpus().length) {
  const cores = Number.isFinite(coreCount) && coreCount > 0 ? coreCount : 2;
  return Math.max(2, Math.floor(cores / 3));
}

export const WRANGLER_PROJECTS = [
  'chromium',
  'firefox',
  'mobile-chromium',
];
export const STATIC_PROJECTS = ['webkit', 'mobile-webkit'];
export const WRANGLER_ISOLATED_TEST =
  'the service worker reloads a local course route while offline';

export function releaseE2eEnvironment(
  source = process.env,
  server = 'wrangler',
) {
  // Browsers and `wrangler dev` are third-party children. They never need a
  // provider or Cloudflare credential, so the shared scrubber builds their
  // environment; a raw copy of process.env would forward whatever the operator
  // happened to have exported.
  const environment = childEnvironment(source);
  delete environment.PLAYWRIGHT_BASE_URL;
  delete environment.PLAYWRIGHT_REUSE_SERVER;
  environment.CALRICULA_E2E_SERVER = server;
  environment.PLAYWRIGHT_PORT = server === 'static' ? '4178' : '4177';
  return environment;
}

function playwrightExecutable() {
  return path.join(
    process.cwd(),
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'playwright.cmd' : 'playwright',
  );
}

export function releaseE2eArguments(
  projects,
  {
    grep,
    grepInvert,
    workers,
  } = {},
) {
  const args = [
    'test',
    ...projects.map((project) => `--project=${project}`),
  ];
  if (grep) args.push('--grep', grep);
  if (grepInvert) args.push('--grep-invert', grepInvert);
  if (workers) args.push(`--workers=${workers}`);
  return args;
}

async function runProjects(projects, server, options) {
  const args = releaseE2eArguments(projects, options);
  const child = spawn(playwrightExecutable(), args, {
    cwd: process.cwd(),
    env: releaseE2eEnvironment(process.env, server),
    stdio: 'inherit',
  });
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0) {
    throw new Error(
      `${server} E2E projects failed with exit code ${exitCode}.`,
    );
  }
}

export async function runReleaseE2e() {
  console.log(
    '[release-e2e] Running Chromium, Firefox, and mobile Chromium through local Wrangler.',
  );
  await runProjects(WRANGLER_PROJECTS, 'wrangler', {
    grepInvert: WRANGLER_ISOLATED_TEST,
    workers: browserProjectWorkers(),
  });
  console.log(
    '[release-e2e] Running the offline service-worker reload check through a fresh, serial Wrangler lifecycle.',
  );
  await runProjects(WRANGLER_PROJECTS, 'wrangler', {
    grep: WRANGLER_ISOLATED_TEST,
    workers: 1,
  });
  console.log(
    '[release-e2e] Running WebKit and mobile WebKit through the deterministic static export server.',
  );
  await runProjects(STATIC_PROJECTS, 'static', {
    workers: browserProjectWorkers(),
  });
}

const entryPoint = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : '';
if (import.meta.url === entryPoint) {
  runReleaseE2e().catch((error) => {
    console.error(
      `[release-e2e] ${
        error instanceof Error ? error.message : 'E2E run failed.'
      }`,
    );
    process.exitCode = 1;
  });
}
