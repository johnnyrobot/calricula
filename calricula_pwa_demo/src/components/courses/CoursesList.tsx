'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  ArrowDownUp,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Search,
  Trash2,
} from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';
import { CourseCatalogHeader } from './CourseCatalogHeader';
import { CourseCode, CourseStatusBadge } from './CoursePrimitives';
import type { CourseStatus, CourseViewModel } from './types';

const PAGE_SIZE = 8;
const STATUSES: Array<CourseStatus | 'All'> = [
  'All',
  'Draft',
  'Department Review',
  'Curriculum Committee',
  'Articulation Review',
  'Approved',
];

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: '2-digit',
  year: 'numeric',
});

function displayDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '—' : dateFormatter.format(date);
}

export function CoursesList({
  courses,
  onDelete,
}: {
  courses: CourseViewModel[];
  onDelete: (courseId: string) => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<CourseStatus | 'All'>('All');
  const [page, setPage] = useState(1);
  const [sortNewest, setSortNewest] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<CourseViewModel | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return courses
      .filter((course) => status === 'All' || course.status === status)
      .filter((course) => {
        if (!needle) return true;
        return [
          course.subjectCode,
          course.courseNumber,
          `${course.subjectCode} ${course.courseNumber}`,
          course.title,
          course.departmentName,
          course.topCode,
          course.ccnCode,
        ].some((value) => value.toLocaleLowerCase().includes(needle));
      })
      .sort((a, b) => {
        const delta = new Date(b.updatedAt).valueOf() - new Date(a.updatedAt).valueOf();
        return sortNewest ? delta : -delta;
      });
  }, [courses, query, sortNewest, status]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const deleteCourse = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await onDelete(deleteTarget.id);
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'The course could not be deleted.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <CourseCatalogHeader courseCount={courses.length} />

      <section aria-label="Course filters" className="mb-5 space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm">
            <label htmlFor="course-search" className="sr-only">
              Search courses
            </label>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            />
            <input
              id="course-search"
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Search code, title, department, TOP or CCN…"
              className="luminous-input pl-10"
            />
          </div>
          <button
            type="button"
            aria-pressed={!sortNewest}
            onClick={() => {
              setSortNewest((value) => !value);
              setPage(1);
            }}
            className="luminous-button-secondary self-start"
          >
            <ArrowDownUp aria-hidden="true" className="h-4 w-4" />
            {sortNewest ? 'Newest updated' : 'Oldest updated'}
          </button>
        </div>

        <div className="-mb-px flex gap-1 overflow-x-auto border-b border-hairline" aria-label="Filter by status">
          {STATUSES.map((option) => {
            const selected = option === status;
            const count =
              option === 'All' ? courses.length : courses.filter((course) => course.status === option).length;
            return (
              <button
                key={option}
                type="button"
                aria-label={`${option}: ${count} ${count === 1 ? 'course' : 'courses'}`}
                aria-pressed={selected}
                onClick={() => {
                  setStatus(option);
                  setPage(1);
                }}
                className={`min-h-11 shrink-0 border-b-2 px-3 font-sans text-sm transition-colors ${
                  selected
                    ? 'border-navy font-semibold text-ink'
                    : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                {option}
                <span className="ml-1.5 font-mono text-[11px]" aria-hidden="true">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {deleteError && !deleteTarget ? (
        <div className="mb-4 border border-seal-returned bg-seal-returned/5 px-4 py-3 text-sm text-seal-returned" role="alert">
          {deleteError}
        </div>
      ) : null}

      {pageItems.length ? (
        <div className="overflow-x-auto border border-hairline bg-surface">
          <table className="w-full min-w-[850px] border-collapse">
            <caption className="sr-only">
              Searchable course outlines. Select a course code or title to open the outline.
            </caption>
            <thead>
              <tr className="border-b border-hairline-strong bg-surface-2">
                {['Course', 'Title', 'Units', 'TOP / CCN', 'Status', 'Updated', 'Actions'].map(
                  (heading) => (
                    <th
                      key={heading}
                      scope="col"
                      className={`px-5 py-3 text-left font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-muted ${
                        heading === 'Units' || heading === 'Updated' ? 'text-right' : ''
                      }`}
                    >
                      {heading}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {pageItems.map((course) => (
                <tr key={course.id} className="group border-b border-hairline last:border-0 hover:bg-surface-2/60">
                  <td className="whitespace-nowrap px-5 py-4 align-top">
                    <Link
                      href={`/courses/view/?id=${encodeURIComponent(course.id)}`}
                      className="font-mono text-sm font-semibold text-ink hover:text-navy focus-visible:underline"
                    >
                      <CourseCode subjectCode={course.subjectCode} courseNumber={course.courseNumber} />
                    </Link>
                  </td>
                  <td className="max-w-md px-5 py-4 align-top">
                    <Link
                      href={`/courses/view/?id=${encodeURIComponent(course.id)}`}
                      className="font-serif text-base font-semibold text-ink hover:text-navy focus-visible:underline"
                    >
                      {course.title}
                    </Link>
                    <p className="mt-1 font-sans text-xs text-muted">{course.departmentName}</p>
                  </td>
                  <td className="px-5 py-4 text-right align-top font-mono text-sm tabular-nums text-ink">
                    {course.units}
                  </td>
                  <td className="px-5 py-4 align-top">
                    <p className="font-mono text-xs text-ink">{course.topCode || 'TOP pending'}</p>
                    <p className="mt-1 font-mono text-[11px] text-muted">{course.ccnCode || 'No CCN match'}</p>
                  </td>
                  <td className="px-5 py-4 align-top">
                    <CourseStatusBadge status={course.status} />
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-right align-top font-mono text-xs text-muted">
                    {displayDate(course.updatedAt)}
                  </td>
                  <td className="px-5 py-3 align-top">
                    <div className="flex justify-end gap-1">
                      {course.status !== 'Approved' ? (
                        <Link
                          href={`/courses/edit/?id=${encodeURIComponent(course.id)}`}
                          className="inline-flex h-11 w-11 items-center justify-center border border-transparent text-muted hover:border-hairline-strong hover:text-navy"
                          aria-label={`Edit ${course.subjectCode} ${course.courseNumber}`}
                          title="Edit course"
                        >
                          <Pencil aria-hidden="true" className="h-4 w-4" />
                        </Link>
                      ) : null}
                      {course.status === 'Draft' ? (
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteError('');
                            setDeleteTarget(course);
                          }}
                          className="inline-flex h-11 w-11 items-center justify-center border border-transparent text-muted hover:border-seal-returned hover:text-seal-returned"
                          aria-label={`Delete ${course.subjectCode} ${course.courseNumber}`}
                          title="Delete draft"
                        >
                          <Trash2 aria-hidden="true" className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="luminous-card px-6 py-14 text-center" role="status">
          <Search aria-hidden="true" className="mx-auto h-7 w-7 text-gold-ink" />
          <h2 className="mt-4 font-serif text-xl font-semibold text-ink">No matching outlines</h2>
          <p className="mx-auto mt-2 max-w-md font-sans text-sm text-muted">
            Try a broader search or choose a different workflow status.
          </p>
          <button
            type="button"
            className="luminous-button-secondary mt-5"
            onClick={() => {
              setQuery('');
              setStatus('All');
            }}
          >
            Clear filters
          </button>
        </div>
      )}

      {filtered.length > PAGE_SIZE ? (
        <nav
          aria-label="Course list pagination"
          className="mt-5 flex flex-col gap-3 border border-hairline bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="font-sans text-sm text-muted" aria-live="polite">
            Showing{' '}
            <span className="font-mono text-ink">
              {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)}
            </span>{' '}
            of <span className="font-mono text-ink">{filtered.length}</span>
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safePage === 1}
              onClick={() => setPage(Math.max(1, safePage - 1))}
              className="luminous-button-secondary"
            >
              <ChevronLeft aria-hidden="true" className="h-4 w-4" />
              Previous
            </button>
            <span className="px-2 font-mono text-xs text-muted">
              {safePage} / {pageCount}
            </span>
            <button
              type="button"
              disabled={safePage === pageCount}
              onClick={() => setPage(Math.min(pageCount, safePage + 1))}
              className="luminous-button-secondary"
            >
              Next
              <ChevronRight aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </nav>
      ) : null}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete draft course?"
        description={
          deleteTarget
            ? `${deleteTarget.subjectCode} ${deleteTarget.courseNumber} — ${deleteTarget.title} will be removed from this device. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete draft"
        error={deleteError || undefined}
        busy={deleting}
        danger
        onCancel={() => {
          if (!deleting) setDeleteTarget(null);
        }}
        onConfirm={deleteCourse}
      />
    </>
  );
}
