'use client';

// ===========================================
// eLumen Data Browser - Admin Page (CUR-159)
// ===========================================
// Browse courses and programs from the eLumen public API
// across all 9 LACCD colleges

import { useState, useEffect, useCallback } from 'react';
import {
  MagnifyingGlassIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  BuildingLibraryIcon,
  AcademicCapIcon,
  DocumentTextIcon,
  ArrowDownTrayIcon,
  XMarkIcon,
  ClipboardDocumentListIcon,
} from '@heroicons/react/24/outline';
import { PageShell } from '@/components/layout';
import { useToast } from '@/components/toast';

// ===========================================
// Types
// ===========================================

interface Tenant {
  abbreviation: string;
  display_name: string;
  domain: string;
}

interface CourseListItem {
  id: number;
  code: string;
  title: string;
  college: string;
  units: number | null;
  top_code: string | null;
  status: string;
}

interface CourseDetail {
  id: number;
  code: string;
  title: string;
  college: string;
  subject: string;
  number: string;
  units: number | null;
  description: string | null;
  top_code: string | null;
  status: string;
  lecture_hours: number | null;
  lab_hours: number | null;
  activity_hours: number | null;
  cb_codes: Record<string, string | null>;
  objectives: string[];
  outcomes: Array<{
    sequence: number;
    text: string;
    performance_criteria: string[];
  }>;
}

interface ProgramListItem {
  id: number;
  name: string;
  college: string;
  top_code: string | null;
  control_number: string | null;
  status: string;
}

interface SearchResponse {
  items: (CourseListItem | ProgramListItem)[];
  total: number;
  page: number;
  page_size: number;
}

// ===========================================
// API Functions
// ===========================================

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';

async function fetchTenants(): Promise<Tenant[]> {
  const response = await fetch(`${API_BASE}/api/elumen/tenants`);
  if (!response.ok) throw new Error('Failed to fetch tenants');
  return response.json();
}

async function searchCourses(
  college: string,
  query: string,
  page: number,
  pageSize: number
): Promise<SearchResponse> {
  const params = new URLSearchParams({
    page: page.toString(),
    page_size: pageSize.toString(),
  });
  if (college) params.set('college', college);
  if (query) params.set('query', query);

  const response = await fetch(`${API_BASE}/api/elumen/courses?${params}`);
  if (!response.ok) throw new Error('Failed to search courses');
  return response.json();
}

async function searchPrograms(
  college: string,
  query: string,
  page: number,
  pageSize: number
): Promise<SearchResponse> {
  const params = new URLSearchParams({
    page: page.toString(),
    page_size: pageSize.toString(),
  });
  if (college) params.set('college', college);
  if (query) params.set('query', query);

  const response = await fetch(`${API_BASE}/api/elumen/programs?${params}`);
  if (!response.ok) throw new Error('Failed to search programs');
  return response.json();
}

async function fetchCourseDetail(
  courseId: number,
  college: string
): Promise<CourseDetail> {
  const params = new URLSearchParams();
  if (college) params.set('college', college);

  const response = await fetch(
    `${API_BASE}/api/elumen/courses/${courseId}?${params}`
  );
  if (!response.ok) throw new Error('Failed to fetch course details');
  return response.json();
}

// ===========================================
// Tab Button Component
// ===========================================

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

const TabButton: React.FC<TabButtonProps> = ({
  active,
  onClick,
  icon,
  label,
}) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
      active
        ? 'bg-luminous-100 dark:bg-luminous-900/30 text-luminous-700 dark:text-luminous-300'
        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
    }`}
  >
    {icon}
    {label}
  </button>
);

// ===========================================
// Course Card Component
// ===========================================

interface CourseCardProps {
  course: CourseListItem;
  onClick: () => void;
}

const CourseCard: React.FC<CourseCardProps> = ({ course, onClick }) => (
  <div
    onClick={onClick}
    className="luminous-card cursor-pointer hover:border-luminous-300 dark:hover:border-luminous-700 transition-colors"
  >
    <div className="flex items-start justify-between">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-luminous-600 dark:text-luminous-400">
          {course.code}
        </p>
        <h3 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white truncate">
          {course.title}
        </h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {course.college}
        </p>
      </div>
      <span className="luminous-badge luminous-badge-approved">
        {course.status}
      </span>
    </div>
    <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
      <span className="text-sm text-slate-500 dark:text-slate-400">
        {course.units !== null ? `${course.units} units` : 'N/A'}
      </span>
      {course.top_code && (
        <span className="text-xs text-slate-400 dark:text-slate-500">
          TOP: {course.top_code}
        </span>
      )}
    </div>
  </div>
);

// ===========================================
// Program Card Component
// ===========================================

interface ProgramCardProps {
  program: ProgramListItem;
}

const ProgramCard: React.FC<ProgramCardProps> = ({ program }) => (
  <div className="luminous-card">
    <div className="flex items-start justify-between">
      <div className="flex-1 min-w-0">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
          {program.name}
        </h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {program.college}
        </p>
      </div>
      <span className="luminous-badge luminous-badge-approved">
        {program.status}
      </span>
    </div>
    <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
      {program.control_number && (
        <span className="text-sm text-slate-500 dark:text-slate-400">
          Control #: {program.control_number}
        </span>
      )}
      {program.top_code && (
        <span className="text-xs text-slate-400 dark:text-slate-500">
          TOP: {program.top_code}
        </span>
      )}
    </div>
  </div>
);

// ===========================================
// Course Detail Modal Component
// ===========================================

interface CourseDetailModalProps {
  course: CourseDetail | null;
  loading: boolean;
  onClose: () => void;
}

const CourseDetailModal: React.FC<CourseDetailModalProps> = ({
  course,
  loading,
  onClose,
}) => {
  if (!course && !loading) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            {loading ? 'Loading...' : course?.code}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <XMarkIcon className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-130px)]">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-luminous-600" />
            </div>
          ) : course ? (
            <div className="space-y-6">
              {/* Basic Info */}
              <div>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                  {course.title}
                </h3>
                <p className="mt-1 text-slate-500 dark:text-slate-400">
                  {course.college} | {course.subject} {course.number}
                </p>
              </div>

              {/* Description */}
              {course.description && (
                <div>
                  <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    Catalog Description
                  </h4>
                  <p className="text-slate-600 dark:text-slate-400">
                    {course.description}
                  </p>
                </div>
              )}

              {/* Hours & Units */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Units
                  </p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {course.units ?? 'N/A'}
                  </p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Lecture Hours
                  </p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {course.lecture_hours ?? 'N/A'}
                  </p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Lab Hours
                  </p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {course.lab_hours ?? 'N/A'}
                  </p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    TOP Code
                  </p>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">
                    {course.top_code ?? 'N/A'}
                  </p>
                </div>
              </div>

              {/* CB Codes */}
              {Object.keys(course.cb_codes).length > 0 && (
                <div>
                  <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    CB Codes
                  </h4>
                  <div className="bg-slate-50 dark:bg-slate-900 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-100 dark:bg-slate-800">
                          <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">
                            Code
                          </th>
                          <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">
                            Value
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                        {Object.entries(course.cb_codes)
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([code, value]) => (
                            <tr key={code}>
                              <td className="px-4 py-2 font-mono text-slate-600 dark:text-slate-400">
                                {code}
                              </td>
                              <td className="px-4 py-2 text-slate-700 dark:text-slate-300">
                                {value ?? '-'}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Objectives */}
              {course.objectives.length > 0 && (
                <div>
                  <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    Course Objectives ({course.objectives.length})
                  </h4>
                  <ol className="list-decimal list-inside space-y-2 text-slate-600 dark:text-slate-400">
                    {course.objectives.map((obj, i) => (
                      <li key={i}>{obj}</li>
                    ))}
                  </ol>
                </div>
              )}

              {/* SLOs */}
              {course.outcomes.length > 0 && (
                <div>
                  <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    Student Learning Outcomes ({course.outcomes.length})
                  </h4>
                  <ol className="list-decimal list-inside space-y-3">
                    {course.outcomes.map((outcome, i) => (
                      <li
                        key={i}
                        className="text-slate-600 dark:text-slate-400"
                      >
                        <span>{outcome.text}</span>
                        {outcome.performance_criteria.length > 0 && (
                          <ul className="ml-6 mt-1 text-sm text-slate-500 dark:text-slate-500">
                            {outcome.performance_criteria.map((pc, j) => (
                              <li key={j}>- {pc}</li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
          <button onClick={onClose} className="luminous-button-secondary">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ===========================================
// Pagination Component
// ===========================================

interface PaginationProps {
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

const Pagination: React.FC<PaginationProps> = ({
  page,
  total,
  pageSize,
  onPageChange,
}) => {
  const pages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  if (pages <= 1) return null;

  return (
    <div className="flex items-center justify-between mt-8 px-4 py-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
      <div className="text-sm text-slate-500 dark:text-slate-400">
        Showing{' '}
        <span className="font-medium text-slate-900 dark:text-white">
          {start}
        </span>{' '}
        to{' '}
        <span className="font-medium text-slate-900 dark:text-white">
          {end}
        </span>{' '}
        of{' '}
        <span className="font-medium text-slate-900 dark:text-white">
          {total}
        </span>{' '}
        results
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
// Main eLumen Browser Page
// ===========================================

export default function ElumenBrowserPage() {
  const toast = useToast();

  // State
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedCollege, setSelectedCollege] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'courses' | 'programs'>('courses');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<(CourseListItem | ProgramListItem)[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detail modal state
  const [selectedCourse, setSelectedCourse] = useState<CourseDetail | null>(
    null
  );
  const [detailLoading, setDetailLoading] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  const pageSize = 12;

  // Fetch tenants on mount
  useEffect(() => {
    fetchTenants()
      .then(setTenants)
      .catch((err) => {
        console.error('Failed to fetch tenants:', err);
        toast.error('Failed to load colleges');
      });
  }, []);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch data when filters change
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response =
        activeTab === 'courses'
          ? await searchCourses(
              selectedCollege,
              debouncedSearch,
              page,
              pageSize
            )
          : await searchPrograms(
              selectedCollege,
              debouncedSearch,
              page,
              pageSize
            );

      setItems(response.items);
      setTotal(response.total);
    } catch (err) {
      console.error('Failed to fetch data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [activeTab, selectedCollege, debouncedSearch, page, pageSize]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset page when tab or college changes
  useEffect(() => {
    setPage(1);
    setItems([]);
    setTotal(0);
  }, [activeTab, selectedCollege]);

  // Handle course detail click
  const handleCourseClick = async (course: CourseListItem) => {
    setShowDetail(true);
    setDetailLoading(true);
    setSelectedCourse(null);

    try {
      const detail = await fetchCourseDetail(course.id, selectedCollege);
      setSelectedCourse(detail);
    } catch (err) {
      console.error('Failed to fetch course detail:', err);
      toast.error('Failed to load course details');
      setShowDetail(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setShowDetail(false);
    setSelectedCourse(null);
  };

  return (
    <PageShell>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <BuildingLibraryIcon className="h-8 w-8 text-luminous-600" />
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
              eLumen Data Browser
            </h1>
          </div>
          <p className="text-slate-600 dark:text-slate-400">
            Browse courses and programs from the LACCD eLumen curriculum system
          </p>
        </div>

        {/* Filters */}
        <div className="luminous-card mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Tabs */}
            <div className="flex items-center gap-2">
              <TabButton
                active={activeTab === 'courses'}
                onClick={() => setActiveTab('courses')}
                icon={<DocumentTextIcon className="h-5 w-5" />}
                label="Courses"
              />
              <TabButton
                active={activeTab === 'programs'}
                onClick={() => setActiveTab('programs')}
                icon={<AcademicCapIcon className="h-5 w-5" />}
                label="Programs"
              />
            </div>

            <div className="flex-1 flex flex-col sm:flex-row gap-4">
              {/* College Selector */}
              <div className="relative">
                <BuildingLibraryIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
                <select
                  value={selectedCollege}
                  onChange={(e) => setSelectedCollege(e.target.value)}
                  className="luminous-select pl-10 pr-10 min-w-[200px]"
                >
                  <option value="">All Colleges</option>
                  {tenants.map((t) => (
                    <option key={t.abbreviation} value={t.abbreviation}>
                      {t.abbreviation} - {t.display_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Search */}
              <div className="flex-1 relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                  type="text"
                  placeholder={`Search ${activeTab}...`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="luminous-input pl-10 w-full"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-700 dark:text-red-400">{error}</p>
            <button
              onClick={fetchData}
              className="mt-2 text-sm font-medium text-red-600 dark:text-red-400 hover:underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-luminous-600" />
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && items.length === 0 && (
          <div className="text-center py-12">
            <ClipboardDocumentListIcon className="mx-auto h-12 w-12 text-slate-400" />
            <h3 className="mt-4 text-lg font-medium text-slate-900 dark:text-white">
              No {activeTab} found
            </h3>
            <p className="mt-2 text-slate-500 dark:text-slate-400">
              {selectedCollege
                ? `Try selecting a different college or adjusting your search.`
                : `Select a college to browse ${activeTab}.`}
            </p>
            {activeTab === 'programs' && (
              <p className="mt-2 text-sm text-slate-400 dark:text-slate-500">
                Note: Currently only LAPC has programs in the public API.
              </p>
            )}
          </div>
        )}

        {/* Results Grid */}
        {!loading && !error && items.length > 0 && (
          <>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {activeTab === 'courses'
                ? (items as CourseListItem[]).map((course) => (
                    <CourseCard
                      key={course.id}
                      course={course}
                      onClick={() => handleCourseClick(course)}
                    />
                  ))
                : (items as ProgramListItem[]).map((program) => (
                    <ProgramCard key={program.id} program={program} />
                  ))}
            </div>

            {/* Pagination */}
            <Pagination
              page={page}
              total={total}
              pageSize={pageSize}
              onPageChange={setPage}
            />
          </>
        )}

        {/* Course Detail Modal */}
        {showDetail && (
          <CourseDetailModal
            course={selectedCourse}
            loading={detailLoading}
            onClose={closeDetail}
          />
        )}
      </div>
    </PageShell>
  );
}
