# Task 2 report: Standalone app sign-in with `@logto/next`

**Status:** DONE. One commit on `main`: `660dcfc` `feat(web): Logto sign-in via @logto/next; remove Firebase`. Not pushed.

## What was implemented

- `frontend/package.json` / `package-lock.json`: `-firebase`, `+@logto/next@^4.2.11` (installed **4.2.11**; pulls `@logto/node` 3.1.11, `@logto/client`, `@logto/js`). Zero `node_modules/firebase` entries remain in the lockfile.
- `frontend/src/lib/logto.ts` (server-only, imported only by route handlers): builds `logtoConfig` from `LOGTO_ENDPOINT`, `LOGTO_APP_ID`, `LOGTO_APP_SECRET`, `LOGTO_COOKIE_SECRET`, `LOGTO_BASE_URL` (default `http://localhost:3002`), `LOGTO_API_RESOURCE`; `LOGTO_CONFIGURED` is true only when all six are set; `cookieSecure = LOGTO_BASE_URL.startsWith('https')`; `scopes: ['email']` (SDK adds `openid offline_access profile`), `resources: [LOGTO_API_RESOURCE]`. Also exports `json()` (JSON + `Cache-Control: no-store`), `notConfigured()` (404 `{ "error": "logto_not_configured" }`) and `secondsUntilExpiry(token)` (reads the JWT `exp` claim without verifying; fallback 300 s for opaque tokens).
- Routes, all `export const dynamic = 'force-dynamic'`, all 404 when unconfigured:
  - `GET /sign-in` → `signIn(logtoConfig, { redirectUri: \`${LOGTO_BASE_URL}/callback\` })` (SDK sets the session cookie and issues Next's redirect to Logto).
  - `GET /callback` → `handleSignIn(logtoConfig, url.searchParams)` then `redirect('/')`. The `searchParams` overload was chosen over the `URL` overload deliberately: the SDK's `verifyAndParseCodeFromCallbackUri` prefix-checks the callback URI against the stored redirect URI, so passing the request URL would break behind a reverse proxy where Next sees an internal host; with `searchParams` the SDK rebuilds the URL from `baseUrl`.
  - `GET /sign-out` → `signOut(logtoConfig, \`${LOGTO_BASE_URL}/\`)`.
  - `GET /api/auth/session` → `{ signedIn, name }`, name from ID-token `name` / `username` / `email` (never `sub`), `null` when signed out.
  - `GET /api/auth/token` → `{ access_token, expires_in }` for `LOGTO_API_RESOURCE` via `getAccessToken` (the server-action variant, which persists a refreshed session cookie); `204` when `getLogtoContext` says signed out **or** when `getAccessToken` throws (refresh token gone/rejected).
- `frontend/src/lib/auth.tsx`: `mode: 'dev' | 'logto' | 'none'` (`dev` when `NEXT_PUBLIC_AUTH_DEV_MODE === 'true'`, else `logto` when `NEXT_PUBLIC_LOGTO_ENABLED === 'true'`, else `none`). In `logto` mode on mount: fetch `/api/auth/session`; if signed in fetch `/api/auth/token`, store the token in `tokenRef`, set `identity` to the name (or `"Signed in"` when no claim), and schedule a refresh at `refreshDelaySeconds(expires_in) = max(expires_in - 60, 30)` s; a refresh that returns non-200 clears token and identity; timer cleared on unmount and on `signOut()`. `getToken()` is unchanged and synchronous. `signInLogto()` → `window.location.assign('/sign-in')`; `signOut()` clears the ref and, in logto mode, navigates to `/sign-out`. `signInFirebase`, the Firebase env block and all Firebase imports are gone. `SignIn` header: dev picker unchanged; logto mode renders `<a href="/sign-in">Sign in</a>` or `<span>{name}</span>` + `<a href="/sign-out">Sign out</a>`; `none` renders nothing.
- `frontend/src/styles/globals.css`: `.ax-signin a.ax-button { display:inline-flex; align-items:center; text-decoration:none }` so the anchors render like the package's `.ax-button`.
- `frontend/.env.example`: Firebase block replaced with `NEXT_PUBLIC_LOGTO_ENABLED=false` plus the six commented `LOGTO_*` vars with one-line comments (Traditional web app id/secret; cookie secret ≥ 32 random chars with an `openssl rand -base64 32` hint; base URL + `/callback` must be a registered redirect URI; API resource must equal the API's `OIDC_AUDIENCE`).
- `frontend/e2e/chat.spec.ts`: new test `dev mode shows the identity picker and no Logto sign-in link` (`getByLabel(/sign in as/i)` visible; links named `Sign in` / `Sign out` have count 0).
- `README.md`: "Running P1a" now points to `NEXT_PUBLIC_LOGTO_ENABLED` + `LOGTO_*` instead of `NEXT_PUBLIC_FIREBASE_*`; e2e count 3 → 4; the "What P0 did not do" Firebase bullet now notes the Logto replacement. (`docs/P1A-EXIT.md` still describes Firebase as history; left alone — it is a dated exit record.)

## Export-name divergences from the plan

None for the names the plan listed: `@logto/next/server-actions` 4.2.11 exports exactly `signIn`, `handleSignIn`, `signOut`, `getLogtoContext`, `getAccessToken` (plus `getAccessTokenRSC`, `getOrganizationToken(s)`, default `LogtoClient`). Signature notes that shaped the code:

- `signIn(config, options?: SignInOptions)` — the object form `{ redirectUri }` is current; the `(config, redirectUri: string)` form is deprecated. Object form used.
- `handleSignIn(config, searchParams: URLSearchParams | url: URL)` — `URLSearchParams` overload used (reason above).
- `getAccessToken(config, resource?)` returns a bare `string`, not `{ token, expiresAt }`; `expires_in` is therefore derived from the token's `exp` claim in `secondsUntilExpiry`.
- `getLogtoContext` returns `{ isAuthenticated, claims?: IdTokenClaims }`; `claims.name/username/email` are `Nullable<string>` so `||` chaining is used.
- Config type is `LogtoNextConfig` from the `@logto/next` root export (`LogtoConfig & { cookieSecure, baseUrl, cookieSecret? }`).
- Minor shape divergence from the brief: `logtoConfig` is exported as `LogtoNextConfig | null` (null until configured) rather than an always-built object, so the type system forces the `LOGTO_CONFIGURED` guard in every handler.

## Verification

```
$ npm uninstall firebase && npx tsc --noEmit      # Step 1 failing check
src/lib/auth.tsx(30,41): error TS2307: Cannot find module 'firebase/auth' ...   (4 TS2307 + 1 TS7006)

$ npx tsc --noEmit                                 # after implementation
(clean, exit 0)
$ npm run lint                                     # eslint .
(clean, exit 0)
$ npm run build                                    # next build
✓ ... Route (app): ○ /, ○ /_not-found, ƒ /api/auth/session, ƒ /api/auth/token, ƒ /callback, ○ /chat, ƒ /sign-in, ƒ /sign-out, ƒ /workspaces/[id]   (exit 0)

$ grep -rni firebase frontend/src frontend/package.json frontend/.env.example   → empty (exit 1)
$ grep -rn "localStorage\|sessionStorage" frontend/src                          → empty (exit 1)
$ grep -c '"node_modules/firebase' frontend/package-lock.json                   → 0

e2e (README recipe: alembic upgrade head; seeds.seed_dev → workspace_id=e43eb28f-...;
     CONNECTOR_REPLAY=1 MODEL_PROVIDER=fake AUTH_DEV_MODE=true uvicorn app.main:app --port 8002 in background)
$ E2E_WORKSPACE_ID=... npx playwright test
  ✓ public chat answers a campus question with sources
  ✓ dev mode shows the identity picker and no Logto sign-in link   (new)
  ✓ guest cannot open a workspace
  ✓ a signed-in staff member opens the seeded workspace
  4 passed (2.9s)
API and web servers stopped afterwards; lsof on 8002/3002 empty.
```

Route smoke test against `next start` (not required by the brief, done for confidence):

- Unconfigured: `/api/auth/session`, `/api/auth/token`, `/sign-in`, `/sign-out`, `/callback?code=x&state=y` all → `404`, `cache-control: no-store`, `{"error":"logto_not_configured"}`.
- Configured with placeholder `LOGTO_*` values, no session cookie: `/api/auth/session` → `200 {"signedIn":false,"name":null}` with `no-store`; `/api/auth/token` → `204` with `no-store`; `/sign-in` → `500` because OIDC discovery against the placeholder endpoint fails (expected; no tenant exists, and the brief forbids a real sign-in).

Trailer: `git log -1 --format='%(trailers:key=Co-Authored-By)'` → `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; it is the last paragraph of the body. Commit author is the GitHub noreply identity; no personal email anywhere in the diff.

## Files changed (commit 660dcfc)

- `README.md`
- `frontend/.env.example`
- `frontend/e2e/chat.spec.ts`
- `frontend/package.json`, `frontend/package-lock.json`
- `frontend/src/lib/auth.tsx`
- `frontend/src/lib/logto.ts` (new)
- `frontend/src/styles/globals.css`
- `frontend/src/app/sign-in/route.ts`, `frontend/src/app/callback/route.ts`, `frontend/src/app/sign-out/route.ts` (new)
- `frontend/src/app/api/auth/session/route.ts`, `frontend/src/app/api/auth/token/route.ts` (new)

## Self-review

- `getToken` is unchanged (`() => tokenRef.current`), so `adapter.ts` / `useAdapter.ts` needed no change; the adapter memo still keys on the stable callback.
- Token never leaves memory on the client: it only arrives in the `/api/auth/token` JSON body (same-origin, `no-store`) and is held in a ref. The session itself is the SDK's encrypted httpOnly cookie. Sign-in/out links are server redirects, so no token is ever in a URL.
- The `redirect()` calls from `signIn`/`signOut`/`callback` are not wrapped in `try/catch`, so Next's `NEXT_REDIRECT` control-flow error propagates as intended. The `/api/auth/token` `try/catch` wraps only `getAccessToken`, which does not redirect.
- Refresh timer: a single timer at a time (`clearRefresh` before rescheduling), cleared on unmount and sign-out; `cancelled` guards every await in the mount effect. Under React StrictMode's double-mount the first effect is cancelled cleanly.
- `secondsUntilExpiry` uses `Buffer` — route handlers run in the Node runtime (no `runtime = 'edge'`), so that is fine; if someone later moves a route to edge they would need `atob`.
- No unit-test runner exists in `frontend/` (brief noted vitest is not set up); `refreshDelaySeconds` and `secondsUntilExpiry` are exported pure functions ready for one, but I did not add test infrastructure for two one-liners.

## Concerns / for the reviewer

1. **Real flow unexercised.** No Logto tenant exists, so `/sign-in` → Logto → `/callback` → `/api/auth/token` was never run end to end. The exact overloads and behaviour were read from the installed 4.2.11 typings and JS, and the signed-out/unconfigured paths were exercised against the production build, but the first real sign-in should be watched (in particular that the Logto application is "Traditional web", that `${LOGTO_BASE_URL}/callback` and `${LOGTO_BASE_URL}/` are registered as redirect / post-sign-out URIs, and that the API resource exists in the tenant so the access token is a JWT with `aud = OIDC_AUDIENCE`).
2. **`expires_in` is derived, not returned by the SDK.** If Logto issues an opaque (non-JWT) token for the resource — it does not by default when a resource is configured — `secondsUntilExpiry` falls back to 300 s, so the client would refresh every 4 minutes; harmless but worth knowing.
3. **`/callback` on a bad state/code returns a Next 500** rather than a friendly page. I left it that way (honest failure, not silently swallowed); a small error page is an easy follow-up if wanted.
4. `docs/P1A-EXIT.md` still mentions Firebase as the P1a state; I treated it as a historical exit record and did not edit it.
5. The `email` scope is requested so the header can fall back to the address when the profile has no `name`/`username`; if the deployer prefers not to request email, drop `scopes: ['email']` in `logto.ts` and the fallback becomes "Signed in".
