# Final review — `p1b-1/chat-breadth` (a103c11..06087f8, 18 commits)

Reviewer: senior code review (architecture, security, grounded-AI safety). Read-only; no tree, index or branch mutated. Suites were not re-run (task reports carry the evidence: 96.35 %, gate exit 0). I ran the eval gate once (`--out /tmp/final-gate.json`): exit 0, `route_match_rate` 0.975, and the output is byte-identical to the committed `evals/scorecards/fake-en.json` apart from `generated_at`.

Passes, in order: (1) plan + ledger + all eight task reports; (2) the packaged diff in six chunks; (3) targeted reads in the applicationx tree (`runs.py`, `registry.py` `execute`/`clean_params`, `subprocess_broker._check_args`, `deps.py`, `host_contexts.py`, `Dockerfile`, TS `chat.ts`/`ClarificationChips.tsx`, ASSIST/ProgramMapper fixtures); (4) executable probes of `validate.check`, `classify_intent`, `detect_campuses`/`resolve_slots` and a per-family breakdown of the eval run; (5) this write-up.

All commits carry `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; author is the GitHub noreply identity; no personal email or secret appears in the diff. Working tree clean at 06087f8.

---

## Strengths

- **The `_plan` 3-tuple / late-warnings seam is sound.** `pre` is the plan branch's own list; `run_pipeline` copies it, remembers `len(pre)`, and re-reads the tail after the queue drains (`pipeline.py:196-235`). Object identity is the contract and it is commented at both ends. The early-return path (`not steps and pre`) is safe with `runs.py`: `emit("answer")` is a no-op there and the answer is persisted from the return value, so clarification/unsupported/unconfigured returns all reach `record("answer")` + `done`.
- **Grounding boundary holds where it was designed to.** `Grounding.evidence` strips `card` before the gateway sees anything (`pipeline.py:237`), every new evidence branch goes through `evidence_from`, cards are built only from `evidence.values()`, and the FakeGateway's own summaries round-trip the validators (`_money` prints `62.1`/`129,170`, the plan summary prints `4 terms, 60–62 units`, the resolve summary's `2025-2026` passes the exact-adjacent-year rule). `unsupported_claim_withheld` semantics are unchanged: any reason replaces the draft with `_WITHHELD_TEXT` + kept summaries.
- **LMI connector is a clean typed exchange.** Origin is deployer config only; the query is `quote_plus`-encoded into a fixed path; `follow_redirects=False` and a 10 s timeout; no auth/cookie headers (asserted in tests); failure `safe_message`s are constants so no body text leaks; non-dict body is `schema_change`; replay path is refused in production by the existing `Settings` validator. `clean_params` runs before the `IN_PROCESS` dispatch, so the `[\w .,&/-]{2,80}` pattern and the not-flag-like check apply to `lmi.lookup` too.
- **Subprocess argv stays safe.** Pathway `query` (`[\w .&-]{1,80}`) and ASSIST `name` (`[\w .,'&-]{2,80}`) are both positional; `_not_flag_like` refuses a leading `-` and the broker's `_check_args` refuses short flags, so a question of `--help biology` becomes a typed `invalid_parameters` warning, not a flag.
- **Transfer guards are the right shape.** Role by call order (deterministic FIFO), both resolves must agree on `academic_year_id`, receiving == sending is refused, and both are late warnings that mark the answer partial and skip the list. Tests cover each branch.
- **Removed 401 verified.** `get_principal` is used only by `/chat/*` (now `public_chat_gate`, 403) and `/host-contexts/resolve` (which returns `access_required` for non-users itself). No widening.
- **The Task 7 rulings produced an honest gate.** `route_match_rate` is deterministic (jsonl order, replay fixtures, no DB, no network, no model; `campus.search` without a session is a typed `unavailable` that still routes `campus`), the ratchet is documented as raise-only, and the 0.302 claim-coverage number is explained correctly (226 claim types that the replayed operations' `fields` never carry). The scorecard matches head.
- **Docs are accurate in substance.** `P1B-1-EXIT.md` maps every §12 row and AX item to a real test, lists what is not covered with the owning plan, and the README settings table is correct.

---

## Issues

### Critical

**C1. Transfer route dead-ends in production: no default agreement year, and the year clarification has no chips.**
`backend/app/chat/runs.py:81` passes `defaults=ResolvedScope()`; `slots.py:127` then asks `Clarification(slot="year", choices=[])` for every transfer question that does not spell out a year. `ClarificationChips.tsx` renders one chip per choice, so the user sees the prompt and nothing to click; typing `2025` alone classifies as `catalog` (`intents.py` default) and the institution is lost. Reproduced against the pipeline with production-shaped inputs:
```
'does math 261 transfer to UCLA?' -> transfer, slot='year' choices=[]
'does math 261 transfer?' + explicit institution -> transfer, slot='year' choices=[]
'2025' (prior institution set)     -> catalog, no clarification
```
Every test and the eval answerer inject `defaults=ResolvedScope(year="2025")`, which is why the suite and `transfer 1.0` never see this. AX-07 is not usable as shipped.
*Fix:* in `runs.py` (or `Settings`) supply a default year — `str(date.today().year)` or an `ASSIST_DEFAULT_YEAR` setting — and, when the text names no year, offer `choices=[current, current-1]` so the chip path works. Add a pipeline test that uses `defaults=ResolvedScope()` as `runs.py` does.

**C2. Spanish campus alias `"este"` ("this") silently adopts ELAC or forces a switch prompt on ordinary Spanish questions.**
`backend/app/chat/slots.py:9` — `_matches` is whole-word, and `este` is one of the most common Spanish words. Reproduced:
```
'¿Hay cupos en MATH 261 este otoño?'  prior LAMC -> Clarification "Switch to ELAC or keep LAMC?"
'¿Qué clases hay este semestre?'      no prior    -> resolved_scope campus=ELAC (silent, wrong)
```
The second case is a grounding failure: the schedule of the wrong college is returned as a confident answer. The ES corpus happens to use `esta primavera` (feminine), so the eval and slot tests never hit it. `valle`/`puerto`/`oeste` at `slots.py:10,15,16` are ordinary nouns too (`el valle`, `el puerto`); the plan mandated all four, so this is a plan defect and needs a ruling.
*Fix:* drop `este`; keep the others only as phrases (`colegio del este`, `el este de los ángeles`, `del valle`, `del puerto`, `del oeste`) or require the `college|colegio|universidad` word nearby. Add a negative test for `este otoño`/`este semestre`.

### Important

**I1. Intent table: bare `earn` is a substring match and hijacks "learn"/"learning" into `workforce`.**
`backend/app/chat/intents.py:24`. `classify_intent` does `term in t` on a space-padded string, so `earn` matches `learn`, `learning`, `earned`. Probes: `What will I learn in MATH 261?` → workforce; `Is there a learning center?` → workforce; `Can I earn credit for prior learning?` → workforce; `How do I earn an associate degree in nursing?` → workforce. Each then runs `lmi.lookup` with a scrubbed junk query (or returns `unconfigured`). Also `jobs`/`hiring`: `Are there student jobs on campus?`, `Is the counseling office hiring?` → workforce (should be campus).
*Fix:* use boundary-padded terms as the row already does for `" uc "`: `" earn"`, `" earned"`, `" jobs "`, and drop bare `hiring` or make it `" is hiring"`. Add the probes above to `test_intents.py` as negative cases.

**I2. Intent table: bare `transfer`/`agreement` capture campus questions.**
`intents.py:10`. `Where is the transfer center?`, `What are the transfer center hours?` → `transfer`, which then asks "Which college or university do you want to transfer to?"; `Is there a financial aid agreement I must sign?` → transfer. Before this branch these fell to `campus` (`hours`, `office`). The bare keyword was plan-mandated for `does math 261 transfer?`; the cost is campus-service questions.
*Fix:* add a small override row before `transfer` (`transfer center`, `centro de transferencia` → `campus`) or check the campus-service terms (`hours`, `office`, `center`) before the transfer row. Add negative tests.

**I3. Workforce validator misses dollar and percent claims stated without `$`/`%` — including every Spanish number format.**
`backend/app/chat/validate.py:49-50,125-131`. `_MONEY` requires a leading `$`; `_PERCENT` requires `%`. Probes with evidence `annual_median=129170, hourly_median=62.1, percent_change=9.1`:
```
'Median pay is 129,170 dollars a year.'                     -> []  (unchecked)
'La mediana es 129.170 $ al año, 62,10 $ por hora.'          -> []  (unchecked; suffix $, ES separators)
'It grows 9.1 percent (about 30 por ciento).'                -> []  (unchecked; the fabricated 30 passes)
'Employment is 95,000 with 40,000 new jobs by 2040.'         -> []  (employment/numeric_change/period never checked)
```
The Global Constraint says dollar amounts and percentages are evidence-backed or withheld; for a bilingual product the Spanish forms are not an edge case. The Task 5 deferral covered `9.1 percent`/`130k` only; the Spanish gap was not flagged. (Safe-direction cases are fine: `$129.170` and `$62,10` are withheld.)
*Fix (small):* `_MONEY` → `(?:\$\s?(\d[\d.,]*)|(\d[\d.,]*)\s?(?:\$|dollars?|dólares|usd))`, normalise `129.170`/`62,10` (a `.`+3 digits with no `,` is a thousands separator; a `,`+1–2 digits is a decimal); `_PERCENT` → `\s?(?:%|percent|por ciento|por\s+ciento)`; add `employment`, `emp_base`, `emp_proj`, `numeric_change` to a plain-count check keyed on `jobs|employment|empleos|positions`. Extend `test_workforce_validate_rules_directly` with the four probes.

**I4. Transfer subject validator only sees the first noun phrase after "agreement for"; conjunction lists and other phrasings pass unchecked.**
`validate.py:43-46,107-111`. Probes with evidence label `Mathematics`:
```
'There are agreements for Mathematics and Nursing in 2025.' -> ['Mathematics'] captured; Nursing unchecked
'Agreements exist for Mathematics, Nursing and Physics.'    -> nothing captured
'The Nursing agreement is in place for 2025.'               -> nothing captured
```
The existing test's good draft (`agreements for Mathematics and Biology`) passes for the wrong reason — `Biology` is never captured (it happens to be in the fixture). A real model lists subjects.
*Fix:* capture through to sentence punctuation and split the capture on `,|\band\b|\by\b|\bor\b|\bo\b|\be\b`, and add a second pattern `([A-Z][\wÀ-ÿ&]+(?:\s+[A-Z][\wÀ-ÿ&]+)*)\s+(?:agreement|convenio|acuerdo)`. Add the three probes as tests (first two must withhold `Nursing`/`Physics`).

**I5. Per-IP public limits key on `request.client.host`; behind any proxy the 200/day cap is shared by every visitor (or spoofable if forwarding is opened carelessly), and nothing documents it.**
`backend/app/core/ratelimit.py:21` uses `get_remote_address`; `backend/Dockerfile:13` starts uvicorn without `--forwarded-allow-ips` (uvicorn trusts `X-Forwarded-For` only from 127.0.0.1 by default). Deployed behind Calricula's edge or any load balancer, all public callers present the proxy's address → the first 200 questions per day exhaust the cap for the whole public. Set `FORWARDED_ALLOW_IPS=*` naively and the key becomes attacker-controlled. The README table (`README.md:88-92`) says "per-remote-address" without this caveat. The limiter is also in-memory per process (pre-existing), so multi-worker deployments multiply the cap.
*Fix (docs + one line):* README/`.env.example` note that the limits key on the connection's peer address, that deployers behind a proxy must set uvicorn's `--forwarded-allow-ips` to the proxy's address only, and that the limiter is per process. Optionally read `X-Forwarded-For` only when a `TRUSTED_PROXY_CIDRS` setting is set.

**I6. `scope_hint` values are unbounded and unvalidated; `institution` is a free string that reaches the ASSIST CLI.**
`backend/app/api/chat.py:30,67`. `scope_hint: dict[str, str]` has no length cap and the values are only key-filtered. A public caller can persist a multi-megabyte `institution`/`year`/`campus` string into `Conversation.scope` and `Message.scope_hint` on every message, and an arbitrary `institution` name (not one of `INSTITUTIONS`) is sent to `articulation.resolve`. The broker's regex + not-flag check hold, so this is hardening, not a hole — but the clarification chips only ever send canonical values, so there is no reason to accept others.
*Fix:* validate in `post_message`: `campus ∈ CAMPUSES`, `institution ∈ INSTITUTIONS`, `year` matches `\d{4}`, `term` matches `\d{4}`; 422 otherwise. Add `max_length` on the `MessageIn.question` field (`Field(min_length=1, max_length=MAX_QUESTION_CHARS)`) so a 100 MB body is rejected at parse time rather than after.

**I7. `transfer 1.0` in the exit checklist is 36/45 clarifications.**
Per-family breakdown of the gate run: transfer family = 36 `clar:institution` + 8 `complete` + 1 `partial`; the catalog shortfall (9 `adt_transfer_degree`) also lands in `clar:institution`; 9 `out_of_scope` cases do too. `README`/`run_fake.py` do say clarifications count as a match, but `P1B-1-EXIT.md:35-41` presents `transfer 1.0` next to `pathway 1.0`/`schedule 1.0` as if they measured the same thing. Only 9 corpus cases exercise resolve→resolve→list end to end. Combined with C1 the number is misleading.
*Fix:* emit `clarification_share_by_family` in the scorecard and state it in the exit doc ("transfer: 1.0 route match, 0.80 of which are institution clarifications; 9 cases run the full route").

### Minor

- **M1.** `pipeline.py:200` — the early-return text "This source is not configured for the selected campus." is also used for `query_too_short` (`pipeline.py:168`), where it is wrong. Use the warning's message as the answer text.
- **M2.** `pipeline.py:150` — `pid = str(data[0].get("programId"))` becomes `"None"` when the key is missing and passes the `[\w-]{1,64}` ID pattern, so `pathways.get`/`plan` are called with `program_id=None`. Guard `if not pid: return []`.
- **M3.** `slots.py` — `detect_institution` with two hits (`UC Berkeley or UCLA?`) returns `None` and the clarification lists all eleven institutions instead of the two found. Pass `found` as `choices` when `len(found) > 1`. Also `CSU Long Beach`/`Cal State LB` are not aliases.
- **M4.** `validate.py` pathway branch — word numbers (`four semesters`, `two years`, `cuatro semestres`) are unchecked; `_UNITS` on `60-62 units` sees only `62` (pre-existing, deferred). A small word→number map for 1–12 EN/ES would close the common case.
- **M5.** `validate.py` — workforce route does not check years (`by 2040` passes; period is `2022-2032`). Apply `_YEAR` against `period`'s two halves and `source_period`.
- **M6.** `evals/run_fake.py:48` — comment says "see task-7-report.md", which lives in Calricula's untracked `.superpowers/` ledger, not in this repo. Replace with the commit hash (`8bd7632`). (The README's pointer to `docs/applicationx/plans/` in the Calricula repo is pre-existing and currently dangling — that folder is untracked in Calricula.)
- **M7.** `docs/P1B-1-EXIT.md:4` range `a6013f3..c60d363` excludes the first and last branch commits; write `a103c11..06087f8`. `:24` "4096-byte" — it is a code-point cap (`len(str)`), say "4096-character".
- **M8.** `backend/tests/test_public_chat_policy.py:1` unused `import pytest` (ledger-deferred; trivial).
- **M9.** `connectors/lmi.py:49` — `resp.json()` on an unbounded body; a `Content-Length`/streamed-size cap (e.g. 2 MB) would match the broker's `CONNECTOR_MAX_STDOUT_BYTES` discipline. Also no scheme check on `CALRICULA_API_ORIGIN` (`http://` accepted).
- **M10.** `test_chat_transfer.py::test_transfer_agreement_subject_and_year_claims_are_checked` "good" draft passes because `Biology` is never captured (see I4); once I4 is fixed this test still passes (Biology is in the fixture) but add an explicit `and Nursing` negative next to it.
- **M11.** Eval breakdown: 44 `out_of_scope` cases route `catalog` and score `complete` with a replayed course card ("What tutoring services does LACC offer?"). Reported via `oos_refusal_rate` per the ruling, but `complete` on an off-topic hit is the worst-looking outcome for a grounded product; worth a `low_relevance` heuristic in P1b-3 (e.g. no question token in any evidence summary → `unknown`).
- **M12.** `transfer` plan's fallback warning (`pipeline.py:134`) says "articulation lookups are not configured for LAMC" when `scope.institution`/`scope.year` are missing; unreachable today (clarification fires first) but the message would be wrong if it ever fired. Split the two conditions.

---

## Deferred-minor triage

| Task | Deferred minor | Verdict |
| --- | --- | --- |
| T1 | Pin "unsupported before clarification" with a test | **Fix before merge** (5-line test; the ordering is load-bearing for the eval gate's `sequence` count). |
| T1 | "Cal" no longer resolves to Berkeley | Stays deferred — correct call; "cal" would collide with every "Cal State". |
| T3 | `_UNITS` captures only the number adjacent to "units" in a dash range | Stays deferred (pre-existing; the plan's `inside` range check absorbs the common case). See M4. |
| T3 | Query-sanitising line duplicated (catalog/pathway) | Stays deferred (plan-mandated; extract in P1b-2). |
| T5 | Extra money/percent phrasings (`9.1 percent`, `130k`) | **Escalated to I3 — fix before merge.** The Spanish forms were not in the deferral and are not an edge case. |
| T5 | `hourly_mean` listed but never emitted | Stays deferred (harmless: an accepted-values list with a never-present key). |
| T5 | Workforce still needs a campus | Stays deferred, but record it: `nurse salary` with no prior campus asks "Which LACCD campus?" though LMI ignores campus. Add `workforce` to a `CAMPUS_OPTIONAL_INTENTS` set in P1b-2. |
| T6 | Unused `pytest` import | Fix with the merge (trivial). |
| T6 | Per-IP test doesn't show a second address | Stays deferred; the slowapi keying is exercised by the existing bearer-vs-IP test. See I5 for the real per-IP concern. |
| T6 | `P1A-EXIT.md:137` still phrases `PUBLIC_CHAT_ENABLED` as an open decision | **Fix before merge** (one line: "decided 2026-09-19: off by default"). |

---

## Rulings review

| Ruling | Verdict |
| --- | --- |
| T4: require both resolves to agree on `academic_year_id`, else `year_mismatch` and skip the list | **Agree.** Correct and tested. Note the replay fixture returns LAMC/118 for both resolves, so in the eval every non-LAMC transfer case lists agreements between 118 and 118 — an artifact worth a comment in `pipeline_answerer.py`. |
| T4: year+1 only as an adjacent range with the first half in evidence | **Agree.** The exact-adjacent rule is right; `2024-2026` is withheld. |
| T4: `agreement(s)|convenio(s)|acuerdo(s)` | **Agree in direction**, but the resulting regex is still first-item-only (I4). |
| T4: same institution code on both resolves → `same_institution`, skip | **Agree.** |
| T5: fix Important + Minors 1,2,5,6,7; defer the rest | **Agree**, except the money/percent deferral which I escalate (I3). Replay bypassing the origin check is fine given `Settings` refuses replay in production. |
| T6: remove the pre-existing 401 in `principal.py` | **Agree.** Verified the two consumers; the host-context path already self-rejects. |
| T7: fix the ZTC routing, not the gate | **Agree.** Exactly what a gate is for. |
| T7: gate on `route_match_rate` with a raise-only ratchet at 0.95; report `oos_refusal_rate`; derive claim support from `fields` | **Agree** on all three. The ratchet is honest and stable (deterministic inputs, 12-case margin). Two caveats the ruling did not anticipate: the intent-table phrasing added to reach 0.975 introduced the substring hijacks in I1/I2 (the gate cannot see off-corpus questions), and "clarification counts as match" hides C1 (I7). |
| T7 round 2: emit an unsupported claim per expected type the evidence cannot support | **Agree.** 0.302 is the right number and the explanation (schedule seat via `schedule.search`, units only via `catalog.get`, agreements only with an institution) is correct. |
| Ledger deviation (T1): `SUPPORTED` check before clarification | **Agree.** Unsupported intents no longer ask for a campus; this is what makes the `sequence`/`resource` counts in the scorecard clean. Needs the deferred test. |
| Ledger deviation (T1): drop `"cal"` alias | **Agree.** |

---

## Recommendations

1. **Before merge (small, all under ~60 lines):** C1 (default year + year chips), C2 (drop `este`, phrase the other Spanish nouns), I1/I2 (boundary-padded `earn`/`jobs`, transfer-center override), I3 (money/percent regexes incl. Spanish), I4 (subject list split), I6 (hint validation + `max_length`), the two ledger minors marked fix-before-merge, M6/M7/M8. Re-run the suite and the gate; the ratchet should be unaffected (the changes are negatives, not corpus phrasing) — if `route_match_rate` moves, that is information, not a reason to lower 0.95.
2. **Docs with the merge:** I5 (proxy/`forwarded-allow-ips` + per-process limiter note in README and `.env.example`), I7 (`clarification_share_by_family` in the scorecard and the exit doc).
3. **Carry to P1b-2/3:** M3, M4, M5, M11, the workforce-without-campus deferral, a word-boundary matcher for the whole intent table (the `" uc "` convention is fragile; a compiled `\b` regex per term would prevent the next `earn`), and an off-corpus "hijack" test file of ~30 realistic campus/catalog questions that must *not* route to `workforce`/`transfer`/`pathway` — the gate measures recall on the corpus, this measures precision off it.
4. Make `PipelineAnswerer`'s defaults mirror `runs.py` (or make `runs.py` read a shared `DEFAULT_SCOPE`) so the eval can never again pass on a default the product does not have.

---

## Assessment

**Ready to merge? With fixes.**

The architecture is right and the hard parts — the follow-up/late-warning seam, the evidence-only grounding boundary, the typed LMI exchange, the argv safety, the honest gate — are done well and tested. But two defects make shipped behaviour wrong for real users while every test passes: the transfer route dead-ends for anyone who does not type a year (C1), and a common Spanish word silently selects East LA College (C2). Both are small fixes with obvious tests. The Important items are all cheap and mostly close gaps between what the Global Constraints promise (every dollar/percent/subject evidence-backed or withheld) and what the regexes actually catch, plus two intent-table substrings that the corpus gate could not see. Fix C1, C2, I1–I4, I6 and the three fix-before-merge minors, re-run the suite and the gate, and merge; I5/I7 can land as the docs commit that follows.
