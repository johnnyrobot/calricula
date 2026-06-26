# Staging Validation Runbook

A documented, ordered way to validate a **real staging deploy** of Calricula
before going live. It covers the production code paths CI cannot exercise:

1. **Migrations** — the real Alembic path against a prod-shaped DB (+ rollback rehearsal).
2. **Auth** — the real Firebase-backed dependency over HTTP.
3. **AI / RAG** — a live Gemini generate call + the managed File Search Stores RAG path.
4. **Health** — a basic service smoke.

These checks are run **manually** against a staging environment with **real
credentials**. They are intentionally **not** part of CI and **not** collected
by pytest (they live in `scripts/staging/`, not `tests/`, and aren't named
`test_*.py`). They mutate data and cost money — run them by hand.

The runnable scripts live in [`scripts/staging/`](../scripts/staging/).

---

## Prerequisites

### Tooling

- A checkout of this repo with the **backend virtualenv active** so `alembic`,
  `httpx`, and the `app` package are importable:
  ```bash
  cd backend
  python -m venv .venv && source .venv/bin/activate
  pip install -r requirements.txt
  cd ..
  ```
- A reachable **staging API** (the deployed FastAPI backend).
- A **fresh, disposable staging Postgres database** for the migration check
  (it is mutated). Never point the migration script at production.

### Environment variables

| Variable | Used by | Description |
| --- | --- | --- |
| `DATABASE_URL` | migrations | SQLAlchemy URL of the **fresh staging** DB, e.g. `postgresql://user:pass@host:5432/calricula_staging`. **This DB is mutated.** |
| `API_BASE_URL` | auth, health | Base URL of the staging API, e.g. `https://staging-api.example.org` (no trailing slash needed). |
| `FIREBASE_ID_TOKEN` | auth | A valid Firebase **ID token** for a provisioned staging user (see "Getting a Firebase ID token" below). |
| `GOOGLE_API_KEY` | AI / RAG | A real Google API key with Gemini + File Search access. **Incurs cost.** |
| `GEMINI_MODEL` | AI (optional) | Override the model for the basic generate check (default `gemini-3.1-flash-lite`). |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | (the staging API itself) | Set on the **deployed backend**, not for these scripts — but auth checks only pass if the staging API has Firebase configured. |

Example:

```bash
export DATABASE_URL='postgresql://user:pass@staging-db:5432/calricula_staging'
export API_BASE_URL='https://staging-api.example.org'
export FIREBASE_ID_TOKEN='eyJhbGciOi...'
export GOOGLE_API_KEY='AIza...'
```

> **Getting a Firebase ID token.** Sign in to the staging frontend as a test
> user and copy the ID token from the browser (Firebase stores it; you can read
> `await firebase.auth().currentUser.getIdToken()` in the console), or mint one
> via the Firebase Auth REST API (`accounts:signInWithPassword`) using the
> staging Web API key. ID tokens expire after ~1 hour — grab a fresh one right
> before running the auth check.

---

## Run everything (orchestrator)

```bash
scripts/staging/validate_staging.sh
```

Runs Migrations → Auth → AI/RAG in order, records each result even if one
fails, and prints a final **GO / NO-GO** summary. Exit code is non-zero if any
step failed. Skip steps with `SKIP_MIGRATIONS=1`, `SKIP_AUTH=1`, `SKIP_AI=1`;
run AI without the RAG cost with `AI_SKIP_RAG=1`.

Or run each section individually as below.

---

## 1. Migrations

**Goal:** prove the real production migration path (`alembic upgrade head` —
not the test-suite `create_all` path) builds the schema on a fresh prod-shaped
DB, and rehearse a rollback.

```bash
# Prompts before mutating DATABASE_URL; pass --yes to skip the prompt.
scripts/staging/validate_migrations.sh
```

What it does, in order:

1. `alembic upgrade head`
2. Asserts key tables exist via SQLAlchemy (no `psql` needed):
   `users`, `courses`, `programs`, `program_courses`,
   `student_learning_outcomes`, `ccn_standards`, `top_codes`, `colleges`,
   `departments`, `divisions`, `notifications`, `documents`, `rag_documents`,
   `workflow_history`, `comments`.
3. `alembic downgrade -1` then `alembic upgrade head` (rollback rehearsal).
4. Re-asserts the tables after the roundtrip.

**Expected output:** each table printed with `[ok ]`, the downgrade/upgrade
roundtrip completing without error, and a final `MIGRATIONS: PASS`.

| | |
| --- | --- |
| **PASS** | `alembic upgrade head` succeeds, all listed tables present, downgrade-1 + re-upgrade completes, `MIGRATIONS: PASS` printed, exit 0. |
| **FAIL** | Any migration errors, a missing table, a failed downgrade/upgrade, or non-zero exit. |

> **Safety:** this script mutates whatever `DATABASE_URL` points at and warns
> loudly before doing so. Use a fresh, disposable staging DB only.

---

## 2. Auth

**Goal:** prove the real Firebase-backed `get_current_user` dependency behaves
correctly over HTTP: public endpoints are open, protected endpoints reject
missing tokens, and a valid token is accepted.

```bash
python scripts/staging/validate_auth.py
```

Checks:

| Check | Request | Expected |
| --- | --- | --- |
| public health | `GET /health` | `200` |
| public reference list | `GET /api/reference/ccn-standards` | `200` |
| protected (no token) | `GET /api/courses` | `401` or `403` |
| protected (with token) | `GET /api/courses` + `Authorization: Bearer <FIREBASE_ID_TOKEN>` | `2xx` |

**Expected output:** a table of `CHECK / ENDPOINT / EXPECT / ACTUAL / RESULT`
ending in `AUTH: PASS`.

| | |
| --- | --- |
| **PASS** | All four rows `PASS`, `AUTH: PASS`, exit 0. |
| **FAIL** | Any row mismatched (e.g. protected endpoint returns 200 without a token → auth bypass; or returns 401 with a valid token → Firebase misconfigured on the staging API), or a connection error. |

> The protected-with-token check also exercises **JIT user provisioning**: a
> first-time token auto-creates a `FACULTY` user, so a 2xx confirms the
> provisioning path works end to end.

---

## 3. AI / RAG

**Goal:** prove the live Gemini path works (basic generate) and the managed
**File Search Stores RAG** path works end to end (store create → upload →
grounded query → citations).

> **This calls the live Gemini API and incurs cost.**

```bash
python scripts/staging/validate_ai.py            # basic generate + RAG smoke test
python scripts/staging/validate_ai.py --skip-rag # basic generate only (cheaper)
```

Checks:

1. **Basic generate** — `GeminiService.generate_response()` with a minimal
   prompt; asserts a non-empty `text` and `success=True`.
2. **File Search RAG** — runs the existing, authoritative smoke test
   `backend/scripts/smoke_test_file_search.py` (this runbook **invokes** it, it
   does not duplicate it). That test uploads a doc, runs a grounded query, and
   asserts native citations come back, then cleans up.

**Expected output:** a short response preview, the smoke test's own output
(store name, imported doc id, answer, citations), and a final `AI/RAG: PASS`.

| | |
| --- | --- |
| **PASS** | Non-empty generate response **and** the RAG smoke test exits 0 (citations returned). `AI/RAG: PASS`, exit 0. |
| **FAIL** | Empty/failed generate, or the RAG smoke test exits non-zero (no citations, upload/index failure, or API error). |

---

## 4. Health smoke

A minimal liveness check (also covered as the first auth row). Useful as a
standalone "is staging up" probe:

```bash
curl -fsS "$API_BASE_URL/health"
```

**Expected:** HTTP 200 with JSON `{"status":"healthy","service":...,"version":...}`.
The deployed backend also exposes `/api/health` (proxy-friendly), `/health/db`
(DB connectivity, 200/503), and `/health/pool` (pool metrics).

| | |
| --- | --- |
| **PASS** | `/health` returns 200 with `"status":"healthy"`. |
| **FAIL** | Non-200, connection refused, or `/health/db` reports 503 (DB unreachable). |

---

## Go / No-Go summary

Fill this in for each staging run. **All must be GO** before promoting the
build past release-candidate.

| Area | Check | Command | Result (GO / NO-GO) |
| --- | --- | --- | --- |
| Health | `/health` returns 200 healthy | `curl -fsS $API_BASE_URL/health` | |
| Migrations | `upgrade head` + tables + rollback rehearsal | `scripts/staging/validate_migrations.sh` | |
| Auth | public 200 / protected 401 / token 2xx (+ JIT provisioning) | `python scripts/staging/validate_auth.py` | |
| AI | live Gemini generate returns text | `python scripts/staging/validate_ai.py --skip-rag` | |
| RAG | File Search store → upload → grounded query → citations | `python scripts/staging/validate_ai.py` | |
| **Overall** | orchestrator prints `RESULT: GO` | `scripts/staging/validate_staging.sh` | |

A single NO-GO blocks launch. Re-run the failing section after fixing the
deploy, not the script.
