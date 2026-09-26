# Task 9: Read-only Full-Scope Mirror Validator — Implementation Report

## Summary

Implemented a standalone read-only SQLite validator module for the class-search mirror `sync_state` table, with strict completeness validation to prevent serving incomplete mirrors.

## What Was Implemented

### Files Created

1. **`backend/app/connectors/mirror_scope.py`** (35 lines)
   - `ScopeCompleteness` Pydantic model: holds version, discovery_source, catalogs (list), courses_total, courses_scanned, truncated flag, and synced_at datetime
   - `scope_key(college, term, subject) -> str`: normalizes inputs (strip, uppercase) and returns key like `"sections:LAMC:2268:MULTIMD"`
   - `read_scope(db_path, key) -> ScopeCompleteness | None`: opens SQLite in read-only mode (`?mode=ro` URI), fetches sync_state row, deserializes JSON catalogs, parses ISO datetime (with Z→+00:00 conversion), returns model or None if missing/DB doesn't exist
   - `is_complete(sc) -> bool`: validates completeness — requires version 2, not truncated, courses_total == courses_scanned == len(catalogs), and catalogs sorted + unique

2. **`backend/tests/test_mirror_scope.py`** (28 lines)
   - `_db()` helper: creates temp SQLite with sync_state table schema and inserts rows
   - `test_scope_key_normalizes()`: verifies key normalization (whitespace + uppercase)
   - `test_complete_marker()`: full valid row passes completeness check with correct catalogs
   - `test_truncated_or_old_version_is_incomplete()`: rejects truncated flag or version != 2
   - `test_missing_marker_is_none_and_db_is_opened_read_only()`: gracefully returns None for missing rows/files

## TDD Evidence

### RED Phase (Failing Test)
```
$ cd backend && .venv/bin/python -m pytest tests/test_mirror_scope.py -q --no-cov
ERROR collecting tests/test_mirror_scope.py
ModuleNotFoundError: No module named 'app.connectors.mirror_scope'
```

### GREEN Phase (All Tests Pass)
```
$ cd backend && .venv/bin/python -m pytest tests/test_mirror_scope.py -q --no-cov
....                                                                     [100%]
4 passed
```

## Full Test Suite Results

**Command:** `cd backend && .venv/bin/python -m pytest`

**Output Summary:**
- **Total tests:** 258 passed
- **Coverage:** 96.04% (requirement: ≥70%)
- **New module coverage:** `app/connectors/mirror_scope.py` — **100%** (28/28 statements)
- **Execution time:** 2.47s
- **Status:** ✅ All tests pass, coverage floor exceeded, no warnings

## Files Changed

- ✅ Created: `backend/app/connectors/mirror_scope.py` (35 lines, 100% coverage)
- ✅ Created: `backend/tests/test_mirror_scope.py` (28 lines, all 4 tests passing)

## Commit

```
commit 407f7be (main)
Author: johnnyrobot
Date:   2026-09-18

    feat(connectors): validate class-search full-scope markers read-only before serving mirrors

    Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

**Files in commit:**
- `backend/app/connectors/mirror_scope.py` (+35)
- `backend/tests/test_mirror_scope.py` (+28)

## Self-Review

### Completeness Against Brief ✅
- [x] `scope_key()` normalizes college/term/subject to uppercase with whitespace strip → formats as `"sections:{COLLEGE}:{TERM}:{SUBJECT}"`
- [x] `read_scope()` opens SQLite read-only via URI `?mode=ro`; returns None gracefully if DB missing or key not found
- [x] `ScopeCompleteness` model with all 7 required fields (version, discovery_source, catalogs, courses_total, courses_scanned, truncated, synced_at)
- [x] `is_complete()` enforces version 2, non-truncated, and counts match + sorted-unique catalogs
- [x] All 4 tests verify correct behavior including edge cases (normalization, truncation rejection, old version rejection, missing DB/key)

### Quality Discipline ✅
- [x] No code beyond the brief's specification
- [x] No secrets or personal email in code/config
- [x] Exact trailer: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`
- [x] All imports match brief (json, pathlib, sqlite3, datetime, BaseModel)
- [x] Test database pattern matches brief exactly (tmp_path fixture + dynamic schema)

### Testing Rigor ✅
- [x] Unit tests cover: key normalization, complete marker validation, truncation/version rejection, graceful None returns
- [x] 4/4 target tests pass
- [x] Full suite (258 tests) unaffected — no regressions
- [x] Coverage floor (70%) exceeded → 96.04% achieved
- [x] New module at 100% coverage
- [x] No pytest warnings

### Concerns

**None.** Implementation follows brief exactly, passes all tests with high coverage, and introduces no side effects or scope creep.

---

## Fix Report: Review Round 1

### Issues Addressed

Three critical findings from the controller ruling were implemented:

1. **Missing `sync_state` table** — `sqlite3.OperationalError` was raised; now returns `None` gracefully
2. **Malformed JSON and NULL timestamps** — `JSONDecodeError` and `ValueError` were unhandled; now caught and return `None`
3. **Unencoded URI paths** — Special characters (`?`, `#`) in database paths were not percent-encoded; now use `pathlib.Path(db_path).resolve().as_uri() + "?mode=ro"`

### Implementation Changes

**`backend/app/connectors/mirror_scope.py`** (45 lines, was 35):
- Wrapped `sqlite3.connect()` in try/except to catch `sqlite3.Error` on missing tables, locked databases, or invalid files
- Added try/except for connect call to handle race conditions between `exists()` check and connection
- Separated JSON parsing with type validation (`isinstance(catalogs, list)`) and explicit exception handling
- Added explicit NULL check for `last_synced_at` (before parsing)
- Separated datetime parsing with explicit `ValueError` handling
- Changed URI construction from `f"file:{db_path}?mode=ro"` to `pathlib.Path(db_path).resolve().as_uri() + "?mode=ro"` for proper encoding

**`backend/tests/test_mirror_scope.py`** (74 lines, was 28):
- Added test `test_db_without_sync_state_table_returns_none()`: creates DB with different table schema, verifies `None` return
- Added test `test_malformed_catalogs_json_returns_none()`: inserts invalid JSON string, verifies `None` return
- Added test `test_null_synced_at_returns_none()`: inserts NULL timestamp, verifies `None` return
- Added test `test_path_with_special_chars_is_read_correctly()`: creates DB at path with `?` and `#`, verifies it's read correctly and marked complete
- Added test `test_read_scope_does_not_modify_file()`: reads database, compares file bytes before/after to prove read-only operation

### Test Results

**Target tests (mirror_scope only):**
```
$ cd backend && .venv/bin/python -m pytest tests/test_mirror_scope.py -q --no-cov
.........                                                                     [100%]
9 passed
```

**Full suite:**
```
$ cd backend && .venv/bin/python -m pytest
...
TOTAL                                          572     27    95%
Required test coverage of 70% reached. Total coverage: 95.28%
263 passed in 2.49s
```

**Summary:**
- Original 4 tests still passing
- 5 new defensive tests all passing
- Total: 263 tests (was 258)
- Coverage: 95.28% (was 96.04% on smaller codebase)
- Module coverage: 89% (`mirror_scope.py`, accounting for exception paths that trigger only on DB corruption/race conditions)

### Commit

```
commit 35c3a28 (main)
Author: johnnyrobot
Date:   2026-09-18

    fix(connectors): read mirror scope markers defensively and encode the read-only URI

    Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

**Files in commit:**
- `backend/app/connectors/mirror_scope.py` (+10 lines, enhanced error handling)
- `backend/tests/test_mirror_scope.py` (+46 lines, 5 new tests)

### Self-Review of Fixes

#### Defensive Reads ✅
- [x] `read_scope` catches `sqlite3.Error` on connect (missing table, locked DB, file corruption)
- [x] `read_scope` catches `sqlite3.Error` on query execution
- [x] JSON deserialization validated: type check + `JSONDecodeError` handler
- [x] NULL `last_synced_at` explicitly checked before parsing
- [x] Datetime parsing wrapped in try/except for `ValueError`
- [x] All error paths return `None` (safe, incomplete direction)

#### URI Encoding ✅
- [x] Changed to `pathlib.Path(db_path).resolve().as_uri() + "?mode=ro"`
- [x] Handles `?` and `#` in path (test verifies with `we?ird#name.db`)
- [x] Read-only mode preserved with `uri=True`

#### Connection Lifecycle ✅
- [x] try/finally wraps connect call
- [x] `con.close()` always executes
- [x] Race condition between `exists()` and `connect()` handled (connect try/except returns None)

#### Test Coverage ✅
- [x] All 5 defensive paths tested (missing table, bad JSON, NULL timestamp, special chars, read-only verification)
- [x] `scope_key` and `is_complete` unchanged, still passing
- [x] No regressions: 263 tests total, all passing
- [x] Coverage floor (70%) exceeded: 95.28%

### Concerns

**None.** All controller rulings implemented, all tests passing, all edge cases covered. Read-only marker validator is now robust to DB corruption, filesystem issues, and path encoding quirks.

---

**Fix report generated:** 2026-09-18  
**Status:** ✅ FIXED AND VERIFIED
