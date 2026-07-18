# CLAUDE.md

**Calricula** is an AI-assisted curriculum-management platform: faculty create, modify, and route Course Outlines of Record (CORs) and Programs through approval workflows, with California community-college compliance (PCAH 8th ed., Title 5) embedded in the UI. Full-stack: Next.js App Router frontend, FastAPI backend, PostgreSQL 16, Google Gemini for AI + RAG, Firebase auth.

## Architecture

**Frontend** (`frontend/`, `next` 16.2.9 pinned, App Router under `src/`): `src/app` (pages), `src/components`, `src/contexts`, `src/lib` (API client), `src/styles/globals.css`. Tailwind **v3** (`tailwind.config.ts`, `darkMode: 'class'`). The UI is driven by shared **`luminous-*` component classes** (`.luminous-card`, `.luminous-button-*`, `.luminous-badge-*`, `.luminous-table`, `.luminous-sidebar`, `.luminous-nav-item*`) + a `luminous` color scale — redefining those reskins every screen at once. The theme is the **academic "catalog of record"** design (parchment/navy/gold, Source Serif 4 + IBM Plex), authored in Paper; **light-only** (`ThemeContext` forced to light; residual `dark:` utilities are inert). Unit tests: jest; e2e: Playwright (`frontend/e2e`).

**Backend** (`backend/`, entry `app.main:app`): `app/{api,core,models,schemas,services,utils}`; `core/config.py` (settings), `core/database.py` (`get_session`, `create_db_and_tables`). `alembic/` migrations, `seeds/` (`python -m seeds.seed_all`; plus `seed_top_codes`, `seed_ccn_standards`), `tests/` (pytest). SQLModel ORM. AI via `google-genai` (Gemini 2.5 Flash + File Search API for RAG).

**Domain features:** COR authoring with AI suggestions; **54-Hour Rule** unit validation (Title 5 §55002.5); **CB Code Wizard** (plain-language → 27 Title 5/PCAH codes); **SLO Editor** (Bloom's verb picker + cognitive-level distribution); role-based **approval workflow** (Faculty → Department → Committee → Articulation → Approved); Program builder (60-unit limit); **BLS labor-market data** (`/api/bls/*`, `/api/qcew/*` — OES wages, projections, county employment). Roles: **Faculty, Curriculum Chair, Articulation Officer, Admin**.

## Commands

```bash
# Docker — dev ports: FE :3001, BE :8001, DB :5433
cp .env.example .env
docker-compose up                                   # dev (hot reload)
docker-compose -f docker-compose.prod.yml up -d     # prod (FE :3000, BE :8000)

# Backend (backend/)
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
python -m seeds.seed_all
uvicorn app.main:app --reload --port 8000           # docs at :8001/docs (dev via Docker)
pytest                                               # pytest.ini gates --cov-fail-under=45

# Frontend (frontend/)
npm install
npm run dev                                          # :3001 (dev) / :3000 (prod)
npm run build
npm run lint                                         # eslint .
npm test                                             # jest unit
npm run test:e2e                                     # playwright
```

CI (`.github/workflows/ci.yml`): backend `pytest` against a Postgres 16 service (seeds TOP codes + CCN standards first; `mypy` non-blocking); frontend `npm run lint` (non-blocking) + `npm run build` + `npm test`.

## Conventions

- Backend entry is **`app.main:app`** (package layout under `backend/app/`). `DATABASE_URL` defaults to `localhost:5433/calricula` in dev.
- SQLModel models; DB sessions via `Depends(get_session)`; schema is managed by **Alembic migrations** (`alembic upgrade head`), not by table auto-create at runtime.
- Reskin via `luminous-*` classes, not per-component overrides. The design is **light-only** — do not reintroduce dark mode.
- Use the unified `google-genai` client (the legacy `google-generativeai` SDK was removed).
- Commit trailer required on every commit: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## Gotchas & Constraints

- **Public, source-only repo** (maintainer does not host it → FERPA/privacy/ops are the deployer's concern). **Never put any real personal/maintainer email into code, docs, or configs** — it leaks through GitHub squash-merge author identity. Use `<noreply@anthropic.com>` in trailers.
- **WCAG 2.2 AA is required** (regulated public tool). On parchment, use `gold-ink` (`#7E6018`, ~5.3:1) for small text; decorative gold `#9A7B2E` is for rules/borders only (3:1).
- **Dev ports are shifted** to avoid clashes: FE 3001, BE 8001, DB 5433. Prod compose uses 3000/8000.
- **Never commit secrets:** `.env`, `serviceAccountKey.json` are gitignored (`serviceAccountKey.json` at repo root is a placeholder). Firebase + `GOOGLE_API_KEY` come from `.env`; `NEXT_PUBLIC_AUTH_DEV_MODE=true` bypasses Firebase for local dev.
- **`pytest` enforces a coverage floor** (`--cov-fail-under=45`) — a change that drops coverage below it fails. Backend tests need Postgres (default `:5433`).
- License is **BSD-3-Clause with branding requirements** — don't strip/rename "Calricula" UI branding without an exemption.
- Test users use password `Test123!` (`faculty@`, `chair@`, `articulation@`, `admin@calricula.com`).
