# Calricula PWA Demo - Security Remediation and Deployment Handoff

Last reconciled: 2026-08-03 (America/Los_Angeles)

This document is the point-in-time handoff for the standalone local-first PWA
under `/Users/laccd/code/calricula/calricula_pwa_demo`. It is deliberately
candid about what is implemented, what was tested, and what has not yet been
verified in production.

## Executive status

The demo implementation and the six known security remediations are committed
on a clean release branch. The application is **not ready to be declared
deployed or production-verified**. The mandatory security diff scan did not
start because the Codex Security setup window timed out waiting for a human to
press **Start scan**. A new full standard scan, clean release evidence,
Cloudflare bootstrap, Turnstile configuration, live model qualification,
AI-enabled deployment, production browser checks, Lighthouse, offline checks,
and the two live AI canaries are still outstanding.

**Reconcile note, 2026-08-03.** Since the 2026-07-31 handoff, 22 commits of
internal architecture work landed on this branch (a nine-candidate review, now
closed — see `docs/handoffs/2026-08-02-architecture-deepening.md` and
`docs/adr/`). It changed no release fact: every row in the table below has the
same status it had on 2026-07-31. What it did change is the evidence figures and
the Git range, both updated throughout this document. Two new risks are recorded
that were not present on 2026-07-31: the security-scan range below is now stale
(see "Security scan state"), and a long-standing `AppShell` test failure was
diagnosed as a marginal-timeout defect and fixed on 2026-08-04 (see "Resolved
local instability"); before that fix it would have failed a substantial share of
release-gate attempts at step 5 of 14.

| Area | Status | Evidence boundary |
| --- | --- | --- |
| Local-first PWA implementation | Implemented | Tracked application and test source |
| Six historical security findings | Remediated in code | Requires diff-scan validation before closure |
| `src/lib/**` provenance | Fixed | 45 files tracked (46 at `c83084f`; 44 at `274d428`; `ai/session-readiness.ts` and its test added by `5c0de4c`, `ai/eval-catalog-parity.test.ts` by the seven-route evaluation work, `ai/persistence.ts` and its test removed with the write-only artifact path); fresh-checkout package reproduction passed at `274d428` and not rerun since |
| Aggregate local verification | Passed at `c83084f` | `npm run verify` exit 0 on 2026-08-03: 554 UI/repository tests in 75 files, 174 Worker tests, 7 Chromium smoke tests. Not a substitute for the release gate |
| Local test stability | Restored | The long-standing `AppShell` "flake" was a marginal-timeout defect, diagnosed and fixed 2026-08-04; 0 failures in 10 consecutive coverage runs. See "Resolved local instability" |
| Security diff scan | Blocked before start, and its range is now stale | Setup wait timed out; no new scan artifacts. Head has since moved `274d428` → `c83084f` |
| New complete standard scan | Not run | Required because historical scan omitted `src/lib/**` |
| `.release-evidence/local-gate.json` | Missing | No bootstrap or full release seal exists |
| Cloudflare bootstrap/deployment | Not performed | No release-owned hostname, version, deployment, or rollback receipt |
| Turnstile/OpenRouter configuration | Missing | No site key, secret, HMAC secret, provider key, or evaluated model chain supplied |
| Live model qualification | Implemented, not yet run against a live model | `ai:evaluate` qualifies each candidate on all seven task routes — chat, catalog-description, slos, content-outline, top-code, program-narrative, compliance-explanation — at one request per route, 28 requests maximum, no retries. The rubric is pinned to the Worker validators by `tests/worker/ai-eval-parity.test.ts`; `release-evidence` refuses evidence unless every route passes. Running it needs `OPENROUTER_API_KEY` |
| Production E2E/Lighthouse/offline | Not run | Requires exact deployed origin |
| Live AI canaries | Not run | Requires staged release and one human-completed Turnstile session |

## Repository and Git checkpoint

- Repository root: `/Users/laccd/code/calricula`
- Demo subtree: `calricula_pwa_demo/`
- Branch: `codex/calricula-pwa-demo-release`
- Parent `main` / original implementation reference: `efdc0b4`
- Tracked demo baseline: `b446c760f89f4e5efd13f2db1540984f8cfa59bc`
- Primary six-finding remediation commit: `3101f4a7acc933ca07d27268344ac13bd28b43a0`
- Last code-only checkpoint before this documentation: `274d42813447b719d7f3dc82ab968d24349ea3a2`
- Release-relevant head at the 2026-07-31 reconcile: `274d428`
- **Current head at the 2026-08-03 reconcile: `c83084fe2a965273e3b998fc9976eae4521bcf35`**
  — 22 architecture-only commits beyond `274d428`, listed by
  `git log --oneline 274d428..HEAD`. None of them touches release scripts'
  behaviour, `wrangler.jsonc` vars, or the security posture.
- The implementation checkpoint was clean at both reconciles.
- Run from the **repository root** (`/Users/laccd/code/calricula`):
  `git diff --name-only main...HEAD -- . ':(exclude)calricula_pwa_demo/**'`
  It was empty at both reconciles: no parent frontend/backend file changed.
  Both pathspecs are cwd-relative, so running this from `calricula_pwa_demo/`
  makes the exclude match nothing and lists all 267 demo files. That output is a
  wrong-cwd artefact, not a boundary violation.
- All **45** runtime files under `calricula_pwa_demo/src/lib/**` are tracked and
  protected by the demo `.gitignore` negations. This was 44 at `274d428`;
  `5c0de4c` added `src/lib/ai/session-readiness.ts` and its test, the
  seven-route evaluation work added `src/lib/ai/eval-catalog-parity.test.ts`,
  and removing the write-only AI artifact path deleted
  `src/lib/ai/persistence.ts` and its test. `AGENTS.md` states the expected
  count — keep the two in step.
- `openrouter-llms-full.txt` remains an intentionally ignored local design
  reference. It is not a Git, build, static-export, precache, or deployment
  input.

Relevant commits, oldest first:

| Commit | Purpose |
| --- | --- |
| `b446c76` | Establish complete tracked demo baseline |
| `3101f4a` | Remediate six security findings |
| `e1f78f7` | Enforce reproducible exact-commit checkout |
| `e64b4e9` | Normalize webpack module identities |
| `f766387` | Compare releases at one canonical path |
| `0c42813` | Diagnose reproducibility mismatch layer |
| `274d428` | Bind fresh checkout to the exact deployable package |

Architecture-only commits added between the 2026-07-31 and 2026-08-03
reconciles, oldest first. They close a nine-candidate internal review; none
changes release, security, or deployment behaviour:

| Commit | Purpose |
| --- | --- |
| `0b0e595` … `84d2a11` | Candidates 1, 2, 7, 6, 9, 8, 3, 4 — see `docs/handoffs/2026-08-02-architecture-deepening.md` |
| `f451f02` | Commit that handoff to `docs/handoffs/` |
| `6834d95`, `b05d737`, `3b97f13`, `6e94f9f`, `c83084f` | Candidate 5 — narrow the curriculum repository interface, 47 → 33 methods; see `docs/adr/0002-repository-interface-roles-and-test-seam.md` |

Every commit contains the required trailer:

```text
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```

## Implemented product boundary

The demo is a Next.js 16/React 19/TypeScript/Tailwind 3 static export with a
public landing page and a no-login "Try it now" path. It includes:

- browser-local initialization and immutable versioned seed data;
- dashboard, course/COR authoring, autosave, views, search/filter/pagination,
  duplication, versioning, comparison, comments, history, SLOs, content,
  requisites, CCN matching/justification, deterministic compliance, export,
  and print views;
- program authoring, membership ordering, unit calculation, and narratives;
- course approvals, simulated demo roles, workflow history, and notifications;
- backup, validated replace-all import, storage status, persistence request,
  reset/reseed, cross-tab invalidation, draft recovery, and quota-failure UX;
- a manifest, install guidance, Workbox service worker, offline route, update
  prompt, security headers, self-hosted fonts, and light-only accessible UI;
- contextual and task-specific AI review/apply surfaces that remain disabled
  offline and do not mutate local records until explicit Apply.

The demo intentionally omits Firebase authentication, FastAPI, PostgreSQL,
Gemini, server curriculum storage/backups, uploads, live eLumen/LMI services,
push notifications, real identity/authorization, cross-user collaboration, and
program approval workflow.

## Architecture and sensitive-data boundaries

```text
Browser PWA
  - Next static UI and service-worker application cache
  - Dexie/IndexedDB curriculum repository and local AI history
  - same-origin /api/ai/* requests only after disclosure
        |
Cloudflare Worker
  - origin/method/content-type/body/schema checks
  - Turnstile exchange and signed v2 HttpOnly session cookie
  - per-session limiter, shared global limiter, SQLite daily-quota DO
  - exact free-only OpenRouter request policy
        |
OpenRouter eligible :free model/provider
```

Curriculum records and backups remain browser-local. The only hosted state
introduced by the remediation is `DAILY_AI_QUOTA`, a SQLite Durable Object that
stores an HMAC-derived anonymous identifier, UTC day, attempt count,
idempotency request IDs, and expiry metadata. It never stores prompts,
responses, curriculum text, IP addresses, or user identities.

The Worker secrets are `OPENROUTER_API_KEY`, `TURNSTILE_SECRET_KEY`, and
`AI_SESSION_HMAC_SECRET`. `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is intentionally
public. None of these values currently exists in release evidence or a
production deployment.

## Six security remediations

The historical standard scan reported two medium and four low findings. All
six have narrow fixes and regression tests, but closure remains subject to the
pending scans.

### 1. Replayable daily AI quota - medium

Historical issue: the five-attempt daily count lived in replayable signed
client state.

Implemented fix:

- `worker/index.ts` exports a SQLite-backed `DailyAiQuota` Durable Object.
- The session cookie is version 2 and authentication-only; version 1 cookies
  are rejected and require a fresh Turnstile exchange.
- Quota is atomically reserved after request/session/rate validation and
  immediately before OpenRouter.
- A caller-supplied idempotency request ID prevents duplicate reservations.
- Storage failure fails closed; UTC-day objects alarm-expire after a grace
  period.
- Tests cover six concurrent attempts, exactly five upstream calls, old-cookie
  replay, reissuance, duplicates, rollover, unavailable storage, and session
  separation.

Primary files: `worker/index.ts`, `worker/daily-quota.test.ts`,
`tests/worker/quota-harness.ts`, `wrangler.jsonc`.

### 2. Ignored runtime-source provenance - medium

Historical issue: the parent Python `lib/` ignore rule excluded all runtime
`src/lib/**`, allowing a build whose source was absent from its Git commit.

Implemented fix:

- Demo `.gitignore` re-includes `src/lib/` and descendants.
- All 44 runtime files are tracked.
- `scripts/release-inputs.mjs` is the canonical enumerator shared by source
  fingerprinting and Git-tree validation.
- It rejects ignored/missing inputs, symlinks, case/path inconsistencies, and
  nested repository anomalies.
- `scripts/verify-fresh-checkout.mjs` rebuilds the exact commit at the same
  canonical path, compares source and sealed-package fingerprints, and copies
  that exact build back without digest drift.

Primary files: `.gitignore`, `scripts/release-inputs.mjs`,
`scripts/release-inputs.test.mjs`, `scripts/verify-fresh-checkout.mjs`.

### 3. OpenRouter response buffering - low

Historical issue: discovery/evaluation helpers buffered the entire body before
enforcing their response-size ceiling.

Implemented fix:

- `scripts/read-json-with-limit.mjs` provides one shared streaming JSON reader.
- It performs an early `Content-Length` check, counts actual streamed bytes,
  cancels overflow, uses fatal UTF-8 decoding, preserves timeouts, and
  normalizes malformed JSON.
- Discovery, evaluation, and canary scripts all use it.
- Tests cover chunked responses, no length header, exact limit, overflow
  cancellation, malformed UTF-8, malformed JSON, and timeout behavior.

### 4. Shared rate-limit starvation - low

Historical issue: session-rejected traffic consumed the shared AI-generation
global limiter first.

Implemented fix:

- AI generation consumes the principal/session limiter before the global
  limiter.
- Successful Turnstile exchanges use a distinct challenge limiter key.
- Session-rejected requests never reach the global limiter or OpenRouter.
- Tests show a different session retains shared capacity.

### 5. Published-artifact binding - low

Historical issue: verification covered one dry-run bundle while publication
performed a separate rebuild.

Implemented fix:

- `scripts/release-state.mjs` seals the validated dry-run Worker, exact static
  assets, and effective Wrangler configuration as one publication package.
- Source, build, publication-package, Worker, assets, and configuration digests
  are recorded separately.
- `scripts/release-deploy.mjs` uploads the validated Worker with
  `wrangler versions upload --no-bundle --strict`, captures its actual version
  ID/tag, and promotes exactly that ID with `wrangler versions deploy`.
- Evidence binds the locally submitted package digest to the Cloudflare
  receipt without claiming Cloudflare supplies a remote content digest.
- Pending/staged/current/history/completion records retain the package and
  version binding across interruption and recovery.
- Tests reject changed Worker bytes, assets, configuration, and ambiguous
  retry/recovery state.

### 6. Static-asset secret scanning - low

Historical issue: secret inspection skipped non-allowlisted file extensions.

Implemented fix:

- `scripts/static-asset-validation.mjs` reads every regular file under `out/`
  as raw bytes regardless of extension.
- It rejects symlinks, special files, source maps, unclassified artifacts,
  unsafe suffixes, and recognizable key-like content.
- Tests inject harmless PEM/key-shaped patterns into extensionless, renamed
  text, PNG, icon, font, and unknown-suffix fixtures.

## Verification already performed

The following checks passed via `npm run verify` (exit 0) at `c83084f` on
2026-08-03. They are useful evidence of code health but are **not** a substitute
for the fresh release gate required at the final commit — `verify` is 8 steps;
`release:gate` is 14 and adds fresh-checkout reproduction, the five-browser E2E
matrix, local production verification, Lighthouse, and the evidence seal:

- production dependency audit: zero production vulnerabilities at the
  configured threshold (`npm audit --omit=dev --audit-level=high`);
- ESLint and TypeScript typecheck;
- 75 Vitest files / 554 UI, domain, repository, and release-script tests;
- coverage: 85.14% statements, 74.31% branches, 81.98% functions, and 87.00%
  lines, including the higher risk-module thresholds — `repository.ts` at
  94.69/88.72/94.02/96.22 against its 90-line/85-branch floor;
- 174 workerd-compatible Worker tests across 5 files;
- static export validation: 211 of a 20,000 limit and approximately 2.31 MiB
  total, largest chunk 0.22 MiB; Workbox precached 207 finite files (2.27 MiB);
- dry-run Worker validation: 68.46 KiB uploaded, 16.53 KiB gzipped,
  approximately 0.02 MiB compressed by the validator, against the 3 MiB ceiling;
- 7 Chromium critical-path smoke tests;
The last two items below are carried from the 2026-07-31 reconcile and were
**not** rerun on 2026-08-03. `npm run verify` does not include either one. Treat
them as evidence about `274d428`, not about `c83084f`:

- original six scan PoCs rerun against the repaired source; vulnerable source
  signatures no longer reproduced (at `274d428`);
- exact-commit fresh checkout reproduced at one canonical path with matching
  source and sealed publication-package digests, then copied into the working
  release directory unchanged (at `274d428`).

`npm ci` reported development-only audit findings during previous runs. The
release policy is `npm audit --omit=dev --audit-level=high`; do not misstate a
passing production audit as a clean audit of all development dependencies.

## Resolved local instability — the `AppShell` "flake"

**Diagnosed and fixed on 2026-08-04.** Recorded here because three prior
handoffs (2026-08-01, 2026-08-02, 2026-08-03) carried it as an unexplained
environmental flake with the advice "rerun before diagnosing; do not add
retries." It was neither environmental nor a flake.

Symptom: `src/components/shell/AppShell.test.tsx > exposes current navigation,
local status, and offline continuity` failed nondeterministically — 4 of 14
`npm run test:coverage` runs — always at the same assertion, always
`Unable to find role="button" and name "Open contextual AI assistant"`. Every
assertion before it passed.

Root cause: `AppShell` reaches `ContextualAssistant` through `next/dynamic`.
That component's module subtree — the chat panel, AI client, and schemas — is
transformed and evaluated on **first** import, inside whatever wait is running
when React resolves the lazy boundary, and its `loading:` placeholder is
`aria-hidden`, so nothing matching the trigger's role exists until it resolves.
Instrumenting the wait across full coverage runs measured **644, 660, 818, 894,
948, and 1001 ms** against testing-library's default **1000 ms** `findByRole`
budget. The test failed whenever the sample crossed the line; machine load
shifted the whole distribution right, which is why the observed rate ranged from
1-in-8 on an idle machine to 3-in-6 under load. Istanbul instrumentation is what
makes the subtree expensive: measured in isolation it costs 246 ms bare and
1202 ms under coverage.

Fix: one eager `import "@/components/ai/ContextualAssistant"` in the test file,
which moves the transform into the file's import phase where no per-assertion
timeout applies. The measured wait drops to **3-13 ms**, restoring roughly
987 ms of margin. No timeout was raised, no retry added, no test weakened or
skipped, and `retries: 0` stands. Coverage is byte-identical before and after
(85.14/74.31/81.98/87) because the module was already being loaded through the
dynamic import.

Verification: 0 failures in 10 consecutive full coverage runs, against a 4-in-14
baseline, plus the direct before/after timing measurements above.

Two general lessons worth keeping: a marginal timeout presents as a
load-sensitive flake, and "rerun and it passes" is evidence *for* a timing
defect rather than against one. Nothing here indicated a production fault — the
lazy boundary is deliberate architecture and the Chromium smoke suite never
reproduced it.

## Security scan state

Historical completed scan:

- Scan date: 2026-07-30
- Revision: `efdc0b4c48707e3a3a606bbf6903daff29678653`
- Result: six unresolved findings (medium 2, low 4), partial coverage because
  `src/lib/**` was ignored.
- Local report path on the authoring machine:
  `/private/var/folders/w1/wdjldgtj6zjfwzb1wh_6l56m0000gq/T/codex-security-scans-ei7ceR/calricula_pwa_demo/efdc0b4c48707e3a3a606bbf6903daff29678653_20260730T150205Z_g4bvxlpn/report.md`

Pending remediation diff scan:

- Codex Security workspace/session:
  `c332d3ed-bba0-4f10-b383-1e84dd651a0f`
- Target repository: `/Users/laccd/code/calricula`
- Mode: Review changes / diff
- Scope required by the app: repository root; the exact Git range contains
  only demo changes.
- Base: `b446c760f89f4e5efd13f2db1540984f8cfa59bc`
- Head **as configured on 2026-07-31**: `274d42813447b719d7f3dc82ab968d24349ea3a2`
- **This range is stale as of 2026-08-03.** The branch head is now `c83084f`,
  22 commits later. Re-target the pending scan at
  `b446c76..c83084f` (or the head at the time you run it) before pressing
  **Start scan**; a scan of the old range would leave the entire architecture
  review unreviewed.
- Setup validated, but `await_codex_security_scan_start` timed out after 840
  seconds because **Start scan** was not pressed.
- No scan ID, artifact directory, preflight, goal, phase progress, canonical
  artifacts, or completion receipt exists for this pending scan.

Resume by reopening that workspace, pressing **Start scan**, loading the
authoritative scan context, running the `security_diff_scan` capability
preflight, and following the `codex-security:security-diff-scan` workflow
through threat model, discovery, validation, attack-path analysis, reporting,
canonical artifact verification, and completion. Preserve this exact bounded
security context in every scan phase:

```text
Focus on the same-origin OpenRouter proxy, Turnstile session and rate controls, secret isolation, free-only model enforcement, browser-local curriculum storage, backup/import/reset privacy, PWA caching, Durable Object daily AI quota, and sealed Cloudflare deployment artifact integrity. Parent frontend/backend are out of scope and read-only.
```

After the diff scan closes the six findings, start a separate **standard** scan
over the complete tracked current commit with the same context. This second
scan is mandatory because the historical snapshot never reviewed the 44
previously ignored runtime files.

## Current release and external-service state

At handoff:

- `.release-evidence/local-gate.json` does not exist.
- No bootstrap ownership record exists under `.release-artifacts`.
- No release-owned production URL, Worker version ID, deployment ID, rollback
  version, staged marker, or completion evidence exists.
- Checked-in `wrangler.jsonc` correctly remains fail-closed with
  `AI_ENABLED=false`, `APP_ORIGIN=https://replace-before-deploy.invalid`, and
  an empty `OPENROUTER_FREE_MODELS` value.
- `OPENROUTER_API_KEY`, `TURNSTILE_SECRET_KEY`,
  `AI_SESSION_HMAC_SECRET`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, exact production
  origin, evaluated model IDs, and release account ID are not supplied.
- Wrangler was previously observed authenticated with Workers write access and
  `calricula-demo` was unused. This is time-varying and must be rechecked.
- The prior Wrangler OAuth token lacked `challenge-widgets.write`. The
  Turnstile widget therefore requires refreshed authentication with that
  scope or manual Cloudflare dashboard creation.

Do not infer current Cloudflare/OpenRouter limits or account state from this
handoff. Recheck the actual account and current primary documentation
immediately before bootstrap and final publication.

## Required continuation sequence

### Phase 1 - close source and security gates

1. Confirm the documentation commit is clean and no parent file changed.
2. Reopen/start and complete the security diff scan described above.
3. Fix any validated regression, add tests, commit with the required trailer,
   and rerun the diff scan if necessary.
4. Run a new standard scan over the entire tracked current commit.
5. Do not proceed while either scan has an unresolved reportable finding,
   incomplete coverage, missing canonical artifacts, or failed completion.

### Phase 2 - recheck Cloudflare and create bootstrap evidence

1. Recheck Wrangler authentication, exact account, Workers Free limits,
   Static Assets limits, Worker-name availability, SQLite Durable Object
   availability, and Turnstile permissions.
2. Require the exact Worker-not-found error for `calricula-demo`; never
   overwrite an unexpected existing Worker.
3. With fail-closed checked-in configuration, run:

   ```bash
   CLOUDFLARE_ACCOUNT_ID=<exact-account-id> \
     npm run release:gate -- --bootstrap
   ```

4. Verify mode-0600 `.release-evidence/local-gate.json` exists and matches the
   clean commit/tree, source, build, static assets, Worker, effective config,
   sealed package, and tool versions.
5. Establish the stable hostname by publishing only that sealed package:

   ```bash
   CLOUDFLARE_ACCOUNT_ID=<exact-account-id> npm run deploy:bootstrap
   ```

6. Preserve the immutable ownership, current deployment, history, rollback,
   and publication receipts. Run the bootstrap production contract,
   Lighthouse, and five-browser verification performed by the command.

### Phase 3 - configure Turnstile and qualify free models

1. Create a managed Turnstile widget authorized only for the exact
   `workers.dev` hostname. Refresh Wrangler authorization for
   `challenge-widgets.write` or use the dashboard.
2. Put only the public site key in gitignored `.env.local`:

   ```dotenv
   NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x...
   ```

3. Create one external regular mode-0600 secrets file outside this repository
   with exactly:

   ```dotenv
   OPENROUTER_API_KEY=...
   TURNSTILE_SECRET_KEY=...
   AI_SESSION_HMAC_SECRET=...
   ```

4. Revalidate safe OpenRouter key/quota metadata and discover the current
   eligible zero-price, ZDR, text/structured `:free` roster.
5. Evaluate at most four candidates using the fixed text and structured
   fixtures; choose two distinct passing concrete `:free` model IDs. The
   implicit final fallback remains `openrouter/free`.
6. Record discovery/evaluation evidence with the same OpenRouter credential
   fingerprint that will be deployed. Never print or commit the key.

### Phase 4 - bind final configuration and run the full gate

1. Update only non-secret configuration in `wrangler.jsonc`:
   exact HTTPS `APP_ORIGIN`, `AI_ENABLED=true`, and the two evaluated concrete
   model IDs in order.
2. Commit that configuration with the required trailer and restore a clean
   tree.
3. Run a security diff scan over the configuration commit.
4. Run the non-publishing full gate:

   ```bash
   npm run release:gate
   ```

5. Confirm its evidence binds the final commit/tree, tool versions, public
   site-key digest, model evidence, export, Worker bundle, effective config,
   and sealed publication-package digest.

### Phase 5 - stage, obtain a human session, and complete production checks

1. Publish the exact full-gate sealed package as an incomplete staged release:

   ```bash
   CLOUDFLARE_ACCOUNT_ID=<exact-account-id> \
   CALRICULA_RELEASE_BASE_URL=https://<exact-host>.workers.dev \
   CALRICULA_SECRETS_FILE=/absolute/path/outside/repo/release-secrets.env \
     npm run deploy:stage
   ```

2. Open the exact origin in a private browser window, enter the demo, accept
   the AI disclosure, and complete Turnstile. Stop before generating content.
3. Copy only the `__Host-calricula_ai_session=<signed-value>` cookie, read it
   silently into the shell, and run:

   ```bash
   read -r -s CALRICULA_AI_SESSION_COOKIE
   export CALRICULA_AI_SESSION_COOKIE

   CLOUDFLARE_ACCOUNT_ID=<exact-account-id> \
   CALRICULA_RELEASE_BASE_URL=https://<exact-host>.workers.dev \
     npm run release:verify:deployed

   unset CALRICULA_AI_SESSION_COOKIE
   ```

4. The final verifier must perform exactly one plain-text chat canary and one
   strict structured SLO canary, without retries, and validate returned free
   models, zero cost metadata when present, schemas, and content-free logs.
5. Close the private window and ensure final completion evidence exists.

## Production completion checklist

Do not declare completion until evidence covers all of the following against
the exact final URL and Cloudflare version:

- landing page and every finite deep link;
- `/api/health`, JSON `/api/*` 404 behavior, methods, origin checks, body
  limits, and no app-shell fallback for APIs;
- MIME types, CSP/security/cache headers, manifest, icons, service-worker
  scope, static 404, and update prompt;
- IndexedDB initialization, autosave/reload, multi-tab updates,
  backup/import/reset, profile isolation, and absence of legacy/Firebase
  requests;
- offline reload/read/create/edit/backup/reset;
- desktop Chromium, Firefox, WebKit, mobile Chrome, and iPhone Safari
  emulation;
- keyboard-only, visible focus, reduced motion, touch, orientation, 200%/400%
  zoom, and zero serious/critical Axe violations;
- Lighthouse performance at least 90, accessibility 100, LCP below or equal
  to 2.5 seconds, CLS below or equal to 0.1, and the committed additional
  thresholds;
- fewer than 20,000 static files, no asset over 25 MiB, compressed Worker under
  3 MiB, and complete raw-byte secret scans;
- static/non-AI usability when Turnstile, OpenRouter, quota, or AI is
  unavailable;
- one live text and one live structured canary only, both bound to the final
  deployment and recorded model/key evidence;
- final commit, fixture hash, source/build/package/config digests, Cloudflare
  version/deployment IDs, rollback version, exact URL, test/coverage totals,
  browser matrix, Lighthouse metrics, current plan/quota evidence, model IDs
  and evaluation date, and both canary results.

## Failure and recovery rules

- A local or security gate failure stops publication. Fix the responsible
  layer, commit it, rerun the applicable scans, rebuild from the exact commit,
  and reseal.
- If Worker upload/promotion state is uncertain, preserve the pending attempt.
  Use `release:verify:deployed`, `release:verify:staged`, or the guarded
  `release:cancel:pending-no-change` path documented in `README.md`.
- Never delete pending/staged/ownership/history evidence by hand.
- Never run a fresh upload merely because command output was interrupted. The
  recovery logic uses the attempt-unique release message and captured version
  ID.
- Preserve the bootstrap/current prior Cloudflare version for rollback. If a
  production critical path fails after publication, stop or roll back, fix,
  rerun the full local/security gates, upload a new sealed version, and repeat
  production verification.
- Do not claim completion from mocked tests, a dry run, a provisional hostname,
  or an AI-disabled bootstrap.

## High-value files for continuation

| Concern | Files |
| --- | --- |
| Architecture and operator workflow | `README.md`, `AGENTS.md`, this handoff |
| Static/export/PWA configuration | `next.config.ts`, `src/app/manifest.ts`, `scripts/build-pwa.mjs`, `scripts/validate-build.mjs`, `public/_headers` |
| Local data and backup/reset | `src/lib/data/repository.ts`, `src/lib/data/database.ts`, `src/lib/domain/schemas.ts` |
| Deterministic compliance | `src/lib/compliance/` |
| Browser AI client/review/apply | `src/lib/ai/`, `src/components/ai/` |
| Worker security and quota | `worker/index.ts`, `worker/daily-quota.test.ts`, `tests/worker/` |
| Cloudflare bindings | `wrangler.jsonc` |
| Release inventory and fingerprints | `scripts/release-inputs.mjs`, `scripts/release-state.mjs`, `scripts/release-evidence.mjs` |
| Exact-commit reproduction | `scripts/verify-fresh-checkout.mjs` |
| Sealed publication/recovery | `scripts/release-deploy.mjs`, `scripts/cloudflare-release-target.mjs` |
| Provider qualification/canary | `scripts/discover-openrouter-models.mjs`, `scripts/ai-evaluate.mjs`, `scripts/ai-canary.mjs`, `scripts/read-json-with-limit.mjs` |
| Production and performance checks | `scripts/verify-production.mjs`, `scripts/run-release-e2e.mjs`, `scripts/run-lighthouse.mjs` |

## Definition of done

This handoff is complete only as documentation. The application release is
done only when both required security scans complete without unresolved
reportable findings, the full clean exact-commit gate passes, the sealed
package is the exact version deployed, all production verification passes, the
two live AI canaries succeed, final evidence is present, and the parent
frontend/backend remain unchanged.
