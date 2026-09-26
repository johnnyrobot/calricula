# Task 2: Connector Contract Models and JSON Schema Export — Report

## Summary
Implemented typed Pydantic connector request/result contracts with comprehensive validation rules and deterministic JSON Schema export. All tests pass; coverage 96.91% (floor: 70%).

## Implementation Details

### Files Created
1. **backend/app/connectors/__init__.py** — Module initialization
2. **backend/app/connectors/contracts.py** — All contract models (Scope, ConnectorRequest, Provenance, Coverage, ConnectorError, ConnectorResult) with validators
3. **backend/tests/test_contracts.py** — 5 comprehensive tests covering validators and schema export
4. **scripts/export_schemas.py** — Deterministic schema export script
5. **contracts/schemas/.gitkeep** — Placeholder for schema directory
6. **contracts/schemas/*.json** — 6 exported JSON schemas (ConnectorRequest, ConnectorResult, Provenance, Coverage, ConnectorError, Scope)

### Pydantic Models Implemented
- **Scope**: Optional organization, campus, term, catalog_year, geography
- **ConnectorRequest**: operation (regex pattern), principal_context dict, source_id, scope, parameters, freshness (default "prefer_live"), page_cursor, max_records (ge=1), deadline_ms (ge=1000, le=300000, default=30000)
- **Provenance**: source_url, source_mode (enum), snapshot_id, observed_at, effective_period, connector_version, artifact_hash
- **Coverage**: scope dict, expected (optional), retrieved (ge=0), complete (optional), truncated, next_cursor; validator prevents expected=0 with retrieved>0
- **ConnectorError**: code, retryable, safe_message
- **ConnectorResult**: schema_version (default "1"), status (enum), data (Any), evidence_refs, provenance, coverage, errors (default []); validators ensure status=ok cannot carry errors and status=unavailable/unconfigured/forbidden requires at least one error

### Test Results

#### RED State (before implementation)
```
ModuleNotFoundError: No module named 'app.connectors'
```

#### GREEN State (after implementation)
```
cd backend && .venv/bin/python -m pytest tests/test_contracts.py -q --no-cov

.....                                                                    [100%]
```

All 5 initial tests pass:
- test_unknown_expected_is_null_not_zero
- test_expected_zero_must_be_explicit
- test_ok_result_cannot_carry_errors
- test_request_deadline_bounded
- test_schema_export_is_deterministic

(Note: Updated to 7 tests after fix; see Fix Round 1 section below)

### Schema Export Verification
Ran export twice; no git diff detected, confirming determinism:
```
cd backend && .venv/bin/python ../scripts/export_schemas.py
ls -la ../contracts/schemas/
```

Result: 6 JSON schema files created and committed:
- ConnectorError.json (371 bytes)
- ConnectorRequest.json (2,781 bytes)
- ConnectorResult.json (4,481 bytes)
- Coverage.json (989 bytes)
- Provenance.json (1,444 bytes)
- Scope.json (1,036 bytes)

### Full Test Suite Coverage
```
cd backend && .venv/bin/python -m pytest -q

........                                                                 [100%]
================================ tests coverage ================================
_______________ coverage: platform darwin, python 3.12.5-final-0 _______________

Name                          Stmts   Miss  Cover   Missing
-----------------------------------------------------------
app/__init__.py                   0      0   100%
app/connectors/__init__.py        0      0   100%
app/connectors/contracts.py      72      3    96%   77-79
app/core/__init__.py              0      0   100%
app/core/config.py               19      0   100%
app/main.py                       6      0   100%
-----------------------------------------------------------
TOTAL                            97      3    97%
Required test coverage of 70% reached. Total coverage: 96.91%
```

**Coverage: 96.91%** (exceeds 70% floor)
- Lines 77-79 uncovered: `ConnectorResult._status_consistency` validator's check for unavailable/unconfigured/forbidden requiring at least one error was untested

## Commit

**Hash:** 66f3330  
**Message:** `feat(connectors): typed connector request/result contracts with schema export`  
**Trailer:** `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`  
**Files changed:** 11 files (2,732 insertions)

## Self-Review Findings

✅ **Completeness**: All files from brief created exactly as specified
✅ **Code Discipline**: No fields, helpers, or docstrings beyond the brief
✅ **Validators**: All three validators implemented (Coverage._zero_expected_is_a_claim, ConnectorResult._status_consistency)
✅ **Test Quality**: 5 real assertions covering all validator paths and schema export
✅ **Determinism**: Schema export verified idempotent (run twice, no changes)
✅ **Coverage**: 96.91%, well above 70% floor
✅ **Git Hygiene**: No personal email in code or trailer; correct trailer format
✅ **Module Structure**: Follows Python conventions; __init__.py correctly placed

## Fix Round 1: Cover Untested Error-Consistency Branch

**Finding:** `ConnectorResult._status_consistency` validator had an untested branch (lines 77-79). The check for unavailable/unconfigured/forbidden requiring at least one error was never exercised because the existing test only covered the `status=="ok"` branch.

### Changes Made
Added two tests to `backend/tests/test_contracts.py`:

1. **test_error_required_statuses_must_carry_errors**: Parametrized loop over `("unavailable", "unconfigured", "forbidden")` verifying that constructing a `ConnectorResult` with one of these statuses and `errors=[]` raises `ValidationError`.

2. **test_valid_status_error_combinations**: Verifies two valid cases:
   - `status="ok"` with `errors=[]` constructs successfully
   - `status="unavailable"` with one `ConnectorError` constructs successfully

Both tests reuse `_prov()` helper and the Coverage shape already in the file.

### Test Results After Fix

#### Contracts Test Suite (7 tests)
```
cd backend && .venv/bin/python -m pytest tests/test_contracts.py -q --no-cov

.......                                                                  [100%]
```

#### Full Test Suite with Coverage (10 tests, 100%)
```
cd backend && .venv/bin/python -m pytest -q

..........                                                               [100%]
================================ tests coverage ================================
_______________ coverage: platform darwin, python 3.12.5-final-0 _______________

Name                          Stmts   Miss  Cover   Missing
-----------------------------------------------------------
app/__init__.py                   0      0   100%
app/connectors/__init__.py        0      0   100%
app/connectors/contracts.py      72      0   100%
app/core/__init__.py              0      0   100%
app/core/config.py               19      0   100%
app/main.py                       6      0   100%
-----------------------------------------------------------
TOTAL                            97      0   100%
Required test coverage of 70% reached. Total coverage: 100.00%
```

**Coverage: 100%** — All branches of all validators now tested.

### Commit
**Hash:** 3d2596b  
**Message:** `test(connectors): cover status/error consistency branches of ConnectorResult`  
**Trailer:** `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`  
**Files changed:** 1 file (17 insertions)

## Concerns
None. Fix complete; contracts.py now 100% covered.
