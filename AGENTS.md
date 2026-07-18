# AGENTS.md

**Calricula** — an intelligent curriculum-management system for California community colleges: author and route Course Outlines of Record (CORs) and Programs through approval workflows, with Title 5 / PCAH compliance built into the UI. Stack: **Next.js (App Router, `next` 16.2.9) + TypeScript + Tailwind v3** frontend, **Python FastAPI + SQLModel** backend (entry `app.main:app`), **PostgreSQL 16**, **Firebase** auth, **Google Gemini** (`google-genai`, 2.5 Flash + File Search RAG).

## Setup

```bash
cp .env.example .env          # DATABASE_URL, GOOGLE_API_KEY, FIREBASE_*; set NEXT_PUBLIC_AUTH_DEV_MODE=true for no-Firebase local dev
```

- Docker path: Docker Desktop only.
- Native path: Python 3.11+, Node.js 18+, PostgreSQL 16+.
  - Backend: `cd backend && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt`
  - Frontend: `cd frontend && npm install`
- Firebase service-account JSON goes at the repo root as `serviceAccountKey.json` (gitignored; the committed one is a 3-byte placeholder).

## Build & Run

```bash
# Whole stack via Docker — dev ports FE :3001, BE :8001, DB :5433
docker-compose up
docker-compose -f docker-compose.prod.yml up -d     # prod: FE :3000, BE :8000

# Backend, run directly
cd backend
alembic upgrade head          # apply migrations (schema is Alembic-managed)
python -m seeds.seed_all      # seed reference + demo data
uvicorn app.main:app --reload --port 8000

# Frontend, run directly
cd frontend && npm run dev     # :3001
npm run build                  # production build
```

API docs: `http://localhost:8001/docs` (dev) / `:8000/docs` (prod).

## Testing

- **Backend:** `cd backend && pytest`. Config in `backend/pytest.ini`; suites in `backend/tests/` (`test_api_integration`, `test_auth_characterization`, `test_ai_characterization`, `test_ccn_*`, `ccn_utils_test`, …). **A coverage floor is enforced (`--cov-fail-under=45`)** — do not let a change drop below it. Tests talk to Postgres (defaults to `localhost:5433/calricula`); seed reference tables first if a suite reads them (`seed_top_codes`, `seed_ccn_standards`).
- **Frontend:** `npm test` (jest unit) and `npm run test:e2e` (Playwright, `frontend/e2e/`).
- **Before a change is done** (matches `.github/workflows/ci.yml`): backend `pytest` green; frontend `npm run build` succeeds and `npm test` passes (`npm run lint` runs but is non-blocking). Ran migrations → `alembic upgrade head` and confirm boot.

## Code Style

- **Backend:** FastAPI + SQLModel with type hints; DB session via `Depends(get_session)`; settings in `app/core/config.py`; schema changes go through **Alembic migrations**, never runtime table creation. Use the unified `google-genai` client (legacy `google-generativeai` was removed).
- **Frontend:** TypeScript + App Router under `src/`. Style through the shared **`luminous-*` component classes** (Tailwind v3) rather than one-off utilities — that keeps the academic "catalog of record" theme consistent. The app is **light-only**; do not reintroduce dark mode.
- **Accessibility is a hard requirement (WCAG 2.2 AA):** use `gold-ink` (`#7E6018`) for small text on parchment; reserve decorative gold (`#9A7B2E`) for rules/borders.

## Commit & PR Conventions

- Git repo; branch off `main`, open a PR, keep CI green. The repo uses **squash-merge**.
- **Every commit needs the trailer:** `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Never write a real personal/maintainer email anywhere** in code, docs, commits, or configs — squash-merge exposes author identity on a public repo. Use `<noreply@anthropic.com>`.

## Security & Data

- The repo is **public and source-only** — assume any committed content is world-readable; FERPA/privacy/hosting are the deployer's responsibility, so keep student data and secrets out of the tree entirely.
- **Secrets** (`.env`, `serviceAccountKey.json`) are gitignored — supply `GOOGLE_API_KEY` and Firebase config via `.env`. `NEXT_PUBLIC_AUTH_DEV_MODE=true` is a local-only Firebase bypass; keep it `false` in production.
- License is **BSD-3-Clause with branding requirements** — do not remove or rename "Calricula" UI branding without an exemption.
