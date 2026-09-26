# SDD ledger — plan: /Users/laccd/code/calricula/docs/applicationx/plans/2026-09-17-p1a-applicationx-service-and-package.md

Repo: /Users/laccd/code/applicationx, branch main at a3f17cb (P0 complete). Owner chose direct commits to main for P0; continuing the same way for P1a (same repo, same owner instruction "work on the P1a service plan"). Trailer stays `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` (plan Global Constraint).
Spec: TECHNICAL-SPEC §4/§7/§9/§10, EMBEDDED-INTERFACE §3–§7, PRD §3/§7/§10 (Calricula docs/applicationx/), reachable.
Environment (2026-09-18): Docker 29.8 present (db service on 5434 not yet started); NO psql/createdb on host; Python 3.12 venv; Node 22; firebase-admin latest 7.6.0 (plan pins 7.4.0), slowapi latest 0.1.10 (plan pins 0.1.9); vitest config includes only *.test.ts with no DOM env; Playwright browsers not cached.

## Pre-flight scan

| Pair / task | Produces vs consumes | Finding |
| --- | --- | --- |
| T1 self | conftest needs DB `applicationx_test`; plan uses host `createdb` | No client tools on host. **Gap.** |
| T1→all | conftest env DATABASE_URL set before settings import; app.core.database.engine reads settings at import | Consistent as long as conftest is imported first (pytest does). Clean. |
| T1→T8 | client fixture overrides get_session; runs.execute_run opens Session(engine) | Background task sees committed rows; session fixture truncates after test. Clean. |
| T2 self | monkeypatch on pydantic BaseSettings attrs | Allowed (no frozen). Clean. |
| T4 self | firebase-admin==7.4.0 | 7.6.0 is latest; 7.4.0 may exist. Nearest-available rule applies. |
| T7→P0 fixtures | cards.py field names (`units`, `prerequisites`, `sections[].days_times`) vs P0 fixtures (`minimumCredit`/`maximumCredit`, `requisites[]`, search has `status` but no `observed_at`) | **Conflict.** Fixtures/Go structs are the authority. |
| T7 self | test asserts observed_at on every citation containing "section"; schedule.search results have no observed_at and live provenance has none | **Conflict.** |
| T7 self | interface says catalog → search then get/prerequisites for top hit; `_plan` returns only catalog.search | **Gap.** |
| T7 self | class named `Warning` shadows builtin | Style hazard. |
| T7→T9 | campus.search referenced before Task 9 registers it | Plan acknowledges; campus test path lands in T9. Clean. |
| T8 self | slowapi decorator limits 20/min; full suite posts >20 messages within a minute | **Conflict** (spurious 429s). |
| T8 self | `_owns` lets any public principal read any public run by id | Plan design (unguessable UUID, 30-min expiry). Accepted; note for P1b. |
| T9→T7 | execute(..., session=) kwarg + IN_PROCESS map | Extends P0 execute; keep runner kwarg. Clean. |
| T9 self | migration numbering 0003 evidence vs File Structure 0003 rls | Tasks win: 0003_p1a_evidence, 0004_p1a_rls. |
| T10 self | RLS test skipped without role DSN; migration creates role (needs superuser: docker postgres is) | Clean. |
| T11 self | tsx tests need jsdom; `import './theme/tokens.css'` not emitted by tsc | **Gap.** |
| T12→T13 | T12 Step 4 runs `seeds.seed_dev` which T13 creates | **Conflict** (order). |
| T12 self | Next 16.2.9 + Playwright need network installs; API must run with DB during e2e | Feasible locally. |
| T13 self | isolation test uses `dev-student-000` expecting 401 | DEV_TOKENS excludes it → 401 per T2. Clean. |
| P0→T3/T11 | HostResolution/ChatAnswer shapes vs TS contracts | Python Clarification carries extra `prompt`; zod objects strip unknown keys. Clean. |

## Rulings (pre-flight)

- Ruling: conftest creates `applicationx_test` itself when missing (psycopg2 connect to the `postgres` maintenance DB, autocommit, CREATE DATABASE) — no host client tools; `docker compose up -d db` is the only manual step. Cost if wrong: a few lines in conftest.
- Ruling: nearest-available versions for firebase-admin/slowapi if the plan's pins are absent; substitutions listed in the report.
- Ruling: cards.py maps evidence from the real P0 fixture field names — units from `minimumCredit`/`maximumCredit` (single value or range), requisites from `catalog.prerequisites.requisites[]`, search rows as they are; fixtures are the authority. Cost if wrong: field mapping only.
- Ruling: `observed_at` for evidence = `provenance.observed_at`, else the time the connector returned when `source_mode == "live"` (a live fetch is an observation at that instant), else None. Cost if wrong: timestamp semantics, documented in cards.py.
- Ruling: the catalog plan is dynamic — after `catalog.search` returns rows, run `catalog.get` and `catalog.prerequisites` for the top hit's id (max 1). Cost if wrong: two extra replay calls.
- Ruling: the warning model is named `AnswerWarning` (fields unchanged) to avoid shadowing the builtin. Cost if wrong: a name.
- Ruling: rate limits come from settings (`RATE_LIMIT_PUBLIC="20/minute"`, `RATE_LIMIT_USER="60/minute"`), the limiter reads them at request time, conftest sets both to "10000/minute", and one test lowers the public limit to "2/minute" and asserts a 429 on the third call. Cost if wrong: config plumbing.
- Ruling: Task 12 creates `backend/seeds/{__init__,seed_dev}.py` to Task 13's interface (Task 13 extends/verifies); Task 13 owns isolation tests, compose, CI and the exit doc. Cost if wrong: ownership of one file.
- Ruling: vitest gains `environment: 'jsdom'` for `*.test.tsx` (parity test keeps node via `// @vitest-environment node`), and `build` copies `src/theme/tokens.css` into `dist/theme/`. Cost if wrong: config lines.
- Ruling: migrations are 0001 identity, 0002 chat, 0003 evidence, 0004 rls (task text over the File Structure sketch).
Task 1: implementer a4d6165528d957a6b, commit 156dee6, DONE_WITH_CONCERNS (conftest sets DATABASE_URL transiently rather than setdefault because test_config asserts the default).
Task 1: review: Approved, 0 Important, 2 Minor. Ruling: the transient DATABASE_URL steering in conftest is accepted (brief's literal setdefault broke a P0 test); note that datetime columns are TIMESTAMP WITHOUT TIME ZONE (autogenerate) and Task 2's expiry compare already normalizes tzinfo.
Task 1: minor (deferred): unused `import uuid` in test_models.py (plan text); script.py.mako not called out in the report.
Task 1: complete (commits a3f17cb..156dee6, review clean)
Task 2: implementer aa44ac0b85dab1f84, commit ea337e6, DONE (firebase-admin 7.6.0; 7.4.0 requested).
Task 2: review: Needs fixes — 1 Important (plan-mandated: org_roles excludes revoked but not expired memberships; untested), 4 Minor. ⚠️ production guard verified by controller (config.py rejects AUTH_DEV_MODE in production); ⚠️ empty bearer → 401 (fails closed).
Task 2: Ruling: org_roles applies the same active-membership predicate as authorize_workspace (not revoked, not expired) via a shared helper; tests cover org_roles for active/revoked/expired. Also widen the Firebase except to `auth.CertificateFetchError`/`FirebaseError` → AuthError(503/401) so cert-fetch failures are typed. Cost if wrong: a predicate and an except clause.
Task 2: minor (deferred): unlocked lazy firebase init; _provision commits inside a dependency; semicolon one-liner style (plan text).
Task 2: fix round 1/5 (2 addressed, 0 open — shared active predicate, typed Firebase errors; commits ea337e6..81b8f68)
Task 2: complete (commits 156dee6..81b8f68, review clean)
Task 3: implementer adfde214866762277, commit 4a53b44, DONE_WITH_CONCERNS. Ruling: the ISO-revision guard runs after a mapping is found (before the string compare), not before the lookup — the brief's own test requires mapping_required to win for an unmapped program with a garbage revision; my dispatch note was wrong, the implementer's placement stands. Cost if wrong: order of two failure states.
Task 3: review: Approved, 0 Important, 3 Minor. ⚠️ non-UUID workspace_id → 422 (request-shape error, accepted).
Task 3: minor (deferred): no explicit tests for cross-org workspace_id or mapped-but-not-member; program_ref precedence over workspace_id undocumented; 422 for malformed ids.
Task 3: complete (commits 81b8f68..4a53b44, review clean)
Task 4: implementer a3d60ba8a9ec76349, commit 5d6fe77, DONE (google-genai 2.24.0).
Task 4: review: Needs fixes — 2 Important: trailer not git-parseable (no blank line before it); GeminiGateway.draft raises untyped on malformed/blocked responses. 3 Minor.
Task 4: Ruling: amend the unpushed commit so the trailer is a proper trailer block; add `class ModelError(Exception)` in model_gateway.py — GeminiGateway.draft wraps SDK exceptions, a None/empty `resp.text` and Draft validation failures into ModelError (message content-free); the pipeline (Task 7) maps ModelError to a degraded answer with warning code `model_unavailable`. Cost if wrong: one exception type.
Task 4: minor (deferred): unused `Draft` import in the test (plan text); two lazy imports; google-genai unpinned (plan text `>=1.0.0`).
Task 4: fix round 1/5 (2 addressed, 0 open — amended trailer (5d6fe77→241641d, identical tree), ModelError; commits 241641d..c16a60b)
Task 4: complete (commits 4a53b44..c16a60b, review clean)
Task 5: implementer a07dc49c7ca8653f1, commit 0ac0367, DONE.
Task 5: review: Approved; 2 Important flagged forward (not this task's defects): naive DateTime columns mean Task 8 expiry filtering must normalize tz; FKs have no ON DELETE so the P2 purge job must delete children first. 1 Minor.
Task 5: Ruling: carry both forward — Task 8 dispatch note requires tz-normalized expiry comparisons and a test that an expired public conversation is refused; FK cascade decision deferred to the P2 purge-job task (roadmap note). Cost if wrong: a migration later.
Task 5: complete (commits c16a60b..0ac0367, review clean)
Task 6: implementer a32470102ec508b72, commit 301b26e, DONE (report misstates full-suite count as 52; controller ran it: 336 passed, 93.73%).
Task 6: review: Approved with 1 Important (plan-mandated: a single explicit different-campus mention with a prior campus is silently ignored — neither switch nor ask), 2 Minor. Probes (b)–(i) all as expected.
Task 6: Ruling: resolve_slots asks when exactly one campus is mentioned and it differs from the prior — Clarification(slot="campus", choices=[found, prior], prompt "Switch to <found> or keep <prior>?") with the scope left on the prior; a mention equal to the prior is a no-op. To let the user accept the switch explicitly, Task 8's `scope_hint` on an existing conversation overrides the stored scope for that turn (explicit choice ≠ silent), Task 7's PipelineInput receives the merged scope as `prior_scope`, and Task 11's ClarificationChips resend with `scope_hint={slot: value}`. Cost if wrong: one branch and a hint-merge rule.
Task 6: minor (deferred): bare "transfer" is not a transfer trigger (only "transfer to"); report misstated suite count.
Task 6: fix round 1/5 (1 addressed, 0 open — explicit-campus clarification; commits 301b26e..2189385)
Task 6: complete (commits 0ac0367..2189385, review clean)
Task 7: implementer a7818628239eded5f (opus), commit 7e6d837, DONE with concerns. Ruling: prerequisites evidence id follows P0's committed spelling `elumen:course:{id}:prereqs` (my ruling said `:requisites`; P0 registry and normalized fixtures win) — to be fixed in the review round. Ruling: the brief's hard-coded "MULTIMD" subject fallback is dropped in favour of a typed invalid_parameters partial (never fabricate a parameter). Catching only ModelError from the gateway is per its contract — accepted.
Task 7: review (opus): Needs fixes — 4 Important in validate/pipeline: (1) requisite strings not validated (plan text says likewise); (2) seat regex misses "N open seats"/"Seats: N"; (3) waitlist_total pooled into allowed seat values; (4) uncited draft with evidence present passes as complete. 8 Minor. Plus the :prereqs spelling follow-up.
Task 7: Ruling: fix all four plus the :prereqs spelling in one round; also fold in Minor 1 (decimal units) and Minor 4 (emit tool events for failed steps). Requisite validation: course codes near prerequisite/corequisite/advisory/requisito words must be in evidence requisites codes. Uncited-with-evidence → treated as withheld (fallback text from evidence, warning unsupported_claim_withheld, completeness partial). Cost if wrong: stricter validator withholds some correct phrasing (safe direction).
Task 7: minor (deferred): cross-section seat leakage (set-based design, P1a); 5-digit zip tokens as class numbers; "unknown" substring test for the partial suffix; multi-word subjects (ADM JUS); prerequisites card lacks `id`; lowercase subjects yield invalid_parameters instead of uppercasing.
Task 7: fix round 1/5 (7 addressed, 1 new open — _SEATS_NUM_FIRST/_WAIT_NUM_FIRST lack a trailing \b after the digit group so "1730 available seats" truncates to 173; commits 7e6d837..22e997c)
Task 7: fix round 2/5 (1 addressed, 0 open — \b bound + \d{1,6} seat/waitlist captures; commits 22e997c..0f41b40; controller probe confirms). Ruling: any withheld claim forces completeness "partial" (an answer with omitted details is never "complete") — round 3.
Task 7: fix round 3/5 (1 addressed, 0 open — withheld ⇒ partial; waitlist filler restricted; commits 0f41b40..25e940f; re-review probe table all correct)
Task 7: complete (commits 2189385..25e940f, review clean)
Task 8: implementer a481caa6681bd9bac (opus), commit a917cb4, DONE (slowapi 0.1.9; in-process subscribers/cancel and orphaned runs deferred to P2 worker per plan).
Task 8: review (opus): Needs fixes — 2 Important (live stream can end without `done` because status commits before the done row; Last-Event-ID beyond the last seq skips `done` and hangs), 5 Minor. ⚠️ revocation-after-start and foreign-conversation 403 verified by reading, untested; naive expires_at assumes UTC session TZ (Postgres container default UTC).
Task 8: Ruling: fix both plus Minor 1 (None guard in execute_run with an early return) and Minor 2 (load persisted events with .all() and close the session before the first yield); add tests for revocation-after-start (403 on events after revoking membership) and for a foreign conversation_id (403 before any write: assert no new Message rows). Clamp after_seq to the max persisted seq. Cost if wrong: a few lines in runs.py.
Task 8: minor (deferred): workspace_id vs conv.workspace_id mismatch silently ignored (both authorized); call_soon_threadsafe on a closed loop at shutdown; cancel test accepts completed.
Task 8: fix round 1/5 (4 addressed, 0 open — done in same commit as status, clamp + done-before-skip, None guard, session closed before yield; commits a917cb4..db75e7d)
Task 8: minor (deferred): reconnect with Last-Event-ID == done.seq re-sends the terminal frame (idempotent, undocumented); a run whose rows vanish mid-flight never emits done (P2 worker).
Task 8: complete (commits 25e940f..db75e7d, review clean)
Task 9: implementer af7c78893d783885b (opus), commit 1f3d667, DONE with concerns (OR-relaxation fallback when no AND match; headings are boundaries; optional language param; inventory test filters IN_PROCESS; ingest DNS TOCTOU documented).
Task 9: review (opus): Approved, 0 Important, 7 Minor. Ruling: fold in Minor 1 and 2 as a small round — UniqueConstraint(record_id, locator) on passages (added to the unpushed 0003 migration in place; dev DB downgraded/upgraded locally) and `r.classification = 'public'` in the search predicate — both enforce stated invariants structurally. Cost if wrong: one constraint, one predicate.
Task 9: minor (deferred): lexical locator tie-break; snippet slice mid-word; non-numeric port raises ValueError in ingest; unchanged-hash path does not refresh campus_ref/license; DNS TOCTOU in ingest (owner-run).
Task 9: fix round 1/5 (2 addressed, 0 open — unique locators, public-only predicate; commits 1f3d667..f910429)
Task 9: complete (commits db75e7d..f910429, review clean)
Task 10: implementer a7eaa570e5ff30aea (opus), commit 5111c77, DONE with concerns. Rulings: (1) principal binding via session.info + apply-to-open-transaction accepted (ContextVar set in a dependency was empirically invisible; reproduced and tested); (2) campus_corpus lacks an inventory family → `/v1/sources` reports phase null — add `S9.campus_corpus`-style family in the review round; (3) FOR ALL policies act as WITH CHECK (invite flow is P1b); GRANT ON ALL TABLES is a snapshot — note in P1A-EXIT.
Task 10: review (opus): Needs fixes — 3 Important: (1) health endpoint reads run_events without a bound principal, so under the app role connector health is permanently unknown; (2) APP_DB_ROLE is only a flag — the connected role is never checked and the migration's role is NOLOGIN, so RLS can be inert in production while the guard passes; (3) production guard admits MODEL_PROVIDER=gemini without GOOGLE_API_KEY (silent fake fallback). 8 Minor.
Task 10: Ruling (1): add a `run_events_telemetry` policy — SELECT allowed when `current_setting('app.principal_id', true) = 'service' AND type = 'tool'` — and bind the health endpoint's session as the `service` principal (via the same bind helper) so telemetry reads work under the app role; test reads health as the app role. Cost if wrong: one policy.
Task 10: Ruling (2): startup check in main.py (lifespan) when APP_DB_ROLE is set: query `SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user` and refuse to start (raise) if superuser or bypassrls; the migration keeps the NOLOGIN role as the policy holder and the README documents creating a LOGIN role that inherits it (`CREATE ROLE <app_login> LOGIN PASSWORD ... IN ROLE applicationx_app`) for DATABASE_URL. Test the check with the test app role (passes) and the superuser engine (fails). Cost if wrong: a lifespan hook.
Task 10: Ruling (3): production guard requires GOOGLE_API_KEY when MODEL_PROVIDER == "gemini". Also fold in Minor 1 (exclude alembic_version from the grant; add ALTER DEFAULT PRIVILEGES for future tables), Minor 4 (unknown phase → treated as last, no 500), Minor 8 (add an inventory family for the campus corpus so /v1/sources reports it implemented — id `S12.campus_corpus`? NO: inventory sources are S1–S11 per the P0 test; instead treat IN_PROCESS connectors as `phase: "P1"`, `status: "implemented_tested"` in sources.py with a comment). Cost if wrong: small.
Task 10: minor (deferred): sha256 per health call (cache later); unauthenticated sources/health routes (operator view — accepted for P1a, note in P1A-EXIT); provider rule duplicated from get_gateway; no-principal test omits messages/chat_runs; no execute_run-as-app-role test (P2 worker).
Task 10: fix round 1/5 (5 addressed, 0 open — telemetry policy + service binding, startup role check, gemini key guard, grants, phase rank/IN_PROCESS; commits 5111c77..d84cb34)
Task 10: minor (deferred): ALTER DEFAULT PRIVILEGES scoped to the migration-running role (document in P1A-EXIT); default privileges not reversed on downgrade (consistent with grants).
Task 10: complete (commits f910429..d84cb34, review clean)
Task 11: implementer aa26cbadf842eb6a8 (opus), commit 0360ff6, DONE (35 vitest, axe clean; concerns: zod `data: z.unknown()` infers optional so useChat casts; vitest-axe extend-expect empty in 0.1.0 → matchers registered manually; axe color-contrast off under jsdom, tokens verified numerically; extra optional options arg on subscribeSSE; access/mapping affordances render only when host supplies callbacks — carry to the Calricula host plan).
Task 11: review (opus): Needs fixes — 2 Important: raw exception text rendered in role="alert" instead of the §6 copy (leaks adapter/network detail); CRLF normalised per chunk not on the rolling buffer so a split \r\n breaks `done`. 7 Minor.
Task 11: Ruling: fix both; fold in Minor 3 (key ChatPanel by context_id and tag the resolution snapshot so no stale frame renders under a new context), Minor 4 (correct the hairline comment), Minor 5 (read adapter through a ref; document stability), Minor 7 (chat error alert uses code-mapped copy only). Cost if wrong: a few lines each.
Task 11: minor (deferred): run ending without answer/done leaves idle state silently; citation key collisions; clarification group label from raw slot key.
Task 11: fix round 1/5 (5 addressed, 0 open — §6 copy only, buffer-level CRLF, keyed panel + tagged snapshot, hairline comment, adapter ref; commits 0360ff6..514a253)
Task 11: minor (deferred): lone \r line endings unsupported (backend emits LF); tests assert literal copy strings.
Task 11: complete (commits d84cb34..514a253, review clean)
Task 12: implementer a66b65c3d4a85399a (opus), commit 2e5ef76, DONE (3 Playwright passed in Chromium; seed + CONNECTOR_REPLAY + CORS added; /chat renders ChatPanel directly since WorkspaceShell gates on ready; next.config.mjs; npm audit flags next@16.2.9 — Calricula pins the same version, keep pinned; Firebase path unexercised locally).
Task 12: Ruling: keep next@16.2.9 (parity with Calricula's pin is a plan constraint); record the advisory in P1A-EXIT as an owner decision.
Task 12: review (opus): Approved, 0 Important, 6 Minor; reviewer reproduced the e2e (3 passed). Ruling: fold Minor 2 (guest test asserts Nursing count 0 on the real workspace id before sign-in) and Minor 3 (E2E_WORKSPACE_ID missing fails in CI rather than skips) into Task 13, which owns CI and the isolation suite.
Task 12: minor (deferred): navigateToProgram routes by external_id (no call sites yet; needs mapping lookup); membership seed matches on role so role changes add rows; hardcoded lamc/LAMC in pages (single-org demo); replay lambda shadows the runner param (comment).
Task 12: complete (commits 514a253..2e5ef76, review clean)
Task 13: implementer a707f106a4881f0db (opus), commit 29dfc65, DONE (isolation tests proven to bite by mutation; CI DATABASE_URL scoped to the alembic step so pytest keeps its own test DB and test_rls runs; images not built per ruling).
Task 13: review: Approved, 0 Important, 2 Minor (compose api has no db healthcheck condition; web Dockerfile runs npm ci at start).
Task 13: minor (deferred): compose depends_on without service_healthy; npm ci on web container start.
Task 13: complete (commits 2e5ef76..29dfc65, review clean)

## Final whole-branch review (opus)
Final review: With fixes — 1 Critical (clarification chips loop: the resent question re-triggers campus detection for the ambiguous and "keep prior" cases; the Task 6 ruling traced the intent but not the seam through resolve_slots — controller's error), 8 Important (#2 lowercase subjects → invalid_parameters; #3 naive timestamps depend on server TimeZone; #4 startup role check misses table-owner bypass; #5 no assertion that execute_run completes under the app role; #6 public transcripts persisted with no purge — plan deviates from TECHNICAL-SPEC §10 default; #7 GEMINI_MODEL default retires 2026-10-16; #8 google-genai unpinned; #9 unlocked lazy Firebase init), 9 Minor. Deferred-minor triage: T2 lock, T4 pin, T7 lowercase subjects, T10 app-role run assertion promoted to fix-before-merge. Rulings review: T5 (tz) and T6 (chips) QUESTIONABLE — both accepted as controller errors and fixed below; T10 (2) incomplete for owner bypass.
Final: Ruling (#1): a per-turn explicit hint reaches the pipeline — new migration 0005 adds `messages.scope_hint` JSON (nullable); the API stores the hint on the user Message (still merging into conv.scope); execute_run passes `explicit_scope=ResolvedScope(**hint)` in PipelineInput; resolve_slots gains `explicit: ResolvedScope | None`: an explicit campus this turn is authoritative (no campus clarification); otherwise a prior campus that is among the mentioned campuses resolves without asking. The package's chip resend does not append a second user turn. Cost if wrong: one column and one parameter.
Final: Ruling (#3): engine and alembic env connect with `options=-c timezone=UTC`; P1A-EXIT records the UTC session assumption; `DateTime(timezone=True)` migration deferred to P1b. Cost if wrong: a connect arg.
Final: Ruling (#4): startup check also refuses when the connected role owns (or is a member of the owner of) any RLS table; test against the superuser engine. Cost if wrong: one query.
Final: Ruling (#6): add `app/chat/purge.py` (`purge_expired_public_conversations(session) -> int`, children first, runnable as a module) with a test; P1A-EXIT records the retention deviation from TECHNICAL-SPEC §10 as an owner decision (persist-with-30-min-expiry+purge vs in-memory). Cost if wrong: a small module.
Final: Ruling (#7): GEMINI_MODEL default becomes `gemini-3.5-flash` (the replacement named in the Calricula migration note; the 2.5 line retires 2026-10-16); recorded as an owner decision. Cost if wrong: one default string.
Final: Ruling (#8, #9, #2, #5): pin google-genai==2.24.0; lock around Firebase init; case-insensitive subject match with uppercasing; assert answer+done under the app role. Fold in Minor #10 (system-instruction line: status Open ≠ seats), #12 (cross-org workspace id → access_required), #15 (db healthcheck + condition). Cost if wrong: small each.
Final fix wave: implementer a9d9ffda95b12c288 (opus), commits b172780, 86dd8f3, c76ad2f; 446 tests, 94.76%. Interpretations accepted: subject regex without space (the literal would capture "eats in math"); owner-bypass proven via a temporary member role; purge as ordered bulk deletes binding the public principal.
Final fix wave re-review (opus): all 12 findings ADDRESSED; 1 new Minor (lowercase prepositions before a bare number captured as subject — carry to P1b with a stop-list of short function words). Controller verification: 446 passed, 94.76%, alembic check clean, vitest 46, tsc clean, compose ok, 26/26 trailers, no personal identifiers, no servers running.
