# ApplicationX handoff

Verified: 2026-09-17, America/Los_Angeles. Read this first in the new session.

## Resume from here

The user requested plans for ApplicationX, an employer/career collaboration app
connected to Calricula and Calipar, with a knowledge graph, collaborative agents,
and a chatbot using the LACCD chatbot's capabilities and relevant CLI-accessible
data. We wrote a five-file planning package. The user then explicitly asked to
plan an ApplicationX staff interface inside Calricula, and the documents now
include that design. **Planning is complete at draft v0.2; implementation has not
started.** The latest request was a handoff, not authorization to build or deploy.

## Current checkout

- Workspace: `/Users/laccd/code/calricula`.
- Branch: `codex/calricula-pwa-demo-release`.
- HEAD: `f5b40207fc372221c26d5cc5f80db23d9da74bdf`.
- Before this handoff, the only status entry was `?? docs/applicationx/`.
- Those five untracked documents were created in this conversation; preserve them.
- This handoff adds `session/20260917_144623/` with four local notes.
- No commits, branches, pushes, deployments, app changes, migrations, credentials,
  source refreshes or provider integrations were made for this task.
- No `../applicationx` or `../ApplicationX` directory was found at handoff time.
- The current branch name does not change the target: integrate with the main
  Calricula application under `frontend/src/app`, not `calricula_pwa_demo`.

## Read in order

1. Root `AGENTS.md`.
2. `docs/applicationx/README.md` — package summary and decisions.
3. `docs/applicationx/PRD.md` — 21 requirements, user journeys and phases P0–P4.
4. `docs/applicationx/TECHNICAL-SPEC.md` — contracts, architecture and tests.
5. `docs/applicationx/EMBEDDED-INTERFACE.md` — binding AX-21 design extension.
6. `docs/applicationx/SOURCE-INVENTORY.md` — source coverage, revision baseline,
   existing limitations and proposed integrations.

## Decisions to preserve

- **User-selected:** ApplicationX is a separate companion app connected to
  Calricula/Calipar. It retains its own backend, database and access rules.
- **User-requested addition:** Staff use its workspace and chatbot inside
  Calricula's existing layout. Students/employers keep a standalone entry point.
- Proposed implementation: a pinned shared React UI package, Calricula routes
  `/collaboration` and `/programs/[id]/collaboration`, and a scoped API broker.
  This is native component composition, not an iframe or external-link-only design.
- Proposed coordinated sign-in uses an explicitly configured shared Firebase
  identity project. ApplicationX checks its own memberships; Calricula access does
  not automatically grant ApplicationX access. Cross-origin standalone login
  persistence and different-project federation are not assumed.
- Selected program/campus/revision stays visible. No implicit draft sharing or
  membership provisioning. Context switching must reject late old-program results.
- Calricula owns curriculum/approval; Calipar owns reviews/plans/resource requests;
  ApplicationX owns employer collaboration, evidence and agent workflows.
- Proposed stack follows Next.js/TypeScript/Tailwind v3, FastAPI/SQLModel/Alembic,
  PostgreSQL 16, Firebase and provider-independent AI with Gemini first.
- PostgreSQL is canonical and initially stores the evidence graph. Dedicated
  Neo4j is conditional on benchmarks, not required at launch. No existing graph
  database should be reused as ApplicationX's database.
- Agents use typed tools with scope/budgets/cancellation and concrete authorization
  for external or consequential actions. A single coordinator with named workflows
  precedes an independent multi-agent fleet.
- These are documented design choices, not a claim that every technical detail
  or launch dependency has received final owner/institution approval.

## Data scope: do not lose this

The user explicitly requested a chatbot similar to sibling `laccd_chatbot`,
including the data accessed by the CLI tools. The inventory covers:

- `cli-tools/laccd-class-search-cli`: discovery, full schedules, related components,
  seats/waitlists, cross-campus alternatives, CCN, watches, diffs and conflicts.
- `cli-tools/laccd-courses-pp-cli`: full CORs, programs, hours, objectives, SLOs,
  requisites, comparisons, mirror coverage/statistics.
- `cli-tools/programmapper-cli`: pathways, plans, comparisons, year diffs, reverse
  course lookup, bottlenecks and linked transfer options.
- `cli-tools/assist-pp-cli`: exact institution/year agreement and transferability data.
- `cli-tools/canvas-pp-cli`: scoped materials and private read families; current
  README explicitly says no MCP server. Public chat cannot inherit Canvas access.
- `openstax-cli`, `libretexts-cli`, `pressbooks-cli`: metadata and actual licensed
  content, versions, chapter/page access and exports; preserve source alternatives.
- Non-CLI campus pages/catalogs/addenda/public services, Calricula LMI, and approved
  public Benchmark research artifacts.

Full inventory coverage is phased through P3. P1 is not full CLI parity. Inventory
every pinned command/data family before claiming parity. Remote write/admin
commands and local agent memories are not a public knowledge corpus.

## Important verified limitations

- The sibling chatbot often calls upstream APIs directly; it does not already wrap
  every CLI capability. Adapt services/contracts/fixtures rather than duplicate
  its entire large orchestrator.
- Its enrollment planner explicitly lacks personal student records and real-time
  seat verification. Its OpenStax integration is a static suggestion map.
- Its course sequencing has a described external-prerequisite telemetry stub;
  do not claim complete external articulation resolution is already implemented.
- Whole-subject schedule discovery must be complete; recursively preserve linked
  lecture/lab sections. Empty/partial mirrors are not evidence of absence.
- Calipar data routes contain mock fallbacks: synthetic/demo values must remain
  labeled, never converted into institutional facts.
- Benchmark is a dated evidence release, not a live dashboard. The compression
  page discloses lost original mirror reproducibility. Preserve uncertainty and
  do not turn structural analysis into guaranteed faster learning.
- No employer-feed license, two-year postings archive, SIS connector, or operational
  ApplicationX source authorization was established.

## Recommended next work

1. Recheck Git state and read the five current documents. Preserve unrelated work;
   do not switch branches or move/delete the untracked package casually.
2. Review the draft for remaining cross-document contradictions, realistic phase
   boundaries and testable interfaces. No new user interview is needed about the
   already selected companion/embedded arrangement.
3. When asked to continue planning, create separate implementation plans for P0
   connector/evaluation contracts and P1 embedded staff/public chatbot foundation.
   Inspect current Calricula layout/auth/editor code to choose exact affected files.
4. Before building, establish the new repository name, source revision pins and
   identity/runtime configuration. Confirm only missing consequential choices;
   existing authorization to draft plans does not itself authorize deployment,
   purchases, external outreach or private-data ingestion.
5. Keep P2 collaboration/exchanges, P3 OER/private workflows/full data parity and
   P4 voice/scaling in scope. Do not silently replace this with a generic chatbot.

## Verification and constraints

Previous document checks passed: all local Markdown links resolved, fences and
whitespace were valid, and the PRD contains 21 distinct requirement IDs. No app
tests ran because no code changed; this is not a tested implementation.

Source inventory includes several sibling dirty checkouts as observed September
15. Recheck them; HEAD alone does not identify uncommitted source. Preserve all
unrelated edits and do not refresh the owner's research without authorization.

Follow root AGENTS.md: light-only luminous UI, WCAG 2.2 AA, gold-ink for small text,
Alembic migrations, branding preservation, no secrets/student data/personal email
in this public source tree, and the exact required coauthor trailer if a commit is
later authorized. Backend changes require pytest with the 45% coverage floor;
frontend changes require build/Jest; migration changes require upgrade and boot.

The attached ApplicationX concept files were read but not copied into the public
repository. Their relevant requirements and titles are in the source inventory.
Research URLs are https://benchmark.johnnyphung.com/ and
https://benchmark.johnnyphung.com/which-courses-halve. No re-fetch is needed merely
to resume planning.

## Continuation — 2026-09-17 (second session)

Planning resumed in this workspace at the same HEAD `f5b40207`; no commits,
branch changes, pushes, migrations or runtime changes were made. All work is
untracked files under `docs/applicationx/` and this `session/` directory.

What changed:

- `docs/applicationx/plans/2026-09-17-draft-review.md` — verified review of the
  v0.2 draft against Calricula code and the sibling repositories. Thirteen
  findings; six changed the documents (R1 no unsaved-change guard exists, R2 no
  program revision or college key, R3 broker lives in Calricula FastAPI at
  `/api/applicationx/*`, R4 lecture/lab linkage is not a CLI field, R5 the
  full-scope marker is a SQLite `sync_state` row, R6 the chatbot has no Spanish
  evaluation cases).
- The five package documents were bumped to v0.3 (2026-09-17) with only the
  corrections listed in the review. README now links the plans.
- `plans/2026-09-17-p0-source-contracts.md` — 15 tasks for a new sibling repo
  (assumed `applicationx`): pinned clean CLI builds from detached clones,
  manifests generated from `agent-context --json` with per-command dispositions,
  isolated subprocess broker, three envelope normalizers, 25 operations with
  seven-state synthetic fixtures, related-components walker adapted from the
  chatbot (Apache-2.0 notice), mirror scope validator, data-family inventory
  gate, crosswalk seed, tri-state health, bilingual eval corpus and harness,
  contracts-only `@applicationx/workspace-ui`.
- `plans/2026-09-17-p1a-applicationx-service-and-package.md` — 13 tasks:
  identity/memberships/RLS, host-context resolution, model gateway, grounded
  chat pipeline with validation, resumable SSE runs, campus corpus, sources/
  health, workspace-ui components, standalone app, isolation suite.
- `plans/2026-09-17-p1a-calricula-host.md` — 9 tasks in this repository with
  exact file anchors: settings + status endpoint, broker service, broker routes
  with trusted program enrichment, client/hook, nav item + program action, two
  routes with host states, brokered adapter, package integration (gated on
  publication), e2e with a stub upstream.
- `plans/2026-09-17-p1b-p4-roadmap.md` — scoped outlines for P1b (pathways,
  ASSIST, LMI/research, worker, EN/ES eval run), P2, P3, P4 with gates.

Sibling state rechecked today: class-search, courses, programmapper and
benchmarklist remain dirty (unchanged from the inventory); assist, canvas, OER
CLIs, chatbot and calipar clean. `assist-pp-cli` and `pressbooks-pp-cli` are not
on PATH; the P0 plan builds all binaries from pinned revisions instead.

Open owner decisions are listed at the end of each plan (repo/package names,
license, whether to commit the CLI patch sets upstream, Spanish reviewer,
Firebase project, model key, campus source list, pilot programs).

Next: owner reviews the review document and plans; on approval, create the
`applicationx` repository and execute P0 with subagent-driven development.
Implementation has still not started.

## Continuation — 2026-09-17 (third session): repository created

- Owner approved `plans/2026-09-17-draft-review.md` and all four phase plans.
- Created the private repository `https://github.com/johnnyrobot/applicationx` (default branch `main`),
  cloned at `/Users/laccd/code/applicationx`. Bootstrap commit `2dad158` contains only `README.md`,
  `LICENSE` (BSD-3-Clause, "ApplicationX contributors") and `.gitignore`. Git identity is the GitHub
  noreply address; the Fable 5.1 trailer is used.
- Owner decisions 1 and 2 of the P0 plan are therefore resolved: name `applicationx`, license BSD-3-Clause.
  Decisions 3 (upstream CLI patch commits) and 4 (Spanish reviewer) remain open and do not block Task 1–15
  except that `S1.ccn` stays `proposed`.
- P0 Task 1 has not been executed. Next step: run the P0 plan task-by-task (subagent-driven development)
  in the new repository. Calricula's tree is unchanged except these untracked planning files.

## Continuation — 2026-09-18: P0 implemented in applicationx

- P0 plan executed task-by-task with subagent-driven development in `/Users/laccd/code/applicationx` on `main`
  (owner chose direct commits to main). 33 commits `2dad158..a3f17cb`, all with the plan's trailer. NOT pushed
  beyond the bootstrap commit; the owner decides whether to push.
- Every task had a spec+quality review and a scoped re-review; a whole-branch review found one Critical
  (mirror validator queried `key` instead of the CLI's `resource_type` column) and six Important items, all fixed
  in one wave and re-reviewed clean. Final state: 301 backend tests, 95.85% coverage, no warnings; schema and
  normalized-fixture drift checks clean; workspace-ui vitest 5/5; `docs/P0-EXIT.md` is the exit checklist.
- The SDD ledger (all 21 controller rulings, deferred minors, per-task reports) is preserved at
  `session/20260917_144623/p0-execution/` (sdd-ledger.md, task-N-report.md, final-fix-report.md).
- Facts P1 must know (also in docs/P0-EXIT.md "Known limitations"): CLI binaries are host-built (darwin/arm64 here)
  and manifests carry host digests that `run_command` now verifies; `S1.ccn`/`S1.related_sections` stay proposed;
  `articulation.list` echoes its `--types` default into coverage.scope; `pathways.bottlenecks` is unscoped;
  `programmapper.college` slugs are tentative, `programmapper.site_content` ids confirmed; Spanish corpus is
  `pending` bilingual review; no live baseline run; `deadline` claim type has zero coverage.
- Plan-text defects discovered during execution (worth folding back into the P0 plan doc if it is kept as
  reference): sync_state DDL column name; `coverage` classification; brief's communicate()-based broker;
  bespoke normalizer lacking synced_at; positional/envelope shapes for five CLI commands; COLLEGE_CONFIGS has no
  slug field; `evals/__init__.py` missing.
- Next: owner review of applicationx `main`; then the P1a service/package plan
  (`docs/applicationx/plans/2026-09-17-p1a-applicationx-service-and-package.md`).

## Continuation — 2026-09-18: P1a service + package implemented in applicationx

- P1a plan (`docs/applicationx/plans/2026-09-17-p1a-applicationx-service-and-package.md`) executed task-by-task on
  applicationx `main`: 26 commits `a3f17cb..c76ad2f` (13 tasks + a final fix wave), all with the plan's trailer.
  NOT pushed (only the P0 bootstrap commit is on GitHub); the owner decides whether to push.
- Every task had a spec+quality review and scoped re-reviews; the whole-branch review found one Critical (the
  clarification-chip flow from the Task 6 ruling re-asked the question — fixed with a per-message `scope_hint`
  column, migration 0005, and explicit-scope handling) and eight Important items (lowercase subjects, UTC session
  time zone, RLS owner-bypass check, app-role run assertion, public-transcript purge + retention decision,
  Gemini model default → gemini-3.5-flash, google-genai pin, Firebase init lock), all fixed and re-reviewed clean.
- Final state: 446 backend tests / 94.76% coverage / no warnings; alembic check clean (5 migrations); workspace-ui
  46 vitest, axe clean; frontend tsc clean; Playwright e2e 3/3 (reproduced independently by two reviewers);
  `docker compose config` valid; `docs/P1A-EXIT.md` is the exit checklist with §7 case mapping and owner decisions.
- Ledger (24 rulings, deferred minors, per-task reports) preserved at `session/20260917_144623/p1a-execution/`.
- For the Calricula host plan (next): the consumed interfaces are stable (`POST /v1/host-contexts/resolve` states,
  `POST /v1/chat/messages` with `scope_hint`, SSE frames carry `context_id`, `WorkspaceHostAdapter`,
  `WorkspaceShell`/`ChatPanel`, `--ax-*` tokens). Two facts the host must honour: `HostStateView` renders a non-empty
  server `message` verbatim (the broker must not inject transport text), and `subscribe` captures auth headers once
  per run (the brokered adapter should pass a header getter or refresh per reconnect). Also: `HostStateView`'s
  "Request access"/"Set up mapping" buttons render only when the host passes `onRequestAccess`/`onSetUpMapping`.
- Local environment facts: Postgres 16 runs in Docker (`docker compose up -d db`, port 5434); the LOGIN test role
  `applicationx_test_app` was created in the container for `test_rls.py`; there is no psql on the host. Dev demo
  recipe is in the applicationx README "Running P1a".
- Deferred to P1b (from the ledger): set-based seat validation cannot catch cross-section leakage; bare "transfer"
  trigger; `DateTime(timezone=True)` migration; navigateToProgram routing by mapping; rate limit on the events
  stream; language fixed per conversation; purge scheduling; FOR-ALL RLS policies need an insert policy for invites.

## Continuation — 2026-09-18 (later): auth stack decision and ApplicationX swap to Logto

- Owner decision: replace Firebase with Logto (OIDC) for both apps in one tenant. Recorded in
  `docs/applicationx/ADR-0001-auth-stack-logto.md`; EMBEDDED-INTERFACE §4, TECHNICAL-SPEC identity rows,
  README index, the P1a service plan's owner decisions and the host plan's bearer wording were patched.
- Two plans written: `plans/2026-09-18-auth-oidc-logto-applicationx.md` (executed) and
  `plans/2026-09-18-auth-logto-calricula-migration.md` (NOT executed; six tasks with real anchors:
  core/oidc.py verifier, users.firebase_uid → auth_subject/auth_issuer migration, /login via ID token,
  @logto/next frontend, env/docs, per-resource tokens for the ApplicationX broker).
- ApplicationX swap done and pushed: commits `bf79d70..b719a4a` (5). Backend verifies Logto access tokens
  with PyJWT/JWKS (`OIDC_ISSUER`, `OIDC_AUDIENCE`, optional `OIDC_JWKS_URL`, `OIDC_ALGORITHMS` JSON list);
  firebase-admin removed; dev tokens unchanged; frontend uses `@logto/next` 4.2.11 (`/sign-in`, `/callback`,
  `/sign-out`, `/api/auth/session`, `/api/auth/token`) behind `NEXT_PUBLIC_LOGTO_ENABLED`; optional compose
  `logto` service under profile `auth` (3301/3302). Final review found the plan's `cache_keys=True` line was
  wrong (PyJWT per-key cache never expires) — fixed to `cache_keys=False` with a rotation test; plan text corrected.
- Ledger/reports preserved at `session/20260917_144623/auth-logto-applicationx/`.
- Carried to the Calricula host/P1b work: client refresh leans on the backend's 60 s leeway and has no
  401-triggered refetch; GET /sign-out is a state-changing GET (logout CSRF, low impact); pin `svhd/logto`
  once hosting is chosen; a tampered /callback shows a generic 500.
- Next: execute the Calricula migration plan (branch off `main`, PR), then the host plan against the
  migrated Calricula.

## Continuation — 2026-09-19: Calricula Logto migration executed (branch `auth/logto-migration`)

- Plan `plans/2026-09-18-auth-logto-calricula-migration.md` executed with SDD: 13 commits `f5b4020..17e4805`
  on `auth/logto-migration`, based on `codex/calricula-pwa-demo-release` (main is 62 commits behind; PR stacks
  on #35). Backend 289 passed / 51.68 %; jest 361; lint 0 errors; build green; migration up/down/up clean.
- Shipped: `backend/app/core/oidc.py` (JWKS/PyJWT, `cache_keys=False`, aud split access-token vs ID-token,
  seven dev tokens, `iss:"dev"`); `users.firebase_uid` → `auth_subject` + `auth_issuer` (NULL for legacy rows;
  seeds stamp `"dev"`); `/login` verifies the ID token, verified-email only, one-time re-link gated by
  `AUTH_LEGACY_RELINK`, placeholder-merge guard; DEMO_MODE re-checked per request; production guard
  `OIDC_AUDIENCE != OIDC_CLIENT_ID`; frontend `@logto/next` (session cookie; in-memory token via
  `/api/auth/token?resource=calricula|applicationx`; `getToken()` awaits the session bootstrap so `/login`
  runs before any API call; callback errors → `/login?error=callback`); docs `docs/AUTH-LOGTO.md` (§0 decision
  record replaces links to the untracked ADR), env/compose/CI, `RELEASE_CHECKLIST.md` cutover gate.
- Plan text amended (two plan defects): issuer default for existing rows is NULL; auto-provision uses the
  `{sub}@oidc.invalid` placeholder (NOT NULL column).
- Ledger, briefs, reports and both final reviews preserved at `session/20260917_144623/auth-logto-calricula/`.
- Follow-ups (not blocking): duplicate `UserProfileResponse`; `useCallback` on `getToken`; route test for
  `GET /api/auth/token`; `docker-compose.demo.yml` YAML parse error (pre-existing); `alembic check` drift
  (pre-existing); three pre-existing e2e failures (`units.toFixed` on a string, hardcoded :3000, `clearCookies`
  vs sessionStorage). Cutover gate: the browser-side Logto path must be run against a real tenant
  (`docs/STAGING_VALIDATION.md` §2b) before switching a deployment.
- Next: host plan `plans/2026-09-17-p1a-calricula-host.md` against this branch, then P1b.

## Continuation — 2026-09-19 (later): Calricula host integration executed (branch `feat/applicationx-host`)

- Plan `plans/2026-09-17-p1a-calricula-host.md` executed with SDD: 14 commits `17e4805..95d9890` on
  `feat/applicationx-host` (off `auth/logto-migration`; PR stacks on #36 → #35 → main). Backend 331 passed /
  52.71 %; jest 441; build; lint 0 errors; Playwright chromium 5 passed + case 9 under STUB_DOWN=1 (live stack
  8001/8099/3001, seeded :5435 DB).
- Shipped: `APPLICATIONX_*` settings + urlsplit production guard; `/api/applicationx/{status, host-contexts/resolve,
  ops/{op}, runs/{id}/events}`; `services/applicationx_broker.py` (allowlist, header allowlist, sanitized errors,
  typed-state 4xx whitelisted to {state,message,retryable}, SSE passthrough with 15 s keepalive + 600 s cap,
  opaque Last-Event-ID); trusted program enrichment (revision = updated_at UTC + status); frontend
  `lib/applicationx/{types,client,adapter,sse}.ts`, `useApplicationXStatus` (successes cached 5 min), nav item +
  program action gated on `/status`, `HostStatePanel`/`ContextBanner`/`WorkspaceSelector`, routes `/collaboration`
  and `/programs/[id]/collaboration` (placeholder for the chat shell), stub upstream, e2e spec (cases 1*, 2, 4, 6,
  8*, 9; * = up to the banner, chat steps `test.fixme` pending Task 8), `docs/APPLICATIONX-EMBED.md`, README, .env.
- KEY RULING — two-token transport: `Authorization` = Calricula token (validated by `get_current_user`, never
  forwarded); `X-ApplicationX-Token` = Logto token for the ApplicationX resource (`getToken('applicationx')`),
  the only token forwarded. EMBEDDED-INTERFACE §4, ADR-0001 Context and the host plan Global Constraint were
  amended. Frontend needs `LOGTO_APPLICATIONX_RESOURCE` whenever the embed is enabled (missing → "not configured").
- Task 8 (shared `@applicationx/workspace-ui` package) DEFERRED: unpublished; any package.json pin breaks a public
  CI build. Runs as its own follow-up after publication (tarball `npm pack` for local dev only).
- Ledger, briefs, reports and reviews preserved at `session/20260917_144623/p1a-calricula-host/`.
- Follow-ups: M-3 body cap before model parsing; M-11 SSE client-disconnect test; N-1 `_EVENT_ID_RE` fullmatch;
  `ready` resolution body unvalidated; pre-existing `/programs` hard-load 401 race; e2e case 2 stub-only.
- Next: publish the package → Task 8; then P1b.

## Continuation — 2026-09-19 (evening): merges, GitHub Packages publish, Task 8

- Owner decisions: merge the stack (#35 → #36 → #37 squash-merged to main; e5729a6); publish
  `workspace-ui` to **GitHub Packages (private)**; gh token refreshed with write:packages.
- ApplicationX: package renamed `@johnnyrobot/workspace-ui` (scope must equal owner; `--ax-*` CSS prefix
  unchanged); `publish-workspace-ui.yml` on tags `workspace-ui-v*`; 0.1.0 and 0.1.1 published (0.1.1:
  `sideEffects: ["**/*.css"]`, `WorkspaceShellProps.showOpenStandalone`). Commits 5107a77, a103c11 on main.
- Calricula: PR #38 `feat/workspace-ui-shell` (Task 8): shell rendered in the program collaboration route,
  re-exports, tokens, registry wiring (CI, Dockerfile.prod BuildKit secret, compose), docs; live e2e green.
  CI is red until the owner grants `johnnyrobot/calricula` in the package's Manage Actions access or sets
  `WORKSPACE_UI_READ_TOKEN`. Ledger at `session/20260917_144623/workspace-ui-publish-task8/`.
- Open: package's own CSS import produces no `.ax-*` rules under `next build` (explicit
  `@johnnyrobot/workspace-ui/tokens.css` import kept in the page); ready page resolves the context twice.
- Next: P1b (ApplicationX repo).

## Continuation — 2026-09-19/20: P1b-1 chat breadth executed and merged (ApplicationX main)

- Owner inputs: no `research.lookup` in P1b (AX-09 research → P2); campus list from public LACCD data;
  public chat off by default, 20/min + 200/day per IP, 4 KB cap.
- Plan `plans/2026-09-19-p1b-1-chat-breadth.md` (8 tasks) executed with SDD on branch `p1b-1/chat-breadth`,
  fast-forwarded into `main` (`a103c11..66571c3`, 24 commits) + CI fix `704721c`; CI green. Suite 96.39 %.
- Shipped: institution/year slots (academic-year default, July rollover), Spanish campus aliases (bare
  "este/oeste/valle/puerto" removed), campus source config + explicit `unconfigured`, `pathway`/`transfer`/
  `workforce` routes with typed cards and claim checks (units/terms/years/subjects/money/percent incl. Spanish
  formats), `lmi.lookup` in-process connector (httpx → Calricula `/api/lmi/search`, replay), public-chat gate +
  daily limit + scope_hint validation, eval answerer over the real pipeline with a CI gate (`route_match_rate`
  ratchet 0.95, achieved 0.975; `oos_refusal_rate` 0.0 and claim-type coverage 0.302 reported), intent table
  extended, `docs/P1B-1-EXIT.md`.
- Ledger + reviews at `session/20260917_144623/p1b-1-chat-breadth/`.
- Parked/deferred: "how much do welders earn" without punctuation → catalog; subjects containing stop-words
  ("Business in Society") truncated → withheld; catalog 0.9 (adt_transfer_degree); oos refusal needs a
  non-keyword classifier; claim-type coverage gaps by source; bare "employment" hijack; HostContextIn
  context_id cap; workforce requires a campus.
- Next: P1b-2 (sequencing + schedule completeness), then P1b-3 (corpus growth, worker/outbox/purge, ES scorecard).

## Continuation — 2026-09-20: P1b-2 sequencing + schedule completeness executed and merged locally (ApplicationX main)

- Plan `docs/applicationx/plans/2026-09-19-p1b-2-sequencing-schedule-completeness.md` (11 tasks) executed with SDD on
  `p1b-2/sequencing-completeness`, fast-forwarded into local `main` (`704721c..afe2bf7`, 22 commits). **Not pushed** —
  owner to `git push origin main` and watch CI. Suite 732 passed, coverage 96.67 %; eval gate exit 0, `route_match_rate`
  0.9767, `sequence` family 1.0 (`catalog` 0.9 unchanged).
- Shipped: `app/planning/{schedule_time,conflicts,requisites,sequence}.py` (deterministic; `unknown` conflict status;
  always-hypothetical sequences; flattened-logic warning; external prereqs reported only); `sequence` chat route with
  order/units/requisite claim checks; conflict card in `schedule` route + "≥2 five-digit class numbers → schedule" intent
  rule; `Operation.postprocess` + `mirror_gate` on `schedule.search`; `app/jobs/sync_schedule.py` (broker,
  local_maintenance only); `schedule.related_components` in-process connector (services.laccd.edu listing); component cards
  + `MODEL_EVIDENCE_CAP` (in-process entries first); `docs/P1B-2-EXIT.md`, README settings.
- Rulings/parked (full list in ApplicationX `.superpowers/sdd/2026-09-19-p1b-2-.../progress.md`, git-ignored): plan's
  cycle-break rule inverted → fixed; bare conflict keywords → overturned for the class-number-pair rule; **parked**:
  `validate.py` `_HEDGED` sentence-wide skip lets "…conflict on MW (unknown)." through — follow-up: clause-split + hedge
  must govern the conflict token.
- Deferred to P1b-3 (in exit doc): future-offering checks, CCN alias resolution, catalog OR-groups, ASSIST for external
  prereqs, external coreqs not placed/reported, course-pair "in what order" → program search, ZIP-code pairs, tenant on
  sequence catalog.search, empty term 1, job table/outbox/purge, ES scorecard, oos_refusal_rate, corpus growth.
- Next: push main + CI; then P1b-3.
