'use client';

// ===========================================
// Courses List Page - Browse All Courses
// ===========================================
// Displays paginated list of courses with search and filtering

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  MagnifyingGlassIcon,
  PlusIcon,
  FunnelIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DocumentTextIcon,
  TrashIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/outline';
import { PageShell } from '@/components/layout';
import { useToast } from '@/components/toast';
import { useConfirmDialog } from '@/components/confirm-dialog';
import { CourseCardSkeleton } from '@/components/loading';
import { EmptyCoursesState } from '@/components/empty-state';
import { useAuth } from '@/contexts/AuthContext';
import { api, CourseListItem, CourseListResponse, CourseStatus } from '@/lib/api';
import { invalidateCourseCache } from '@/lib/swr';
import { CCNAlignmentBadgeCompact } from '@/components/ccn';

// ===========================================
// Status Badge Component
// ===========================================

interface StatusBadgeProps {
  status: CourseStatus;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const statusConfig: Record<CourseStatus, { label: string; className: string }> = {
    Draft: {
      label: 'Draft',
      className: 'luminous-badge luminous-badge-draft',
    },
    DeptReview: {
      label: 'Dept Review',
      className: 'luminous-badge luminous-badge-warning',
    },
    CurriculumCommittee: {
      label: 'Committee',
      className: 'luminous-badge luminous-badge-review',
    },
    ArticulationReview: {
      label: 'Articulation',
      className: 'luminous-badge luminous-badge-review',
    },
    Approved: {
      label: 'Approved',
      className: 'luminous-badge luminous-badge-approved',
    },
  };

  const config = statusConfig[status] || statusConfig.Draft;

  return <span className={config.className}>{config.label}</span>;
};

// ===========================================
// Course Card Component
// ===========================================

interface CourseCardProps {
  course: CourseListItem;
  onDelete?: (course: CourseListItem) => void;
}

const CourseCard: React.FC<CourseCardProps> = ({ course, onDelete }) => {
  // Only allow delete for Draft courses
  const canDelete = course.status === 'Draft';

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onDelete) {
      onDelete(course);
    }
  };

  return (
    <div className="luminous-card group relative">
      <Link href={`/courses/${course.id}`} className="block">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            {/* Course Code */}
            <p className="text-sm font-medium text-luminous-600 dark:text-luminous-400">
              {course.subject_code} {course.course_number}
            </p>
            {/* Course Title */}
            <h3 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white truncate group-hover:text-luminous-600 dark:group-hover:text-luminous-400 transition-colors">
              {course.title}
            </h3>
            {/* Department */}
            {course.department && (
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {course.department.name}
              </p>
            )}
          </div>
          {/* Status Badge and CCN Badge */}
          <div className="flex flex-col items-end gap-1.5">
            <StatusBadge status={course.status} />
            {course.ccn_id && (
              <CCNAlignmentBadgeCompact
                alignment={{
                  status: 'aligned',
                  standard: { c_id: course.ccn_id, discipline: '', title: '', minimum_units: 0 },
                }}
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
            <span className="font-medium">{course.units} units</span>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Updated {new Date(course.updated_at).toLocaleDateString()}
          </span>
        </div>
      </Link>

      {/* Action buttons - only show on hover for draft courses */}
      {canDelete && (
        <div className="absolute top-3 right-20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
          <Link
            href={`/courses/${course.id}/edit`}
            onClick={(e) => e.stopPropagation()}
            className="p-1.5 rounded-md bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-500 hover:text-luminous-600 hover:border-luminous-300 dark:hover:text-luminous-400 transition-colors shadow-sm"
            title="Edit course"
          >
            <PencilSquareIcon className="h-4 w-4" />
          </Link>
          <button
            onClick={handleDelete}
            className="p-1.5 rounded-md bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-500 hover:text-red-600 hover:border-red-300 dark:hover:text-red-400 transition-colors shadow-sm"
            title="Delete course"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
};

// ===========================================
// Loading State Component
// ===========================================

const LoadingState: React.FC = () => {
  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fadeIn">
      {[...Array(9)].map((_, i) => (
        <CourseCardSkeleton key={i} />
      ))}
    </div>
  );
};

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

const Pagination: React.FC<PaginationProps> = ({
  page,
  pages,
  total,
  limit,
  onPageChange,
}) => {
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  if (pages <= 1) return null;

  return (
    <div className="flex items-center justify-between mt-8 px-4 py-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
      <div className="text-sm text-slate-500 dark:text-slate-400">
        Showing <span className="font-medium text-slate-900 dark:text-white">{start}</span> to{' '}
        <span className="font-medium text-slate-900 dark:text-white">{end}</span> of{' '}
        <span className="font-medium text-slate-900 dark:text-white">{total}</span> courses
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="luminous-button-secondary px-3 py-2"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <span className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300">
          Page {page} of {pages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pages}
          className="luminous-button-secondary px-3 py-2"
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
      // Set token for authenticated requests
      const token = await getToken();
      if (token) {
        api.setToken(token);
      }

      const params: Parameters<typeof api.listCourses>[0] = {
        page,
        limit,
      };
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

      // Invalidate course cache
      await invalidateCourseCache(course.id);

      // Remove from local state
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

  // Check if any filters are active
  const hasFilters = Boolean(debouncedSearch || statusFilter);

  return (
    <PageShell>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Courses</h1>
            <p className="mt-1 text-slate-600 dark:text-slate-400">
              Browse and manage Course Outlines of Record
            </p>
          </div>
          <Link href="/courses/new" className="luminous-button-primary">
            <PlusIcon className="h-5 w-5 mr-2" />
            New Course
          </Link>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          {/* Search */}
          <div className="flex-1 relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search courses..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="luminous-input pl-10 w-full"
            />
          </div>

          {/* Status Filter */}
          <div className="relative">
            <FunnelIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => handleStatusChange(e.target.value as CourseStatus | '')}
              className="luminous-select pl-10 pr-10 min-w-[180px]"
            >
              <option value="">All Statuses</option>
              <option value="Draft">Draft</option>
              <option value="DeptReview">Dept Review</option>
              <option value="CurriculumCommittee">Committee</option>
              <option value="ArticulationReview">Articulation</option>
              <option value="Approved">Approved</option>
            </select>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-700 dark:text-red-400">{error}</p>
            <button
              onClick={fetchCourses}
              className="mt-2 text-sm font-medium text-red-600 dark:text-red-400 hover:underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Loading State */}
        {loading && <LoadingState />}

        {/* Empty State */}
        {!loading && !error && courses.length === 0 && (
          <EmptyCoursesState hasFilters={hasFilters} />
        )}

        {/* Course Grid */}
        {!loading && !error && courses.length > 0 && (
          <>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {courses.map((course) => (
                <CourseCard key={course.id} course={course} onDelete={handleDeleteCourse} />
              ))}
            </div>

            {/* Pagination */}
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
