# Task 14 report: Contracts-only TypeScript package (`@applicationx/workspace-ui` v0.0.x)

## What was implemented

- `backend/app/connectors/replay.py`: added `HAPPY_PARAMS` (moved verbatim from
  `backend/tests/test_operation_fixtures.py`), the minimal valid parameter map per
  operation used for replay. `pathways.bottlenecks` kept its existing `{}` entry
  (Task 7 ruling), unchanged by the move.
- `backend/tests/test_operation_fixtures.py`: removed the local `HAPPY` dict, now
  imports `HAPPY_PARAMS as HAPPY` from `app.connectors.replay`. No other change to
  the test file.
- `scripts/export_normalized_fixtures.py`: new script. Iterates `sorted(REGISTRY)` x
  `("success", "empty", "partial")`, builds a `ConnectorRequest` per the brief
  (`principal_context={"principal": "public"}`, `scope=Scope(campus="LAMC",
  term="2268")`, `parameters=HAPPY_PARAMS[op]`), runs `execute(op, req,
  runner=lambda *a, **k: load_outcome(...))`, and writes
  `fixtures/normalized/connector_results.json` as a JSON list of
  `ConnectorResult.model_dump(mode="json")`, `indent=2, sort_keys=True`, trailing
  newline. Prints `"{n} results written"`.
- `fixtures/normalized/connector_results.json`: committed, 75 entries (25
  operations x 3 states).
- `packages/workspace-ui/`: new package.
  - `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`
    (`node_modules/`, `dist/`).
  - `src/contracts/connector.ts`: `ConnectorResultSchema` + related zod schemas,
    copied verbatim from the brief.
  - `src/contracts/host.ts`: `HostKind`, `ProgramRef`, `WorkspaceHostContext`,
    `HostState`, `ResolvedContext`, `HostFailure`, `HostResolution`,
    `WorkspaceEvent`, `WorkspaceHostAdapter` interfaces (verbatim from the
    brief's Interfaces block), plus `ResolvedContextSchema`, `HostFailureSchema`,
    and `HostResolutionSchema = z.union([ResolvedContextSchema,
    HostFailureSchema])`.
  - `src/contracts/chat.ts`: `Citation`, `ChatAnswer` interfaces (verbatim),
    plus `CitationSchema` and `ChatAnswerSchema`.
  - `src/index.ts`: re-exports `./contracts/connector`, `./contracts/host`,
    `./contracts/chat`.
  - `src/contracts/__tests__/parity.test.ts`: the brief's three tests.
- `package-lock.json` committed (npm ci-compatible).

## Deviation from the brief

- **`__dirname` in the parity test.** The brief's test text uses bare `__dirname`.
  Under this package's config (`"type": "module"`, `moduleResolution: bundler`,
  vitest 2.1.9 running the test as ESM), I verified rather than assumed: a
  first pass using bare `__dirname` ran clean under vitest (vitest does inject a
  CJS-style `__dirname`/`__filename` shim for test files), but to keep the file
  correct under plain `tsc`/other ESM runners too, I replaced it with the
  explicit, portable form:
  ```ts
  import { fileURLToPath } from 'node:url';
  const __dirname = dirname(fileURLToPath(import.meta.url));
  ```
  This is the only change to the brief's test file; all three assertions are
  unchanged.
- Everything else (file paths, schemas, interfaces, script behavior, commit
  message) follows the brief verbatim.

## Dependency versions actually installed

Requested (brief) -> resolved (package-lock.json):
- `zod ^3.23.8` -> `3.25.76`
- `typescript ^5.5.0` -> `5.9.3`
- `vitest ^2.1.0` -> `2.1.9`
- `@types/node ^20.10.6` -> `20.19.43`
- `@types/react ^19.0.0` -> `19.3.0`

All resolved on the requested major version; no substitutions needed.
`react`/`react-dom` remain peer dependencies only (not installed, not needed —
no React code in this package).

## Export script output and determinism check

```
$ .venv/bin/python ../scripts/export_normalized_fixtures.py
75 results written
```

Ran twice in a row; `md5sum fixtures/normalized/connector_results.json` was
identical both times (`3ce6e7d3f16f3bac757375e230e99970`), and `git diff --stat`
against the committed file showed no changes after the second run. Deterministic.

`python3 -c "import json; print(len(json.load(open('fixtures/normalized/connector_results.json'))))"`
-> `75`.

## vitest and build output

```
$ npx vitest run
 RUN  v2.1.9 /Users/laccd/code/applicationx/packages/workspace-ui
 ✓ src/contracts/__tests__/parity.test.ts (3 tests) 8ms
 Test Files  1 passed (1)
      Tests  3 passed (3)
```
No warnings.

```
$ npm run build
> tsc -p tsconfig.json
```
Exited 0, produced `dist/index.js`, `dist/index.d.ts`, `dist/contracts/*` cleanly.
`dist/` and `node_modules/` confirmed ignored via `git status --porcelain
--ignored` (both showed as `!!`), not staged.

## Backend suite summary

```
$ cd backend && .venv/bin/python -m pytest -q
................................................................ (296 passed)
Required test coverage of 70% reached. Total coverage: 95.88%
```
All green, no warnings, coverage floor cleared by a wide margin. The `HAPPY_PARAMS`
move did not change any test's behavior — only its import source.

## Files changed

- `backend/app/connectors/replay.py` (modified — added `HAPPY_PARAMS`)
- `backend/tests/test_operation_fixtures.py` (modified — import moved dict)
- `scripts/export_normalized_fixtures.py` (new)
- `fixtures/normalized/connector_results.json` (new, committed)
- `packages/workspace-ui/package.json` (new)
- `packages/workspace-ui/package-lock.json` (new)
- `packages/workspace-ui/tsconfig.json` (new)
- `packages/workspace-ui/vitest.config.ts` (new)
- `packages/workspace-ui/.gitignore` (new)
- `packages/workspace-ui/src/index.ts` (new)
- `packages/workspace-ui/src/contracts/connector.ts` (new)
- `packages/workspace-ui/src/contracts/host.ts` (new)
- `packages/workspace-ui/src/contracts/chat.ts` (new)
- `packages/workspace-ui/src/contracts/__tests__/parity.test.ts` (new)

## Self-review

- **Completeness**: all brief files present; 75 normalized results confirmed;
  interfaces transcribed verbatim (diffed by eye against the brief's code
  block — `HostKind`, `ProgramRef`, `WorkspaceHostContext`, `HostState`,
  `ResolvedContext`, `HostFailure`, `HostResolution`, `WorkspaceHostAdapter`,
  `WorkspaceEvent`, `Citation`, `ChatAnswer` all match field-for-field).
- **Quality**: schemas mirror the Python `Coverage`/`ConnectorResult`
  validators' refinements exactly (expected=0 + retrieved>0 rejected; status=ok
  + non-empty errors rejected). `HostResolutionSchema` accepts `ready` and the
  six failure states, rejects unknown states — matches the test.
- **Discipline**: no React components, no extra exports, no extra files beyond
  the brief's list. `package.json` has zero non-peer runtime deps beyond `zod`.
- **Testing**: all three parity assertions are real (fixture parse count,
  explicit contradiction fixture, explicit host state enumeration) — none are
  placeholders. Vitest output is clean (3/3, no warnings). Build output is
  clean (no tsc errors/warnings).
- Confirmed `git status --porcelain` only shows the intended file set before
  committing (`packages/`, `scripts/export_normalized_fixtures.py`,
  `fixtures/normalized/`, and the two modified backend files); `dist/` and
  `node_modules/` are ignored, not staged.

## Concerns

None. Task completed as specified; the one deviation (explicit `fileURLToPath`
instead of bare `__dirname`) is a minimal, verified correctness improvement to
the brief's test file, not a behavior change.

## Fix round 1 (review findings)

### Findings addressed

1. **(Important, plan-mandated)** `ConnectorResultSchema` only refined the
   `ok`-with-errors half of the Python `_status_consistency` validator. Added a
   second `.refine` in `packages/workspace-ui/src/contracts/connector.ts`:
   ```ts
   const FAILURE_STATUSES = ['unavailable', 'unconfigured', 'forbidden'] as const;
   ...
   .refine((r) => !((FAILURE_STATUSES as readonly string[]).includes(r.status) && r.errors.length === 0),
     { message: 'failure statuses require at least one error' });
   ```
   Added a parity test (`rejects failure statuses with no errors and accepts
   them with at least one error`) in `parity.test.ts`: for each of
   `unavailable`/`unconfigured`/`forbidden`, an otherwise-valid result with
   `errors: []` fails `safeParse`, and the same result with one error
   `{code:'x', retryable:false, safe_message:'m'}` succeeds.

2. **(Minor, folded in)** Mirrored the Pydantic/JSON-Schema defaults: changed
   `schema_version: z.string()` -> `z.string().default('1')` and
   `errors: z.array(ConnectorErrorSchema)` -> `z.array(ConnectorErrorSchema).default([])`
   in `ConnectorResultSchema`. Added a test (`applies Python-matching defaults
   when schema_version and errors are omitted`) that parses an object missing
   both keys and asserts `schema_version === '1'` and `errors` deep-equals
   `[]`. Confirmed zod applies `.default()` per-field before the object-level
   `.refine()` calls run — both refines see `r.errors` as a real (possibly
   empty) array, never `undefined`, so no refine-side null check was needed.

### Files changed

- `packages/workspace-ui/src/contracts/connector.ts` (modified)
- `packages/workspace-ui/src/contracts/__tests__/parity.test.ts` (modified —
  two new tests, five total)

### Commands and output

```
$ cd packages/workspace-ui && npm run build
> tsc -p tsconfig.json
(exit 0, no output)

$ npx vitest run
 RUN  v2.1.9 /Users/laccd/code/applicationx/packages/workspace-ui
 ✓ src/contracts/__tests__/parity.test.ts (5 tests) 9ms
 Test Files  1 passed (1)
      Tests  5 passed (5)
```
No warnings. Backend untouched, not re-run (no backend files changed in this
round).

### Commit

`0364bdb fix(workspace-ui): mirror failure-status and default rules of the
Python contract`, trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
