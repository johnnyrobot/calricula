# Final re-review — `feat/applicationx-host` fix wave (9801432..95d9890)

Reviewer: senior code review, read-only. Inputs: `final-review.md`, `final-fix-report.md`,
`review-9801432..95d9890.diff` (read in five chunks), plus working-tree checks of
`e2e/fixtures/ccn-fixtures.ts` consumers, `backend/tests/stubs/applicationx_stub.py`,
`backend/app/core/oidc.py` (dev token map), `PageShell.tsx` nav entry,
`programs/[id]/page.tsx` Collaboration link, `HostStatePanel.tsx` tail, `types.ts`.
Suites not re-run; implementer's evidence taken as given (pytest 331 / 52.71 %, jest 441,
build OK, lint 0 errors). Commits: a14f454 (backend), fae4c01 (frontend), 95d9890 (docs + e2e).

---

## Per-finding verdicts

| # | Verdict | Where | Notes |
| --- | --- | --- | --- |
| I-1 | **Fixed** | `backend/app/services/applicationx_broker.py:36-48` (`HOST_FAILURE_STATES`, `_MESSAGE_MAX`), `:106-116` (`_typed_failure`), `:176-180` (call site); `frontend/src/lib/applicationx/client.ts:85-92` (`typedFailureFrom4xx`), `:130-141` | Projection is exactly `{state, message, retryable}`; `state` must be a `str` in the six failure states (`ready`/`loading`/non-string rejected); message `str()[:500]`, retryable `bool()`. Only runs inside `if resp.status_code >= 400`, so 200 resolutions are untouched (`return resp.status_code, data` unchanged). Client: the `r.status === 401` branch precedes the typed-4xx branch, so a real 401 from `get_current_user` (string `detail`) still maps to `session_expired`; a typed 401 also lands on `session_expired`. Unparseable/untyped 4xx keep the prior mapping. Tests: `test_upstream_4xx_typed_state_is_projected_to_allowlist`, `test_upstream_4xx_unknown_state_is_sanitized` (5 params), client I-1 + 3 negative `test.each` + unparseable body. |
| I-2 | **Fixed** | `client.ts:33-59` (`SESSION_EXPIRED_RESOLUTION`, `NOT_CONFIGURED_RESOLUTION`, `missingTokenResolution`); `adapter.ts:44-51`; `programs/[id]/collaboration/page.tsx:66-73`; `collaboration/page.tsx:52-59`; `docs/APPLICATIONX-EMBED.md` table row + paragraph; `.env.example`, `frontend/.env.local.example` | Ordering is right: no Calricula token wins (`session_expired`), Calricula present + ApplicationX null → non-retryable `service_unavailable` with the "not configured" copy. `request`/`subscribe` still throw `session_expired` (adapter discards `failure`) — acceptable, those paths are unreachable until Task 8. The `as string` casts after the null-check are sound. Tests: adapter ×2, program page ×2 (asserts no "Sign in again", no Retry, broker not called), `missingTokenResolution` ×3. |
| M-1 | **Fixed** | `applicationx_broker.py:236-239` | `pending.cancel(); await asyncio.gather(pending, return_exceptions=True)` in the inner `finally`, before `async with client.stream` exits. `gather(return_exceptions=True)` treats a cancelled child as a result, so it cannot raise from a normal cancel. Awaiting inside `finally` during `aclose()` is legal for async generators (no yield). |
| M-2 | **Fixed** | `config.py:102`; `applicationx_broker.py:196-197`, `:216-225`; `docs/APPLICATIONX-EMBED.md`; `.env.example` | Timer logic traced: loop top computes `remaining`; `<= 0` → timeout frame + `break`; wait uses `min(KEEPALIVE_SECONDS, remaining)`; on a timed-out wait re-checks the cap before emitting a keepalive. Worst case is one extra keepalive when the wait ends a hair short of the cap, then the frame on the next iteration — no spurious timeout, no keepalive after the frame, the `pending` task is always cancelled+awaited in `finally`. Frame text `event: error\ndata: {"code": "stream_timeout"}\n\n` matches the doc. Test caps at 0.1 s with a body that never finishes and asserts first chunk relayed, last chunk is the frame, no `done`, < 2 s. |
| M-4 | **Fixed** | `config.py:8`, `:183-197` | `urlsplit`: scheme `https`, non-empty netloc, `username`/`password` None, path in `("", "/")`, no query/fragment. Parametrised over 7 bad inputs (incl. `https://` and `""`); positive control kept. `parts.port` is never touched, so a malformed port cannot raise a non-`ValueError`. |
| M-5 | **Fixed** | `applicationx_broker.py:55-58`, `:100-101` | `_PARAM_NORMALIZE["run_id"] = str(uuid.UUID(v))` applied after `_PARAM_RULES` validation. Test covers hex, `urn:uuid:`, braced, upper-case → canonical path. |
| M-6 | **Fixed (with one Minor)** | `applicationx_broker.py:50-52`, `:193-194`; doc "opaque cursors" paragraph | Charset `[A-Za-z0-9._:-]{1,64}`; CRLF, space, 65 chars, empty, None rejected (9-case parametrised test). See N-1: `re.match` with `$` still admits a single trailing `\n`. |
| M-7 | **Fixed** | `client.ts:21-30` (`KNOWN_FAILURE_STATES`), `:61-72` (`asKnownResolution`), `:142-148`; `HostStatePanel.tsx:96-108` (`default:`) | Non-object / missing / unknown `state` → `VERSION_MISMATCH_RESOLUTION`; known failures normalised (`message` string-or-empty, `retryable === true`); `ready` passed through. 200 with invalid JSON → `version_mismatch`. Panel default renders the version_mismatch heading + copy + standalone link, no alert role (`isAlert` false). Tests: 3-case `test.each`, malformed message/retryable, panel unknown-state. |
| M-8 | **Fixed** | `client.ts:74-80` (`workspaceStandaloneUrl`); `ContextBanner.tsx:8-15`, `:19`, `:44`; `adapter.ts:104-107`; program page passes `resolution.workspace_id` | One builder; base is always the server-supplied `/status` `standalone_url` (prop threaded from `useApplicationXStatus`), never client-derived; `encodeURIComponent` on the id (`ws 1/2` → `ws%201%2F2`, `w 1/../x` → `w%201%2F..%2Fx`); trailing slash stripped. `HostStatePanel`'s own "Open in ApplicationX" still uses the bare root — correct, no workspace is resolved in a failure state. |
| M-9 | **Fixed** | `useApplicationXStatus.ts:38-47`, `:88-97` | `fetchStatus` → `null` on missing token / throw; cache written only `if (value)`; consumer sees `DISABLED_STATUS` for that render. Test proves the next mount refetches. No negative TTL, so persistent failure refetches on every mount — acceptable (one request per page). |
| M-10 | **Fixed** | `programs/[id]/collaboration/page.tsx:148`, `:174` | Both `ContextBanner` and the "Workspace ready" section now gated on `!embedDisabled`. Test renders ready with `status: null`, rerenders with `enabled: false`, asserts not-enabled card only and a single "Back to program". |
| M-12 | **Fixed (e2e not executed)** | `HostStatePanel.test.tsx:20`, `:28`, `:40`; `e2e/applicationx-embed.spec.ts:73-87`; `e2e/fixtures/ccn-fixtures.ts:21-25` | Negative `role="alert"` assertions on all three non-alert states. Case 2 mirrors case 1's navigation pattern (same `.first().click()` on the nav link, same `openProgram`), `dev-articulation-001` is the dev token for `articulation@calricula.com` (`AuthContext.tsx:146`, `oidc.py:49`) and is in the stub's `ACCESS_DENIED_BEARERS` (200 body, `access_required`). Nav entry is not role-gated (`PageShell.tsx:94-99`, `requiresApplicationX` only); the program-page Collaboration link is gated on `axStatus?.enabled` only. Panel copy "You do not have ApplicationX access for this organization." matches the regex. Assertions are consistent with what the unit tests prove for `access_required`. Spec compiles per report; a live run is still owed. |

---

## New breakage

### Critical

None.

### Important

None.

### Minor

**N-1. `_EVENT_ID_RE.match()` admits a trailing newline.** `applicationx_broker.py:52` uses `re.compile(r"^[A-Za-z0-9._:-]{1,64}$")` with `.match()`; Python's `$` also matches before a final `\n`, so `"abc\n"` passes (verified: `re.match(...).match('abc\n')` is truthy). Unreachable via real HTTP — uvicorn/h11 reject bare LF in header values on ingress, and h11 would reject it again on egress (caught as `httpx.HTTPError` → `upstream_unavailable`) — but the stated intent is "nothing header-injectable crosses", so use `re.fullmatch` or `\Z`. One-line change plus a `"a\n"` row in `test_stream_forwards_only_safe_opaque_cursors`.

**N-2. `asKnownResolution` passes a `ready` body through unvalidated** (`client.ts:64`). Already noted by the implementer; pre-existing, out of this wave's scope. A `ready` without `workspace_id` would reach `ContextBanner`/`workspaceStandaloneUrl` (`encodeURIComponent(undefined)` → `"undefined"`). Fold into Task 8 when the workspace types firm up.

**N-3. Every mount refetches `/status` while it keeps failing** (`useApplicationXStatus.ts:90`). Correct per M-9; if it becomes noisy, add a short (e.g. 15 s) negative TTL. Not blocking.

---

## Targeted checks requested

| Concern | Result |
| --- | --- |
| Stream cap fires keepalives/timeouts incorrectly or leaks tasks | No. Cap is checked at loop top and after each idle wait; wait is bounded by `min(KEEPALIVE, remaining)`; `pending` is cancelled and awaited in `finally` on every exit path (chunk exhaustion, timeout frame, exception, consumer `aclose()`). |
| Whitelist drops legitimate 200 resolutions | No. `_typed_failure` is only consulted for `status >= 400`; the 200 `return resp.status_code, data` is unchanged, and the stub/real upstream return host failures as 200. |
| Client 4xx typed-state branch turns a real 401 into something else | No. `if (r.status === 401) return SESSION_EXPIRED_RESOLUTION` precedes the 502/503/504 and typed-4xx branches; a typed 401 also resolves to `session_expired`. |
| `TEST_USERS.articulation` breaks other specs | No. All other consumers (`course-actions-simple`, `test-course-editor-navigation`, `navigation-test`, `sidebar-panels`, `test-course-actions`) reference `TEST_USERS.faculty` by key; nothing iterates the object; the `loginAs` fixture's `'faculty' \| 'chair' \| 'admin'` union remains a valid subset. Email/password match the seeded test users. |
| URL builder encodes and never accepts a client-supplied base | Yes. `workspaceStandaloneUrl(standaloneUrl, workspaceId)` — `standaloneUrl` comes only from `/status` (server config) via the status hook prop; `workspaceId` is `encodeURIComponent`'d; the builder is the single source for banner and adapter. |

---

## Out-of-scope observations

- Broker module docstring (`applicationx_broker.py:4-5`) still says "using the caller's own bearer token"; the two-token wording lives in the doc and route. Cosmetic; already noted by the implementer.
- `HostStatePanel` `data-host-state={state}` will surface an unknown state string verbatim in the DOM in the `default` branch — harmless (string attribute, no rendering), and `client.resolveContext` already maps unknowns before the panel sees them.
- Commit trailers on the three fix commits use `Claude Fable 5.1` (M-13 unchanged, deferred as agreed).
- M-3, M-11, M-14 remain open follow-ups as recorded in the fix report.

---

## Overall verdict

**Ready to merge.** All twelve findings in this wave are fixed as described, with tests that exercise the changed behaviour rather than mocks; no Critical or Important breakage was introduced. The single new Minor (N-1, `match` vs `fullmatch` on the cursor regex) is unreachable through real HTTP and can ride along with the M-3/M-11 follow-ups or be fixed in a one-line commit before the PR. The case-2 Playwright spec still needs one live run against the stub before the PR is marked green.
