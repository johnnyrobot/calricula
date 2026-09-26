# Task 13 report — dev seeds, cross-host isolation suite, compose and P1a exit

Status: DONE. Commit `29dfc65` on `main` (not pushed). Trailer verified.

## What I implemented

- `backend/tests/test_isolation.py` — the brief's five tests (§7 cases 2, 3, 5, 7, 10) with the rulings applied (`dev-student-000` accepted as 200-or-401 with "Nursing" absent, plus an explicit `== 401` assertion; SQLModel `session.exec(select(Membership)...)` for revocation; 403 on `/events` after revoking, and additionally `access_required` on resolve and 403 on a new message). Two more from the Task 12 review: (f) `test_guest_resolve_of_seeded_workspace_is_access_required_without_data` — guest resolve of the real seeded id on both hosts → 200 `access_required`, no "Nursing", no `workspace_title` key; (g) `test_other_member_of_the_same_workspace_cannot_read_a_colleagues_run` — `dev-chair-001` (org-wide staff, resolve → `ready`) gets 403 on the colleague's run events and cancel; the owner still gets 200. Confirmed against `_owns` in `backend/app/api/chat.py` (user principals need `conv.user_id == principal.user_id`) and documented the rule in `docs/P1A-EXIT.md`. Autouse limiter reset as in `test_chat_api.py`.
- `backend/seeds/seed_dev.py` — interface already matched the brief (`{"org_id", "workspace_id", "users": {token: user_id}}`, idempotent, tested). Only change: `workspace_id=<uuid>` is now the last printed line (was second) so `tail -n 1` in CI is the contract. Test untouched and passing.
- `backend/Dockerfile` (python:3.12-slim, code at `/app/backend` so `../connectors/bin` and `replay.py`'s `<repo>/fixtures/synthetic` resolve to the mounts), `backend/.dockerignore`, `frontend/Dockerfile` (node:22-slim; copies and builds `packages/workspace-ui` into the image; `web` runs `npm ci && npm run dev` from the bind mount), root `.dockerignore` for the `web` build context.
- `docker-compose.yml` — `db` unchanged; `api` (build `./backend`, `env_file: .env` with `required: false` since `.env` is gitignored and absent, `DATABASE_URL` at the `db` service, `CORS_ORIGINS`, `8002:8002`, ro mounts of `connectors/bin` and `fixtures`, `depends_on: db`); `web` (build context `.` + `frontend/Dockerfile`, `3002:3002`, bind mount `./frontend`, named volumes for `node_modules` and `.next`, `depends_on: api`).
- `.github/workflows/ci.yml` — `backend` gains a `postgres:16` service on 5434 with healthcheck, a `psql` step creating `applicationx_test_app` (guarded `DO $$ ... $$`, SQL in a workflow-level env var), `alembic upgrade head` with `DATABASE_URL` scoped to that step (see note below), then pytest and the two drift checks; `contracts` on Node 22; new `web` job (package `npm ci && npm run build`, then `frontend` `npm ci && npm run build && npx tsc --noEmit`); new `e2e` job (postgres service, backend deps, migrations, seed with `tail -n 1 | sed 's/^workspace_id=//'` → `$GITHUB_ENV`, uvicorn in the background with `CONNECTOR_REPLAY=1 MODEL_PROVIDER=fake AUTH_DEV_MODE=true` and a health wait, package build, `npx playwright install --with-deps chromium`, `npx playwright test`, API log on `always()`; `CI: 'true'` in job env).
- `frontend/e2e/chat.spec.ts` — `requireWorkspaceId()` throws under `CI=true` when `E2E_WORKSPACE_ID` is missing, skips otherwise; the guest test now also visits the real seeded id before any sign-in and asserts `Nursing` count 0.
- `docs/P1A-EXIT.md` — §7 case table (2, 3, 5, 7, 10 → `test_isolation.py::…` names; 1, 4, 6, 8, 9 → Calricula host plan with the API/package pieces that exist here), the conversation-ownership rule, requirement traceability (AX-01/03/04/05/08/18/20/21, PRD §7, PRD §10) with modules and tests, "Known limitations and owner decisions" from the ledger notes, owner decisions before hosting, P1b deferrals.
- `README.md` — status line covers P1a; "Running P1a" gains `.env`, the role step, pytest, package tests, compose `api`/`web` usage (and that the image does not run migrations), the CI-fails-without-id note, and pointers to the isolation suite and exit doc; the duplicated role command under "Database roles" now references the P1a block; the "What P0 does not do" list notes what P1a delivered.

Design note on CI `DATABASE_URL`: the ruling asked for a job-level `env: DATABASE_URL`. I scoped it to the alembic step instead, because `conftest.py` honours a preset `DATABASE_URL` — a job-level value pointing at `applicationx` would make pytest `drop_all`/`create_all` the migrated dev database, and `tests/test_rls.py`'s hard-coded app-role DSN (`.../applicationx_test`) would then hit a database with no schema and skip. With the step-scoped variable, migrations are validated on `applicationx` and the suite keeps its own `applicationx_test`. The `e2e` job keeps a job-level `DATABASE_URL` (it never runs pytest).

## Step 1: failing tests first

All seven isolation tests passed on first run — the code under test shipped in Tasks 2, 3, 8 and 12 and `seed_dev` already existed. To prove the tests bite I mutated the two guards they depend on (`_owns` → any user owns any conversation; `host_contexts.resolve` → drop the campus_ref check), ran the file, and restored via the `.bak` copies:

```
FAILED tests/test_isolation.py::test_tampered_selectors_fail_server_side
FAILED tests/test_isolation.py::test_other_member_of_the_same_workspace_cannot_read_a_colleagues_run
```
`git status` afterwards showed only the new test file. (The org-slug and revision tampering cases and the revocation case are covered by other guards that I did not mutate.)

## Verification commands and tail output

Backend (Step 3):
```
$ cd backend && .venv/bin/python -m pytest --no-cov
433 passed in 10.65s                                        # was 426 (+7 isolation)
$ .venv/bin/python -m pytest                                # coverage
TOTAL                                         1897     94    95%
Required test coverage of 70% reached. Total coverage: 95.04%
433 passed in 12.44s
$ .venv/bin/python -m pytest --no-cov -q 2>&1 | grep -ci warning
0
```
(`-W error` trips on the starlette/httpx deprecation that `pytest.ini` already filters by design; the normal run prints no warnings summary.)

Compose / YAML:
```
$ docker compose config          # full resolved config printed; services db, api, web; volumes ax_pgdata, ax_web_next, ax_web_node_modules
$ cp .env.example .env && docker compose config --services && rm .env
db
api
web
$ docker compose config -q && echo compose-ok
compose-ok
$ python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"   # jobs: backend, contracts, web, e2e
yaml ok
```
Per the ruling I did not `docker compose up` the `api`/`web` services; image builds were not exercised.

CI dry-runs (each new `run:` line, in job order, locally):
```
# backend job
$ backend/.venv/bin/pip install -q -r requirements.txt            → exit=0
$ docker compose exec -T db psql -U postgres -d postgres -c "$PG_ROLE_SQL"   (SQL read from the workflow's env var)
DO
$ DATABASE_URL=postgresql://postgres:postgres@localhost:5434/applicationx .venv/bin/alembic upgrade head
INFO  [alembic.runtime.migration] Will assume transactional DDL.   (already at head)
$ .venv/bin/python -m pytest                                        → 433 passed, 95.04%
$ python ../scripts/export_schemas.py && git diff --exit-code -- ../contracts/schemas         → schemas: no drift
$ python ../scripts/export_normalized_fixtures.py && git diff --exit-code -- ../fixtures/normalized
75 results written / normalized: no drift
# contracts job
$ cd packages/workspace-ui && npm ci && npm run build && npm test
 Test Files  6 passed (6)
      Tests  45 passed (45)
# web job
$ cd frontend && npm ci && npm run build && npx tsc --noEmit
Route (app) ┌ ○ / ├ ○ /_not-found ├ ○ /chat └ ƒ /workspaces/[id]
tsc clean
# e2e job
$ python -m seeds.seed_dev | tee /tmp/ax-seed.txt ; id=$(tail -n 1 /tmp/ax-seed.txt | sed -n 's/^workspace_id=//p'); test -n "$id"
workspace_id=1753f080-4c56-474e-9f48-d362def2b338            (last line)
E2E_WORKSPACE_ID=1753f080-4c56-474e-9f48-d362def2b338
$ CONNECTOR_REPLAY=1 MODEL_PROVIDER=fake AUTH_DEV_MODE=true nohup python -m uvicorn app.main:app --port 8002 & ; curl loop
{"service":"applicationx-api","status":"ok","version":"0.0.1"}
$ cd frontend && CI=true E2E_WORKSPACE_ID=... npx playwright test
  ✓ public chat answers a campus question with sources (368ms)
  ✓ guest cannot open a workspace (516ms)
  ✓ a signed-in staff member opens the seeded workspace (287ms)
  3 passed (2.4s)
$ env -u E2E_WORKSPACE_ID CI=true npx playwright test -g "signed-in staff"
  ✘ a signed-in staff member opens the seeded workspace
    Error: E2E_WORKSPACE_ID is not set under CI=true; the seed step must export it
  1 failed
$ env -u E2E_WORKSPACE_ID -u CI npx playwright test -g "signed-in staff"
  1 skipped
$ pkill -f "uvicorn app.main:app --port 8002"; pgrep ... → no test servers left; API log: 0 error/traceback lines
```

## Path-existence check

Script extracted every backtick token containing `/` from `docs/P1A-EXIT.md` and `README.md` (135 checked; `docs/applicationx/...` resolved against the Calricula repo) and every `file::test_name` pair. All test names exist. Six non-file tokens flagged and accepted: `/v1/sources` (route), `connectors/campus_sources.yaml` (owner-supplied; the doc says to start from the `.example.yaml`, which exists), `@applicationx/workspace-ui` ×2 (package name), `dist/` (gitignored build output), `tests/test_rls.py` (pre-existing README text relative to `backend/`).

## Trailer verification

```
$ git log -1 --format='%(trailers:key=Co-Authored-By)'
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```
`git grep` for personal emails: none.

## Files changed (commit 29dfc65)

Added: `.dockerignore`, `backend/.dockerignore`, `backend/Dockerfile`, `backend/tests/test_isolation.py`, `docs/P1A-EXIT.md`, `frontend/Dockerfile`.
Modified: `.github/workflows/ci.yml`, `README.md`, `backend/seeds/seed_dev.py`, `docker-compose.yml`, `frontend/e2e/chat.spec.ts`.

## Self-review

- Rulings followed: five brief tests with the stated facts; SQLModel select; 403 on events after revocation; (f) and (g) added; compose `api`/`web` per spec (web via `next dev` bind mount, the "simpler and acceptable" option), `db` untouched, no `up`; CI as specified except the step-scoped `DATABASE_URL` (reasoned above); seed prints `workspace_id` last; e2e fails under CI without the id and the guest test uses the real seeded id; exit doc covers all listed cases, rows, limitations and owner decisions; README updated with P0 content kept; one commit; trailer as its own paragraph; no personal email.
- Working tree clean after commit; no uvicorn/next test servers left (two unrelated pre-existing processes on :8000 and :3104 belong to other tools and were not touched).

## Concerns

- The `api`/`web` images have never been built; `frontend/Dockerfile` installs `frontend` deps at container start (`npm ci` on every `up`) — fine for dev, slow. `connectors/bin` is gitignored, so on a fresh clone Docker will create it as an empty root-owned directory for the mount (harmless under `CONNECTOR_REPLAY=1`).
- Step 1 could not produce genuine red tests because the implementation predates this task; the mutation check is the evidence that the tests discriminate.
- Ruling deviation: job-level vs step-level `DATABASE_URL` in the `backend` job (see design note). If a job-level value is preferred, `tests/test_rls.py`'s app-role DSN would need to derive its database name from `settings.DATABASE_URL`.
- The CI `e2e` job installs Chromium with `--with-deps`; GitHub's ubuntu runner is the assumed target. CI itself was not executed.
