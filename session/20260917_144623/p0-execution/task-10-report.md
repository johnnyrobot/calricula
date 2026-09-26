# Task 10 report: Data-family inventory with dispositions

## What was implemented

- `connectors/data_families.yaml` — 80 `DataFamily` entries, one per data
  family drawn from `docs/applicationx/SOURCE-INVENTORY.md` §3–§6 in the
  sibling `calricula` repo (read-only reference; nothing there was modified).
  Covers all eleven named sources S1–S11: the four core P1 CLIs (S1
  class-search, S2 eLumen courses/programs, S3 ProgramMapper, S4 ASSIST),
  the broader P3 CLIs (S5 Canvas, S6 OpenStax, S7 LibreTexts, S8 Pressbooks),
  and the P2 cross-app/research sources (S9 Calricula LMI/curriculum, S10
  Calipar, S11 Benchmark research).
- `backend/app/connectors/inventory.py` — `DataFamily` pydantic model and
  `load_inventory()` loader, written exactly as specified in the task
  brief (verbatim).
- `backend/tests/test_inventory.py` — the four tests specified in the
  brief, written first and verified RED before the implementation existed.

## Per-source entry counts (80 total)

| Source | Count |
| --- | --- |
| S1 | 11 |
| S2 | 11 |
| S3 | 11 |
| S4 | 9 |
| S5 | 6 |
| S6 | 5 |
| S7 | 4 |
| S8 | 5 |
| S9 | 8 |
| S10 | 4 |
| S11 | 6 |

## Counts by status

| Status | Count |
| --- | --- |
| proposed | 48 |
| implemented_tested | 25 |
| unsupported | 4 |
| excluded_remote_mutation | 3 |

`unsupported` families: `S3.export`, `S4.learn_loop`, `S5.account_admin`,
`S11.buildstack`.
`excluded_remote_mutation` families: `S1.import`, `S2.import`, `S3.import`
(each `remote_write` — the three CLI groups that expose an `import`
command writing upstream).

## Mapping of the 25 registry operations to family ids

| Operation | Family id |
| --- | --- |
| schedule.discover | S1.discovery |
| schedule.search | S1.section_search |
| schedule.section | S1.section_detail |
| schedule.compare | S1.cross_college |
| schedule.changes | S1.changes |
| schedule.conflicts | S1.conflicts |
| catalog.search | S2.course_search |
| catalog.get | S2.course_detail |
| catalog.prerequisites | S2.prerequisites |
| catalog.programs | S2.programs |
| catalog.compare | S2.compare |
| catalog.coverage | S2.coverage |
| pathways.search | S3.metadata |
| pathways.get | S3.programs |
| pathways.plan | S3.plan |
| pathways.compare | S3.compare |
| pathways.diff | S3.diff_years |
| pathways.reverse_lookup | S3.course_programs |
| pathways.bottlenecks | S3.bottlenecks |
| pathways.transfer_options | S3.transfer_options |
| articulation.resolve | S4.institutions |
| articulation.list | S4.agreement_lists |
| articulation.get | S4.agreement_records |
| articulation.diff | S4.agreement_diffs |
| articulation.transferability | S4.transferability |

Every one of the 25 `REGISTRY` operations is used by exactly one
`implemented_tested` family (verified programmatically — no duplicates, no
missing, no extras). No `implemented_tested` family references an
operation outside `REGISTRY` (impossible given the loader's typing, but
also confirmed by the test).

`pathways.bottlenecks` (`S3.bottlenecks`) carries a reason noting the CLI
`bottlenecks` command takes no college parameter, per the CLI limitation
flagged in context.

`S1.related_sections` and `S1.ccn` stay `proposed` with the exact reasons
given in the task context (schedule API `relsections` via
`schedule_components`, P1 adapter; and the uncommitted
`ccn-alternate-detection.json` local patch, respectively).
`S1.sync_completeness` cites the `mirror_scope` validator from Task 9.

## Tests and results

TDD evidence:
- **RED**: `cd backend && .venv/bin/python -m pytest tests/test_inventory.py -q --no-cov`
  before `inventory.py` existed → `ModuleNotFoundError: No module named
  'app.connectors.inventory'` (collection error, 1 error).
- **GREEN**: same command after writing `inventory.py` and
  `connectors/data_families.yaml` → `....` (4 passed).

Full suite: `cd backend && .venv/bin/python -m pytest` →
**267 passed** (263 pre-existing + 4 new), no warnings.

Coverage summary (from the same run):
```
TOTAL                                          589     27    95%
Required test coverage of 70% reached. Total coverage: 95.42%
```
`app/connectors/inventory.py` itself is at 100% coverage (17/17 statements).

## Files changed

- `connectors/data_families.yaml` (new)
- `backend/app/connectors/inventory.py` (new)
- `backend/tests/test_inventory.py` (new)

Commit: `abbde60` on `main` (not pushed) — `feat(connectors): classify
every inventory data family with phase and status`, with the
`Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` trailer.

## Self-review

- **Completeness**: every table row / bulleted data family in
  SOURCE-INVENTORY.md §3–§6 has a corresponding YAML entry; all eleven
  sources S1–S11 are represented (test 1 asserts the exact source set);
  all 25 registry operations are linked from exactly one
  `implemented_tested` family (test 4, plus a manual dedup check).
- **Quality**: reasons are short, factual restatements of what the source
  document and prior task decisions already say — no invented CLI
  capabilities. Required ids/values from the brief and context are
  present verbatim: `S1.import` → `excluded_remote_mutation`,
  `S5.account_admin` → `disposition: unsupported`, `S11.buildstack` →
  `status: unsupported`.
- **Discipline**: only the three specified files were created; nothing in
  the sibling `calricula` repo was touched; no personal email or other
  secret appears anywhere in the new files (checked with `grep`).
- **Testing**: the test file matches the brief's four tests verbatim (no
  weakening); RED was captured before GREEN; the full suite passes clean
  at 267 tests with coverage far above the 70% floor and no warnings.

## Concerns

- Entry count (80) sits at the very top of the brief's expected 60–80
  range. This came from choosing a moderate granularity for the
  non-tabular prose sections (S5–S11, which have paragraphs rather than
  literal markdown tables). No test constrains the exact count, and every
  entry traces to a specific phrase in the source document, so I judged
  this an acceptable, non-inflated breakdown rather than a padding
  concern — but it's worth a second look if the reviewer wants tighter
  grouping (e.g., merging S9's LMI sub-families) instead.
- S9–S11 were assigned `phase: P2` by inference — the source document
  does not explicitly phase-tag these three sources the way it does for
  S1–S5 (P1/P3). This is a reasonable placement (cross-app/research work,
  after the P1 core CLIs and independent of the P3 Canvas/OER phase) but
  is my own judgment call, not a value taken directly from the inventory
  document; flagging it in case the P0 plan has a different phase
  assignment in mind for these three sources.
