# Task 3 report — pathway route (plan, evidence cards, claim validation)

## Summary

Implemented the `pathway` intent route through `pathways.search` -> `pathways.get` + `pathways.plan`, following the top search hit, with typed `pathway` evidence cards and unit/term claim validation against the plan's totals. `_plan` now returns a 3-tuple `(Plan, FollowUp, list[AnswerWarning])`; `run_pipeline` merges pre-flight warnings (e.g. `unconfigured` campus) and short-circuits with an explicit "not configured" answer when there are no steps but pre-flight warnings exist — placed after the clarification return, per the brief's ordering note (a campus must resolve before the plan can decide it's unconfigured).

## TDD evidence

**RED** — `cd backend && source .venv/bin/activate && python -m pytest tests/test_chat_pathway.py -q --no-cov`

All 5 new tests failed as expected, route was `unsupported_in_release` (pathway not yet in `SUPPORTED`):
```
FAILED tests/test_chat_pathway.py::test_pathway_plan_searches_then_follows_top_hit
FAILED tests/test_chat_pathway.py::test_pathway_units_and_terms_claims_are_checked
FAILED tests/test_chat_pathway.py::test_unconfigured_campus_is_an_explicit_warning_without_tool_calls
FAILED tests/test_chat_pathway.py::test_pathway_search_outage_is_partial_not_empty_success
FAILED tests/test_chat_pathway.py::test_pathway_validate_rules_directly
```

**GREEN** — `cd backend && source .venv/bin/activate && python -m pytest tests/test_chat_pathway.py tests/test_chat_pipeline.py -q --no-cov`

```
......................................                                   [100%]
```
(38 passed, 0 failed)

**Full suite** — `cd backend && source .venv/bin/activate && python -m pytest -q`

All tests passed (all dots, no `F`/`E` in output), coverage:
```
Required test coverage of 70% reached. Total coverage: 96.12%
```

## Files changed

- `backend/app/chat/pipeline.py` — `SUPPORTED` gains `"pathway"`; `_plan` signature becomes `(intent, q, scope, language) -> tuple[Plan, FollowUp, list[AnswerWarning]]`, every existing branch (`schedule`, `catalog`, `campus`, fallthrough) returns the added `[]` third element; new `pathway` branch resolves `site_content_id`, returns an `unconfigured` pre-flight warning with no steps when the campus has none, otherwise plans `pathways.search` with a follow-up that adds `pathways.get`/`pathways.plan` for the top hit's `programId`. `run_pipeline` unpacks the 3-tuple, extends `warnings` with pre-flight warnings, sets `partial = True` when any exist, and returns early (`completeness="unknown"`, answer "This source is not configured for the selected campus.") when there are no steps but pre-flight warnings — placed right after the `SUPPORTED`/clarification guards. `Citation` construction now also passes `source_period=evidence[i].get("source_period")`.
- `backend/app/chat/cards.py` — added `_pathway_entry` (used for `pathways.search`/`pathways.get` rows) and new `evidence_from` branches for `pathways.search`/`pathways.get`, `pathways.plan`, and `pathways.transfer_options` (transfer_options added per the brief even though Task 3 only exercises search/get/plan; it's part of the brief's `cards.py` block).
- `backend/app/chat/validate.py` — added `_TERMS` regex and a `pathway` branch in `check()`: unit values are checked against each evidence entry's own `units`/`total_min_units`/`total_max_units`, or accepted if within the min/max span across evidence; term counts are checked against `terms_to_completion`.
- `backend/tests/test_chat_pathway.py` — new, the 5 tests from the brief verbatim.

No fixture changes were needed: `fixtures/synthetic/programmapper/pathways.search/outage.json` already existed with the correct non-zero-exit/empty-stdout envelope.

## Deviations from the brief

- The brief's pipeline.py snippet does `from app.chat.campuses import site_content_id, unconfigured` and calls them unqualified. I instead did `from app.chat import campuses` and call `campuses.site_content_id(...)` / `campuses.unconfigured(...)`. Reason: `test_unconfigured_campus_is_an_explicit_warning_without_tool_calls` does `monkeypatch.setattr(campuses, "site_content_id", lambda c: None)` — patching the module attribute. A `from ... import site_content_id` binds the name into `pipeline`'s own namespace at import time, so the monkeypatch on the `campuses` module wouldn't affect the direct-imported name and the test failed with `AttributeError: 'NoneType' object has no attribute 'status'` (executor got called because `site_content_id` still returned the real crosswalk value). Module-qualified access fixes it and matches how the test patches the module. No other behavior differs from the brief.

## Self-review

- Diff matches the brief's code blocks apart from the noted import/call-site adjustment.
- Names, structure (helper functions, branch ordering) match the brief.
- No unused imports; `Callable` was already imported and reused for the new `FollowUp` type alias.
- Tests verify real behavior: tool-call ordering/params via a spy executor, replay-fixture-driven outage handling, unit/term claim withholding via `FakeGateway`, and `validate.check` directly.
- Test output is clean (no warnings/deprecation noise beyond pytest-cov's standard summary).

## Concerns

None. `tests/test_chat_pipeline.py` remains green (SUPPORTED-set ordering and prior routes unaffected). Full suite green at 96.12% coverage, well above the 70% floor.
