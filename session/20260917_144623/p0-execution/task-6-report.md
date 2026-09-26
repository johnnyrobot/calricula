# Task 6 Report: Envelope normalizers (endpoint, bespoke, NDJSON stream)

## What I implemented

Created `backend/app/connectors/envelopes.py` exactly per the brief:

- `EnvelopeKind = Literal["endpoint","bespoke","ndjson"]`
- `Normalized(BaseModel)` with `status, data, source_mode, synced_at, truncated, errors, events, stderr_warnings`
- `normalize(outcome: RunOutcome, kind: EnvelopeKind) -> Normalized` handling, in order: timeout, stdout-cap truncation, non-zero exit code (via `EXIT_CODES` mapping, `partial` special-cased, everything else `unavailable`), then per-kind body parsing (`ndjson` line-by-line event collection with `sync_warning`/`sync_anomaly`/`sync_summary` handling; `endpoint` requiring a `results`/`meta` envelope; `bespoke` passing the raw struct through while honoring its own `truncated`/`source` fields).
- `to_result(n, *, scope, expected, retrieved, connector_version, evidence_refs, next_cursor=None, snapshot_id=None, artifact_hash=None) -> ConnectorResult`, with `complete=None` whenever `expected is None` (never asserting completeness against an unknown expectation).

**Ruling applied (bespoke `synced_at`):** In the `bespoke` branch of `normalize`, added extraction of a timestamp from, in priority order: top-level `observed_at`, top-level `synced_at`, or `meta.synced_at` (only when `doc` is a dict and `doc.get("meta")` is itself a dict). Parsed via a small shared helper `_parse_synced_at(value)` which does exactly `datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None` — the same parsing the endpoint branch uses (the endpoint branch was refactored to call the same helper, no behavior change there). When none of the three sources is present, `synced_at` stays `None`. This is implemented in the `# bespoke:` block at the bottom of `normalize`, lines ~72-83 of `envelopes.py`.

Added the required ruling test `test_bespoke_synced_at_reads_observed_at_synced_at_or_meta_synced_at` to `backend/tests/test_envelopes.py`: a bespoke doc with `"observed_at": "2026-09-01T00:00:00Z"` asserts `n.synced_at.year == 2026`; a bespoke doc without any timestamp field asserts `n.synced_at is None`.

No other logic was changed from the brief's code. `envelopes.py` imports only `json, re, datetime, typing, pydantic, app.connectors.contracts, app.connectors.subprocess_broker` — no `subprocess` import, no `logging` import.

## TDD evidence

RED — before `envelopes.py` existed:
```
$ cd backend && .venv/bin/python -m pytest tests/test_envelopes.py -q --no-cov
==================================== ERRORS ====================================
___________________ ERROR collecting tests/test_envelopes.py ___________________
ImportError while importing test module '.../tests/test_envelopes.py'.
E   ModuleNotFoundError: No module named 'app.connectors.envelopes'
=========================== short test summary info ============================
ERROR tests/test_envelopes.py
!!!!!!!!!!!!!!!!!!!! Interrupted: 1 error during collection !!!!!!!!!!!!!!!!!!!!
```

GREEN — after implementing `envelopes.py`:
```
$ cd backend && .venv/bin/python -m pytest tests/test_envelopes.py -q --no-cov
.........                                                                [100%]
```
9 passed (8 from the brief + the 1 ruling test).

## Full-suite summary

```
$ cd backend && .venv/bin/python -m pytest
.................................                                        [100%]
================================ tests coverage ================================
Name                                  Stmts   Miss  Cover   Missing
-------------------------------------------------------------------
app/connectors/envelopes.py              71      6    92%   38, 46-47, 59, 62, 77
...
TOTAL                                   348     22    94%
Required test coverage of 70% reached. Total coverage: 93.68%
33 passed in 2.19s
```
33 passed, no warnings in the summary, coverage 93.68% (floor 70%).

## Files changed

- `backend/app/connectors/envelopes.py` (new)
- `backend/tests/test_envelopes.py` (new)

## Self-review

- **Completeness against brief:** all interfaces (`EnvelopeKind`, `Normalized`, `normalize`, `to_result`) implemented with the field names specified. All 8 brief tests present verbatim and passing, plus the required ruling test. Correction: `to_result`'s signature is not verbatim-identical to the brief's interface line in the task description (which lists only `scope, expected, retrieved, connector_version, evidence_refs, next_cursor=None`) — it also carries `snapshot_id: str | None = None` and `artifact_hash: str | None = None` keyword-only params, exactly as given in the brief's Step 3 code block (which is authoritative over the shorter interface summary in the task description). Implemented as written in that code block.
- **Quality:** logic matches the brief's reference implementation exactly except for the ruling addition; the endpoint and bespoke `synced_at` parsing now share one small helper (`_parse_synced_at`) rather than duplicating the `fromisoformat`/`replace("Z", "+00:00")` expression — this is a pure refactor, not a behavior change, and keeps the ruling's parsing identical to the endpoint branch as required.
- **Discipline:** no process spawning, no logging, no extra fields, no extra public functions beyond what the brief and ruling required.
- **Testing:** all assertions are real (exact status/data/field value checks, not just "does not raise"); pytest output is clean (`.........`/`.................................`, no warnings, no skips).

## Concerns

None. The ruling was a small, well-scoped, backward-compatible addition; nothing in the brief needed to be deviated from otherwise.

## Commit

```
5e767c8 feat(connectors): normalize the three CLI envelope shapes into typed results

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

## Fix round 1 (review finding: plan-mandated fragility)

**Finding:** both the `endpoint` and `bespoke` branches of `normalize` fed untrusted CLI output straight into `datetime.fromisoformat(...)` and called `.get` on `meta` without a type check. Confirmed reproductions before the fix: `meta.synced_at = "not-a-timestamp"` raised `ValueError`; bespoke `observed_at = "not-a-timestamp"` raised `ValueError`; `meta = "not-a-dict"` raised `AttributeError`. `normalize` must never raise on realistic (malformed but well-formed-JSON) CLI output — a bad timestamp or a wrong-shaped `meta` is not a typed failure, it just means the observation time is unknown.

**What changed** (`backend/app/connectors/envelopes.py`):
- `_parse_synced_at(value)` now returns `None` when `value` is not a non-empty `str`, and also returns `None` (instead of propagating) when `datetime.fromisoformat` raises `ValueError`, `TypeError`, or `AttributeError`. The payload keeps normalizing normally — `status` is unaffected, only `synced_at` degrades to `None`.
- In the `endpoint` branch, `meta` is now built as `meta = doc.get("meta"); meta = meta if isinstance(meta, dict) else {}` (was `doc.get("meta") or {}`, which does not guard a non-dict truthy value like a string).
- In the `bespoke` branch, `meta` is normalized with the same `isinstance(meta, dict)` guard (behavior was already safe there but is now expressed with the same idiom as the endpoint branch, per the ruling's "in both branches" instruction).
- No other logic changed.

**Tests added** to `backend/tests/test_envelopes.py`:
- `test_endpoint_malformed_meta_synced_at_degrades_to_none` — endpoint with `meta.synced_at = "not-a-timestamp"` → `status == "ok"`, `synced_at is None`, `data` intact.
- `test_bespoke_malformed_observed_at_degrades_to_none` — bespoke with `observed_at = "garbage"` → `status == "ok"`, `synced_at is None`.
- `test_endpoint_meta_as_non_dict_degrades_gracefully` — endpoint with `meta` as a plain string → `status == "ok"`, `source_mode == "live"`, `synced_at is None`.
- Extended `test_bespoke_synced_at_reads_observed_at_synced_at_or_meta_synced_at` (the deferred-minor ask) to also cover the bare top-level `synced_at` fallback and the `meta.synced_at` fallback.

**TDD evidence for the fix.** RED, confirmed by stashing the `envelopes.py` fix and running only the new tests against the pre-fix code:
```
$ git stash push -- backend/app/connectors/envelopes.py
$ cd backend && .venv/bin/python -m pytest tests/test_envelopes.py -q --no-cov
...
>           synced = meta.get("synced_at")
                     ^^^^^^^^
E           AttributeError: 'str' object has no attribute 'get'
app/connectors/envelopes.py:64: AttributeError
=========================== short test summary info ============================
FAILED tests/test_envelopes.py::test_endpoint_malformed_meta_synced_at_degrades_to_none
FAILED tests/test_envelopes.py::test_bespoke_malformed_observed_at_degrades_to_none
FAILED tests/test_envelopes.py::test_endpoint_meta_as_non_dict_degrades_gracefully
$ git stash pop
```
GREEN, after restoring the fix:
```
$ cd backend && .venv/bin/python -m pytest tests/test_envelopes.py -q --no-cov
............                                                             [100%]
```
12 passed (9 from the initial implementation + 3 new fragility-fix tests; the ruling test's assertion count grew but it is still one test).

**Full-suite run after the fix:**
```
$ cd backend && .venv/bin/python -m pytest
....................................                                     [100%]
================================ tests coverage ================================
Name                                  Stmts   Miss  Cover   Missing
-------------------------------------------------------------------
app/connectors/envelopes.py              78      5    94%   43, 51-52, 64, 67
...
TOTAL                                   355     21    94%
Required test coverage of 70% reached. Total coverage: 94.08%
36 passed in 2.25s
```
36 passed, no warnings, coverage 94.08% (floor 70%).

**Files changed (fix round 1):**
- `backend/app/connectors/envelopes.py` (modified)
- `backend/tests/test_envelopes.py` (modified)

**Commit:**
```
1c662c1 fix(connectors): degrade malformed timestamps and meta instead of raising in normalize

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

**Concerns:** none. The fix is narrowly scoped to the reviewer's finding; no other behavior changed.
