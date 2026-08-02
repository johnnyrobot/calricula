import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  collectDeployableFiles,
  isClassifiedDeployableAsset,
  scanFilesForSecrets,
} from './static-asset-validation.mjs';

const CLOUDFLARE_FILE_LIMIT = 20_000;
const CLOUDFLARE_ASSET_SIZE_LIMIT = 25 * 1024 * 1024;
const CLOUDFLARE_HEADERS_RULE_LIMIT = 100;
const CLOUDFLARE_HEADERS_LINE_LIMIT = 2_000;
const outputDirectory = path.resolve(process.cwd(), 'out');
const failures = [];

const requiredFiles = [
  'index.html',
  '404.html',
  '_headers',
  'manifest.webmanifest',
  'offline.html',
  'connectivity.txt',
  'sw.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];

let files;
try {
  files = await collectDeployableFiles(outputDirectory);
} catch (error) {
  console.error(
    `[build-validator] Cannot inspect ${outputDirectory}: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exit(1);
}

const filePaths = new Set(files.map((file) => file.relativePath));

for (const requiredFile of requiredFiles) {
  if (!filePaths.has(requiredFile)) {
    failures.push(`Missing required build artifact: ${requiredFile}`);
  }
}

if (files.length > CLOUDFLARE_FILE_LIMIT) {
  failures.push(
    `Static export has ${files.length} files; Cloudflare permits ${CLOUDFLARE_FILE_LIMIT}.`,
  );
}

for (const file of files) {
  if (file.size > CLOUDFLARE_ASSET_SIZE_LIMIT) {
    failures.push(
      `${file.relativePath} is ${(file.size / 1024 / 1024).toFixed(
        2,
      )} MiB; Cloudflare permits at most 25 MiB per asset.`,
    );
  }

  if (file.relativePath.endsWith('.map')) {
    failures.push(`Source map must not be deployed: ${file.relativePath}`);
  }

  if (!isClassifiedDeployableAsset(file.relativePath)) {
    failures.push(
      `Unclassified artifact must not be deployed: ${file.relativePath}`,
    );
  }

  if (
    file.relativePath === 'openrouter-llms-full.txt' ||
    file.relativePath.startsWith('docs/')
  ) {
    failures.push(`Excluded documentation was copied into out: ${file.relativePath}`);
  }

}

failures.push(...(await scanFilesForSecrets(files)));

if (filePaths.has('sw.js')) {
  const serviceWorker = await readFile(
    path.join(outputDirectory, 'sw.js'),
    'utf8',
  );

  if (/url\s*:\s*["']\/?api\//.test(serviceWorker)) {
    failures.push('Service-worker precache manifest contains an /api route.');
  }

  if (serviceWorker.includes('connectivity.txt')) {
    failures.push(
      'Service-worker precache manifest contains the network-only connectivity probe.',
    );
  }

  if (/\{url:["'][^"']+\.html["'],revision:/.test(serviceWorker)) {
    failures.push(
      'Service-worker precache manifest contains a redirecting .html asset instead of its canonical Cloudflare route.',
    );
  }

  if (!serviceWorker.includes('SKIP_WAITING')) {
    failures.push(
      'Service worker does not expose the user-controlled SKIP_WAITING update path.',
    );
  }
}

if (filePaths.has('manifest.webmanifest')) {
  try {
    const manifest = JSON.parse(
      await readFile(
        path.join(outputDirectory, 'manifest.webmanifest'),
        'utf8',
      ),
    );
    const iconSources = new Set(
      Array.isArray(manifest.icons)
        ? manifest.icons.map((icon) => icon?.src).filter(Boolean)
        : [],
    );

    for (const icon of [
      '/icons/icon-192.png',
      '/icons/icon-512.png',
      '/icons/icon-maskable-512.png',
    ]) {
      if (!iconSources.has(icon)) {
        failures.push(`Manifest does not reference ${icon}.`);
      }
    }

    if (manifest.start_url !== '/dashboard/') {
      failures.push(
        `Manifest start_url must be /dashboard/, received ${String(
          manifest.start_url,
        )}.`,
      );
    }
  } catch (error) {
    failures.push(
      `manifest.webmanifest is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

if (filePaths.has('_headers')) {
  const headers = await readFile(path.join(outputDirectory, '_headers'), 'utf8');
  const headerLines = headers.split(/\r?\n/);
  const headerRuleCount = headerLines.filter(
    (line) =>
      line.trim().length > 0 &&
      !line.startsWith(' ') &&
      !line.startsWith('\t') &&
      !line.trimStart().startsWith('#'),
  ).length;

  if (headerRuleCount > CLOUDFLARE_HEADERS_RULE_LIMIT) {
    failures.push(
      `_headers has ${headerRuleCount} rules; Cloudflare permits ${CLOUDFLARE_HEADERS_RULE_LIMIT}.`,
    );
  }
  for (const [index, line] of headerLines.entries()) {
    if (line.length > CLOUDFLARE_HEADERS_LINE_LIMIT) {
      failures.push(
        `_headers line ${index + 1} has ${line.length} characters; Cloudflare permits ${CLOUDFLARE_HEADERS_LINE_LIMIT}.`,
      );
    }
  }

  const contentSecurityPolicy =
    headerLines
      .find((line) => line.trimStart().startsWith('Content-Security-Policy:')) ??
    '';

  for (const directive of [
    "connect-src 'self' https://challenges.cloudflare.com",
    'frame-src https://challenges.cloudflare.com',
    "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
    "frame-ancestors 'none'",
  ]) {
    if (!contentSecurityPolicy.includes(directive)) {
      failures.push(`Content Security Policy is missing: ${directive}`);
    }
  }

  if (
    !headers.includes('/connectivity.txt') ||
    !headers.includes('Cache-Control: no-cache, no-store, must-revalidate')
  ) {
    failures.push(
      'The network-only connectivity probe must be served with no-store cache headers.',
    );
  }
}

const largestAsset = files.reduce(
  (largest, file) => (file.size > largest.size ? file : largest),
  { relativePath: '(none)', size: 0 },
);
const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

console.log(
  `[build-validator] ${files.length}/${CLOUDFLARE_FILE_LIMIT} files, ${(
    totalBytes /
    1024 /
    1024
  ).toFixed(2)} MiB total, largest ${largestAsset.relativePath} (${(
    largestAsset.size /
    1024 /
    1024
  ).toFixed(2)} MiB).`,
);

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`[build-validator] ${failure}`);
  }
  process.exit(1);
}

console.log('[build-validator] Cloudflare asset and secret checks passed.');
