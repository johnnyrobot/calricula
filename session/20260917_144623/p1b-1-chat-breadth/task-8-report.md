# Task 8 report — exit checklist and docs

Repo: `/Users/laccd/code/applicationx`, branch `p1b-1/chat-breadth`, commit `06087f8`.

## What was implemented

1. **`docs/P1B-1-EXIT.md`** (new) — P1b-1 exit checklist:
   - TECHNICAL-SPEC §12 traceability table mapping each row (transfer/pathways,
     grounded-chat citation/outage, AX-09 wages, nine campuses, unconfigured
     states, public-chat policy, intent routing) to its test file(s), per the
     brief's mapping.
   - Full-suite result and coverage figure.
   - CI gate command and the three headline numbers with what each means:
     `route_match_rate` 0.975 (gated, ratchet 0.95; `catalog` 0.9 due to
     `catalog.adt_transfer_degree` ambiguity with `transfer` phrasing,
     documented rather than papered over), `oos_refusal_rate` 0.0 (reported,
     not gated — corpus-coverage fact), `critical_claim_support_rate` 0.302
     (reported, not gated — honest claim-type coverage after `c60d363`).
   - Explicit "What P1b-1 does not cover" list: sequence intent (P1b-2),
     schedule completeness (P1b-2), research claims — deferred to P2 by owner
     decision 2026-09-19 (P2), corpus growth (P1b-3), worker/outbox/purge
     scheduling (P1b-3), the ES scorecard (P1b-3).
2. **`README.md`** — intro sentence now names transfer/ASSIST/workforce
   alongside curriculum/schedule/pathway; Status section adds P1b-1 as
   implemented, links `docs/P1B-1-EXIT.md`, and the roadmap-plan bullet notes
   which P1b roadmap tasks this checkout covers. The public-chat settings
   table and `CALRICULA_API_ORIGIN` row were already correct from Task 5/6 —
   verified, not changed.
3. **`connectors/data_families.yaml`** — added a two-line comment above the
   `S11. Benchmark research` section noting `research.lookup` is deferred to
   P2 by the 2026-09-19 owner decision and that P1b-1 ships only the
   `S9.edd_lmi` half of AX-09. `S9.edd_lmi` was already `implemented_tested`
   from Task 5 — verified, not changed. Comment-only edit; `test_inventory.py`
   passes unchanged (ran it standalone first to confirm before the full
   suite).

## Verification

- `cd backend && python -m pytest -q`: all tests pass, coverage 96.35%
  (floor 70%).
- From repo root: `CONNECTOR_REPLAY=true CALRICULA_API_ORIGIN=https://calricula.invalid
  PYTHONPATH=backend python -m evals.run_fake --lang en --check` → exit 0,
  `route_match_rate: 0.975`, `oos_refusal_rate: 0.0`; scorecard's
  `critical_claim_support_rate: 0.30246913580246915` (unchanged from the
  facts given). Running the gate regenerated `evals/scorecards/fake-en.json`'s
  `generated_at` timestamp only; reverted that incidental diff (`git checkout
  -- evals/scorecards/fake-en.json`) before committing so the commit is docs
  + YAML-comment only, as the brief's file list specifies.

## Deviations

None from the brief's file list or content instructions. `docs/applicationx/`
in the Calricula repo was not touched.

## Self-review

- Read `connectors/data_families.yaml` and `backend/tests/test_inventory.py`
  first, as instructed, before editing the YAML — confirmed the inventory
  test only checks `disposition`/`status`/`operation` fields and set
  membership, so a comment-only addition is safe.
- Checked all four commits' worth of test files exist and confirmed each
  brief-listed mapping row against the actual test names (`grep -n "def
  test"` on `test_chat_pathway.py`, `test_campuses.py`,
  `test_public_chat_policy.py`) rather than guessing.
- Verified the three headline numbers by actually running the gate twice
  (once for facts, once as final pre-commit verification) rather than taking
  the brief's numbers on faith.
- No personal email, no secrets, no touches to `docs/applicationx/` in
  Calricula, no dispatched subagents.

## Concerns

None.
