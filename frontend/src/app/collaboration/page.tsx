'use client';

// ===========================================
// Employer & Career Collaboration — landing
// ===========================================
// Resolves an empty host context (no program, no workspace) so that
// access_required / service_unavailable / session_expired surface before the
// user picks a program. P1a has no workspace listing, so a resolvable context
// (ready is impossible without a workspace; mapping_required is the expected
// answer) hands off to WorkspaceSelector, which routes to a program page.

import { useCallback, useEffect, useRef, useState } from 'react';
import PageShell from '@/components/layout/PageShell';
import { useAuth } from '@/contexts/AuthContext';
import { useApplicationXStatus } from '@/hooks/useApplicationXStatus';
import { resolveContext } from '@/lib/applicationx/client';
import type { HostResolution } from '@/lib/applicationx/types';
import { HostStatePanel, WorkspaceSelector } from '@/components/applicationx';

const ROOT_CONTEXT_ID = 'collaboration:root';

type PageResolution = HostResolution | { state: 'loading' };

export default function CollaborationPage() {
  const { getToken, isAuthenticated, user } = useAuth();
  const { status } = useApplicationXStatus();
  const [resolution, setResolution] = useState<PageResolution>({ state: 'loading' });

  // `getToken` is recreated on every AuthProvider render; read it through a
  // ref so the resolve callback stays stable (see useApplicationXStatus).
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  });
  const controller = useRef<AbortController | null>(null);

  const resolve = useCallback(async () => {
    controller.current?.abort();
    const ctl = new AbortController();
    controller.current = ctl;
    setResolution({ state: 'loading' });

    const [calricula, applicationx] = await Promise.all([
      getTokenRef.current(),
      getTokenRef.current('applicationx'),
    ]);
    if (ctl.signal.aborted) return;
    if (!calricula || !applicationx) {
      setResolution({ state: 'session_expired', message: 'Your session expired. Sign in again.', retryable: false });
      return;
    }
    try {
      const r = await resolveContext(
        { calricula, applicationx },
        { program_id: null, workspace_id: null, context_id: ROOT_CONTEXT_ID },
        ctl.signal,
      );
      if (!ctl.signal.aborted) setResolution(r);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setResolution({ state: 'service_unavailable', message: 'ApplicationX is unavailable right now.', retryable: true });
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- manual data-fetch effect; resolve sets loading/result state (no data-fetch library in use)
    resolve();
    return () => controller.current?.abort();
  }, [isAuthenticated, resolve]);

  // Sign-out: abort in-flight work and never show stale host data.
  useEffect(() => {
    if (user) return;
    controller.current?.abort();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs host state to the auth external condition
    setResolution({ state: 'session_expired', message: 'You have been signed out.', retryable: false });
  }, [user]);

  const showSelector = resolution.state === 'ready' || resolution.state === 'mapping_required';

  return (
    <PageShell>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="font-serif text-2xl text-ink">Employer &amp; Career Collaboration</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Employer and career workspaces are provided by ApplicationX and scoped to a program.
        </p>

        {resolution.state === 'loading' && (
          <p role="status" className="mt-6 text-sm text-muted">
            Checking workspace access…
          </p>
        )}

        {showSelector && <WorkspaceSelector />}

        {!showSelector && resolution.state !== 'loading' && (
          <HostStatePanel resolution={resolution} onRetry={resolve} standaloneUrl={status?.standalone_url ?? null} />
        )}
      </div>
    </PageShell>
  );
}
