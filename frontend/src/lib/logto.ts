// ===========================================
// Logto (OIDC) — server-only configuration
// ===========================================
// Only the route handlers under `src/app/{sign-in,sign-out,callback}` and
// `src/app/api/auth/*` import this module. None of these values is prefixed
// with `NEXT_PUBLIC_`, so none of them reaches the browser bundle: the client
// learns whether Logto is available from `NEXT_PUBLIC_LOGTO_ENABLED`, which
// the deployer sets alongside these (it is not derived from them, so a
// half-configured server still 404s every auth route).

import type { LogtoNextConfig } from '@logto/next';

const env = {
  endpoint: process.env.LOGTO_ENDPOINT,
  appId: process.env.LOGTO_APP_ID,
  appSecret: process.env.LOGTO_APP_SECRET,
  cookieSecret: process.env.LOGTO_COOKIE_SECRET,
  // Public origin of this app; also the origin of the `/callback` redirect URI.
  baseUrl: process.env.LOGTO_BASE_URL || 'http://localhost:3001',
  // Must equal the backend's `OIDC_AUDIENCE` or the API rejects the token.
  apiResource: process.env.LOGTO_API_RESOURCE,
};

/** True only when every required server variable is set; auth routes 404 otherwise. */
export const LOGTO_CONFIGURED: boolean = Boolean(
  env.endpoint && env.appId && env.appSecret && env.cookieSecret && env.apiResource
);

/** The API resource the access token is minted for; must equal the backend's `OIDC_AUDIENCE`. */
export const LOGTO_API_RESOURCE: string = env.apiResource ?? '';

/** Where the browser lands after sign-in/sign-out; trailing slashes trimmed. */
export const LOGTO_BASE_URL: string = env.baseUrl.replace(/\/+$/, '');

/**
 * Backend origin for server-to-server calls (the ID-token exchange at
 * `POST /api/auth/login`). Inside Docker this is the compose service name;
 * `API_URL` is the variable `next.config.js` already uses for its rewrites.
 */
export const API_BASE_URL: string = (
  process.env.API_BASE_URL ||
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:8001'
).replace(/\/+$/, '');

/** `null` until every required variable is set, so no handler can use a half-built config. */
export const logtoConfig: LogtoNextConfig | null = LOGTO_CONFIGURED
  ? {
      endpoint: env.endpoint as string,
      appId: env.appId as string,
      appSecret: env.appSecret as string,
      cookieSecret: env.cookieSecret as string,
      cookieSecure: LOGTO_BASE_URL.startsWith('https'),
      baseUrl: LOGTO_BASE_URL,
      // The SDK always requests `openid`, `offline_access` and `profile`;
      // `email` is what the backend keys the account on, so ask for it too.
      scopes: ['email'],
      resources: [LOGTO_API_RESOURCE],
    }
  : null;

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

/** JSON response that no browser or intermediary may cache. */
export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

/** Empty 204 (signed out), never cached. */
export function noContent(): Response {
  return new Response(null, { status: 204, headers: NO_STORE });
}

/** The 404 every auth route returns while Logto is unconfigured. */
export function notConfigured(): Response {
  return json({ error: 'logto_not_configured' }, 404);
}

/**
 * Seconds until a JWT expires, read from its `exp` claim WITHOUT verifying the
 * signature — the backend verifies; this only schedules a client-side refresh.
 * Returns `fallback` when the token is opaque, malformed or has no `exp`.
 */
export function secondsUntilExpiry(token: string, now = Date.now(), fallback = 300): number {
  const payload = token.split('.')[1];
  if (!payload) return fallback;
  try {
    const claims: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const exp = (claims as { exp?: unknown }).exp;
    if (typeof exp !== 'number' || !Number.isFinite(exp)) return fallback;
    return Math.max(0, Math.floor(exp - now / 1000));
  } catch {
    return fallback;
  }
}
