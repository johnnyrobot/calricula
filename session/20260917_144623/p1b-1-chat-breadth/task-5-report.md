# Task 5 report — lmi.lookup connector and workforce route

Repo: `/Users/laccd/code/applicationx`, branch `p1b-1/chat-breadth`. Commit: `5e48462`.

## What was implemented

Exactly as specced in `task-5-brief.md`:

- `backend/app/connectors/lmi.py` — `lmi.lookup` in-process connector: typed HTTP `GET
  {CALRICULA_API_ORIGIN}/api/lmi/search?q=` via a module-level `_client_factory()` (monkeypatched
  in tests), SOC-code filtering, replay support from the fixture, and `wage_ref`/`projection_ref`
  id builders (reused by `operations/lmi.py` per the brief's "preferred" note, avoiding duplicating
  the id format).
- `backend/app/connectors/operations/lmi.py` — registers the `lmi.lookup` `Operation`
  (`connector_id=calricula_lmi`, `envelope="bespoke"`, `data_source="live"`), importing the id
  builders from `lmi.py`.
- `fixtures/synthetic/calricula_lmi/lmi.lookup/success.json` — the brief's `SAMPLE` document as
  plain JSON (read directly by the connector, not a CLI outcome envelope).
- `backend/app/core/config.py` — added `CALRICULA_API_ORIGIN: str | None = None`.
- `backend/app/connectors/registry.py` — imports `lmi` as `lmi_connector`, adds
  `"calricula_lmi": lmi_connector.execute_operation` to `IN_PROCESS`, and adds `lmi` to the
  operations-registration import at the bottom.
- `backend/app/chat/cards.py` — added `_money` helper and the `lmi.lookup` branch producing
  `lmi_wage`/`lmi_projection` evidence entries with the specified `fields`.
- `backend/app/chat/validate.py` — added `_MONEY`/`_PERCENT` regexes and the `workforce` branch in
  `check()` checking wage and growth-percent claims against evidence fields.
- `backend/app/chat/pipeline.py` — `SUPPORTED |= {"workforce"}`; `_plan()` gains a `workforce`
  branch that returns the `unconfigured` warning when `CALRICULA_API_ORIGIN` is unset, otherwise
  builds a stripped query and plans `lmi.lookup`. Added `from app.core.config import settings`.
- `connectors/data_families.yaml` — see deviation below.

## TDD evidence

RED:
```
cd backend && .venv/bin/python -m pytest tests/test_lmi_connector.py tests/test_chat_workforce.py -q --no-cov
```
```
ImportError: cannot import name 'lmi' from 'app.connectors' (...)
ImportError: cannot import name 'lmi' from 'app.connectors' (...)
Interrupted: 2 errors during collection
```

GREEN (same command, after implementation):
```
...........
```
(11 passed, 0 failed)

Step 4 set (registry/fixtures/inventory) after implementation + the two invariant-test adaptations
below:
```
cd backend && .venv/bin/python -m pytest tests/test_lmi_connector.py tests/test_chat_workforce.py tests/test_registry.py tests/test_operation_fixtures.py tests/test_inventory.py -q --no-cov
```
All passed (98 tests).

Schema check (no diff expected, none found):
```
cd backend && .venv/bin/python ../scripts/export_schemas.py
cd .. && git diff --exit-code -- contracts/schemas   # exit 0
```

Full suite:
```
cd backend && .venv/bin/python -m pytest -q
```
```
........................................................................ [ 14%]
...
.....                                                                    [100%]
Required test coverage of 70% reached. Total coverage: 96.19%
```
All tests pass; no failures.

## Files changed

- Created: `backend/app/connectors/lmi.py`, `backend/app/connectors/operations/lmi.py`,
  `fixtures/synthetic/calricula_lmi/lmi.lookup/success.json`, `backend/tests/test_lmi_connector.py`,
  `backend/tests/test_chat_workforce.py`
- Modified: `backend/app/connectors/registry.py`, `backend/app/core/config.py`,
  `backend/app/chat/pipeline.py`, `backend/app/chat/cards.py`, `backend/app/chat/validate.py`,
  `connectors/data_families.yaml`, `backend/tests/test_registry.py`, `backend/tests/test_inventory.py`

## Deviations from the brief

1. **`connectors/data_families.yaml` target row.** The brief says "set the S9/LMI family entry to
   `status: implemented_tested`" but there is no `S9.lmi` id — the file has `S9.edd_lmi`,
   `S9.bls_lmi`, `S9.qcew_lmi`. I used `S9.edd_lmi` (its existing reason text — "EDD occupational
   wages/projections via the California LMI client; preserve statistical period and geography" —
   matches what Calricula's `/api/lmi/search` backs, per `calricula/backend/app/services/lmi_client.py`
   read as reference). I also changed its `disposition` from `proposed` to `public_read` to match
   every other `implemented_tested` row's disposition (the brief's snippet didn't specify a
   disposition value, and `proposed` alongside `implemented_tested` would be an inconsistent pair
   given every other row in the file uses `public_read`/`private_read`/etc. for tested operations).

2. **Two pre-existing P0-era invariant tests needed updating, not just the brief's target test
   files.** `test_registry.py::test_registry_covers_the_25_p0_operations` hard-coded
   `set(REGISTRY) - set(SUBPROCESS_OPS) == {"campus.search"}` (the only in-process operation before
   this task), and `test_inventory.py::test_p0_tested_families_match_registry_count` hard-coded
   `{f.operation for f in tested} == {op for op, o in REGISTRY.items() if o.connector_id not in
   IN_PROCESS}` on the premise that in-process operations never have a tracked data family. Task 5
   is the first in-process connector with a real data-family entry (`S9.edd_lmi`), so both
   invariants needed to admit `lmi.lookup` as a second, deliberate exception alongside
   `campus.search`. I updated both assertions (and the explanatory comment in `test_inventory.py`)
   to state the new invariant explicitly rather than loosen it silently. The brief's own Step 4
   listed both of these tests among the ones that must pass, so this follows its intent; it just
   wasn't called out as a file to modify in the "Files" header.

No other deviations — `lmi.py`, `operations/lmi.py`, the fixture, `cards.py`, `validate.py`, and
`pipeline.py` changes are verbatim from the brief (with the id-builder factoring explicitly
preferred by the brief).

## Self-review

- Diff matches the brief's code verbatim except the two noted deviations.
- No personal email, no secrets; the connector never forwards `authorization`/`cookie` headers
  (asserted in `test_ok_result_has_typed_provenance_and_coverage`) and the upstream 500 body
  ("boom secret") never reaches `safe_message` (asserted in
  `test_upstream_failures_are_typed_and_redacted`).
- Names/shapes match the rest of `app/connectors` and `app/chat` (compare `campus_corpus.py`'s
  in-process pattern; `cards.py`/`validate.py` branch style).
- No dead code beyond `WAGE_LIMITS`/`PROJECTION_LIMITS` constants in `lmi.py`, which are defined but
  unused (the brief defines them exactly this way; `cards.py`'s inline limit strings don't reference
  them — kept as specified rather than "fixed" unrequested).
- Test output is clean (no warnings beyond the pre-existing baseline); full suite green at 96.19%
  coverage, well above the 70% floor.

## Concerns

- The `S9.edd_lmi` vs. an `S9.lmi` id ambiguity (deviation 1) and the two invariant-test edits
  (deviation 2) are worth a reviewer's eyes — they're judgment calls filling a gap in the brief's
  literal text, not brief-specified changes.

## Fix report (code review: 1 Important + 5 minors)

Commit: `32e68ba`.

1. **Important — `pipeline.py` workforce query fallback reinjected the raw question.** The old
   `... .strip()[:80] or q[:80]` fell back to the *unscrubbed* question whenever the
   stopword+non-word scrub produced an empty string, so punctuation-only leftovers (`"salary?"`)
   or apostrophe-mangled fragments failed the operation's `query` pattern and surfaced as
   `invalid_parameters`/`ParameterError` with no answer. Fixed by tokenizing the scrubbed string and
   dropping 1-character tokens (the "s" apostrophe fragment from "What's"), instead of falling back
   to raw text; when the result is still under 2 characters, `_plan` now returns no steps and a
   pre-flight `AnswerWarning(code="query_too_short", source_id="calricula_lmi", ...)`, which
   `run_pipeline`'s existing "no steps and pre" early-return path surfaces without ever calling the
   executor.
2. **`connectors/lmi.py`: non-dict JSON body.** A 200 response whose JSON body is not an object
   (e.g. `[1, 2]`) used to reach `doc.get(...)` and blow up; now checked explicitly and reported as
   `status="unavailable"`, `code="schema_change"`.
3. **Replay must bypass the origin check everywhere, and `source_url` must not lie.** `lmi.py`
   previously returned `unconfigured`/`origin_missing` before ever checking `CONNECTOR_REPLAY`, and
   `pipeline.py`'s workforce branch did the same, so replay-mode (dev/e2e) couldn't exercise the
   workforce route without an origin configured. Both now check `CONNECTOR_REPLAY` first/alongside
   and only require the origin on a live fetch; `provenance.source_url` is `None` when there is no
   origin to build a URL from (instead of interpolating `None` into an f-string).
4. **`cards.py`: `source_period` string coercion.** `str(w.get("year"))` produced the literal string
   `"None"` when a wage row had no year; now `source_period` is the real `None` in that case (both
   the top-level citation field and the evidence `fields` entry).
5. **`cards.py`: duplicated limits strings.** The wage/projection `limits` text is now imported as
   `WAGE_LIMITS`/`PROJECTION_LIMITS` from `app.connectors.lmi` instead of being re-typed inline in
   the evidence `fields`, so there is one source of truth for those disclosures.
6. **`tests/test_lmi_connector.py`: real `_client_factory()` coverage.** Added
   `test_client_factory_uses_origin_no_redirects_and_a_10s_timeout`, which builds the actual
   (non-monkeypatched) client with the origin set, asserts `follow_redirects is False` and
   `timeout == httpx.Timeout(10.0)`, and closes the client in a `finally`.

Also added, per the review's explicit test list: `test_non_dict_json_body_is_a_schema_change` and
`test_replay_serves_fixture_even_when_origin_is_unset` (asserting `source_url is None`) in
`test_lmi_connector.py`; `test_query_too_short_after_scrubbing_is_a_preflight_warning_with_no_executor_call`,
`test_query_scrubbing_drops_stopwords_and_bare_apostrophe_tokens` (covers both `"What is the wage
for welders?"` → `"welders"` and `"What's the salary for an RN?"` → `"RN"`), and
`test_replay_serves_workforce_route_when_origin_is_unset` in `test_chat_workforce.py`.

### Test command and output

```
cd backend && .venv/bin/python -m pytest tests/test_lmi_connector.py tests/test_chat_workforce.py tests/test_chat_pipeline.py -q --no-cov
```
```
..................................................                       [100%]
```
50 passed, 0 failed.

Also re-ran the Step-4 invariant set and the full suite to confirm no regressions:

```
cd backend && .venv/bin/python -m pytest tests/test_registry.py tests/test_operation_fixtures.py tests/test_inventory.py -q --no-cov
```
```
........................................................................ [ 33%]
........................................................................ [ 66%]
........................................................................ [ 99%]
..                                                                       [100%]
```

```
cd backend && .venv/bin/python -m pytest -q
```
```
Required test coverage of 70% reached. Total coverage: 96.25%
```
All tests passed.

Schema export re-checked (`python ../scripts/export_schemas.py && git diff --exit-code -- ../contracts/schemas`): no diff, as before — these fixes don't touch any exported contract.

### Files changed (this fix commit)

- `backend/app/chat/cards.py`
- `backend/app/chat/pipeline.py`
- `backend/app/connectors/lmi.py`
- `backend/tests/test_chat_workforce.py`
- `backend/tests/test_lmi_connector.py`

No deviations from the review's instructions; no new subagents were used.
