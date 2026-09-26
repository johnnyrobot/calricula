# Task 10 report: sources and health endpoints, RLS policies, production guards

Status: DONE (one concern noted below, not blocking)
Commit: `5111c77` on `main` (not pushed), message per brief + trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` (verified with `git log -1 --format='%(trailers:key=Co-Authored-By,valueonly)'` -> `Claude Fable 5.1 <noreply@anthropic.com>`).

## What was implemented and where each ruling landed

### Sources (`backend/app/api/sources.py`, registered under `/v1` in `backend/app/main.py`)
- `GET /v1/sources` -> `{"sources": [...], "model_provider": {"configured", "provider"}}`.
- `sources`: one entry per connector id in `load_pins(connectors/pins.toml)` plus every `IN_PROCESS` id (`campus_corpus`): `{source_id, connector_id, phase, status, disposition_summary}`.
- `phase`/`status`: from inventory families whose `operation` is one of the `REGISTRY` operations owned by that connector; `phase` = earliest (`P0..P4` order), `status` = `implemented_tested` if any family is, else `proposed`.
- `disposition_summary`: `Counter` of manifest `commands[].disposition`; `campus_corpus` (no manifest) is the fixed `{"public_read": 1}`.
- `model_provider.configured = MODEL_PROVIDER == "gemini" and GOOGLE_API_KEY`; `provider` is what `get_gateway()` would build (`gemini` without a key -> `{"configured": false, "provider": "fake"}`, tested).

### Health (`GET /v1/sources/{id}/health`)
- Unknown id -> 404. `MAX_AGE_SECONDS` module-level dict per the brief's table.
- Pinned connectors: newest `RunEvent` with `type == "tool"` whose payload `operation` family (`split_part(payload->>'operation', '.', 1)`) belongs to the connector (families derived from `REGISTRY`, e.g. assist -> `articulation`); `observed_at` = its `created_at` normalized with `replace(tzinfo=utc)`; `last_result_status` = payload `status`; `configured` = `settings.CONNECTOR_BIN_DIR/<manifest.binary>` exists and its sha256 == `manifest.binary_sha256`.
- `campus_corpus`: `observed_at = max(SourceRecord.fetched_at)`, `last_result_status = "ok"` when records exist, `configured` = at least one record.
- Response is `SourceHealth` (datetimes serialized ISO-8601 with offset; test asserts `tzinfo is not None`).

### RLS
- `backend/app/core/rls_ddl.py`: single definition of `POLICIES` (7 policies), `TABLES`, `ensure_role`, `grant_app_privileges`, `enable_rls`, `disable_rls`. Used by BOTH the migration and `tests/conftest.py`.
  - `memberships_self`, `workspaces_member` (brief's predicate), `program_mappings_member` (any active org member), `conversations_owner` (brief's predicate), `messages_owner` / `chat_runs_owner` via conversation, `run_events_owner` via `chat_runs JOIN conversations`.
  - Not enabled on `organizations`, `app_users`, `source_records`, `passages`.
  - `disable_rls` tolerates missing tables and drops cross-table policies first (they are dependent objects that block `DROP TABLE`).
- `backend/alembic/versions/0004_p1a_rls.py` (`down_revision="0003_p1a_evidence"`): `DO $$ ... $$` guarded `CREATE ROLE applicationx_app NOLOGIN NOBYPASSRLS`; `GRANT USAGE ON SCHEMA public`, `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES`, `GRANT USAGE ON ALL SEQUENCES`; `enable_rls`. `downgrade` = `disable_rls` only; the role is never dropped.
- `backend/app/core/rls.py`: `principal_id_var: ContextVar[str | None]`, `principal_id_for(principal)` (`str(user_id)` / `"public"`), `bind_principal(session, id)`, and the `after_begin` listener on `Session` executing `SELECT set_config('app.principal_id', :id, true)` when `settings.APP_DB_ROLE` is set and a principal is known. Imported from `database.py` so it is always registered.
- `get_principal` (`backend/app/core/deps.py`) calls `bind_principal(session, principal_id_for(principal))`.
- `config.py`: `APP_DB_ROLE: str | None = None`.

Two deviations from the literal ruling, both required for correctness (see "Self-review"):
1. `bind_principal` stores the id on `session.info` in addition to the ContextVar, and the listener reads `session.info` first. Verified empirically that a ContextVar set inside a FastAPI dependency is NOT visible in the endpoint (sync or async) because Starlette runs each in a copied context. A ContextVar-only design would silently never set `app.principal_id` on request sessions.
2. `bind_principal` also applies the setting to a transaction that is already open. `get_principal_from_token` SELECTs the existing user before the principal is known, so the request's transaction has already begun; without this, an existing user's first write fails with `new row violates row-level security policy for table "conversations"` (reproduced, then fixed; covered by `test_request_path_binds_principal_across_fastapi_threads`).
- Small additions so background/stream sessions are also bound under RLS: `runs.execute_run` binds its own session from the `principal` it already receives; `runs.stream` takes an optional `principal` which `run_events` passes. Without these, the run executor and SSE replay would see zero rows as the app role.

### Production guards (`backend/app/core/config.py`)
`ENVIRONMENT == "production"` now requires `AUTH_DEV_MODE is False`, `APP_DB_ROLE` set, `FIREBASE_PROJECT_ID` set, `MODEL_PROVIDER != "fake"`; `PUBLIC_CHAT_ENABLED` either. Tests in `tests/test_config.py` (`Settings(_env_file=None, ENVIRONMENT="production", ...)` -> `ValidationError`, parametrized per guard, plus a fully-configured positive case and `APP_DB_ROLE` default `None`).

### Test database (`backend/tests/conftest.py`)
`engine` fixture: `disable_rls` -> `drop_all` -> `create_all` -> `enable_rls` (same module as the migration) -> `grant_app_privileges("applicationx_test_app")` if that role exists. Superuser test sessions bypass RLS, so all pre-existing tests are unaffected.

## Docker role command (run once, exactly as executed)
```
cd /Users/laccd/code/applicationx && docker compose exec -T db psql -U postgres -d postgres -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='applicationx_test_app') THEN CREATE ROLE applicationx_test_app LOGIN PASSWORD 'applicationx_test_app' NOBYPASSRLS; END IF; END \$\$;"
```
Verified: `applicationx_test_app | rolsuper=f | rolbypassrls=f | rolcanlogin=t`.

## Tests
- `tests/test_sources.py` (9): brief's three plus inventory/manifest derivation, gemini-without-key fallback, unconfigured when binary missing, ok/unavailable/stale from tool events (with another connector's event ignored), corpus health from `SourceRecord`.
- `tests/test_rls.py` (8), run as the real `applicationx_test_app` role via `APP_DB_ROLE_TEST_URL` (default `postgresql://applicationx_test_app:applicationx_test_app@localhost:5434/applicationx_test`, env override honored; skips with a clear message only if that connection fails): stranger sees 0 rows in all 7 tables; no principal sees 0; member sees 1 membership / 1 workspace / 1 mapping / only own conversation, and 1 run_event for own run and 0 for another user's run; public sees only public conversations/run_events and no memberships/workspaces; revoked membership hides workspace/mapping; the `after_begin` listener binds per transaction (session.info and ContextVar paths, re-applied after rollback); listener inert without `APP_DB_ROLE`; full request path through FastAPI as the app role (public POST, cross-principal cancel denied, existing-user follow-up message succeeds).
- `tests/test_config.py` (+7).

### TDD evidence
Before implementation: `13 failed, 1 passed` in `test_sources`/`test_config` (404s, `ImportError: app.api.sources`, `AttributeError: APP_DB_ROLE`), and `test_rls` SKIPPED with `password authentication failed for user "applicationx_test_app"` (role absent). After creating the role and implementing: all green. The open-transaction fix was proven by disabling the branch (`InsufficientPrivilege ... conversations`) and re-enabling it (pass).

### Results
- Targeted: `.venv/bin/python -m pytest tests/test_sources.py tests/test_rls.py tests/test_config.py -q --no-cov` -> 25 passed (run twice consecutively to prove the fixture's drop/create cycle survives the policies).
- Alembic: `alembic upgrade head` -> `Running upgrade 0003_p1a_evidence -> 0004_p1a_rls`; `alembic check` -> `No new upgrade operations detected.` (only the pre-existing `passages.tsv` computed-default UserWarning); `alembic current` -> `0004_p1a_rls (head)`; `downgrade 0003_p1a_evidence` + `upgrade head` roundtrip clean. `pg_policies` shows the 7 policies; `relrowsecurity` true on exactly the 7 tables, false on `organizations/app_users/source_records/passages`; `applicationx_app` is `rolcanlogin=f rolbypassrls=f`.
- Full suite: `417 passed` (`--no-cov -q`), coverage 94.87% (floor 70), no warnings.

## Files changed (14)
Created: `backend/app/api/sources.py`, `backend/app/core/rls.py`, `backend/app/core/rls_ddl.py`, `backend/alembic/versions/0004_p1a_rls.py`, `backend/tests/test_sources.py`, `backend/tests/test_rls.py`.
Modified: `backend/app/main.py`, `backend/app/core/config.py`, `backend/app/core/database.py`, `backend/app/core/deps.py`, `backend/app/chat/runs.py`, `backend/app/api/chat.py`, `backend/tests/conftest.py`, `backend/tests/test_config.py`.

## Self-review
- Completeness: every ruling above is implemented and covered; the RLS suite runs (does not skip) and passes as the second role; P0/P1a tests unchanged and green.
- Found and fixed during review: the existing-user request path (transaction open before binding) - see RLS deviation 2. Found and designed around: ContextVar does not cross FastAPI thread contexts - deviation 1.
- Discipline: one commit, brief's message, trailer as its own paragraph; no personal email anywhere (grepped); no push, no branch.

## Concerns (non-blocking)
1. `campus_corpus` has no `data_families.yaml` entry, so by the ruling's derivation it reports `phase: null, status: "proposed"` in `GET /v1/sources` even though the corpus is implemented and tested. Either add an S6 family for `campus.search` to the inventory or treat `IN_PROCESS` connectors as `implemented_tested` - I applied the ruling literally rather than invent a phase.
2. The single `FOR ALL` policy per table doubles as `WITH CHECK`, so as the app role the service can only insert memberships for the acting principal (`memberships_self`). No P1a endpoint creates memberships for other users, but an org-admin invite flow (P2) will need a dedicated `FOR INSERT` policy or an owner-role path.
3. `GRANT ... ON ALL TABLES` is a snapshot; tables added by later migrations need their own grant (or an `ALTER DEFAULT PRIVILEGES`) for `applicationx_app`.
4. A `public` principal policy admits every public conversation to every anonymous request (as the brief specifies); conversation-id secrecy plus the API's ownership check remain the primary control.

---

# Fix report: review round 1

Commit: `d84cb34` on `main` (not pushed) — `fix(api): make source health work under RLS, verify the DB role at startup, tighten production guards`, trailer as its own paragraph (verified via `%(trailers)`).

## Findings and what changed

1. **Health under RLS (Important).** `backend/app/core/rls_ddl.py` gains `SERVICE_PRINCIPAL = "service"` and `SELECT_POLICIES` with `run_events_telemetry ON run_events FOR SELECT USING (current_setting('app.principal_id', true) = 'service' AND type = 'tool')`; `enable_rls`/`disable_rls` handle it. `backend/app/api/sources.py` adds `get_service_session` (wraps `get_session`, `bind_principal(session, SERVICE_PRINCIPAL)`) and `source_health` depends on it. Tests (`tests/test_rls.py`): `test_service_principal_reads_only_tool_events` (as the app role with principal `service`: 1 tool event visible, 0 non-tool, 0 rows in every other protected table, and `UPDATE run_events` touches 0 rows so the policy is SELECT-only); `test_source_health_reads_telemetry_as_the_app_role` (`GET /v1/sources/laccd_class_search/health` via the app-role engine: `recorded: false` before, `recorded: true` after a tool event exists).
2. **Role verification at startup (Important).** `backend/app/core/rls.py` adds `verify_connection_role(engine)` (`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`; raises `RuntimeError("APP_DB_ROLE is set but the database connection is a superuser or BYPASSRLS role")`). `backend/app/main.py` now has a `lifespan` that calls it on `database.engine` when `settings.APP_DB_ROLE` is set. `README.md` gains a "Database roles" section: production connects as `CREATE ROLE <name> LOGIN PASSWORD '...' IN ROLE applicationx_app` (not superuser, not BYPASSRLS); the NOLOGIN role remains the policy/grant holder; the local test-role command is documented too. Tests: `test_startup_role_check` (passes on the app-role engine, raises on the superuser `engine`), `test_startup_refuses_superuser_when_app_db_role_is_set` (lifespan via `TestClient(app)` raises). A shared `app_role_client` fixture serves the API as the app role with `database.engine` patched to the app-role engine so the startup check runs for real in the request-path tests.
3. **Gemini key guard (Important).** `_production_safety`: `MODEL_PROVIDER == "gemini"` without `GOOGLE_API_KEY` raises. Added the parametrized case `{"MODEL_PROVIDER": "gemini", "GOOGLE_API_KEY": None}` in `tests/test_config.py`.
4. **Grants (Minor).** `grant_app_privileges` grants per table from `pg_tables` excluding `UNGRANTED_TABLES = ("alembic_version",)`, explicitly revokes on those if present (so a DB that ran the earlier ALL TABLES grant is corrected), and adds `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES` (+ `USAGE ON SEQUENCES`) to `applicationx_app`. Verified on the dev DB: `has_table_privilege('applicationx_app','alembic_version','SELECT') = f`, `run_events = t`, `pg_default_acl` shows `applicationx_app=arwd/postgres` for tables and `U` for sequences.
5. **Sources listing (Minor).** `_phase_rank` sorts unknown phases last (tested with a synthetic `P9` family: `assist` stays `P1` when a known phase exists, reports `P9` when only the unknown one does). `IN_PROCESS` connectors report `phase: "P1"`, `status: "implemented_tested"` with a comment that they have no CLI inventory family; no family was added to the inventory.

## Verification
- `alembic downgrade 0003_p1a_evidence && alembic upgrade head && alembic check`: clean (`No new upgrade operations detected.`); `pg_policies` on `run_events` shows `run_events_owner ALL` and `run_events_telemetry SELECT`.
- Targeted: `tests/test_sources.py tests/test_rls.py tests/test_config.py` -> 31 passed (run twice).
- Full suite: `423 passed` (`--no-cov -q`); coverage 94.97% (floor 70); no warnings.
- Files changed (9): `README.md`, `backend/app/core/rls_ddl.py`, `backend/app/core/rls.py`, `backend/app/core/config.py`, `backend/app/api/sources.py`, `backend/app/main.py`, `backend/tests/test_config.py`, `backend/tests/test_sources.py`, `backend/tests/test_rls.py`. The 0004 migration file itself was unchanged (its behaviour changed through `rls_ddl`).

## Remaining concerns
- Unchanged from the original report: `FOR ALL` policies double as `WITH CHECK` (membership inserts for other users need a P2 policy); the `public` principal sees all public conversations by design.
- `ALTER DEFAULT PRIVILEGES` applies to tables created by the role that runs migrations (the DB owner); if a different role ever runs migrations, re-run the grant step for it.
