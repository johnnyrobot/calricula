import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

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
  const environment = { ...source };
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
  await runProjects(STATIC_PROJECTS, 'static');
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
