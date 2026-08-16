'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  CircleAlert,
  Cloud,
  LoaderCircle,
  Search,
} from 'lucide-react';
import type { CourseStatus, SaveState } from './types';

const STATUS_CLASS: Record<CourseStatus, string> = {
  Draft: 'luminous-badge luminous-badge-draft',
  'Department Review': 'luminous-badge luminous-badge-review',
  'Curriculum Committee': 'luminous-badge luminous-badge-review',
  'Articulation Review': 'luminous-badge luminous-badge-warning',
  Approved: 'luminous-badge luminous-badge-approved',
};

export function CourseStatusBadge({ status }: { status: CourseStatus }) {
  return <span className={STATUS_CLASS[status]}>{status}</span>;
}

export function CourseCode({
  subjectCode,
  courseNumber,
  className = '',
}: {
  subjectCode: string;
  courseNumber: string;
  className?: string;
}) {
  return (
    <span className={`font-mono tracking-[0.04em] ${className}`}>
      {subjectCode} {courseNumber}
    </span>
  );
}

export function CourseBreadcrumb({
  children,
  backHref = '/courses/',
  backLabel = 'Courses',
  onBack,
}: {
  children?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  onBack?: () => void;
}) {
  const backClass =
    'inline-flex min-h-11 items-center gap-2 hover:text-ink focus-visible:underline';
  const backContent = (
    <>
      <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
      {backLabel}
    </>
  );

  return (
    <nav aria-label="Breadcrumb" className="mb-6">
      <ol className="flex flex-wrap items-center gap-2 font-mono text-xs uppercase tracking-[0.14em] text-muted">
        <li>
          {onBack ? (
            <button type="button" onClick={onBack} className={backClass}>
              {backContent}
            </button>
          ) : (
            <Link href={backHref} className={backClass}>
              {backContent}
            </Link>
          )}
        </li>
        {children ? (
          <>
            <li aria-hidden="true" className="text-hairline-strong">
              /
            </li>
            <li className="text-ink">{children}</li>
          </>
        ) : null}
      </ol>
    </nav>
  );
}

export function SaveIndicator({ state }: { state: SaveState }) {
  const content = {
    idle: { icon: Cloud, label: 'No unsaved changes', className: 'text-muted' },
    saving: { icon: LoaderCircle, label: 'Saving…', className: 'text-gold-ink' },
    saved: { icon: Check, label: 'Saved', className: 'text-seal-approved' },
    error: { icon: CircleAlert, label: 'Save error', className: 'text-seal-returned' },
    conflict: {
      icon: AlertTriangle,
      label: 'Changes in another tab',
      className: 'text-gold-ink',
    },
  }[state];
  const Icon = content.icon;

  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex min-h-11 items-center gap-2 font-sans text-sm ${content.className}`}
    >
      <Icon
        aria-hidden="true"
        className={`h-4 w-4 ${state === 'saving' ? 'animate-spin' : ''}`}
      />
      {content.label}
    </span>
  );
}

export function CourseLoading({ label = 'Loading course…' }: { label?: string }) {
  return (
    <div
      className="luminous-card flex min-h-64 items-center justify-center gap-3"
      role="status"
      aria-live="polite"
    >
      <LoaderCircle aria-hidden="true" className="h-5 w-5 animate-spin text-gold-ink" />
      <span className="font-sans text-sm text-muted">{label}</span>
    </div>
  );
}

export function CourseMessage({
  title,
  message,
  tone = 'neutral',
  action,
}: {
  title: string;
  message: string;
  tone?: 'neutral' | 'warning' | 'error';
  action?: React.ReactNode;
}) {
  const Icon = tone === 'warning' ? AlertTriangle : tone === 'error' ? CircleAlert : Search;
  const iconClass = tone === 'error' ? 'text-seal-returned' : 'text-gold-ink';

  return (
    <section
      className="luminous-card mx-auto max-w-2xl px-8 py-12 text-center"
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <Icon aria-hidden="true" className={`mx-auto mb-4 h-8 w-8 ${iconClass}`} />
      <h1 className="font-serif text-2xl font-semibold text-ink">{title}</h1>
      <p className="mx-auto mt-2 max-w-lg font-sans text-sm leading-6 text-muted">{message}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {action}
        <Link href="/courses/" className="luminous-button-secondary">
          Back to courses
        </Link>
      </div>
    </section>
  );
}

export function ComplianceMark({
  status,
  label,
}: {
  status: 'pass' | 'warn' | 'fail';
  label: string;
}) {
  const Icon = status === 'pass' ? CheckCircle2 : AlertTriangle;
  const classes =
    status === 'pass'
      ? 'border-seal-approved/30 bg-seal-approved/10 text-seal-approved'
      : status === 'warn'
        ? 'border-gold/40 bg-gold/10 text-gold-ink'
        : 'border-seal-returned/30 bg-seal-returned/10 text-seal-returned';

  return (
    <span className={`inline-flex items-center gap-1.5 border px-2.5 py-1 text-xs ${classes}`}>
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}
