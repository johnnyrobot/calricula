# Final-review fix wave — report

Branch `main`, base `7762191`, four commits added (not pushed). All rulings applied as written, with one
interpretation noted under I4 and one under I6.

## Per finding

### C1 — `mirror_scope.read_scope` queried a non-existent column
- `backend/app/connectors/mirror_scope.py:29` — `WHERE key = ?` → `WHERE resource_type = ?`, with a comment
  naming `internal/store/store.go` at the pinned revision (lines 26-28).
- `backend/tests/test_mirror_scope.py:4-21` — `SYNC_STATE_DDL` is the CLI's DDL verbatim (comment names
  `internal/store/store.go` lines 396-407 at `bfd220961d67ad30f7824cc58e759658ec83084e`); `INSERT` names the
  eight columns explicitly; `_db` builds the table from that DDL and `test_path_with_special_chars_is_read_correctly`
  reuses `_db` instead of its own (old-schema) DDL.
- Covering tests: all nine tests in `backend/tests/test_mirror_scope.py`, now against the real schema.

DDL verification command and output:

```
$ git -C /Users/laccd/code/cli-tools/laccd-class-search-cli show bfd220961d67ad30f7824cc58e759658ec83084e:internal/store/store.go | sed -n 396,407p
		`CREATE TABLE IF NOT EXISTS sync_state (
			resource_type TEXT PRIMARY KEY,
			last_cursor TEXT,
			last_synced_at DATETIME,
			total_count INTEGER DEFAULT 0,
			completeness_version INTEGER,
			discovery_source TEXT,
			catalogs_json JSON,
			courses_total INTEGER,
			courses_scanned INTEGER,
			truncated BOOLEAN
		)`,
```

### I2 + I7 — paths and typed failures
- (a) `backend/app/connectors/subprocess_broker.py:101-102` — `binary_dir` and `scratch_root` are
  `pathlib.Path(x).resolve()`d before argv/env are built; argv[0] is the absolute binary path (line 115).
  Test: `test_relative_binary_dir_resolves_against_the_caller_cwd` (`backend/tests/test_subprocess_broker.py:90`),
  `monkeypatch.chdir(tmp_path)` + `binary_dir=Path("bin")` spawns the fake CLI and argv[0] is absolute.
- (b) `.env.example:4-5` now `../connectors/bin` (matches `Settings` default);
  `backend/app/core/config.py:13-16` documents that relative values resolve against the backend working directory.
- (c) `backend/app/connectors/registry.py:101-111` `_failure(op, request, status, code, message, *, manifest=None)`
  fills provenance (`source_mode` local for local ops else live; `connector_version` from the manifest revision or
  `"unknown"` if unloadable) and coverage (`retrieved=0`, `expected=None`, `complete=None`, `truncated=False`).
  `execute` (lines 122-131) maps `FileNotFoundError`/`PermissionError` → `unconfigured`/`binary_missing`,
  `BinaryDigestMismatch` → `unconfigured`/`binary_digest_mismatch`, other `BlockedArgument` → `forbidden`/`blocked_argument`.
- (d) `registry.py:114-117` — `source_id != op.connector_id` → `forbidden`/`source_mismatch`;
  `live_required` on a `data_source == "local"` op → `unavailable`/`freshness_unmet`. Both checked before the runner.
- Tests: `backend/tests/test_execute_failures.py` — `test_source_mismatch_is_forbidden_without_running`,
  `test_live_required_on_a_local_operation_is_unavailable` (uses `catalog.coverage`),
  `test_live_required_on_a_live_operation_still_runs`, `test_missing_binary_is_unconfigured` (FileNotFoundError and
  PermissionError), `test_digest_mismatch_is_unconfigured`, `test_blocked_argument_is_forbidden`. Each asserts the
  full failure shape (status, code, retryable=False, data None, provenance mode, coverage zeros).

### I3 — disposition gate
- `subprocess_broker.py:13` `DEFAULT_ALLOWED_DISPOSITIONS = frozenset({"public_read", "diagnostic"})`;
  `run_command` keyword `allowed_dispositions` (line 91); refusal at line 95-97 before `_check_args` and before spawn.
  The registry passes nothing, so it keeps the default.
- Test: `test_remote_write_disposition_is_refused_unless_allowed` (`test_subprocess_broker.py:81`) — manifest
  listing `import` with `disposition="remote_write"` raises `BlockedArgument`; with `remote_write` in the set the
  fake CLI is spawned (exit 2, its "unknown command" path).

### I4 — digest verification
- `subprocess_broker.py:82-87` `_sha256_of` (streams the file; `open()` follows the symlink so the digest is of
  the target's bytes); lines 104-107 raise `BinaryDigestMismatch` (line 18, subclass of `BlockedArgument`) before
  spawn. `RunOutcome.binary_sha256` (line 31) carries the verified digest; replayed outcomes leave it `None`.
- `registry.py:145` passes `artifact_hash=outcome.binary_sha256` to `to_result`.
  Interpretation: the ruling says "passes the verified digest", and the same wave requires the regenerated
  normalized fixtures to change only for `schedule.search` and `articulation.list`. Reading the digest from the
  manifest would have stamped `artifact_hash` on all 75 replayed results, so `execute` uses the digest the
  broker actually verified for that run. `test_replayed_results_carry_no_artifact_hash_but_live_runs_do`
  (`test_execute_failures.py`) covers both sides.
- Fixture: `test_subprocess_broker.py:6` `FAKE_SHA256 = sha256(FAKE.read_bytes())`, used by the `manifest` fixture;
  `test_runs_with_agent_flag_and_captures_all_channels` asserts `out.binary_sha256 == FAKE_SHA256`.
  `test_wrong_binary_digest_is_refused_before_spawn` (line 71) and `test_missing_binary_raises_file_not_found`
  (line 76) added.
- `docs/P0-EXIT.md:12` (manifest row) and `:41-44` (limitation: digests are for binaries built on this host,
  darwin/arm64; other hosts rebuild from the pins and regenerate manifests). README "hash-verified" kept.

### I5 — `schedule.search` expected count
- `backend/app/connectors/operations/class_search.py:36-39` — `expected_from` removed (defaults to `None`), with
  a comment that `count` is sections and `courses_total` is courses.
- Test: `test_schedule_search_expected_is_unknown` (`test_execute_failures.py`).
- No 25-row table exists in the repo; nothing else to update.

### I6 — stale-cache coverage statement
- `docs/P0-EXIT.md` has no row that literally cites "SOURCE-INVENTORY §8"; the closest is the "Four core CLIs
  have schema/coverage tests" row (line 13, the one listing the 7 fixture states). Amended that row and added a
  Known-limitations bullet (lines 45-48): "stale cache" is covered by `app.connectors.health.assess` over
  `observed_at` (`backend/tests/test_health_state.py`), not by a replay fixture state; P1 adds a `stale` replay
  state once live captures exist. No fixture state added.

### T7 — `--types` echo
- `registry.py:38` `Operation.applied_defaults: Callable[[dict[str,str]], dict[str,str]] = lambda p: {}`.
- `registry.py:51-71` `clean_params(op, params)` extracted; `build_argv` keeps its public signature and calls it.
  `execute` (line 141) builds `scope = {**request.scope, **op.applied_defaults(params)}`.
- `backend/app/connectors/operations/assist.py:36` `applied_defaults=lambda p: {"types": p.get("types", "Department")}`.
- Test: `test_articulation_list_echoes_the_applied_types_default_into_scope` (`test_execute_failures.py`) —
  default → `"Department"`, `types="Course"` → `"Course"`, request scope keys preserved.

## Normalized-fixture diff stat

```
 fixtures/normalized/connector_results.json | 17 ++++++++++-------
 1 file changed, 10 insertions(+), 7 deletions(-)
```
Changed entries (mapped by exporter order): `articulation.list` success/empty/partial (scope gains
`"types": "Department"`), `schedule.search` success/partial (`expected` 1→null, 3→null; `complete` → null).
No other entry changed.

## Verification

```
$ cd backend && .venv/bin/python -m pytest
TOTAL                                          699     29    96%
Required test coverage of 70% reached. Total coverage: 95.85%
301 passed in 3.11s
```
(no warnings summary emitted)

```
$ cd backend && .venv/bin/python ../scripts/export_schemas.py && git diff --exit-code -- ../contracts/schemas
schemas clean
```

```
$ cd backend && .venv/bin/python ../scripts/export_normalized_fixtures.py && git diff --exit-code -- ../fixtures/normalized
75 results written
fixtures clean
```

```
$ cd packages/workspace-ui && npx vitest run
      Tests  5 passed (5)
   Duration  206ms
```

```
$ git status --short
(clean)
```

## Commits (main, not pushed)

- `6122972` fix(mirror-scope): query sync_state by resource_type, the CLI's real key column
- `3849a3e` fix(broker): verify binary digest, gate on disposition, resolve relative roots
- `9587abb` fix(registry): typed failures, echoed articulation types, unknown section total
- `a3f17cb` chore: regenerate normalized fixtures; document digest and stale-cache limits

Sibling repos were read only via `git show`; no `PRINTING_PRESS_*` set; no pinned binary executed.
