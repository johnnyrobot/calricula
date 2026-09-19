'use client';

// ===========================================
// ContextBanner — which workspace the user is in
// ===========================================

import Link from 'next/link';

export interface ContextBannerProps {
  campusLabel: string;
  programTitle: string;
  revisionLabel: string;
  standaloneUrl: string | null;
  backHref: string;
}

export function ContextBanner({ campusLabel, programTitle, revisionLabel, standaloneUrl, backHref }: ContextBannerProps) {
  return (
    <div role="region" aria-label="Workspace context" className="luminous-card mt-6 flex flex-wrap items-center justify-between gap-4">
      <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-wide text-gold-ink">College</dt>
          <dd className="text-ink">{campusLabel}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-gold-ink">Program</dt>
          <dd className="text-ink">{programTitle}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-gold-ink">Revision</dt>
          <dd className="text-ink">{revisionLabel}</dd>
        </div>
      </dl>
      <div className="flex items-center gap-3">
        <Link href={backHref} className="luminous-button-secondary">
          Back to program
        </Link>
        {standaloneUrl && (
          <a href={standaloneUrl} target="_blank" rel="noopener noreferrer" className="luminous-button-secondary">
            Open in ApplicationX
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        )}
      </div>
    </div>
  );
}

export default ContextBanner;
