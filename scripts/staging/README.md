# Staging validation scripts

Manual, **run-against-real-staging** validation scripts for Calricula. They
exercise the production code paths CI cannot (real Alembic migrations, real
Firebase auth over HTTP, the live Gemini / File Search RAG path).

> These scripts are **NOT** run by CI and are **NOT** collected by pytest
> (they live under `scripts/staging/`, not `tests/`, and are not named
> `test_*.py`). They use real credentials and cost money / mutate data — run
> them by hand. See the full runbook: [`docs/STAGING_VALIDATION.md`](../../docs/STAGING_VALIDATION.md).

## Scripts

| Script | What it does | Mutates / costs |
| --- | --- | --- |
| `validate_migrations.sh` | `alembic upgrade head`, assert key tables, downgrade-1 + re-upgrade roundtrip | **Mutates `DATABASE_URL`** |
| `validate_auth.py` | public 200, protected-without-token 401/403, protected-with-token 2xx | none |
| `validate_ai.py` | minimal Gemini generate + File Search RAG smoke test | **Live Gemini API cost** |
| `validate_staging.sh` | orchestrates all three, prints a go/no-go summary | both of the above |

## Quick start

```bash
# from the repo root, with the backend venv active
export DATABASE_URL='postgresql://user:pass@host:5432/calricula_staging'  # FRESH staging DB
export API_BASE_URL='https://staging-api.example.org'
export FIREBASE_ID_TOKEN='eyJhbG...'   # valid Firebase ID token for a staging user
export GOOGLE_API_KEY='...'            # live Gemini key

# everything, in order, with a final summary
scripts/staging/validate_staging.sh
```

Run individually:

```bash
scripts/staging/validate_migrations.sh           # prompts before mutating; pass --yes to skip
python scripts/staging/validate_auth.py
python scripts/staging/validate_ai.py            # add --skip-rag to skip the RAG smoke test
```

Skip steps in the orchestrator with `SKIP_MIGRATIONS=1`, `SKIP_AUTH=1`,
`SKIP_AI=1`; run AI without the RAG cost with `AI_SKIP_RAG=1`.

## Safety

- `validate_migrations.sh` operates on whatever `DATABASE_URL` points at and
  **prompts** before mutating (skip with `--yes` / `STAGING_CONFIRM=1`). Only
  ever point it at a disposable staging database.
- No secrets are hardcoded; all credentials come from the environment.
- Prerequisites: the backend venv (`pip install -r backend/requirements.txt`)
  so `alembic`, `httpx`, and the `app` package are importable.
