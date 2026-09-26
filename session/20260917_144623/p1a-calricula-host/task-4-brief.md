### Task 4: Frontend client and status hook

**Files:**
- Create: `frontend/src/lib/applicationx/types.ts`, `frontend/src/lib/applicationx/client.ts`, `frontend/src/hooks/useApplicationXStatus.ts`
- Test: `frontend/src/lib/applicationx/__tests__/client.test.ts`, `frontend/src/hooks/__tests__/useApplicationXStatus.test.tsx`

**Interfaces:**
- `types.ts` mirrors the package contracts (`HostState`, `HostResolution`, `ChatAnswer`, `WorkspaceEvent`) so Tasks 4–7 compile before the package is a dependency; Task 8 replaces the file with `export * from '@applicationx/workspace-ui'`.
- `client.ts`: `apiBase()` returns `process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'` (same as `api.ts:9`); `getStatus(token) -> Promise<AXStatus>`; `resolveContext(token, {program_id, workspace_id, context_id}, signal) -> Promise<HostResolution>` mapping HTTP 401 → `{state:'session_expired'}`, 503 `embed_disabled`/502/504 → `{state:'service_unavailable', retryable:true}`, other non-2xx → `{state:'service_unavailable', retryable:false}`; `op(token, operation, path_params, body, signal)`; `eventsUrl(runId)`.
- `useApplicationXStatus() -> { status: AXStatus|null, loading: boolean }`: fetches once per session using `useAuth().getToken()`; caches in module scope for 5 minutes; returns `enabled:false` on any error.

- [ ] **Step 1: Write the failing tests**

`client.test.ts`:
```ts
import { getStatus, resolveContext } from '../client';
const mockFetch = jest.fn(); global.fetch = mockFetch as any;
beforeEach(() => mockFetch.mockReset());

test('getStatus sends bearer and parses', async () => {
  mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ enabled: true, organization_ref: 'lamc', campus_ref: 'LAMC', standalone_url: null, api_version: null }) });
  const s = await getStatus('tok');
  expect(mockFetch.mock.calls[0][0]).toMatch(/\/api\/applicationx\/status$/);
  expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
  expect(s.enabled).toBe(true);
});
test.each([[401, 'session_expired', false], [503, 'service_unavailable', true], [502, 'service_unavailable', true], [500, 'service_unavailable', false]])(
  'resolveContext maps %s', async (code, state, retryable) => {
    mockFetch.mockResolvedValue({ ok: false, status: code, json: async () => ({ detail: { code: 'x' } }) });
    const r = await resolveContext('tok', { program_id: 'p', workspace_id: null, context_id: 'c' }, new AbortController().signal);
    expect(r).toMatchObject({ state, retryable });
  });
test('resolveContext returns typed upstream state verbatim', async () => {
  mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ state: 'mapping_required', message: 'm', retryable: false }) });
  expect((await resolveContext('tok', { program_id: 'p', workspace_id: null, context_id: 'c' }, new AbortController().signal)).state).toBe('mapping_required');
});
```
`useApplicationXStatus.test.tsx` mocks `@/contexts/AuthContext` (`useAuth: () => ({ getToken: async () => 'tok', isAuthenticated: true })`) and `../../lib/applicationx/client` (`getStatus`), asserting `enabled` is exposed, a second render does not refetch, and a rejected `getStatus` yields `enabled:false`.

- [ ] **Step 2: Run** `cd frontend && npx jest src/lib/applicationx src/hooks/__tests__/useApplicationXStatus.test.tsx` → module-not-found failures

- [ ] **Step 3: Implement**

`client.ts`:
```ts
import type { HostResolution } from './types';
export interface AXStatus { enabled: boolean; organization_ref: string | null; campus_ref: string | null; standalone_url: string | null; api_version: string | null; }
export const apiBase = () => process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';
const auth = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

export async function getStatus(token: string): Promise<AXStatus> {
  const r = await fetch(`${apiBase()}/api/applicationx/status`, { headers: auth(token) });
  if (!r.ok) throw new Error(`status ${r.status}`);
  return r.json();
}
export async function resolveContext(token: string, body: { program_id: string | null; workspace_id: string | null; context_id: string }, signal: AbortSignal): Promise<HostResolution> {
  let r: Response;
  try { r = await fetch(`${apiBase()}/api/applicationx/host-contexts/resolve`, { method: 'POST', headers: auth(token), body: JSON.stringify(body), signal }); }
  catch (e) { if ((e as Error).name === 'AbortError') throw e; return { state: 'service_unavailable', message: 'ApplicationX could not be reached.', retryable: true }; }
  if (r.status === 401) return { state: 'session_expired', message: 'Your session expired. Sign in again.', retryable: false };
  if ([502, 503, 504].includes(r.status)) return { state: 'service_unavailable', message: 'ApplicationX is unavailable right now.', retryable: true };
  if (!r.ok) return { state: 'service_unavailable', message: 'ApplicationX returned an unexpected response.', retryable: false };
  return r.json();
}
export async function op<T>(token: string, operation: string, path_params: Record<string, string>, body: unknown, signal: AbortSignal): Promise<T> {
  const r = await fetch(`${apiBase()}/api/applicationx/ops/${operation}`, { method: 'POST', headers: auth(token), body: JSON.stringify({ path_params, body }), signal });
  if (r.status === 401) throw Object.assign(new Error('session_expired'), { code: 'session_expired' });
  if (!r.ok) throw Object.assign(new Error(`op ${operation} ${r.status}`), { code: r.status >= 500 ? 'service_unavailable' : 'rejected', status: r.status });
  return r.json();
}
export const eventsUrl = (runId: string) => `${apiBase()}/api/applicationx/runs/${encodeURIComponent(runId)}/events`;
```
`useApplicationXStatus.ts` follows the `isDemoModeEnabled` idiom for the env and uses `useEffect` + a module-level `{ value, fetchedAt }` cache.

- [ ] **Step 4: Run** → 7 passed

- [ ] **Step 5: Commit** — `feat(frontend): ApplicationX client and status hook`.

---

