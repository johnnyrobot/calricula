# Task 9 report: Campus corpus and `campus.search` operation

Status: DONE (one commit on `main`, not pushed). Commit `1f3d667` —
`feat(evidence): campus public corpus with full-text search served as an in-process operation`.

## What was implemented and where each ruling landed

| Ruling | Where |
|---|---|
| Models `SourceRecord`, `Passage` (stored generated `tsv`, GIN index, works under `create_all` and in the migration) | `backend/app/evidence/records.py`; registered in `backend/app/models_registry.py` |
| `campus_corpus.search(session, *, campus, query, limit=8)` — `campus_ref` filter, `plainto_tsquery('english')`, plus `'simple'` for Spanish / non-ASCII queries, union de-duplicated by passage id, `ts_rank` order, `ts_headline` snippet ≤ 300 chars, hit keys exactly `{evidence_id, snippet, url, locator, title, observed_at}` | `backend/app/evidence/campus_corpus.py` |
| `execute_operation(request, session)` → `ConnectorResult` with `source_mode="local"`, `observed_at` = max `fetched_at` of hit records, `evidence_refs` = hit ids, `coverage.expected=None`, `retrieved` = hit count, empty hits → `ok` + `data=[]`; `session=None` → typed `unavailable`/`session_missing` (never raises into the pipeline) | `backend/app/evidence/campus_corpus.py` |
| `campus.search` registered: `connector_id="campus_corpus"`, `command_path="-"`, `envelope="bespoke"`, `data_source="local"`, `required={"query": r"(?s).{2,200}", "campus": r"[A-Z]{4,5}"}`, `optional={"language": r"en\|es"}`, `argv=lambda p: []`; no manifest file needed | `backend/app/connectors/operations/campus.py` |
| `IN_PROCESS` module-level map; `execute(..., session=None)` consults it after the `source_id`/freshness checks and after `clean_params`/`op.argv` (so regexes and the flag-shape rule apply), before `load_manifest`; `_connector_version` returns `settings.APP_VERSION` for in-process connectors so `_failure` never tries a manifest | `backend/app/connectors/registry.py` |
| `runs.execute_run` passes `executor=functools.partial(execute, session=session)`; `run_pipeline` passes it through unchanged | `backend/app/chat/runs.py` |
| Migration `0003_p1a_evidence` (`down_revision="0002_p1a_chat"`), hand-written `Computed` tsvector + GIN index | `backend/alembic/versions/0003_p1a_evidence.py` |
| Ingest script: https only, allowlist `*.laccd.edu` + nine college domains, DNS resolution with public-unicast-only check (`ip.is_global and not multicast`, refuses loopback/private/link-local/CGNAT/reserved), no redirects followed, 2 MB cap while streaming, content-type check, `content_hash` = sha256 of fetched bytes, upsert by `(source_id, url)` with unchanged-hash → `fetched_at` refresh only, `--dry-run` checks URLs without fetching | `scripts/ingest_campus_pages.py` |
| Example sources YAML with two LAMC URLs | `connectors/campus_sources.example.yaml` |
| P0 tests unchanged in count: `test_operation_fixtures` parametrizes `SUBPROCESS_OPS` (filters `connector_id in IN_PROCESS`); `test_registry` asserts the 25 subprocess ops and that the only extra is `campus.search`; `test_inventory` compares against subprocess ops; `scripts/export_normalized_fixtures.py` skips in-process ops | those files |
| Pipeline campus branch now also passes `language` (from `PipelineInput.language`) so the Spanish rule reaches the search; `_plan` gained a `language="en"` parameter | `backend/app/chat/pipeline.py` |

Nothing was fetched during this task. `THIRD_PARTY_NOTICES.md` untouched. No personal email anywhere (grep over changed paths returns only pre-existing GitHub module paths in `connectors/pins.toml`).

## Tests and TDD evidence

`backend/tests/test_campus_corpus.py` (10 tests): the brief's three, plus ranking, Spanish/non-ASCII `'simple'` union, locator numbering and blank input for `split_passages`, `observed_at` = newest hit record, empty corpus → `ok`/`[]`, missing session → typed failure, parameter/source validation still applied on the in-process path, and the Step 4 pipeline test (`route == "campus"`, first citation `campus:<record_id>#p1` with url, locator, `observed_at`, `completeness == "complete"`, an `evidence` card).

`backend/tests/test_chat_pipeline.py`: the two tests that relied on `campus.search` being unregistered now `monkeypatch.delitem(REGISTRY, "campus.search")` to keep testing the unregistered path; added `test_campus_question_without_a_session_is_a_typed_unavailable` (default executor → `unavailable` warning from `campus_corpus`, still `route == "campus"`).

First run (before implementation):
```
ImportError: cannot import name 'IN_PROCESS' from 'app.connectors.registry'
Interrupted: 1 error during collection
```
After models/search/operation: 7 of 10 failed — `ts_headline` option string was invalid (`StartSel=` needs `""`), and `split_passages` kept heading text in the passage (brief expects `parts[-1]["text"] == "short"`). Fixed both; then 10 passed.

Final: `pytest tests/test_campus_corpus.py -q --no-cov` → 10 passed.
Full suite: `pytest --no-cov -q` → **392 passed**; `pytest` (with coverage) → 94.50% (floor 70%), zero warnings in output.
(`-W error` fails at collection on the pre-existing starlette `httpx2` deprecation that `pytest.ini` already filters; verified identical on a clean stash of `main`, unrelated to this task.)

## Alembic

```
alembic current                 -> 0002_p1a_chat
alembic upgrade head            -> Running upgrade 0002_p1a_chat -> 0003_p1a_evidence
alembic check                   -> No new upgrade operations detected.
alembic downgrade 0002_p1a_chat -> ok;  alembic upgrade head -> ok;  alembic check -> clean
```
`alembic check` prints one `UserWarning: Computed default on passages.tsv cannot be modified` (alembic/autogenerate/compare.py:1034). This is the documented autogenerate limitation: Alembic cannot compare or emit changes to a `Computed` expression, so it warns and skips it; it is not drift (the reported plan is empty).

## Normalized-fixture check

`python scripts/export_normalized_fixtures.py` → `75 results written`; `git diff --stat -- fixtures/normalized` → empty.

## Trailer verification

`git log -1 --format='%(trailers:key=Co-Authored-By)'` → `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` (own paragraph, parses as a trailer).

## Files changed (16)

backend/alembic/versions/0003_p1a_evidence.py (new), backend/app/chat/pipeline.py, backend/app/chat/runs.py, backend/app/connectors/operations/campus.py (new), backend/app/connectors/registry.py, backend/app/evidence/campus_corpus.py (new), backend/app/evidence/records.py (new), backend/app/models_registry.py, backend/tests/test_campus_corpus.py (new), backend/tests/test_chat_pipeline.py, backend/tests/test_inventory.py, backend/tests/test_operation_fixtures.py, backend/tests/test_registry.py, connectors/campus_sources.example.yaml (new), scripts/export_normalized_fixtures.py, scripts/ingest_campus_pages.py (new).

## Self-review

- Completeness: all rulings landed (table above); the pipeline's campus branch returns a `campus` route with a dated `campus:` citation (tested); P0 fixture counts unchanged.
- Search is real Postgres full-text (verified the AND/OR behaviour on PG 16.14 before implementing); query text is always bound, never interpolated (the only `.format` substitutes one of two constant SQL fragments). Stopword-only, operator-character, and blank queries return `[]` without error.
- `Computed` + GIN index confirmed under both `create_all` (test DB) and the migration (dev DB round-trip).
- Ingest allowlist/address logic exercised offline against attacker-shaped hosts (`evil.lamission.edu.attacker.com`, `lamission.edu.evil`, non-443 port, http) and reserved addresses (127/8, 10/8, 169.254.169.254, 192.168/16, fe80::, ::1, 100.64/10, multicast) — all refused.

## Concerns / deviations to flag

1. **AND-then-OR relaxation.** The brief's own test (`"financial aid office hours"` must hit a passage that lacks "hours") cannot pass with pure `plainto_tsquery` AND semantics. `search` runs the ruling's `plainto_tsquery('english', :q)` first and, only when nothing matches every term, retries with the same lexemes OR-ed (`to_tsquery(replace(plainto_tsquery(...)::text, ' & ', ' | '))`), ranked by `ts_rank`. Documented in the module docstring. If the controller prefers strict AND, the brief's first test needs a different fixture.
2. **Headings are boundaries, not content** in `split_passages` (the brief's test requires `parts[-1]["text"] == "short"` for `"# B\nshort"`). Heading words are therefore not searchable; the page `<title>` is stored on the record. Cheap follow-up if wanted: also store the nearest heading on the passage.
3. **`language` optional parameter** added to `campus.search` and passed by the pipeline's campus branch (`{"query", "campus", "language"}`) so the Spanish rule can reach the search; this is one key beyond the ruling's description of the plan.
4. **`test_inventory.py` also needed the in-process filter** (it asserted implemented_tested families == `set(REGISTRY)`; the corpus is not an S1–S11 source). Same pattern as the other P0 filters.
5. **Ingest DNS TOCTOU**: the script resolves and vets addresses, then lets httpx resolve again for the actual connection; a rebinding host could in principle answer differently between the two lookups. Pinning the connection to the vetted IP with SNI would close it but adds a custom transport; left as a documented limitation of an owner-run script.
6. `fetched_at` uses `DateTime(timezone=True)` (the chat tables use naive `DateTime`) so citation timestamps are unambiguous instants.

## Fix report (review findings, Minor x2)

Commit `f910429` — `fix(evidence): enforce unique passage locators and public-only corpus reads` (trailer verified via `%(trailers)`).

What changed:
- `backend/app/evidence/records.py`: `Passage.__table_args__` adds `UniqueConstraint("record_id", "locator", name="uq_passages_record_locator")`.
- `backend/alembic/versions/0003_p1a_evidence.py`: same constraint added in place to `create_table("passages", ...)` (migration was local-only; the drop_table in downgrade covers it).
- `backend/app/evidence/campus_corpus.py`: search predicate is now `r.campus_ref = :campus AND r.classification = 'public' AND p.tsv @@ q.query`; docstring updated.
- `backend/tests/test_campus_corpus.py`: (a) `test_duplicate_locator_within_a_record_is_rejected_by_the_database` — second `(record_id, "p1")` passage → `IntegrityError` on commit; (b) `test_non_public_records_are_never_searchable` — `classification="internal"` record with a matching passage is not returned. Both failed before the change, pass after.

Alembic (from `backend/`):
```
alembic downgrade 0002_p1a_chat  -> Running downgrade 0003_p1a_evidence -> 0002_p1a_chat
alembic upgrade head             -> Running upgrade 0002_p1a_chat -> 0003_p1a_evidence
alembic check                    -> No new upgrade operations detected.   (same known Computed-column UserWarning as before)
```

Tests:
```
pytest tests/test_campus_corpus.py -q --no-cov  -> 12 passed
pytest --no-cov -q                              -> 394 passed
pytest (with coverage)                          -> 394 passed, coverage 94.5% (floor 70%), 0 warnings
```
