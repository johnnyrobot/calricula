# Task 12 report: standalone ApplicationX web app

Commit: `2e5ef76` on `main` — `feat(web): standalone ApplicationX app with public chat and workspace route` (not pushed).

## What was implemented

Backend (`backend/`):
- `app/core/config.py`: `CONNECTOR_REPLAY: bool = False` (refused by `_production_safety`) and `CORS_ORIGINS: list[str] = ["http://localhost:3002"]`.
- `app/connectors/registry.py`: when `settings.CONNECTOR_REPLAY` is true, subprocess operations use `runner = lambda *a, **k: load_outcome(op.connector_id, op_name, "success")`; in-process ops (`campus.search`) are unaffected. `load_outcome` is now a top-level import (no cycle: `replay.py` only imports the broker).
- `app/main.py`: `CORSMiddleware` with `allow_origins=settings.CORS_ORIGINS`, methods GET/POST, headers Authorization/Content-Type/Last-Event-ID.
- `seeds/__init__.py`, `seeds/seed_dev.py`: `seed_dev(session) -> {"org_id", "workspace_id", "users": {token: user_id}}`; org `lamc` (`embed_enabled=True`), four `dev-*` users (issuer `dev`, subject = token, `<token>@example.invalid`), org-wide `staff` for faculty/chair/articulation and `org_admin` for admin, workspace "Nursing" (`campus_ref="LAMC"`, program ref `calricula`/`p-1`/`2026-01-01T00:00:00+00:00`), mapping `calricula:p-1 -> Nursing` with `min_compatible_revision`, one public `SourceRecord` (`lamc_web`, financial-aid URL) with two passages (office hours; FAFSA priority deadline). Idempotent by slug / (issuer, subject) / (org, user, role, null workspace) / (org, title) / (org, source_app, external_id) / (source_id, url). `python -m seeds.seed_dev` opens `Session(engine)`, commits, prints `workspace_id=...` and the user ids.
- Tests: `tests/test_registry.py::test_replay_setting_serves_subprocess_ops_from_fixtures` (setting monkeypatched true, `run_command` replaced with a function that raises; `execute("catalog.get", ...)` returns the success fixture), `tests/test_config.py` (default false; production refuses it; `CORS_ORIGINS` default), `tests/test_seed_dev.py` (creates the fixture, checks roles/mapping/source, and a second call returns the same ids with identical row counts).

Frontend (`frontend/`, Next 16.2.9 / React 19 / TypeScript strict):
- `package.json` (`"@applicationx/workspace-ui": "file:../packages/workspace-ui"`, `firebase`, `@playwright/test`), `package-lock.json`, `.gitignore`, `.env.example` (the two public vars, Firebase vars commented), `next.config.mjs` (`reactStrictMode`, `transpilePackages`, `turbopack.root` pinned to the repo so a stray lockfile in `$HOME` is ignored), `tsconfig.json`, `eslint.config.mjs` (Next core-web-vitals + typescript).
- `src/lib/adapter.ts`: `createDirectAdapter({ apiBase, getToken, navigate? })` — `resolveContext` -> `POST /v1/host-contexts/resolve` (parsed with `HostResolutionSchema`), `request('chat.messages')` -> `POST /v1/chat/messages`, `request('chat.cancel', {run_id})` -> `POST /v1/chat/runs/{id}/cancel`, `subscribe` -> `subscribeSSE(fetch, .../events, authHeaders, cursor, signal)`, non-2xx throws, `openStandalone` no-op, `navigateToProgram` -> `/workspaces/[id]`.
- `src/lib/auth.tsx`: `AuthProvider` / `useAuth` / `SignIn`. Dev mode (`NEXT_PUBLIC_AUTH_DEV_MODE=true`) renders a `<select>` labelled "Sign in as" with the four token strings; the token lives in a ref + React state only (no storage, no cookies). Firebase (`firebase/app`, `firebase/auth`) is loaded by dynamic import only when all three `NEXT_PUBLIC_FIREBASE_*` are set, with `inMemoryPersistence`; unexercised locally. `getToken()` returns the bearer or null.
- `src/lib/useAdapter.ts`: one memoised adapter per mount, `getToken` read at request time.
- `src/app/layout.tsx`: skip link, `<header>` with the page `<h1>ApplicationX</h1>`, `<nav aria-label="Primary">`, `SignIn`, `<main id="main-content">`. `src/app/page.tsx`: links to `/chat` and describes `/workspaces/<id>`.
- `src/app/chat/page.tsx`: `WorkspaceShell` gates the chat on a `ready` resolution, and a public visitor gets `access_required` from resolve, so the page renders `ChatPanel` directly inside an `ax-shell` section (h2 "Public chat: Los Angeles Mission College") with the ruling's public context and `workspaceId={null}`.
- `src/app/workspaces/[id]/page.tsx`: `WorkspaceShell` with `workspace_id=id`, `context_id="ws:<id>"`, `labels.title="Workspace"` (a guest sees "Sign in to open an ApplicationX workspace." from the API's `HostFailure.message`, never the workspace title). Both pages key the shell/panel by the current identity: `useHostContext` re-resolves only on `context_id` change, so a sign-in/out remounts and re-resolves, and drops the previous principal's conversation.
- `src/styles/globals.css`: light-only (`color-scheme: light only`), sets every `--ax-*` token on `:root`, page chrome, skip link, sign-in control.
- `e2e/chat.spec.ts`: the brief's two tests (the first also asserts a source item shows `observed YYYY-MM-DD`) plus a third: picker selects `dev-faculty-001` on `/workspaces/$E2E_WORKSPACE_ID` and the level-2 heading "Nursing" appears, the sign-in copy disappears, and the ask box is visible (skips with a message if the env var is unset). `playwright.config.ts`: `baseURL http://localhost:3002`, `webServer: npm run dev` (`next dev -p 3002`) with `NEXT_PUBLIC_API_BASE=http://localhost:8002` and `NEXT_PUBLIC_AUTH_DEV_MODE=true`, `reuseExistingServer: false`.
- `README.md`: "Running P1a" (package must be built before the app; API/seed/uvicorn/e2e commands; what `CONNECTOR_REPLAY`, `CORS_ORIGINS` and the dev picker do) and the layout table.

## Reproducing the e2e run

```bash
cd /Users/laccd/code/applicationx
docker compose up -d db
cd backend
.venv/bin/alembic upgrade head
.venv/bin/python -m seeds.seed_dev | tee /tmp/ax-seed.txt          # prints workspace_id=...
CONNECTOR_REPLAY=1 MODEL_PROVIDER=fake AUTH_DEV_MODE=true .venv/bin/uvicorn app.main:app --port 8002 &   # background
cd ../packages/workspace-ui && npm ci && npm run build
cd ../../frontend && npm ci && npx playwright install chromium
export E2E_WORKSPACE_ID=$(grep '^workspace_id=' /tmp/ax-seed.txt | cut -d= -f2)
npx playwright test
pkill -f "uvicorn app.main:app --port 8002"
```

## Versions installed

next 16.2.9, react 19.3.0, react-dom 19.3.0, firebase 12.19.0, @playwright/test 1.63.0 (Chromium headless shell 153.0.8010.12, build 1243), typescript 5.9.3, eslint-config-next 16.2.9. Node 22.23.0, npm 10.9.8, Python 3.12.5.

## Outputs

- Backend `pytest --no-cov`: `426 passed in 10.51s` (was 423 before this task; +3: replay, config guard, seed).
- Backend `pytest` with coverage: `TOTAL 1897 95 95%` — `Required test coverage of 70% reached. Total coverage: 94.99%`; no warnings.
- Package: `npm run build` in `packages/workspace-ui` — `tsc` + `copy-css.mjs`, `dist/` present (gitignored).
- App: `npm run build` — compiled, routes `/`, `/_not-found`, `/chat` static, `/workspaces/[id]` dynamic; `npx tsc --noEmit` clean; `npm run lint` clean (0 problems).
- Seed run twice: second run's stdout is identical (`diff` empty).
- Playwright, first run before the app existed: `Error: Timed out waiting 120000ms from config.webServer` (captured failure). After implementation: one failure — `getByLabel(/ask/i)` was ambiguous because my chat `<h2>` began with "Ask about…" and labelled the section; renamed the heading to "Public chat: …" rather than change the brief's selector. Final: `3 passed (2.6s)`.
- CORS preflight from `http://localhost:3002` returns `access-control-allow-origin: http://localhost:3002`, methods GET/POST, headers incl. Authorization and Last-Event-ID.
- API log during the run: no errors or tracebacks.
- Trailer: `git log -1 --format='%(trailers:key=Co-Authored-By)'` prints `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- No uvicorn/next processes left running (`pgrep` empty).

## Files changed

Modified: `README.md`, `backend/app/connectors/registry.py`, `backend/app/core/config.py`, `backend/app/main.py`, `backend/tests/test_config.py`, `backend/tests/test_registry.py`.
Added: `backend/seeds/__init__.py`, `backend/seeds/seed_dev.py`, `backend/tests/test_seed_dev.py`, `frontend/.env.example`, `frontend/.gitignore`, `frontend/e2e/chat.spec.ts`, `frontend/eslint.config.mjs`, `frontend/next.config.mjs`, `frontend/package-lock.json`, `frontend/package.json`, `frontend/playwright.config.ts`, `frontend/src/app/chat/page.tsx`, `frontend/src/app/layout.tsx`, `frontend/src/app/page.tsx`, `frontend/src/app/workspaces/[id]/page.tsx`, `frontend/src/lib/adapter.ts`, `frontend/src/lib/api.ts`, `frontend/src/lib/auth.tsx`, `frontend/src/lib/useAdapter.ts`, `frontend/src/styles/globals.css`, `frontend/tsconfig.json`.

## Self-review

- Rulings: seed interface and contents as specified; replay executor only for subprocess ops and refused in production; CORS from a setting; dev picker shows only the four token strings, token in memory; Firebase import behind the env check; adapter endpoints as specified; layout owns `<main>`/`<h1>`, package renders `<h2>`; `--ax-*` tokens set; light-only; `/chat` renders `ChatPanel` directly (documented why); guest on `/workspaces/[id]` sees the sign-in copy and never "Nursing"; e2e reads the workspace id from `E2E_WORKSPACE_ID` (no `GET /v1/workspaces` added); `frontend/.gitignore`, lockfile committed, no `.env`; build/tsc/lint clean; no personal email anywhere; trailer verified.
- Deviation from the brief's Step 3 wording: `next.config.mjs` instead of `next.config.js` (Next's ESLint config forbids `require()`; same content).
- The brief's first test was kept verbatim and extended with a dated-source assertion.

## Concerns

- `npm audit` reports advisories in `next@16.2.9` itself (fix is 16.3.5) plus its `postcss`/`sharp` deps. The pin is a ruling, so I left it; worth a follow-up ruling on bumping.
- The Firebase path is unexercised locally (no `NEXT_PUBLIC_FIREBASE_*`); it type-checks and is loaded only via dynamic import.
- `webServer` uses `next dev`; the first e2e run compiles pages on demand, which is why the Playwright web-server timeout is 120 s.
