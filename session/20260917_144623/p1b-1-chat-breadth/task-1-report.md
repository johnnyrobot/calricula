# Task 1 report — Institution and year slots; Spanish campus aliases

Repo: `/Users/laccd/code/applicationx`, branch `p1b-1/chat-breadth`, commit `a6013f3`.

## What was implemented

- `backend/app/chat/slots.py` replaced wholesale per the brief: expanded `CAMPUSES` with
  English/Spanish aliases, added `INSTITUTIONS` (ASSIST-resolvable receiving-institution
  names → aliases), `detect_institution`, `detect_years`, `TRANSFER_INTENTS`, and
  `institution`/`year` fields on `ResolvedScope` (+ `Clarification.slot` gaining
  `"institution" | "year"`). `resolve_slots` now also resolves institution/year for
  `transfer`-intent turns via the new `_transfer_slots` helper, asking for institution
  first, then year, exactly as specced.
- `backend/app/api/chat.py:20` — `SCOPE_KEYS = ("campus", "term", "institution", "year")`.
- `backend/app/chat/intents.py:10` — transfer keyword row extended with the bare
  `"transfer"`, `"transferable"`, `"agreement"`, `"ucla"`, and `"convenio"` keywords, as
  specced.
- `backend/tests/test_slots_p1b.py` — added verbatim from the brief.

## TDD evidence

RED:
```
cd backend && python -m pytest tests/test_slots_p1b.py -q --no-cov
```
```
ImportError while importing test module '.../tests/test_slots_p1b.py'.
...
E   ImportError: cannot import name 'INSTITUTIONS' from 'app.chat.slots'
```
(Brief predicted `ImportError: cannot import name 'detect_institution'`; the actual first
missing name alphabetically-imported was `INSTITUTIONS` — same failure class, expected.)

GREEN:
```
cd backend && python -m pytest tests/test_slots_p1b.py tests/test_chat_pipeline.py tests/test_chat_api.py tests/test_intents.py -q --no-cov
```
```
........................................................................ [ 91%]
.......                                                                  [100%]
```
All pass.

Full suite (once, before final report):
```
cd backend && python -m pytest -q
```
First run: 1 unrelated failure, `tests/test_subprocess_broker.py::test_runs_with_agent_flag_and_captures_all_channels`
(a timing-sensitive subprocess test unrelated to any file this task touched). Re-ran the
full suite and it passed clean; also ran that one test in isolation and it passed. Treated
as pre-existing flakiness, not a regression from this task.
```
........................................................................ [ 14%]
........................................................................ [ 29%]
........................................................................ [ 44%]
........................................................................ [ 59%]
........................................................................ [ 74%]
........................................................................ [ 89%]
.................................................                        [100%]
TOTAL 1996 stmts, 96.14% coverage (floor 70%)
```

## Files changed

- `backend/app/chat/slots.py`
- `backend/app/api/chat.py`
- `backend/app/chat/intents.py`
- `backend/app/chat/pipeline.py` (deviation, see below)
- `backend/tests/test_slots_p1b.py` (new)

## Deviations from the brief (both required to keep existing tests green)

1. **`INSTITUTIONS["University of California, Berkeley"]` alias list**: the brief's
   verbatim list was `["uc berkeley", "berkeley", "cal"]`. The bare alias `"cal"` matches
   as a standalone word inside `"Cal State Northridge"` (`"Cal"` followed by a space), so
   `detect_institution("transfer to Cal State Northridge in 2026")` returned both Berkeley
   and Northridge, failing the brief's own
   `test_detect_institution_by_alias_and_canonical`. Removed `"cal"` from Berkeley's
   aliases (kept `"uc berkeley"`/`"berkeley"`); bare "Cal" alone no longer resolves to
   Berkeley, which is an acceptable trade-off given the ambiguity with every "Cal State
   X" campus name.

2. **`backend/app/chat/pipeline.py` (not in the brief's file list)**: `run_pipeline`
   previously checked `if clar: return clarification` *before* `if intent not in
   SUPPORTED: return unsupported_in_release`. With the new transfer-slot logic, a
   transfer-intent question with no year in the text (and no prior/default year) now
   produces a `year` clarification from `resolve_slots` even though `"transfer"` isn't in
   `SUPPORTED` yet (ASSIST routing is a later P1b-1 task) — e.g. "Does PSYCH 1 transfer to
   CSUN?" started returning a clarification instead of `unsupported_in_release`, breaking
   the existing `test_chat_pipeline.py::test_unsupported_intent_is_explicit`. Swapped the
   two checks so the `SUPPORTED` gate runs first: unsupported intents short-circuit to
   `unsupported_in_release` without ever asking for institution/year clarification.
   Verified this doesn't affect any other clarification test — every other
   clarification-path test in `test_chat_pipeline.py`/`test_chat_api.py` uses `"schedule"`
   or `"campus"`, both already in `SUPPORTED`, so ordering is inert for them. The unit
   tests in `test_slots_p1b.py` that assert clarification behavior call `resolve_slots`
   directly (bypassing `pipeline.py`), so they're unaffected by this ordering change.

## Self-review

- Diff matches the brief's `slots.py`/`chat.py`/`intents.py` code verbatim except for the
  one-alias fix above.
- No stray names, no dead code; `_transfer_slots` docstring matches its actual behavior.
- Tests exercise real behavior (campus/institution/year detection, clarification
  triggering and suppression, explicit-value precedence, non-transfer intents ignoring
  institution, intent classification) — no tautological assertions.
- Clean test output on all runs; no secrets, no personal email, no stdout noise.
- `git status` clean after commit; only the intended files are staged/committed.

## Concerns

- The `pipeline.py` reorder is a real (if minimal and well-justified) deviation outside
  the brief's stated file list — flagging for controller review since later P1b-1 tasks
  presumably move `"transfer"` into `SUPPORTED`, at which point the clarification-before-
  unsupported ordering question becomes moot (both branches would be reachable in the
  intended order once transfer is actually supported). Worth a decision on whether it
  should be flagged as expected/tracked in the plan for whichever task adds
  `"transfer"` to `SUPPORTED`.
- Removing `"cal"` as a Berkeley alias is a minor scope narrowing versus the brief; if a
  later task wants "Cal" to resolve to Berkeley, disambiguation logic (e.g. negative
  lookahead for "state") would be needed instead of a bare alias.
