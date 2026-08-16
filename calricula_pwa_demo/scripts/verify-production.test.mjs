import { describe, expect, it, vi } from 'vitest';

import {
  ProductionVerificationError,
  normalizeProductionOrigin,
  verifyProduction,
} from './verify-production.mjs';

const ORIGIN = 'https://calricula-demo.example';

function securityHeaders(contentType = 'text/html; charset=utf-8') {
  return {
    'content-type': contentType,
    'content-security-policy':
      "default-src 'self'; connect-src 'self' https://challenges.cloudflare.com; frame-ancestors 'none'; object-src 'none'; worker-src 'self'",
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-origin',
    'permissions-policy': 'camera=(), microphone=(), payment=()',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'strict-transport-security': 'max-age=31536000; includeSubDomains',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
  };
}

function json(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...headers,
    },
  });
}

function validFetchHarness(overrides = {}) {
  const fetchFn = vi.fn(async (input) => {
    const url = new URL(String(input));
    if (overrides[url.pathname]) return overrides[url.pathname]();

    if (
      url.pathname ===
      '/api/release-verification-not-found-9f4d2e'
    ) {
      return json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'API endpoint not found.' },
        },
        404,
        { 'cache-control': 'no-store, max-age=0' },
      );
    }
    if (url.pathname === '/api/health') {
      return json(
        {
          success: true,
          data: { status: 'ok', aiEnabled: false },
        },
        200,
        { 'cache-control': 'no-store, max-age=0' },
      );
    }
    if (url.pathname === '/release-verification-not-found-9f4d2e/') {
      return new Response('<html><title>Not found</title></html>', {
        status: 404,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }
    if (url.pathname === '/sw.js') {
      return new Response('self.addEventListener("fetch", () => {});', {
        status: 200,
        headers: {
          'cache-control': 'no-cache, no-store, must-revalidate',
          'content-type': 'text/javascript; charset=utf-8',
          'service-worker-allowed': '/',
        },
      });
    }
    if (url.pathname === '/connectivity.txt') {
      return new Response('calricula-online\n', {
        status: 200,
        headers: {
          'cache-control': 'no-cache, no-store, must-revalidate',
          'content-type': 'text/plain; charset=utf-8',
        },
      });
    }
    if (url.pathname === '/manifest.webmanifest') {
      return json(
        {
          name: 'Calricula Curriculum Demo',
          start_url: '/dashboard/',
          scope: '/',
          display: 'standalone',
          icons: [
            { src: '/icons/icon-192.png' },
            { src: '/icons/icon-512.png' },
            { src: '/icons/icon-maskable-512.png' },
          ],
        },
        200,
        { 'content-type': 'application/manifest+json' },
      );
    }
    if (url.pathname.startsWith('/icons/')) {
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      });
    }
    if (url.pathname === '/_next/static/app.css') {
      return new Response('body { color: black; }', {
        status: 200,
        headers: { 'content-type': 'text/css' },
      });
    }
    if (url.pathname === '/_next/static/app.js') {
      return new Response('globalThis.__app = true;', {
        status: 200,
        headers: { 'content-type': 'text/javascript' },
      });
    }
    if (url.pathname === '/favicon.svg') {
      return new Response('<svg></svg>', {
        status: 200,
        headers: { 'content-type': 'image/svg+xml' },
      });
    }

    const body =
      url.pathname === '/'
        ? '<html><title>Calricula</title><link href="/_next/static/app.css"><link href="/favicon.svg"><script src="/_next/static/app.js"></script></html>'
        : '<html><title>Calricula</title></html>';
    return new Response(body, {
      status: 200,
      headers: securityHeaders(),
    });
  });
  return fetchFn;
}

describe('production origin validation', () => {
  it('accepts HTTPS origins and localhost HTTP only', () => {
    expect(normalizeProductionOrigin(`${ORIGIN}/`)).toBe(ORIGIN);
    expect(normalizeProductionOrigin('http://127.0.0.1:4197')).toBe(
      'http://127.0.0.1:4197',
    );
    expect(() =>
      normalizeProductionOrigin('http://calricula-demo.example'),
    ).toThrow(ProductionVerificationError);
    expect(() =>
      normalizeProductionOrigin(`${ORIGIN}/dashboard/`),
    ).toThrow(ProductionVerificationError);
  });
});

describe('production deployment verification', () => {
  it('checks routes, headers, MIME types, manifest assets, and API/static 404 behavior', async () => {
    const fetchFn = validFetchHarness();
    const result = await verifyProduction(ORIGIN, { fetchFn });

    expect(result).toMatchObject({
      origin: ORIGIN,
      routes: 15,
      api404: true,
      connectivity: true,
      static404: true,
      manifestIcons: 3,
    });
    expect(result.assets).toBe(6);
    expect(fetchFn).toHaveBeenCalledWith(
      `${ORIGIN}/api/release-verification-not-found-9f4d2e`,
      expect.objectContaining({ method: 'GET', redirect: 'error' }),
    );
  });

  it('requires the release-mode AI state when one is specified', async () => {
    await expect(
      verifyProduction(ORIGIN, {
        expectedAiEnabled: false,
        fetchFn: validFetchHarness(),
      }),
    ).resolves.toMatchObject({ aiEnabled: false });
    await expect(
      verifyProduction(ORIGIN, {
        expectedAiEnabled: true,
        fetchFn: validFetchHarness(),
      }),
    ).rejects.toThrow('expected true for this release mode');
  });

  it('fails when a production asset has the wrong MIME type', async () => {
    const fetchFn = validFetchHarness({
      '/_next/static/app.js': () =>
        new Response('globalThis.__app = true;', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        }),
    });

    await expect(
      verifyProduction(ORIGIN, { fetchFn }),
    ).rejects.toThrow('unexpected Content-Type');
  });

  it('does not accept a MIME type that only contains an allowed token', async () => {
    const fetchFn = validFetchHarness({
      '/_next/static/app.js': () =>
        new Response('globalThis.__app = true;', {
          status: 200,
          headers: {
            'content-type': 'application/javascript-malicious',
          },
        }),
    });

    await expect(
      verifyProduction(ORIGIN, { fetchFn }),
    ).rejects.toThrow('unexpected Content-Type');
  });

  it('fails when required security headers are absent', async () => {
    const fetchFn = validFetchHarness({
      '/': () =>
        new Response('<html><title>Calricula</title></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
    });

    await expect(
      verifyProduction(ORIGIN, { fetchFn }),
    ).rejects.toThrow('required cross-origin-opener-policy');
  });

  it('verifies route-specific chunks instead of checking only the landing page', async () => {
    const fetchFn = validFetchHarness({
      '/courses/': () =>
        new Response(
          '<html><title>Calricula</title><script src="/_next/static/courses.js"></script></html>',
          { status: 200, headers: securityHeaders() },
        ),
      '/_next/static/courses.js': () =>
        new Response('globalThis.__courses = true;', {
          status: 200,
          headers: { 'content-type': 'text/javascript' },
        }),
    });
    await expect(
      verifyProduction(ORIGIN, { fetchFn }),
    ).resolves.toMatchObject({ assets: 7 });
    expect(fetchFn).toHaveBeenCalledWith(
      `${ORIGIN}/_next/static/courses.js`,
      expect.any(Object),
    );
  });

  it('requires the connectivity probe to stay network-only and no-store', async () => {
    const cachedFetch = validFetchHarness({
      '/sw.js': () =>
        new Response(
          'self.__WB_MANIFEST=[{url:"connectivity.txt",revision:"1"}];',
          {
            status: 200,
            headers: {
              'cache-control': 'no-store',
              'content-type': 'text/javascript',
              'service-worker-allowed': '/',
            },
          },
        ),
    });
    await expect(
      verifyProduction(ORIGIN, { fetchFn: cachedFetch }),
    ).rejects.toThrow('precaches the network-only connectivity probe');

    const cachedHeaderFetch = validFetchHarness({
      '/connectivity.txt': () =>
        new Response('calricula-online', {
          status: 200,
          headers: {
            'cache-control': 'public, max-age=3600',
            'content-type': 'text/plain',
          },
        }),
    });
    await expect(
      verifyProduction(ORIGIN, { fetchFn: cachedHeaderFetch }),
    ).rejects.toThrow('Connectivity probe is not marked no-store');
  });

  it('rejects recognizable secrets in deployed text assets', async () => {
    const fetchFn = validFetchHarness({
      '/_next/static/app.js': () =>
        new Response(
          'globalThis.key = "sk-or-v1-abcdefghijklmnop";',
          {
            status: 200,
            headers: { 'content-type': 'text/javascript' },
          },
        ),
    });

    await expect(
      verifyProduction(ORIGIN, { fetchFn }),
    ).rejects.toThrow('recognizable OpenRouter API key');
  });
});
