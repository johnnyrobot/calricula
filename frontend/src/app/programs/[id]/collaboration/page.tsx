'use client';

// ===========================================
// Program Collaboration — embedded ApplicationX workspace for one program
// ===========================================
// context_id = `${program.id}:${program.updated_at}` — a program edit
// produces a new context, which is how the host detects `context_stale`.
// Every load (mount, Retry) refetches the program so the context is always
// current. One AbortController per load; a late response for a superseded
// context is ignored.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
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
  const { getToken, isAuthenticated, loading: authLoading, user } = useAuth();
  const { status } = useApplicationXStatus();
  // `null` status means "not known yet" — only a definite `enabled: false`
  // short-circuits the broker call.
  const embedDisabled = status !== null && !status.enabled;
  const [program, setProgram] = useState<ProgramDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resolution, setResolution] = useState<PageResolution>({ state: 'loading' });

  // `getToken` is recreated on every AuthProvider render; read it through a
  // ref so the callbacks below stay stable (see useApplicationXStatus).
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  });
  // The context we most recently asked for; results for any other context
  // (a superseded load, or after sign-out) are dropped.
  const latestContext = useRef<string>('');
  const controller = useRef<AbortController | null>(null);

  // Refetch the program, then resolve the host context keyed on the fresh
  // `updated_at`. A program edit is a new context, so Retry (e.g. after
  // `context_stale`) must go through here rather than reuse the cached
  // program. One AbortController per load; starting a new load aborts the
  // previous one.
  const load = useCallback(async () => {
    controller.current?.abort();
    const ctl = new AbortController();
    controller.current = ctl;
    setLoadError(null);
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

    let p: ProgramDetail;
    try {
      api.setToken(calricula);
      p = await api.getProgram(id);
    } catch (err) {
      if (ctl.signal.aborted) return;
      setLoadError(err instanceof Error ? err.message : 'Failed to load program');
      return;
    }
    if (ctl.signal.aborted) return;
    setProgram(p);

    const contextId = `${p.id}:${p.updated_at}`;
    latestContext.current = contextId;
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
  }, [id]);

  useEffect(() => {
    if (!isAuthenticated || !id || embedDisabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- manual data-fetch effect; load sets loading/result state (no data-fetch library in use)
    load();
    return () => controller.current?.abort();
  }, [id, isAuthenticated, embedDisabled, load]);

  // Sign-out: abort in-flight work and never show stale host data. Skipped
  // while auth is still resolving on first mount (`user` is null then too).
  useEffect(() => {
    if (user || authLoading) return;
    controller.current?.abort();
    latestContext.current = '';
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs host state to the auth external condition
    setResolution(SESSION_EXPIRED);
  }, [user, authLoading]);

  const standaloneUrl = status?.standalone_url ?? null;

  return (
    <PageShell>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="font-serif text-2xl text-ink">Employer &amp; Career Collaboration</h1>

        {embedDisabled && (
          <section className="luminous-card mt-6" aria-labelledby="embed-disabled-heading">
            <h2 id="embed-disabled-heading" className="font-serif text-lg text-ink">
              Employer &amp; Career Collaboration is not enabled for this college.
            </h2>
            <Link href={`/programs/${id}`} className="luminous-button-secondary mt-4 inline-flex">
              Back to program
            </Link>
          </section>
        )}

        {loadError && (
          <div role="alert" className="luminous-card mt-6">
            <p className="text-sm text-ink">Could not load this program: {loadError}</p>
            <button type="button" onClick={load} className="luminous-button-secondary mt-4">
              Retry
            </button>
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

        {!embedDisabled && !loadError && resolution.state === 'loading' && (
          <p role="status" className="mt-6 text-sm text-muted">
            Checking workspace access…
          </p>
        )}

        {!embedDisabled && resolution.state !== 'loading' && resolution.state !== 'ready' && (
          <>
            <HostStatePanel resolution={resolution} onRetry={load} standaloneUrl={standaloneUrl} />
            {/* Outage isolation (AX-21): curriculum editing stays one link away. */}
            <Link href={`/programs/${id}`} className="luminous-button-secondary mt-4 inline-flex">
              Back to program
            </Link>
          </>
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
