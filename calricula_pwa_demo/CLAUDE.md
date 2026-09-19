# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Scope and boundary

`calricula_pwa_demo/` is a **standalone, local-first PWA demo** that lives as a tracked
subtree inside the Calricula repository (`/Users/laccd/code/calricula`). It shares the
product domain and visual language with the parent app but **none of its stack**: the
root `CLAUDE.md` describes a Next.js + FastAPI + PostgreSQL + Firebase + Gemini system
that does not apply here. There is no login, no server database, and no Docker.

- Make changes only inside `calricula_pwa_demo/`. Check it **from the repository root**
  (`/Users/laccd/code/calricula`), where
  `git diff --name-only main...HEAD -- . ':(exclude)calricula_pwa_demo/**'` must stay
  empty. Both pathspecs are cwd-relative, so running it from `calricula_pwa_demo/` makes
  the exclude match nothing and lists every demo file — that output is an artefact of the
  wrong cwd, not a boundary violation.
- Do not add Firebase, FastAPI, PostgreSQL, Gemini, cloud storage, or auth to this demo.
- `AGENTS.md` (release/security/privacy invariants) and `HANDOFF.md` (authoritative
  point-in-time release status) take precedence over this file for release work.
  `README.md` documents the full guarded-release procedure.

## Commands

```bash
npm ci                      # install from the pinned lockfile (Node >=22.13, npm 10.9.8)
npm run icons               # regenerate PWA icons into public/ (run once before first dev)
npm run dev                 # Next dev server on :3000; SW registration is disabled here
npm run lint                # eslint . --max-warnings=0
npm run typecheck           # tsc --noEmit
npm run test                # vitest (jsdom) over src/**/*.test.tsx + scripts/*.test.mjs
npm run test:coverage       # same, with enforced coverage thresholds
npm run test:worker         # vitest under @cloudflare/vitest-pool-workers (worker/, tests/worker/)
npm run build               # next build --webpack -> out/, then build-pwa + validate-build
npm run deploy:dry-run      # bundle the Worker without publishing, then validate the bundle
npm run test:e2e:smoke      # Playwright chromium @smoke against the built out/ (build first)
npm run test:e2e:full       # all five browser projects via scripts/run-release-e2e.mjs
npm run verify              # the standard aggregate gate (audit → lint → types → tests → build → dry-run → smoke)
```

Single test / focused runs:

```bash
npx vitest run src/lib/compliance/hours.test.ts          # one unit test file
npx vitest run -t "Title 5 hour calculations"            # by test name
npx vitest run --config vitest.worker.config.ts worker/daily-quota.test.ts
npx playwright test e2e/smoke.spec.ts --project=chromium # one e2e spec
```

E2E and `verify:production:local` serve the **built** `out/`, not the dev server — run
`npm run build` first or they test stale output. Playwright starts its own server on
:4177 (`wrangler dev`, or the static server for WebKit) and forces `AI_ENABLED=false`
so the suite never spends OpenRouter quota.

Release commands (`release:gate`, `deploy:bootstrap`, `deploy:stage`, `release:verify:*`)
are guarded and credentialed — read `README.md` and `AGENTS.md` before running any of them.
Never use raw `wrangler deploy` as a release path.

## Architecture

**One Worker, static assets first.** `next.config.ts` sets `output: 'export'` +
`trailingSlash`, producing a finite set of route shells in `out/`. `wrangler.jsonc`
serves `out/` via Static Assets with `run_worker_first: ["/api/*"]`, so `worker/index.ts`
only ever sees API traffic; everything else is a static file. Entity IDs live in **query
parameters** (`/courses/view/?id=…`), which is what keeps the route set finite and
precacheable.

**Client-only runtime boundary.** Route files under `src/app/**` are thin: a layout that
re-exports `WorkspaceLayout`, and a page that wraps a route screen from
`@/components/**` in `<Suspense>`. `DeferredWorkspace` defers to a `dynamic(..., { ssr: false })`
`WorkspaceRuntime` after first paint, so IndexedDB/Dexie code never enters the exported
HTML shell and the shell paints instantly.

**Data layer (`src/lib/data/`).** `database.ts` declares the Dexie schema
(`CurriculumDatabase`, 18 tables, compound indexes). `repository.ts` exposes the single
`curriculumRepository` (`DexieCurriculumRepository`) — the only sanctioned write path,
covering seeding/reset, backup export/import, course & program aggregates, versioning
and lineage, comments, workflow transitions, notifications, dashboard rollups, personas,
and AI conversation/artifact persistence. Mutations bump a revision on
`repositoryInvalidation` (`invalidation.ts`); `hooks.ts` (`useCourses`, `useCourse`,
`useDashboard`, …) re-runs queries off that revision. Types live in `contracts.ts`;
runtime shapes are Zod schemas in `src/lib/domain/schemas.ts`, with the seeded demo
dataset in `src/lib/domain/fixture.ts`.

**Compliance engine (`src/lib/compliance/`).** Pure, dependency-free TypeScript:
`hours.ts` (18-week semester, 48 minimum / 54 conventional hours per unit), `rules.ts`,
`ccn.ts`, `citations.ts`. `golden-parity.test.ts` pins these results to a captured
fixture of the **parent Python compliance service** — if you change hour math or rule
IDs, that parity test is the contract you are breaking.

**AI path (the only data that leaves the device).** Browser side: `src/lib/ai/session.ts`
(installation ID, disclosure acknowledgement, Turnstile-gated session) and `client.ts`
(envelope parsing, `AIRequestError`, retry-after) call the same-origin routes in
`AI_TASK_ROUTES` (`/api/ai/chat`, `slos`, `catalog-description`, `content-outline`,
`top-code`, `program-narrative`, `compliance-explanation`); responses are validated by
`src/lib/ai/schemas.ts` before reaching the UI. Server side, `worker/index.ts` is one
file exporting `handleRequest` (directly unit-tested) that verifies Turnstile, issues and
verifies an HMAC-signed `__Host-calricula_ai_session` cookie, applies the
`GLOBAL_RATE_LIMIT` / `SESSION_RATE_LIMIT` bindings, reserves the authoritative
five-per-UTC-day quota in the `DailyAiQuota` SQLite Durable Object, then calls OpenRouter
with free-only routing (ZDR, `data_collection: deny`, zero price caps). Provider fallback
is *permitted* (`allow_fallbacks: true`) — what's enforced is that any provider reached
must still be free and ZDR, via the `:free` model list plus zero `max_price`; the
`ai:evaluate` script is the one that sets `allow_fallbacks: false`. The DO stores only an
HMAC-derived install ID, day, attempt count, request IDs, and expiry — never prompts,
responses, or curriculum text.

**Service worker.** `scripts/build-pwa.mjs` runs Workbox `generateSW` in `postbuild`. It
rewrites precache URLs to Cloudflare's canonical trailing-slash form, sets
`ignoreURLParametersMatching: [/.*/]` so query-ID routes hit their precached shell, and
uses NetworkFirst navigation with an `/offline` fallback. It must never precache
`/api/**`, `connectivity.txt` (a deliberate network-only probe served `no-store`), or
`openrouter-llms-full.txt`.

**Release automation (`scripts/`).** `release-gate.mjs` runs `RELEASE_GATE_STEPS` in
order and only then writes the mode-0600 `.release-evidence/local-gate.json` seal;
`release-state.mjs` / `release-inputs.mjs` enforce a clean tree and tracked inputs;
`verify-fresh-checkout.mjs` rebuilds the exact commit at a canonical path and requires an
identical publication-package digest; `release-deploy.mjs` does the guarded
upload-then-promote with pending/ownership/lease records under `.release-artifacts/`;
`validate-build.mjs`, `validate-worker-bundle.mjs`, and `verify-production.mjs` enforce
Cloudflare limits, headers, MIME essences, and secret scans. Nearly every script has a
sibling `*.test.mjs` run by the normal `npm test`.

## Conventions and constraints

- **UI**: shared `luminous-*` component classes in `src/styles/globals.css` plus the
  `luminous` scale in `tailwind.config.ts` (Tailwind v3, parchment/navy/gold, Source
  Serif 4 + Source Sans 3). Light-only — do not reintroduce dark mode. Reskin by editing
  the shared classes, not per-component overrides.
- **Accessibility is a hard gate**: Lighthouse requires accessibility exactly `1.00`
  (`lighthouse.thresholds.json`), and `e2e/accessibility.spec.ts` runs axe. WCAG 2.2 AA;
  on parchment use `gold-ink` (`#7E6018`) for small text — decorative `gold` is for rules
  and borders only.
- **Coverage floors** are enforced in `vitest.config.ts` (80% statements/lines/functions,
  70% branches globally; 90/85 for `repository.ts`, `ai/client.ts`, `ai/persistence.ts`,
  `ai/session.ts`, `approvals/workflow.ts`). Do not weaken thresholds or skip tests.
- **`wrangler.jsonc` ships fail-closed** (`AI_ENABLED=false`, invalid `APP_ORIGIN`, empty
  model list) so an accidental first deploy cannot serve AI. Never add `account_id`;
  pass `CLOUDFLARE_ACCOUNT_ID` instead.
- `OPENROUTER_API_KEY`, `TURNSTILE_SECRET_KEY`, `AI_SESSION_HMAC_SECRET` are Worker
  secrets — never committed, logged, bundled, or returned to the browser. Local Worker
  dev uses a gitignored `.dev.vars` (start from `.dev.vars.example`). Never prefix a
  secret with `NEXT_PUBLIC_`.
- The demo `.gitignore` **must keep the `!src/lib/` and `!src/lib/**` negations** that
  override the parent repository's Python `lib/` rule; without them the runtime data,
  AI, compliance, and domain code silently drops out of Git.
- Every commit requires the trailer
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Never put a
  real personal or maintainer email in code, docs, commits, or config.
- `openrouter-llms-full.txt` is an intentionally ignored local design reference — not a
  Git, build, static-export, precache, or deployment input.
- Do not report this demo as deployment-ready: per `HANDOFF.md`, no Worker has been
  bootstrapped, no gate evidence exists, and the security scans are incomplete.

## Agent skills

### Issue tracker

Local markdown under the gitignored `calricula_pwa_demo/.scratch/`, one directory per
feature. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, unchanged, recorded as a `Status:` line in each issue file. See
`docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` plus `docs/adr/` at the demo root. See
`docs/agents/domain.md`.
