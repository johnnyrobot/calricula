# Task 7 report: grounded pipeline, tool routing and answer validation

Commit: `7e6d837` on `main` — `feat(chat): grounded pipeline with typed tool plan, citation validation and explicit unknowns`.

## What was implemented

Three modules under `backend/app/chat/`, one test file.

### `cards.py` — evidence entries from `ConnectorResult`s
- `evidence_from(op, result, returned_at)` builds `{evidence_id, kind, summary, fields, observed_at, card}` entries; only for `ok`/`partial` results with non-empty data.
- **Ruling (observed_at)** landed in `observed_at_for()` and the module docstring: `provenance.observed_at` if set, else the wall-clock time the connector returned when `source_mode == "live"`, else `None`. The pipeline captures `returned_at` right after the executor returns and passes it in.
- **Ruling (field names from P0 fixtures)**: `format_units()` maps `minimumCredit`/`maximumCredit` to `"5"`, `"3–4"`, or `None`; requisites come from `requisites[]` joined as `f"{type}: {code}"`.
- **Ruling (ids)**: courses are `elumen:course:{id}` (search rows and `catalog.get` share the id, so the richer `get` row replaces the search row in the evidence index); prerequisites are `elumen:course:{course_id}:prereqs` (the registry's committed `evidence_refs[0]`).

### `validate.py`
- `check(draft, evidence_index, route) -> (kept_ids, withheld_reasons)`: unknown cited ids are reasons; `schedule` checks every `\b(\d{1,3})\s*(seats?|available|cupos?|waitlist|lugares?|asientos?)\b` against evidence `available_seats`/`waitlist_total`; **ruling (catalog units)** checks `\b(\d{1,3})\s*(units?|unidades?|credits?|créditos?)\b` against evidence `fields.units` (both endpoints of a `"3–4"` range are allowed).

### `pipeline.py`
- Models: `Citation`, `Card` (kind enum matches TS), **`AnswerWarning`** (ruling: not `Warning`), `ChatAnswer` (`resolved_scope: dict[str, str]`, `clarification: Clarification | None` — Python carries `prompt`; zod strips it), `PipelineInput` with the **scope-contract docstring** (prior_scope is already merged with any hint by the caller; the pipeline reads no hints).
- `_plan()` returns `(initial_steps, follow_up)`. **Ruling (dynamic catalog plan)**: after `catalog.search` returns rows, `follow_up` enqueues `catalog.get` and `catalog.prerequisites` for the top hit's `id` once. Schedule plan is the brief's (`schedule.search` for the detected subject + `schedule.section` for up to five 5-digit class numbers). Campus plan references `campus.search`.
- **Ruling (unregistered op)**: `if op_name not in REGISTRY` → `AnswerWarning(code="operation_unavailable", source_id="applicationx")`, `partial = True`, continue. A campus question today returns a typed partial answer.
- Executor exceptions (including the registry's `ParameterError`) → `invalid_parameters` warning + partial, as the brief does. Non-`ok` statuses → `incomplete_coverage` (partial) or the status code (`unavailable`, `unconfigured`, `forbidden`) with the connector's `safe_message`.
- **Ruling (ModelError)**: `gateway.draft` raising `ModelError` yields the evidence-summary fallback with lead "The answer service was unavailable; here is what the sources say.", `AnswerWarning(code="model_unavailable", source_id="applicationx", ...)`, and completeness `partial` if evidence exists else `unknown`.
- Withheld claims → `unsupported_claim_withheld` warning and the summaries-only fallback; partial answers get the explicit "parts of this answer are unknown" sentence when the text does not already say unknown.
- `emit` is called with `("status", ...)`, `("tool", {operation, status, coverage})`, `("answer", ChatAnswer dump)`.
- Cards are derived from the deduplicated evidence index, so a section that appears in both `schedule.search` and `schedule.section` renders once (with detail).
- `ConnectorRequest.deadline_ms` is clamped to `[1000, 30000]` so a small `PipelineInput.deadline_ms` cannot fail request validation.

Deviation from the brief's sketch (deliberate): the brief defaulted the schedule subject to `"MULTIMD"` when none was detected. That would send a fabricated parameter to a live source, so `_subject()` returns `None` instead and the registry's `ParameterError` surfaces as the typed `invalid_parameters` warning. Subject detection also never picks a campus code (`LAMC`, `ELAC`, ...) and uses the original-case question so `Are`/`In` are not mistaken for subjects (the brief's `q.upper()` regex matched `"S IN MULTIMD"` on the first test question).

## Evidence / card field mapping per operation

| Operation | evidence_id | kind | summary | fields | observed_at | card |
|---|---|---|---|---|---|---|
| `schedule.search` | `laccd:section:{college}:{term}:{class_nbr}` per row of `data.sections[]` | `section` | `{course} {component} class {class_nbr} {days_times} {instruction_mode} status {status}` | `status` | provenance or wall-clock (fixture normalizes as live) | the section row |
| `schedule.section` | `result.evidence_refs[0]` (`laccd:section:...`) | `section` | `{course} {component} class {class_nbr}: {detail.available_seats} seats available, waitlist {detail.waitlist_total}, status {status} (observed ...)` | `available_seats`, `waitlist_total`, `status` | provenance (`observed_at` from the payload) | the section dict incl. `detail` |
| `catalog.search` | `elumen:course:{id}` per row | `course` | `{code} {name}: {units} units ({status})` | `units` (from `minimumCredit`/`maximumCredit`), `code` | provenance (`meta.synced_at`) | the row |
| `catalog.get` | `elumen:course:{id}` | `course` | same as search | same | provenance (`meta.synced_at`) | the row incl. `fullCourseInfo` |
| `catalog.prerequisites` | `elumen:course:{course_id}:prereqs` (the registry's committed `evidence_refs[0]`) | `course` | `{code} {name} requisites: Prerequisite: MATH 260; Advisory: MATH 240` | `requisites` (list of `{type, code}`), `code` | wall-clock (bespoke live, no timestamp) | the payload |
| `campus.search` (Task 9) | `p["evidence_id"]` | `evidence` | `p["snippet"]` | none | `p.observed_at` or result rule | the passage, plus `url`/`locator` on the citation |

## Tests (`backend/tests/test_chat_pipeline.py`, 11 tests)

The brief's six, plus:
- `test_model_error_falls_back_to_evidence_summaries` (ModelError ruling)
- `test_catalog_plan_follows_top_hit_and_maps_units_and_requisites` (dynamic plan, units/requisites mapping, ids; asserts the tool-event order `catalog.search, catalog.get, catalog.prerequisites`)
- `test_catalog_units_not_in_evidence_are_withheld` (catalog units check)
- `test_campus_operation_not_yet_registered_yields_typed_partial` (unregistered-op guard, no executor call)
- `test_answer_serializes_to_ui_contract` (top-level keys, string-valued scope, citation fields)

All tests run real replayed fixtures through the real `execute` (`_replay_executor`); no database.

### TDD evidence
- RED: `pytest tests/test_chat_pipeline.py -q --no-cov` → `ModuleNotFoundError: No module named 'app.chat.pipeline'` (collection error).
- GREEN: `11 passed`.

### Full suite
`cd backend && .venv/bin/python -m pytest --no-cov -q` → `350 passed in 4.78s`; with coverage: `TOTAL ... 94%` (floor 70), 0 warnings.

## Trailer verification
`git log -1 --format='%(trailers:key=Co-Authored-By,valueonly)'` → `Claude Fable 5.1 <noreply@anthropic.com>`.

## Files changed
- `backend/app/chat/cards.py` (new)
- `backend/app/chat/validate.py` (new)
- `backend/app/chat/pipeline.py` (new)
- `backend/tests/test_chat_pipeline.py` (new)

## Self-review
- Completeness: every route returns a `ChatAnswer` (clarification, unsupported, supported with any mix of executor/gateway failures); `run_pipeline` catches all executor exceptions and `ModelError`; all rulings applied (see above).
- Quality: three modules as specified; no extra modules; no email addresses; nothing touched outside the four files.
- Testing: replayed fixtures through the real registry; output pristine (0 warnings).
- Manual spot check of answers: seat question cites `laccd:section:LAMC:2268:17300` with the fixture's `2026-09-01T00:00:00+00:00` and 17310 with a wall-clock timestamp; outage on `schedule.section` yields `unavailable` warning, no detail card, "unknown" sentence.

## Concerns
1. (Resolved in fix round 1) Prerequisites evidence id now uses the registry's `:prereqs` spelling.
2. `gateway.draft` is only guarded for `ModelError`; a gateway raising something else would propagate. The gateway contract says providers raise `ModelError`, so I did not broaden the catch.
3. Lowercase subjects ("sections for multimd") are not detected and produce an `invalid_parameters` partial answer rather than a search; a smarter subject resolver (e.g. via `schedule.discover`) is out of scope here.

---

# Fix round 1 (review findings)

Commit: `22e997c` on `main` — `fix(chat): validate requisites and seat phrasings strictly; withhold uncited answers` (trailer verified with `git log -1 --format='%(trailers:key=Co-Authored-By,valueonly)'` → `Claude Fable 5.1 <noreply@anthropic.com>`).

Every finding was reproduced with the replay executor (`_replay_executor({})` + a scripted `FakeGateway`) before the change, and re-probed after. Probe harness: `run_pipeline(_inp(q), executor=_replay_executor({}), gateway=FakeGateway(lambda g: Draft(answer=..., cited_ids=[...])), emit=...)`.

| # | Finding | Before (probe) | Change | After (probe) | Covering test |
|---|---|---|---|---|---|
| 1 | Requisite strings not validated | "MATH 261 requires MATH 125 as a prerequisite." citing `...:prereqs` → `complete`, no warnings | `validate._requisite_claims`: sentences containing a requisite word (`prerequisite|corequisite|advisory|requisite|requisito|prerrequisito|correquisito`) yield course codes (`[A-Z][A-Z&]{1,11}\s+\d{1,4}[A-Z]?`, case-insensitive, upper-normalized, with a small stop list so "fall 2026" is not a code); each must be in evidence `fields.code` ∪ `fields.requisites[].code`, else `requisite <code> not in evidence`. `cards.py` now stores `fields.requisites` as `[{type, code}]` | withheld: `unsupported_claim_withheld: requisite MATH 125 not in evidence`; "MATH 260 as a prerequisite" kept | `test_requisite_not_in_evidence_is_withheld` |
| 2 | Seat regex missed number-first-with-adjective and noun-first forms | "There are 99 open seats." / "Seats: 99." / "99 spots left." → all `complete` | `_SEATS_NUM_FIRST = \b(\d{1,3})\s*(?:\w+\s+)?(seats?|spots?|openings?|spaces?|cupos?|plazas?|available)\b`; `_SEATS_NOUN_FIRST = (seats?|cupos?|available)\s*[:=]?\s*(\d{1,3})` | all three withheld with `seat value 99 not in evidence`; "There are 8 open seats." kept | `test_seat_phrasings_not_in_evidence_are_withheld` (x3), `test_seat_phrasing_in_evidence_is_kept` |
| 3 | `waitlist_total` pooled with `available_seats` | "17300 has 3 seats available." → `complete` (3 is the waitlist) | seat phrasings checked against `available_seats` only; waitlist phrasings (`waitlist|lista de espera`, number-first or noun-first) against `waitlist_total` only | withheld: `seat value 3 not in evidence`; "waitlist of 3" kept | `test_waitlist_total_is_not_accepted_as_a_seat_count` |
| 4 | Uncited draft over evidence passed as complete | "Plenty of seats, go ahead." with `cited_ids=[]` → verbatim, `complete` | pipeline: when `model_ok and evidence and not kept` → reason `answer cited no evidence`, `unsupported_claim_withheld` warning, fallback text from all evidence summaries (which are then the citations), `completeness = "partial"` | withheld; answer is the summaries; `partial`; citations present | `test_uncited_answer_over_evidence_is_withheld` |
| 5 | Evidence-id spelling | citation `elumen:course:40830:requisites` vs registry `:prereqs` | `cards.py` uses `result.evidence_refs[0]` (`:prereqs`); test and report updated | citation `elumen:course:40830:prereqs` | `test_catalog_plan_follows_top_hit_and_maps_units_and_requisites` |
| 6 | Units regex rejected decimals | "MATH 261 is 5.0 units." → withheld | `_UNITS = \b(\d{1,3}(?:\.\d)?)\s*(units?|...)` and numeric comparison (`float`), also for seats/waitlist | kept, `complete` | `test_decimal_units_matching_evidence_are_kept` |
| 7 | No `tool` event for failed steps | campus question → events `[status, answer]` | unregistered op → `("tool", {operation, status: "unavailable", coverage: None})`; executor exception → `("tool", {operation, status: "invalid_parameters", coverage: None})` | `[status, tool(campus.search, unavailable), answer]`; lowercase-subject schedule question emits `tool(schedule.search, invalid_parameters)` | `test_tool_event_emitted_for_unregistered_and_invalid_steps` |

Commands and output:
- `cd backend && .venv/bin/python -m pytest tests/test_chat_pipeline.py -q --no-cov` → `20 passed in 0.17s`
- `cd backend && .venv/bin/python -m pytest --no-cov -q` → `359 passed in 4.82s`
- `cd backend && .venv/bin/python -m pytest` → `359 passed`, `TOTAL ... 94%` (floor 70), 0 warnings

Files changed in this round: `backend/app/chat/validate.py` (rewritten), `backend/app/chat/cards.py`, `backend/app/chat/pipeline.py`, `backend/tests/test_chat_pipeline.py`.

Remaining note: a draft with withheld claims but at least one valid citation still reports `completeness="complete"` (the brief's semantics; the ruling for finding 4 only covers the uncited case). If the reviewer wants any withheld claim to force `partial`, it is a one-line change.

---

# Fix round 2 (re-review finding)

Commit: `0f41b40` on `main` — `fix(chat): bound numeric captures in seat and waitlist validators` (trailer verified: `Claude Fable 5.1 <noreply@anthropic.com>`).

**Finding (Important):** `_SEATS_NUM_FIRST` / `_WAIT_NUM_FIRST` had no word boundary after the captured digits, so a longer number backtracked into a partial capture with the leftover digits consumed as the "adjective" word.

- Probe before: `_SEATS_NUM_FIRST.findall("There are 1730 available seats.")` → `['173']`; `"There are 17300 available seats."` → `['173']`; `_WAIT_NUM_FIRST.findall("1730 on the waitlist")` → `['173']`. Against evidence `available_seats = 173` a wrong claim of 1730 validated.
- Change (`backend/app/chat/validate.py`): `\b` after the digit group in both number-first patterns and the in-between word restricted to alphabetic (`(?:[A-Za-z]+\s+)?`, `{0,3}` for waitlist; also applied to `_WAIT_NOUN_FIRST`'s optional word). With the bound alone, "1730 available seats" stopped being a claim at all (1-3 digit cap) and would have passed silently rather than being withheld as the review asked, so the seat/waitlist captures now allow `\d{1,6}` — any integer directly adjacent to a seat/waitlist word is a claim and is checked whole. Units keep `\d{1,3}(?:\.\d)?`. Docstring updated.
- Probe after: `"There are 1730 available seats."` → `['1730']` → reason `seat value 1730 not in evidence`; `"17300 available seats"` → `seat value 17300 not in evidence`; `"1730 on the waitlist"` → `waitlist value 1730 not in evidence`; `"seats for class 17300"` → no claim, no reasons; `"There are 173 available seats."` → kept.
- Tests (`backend/tests/test_chat_pipeline.py`, evidence index built directly for `check`): `test_longer_numbers_are_checked_whole_never_partially_captured` (x3: 1730 seats, 17300 seats, 1730 waitlist → exactly one withheld reason each) and `test_class_number_phrase_is_not_a_seat_claim` (class phrase → no reasons; 173 → kept).

Commands and output:
- `cd backend && .venv/bin/python -m pytest tests/test_chat_pipeline.py -q --no-cov` → `24 passed in 0.19s`
- `cd backend && .venv/bin/python -m pytest --no-cov -q` → `363 passed in 4.61s`
- `cd backend && .venv/bin/python -m pytest` → `363 passed`, `TOTAL ... 94%` (floor 70), 0 warnings

---

# Fix round 3 (ruling on completeness)

Commit: `25e940f` on `main` — `fix(chat): withheld claims always mark the answer partial` (trailer verified: `Claude Fable 5.1 <noreply@anthropic.com>`).

**Ruling:** any withheld claim forces `completeness = "partial"`.

- Change (`backend/app/chat/pipeline.py`): `if reasons: partial = True` after validation, so an answer that says details were left out is never `complete`, however many citations survive. The uncited-draft branch now only sets `kept = list(evidence)`; the shared rule marks it partial.
- Test: `test_withheld_claim_with_valid_citation_is_partial` — draft cites the valid section id but claims "99 seats" → `partial`, `unsupported_claim_withheld`, citation to the section retained.
- Regression exposed and fixed in the same commit (`backend/app/chat/validate.py`): the new rule made `test_waitlist_total_is_not_accepted_as_a_seat_count` fail because round 2's `\d{1,6}` widening let `_WAIT_NUM_FIRST` (up to three arbitrary words) read "Class 17300 has a waitlist of 3." as a waitlist claim of 17300 (`waitlist value 17300 not in evidence`); previously masked because withheld claims stayed `complete`. The filler between number and noun is now restricted to function words (`on|the|in|people|students|en|la|personas|estudiantes`). Probe after: `"Class 17300 has a waitlist of 3."` → `[]`; `"3 on the waitlist"` → `['3']`; `"1730 on the waitlist"` → `['1730']`.

Commands and output:
- `cd backend && .venv/bin/python -m pytest tests/test_chat_pipeline.py -q --no-cov` → `25 passed in 0.19s`
- `cd backend && .venv/bin/python -m pytest --no-cov -q` → `364 passed in 4.84s`
- `cd backend && .venv/bin/python -m pytest` → `364 passed`, `TOTAL ... 94%` (floor 70), 0 warnings
