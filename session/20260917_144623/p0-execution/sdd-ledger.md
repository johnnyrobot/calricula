# SDD ledger — plan: /Users/laccd/code/calricula/docs/applicationx/plans/2026-09-17-p0-source-contracts.md

Repo: /Users/laccd/code/applicationx (branch main; owner chose direct commits to main on 2026-09-17). Bootstrap commit 2dad158.
Spec: docs/applicationx/TECHNICAL-SPEC.md, SOURCE-INVENTORY.md, PRD.md §10, EMBEDDED-INTERFACE.md §3/§7 (all under /Users/laccd/code/calricula/docs/applicationx/), reachable.
Environment (checked 2026-09-17): python3.12 = 3.12.5; /usr/bin/python3 = 3.9.6 (fake CLI stdlib-only, fine); node 22.23 / npm 10.9; Docker 29.8 running; all four CLI pins and the chatbot pin resolve in the siblings; chatbot NOTICE, schedule_sections.py, elumen_service.py (CAMPUS_TENANTS), program_mapper.py (COLLEGE_CONFIGS), frontend/index.html (104 data-question), shared/campus_config.py (SAMPLE_QUESTIONS), scripts/eval_guardrails.py all exist at 1de20af.

## Pre-flight scan

| Pair / task | Produces vs consumes | Finding |
| --- | --- | --- |
| T1 self | pytest.ini + pyproject [tool.pytest.ini_options] pythonpath | pytest.ini takes precedence; pyproject pythonpath ignored. `python -m pytest` still works (cwd on sys.path) but bare `pytest` and CI would not. **Conflict.** |
| T1 self | README/.gitignore "Create" | Bootstrap commit already has README.md, LICENSE, .gitignore. Merge, do not clobber. |
| T1 self | requirements pins | Exact versions may not exist on PyPI (2.13.4 etc.). Risk only. |
| T1→T5 | settings.CONNECTOR_* ↔ registry.execute | Names match (CONNECTOR_SCRATCH_DIR, CONNECTOR_MAX_STDOUT_BYTES, CONNECTOR_BIN_DIR). Clean. |
| T2→T6 | ConnectorResult validator (unavailable requires errors) ↔ normalize | normalize always attaches an error for unavailable. Clean. |
| T2→T6 | Coverage expected=0 ↔ to_result | to_result passes expected through; empty fixtures with expected 0 and retrieved 0 pass. Clean. |
| T3→T4 | Pin.binary/env_prefix ↔ build_manifest.py | Consistent. assist go.mod says go 1.26.5; plan already provides GOTOOLCHAIN=auto fallback. Clean. |
| T3 self | pins.toml repo_path "../cli-tools/<x>" | Resolves to /Users/laccd/code/cli-tools/<x>; all exist. Clean. |
| T4→T5 | Manifest/CommandEntry ↔ run_command | Field names match test fixtures. Clean. |
| T4→T7 | committed manifests ↔ load_manifest in execute | T7 tests need all four manifests committed (depends on Docker build in T3). Docker present. Clean. |
| T5→T6 | RunOutcome ↔ normalize | Fields match. Clean. |
| T6→T7 | normalize bespoke ↔ test_success_fixtures_preserve_identity_fields | Bespoke branch never sets synced_at, but T7 test asserts provenance.observed_at is not None for schedule.section (bespoke). **Conflict.** |
| T6→T7 | normalize bespoke ↔ EXPECT[schema_change]=unavailable | Bespoke with "renamed identity fields" passes through as ok; T7 test expects unavailable. **Conflict.** |
| T7 self | operations modules import registry; registry imports operations at bottom | Circular but Operation/register defined before import. Clean. |
| T7→T10 | REGISTRY keys ↔ data_families operation links | T10 test requires implemented_tested set == REGISTRY (25). Clean if T10 enumerates exactly those. |
| T7→T14 | HAPPY inline in test ↔ T14 moves to replay.HAPPY_PARAMS | Sequential refactor, as planned. Clean. |
| T8, T9, T11, T12 | standalone | Self-consistent tests vs code. Clean. |
| T11 self | assist.institution external_id "" for eight campuses, tentative | Same key overwritten; no error because tentative. Plan-mandated; acceptable. |
| T13 self | `python -m evals.build_corpus` and `from evals.schema` | `evals/__init__.py` not in Files list; needed for package import. **Gap.** |
| T13 self | test_seat_questions precedence: `"seat" in q or ("open" in q and family=="schedule")` | Labels must include "seat" for those templates. Note for implementer. |
| T14 self | parity fixture path (5 x ..) | Resolves to repo root/fixtures. Clean. |
| T15→T1 | CI `python -m pytest` in backend; make test | Consistent with T1 pytest.ini. Clean once pythonpath ruling applied. |

## Rulings (pre-flight)

- Ruling: T1 adds `pythonpath = .` to `[pytest]` in backend/pytest.ini (pyproject block may stay). — pytest.ini silently shadows pyproject ini_options; CI in T15 relies on bare invocation semantics. — Cost if wrong: one config line.
- Ruling: T1 merges its README/.gitignore content into the bootstrap files rather than replacing them; existing `bin/` ignore is broadened, `connectors/bin/`, `*.db`, `fixtures/captured/` added. — Bootstrap already committed. — Cost if wrong: trivial.
- Ruling: If an exact requirements pin is not on PyPI, the implementer uses the nearest available release of the same major/minor line and lists the substitution in the report. — Plan versions were written without a resolver. — Cost if wrong: version drift, visible in requirements.txt.
- Ruling: T6 bespoke normalizer sets `synced_at` from a top-level `observed_at` or `synced_at` key, or `meta.synced_at`, when present. — T7 asserts observed_at on a bespoke success fixture. — Cost if wrong: one extra field read.
- Ruling: T7 `Operation` gains `required_keys: list[str] = []`; after normalize, if status is ok/partial and data is a non-empty dict missing any required key, `execute` returns status `unavailable` with error code `schema_change` (retryable false) and data None. Bespoke `schema_change` fixtures rename one of those keys; `{}` remains the "empty" shape for single-entity gets. — Plan mandates bespoke schema_change → unavailable but gave no detection mechanism. — Cost if wrong: a small check in registry.execute and key lists per op.
- Ruling: T13 creates `evals/__init__.py`. — Package import required by test and module runner. — Cost if wrong: none.

## Task log

Task 1: implementer a900d51268fd4ae69, commit 163b557; review: Approved with 1 Important (plan-mandated: 2 third-party deprecation warnings from pinned fastapi/starlette/anyio), 2 Minor.
Task 1: Ruling: keep the brief's exact pins; add targeted `filterwarnings` entries to backend/pytest.ini that ignore exactly the two third-party deprecation warnings (starlette httpx→httpx2 TestClient warning; anyio BlockingPortal deprecation) by category and module, no blanket ignore — pristine output is a global rule and pins are the plan's; cost if wrong: two config lines, and a real deprecation in our own code stays visible.
Task 1: minor (deferred): README.md "once present" wording stale now that THIRD_PARTY_NOTICES.md exists.
Task 1: minor (deferred): pyproject [tool.pytest.ini_options] pythonpath duplicates pytest.ini pythonpath (plan-mandated duplication).
Task 1: fix round 1/5 (1 addressed, 0 open — third-party warning filters; commits 163b557..034db43)
Task 1: complete (commits 2dad158..034db43, review clean)
Task 2: implementer a701b6e6a9fa12391, commit 66f3330; review: Needs fixes — 1 Important (unavailable/unconfigured/forbidden-requires-error validator branch untested; report misstated coverage). ⚠️ trailer check resolved by controller via git log.
Task 2: fix round 1/5 (1 addressed, 0 open — validator branch tests; commits 66f3330..3d2596b)
Task 2: complete (commits 034db43..3d2596b, review clean)
Task 3: implementer a232540e03b1825c5, commit 099a1cc, DONE_WITH_CONCERNS: container build produced linux/arm64 ELF binaries that cannot execute on the macOS host; Task 4 (manifest generation) and Task 5 (live broker) run binaries on the host.
Task 3: Ruling: build_pinned_cli.sh cross-compiles for the host by default — GOOS from `uname -s` (Darwin→darwin, Linux→linux) and GOARCH from `uname -m` (arm64/aarch64→arm64, x86_64→amd64), overridable via AX_GOOS/AX_GOARCH env — still inside the golang:1.26 container with CGO_ENABLED=0 and -trimpath, so the pinned-source guarantee is unchanged. — Plan omitted GOOS/GOARCH; binaries must run where the broker runs. — Cost if wrong: a few script lines; CI (Task 15) does not build CLIs so Linux targets are unaffected.
Task 3: commits 099a1cc, b40bd76 (cross-compile fix); review: Approved with 1 Important (plan-mandated: temp dir leaks when a build step fails under set -e), 1 Minor. ⚠️ trailers verified by controller; ⚠️ local_patches lists accepted (they were recorded from the dirty checkouts during planning in SOURCE-INVENTORY).
Task 3: Ruling: add cleanup on failure (`trap 'rm -rf "$work"' EXIT` inside a per-connector subshell, or an explicit `|| { rm -rf "$work"; exit 1; }` guard) — leaking temp clones on failed builds is a real defect the brief inherited; cost if wrong: two lines of shell.
Task 3: minor (deferred): comment that the `python3 | while` loop body runs in a subshell.
Task 3: fix round 1/5 (1 addressed, 0 open — trap-based temp cleanup; commits b40bd76..5928355)
Task 3: complete (commits 3d2596b..5928355, review clean)
Task 4: implementer a35fa2e12e1e4f99e, commit 5527e1b, DONE_WITH_CONCERNS (feedback list over-classified remote_write on three connectors by the default rule order — conservative direction; five explicit overrides added: help×4 diagnostic, programmapper search public_read).
Task 4: review: Needs fixes — 1 Important (plan-mandated: laccd_courses `coverage` classified diagnostic by the brief's YAML but Task 7 registers catalog.coverage → coverage), 4 Minor. ⚠️ manifest revision/binary/env_prefix/sha256 vs pins.toml verified by controller script (all match; local_patch_digest null as expected since no patches are built).
Task 4: Ruling: reclassify laccd_courses `coverage` as public_read with the reason "mirror completeness report over the local mirror; `--data-source` (live probe) is a broker-blocked flag" — the plan's Task 7/Task 10 treat coverage as a served operation and the broker blocks the only upstream-touching mode; cost if wrong: one YAML line and a regenerated manifest.
Task 4: minor (deferred): laccd_class_search `schedule build` reason says `--ics` but the blocked flag is `--ics-file`.
Task 4: minor (deferred): scripts/build_manifest.py imports unused `os` (plan text).
Task 4: minor (deferred): `feedback list` is remote_write on three connectors (root-rule order) and diagnostic on assist; conservative, non-P0 command.
Task 4: minor (deferred): test_committed_core_manifests `all(c.disposition ...)` is near-tautological after model validation (plan text).
Task 4: fix round 1/5 (1 addressed, 0 open — coverage → public_read; commits 5527e1b..93d58f5)
Task 4: complete (commits 5928355..93d58f5, review clean)
Task 5: implementer af79c9fc5dcd7f530, commit e5e1acc, DONE.
Task 5: review: Needs fixes — 3 Important, all plan-mandated by the brief's communicate()-based sample: (a) full output buffered before the stdout cap so memory is unbounded; (b) post-kill communicate() has no timeout and can hang if a grandchild escapes the process group and holds the pipes; (c) stderr cap slices decoded characters, not 64 KiB of bytes. 5 Minor.
Task 5: Ruling: rewrite the read path in subprocess_broker.py — two daemon reader threads with byte caps (stdout: stop at max_stdout, mark truncated and SIGKILL the process group; stderr: keep first 65536 bytes, drain the rest), main thread `proc.wait(timeout)`; on deadline SIGKILL the group and `wait()`; after either path join readers with a short bound and close the pipe handles if a stray holder keeps them open. Interface (`RunOutcome`, `run_command` signature, exit 124 on timeout) unchanged. — The task's purpose is isolation and bounded resource use; the brief's sample does not deliver it. — Cost if wrong: ~40 lines in one module, covered by the existing real-subprocess tests.
Task 5: minor (deferred): _check_args also matches values that equal a blocked flag string (spurious block, safe direction).
Task 5: minor (deferred): hardcoded `env_prefix == "ASSIST"` branch (plan text).
Task 5: minor (deferred): deadline test asserts != 0 rather than == 124 (plan text).
Task 5: minor (deferred): missing binary raises FileNotFoundError rather than a RunOutcome.
Task 5: minor (deferred): bare `9` instead of signal.SIGKILL.
Task 5: fix round 1/5 (3 addressed, 0 open — capped reader threads, bounded post-kill wait, byte-capped stderr; commits e5e1acc..5f1a38e)
Task 5: minor (deferred): output exactly equal to max_stdout is reported truncated and the child is killed (boundary case, safe direction).
Task 5: minor (deferred): a reader thread blocked in read() on a pipe held by an escaped grandchild may leak as a daemon thread (main path stays bounded).
Task 5: minor (deferred): new cap test asserts elapsed < 3.0 s (timing-based).
Task 5: complete (commits 93d58f5..5f1a38e, review clean)
Task 6: implementer ab20762f68c89e092, commit 5e767c8, DONE (ruling: bespoke synced_at applied).
Task 6: review: Needs fixes — 1 Important (plan-mandated fragility: malformed synced_at/observed_at timestamps and non-dict meta raise ValueError/AttributeError in normalize instead of degrading), 2 Minor. ⚠️ trailer verified by controller.
Task 6: Ruling: `_parse_synced_at` returns None on any parse failure (ValueError/TypeError/AttributeError) and `meta` is treated as `{}` unless it is a dict, in both endpoint and bespoke branches; malformed timestamps degrade to `synced_at=None` rather than a typed failure because the payload itself is still valid — a missing observation time is reported downstream by the tri-state health model (Task 12). Cost if wrong: a few guarded lines; tests cover both directions.
Task 6: minor (deferred): ruling test covers observed_at and absent only, not bare synced_at / meta.synced_at fallbacks.
Task 6: minor (deferred): to_result carries snapshot_id/artifact_hash kwargs beyond the brief's interface line (needed by Provenance; harmless).
Task 6: fix round 1/5 (1 addressed, 0 open — guarded timestamp/meta parsing; commits 5e767c8..1c662c1)
Task 6: complete (commits 5f1a38e..1c662c1, review clean)
Task 7: implementer a69de5f9733666659 (opus), commit 6385665 (184 files), DONE_WITH_CONCERNS: five brief rows contradict the pinned CLIs (agreements diff positionals; resolve institution + agreements diff are endpoint envelopes; subjects + courses prereqs are bespoke); bottlenecks has no college arg (college only scopes evidence); agreements list --types registered optional (live CLI requires it); transferability success fixture shape is a best-effort guess.
Task 7: Ruling: where the pinned CLI's actual argv/envelope contradicts the brief's table, the CLI is the authority and the divergence is recorded in the task report — the plan itself made the manifest authoritative for flags and P0 exists to discover exactly these facts; cost if wrong: registry rows, visible in the report table.
Task 7: Ruling: `articulation.list` keeps `types` optional in P0 (replay-only); P1 live capture must supply it — carried as a note for the P1 plan. Cost if wrong: one required-parameter change later.
Task 7: minor (deferred): articulation.transferability success fixture shape is unverified against the live body (synthetic by design in P0).
Task 7: review (opus): Needs fixes — 6 Important: (1) build_argv can emit blocked flags as positionals via permissive ID/name regexes; (2) articulation.list `types` optional but the pinned CLI usage-errors without it; (3) pathways.bottlenecks takes no college but evidence/scope assert one; (4) schedule.conflicts and pathways.compare evidence refs collide with mandated namespaces at a different arity; (5) source_mode reports "live" for mirror-only commands; (6) list-valued bespoke payloads (subjects) bypass the required_keys check so discover's schema_change fixture passes for the wrong reason. 7 Minor. All five claimed CLI divergences verified true by the reviewer against pinned Go sources.
Task 7: Ruling (1): build_argv raises ParameterError for any validated value that starts with "-" (values only reach argv as positionals or flag arguments, never as flags); test asserts no parameter-derived argv element starts with "-". Cost if wrong: a legitimate value starting with "-" (none exist for these CLIs) would be rejected.
Task 7: Ruling (2): articulation.list keeps `types` optional (pattern ^[A-Za-z]{2,20}$) and argv always appends `--types <value or "Department">`; the brief's positional-order test is amended to assert argv[:3] == ["1","118","75"] and argv[3:] == ["--types","Department"] — the CLI requires the flag; cost if wrong: default type choice, one line.
Task 7: Ruling (3): pathways.bottlenecks drops the `college` parameter (required={}), evidence ref becomes `programmapper:bottlenecks`, HAPPY entry becomes {}; the command aggregates the whole mirror and must not claim a scope it does not have. Cost if wrong: P1 re-adds a scope when the CLI gains one.
Task 7: Ruling (4): schedule.conflicts evidence uses the full `laccd:section:{college}:{term}:{class_nbr}` from resolved rows (fallback: none for rows lacking those fields); pathways.compare uses its own namespace `programmapper:compare:{a}:{b}`. Cost if wrong: ref strings.
Task 7: Ruling (5): add `Operation.data_source: Literal["live","local"] | None = None`; execute overrides `source_mode` with it when set (payload-declared `source` no longer consulted for those ops); set "local" for bottlenecks, pathways.diff, pathways.reverse_lookup, catalog.compare, catalog.coverage, schedule.conflicts and any other command annotated `pp:data-source local` at the pinned revision. Cost if wrong: provenance label, visible in fixtures export.
Task 7: Ruling (6): ruling A extended — when data is a non-empty list, required_keys are checked against the first dict element; schedule.discover's schema_change fixture becomes a list whose elements rename `code`/`name`. Cost if wrong: one guard.
Task 7: minor (deferred): _rows helper duplicated in three modules; evidence lambdas get raw request.parameters not the cleaned map; schedule.search expected/retrieved compare courses vs sections (plan text); execute could return ok with data None on `"results": null`; the three failure states assert identically; optional-invalid branch untested; scalar-in-place-of-list raises TypeError inside lambdas.
Task 7: fix round 1/5 (6 addressed, 0 open — dash-value rejection, --types default, bottlenecks un-scoped, evidence namespaces, data_source override, list-aware schema check; commits 6385665..4b21d97)
Task 7: minor (deferred): catalog.coverage and pathways.diff are `pp:data-source auto` upstream but declared local; a "mixed" source_mode is a P1 candidate. bottlenecks takes no parameters (CLI limitation). articulation.list defaults to Department (no "all" value upstream).
Task 7: complete (commits 1c662c1..4b21d97, review clean)
Task 8: implementer af45ecbeeeb15a6d5, commit 00bfd15, DONE.
Task 8: review: Approved with 1 Important (plan-mandated: non-dict entries in sections/relsections raise AttributeError), 2 Minor. ⚠️ cross-primary first-wins dedupe and grandchildren pointing at the topmost primary are the plan's stated semantics (whole-listing dedupe; primary propagated as in the chatbot original) — resolved by controller, no gap.
Task 8: Ruling: iter_components skips any non-dict entry in `subjects`, `courses`, `sections` and `relsections` (and treats a non-dict `listing` as empty) instead of raising — the walker consumes live API JSON and must degrade; cost if wrong: a few isinstance guards.
Task 8: minor (deferred): unreachable `primary == number` branch in the related_to ternary (plan text); silent first-wins drop of cross-primary duplicates deserves a doc comment.
Task 8: fix round 1/5 (1 addressed, 0 open — isinstance guards; commits 00bfd15..7c2f299)
Task 8: complete (commits 4b21d97..7c2f299, review clean)
Task 9: implementer a739a42bceede91cf, commit 407f7be, DONE.
Task 9: review: Needs fixes — 3 Important, plan-mandated: read_scope raises on a DB without sync_state, on malformed catalogs_json, on NULL/garbage last_synced_at; file: URI is built without percent-encoding so paths with ?/# open the wrong database. 2 Minor.
Task 9: Ruling: read_scope returns None for any of: missing file, sqlite3 errors (no table, locked, not a database), malformed catalogs_json, unparseable/NULL last_synced_at — a marker that cannot be read is "no full-scope marker", which is the safe (incomplete) direction; the URI is built from `Path(db_path).resolve().as_uri() + "?mode=ro"` so ?/#/spaces are encoded; the connection is always closed. Cost if wrong: a corrupt row is silently treated as incomplete rather than surfaced — acceptable for P0 (health/diagnostics in P1 can surface it).
Task 9: minor (deferred): test named "...db_is_opened_read_only" does not attempt a write; TOCTOU between exists() and connect (covered by the new exception guard).
Task 9: fix round 1/5 (3 addressed, 0 open — defensive read, encoded URI; commits 407f7be..35c3a28)
Task 9: complete (commits 7c2f299..35c3a28, review clean)
Task 10: implementer a93e2bdb78ed5be89, commit abbde60, DONE (80 entries; S9–S11 phase P2 inferred).
Task 10: review: Approved, 0 Important, 3 Minor. ⚠️ trailer verified by controller. ⚠️ S1.ccn / S3.bottlenecks reasons cite facts from Task 3/Task 7 reports rather than the inventory doc — accepted.
Task 10: Ruling: the inventory YAML covers S1–S11 (§3, §4, §6) only; §5 is the chatbot behavior map (not a data source) and §7's attachment proposals are already represented by S9–S11 rows, and the brief's own test pins the source set to S1–S11. Cost if wrong: entries added later.
Task 10: minor (deferred): *.import rows pinned phase P0 while siblings are P1 (sentinel, undocumented); reason strings citing out-of-doc facts could point at their source; uneven YAML wrapping.
Task 10: complete (commits 35c3a28..abbde60, review clean)
Task 11: implementer a1a5b29720ec6c5b4, commit 6beef83, DONE_WITH_CONCERNS (LAVC/LAPC slugs derived from custom-domain origins; site_content namespace omitted — no catalog_year dimension in source).
Task 11: review: Needs fixes — 3 Important: (1) programmapper.college slugs are derived from origin hostnames for all nine campuses (COLLEGE_CONFIGS has name/origin/site_content_id, no slug — the plan's assumption was wrong); (2) plan-mandated: a tentative add silently replaces a confirmed mapping in _by_key; (3) plan-mandated: eight "" assist placeholders share a key so resolve("assist.institution","") returns an arbitrary campus. 2 Minor. ⚠️ trailer verified by controller.
Task 11: Ruling (1): seed `programmapper.site_content` per campus with the confirmed `site_content_id` from COLLEGE_CONFIGS (scope {}, status confirmed, source names the file) — that is the identity the ProgramMapper CLI actually consumes (`--site-content`); keep `programmapper.college` rows but mark them tentative with a source stating the derivation from the origin hostname (the brief's test only requires the namespace to be present). Cost if wrong: status labels; P1 confirms slugs against the CLI's own college list.
Task 11: Ruling (2): `Crosswalk.add` never lets a tentative identity replace an existing confirmed mapping in the reverse index (the identity is still recorded under its canonical); a confirmed add replaces a tentative one; a second confirmed add to a different canonical still raises. Cost if wrong: a few lines and tests.
Task 11: Ruling (3): identities with an empty `external_id` are recorded under their canonical but never enter the reverse index; `resolve` returns None for an empty external_id. Cost if wrong: none observable.
Task 11: minor (deferred): identities() returns shared ExternalIdentity objects (mutable) — model_copy if the class grows.
Task 11: fix round 1/5 (3 addressed, 0 open — confirmed site_content ids, protected confirmed mappings, empty ids excluded; commits 6beef83..575e496)
Task 11: minor (deferred): two tentative adds for the same key silently let the later one own the reverse index; LAVC/LAPC college slugs remain tentative derivations pending CLI confirmation.
Task 11: complete (commits abbde60..575e496, review clean)
Task 12: implementer a0fb34004619095d8, commit c49006f, DONE.
Task 12: implementer commit c49006f; review: Needs fixes — 2 Important: wrong trailer "Claude Haiku 4.5" (hard rule violated); `forbidden` branch untested. 5 Minor.
Task 12: Ruling: amend the unpushed commit c49006f in place to carry the required trailer (`git commit --amend`, tree unchanged; the repo is local-only on main by owner choice, no push has happened) and add the missing tests in a second commit. Cost if wrong: one rewritten local commit hash.
Task 12: minor (deferred): unavailable+stale combination, future observed_at (negative age), naive/aware tz mixing raises TypeError, no-max-age recorded path, `recorded` in unconfigured branch — untested edges.
Task 12: fix round 1/5 (2 addressed, 0 open — amended trailer (c49006f→36df40f, identical tree), edge tests; commits 36df40f..8cf6119)
Task 12: complete (commits 575e496..8cf6119, review clean)
Task 13: implementer a8e441edfd82c598c (opus), commit 40dde4b, DONE (52 templates × 9 = 468 EN + 468 ES pending; deadline claim type has zero coverage; per-template ES promotion needs a builder tweak later, documented in evals/README.md).
Session restart (2026-09-18): controller model changed to Opus 5. Ruling: the applicationx commit trailer stays `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` for the rest of this plan — it is the approved plan's Global Constraint and every prior commit uses it; consistency within the repo outweighs the harness's per-model default. Cost if wrong: trailer text only.
Task 13: review (opus): Needs fixes — 2 Important: dropped button intents (instructor-as-input, mixed in-scope/out-of-scope compound question). 8 Minor (required_slots listing outputs on three campus templates; resource/workforce templates forward-labeled against proposed P2/P3 families; two aggregation/follow-up nuances; harness test never exercises the unsupported-claim path (plan text); None evidence_id edge; Spanish wording notes for the bilingual reviewer; three unused campus values; equivalence claim type). ⚠️ trailer verified by controller.
Task 13: Ruling: add the two missing templates with fictitious/derived inputs (no real names) and keep all other labels; also fix Minor 3 (drop output values from required_slots) and Minor 7 (`if eid and evidence_lookup(eid)`) in the same round because they are one-line and load-bearing for P1 slot filling; document forward-labeling against proposed families in evals/README.md rather than relabeling resource/workforce as out_of_scope (the corpus is meant to outlive P0). Cost if wrong: two templates and a README paragraph.
Task 13: minor (deferred): cross-college follow-up and subject-level ZTC aggregation not represented; harness test uses cases without critical claims (plan text); Spanish wording items 8 for the reviewer; unused campus values; equivalence has no claim type.
Task 13: fix round 1/5 (5 addressed, 0 open — two templates, slot tidy, harness guard, README; fresh implementer after restart; commits 40dde4b..6ed095d)
Task 13: minor (deferred): reviewer_note kept in English inside the Spanish template file (metadata only).
Task 13: complete (commits 8cf6119..6ed095d, review clean)
Task 14: implementer ac8d67bfb79492827, commit 56dcaa1, DONE (ESM __dirname deviation noted).
Task 14: review: Needs fixes — 1 Important (plan-mandated: ConnectorResultSchema omits the Python rule that unavailable/unconfigured/forbidden require ≥1 error), 1 Minor (TS requires schema_version/errors while the exported JSON Schema lists them optional via defaults).
Task 14: Ruling: add the second refine to ConnectorResultSchema and a parity test for it; also give `schema_version` a `.default("1")` and `errors` a `.default([])` in the zod schema so it mirrors the Pydantic defaults (the JSON Schema is the exported contract of record) — one-line each. Cost if wrong: two lines in a contracts file.
Task 14: fix round 1/5 (2 addressed, 0 open — failure-status refine, zod defaults; commits 56dcaa1..0364bdb)
Task 14: complete (commits 6ed095d..0364bdb, review clean)
Task 15: implementer adc88418406a18fc6, commit 7762191, DONE (npm audit reports transitive dev-dep advisories; CI validated by YAML parse + local dry-run of every run: line).
Task 15: complete (commits 0364bdb..7762191, review clean)

## Final whole-branch review (opus)
Final review: With fixes — 1 Critical (mirror_scope queries `key` but the pinned CLI's sync_state PK is `resource_type`; controller verified at store.go:396-407 and the insert at 1638; key format `sections:COLLEGE:TERM:SUBJECT` confirmed at parseScheduleScopeKey), 6 Important (relative CONNECTOR_BIN_DIR unresolved vs child cwd; broker enforces membership not disposition; README claims hash verification nothing performs and digests are host-specific; schedule.search expected counts courses vs sections; no stale-cache fixture state vs SOURCE-INVENTORY §8; execute lets FileNotFoundError/BlockedArgument escape and ignores source_id/freshness), 10 Minor. Deferred-minor triage: T5 missing-binary and T7 schedule.search promoted to fix-before-merge; all others carry to P1. Rulings: all SOUND except T7 `--types Department` (QUESTIONABLE: silent restriction) and T9 error-swallowing (masked the Critical).
Final: Ruling (Critical): fix the column to `resource_type`, and build the test DB from the CLI's real DDL copied from store.go at the pinned revision; cost if wrong: none, the CLI schema is the authority.
Final: Ruling (Imp 2/7): run_command resolves binary_dir and scratch_root to absolute paths; execute converts FileNotFoundError/PermissionError to `unconfigured` (code `binary_missing`) and BlockedArgument to `forbidden` (code `blocked_argument`), checks `request.source_id == op.connector_id` (else `forbidden`, code `source_mismatch`) and `freshness == "live_required"` against `data_source == "local"` (else `unavailable`, code `freshness_unmet`); `.env.example` CONNECTOR_BIN_DIR made consistent with the default. Cost if wrong: error-code names, contract-level.
Final: Ruling (Imp 3): run_command refuses any command whose manifest disposition is not in `allowed_dispositions` (keyword, default {"public_read","diagnostic"}) with BlockedArgument. Cost if wrong: P1 sync jobs pass an explicit wider set.
Final: Ruling (Imp 4): run_command verifies the binary's sha256 against manifest.binary_sha256 before spawn (mismatch → BlockedArgument, mapped by execute to `unconfigured`, code `binary_digest_mismatch`) and execute passes the digest as `artifact_hash`; README wording kept; P0-EXIT records that digests are per build host (darwin/arm64 here) and manifests must be regenerated on another host. Cost if wrong: one sha256 per spawn (10–20 MB read; acceptable for P0, cacheable in P1).
Final: Ruling (Imp 5): schedule.search `expected_from` returns None (section total unknown); the course-scan completeness stays visible via `truncated`. Cost if wrong: coverage.complete becomes None for that op.
Final: Ruling (Imp 6): no new fixture state in P0; docs/P0-EXIT.md and the plan's traceability claim are amended to state that §8 "stale cache" is covered by health.assess over observed_at rather than by a fixture state, and P1 adds a `stale` replay state when live captures exist. Cost if wrong: a missing fixture state P1 must add.
Final: Ruling (T7 --types): `execute` echoes applied defaults into coverage.scope — registry gains `Operation.applied_defaults: Callable[[dict], dict]` (default `lambda p: {}`); articulation.list returns `{"types": p.get("types","Department")}`, merged into coverage.scope. Cost if wrong: one scope key.
Final: Ruling (T9 masking): read_scope keeps returning None on failure (safe direction) but the new real-DDL test guarantees the column contract; a tri-state is deferred to P1. Cost if wrong: none now.
Final fix wave: implementer abf21f44562cca437 (opus), commits 6122972, 3849a3e, 9587abb, a3f17cb; 301 tests, 95.85%. Interpretations accepted by controller: verified digest travels on RunOutcome.binary_sha256 (None for replays) so fixtures keep artifact_hash null; I6 amended the seven-state row plus a limitations bullet.
