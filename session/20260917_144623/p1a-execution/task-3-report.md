# Task 3 Report: Host-context resolution endpoint

## Implemented

- `backend/app/api/__init__.py` — empty package init.
- `backend/app/api/host_contexts.py` — `POST /host-contexts/resolve` (mounted under `/v1` in `main.py`).
  - `HostContextIn` / `ProgramRefIn` request models, `Ready` / `Failure` response models per the brief.
  - Rule order: non-user principal → `access_required`; unknown org slug or no org roles → `access_required`; `host=calricula` + `embed_enabled=False` → `service_unavailable`; unmapped `program_ref` → `mapping_required`; non-ISO-8601 revision from `calricula` (checked after the mapping lookup succeeds, before the lexical string compare) → `context_stale` (retryable); `min_compatible_revision` > supplied revision → `context_stale` (retryable); no resolvable workspace → `access_required`; org/campus mismatch → `context_stale` (retryable); no active membership (`authorize_workspace`) → `access_required`; else `ready`.
  - Revision comparison is lexical ISO-8601 UTC string comparison; documented in a module-level comment.
- `backend/app/main.py` — registers `app.api.host_contexts.router` at prefix `/v1`.
- `backend/tests/test_host_contexts.py` — the brief's 7 tests verbatim, plus one added test for the non-ISO-revision guard (`test_non_iso_revision_from_calricula_is_context_stale`), 8 total.

## Deviation from the brief's task-context note (documented, deliberate)

The task-context note said to check the ISO-8601 guard "before the mapping lookup." The brief's own verbatim test `test_mapping_required_when_program_unmapped` sends `revision: "x"` (non-ISO) for an *unmapped* program (`external_id: "p-9"`) and asserts `mapping_required`. Checking the ISO guard before the mapping SELECT would make that test return `context_stale` instead, failing it.

Resolution: the ISO guard runs immediately after the mapping lookup returns a match (`m is not None`), before the `min_compatible_revision` string compare — i.e. it still guarantees a garbage revision never reaches the lexical compare, while preserving `mapping_required` precedence for unmapped programs. This is documented in an inline comment above the guard in `host_contexts.py`. All 7 brief tests plus the added guard test pass with this ordering.

## Tests and results (TDD evidence)

**RED** — before implementation (route + models didn't exist):
```
$ .venv/bin/python -m pytest tests/test_host_contexts.py -q --no-cov
...
KeyError: 'state'   (repeated across all 8 tests — 404 response body has no "state" key)
FAILED tests/test_host_contexts.py::test_public_gets_access_required
FAILED tests/test_host_contexts.py::test_member_without_program_gets_ready_selector_or_workspace
FAILED tests/test_host_contexts.py::test_mapping_required_when_program_unmapped
FAILED tests/test_host_contexts.py::test_stale_revision
FAILED tests/test_host_contexts.py::test_no_membership_gets_no_workspace_data
FAILED tests/test_host_contexts.py::test_tampered_org_or_campus
FAILED tests/test_host_contexts.py::test_embed_disabled
FAILED tests/test_host_contexts.py::test_non_iso_revision_from_calricula_is_context_stale
```

**GREEN (intermediate)** — first implementation pass (ISO guard before mapping lookup, per the task-context note literally) surfaced the conflict above:
```
FAILED tests/test_host_contexts.py::test_mapping_required_when_program_unmapped
  AssertionError: assert 'context_stale' == 'mapping_required'
```
Fixed by moving the guard to after the mapping lookup (see Deviation section).

**GREEN (final)**:
```
$ .venv/bin/python -m pytest tests/test_host_contexts.py -q --no-cov
........                                                                 [100%]
```
8 passed, 0 failed.

## Full suite summary

```
$ .venv/bin/python -m pytest -q
........................................................................ [ 22%]
........................................................................ [ 44%]
........................................................................ [ 66%]
........................................................................ [ 89%]
...................................                                      [100%]
Required test coverage of 70% reached. Total coverage: 93.60%
```
Exit code 0. No warnings, no failures, no errors. `host_contexts.py` itself: 96% line coverage (3 uncovered lines are alternate `_fail` branches not hit by these 8 tests: `session_expired`/`version_mismatch` states and the `else` unreachable path in `_is_iso8601_utc`, none of which the brief requires tests for).

## Files changed

- `backend/app/api/__init__.py` (new)
- `backend/app/api/host_contexts.py` (new)
- `backend/app/main.py` (modified — router registration)
- `backend/tests/test_host_contexts.py` (new)

## Self-review

- **Completeness against the brief**: all interfaces, rules, and response shapes match. Router mounted exactly as specified (`/v1` prefix + `/host-contexts/resolve`). `Ready.api_version` defaults from `settings.APP_VERSION`; `Failure.retryable` defaults `False`, `context_stale` explicitly `True`.
- **Quality**: single-responsibility router module, no extra endpoints or unused imports. Comment documents the lexical-comparison caveat as instructed.
- **Discipline**: no files touched beyond what the brief lists (`app/api/__init__.py`, `app/api/host_contexts.py`, `main.py`, the test file). No refactoring of Task 1/2 code.
- **Testing**: all 8 tests are real HTTP calls through `TestClient` against real Postgres-backed rows via the `client`/`session` fixtures (no mocking of the DB or router). Output is pristine — no warnings, no stray print/logging noise.
- **TDD**: tests written first, run to confirm failure (404/KeyError), then implementation, then re-run to green, matching the workflow above including the mid-implementation correction caught by the guard-ordering conflict.

## Concerns

None blocking. Worth flagging to the controller: the task-context note's literal instruction ("check ISO guard before the mapping lookup") is inconsistent with the brief's own test fixture for `test_mapping_required_when_program_unmapped`; I followed the verbatim test (source of truth) and documented the resulting order in code. If a later task/brief assumes the guard fires before the mapping SELECT (e.g., to avoid the DB round-trip for a known-garbage revision), that assumption is now false and should be reconciled.
