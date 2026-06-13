'use client';

// ===========================================
// MyCoursesList Component - Dashboard Widget
// ===========================================
// Displays the user's recent courses with status badges
// and navigation to course detail pages

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  DocumentTextIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ArrowPathIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';
import { api, CourseListItem, CourseStatus } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

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
      className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
    },
    DeptReview: {
      label: 'Dept Review',
      className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
    },
    CurriculumCommittee: {
      label: 'Committee',
      className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
    },
    ArticulationReview: {
      label: 'Articulation',
      className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
    },
    Approved: {
      label: 'Approved',
      className: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
    },
  };

  const config = statusConfig[status] || statusConfig.Draft;

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
};

// ===========================================
// Course Item Component
// ===========================================

interface CourseItemProps {
  course: CourseListItem;
}

const CourseItem: React.FC<CourseItemProps> = ({ course }) => {
  const courseCode = `${course.subject_code} ${course.course_number}`;
  const updatedDate = new Date(course.updated_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <Link
      href={`/courses/${course.id}`}
      className="flex items-center justify-between py-3 px-2 -mx-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-900 dark:text-white truncate">
            {courseCode}
          </span>
          <StatusBadge status={course.status} />
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 truncate mt-0.5">
          {course.title}
        </p>
      </div>
      <div className="flex-shrink-0 ml-4 text-right">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Updated
        </p>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          {updatedDate}
        </p>
      </div>
    </Link>
  );
};

// ===========================================
// Loading Skeleton
// ===========================================

const CoursesSkeleton: React.FC = () => (
  <div className="space-y-3">
    {[1, 2, 3, 4, 5].map((i) => (
      <div key={i} className="flex items-center justify-between py-3 animate-pulse">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <div className="h-4 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-5 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
          </div>
          <div className="h-3 w-40 bg-slate-200 dark:bg-slate-700 rounded mt-2" />
        </div>
        <div className="text-right">
          <div className="h-3 w-12 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="h-3 w-16 bg-slate-200 dark:bg-slate-700 rounded mt-1" />
        </div>
      </div>
    ))}
  </div>
);

// ===========================================
// Empty State Component
// ===========================================

const EmptyState: React.FC = () => (
  <div className="text-center py-8">
    <DocumentTextIcon className="h-12 w-12 mx-auto text-slate-300 dark:text-slate-600 mb-4" />
    <p className="text-slate-500 dark:text-slate-400">
      You haven't created any courses yet.
    </p>
    <Link
      href="/courses/new"
      className="inline-flex items-center mt-4 text-sm font-medium text-luminous-600 hover:text-luminous-700 dark:text-luminous-400 dark:hover:text-luminous-300"
    >
      Create your first course
    </Link>
  </div>
);

// ===========================================
// MyCoursesList Component
// ===========================================

interface MyCoursesListProps {
  limit?: number;
  defaultExpanded?: boolean;
}

export const MyCoursesList: React.FC<MyCoursesListProps> = ({
  limit = 5,
  defaultExpanded = true,
}) => {
  const { user, getToken } = useAuth();
  const [courses, setCourses] = useState<CourseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(defaultExpanded);

  useEffect(() => {
    const fetchCourses = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const token = await getToken();
        if (token) {
          api.setToken(token);
        }
        // Use mine=true to filter by current authenticated user
        // This works in both dev mode and production
        const response = await api.listCourses({
          mine: true,
          limit,
        });
        setCourses(response.items);
      } catch (err) {
        console.error('Failed to fetch my courses:', err);
        setError('Failed to load courses');
        setCourses([]);
      } finally {
        setLoading(false);
      }
    };

    fetchCourses();
  }, [user, getToken, limit]);

  return (
    <div className="luminous-card">
      {/* Header with expand/collapse toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            My Courses
          </h2>
          {loading && (
            <ArrowPathIcon className="h-4 w-4 text-slate-400 animate-spin" />
          )}
        </div>
        <div className="flex items-center gap-2">
          {!loading && courses.length > 0 && (
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {courses.length} course{courses.length !== 1 ? 's' : ''}
            </span>
          )}
          {expanded ? (
            <ChevronUpIcon className="h-5 w-5 text-slate-400" />
          ) : (
            <ChevronDownIcon className="h-5 w-5 text-slate-400" />
          )}
        </div>
      </button>

      {/* Expandable content */}
      {expanded && (
        <div className="mt-4">
          {error && (
            <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center gap-2 text-amber-700 dark:text-amber-400 text-sm">
              <ExclamationCircleIcon className="h-5 w-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <CoursesSkeleton />
          ) : courses.length > 0 ? (
            <>
              <div className="divide-y divide-slate-200 dark:divide-slate-700">
                {courses.map((course) => (
                  <CourseItem key={course.id} course={course} />
                ))}
              </div>

              {/* View All link */}
              <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                <Link
                  href="/courses?mine=true"
                  className="text-sm font-medium text-luminous-600 hover:text-luminous-700 dark:text-luminous-400 dark:hover:text-luminous-300"
                >
                  View all my courses →
                </Link>
              </div>
            </>
          ) : (
            <EmptyState />
          )}
        </div>
      )}
    </div>
  );
};

export default MyCoursesList;
