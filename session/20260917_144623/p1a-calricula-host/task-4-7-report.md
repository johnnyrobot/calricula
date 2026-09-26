# Task 4 & 7 report: ApplicationX frontend client, status hook, brokered adapter, SSE

## Task 4 — client.ts, types.ts, useApplicationXStatus.ts

### Files
- `frontend/src/lib/applicationx/types.ts` (new)
- `frontend/src/lib/applicationx/client.ts` (new)
- `frontend/src/hooks/useApplicationXStatus.ts` (new)
- `frontend/src/lib/applicationx/__tests__/client.test.ts` (new)
- `frontend/src/hooks/__tests__/useApplicationXStatus.test.tsx` (new, directory created)

### TDD evidence

RED:
```
$ npx jest src/lib/applicationx src/hooks/__tests__/useApplicationXStatus.test.tsx --coverage=false
FAIL src/hooks/__tests__/useApplicationXStatus.test.tsx
  Cannot find module '../../lib/applicationx/client' from 'src/hooks/__tests__/useApplicationXStatus.test.tsx'
FAIL src/lib/applicationx/__tests__/client.test.ts
  Cannot find module '../client' from 'src/lib/applicationx/__tests__/client.test.ts'
Test Suites: 2 failed, 2 total
```

GREEN (after implementing `types.ts`, `client.ts`, `useApplicationXStatus.ts`):
```
$ npx jest src/lib/applicationx src/hooks/__tests__/useApplicationXStatus.test.tsx --coverage=false
PASS src/lib/applicationx/__tests__/client.test.ts
PASS src/hooks/__tests__/useApplicationXStatus.test.tsx
Test Suites: 2 passed, 2 total
Tests:       10 passed, 10 total
```

### Implementation notes / deviations from the brief

- **Controller resolution #1 applied**: `resolveContext` and `op` take an `AXTokens` object (`{ calricula: string; applicationx: string }`) instead of a single `token`, and send both `Authorization: Bearer <calricula>` and `X-ApplicationX-Token: <applicationx>`. `getStatus(token)` is unchanged (single Calricula token — `/api/applicationx/status` doesn't require an upstream token per `backend/app/api/routes/applicationx.py`). `eventsUrl(runId)` is unchanged. Tests assert both headers are present on `resolveContext`.
- **`apiBase()`** reuses the exact expression from `frontend/src/lib/api.ts:9` (`process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'`) — no shared export existed there to import, so the expression is duplicated verbatim as instructed by the brief/resolution #6 (no separate constant was exported from `api.ts` to reuse).
- **`types.ts`** mirrors `applicationx/packages/workspace-ui/src/contracts/{host,chat}.ts` as plain interfaces/types only — the `zod` schema exports (`ResolvedContextSchema`, `HostFailureSchema`, `HostResolutionSchema`, `CitationSchema`, `ChatAnswerSchema`) were intentionally omitted since Calricula has no `zod` dependency and the resolution says not to add it. Header comment added per resolution #3.
- **`useApplicationXStatus`**: module-level `{ value, fetchedAt }` cache with 5-minute TTL, `resetApplicationXStatusCache()` exported for tests, fetches only when `useAuth().isAuthenticated` is true, degrades to the disabled shape on any error (including a missing token). An in-flight promise is deduplicated at module scope so two mounted instances during the same fetch window only call `getStatus` once (verified by the "second render does not refetch" test, which checks `toHaveBeenCalledTimes(1)`).
- Test file mocks `@/contexts/AuthContext` and `../../lib/applicationx/client` per the brief; uses `@testing-library/react`'s `renderHook`/`waitFor` (already a devDependency, used elsewhere in the repo).

## Task 7 — adapter.ts, sse.ts

### Files
- `frontend/src/lib/applicationx/sse.ts` (new)
- `frontend/src/lib/applicationx/adapter.ts` (new)
- `frontend/src/lib/applicationx/__tests__/sse.test.ts` (new)
- `frontend/src/lib/applicationx/__tests__/adapter.test.ts` (new)

### TDD evidence

RED (sse.ts temporarily removed, adapter.ts never existed):
```
$ npx jest src/lib/applicationx/__tests__/sse.test.ts src/lib/applicationx/__tests__/adapter.test.ts --coverage=false
FAIL src/lib/applicationx/__tests__/adapter.test.ts — Cannot find module '../sse'
FAIL src/lib/applicationx/__tests__/sse.test.ts — Cannot find module '../sse'
Test Suites: 2 failed, 2 total
```

GREEN (sse.ts restored, adapter.ts implemented):
```
$ npx jest src/lib/applicationx --coverage=false
PASS src/lib/applicationx/__tests__/sse.test.ts
PASS src/lib/applicationx/__tests__/adapter.test.ts
PASS src/lib/applicationx/__tests__/client.test.ts
Test Suites: 3 passed, 3 total
Tests:       21 passed, 21 total
```

### Implementation notes / deviations from the brief

- **`sse.ts`** is a line-for-line port of `applicationx/packages/workspace-ui/src/transport/sse.ts` (read-only reference, never modified). Signature kept exactly as in the source, including the optional `options: SubscribeSSEOptions` fifth-ish parameter (`maxRetries`, `retryDelayMs`) — this is a superset of the brief's stated 5-arg signature (`fetchImpl, url, headers, cursor, signal`) but doesn't change any call site since the extra parameter has a default. Called this out explicitly per the task instructions ("note any difference in your report").
- **`adapter.ts`** — `createBrokeredAdapter({ getToken, router, standaloneUrl })`:
  - Resolves both tokens in parallel (`Promise.all([getToken(), getToken('applicationx')])`) before every `resolveContext`/`request`/`subscribe` call, per controller resolution #2.
  - `resolveContext`: on a missing token, resolves `{ state: 'session_expired', message: 'Your session expired. Sign in again.', retryable: false }` without calling the client. Otherwise delegates to `client.resolveContext(tokens, { program_id: ctx.program_ref?.external_id ?? null, workspace_id: ctx.workspace_id, context_id: ctx.context_id }, signal)`.
  - `request<T>`: on a missing token, throws `Error('session_expired')` with `.code = 'session_expired'`. Maps `chat.messages` → `op(tokens, 'chat.messages', {}, parameters, signal)`; `chat.cancel` → `op(tokens, 'chat.cancel', { run_id: parameters.run_id }, null, signal)`; `sources.list`/`sources.health` → same shape as `chat.messages` (`op(tokens, operation, {}, parameters, signal)`) — the brief says these are handled "likewise" without specifying which of the two prior patterns; I chose the `chat.messages` shape (empty `path_params`, params as body) since neither operation names a path parameter analogous to `run_id`. Any other operation throws `Error(...)` with `.code = 'unknown_operation'`.
  - `subscribe`: an async generator; throws `session_expired` before yielding if either token is missing, otherwise delegates to `subscribeSSE(fetch, eventsUrl(runId), { Authorization: 'Bearer <calricula>', 'X-ApplicationX-Token': '<applicationx>' }, cursor, signal)` — both headers per controller resolution #1 (the brief's Task 7 text only mentions a single `Authorization` header; the SSE test asserts both).
  - `navigateToProgram(ref)` → `router.push('/programs/' + ref.external_id)`.
  - `openStandalone(workspaceId)` → no-op when `standaloneUrl` is falsy; otherwise `window.open(standaloneUrl + '/workspaces/' + workspaceId, '_blank', 'noopener')`.
- Test-environment gaps discovered and worked around **in the test files only** (not in production code): jsdom in this repo's Jest config has no global `fetch`, `TextEncoder`, `TextDecoder`, or `ReadableStream`. `sse.test.ts` polyfills `TextEncoder`/`TextDecoder`/`ReadableStream` from Node's `util` and `stream/web` (guarded by `typeof global.X === 'undefined'` so it's a no-op if a future jsdom version adds them). `adapter.test.ts` stubs `global.fetch` with a `jest.fn()` before importing the module under test, since `adapter.ts` calls the ambient `fetch` directly (as the brief specifies) rather than accepting it as a parameter.

## Lint fix

`useApplicationXStatus.ts` initially had one line (`setStatus(DISABLED_STATUS)` inside the `!isAuthenticated` early-return branch of the effect) that tripped `react-hooks/set-state-in-effect` as an **error** (0-errors required by the task). Fixed by adding the same `eslint-disable-next-line react-hooks/set-state-in-effect -- ...` idiom used throughout this codebase for manual data-fetch effects (e.g. `src/app/programs/page.tsx:271`, `src/contexts/AuthContext.tsx:416`). The `fresh`-cache branch's `setStatus(cache!.value)` was *not* flagged (confirmed by re-running eslint, which reported "Unused eslint-disable directive" when a matching comment was added there), so no disable comment was added on that line — only on the `DISABLED_STATUS` line.

This fix was folded into the Task 4 commit (it touches `useApplicationXStatus.ts`, a Task-4-owned file) via a `git reset --soft HEAD~2` + re-split + re-commit, done before any push/report, so the "one commit per task, as specified" requirement holds with clean file ownership per commit.

## Verification commands and results

```
$ cd frontend && npx jest src/lib/applicationx src/hooks
Test Suites: 4 passed, 4 total
Tests:       24 passed, 24 total

$ npm test
Test Suites: 21 passed, 21 total
Tests:       385 passed, 385 total
(coverage thresholds: all met — global and the four per-file pins)

$ npm run build
✓ Compiled successfully in 2.7s
  Running TypeScript ... Finished TypeScript in 4.7s
  ✓ Generating static pages using 11 workers (19/19)

$ npm run lint
✖ 83 problems (0 errors, 83 warnings)
```

All 83 warnings are pre-existing, in files this task didn't touch (unused imports/vars in `LMIDetailView.tsx`, `LMIPanel.tsx`, `NotificationBell.tsx`, `RequisitesEditor.tsx`, `ReviewSection.tsx`, `SLOEditor.tsx`, `ToastContext.tsx`, `Toast.test.tsx`, `VersionHistoryPanel.tsx`, `ApprovalActions.tsx`, `WorkflowHistoryPanel.tsx`, `WorkflowProgressBar.tsx`, `ThemeContext.tsx`, `useUserCourses.ts`, `swr.ts`). Zero errors.

Also ran `npx tsc --noEmit -p .` directly and grepped for `applicationx`/`useApplicationXStatus` — no output, i.e. no type errors in the new files (the `npm run build` TypeScript pass above confirms this project-wide).

## Files changed (final commits)

Commit `5f0471a` — `feat(frontend): ApplicationX client and status hook`:
- `frontend/src/lib/applicationx/types.ts`
- `frontend/src/lib/applicationx/client.ts`
- `frontend/src/lib/applicationx/__tests__/client.test.ts`
- `frontend/src/hooks/useApplicationXStatus.ts`
- `frontend/src/hooks/__tests__/useApplicationXStatus.test.tsx`

Commit `d59a677` — `feat(frontend): brokered ApplicationX host adapter with resumable SSE`:
- `frontend/src/lib/applicationx/sse.ts`
- `frontend/src/lib/applicationx/adapter.ts`
- `frontend/src/lib/applicationx/__tests__/sse.test.ts`
- `frontend/src/lib/applicationx/__tests__/adapter.test.ts`

## Self-review

- **Completeness against both briefs + resolutions**: all five listed interfaces (`getStatus`, `resolveContext`, `op`, `eventsUrl`, `useApplicationXStatus`) and both Task 7 exports (`createBrokeredAdapter`, `subscribeSSE`) are implemented with the resolved two-token/two-header contract throughout. `types.ts` covers all nine named types (`HostKind`, `ProgramRef`, `WorkspaceHostContext`, `HostState`, `ResolvedContext`, `HostFailure`, `HostResolution`, `WorkspaceEvent`, `WorkspaceHostAdapter`, plus `Citation`, `ChatAnswer` — eleven total including the chat contracts).
- **Names**: match the briefs' exact identifiers (`getStatus`, `resolveContext`, `op`, `eventsUrl`, `apiBase`, `useApplicationXStatus`, `createBrokeredAdapter`, `subscribeSSE`) plus the required `resetApplicationXStatusCache` test helper.
- **YAGNI**: no extra exports, no speculative operations beyond the four named in the brief (`chat.messages`, `chat.cancel`, `sources.list`, `sources.health`); unknown operations reject cleanly.
- **Tests verify real behaviour**: `client.test.ts` and `sse.test.ts` stub `fetch`/`ReadableStream` directly rather than mocking the modules under test. `adapter.test.ts` mocks `../client` and `../sse` (the adapter's own collaborators) — appropriate since the adapter's job is to be a thin router over those two modules, and their own behavior is independently tested in `client.test.ts` / `sse.test.ts`. `useApplicationXStatus.test.tsx` mocks `AuthContext` and `client` per the brief's explicit instruction.
- **Clean test output**: ran the full `npm test` — no `act()` warnings or other console noise from the new test files.

## Concerns

- None blocking. One judgment call flagged above: the `sources.list`/`sources.health` → `op(...)` argument shape ("likewise") was ambiguous between the two patterns shown for `chat.messages` vs `chat.cancel`; I chose the `chat.messages` shape. If the actual ApplicationX ops registry expects a path parameter for these operations, that mapping will need a one-line change in `adapter.ts`'s `request` switch.

---

## Fix report (post-review)

Three findings from task review were fixed in commit `4d424aa` — `fix(frontend): route sources.health as path param, GET ops send no body`.

### 1. Critical — `sources.health` path param (`frontend/src/lib/applicationx/adapter.ts`)

The broker (`backend/app/services/applicationx_broker.py:24`) defines `sources.health` as `GET /v1/sources/{source_id}/health`; `_path()` there returns 400 `bad_path_param` when a required path segment (`source_id`) is missing. The adapter's `request` switch previously grouped `sources.health` with `chat.messages`/`sources.list` (`op(tokens, operation, {}, parameters, signal)` — empty `path_params`, `parameters` as body), which would send `source_id` as body JSON instead of a path param, and would 400 at the broker.

Fixed:
- `sources.health` is now its own case: validates `parameters.source_id` is present (rejects client-side with `Error('sources.health requires a source_id')` / `.code = 'missing_source_id'` if not — no request sent), then calls `op(tokens, 'sources.health', { source_id: String(parameters.source_id) }, null, signal)` — `source_id` in `path_params`, `null` body, matching the `chat.cancel` shape as the review specified.
- `sources.list` (`GET /v1/sources`, no path params) now sends `op(tokens, 'sources.list', {}, null, signal)` — this also closes Minor finding #3 below.

### 2. Minor — misleading eslint-disable rationale (`frontend/src/hooks/useApplicationXStatus.ts`)

The prior `// eslint-disable-next-line react-hooks/exhaustive-deps -- getToken is stable per AuthProvider render` was factually wrong: `AuthContext.tsx:564` defines `getToken` as a plain arrow function inside the provider body, not wrapped in `useCallback`, so it's a new function identity on every render.

Restructured instead of just fixing the comment: `getToken` is now read through a `useRef` (`getTokenRef`), synced in its own `useEffect(() => { getTokenRef.current = getToken; })` (writing to a ref during render is itself disallowed by the `react-hooks/refs` rule, confirmed by re-running eslint — see below). The fetch effect calls `getTokenRef.current()` from its async callback and its dependency array is legitimately just `[isAuthenticated]` — no suppression comment needed or present anymore. This also fixes a latent staleness bug: previously, on a slow-loading token module, a stale closed-over `getToken` could have been invoked if the component's props/context changed between render and the async callback firing; the ref always holds the most recent one.

### 3. Minor — GET ops sending an unused body

Covered by the `sources.list`/`sources.health` fix above — both now pass `null` as the body argument to `op(...)` since neither is a POST-with-payload operation.

### New/updated tests

`frontend/src/lib/applicationx/__tests__/adapter.test.ts` — added:
- `request sends sources.list with empty path_params and a null body` — asserts `mockOp` called with `({calricula,applicationx}, 'sources.list', {}, null, signal)`.
- `request sends sources.health with source_id as a path param and a null body` — asserts `mockOp` called with `({calricula,applicationx}, 'sources.health', {source_id:'bls'}, null, signal)`.
- `request rejects sources.health without a source_id instead of sending it` — asserts the call rejects with `{ code: 'missing_source_id' }` and that `mockOp` is never invoked (i.e. the bad request is never sent, per the review's explicit ask).

No hook-test changes were needed for `useApplicationXStatus.test.tsx` — the ref-based restructuring is an internal implementation detail; its existing three tests (initial fetch, cache dedup, error degradation) already cover the observable behavior and still pass unchanged.

### Commands and output

```
$ cd frontend && npx eslint src/hooks/useApplicationXStatus.ts src/lib/applicationx/adapter.ts src/lib/applicationx/__tests__/adapter.test.ts
(no output — clean)

$ npx jest src/lib/applicationx src/hooks --coverage=false
PASS src/hooks/__tests__/useApplicationXStatus.test.tsx
PASS src/lib/applicationx/__tests__/client.test.ts
PASS src/lib/applicationx/__tests__/sse.test.ts
PASS src/lib/applicationx/__tests__/adapter.test.ts
Test Suites: 4 passed, 4 total
Tests:       27 passed, 27 total

$ npm test
Test Suites: 21 passed, 21 total
Tests:       388 passed, 388 total
(coverage thresholds: all met)

$ npm run lint
✖ 83 problems (0 errors, 83 warnings)
```

83 warnings are the same pre-existing ones in untouched files noted in the original report; 0 errors. All three findings resolved in a single commit `4d424aa` with the standard trailer.
