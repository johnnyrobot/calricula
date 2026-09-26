# Task 5 report — Broker audience for the embedded workspace (host-plan hook)

## What changed

`AuthContext.getToken(resource?: 'calricula' | 'applicationx')` (default
`'calricula'`, existing callers unchanged) now mints and caches an access
token per API resource:

- **`calricula`** (default): unchanged behavior — cached in `tokenRef` with
  its own `refreshAt`, a background `setTimeout` schedules the next renewal,
  and any non-200 response signs the whole session out (`signedOut()`).
- **`applicationx`**: cached separately in a new `appTokenRef`, **on-demand
  only** — minted when asked, reused until its own `refreshAt` margin, and
  **no background refresh timer is ever scheduled for it**. A non-200
  response (204 signed-out, 404 not-configured, or a transport error) just
  clears `appTokenRef` and returns `null`; it never calls `signedOut()`, so a
  missing/unconfigured ApplicationX resource cannot break an otherwise-valid
  Calricula sign-in. `logout()` and `signedOut()` both clear `appTokenRef`
  too, so a real sign-out drops both tokens.

Both resources get independent in-flight de-duplication (`inflightRef` is now
keyed by resource instead of a single promise), so concurrent requests for
the two resources don't block each other.

`GET /api/auth/token` (`frontend/src/app/api/auth/token/route.ts`) now reads
`?resource=` (absent → `calricula`):
- unrecognized key → `400 {"error":"unknown_resource"}`
- recognized key, indicator not configured → `404 {"error":"resource_not_configured"}`
- signed-out session → `204` regardless of resource (never a token)
- all responses keep `Cache-Control: no-store`

The resource-key → indicator mapping and its validation live in a new pure
helper, `resolveResourceIndicator(resource, indicators?)`, in
`frontend/src/lib/logto.ts`, exported alongside a new `ResourceKey` type. It
takes an optional `indicators` override (defaulting to the module's
`LOGTO_API_RESOURCE` / `LOGTO_APPLICATIONX_RESOURCE`) so tests can exercise
"both configured" / "one missing" without touching `process.env`.

`frontend/src/lib/logto.ts` also gained:
- `LOGTO_APPLICATIONX_RESOURCE` (empty string when `LOGTO_APPLICATIONX_RESOURCE`
  env var is unset — optional, unlike the five required Logto vars).
- `logtoConfig.resources` includes the ApplicationX indicator only when it's
  set (`[LOGTO_API_RESOURCE, LOGTO_APPLICATIONX_RESOURCE]` vs.
  `[LOGTO_API_RESOURCE]`), so `@logto/next` only requests a token scoped to
  ApplicationX when that resource actually exists.

Docs: `docs/AUTH-LOGTO.md` §3 ("Register the Calricula API resource") gained
a paragraph on `LOGTO_APPLICATIONX_RESOURCE` and `getToken('applicationx')`
(and corrected the stale "not read by any route yet" line, since the token
route now serves it). `frontend/.env.local.example` gained the matching
optional-var block (the project-root `.env.example` / `.env.production.example`
already had it from Task 4).

The brokered adapter (`createBrokeredAdapter`, backend forwarding) stays out
of scope — that's the host plan's Task 7 / Task 2, as the brief specifies.

## Tests (TDD)

Added first, confirmed red, then made green:
- `frontend/src/lib/__tests__/logto.test.ts`: `resolveResourceIndicator` —
  defaults absent key to calricula, resolves applicationx when configured,
  rejects an unknown key, reports a recognized-but-unconfigured key, and
  falls back to (empty) module-level indicators. Plus a check that
  `LOGTO_APPLICATIONX_RESOURCE` is `''` when unset.
- `frontend/src/contexts/__tests__/AuthContext.test.tsx`: extended
  `mockAuthRoutes`/`RouteSpec` to route by `resource=applicationx` in the
  query string; added a `get-app-token` button/`app-token` span to the test
  `Consumer`. New cases: `getToken('applicationx')` fetches
  `/api/auth/token?resource=applicationx` and caches independently of the
  calricula token; returns `null` on 204 without signing out; returns `null`
  on 404 (not configured) without signing out; and — via `jest.getTimerCount()`
  before/after minting the ApplicationX token, plus counting
  `resource=applicationx` fetch calls across a 120s fake-timer advance — no
  background refresh is ever scheduled for it.

Before implementing, all 10 new tests failed (missing exports / wrong
`getToken` behavior); confirmed with `npx jest ... --coverage=false`.

## Verification output

- `npx jest src/lib/__tests__/logto.test.ts src/contexts/__tests__/AuthContext.test.tsx --coverage=false`:
  `Test Suites: 2 passed, 2 total` / `Tests: 44 passed, 44 total`.
- `npm test` (full suite, coverage gate on): `Test Suites: 16 passed, 16 total`
  / `Tests: 357 passed, 357 total`; `AuthContext.tsx` coverage
  87.01/69.51/70.58/90.47 (stmts/branch/fn/line), above the pinned floor
  (55/60/70/70); no threshold failures.
- `npm run lint`: `0 errors, 83 warnings` — all 83 warnings pre-existing in
  untouched files (unused-import/exhaustive-deps warnings), none in files
  this task touched.
- `npx eslint <5 touched files>`: no output (clean).
- `npx tsc --noEmit`: same set of pre-existing error *kinds* before and after
  (`diff` of unique error messages across touched files is empty); the only
  count change is +13 occurrences of an existing repo-wide `toHaveTextContent`
  typing gap (jest-dom matchers not visible to bare `tsc`, present in this
  test file and others before this change), from the assertions the new
  tests add — confirmed via `git stash`/`git stash pop` before/after
  comparison. No new error type introduced.
- `npm run build`: succeeds, including Next's own internal TypeScript pass
  (`Finished TypeScript in 4.5s`) and route generation
  (`/api/auth/token` listed as `ƒ` dynamic, as before).

## Trailer verification

`git interpret-trailers --parse` on the drafted commit message returned
exactly:
```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```
confirming it parses as a trailer. Committed as its own final paragraph.

## Files changed

- `frontend/src/lib/logto.ts`
- `frontend/src/app/api/auth/token/route.ts`
- `frontend/src/contexts/AuthContext.tsx`
- `frontend/src/contexts/__tests__/AuthContext.test.tsx`
- `frontend/src/lib/__tests__/logto.test.ts`
- `frontend/.env.local.example`
- `docs/AUTH-LOGTO.md`

Commit: `bd8b533` on `auth/logto-migration` (not pushed).

## Concerns

- None blocking. Two judgment calls worth flagging for the host-plan
  reviewer:
  1. In dev-bypass mode, `getToken('applicationx')` returns the same
     `dev-*` mock id as `getToken('calricula')` (there's no separate dev
     identity concept for a second resource) — reasonable for local dev, but
     the host plan's broker should not assume the dev token is
     audience-scoped the way a real Logto token is.
  2. `resolveResourceIndicator` validates the `resource` query param before
     checking `isAuthenticated`, so an unknown/unconfigured resource key gets
     400/404 even for a signed-out visitor (rather than 204). This matches
     the brief's ordering implicitly (the 204 rule is about not leaking a
     *token*, not about response codes for a malformed request) but is worth
     a second look if the host plan's broker treats "any non-200" uniformly.
- `docs/applicationx/` and `session/` were already untracked at the start of
  this task (pre-existing, out of scope) and were left untouched/unstaged.
