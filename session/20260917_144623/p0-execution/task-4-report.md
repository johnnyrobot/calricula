# Task 4 Report: Manifest generation from `agent-context --json`

## Status: DONE

## What was implemented

Exactly the files the brief specifies:

- `backend/app/connectors/classify.py` — `Disposition` literal, `UnclassifiedCommand`, the
  `MIRROR_WRITERS`/`REMOTE_WRITERS`/`LOCAL_CONFIG`/`DIAGNOSTIC` default sets, and `classify()`,
  copied verbatim from the brief.
- `backend/app/connectors/manifest.py` — `CommandEntry`, `Manifest`, `_walk()` (flattens the
  `agent-context` command tree into leaf paths), `build_manifest_from_context()`, `load_manifest()`,
  copied verbatim from the brief.
- `scripts/build_manifest.py` — offline generator: loads a pin, shells out to
  `<binary> agent-context --json` with a scrubbed env (`PATH=/usr/bin:/bin`, `HOME=/tmp`,
  `NO_COLOR=1`, `<PREFIX>_HOME=/tmp/ax-manifest-scratch`), loads that connector's classification
  YAML, builds the manifest, writes `connectors/manifests/<id>.json`. Copied verbatim from the brief.
- `connectors/classifications/{laccd_class_search,laccd_courses,programmapper,assist}.yaml` — each
  starts from the brief's exact content, plus the overrides listed below that were required to
  eliminate `UnclassifiedCommand`.
- `connectors/manifests/{laccd_class_search,laccd_courses,programmapper,assist}.json` — generated,
  committed.
- `backend/tests/fixtures/agent_context_minimal.json`, `backend/tests/test_manifest.py` — copied
  verbatim from the brief.

No wildcard/default rule was added to `classify.py`; it is byte-for-byte the brief's version.

## TDD evidence

RED — before writing `classify.py`/`manifest.py`:
```
$ .venv/bin/python -m pytest tests/test_manifest.py -q --no-cov
ImportError while importing test module '.../tests/test_manifest.py'.
E   ModuleNotFoundError: No module named 'app.connectors.manifest'
```

GREEN — after implementation, generation, and override resolution:
```
$ .venv/bin/python -m pytest tests/test_manifest.py -q --no-cov
....                                                                     [100%]
```

## Generator output (four printed lines)

```
laccd_class_search: 28 commands, schema d15c344aa4ec
laccd_courses: 31 commands, schema 3a78dde172eb
programmapper: 48 commands, schema 0e89b052b119
assist: 43 commands, schema 4130179ba968
```

## Overrides added beyond the brief's YAML

The brief's YAML snippets alone left 5 commands raising `UnclassifiedCommand` (verified by running
`classify()` over each binary's real `agent-context --json` output with only the brief's overrides
applied, before touching the generator for real). Each is a cobra/CLI-framework built-in or hidden
alias with no `mcp:read-only` annotation and no match in `classify.py`'s default sets, so the
generator raised on the first `--all` run (`UnclassifiedCommand: 'help'`) and would have raised
again for `search` on programmapper.

| Connector | Path | Disposition | Reason |
|---|---|---|---|
| laccd_class_search | `help` | diagnostic | cobra built-in help/usage text; not a data operation |
| laccd_courses | `help` | diagnostic | cobra built-in help/usage text; not a data operation |
| programmapper | `help` | diagnostic | cobra built-in help/usage text; not a data operation |
| programmapper | `search` | public_read | hidden full-text search over synced local mirror (or live API); read-only query, no upstream writes |
| assist | `help` | diagnostic | cobra built-in help/usage text; not a data operation |

Verified via `agent-context --json`: `help` in every binary is `{"name":"help","use":"help [command]","short":"Help about any command"}` — the standard cobra help command, no side effects. Programmapper's `search` is
`{"name":"search","use":"search <query>","short":"Full-text search across synced data or live API","annotations":{"mcp:hidden":"true"},"flags":[db,limit,type]}` — same shape and intent as `laccd_courses`'s already-overridden hidden `search` (which the brief itself classifies `public_read`), so I classified it the same way for consistency.

No other overrides were added. In particular I did **not** add a `feedback list` override to
`laccd_class_search.yaml` or `laccd_courses.yaml` even though it's arguably mislabeled `remote_write`
there (root `feedback` matches `REMOTE_WRITERS` before the `mcp:read-only: true` annotation is
consulted) — it doesn't raise `UnclassifiedCommand`, so per the brief's instructions ("when the
generator raises for a command path, add an override") it was left as the brief's own default-rule
behavior dictates. The brief only added a `feedback list` correction for `assist.yaml`; I did not
extend that editorial choice to the other three connectors since it wasn't required to reach GREEN
and I was told to keep overrides to exactly what's needed, one explicit path at a time.

## Dead-command check (assist)

```
$ .venv/bin/python -c "from app.connectors.manifest import load_manifest as l; print([c.path for c in l('assist').commands if c.path.split()[0] in {'sync','courses','departments','catalog','auth'}])"
[]
```
Confirms `assist`'s manifest has no `sync`/`courses`/`departments`/`catalog`/`auth` paths.

## Per-connector command counts by disposition

| Connector | diagnostic | public_read | remote_write | local_maintenance | unsupported | total |
|---|---|---|---|---|---|---|
| laccd_class_search | 10 | 9 | 2 | 7 | 0 | 28 |
| laccd_courses | 12 | 10 | 2 | 7 | 0 | 31 |
| programmapper | 11 | 26 | 2 | 8 | 1 | 48 |
| assist | 12 | 12 | 0 | 19 | 0 | 43 |

(No `private_read` or `privileged_read` dispositions occur — none of the four CLIs' commands needed
those categories; `classify()` only ever emits `public_read`, `remote_write`, `local_maintenance`,
`diagnostic`, or an explicit override's disposition, and the only override using `unsupported` is
programmapper's `export`.)

## Full test suite (with coverage)

```
$ .venv/bin/python -m pytest
................                                                         [100%]
================================ tests coverage ================================
Name                          Stmts   Miss  Cover   Missing
-----------------------------------------------------------
app/connectors/classify.py       26      3    88%   19, 25, 30
app/connectors/manifest.py       44      0   100%
... (all other modules 100%)
-----------------------------------------------------------
TOTAL                           182      3    98%
Required test coverage of 70% reached. Total coverage: 98.35%
16 passed in 0.45s
```
No warnings in the summary. The 3 uncovered lines in `classify.py` are default-rule branches
(`MIRROR_WRITERS`/`REMOTE_WRITERS`/`LOCAL_CONFIG` literal-path branches) not exercised by the four
real command trees plus the unit tests; well above the 70% floor regardless.

## Files changed (all committed in one commit, `5527e1b`)

- `backend/app/connectors/classify.py` (new)
- `backend/app/connectors/manifest.py` (new)
- `backend/tests/fixtures/agent_context_minimal.json` (new)
- `backend/tests/test_manifest.py` (new)
- `connectors/classifications/assist.yaml` (new)
- `connectors/classifications/laccd_class_search.yaml` (new)
- `connectors/classifications/laccd_courses.yaml` (new)
- `connectors/classifications/programmapper.yaml` (new)
- `connectors/manifests/assist.json` (new, generated)
- `connectors/manifests/laccd_class_search.json` (new, generated)
- `connectors/manifests/laccd_courses.json` (new, generated)
- `connectors/manifests/programmapper.json` (new, generated)
- `scripts/build_manifest.py` (new)

`connectors/bin/` was read (binaries + their `.sha256` files) but never written to, and stayed
untracked per `.gitignore`'s `bin/` rule. Only `agent-context --json` was ever run against the
binaries; no `sync`/`search`/`doctor`/etc invocation, and none of
`PRINTING_PRESS_DOGFOOD`/`PRINTING_PRESS_VERIFY`/`PRINTING_PRESS_VERIFY_LIVE_HTTP` were set.

## Self-review

- **Completeness against the brief:** all five steps done — failing tests written and run (RED),
  `classify.py`/`manifest.py`/`build_manifest.py`/four YAMLs implemented verbatim, manifests
  generated, all `UnclassifiedCommand`s resolved with explicit per-path overrides and honest reasons,
  full suite green, one commit with the exact message + trailer.
- **Quality:** generator output matches the expected four-line shape; `schema_digest` is stable
  across two builds with different `egress_hosts` (asserted by the brief's own test, confirmed
  passing) since it hashes only `ctx["commands"]`.
- **Discipline:** nothing extra was added — no wildcard rule in `classify.py`, no extra overrides
  beyond the 5 needed to reach GREEN, no changes to Task 1-3 files (`pins.py` untouched), no rebuild
  or non-`agent-context` invocation of the pinned binaries, no personal email anywhere.
- **Testing:** the brief's four tests are real assertions (annotation-driven classification,
  override precedence, unclassified-command error, path-flattening + digest stability + happy-args
  passthrough, and the committed-manifest completeness check across all four connector ids) — not
  smoke tests. Output is pristine (`....`, `16 passed`, no warnings, coverage 98.35%).

## Concerns

- The `feedback list` disposition is inconsistent across connectors purely as an artifact of the
  brief's own YAML content: `assist.yaml` corrects it to `diagnostic` (given verbatim in the brief),
  while `laccd_class_search`/`laccd_courses`/`programmapper` fall through to the default
  `REMOTE_WRITERS` rule and get `remote_write` even though the command is annotated
  `mcp:read-only: true` and only lists a local feedback log. This doesn't raise `UnclassifiedCommand`
  so it wasn't in scope to "resolve," and I didn't add unrequested overrides to smooth it over — but
  the operation registry in a later task should be aware that `feedback list` is over-classified
  (more restrictive than necessary, not less) on three of the four connectors. Flagging for the
  controller/reviewer in case the intent was for me to harmonize it; I held to "only fix what raises."

## Fix round 1 (post-review)

**Finding (Important, plan-mandated):** `connectors/classifications/laccd_courses.yaml`
classified `coverage` as `diagnostic`, but Task 7's plan registers `catalog.coverage` → `coverage`
as a served P0 operation. The no-flags invocation is a pure local-mirror read; only `--data-source`
touches upstream, and that flag is on the broker's blocked-flag list — so the served path is
read-only and should be `public_read`.

**Change:** `laccd_courses.yaml`'s `coverage` override changed from

```yaml
"coverage": [diagnostic, "mirror completeness report; --data-source live probes API totals"]
```
to
```yaml
"coverage": [public_read, "mirror completeness report over the local mirror; --data-source (live probe) is a broker-blocked flag"]
```

Regenerated only that manifest:
```
$ cd backend && .venv/bin/python ../scripts/build_manifest.py laccd_courses
laccd_courses: 31 commands, schema 3a78dde172eb
```
(schema digest unchanged — it hashes `agent-context`'s command tree, not the classification.)

Confirmed the `coverage` entry in `connectors/manifests/laccd_courses.json`:
```json
{"path": "coverage", "read_only": true, "endpoint": null, "happy_args": null, "flags": ["db"],
 "disposition": "public_read",
 "reason": "mirror completeness report over the local mirror; --data-source (live probe) is a broker-blocked flag"}
```

**Diff stat** — confirmed only the YAML and that one JSON changed, nothing else:
```
$ git diff --stat
 connectors/classifications/laccd_courses.yaml | 2 +-
 connectors/manifests/laccd_courses.json       | 4 ++--
 2 files changed, 3 insertions(+), 3 deletions(-)
```

**Covering tests:**
```
$ cd backend && .venv/bin/python -m pytest tests/test_manifest.py -q --no-cov
....                                                                     [100%]

$ cd backend && .venv/bin/python -m pytest
................                                                         [100%]
Required test coverage of 70% reached. Total coverage: 98.35%
16 passed in 0.52s
```
No warnings in either summary.

**Commit:** `93d58f5` — "fix(connectors): serve courses coverage as a public mirror read", on `main`,
with the required trailer. The `feedback list` over-classification concern from the original report
was reviewed and deferred (Minor) — left unchanged as instructed.
