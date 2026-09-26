# Task 13 report — Bilingual evaluation corpus and harness

Commit: `40dde4b feat(evals): bilingual LACCD public-question corpus, schema and scoring harness`
(single commit on `main`, not pushed; trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`)

## What I implemented

- `evals/__init__.py` (empty, per the controller's ruling so `evals.*` imports as a package).
- `evals/schema.py` — `EvalCase`, verbatim from the brief.
- `evals/harness.py` — `AnswerRecord`, `Answerer` protocol, `Scorecard`, `run(...)`, verbatim
  from the brief plus docstrings.
- `evals/build_corpus.py` — verbatim from the brief, with one addition:
  `out.parent.mkdir(parents=True, exist_ok=True)` so a fresh checkout can build without
  committing empty directories.
- `evals/templates/laccd_public.en.json` — 52 reviewed English templates (the reviewed artifact).
- `evals/templates/laccd_public.es.json` — 52 Spanish templates, same ids, identical labels.
- `evals/templates/campus_values.json` — per-campus placeholder values for all nine colleges.
- `evals/questions/{en,es}/laccd_public.jsonl` — 468 cases each (generated, committed).
- `evals/README.md`, `evals/baseline/README.md`.
- `backend/tests/test_evals.py` — the brief's four tests, verbatim.

## How the templates were derived

Sources were read read-only from the pinned sibling revision; the chatbot repo was never
checked out, stashed, reset or run (verified afterwards: still on `main`, clean tree).

```
git -C ../laccd_chatbot show 1de20af8...:frontend/index.html      -> 104 data-question buttons
git -C ../laccd_chatbot show 1de20af8...:shared/campus_config.py  -> CampusConfig + SAMPLE_QUESTIONS
```

**104 buttons -> 52 templates -> 468 cases (52 x 9 colleges).** Two dedupe moves:

1. *Campus-specific literals generalized.* Buttons that hardcode one college's subject,
   course or program became one template with a placeholder. Example: buttons 26/50/55
   (`Is CHEM 101 / ANATOMY 001 / MATH 227 offered this spring?`) -> `schedule.course_offered`
   with `{q13_course}`.
2. *Near-identical phrasings collapsed.* Buttons 13 and 14 (`What are the prerequisites for
   MATH 261?` / `What do I need to take before ENGLISH C1000?`) -> `catalog.prerequisites`.
   Buttons 2 and 9 (GE areas / Cal-GETC areas a course satisfies) -> `transfer.ge_areas_for_course`.
   Buttons 1, 5, 10 (UC/CSU transferability of three different courses) ->
   `transfer.course_transferability`.

Representative cluster -> template mapping:

| buttons | template(s) |
| --- | --- |
| 1, 5, 10 | `transfer.course_transferability` |
| 2, 9 | `transfer.ge_areas_for_course` |
| 4, 6 | `transfer.courses_for_ge_area` |
| 7, 8 | `catalog.course_renumbering`, `catalog.renumbering_list` |
| 11, 12 | `schedule.instructor` (button 12's "Professor Smith" dropped — no person names) |
| 13, 14 | `catalog.prerequisites` |
| 3 | `catalog.course_equivalence` |
| 21-28, 50-61 | `schedule.subject_this_term`, `.course_sections_seats`, `.course_offered`, `.course_schedule`, `.evening_sections`, `.future_term`, `.past_term` |
| 35-38, 62-67, 96 | `schedule.cross_college_subject`, `schedule.cross_college_ranking` |
| 39, 74-77 | `pathway.cross_college_program` |
| 29, 31, 68 | `catalog.program_requirements` |
| 30, 34, 69, 71, 94 | `catalog.program_overview` |
| 33, 70, 73 | `catalog.program_exists` |
| 32, 72 | `catalog.adt_transfer_degree` |
| 43 | `schedule.online_modality` |
| 83-87, 89 | `schedule.zero_textbook_cost`, `schedule.cross_college_ztc` |
| 88 | `resource.affordable_textbooks`, `resource.free_textbook_for_course` |
| 90-93, 97 | `sequence.program_sequence`, `.course_order`, `.prerequisite_chain`, `pathway.program_map`, `pathway.first_semester` |
| 95 | `schedule.followup_term_filter` (prior-turn context slot) |
| 98 | `workforce.career_outcomes`, `workforce.program_wages` |
| 102, 82 | `catalog.program_list` |
| 103, 18, 49 | `transfer.university_agreement`, `transfer.pathway_to_csu_uc`, `oos.transfer_gpa` |
| 15-17, 19, 20, 40-42, 44-48, 99-101, 104, 78, 79 | the nine `oos.*` templates |
| 35-39, 62-67 (district scope they presuppose) | the four `campus.*` templates |

Two judgment calls worth flagging:

- **Buttons 78-82** are Spanish/Armenian/Chinese/Japanese/French renderings of intents that
  already have English templates (cost, how to apply, math classes, nursing program, program
  list). They add no new intent; the Spanish one is covered by the mirror corpus. Not counted
  as separate templates.
- **The four `campus.*` templates** are the only ones not traceable to a single button. The
  district-scope buttons (35-39, 62-67, 87, 96) presuppose knowing which colleges, terms and
  subjects the assistant can actually see, and `campus.data_coverage` asks the provenance
  question the P0 evidence contract requires. They are all backed by real inventory families
  (`S1.discovery`, `S2.subjects`, `S2.coverage`, `S2.colleges_config`, `S3.metadata`).

## Placeholder fields and their provenance

`{campus}` is the college code, supplied by `build_corpus.CAMPUSES`. Everything else comes from
`campus_values.json`, generated once from the pinned `campus_config.py` and committed:

- `{campus_name}`, `{campus_short_name}`, `{campus_nickname}` — `CampusConfig.name / .short_name / .nickname`.
- `{q11_subject}`, `{q13_course}`, `{q16_certificate}`, `{q17_program}`, `{q19_certificate}`,
  `{q20_program}`, `{q27_help_desk}`, `{q54_degree}`, `{q55_certificate}`, `{q56_program}`,
  `{q59_program}`, `{seq1_program}`, `{seq2_program}`, `{seq3_program}` — the 14 `SampleQuestions`
  fields, copied unchanged.

All 17 keys are present for all nine colleges, so no template can leave a hole. Values are
identical in both languages: course codes and program names are source identifiers.
(`{q20_program}`, `{q55_certificate}` and `{q59_program}` are carried in the values file for
completeness but are not referenced by any template — their buttons deduped into templates that
use `{q17_program}`, `{q16_certificate}` and `{q56_program}`.)

## Label distribution (English, 468 cases / 52 templates)

| intent family | cases | templates |
| --- | --- | --- |
| schedule | 126 | 14 |
| catalog | 90 | 10 |
| out_of_scope | 81 | 9 |
| transfer | 45 | 5 |
| campus | 36 | 4 |
| pathway | 27 | 3 |
| sequence | 27 | 3 |
| resource | 18 | 2 |
| workforce | 18 | 2 |

Critical claim types: `seat` 117, `units` 72, `requisite` 63, `agreement` 54, `wage` 18,
`deadline` 0. `deadline` is deliberately unused — nothing in the P0 inventory carries a
registration deadline, so no template may expect a deadline claim to be supportable.

30 distinct inventory ids are referenced; all 30 exist in `connectors/data_families.yaml`
(checked programmatically against the 80 ids in that file). Every non-`out_of_scope` case has a
non-empty `expected_source_families`; every `out_of_scope` case has an empty one.

**Seat rule.** Verified with both the test's exact predicate and a stricter one (any `seat` or
`open` substring in any family, in both languages): zero violations. Every section-listing
schedule template carries `seat`, because "this class is available" is a seat-count claim.

**Out-of-scope as the refusal set.** The P0 inventory has no campus-website, student-record or
financial-aid family, so parking, transcripts, EOPS/DSPS/CalWORKs, admissions, cost, tutoring and
password resets are labeled `out_of_scope` with no sources. That is the honest label and it gives
P1 a 81-case set where the correct behavior is to say "I can't source that" and refer.

## Builder output

```
$ backend/.venv/bin/python -m evals.build_corpus
en 468
es 468
```

Re-running the builder after the commit produced a clean `git diff` — generation is deterministic.

## Tests and results

TDD evidence:

- **RED** — wrote `backend/tests/test_evals.py` first, before any `evals/` file existed:
  ```
  tests/test_evals.py:4: in <module>
      from evals.schema import EvalCase
  E   ModuleNotFoundError: No module named 'evals'
  ERROR tests/test_evals.py — Interrupted: 1 error during collection
  ```
  Exactly the failure the brief predicts.
- **GREEN** — after implementing the package, templates and corpora:
  ```
  $ cd backend && .venv/bin/python -m pytest tests/test_evals.py -q --no-cov
  ....                                                    [100%]   (4 passed)
  ```

Full suite:

```
$ cd backend && .venv/bin/python -m pytest
287 passed in 3.01s
Required test coverage of 70% reached. Total coverage: 95.88%
```

No warnings, no skips. 283 tests before this task + 4 new = 287.

The four tests assert real behavior, not shape: nine distinct campuses and >=100 cases with the
six required families present and sources non-empty off the refusal set; Spanish template-id set
exactly equal to English with every case `lang == "es"` and gated; the seat rule over every
English case; and the harness scoring both a fully-supported stub (rate 1.0, no unsupported
claims) and a store that resolves nothing (rate 0.0).

## Files changed

```
backend/tests/test_evals.py           |  39 +
evals/README.md                       | 126 +
evals/__init__.py                     |   0
evals/baseline/README.md              |  36 +
evals/build_corpus.py                 |  61 +
evals/harness.py                      |  71 +
evals/questions/en/laccd_public.jsonl | 468 +
evals/questions/es/laccd_public.jsonl | 468 +
evals/schema.py                       |  36 +
evals/templates/campus_values.json    | 173 +
evals/templates/laccd_public.en.json  | 811 +
evals/templates/laccd_public.es.json  | 811 +
12 files changed, 3100 insertions(+)
```

## Self-review

- **Completeness** — all seven brief files plus `evals/__init__.py`; both corpora built and
  committed; 52 templates x 9 colleges = 468 cases per language, well past the >=12 templates /
  >=100 cases floor.
- **Labeling consistency** — all 30 referenced inventory ids exist; seat rule clean under the
  strict check in both languages; no non-`out_of_scope` case with empty sources; no
  `out_of_scope` case with sources; 936 unique case ids, no duplicates.
- **Spanish quality** — neutral Latin American Spanish, second person `tú`, no regionalisms
  (`cupo`, `estacionamiento`, `preparatoria`, `certificados de calificaciones`). The ES file was
  generated from the EN file with only `text` swapped, so `intent_family`, `required_slots`,
  `expected_source_families` and `critical_claim_types` are identical by construction.
  Placeholder parity was asserted per template during authoring (sorted placeholder sets equal);
  zero unresolved braces in either corpus. All 468 Spanish cases are `review_status: "pending"`.
- **Safety** — scanned both corpora for emails, phone-number patterns, 9-digit ids, credential
  literals and person names: zero hits. Button 12's "Professor Smith" was dropped in favour of an
  instructor-role question. No `PRINTING_PRESS_*` var set; no chatbot execution; no network call.
- **Discipline** — no files beyond the brief's list plus the ruled-in `__init__.py`. The one
  deviation from the brief's verbatim code is the `mkdir(parents=True, exist_ok=True)` in
  `build`, needed because git does not track empty directories.
- **Sibling repo** — read via `git show` only; afterwards still on `main` with a clean tree.

## Concerns

1. **The Spanish corpus is implementer-authored, not reviewer-approved.** All 468 cases are
   `pending`, which is the gate working as designed, but P1 must not quote a Spanish number as a
   measured result until a bilingual reviewer promotes the templates.
2. **Per-template Spanish promotion needs a small builder change.** The brief's builder stamps
   `review_status` from `lang` alone, so flipping one template to `reviewed` also means teaching
   `build()` to read a per-template value. I kept the builder verbatim and documented the extra
   step in `evals/README.md` rather than deviating.
3. **No baseline exists.** P0 ran none, live or offline, as instructed. The corpus can detect a
   regression between two P1 runs but cannot yet say whether P1 beats the sibling chatbot.
4. **`deadline` has no coverage**, because no P0 source carries one. If a registration-deadline
   source lands in P1, the corpus needs new templates to exercise that claim type.

## Fix report (round 1)

Commit: `6ed095d fix(evals): add instructor-input and mixed-scope templates, tidy slots and harness guard`
(single commit on `main`, not pushed; trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`).

### Two new templates

`schedule.instructor` (course -> instructor: "Who teaches MATH 261 at {campus} this
spring?") only covered button 11/12's course-named half. Button 12
("What courses does Professor Smith teach?") is the reverse direction —
instructor-as-input — and was dropped in the initial cut. Restored as
`schedule.by_instructor`, keeping the role generic and deriving the course
reference from the `{q13_course}` placeholder (the per-campus course
placeholder already used elsewhere in the `schedule.*` family) rather than
naming anyone:

- EN: `"Which other sections does the instructor of {q13_course} at {campus} teach this spring?"`
- ES: `"¿Qué otras secciones enseña la persona que imparte {q13_course} en {campus} esta primavera?"`
  (gender-neutral "la persona que imparte" avoids gendering the instructor)
- `intent_family: "schedule"`, `required_slots: [campus, course, term, instructor]`,
  `expected_source_families: [S1.section_search, S1.section_detail]` (copied from
  `schedule.instructor`), `critical_claim_types: []` (no seat/open language).

The parking-plus-classes compound button ("How much is parking and what classes
are available?") tests partial answering — one in-scope half, one out-of-scope
half — and was also dropped. Restored as `schedule.mixed_scope_compound`:

- EN: `"How much is parking at {campus} and what classes are available this spring?"`
- ES: `"¿Cuánto cuesta el estacionamiento en {campus} y qué clases hay disponibles esta primavera?"`
  (`estacionamiento` matches the term already used in `oos.campus_logistics`)
- `intent_family: "schedule"`, `required_slots: [campus, term]`,
  `expected_source_families: [S1.discovery, S1.section_search]`,
  `critical_claim_types: []` (the text says "available", not "seat"/"open", so the
  seat rule does not require a claim; kept empty and consistent within this template),
  `reviewer_note: "Compound question: the parking half is out-of-scope (no
  campus-facilities source in the P0 inventory) and must be refused; only the
  class-availability half may be answered from S1."`

`build_corpus.py` previously dropped `reviewer_note` on the floor (the brief's
verbatim `build()` never read it from the template), so the note would not have
reached any generated case. Added `reviewer_note=t.get("reviewer_note")` to the
`EvalCase` construction — the only change to the builder's behavior.

Both templates were inserted into `laccd_public.en.json` and `laccd_public.es.json`
at the matching position (`schedule.by_instructor` right after `schedule.instructor`;
`schedule.mixed_scope_compound` at the end of the `schedule.*` block), so template
order and the id set stay identical between languages.

### Slot tidy-up

`campus.terms_available`, `campus.subjects_offered` and `campus.data_coverage` had
`required_slots` listing output values (`term`, `subject`, `catalog_year`) alongside
`campus`. Trimmed all three to `["campus"]` in both language files — `required_slots`
is what must be resolved before a source can be queried, and these templates take no
input beyond the campus.

### Harness guard

`evals/harness.py::run` called `evidence_lookup(claim.get("evidence_id", ""))`
unconditionally, so a claim with no evidence id would still hit the lookup with an
empty string. Changed to:

```python
eid = claim.get("evidence_id")
if eid and evidence_lookup(eid):
    crit_ok += 1
else:
    unsupported.append(f"{c.id}:{claim.get('type')}")
```

so a missing/empty id is counted unsupported without calling the lookup at all.

### README

Added a "Forward-labeled families" paragraph under **Labels** stating that
`resource.*`, `workforce.*` and `campus.district_colleges` name
`expected_source_families` (`S6.*`/`S7.*`/`S8.*` for textbooks, `S9.*`/`S11.*` for
labor-market data, `S2.colleges_config` for the district roster) that are
`status: proposed` in `connectors/data_families.yaml`, targeted at P2/P3 — so a P1
scorecard should expect those cases to score unsupported until those sources land.
Also updated the template/case counts (52 -> 54 templates, 468 -> 486 cases per
language) and noted the two restored templates in the "Where the questions come
from" section.

### Builder counts

```
$ backend/.venv/bin/python -m evals.build_corpus
en 486
es 486
```

54 templates x 9 colleges = 486, matching the expected count. Ran a second time and
diffed the output file hashes against the first run — byte-identical, confirming the
builder is still deterministic:

```
$ md5sum evals/questions/en/laccd_public.jsonl evals/questions/es/laccd_public.jsonl > /tmp/before.md5
$ backend/.venv/bin/python -m evals.build_corpus
en 486
es 486
$ md5sum -c /tmp/before.md5
evals/questions/en/laccd_public.jsonl: OK
evals/questions/es/laccd_public.jsonl: OK
```

### Template parity check

Ran a script comparing the EN and ES template files: same 54 `template_id`s in the
same order, and identical `{placeholder}` sets per template (using
`re.findall(r"\{(\w+)\}", text)`), plus identical `intent_family`,
`required_slots`, `expected_source_families` and `critical_claim_types` per id.
Zero mismatches.

### Tests

```
$ cd backend && .venv/bin/python -m pytest tests/test_evals.py -q --no-cov
....                                                                     [100%]
```

4 passed — same tests as the original implementation (verbatim from the brief),
now also covering the two new templates (they flow through the generic
`test_english_corpus_covers_nine_campuses_and_all_families`,
`test_spanish_corpus_mirrors_english_ids_and_is_gated` and
`test_seat_questions_mark_seat_as_critical` assertions; neither new template's
question contains "seat"/"open", so the seat rule is satisfied by an empty
`critical_claim_types` for both).

```
$ cd backend && .venv/bin/python -m pytest
287 passed in 3.06s
Required test coverage of 70% reached. Total coverage: 95.88%
```

287 passed (unchanged from before this fix round — no new test files were added,
per the brief's fix scope), no warnings, no skips.

### Files changed

```
evals/README.md                       | 27 ++++++++++---
evals/build_corpus.py                 |  1 +
evals/harness.py                      |  3 +-
evals/questions/en/laccd_public.jsonl | 72 ++++++++++++++++++++++-------------
evals/questions/es/laccd_public.jsonl | 72 ++++++++++++++++++++++-------------
evals/templates/laccd_public.en.json  | 41 ++++++++++++++++----
evals/templates/laccd_public.es.json  | 41 ++++++++++++++++----
7 files changed, 182 insertions(+), 75 deletions(-)
```

### Concerns carried forward

The four concerns from the original report still stand unchanged (Spanish corpus
still implementer-authored and `pending`; per-template promotion still needs a
builder change beyond the `reviewer_note` passthrough added here; no baseline;
`deadline` still uncovered). No new concerns from this round — the sibling
`laccd_chatbot` repo was not touched, and no personal names or emails were
introduced.
