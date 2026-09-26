# Task 6 report: public-chat policy

Repo: `/Users/laccd/code/applicationx`, branch `p1b-1/chat-breadth`, commit `c1e670f`.

## What was implemented

- `backend/app/core/config.py`: `PUBLIC_CHAT_ENABLED` default flipped `True` → `False` (owner
  decision 2026-09-19, opt-in per deployment); added `RATE_LIMIT_PUBLIC_DAILY: str = "200/day"`.
- `backend/app/core/ratelimit.py`: `message_limit()` now returns `f"{RATE_LIMIT_PUBLIC};{RATE_LIMIT_PUBLIC_DAILY}"`
  for non-user keys (slowapi `;`-joined multi-limit), unchanged `RATE_LIMIT_USER` for `user:` keys.
- `backend/app/core/deps.py`: added `public_chat_gate(principal = Depends(get_principal))` — 403
  `public_chat_disabled` when `principal.kind == "public"` and `not settings.PUBLIC_CHAT_ENABLED`;
  passes everyone else through untouched.
- `backend/app/api/chat.py`: `MAX_QUESTION_CHARS` 2000 → 4096; all three routes
  (`post_message`, `run_events`, `cancel_run`) now depend on `public_chat_gate` instead of
  `get_principal`.
- `backend/tests/conftest.py`: extended the existing rate-limit env-preset/restore block to also
  preset `RATE_LIMIT_PUBLIC_DAILY=100000/day` and `PUBLIC_CHAT_ENABLED=true` for the suite (same
  `setdefault` + restore-map pattern as `RATE_LIMIT_PUBLIC`/`RATE_LIMIT_USER`).
- `README.md`: added a settings table (`PUBLIC_CHAT_ENABLED`, `RATE_LIMIT_PUBLIC`,
  `RATE_LIMIT_PUBLIC_DAILY`, `RATE_LIMIT_USER`, `CALRICULA_API_ORIGIN`) after the existing
  `CORS_ORIGINS`/`CONNECTOR_REPLAY` paragraph — `CALRICULA_API_ORIGIN` (added by Task 5) was
  previously undocumented in README, now documented here.
- `.env.example`: `PUBLIC_CHAT_ENABLED=false`, added `RATE_LIMIT_PUBLIC_DAILY=200/day`, and a
  commented `CALRICULA_API_ORIGIN=` with a one-line explanation (also previously undocumented
  there).
- `backend/tests/test_public_chat_policy.py`: the brief's 6 tests, verbatim.

## Deviation from the brief (required — existing code made the spec impossible as written)

`app/identity/principal.py::get_principal_from_token` had a **pre-existing** check, independent
of this task, that already raised `HTTPException(401, "authentication required")` for
`token is None` when `not settings.PUBLIC_CHAT_ENABLED`. Since `public_chat_gate` (per the brief)
depends on `get_principal` → `get_principal_from_token`, that 401 fired *before*
`public_chat_gate` ever ran, so `test_public_principal_is_refused_when_disabled` got back 401
instead of the spec'd 403 `public_chat_disabled`.

Fix: removed that check from `get_principal_from_token` (it now always returns
`Principal(kind="public")` for a missing token) and left the "may this principal actually use
chat" policy entirely to the new `public_chat_gate`, per its docstring. `get_principal_from_token`
is also used by `app/api/host_contexts.py`'s `/resolve` route, but that route already
independently rejects `principal.kind != "user"` with a 200 `Failure(state="access_required")`
response body, not via this exception, so removing the check does not change its behavior —
confirmed by `tests/test_isolation.py` and the host-contexts tests staying green.

No other deviations; the rest of the brief's code (config, ratelimit, deps, chat.py, conftest)
was used verbatim.

## TDD evidence

RED (`backend/tests/test_public_chat_policy.py` before implementation, run against config +
ratelimit only — deps.py/chat.py wiring wasn't done yet):

```
$ .venv/bin/python -m pytest tests/test_public_chat_policy.py -q --no-cov
FF.FFF
FAILED tests/test_public_chat_policy.py::test_public_chat_is_off_by_default
FAILED tests/test_public_chat_policy.py::test_public_principal_is_refused_when_disabled
FAILED tests/test_public_chat_policy.py::test_public_limit_string_combines_minute_and_day
FAILED tests/test_public_chat_policy.py::test_daily_limit_is_enforced_per_ip
FAILED tests/test_public_chat_policy.py::test_question_cap_is_4096
```
(`test_dev_user_is_not_gated_when_public_chat_is_disabled` passed even pre-implementation since
dev-token users were never gated by the old check — expected.)

GREEN:

```
$ .venv/bin/python -m pytest tests/test_public_chat_policy.py -q --no-cov
......                                                                   [100%]

$ .venv/bin/python -m pytest tests/test_chat_api.py tests/test_isolation.py tests/test_config.py tests/test_identity.py -q --no-cov
................................................                         [100%]
```

## Full suite (Step 4)

```
$ .venv/bin/python -m pytest -q
521 passed in 34.75s
Required test coverage of 70% reached. Total coverage: 96.35%
```

## Files changed

- `backend/app/core/config.py`
- `backend/app/core/ratelimit.py`
- `backend/app/core/deps.py`
- `backend/app/identity/principal.py` (deviation, see above)
- `backend/app/api/chat.py`
- `backend/tests/conftest.py`
- `backend/tests/test_public_chat_policy.py` (new)
- `README.md`
- `.env.example`

## Self-review

- Diff matches the brief's spec exactly except the one required `principal.py` fix, called out
  above with rationale and evidence it's safe (host_contexts.py unaffected, test_isolation.py
  green).
- Names, docstring, and comment on `public_chat_gate` match the brief.
- No stray imports: `settings` now imported in `deps.py` as required; `HTTPException` import in
  `principal.py` still used by other branches in that function.
- No secrets, no personal email, no source-body/token echoing introduced.
- Test output is clean (no warnings beyond pre-existing ones, no skips).

## Concerns

None. Behavior matches the brief's five test cases plus the pre-existing chat/isolation suites.
