'use client';

// ===========================================
// Program Collaboration — embedded ApplicationX workspace for one program
// ===========================================
// context_id = `${program.id}:${program.updated_at}` — a program edit
// produces a new context, which is how the host detects `context_stale`.
// One AbortController per context; a late response for a superseded
// context is ignored.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import PageShell from '@/components/layout/PageShell';
import { useAuth } from '@/contexts/AuthContext';
import { useApplicationXStatus } from '@/hooks/useApplicationXStatus';
import { api, type ProgramDetail } from '@/lib/api';
import { resolveContext } from '@/lib/applicationx/client';
import type { HostResolution } from '@/lib/applicationx/types';
import { ContextBanner, HostStatePanel } from '@/components/applicationx';

type PageResolution = HostResolution | { state: 'loading' };

const SESSION_EXPIRED: HostResolution = {
  state: 'session_expired',
  message: 'Your session expired. Sign in again.',
  retryable: false,
};

export default function ProgramCollaborationPage() {
  const { id } = useParams<{ id: string }>();
  const { getToken, isAuthenticated, user } = useAuth();
  const { status } = useApplicationXStatus();
  const [program, setProgram] = useState<ProgramDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resolution, setResolution] = useState<PageResolution>({ state: 'loading' });

  // `getToken` is recreated on every AuthProvider render; read it through a
  // ref so the callbacks below stay stable (see useApplicationXStatus).
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  });
  const latestContext = useRef<string>('');
  const controller = useRef<AbortController | null>(null);

  const resolve = useCallback(async (p: ProgramDetail) => {
    const contextId = `${p.id}:${p.updated_at}`;
    controller.current?.abort();
    const ctl = new AbortController();
    controller.current = ctl;
    latestContext.current = contextId;
    setResolution({ state: 'loading' });

    const [calricula, applicationx] = await Promise.all([
      getTokenRef.current(),
      getTokenRef.current('applicationx'),
    ]);
    if (ctl.signal.aborted) return;
    if (!calricula || !applicationx) {
      setResolution(SESSION_EXPIRED);
      return;
    }
    try {
      const r = await resolveContext(
        { calricula, applicationx },
        { program_id: p.id, workspace_id: null, context_id: contextId },
        ctl.signal,
      );
      if (latestContext.current === contextId && !ctl.signal.aborted) setResolution(r);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      if (latestContext.current === contextId) {
        setResolution({ state: 'service_unavailable', message: 'ApplicationX is unavailable right now.', retryable: true });
      }
    }
  }, []);

  // Load the program (title + updated_at for the context id), then resolve.
  useEffect(() => {
    if (!isAuthenticated || !id) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getTokenRef.current();
        if (token) api.setToken(token);
        const p = await api.getProgram(id);
        if (cancelled) return;
        setProgram(p);
        resolve(p);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'Failed to load program');
      }
    })();
    return () => {
      cancelled = true;
      controller.current?.abort();
    };
  }, [id, isAuthenticated, resolve]);

  // Sign-out: abort in-flight work and never show stale host data.
  useEffect(() => {
    if (user) return;
    controller.current?.abort();
    latestContext.current = '';
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs host state to the auth external condition
    setResolution(SESSION_EXPIRED);
  }, [user]);

  const standaloneUrl = status?.standalone_url ?? null;

  return (
    <PageShell>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="font-serif text-2xl text-ink">Employer &amp; Career Collaboration</h1>

        {loadError && (
          <div role="alert" className="luminous-card mt-6">
            <p className="text-sm text-ink">Could not load this program: {loadError}</p>
          </div>
        )}

        {program && resolution.state === 'ready' && (
          <ContextBanner
            campusLabel={resolution.campus_label}
            programTitle={program.title}
            revisionLabel={resolution.revision_label}
            standaloneUrl={standaloneUrl}
            backHref={`/programs/${program.id}`}
          />
        )}

        {!loadError && resolution.state === 'loading' && (
          <p role="status" className="mt-6 text-sm text-muted">
            Checking workspace access…
          </p>
        )}

        {resolution.state !== 'loading' && resolution.state !== 'ready' && (
          <HostStatePanel
            resolution={resolution}
            onRetry={() => program && resolve(program)}
            standaloneUrl={standaloneUrl}
          />
        )}

        {resolution.state === 'ready' && (
          <section aria-label="Workspace" className="luminous-card mt-6">
            <p className="text-sm text-ink-soft">Workspace ready. Chat arrives with the shared package.</p>
          </section>
        )}
      </div>
    </PageShell>
  );
}
