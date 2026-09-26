# SDD ledger — plan: docs/applicationx/plans/2026-09-17-p1a-calricula-host.md
Branch: feat/applicationx-host (off auth/logto-migration @ 17e4805; PR will stack on #36). Spec: EMBEDDED-INTERFACE.md (§4 patched for ADR-0001), TECHNICAL-SPEC §9, PRD AX-21, ADR-0001. Test DB: disposable Postgres :5435 (calricula-test-db), never :5433.

## Pre-flight scan
| Pair / task | Produces vs consumes | Finding |
| T1 ↔ T2/T3 | `configured`/`as_faculty` fixtures in one test file; `settings.applicationx_ready` | consistent |
| T1 | prod-guard test constructs `Settings(ENVIRONMENT="production")` without OIDC_* | now raises for the OIDC guard regardless of origin → test passes for the wrong reason. Ruling below. |
| T2 | Interface says 15 s idle keepalive on `stream()`; the code block has none | inconsistency. Ruling below. |
| T2 ↔ T3 | `OPERATIONS`, `BrokerError(status, code, safe_message)`, `forward/stream` signatures | consistent; T3 `_FakeBroker` mirrors them |
| T3 | `resolve` returns an HTTPException instead of raising — plan text itself says fix it | apply the fix |
| T3 | tests use the app engine directly (conftest `db_session` shares `engine`), Program(type=AS, status=APPROVED → "Approved") | consistent with models |
| T3 ↔ spec §4 ↔ auth migration | spec: token "scoped to the ApplicationX API resource ... in the Authorization header", validated "with Calricula's existing auth dependency". `get_current_user` verifies aud == OIDC_AUDIENCE (Calricula), so an ApplicationX-audience token cannot pass it. Dev mode hides this (one dev token for both). | CONFLICT. Ruling below. |
| T4 ↔ T3 | client sends `Authorization` only | follows the T3 ruling: two headers |
| T4 ↔ T5/T6 | `useApplicationXStatus` → `{status, loading}`; `AXStatus.standalone_url` | consistent |
| T6 | WorkspaceSelector interface text argues with itself ("…? No — keep minimal") | Ruling: link to /programs only |
| T6 ↔ T7 ↔ T8 | types.ts/sse.ts local copies replaced by package re-exports in T8 | consistent |
| T7 | SSE subscribe with Authorization header | + X-ApplicationX-Token per T3 ruling |
| T8 | gated on `@applicationx/workspace-ui@0.1.x` published; it is not (private repo, no registry); an exact pin would break `npm install` in CI | Ruling below. |
| T9 ↔ T8 | e2e cases 1 and 8 assert chat answers that only exist with the package shell | Ruling below. |
| T9 | `e2e/fixtures/ccn-fixtures` exports TEST_USERS/loginAsUser | exists |

Ruling: T1 prod-guard test supplies valid OIDC_ISSUER/AUDIENCE/CLIENT_ID (distinct) so only the ApplicationX origin guard trips, plus a positive control (https origin constructs) — otherwise the test proves nothing. Cost if wrong: none.
Ruling: T2 implements the 15 s idle keepalive in `stream()` (yield `: keepalive\n\n` when upstream is silent) as the interface states. Cost if wrong: a few lines.
Ruling: broker token transport — `Authorization` carries the Calricula token (validated by `get_current_user`, unchanged); the upstream token (Logto access token for the ApplicationX resource, `getToken('applicationx')`) travels in `X-ApplicationX-Token` and is the only token forwarded; missing → 401 `{"code":"missing_upstream_token"}`. In dev mode both are the same `dev-*` token. Rationale: the spec's two sentences ("validate with the existing dependency" and "token scoped to the ApplicationX resource") cannot both hold with a single audience-bound token; two headers keep both guarantees without loosening Calricula's verifier. Spec §4 wording patched to match. Cost if wrong: a header rename in client + broker.
Ruling: T8 (package integration) is DEFERRED — the package is unpublished and any `package.json` pin (registry, private git, or `file:`) breaks a public CI build; the route keeps the "Workspace ready" placeholder and T8 runs as its own follow-up once `@applicationx/workspace-ui` is published. Cost if wrong: none (re-run T8 later).
Ruling: T9 e2e — cases 4, 6, 9 fully; cases 1 and 8 up to the context banner/keyboard reach of the placeholder, with the chat steps as `test.fixme` blocks referencing T8. P1A-HOST-EXIT records the gap. Cost if wrong: e2e edits when T8 lands.
Ruling: T6 WorkspaceSelector is a `luminous-card` with the sentence and a link to `/programs`; no program list. Cost if wrong: none (P2 replaces it).
Task 1+2 (batched): implementer af3108c26024be0d0 (sonnet), commits cafb9e9 (T1), 5266a8d (T2); 300 passed / 52.26 %. Implementer replaced the brief's `asyncio.wait_for` keepalive loop (closes the generator on first idle tick) with a pending-task pattern — reviewer confirmed correct.
Task 1+2: review (sonnet): Approved; 0 Important; 2 Minor. ⚠️ carried to Task 3: BrokerError raised inside `stream()` before the first yield must map to a non-200 response (prime the generator before building the StreamingResponse); client disconnect must reach the generator's finally.
Task 1+2: minor (deferred): stream errors after start are in-band `event: error` frames while forward() raises typed errors (UI must special-case); `_is_uuid` helper could inline.
Task 1: complete (commits 17e4805..cafb9e9, review clean)
Task 2: complete (commits cafb9e9..5266a8d, review clean)
Task 3: implementer aeab19a2b29154c98 (sonnet), commit b3dc9a7; 308 passed / 52.55 %.
Task 3: review (sonnet): Approved; 0 Important. minor (deferred): missing X-ApplicationX-Token on a disabled embed → 401 before 503 (fail-safe; matches auth-before-flag precedent); unused datetime import in the test file with a wrong noqa code.
Task 3: complete (commits 5266a8d..b3dc9a7, review clean)
Task 4+7 (batched): implementer aa30f1011435e3b91 (sonnet), commits 5f0471a (T4), d59a677 (T7); 385 jest, build ok, lint 0 errors. Client/adapter send Authorization + X-ApplicationX-Token; adapter maps null token → session_expired.
Task 4+7: review (sonnet): Needs fixes — 1 Critical (sources.health sent no source_id path param → broker 400), 2 Minor.
Task 4+7: fix round 1/5 (3 addressed, 0 open — sources.health path param + tests, eslint rationale via getTokenRef, GET ops body null; commits d59a677..4d424aa). Controller verified types.ts mirrors the package host/chat contracts and sse.ts carries the package's reconnect/CRLF logic.
Task 4: complete (commits b3dc9a7..5f0471a, review clean)
Task 7: complete (commits 5f0471a..4d424aa, review clean)
Task 5+6 (batched): implementer ad11c64a57dce6b27 (opus), commits dec9e38 (T5), 08c8ba2 (T6); 407 jest, build ok, lint 0 errors.
Task 5+6: review (opus): Approved with 1 Important (plan-mandated: context_stale Retry re-sends the old context_id — inherited from the brief's skeleton), 6 Minor.
Task 6: Ruling: fix the Important against the plan text — Retry must reload the program and resolve the new `id:updated_at` context (spec §5: a program edit is a new context); fold in Minor 1 (sign-out effect guarded by `loading`) and Minor 2 (disabled embed short-circuits to a "not enabled" message instead of calling the broker). Cost if wrong: small.
Task 5+6: minor (deferred): static heading id in HostStatePanel (useId); no negative role=alert assertion; loose selector name regex; pre-existing unused useCallback in PageShell.
Task 5+6: fix round 1/5 (3 addressed, 0 open — Retry reloads the program and resolves the fresh context; sign-out guarded by authLoading; disabled embed short-circuits; 8 page-level tests added; commits 08c8ba2..4c18b21). 415 jest, build ok, lint 0 errors.
Task 5+6: minor (deferred): `api.getProgram` not wired to the AbortController (superseded results discarded after await — pre-fix pattern); root `/collaboration` resolve uses `context_id: 'collaboration:root'` (broker truncates to 128; ApplicationX treats it as an opaque id).
Task 5: complete (commits 4d424aa..dec9e38, review clean)
Task 6: complete (commits dec9e38..4c18b21, review clean)
Task 8: DEFERRED by pre-flight ruling (package unpublished) — not dispatched.
Task 9: Ruling: the tracked README section points at a new tracked deployer doc `docs/APPLICATIONX-EMBED.md` (env, broker contract incl. the two-token headers, stub for local dev) — never at `docs/applicationx/` (untracked; I-3 ruling from the auth migration). `P1A-HOST-EXIT.md` and the `docs/applicationx/README.md` note are planning artifacts and go in the untracked folder. Seeds have no "Nursing"/"Certificate" pair: e2e uses "Computer Science" (mapped) and "Business Administration Certificate" (unmapped). Cost if wrong: doc paths.
Task 9: implementer a4a32202eb676f113 (opus), commit 8ffd7df; Playwright chromium 4 passed / 3 skipped (2 fixme chat blocks + case 9), STUB_DOWN=1 run 1 passed; pytest 308 / 52.59 %; jest 415; build/lint ok. Concern about 4xx typed states is moot: the real ApplicationX resolve returns host failures as 200 bodies (verified in applicationx/backend/app/api/host_contexts.py `_fail`).
Task 9: review (sonnet): Approved with 1 Important (added "Back to program" link under HostStatePanel — product change without a unit test), 1 Minor (case 8 exercises the banner link, not the new one).
Task 9: minor (deferred): pre-existing `/programs` hard-load race (first fetch 401 → "Authentication required"), worked around in the spec via sidebar navigation; new link's e2e coverage only under STUB_DOWN=1.
Task 9: fix round 1/5 (1 addressed, 0 open — page test for the Back-to-program link; commits 8ffd7df..9801432)
Task 9: complete (commits 4c18b21..9801432, review clean)
Final review (opus, final-review.md): 0 Critical, 2 Important (I-1 typed-state 4xx passthrough relays the whole body and the client never reads it; I-2 Calricula session + missing ApplicationX token reported as "session expired"), 14 Minor. All deferred minors stay deferred; rulings all agreed.
Ruling: fix wave = I-1 option (b) (whitelist {state,message,retryable}, validate state, client reads detail.state on 4xx), I-2, plus M-1 (await cancelled keepalive task), M-2 (stream lifetime cap), M-4 (urlsplit guard), M-5 (normalise run_id), M-6 (opaque cursor charset), M-7 (unknown state → version_mismatch + panel default), M-8 (Open in ApplicationX → workspace URL), M-9 (don't cache failures), M-10 (gate banner/placeholder on !embedDisabled), M-12 (negative alert assertions + case-2 e2e). M-3 (body cap before parsing), M-11 (disconnect test), M-13 (trailer) stay deferred; M-14 fixed by the controller in the untracked ADR/plan. Cost if wrong: small, tested.
Final fix wave: implementer aef511d039c32c95d (opus), commits 9801432..95d9890 (a14f454 backend, fae4c01 frontend, 95d9890 docs+e2e). Backend 331 / 52.71 %; jest 441; build; lint 0 errors.
Final re-review (opus, final-rereview.md): 12/12 addressed; 0 new Critical/Important; Minor N-1 `_EVENT_ID_RE.match` admits a trailing newline (use fullmatch; unreachable over HTTP), N-2 `ready` body unvalidated (pre-existing), N-3 persistent status failure refetches per mount.
Ruling: N-1/N-2/N-3 parked as deferred follow-ups (no second fix wave; N-1 is unreachable through real HTTP headers). Cost if wrong: one-line fix later.
Deferred follow-ups (from all reviews): M-3 body cap before parsing; M-11 SSE client-disconnect test; M-13 trailer choice; N-1..N-3; `/programs` hard-load 401 race (pre-existing); Task 8 package integration once @applicationx/workspace-ui is published.
Verification: live Playwright run of the e2e spec after the fix wave dispatched (host-impl-9 resumed).
Verification: live Playwright after the fix wave — 5 passed / 3 skipped (2 fixme chat blocks + case 9); STUB_DOWN=1 → case 9 passed. Processes stopped.
Final review: complete (commits 17e4805..95d9890, 14 commits; whole-branch review + one fix wave + scoped re-review + live e2e; 0 open Critical/Important; Task 8 deferred).
