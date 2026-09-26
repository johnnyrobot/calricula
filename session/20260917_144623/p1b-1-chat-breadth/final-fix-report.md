# Final-review fix wave — report (branch `p1b-1/chat-breadth`)

Repo `/Users/laccd/code/applicationx`, base `06087f8`, head `af256f4`. Five commits, each with the
`Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` trailer as its own final paragraph. No subagents,
no reset/stash/checkout. Working tree clean at head.

| Commit | Scope |
| --- | --- |
| `e01c79f` | chat routing/slots: C1, C2, I1, I2, ledger test (unsupported-before-clarification) |
| `00d4933` | validation: I3, I4 |
| `e846329` | API: I6 |
| `737e67b` | ledger minors: M6, M8, P1A-EXIT:137 |
| `af256f4` | docs: I7 + M7, I5 |

## Per finding

### C1 — default transfer year, year chips never empty (`backend/app/chat/slots.py`)
Change: `_transfer_slots` falls back to `str(datetime.now(timezone.utc).year)` after text → prior → defaults,
so `runs.py`'s `defaults=ResolvedScope()` no longer dead-ends. `year` is `None` only when the text names ≥2
distinct years; the clarification's `choices` are exactly `detect_years(text)` (never empty). Docstring updated.
Tests (`tests/test_slots_p1b.py`): `test_transfer_without_any_year_defaults_to_the_current_calendar_year`
(empty defaults → no clarification, `scope.year == <this year>`), `test_two_years_in_text_ask_which_year_with_empty_defaults`
(→ slot `year`, choices `["2024","2025"]`). The existing `test_transfer_with_institution_and_default_year_does_not_ask`
still passes unchanged (a supplied default still wins over the calendar year) — no test needed adjusting after all.

### C2 — bare Spanish nouns removed from CAMPUSES (`slots.py`)
Change: removed `este`, `oeste`, `valle`, `puerto`; added phrased forms `colegio del este`, `este de los ángeles`
(+ unaccented), `colegio del puerto`, `colegio del valle`, `colegio del oeste`; `east la`/`west la`/`misión`/`mision` kept.
Tests: `test_bare_spanish_common_words_are_not_campuses` ("¿Qué clases hay este semestre?", "¿Hay cupos en MATH 261 este
otoño?", "el valle y el puerto", "en el oeste de la ciudad" → `[]`); the alias table test now uses
"clases en el colegio del este" → ELAC, "east la" → ELAC, "colegio del valle" → LAVC, "colegio del puerto" → LAHC.

### I1 — workforce row phrases only (`backend/app/chat/intents.py`)
Change: row is `salary, wage, job outlook, employment, career options, typically earn, "how much do ", jobs pay, salario,
empleo, opciones de carrera, suelen ganar, cuánto gana, cuanto gana`. `how much do ` keeps a trailing space so the
out-of-scope corpus case "How much does it cost to attend LACC…" is not turned into a wage question (checked against the
corpus before choosing this). Tests: `test_workforce_phrases_do_not_hijack_learn_or_campus_jobs` — "What will I learn in
MATH 261?" → catalog; "Which companies are hiring on campus?" → campus (table default; the text has "campus"); "Are there
student jobs on campus?" → campus; "Is there a learning center at LAMC?" → catalog (table default: no college/campus word;
documented inline — the point is it is not workforce); positive cases for typically earn / how much do / jobs pay / cuánto gana.

### I2 — transfer-center override row (`intents.py`)
Change: `("campus", ["transfer center", "centro de transferencia", "financial aid agreement", "aid agreement"])` inserted
before the transfer row. Tests: `test_transfer_center_is_a_campus_service_not_a_transfer_question` — "transfer center hours",
"Where is the transfer center?", "centro de transferencia", "financial aid agreement" → campus; "does math 261 transfer to UCLA" → transfer.

### I3 — money/percent claims without $/% and Spanish formats (`backend/app/chat/validate.py`)
Change: `_MONEY` matches prefix `$` or suffix `$ | dollars | dólares | dolares | usd`; `_PERCENT` matches
`% | percent | por ciento`; new `_to_number` normalises separators exactly as ruled (both present → last is decimal;
single separator + exactly 3 trailing digits → thousands; otherwise decimal; `1.234.567` → thousands).
Tests (`tests/test_chat_workforce.py`): kept — `$129,170`, `129,170 dollars`, `129.170 $`, `62,10 $`, `129170 dólares`,
`9.1%`, `9.1 percent`, `9,1 por ciento`, `9,1 %`; withheld — `99,000 dollars`, `99.000 $`, `61,50 $`, `130000 dólares`,
`1,234.56 dollars`, `1.234,56 $`, `30 percent`, `30 por ciento`, `9,5 por ciento`. (`import pytest` added to that file.)

### I4 — every listed agreement subject checked (`validate.py`)
Change: `_AGREEMENT_SUBJECT` captures the whole list up to sentence punctuation or a trailing "in/en/for/para <year>"
clause (one word may sit between noun and preposition: "agreements exist for"); `_SUBJECT_SPLIT` splits on `,`, ` and `,
` y `, ` e `; each part is checked. Test (`tests/test_chat_transfer.py::test_transfer_validate_checks_every_subject_in_a_list`):
"agreements for Mathematics and Nursing" with Mathematics+Biology in evidence → Nursing withheld, Mathematics not;
"Agreements exist for Mathematics, Nursing and Physics." → Nursing and Physics withheld; Spanish "y … e Historia" → only
Historia withheld; the original good draft ("Mathematics and Biology") stays clean.

### I6 — scope_hint validation + length caps (`backend/app/api/chat.py`)
Change: `_HINT_VALID` — `campus ∈ CAMPUSES`, `term ~ ^\d{4}$`, `institution ∈ INSTITUTIONS`, `year ~ ^20\d{2}$`;
unknown keys still dropped; an invalid known value → `400 {"detail": "invalid_scope_hint"}`. `MessageIn.context_id`
`max_length=128`; hint values `Annotated[str, Field(max_length=80)]` (422 at parse). Tests (`tests/test_chat_api.py`):
valid values accepted (202) incl. a multi-key hint; ten invalid values → 400 `invalid_scope_hint` (Hogwarts, lowercase
lapc, "fall 2026", 5-digit term, Stanford, lowercase ucla, 1999, "26", "2026-2027", 80×L); unknown key with an 80-char value
still 202; 81-char hint value (known or unknown key) → 422; `context_id` 129 → 422, 128 → 202.

### I7 + M7 — `docs/P1B-1-EXIT.md`
Range now `a103c11..737e67b` "plus this exit-checklist commit on top" (a doc cannot cite its own hash); "4096-character";
coverage 96.38 %; the `route_match_rate` bullet now states that a clarification counts as a match and that of the 45 transfer
cases 36 end in an institution clarification and 9 run the full resolve → resolve → list route (8 complete, 1 partial).
That breakdown was recomputed on this head with the eval answerer's inputs (Counter: clar:institution 36, complete 8, partial 1).

### I5 — `README.md`
One paragraph after the question-cap line: limits key on the peer address, limiter is in-memory per process, behind a
proxy set `--forwarded-allow-ips=<proxy>` / `FORWARDED_ALLOW_IPS` naming the proxy only (wildcard = caller-chosen key),
multi-worker multiplies the cap. No code change.

### Ledger minors
- `tests/test_chat_pipeline.py::test_unsupported_intent_is_refused_before_any_campus_clarification` (sequence question with
  empty prior → `unsupported_in_release`, `clarification is None`).
- `docs/P1A-EXIT.md:137`: "— decided 2026-09-19: off by default (see README, public chat settings)".
- M6 `evals/run_fake.py`: comment cites commit `8bd7632`.
- M8 `tests/test_public_chat_policy.py`: unused `import pytest` removed.

## TDD evidence (trimmed)

RED, chunk 1 — `pytest tests/test_slots_p1b.py tests/test_intents.py tests/test_chat_pipeline.py -q --no-cov`:
16 failed (4 × bare Spanish words, 1 × default year, 7 × workforce hijack, 4 × transfer center); the ordering pin passed
already (it is a pin). GREEN after the change; one expectation corrected ("learning center at LAMC" is catalog by table
default, documented).

RED, chunk 2 — `pytest tests/test_chat_workforce.py tests/test_chat_transfer.py -q --no-cov`: 11 failed (9 withheld-phrasings,
"9,1 %", subject list). GREEN after; one probe of mine ("1 dollar short of $129,170") was dropped because "1 dollar" is
itself a money claim and is correctly withheld.

RED, chunk 3 — `pytest tests/test_chat_api.py -q --no-cov`: 11 failed (10 × 400 cases, parse-time cap). GREEN after; two
expectations moved to the 422 test because `max_length` fires before the value check.

## Suite and gate

`cd backend && python -m pytest -q` → 626 passed, 0 failed; **coverage 96.38 %** (floor 70 %).

`CONNECTOR_REPLAY=true CALRICULA_API_ORIGIN=https://calricula.invalid PYTHONPATH=backend backend/.venv/bin/python -m evals.run_fake --lang en --check`
→ exit 0 (run after chunk 1 and again on the final head). `route_match_rate` **0.975 unchanged**; per family
campus 1.0, catalog 0.9, pathway 1.0, schedule 1.0, transfer 1.0, workforce 1.0; routes/clarifications/oos_refusal_rate
identical to the committed `evals/scorecards/fake-en.json` (diff of every key except `generated_at` is empty), so the
scorecard was not regenerated. Ratchet untouched at 0.95.

## Deviations / self-review notes
- I1: `"how much do "` carries a trailing space (see above) — otherwise the OOS corpus case "How much does it cost…" would route workforce.
- C1: no existing test needed adjusting (the brief anticipated one).
- I7/M7 range: the doc names the range up to the commit before it and says the exit commit sits on top.
- `_to_number` treats a single-separator value with >2 groups (`1.234.567`) as thousands; a trailing 3-digit group after a
  single separator is always thousands (`62,100` → 62100), per the ruling — a wage stated to three decimals is not a real case.

---

# Addendum — re-review side-effects N1–N3 (commit `66571c3`)

### N1 — academic-year default (`slots.py`)
`_today()` (UTC now) + `_default_agreement_year()`: `now.year if now.month >= 7 else now.year - 1`; used as the last
fallback in `_transfer_slots`. Test `test_transfer_without_any_year_defaults_to_the_current_academic_year` freezes
`slots._today` via monkeypatch: 2026-03-15 → "2025", 2026-09-15 → "2026", 2026-07-01 → "2026", 2026-06-30 → "2025".

### N2 — `"how much do "` removed (`intents.py`)
Workforce row now: salary, wage, job outlook, employment, career options, typically earn, ` earn?`, ` earn per`,
` earn a year`, ` earn annually`, make per year, jobs pay, + Spanish (salario, empleo, opciones de carrera, suelen ganar,
cuánto gana). The earn phrases are space-led so "learn" never matches and "Can I earn credit for prior learning?" stays
catalog. Tests added: "How much do welders earn?" → workforce; "How much do radiology techs earn per year…" → workforce;
"How much do classes cost at LAVC?" → catalog (table default; not workforce); "How much do textbooks cost?" → resource;
"How much do parking permits cost on campus?" → campus. ("average salary"/"median wage" are already covered by
`salary`/`wage`, so no duplicate terms.)

### N3 — subject capture stops at clause words (`validate.py`)
Lookahead now ends the capture at `[.;:!?\n]` or word-bounded `at|with|for|are|is|exist|in|con|entre|para|en|de`;
`_SUBJECT_SPLIT` is `\s*,\s*(?:(?:and|y|e)\s+)?|\s+(?:and|y|e)\s+` (Oxford comma). Tests added to
`test_transfer_validate_checks_every_subject_in_a_list`: "agreements for Mathematics and Biology at UCLA." (both in
evidence) → `reasons == []`; "Agreements with UCLA exist for 2025-2026." → no subject claim; "Mathematics, Biology, and
Nursing" → exactly `agreement subject Nursing not in evidence`.

### Evidence
RED: `pytest tests/test_slots_p1b.py tests/test_intents.py tests/test_chat_transfer.py tests/test_chat_pipeline.py -q --no-cov`
→ 8 failed (4 frozen-clock cases, 3 cost questions, subject list). GREEN after: the four files + workforce + evals_pipeline
→ `172 passed`. Full suite: all pass, coverage 96.39 %. Gate: exit 0, `route_match_rate` 0.975, per-family unchanged
(campus 1.0, catalog 0.9, pathway 1.0, schedule 1.0, transfer 1.0, workforce 1.0), scorecard identical except
`generated_at` → not regenerated; ratchet untouched. Tree clean at `66571c3`.
