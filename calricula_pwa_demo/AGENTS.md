# AGENTS.md

This file applies only to `/Users/laccd/code/calricula/calricula_pwa_demo` and
overrides parent-project instructions where this standalone demo differs from
the original Calricula stack. Read [HANDOFF.md](./HANDOFF.md) before resuming
release, security-scan, credential, or deployment work.

## Project boundary

This directory is a separate, local-first PWA demo. The parent Calricula
`frontend/`, `backend/`, database, Firebase, and Gemini application are
read-only reference implementations and are not part of this build.

- Make changes only inside `calricula_pwa_demo/` unless the user explicitly
  expands the boundary.
- Do not add Firebase, FastAPI, PostgreSQL, Gemini, cloud curriculum storage,
  or login requirements to this demo.
- Do not modify or commit parent frontend/backend files as a side effect of
  tests, formatting, release preparation, or documentation.
- Preserve Calricula branding, the light-only luminous visual system, and
  WCAG 2.2 AA requirements.

## Architecture and privacy invariants

- Next.js 16 App Router statically exports the finite UI to `out/`.
- Curriculum data is accessed through the typed repository under
  `src/lib/data/` and persists in browser IndexedDB through Dexie.
- Course/program data, comments, workflows, notifications, backups, settings,
  AI conversations, and accepted AI artifacts must not be stored by the
  Worker or any hosted application database.
- The root-scoped service worker caches application code and finite routes. It
  must never cache `/api/**`, AI requests/responses, backups, or user-created
  curriculum data.
- Only explicitly selected AI context may leave the browser. The same-origin
  Worker forwards it to OpenRouter after disclosure, Turnstile/session checks,
  rate limits, and the authoritative daily quota reservation.
- `OPENROUTER_API_KEY`, `TURNSTILE_SECRET_KEY`, and
  `AI_SESSION_HMAC_SECRET` are Worker secrets. They must never be committed,
  logged, bundled, written to IndexedDB/backups, or returned to the browser.
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is public but remains a gitignored build
  input until its digest is bound into release evidence.
- OpenRouter routing must remain free-only: two evaluated concrete `:free`
  models followed by `openrouter/free`, zero price caps, ZDR, and
  `data_collection: deny`. Never silently fall back to paid or less-private
  routing.
- `DAILY_AI_QUOTA` is a SQLite Durable Object used only for pseudonymous quota
  accounting. Store only an HMAC-derived session/install identifier, UTC day,
  attempt count, idempotency request IDs, and expiry metadata. Never store
  prompts, responses, curriculum text, IP addresses, or identity data.
- The demo makes no authentication, server backup, collaboration, or FERPA
  compliance claim. The demo-role selector simulates workflow views only.

## Toolchain and local setup

Required versions are pinned in `package.json` and `package-lock.json`. Use
Node.js 22.13.0 or newer and npm 10.9.8. Wrangler is a pinned dev dependency;
invoke it through npm scripts or `npx wrangler` from this directory.

```bash
npm ci
npm run dev
```

Use `.dev.vars` only for local Worker development. Start from
`.dev.vars.example`; never commit the populated file. The local design copy
`openrouter-llms-full.txt` is intentionally ignored and is not a release
input, static asset, or service-worker resource.

## Source and Git requirements

- The repository root is `/Users/laccd/code/calricula`; this demo is a tracked
  subtree within it.
- The release branch is `codex/calricula-pwa-demo-release` until intentionally
  changed.
- Every runtime, Worker, test, build, and release input must be tracked.
  In particular, the demo `.gitignore` must retain the `!src/lib/` and
  `!src/lib/**` negations that override the parent Python `lib/` rule.
- Do not release from a dirty tree, untracked source, an ignored runtime file,
  or a build copied from a different checkout.
- Preserve unrelated user changes. Never use destructive Git commands to
  obtain a clean tree.
- Every commit requires this exact trailer:

  ```text
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

- Never write a real personal or maintainer email in code, docs, commits, or
  configuration.

Before claiming a release input is reviewable, run from the repository root:

```bash
git status --short --branch
git ls-files 'calricula_pwa_demo/src/lib/**' | wc -l
git check-ignore -v calricula_pwa_demo/src/lib/data/repository.ts || true
git diff --name-only main...HEAD -- . ':(exclude)calricula_pwa_demo/**'
```

The expected tracked `src/lib/**` count at the current handoff is 45 (it was 44
through `274d428`; `5c0de4c` added `src/lib/ai/session-readiness.ts` and its
test, the seven-route evaluation work added
`src/lib/ai/eval-catalog-parity.test.ts`, and removing the write-only AI
artifact path deleted `src/lib/ai/persistence.ts` and its test). The last
command must remain empty unless the user explicitly changes the
boundary — and it is only meaningful from the repository root, because both of
its pathspecs are cwd-relative.

## Testing expectations

For targeted development, run the nearest unit or Worker test first. Before a
change is considered complete, run the proportionate aggregate gates:

```bash
npm run audit:production
npm run lint
npm run typecheck
npm run test:coverage
npm run test:worker
npm run build
npm run deploy:dry-run
npm run test:e2e:smoke
```

The full local release gate is stricter and is the publication prerequisite:

```bash
CLOUDFLARE_ACCOUNT_ID=... npm run release:gate -- --bootstrap
# Later, after AI configuration and recorded model evidence:
npm run release:gate
```

The gate performs a clean lockfile install, production dependency audit, lint,
typecheck, coverage, Worker tests, clean build, dry-run Worker bundle,
exact-commit fresh-checkout reproduction, all five local browser projects,
local production-contract verification, Lighthouse, and (for the full gate)
recorded AI evidence. It writes the gitignored mode-0600
`.release-evidence/local-gate.json` only after all steps pass.

Coverage floors are enforced in `vitest.config.ts` and
`vitest.worker.config.ts`. Do not weaken thresholds, skip tests, quarantine
failures, or treat mocked AI tests as a live OpenRouter canary.

## Security workflow

- Treat the completed 2026-07-30 scan as historical evidence only. Its six
  findings were remediated in code but require a security diff scan for
  closure.
- Run the diff scan from baseline
  `b446c760f89f4e5efd13f2db1540984f8cfa59bc` through the current remediation
  commit.
- Because the historical scan omitted ignored `src/lib/**`, also run a new
  standard scan over the complete tracked commit. A diff scan alone does not
  establish full coverage.
- Do not deploy while either scan has unresolved reportable findings or lacks
  canonical artifacts/completion.
- Do not claim that local PoCs or unit tests close a finding until the security
  workflow validates it.

## Guarded Cloudflare release

The target is one Worker named `calricula-demo` with Static Assets. Only
`/api/*` runs Worker code first. `wrangler.jsonc` intentionally ships with
`AI_ENABLED=false`, an invalid origin, and no model IDs so an accidental first
deployment fails closed.

- Recheck current account authentication, Free-plan limits, Worker-name state,
  Durable Object availability, and Turnstile permissions immediately before
  publishing. Hosted limits and account state are time-varying.
- Never add `account_id` to `wrangler.jsonc`; supply the exact
  `CLOUDFLARE_ACCOUNT_ID` environment value.
- Never use raw `wrangler deploy` as the release path.
- Never overwrite an unexpected existing `calricula-demo` Worker.
- Publish only the sealed package created by the passing gate. The release
  tooling uploads the validated Worker with
  `wrangler versions upload --no-bundle --strict` and promotes that exact
  captured version ID with `wrangler versions deploy`.
- Preserve `.release-artifacts` ownership, pending, staged, history, current,
  and rollback records. Do not delete or hand-edit them to bypass recovery.
- Keep release secrets in one absolute, external, regular mode-0600 file with
  exactly the three allowed secret names. Do not pass secret values on command
  lines or print them.
- The first AI-enabled release is two-phase: `deploy:stage`, human Turnstile
  completion, then `release:verify:deployed` with the short-lived session cookie
  read silently into the shell.
- Model qualification and the production canary are separate budgets, and only
  one of them may grow.
- `ai:evaluate` calls OpenRouter directly with the maintainer credential and
  qualifies each candidate on all seven task routes — one fixed request per
  route, at most four candidates, 28 requests, no retries, paced by
  `REQUEST_SPACING_MS` to respect free-tier limits. A candidate is eligible only
  when `pass.rate` is 1. Its rubric is pinned to the Worker's own output
  validators by `tests/worker/ai-eval-parity.test.ts`; on disagreement the
  rubric is wrong, because the Worker is the contract.
- The deployed canary is unchanged and must stay unchanged: exactly one text and
  one structured request without retries. The Worker enforces
  `MAX_DAILY_ATTEMPTS = 5` per install per UTC day (`worker/quota-protocol.ts`),
  so a canary covering every route is not possible and must not be attempted by
  rotating sessions.

Authoritative release commands and recovery rules are documented in
`README.md`. If a publish becomes uncertain, preserve the pending record and
use the documented reconciliation command; do not rebuild, re-upload, or
cancel by assumption.

## Current status

`HANDOFF.md` is the authoritative point-in-time status. At the 2026-07-31
handoff, no Cloudflare Worker has been bootstrapped by this release workflow,
no local-gate evidence exists, production credentials are absent, and the new
security scans remain incomplete. Do not report this demo as deployment-ready
until every completion condition in that handoff is verified.
