import { pathToFileURL } from 'node:url';
import process from 'node:process';

import { withLocalProduction } from './local-production.mjs';
import { findSecrets } from './secret-scan.mjs';

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_TEXT_BYTES = 4 * 1024 * 1024;
const MAX_ASSET_BYTES = 25 * 1024 * 1024;
const MAX_LINKED_ASSETS = 100;

export const HTML_ROUTES = [
  '/',
  '/dashboard/',
  '/courses/',
  '/courses/new/',
  '/courses/view/?id=release-verification-course',
  '/courses/edit/?id=release-verification-course',
  '/courses/compare/?source=release-verification-course&target=release-verification-course-v2',
  '/programs/',
  '/programs/new/',
  '/programs/view/?id=release-verification-program',
  '/programs/edit/?id=release-verification-program',
  '/approvals/',
  '/settings/',
  '/offline/',
  '/accessibility/',
];

export class ProductionVerificationError extends Error {}

export function normalizeProductionOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new ProductionVerificationError('Provide a valid production origin.');
  }
  const local =
    url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new ProductionVerificationError(
      'Production origin must use HTTPS unless it targets localhost.',
    );
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== '/' && url.pathname !== '')
  ) {
    throw new ProductionVerificationError(
      'Production origin must not contain credentials, a path, query, or hash.',
    );
  }
  return url.origin;
}

async function readBoundedBytes(response, maximumBytes) {
  const declaredLength = Number(response.headers.get('content-length'));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > maximumBytes
  ) {
    throw new ProductionVerificationError(
      `${new URL(response.url).pathname} exceeds its response-size limit.`,
    );
  }
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      throw new ProductionVerificationError(
        `${new URL(response.url).pathname} exceeds its response-size limit.`,
      );
    }
    chunks.push(value);
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

async function readText(response, maximumBytes = MAX_TEXT_BYTES) {
  return new TextDecoder().decode(
    await readBoundedBytes(response, maximumBytes),
  );
}

function requireNoSecretMaterial(text, label) {
  const [name] = findSecrets(text);
  if (name) {
    throw new ProductionVerificationError(
      `${label} exposes a recognizable ${name}.`,
    );
  }
}

function requireStatus(response, status, label) {
  if (response.status !== status) {
    throw new ProductionVerificationError(
      `${label} returned HTTP ${response.status}; expected ${status}.`,
    );
  }
}

function requireMime(response, expected, label) {
  const contentType =
    response.headers
      .get('content-type')
      ?.split(';', 1)[0]
      .trim()
      .toLowerCase() ?? '';
  if (!expected.includes(contentType)) {
    throw new ProductionVerificationError(
      `${label} returned an unexpected Content-Type.`,
    );
  }
}

async function request(fetchFn, url) {
  try {
    return await fetchFn(url, {
      method: 'GET',
      headers: {
        accept: '*/*',
        'user-agent': 'Calricula release verifier',
      },
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new ProductionVerificationError(
      `GET ${new URL(url).pathname} could not be completed.`,
    );
  }
}

function requireSecurityHeaders(response, label) {
  const exactHeaders = {
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-origin',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'strict-transport-security': 'max-age=31536000; includeSubDomains',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
  };
  for (const [name, expected] of Object.entries(exactHeaders)) {
    if (response.headers.get(name) !== expected) {
      throw new ProductionVerificationError(
        `${label} is missing the required ${name} header.`,
      );
    }
  }

  const policy = response.headers.get('content-security-policy') ?? '';
  for (const directive of [
    "default-src 'self'",
    "connect-src 'self' https://challenges.cloudflare.com",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "worker-src 'self'",
  ]) {
    if (!policy.includes(directive)) {
      throw new ProductionVerificationError(
        `${label} Content-Security-Policy is missing ${directive}.`,
      );
    }
  }
  const permissions = response.headers.get('permissions-policy') ?? '';
  for (const directive of ['camera=()', 'microphone=()', 'payment=()']) {
    if (!permissions.includes(directive)) {
      throw new ProductionVerificationError(
        `${label} Permissions-Policy is missing ${directive}.`,
      );
    }
  }
}

function linkedAssetPaths(html, origin) {
  const assets = new Set();
  for (const match of html.matchAll(
    /(?:src|href)=["']([^"'<>]+)["']/g,
  )) {
    let url;
    try {
      url = new URL(match[1], origin);
    } catch {
      continue;
    }
    if (
      url.origin === origin &&
      (url.pathname.startsWith('/_next/static/') ||
        url.pathname === '/favicon.svg')
    ) {
      assets.add(url.pathname);
    }
  }
  return [...assets].sort();
}

function expectedAssetMimes(pathname) {
  if (pathname.endsWith('.css')) return ['text/css'];
  if (pathname.endsWith('.js')) {
    return ['text/javascript', 'application/javascript'];
  }
  if (pathname.endsWith('.svg')) return ['image/svg+xml'];
  if (pathname.endsWith('.png')) return ['image/png'];
  if (pathname.endsWith('.woff2')) return ['font/woff2'];
  if (pathname.endsWith('.woff')) return ['font/woff'];
  return ['application/octet-stream'];
}

function validateManifest(manifest) {
  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    Array.isArray(manifest) ||
    manifest.start_url !== '/dashboard/' ||
    manifest.scope !== '/' ||
    manifest.display !== 'standalone' ||
    !Array.isArray(manifest.icons)
  ) {
    throw new ProductionVerificationError(
      'Web app manifest does not match the release contract.',
    );
  }
  const icons = new Set(
    manifest.icons
      .filter((icon) => typeof icon?.src === 'string')
      .map((icon) => icon.src),
  );
  for (const icon of [
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/icons/icon-maskable-512.png',
  ]) {
    if (!icons.has(icon)) {
      throw new ProductionVerificationError(
        `Web app manifest is missing ${icon}.`,
      );
    }
  }
  return [...icons].sort();
}

export async function verifyProduction(origin, options = {}) {
  const normalizedOrigin = normalizeProductionOrigin(origin);
  const fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  const expectedAiEnabled = options.expectedAiEnabled;
  const htmlDocuments = [];

  for (const route of HTML_ROUTES) {
    const response = await request(fetchFn, `${normalizedOrigin}${route}`);
    requireStatus(response, 200, route);
    requireMime(response, ['text/html'], route);
    requireSecurityHeaders(response, route);
    const html = await readText(response);
    requireNoSecretMaterial(html, route);
    if (!/<html\b/i.test(html) || !/Calricula/i.test(html)) {
      throw new ProductionVerificationError(
        `${route} did not return the Calricula HTML shell.`,
      );
    }
    htmlDocuments.push(html);
  }

  const missingStatic = await request(
    fetchFn,
    `${normalizedOrigin}/release-verification-not-found-9f4d2e/`,
  );
  requireStatus(missingStatic, 404, 'Missing static route');
  requireMime(missingStatic, ['text/html'], 'Missing static route');
  requireNoSecretMaterial(
    await readText(missingStatic, MAX_TEXT_BYTES),
    'Missing static route',
  );

  const missingApi = await request(
    fetchFn,
    `${normalizedOrigin}/api/release-verification-not-found-9f4d2e`,
  );
  requireStatus(missingApi, 404, 'Missing API route');
  requireMime(missingApi, ['application/json'], 'Missing API route');
  if (
    !missingApi.headers
      .get('cache-control')
      ?.toLowerCase()
      .includes('no-store')
  ) {
    throw new ProductionVerificationError(
      'Missing API route is not marked no-store.',
    );
  }
  const missingApiText = await readText(missingApi);
  requireNoSecretMaterial(missingApiText, 'Missing API route');
  const apiBody = JSON.parse(missingApiText);
  if (
    apiBody?.success !== false ||
    apiBody?.error?.code !== 'NOT_FOUND'
  ) {
    throw new ProductionVerificationError(
      'Missing API route did not return the NOT_FOUND envelope.',
    );
  }

  const health = await request(fetchFn, `${normalizedOrigin}/api/health`);
  requireStatus(health, 200, 'API health');
  requireMime(health, ['application/json'], 'API health');
  if (
    !health.headers
      .get('cache-control')
      ?.toLowerCase()
      .includes('no-store')
  ) {
    throw new ProductionVerificationError(
      'API health is not marked no-store.',
    );
  }
  const healthText = await readText(health);
  requireNoSecretMaterial(healthText, 'API health');
  const healthBody = JSON.parse(healthText);
  if (
    healthBody?.success !== true ||
    healthBody?.data?.status !== 'ok'
  ) {
    throw new ProductionVerificationError(
      'API health did not return the expected success envelope.',
    );
  }
  if (
    typeof expectedAiEnabled === 'boolean' &&
    healthBody.data.aiEnabled !== expectedAiEnabled
  ) {
    throw new ProductionVerificationError(
      `API health reported aiEnabled=${String(
        healthBody.data.aiEnabled,
      )}; expected ${String(expectedAiEnabled)} for this release mode.`,
    );
  }

  const serviceWorker = await request(
    fetchFn,
    `${normalizedOrigin}/sw.js`,
  );
  requireStatus(serviceWorker, 200, 'Service worker');
  requireMime(
    serviceWorker,
    ['text/javascript', 'application/javascript'],
    'Service worker',
  );
  if (serviceWorker.headers.get('service-worker-allowed') !== '/') {
    throw new ProductionVerificationError(
      'Service worker is not allowed to control the root scope.',
    );
  }
  if (
    !serviceWorker.headers
      .get('cache-control')
      ?.toLowerCase()
      .includes('no-store')
  ) {
    throw new ProductionVerificationError(
      'Service worker is not served with no-store.',
    );
  }
  const serviceWorkerText = await readText(
    serviceWorker,
    MAX_ASSET_BYTES,
  );
  requireNoSecretMaterial(serviceWorkerText, 'Service worker');
  if (serviceWorkerText.includes('connectivity.txt')) {
    throw new ProductionVerificationError(
      'Service worker precaches the network-only connectivity probe.',
    );
  }

  const connectivity = await request(
    fetchFn,
    `${normalizedOrigin}/connectivity.txt?release-verification=${Date.now()}`,
  );
  requireStatus(connectivity, 200, 'Connectivity probe');
  requireMime(connectivity, ['text/plain'], 'Connectivity probe');
  if (
    !connectivity.headers
      .get('cache-control')
      ?.toLowerCase()
      .includes('no-store')
  ) {
    throw new ProductionVerificationError(
      'Connectivity probe is not marked no-store.',
    );
  }
  const connectivityText = await readText(connectivity, 1_024);
  if (connectivityText.trim() !== 'calricula-online') {
    throw new ProductionVerificationError(
      'Connectivity probe returned an unexpected body.',
    );
  }

  const manifestResponse = await request(
    fetchFn,
    `${normalizedOrigin}/manifest.webmanifest`,
  );
  requireStatus(manifestResponse, 200, 'Web app manifest');
  requireMime(
    manifestResponse,
    ['application/manifest+json'],
    'Web app manifest',
  );
  const manifestText = await readText(manifestResponse);
  requireNoSecretMaterial(manifestText, 'Web app manifest');
  const manifest = JSON.parse(manifestText);
  const iconPaths = validateManifest(manifest);

  const assetPaths = [
    ...new Set([
      ...htmlDocuments.flatMap((html) =>
        linkedAssetPaths(html, normalizedOrigin),
      ),
      ...iconPaths,
    ]),
  ].sort();
  if (
    assetPaths.length === iconPaths.length ||
    assetPaths.length > MAX_LINKED_ASSETS
  ) {
    throw new ProductionVerificationError(
      `HTML routes exposed ${
        assetPaths.length - iconPaths.length
      } linked static assets; expected 1-${MAX_LINKED_ASSETS - iconPaths.length}.`,
    );
  }
  for (const assetPath of assetPaths) {
    const response = await request(
      fetchFn,
      `${normalizedOrigin}${assetPath}`,
    );
    requireStatus(response, 200, assetPath);
    requireMime(response, expectedAssetMimes(assetPath), assetPath);
    const content = await readBoundedBytes(response, MAX_ASSET_BYTES);
    if (content.byteLength === 0) {
      throw new ProductionVerificationError(
        `${assetPath} returned an empty response.`,
      );
    }
    if (
      /\.(?:css|js|svg|json|webmanifest|txt|xml)$/i.test(assetPath)
    ) {
      requireNoSecretMaterial(
        new TextDecoder().decode(content),
        assetPath,
      );
    }
  }

  return {
    origin: normalizedOrigin,
    routes: HTML_ROUTES.length,
    assets: assetPaths.length,
    manifestIcons: iconPaths.length,
    api404: true,
    aiEnabled: healthBody.data.aiEnabled,
    connectivity: true,
    static404: true,
  };
}

function parseArguments(argv) {
  let local = false;
  let baseUrl = process.env.CALRICULA_RELEASE_BASE_URL ?? '';
  let baseUrlExplicit = false;
  const expectedAiEnabledValue =
    process.env.CALRICULA_EXPECT_AI_ENABLED?.trim() ?? '';
  if (
    expectedAiEnabledValue &&
    expectedAiEnabledValue !== 'true' &&
    expectedAiEnabledValue !== 'false'
  ) {
    throw new ProductionVerificationError(
      'CALRICULA_EXPECT_AI_ENABLED must be true or false.',
    );
  }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--local') {
      local = true;
      continue;
    }
    if (argument === '--base-url') {
      baseUrl = argv[index + 1] ?? '';
      baseUrlExplicit = true;
      index += 1;
      continue;
    }
    throw new ProductionVerificationError(
      `Unknown argument: ${argument}`,
    );
  }
  if (local && baseUrlExplicit) {
    throw new ProductionVerificationError(
      'Use either --local or --base-url, not both.',
    );
  }
  if (local) baseUrl = '';
  return {
    baseUrl,
    expectedAiEnabled:
      expectedAiEnabledValue === ''
        ? undefined
        : expectedAiEnabledValue === 'true',
    local,
  };
}

export async function runProductionVerification(argv = process.argv.slice(2)) {
  const { baseUrl, expectedAiEnabled, local } =
    parseArguments(argv);
  const result = local
    ? await withLocalProduction((origin) =>
        verifyProduction(origin, { expectedAiEnabled }),
      )
    : await verifyProduction(baseUrl, { expectedAiEnabled });
  console.log(
    `[production-verifier] ${result.routes} routes, ${result.assets} assets, manifest, connectivity, security/secret headers, API/static 404s, size, and MIME checks passed for ${result.origin}.`,
  );
}

const entryPoint = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : '';
if (import.meta.url === entryPoint) {
  runProductionVerification().catch((error) => {
    console.error(
      `[production-verifier] ${
        error instanceof Error ? error.message : 'Verification failed.'
      }`,
    );
    process.exitCode = 1;
  });
}
