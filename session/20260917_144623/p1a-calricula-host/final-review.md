# Final review — `feat/applicationx-host` (17e4805..9801432)

Reviewer: senior code review (architecture / security / accessibility). Read-only.
Inputs: plan `2026-09-17-p1a-calricula-host.md`, EMBEDDED-INTERFACE.md (§4 patched), TECHNICAL-SPEC §9, PRD AX-21, ADR-0001, ledger `progress.md`, `P1A-HOST-EXIT.md`, the review diff (read in five chunks), and working-tree context (`AuthContext.tsx`, `app/api/auth/token/route.ts`, `logto.ts`, `main.py` CORS, `PageShell.tsx`, `models/program.py`, `routes/programs.py`, jest/tailwind config). Suites were not re-run; ledger evidence taken as given (pytest 308 / 52.59 %, jest 415, build, lint 0 errors, Playwright 4 passed / 3 skipped + STUB_DOWN 1 passed).

Reviewed in three passes: (1) backend broker + routes + tests, (2) frontend lib/hook/components/pages/tests, (3) seams, docs, e2e, ledger and rulings.

---

## Strengths

- **Token transport ruling applied consistently end to end.** Broker docstring, `_upstream_token` dependency, `_headers()` (only `Authorization: Bearer <X-ApplicationX-Token>`, `Accept`, `X-Calricula-Host`, optional `X-Calricula-Service`, `Last-Event-ID`), `client.brokerHeaders`, adapter `resolveTokens`, SSE subscribe headers, stub docstring, `docs/APPLICATIONX-EMBED.md` and the spec §4 patch all say the same thing. The Calricula token is never forwarded. `AuthContext.getToken('applicationx')` exists on the base branch, is on-demand only, never signs the session out on failure, and dev mode returns the same `dev-*` id for both — exactly what the broker doc claims.
- **SSRF surface is closed.** Fixed `base_url` from settings, template paths only, `follow_redirects=False`, `run_id` validated as UUID (route param is typed `uuid.UUID` too), `source_id` against `[a-z_]{2,40}`, unknown operations 404, `host-contexts.resolve` explicitly excluded from `/ops`. Extra `path_params` keys are ignored.
- **Trusted program enrichment is real.** `resolve` loads `Program` from the DB and builds `program_ref` (`source_app`, `external_id`, `updated_at` as ISO UTC, `title`, `status.value`); `ResolveIn` accepts only `program_id`/`workspace_id`/`context_id`. `updated_at` is maintained on program edits (`routes/programs.py:428, 887`), so `context_stale` is reachable.
- **Error sanitisation and token hygiene.** Upstream 5xx → 502 with a fixed message, timeouts → 504, invalid JSON → 502, untyped 4xx → `{"detail": <fixed phrase>}`. No logging anywhere in broker/routes; `test_broker_error_never_echoes_token` checks the response text. CORS already allows `*` headers, so `X-ApplicationX-Token`/`Last-Event-ID` preflight works cross-origin in prod (3000 → 8000).
- **SSE proxy is thoughtfully built.** The pending-task keepalive pattern (and its comment explaining why `wait_for` would truncate the stream) is correct; the route primes the generator so a `BrokerError` before the first byte becomes a real HTTP status (tested); `_chain` guarantees `aclose()`; `X-Accel-Buffering: no`.
- **Frontend lifecycle discipline.** One `AbortController` per load, `latestContext` ref rejects late results, sign-out effect guarded by `authLoading`, disabled embed short-circuits before any broker call (tests prove `resolveContext`/`getProgram` are not called), Retry after `context_stale` re-fetches the program and resolves the fresh `id:updated_at` (tested). `getToken` recreation per render is handled via a ref in all three consumers.
- **Accessibility basics are right.** Named `region` for the banner, `role="alert"` only for `session_expired`/`service_unavailable`, `role="status"` for loading, `aria-labelledby` headings, `text-gold-ink` for small gold text, `sr-only` "(opens in a new tab)", `type="button"` on Retry, no second `<main>` (pages render inside `PageShell`), axe tests on three states, keyboard-reach e2e at 390 px. No `dark:` utilities introduced.
- **Honest test/e2e posture.** `test.fixme` blocks name the deferred Task 8 explicitly; `P1A-HOST-EXIT.md` records the gap and the broker/client 4xx mismatch rather than hiding it. `HostStatePanel` accepts only `HostFailure` and the "forced ready-shaped object" test proves it cannot leak workspace data.
- **Repo constraints honoured.** No personal email, no secrets, no `calricula_pwa_demo` changes, no tracked file links to `docs/applicationx/` (`README.md` → `docs/APPLICATIONX-EMBED.md` → `docs/AUTH-LOGTO.md`, all tracked), branding intact, coverage floors intact, fixtures lifted into `conftest.py` without behaviour change.

---

## Issues

### Critical

None.

### Important

**I-1. The upstream-4xx "typed `state`" passthrough relays the whole upstream body verbatim and is unreachable from the client — an inconsistent seam that also violates the "never relayed verbatim" constraint.**
- `backend/app/services/applicationx_broker.py:150-153` — `if isinstance(data, dict) and "state" in data: return resp.status_code, data`. Any key alongside `state` (debug text, ids, whatever the upstream puts in an error body) is returned untouched; `state` itself is not checked against the known set.
- `backend/app/api/routes/applicationx.py:126-128, 155-157` — that dict becomes `HTTPException(status_code, data)`, i.e. `{"detail": {...}}` with a 4xx status.
- `frontend/src/lib/applicationx/client.ts:53-56` — the client never reads `detail.state`; any 4xx other than 401 collapses to `service_unavailable` with "unexpected response", `retryable: false`. So a 403 `access_required` from upstream would render the wrong panel and the wrong copy. The exit checklist already lists this as "decide before the first real upstream is wired".
- Why it matters: the plan's Global Constraint says upstream error bodies are never relayed verbatim (typed-state exception); the exception as written has no field allowlist and no consumer, so today it is pure attack/leak surface with zero benefit.
- Fix (small, pick one): **(a)** delete the passthrough and treat every 4xx as untyped (the real ApplicationX returns host failures as 200, per the ledger); or **(b)** keep it but whitelist `{state, message, retryable}`, validate `state ∈ HostState`, coerce `message` to `str[:500]`, and make `client.resolveContext` read `detail.state` on 4xx. Add one broker test either way (`{"state":"access_required","debug":"token=abc"}` → `abc` absent).

**I-2. A valid Calricula session with no ApplicationX token is reported as "Your session has expired. Sign in again." — wrong message, wrong remedy.**
- `frontend/src/app/programs/[id]/collaboration/page.tsx:71-74`, `frontend/src/app/collaboration/page.tsx:53-56`, `frontend/src/lib/applicationx/adapter.ts:44-48` — `if (!calricula || !applicationx) → session_expired`.
- In Logto mode `getToken('applicationx')` returns `null` (deliberately, without signing out) when `LOGTO_APPLICATIONX_RESOURCE` is unset (`/api/auth/token?resource=applicationx` → 404) or the tenant refuses that resource. With `APPLICATIONX_EMBED_ENABLED=true` on the backend but the frontend env missing, every staff user sees an alert telling them to sign in again, which cannot fix anything. This is the most likely first-deploy misconfiguration and the docs only mention the variable in passing.
- Fix: when `calricula` is present and `applicationx` is null, resolve to `{ state: 'service_unavailable', retryable: false, message: 'ApplicationX sign-in is not configured for this deployment.' }` (or a dedicated copy in `HostStatePanel`), keep `session_expired` for the both-null case. Add the `LOGTO_APPLICATIONX_RESOURCE` requirement to the "Required when enabled" table in `docs/APPLICATIONX-EMBED.md` and the `.env.example` block. Two unit tests (page + adapter).

### Minor

**M-1. Keepalive task is cancelled but never awaited before the response is closed.** `applicationx_broker.py:189` `finally: pending.cancel()` then immediately exits `async with client.stream(...)`. `pending` is a Task still suspended in `aiter_bytes().__anext__()`; `resp.aclose()` can run before that task processes its cancellation. Works today (tests pass) but can log "Task was destroyed but it is pending" / race the underlying stream close. Fix: `pending.cancel(); await asyncio.gather(pending, return_exceptions=True)`.

**M-2. No upper bound on SSE proxy lifetime.** `read=None` plus a keepalive every 15 s means an upstream that never sends `done` holds a Calricula worker connection forever. Spec §4: "Bound payload size and request time". Add a max stream duration (e.g. `APPLICATIONX_STREAM_MAX_SECONDS = 600`) and emit `event: error / {"code":"stream_timeout"}` when hit.

**M-3. The 16 KiB body cap runs after FastAPI has already parsed `OpIn`, and only checks `Content-Length`.** `routes/applicationx.py:146`. A chunked request has no `Content-Length` and bypasses it; and by the time the check runs Calricula has already buffered/parsed the body. It protects upstream, not Calricula. Acceptable for P1a (browser `fetch` always sets `Content-Length`); note it in the doc or move to a dependency that reads `await request.body()` with a cap before model parsing. `ResolveIn` has no cap at all (only `context_id[:128]`).

**M-4. Production origin guard is string-based.** `config.py:180-186` accepts `https://user:pass@host`, `https://host?x=1`, `https://host#f`. Use `urllib.parse.urlsplit`: `scheme == "https"`, `netloc` non-empty, no `username`, and `path in ("", "/")`, no `query`/`fragment`.

**M-5. `run_id` is validated as a UUID but inserted raw.** `_path()` uses the caller's string; `uuid.UUID()` accepts `urn:uuid:…`, `{…}` and un-dashed hex. None of these traverse, but normalise anyway: `out = out.replace(..., str(uuid.UUID(value)))` for `run_id`. (Route `run_events` already normalises via the typed param; `/ops/chat.cancel` does not.)

**M-6. Cursor semantics differ across the seam.** Broker forwards `Last-Event-ID` only when `isdigit()` (`applicationx_broker.py:166`); `sse.ts` treats cursors as opaque strings and the adapter test uses `'cursor-7'`. A non-numeric upstream id would silently resume from the start (duplicate events). Either document "event ids are decimal integers" in `docs/APPLICATIONX-EMBED.md` and the types, or relax the broker to a safe charset (`[A-Za-z0-9._:-]{1,64}`).

**M-7. `client.resolveContext` returns `r.json()` unvalidated.** An unknown `state` (newer API) reaches `HostStatePanel`, whose `switch` has no `default`, so it renders a heading-less card and no alert — the opposite of EMBEDDED §6 "UI/API incompatibility … actionable status". Guard: if `state` is not in the known set, return `{ state: 'version_mismatch', message: 'ApplicationX returned a response this version of Calricula cannot display.', retryable: false }`. Add a `default:` branch to the panel.

**M-8. "Open in ApplicationX" in `ContextBanner` opens the standalone root, not the workspace.** `ContextBanner.tsx:36` uses `standaloneUrl` bare, while `adapter.openStandalone` uses `${standaloneUrl}/workspaces/${workspaceId}`. Spec §6: "standalone view of the same authorized workspace". The page has `resolution.workspace_id`; pass it and reuse one URL builder (`encodeURIComponent(workspaceId)` in the adapter too). Not an open redirect (server-configured base only).

**M-9. Status hook caches failures for 5 minutes.** `useApplicationXStatus.ts:38-46` stores `DISABLED_STATUS` from a network error / null token as a cache hit; one transient failure hides the nav entry and the program-page action for 5 min. Cache only successful responses (or use a short TTL for failures).

**M-10. `embedDisabled` and `ready` can render together.** In `programs/[id]/collaboration/page.tsx` the `ContextBanner` (line 149) and the "Workspace ready" section (line 174) are gated on `resolution.state === 'ready'` only. If the resolve completes before the status hook reports `enabled: false` (status null at mount), the "not enabled" card, the banner and the placeholder all show. Gate both on `!embedDisabled` (the panel already is).

**M-11. Client-disconnect cleanup of the SSE proxy is untested.** The ledger carried "client disconnect must reach the generator's finally" into Task 3; the route relies on Starlette's task-group cancellation plus async-generator finalisation, which is correct but has no test. Add one (`TestClient` with `stream=True`, close early, assert the mock transport's stream was closed / the generator's `finally` ran).

**M-12. Two small test-quality gaps.** `HostStatePanel.test.tsx` has no negative `role="alert"` assertion for `mapping_required`/`access_required`/`context_stale` (only the page tests cover `queryByRole('alert')` is null); and there is no e2e for case 2 even though the stub already answers `access_required` for `dev-articulation-001` (login as `TEST_USERS.articulation` → panel text, no region). Both are ten-line additions.

**M-13. Commit trailer.** All eleven commits carry `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` (the plan's wording) while `CLAUDE.md` says `Claude Opus 4.8 (1M context)`. Both use the noreply address, so the privacy rule is satisfied; flagging only so the squash-merge author line is chosen deliberately.

**M-14. Doc drift in the untracked planning set.** ADR-0001 "Context" still says the broker "forwards the signed-in Calricula user's bearer token to ApplicationX unchanged", and the plan's Global Constraint says the same; both are superseded by the two-token ruling that the spec §4 patch records. Patch the ADR/plan sentence so the next reader does not re-open the conflict.

---

## Deferred-minor triage

| Task | Deferred minor | Triage |
| --- | --- | --- |
| 1+2 | Stream errors after start are in-band `event: error` frames; `forward()` raises typed errors | **Stays deferred.** Inherent to SSE. Note for Task 8: `sse.ts` does not treat `error` as terminal, so after the broker's error frame the stream closes and the client reconnects up to 3× before giving up — the chat shell must render `error` as terminal. |
| 1+2 | `_is_uuid` could inline | Stays deferred (cosmetic; and M-5 suggests it should normalise, so keep the helper). |
| 3 | Missing `X-ApplicationX-Token` on a disabled embed → 401 before 503 | **Stays deferred.** Fail-safe; frontend short-circuits before calling; matches auth-before-flag precedent. |
| 3 | Unused `datetime` import + wrong `noqa` code in the test file | Stays deferred (cosmetic; lint is non-blocking). |
| 5+6 | Static `id="host-state-heading"` (use `useId`) | Stays deferred for P1a (one panel per page). Must change when Task 8 can mount a second panel. |
| 5+6 | No negative `role=alert` assertion | Stays deferred, folded into M-12 as a recommendation. |
| 5+6 | Loose selector-name regex (`/Programs/` matches "Go to Programs") | Stays deferred. |
| 5+6 | Pre-existing unused `useCallback` in PageShell | Stays deferred (out of scope). |
| 5+6 | `api.getProgram` not wired to the AbortController | Stays deferred — superseded results are discarded via `ctl.signal.aborted` checks; only wasted bandwidth. |
| 5+6 | Root `/collaboration` resolve uses `context_id: 'collaboration:root'` | Stays deferred (opaque id, ≤128 chars, upstream treats it as opaque). |
| 9 | Pre-existing `/programs` hard-load race (first fetch 401) | Stays deferred (pre-existing), but **file an issue** — it is a real bug users will hit on reload. |
| 9 | New "Back to program" link's e2e coverage only under `STUB_DOWN=1` | Stays deferred; unit test (9801432) covers it. |

Nothing in the deferred list needs to be fixed before merge.

---

## Rulings review

| Ruling | Verdict |
| --- | --- |
| T1 prod-guard test supplies valid OIDC settings + positive control | **Agree.** Without it the test passed for the OIDC reason; both tests now isolate the ApplicationX guard. |
| T2 implement the 15 s keepalive | **Agree.** Interface said it; implementation is correct (pending-task pattern) and tested with a stalled body. See M-1 for the settle-after-cancel nit. |
| Token transport: `Authorization` = Calricula token, `X-ApplicationX-Token` = only forwarded token | **Agree — this is the right call.** A single audience-bound token cannot satisfy both "validated by `get_current_user`" and "scoped to the ApplicationX resource". The base branch already provides `getToken('applicationx')` with correct failure isolation. Applied consistently (see Strengths). Follow-ups: I-2 (misconfig message) and M-14 (ADR/plan wording). |
| T8 deferred (package unpublished) | **Agree.** Any pin breaks the public CI install; the placeholder is honest and the e2e marks the gap. |
| T9 e2e: cases 4/6/9 fully, 1/8 to the banner with `fixme` chat blocks | **Agree.** The spec is honest; `fixme` is visible in reports. Recommend the cheap case-2 e2e (M-12). |
| T6 WorkspaceSelector = card + link to `/programs` | **Agree.** P2 owns the listing. |
| T6 Retry must reload the program and resolve the fresh context | **Agree, and it was the right severity.** Spec §5 says an edit is a new context; re-sending the old `context_id` would loop on `context_stale`. Implemented and tested. |
| T9 docs: tracked README → tracked `docs/APPLICATIONX-EMBED.md`; exit checklist stays untracked | **Agree.** Verified no tracked file links to `docs/applicationx/`. |
| Seeds: "Computer Science" (mapped) / "Business Administration Certificate" (unmapped) | **Agree.** |

---

## Recommendations

1. Fix I-1 and I-2 on this branch before opening the PR (both are under an hour with tests).
2. Bundle M-1, M-4, M-5, M-7, M-8, M-10 into the same fix commit if time allows — each is a few lines and all are in files this branch created.
3. Open follow-up issues for: M-2 (stream lifetime cap), M-6 (cursor charset), M-9 (failure caching), M-11/M-12 (tests), the pre-existing `/programs` hard-load race, and the Task 8 items (`useId` heading, `error` event terminal handling).
4. Before the first real upstream is wired, add to `docs/APPLICATIONX-EMBED.md`: `LOGTO_APPLICATIONX_RESOURCE` as required-when-enabled; that host failures are expected as 200 bodies; the event-id format; and that `X-Calricula-Service` is sent on every call including the SSE stream.
5. Patch ADR-0001 "Context" and the plan's Global Constraint sentence to the two-token model (untracked docs, no CI impact).

---

## Assessment

**Ready to merge? With fixes.**

The architecture matches the plan and the patched spec: the broker is a genuine allowlist proxy with a fixed origin, sanitised errors, trusted server-side enrichment and a correct SSE passthrough; the frontend gates the entry on the status endpoint, never sends browser program metadata, aborts and discards stale results, and clears on sign-out; accessibility and design constraints are met; tests exercise behaviour rather than mocks; and the deferred Task 8 is recorded honestly everywhere it matters. No Critical findings.

Two Important findings should land first because both are cheap and both touch what a deployer or a real upstream will hit on day one: the 4xx typed-state passthrough (I-1) is currently an unconsumed verbatim relay that contradicts a binding constraint, and a missing ApplicationX token is mislabelled as an expired session (I-2). With those two addressed (plus whichever of the small Minors are folded in), this branch is ready to stack on PR #36.
