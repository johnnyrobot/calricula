# Task 8 report: Chat API — messages, background runs, resumable SSE, cancellation

Status: DONE. Commit `a917cb4` on `main` (not pushed).

## What was implemented

- `backend/app/api/chat.py` — router `/v1/chat`:
  - `POST /messages` (202) creates/reuses the `Conversation`, stores the user `Message`, creates a queued `ChatRun`, schedules `runs.execute_run` via `BackgroundTasks`. Rules: `workspace_id` set → `authorize_workspace` or 403 (public principals therefore can never target a workspace); existing `conversation_id` → must be owned, must pass `authorize_workspace` when the conversation has a workspace, must not be expired, and must match `context_id` else 409 `context_mismatch`. Question > 2000 chars → 413; empty question → 422.
  - `GET /runs/{run_id}/events` — `text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`; `Last-Event-ID` parsed as int when numeric; 404 unknown run, 403 when the principal does not own the run's conversation (or its workspace).
  - `POST /runs/{run_id}/cancel` — returns the run's terminal status when already finished, else marks it cancelled and returns `{"status": "cancelled"}`.
  - One `_authorize(conv, principal, session, denied)` helper enforces ownership + workspace + expiry for both `post_message` and `_load_run`.
- `backend/app/chat/runs.py`:
  - `execute_run(run_id, principal)` — marks running, runs `run_pipeline` with `emit` wired to persist-then-publish, stores the `ChatAnswer` once on the assistant `Message` (with `message_id` and `run_id` filled), then emits `answer` and `done`. Failures become `failed` + `error {"code": "run_failed"}` + `done` with only the exception class name stored (`session.rollback()` first in case the failure was a DB error). Uses the default `executor=execute` (Task 9 wires the session).
  - `_persist` adds the run's `context_id` to every payload; `seq` is strictly increasing per run.
  - `stream(run_id, after_seq)` — persisted events after `after_seq`, then live ones deduplicated by `seq`; `: keepalive` comment every 15 s; ends after `done`, or immediately if the run is terminal.
  - `publish` hops onto the subscriber's event loop with `call_soon_threadsafe` (the run executes in Starlette's threadpool).
  - `cancel(run_id)`; `emit` raises `RunCancelled` (a `RuntimeError` subclass, so an unrelated pipeline `RuntimeError` is classified as `failed`, not `cancelled`).
- `backend/app/core/ratelimit.py` — `limiter = Limiter(key_func=rate_limit_key)`; key is `user:<sha256(bearer)>` when a bearer is present (token never stored), else remote address; `message_limit(key)` returns `settings.RATE_LIMIT_USER`/`RATE_LIMIT_PUBLIC` at request time.
- `backend/app/main.py` — `app.state.limiter`, `RateLimitExceeded` → 429 handler, chat router mounted under `/v1`.
- `backend/app/core/config.py` + `.env.example` — `RATE_LIMIT_PUBLIC="20/minute"`, `RATE_LIMIT_USER="60/minute"`.
- `backend/tests/conftest.py` — sets both limits to `10000/minute` through the same transient-env mechanism used for `DATABASE_URL`.

## Where each ruling landed

| Ruling | Location |
|---|---|
| Rate limits from settings, callable limit by bearer presence | `core/ratelimit.py` (`message_limit` receives the slowapi key; `user:` prefix → user limit), `api/chat.py` `@limiter.limit(message_limit)` |
| conftest 10000/minute; one test lowers public to 2/minute → 429 | `tests/conftest.py`; `test_public_rate_limit_returns_429`; autouse fixture calls `limiter.reset()` around each test |
| Scope hint applied on every message by merging into `conv.scope` | `post_message` (documented inline); `test_scope_hint_is_applied_to_existing_conversation` |
| Expiry: 403 `conversation expired` on post and on `_load_run`, tz-normalized compare | `_expired` + `_authorize` in `api/chat.py`; `test_expired_public_conversation_is_refused` covers both paths |
| Public ownership kept, P1b note | comment on `_owns` |
| `answer` emit from the pipeline suppressed; `context_id` on every payload | `emit` guard and `_persist` in `runs.py`; asserted in `test_public_message_runs_and_streams` (exactly one `answer`, every `data` carries `context_id`) |
| Cancel on completed run returns final status | `cancel_run`; brief's test accepts either |
| `executor=execute` default | `execute_run` |
| Stream format / headers / keepalive / Last-Event-ID | `runs.stream`, `run_events` |

## slowapi

`slowapi==0.1.9` (the brief's version exists; pulls `limits 5.8.0`, `deprecated`, `wrapt`). Added to `backend/requirements.txt` and installed in `backend/.venv`.

## Tests (`backend/tests/test_chat_api.py`, 13 tests)

Brief's six: public message runs and streams; Last-Event-ID resumes without duplicates; public cannot target workspace; other user's run not readable (also asserts the owner still gets 200); conversation bound to context (409 `context_mismatch`); cancel marks cancelled/completed.

Added: unknown run 404 (events + cancel); scope hint merged into existing conversation (bogus keys dropped); expired public conversation refused on post and on events; public rate limit 429 on the third POST at 2/minute; cancelled-before-start run emits only `done` and records `cancelled` (direct `execute_run` against real rows); failed run stores only the exception class name and streams `error` + `done` with no message text; answer stored on the assistant message with its own `message_id`/`run_id`.

All go through real HTTP via `TestClient` and real Postgres rows (`applicationx_test` on 5434).

## TDD evidence

- RED: `pytest tests/test_chat_api.py -q --no-cov` → 10 errors, `ModuleNotFoundError: No module named 'app.core.ratelimit'` (before any implementation file existed).
- GREEN: same command → `10 passed`; after the three added tests → `13 passed`.

## Full suite

`cd backend && .venv/bin/python -m pytest --no-cov` → **377 passed in 7.88s**, no warnings. With coverage: `Required test coverage of 70% reached. Total coverage: 93.86%` (`api/chat.py` 95%, `core/ratelimit.py` 100%, `chat/runs.py` 84% — uncovered lines are the live-subscriber loop and keepalive, covered by the Task 12 e2e per the brief).

## Trailer verification

`git log -1 --format='%(trailers:key=Co-Authored-By,valueonly)'` → `Claude Fable 5.1 <noreply@anthropic.com>`

## Files changed

- `/Users/laccd/code/applicationx/backend/app/api/chat.py` (new)
- `/Users/laccd/code/applicationx/backend/app/chat/runs.py` (new)
- `/Users/laccd/code/applicationx/backend/app/core/ratelimit.py` (new)
- `/Users/laccd/code/applicationx/backend/tests/test_chat_api.py` (new)
- `/Users/laccd/code/applicationx/backend/app/main.py`
- `/Users/laccd/code/applicationx/backend/app/core/config.py`
- `/Users/laccd/code/applicationx/backend/tests/conftest.py`
- `/Users/laccd/code/applicationx/backend/requirements.txt`
- `/Users/laccd/code/applicationx/.env.example`

## Self-review

- Every endpoint authorizes via the conversation (`_owns`) and, when the conversation has a workspace, `authorize_workspace`; expiry is checked in the same helper.
- Events are persisted (committed) before `_publish`; `seq` is a per-run counter incremented only in `record`, so it is strictly increasing; the `(run_id, seq)` unique constraint would surface any regression.
- No logging was added; the only stored failure detail is the exception class name; the rate-limit key hashes the bearer.
- Deviations from the brief's sketch, all small: subscribers carry their event loop (thread-safe publish); `RunCancelled` instead of bare `RuntimeError`; `rollback()` before persisting the failure event; `_subscribers` entry removed when its list empties; `MessageIn.scope_hint` typed `dict[str, str]` and `question` requires `min_length=1` (422 instead of a failed run).

## Concerns

- `_cancelled` and `_subscribers` are in-process only, as the brief intends for P1a; a multi-worker deployment needs the P2 job table.
- `stream()` runs its SQL synchronously inside the async generator (one short query per connect); fine for P1a, could move to a threadpool later.
- Starlette runs `execute_run` in its threadpool only after the response is sent; if the process dies mid-run the run stays `running` with no `done` event (P2's worker addresses this).

## Fix report — review round 1

Commit `db75e7d` on `main`: `fix(chat): always terminate streams with done and resume safely past the last seq`.

### Finding 1 (Important): terminal status committed before `done`
- `execute_run` no longer commits the status separately. The outcome is held in a local `final`; `run.status`/`finished_at` are set immediately before `record("done", ...)`, whose `_persist` commit writes the status and the `done` row atomically. The failure branch records `error` before the status is assigned. Both `except` branches `rollback()` first.
- `stream` no longer returns on `run.status`; it ends only after yielding a persisted or live `done`.
- Covering test: `test_done_row_and_terminal_status_land_together` (asserts one `done` row whose payload matches the terminal status, and that `stream(run_id, 0)` collected to a list ends with that `done` frame).

### Finding 2 (Important): `Last-Event-ID` past the last seq never terminates
- `stream` reads the latest persisted event; if the client's `after_seq` is at or beyond it, `last` is clamped to the persisted max, and if that latest event is `done` it is re-sent and the stream ends. In the live loop, `done` is yielded before the `seq <= last` skip.
- Covering test: `test_last_event_id_past_the_end_still_terminates` (RED: empty stream / assertion failure on the old code; GREEN now).

### Minor 3: missing rows
- `execute_run` returns early when the run, conversation, or message is missing; nothing is logged.

### Minor 4: session held across yields
- The replay `Session` fetches `stored` (`.all()`) and the latest event, then closes before the first `yield`. Subscription still happens before the query so nothing committed in between is lost.

### Added tests (all in `backend/tests/test_chat_api.py`)
- (a) `test_revoked_membership_after_start_loses_run_access` — 202, then `revoked_at` set, then events → 403.
- (b) `test_foreign_conversation_is_refused_without_writing` — user B posting to A's conversation with the same `context_id` → 403; `messages` row count unchanged.
- (c) `test_last_event_id_past_the_end_still_terminates`.
- (d) `test_done_row_and_terminal_status_land_together`.

### Commands and output
- `cd backend && .venv/bin/python -m pytest tests/test_chat_api.py -q --no-cov` → 17 passed.
- `.venv/bin/python -m pytest --no-cov` → `381 passed in 6.34s`, no warnings.
- `.venv/bin/python -m pytest` → `Required test coverage of 70% reached. Total coverage: 94.01%` (`chat/runs.py` 86%; remaining uncovered lines are the live-subscriber loop/keepalive, exercised by the Task 12 e2e).
- `git log -1 --format='%(trailers:key=Co-Authored-By,valueonly)'` → `Claude Fable 5.1 <noreply@anthropic.com>`.
