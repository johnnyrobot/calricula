### Task 7: Brokered `WorkspaceHostAdapter` and SSE client

**Files:**
- Create: `frontend/src/lib/applicationx/adapter.ts`, `frontend/src/lib/applicationx/sse.ts`
- Test: `frontend/src/lib/applicationx/__tests__/adapter.test.ts`, `__tests__/sse.test.ts`

**Interfaces:**
- `createBrokeredAdapter({ getToken, router, standaloneUrl }): WorkspaceHostAdapter`:
  - `resolveContext(ctx, signal)` → `resolveContext(token, { program_id: ctx.program_ref?.external_id ?? null, workspace_id: ctx.workspace_id, context_id: ctx.context_id }, signal)`
  - `request('chat.messages', p, signal)` → `op(token, 'chat.messages', {}, p, signal)`; `request('chat.cancel', {run_id})` → `op(token, 'chat.cancel', {run_id}, null, signal)`; `request('sources.list'|'sources.health', …)` likewise; any other operation rejects with `unknown_operation`.
  - `subscribe(runId, cursor, signal)` → `subscribeSSE(fetch, eventsUrl(runId), { Authorization: `Bearer ${token}` }, cursor, signal)`
  - `navigateToProgram(ref)` → `router.push(`/programs/${ref.external_id}`)`; `openStandalone(workspaceId)` → `window.open(`${standaloneUrl}/workspaces/${workspaceId}`, '_blank', 'noopener')` when `standaloneUrl` is set.
- `sse.ts` is the same parser as the package's (copied now, replaced by the package export in Task 8).

- [ ] **Step 1: Write the failing tests** — adapter: bearer attached, unknown operation rejected, `openStandalone` no-op without URL, `subscribe` passes `Last-Event-ID`; sse: parses two events across a split chunk, stops at `done`, aborts on signal.

- [ ] **Step 2: Run** → module missing

- [ ] **Step 3: Implement** as specified (the SSE parser code is in the P1a service plan Task 11).

- [ ] **Step 4: Run** `npm test` → green, coverage gate intact

- [ ] **Step 5: Commit** — `feat(frontend): brokered ApplicationX host adapter with resumable SSE`.

---

