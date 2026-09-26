# Task 3 Report — Broker routes with trusted program enrichment and SSE proxy

## Summary

Implemented `/api/applicationx/host-contexts/resolve`, `/api/applicationx/ops/{operation}`,
and `/api/applicationx/runs/{run_id}/events` in `backend/app/api/routes/applicationx.py`,
per the brief with the controller's binding resolutions applied.

## Controller resolutions applied

1. **Two-header token transport.** `Authorization` is validated by the existing
   `get_current_user` dependency and is never read again or forwarded upstream.
   A new `_upstream_token` dependency reads `X-ApplicationX-Token`
   (`Header(alias="X-ApplicationX-Token")`) and raises
   `HTTPException(401, {"code": "missing_upstream_token", "message": "ApplicationX token required"})`
   when absent/blank. Only that value is passed to `broker.forward`/`broker.stream`
   as `user_token`.
2. **`resolve` return bug fixed** — `if status_code >= 400: raise HTTPException(status_code, data)` else `return data`.
3. **SSE errors before the first byte.** `run_events` primes the generator with
   `first = await gen.__anext__()` inside `try/except BrokerError → _raise / except StopAsyncIteration → first = None`
   before constructing `StreamingResponse`. A `_chain(first, gen)` helper yields
   `first` (if not `None`) then the rest of `gen`, with `finally: await gen.aclose()`
   so client disconnects propagate cleanup into the broker.
4. **Fixtures.** `test_department` and `test_user_faculty` were lifted into
   `backend/tests/conftest.py` unchanged in behavior; the local copies in
   `backend/tests/test_api_integration.py` were deleted. `db_session` in
   `test_api_integration.py` was left untouched (functionally equivalent to
   conftest's but not identical — resolution says leave it if it differs).
   Checked for name collisions first: `test_department`/`test_user_faculty`/
   `db_session` are also locally redefined in `test_workflow_endpoints.py`,
   `test_courses_crud.py`, `test_ccn_seed_data.py`, `test_ccn_api_integration.py`,
   `test_ccn_auth.py` — pytest fixture resolution means a file-local definition
   shadows the conftest one for that file, so adding these to conftest does not
   change behavior for those modules.
5. **`Program` model fields confirmed** in `backend/app/models/program.py`:
   `ProgramType.AS`, `ProgramStatus.APPROVED` (value `"Approved"`), and
   `title`, `type`, `department_id`, `created_by`, `status`, `updated_at` all exist
   as described.

## TDD evidence

**RED** — tests added to `backend/tests/test_applicationx_broker.py` (third
section) before implementation; ran against the Task 1–2 code (route module
had no `resolve`/`ops`/`events` endpoints and no `get_broker`):

```
$ DATABASE_URL=postgresql://postgres:postgres@localhost:5435/calricula venv/bin/python -m pytest -q -p no:cacheprovider tests/test_applicationx_broker.py
...
FAILED tests/test_applicationx_broker.py::test_broker_error_never_echoes_token
FAILED tests/test_applicationx_broker.py::test_stream_broker_error_before_first_byte_surfaces_as_error_status
ERROR tests/test_applicationx_broker.py::test_resolve_enriches_program_from_database
ERROR tests/test_applicationx_broker.py::test_resolve_unknown_program_404_and_no_upstream_call
ERROR tests/test_applicationx_broker.py::test_ops_only_allowlisted - Attribut...
ERROR tests/test_applicationx_broker.py::test_disabled_embed_is_503_everywhere_but_status
ERROR tests/test_applicationx_broker.py::test_events_stream_proxied - Attribu...
ERROR tests/test_applicationx_broker.py::test_missing_upstream_token_is_401
2 failed, 11 passed, 1 warning, 6 errors in 1.84s
```

(Failures/errors were `AttributeError: module 'app.api.routes.applicationx' has no attribute 'get_broker'`
and 404s from the missing routes, as expected.)

**GREEN** — after implementing the route module:

```
$ DATABASE_URL=postgresql://postgres:postgres@localhost:5435/calricula venv/bin/python -m pytest -q -p no:cacheprovider tests/test_applicationx_broker.py
19 passed, 1 warning in 1.78s
```

## Full suite

```
$ DATABASE_URL=postgresql://postgres:postgres@localhost:5435/calricula venv/bin/python -m pytest -q -p no:cacheprovider
308 passed, 1 warning in 3.62s
Required test coverage of 45% reached. Total coverage: 52.55%
```

## Files changed

- `backend/app/api/routes/applicationx.py` — added `get_broker`, `_require_ready`,
  `_upstream_token`, `_raise`, `ResolveIn`/`resolve`, `OpIn`/`op`, `_chain`/`run_events`.
- `backend/tests/test_applicationx_broker.py` — added third section: `_FakeBroker`,
  `fake_broker` fixture, and 8 tests (7 from the brief adapted to the two-header
  token transport, plus `test_missing_upstream_token_is_401` and
  `test_stream_broker_error_before_first_byte_surfaces_as_error_status` per
  resolutions 1 and 3).
- `backend/tests/conftest.py` — added `test_user_faculty` and `test_department`
  fixtures (moved from `test_api_integration.py`, unchanged behavior).
- `backend/tests/test_api_integration.py` — removed the now-duplicate local
  `test_user_faculty`/`test_department` fixture definitions; `db_session` left
  as-is.

## Self-review

- **Completeness vs. brief + resolutions**: all three routes implemented;
  program enrichment reads only from the DB (browser-supplied program metadata
  never accepted — `ResolveIn` has no `program_ref`/title/status fields);
  `Authorization` header is read only by `get_current_user`, never re-read or
  forwarded; `X-ApplicationX-Token` is the only value forwarded as `user_token`;
  `resolve` return bug fixed; SSE priming/`_chain`/`aclose` implemented as
  specified; ops route blocks `host-contexts.resolve` and unknown operations
  with 404; 16 KB body-size guard via `content-length` kept; `embed_disabled`
  503 applied to all three new routes via `_require_ready()`, `status` route
  untouched.
- **Names**: `get_broker`, `_require_ready`, `_upstream_token`, `_raise`,
  `_chain`, `ResolveIn`, `OpIn`, `run_events` — consistent with the existing
  module's style and the brief's naming.
- **YAGNI**: no extra endpoints, no speculative abstraction; `_chain` is the
  minimal helper needed for the priming behavior.
- **Tests verify real behavior**: `test_resolve_enriches_program_from_database`
  hits a real DB-backed `Program` row and asserts the exact upstream body
  shape; `test_broker_error_never_echoes_token` and
  `test_missing_upstream_token_is_401` assert on response text/JSON, not
  internals; the SSE priming test uses a fake broker whose `stream` raises
  before yielding to prove the route doesn't leak a 200 with an in-band error
  in that case.
- **Clean test output**: no warnings beyond the pre-existing one already
  present in the baseline suite; no stray prints.

## Concerns

- None blocking. One minor note: `_upstream_token` and `_require_ready` are
  independent dependencies/calls (order: FastAPI resolves `Depends` params
  before the function body runs, so `_require_ready()` — called first inside
  each handler body — currently runs *after* the `token` dependency has
  already validated/rejected on a missing `X-ApplicationX-Token`). This means
  a request with a missing upstream token against a *disabled* embed gets 401
  instead of 503. The brief doesn't specify precedence for this edge case, and
  `test_disabled_embed_is_503_everywhere_but_status` (which sends a valid
  token) still passes, so behavior matches the brief's explicit test but the
  precedence between "embed disabled" and "missing token" for other requests
  is implementation-defined here. Flagging for the controller in case a
  specific order is wanted.
