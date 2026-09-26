# P1a final-review fix wave — report

Base: `main` at `29dfc65`. Three commits on `main`, not pushed. Working tree clean.

## Findings

### C1 (Critical) — clarification chips loop
- `backend/alembic/versions/0005_p1a_message_scope_hint.py` (new): nullable JSON `messages.scope_hint`; `revision="0005_p1a_message_scope_hint"`, `down_revision="0004_p1a_rls"`.
- `backend/app/chat/models.py:56` — `Message.scope_hint` (`Column(JSON, nullable=True)`).
- `backend/app/api/chat.py:87` — the filtered hint (or `None`) is stored on the user `Message`; merge into `conv.scope` kept (lines 68-77).
- `backend/app/chat/runs.py:82` — `PipelineInput(..., explicit_scope=ResolvedScope(**(msg.scope_hint or {})))`.
- `backend/app/chat/pipeline.py:61-76` — `PipelineInput.explicit_scope` with docstring; `:139` passes it to `resolve_slots`.
- `backend/app/chat/slots.py:35-72` — `resolve_slots(text, prior, defaults, intent, explicit=None)`: explicit campus/term win and skip every clarification branch; prior campus mentioned in the text is kept silently; a single different campus (prior not mentioned) asks switch-or-keep; ≥2 campuses none the prior asks which.
- `packages/workspace-ui/src/hooks/useChat.ts:106-130,187-190,206-214` — `start(question, scopeHint, continuation)`; `chooseClarification` resends as a continuation (no second user turn); public `send` unchanged.
- Tests: `backend/tests/test_chat_pipeline.py:215` (a), `:224` (b), `:232` (c), `:240` (explicit term wins); `backend/tests/test_chat_api.py:112` `test_scope_hint_is_stored_on_the_user_message` (stores hint, first message `None`, chip turn answers with campus LAPC and no clarification); `packages/workspace-ui/src/__tests__/ChatPanel.test.tsx:152` (one `.ax-message--user` in the log, second `request` carries `scope_hint`, chips gone, "answer ready"). Existing `test_intents.py` slot tests still pass.

### I2 — lowercase subjects
- `backend/app/chat/pipeline.py:83` `_COURSE_CODE` is `[A-Za-z][A-Za-z&]{1,11}` before a course number; `:93-107` `_course_code`/`_subject` uppercase the token and skip `validate._NOT_SUBJECTS` (fall/spring/summer/winter/class/section/term/page/room + Spanish) and campus codes. The catalog query builder uses the same helper.
- Deviation: the ruling's pattern includes a space in the class (`[A-Za-z &]`); with a space "seats in math 261" captures "eats in math". I used the validator's shape (no space), which satisfies both named inputs.
- Tests: `backend/tests/test_chat_pipeline.py:246` parametrized over "open seats in math 261 fall 2026" and "open seats for Math 261 at Mission" — route `schedule`, `schedule.search` request `subject == "MATH"`, no `invalid_parameters`; `:254` unit cases for `_subject`. Note: the literal "Math 261 at Mission" classifies as `catalog` (no schedule trigger word in `intents._TABLE`), so the test adds "open seats for"; intent classification was outside the ruling.

### I3 — session time zone
- `backend/app/core/database.py:11-13` `CONNECT_ARGS = {"options": "-c timezone=UTC"}` on the engine; `backend/alembic/env.py:9,49`; `backend/tests/conftest.py:54`.
- Test: `backend/tests/test_database.py:6` — `current_setting('TimeZone') == 'UTC'` through both the test engine and `app.core.database.engine`.
- `docs/P1A-EXIT.md:86` records the assumption and the `DateTime(timezone=True)` P1b migration.

### I4 — owner bypass
- `backend/app/core/rls.py:72-82` — additionally counts `pg_tables` rows with `rowsecurity AND pg_has_role(current_user, tableowner, 'USAGE')`; raises "APP_DB_ROLE is set but the connection owns RLS tables".
- Test: `backend/tests/test_rls.py:227` — a temporary non-superuser, non-BYPASSRLS LOGIN role granted membership in the table owner fails with "owns RLS tables"; `applicationx_test_app` passes. The superuser engine still fails first with the existing superuser message (`test_startup_role_check`), since the superuser check runs first; the new fixture is what isolates the owner branch.

### I5 — app-role run completes
- `backend/tests/test_rls.py:257-262` — after posting as the app role, the events stream contains `event: answer`, `event: done` with `"status": "completed"`, and `ChatRun.status == "completed"` read through the superuser engine.

### I6 — purge + retention decision
- `backend/app/chat/purge.py` (new): `purge_expired_public_conversations(session, now=None) -> int`, ordered bulk deletes run_events → chat_runs → messages → conversation, one commit; `python -m app.chat.purge` binds the `public` principal (RLS-safe) and prints the count. Verified: `purged 0 expired public conversation(s)`.
- Tests: `backend/tests/test_chat_purge.py:18` (expired conversation with message/run/event removed; live one and its children survive; second run returns 0), `:33` (user conversations untouched).
- `docs/P1A-EXIT.md:76-85` records the persisted-transcript deviation from TECHNICAL-SPEC §10 as an owner retention decision and that the purge must be scheduled before hosting; the P1b list now says "scheduling the purge".

### I7 — model default
- `backend/app/core/config.py:38` and `.env.example:13` → `gemini-3.5-flash`. No test asserted the old default (`test_model_gateway.py:127` reads `settings.GEMINI_MODEL`). `docs/P1A-EXIT.md:126` records the owner decision (2.5 retires 2026-10-16, follows the Calricula migration note).

### I8 — pin
- `backend/requirements.txt:9` `google-genai==2.24.0` (`pip show google-genai` → 2.24.0).

### I9 — Firebase init lock
- `backend/app/identity/firebase.py:8,12-21` — module `threading.Lock`, double-checked `_app is None`.

### M10 — system instruction
- `backend/app/chat/model_gateway.py:45-46` — the seat-status sentence added. Test `backend/tests/test_model_gateway.py:36` asserts "not a seat count", `available_seats`, `waitlist_total`.

### M12 — existence oracle
- `backend/app/api/host_contexts.py:117-121` — `ws.org_id != org.id` → `access_required` with the same message as an unknown id; campus mismatch stays `context_stale`.
- Test: `backend/tests/test_host_contexts.py:48` — a workspace in another org returns a body identical to a random unknown id, no title leak. `test_tampered_org_or_campus` unchanged (campus path still `context_stale`).

### M15 — compose health
- `docker-compose.yml:7-10` `db` healthcheck (`pg_isready -U postgres`, 5s, 10 retries); `:23-25` `api` `depends_on: db: condition: service_healthy`. `docker compose config -q` passes.

## Verification

```
$ cd backend && .venv/bin/alembic upgrade head && .venv/bin/alembic check
INFO  [alembic.runtime.migration] Running upgrade 0004_p1a_rls -> 0005_p1a_message_scope_hint, p1a message scope hint
.../alembic/autogenerate/compare.py:1034: UserWarning: Computed default on passages.tsv cannot be modified   (pre-existing, from migration 0003)
No new upgrade operations detected.

$ cd backend && .venv/bin/python -m pytest -q --no-cov
446 passed in 31.35s

$ cd backend && .venv/bin/python -m pytest -q
TOTAL                                         1947    102    95%
Required test coverage of 70% reached. Total coverage: 94.76%
446 passed in 33.35s            (no warnings summary)

$ cd packages/workspace-ui && npm run build && npx vitest run
> tsc -p tsconfig.json && node scripts/copy-css.mjs
 Test Files  6 passed (6)
      Tests  46 passed (46)
(grep -ci "act(" on the output: 0)

$ cd frontend && npx tsc --noEmit
(no output)

$ docker compose config -q
(no output)

$ git status --short
(clean)
```
No servers were started.

## Commits (on `main`)

- `b172780` fix(chat): clarification chips answer instead of re-asking; match lowercase subjects (C1, I2)
- `86dd8f3` fix(core): pin sessions to UTC; refuse RLS-table owners; prove the app-role run completes (I3, I4, I5)
- `c76ad2f` feat(chat): purge expired public conversations; model default, pin, init lock, oracle and compose health (I6, I7, I8, I9, M10, M12, M15)

All three carry the `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` trailer (verified with `git log --format='%(trailers:key=Co-Authored-By,valueonly)'`).

## Concerns

- I2 regex: implemented without the space in the character class (see above); the ruling's literal pattern would mis-capture multi-word prefixes.
- I2 test input: "Math 261 at Mission" alone routes to `catalog` by the intent table; the test uses "open seats for Math 261 at Mission" to exercise the schedule path the ruling describes.
- I4 test creates and drops a cluster-wide role `applicationx_test_owner_member` on the test Postgres (superuser fixture), granting it membership in the connection's owner role; dropped in the fixture teardown.
- The `passages.tsv` autogenerate warning during `alembic check` predates this wave (generated column from 0003); `check` still reports no pending operations.
