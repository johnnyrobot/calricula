# Task 3 report — Frontend sign-in with `@logto/next`

Branch `auth/logto-migration`, commit `5348760`
(`feat(auth): Logto sign-in via @logto/next; remove Firebase web SDK`). Not pushed.

## What was implemented

**Dependency swap.** `npm uninstall firebase && npm install @logto/next@4.2.11`;
`package.json` + `package-lock.json` committed (lockfile shrinks by ~700 lines —
the Firebase SDK's dependency tree is much larger than Logto's).

**`frontend/src/lib/logto.ts` (new, server-only).** Reads `LOGTO_ENDPOINT`,
`LOGTO_APP_ID`, `LOGTO_APP_SECRET`, `LOGTO_COOKIE_SECRET`, `LOGTO_API_RESOURCE`
(all five required → `LOGTO_CONFIGURED`), plus `LOGTO_BASE_URL` (default
`http://localhost:3001`, trailing slashes trimmed) and `API_BASE_URL`
(`API_BASE_URL` → `API_URL` → `NEXT_PUBLIC_API_URL` → `http://localhost:8001`;
`API_URL` is the variable `next.config.js` already uses for its Docker rewrite).
`logtoConfig` is `null` until every required variable is set, so no handler can
run on a half-built config. Also exports `json()` / `noContent()` /
`notConfigured()` (all `Cache-Control: no-store`) and `secondsUntilExpiry()`,
which reads a JWT `exp` **without verifying the signature** (the backend
verifies; this only schedules a client refresh) and falls back to 300 s.

**Five route handlers**, all `export const dynamic = 'force-dynamic'`, all
returning `404 {"error":"logto_not_configured"}` while unconfigured:

| Route | Behaviour |
|---|---|
| `GET /sign-in` | `signIn(config, { redirectUri: ${LOGTO_BASE_URL}/callback })`; scopes and resource come from the config |
| `GET /callback` | `handleSignIn(config, new URL(request.url).searchParams)` then `redirect('/dashboard')` |
| `GET /sign-out` | `signOut(config, ${LOGTO_BASE_URL}/)` |
| `GET /api/auth/session` | `{ signedIn, profile? , error? }` — see below |
| `GET /api/auth/token` | `{ access_token, expires_in }` for `LOGTO_API_RESOURCE`, or 204 when signed out / the refresh token is dead |

No redirect target is ever read from a request parameter, so none of these can
be turned into an open redirect.

`/api/auth/session` is the only place the ID token exists in the frontend: it is
read from the encrypted cookie server-side and `POST`ed to the backend's
`/api/auth/login` (`Authorization: Bearer <id token>`, via `API_BASE_URL`). The
backend's `{ message, user }` body is narrowed to the `UserProfile` shape the
context expects (`department.name` → `department_name`). Backend 403 (the demo
gate) → `200 { signedIn: false, error: "forbidden" }`; a transport failure,
another non-2xx, or an unusable body → `502 { signedIn:false, error:
"profile_unavailable" }`.

**`AuthContext.tsx`.** Rewritten around `mode: 'dev' | 'logto' | 'none'`
(dev wins when both flags are set; `NEXT_PUBLIC_LOGTO_ENABLED === 'true'`
selects logto). `useAuth`, `withAuth`, `AuthProvider`, `UserProfile` and the
default export are unchanged; `AuthContextType` is now exported and keeps
`user`, `loading`, `profileLoading`, `error`, `isAuthenticated`, `isConfigured`,
`isDemoMode`, `login`, `logout`, `getToken`, `clearError`, and gains `mode` and
`signInWithProvider()`. `firebaseUser` was dropped (it was typed
`firebase/auth`'s `User`; no consumer read it — verified by grep).

- dev mode is byte-for-byte the old semantics: `DEV_AUTH_BYPASS` localStorage
  override gated on `isRuntimeBypassAllowed()`, the `dev_user` sessionStorage
  restore, the `Test123!` / `dont4get` password gate, `getToken()` → `user.id`.
- logto mode: on mount `fetch('/api/auth/session')` → profile, then
  `fetch('/api/auth/token')` → access token held in a **ref**, refresh scheduled
  at `max(expires_in - 60, 30)` s, timer cleared on unmount and sign-out; a
  non-200 from the token route signs the user out in state. `getToken()` returns
  the cached token, or fetches one on demand if a consumer asks before the mount
  fetch settles (so `api.setToken(...)` call sites keep working untouched).
- the old module-level `autoDevModeEnabled` flag is gone: it was redundant with
  the `DEV_AUTH_BYPASS` write that always accompanied it, and being module-level
  it leaked between tests. The 'none' branch now just writes the flag, which
  re-renders the provider into dev mode. In a production build with nothing
  configured it fails closed instead (no write, nobody signed in).
- `login(email, password)` throws *"Password sign-in is disabled…"* outside dev
  mode; `signInWithProvider()` navigates to `/sign-in`; `logout()` clears the
  token + state and navigates to `/sign-out` in logto mode.

**`login/page.tsx`.** Firebase error-code map deleted. In logto mode a single
`<a href="/sign-in" class="w-full luminous-button-primary py-3 text-base">Sign in
with your college account</a>` — a plain link, so it works without JS and cannot
carry a token in the URL, and it inherits the class's `focus-visible` ring. Dev
mode keeps the existing email/password form verbatim (the Playwright suites fill
it) plus a line naming the seeded accounts. Mode `none` shows an amber
"Sign-in is not configured" notice and **no credential form**. Provider errors
(e.g. the demo gate) surface in the existing `role="alert"` block. Residual
inert `dark:` utilities on this page were dropped and the two muted greys
darkened (`text-slate-400` → `text-slate-500`, amber text → `amber-900`) to stay
on the light-only AA palette.

**`useUserCourses.ts`** now takes `getToken` from `useAuth()`.
**`api.ts`**: `checkAuth()` deleted (no callers); `setToken` untouched.
**`frontend/.env.local.example`** (new; `frontend/.env.example` did not exist)
documents `NEXT_PUBLIC_LOGTO_ENABLED=false` and the commented server variables.
Confirmed trackable despite the `.env.*` ignore rule (`!.env.*.example`).

## SDK export names (verified against the installed typings)

`node_modules/@logto/next/lib/server-actions/index.d.ts` @ 4.2.11:
`signIn(config, options?)` (the `{ redirectUri }` object overload; the string
overload is deprecated), `handleSignIn(config, URLSearchParams | URL)`,
`signOut(config, redirectUri?)`, `getLogtoContext(config, params?)`,
`getAccessToken(config, resource?, organizationId?)`, and `export { default }`
= `LogtoClient`.

**There is no `getIdToken` export**, and `LogtoContext` (`@logto/node/lib/src/types.d.ts`)
carries `isAuthenticated`, `claims`, `accessToken`, `userInfo`, `scopes`,
`organizationTokens` — decoded claims but not the raw ID token, which the
backend needs to verify. The raw token comes from the Node client instead:
`new LogtoClient(config).createNodeClient()` (public in `client.d.ts`) returns
`@logto/node`'s client, which inherits `getIdToken(): Promise<Nullable<string>>`
from `@logto/client`. The SDK's own `getOrganizationTokens` uses the same
`createNodeClient()` path, so this is the supported seam.

## Verification

```
npm run lint      ✖ 83 problems (0 errors, 83 warnings)   [all pre-existing no-unused-vars /
                    exhaustive-deps warnings; none in the files touched here except the
                    pre-existing useUserCourses exhaustive-deps warning]
npm test          Test Suites: 16 passed, 16 total
                  Tests:       341 passed, 341 total      [coverage gate passed]
                  AuthContext.tsx  85.87 % stmts | 67.21 % branch | 63.33 % func | 90.32 % lines
                                   (pins: 70 / 55 / 60 / 70)
                  logto.ts         75.86 / 68.18 / 25 / 72.72   (no pin)
npm run build     ✓ Compiled successfully; ƒ /sign-in, ƒ /sign-out, ƒ /callback,
                  ƒ /api/auth/session, ƒ /api/auth/token all emitted as dynamic
npx tsc --noEmit -p tsconfig.json
                  333 lines, of which 327 are the repo-wide
                  "Property 'toBeInTheDocument' does not exist" jest-dom typing gap
                  (baseline on a clean tree: 319 — the delta is only the new assertions
                  in the rewritten AuthContext test). The 6 non-matcher errors are all
                  pre-existing and in files this task did not touch:
                    __mocks__/api.ts (2), e2e/sidebar-panels.spec.ts (4)
                  Zero errors in any file added or changed here.
```

Greps:

```
$ grep -rni firebase frontend/src frontend/package.json frontend/e2e
(no output, exit 1)
$ grep -c '"node_modules/firebase' frontend/package-lock.json
0
$ grep -rn "localStorage\|sessionStorage" frontend/src
ThemeContext.tsx (theme preference), AuthContext.tsx + its test
(DEV_AUTH_BYPASS flag, dev_user mock profile) — the same set as before,
no token writes. The logto test asserts the access token appears in neither store.
```

Commit trailer parses as a trailer:

```
$ git log -1 --format='%(trailers:key=Co-Authored-By)'
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

No personal email address appears anywhere in the change set.

Playwright was not run (it needs the whole stack). The dev-mode specs were not
modified: none of them referenced Firebase, and they drive the `/login`
email/password form, which dev mode still renders unchanged.

## Self-review

- **Route precedence.** `next.config.js` rewrites `/api/:path*` to the backend,
  but `rewrites()` returning a bare array is `afterFiles`, so the two new
  `/api/auth/*` handlers win. Confirmed by the build manifest listing them.
- **Auto-dev fallback timing.** In a dev build with nothing configured the
  provider writes `DEV_AUTH_BYPASS` inside the effect and re-renders into dev
  mode on the next pass, which then restores any stored session. Covered by a
  test; also the path the Playwright suites take on a fresh browser context.
- **Token never persisted.** Held in a `useRef`, cleared on unmount, sign-out
  and any non-200 refresh; asserted against both web storages in the tests.
- **`getToken` after sign-out** re-asks the server rather than serving a stale
  cached token (the server answers 204 once the cookie is gone). Tested.
- The demo-gate 403 is surfaced as `signedIn: false` — a visitor with a valid
  Logto session but no admissible Calricula identity is *not* signed in, which
  matches the backend re-checking the gate on every protected route.

## Concerns / follow-ups for later tasks

1. **Root env and compose are untouched** (Task 4's scope). `docker-compose.yml`
   and the root `.env.example` still pass `NEXT_PUBLIC_FIREBASE_*` to the
   frontend service and do not pass any `LOGTO_*`/`NEXT_PUBLIC_LOGTO_ENABLED`.
   Until that lands, a Docker frontend can only run in dev-picker mode.
2. **Docs still say Firebase**: `CLAUDE.md`, `AGENTS.md`, `README.md`,
   `CONTRIBUTING.md`, `RELEASE_CHECKLIST.md`, `SECURITY.md`.
3. `UserProfileResponse.firebase_uid` is still a computed alias on the backend
   response; nothing in the frontend reads it, so it can be dropped on the
   backend's schedule.
4. The e2e `loginAsUser` fixture is dev-mode-only by construction. A Logto
   smoke test would need a real tenant; out of scope here.
5. `tsc --noEmit` is not clean on this repo (jest-dom matcher types are not
   picked up, and `__mocks__/api.ts` drifted from `CourseListItem`). Worth a
   separate fix — `npm run build` runs its own stricter-scoped TypeScript pass
   and is green.

---

# Fix round 1 — review response

Commit `e70f16f` on `auth/logto-migration`
(`fix(auth): mint the access token on first demand; bound the login exchange; test the refresh timer`).
Not pushed. Files touched: `src/contexts/AuthContext.tsx`,
`src/contexts/__tests__/AuthContext.test.tsx`,
`src/app/api/auth/session/route.ts`.

## 1 (Important) — token fetcher available from the first render

Confirmed the finding, including the concrete path: `/lmi-data` renders
`useUserCourses({ cteOnly: true, autoFetch: true })`, whose effect has a static
dependency list, so the one unauthenticated fetch was also the last one.

`fetchAccessToken` is now a `useCallback(..., [clearRefresh, signedOut])` defined
in the component body, so it exists on the first render and `getToken()` closes
over the real fetcher rather than the `async () => null` stub. The ref survives
in a much smaller role — the refresh timer calls `fetchRef.current()` so the
fetcher does not have to list itself as a dependency — and is assigned from an
effect, which is safe because the timer cannot fire for at least 30 s. Added
alongside it:

- `inflightRef` de-duplicates concurrent callers, so a dashboard whose widgets
  all mount at once still issues a single `/api/auth/token` request;
- `mountedRef` replaces the per-effect `cancelled` flag for the token path, so
  the fetcher no longer captures an effect-scoped closure;
- the fetcher catches transport failures and returns `null` after signing out
  locally, instead of rejecting into call sites like
  `const token = await getToken(); if (token) api.setToken(token)`.

**Staleness.** `tokenRef` now holds `{ value, refreshAt }`, where `refreshAt` is
`Date.now() + refreshDelaySeconds(expires_in) * 1000` — the same instant the
timer is set for. `getToken()` returns the cached value only while
`Date.now() < refreshAt` and otherwise re-mints. Deriving the threshold from the
refresh schedule (rather than a fixed 60 s margin) keeps the two consistent and
degrades sanely for short-lived tokens, because `refreshDelaySeconds` floors at
30 s. `getToken` still returns a `Promise<string | null>`; `api.ts` and
`useUserCourses` are unchanged.

**Regression test.** `mints a token for a child that asks during its own mount
effect` renders `EagerTokenConsumer` — a descendant whose mount effect calls
`getToken()` — inside the provider and asserts it receives `at-eager` without
first waiting for `loading === false`. Verified it actually catches the bug:
stashing only the new `AuthContext.tsx` and running that one test gives
`✕ mints a token for a child that asks during its own mount effect` with an
empty received value; it passes with the fix.

## 2 (Minor) — refresh-timer tests

- `refreshes the access token before it expires`: `jest.useFakeTimers()`, mount
  with `expires_in: 120` (→ 60 s delay), assert one `/api/auth/token` call, then
  `act(() => jest.advanceTimersByTime(60_000))` and assert a second.
- `signs the user out when a scheduled refresh comes back non-200`: same setup,
  but the mutable route spec flips to 204 before the timer fires; asserts
  `isAuthenticated` → `false` and the user cleared.
- `re-mints a token that has entered its refresh margin`: covers the frozen-tab
  path from item 1 by moving `Date.now` past `refreshAt` (spy restored in a
  `finally`) and asserting `getToken()` returns the new token.

`mockAuthRoutes` now reads its spec object on every call, so a test can mutate
what a later request sees.

## 3 (Minor) — bounded backend exchange

`POST /api/auth/login` in the session route carries
`signal: AbortSignal.timeout(5000)` (`BACKEND_TIMEOUT_MS`). An abort is caught
by the existing `catch` and answered with the unchanged
`502 { signedIn: false, error: 'profile_unavailable' }`.

## 4 (Minor) — diagnosable backend outage

`bootstrap` now parses the session body even on a non-2xx response
(`.json().catch(() => null)`) and maps it to a message: `forbidden` →
demo-account text (unchanged), `logto_not_configured` → "Single sign-on is not
configured on this server…", `profile_unavailable` or any other non-ok →
"Could not reach the Calricula server to load your profile…". `/login` already
renders `error` from the context in its `role="alert"` block, so all three show
up there. Two tests cover the new messages.

## Verification after the fix round

```
npm run lint      ✖ 83 problems (0 errors, 83 warnings)  — unchanged from before the fix
npm test          Test Suites: 16 passed, 16 total
                  Tests:       347 passed, 347 total     (was 341; +6 new cases)
                  AuthContext.tsx  87.24 % stmts | 70.00 % branch | 70.58 % func | 90.96 % lines
                                   (pins 70 / 55 / 60 / 70; up from 85.87 / 67.21 / 63.33 / 90.32)
npm run build     ✓ Compiled successfully
npx tsc --noEmit -p tsconfig.json
                  6 non-jest-dom errors, all pre-existing and in files this task never
                  touched (__mocks__/api.ts ×2, e2e/sidebar-panels.spec.ts ×4).
                  Zero errors in any file added or changed by this task.
$ grep -rni firebase frontend/src frontend/package.json frontend/e2e
(no output, exit 1)
$ git log -1 --format='%(trailers:key=Co-Authored-By)'
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

## Note

The earlier concerns list is unchanged: root `.env.example` / `docker-compose.yml`
(Task 4), the six docs that still describe Firebase, the backend's
`firebase_uid` response alias, no Logto e2e coverage, and the repo's
pre-existing `tsc --noEmit` noise.
