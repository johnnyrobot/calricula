# Staging Validation Runbook

A documented, ordered way to validate a **real staging deploy** of Calricula
before going live. It covers the production code paths CI cannot exercise:

1. **Migrations** — the real Alembic path against a prod-shaped DB (+ rollback rehearsal).
2. **Auth** — the real Logto (OIDC)-backed dependency over HTTP.
3. **AI / RAG** — a live Gemini generate call + the managed File Search Stores RAG path.
4. **Health** — a basic service smoke.
5. **Logto cutover gate** — a manual, browser-driven run of the sign-in flow
   against a real tenant (nothing automated covers it).

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
| `OIDC_ACCESS_TOKEN` | auth | A valid Logto **access token** for the Calricula API resource (**not** the ID token — the checked routes reject one with `401`), for a provisioned staging user (see "Getting an OIDC access token" below); or a documented `dev-*` token when the staging API runs with `AUTH_DEV_MODE=true`. |
| `GOOGLE_API_KEY` | AI / RAG | A real Google API key with Gemini + File Search access. **Incurs cost.** |
| `GEMINI_MODEL` | AI (optional) | Override the model for the basic generate check (default `gemini-3.1-flash-lite`). |
| `OIDC_ISSUER` / `OIDC_AUDIENCE` / `OIDC_CLIENT_ID` | (the staging API itself) | Set on the **deployed backend**, not for these scripts — but auth checks only pass if the staging API has Logto configured (see [`docs/AUTH-LOGTO.md`](./AUTH-LOGTO.md)). |

Example:

```bash
export DATABASE_URL='postgresql://user:pass@staging-db:5432/calricula_staging'
export API_BASE_URL='https://staging-api.example.org'
export OIDC_ACCESS_TOKEN='eyJhbGciOi...'
export GOOGLE_API_KEY='AIza...'
```

> **Getting an OIDC access token.** Sign in to the staging frontend as a test
> user, then read the short-lived access token from `GET /api/auth/token`
> (same-origin, cookie-authenticated — open it in the browser or copy it from
> devtools' Network tab), which mints a token for `LOGTO_API_RESOURCE` via the
> Logto SDK. Alternatively, if the staging API runs with `AUTH_DEV_MODE=true`,
> use one of the documented `dev-*` tokens instead (no Logto tenant needed).
> Access tokens are short-lived — grab a fresh one right
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

**Goal:** prove the real Logto (OIDC)-backed `get_current_user` dependency behaves
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
| protected (with token) | `GET /api/courses` + `Authorization: Bearer <OIDC_ACCESS_TOKEN>` | `2xx` |

**Expected output:** a table of `CHECK / ENDPOINT / EXPECT / ACTUAL / RESULT`
ending in `AUTH: PASS`.

| | |
| --- | --- |
| **PASS** | All four rows `PASS`, `AUTH: PASS`, exit 0. |
| **FAIL** | Any row mismatched (e.g. protected endpoint returns 200 without a token → auth bypass; or returns 401 with a valid token → Logto misconfigured on the staging API, see `docs/AUTH-LOGTO.md` troubleshooting), or a connection error. |

> The protected-with-token check also exercises **JIT user provisioning**: a
> first-time token auto-creates a `FACULTY` user, so a 2xx confirms the
> provisioning path works end to end.

### 2b. Logto cutover gate (manual, required before cutover)

The script above verifies the backend with a token you already hold. Nothing
automated exercises the browser-side flow — `@logto/next`'s code exchange at
`/callback`, the session cookie, `GET /api/auth/session` running the backend
`/login`, and `GET /api/auth/token` minting the access token — so it must be
walked once by hand against a **real Logto tenant** (the staging frontend
built with `NEXT_PUBLIC_LOGTO_ENABLED=true` and every `LOGTO_*` variable set;
see [`docs/AUTH-LOGTO.md`](./AUTH-LOGTO.md) §2–§6). Do this with
`NEXT_PUBLIC_AUTH_DEV_MODE` unset: dev mode would win over Logto and prove
nothing.

| Step | Do | Expect |
| --- | --- | --- |
| Sign-in | Open the staging frontend, click **Sign in with your college account**, authenticate at Logto. | Land on `/dashboard`, signed in, with the correct display name and role. No token in any URL; nothing auth-related in `localStorage`/`sessionStorage`. |
| Authenticated API call | On `/dashboard`, confirm the stats/course lists load (devtools → Network: `GET /api/auth/token` → `200`, then backend calls carrying `Authorization: Bearer …` → `2xx`). | Data renders; no `401`/`503` from the backend. |
| Sign-out | Use the app's sign-out. | Sent through `/sign-out` to Logto and back; a reload of `/dashboard` redirects to `/login`; `GET /api/auth/token` now answers `204`. |
| Legacy re-link | With `AUTH_LEGACY_RELINK=true`, insert one pre-migration-shaped row in the staging DB (`auth_issuer IS NULL`, a non-default role such as `CurriculumChair`, and the **verified** email of a test identity in the tenant), then sign in as that identity. | `/dashboard` shows the legacy row's role; in the DB that row now has `auth_subject` = the Logto `sub` and `auth_issuer` = the tenant issuer, and **no** second row exists for that subject (in particular none with an `@oidc.invalid` email). |
| Callback failure | Start sign-in, then cancel/go back at Logto (or open `/callback?code=bogus&state=bogus`). | Back on `/login` with the "Sign-in could not be completed" message, not a 500. |
| `email_verified` per connector | For **each** connector the tenant enables (email/password, Google, SAML, …), sign in with an identity that came through that connector and decode the ID token (e.g. in the Logto Console's user detail, or by logging the claims from a throwaway route) — or simpler, check the provisioned row's `email` column. | `email_verified` is `true`; the stored email is the real address, not `<sub>@oidc.invalid`. A connector that fails this cannot be used for legacy re-link or demo mode (AUTH-LOGTO §4). |

Record the tenant endpoint, the date, and who ran it in the Go / No-Go table
below. Any row failing is a NO-GO for cutover (not for a source release).

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
| Logto cutover gate | real tenant: sign-in → `/dashboard` → API call → sign-out; one legacy re-link; `email_verified` true per connector | manual, §2b | |
| AI | live Gemini generate returns text | `python scripts/staging/validate_ai.py --skip-rag` | |
| RAG | File Search store → upload → grounded query → citations | `python scripts/staging/validate_ai.py` | |
| **Overall** | orchestrator prints `RESULT: GO` | `scripts/staging/validate_staging.sh` | |

A single NO-GO blocks launch. Re-run the failing section after fixing the
deploy, not the script.
