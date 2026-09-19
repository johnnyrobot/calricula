import { access, copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { generateSW } from 'workbox-build';

const rootDirectory = process.cwd();
const outputDirectory = path.join(rootDirectory, 'out');
const serviceWorkerPath = path.join(outputDirectory, 'sw.js');

function canonicalCloudflareAssetUrl(url) {
  if (url === 'index.html') return '/';
  if (url.endsWith('/index.html')) {
    return `/${url.slice(0, -'index.html'.length)}`;
  }
  if (url.endsWith('.html')) {
    return `/${url.slice(0, -'.html'.length)}`;
  }
  return url;
}

try {
  await access(outputDirectory);
} catch {
  throw new Error(
    'Static export directory "out" does not exist. Run `npm run build:next` first.',
  );
}

await mkdir(outputDirectory, { recursive: true });
await copyFile(
  path.join(rootDirectory, '.assetsignore'),
  path.join(outputDirectory, '.assetsignore'),
);

const { count, size, warnings } = await generateSW({
  globDirectory: outputDirectory,
  swDest: serviceWorkerPath,
  globPatterns: [
    '**/*.{html,css,js,json,webmanifest,txt,xml,ico,png,svg,woff,woff2}',
  ],
  globIgnores: [
    '**/*.map',
    'docs/**',
    '**/docs/**',
    'openrouter-llms-full.txt',
    'connectivity.txt',
    'sw.js',
    'workbox-*.js',
  ],
  maximumFileSizeToCacheInBytes: 25 * 1024 * 1024,
  // Cloudflare's `auto-trailing-slash` asset mode redirects physical `.html`
  // paths to public route URLs. Precaching those paths can strand Workbox
  // while it copies redirected response streams during installation.
  manifestTransforms: [
    async (entries) => ({
      manifest: entries.map((entry) => ({
        ...entry,
        url: canonicalCloudflareAssetUrl(entry.url),
      })),
      warnings: [],
    }),
  ],
  cacheId: 'calricula-demo',
  cleanupOutdatedCaches: true,
  // Claim clients after activation so an explicitly accepted update can take
  // control immediately. The UI only reloads for update lifecycle events, so
  // first-time installation remains quiet.
  clientsClaim: true,
  skipWaiting: false,
  sourcemap: false,
  inlineWorkboxRuntime: true,
  disableDevLogs: true,
  directoryIndex: 'index.html',
  // Course and program IDs live in query parameters. Ignoring query strings
  // lets `/courses/view/?id=...` use the finite, precached route shell.
  ignoreURLParametersMatching: [/.*/],
  runtimeCaching: [
    {
      urlPattern: ({ request, url }) =>
        request.mode === 'navigate' &&
        !url.pathname.startsWith('/api/') &&
        !url.pathname.startsWith('/cdn-cgi/'),
      handler: 'NetworkFirst',
      options: {
        cacheName: 'calricula-navigation',
        networkTimeoutSeconds: 4,
        cacheableResponse: {
          statuses: [0, 200],
        },
        expiration: {
          maxEntries: 60,
          maxAgeSeconds: 7 * 24 * 60 * 60,
          purgeOnQuotaError: true,
        },
        precacheFallback: {
          fallbackURL: '/offline',
        },
      },
    },
  ],
});

for (const warning of warnings) {
  console.warn(`[workbox] ${warning}`);
}

console.log(
  `[workbox] Precached ${count} finite files (${(size / 1024 / 1024).toFixed(2)} MiB).`,
);
