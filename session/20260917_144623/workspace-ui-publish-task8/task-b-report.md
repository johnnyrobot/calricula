# Task B report — Calricula host Task 8 on the published `@johnnyrobot/workspace-ui@0.1.0`

Status: DONE_WITH_CONCERNS
Branch: `feat/workspace-ui-shell` (off `main` e5729a6)
Commits:
- `fd882b7` feat(frontend): render the shared ApplicationX workspace shell inside the program collaboration route
- `d6f2b6f` ci: install @johnnyrobot/workspace-ui from GitHub Packages (CI, Docker, docs)

## Files changed

Commit 1 (`fd882b7`):
- `frontend/.npmrc` (new; only `@johnnyrobot:registry=https://npm.pkg.github.com`)
- `frontend/package.json` (`"@johnnyrobot/workspace-ui": "0.1.0"` exact), `frontend/package-lock.json` (resolved to `https://npm.pkg.github.com/download/@johnnyrobot/workspace-ui/0.1.0/…`, plus `zod`)
- `frontend/jest.config.js` — `transformIgnorePatterns` lets SWC transform the ESM-only package; `moduleNameMapper` spells out `dist/index.js` (the package exports only `types` + `import` conditions, which Jest's CJS resolver cannot use)
- `frontend/tailwind.config.ts` — `content` += `./node_modules/@johnnyrobot/workspace-ui/dist/**/*.js`
- `frontend/src/styles/globals.css` — `:root { --ax-* }` overrides (surface, surface-alt, ink, ink-muted, accent, accent-ink, hairline, font, radius)
- `frontend/src/lib/applicationx/types.ts` — type re-exports from the package (`AXStatus`/`AXTokens` stay in `client.ts`)
- `frontend/src/lib/applicationx/sse.ts` — `export { subscribeSSE, type SubscribeSSEOptions } from '@johnnyrobot/workspace-ui'`
- `frontend/src/app/programs/[id]/collaboration/page.tsx` — `<WorkspaceShell adapter context labels />` inside a `luminous-card` for `ready`; `hostContext` memoised on program revision; adapter memoised on `getToken`/router/standalone URL; explicit `import '@johnnyrobot/workspace-ui/tokens.css'`
- `frontend/src/app/programs/[id]/collaboration/__tests__/page.test.tsx` — `useRouter` mock; ready resolutions installed as defaults (the shell resolves a second time); M-10 test asserts the shell region; new Task 8 page test
- `frontend/src/components/applicationx/__tests__/HostStatePanel.test.tsx` — `WorkspaceShell` smoke test (labelled `<section>` inside `.luminous-card`, no `<main>`/`<h1>`, labelled ask textbox)
- `frontend/e2e/applicationx-embed.spec.ts` — the two `test.fixme` chat blocks are real steps (cases 1 and 8)
- `backend/tests/stubs/applicationx_stub.py` — every event payload carries the turn's `context_id` (kept per run id); `chat.messages` also returns `conversation_id`/`message_id`

Commit 2 (`d6f2b6f`):
- `.github/workflows/ci.yml` — frontend job `permissions: contents: read, packages: read`; "Authenticate to GitHub Packages" step writes `//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}` to the runner's `~/.npmrc` with `NODE_AUTH_TOKEN: ${{ secrets.WORKSPACE_UI_READ_TOKEN || secrets.GITHUB_TOKEN }}` before `npm ci`
- `frontend/Dockerfile.prod` — `.npmrc` copied with the package files; both `npm ci` runs use `RUN --mount=type=secret,id=npm_token …` (token written to `~/.npmrc`, install, `rm` in the same layer; explicit error if the secret is missing)
- `frontend/Dockerfile` (dev) — same for its `npm install` (the dev compose build would otherwise fail; see deviations)
- `docker-compose.prod.yml`, `docker-compose.yml` — build `secrets: [npm_token]` + top-level `secrets: npm_token: file: ${NPM_TOKEN_FILE:-./.npm_token}` with comments
- `.gitignore` — `.npm_token`; `.env.example` — note that the token is a build secret, not an env var
- `docs/APPLICATIONX-EMBED.md` — "Chat shell" rewritten; new "Installing the shared workspace package" (how to obtain a `read:packages` token, local install, `docker build --secret id=npm_token,src=…`, compose, CI, the source-build dependency on a private package as an owner decision)
- `README.md` — prerequisite bullet, quick-start `.npm_token` step, frontend setup install line, production build note, E401 troubleshooting entry, ApplicationX section note

## Install (local)

```
cd frontend
printf '@johnnyrobot:registry=https://npm.pkg.github.com\n' > .npmrc
env "npm_config_//npm.pkg.github.com/:_authToken=$(gh auth token)" npm install @johnnyrobot/workspace-ui@0.1.0 --save-exact
# added 2 packages, and audited 917 packages in 3s
```
The token was passed only through that command's environment; nothing was written to `~/.npmrc` or the repo. `next build` accepted the package without `transpilePackages` (it was tried while diagnosing the CSS issue below and then reverted — not needed).

## Checks

`cd frontend && npm test`
```
Test Suites: 28 passed, 28 total
Tests:       443 passed, 443 total
```
(coverage thresholds intact; page suite 11/11 incl. the new Task 8 test; HostStatePanel suite 18/18 incl. the shell smoke test)

`cd frontend && npm run build`
```
✓ Compiled successfully in 3.0s
├ ○ /collaboration
├ ƒ /programs/[id]/collaboration
```
`.next/static/chunks/*.css` contains `.ax-shell` (package stylesheet bundled).

`cd frontend && npm run lint`
```
✖ 83 problems (0 errors, 83 warnings)   # all 83 warnings pre-existing
```

`cd backend && DATABASE_URL=postgresql://postgres:postgres@localhost:5435/calricula venv/bin/python -m pytest -q -p no:cacheprovider`
```
Required test coverage of 45% reached. Total coverage: 52.71%
331 passed, 1 warning in 4.09s
```

Docker (`Dockerfile.prod`, deps stage, token from a `mktemp -d` file deleted afterwards):
```
DOCKER_BUILDKIT=1 docker build --target deps --secret id=npm_token,src=$T/npm_token -f Dockerfile.prod .
#8 added 159 packages … #9 added 919 packages … DONE
docker run --rm <img> sh -c 'ls /root/.npmrc; ls node_modules/@johnnyrobot/workspace-ui/dist/index.js'
  ls: /root/.npmrc: No such file or directory
  node_modules/@johnnyrobot/workspace-ui/dist/index.js
```
Without the secret the build fails at step 4/5 with `npm_token secret missing: pass --secret id=npm_token,src=<file> (read:packages token)`. Image removed afterwards. `docker compose -f docker-compose.prod.yml config` and `docker compose config` both parse with the secrets wiring.

Secret greps on tracked files:
```
git grep -nE "_authToken=[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}" -- .   → empty
git grep -n "_authToken\|ghp_\|gho_\|ghu_" -- . ':!docs/applicationx' ':!session'
  → 8 hits, all template lines with no value: ci.yml (`${NODE_AUTH_TOKEN}`, the line the plan prescribes),
    both Dockerfiles (`$(cat /run/secrets/npm_token)`), README/APPLICATIONX-EMBED.md (`<token>` / `$(gh auth token)`).
```
The literal "must be empty" cannot hold together with the plan's prescribed `echo "//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}"` CI step; no token value is anywhere in the tree.

## Live stack (exact commands)

```
# seed (backend/) — :5435 was fresh: migrated + seeded
DATABASE_URL=postgresql://postgres:postgres@localhost:5435/calricula venv/bin/alembic upgrade head
DATABASE_URL=postgresql://postgres:postgres@localhost:5435/calricula venv/bin/python -m seeds.seed_all
# Computer Science = 721b856e-6eab-47f0-9f80-46dbf9212d03 ; Business Administration Certificate = 53a544ec-…

# backend :8001
DATABASE_URL=postgresql://postgres:postgres@localhost:5435/calricula AUTH_DEV_MODE=true APPLICATIONX_EMBED_ENABLED=true \
APPLICATIONX_API_ORIGIN=http://localhost:8099 APPLICATIONX_ORGANIZATION_REF=lamc APPLICATIONX_CAMPUS_REF=LAMC \
APPLICATIONX_STANDALONE_URL=http://localhost:3002 venv/bin/uvicorn app.main:app --port 8001

# stub :8099 (normal / outage)
STUB_MAPPED=721b856e-6eab-47f0-9f80-46dbf9212d03 venv/bin/uvicorn tests.stubs.applicationx_stub:app --port 8099
STUB_DOWN=1 STUB_MAPPED=721b856e-6eab-47f0-9f80-46dbf9212d03 venv/bin/uvicorn tests.stubs.applicationx_stub:app --port 8099

# frontend :3001
NEXT_PUBLIC_AUTH_DEV_MODE=true NEXT_PUBLIC_API_URL=http://localhost:8001 npm run dev -- -p 3001

# playwright (temporary untracked playwright.ax-tmp.config.ts: baseURL 3001, chromium only, list reporter, no webServer; deleted afterwards)
PLAYWRIGHT_BASE_URL=http://localhost:3001 npx playwright test -c playwright.ax-tmp.config.ts e2e/applicationx-embed.spec.ts
STUB_DOWN=1 PLAYWRIGHT_BASE_URL=http://localhost:3001 npx playwright test -c playwright.ax-tmp.config.ts e2e/applicationx-embed.spec.ts
```

Normal run (final, after the last page change):
```
Running 8 tests using 1 worker
  ✓  1 … staff enters from nav and program page without leaving the layout (case 1) (1.6s)
  ✓  2 … chat answers with sources inside the shared workspace shell (case 1 chat steps) (1.1s)
  ✓  3 … staff without ApplicationX access sees the access panel, never a workspace (case 2) (914ms)
  ✓  4 … unmapped program requires explicit setup (case 4) (696ms)
  ✓  5 … reload and back preserve program context (case 6) (912ms)
  ✓  6 … keyboard-only reach at narrow width (case 8) (1.2s)
  ✓  7 … keyboard-only chat at narrow width (case 8 chat steps) (1.5s)
  -  8 … upstream outage leaves curriculum editing usable (case 9)
  1 skipped
  7 passed (8.4s)
```
Outage run (stub restarted with `STUB_DOWN=1`):
```
  -  1..7 skipped
  ✓  8 … upstream outage leaves curriculum editing usable (case 9) (830ms)
  7 skipped
  1 passed (1.2s)
```
Stub log confirmed `POST /v1/chat/messages` and `GET /v1/chat/runs/…/events` per chat case. A screenshot check (temporary spec, deleted) showed the shell in the catalog palette: Send button `rgb(126, 96, 24)` (gold-ink) with paper text, messages as hairline cards, `Sources` list with the citation link.

## Deviations

1. **`--ax-accent` → `--color-gold-ink`, not `--color-gold`.** `.ax-button` paints `--ax-surface` text on `--ax-accent`; decorative gold (#9a7b2e) gives ~3.9:1 on paper and fails AA for the Send/Retry labels. Gold-ink (#7e6018) gives ~5.6:1. Focus outlines (non-text, 3:1) are fine either way. Also set `--ax-font: var(--font-sans)` and `--ax-radius: 0` (squared corners per the catalog theme).
2. **Explicit `import '@johnnyrobot/workspace-ui/tokens.css'` in the page.** The package's own `import './theme/tokens.css'` in `dist/index.js` is tree-shaken by both Turbopack dev and `next build`: its `package.json` `sideEffects: ["*.css"]` glob does not match `dist/theme/tokens.css` (needs `**/*.css`). Verified: before the fix the only CSS chunk lacked `.ax-shell` and the Send button was transparent; after it the styles apply. `transpilePackages` did not help and is not needed. **This is a package bug to fix in ApplicationX (Task A follow-up): `"sideEffects": ["**/*.css"]`.** The explicit import keeps working after that fix.
3. **Adapter memoised on `getToken`/router/standalone URL rather than per `context_id`.** `react-hooks/refs` (lint error, 0-errors gate) rejects the `getTokenRef.current` indirection inside `useMemo`. `AuthProvider` only recreates `getToken` when auth state changes (token refreshes live in refs), so the adapter is stable in practice; the package reads it through a ref anyway and the chat panel is keyed on `context_id` by the shell itself.
4. **Stub change (backend/tests/stubs).** The package's `useChat` drops any event whose `context_id` differs from the current context; the stub's payloads had none, so every frame was ignored and the status never reached "Answer ready". The stub now records `run_id → context_id` on `chat.messages` and tags all three events (matching the package's SSE contract: "the server puts `context_id` inside each `data` payload"). Backend suite unchanged (the stub is not collected).
5. **Dev `frontend/Dockerfile` + `docker-compose.yml` also wired** (not in the brief): their `npm install` would fail with E401 otherwise.
6. **`useRouter` added to the page** for `createBrokeredAdapter`'s `navigateToProgram`; the page test mocks it.
7. The plan's `--ax-hairline: var(--color-hairline)` does not exist; mapped to `--color-border` as the brief's context said.
8. Seed program uuids differ from the Task 9 report (fresh DB): Computer Science is now `721b856e-…`.

## Concerns

1. **Package `sideEffects` bug** (deviation 2) — any other host importing only `WorkspaceShell` gets an unstyled shell unless it also imports `./tokens.css`. Recommend a `0.1.1` with `"sideEffects": ["**/*.css"]`.
2. **Two "Open in ApplicationX" controls** on a ready page: Calricula's `ContextBanner` link and the shell's `ContextHeader` button. `WorkspaceShellProps` has no way to hide the latter (`onOpenStandalone` only overrides the handler). Cosmetic redundancy; both go to the same URL. A `labels`/prop to suppress it would be a package change.
3. **Double resolve on a ready page**: the page resolves the context (to choose between `HostStatePanel` and the shell) and the shell's `useHostContext` resolves again on mount — two `host-contexts.resolve` calls per load. Harmless with the stub; worth noting for real ApplicationX rate limits. The page test asserts both calls carry the same context.
4. **CI `GITHUB_TOKEN` and package visibility**: `GITHUB_TOKEN` can read a GitHub Packages npm package only if the package (under `johnnyrobot`) grants the `calricula` repository access (package settings → "Manage Actions access") or the package is linked to that repo. If the first CI run 401s, set `WORKSPACE_UI_READ_TOKEN` (classic PAT, `read:packages`) as a repository secret — the workflow already prefers it.
5. `git grep "_authToken"` is not empty (8 template hits, see Checks); the value-pattern grep is empty.
6. Chromium only (temporary config), as in Task 9.

## Cleanup / processes

- Stopped: backend :8001, stub :8099 (both modes), frontend `next dev` :3001. `lsof` on 3001/8001/8099 shows no listeners. The unrelated `next dev` on :3104 and the `remedy-server` uvicorn (not mine) were left alone.
- Removed: `frontend/playwright.ax-tmp.config.ts`, `frontend/e2e/zz-ax-shot.tmp.spec.ts`, `/tmp/ax-e2e-*.log`, `/tmp/ax-shell.png`, the temp token dir, the `calricula-fe-deps-check` image. Incidental tracked files touched by Playwright (`frontend/playwright-report/index.html`, `frontend/test-results/.last-run.json`) were `git restore`d.
- No token was written to the repository, to `~/.npmrc`, or printed; it existed only in a process environment and in a `mktemp` file for the Docker check, deleted immediately after.
- Nothing on ports 5433/3000/8000; no `git stash`/`reset`/branch checkout; `calricula_pwa_demo/`, `docs/applicationx/`, `session/`, the applicationx repo untouched.

## Fix report (final review: two Important items) — commit `e82d8df`

`fix(frontend): workspace-ui 0.1.1, single standalone control, package-access docs`

1. **Pin 0.1.1.**
   ```
   cd frontend && env "npm_config_//npm.pkg.github.com/:_authToken=$(gh auth token)" npm install @johnnyrobot/workspace-ui@0.1.1 --save-exact
   changed 1 package, and audited 917 packages in 2s
   package.json: "@johnnyrobot/workspace-ui": "0.1.1"
   package-lock: resolved https://npm.pkg.github.com/download/@johnnyrobot/workspace-ui/0.1.1/2d2b13e1…, integrity sha512-2SzO6G5A…
   ```
   Token passed only through that command's environment. Package confirmed `sideEffects: ["**/*.css"]` and `WorkspaceShellProps.showOpenStandalone`.
   CSS workaround: **kept.** With the explicit `./tokens.css` import removed, `rm -rf .next && npm run build` → `grep -l "ax-shell" .next/static/chunks/*.css` found nothing (exit 1); same result with `transpilePackages: ['@johnnyrobot/workspace-ui']` (tried, then `git restore next.config.js`). With the explicit import restored the built CSS chunk contains `.ax-shell`. The page comment now states this accurately (Next 16.2 / Turbopack does not emit the stylesheet the package entry imports).
2. **Standalone control.** Page passes `showOpenStandalone={Boolean(standaloneUrl)}` and `onOpenStandalone={standaloneUrl ? adapter.openStandalone : undefined}`; in the ready state `ContextBanner` receives `standaloneUrl={null}` so its link is gone and it keeps the context summary + "Back to program". Tests: M-8 rewritten (exactly one "Open in ApplicationX" button, no link; click → `window.open(https://ax.example.edu/workspaces/ws%201%2F2, '_blank', 'noopener')`); new test: without a standalone URL there is no such control anywhere and one "Back to program" link.
3. **I-1 wording.** `docs/APPLICATIONX-EMBED.md` "CI" subsection is now a required setup step (package inherits `applicationx` repo permissions → grant `johnnyrobot/calricula` under "Manage Actions access" or set `WORKSPACE_UI_READ_TOKEN`; fork PRs cannot build the frontend). README prerequisites + production build comment and the ci.yml comments say the same.
4. **Adapter memo comment** rewritten: `getToken` is recreated per AuthProvider render; re-memoising is harmless because the adapter is stateless, reads tokens at call time, the shell reads it through a ref and keys the chat panel on `context_id`; the ref alternative is blocked by `react-hooks/refs`.

Checks:
```
npm test        → Test Suites: 28 passed; Tests: 444 passed (thresholds intact)
npm run build   → ✓ Compiled successfully; .next/static/chunks/3m_ncezcn82z2.css contains .ax-shell
npm run lint    → ✖ 83 problems (0 errors, 83 warnings)  # pre-existing warnings
git grep -nE "_authToken=[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}" → empty
```
Live Playwright not rerun: `frontend/e2e/applicationx-embed.spec.ts` was not touched (the spec's chat selectors — ask textbox label, `role=status` "Answer ready", `Sources` list — are unchanged in 0.1.1; no e2e asserts the banner's standalone link). No processes started this round; no token written anywhere.
