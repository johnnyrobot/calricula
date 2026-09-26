# Task 4 report — transfer route (ASSIST resolve → agreements list)

## Summary

Implemented the `transfer` intent end-to-end: `_plan` in `pipeline.py` issues two
`articulation.resolve` calls (sending campus, then receiving institution), and once
both institution ids and the year id are known, the follow-up queues
`articulation.list`. `cards.py` gained evidence branches for `articulation.resolve`
(kind `evidence`, id `assist:institution:<id>`) and `articulation.list` (kind
`agreement` per report, id `assist:agreement:<key>`). `validate.py` gained a
`transfer` branch checking agreement-subject and year claims. `SUPPORTED` now
includes `"transfer"`.

## Files changed

- `backend/app/chat/pipeline.py` — `SUPPORTED |= {"transfer"}`, transfer branch in
  `_plan` (imports `assist_name`, `unconfigured` from `app.chat.campuses`), and the
  one-line evidence-loop hook (`if e["kind"] == "agreement" and scope.year: e["fields"]["year"] = scope.year`).
- `backend/app/chat/cards.py` — `articulation.resolve` and `articulation.list`
  branches in `evidence_from`, verbatim from the brief.
- `backend/app/chat/validate.py` — `_AGREEMENT_SUBJECT` regex + `transfer` branch
  in `check()`.
- `backend/tests/test_chat_transfer.py` — new, from the brief (one line adjusted,
  see Deviations).
- `backend/tests/test_chat_pipeline.py` — `test_unsupported_intent_is_explicit`
  updated (see Deviations).

`fixtures/synthetic/assist/articulation.resolve/outage.json` already existed
(confirmed via `ls fixtures/synthetic/assist/articulation.resolve/`); no fixture
changes were needed.

## TDD evidence

RED:
```
cd backend && source .venv/bin/activate && python -m pytest tests/test_chat_transfer.py -q --no-cov
```
```
FFF.F                                                                    [100%]
FAILED tests/test_chat_transfer.py::test_transfer_resolves_both_institutions_then_lists_agreements
FAILED tests/test_chat_transfer.py::test_transfer_without_institution_is_a_clarification_and_calls_nothing
FAILED tests/test_chat_transfer.py::test_transfer_agreement_subject_and_year_claims_are_checked
FAILED tests/test_chat_transfer.py::test_transfer_validate_rules_directly
```
(the `test_resolve_failure_stops_before_listing` test passed even at RED, since
an unsupported "transfer" intent already returned a non-"agreement"-carrying,
`unknown`/`partial` answer — expected, the brief only asks for 4 of 5 to fail
before implementation.)

GREEN:
```
cd backend && source .venv/bin/activate && python -m pytest tests/test_chat_transfer.py tests/test_chat_pathway.py tests/test_chat_pipeline.py tests/test_slots_p1b.py -q --no-cov
```
```
...............................................................          [100%]
```
(67 passed, 0 failed)

Full suite:
```
cd backend && source .venv/bin/activate && python -m pytest
```
```
494 passed in 23.56s
Required test coverage of 70% reached. Total coverage: 96.11%
```

## Deviations from the brief

1. **`RunOutcome.model_copy` note (dispatch contingency).** `RunOutcome` *is* a
   pydantic `BaseModel` (`app/connectors/subprocess_broker.py`), so `model_copy`
   itself doesn't fail — but `model_copy(update=...)` skips validation/coercion.
   The brief's test helper builds the receiving-institution fixture with
   `base.model_copy(update={"stdout": json.dumps(doc)})`, which leaves `stdout` as
   `str`. Since `RunOutcome.stdout` is `bytes` and `envelopes.normalize()` calls
   `outcome.stdout.decode(...)` unconditionally, this raised `AttributeError: 'str'
   object has no attribute 'decode'` on the second (UCLA) resolve call, which the
   pipeline's executor error handling silently turned into an `invalid_parameters`
   warning — so the follow-up chain stalled after 2 calls instead of 3. Fixed by
   encoding: `json.dumps(doc).encode()`. This is the one line changed in
   `test_chat_transfer.py` versus the brief's literal text.

2. **`_AGREEMENT_SUBJECT` regex widened.** The brief's regex
   (`... (?=[,.;]|\s+(?:and|y|or|o)\b|$)`) does not match "Agreement for Physics in
   2019." — the character class excludes digits, so the non-greedy group can't
   extend far enough for any of `,.; / and|y|or|o / $` to satisfy the lookahead at
   a valid boundary, and `findall` returns `[]` for that sentence. That breaks
   `test_transfer_validate_rules_directly`'s second case, which expects `"Physics"`
   in the withheld reasons. Added `in|en` to the lookahead's stop-word alternation
   (`... (?=[,.;]|\s+(?:and|y|or|o|in|en)\b|$)`) so "Physics" is captured and the
   trailing "in 2019" is left for the separate year check. Verified this doesn't
   regress the positive case ("agreements for Mathematics and Biology" still
   captures "Mathematics").

3. **`test_chat_pipeline.py::test_unsupported_intent_is_explicit` updated.** This
   pre-existing test asserted `"Does PSYCH 1 transfer to CSUN?"` was
   `unsupported_in_release` — true only while `transfer` was unsupported. Since
   Task 4's whole point is to support `transfer`, the test's premise is now false
   (it started failing once `SUPPORTED` included `"transfer"`). Changed the
   question to `"In what order should I take MATH 261 and MATH 262?"`, which
   classifies as the still-unsupported `sequence` intent, keeping the test's
   original intent (assert an explicit "not in release" answer) valid.

No other deviations; `cards.py`, `validate.py`'s `transfer` branch (aside from the
regex widening above), and `pipeline.py`'s plan/follow-up/evidence-hook are
verbatim from the brief.

## Self-review

- Diff matches the brief section-by-section (`cards.py` branches, `validate.py`
  regex + branch, `pipeline.py` `SUPPORTED`/`_plan`/evidence hook); no scope creep.
- Names match the brief (`_AGREEMENT_SUBJECT`, `state`, `follow_up`, etc.).
- No dead code added; the `unconfigured(...)` warning path (missing
  campus/institution/year) is exercised by `test_transfer_without_institution_is_a_clarification_and_calls_nothing`
  indirectly (via `resolve_slots`'s own clarification, which fires before `_plan`
  is reached — `_plan`'s `unconfigured` branch is a defensive fallback for a
  scope state `resolve_slots` wouldn't normally produce for `transfer`; it is
  reachable if a caller passes an unconfigured campus with institution/year
  already resolved via `explicit_scope`, which isn't covered here but mirrors the
  existing `pathway` route's identical pattern).
- Full-suite output is clean: 494 passed, no warnings/skips, coverage 96.11% (floor
  70%).

## Concerns

- None blocking. The one plausibly interesting edge case not covered by the
  brief's tests: two campuses could theoretically resolve to institution ids that
  collide with the `code == scope.campus.upper()` sending/receiving match in
  `follow_up` (e.g., a receiving institution whose ASSIST `code` happens to equal
  the sending campus's LACCD code) — this is the brief's own design and out of
  scope to change here.

---

## Fix report (post-review)

Controller-ordered fixes for four review findings (three Important, one Minor),
all in the transfer route's own logic.

### 1 & 2. Year-mismatch and same-institution guards (`pipeline.py`, Important)

The transfer `follow_up` closure previously matched each `articulation.resolve`
result to a "sending"/"receiving" role by comparing `institution.code` to
`scope.campus`, took whichever `academic_year_id` arrived first, and queued
`articulation.list` as soon as both institution ids were in. That silently
listed agreements between mismatched academic years, and (if the receiving
institution happened to resolve to the sending campus's own code) silently
never queued a list with no explanation.

Fixed by:
- Assigning role by call order (the plan always queues sending, then
  receiving, and the queue is FIFO, so the first `articulation.resolve`
  follow-up is always the sending result and the second is always the
  receiving result) rather than by code comparison — this makes the
  same-institution case detectable instead of silently misclassified.
- Recording each resolve's own `academic_year_id` (`sending_year_id` /
  `receiving_year_id`); when they differ, appending a warning
  (`code="year_mismatch"`) and not queuing `articulation.list`.
- When the receiving resolve's `institution.code` equals the sending campus
  code, appending a warning (`code="same_institution"`) and not queuing the
  list.
- Since `follow_up` can only return plan steps, not warnings, added the
  mechanism the controller specified: `_plan`'s transfer branch returns a
  `late_warnings` list as its third tuple element (same as every other
  branch's `pre`-warnings list), but `follow_up` also appends to that same
  list instance later, after `run_pipeline` has already copied its
  (then-empty) contents into `warnings`. `run_pipeline` now records
  `len(pre)` right after that first copy (`seen_late = len(pre)`) and, once
  the queue drains, extends `warnings` from `pre[seen_late:]` — picking up
  anything the follow-up appended mid-loop — and sets `partial = True` when
  it does.

### 3. Year-range validation (`validate.py`, Important)

Replaced the blanket `years_ok |= {str(int(y) + 1) for y in years_ok}`
widening (which accepted *any* year one greater than an evidence year,
whether or not the draft actually wrote it as a range) with an explicit
range check: `_YEAR_RANGE` matches `YYYY-YYYY`, `YYYY–YYYY` (en dash),
`YYYY/YYYY`, and `YYYY-YY` shorthand in the draft text; a match's second
half is only accepted when its first half is itself in the evidence's
years (4-digit years are reconstructed from 2-digit shorthand using the
first half's century prefix). Any other 4-digit year found via `_YEAR` is
withheld.

### 4. Spanish agreement-subject regex (`validate.py`, Minor)

`_AGREEMENT_SUBJECT` only matched the English noun `agreements?`, so Spanish
drafts ("convenio para Física") were never checked at all — any subject
claim in a Spanish sentence passed unverified rather than being withheld.
Widened the noun alternation to `agreements?|convenios?|acuerdos?` and added
`en` to the preposition list (`for|in|de|para|en`), keeping the existing
stop-word lookahead (`and|y|or|o|in|en`) unchanged.

### Tests added (`backend/tests/test_chat_transfer.py`)

- `test_transfer_year_mismatch_skips_list_and_warns` — receiving resolve
  returns `academic_year_id: 76` (sending resolves to 75); asserts only the
  two resolves are called (no `articulation.list`), a `year_mismatch`
  warning is present, and `completeness != "complete"`.
- `test_transfer_same_institution_skips_list_and_warns` — receiving resolve
  returns `institution.code: "LAMC"` (the sending campus's own code);
  asserts no `articulation.list` call, a `same_institution` warning, and no
  `agreement` cards.
- `test_transfer_validate_year_ranges` — evidence year `"2024"`; draft
  `"...in 2025."` is withheld (`"2025"` in a reason); draft
  `"...in 2024-2025."` and `"...in 2024–25."` (en dash + 2-digit shorthand)
  are both kept (`reasons == []`).
- `test_transfer_validate_spanish_subject` — evidence label `"Mathematics"`;
  draft `"Hay un convenio para Física en 2025."` is withheld (`"Física"` in
  a reason); draft `"Hay convenios para Mathematics en 2025."` produces no
  `"agreement subject"` reason.

### Commands and output

RED/GREEN was run as a single pass (fixes and their tests were written and
verified together per the controller's "fix them in one commit" instruction,
not as a separate TDD red step against pre-existing failing assertions,
since these are new tests written against the new behavior):

```
cd backend && source .venv/bin/activate && python -m pytest tests/test_chat_transfer.py tests/test_chat_pipeline.py tests/test_chat_pathway.py -q --no-cov
```
```
...............................................                          [100%]
```
(47 passed, 0 failed)

Full suite:
```
cd backend && source .venv/bin/activate && python -m pytest
```
```
498 passed in 33.93s
Required test coverage of 70% reached. Total coverage: 96.14%
```

### Commit

`28065f8` — `fix(chat): transfer route checks year/institution agreement and
Spanish agreement claims`

### Self-review

- All four findings addressed exactly as specified by the controller,
  including the specific `late_warnings`/re-read-after-loop mechanism.
- Role assignment switched from code-comparison to call-order, which is a
  deliberate small deviation from a literal instruction (the controller
  didn't specify how to identify "the receiving resolve"): call order is
  correct because the plan queues sending before receiving and the queue is
  strictly FIFO with follow-up invoked once per completed op; it also makes
  the same-institution case actually reachable, which comparing codes for
  role assignment could not do (a receiving institution whose code equals
  the sending campus's code would have been misclassified as the sending
  slot and never surfaced as receiving in the first place).
- No unrelated changes; `cards.py` untouched this round.
- Full-suite output clean: 498 passed, coverage 96.14% (floor 70%).

### Concerns

None blocking.

---

## Fix report (re-review, finding 3)

Re-review found findings 1, 2, 4 (from the previous round) addressed, but
finding 3 not fully fixed: `_YEAR_RANGE` accepted *any* 4-digit second half
of a draft's year range once the first half matched an evidence year, so
with evidence year `2024`, a draft claiming `"2024-2026"` let `"2026"`
through as if it were evidence-backed.

### Fix (`validate.py`)

Tightened the range-acceptance check: the second half of a range is only
added to `range_seconds` when it equals the first half plus exactly one
year — `int(full_second) == int(first) + 1` — where `full_second` is either
the range's 4-digit second half directly, or (for `YYYY-YY` shorthand)
reconstructed as `first[:2] + second` before the comparison. `"2024-2025"`,
`"2024–25"` (en dash + 2-digit), and `"2024/2025"` all satisfy
`second == first + 1` and are kept; `"2024-2026"` does not, and `"2026"` is
now withheld.

### Tests added (`backend/tests/test_chat_transfer.py`, extended `test_transfer_validate_year_ranges`)

- Evidence year `"2024"`, draft `"...in 2024/2025."` → kept (`reasons == []`).
- Evidence year `"2024"`, draft `"...in 2024-2026."` → withheld
  (`"2026"` in a reason).
- (Previously covered in the same test: `"2025"` alone withheld;
  `"2024-2025"` and `"2024–25"` kept.)

### Commands and output

```
cd backend && source .venv/bin/activate && python -m pytest tests/test_chat_transfer.py -q --no-cov
```
```
.........                                                                [100%]
```
(9 passed, 0 failed)

Full suite:
```
cd backend && source .venv/bin/activate && python -m pytest
```
```
498 passed in 34.27s
Required test coverage of 70% reached. Total coverage: 96.10%
```

### Commit

`20bc11d` — `fix(chat): transfer year-range claim must be exactly evidence-year+1`

### Self-review

- Matches the controller's fix exactly: 4-digit second half compared via
  `int(second) == int(first) + 1`; 2-digit shorthand reconstructed via
  `first[:2] + second` before the same comparison.
- No other files touched.
- Full-suite output clean: 498 passed, coverage 96.10% (floor 70%).

### Concerns

None blocking.
