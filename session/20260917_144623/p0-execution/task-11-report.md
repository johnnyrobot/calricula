# Task 11 Report — Identity crosswalk namespaces and LACCD campus seed

## What was implemented

- `backend/app/evidence/__init__.py` — empty package marker.
- `backend/app/evidence/crosswalk.py` — `Namespace` literal, `ExternalIdentity` (pydantic `BaseModel`), `Crosswalk` (`add`, `resolve`, `identities`), `load_seed()`. Copied verbatim from the brief's Step 3 code block; no deviation.
- `backend/app/evidence/seeds/laccd_campuses.json` — nine campus rows, canonical keys `campus:<lowercase code>`, each with `laccd.campus`, `elumen.tenant`, `programmapper.college`, `assist.institution` identities.
- `backend/tests/test_crosswalk.py` — the brief's five tests, copied verbatim.

## `git show` commands used and values copied

```
git -C /Users/laccd/code/laccd_chatbot show 1de20af84ca41dacd37b6ab71095cca0b29145fc:backend/app/services/elumen_service.py
git -C /Users/laccd/code/laccd_chatbot show 1de20af84ca41dacd37b6ab71095cca0b29145fc:backend/app/services/program_mapper.py
```

`CAMPUS_TENANTS` (elumen_service.py, lines 36-46) — copied verbatim:

| Code  | elumen.tenant |
|-------|----------------|
| LAMC  | lamission.elumenapp.com |
| LAVC  | lavc.elumenapp.com |
| LAPC  | pierce.elumenapp.com |
| LAHC  | lahc.elumenapp.com |
| LATTC | lattc.elumenapp.com |
| LACC  | lacc.elumenapp.com |
| ELAC  | elac.elumenapp.com |
| LASC  | lasc.elumenapp.com |
| WLAC  | wlac.elumenapp.com |

`COLLEGE_CONFIGS` (program_mapper.py, lines 36-84) has fields `name`, `origin`, `site_content_id` per campus — there is no literal `slug` key. The brief's worked example pairs LAMC with `programmapper.college` external_id `"la_mission"`, which is the distinctive (non-generic) hostname label of LAMC's `origin` (`la-mission.programmapper.ws`) with `-` → `_`. I applied that same mechanical extraction (pick the hostname label that isn't `programmap`/`programmapper` or the TLD, replace `-` with `_`) to all nine origins, verbatim from the file, rather than inventing anything:

| Code  | origin (verbatim from COLLEGE_CONFIGS) | programmapper.college (derived) | site_content_id (verbatim, not seeded — see decision below) |
|-------|------------------------------------------|----------------------------------|----------------------------------------------------------------|
| LAMC  | https://la-mission.programmapper.ws | la_mission | 0055f609-1a83-4937-8356-c67ec89cb496 |
| LAVC  | https://programmap.lavc.edu | lavc | b42b1741-63ac-4bcf-95b6-48288af8733d |
| LAPC  | https://programmapper.piercecollege.edu | piercecollege | a10412a2-4b0f-493e-a7d0-2d8c4b1af0e2 |
| LAHC  | https://la-harbor.programmapper.com | la_harbor | 170b2c8d-6880-48fe-aea2-d2017ffabe27 |
| LATTC | https://la-trade-tech.programmapper.ws | la_trade_tech | 3973c13e-2554-42a2-aede-02f223d887d0 |
| LACC  | https://la-city.programmapper.ws | la_city | 82f8d72b-b23d-4f3b-8c4e-efc491c536ff |
| ELAC  | https://east-la.programmapper.com | east_la | 679f91e9-a94b-45f3-b0d5-4bae183a3f91 |
| LASC  | https://la-southwest.programmapper.ws | la_southwest | c412a3e5-ac95-4de6-9def-f17f44deedfc |
| WLAC  | https://west-la.programmapper.ws | west_la | b72f9ee4-f902-4c14-9088-f4298008f569 |

**Decision — `programmapper.site_content` omitted from the seed.** `site_content_id` in `COLLEGE_CONFIGS` is a single static value per campus; the source has no `catalog_year` axis at all. The controlling instructions say to add `programmapper.site_content` only "if a site-content id per campus/catalog year is present" and to scope it by `catalog_year`; since the id does not vary by catalog year in the source, inventing a `catalog_year` scope value would be fabricating data, not copying it. This also matches the brief's own worked example row for LAMC, which has exactly four identities (`laccd.campus`, `elumen.tenant`, `programmapper.college`, `assist.institution`) and no `programmapper.site_content` entry, and matches the tests, which never assert on that namespace. I recorded the `site_content_id` values above for the reviewer's benefit but did not add them to the seed or the `Namespace` type (the literal already includes `programmapper.site_content` per the brief's Step 3 code, unused).

`assist.institution`: LAMC uses `"118"` / `tentative` / `"assist README example; confirm with articulation.resolve"` per the brief's example. The other eight campuses use `external_id: ""`, `status: "tentative"`, `source: "resolve via articulation.resolve fixture"` verbatim, per instruction — no real ASSIST ids were looked up.

`laccd.campus` codes (`LACC, ELAC, LAHC, LAMC, LAPC, LASC, LATTC, LAVC, WLAC`) per instruction, source noted as `"laccd-class-search-pp-cli colleges"`.

## Full nine-row table (code, tenant, slug, site-content)

| Code  | canonical      | elumen.tenant             | programmapper.college | site_content_id (not seeded) | assist.institution |
|-------|----------------|----------------------------|------------------------|-------------------------------|---------------------|
| LACC  | campus:lacc    | lacc.elumenapp.com         | la_city                | 82f8d72b-b23d-4f3b-8c4e-efc491c536ff | "" (tentative) |
| ELAC  | campus:elac    | elac.elumenapp.com         | east_la                 | 679f91e9-a94b-45f3-b0d5-4bae183a3f91 | "" (tentative) |
| LAHC  | campus:lahc    | lahc.elumenapp.com         | la_harbor               | 170b2c8d-6880-48fe-aea2-d2017ffabe27 | "" (tentative) |
| LAMC  | campus:lamc    | lamission.elumenapp.com    | la_mission              | 0055f609-1a83-4937-8356-c67ec89cb496 | 118 (tentative) |
| LAPC  | campus:lapc    | pierce.elumenapp.com       | piercecollege           | a10412a2-4b0f-493e-a7d0-2d8c4b1af0e2 | "" (tentative) |
| LASC  | campus:lasc    | lasc.elumenapp.com         | la_southwest            | c412a3e5-ac95-4de6-9def-f17f44deedfc | "" (tentative) |
| LATTC | campus:lattc   | lattc.elumenapp.com        | la_trade_tech           | 3973c13e-2554-42a2-aede-02f223d887d0 | "" (tentative) |
| LAVC  | campus:lavc    | lavc.elumenapp.com         | lavc                    | b42b1741-63ac-4bcf-95b6-48288af8733d | "" (tentative) |
| WLAC  | campus:wlac    | wlac.elumenapp.com         | west_la                 | b72f9ee4-f902-4c14-9088-f4298008f569 | "" (tentative) |

## TDD evidence

RED: wrote `backend/tests/test_crosswalk.py` first, ran
`.venv/bin/python -m pytest tests/test_crosswalk.py -q --no-cov` →
`ModuleNotFoundError: No module named 'app.evidence'` (matches brief's expected failure exactly).

GREEN: after implementing `crosswalk.py` and the seed, same command → `.....` (5 passed).

## Full-suite summary

`cd backend && .venv/bin/python -m pytest` → **272 passed**, coverage 95.67% (floor 70%), no warnings, no failures.

## Files changed

- `backend/app/evidence/__init__.py` (new)
- `backend/app/evidence/crosswalk.py` (new)
- `backend/app/evidence/seeds/laccd_campuses.json` (new)
- `backend/tests/test_crosswalk.py` (new)

Single commit `6beef83`: `feat(evidence): namespaced identity crosswalk with tentative/confirmed LACCD campus seed` + `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Self-review

- Completeness: all five tests from the brief pass; nine campuses present; `laccd.campus`/`elumen.tenant`/`programmapper.college` present for all nine; `assist.institution` tentative for all nine (LAMC has the example value, the rest are the placeholder exactly as instructed).
- Quality: `crosswalk.py` matches the brief's code block character-for-character. Seed JSON is straightforward data, no logic.
- Discipline: nothing beyond the brief — no database, no API, no extra namespaces populated (`calricula.program`, `calricula.college`, `soc`, `cip`, `top`, `naics`, `programmapper.site_content` all remain unused, as the brief only asks for the nine-campus seed with four populated namespaces per campus).
- Testing: ran the exact test file from the brief verbatim; captured RED failure text; full suite green with coverage well above the floor; pytest output is clean (no warnings).
- No personal email anywhere (`grep -rn "johnny"` over the new files: clean).

## Concerns

1. **`programmapper.college` slug derivation is inferred, not literal.** `COLLEGE_CONFIGS` has no `slug` field — only `name`, `origin`, `site_content_id`. I derived the external_id mechanically from the `origin` hostname (matches the brief's own LAMC example exactly), applying the same rule to all nine. For LAVC and LAPC, whose `origin` is a custom domain rather than a `<slug>.programmapper.<tld>` pattern, this yields `lavc` and `piercecollege` respectively — plausible but not something I can independently confirm against a real ProgramMapper slug (e.g., a `/college/<slug>` URL path), since that isn't present in the pinned file. A reviewer with access to the live ProgramMapper site (or a later commit of the chatbot repo) may want to double check these two.
2. **`programmapper.site_content` intentionally omitted** from the seed (see decision above) even though `site_content_id` values exist per campus in the source, because the source has no `catalog_year` scoping dimension and the brief's own worked example and tests don't require it. Flagging in case the controller wants it added anyway with an empty/unscoped identity (would require either relaxing "scoped by catalog_year" or picking an arbitrary year to attach).

Both concerns are about seed-value provenance/interpretation, not about the crosswalk module's correctness — the module matches the brief's interface and code exactly, and all tests are real assertions (duplicate-confirmed rejection, scope-based non-resolution, namespace non-conflation) rather than trivial checks.

---

## Fix report — round 1 (controller rulings)

### What changed

**1. Seed provenance (`backend/app/evidence/seeds/laccd_campuses.json`)**
- Added a `programmapper.site_content` identity to all nine campus rows: `external_id` = the campus's `site_content_id` copied verbatim from `COLLEGE_CONFIGS`, `scope: {}`, `status: "confirmed"`, `source: "laccd_chatbot COLLEGE_CONFIGS site_content_id"`.
- Changed every `programmapper.college` identity's `status` from `"confirmed"` to `"tentative"`, and rewrote `source` to say explicitly the value is derived from `origin`, e.g. `"derived from laccd_chatbot COLLEGE_CONFIGS origin https://la-mission.programmapper.ws; confirm against the ProgramMapper CLI college list"`.
- No other values changed. `laccd.campus`, `elumen.tenant`, `assist.institution` rows are untouched.

Command re-run to re-verify the nine `site_content_id` values against the pinned revision before writing them:
```
git -C /Users/laccd/code/laccd_chatbot show 1de20af84ca41dacd37b6ab71095cca0b29145fc:backend/app/services/program_mapper.py
```

Nine copied `site_content_id` values (verbatim from `COLLEGE_CONFIGS`):

| Code  | site_content_id (copied verbatim, now `programmapper.site_content`, confirmed) |
|-------|----------------------------------------------------------------------------------|
| LACC  | 82f8d72b-b23d-4f3b-8c4e-efc491c536ff |
| ELAC  | 679f91e9-a94b-45f3-b0d5-4bae183a3f91 |
| LAHC  | 170b2c8d-6880-48fe-aea2-d2017ffabe27 |
| LAMC  | 0055f609-1a83-4937-8356-c67ec89cb496 |
| LAPC  | a10412a2-4b0f-493e-a7d0-2d8c4b1af0e2 |
| LASC  | c412a3e5-ac95-4de6-9def-f17f44deedfc |
| LATTC | 3973c13e-2554-42a2-aede-02f223d887d0 |
| LAVC  | b42b1741-63ac-4bcf-95b6-48288af8733d |
| WLAC  | b72f9ee4-f902-4c14-9088-f4298008f569 |

**2. Reverse-index protection (`backend/app/evidence/crosswalk.py`)**
`Crosswalk` now tracks confirmed-ness per reverse-index key via a parallel `self._confirmed_keys: set[tuple]`. In `add()`:
- A `confirmed` add for a key already owned (confirmed) by a different canonical still raises `ValueError` — unchanged behavior.
- A later `tentative` add for a key already confirmed does **not** overwrite `_by_key` (the confirmed canonical keeps resolving), but the identity is still appended under its own canonical in `_by_canonical`.
- A `confirmed` add for a key currently held only by a `tentative` mapping replaces it in `_by_key` and marks the key confirmed.

**3. Empty ids (`backend/app/evidence/crosswalk.py`)**
`add()` now appends every identity (including `external_id == ""`) to `_by_canonical` first, then returns immediately — before touching the reverse index — whenever `external_id == ""`. So placeholder identities are always visible via `identities(canonical)` but never register a reverse-index key, meaning `resolve(namespace, "")` is always `None` regardless of scope.

### Tests added (`backend/tests/test_crosswalk.py`)

- `test_confirmed_then_tentative_same_key_keeps_confirmed_resolution` — (a)
- `test_tentative_then_confirmed_same_key_upgrades_resolution` — (b)
- `test_seed_empty_assist_ids_do_not_resolve_but_remain_in_identities` — (c)
- `test_seed_site_content_ids_are_confirmed_and_college_slugs_are_tentative` — (d), also asserts every `programmapper.college` identity in the seed is `tentative`.

The original first test (`test_seed_has_nine_campuses_with_class_search_and_elumen_ids`) only asserts namespace *presence*, not status, so it needed no change and still passes with `programmapper.college` now tentative.

### Commands and results

```
cd backend && .venv/bin/python -m pytest tests/test_crosswalk.py -q --no-cov
```
→ `.........` (9 passed: 5 original + 4 new).

```
cd backend && .venv/bin/python -m pytest
```
→ **276 passed**, `app/evidence/crosswalk.py` at 100% coverage, total coverage 95.72% (floor 70%), no warnings.

### Commit

`575e496` — `fix(evidence): confirm site-content ids, protect confirmed mappings and ignore empty ids` + `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`, on `main`, not pushed.

### Concerns carried forward

The `programmapper.college` slug-derivation-from-`origin` concern from the original report is now reflected in the data itself (status `tentative`, source states the derivation and asks for confirmation against the ProgramMapper CLI college list) rather than being an unresolved side note — no further action needed unless the controller wants the CLI list actually consulted.
