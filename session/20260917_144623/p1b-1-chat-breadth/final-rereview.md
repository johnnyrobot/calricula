# Final re-review — fix wave `06087f8..af256f4` on `p1b-1/chat-breadth`

Read-only; no subagents; suites and gate not re-run (implementer: 626 passed / 96.38 %; controller: gate exit 0, 0.975).
Inputs: `final-review.md`, `final-fix-report.md`, the packaged diff (three chunks), targeted reads in
`/Users/laccd/code/applicationx` (`slots.py`, `intents.py`, `validate.py`, `api/chat.py`, `pipeline.py:120-160`,
`connectors/operations/assist.py`, `fixtures/synthetic/assist/articulation.resolve/{success,empty}.json`,
`packages/workspace-ui/src/components/ClarificationChips.tsx`, `evals/run_fake.py`, `evals/scorecards/fake-en.json`,
Calricula `programs/[id]/collaboration/page.tsx`), and executable probes of `_to_number`, `_MONEY`, `_PERCENT`,
`check`, `detect_campuses`, `classify_intent` against the head venv.

Working tree clean at `af256f4`; all five commits carry the Fable trailer; no personal email or secret in the diff.

## Per-finding verdicts

| # | Verdict | Notes |
| --- | --- | --- |
| C1 | **Fixed as ruled, with a new concern (N1)** | `_transfer_slots` falls to `str(datetime.now(timezone.utc).year)`; `year is None` only on ≥2 years and the chips are `detect_years(text)`. Tests cover empty defaults + two-year text. The *calendar* year is the wrong default for January–June — see N1. |
| C2 | **Fixed** | Bare `este/oeste/valle/puerto` gone; probes: `¿Qué clases hay este semestre?`, `en el este`, `el este de la ciudad`, `Harbor este otoño` → no ELAC; `Colegio del Este`, `este de los ángeles`, `Este de Los Angeles College`, `East LA`, `Colegio del Valle` → correct code. Phrased forms still detect real questions. |
| I1 | **Fixed, with a new hijack (N2)** | `learn`/`learning`/`earn credit` → catalog; `student jobs on campus`/`hiring on campus`/`counseling office hiring` → campus. The new `"how much do "` phrase routes every cost question to `workforce`. |
| I2 | **Fixed** | `transfer center`, `centro de transferencia`, `financial aid agreement` → campus; `does math 261 transfer to UCLA` → transfer. |
| I3 | **Fixed** | `_to_number`: `1,000`→1000, `1.000`→1000, `62.10`→62.1, `62,10`→62.1, `129.170,50`→129170.5, `129,170.50`→129170.5, `1.234.567`→1234567, `3,14159`→3.14159 — exactly the ruling. Regex ends on a digit, so `$129,170.` and `30 percent.` are clean; `percentile`/`percentage points` not matched (correct); `USD 5`, `1.5k dollars`, `2,000-dollar` unmatched (safe direction, pre-existing gap). |
| I4 | **Fixed as specified, over-captures (N3)** | Every listed subject is now checked (Nursing/Physics/Historia withheld). But the capture runs to sentence end, so trailing words become part of the last subject and correct drafts are withheld — see N3. |
| I6 | **Fixed; no stale-hint breakage** | Only chips send hints and every chip value is canonical: campus = `list(CAMPUSES)` codes, institution = `list(INSTITUTIONS)` canonical names, year = `detect_years` (`20\d{2}`); the term clarification has `choices=[]` so no client ever sends `term`. `conv.scope` is written from `ans.resolved_scope` (`runs.py:89`) and is *not* re-validated, so an older conversation cannot 400. `term` in scope is always `detect_term`'s encoded `2YYS` form (`slots.py:72`). Calricula's `context_id` is `${id}:${updated_at}` (~40 chars) < 128. 400 (not 422) per the ruling. |
| I7 / M7 | **Fixed** | Range `a103c11..737e67b` + "exit commit on top"; "4096-character"; 96.38 %; the 36/45 clarification breakdown is stated. |
| I5 | **Fixed** | README paragraph is accurate (peer address, per-process, `--forwarded-allow-ips=<proxy>` only, wildcard warning, multi-worker). `.env.example` not touched — acceptable; the ruling asked for the README. |
| Ledger minors | **Fixed** | Ordering test pins `clarification is None` on an unsupported intent; `P1A-EXIT.md:137` decided line; `run_fake.py` cites `8bd7632`; unused `pytest` import gone. |
| Ratchet / scorecard | **Unchanged** | `DEFAULT_MIN_ROUTE_MATCH = 0.95`; `evals/scorecards/` has no diff in the range; committed `route_match_rate` 0.975, by-family `catalog 0.9`, others 1.0 — matches the controller's head run. |

## New findings

### N1 (Important) — the C1 default is the calendar year; ASSIST's year is the academic year's *fall* year
`fixtures/synthetic/assist/articulation.resolve/success.json` returns `academic_year: {code: "2025", name: "2025-2026"}`
for `--year 2025`, i.e. the year code names the academic year that *starts* in that calendar year. Today (September 2026)
calendar year = 2026 = the 2026-2027 year already under way, so the default is correct now and the suite/gate cannot see
the problem. From January to roughly June 2027, `datetime.now().year` = 2027 selects 2027-2028, which ASSIST does not
publish until summer: `resolve` returns `results: {}` (the `empty` fixture shape), `follow_up` bails on the missing
`institution_id`, no `year_mismatch`/`unconfigured` fires, and the user gets an evidence-less answer about the current
year's agreements for roughly half of every year. The controller's "September → next year" framing is the reverse of
the actual risk: September is the safe month.
*Fix (3 lines):* default to the current academic year's fall year — `now.year if now.month >= 7 else now.year - 1`
(ASSIST publishes the new year in early summer; July is a defensible cutover, August also fine) — in `_transfer_slots`,
and make the new slot test freeze `datetime` for a January and a September date rather than compare to `now().year`.
Optionally add `ASSIST_DEFAULT_YEAR` to `Settings` as the deployer override.

### N2 (Important) — `"how much do "` routes every cost question to `workforce`
`intents.py` workforce row. The trailing space was checked only against "How much does it cost…" (corpus). Probes:
`How much do classes cost at LAVC?`, `How much do textbooks cost?`, `How much do parking permits cost?`,
`How much do I pay for parking?`, `How much do I owe?`, `how much do i need to pay to apply` → **workforce** (each then
runs `lmi.lookup` on a scrubbed junk query or returns `unconfigured`). Pre-fix these fell to `campus`/`catalog`/`resource`
(`parking`, `apply`, `textbook`, `units` are later rows; `units` still wins for "How much do units cost?"). This is a new
off-corpus hijack of the same kind as I1 and is more common than the wage phrasing it was added for; the gate is
unchanged because no corpus case has the phrase.
*Fix:* replace `"how much do "` with the wage-shaped phrases (`how much do … make/earn` is not expressible in the table,
so use `make in`, `make a year`, `make per`, `earn a year`, `earn per`, or simply drop it — `typically earn`, `jobs pay`,
`salary`, `wage`, `cuánto gana` already cover the corpus at 1.0). Add the six probes above as negatives in
`test_workforce_phrases_do_not_hijack_learn_or_campus_jobs`.

### N3 (Important) — I4's subject capture over-runs into trailing words and withholds correct drafts
`_AGREEMENT_SUBJECT` now captures up to sentence punctuation or an `in/for/de <year>` clause, so any other trailing
clause is glued to the last subject. With `Mathematics` + `Biology` in evidence:
```
'There are agreements for Mathematics and Biology at UCLA.'             -> withheld: "Biology at UCLA"
'Agreements for Mathematics and Biology with UCLA exist for 2025-2026.' -> withheld: "Biology with UCLA exist"
'Agreements for Mathematics and Biology are listed below'               -> withheld: "Biology are listed below"
'agreements for Mathematics, and Biology'                               -> withheld: "and Biology" (Oxford comma)
```
`unsupported_claim_withheld` replaces the whole draft, so a real model's most natural transfer sentence ("agreements for
X and Y at/with <institution>") is now withheld even when every subject is evidence-backed. Safe direction — no
fabrication passes — but it turns the 9 full-route transfer cases into mostly-withheld answers as soon as the model
writes a preposition. (The pre-fix regex stopped at the first conjunction, so this is new.)
*Fix:* extend the lookahead with `\s+(?:at|with|between|are|is|exist|were|con|entre|están|son|existen)\b` and make the
split tolerate an Oxford comma: `\s*,\s*(?:(?:and|y|e|or|o)\s+)?|\s+(?:and|y|e|or|o)\s+`. Add the first and fourth
probes above as must-be-clean tests in `test_transfer_validate_checks_every_subject_in_a_list`.

### Minor
- **N4.** `HostContextIn.context_id` (`api/host_contexts.py:36`) has no `max_length`, so a host can register a 200-char
  `context_id` that `/chat/messages` then rejects with 422. Cap both at 128 or neither.
- **N5.** `test_transfer_without_any_year_defaults_to_the_current_calendar_year` compares to `now().year` at test time —
  it pins the mechanism, not the rule; freeze the clock (see N1).
- **N6.** `employment` is still a bare word in the workforce row: "employment office hours", "student employment office
  at Pierce" → workforce (pre-existing, not introduced here; note for the P1b-2 word-boundary table).

## Overall

**Merge-ready after N1–N3 (each ≤ 10 lines + tests); N4–N6 can ride with them or go to P1b-2.**
Every ruled finding landed as ruled, the ratchet is untouched and the committed scorecard equals the head run. The three
new items are all side-effects of the fixes rather than misses: the C1 default is right for only half the calendar
(correct today, wrong from January), the I1 replacement phrase captures cost questions, and the I4 list capture withholds
correct drafts. None is a grounding hole (each fails safe), but N1 and N3 make the transfer route — the feature C1 was
meant to unblock — give empty or withheld answers in common real-world conditions the suite and the corpus gate cannot
observe.
