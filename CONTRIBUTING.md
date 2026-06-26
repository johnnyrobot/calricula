# Contributing to Calricula

Thanks for your interest in contributing! Calricula is a curriculum-development
tool for California community colleges (course/program authoring, Title 5 &
PCAH compliance checks, CCN/C-ID alignment, AI assistance). This guide covers
how to set up the project, the workflow we follow, and what we expect in a pull
request.

By participating you agree to abide by our [Code of Conduct](./CODE_OF_CONDUCT.md).

## Tech stack

- **Backend** — Python 3.11, FastAPI, SQLModel, PostgreSQL, Alembic, Pydantic v2; Google `google-genai` (Gemini); Firebase Admin for auth.
- **Frontend** — Next.js 16 (App Router), React 19, TypeScript, Tailwind, Jest + Testing Library, Playwright (E2E).

See [`README.md`](./README.md) for a fuller overview.

## Local setup

### Backend
```bash
cd backend
python3.11 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
# Postgres is required. Point DATABASE_URL at a local instance, e.g.:
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/calricula
cp ../.env.example .env    # then fill in real values (never commit .env)
pytest                      # run the test suite
uvicorn app.main:app --reload
```

### Frontend
```bash
cd frontend
npm ci
cp .env.example .env.local  # fill in Firebase / API config (never commit)
npm run dev                 # http://localhost:3000
npm test                    # jest
npm run build               # production build
npm run lint
```

> Never commit real secrets. `backend/.env` and `frontend/.env.local` are
> gitignored; only `*.example` files belong in version control.

## Workflow

1. **Open an issue first** for anything non-trivial so we can agree on the approach.
2. **Branch from `main`** using a descriptive prefix: `feat/…`, `fix/…`, `chore/…`, or `docs/…`.
3. **Keep PRs small and focused** — one logical change per PR. It makes review (and revert) easy.
4. **Write tests** for new behavior. The backend has a pytest safety net (with coverage floors) and the frontend uses Jest; both run in CI. Don't weaken or delete tests to get green.
5. **All CI checks must pass** before merge: backend `pytest` (against a Postgres service) and frontend build + jest. PRs are also reviewed by CodeRabbit.
6. **Reference the issue** your PR closes (e.g. `Closes #123`) and fill out the PR template.

## Coding standards

- Match the style and conventions of the surrounding code.
- Backend: type hints, Pydantic v2 `model_config` (not the legacy `class Config`), Alembic migrations for any schema change (don't hand-edit the DB at runtime).
- Frontend: TypeScript strictness, no new `any`, escape JSX entities, and respect the React hooks/React-Compiler lint rules.
- Compliance logic (Title 5 §55002.x, PCAH, CCN/C-ID) is correctness-critical — cite the regulation in code comments and tests when you change a rule.

## Reporting bugs & requesting features

Use the issue templates under **New issue**. For security-sensitive reports,
please **do not** open a public issue — see the security note in the
[Code of Conduct](./CODE_OF_CONDUCT.md) and contact the maintainers privately.

## Release readiness

If your change touches anything in [`RELEASE_CHECKLIST.md`](./RELEASE_CHECKLIST.md)
(security/config, privacy/FERPA, migrations, deploy), please update that
checklist in the same PR.
