### Task 8: Exit checklist and docs

**Files:**
- Create: `docs/P1B-1-EXIT.md`
- Modify: `README.md` (settings; "what the chat can answer" list gains pathways/transfer/workforce), `connectors/data_families.yaml` (verify S9 status from Task 5; `S11.research` note "deferred to P2 (owner decision 2026-09-19)")

- [ ] **Step 1: Write `docs/P1B-1-EXIT.md`** mapping: TECHNICAL-SPEC §12 "Transfer/pathways" → `test_chat_pathway.py`, `test_chat_transfer.py`; "Grounded-chat" (citation support, outage fallback) → `test_evals_pipeline.py` + `evals/scorecards/fake-en.json`; AX-09 wages → `test_chat_workforce.py`, `test_lmi_connector.py`; nine campuses EN/ES → `test_slots_p1b.py`; unconfigured states → `test_campuses.py`, `test_chat_pathway.py::test_unconfigured_campus…`; public-chat policy → `test_public_chat_policy.py`; full suite + coverage figure; explicitly list what P1b-1 does **not** cover (sequence intent, schedule completeness, research claims, corpus growth, worker, ES scorecard) with the plan that does.
- [ ] **Step 2: Run** `cd backend && python -m pytest -q` (coverage ≥ 70 %) and, from the repo root, `CONNECTOR_REPLAY=true CALRICULA_API_ORIGIN=https://calricula.invalid PYTHONPATH=backend python -m evals.run_fake --lang en --check`.
- [ ] **Step 3: Commit** — `docs: P1b-1 exit checklist; settings for public chat and the Calricula LMI origin`

## Requirement traceability

| Requirement | Tasks |
| --- | --- |
| AX-06 pathway route with typed `pathway` cards | 3 |
| AX-07 transfer route via ASSIST, `agreement` cards, institution/year clarification | 1, 4 |
| AX-09 workforce claims with release/geography/denominator/limits (LMI half; research deferred to P2) | 5 |
| Nine campuses selectable EN/ES; explicit unconfigured states | 1, 2, 3 |
| Roadmap task 8 public-chat policy (off by default; 20/min, 200/day per IP; 4 KB) | 6 |
| Roadmap task 7 (CI half): harness over the real pipeline, scorecard in `evals/` | 7 |
| §12 Grounded-chat: outage fallback, citation support | 3, 4, 5, 7 |
