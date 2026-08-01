# Calricula PWA Demo - Security Remediation and Deployment Handoff

Last reconciled: 2026-07-31 (America/Los_Angeles)

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

| Area | Status | Evidence boundary |
| --- | --- | --- |
| Local-first PWA implementation | Implemented | Tracked application and test source |
| Six historical security findings | Remediated in code | Requires diff-scan validation before closure |
| `src/lib/**` provenance | Fixed | 44 files tracked; fresh-checkout package reproduction passed |
| Aggregate local verification | Passed before this handoff | 468 UI/repository tests, 136 Worker tests, 7 Chromium smoke tests; rerun via release gate |
| Security diff scan | Blocked before start | Setup wait timed out; no new scan artifacts |
| New complete standard scan | Not run | Required because historical scan omitted `src/lib/**` |
| `.release-evidence/local-gate.json` | Missing | No bootstrap or full release seal exists |
| Cloudflare bootstrap/deployment | Not performed | No release-owned hostname, version, deployment, or rollback receipt |
| Turnstile/OpenRouter configuration | Missing | No site key, secret, HMAC secret, provider key, or evaluated model chain supplied |
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
- The implementation checkpoint was clean when this handoff was authored.
- `git diff --name-only main...HEAD -- . ':(exclude)calricula_pwa_demo/**'`
  was empty: no parent frontend/backend file changed.
- All 44 runtime files under `calricula_pwa_demo/src/lib/**` are tracked and
  protected by the demo `.gitignore` negations.
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

The following checks passed during the implementation session. They are useful
evidence of code health but are **not** a substitute for the fresh release
gate required at the final commit:

- production dependency audit: zero production vulnerabilities at the
  configured threshold;
- ESLint and TypeScript typecheck;
- 68 Vitest files / 468 UI, domain, repository, and release-script tests;
- coverage: 84.45% statements, 73.55% branches, 81.80% functions, and 86.33%
  lines, including the higher risk-module thresholds;
- 136 workerd-compatible Worker tests;
- static export validation: 211 files and approximately 2.32 MiB total;
- dry-run Worker validation: approximately 15.91 KiB compressed;
- 7 Chromium critical-path smoke tests;
- original six scan PoCs rerun against the repaired source; vulnerable source
  signatures no longer reproduced;
- exact-commit fresh checkout reproduced at one canonical path with matching
  source and sealed publication-package digests, then copied into the working
  release directory unchanged.

`npm ci` reported development-only audit findings during previous runs. The
release policy is `npm audit --omit=dev --audit-level=high`; do not misstate a
passing production audit as a clean audit of all development dependencies.

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
- Head: `274d42813447b719d7f3dc82ab968d24349ea3a2`
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
