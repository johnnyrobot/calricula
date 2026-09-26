# Task 2 report — Campus source configuration and explicit unconfigured states

## What was implemented

- `backend/app/chat/pipeline_types.py` (new): `CardKind`, `Citation`, `Card`, `AnswerWarning` moved here verbatim from `pipeline.py` (former lines 24–47).
- `backend/app/chat/pipeline.py`: those four definitions removed; replaced with
  `from app.chat.pipeline_types import AnswerWarning, Card, CardKind, Citation  # noqa: F401`
  inserted in its alphabetical position among the existing `app.chat.*` imports. `from app.chat.pipeline import Card` (and `Citation`, `CardKind`, `AnswerWarning`) still works via the re-export.
- `backend/app/chat/campuses.py` (new): `CAMPUS_NAMES` (9 LACCD codes → ASSIST-resolvable names), `_seed`/`_crosswalk` (cached `load_seed()` wrapper, monkeypatchable via `m._crosswalk`), `_confirmed`, `site_content_id`, `assist_name`, `unconfigured`. Implemented exactly as given in the brief.
- `backend/tests/test_campuses.py` (new): the three tests from the brief, verbatim.

## Importer check

`git grep -n "from app.chat.pipeline import"` (run before editing) showed only:
- `app/chat/runs.py` → `PipelineInput, run_pipeline`
- `tests/test_campus_corpus.py` → `PipelineInput, run_pipeline`
- `tests/test_chat_pipeline.py` → `PipelineInput, run_pipeline` and (inline) `_subject`

None imported `Card`/`Citation`/`CardKind`/`AnswerWarning` directly, so no other file needed changes — but the re-export was kept per the brief regardless, since it's the documented contract.

## TDD evidence

**RED** — `cd backend && .venv/bin/python -m pytest tests/test_campuses.py -q --no-cov`
```
ERROR collecting tests/test_campuses.py
ModuleNotFoundError: No module named 'app.chat.campuses'
```
(Confirmed the expected failure before writing `campuses.py`.)

**GREEN** — `cd backend && .venv/bin/python -m pytest tests/test_campuses.py -q --no-cov`
```
...                                                                      [100%]
```

**Step 4 set** — `cd backend && .venv/bin/python -m pytest tests/test_campuses.py tests/test_chat_pipeline.py tests/test_crosswalk.py -q --no-cov`
```
.............................................                            [100%]
```

**Full suite** — `cd backend && .venv/bin/python -m pytest -q` (Postgres via `applicationx-db-1`, already running on :5434)
```
........................................................................ [ 14%]
........................................................................ [ 29%]
........................................................................ [ 44%]
........................................................................ [ 59%]
........................................................................ [ 74%]
........................................................................ [ 89%]
....................................................                     [100%]
================================ tests coverage ================================
TOTAL                                         2019     77    96%
Required test coverage of 70% reached. Total coverage: 96.19%
```
All tests passed (no failures/errors); coverage well above the 70% floor.

Note: the repo venv is `backend/.venv` with interpreter `.venv/bin/python` (there is no plain `python`/`python3` pytest entry point on PATH pointing at it), so I used `.venv/bin/python -m pytest` per "use the interpreter the README names."

## Files changed

- `backend/app/chat/pipeline_types.py` (new)
- `backend/app/chat/campuses.py` (new)
- `backend/tests/test_campuses.py` (new)
- `backend/app/chat/pipeline.py` (modified: 4 classes removed, 1 import line added)

## Deviations from the brief

None. Code, test, and commit message match the brief verbatim.

## Self-review

- Diff against `pipeline.py` is minimal and exactly matches the brief's described change (checked via `git diff`); `Literal` and `BaseModel` imports in `pipeline.py` remain used elsewhere (`ChatAnswer`, `PipelineInput`), so nothing went unused/orphaned.
- `campuses.py` names/shape match the brief's interface list (`CAMPUS_NAMES`, `site_content_id`, `assist_name`, `unconfigured`) exactly; no extra surface added (YAGNI).
- Tests exercise real behavior: positive path over all 9 seeded campuses, an unknown-campus path, and a crosswalk-substitution path proving tentative identities are excluded (not just a mock that always returns something).
- Test output is clean — no warnings/deprecation noise beyond pytest's own coverage summary.
- No personal email, no secrets, nothing echoing connector bodies/tokens.

## Commit

`83c1cd8` — `feat(chat): per-campus source configuration with explicit unconfigured warnings` on branch `p1b-1/chat-breadth`, trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Concerns

None. Ready for Tasks 3–5 to consume `campuses.py`.
