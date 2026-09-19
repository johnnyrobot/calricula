'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookCopy,
  CheckCircle2,
  Clock3,
  Code2,
  Download,
  FileClock,
  FileDiff,
  FilePlus2,
  MessageSquareText,
  Pencil,
  Printer,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';
import {
  ComplianceMark,
  CourseBreadcrumb,
  CourseCode,
  CourseStatusBadge,
} from './CoursePrimitives';
import type { ComplianceAuditView, CourseViewModel } from './types';

function safeFilename(value: string) {
  return value.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
}

function downloadJson(value: unknown, filename: string) {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

const formatDate = (value: string | undefined) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(date);
};

const WORKFLOW = [
  'Draft',
  'Department Review',
  'Curriculum Committee',
  'Articulation Review',
  'Approved',
] as const;

export function CourseDetailView({
  course,
  audit,
  exportValue = course,
  onDelete,
  onDuplicate,
  onCreateVersion,
}: {
  course: CourseViewModel;
  audit: ComplianceAuditView;
  exportValue?: unknown;
  onDelete: () => Promise<void>;
  onDuplicate: () => Promise<{ id: string }>;
  onCreateVersion: () => Promise<{ id: string }>;
}) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState<'delete' | 'version' | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [duplicating, setDuplicating] = useState(false);
  const currentStep = WORKFLOW.indexOf(course.status);
  const sloById = useMemo(
    () => new Map(course.slos.map((slo) => [slo.id, slo])),
    [course.slos],
  );

  const duplicate = async () => {
    setDuplicating(true);
    setActionError('');
    try {
      const result = await onDuplicate();
      router.push(`/courses/edit/?id=${encodeURIComponent(result.id)}`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The course could not be duplicated.');
    } finally {
      setDuplicating(false);
    }
  };

  const confirmAction = async () => {
    if (!confirmation) return;
    setBusy(true);
    setActionError('');
    try {
      if (confirmation === 'delete') {
        await onDelete();
        router.push('/courses/');
      } else {
        const result = await onCreateVersion();
        router.push(`/courses/edit/?id=${encodeURIComponent(result.id)}`);
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The requested action could not be completed.');
      setConfirmation(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article>
      <style jsx global>{`
        @media print {
          @page {
            margin: 0.55in;
          }
          .app-sidebar,
          .app-topbar,
          .live-banner,
          .mobile-backdrop {
            display: none !important;
          }
          .app-frame {
            padding-left: 0 !important;
          }
          .app-content {
            width: 100% !important;
            max-width: none !important;
            padding: 0 !important;
          }
          body {
            background: #fff !important;
          }
        }
      `}</style>
      <CourseBreadcrumb>
        <CourseCode subjectCode={course.subjectCode} courseNumber={course.courseNumber} />
      </CourseBreadcrumb>

      {actionError ? (
        <div className="mb-5 border border-seal-returned bg-seal-returned/5 px-4 py-3 text-sm text-seal-returned" role="alert">
          {actionError}
        </div>
      ) : null}

      <header className="mb-7 border-y-2 border-t-navy border-b-hairline-strong bg-surface px-6 py-7 sm:px-10">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-gold-ink">
                Course Outline of Record
              </p>
              <CourseStatusBadge status={course.status} />
            </div>
            <h1 className="mt-4 font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              <CourseCode subjectCode={course.subjectCode} courseNumber={course.courseNumber} />
              <span aria-hidden="true"> — </span>
              <span>{course.title}</span>
            </h1>
            <dl className="mt-5 flex flex-wrap gap-x-5 gap-y-2 font-sans text-sm text-muted">
              <div className="flex gap-2">
                <dt className="sr-only">Department</dt>
                <dd>{course.departmentName}</dd>
              </div>
              <div className="flex gap-2 border-l border-hairline pl-5">
                <dt>Effective</dt>
                <dd className="text-ink">{course.effectiveTerm || 'Term pending'}</dd>
              </div>
              <div className="flex gap-2 border-l border-hairline pl-5">
                <dt>Version</dt>
                <dd className="font-mono text-ink">{course.version.toFixed(1)}</dd>
              </div>
              <div className="flex gap-2 border-l border-hairline pl-5">
                <dt>CCN</dt>
                <dd className="font-mono text-ink">{course.ccnCode || 'Not adopted'}</dd>
              </div>
            </dl>
          </div>

          <div className="flex max-w-xl flex-wrap gap-2 print:hidden">
            <button type="button" onClick={() => window.print()} className="luminous-button-secondary">
              <Printer aria-hidden="true" className="h-4 w-4" />
              Print COR
            </button>
            <button
              type="button"
              onClick={() =>
                downloadJson(
                  exportValue,
                  `${safeFilename(`${course.subjectCode}-${course.courseNumber}`)}-cor.json`,
                )
              }
              className="luminous-button-secondary"
            >
              <Download aria-hidden="true" className="h-4 w-4" />
              Export JSON
            </button>
            <Link
              href={`/courses/compare/?source=${encodeURIComponent(course.id)}`}
              className="luminous-button-secondary"
            >
              <FileDiff aria-hidden="true" className="h-4 w-4" />
              Compare
            </Link>
            {course.status === 'Approved' ? (
              <button
                type="button"
                onClick={() => setConfirmation('version')}
                className="luminous-button-primary"
              >
                <FilePlus2 aria-hidden="true" className="h-4 w-4" />
                Create new version
              </button>
            ) : (
              <Link
                href={`/courses/edit/?id=${encodeURIComponent(course.id)}`}
                className="luminous-button-primary"
              >
                <Pencil aria-hidden="true" className="h-4 w-4" />
                Edit outline
              </Link>
            )}
            <button
              type="button"
              onClick={duplicate}
              disabled={duplicating}
              className="luminous-button-secondary"
            >
              <BookCopy aria-hidden="true" className="h-4 w-4" />
              {duplicating ? 'Duplicating…' : 'Duplicate'}
            </button>
            {course.status === 'Draft' ? (
              <button
                type="button"
                onClick={() => setConfirmation('delete')}
                className="luminous-button-danger"
              >
                <Trash2 aria-hidden="true" className="h-4 w-4" />
                Delete
              </button>
            ) : null}
          </div>
        </div>

        {course.status === 'Approved' ? (
          <div className="mt-5 flex items-start gap-3 border-l-2 border-seal-approved bg-seal-approved/10 px-4 py-3">
            <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 text-seal-approved" />
            <p className="font-sans text-sm leading-6 text-ink">
              This approved record is immutable. Create a new version to propose changes while preserving
              the official outline.
            </p>
          </div>
        ) : null}
      </header>

      <div className="grid items-start gap-7 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="border border-hairline bg-surface">
          <section aria-labelledby="description-heading" className="border-b border-hairline px-6 py-7 sm:px-10">
            <div className="flex gap-4">
              <span aria-hidden="true" className="mt-1 font-serif text-sm text-gold-ink">
                I.
              </span>
              <div>
                <h2 id="description-heading" className="font-serif text-2xl font-semibold text-ink">
                  Catalog Description
                </h2>
                <p className="mt-4 font-sans text-base leading-7 text-ink-soft">
                  {course.catalogDescription || (
                    <span className="italic text-muted">No catalog description has been entered.</span>
                  )}
                </p>
              </div>
            </div>
          </section>

          <section aria-labelledby="slo-heading" className="border-b border-hairline px-6 py-7 sm:px-10">
            <div className="flex gap-4">
              <span aria-hidden="true" className="mt-1 font-serif text-sm text-gold-ink">
                II.
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="slo-heading" className="font-serif text-2xl font-semibold text-ink">
                  Student Learning Outcomes
                </h2>
                {course.slos.length ? (
                  <ol className="mt-5 space-y-4">
                    {course.slos.map((slo, index) => (
                      <li key={slo.id} className="grid grid-cols-[28px_1fr] gap-3">
                        <span className="font-mono text-xs text-muted">{index + 1}</span>
                        <div>
                          <p className="font-sans leading-6 text-ink-soft">{slo.outcomeText}</p>
                          {slo.bloomLevel ? (
                            <span className="mt-1 inline-block border border-gold/50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-gold-ink">
                              {slo.bloomLevel}
                            </span>
                          ) : null}
                          {slo.performanceCriteria ? (
                            <p className="mt-2 font-sans text-xs leading-5 text-muted">
                              Performance criteria: {slo.performanceCriteria}
                            </p>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-4 font-sans text-sm italic text-muted">No outcomes have been defined.</p>
                )}
              </div>
            </div>
          </section>

          <section aria-labelledby="content-heading" className="border-b border-hairline px-6 py-7 sm:px-10">
            <div className="flex gap-4">
              <span aria-hidden="true" className="mt-1 font-serif text-sm text-gold-ink">
                III.
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="content-heading" className="font-serif text-2xl font-semibold text-ink">
                  Course Content
                </h2>
                {course.contentItems.length ? (
                  <ol className="mt-5 space-y-5">
                    {course.contentItems.map((item) => (
                      <li key={item.id} className="grid gap-3 sm:grid-cols-[32px_1fr_auto]">
                        <span className="font-mono text-xs text-muted">{item.sequence}.</span>
                        <div>
                          <h3 className="font-sans font-semibold text-ink">{item.topic}</h3>
                          {item.subtopics.length ? (
                            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-ink-soft">
                              {item.subtopics.map((subtopic) => (
                                <li key={subtopic}>{subtopic}</li>
                              ))}
                            </ul>
                          ) : null}
                          {item.linkedSloIds.length ? (
                            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.09em] text-muted">
                              Linked outcomes:{' '}
                              {item.linkedSloIds
                                .map((id) => sloById.get(id)?.sequence)
                                .filter(Boolean)
                                .join(', ')}
                            </p>
                          ) : null}
                        </div>
                        <span className="font-mono text-xs text-muted">
                          {item.hours} semester hrs
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-4 font-sans text-sm italic text-muted">No content has been outlined.</p>
                )}
              </div>
            </div>
          </section>

          <section aria-labelledby="requisites-heading" className="px-6 py-7 sm:px-10">
            <div className="flex gap-4">
              <span aria-hidden="true" className="mt-1 font-serif text-sm text-gold-ink">
                IV.
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="requisites-heading" className="font-serif text-2xl font-semibold text-ink">
                  Requisites
                </h2>
                {course.requisites.length ? (
                  <dl className="mt-5 space-y-4">
                    {course.requisites.map((requisite) => (
                      <div key={requisite.id} className="border-l-2 border-gold/60 pl-4">
                        <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-gold-ink">
                          {requisite.type}
                        </dt>
                        <dd className="mt-1 font-sans text-sm leading-6 text-ink">
                          {requisite.courseCode
                            ? `${requisite.courseCode} — ${requisite.courseTitle || ''}`
                            : requisite.text || 'Requirement not specified'}
                        </dd>
                        {requisite.contentReview ? (
                          <dd className="mt-1 font-sans text-xs leading-5 text-muted">
                            Content review: {requisite.contentReview}
                          </dd>
                        ) : null}
                        {requisite.validationType ? (
                          <dd className="mt-1 font-sans text-xs leading-5 text-muted">
                            Validation basis: {requisite.validationType}
                          </dd>
                        ) : null}
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="mt-4 font-sans text-sm italic text-muted">No requisites are attached.</p>
                )}
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-5 print:break-before-page" aria-label="Course record summary">
          <section className="border border-hairline bg-surface">
            <h2 className="border-b border-hairline px-5 py-4 font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
              Approval route
            </h2>
            <ol className="px-5 py-4">
              {WORKFLOW.map((step, index) => (
                <li key={step} className="relative flex gap-3 pb-5 last:pb-0">
                  {index < WORKFLOW.length - 1 ? (
                    <span
                      aria-hidden="true"
                      className={`absolute left-[5px] top-3 h-full w-px ${
                        index < currentStep ? 'bg-seal-approved' : 'bg-hairline-strong'
                      }`}
                    />
                  ) : null}
                  <span
                    aria-hidden="true"
                    className={`relative mt-1 h-3 w-3 shrink-0 border ${
                      index <= currentStep
                        ? 'border-seal-approved bg-seal-approved'
                        : 'border-hairline-strong bg-surface'
                    }`}
                  />
                  <div>
                    <p className={`font-sans text-sm ${index === currentStep ? 'font-semibold text-ink' : 'text-muted'}`}>
                      {step}
                    </p>
                    {index === currentStep ? (
                      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.09em] text-gold-ink">
                        Current stage
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="border border-hairline bg-surface">
            <h2 className="flex items-center gap-2 border-b border-hairline px-5 py-4 font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
              <Clock3 aria-hidden="true" className="h-4 w-4 text-gold-ink" />
              Units & hours
            </h2>
            <dl className="divide-y divide-hairline px-5 py-2">
              {[
                ['Units', course.units],
                ['Lecture / week', course.lectureHours],
                ['Lab / week', course.labHours],
                ['Activity / week', course.activityHours],
                ['TBA / week', course.tbaHours],
                ['Outside / week', course.outsideHours],
                ['Total student hours', course.totalStudentHours],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 py-3">
                  <dt className="font-sans text-sm text-muted">{label}</dt>
                  <dd className="font-mono text-sm tabular-nums text-ink">{value || '0'}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="border border-hairline bg-surface">
            <h2 className="flex items-center gap-2 border-b border-hairline px-5 py-4 font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
              <ShieldCheck aria-hidden="true" className="h-4 w-4 text-gold-ink" />
              Deterministic audit
            </h2>
            <div className="p-5">
              <div className="flex items-center justify-between gap-4">
                <ComplianceMark status={audit.overallStatus} label={`${audit.complianceScore}% score`} />
                <span className="font-mono text-xs text-muted">
                  {audit.passed}/{audit.totalChecks} pass
                </span>
              </div>
              <div className="mt-4 h-1.5 bg-surface-2" aria-hidden="true">
                <div
                  className={`h-full ${
                    audit.overallStatus === 'pass'
                      ? 'bg-seal-approved'
                      : audit.overallStatus === 'warn'
                        ? 'bg-gold'
                        : 'bg-seal-returned'
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, audit.complianceScore))}%` }}
                />
              </div>
              <p className="mt-3 font-sans text-xs leading-5 text-muted">
                {audit.failed} failed · {audit.warnings} warnings. This local audit supports, but does not
                replace, faculty and technical review.
              </p>
            </div>
          </section>

          <section className="border border-hairline bg-surface">
            <h2 className="flex items-center gap-2 border-b border-hairline px-5 py-4 font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
              <Code2 aria-hidden="true" className="h-4 w-4 text-gold-ink" />
              Coding
            </h2>
            <dl className="divide-y divide-hairline px-5 py-2">
              {[
                ['TOP code', course.topCode || 'Pending'],
                ['CCN', course.ccnCode || 'Not adopted'],
                ['C-ID', course.cId || 'None'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 py-3">
                  <dt className="font-sans text-sm text-muted">{label}</dt>
                  <dd className="text-right font-mono text-xs text-ink">{value}</dd>
                </div>
              ))}
            </dl>
            {course.ccnDisposition === 'non-match' && course.ccnJustification ? (
              <div className="border-t border-hairline px-5 py-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-gold-ink">
                  CCN non-match rationale
                </p>
                <p className="mt-2 font-sans text-xs leading-5 text-ink-soft">
                  {course.ccnJustification}
                </p>
              </div>
            ) : null}
          </section>

          <section className="grid grid-cols-2 gap-3 print:hidden">
            <div className="border border-hairline bg-surface p-4">
              <MessageSquareText aria-hidden="true" className="h-4 w-4 text-gold-ink" />
              <p className="mt-2 font-serif text-xl text-ink">{course.comments.length}</p>
              <p className="font-sans text-xs text-muted">Comments</p>
            </div>
            <div className="border border-hairline bg-surface p-4">
              <FileClock aria-hidden="true" className="h-4 w-4 text-gold-ink" />
              <p className="mt-2 font-serif text-xl text-ink">{course.history.length}</p>
              <p className="font-sans text-xs text-muted">History events</p>
            </div>
          </section>

          <p className="font-mono text-[10px] leading-5 text-muted">
            Created {formatDate(course.createdAt)}
            <br />
            Updated {formatDate(course.updatedAt)}
            {course.approvedAt ? (
              <>
                <br />
                Approved {formatDate(course.approvedAt)}
              </>
            ) : null}
          </p>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmation === 'delete'}
        title="Delete draft course?"
        description={`${course.subjectCode} ${course.courseNumber} — ${course.title} will be removed from this device. This cannot be undone.`}
        confirmLabel="Delete draft"
        busy={busy}
        danger
        onCancel={() => {
          if (!busy) setConfirmation(null);
        }}
        onConfirm={confirmAction}
      />
      <ConfirmDialog
        open={confirmation === 'version'}
        title="Create a new version?"
        description={`The approved Version ${course.version.toFixed(1)} record remains unchanged. A new draft will copy its SLOs, content, requisites, and coding for revision.`}
        confirmLabel="Create draft version"
        busy={busy}
        onCancel={() => {
          if (!busy) setConfirmation(null);
        }}
        onConfirm={confirmAction}
      />
    </article>
  );
}
