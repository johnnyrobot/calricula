'use client';

// ===========================================
// Courses List Page - Browse All Courses
// ===========================================
// Course Outlines of Record presented as a ruled academic data table
// (academic redesign, board 04 "Courses"). Status shown as restrained seals.

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  MagnifyingGlassIcon,
  PlusIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  TrashIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/outline';
import { PageShell } from '@/components/layout';
import { useToast } from '@/components/toast';
import { useConfirmDialog } from '@/components/confirm-dialog';
import { EmptyCoursesState } from '@/components/empty-state';
import { useAuth } from '@/contexts/AuthContext';
import { api, CourseListItem, CourseStatus } from '@/lib/api';
import { invalidateCourseCache } from '@/lib/swr';

// ===========================================
// Status Seal Component
// ===========================================
// Restrained "seal" (not a bright pill). Granular workflow statuses are kept
// faithful to the data model but share the ochre in-review register.

interface StatusBadgeProps {
  status: CourseStatus;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const statusConfig: Record<CourseStatus, { label: string; className: string }> = {
    Draft: { label: 'Draft', className: 'luminous-badge luminous-badge-draft' },
    DeptReview: { label: 'Dept Review', className: 'luminous-badge luminous-badge-warning' },
    CurriculumCommittee: { label: 'Committee', className: 'luminous-badge luminous-badge-review' },
    ArticulationReview: { label: 'Articulation', className: 'luminous-badge luminous-badge-review' },
    Approved: { label: 'Approved', className: 'luminous-badge luminous-badge-approved' },
  };

  const config = statusConfig[status] || statusConfig.Draft;
  return <span className={config.className}>{config.label}</span>;
};

// ===========================================
// Status Filter Tabs
// ===========================================

const STATUS_TABS: { value: CourseStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'Draft', label: 'Draft' },
  { value: 'DeptReview', label: 'Dept Review' },
  { value: 'CurriculumCommittee', label: 'Committee' },
  { value: 'ArticulationReview', label: 'Articulation' },
  { value: 'Approved', label: 'Approved' },
];

// ===========================================
// Course Row Component
// ===========================================

interface CourseRowProps {
  course: CourseListItem;
  onDelete?: (course: CourseListItem) => void;
}

const CourseRow: React.FC<CourseRowProps> = ({ course, onDelete }) => {
  const router = useRouter();
  const canDelete = course.status === 'Draft';
  const href = `/courses/${course.id}`;

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDelete?.(course);
  };

  return (
    <tr
      className="group border-b border-hairline last:border-b-0 cursor-pointer transition-colors hover:bg-surface-2/60"
      onClick={() => router.push(href)}
    >
      {/* Course code */}
      <td className="py-[15px] px-6 align-middle font-mono text-sm text-ink whitespace-nowrap">
        {course.subject_code} {course.course_number}
      </td>

      {/* Title + department */}
      <td className="py-[15px] px-6 align-middle">
        <Link
          href={href}
          onClick={(e) => e.stopPropagation()}
          className="font-serif text-base leading-5 text-ink-2 hover:text-navy
                     focus:outline-none focus-visible:underline"
        >
          {course.title}
        </Link>
        {course.department && (
          <p className="mt-0.5 font-sans text-xs text-muted truncate">{course.department.name}</p>
        )}
      </td>

      {/* Units */}
      <td className="py-[15px] px-6 align-middle text-right font-mono text-sm text-ink-2 tabular-nums">
        {course.units.toFixed(1)}
      </td>

      {/* C-ID (CA articulation number) — closest real analog to transfer */}
      <td className="py-[15px] px-6 align-middle text-center font-mono text-xs text-muted">
        {course.c_id || '—'}
      </td>

      {/* Status seal */}
      <td className="py-[15px] px-6 align-middle">
        <StatusBadge status={course.status} />
      </td>

      {/* Updated + hover actions */}
      <td className="py-[15px] px-6 align-middle">
        <div className="flex items-center justify-end gap-2">
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <Link
              href={`/courses/${course.id}/edit`}
              onClick={(e) => e.stopPropagation()}
              className="p-1 border border-hairline-strong bg-surface text-muted
                         hover:text-navy hover:border-navy transition-colors"
              title="Edit course"
              aria-label={`Edit ${course.subject_code} ${course.course_number}`}
            >
              <PencilSquareIcon className="h-4 w-4" />
            </Link>
            {canDelete && (
              <button
                onClick={handleDelete}
                className="p-1 border border-hairline-strong bg-surface text-muted
                           hover:text-seal-returned hover:border-seal-returned transition-colors"
                title="Delete course"
                aria-label={`Delete ${course.subject_code} ${course.course_number}`}
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            )}
          </div>
          <span className="font-mono text-xs text-muted whitespace-nowrap tabular-nums">
            {new Date(course.updated_at).toLocaleDateString('en-US', {
              month: 'short',
              day: '2-digit',
            })}
          </span>
        </div>
      </td>
    </tr>
  );
};

// ===========================================
// Table Skeleton (loading)
// ===========================================

const TableSkeleton: React.FC = () => (
  <div className="bg-surface border border-hairline animate-fadeIn">
    {[...Array(8)].map((_, i) => (
      <div key={i} className="flex items-center gap-6 py-[15px] px-6 border-b border-hairline last:border-b-0">
        <div className="h-4 w-20 animate-shimmer" />
        <div className="h-4 flex-1 animate-shimmer" />
        <div className="h-4 w-10 animate-shimmer" />
        <div className="h-5 w-20 animate-shimmer" />
        <div className="h-4 w-16 animate-shimmer" />
      </div>
    ))}
  </div>
);

// ===========================================
// Pagination Component
// ===========================================

interface PaginationProps {
  page: number;
  pages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
}

const Pagination: React.FC<PaginationProps> = ({ page, pages, total, limit, onPageChange }) => {
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  if (pages <= 1) return null;

  return (
    <div className="flex items-center justify-between mt-6 px-4 py-3 bg-surface border border-hairline">
      <div className="font-sans text-sm text-muted">
        Showing <span className="font-mono text-ink tabular-nums">{start}</span>–
        <span className="font-mono text-ink tabular-nums">{end}</span> of{' '}
        <span className="font-mono text-ink tabular-nums">{total}</span> outlines
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="luminous-button-secondary px-3 py-2"
          aria-label="Previous page"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <span className="px-3 font-mono text-sm text-ink-soft tabular-nums">
          {page} / {pages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pages}
          className="luminous-button-secondary px-3 py-2"
          aria-label="Next page"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

// ===========================================
// Main Courses Page Component
// ===========================================

export default function CoursesPage() {
  const { getToken } = useAuth();
  const toast = useToast();
  const { confirm } = useConfirmDialog();

  // State
  const [courses, setCourses] = useState<CourseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<CourseStatus | ''>('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const limit = 12;

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset to first page on new search
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch courses
  const fetchCourses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (token) {
        api.setToken(token);
      }

      const params: Parameters<typeof api.listCourses>[0] = { page, limit };
      if (debouncedSearch) params.search = debouncedSearch;
      if (statusFilter) params.status = statusFilter;

      const response = await api.listCourses(params);
      setCourses(response.items);
      setPages(response.pages);
      setTotal(response.total);
    } catch (err) {
      console.error('Failed to fetch courses:', err);
      setError(err instanceof Error ? err.message : 'Failed to load courses');
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, statusFilter, limit, getToken]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- manual data-fetch effect; fetchCourses sets loading/result state (no data-fetch library in use)
    fetchCourses();
  }, [fetchCourses]);

  // Handle status filter change
  const handleStatusChange = (newStatus: CourseStatus | '') => {
    setStatusFilter(newStatus);
    setPage(1); // Reset to first page on filter change
  };

  // Handle course deletion with confirmation
  const handleDeleteCourse = async (course: CourseListItem) => {
    const confirmed = await confirm({
      title: 'Delete Course',
      message: `Are you sure you want to delete "${course.subject_code} ${course.course_number} - ${course.title}"? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger',
    });

    if (!confirmed) return;

    try {
      const token = await getToken();
      if (token) {
        api.setToken(token);
      }
      await api.deleteCourse(course.id);
      await invalidateCourseCache(course.id);

      setCourses((prev) => prev.filter((c) => c.id !== course.id));
      setTotal((prev) => prev - 1);

      toast.success(
        'Course deleted',
        `${course.subject_code} ${course.course_number} has been deleted.`
      );
    } catch (err) {
      console.error('Failed to delete course:', err);
      toast.error(
        'Failed to delete course',
        err instanceof Error ? err.message : 'Please try again.'
      );
    }
  };

  const hasFilters = Boolean(debouncedSearch || statusFilter);

  return (
    <PageShell>
      <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-8">
        {/* Document title block */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
          <div className="flex flex-col gap-2">
            <p className="font-mono text-xs tracking-[0.16em] uppercase text-gold-ink">
              Course Catalog
            </p>
            <h1 className="font-serif text-[32px] leading-[40px] font-semibold text-ink tracking-tight">
              Course Outlines of Record
            </h1>
            <p className="font-mono text-sm text-muted tabular-nums">
              {total} {total === 1 ? 'outline' : 'outlines'}
            </p>
          </div>
          <Link href="/courses/new" className="luminous-button-primary self-start sm:self-auto">
            <PlusIcon className="h-4 w-4 mr-2" />
            New Course
          </Link>
        </div>

        {/* Controls: status tabs + search */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between border-b border-hairline-strong mb-6">
          <div className="flex flex-wrap items-end -mb-px" role="tablist" aria-label="Filter by status">
            {STATUS_TABS.map((tab) => {
              const active = statusFilter === tab.value;
              return (
                <button
                  key={tab.label}
                  role="tab"
                  aria-selected={active}
                  onClick={() => handleStatusChange(tab.value)}
                  className={`py-[10px] px-[18px] border-b-2 font-sans text-sm transition-colors ${
                    active
                      ? 'border-navy text-ink font-semibold'
                      : 'border-transparent text-muted hover:text-ink'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div className="relative pb-2 lg:w-72">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
            <input
              type="text"
              placeholder="Search by course or title…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search courses"
              className="w-full bg-surface border border-hairline-strong rounded-sm pl-9 pr-3 py-2
                         font-sans text-sm text-ink placeholder:text-muted
                         focus:outline-none focus:border-navy focus:ring-1 focus:ring-navy"
            />
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-6 p-4 bg-surface border border-seal-returned" role="alert">
            <p className="font-sans text-sm text-seal-returned">{error}</p>
            <button
              onClick={fetchCourses}
              className="mt-2 font-sans text-sm font-semibold text-navy hover:underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Loading State */}
        {loading && <TableSkeleton />}

        {/* Empty State */}
        {!loading && !error && courses.length === 0 && (
          <EmptyCoursesState hasFilters={hasFilters} />
        )}

        {/* Ruled data table */}
        {!loading && !error && courses.length > 0 && (
          <>
            <div className="bg-surface border border-hairline overflow-x-auto">
              <table className="w-full table-fixed border-collapse">
                <caption className="sr-only">Course Outlines of Record</caption>
                <thead>
                  <tr className="bg-surface-2 border-b border-hairline-strong text-left">
                    <th scope="col" className="w-[104px] py-[11px] px-6 font-sans text-[10px] tracking-[0.1em] uppercase font-semibold text-muted">
                      Course
                    </th>
                    <th scope="col" className="py-[11px] px-6 font-sans text-[10px] tracking-[0.1em] uppercase font-semibold text-muted">
                      Title
                    </th>
                    <th scope="col" className="w-[72px] py-[11px] px-6 text-right font-sans text-[10px] tracking-[0.1em] uppercase font-semibold text-muted">
                      Units
                    </th>
                    <th scope="col" className="w-[120px] py-[11px] px-6 text-center font-sans text-[10px] tracking-[0.1em] uppercase font-semibold text-muted">
                      C-ID
                    </th>
                    <th scope="col" className="w-[140px] py-[11px] px-6 font-sans text-[10px] tracking-[0.1em] uppercase font-semibold text-muted">
                      Status
                    </th>
                    <th scope="col" className="w-[150px] py-[11px] px-6 text-right font-sans text-[10px] tracking-[0.1em] uppercase font-semibold text-muted">
                      Updated
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {courses.map((course) => (
                    <CourseRow key={course.id} course={course} onDelete={handleDeleteCourse} />
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              page={page}
              pages={pages}
              total={total}
              limit={limit}
              onPageChange={setPage}
            />
          </>
        )}
      </div>
    </PageShell>
  );
}
