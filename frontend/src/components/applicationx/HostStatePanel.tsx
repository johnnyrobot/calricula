'use client';

// ===========================================
// HostStatePanel — non-ready ApplicationX host states
// ===========================================
// Accepts only a HostFailure: it can never receive (and therefore never leak)
// workspace data. `ready` is rendered by the workspace itself, `loading` by
// the page's status line.

import Link from 'next/link';
import type { HostFailure } from '@/lib/applicationx/types';

export interface HostStatePanelProps {
  resolution: HostFailure;
  onRetry: () => void;
  standaloneUrl: string | null;
}

const RetryButton = ({ onRetry }: { onRetry: () => void }) => (
  <button type="button" onClick={onRetry} className="luminous-button-secondary mt-4">
    Retry
  </button>
);

export function HostStatePanel({ resolution, onRetry, standaloneUrl }: HostStatePanelProps) {
  const { state, message, retryable } = resolution;
  const isAlert = state === 'session_expired' || state === 'service_unavailable';

  let heading: string;
  let body: React.ReactNode;

  switch (state) {
    case 'access_required':
      heading = 'You do not have ApplicationX access for this organization.';
      body = (
        <>
          <h3 className="mt-4 text-sm font-semibold text-ink">How to request access</h3>
          <p className="mt-1 text-sm text-ink-soft">{message}</p>
        </>
      );
      break;
    case 'mapping_required':
      heading = 'This program is not mapped to an ApplicationX workspace.';
      body = <p className="mt-2 text-sm text-ink-soft">Ask an ApplicationX administrator to map it, then return here.</p>;
      break;
    case 'context_stale':
      heading = 'This workspace context is out of date.';
      body = (
        <>
          <p className="mt-2 text-sm text-ink-soft">{message}</p>
          <RetryButton onRetry={onRetry} />
        </>
      );
      break;
    case 'session_expired':
      heading = 'Your session has expired.';
      body = (
        <>
          <p className="mt-2 text-sm text-ink-soft">{message}</p>
          <Link href="/login" className="luminous-button-primary mt-4 inline-flex">
            Sign in again
          </Link>
        </>
      );
      break;
    case 'service_unavailable':
      heading = 'ApplicationX is unavailable.';
      body = (
        <>
          <p className="mt-2 text-sm text-ink-soft">{message}</p>
          <p className="mt-2 text-sm text-gold-ink">Curriculum editing is unaffected.</p>
          {retryable && <RetryButton onRetry={onRetry} />}
        </>
      );
      break;
    case 'version_mismatch':
      heading = 'This embedded workspace needs an update.';
      body = (
        <>
          <p className="mt-2 text-sm text-ink-soft">
            This program requires a newer version of ApplicationX than Calricula currently embeds. {message}
          </p>
          {standaloneUrl && (
            <a
              href={standaloneUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="luminous-button-secondary mt-4 inline-flex"
            >
              Open in ApplicationX
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
        </>
      );
      break;
  }

  return (
    <section
      className="luminous-card mt-6"
      role={isAlert ? 'alert' : undefined}
      aria-labelledby="host-state-heading"
      data-host-state={state}
    >
      <h2 id="host-state-heading" className="font-serif text-lg text-ink">
        {heading}
      </h2>
      {body}
    </section>
  );
}

export default HostStatePanel;
