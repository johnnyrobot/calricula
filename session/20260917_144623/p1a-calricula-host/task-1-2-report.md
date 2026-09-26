# Task 1 & 2 report: ApplicationX settings/status endpoint + broker service

## What was implemented

### Task 1 — Settings, production guard and status endpoint
- `backend/app/core/config.py`: added `APPLICATIONX_EMBED_ENABLED`, `APPLICATIONX_API_ORIGIN`,
  `APPLICATIONX_ORGANIZATION_REF`, `APPLICATIONX_CAMPUS_REF`, `APPLICATIONX_SERVICE_TOKEN`,
  `APPLICATIONX_TIMEOUT_SECONDS`, `APPLICATIONX_STANDALONE_URL`, the `applicationx_ready` property,
  and a production guard inside `_enforce_production_safety` requiring an `https://` origin with no
  path when `APPLICATIONX_EMBED_ENABLED` is true and `ENVIRONMENT == "production"`.
- `backend/app/api/routes/applicationx.py` (new): `GET /status`, auth-required, returns
  `enabled/organization_ref/campus_ref/standalone_url/api_version`; `enabled` only true when
  `settings.applicationx_ready`.
- `backend/app/main.py`: imported `applicationx` and added
  `app.include_router(applicationx.router, prefix="/api/applicationx", tags=["ApplicationX"])`
  after the last existing router (`dashboard`).

Controller resolution #1 applied: the production test supplies distinct `OIDC_ISSUER`/`OIDC_AUDIENCE`/
`OIDC_CLIENT_ID` plus `ALLOWED_HOSTS` so only the ApplicationX origin guard trips; verified
`pytest.raises(ValueError, match="APPLICATIONX_API_ORIGIN")` works because pydantic wraps validator
errors in `ValidationError`, a `ValueError` subclass. Added the positive-control test
`test_production_accepts_https_origin_when_enabled` with `APPLICATIONX_API_ORIGIN="https://ax.example.edu"`.

### Task 2 — Broker service
- `backend/app/services/applicationx_broker.py` (new): `OPERATIONS`, `STREAMS`, `BrokerError`,
  `ApplicationXBroker.forward()`, `ApplicationXBroker.stream()`, path-param validation
  (`run_id` UUID, `source_id` `^[a-z_]{2,40}$`), sanitized 4xx/5xx/timeout handling, allowlisted
  headers only (`Authorization`, `Accept`, `Content-Type` implied by `json=`, `X-Calricula-Host`,
  optional `X-Calricula-Service`, `Last-Event-ID` for streams).

Controller resolution #2 applied: `stream()` implements the 15 s idle keepalive
(`KEEPALIVE_SECONDS = 15.0` module constant, monkeypatched to `0.05` in the test). Implementation
note: a naive `asyncio.wait_for(body_iter.__anext__(), timeout=...)` retried in a loop is broken —
cancelling a suspended async generator's `__anext__()` on timeout closes the generator, so only the
first keepalive would ever fire and the rest of the stream would be silently truncated. Verified this
by hand (see below) before fixing it. The fix keeps the same pending `__anext__()` task alive across
idle ticks via `asyncio.ensure_future` + `asyncio.wait(..., timeout=...)`, only re-issuing a new
`__anext__()` once the pending one actually resolves, and only cancelling in `finally` (stream end /
client disconnect via generator close).

Reproduction of the bug (before the fix), for the record:
```
$ venv/bin/python -c "... asyncio.wait_for based loop ..."
[b'id: 1\nevent: status\ndata: {}\n\n', b': keepalive\n\n']
```
— the second real chunk (`id: 2 ... event: done`) never arrived; confirmed the generator was closed
by the cancelled `wait_for`.

Controller resolution #3: kept `test_status_requires_auth` unchanged (`in (401, 403, 503)`).

## TDD evidence

### Task 1 — RED
```
$ cd backend && DATABASE_URL=postgresql://postgres:postgres@localhost:5435/calricula \
  venv/bin/python -m pytest -q -p no:cacheprovider tests/test_applicationx_broker.py --no-cov
...
FAILED tests/test_applicationx_broker.py::test_status_requires_auth - AssertionError: assert 404 in (401, 403, 503)
FAILED tests/test_applicationx_broker.py::test_status_disabled_by_default - AssertionError: assert {'detail': 'Not Found'} == {...}
FAILED tests/test_applicationx_broker.py::test_production_requires_https_origin_when_enabled - Failed: DID NOT RAISE
FAILED tests/test_applicationx_broker.py::test_production_accepts_https_origin_when_enabled - AttributeError: 'Settings' object has no attribute 'APPLICATIONX_API_ORIGIN'
ERROR tests/test_applicationx_broker.py::test_status_enabled_only_when_fully_configured - AttributeError: ... no attribute 'APPLICATIONX_EMBED_ENABLED'
4 failed, 1 warning, 1 error in 0.23s
```

### Task 1 — GREEN
```
$ ... pytest -q -p no:cacheprovider tests/test_applicationx_broker.py --no-cov
5 passed, 1 warning in 0.14s
```
Also re-ran `tests/test_ws4_backend_hygiene.py` (the existing production-guard suite) to confirm no
regression: `37 passed`.

### Task 2 — RED
Module did not exist yet: `ModuleNotFoundError: No module named 'app.services.applicationx_broker'`
when the second test section (`from app.services.applicationx_broker import ApplicationXBroker,
BrokerError`) was collected.

### Task 2 — GREEN
```
$ ... pytest -q -p no:cacheprovider tests/test_applicationx_broker.py --no-cov
11 passed, 1 warning in 0.35s
```
(10 of the brief's tests plus the added `test_stream_emits_idle_keepalive`.)

## Full-suite result

```
$ cd backend && DATABASE_URL=postgresql://postgres:postgres@localhost:5435/calricula \
  venv/bin/python -c "from seeds.seed_top_codes import seed_top_codes; \
  from seeds.seed_ccn_standards import seed_ccn_standards; seed_top_codes(); seed_ccn_standards()"
$ ... pytest -q -p no:cacheprovider
300 passed, 1 warning in 3.54s
Required test coverage of 45% reached. Total coverage: 52.26%
```
(Before seeding CCN/TOP reference data the suite showed 5 pre-existing, unrelated failures in
`tests/test_ccn_seed_data.py` — expected per the task instructions, resolved by seeding.)

## Files changed

- `backend/app/core/config.py` (modified)
- `backend/app/api/routes/applicationx.py` (new)
- `backend/app/main.py` (modified)
- `backend/app/services/applicationx_broker.py` (new)
- `backend/tests/test_applicationx_broker.py` (new)

## Commits

1. `cafb9e9` — `feat(applicationx): embed settings, production guard and status endpoint`
2. `5266a8d` — `feat(applicationx): scoped broker service with allowlist, sanitized errors and SSE passthrough`

## Self-review

- **Completeness**: every interface in both briefs is present (`Settings` fields, `applicationx_ready`,
  production guard, `GET /status`, `OPERATIONS`/`STREAMS`, `BrokerError`, `forward()`, `stream()`,
  path-param validation, header allowlist, 4xx/5xx/timeout handling, SSE keepalive).
- **Quality**: names match the briefs; no dead code left behind. The one deviation from the brief's
  code block is the `stream()` keepalive loop internals (task-based wait instead of a bare
  `wait_for` retry) — necessary because the brief's own interface note (15 s idle keepalive) can't be
  implemented correctly with a naive retry, as demonstrated above.
- **Discipline**: nothing added beyond the two briefs — no routes wiring the broker into HTTP
  endpoints (that's Task 3), no extra settings or operations.
- **Testing**: all tests exercise real behavior (HTTP status codes and bodies via `TestClient`,
  header/body inspection via `httpx.MockTransport`, actual async timing for the keepalive test with a
  monkeypatched interval). Output is clean — no skipped/xfail tests.
- **Secrets/tokens**: `user_token` only appears inside the `Authorization` header sent upstream and in
  test literals (`"tok-123"`, `"t"`); never logged, never included in `BrokerError.safe_message`.
  `APPLICATIONX_SERVICE_TOKEN` is read from settings, only placed in the `X-Calricula-Service` header,
  never logged. No real personal/maintainer email introduced.

## Concerns

- None blocking. One judgment call worth flagging to the controller: the brief's `stream()` code
  block, if implemented literally with `asyncio.wait_for` in a loop, silently truncates SSE streams
  after the first idle period (confirmed by direct reproduction). I implemented the keepalive with a
  persistent pending task instead so the stream actually completes; this is a functional fix within
  the same public interface, not a scope change, but worth a second look given it diverges from the
  brief's literal code.
