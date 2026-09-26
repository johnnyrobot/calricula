# Task 7 report — core operation registry with synthetic fixtures and coverage tests

Commit: `6385665` on `main` (not pushed).

## What I implemented

| File | Role |
| --- | --- |
| `backend/app/connectors/registry.py` | `ParameterError`, `Operation`, `build_argv`, `REGISTRY`, `register`, `execute` |
| `backend/app/connectors/replay.py` | `FIXTURE_ROOT`, `load_outcome(connector_id, operation, state)` |
| `backend/app/connectors/operations/{class_search,courses,programmapper,assist}.py` | the 25 `register(...)` calls |
| `fixtures/synthetic/<connector_id>/<operation>/<state>.json` | 175 serialized `RunOutcome` subsets |
| `backend/tests/{test_registry.py,test_operation_fixtures.py}` | the brief's tests, verbatim |

The registry only maps names to argv and runs the pipeline: envelope parsing stays in
`envelopes.py`, spawning stays in `subprocess_broker.py`. Nothing outside the brief's
file list was created.

### Where the rulings were applied

**Ruling A (schema-change detection).** `Operation.required_keys: list[str] = []` and a
module-level `_schema_change(op, data)` predicate in `registry.py`. In `execute`, after
`normalize`, if the status is `ok`/`partial` and `data` is a **non-empty dict** missing any
declared key, the `Normalized` is `model_copy`-updated to
`status="unavailable"`, `data=None`, `truncated=False`, and a single
`ConnectorError(code="schema_change", retryable=False, safe_message="source output is missing expected fields")`.
`data` is then `None`, so the single `to_result` call already yields `expected=None`,
`retrieved=0`, `evidence_refs=[]` — one return path, no duplicated construction. `{}` is
skipped by the `bool(data)` guard, so an empty document stays the natural "nothing here"
answer for single-entity gets. Endpoint operations keep the brief's behaviour (a document
without `results` becomes `schema_change` inside `normalize`).

Every bespoke operation declares `required_keys` from the real top-level identity fields of
its Go view struct (table below), and its `schema_change` fixture renames exactly one of
them. Verified: all 25 `schema_change` fixtures produce error code `schema_change`
(15 via ruling A, 10 via `normalize`).

**Ruling B (bespoke `synced_at`).** `fixtures/synthetic/laccd_class_search/schedule.section/success.json`
carries `"observed_at": "2026-09-01T00:00:00Z"` at the top level of the section document
alongside the `detail` block (`available_seats`, `waitlist_total`), so
`provenance.observed_at` is populated. Endpoint success fixtures carry `meta.synced_at`
(eLumen/ProgramMapper/`agreements get`) or ASSIST's public-GET meta
(`{"source","endpoint","auth"}`, which has no timestamp — faithful to `runPublicGET`).

**Defensive lambdas.** `retrieved_from`/`expected_from`/`evidence` never raise on `empty`
or `partial` shapes: each module has a `_rows(data, key)` helper returning `[]` for
non-dicts and null values, `courses.py` has `_ids`, `assist.py` has `_reports`, and every
dict access uses `.get` behind an `isinstance` guard.

## The 25 operations

`evidence prefix` is the stable string each op's `evidence` lambda emits (`{}` = from
validated parameters, `«row»` = from the payload).

### laccd_class_search — all six bespoke (`printJSONFiltered`, no results/meta wrapper)

| Operation | Command | argv shape | Envelope | `required_keys` | `data_source` | Evidence prefix |
| --- | --- | --- | --- | --- | --- | --- |
| `schedule.discover` | `subjects` | `--college C --term T` | bespoke † | `code`, `name` (per row) | — | `laccd:subjects:{college}:{term}` |
| `schedule.search` | `search` | `--college C --term T --subject S [--catalog N]` | bespoke | `sections`, `count` | — | `laccd:section:{college}:{term}:«class_nbr»` |
| `schedule.section` | `section` | `<class-nbr> --college C --term T` | bespoke | `class_nbr`, `college`, `term` | — | `laccd:section:{college}:{term}:{class_nbr}` |
| `schedule.compare` | `compare-colleges` | `--subject S --catalog N --term T` | bespoke | `subject`, `catalog`, `term`, `colleges` | — | `laccd:compare:{subject}:{catalog}:{term}` |
| `schedule.changes` | `changed` | `--college C --term T --subject S [--since W]` | bespoke | `since`, `added_sections`, `dropped_sections`, `status_changes` | `local` | `laccd:changes:{college}:{term}:{subject}` |
| `schedule.conflicts` | `schedule build` | `<nbr> <nbr> …` (split on `,`) | bespoke | `class_nbrs`, `conflict_free`, `conflicts` | `local` | `laccd:section:«college»:«term»:«class_nbr»` |

`schedule.search`: `expected_from` reads `courses_total`, `retrieved_from` reads `count`
(per the brief). Others count their list field.

‡ `plan`, `compare` and `transfer-options` embed their own `"source"` field, which the bespoke
normalizer already reads, so they report `local` without a `data_source` override.

### laccd_courses

| Operation | Command | argv shape | Envelope | `required_keys` | `data_source` | Evidence prefix |
| --- | --- | --- | --- | --- | --- | --- |
| `catalog.search` | `courses search` | `--query Q [--tenant H] [--page P]` | endpoint | — | — | `elumen:course:«id»` |
| `catalog.get` | `courses get` | `<course_id>` | endpoint | — | — | `elumen:course:{course_id}` |
| `catalog.prerequisites` | `courses prereqs` | `<course_id>` | bespoke † | `course_id`, `code`, `count`, `requisites` | — | `elumen:course:{course_id}:prereqs` |
| `catalog.compare` | `courses compare` | `<subject> <number>` | bespoke | `subject`, `number`, `colleges_found`, `courses` | `local` | `elumen:compare:{subject}:{number}` |
| `catalog.programs` | `programs search` | `--query Q [--tenant H]` | endpoint | — | — | `elumen:program:«id»` |
| `catalog.coverage` | `coverage` | *(none)* | bespoke | `checked_api`, `per_college` | `local` | `elumen:coverage` |

### programmapper

| Operation | Command | argv shape | Envelope | `required_keys` | `data_source` | Evidence prefix |
| --- | --- | --- | --- | --- | --- | --- |
| `pathways.search` | `programs search` | `<site_content_id> --query Q` | endpoint | — | — | `programmapper:program:{site_content_id}:«programId»` |
| `pathways.get` | `programs get` | `<site_content_id> <program_id>` | endpoint | — | — | `programmapper:program:{site_content_id}:{program_id}` |
| `pathways.plan` | `plan` | `<programId> [--site-content S]` | bespoke | `program_id`, `program_map_id`, `terms` | — ‡ | `programmapper:plan:{program_id}` |
| `pathways.compare` | `compare` | `<programIdA> <programIdB> [--site-content S]` | bespoke | `a`, `b`, `shared_courses`, `shared_count` | — ‡ | `programmapper:compare:{program_id_a}:{program_id_b}` |
| `pathways.diff` | `diff-years` | `<programId> --from-year Y [--site-content S]` | bespoke | `program_id`, `prior_year`, `added`, `removed` | `local` | `programmapper:diff:{program_id}:{from_year}` |
| `pathways.reverse_lookup` | `course-programs` | `<courseIdOrCode>` | bespoke | `query`, `programs`, `scanned_maps` | `local` | `programmapper:course:{course_code}` |
| `pathways.bottlenecks` | `bottlenecks` | *(none)*, no parameters † | bespoke | `courses`, `scanned_maps` | `local` | `programmapper:bottlenecks` |
| `pathways.transfer_options` | `transfer-options` | `<programId> [--site-content S]` | bespoke | `program_id`, `transfer_designated`, `transfer_pathways` | — ‡ | `programmapper:transfer:{program_id}` |

### assist — all five endpoint

| Operation | Command | argv shape | Envelope | `required_keys` | `data_source` | Evidence prefix |
| --- | --- | --- | --- | --- | --- | --- |
| `articulation.resolve` | `resolve institution` | `<name> --year Y` | endpoint † | — | — | `assist:institution:«institution_id»` |
| `articulation.list` | `agreements list` | `<receiving> <sending> <year> --types T` (default `Department`) | endpoint | — | — | `assist:agreement:«key»` |
| `articulation.get` | `agreements get` | `--key K` | endpoint | — | — | `assist:agreement:{key}` |
| `articulation.diff` | `agreements diff` | `<from-key> <to-key>` † | endpoint † | — | — | `assist:agreement:{from_key}` + `{to_key}` |
| `articulation.transferability` | `transferability courses` | `<institutionId> <academicYearId> <listType>` | endpoint | — | — | `assist:transferability:{institution_id}:{year_id}:{list_type}` |

Every `command_path` above was asserted present in the committed manifest with
disposition `public_read`, and every flag emitted (including all optionals) was asserted to
appear in that command's manifest `flags` list.

## Divergences from the brief († above)

Each was resolved in favour of the pinned CLI, per the controller's "the CLI wins" rule.

| # | Brief said | Pinned CLI does | Source |
| --- | --- | --- | --- |
| 1 | `articulation.diff` argv `--from K --to K` | two positionals `<from-key> <to-key>`; the command has **no** flags | `assist-pp-cli agreements diff --help`; `internal/cli/agreements_diff.go:37` (`Use: "diff <from-key> <to-key>"`); manifest `flags: []` |
| 2 | `articulation.resolve` envelope `bespoke` | prints through `printJSONFilteredWithMeta` → `wrapAgentOutput` → `{"meta":…,"results":…}` under `--agent` | `internal/cli/resolve_institution.go:61`, `internal/cli/novel_output.go`, `internal/cli/helpers.go` (`wrapAgentOutput`) |
| 3 | `articulation.diff` envelope `bespoke` | same meta/results wrapper | `internal/cli/agreements_diff.go:84` |
| 4 | `schedule.discover` envelope `endpoint` | `subjects` prints a **bare JSON array** via `printJSONFiltered`; `printOutputWithFlags` never wraps | `internal/cli/subjects.go:64`, `internal/cli/helpers.go:555,693` |
| 5 | `catalog.prerequisites` envelope `endpoint` | `courses prereqs` prints the bare `prereqView` struct via `printJSONFiltered` | `internal/cli/courses_prereqs.go:119` |
| 6 | `pathways.bottlenecks` required `college` | `bottlenecks` takes **no** college positional or flag; it aggregates whichever college is mirrored locally | `programmapper-cli bottlenecks --help` (`Usage: bottlenecks [flags]`); `internal/cli/bottlenecks.go:39` |
| 7 | `schedule.changes` optional `since:^\d{4}-\d{2}-\d{2}` | `--since` takes a lookback **duration** (`24h`, `7d`, `1w`) | `laccd-class-search-pp-cli changed --help`; `internal/cli/changed.go` |
| 8 | `articulation.list` argv is exactly the three positionals | the command **requires** `--types` (Prefix\|Department\|Major\|GeneralEducation) or it exits with a usage error | `internal/cli/agreements_list.go:18-27` |
| 9 | `articulation.list` `retrieved_from`/`evidence` treat `results` as a list | ASSIST's `/api/agreements` body is an object; `unwrapSingleKeyArray` does not flatten it | `internal/cli/advisor_agreements_test.go:61` (`{"result":{"reports":[…]},"isSuccessful":true}`); `wrapAgentOutput` unwraps only `results/data/items/nodes/entries/records` |

How each was handled:

1, 2, 3, 4, 5 — the registry follows the CLI. (2) and (3) needed no lambda changes: under the
endpoint envelope `data` is the unwrapped `results`, which is still the same struct the brief's
lambdas index into (`institution_id`, `counts`). (4) and (5) became bespoke and gained
`required_keys`. For `schedule.discover` the healthy payload is a list, so ruling A's dict guard
never fires on good data; its `schema_change` fixture is the realistic break for a list endpoint
— the array reshaped into an object (`{"subjects":[…],"count":1}`) — which is a non-empty dict
missing `code`/`name` and therefore trips ruling A exactly as written.

6 — `college` is kept as a validated required parameter because it is the scope the caller is
claiming and it is what the evidence ref is keyed on, but it is **not** forwarded; `argv` is `[]`
with an explanatory comment. A deployer must mirror the intended college.

7 — the regex accepts both forms (`\d{4}-\d{2}-\d{2}|\d{1,4}[hdw]`), a superset of the brief's,
so callers written against the P0 table still validate while the CLI's real syntax works.

8 — `types` is registered as an **optional** parameter appended as `--types <v>`. With only the
three required parameters the argv is exactly `["1", "118", "75"]`, so the brief's positional-order
test holds unchanged; real callers must pass `types`.

9 — `articulation.list` uses a local `_reports(data)` helper that reads `result.reports`
defensively for both `retrieved_from` and `evidence`; on any other shape it returns `[]`.

**Unverifiable offline:** the exact upstream body of `/api/transferability/courses` could not be
observed (live network is out of scope, and the repo has no fixture for it). Its success fixture
models a plain array of course records (`courseIdentifierParentId`, `prefix`, `courseNumber`,
`courseTitle`, `maximumCredits`, `listType`, `areaCode`), which is the shape `runPublicGET` +
`wrapAgentOutput` would place under `results` for a list endpoint. If the first live call shows
ASSIST's `{"result":…,"isSuccessful":true}` wrapper here too, only this fixture changes; the
operation's lambdas are the defaults and are shape-agnostic.

## How the success fixtures were derived

All identifiers are invented but realistic, exactly as the brief lists (class numbers `17300`/
`17310`, course id `40830`, agreement key `75/118/to/1/Department/5080`, site content id `abc`).
No real student data, no credentials, no personal email addresses (scanned).

Field names were read from the Go structs at the pinned revisions via
`git -C ../cli-tools/<repo> show <rev>:<path>` (read-only; no sibling repo was modified):

| Fixture | Struct(s) | File |
| --- | --- | --- |
| `schedule.discover` | `laccd.Subject` (`code`, `name`, `ccn`) | `laccd-class-search-cli internal/laccd/laccd.go:91-93` |
| `schedule.search` | `searchResult` + `laccd.Section` | `internal/cli/search.go:21-28`, `internal/laccd/laccd.go:194-213` |
| `schedule.section` | `sectionView` (embedded `laccd.Section`) + `laccd.SectionDetail` | `internal/cli/section.go:22-25`, `internal/laccd/laccd.go:219-227` |
| `schedule.compare` | `compareResult`, `collegeAvailability`, `fetchFailure` | `internal/cli/compare_colleges.go:17-37` |
| `schedule.changes` | `changedResult`, `statusFlip` | `internal/cli/changed.go:16-27` |
| `schedule.conflicts` | `scheduleResult`, `scheduleConflict` | `internal/cli/schedule_build.go:15-27` |
| `catalog.search/get/programs` | eLumen record keys used by the compare/prereq decoders (`id`, `code`, `name`, `subject`, `number`, `tenant`, `status`, `fullCourseInfo`) | `laccd-courses-pp-cli internal/cli/courses_compare.go:155-185`, `internal/cli/laccd_outline.go:95-112` |
| `catalog.prerequisites` | `prereqView`, `requisiteEntry` | `internal/cli/courses_prereqs.go:20-26`, `internal/cli/laccd_outline.go:44-48` |
| `catalog.compare` | `compareView`, `compareEntry` | `internal/cli/courses_compare.go:20-39` |
| `catalog.coverage` | `coverageView`, `coverageRow` | `internal/cli/coverage.go:20-31` |
| `pathways.search/get` | `pmProgram`, `pmPathway` | `programmapper-cli internal/cli/pmstore.go:83-107` |
| `pathways.plan` | `planView`, `planTermView`, `planItemView` | `internal/cli/plan.go:21-49` |
| `pathways.compare` | `compareView`, `compareSide`, `compareCourse` | `internal/cli/compare.go:18-41` |
| `pathways.diff` | `diffYearsView`, `diffCourse` | `internal/cli/diff_years.go:33-49` |
| `pathways.reverse_lookup` | `courseProgramsView`, `courseProgramHit` | `internal/cli/course_programs.go:21-35` |
| `pathways.bottlenecks` | `bottlenecksView`, `bottleneckRow` | `internal/cli/bottlenecks.go:20-31` |
| `pathways.transfer_options` | `transferOptionsView`, `transferPathwayView`, `careerOutlookView`, `pmCareer` | `internal/cli/transfer_options.go:20-62` |
| `articulation.resolve` | the `result` map literal (`source`, `institution_id`, `academic_year_id`, `institution`, `academic_year`) | `assist-pp-cli internal/cli/resolve_institution.go:54-60` |
| `articulation.list` | ASSIST public agreement body (`result.reports[].key/label/type`) | `internal/cli/advisor_agreements_test.go:61-63` |
| `articulation.diff` | `agreementDiffResult`, `agreementDiffCounts`, `agreementDiffKeys`, `jsonValueDelta`, `jsonValueChange` | `internal/cli/agreements_diff.go:15-32`, `internal/cli/json_diff.go:15-26` |
| `articulation.get` | agreement composite-key payload keyed by `--key` | `internal/cli/agreements_get.go:14-45` |
| `articulation.transferability` | best-effort (see above) | `internal/cli/public_endpoints.go:116-133` |

State conventions, uniform across all 25 operations:

- `success` — exit 0, populated document, empty stderr.
- `empty` — exit 0, `[]` / `count: 0` / empty collections / `{}` for single-entity gets.
- `partial` — exit 0, reduced document, stderr `warning: results truncated at the page limit`
  (plus the struct's own `truncated: true` where it has that field, e.g. `schedule.search`).
- `schema_change` — exit 0, valid JSON without `results` (endpoint) or with one renamed identity
  field (bespoke).
- `outage` — exit 5, stderr `Error: dial tcp: connection refused`.
- `rate_limited` — exit 7, stderr `rate limited, waiting 5s`.
- `forbidden` — exit 4, stderr `Error: 403`.

Skeletons were produced by a throwaway script kept in `/tmp` — it is not `scripts/`-worthy and
the brief does not list it, so it is **not** committed.

## Tests and results

Both test files are the brief's content verbatim, including the inline `HAPPY` map and the unused
`_req` helper in `test_registry.py` (a later task moves `HAPPY`).

**RED** — `cd backend && .venv/bin/python -m pytest tests/test_registry.py tests/test_operation_fixtures.py -q --no-cov`:

```
tests/test_registry.py:3: in <module>
    from app.connectors.registry import REGISTRY, build_argv, ParameterError
E   ModuleNotFoundError: No module named 'app.connectors.registry'
...
!!!!!!!!!!!!!!!!!!! Interrupted: 2 errors during collection !!!!!!!!!!!!!!!!!!!!
```

**GREEN** — same command after implementing the registry, replay loader, four operation modules
and the 175 fixtures:

```
182 passed in 0.12s
```

That is 6 registry tests + 175 parametrized fixture cases (25 × 7) + 1 identity-field test, as the
brief predicted.

**Full suite** — `cd backend && .venv/bin/python -m pytest`:

```
218 passed in 2.54s
Required test coverage of 70% reached. Total coverage: 95.02%
```

No warnings in the summary. New-module coverage: `registry.py` 95%, `replay.py` 100%,
`operations/assist.py` 100%, `class_search.py` 100%, `courses.py` 94%, `programmapper.py` 100%.

Beyond the test suite I ran two ad-hoc audits (not committed):

- every operation × state, printing status / error codes / retrieved / expected / evidence count.
  All 25 `schema_change` fixtures produce error code `schema_change`; all `success` fixtures have
  `retrieved > 0` and at least one evidence ref; all `empty` fixtures have `retrieved == 0` and
  `expected is None`.
- every operation's argv with the happy parameters and again with every optional supplied,
  asserting the `command_path` exists in the committed manifest with disposition `public_read` and
  that every emitted `--flag` appears in that command's manifest `flags` list. Zero unknown flags.

## Files changed

184 files, 1662 insertions, in one commit (`6385665`):

- 9 new Python files (5 source + `operations/__init__.py` + 2 tests + `replay.py`) —
  precisely: `registry.py`, `replay.py`, `operations/__init__.py`, `operations/class_search.py`,
  `operations/courses.py`, `operations/programmapper.py`, `operations/assist.py`,
  `tests/test_registry.py`, `tests/test_operation_fixtures.py`.
- 175 fixture JSON files under `fixtures/synthetic/` (25 operations × 7 states).

Nothing else was touched: no existing file was modified, no sibling repo was mutated, no script
was added.

## Self-review

- **Completeness** — 25 operations across the four connectors, 175 fixtures, both test files.
  `len(REGISTRY) == 25` and the fixture matrix is asserted file-by-file by the test.
- **Quality** — argv shapes verified against `--help` at the pinned revisions *and* against the
  committed manifests' `flags` lists; positional orders taken from each command's `Use:` string.
  Evidence refs are stable (derived from validated parameters wherever possible, from payload
  identity fields otherwise) and never raise on empty/partial shapes. No blocked flag
  (`--db`, `--home`, `--config`, `--deliver`, `--data-source`, `--ics-file`, …) is ever emitted.
- **Discipline** — `registry.py` maps and executes only; parsing stayed in `envelopes.py`,
  spawning in `subprocess_broker.py`. No extra modules, no helper scripts committed, no
  refactors of Task 1–6 code.
- **Testing** — assertions are real (status per state, coverage numbers on `empty`, errors and
  null data on failures, exact evidence ref on `articulation.get`, exact argv ordering on
  `articulation.list`). Output is pristine: no warnings, no skips, no xfails.

## Concerns

1. **Four envelope/argv rows in the P0 table do not match the pinned CLIs** (divergences 1–5 and
   8 above). I followed the CLI because a wrong envelope would make every *live* call for those
   operations fail at `normalize`, which is worse than a table mismatch — but the controller may
   want the P0 table itself amended so the spec and the code agree.
2. **`pathways.bottlenecks` cannot honour its `college` parameter.** The validated value only
   scopes the evidence ref; which college is actually aggregated depends on the deployer's local
   mirror. If P0 needs real per-college bottleneck scoping, that is an upstream CLI change.
3. **`articulation.list` will fail live without `types`.** The parameter is optional in the
   registry so the brief's positional-order test stays true, but the CLI requires it. Either the
   test's expectation or a default category (`Department`) will need to change before live use.
4. **The `articulation.transferability` success fixture shape is a best-effort guess** — see
   "Unverifiable offline" above.
5. `build_argv`'s optional-parameter rejection branch (`registry.py:46-48`) is the only uncovered
   line range in the new code. The brief's test list does not include a case for it and I kept
   both test files verbatim; a one-line test would close it if the controller wants that.

---

# Fix report — review round 1

Commit: `4b21d97` on `main` (not pushed). 8 files changed, +75 / −18.
The reviewer verified all five CLI divergences from the first pass as correct; nothing there
was reverted. The 25-row tables above have been updated in place (new `data_source` column,
corrected evidence prefixes, corrected `articulation.list` and `pathways.bottlenecks` rows).

## 1. `build_argv` could emit flag-shaped values as positionals

**What changed.** `registry.py` gained `_not_flag_like(op, key, value)`, applied to every
required and optional value *after* the regex check and before it enters `clean`. Any value
starting with `-` raises `ParameterError(f"{op.name}: parameter {key!r} must not look like a
flag")`. This sits ahead of the broker's own `_check_args`, which only catches single-dash
arguments, so `--home`/`--deliver`/`--config` shaped values are now refused at the registry
boundary rather than being handed to the CLI as positionals.

**Covering tests** (`tests/test_registry.py`):
- `test_flag_shaped_parameter_values_are_rejected` — parametrized over
  `pathways.get` (flag-shaped `site_content_id`, then flag-shaped `program_id`),
  `pathways.plan` (flag-shaped `program_id`, then flag-shaped optional `site_content_id`) and
  `articulation.resolve` (flag-shaped `name`); each expects `ParameterError`. Five cases.
- `test_no_parameter_value_reaches_argv_as_a_flag` — parametrized over all 25 operations with
  their `HAPPY` parameters: asserts that no argv element beginning with `-` is one of the
  values passed in (builder-emitted literals such as `--college` are unaffected), and that no
  passed value is itself flag-shaped. `class_nbrs`-style comma lists are split so each
  component is checked. `HAPPY` is imported from `test_operation_fixtures` rather than
  duplicated, so the later task that relocates it only has one definition to move.

## 2. `articulation.list` could not succeed live without `--types`

`agreements_list.go:22-24` returns a usage error when `--types` is unset.

**What changed.** `operations/assist.py`: `types` stays optional with pattern
`[A-Za-z]{2,20}`, and `argv` now always appends the category —
`[receiving, sending, year, "--types", p.get("types", "Department")]`. `Department` is the
CLI's own documented example (`agreements list 7 110 74 --types Department`).

**Covering test.** `test_assist_list_positional_order_is_receiving_sending_year` amended per
the ruling to `argv[:3] == ["1", "118", "75"]` and `argv[3:] == ["--types", "Department"]`.
Verified separately that supplying `types="Major"` yields `[…, "--types", "Major"]`.

## 3. `pathways.bottlenecks` claimed a scope it discarded

**What changed.** `operations/programmapper.py`: the operation now declares `required={}`
(no parameters at all) and emits the unscoped evidence ref `["programmapper:bottlenecks"]`;
the comment explains that the command aggregates whichever college is mirrored locally.
`HAPPY["pathways.bottlenecks"]` is now `{}` in `tests/test_operation_fixtures.py`. The
fixtures were unchanged — the payload never carried a college.

## 4. Evidence-ref arity collisions

**What changed** in the two places called out:
- `schedule.conflicts` (`operations/class_search.py`) no longer emits the two-segment
  `laccd:section:«nbr»`. It now emits the same four-segment form the other section
  operations use, built from the payload:
  `laccd:section:{college}:{term}:{class_nbr}` for each row of `resolved` that carries all
  three fields (`{"college", "term", "class_nbr"} <= r.keys()`); rows missing any of them are
  skipped, so the `empty` and `partial` fixtures stay safe.
- `pathways.compare` (`operations/programmapper.py`) moved out of the
  `programmapper:program:` namespace — it emits a single
  `programmapper:compare:{program_id_a}:{program_id_b}` instead of two two-segment refs that
  collided with `pathways.get`'s three-segment `programmapper:program:{scid}:{pid}`.

Verified across all 25 success replays: `schedule.conflicts` now yields
`['laccd:section:LAMC:2268:17300', 'laccd:section:LAMC:2268:17310']` and `pathways.compare`
yields `['programmapper:compare:p1:p2']`.

## 5. `source_mode` claimed `live` for mirror-only commands

**What changed.** `Operation` gained `data_source: Literal["live", "local"] | None = None`.
In `execute`, immediately after `normalize` and before the schema-change branch:

```python
if op.data_source is not None:
    n = n.model_copy(update={"source_mode": op.data_source})
```

I checked all 25 operations against `// pp:data-source` in the Go source at the pinned
revisions. Seven now declare `data_source="local"`:

| Operation | Command | Go evidence |
| --- | --- | --- |
| `schedule.changes` | `changed` | `laccd-class-search-cli internal/cli/changed.go:3` — `pp:data-source local` |
| `schedule.conflicts` | `schedule build` | `internal/cli/schedule_build.go:3` — `pp:data-source local` |
| `catalog.compare` | `courses compare` | `laccd-courses-pp-cli internal/cli/courses_compare.go:3` and the command annotation at `:59` — `local` |
| `catalog.coverage` | `coverage` | `internal/cli/coverage.go:3,48` says `auto`, but the command counts rows in the local store and only probes live totals when `--data-source live` is passed, which this registry never does |
| `pathways.bottlenecks` | `bottlenecks` | `programmapper-cli internal/cli/bottlenecks.go:7` — `pp:data-source local`; `bottlenecks.go:53` rejects `--data-source live` outright |
| `pathways.reverse_lookup` | `course-programs` | `internal/cli/course_programs.go:8` — `pp:data-source local` |
| `pathways.diff` | `diff-years` | `internal/cli/diff_years.go:9` says `auto`; the current map is read from the mirror while only the prior-year map is fetched live, so the diff's base is mirror data |

Two of those seven (`catalog.coverage`, `pathways.diff`) are annotated `auto` upstream; I
followed the controller's explicit naming of both and recorded the nuance here rather than
silently widening or narrowing the list. `schedule.changes` was not in the named list but
carries the `local` annotation, so it was added per the "check each of the 25" instruction.

No override was needed for `pathways.plan`, `pathways.compare` and `pathways.transfer_options`
(all annotated `auto`): their view structs carry their own `"source"` field, which the bespoke
normalizer already reads, and their success replays already reported `local`. The remaining
operations are live-first (`subjects`, `search`, `section`, `compare-colleges`, `courses
prereqs`, every endpoint mirror, every assist read) and keep `data_source=None`.

**Covering test.** `test_mirror_only_operations_report_a_local_source_mode` in
`tests/test_operation_fixtures.py` asserts `catalog.coverage`'s success replay yields
`provenance.source_mode == "local"`.

## 6. List-valued bespoke payloads bypassed `required_keys`

**What changed.** `_schema_change` in `registry.py` now short-circuits when `required_keys`
is empty, and when `data` is a list it applies the check to the first element that is a dict:

```python
if isinstance(data, list):
    data = next((row for row in data if isinstance(row, dict)), None)
```

`[]` therefore stays "empty", not "schema change".

I re-checked every bespoke operation's Go view struct: **`schedule.discover` (`subjects`,
`[]laccd.Subject`) is the only one that prints a bare list.** All other bespoke commands
print a struct (`searchResult`, `sectionView`, `compareResult`, `changedResult`,
`scheduleResult`, `prereqView`, `compareView`, `coverageView`, `planView`, `compareView`,
`diffYearsView`, `courseProgramsView`, `bottlenecksView`, `transferOptionsView`), so no other
operation needed the list treatment.

`fixtures/synthetic/laccd_class_search/schedule.discover/*.json` were regenerated in the real
`[]Subject` shape: `success` is a three-element list of `{code, name, ccn}` (byte-identical to
before — the original was already a list), `empty` is `[]`, `partial` is a one-element list
with the truncation stderr line, and `schema_change` is now a **list** whose elements rename
the identity fields (`subject_code`/`subject_name`), which trips the new per-row check. Only
`schema_change.json` actually changed on disk. `retrieved_from` is the default
`len(d) if isinstance(d, list)`, which counts list elements — the success replay reports
`retrieved == 3`.

## Commands and output

```
$ cd backend && .venv/bin/python -m pytest tests/test_registry.py tests/test_operation_fixtures.py -q --no-cov
213 passed in 0.13s

$ cd backend && .venv/bin/python -m pytest
Required test coverage of 70% reached. Total coverage: 95.54%
249 passed in 2.58s
```

213 = 6 original registry tests + 5 flag-shaped-value cases + 25 argv-sweep cases + 175 fixture
cases + 1 identity-field test + 1 source-mode test. No warnings in either summary.

Re-ran both ad-hoc audits after the fixes:
- all 25 operations × 7 states still map to the expected status, and all 25 `schema_change`
  fixtures still produce error code `schema_change` (now including `schedule.discover` via the
  list branch);
- every `command_path` is still `public_read` in its manifest and every emitted `--flag`
  (including the new always-present `--types`) is still in that command's manifest `flags` list.

## Concerns after this round

1. `catalog.coverage` and `pathways.diff` are annotated `pp:data-source auto` upstream but are
   declared `data_source="local"` per the ruling. For `diff-years` in particular the prior-year
   map *is* fetched live, so `source_mode == "local"` understates the freshness of half the
   payload. If that matters, the honest fix is a mixed/`auto` third value rather than a binary
   override.
2. `articulation.list` now silently defaults the agreement category to `Department`. A caller
   who wants every category must enumerate them; the CLI has no "all" value.
3. The `articulation.transferability` success-fixture shape remains the one unverifiable guess
   (unchanged from round 1).
