'use client';

// ===========================================
// Program Collaboration — embedded ApplicationX workspace for one program
// ===========================================
// context_id = `${program.id}:${program.updated_at}` — a program edit
// produces a new context, which is how the host detects `context_stale`.
// Every load (mount, Retry) refetches the program so the context is always
// current. One AbortController per load; a late response for a superseded
// context is ignored.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { WorkspaceShell } from '@johnnyrobot/workspace-ui';
// Next (Turbopack, 16.2) does not emit the stylesheet the package imports
// from its own entry (`dist/index.js` → `./theme/tokens.css`) even with the
// 0.1.1 `sideEffects` fix or `transpilePackages`; the built CSS lacked every
// `.ax-*` rule. Load it through the package's `./tokens.css` export instead.
// The `--ax-*` overrides in globals.css win regardless of order (`:where(:root)`).
import '@johnnyrobot/workspace-ui/tokens.css';
import PageShell from '@/components/layout/PageShell';
import { useAuth } from '@/contexts/AuthContext';
import { useApplicationXStatus } from '@/hooks/useApplicationXStatus';
import { api, type ProgramDetail } from '@/lib/api';
import { createBrokeredAdapter } from '@/lib/applicationx/adapter';
import { missingTokenResolution, resolveContext, SESSION_EXPIRED_RESOLUTION } from '@/lib/applicationx/client';
import type { HostResolution, WorkspaceHostContext } from '@/lib/applicationx/types';
import { ContextBanner, HostStatePanel } from '@/components/applicationx';

type PageResolution = HostResolution | { state: 'loading' };

const SESSION_EXPIRED: HostResolution = SESSION_EXPIRED_RESOLUTION;

export default function ProgramCollaborationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
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
    // No Calricula token → session expired; Calricula token but no
    // ApplicationX token → the deployment has not configured the ApplicationX
    // resource (I-2): signing in again would not help.
    const missing = missingTokenResolution(calricula, applicationx);
    if (missing) {
      setResolution(missing);
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
        { calricula: calricula as string, applicationx: applicationx as string },
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

  // Shared workspace shell inputs (ready state only). The context is
  // memoised on the program revision (the shell keys its chat panel on
  // `context.context_id`). The adapter is memoised on `getToken`, which the
  // AuthProvider recreates on each of its renders, so the adapter can be
  // remade on those renders too. That is harmless: the adapter holds no
  // state and reads tokens at call time through the captured function; the
  // shell reads the adapter through a ref and keys the chat panel on
  // `context_id`, so an in-flight run is never aborted by a new adapter
  // identity. (A ref-backed `getToken` would keep one adapter for the page's
  // lifetime, but `react-hooks/refs` rejects reading a ref inside useMemo.)
  const hostContext = useMemo<WorkspaceHostContext | null>(() => {
    if (!program || !status?.enabled) return null;
    return {
      host: 'calricula',
      organization_ref: status.organization_ref ?? '',
      campus_ref: status.campus_ref ?? '',
      program_ref: { source_app: 'calricula', external_id: program.id, revision: program.updated_at },
      workspace_id: null,
      context_id: `${program.id}:${program.updated_at}`,
    };
  }, [program, status]);
  const adapter = useMemo(
    () => createBrokeredAdapter({ getToken, router, standaloneUrl }),
    [getToken, router, standaloneUrl],
  );

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

        {/* Ready: the shell's own ContextHeader carries campus, program and
            revision plus the standalone control, so the banner is reduced to
            the "Back to program" link (outage isolation, AX-21). */}
        {!embedDisabled && program && resolution.state === 'ready' && (
          <ContextBanner
            campusLabel={resolution.campus_label}
            programTitle={program.title}
            revisionLabel={resolution.revision_label}
            standaloneUrl={null}
            workspaceId={resolution.workspace_id}
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

        {!embedDisabled && resolution.state === 'ready' && hostContext && (
          <div className="luminous-card mt-6">
            {/* The shell's root is a labelled <section>; this page owns <main> and the <h1>. */}
            <WorkspaceShell
              adapter={adapter}
              context={hostContext}
              labels={{ title: resolution.workspace_title, assistantName: 'ApplicationX' }}
              // No dead focusable control when APPLICATIONX_STANDALONE_URL is unset.
              showOpenStandalone={Boolean(standaloneUrl)}
              onOpenStandalone={standaloneUrl ? adapter.openStandalone : undefined}
            />
          </div>
        )}
      </div>
    </PageShell>
  );
}
