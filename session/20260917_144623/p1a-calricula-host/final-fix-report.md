# Final-review fix report — `feat/applicationx-host`

Base: `9801432`. Commits: `a14f454` (backend), `fae4c01` (frontend), `95d9890` (docs + e2e). All three end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Per finding

### I-1 — typed 4xx passthrough (option b)
- `backend/app/services/applicationx_broker.py`: `HOST_FAILURE_STATES` (the six failure states), `_typed_failure()` projects an upstream 4xx dict to exactly `{state, message, retryable}` — `state` must be a string in the set, `message` → `str(...)[:500]` (`""` when absent), `retryable` → `bool(...)`. Anything else takes the existing `{"detail": <safe code>}` path. Route behaviour unchanged (`HTTPException(status, data)` → `{"detail": {state, message, retryable}}`).
- `frontend/src/lib/applicationx/client.ts`: on a non-401/502/503/504 4xx, `resolveContext` parses the body and, when `detail.state` is a known failure state, returns that resolution (normalised); otherwise the existing `service_unavailable` mapping.
- Tests: `test_upstream_4xx_typed_state_is_projected_to_allowlist` (`{"state":"access_required","debug":"token=abc"}` → keys exactly `{state,message,retryable}`, `abc` absent, message length 500, `retryable:"yes"` → `True`); `test_upstream_4xx_unknown_state_is_sanitized` (`ready`, `loading`, `pwned`, `42`, `None`). Client: typed-4xx → resolution; unknown state / string detail / no detail / unparseable body → existing mapping.

### I-2 — missing ApplicationX token mislabelled as session expired
- `client.ts`: `missingTokenResolution(calricula, applicationx)` — no Calricula token → `SESSION_EXPIRED_RESOLUTION`; Calricula present + ApplicationX null → `NOT_CONFIGURED_RESOLUTION` = `{ state: 'service_unavailable', retryable: false, message: 'ApplicationX sign-in is not configured for this deployment.' }`; both present → `null`. Used by `adapter.resolveTokens` (resolveContext returns it; `request`/`subscribe` still throw `session_expired`) and both pages.
- `docs/APPLICATIONX-EMBED.md`: `LOGTO_APPLICATIONX_RESOURCE` added to the required-when-enabled table plus a paragraph on the symptom. `.env.example` and `frontend/.env.local.example` (the file that carries the frontend `LOGTO_*` vars) now mark it required when the embed is enabled.
- Tests: adapter (`not configured` when only the AX token is missing; `session_expired` when both missing), program page (`data-host-state="service_unavailable"`, copy present, no "Sign in again" link, no Retry, broker/getProgram not called; both-null → `session_expired`), `missingTokenResolution` unit tests.

### M-1 — keepalive task settle
`finally: pending.cancel(); await asyncio.gather(pending, return_exceptions=True)`. Covered by the existing keepalive/stream tests plus the new timeout test.

### M-2 — stream lifetime cap
`APPLICATIONX_STREAM_MAX_SECONDS: float = 600.0` in `config.py`; broker tracks `time.monotonic()` and, when the cap is hit (checked at the loop top and after an idle wait), yields `event: error\ndata: {"code": "stream_timeout"}\n\n` and stops. Test `test_stream_stops_with_stream_timeout_after_max_seconds` (cap 0.1 s, keepalive 0.02 s, body that never finishes; asserts first chunk relayed, last chunk is the timeout frame, no `done`, returns < 2 s). Documented in the doc table and `.env.example`.

### M-4 — production origin guard
`urlsplit`: scheme `https`, non-empty netloc, `username`/`password` None, path in `("", "/")`, no query/fragment. Test parametrised over `http://…`, `https://user:pw@host`, `https://host?x=1`, `https://host#frag`, `https://host/v1`, `https://`, `""`; positive control unchanged.

### M-5 — run_id normalisation
`_PARAM_NORMALIZE["run_id"] = str(uuid.UUID(v))` applied in `_path()`. Test: `hex`, `urn:uuid:`, braced and upper-case forms all produce the canonical dashed lowercase path.

### M-6 — Last-Event-ID as opaque cursor
Forwarded when it matches `^[A-Za-z0-9._:-]{1,64}$`. Test parametrised (`1`, `cursor-7`, `evt_01J8:abc.def`, 64 chars OK; 65 chars, space, CRLF injection, empty, None dropped). Stub's numeric ids still pass. Documented ("opaque cursors") in `docs/APPLICATIONX-EMBED.md`.

### M-7 — unknown state
`client.resolveContext`: non-object / missing / unknown `state` → `VERSION_MISMATCH_RESOLUTION` (`'ApplicationX returned a response this version of Calricula cannot display.'`, `retryable:false`); known failure states are normalised (`message` string-or-empty, `retryable === true`); `ready` is passed through unchanged (as before). `HostStatePanel` gets a `default:` branch rendering the same heading as `version_mismatch` and that copy. Tests: client `test.each` (unknown state, missing state, string body) + malformed message/retryable; panel unknown-state test (heading present, copy present, standalone link).

### M-8 — Open in ApplicationX → workspace
`workspaceStandaloneUrl(standaloneUrl, workspaceId)` exported from `client.ts` (trailing-slash tolerant, `encodeURIComponent`). `ContextBanner` takes a `workspaceId` prop and uses it; `adapter.openStandalone` uses the same builder; program page passes `resolution.workspace_id`. Tests: ContextBanner (href `/workspaces/ws-1`, encoding), adapter (encoding + trailing slash), page (`https://ax.example.edu/workspaces/ws%201%2F2`), builder unit tests.

### M-9 — status hook caches only successes
`fetchStatus` returns `null` on any failure; `cache` is written only for a value; consumers get `DISABLED_STATUS` for that render. Test: rejected fetch → `enabled:false`, next mount refetches (`getStatus` called twice) and reports `enabled:true`.

### M-10 — program page gating
`ContextBanner` and the "Workspace ready" section are gated on `!embedDisabled && … ready`. Test: status `null` at mount, ready resolution renders both; rerender with `enabled:false` → not-enabled card, no banner, no workspace region, one "Back to program" link.

### M-12 — test gaps
`HostStatePanel.test.tsx`: `queryByRole('alert')` is null for `access_required`, `mapping_required`, `context_stale`. e2e case 2 added to `frontend/e2e/applicationx-embed.spec.ts` (login as `TEST_USERS.articulation` → "You do not have ApplicationX access" on `/collaboration` and on the mapped program's collaboration page; no `Workspace context` region; no ask box; "Back to program" visible). `TEST_USERS.articulation` added to `e2e/fixtures/ccn-fixtures.ts`. **The live e2e stack was not executed**; the spec type-checks (`npx tsc --noEmit -p .` reports no errors in `e2e/applicationx-embed.spec.ts` or `ccn-fixtures.ts`; the remaining tsc output is pre-existing jest-dom typing noise in unrelated test files).

## Commands and results

```
cd backend && DATABASE_URL=postgresql://postgres:postgres@localhost:5435/calricula venv/bin/python -m pytest -q -p no:cacheprovider
  331 passed, 1 warning in 3.71s
  Required test coverage of 45% reached. Total coverage: 52.71%

cd frontend && npm test
  Test Suites: 28 passed, 28 total
  Tests:       441 passed, 441 total

cd frontend && npm run build
  (compiled; route table printed, no errors)

cd frontend && npm run lint
  ✖ 83 problems (0 errors, 83 warnings)   # all pre-existing warnings
```

## Self-review (`git diff 9801432..HEAD`)

- 22 files, +599/−89. No changes under `calricula_pwa_demo/`, `docs/applicationx/`, `session/`, `backend/serviceAccountKey.json`; no port changes; no personal email; no secrets. Tokens are never logged or placed in URLs/storage; the new broker code adds no logging.
- Noted but left as-is: `asKnownResolution` passes a `ready` body through without shape validation (pre-existing behaviour; M-7 scoped to unknown states). Broker module docstring still says "using the caller's own bearer token" (pre-existing wording, not in scope).
- Process note: during the frontend step one `git checkout 9801432 -- client.ts` (intended as a baseline comparison) reverted my in-progress `client.ts`; it was caught immediately via `git status`, re-applied identically, and verified by the tests before committing. No other files were affected.

## Not done

- M-3, M-11, M-13, M-14 — not in this wave's list.
- Live Playwright run for the new case 2 — not executed (per instructions); spec compiles.
