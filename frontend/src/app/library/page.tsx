'use client';

// ===========================================
// Library Page - eLumen Course Browser
// ===========================================
// Displays searchable, paginated list of courses from eLumen

import { useState, useEffect, useCallback } from 'react';
import {
  MagnifyingGlassIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import { PageShell } from '@/components/layout';
import { useToast } from '@/components/toast';

// ===========================================
// API Configuration
// ===========================================

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';

// ===========================================
// Types
// ===========================================

interface eLumenCourse {
  id: string | number;
  code: string;
  title: string;
  college?: string;
  status?: string;
  authors?: Array<{ firstName?: string; lastName?: string }>;
  start_term?: string;
  description?: string;
  units?: number;
  lecture_hours?: number;
  lab_hours?: number;
  activity_hours?: number;
  top_code?: string;
  cb_codes?: Record<string, string | null>;
  objectives?: string[];
  outcomes?: Array<{
    sequence?: number;
    text?: string;
    performance_criteria?: string[];
  }>;
}

interface SearchResponse {
  items: eLumenCourse[];
  total: number;
  page: number;
  page_size: number;
}

// College mapping (abbreviation → eLumen domain)
const COLLEGES = [
  { code: 'ELAC', name: 'East Los Angeles College', domain: 'elac.elumenapp.com' },
  { code: 'LACC', name: 'Los Angeles City College', domain: 'lacc.elumenapp.com' },
  { code: 'LAHC', name: 'Los Angeles Harbor College', domain: 'lahc.elumenapp.com' },
  { code: 'LAMC', name: 'Los Angeles Mission College', domain: 'lamission.elumenapp.com' },
  { code: 'LAPC', name: 'Los Angeles Pierce College', domain: 'pierce.elumenapp.com' },
  { code: 'LASC', name: 'Los Angeles Southwest College', domain: 'lasc.elumenapp.com' },
  { code: 'LATTC', name: 'Los Angeles Trade-Technical College', domain: 'lattc.elumenapp.com' },
  { code: 'LAVC', name: 'Los Angeles Valley College', domain: 'lavc.elumenapp.com' },
  { code: 'WLAC', name: 'West Los Angeles College', domain: 'wlac.elumenapp.com' },
];

// Helper function to get domain by college code
const getCollegeDomain = (code: string): string => {
  const college = COLLEGES.find((c) => c.code === code);
  return college?.domain || '';
};

// ===========================================
// Loading Skeleton
// ===========================================

const CourseCardSkeleton: React.FC = () => (
  <div className="luminous-card animate-pulse">
    <div className="space-y-3">
      <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-24" />
      <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
      <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-full" />
      <div className="flex gap-2 pt-2">
        <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-16" />
        <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-16" />
      </div>
    </div>
  </div>
);

// ===========================================
// Course Card Component
// ===========================================

interface CourseCardProps {
  course: eLumenCourse;
  onExpand: (course: eLumenCourse) => void;
}

const CourseCard: React.FC<CourseCardProps> = ({ course, onExpand }) => {
  const getAuthorNames = (): string => {
    if (!course.authors || course.authors.length === 0) return '';
    return course.authors
      .map((a) => `${a.firstName || ''} ${a.lastName || ''}`.trim())
      .filter((name) => name.length > 0)
      .join(', ');
  };

  const authorNames = getAuthorNames();

  return (
    <div className="luminous-card">
      <div className="space-y-3">
        {/* Header: Code and Title */}
        <div>
          <p className="text-sm font-medium text-luminous-600 dark:text-luminous-400">
            {course.code}
          </p>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white line-clamp-2">
            {course.title}
          </h3>
        </div>

        {/* Details Grid */}
        <div className="space-y-2 text-sm">
          {course.college && (
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-400 font-medium">Institution:</span>
              <span className="text-slate-900 dark:text-white">{course.college}</span>
            </div>
          )}

          {authorNames && (
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-400 font-medium">Authors:</span>
              <span className="text-slate-900 dark:text-white text-right">{authorNames}</span>
            </div>
          )}

          {course.start_term && (
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-400 font-medium">Start Term:</span>
              <span className="text-slate-900 dark:text-white">{course.start_term}</span>
            </div>
          )}

          {course.status && (
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-400 font-medium">Status:</span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                {course.status}
              </span>
            </div>
          )}
        </div>

        {/* Action Button */}
        <div className="pt-2">
          <button
            onClick={() => onExpand(course)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-luminous-50 dark:bg-luminous-900/30 text-luminous-600 dark:text-luminous-400 hover:bg-luminous-100 dark:hover:bg-luminous-900/50 transition-colors text-sm font-medium"
          >
            View COR
            <ChevronDownIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

// ===========================================
// Empty State Component
// ===========================================

const EmptyState: React.FC<{ message: string; subtext?: string }> = ({
  message,
  subtext,
}) => (
  <div className="flex flex-col items-center justify-center py-12">
    <ExclamationTriangleIcon className="h-12 w-12 text-slate-300 dark:text-slate-600 mb-4" />
    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
      {message}
    </h3>
    {subtext && (
      <p className="text-sm text-slate-600 dark:text-slate-400">{subtext}</p>
    )}
  </div>
);

// ===========================================
// Course Detail Modal Component
// ===========================================

interface CourseDetailModalProps {
  course: eLumenCourse | null;
  onClose: () => void;
}

const CourseDetailModal: React.FC<CourseDetailModalProps> = ({ course, onClose }) => {
  if (!course) return null;

  const getAuthorNames = (): string => {
    if (!course.authors || course.authors.length === 0) return 'Not specified';
    return course.authors
      .map((a) => `${a.firstName || ''} ${a.lastName || ''}`.trim())
      .filter((name) => name.length > 0)
      .join(', ');
  };

  return (
    <>
      {/* Modal Overlay */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="fixed inset-4 md:inset-8 lg:inset-12 z-50 bg-white dark:bg-slate-800 rounded-lg shadow-xl overflow-auto">
        <div className="max-w-4xl mx-auto p-6 md:p-8 space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-luminous-600 dark:text-luminous-400 mb-1">
                {course.code}
              </p>
              <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">
                {course.title}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400"
              aria-label="Close"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {/* Course Header Info Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-50 dark:bg-slate-900 rounded-lg">
            <div>
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase">Institution</p>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{course.college}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase">Status</p>
              <p className="text-sm font-semibold text-green-700 dark:text-green-400">{course.status}</p>
            </div>
            {course.start_term && (
              <div>
                <p className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase">Start Term</p>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{course.start_term}</p>
              </div>
            )}
            {course.units && (
              <div>
                <p className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase">Units</p>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{course.units}</p>
              </div>
            )}
          </div>

          {/* Authors */}
          {getAuthorNames() && (
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Authors</h3>
              <p className="text-slate-700 dark:text-slate-300">{getAuthorNames()}</p>
            </div>
          )}

          {/* Description */}
          {course.description && (
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Course Description</h3>
              <p className="text-slate-700 dark:text-slate-300 leading-relaxed">{course.description}</p>
            </div>
          )}

          {/* Course Structure */}
          {(course.units || course.lecture_hours !== undefined || course.lab_hours !== undefined || course.activity_hours !== undefined) && (
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Course Structure</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {course.units && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded">
                    <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">Units</p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-white">{course.units}</p>
                  </div>
                )}
                {course.lecture_hours !== undefined && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded">
                    <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">Lecture Hours</p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-white">{course.lecture_hours}</p>
                  </div>
                )}
                {course.lab_hours !== undefined && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded">
                    <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">Lab Hours</p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-white">{course.lab_hours}</p>
                  </div>
                )}
                {course.activity_hours !== undefined && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded">
                    <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">Activity Hours</p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-white">{course.activity_hours}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Objectives */}
          {course.objectives && course.objectives.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Course Objectives</h3>
              <ol className="space-y-2 list-decimal list-inside">
                {course.objectives.map((obj, idx) => (
                  <li key={idx} className="text-slate-700 dark:text-slate-300">
                    {obj}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Learning Outcomes */}
          {course.outcomes && course.outcomes.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Student Learning Outcomes (CSLOs)</h3>
              <div className="space-y-3">
                {course.outcomes.map((outcome, idx) => (
                  <div key={idx} className="p-3 border border-slate-200 dark:border-slate-700 rounded">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      {idx + 1}. {outcome.text}
                    </p>
                    {outcome.performance_criteria && outcome.performance_criteria.length > 0 && (
                      <ul className="mt-2 space-y-1 list-disc list-inside text-sm text-slate-700 dark:text-slate-300">
                        {outcome.performance_criteria.map((criterion, cIdx) => (
                          <li key={cIdx}>{criterion}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Compliance Codes */}
          <div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* TOP Code */}
              {course.top_code && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">TOP Code</h3>
                  <p className="text-slate-700 dark:text-slate-300">{course.top_code}</p>
                </div>
              )}

              {/* CB Codes */}
              {course.cb_codes && Object.keys(course.cb_codes).length > 0 && (
                <div className="md:col-span-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">MIS Codes (CB Codes)</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                    {Object.entries(course.cb_codes).map(([code, value]) => (
                      <div key={code} className="p-2 bg-slate-50 dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700">
                        <p className="font-medium text-luminous-600 dark:text-luminous-400">{code}</p>
                        <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">{value || '—'}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer note */}
          <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Additional course details (textbooks, methods of instruction, evaluation criteria) are available on the full eLumen COR page.
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

// ===========================================
// Library Page Component
// ===========================================

export default function LibraryPage() {
  const toast = useToast();

  const [selectedCollege, setSelectedCollege] = useState<string>('LAMC');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [courses, setCourses] = useState<eLumenCourse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize] = useState(10);
  const [expandedCourse, setExpandedCourse] = useState<eLumenCourse | null>(null);

  // Calculate pagination info
  const totalPages = Math.ceil(total / pageSize);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  // Fetch courses from eLumen
  const fetchCourses = useCallback(
    async (collegeCode: string, query: string, pageNum: number) => {
      setLoading(true);
      setError(null);

      try {
        const startTime = performance.now();
        const collegeDomain = getCollegeDomain(collegeCode);

        const params = new URLSearchParams({
          page: pageNum.toString(),
          page_size: pageSize.toString(),
          status: 'approved',
        });

        // Only add tenant if a specific college is selected (not empty)
        if (collegeDomain) {
          params.set('tenant', collegeDomain);
        }

        if (query) params.set('query', query);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

        const response = await fetch(`${API_BASE}/api/elumen/courses?${params}`, {
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.detail || `Failed to fetch courses (${response.status})`
          );
        }

        const data: SearchResponse = await response.json();
        const endTime = performance.now();
        console.log(`[eLumen API] Fetched ${data.items?.length || 0} courses in ${(endTime - startTime).toFixed(2)}ms`);

        setCourses(data.items || []);
        setTotal(data.total || 0);
        setPage(pageNum);
      } catch (err) {
        let message = 'Failed to fetch courses';
        if (err instanceof Error) {
          if (err.name === 'AbortError') {
            message = 'Request timeout - eLumen API took too long to respond';
          } else {
            message = err.message;
          }
        }
        setError(message);
        toast.error('Error', message);
        setCourses([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [pageSize, toast]
  );

  // Fetch on mount and when college changes
  useEffect(() => {
    setPage(1);
    fetchCourses(selectedCollege, '', 1);
  }, [selectedCollege, fetchCourses]);

  // Handle search with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      fetchCourses(selectedCollege, searchQuery, 1);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery, selectedCollege, fetchCourses]);

  // Handle pagination
  const goToNextPage = () => {
    if (hasNextPage) {
      fetchCourses(selectedCollege, searchQuery, page + 1);
    }
  };

  const goToPrevPage = () => {
    if (hasPrevPage) {
      fetchCourses(selectedCollege, searchQuery, page - 1);
    }
  };

  return (
    <PageShell>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-4 md:p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
            Course Library
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Browse and search courses from the eLumen catalog
          </p>
        </div>

        {/* Filters Section */}
        <div className="mb-8 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* College Selector */}
            <div>
              <label className="luminous-label">College</label>
              <select
                value={selectedCollege}
                onChange={(e) => setSelectedCollege(e.target.value)}
                className="luminous-select"
              >
                {COLLEGES.map((college) => (
                  <option key={college.code} value={college.code}>
                    {college.name} ({college.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Search Input */}
            <div>
              <label className="luminous-label">Search Courses</label>
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search by course code or title..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="luminous-input pl-10"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    aria-label="Clear search"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Loading Indicator */}
          {loading && (
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-luminous-600" />
              <span className="text-sm">Loading courses...</span>
            </div>
          )}
        </div>

        {/* Results Section */}
        <div>
          {/* Results Info */}
          {!loading && courses.length > 0 && (
            <div className="mb-4 text-sm text-slate-600 dark:text-slate-400">
              Showing {(page - 1) * pageSize + 1}-
              {Math.min(page * pageSize, total)} of {total} courses
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex gap-3">
                <ExclamationTriangleIcon className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-red-800 dark:text-red-200 mb-1">
                    Error loading courses
                  </h3>
                  <p className="text-sm text-red-700 dark:text-red-300">
                    {error}
                  </p>
                  <button
                    onClick={() =>
                      fetchCourses(selectedCollege, searchQuery, page)
                    }
                    className="mt-3 text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                  >
                    Try again
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Courses Grid */}
          {loading && courses.length === 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
              {[...Array(6)].map((_, i) => (
                <CourseCardSkeleton key={i} />
              ))}
            </div>
          ) : courses.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
              {courses.map((course) => (
                <CourseCard key={course.id} course={course} onExpand={setExpandedCourse} />
              ))}
            </div>
          ) : (
            <EmptyState
              message="No courses found"
              subtext={
                searchQuery
                  ? `Try adjusting your search terms`
                  : 'Try selecting a different college or searching'
              }
            />
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
              <div className="text-sm text-slate-600 dark:text-slate-400">
                Page {page} of {totalPages}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={goToPrevPage}
                  disabled={!hasPrevPage || loading}
                  className="luminous-button-secondary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                  Previous
                </button>

                <button
                  onClick={goToNextPage}
                  disabled={!hasNextPage || loading}
                  className="luminous-button-secondary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  Next
                  <ChevronRightIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Course Detail Modal */}
      {expandedCourse && (
        <CourseDetailModal
          course={expandedCourse}
          onClose={() => setExpandedCourse(null)}
        />
      )}
    </PageShell>
  );
}
