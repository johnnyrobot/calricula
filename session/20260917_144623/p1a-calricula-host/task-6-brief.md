### Task 6: Host-state components and the two routes (no package yet)

**Files:**
- Create: `frontend/src/components/applicationx/HostStatePanel.tsx`, `ContextBanner.tsx`, `WorkspaceSelector.tsx`, `index.ts`, `__tests__/HostStatePanel.test.tsx`, `__tests__/HostStatePanel.a11y.test.tsx`
- Create: `frontend/src/app/collaboration/page.tsx`, `frontend/src/app/programs/[id]/collaboration/page.tsx`

**Interfaces:**
- `HostStatePanel({ resolution, onRetry, standaloneUrl })`: renders per state using `luminous-card`; `access_required` → "You do not have ApplicationX access for this organization." with a `mailto:`-free "How to request access" note (text from the resolution message) and no data; `mapping_required` → "This program is not mapped to an ApplicationX workspace." with "Ask an ApplicationX administrator to map it"; `context_stale` → message + Retry; `session_expired` → `role="alert"` + "Sign in again" link to `/login`; `service_unavailable` → `role="alert"`, Retry when `retryable`, and the note "Curriculum editing is unaffected."; `version_mismatch` → explanatory text + standalone link when available. Small gold text uses `text-gold-ink`.
- `ContextBanner({ campusLabel, programTitle, revisionLabel, standaloneUrl, backHref })`: `<div role="region" aria-label="Workspace context">` showing college, program, revision, "Back to program" link and "Open in ApplicationX" (`target="_blank" rel="noopener"`).
- `WorkspaceSelector({ onSelect })`: P1a shows the sentence "Open a program page and choose Collaboration to enter its workspace" plus the list of the user's programs from `api.getPrograms()`? No — keep P1a minimal: it links to `/programs` (the authorized selector proper arrives with P2 workspaces listing). Document this in the page.
- `/collaboration/page.tsx`: `'use client'`, wraps in `PageShell`, `<h1>Employer & Career Collaboration</h1>`, resolves with `program_id: null, workspace_id: null` to surface `access_required`/`service_unavailable`/`session_expired` states early; when `ready` is impossible without a workspace, shows `WorkspaceSelector`.
- `/programs/[id]/collaboration/page.tsx`: `'use client'`, `PageShell`, loads the program via `api.getProgram(id)` for the title, computes `context_id = `${id}:${program.updated_at}``, calls `resolveContext` with an `AbortController` per `context_id`, ignores stale responses, renders `ContextBanner` + `HostStatePanel` or a placeholder `luminous-card` "Workspace ready — chat arrives with the shared package" until Task 8. Back link `/programs/${id}`. Uses `useAuth().getToken()` before every call; on `logout` (user becomes null) aborts and clears state.

- [ ] **Step 1: Write the failing tests**

`HostStatePanel.test.tsx` renders each state and asserts the copy above; `HostStatePanel.a11y.test.tsx` runs `jest-axe` on `service_unavailable` and `access_required` and asserts no violations; a third test asserts the panel never renders a `workspace_title` prop even if passed (the component accepts only `HostFailure`).

- [ ] **Step 2: Run** → module missing

- [ ] **Step 3: Implement** components and pages. Page skeleton (`programs/[id]/collaboration/page.tsx`):
```tsx
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import { useAuth } from '@/contexts/AuthContext';
import { api, type ProgramDetail } from '@/lib/api';
import { resolveContext } from '@/lib/applicationx/client';
import type { HostResolution } from '@/lib/applicationx/types';
import { useApplicationXStatus } from '@/hooks/useApplicationXStatus';
import { ContextBanner, HostStatePanel } from '@/components/applicationx';

export default function ProgramCollaborationPage() {
  const { id } = useParams<{ id: string }>();
  const { getToken, user } = useAuth();
  const { status } = useApplicationXStatus();
  const [program, setProgram] = useState<ProgramDetail | null>(null);
  const [resolution, setResolution] = useState<HostResolution | { state: 'loading' }>({ state: 'loading' });
  const latest = useRef<string>('');

  const resolve = useCallback(async (p: ProgramDetail) => {
    const contextId = `${p.id}:${p.updated_at}`; latest.current = contextId;
    const ctl = new AbortController(); const token = await getToken();
    if (!token) { setResolution({ state: 'session_expired', message: 'Sign in again.', retryable: false }); return; }
    try {
      const r = await resolveContext(token, { program_id: p.id, workspace_id: null, context_id: contextId }, ctl.signal);
      if (latest.current === contextId) setResolution(r);
    } catch (e) { if ((e as Error).name !== 'AbortError') setResolution({ state: 'service_unavailable', message: 'ApplicationX is unavailable.', retryable: true }); }
    return () => ctl.abort();
  }, [getToken]);

  useEffect(() => {
    let cancel: (() => void) | undefined;
    (async () => { const t = await getToken(); if (t) api.setToken(t); const p = await api.getProgram(id); setProgram(p); cancel = await resolve(p); })();
    return () => cancel?.();
  }, [id, getToken, resolve]);

  useEffect(() => { if (!user) { latest.current = ''; setResolution({ state: 'session_expired', message: 'Signed out.', retryable: false }); } }, [user]);

  return (
    <PageShell>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="font-serif text-2xl text-ink">Employer & Career Collaboration</h1>
        {program && resolution.state === 'ready' && (
          <ContextBanner campusLabel={resolution.campus_label} programTitle={program.title} revisionLabel={resolution.revision_label} standaloneUrl={status?.standalone_url ?? null} backHref={`/programs/${program.id}`} />
        )}
        {resolution.state === 'loading' && <p role="status">Checking workspace access…</p>}
        {resolution.state !== 'loading' && resolution.state !== 'ready' && (
          <HostStatePanel resolution={resolution} onRetry={() => program && resolve(program)} standaloneUrl={status?.standalone_url ?? null} />
        )}
        {resolution.state === 'ready' && <section aria-label="Workspace" className="luminous-card mt-6">Workspace ready. Chat arrives with the shared package.</section>}
      </div>
    </PageShell>
  );
}
```

- [ ] **Step 4: Run** `npm test && npm run build` → green (pages are excluded from coverage; components have tests)

- [ ] **Step 5: Commit** — `feat(frontend): collaboration routes with server-resolved host states and context banner`.

---

