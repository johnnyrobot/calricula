'use client';

// ===========================================
// Program Builder Page - Drag & Drop Editor
// ===========================================
// Allows faculty to build programs by adding courses to different sections
// with drag-and-drop organization and real-time unit calculation

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeftIcon,
  PlusIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  CheckIcon,
  ExclamationTriangleIcon,
  AcademicCapIcon,
  DocumentTextIcon,
  Bars3Icon,
} from '@heroicons/react/24/outline';
import { PageShell } from '@/components/layout';
import { useAuth } from '@/contexts/AuthContext';
import {
  api,
  ProgramDetail,
  CourseInProgram,
  CourseListItem,
  ProgramType,
} from '@/lib/api';
import { invalidateProgramCache } from '@/lib/swr';

// ===========================================
// Types
// ===========================================

type RequirementType = 'RequiredCore' | 'ListA' | 'ListB' | 'GE';

interface SectionConfig {
  id: RequirementType;
  title: string;
  description: string;
  color: string;
}

const SECTIONS: SectionConfig[] = [
  {
    id: 'RequiredCore',
    title: 'Required Core',
    description: 'Courses that all students must complete',
    color: 'luminous',
  },
  {
    id: 'ListA',
    title: 'List A - Restricted Electives',
    description: 'Choose from this list to complete requirements',
    color: 'blue',
  },
  {
    id: 'ListB',
    title: 'List B - Additional Electives',
    description: 'Additional elective options',
    color: 'green',
  },
  {
    id: 'GE',
    title: 'General Education',
    description: 'GE requirements for degree completion',
    color: 'amber',
  },
];

// ===========================================
// Course Search Modal Component
// ===========================================

interface CourseSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (course: CourseListItem) => void;
  excludeCourseIds: string[];
}

const CourseSearchModal: React.FC<CourseSearchModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  excludeCourseIds,
}) => {
  const { getToken } = useAuth();
  const [search, setSearch] = useState('');
  const [courses, setCourses] = useState<CourseListItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Debounced search
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(async () => {
      if (search.length < 2) {
        setCourses([]);
        return;
      }

      setLoading(true);
      try {
        const token = await getToken();
        if (token) api.setToken(token);

        const response = await api.listCourses({ search, limit: 20 });
        // Filter out already added courses
        const filtered = response.items.filter(
          (c) => !excludeCourseIds.includes(c.id)
        );
        setCourses(filtered);
      } catch (err) {
        console.error('Failed to search courses:', err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [search, isOpen, excludeCourseIds, getToken]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setSearch('');
      setCourses([]);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/50 transition-opacity"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative w-full max-w-2xl bg-white dark:bg-slate-800 rounded-xl shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Add Course to Program
            </h3>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          {/* Search */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-700">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
              <input
                type="text"
                placeholder="Search by course code or title..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="luminous-input pl-10 w-full"
                autoFocus
              />
            </div>
          </div>

          {/* Results */}
          <div className="max-h-96 overflow-y-auto p-2">
            {loading ? (
              <div className="text-center py-8">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-luminous-600 border-r-transparent" />
                <p className="mt-2 text-slate-500 dark:text-slate-400">Searching...</p>
              </div>
            ) : search.length < 2 ? (
              <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                Type at least 2 characters to search
              </div>
            ) : courses.length === 0 ? (
              <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                No courses found
              </div>
            ) : (
              <div className="space-y-1">
                {courses.map((course) => (
                  <button
                    key={course.id}
                    onClick={() => {
                      onSelect(course);
                      onClose();
                    }}
                    className="w-full p-3 text-left rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium text-luminous-600 dark:text-luminous-400">
                          {course.subject_code} {course.course_number}
                        </span>
                        <span className="mx-2 text-slate-400">·</span>
                        <span className="text-slate-700 dark:text-slate-300">
                          {course.title}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                        {course.units} units
                      </span>
                    </div>
                    {course.department && (
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        {course.department.name}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ===========================================
// Course Card Component
// ===========================================

interface CourseCardProps {
  course: CourseInProgram;
  onRemove: (courseId: string) => void;
  isRemoving: boolean;
}

const CourseCard: React.FC<CourseCardProps> = ({ course, onRemove, isRemoving }) => {
  return (
    <div className="group flex items-center gap-3 p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-luminous-300 dark:hover:border-luminous-700 transition-colors">
      {/* Drag Handle */}
      <div className="cursor-move text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
        <Bars3Icon className="h-5 w-5" />
      </div>

      {/* Course Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-luminous-600 dark:text-luminous-400">
            {course.subject_code} {course.course_number}
          </span>
          <span className="text-slate-700 dark:text-slate-300 truncate">
            {course.title}
          </span>
        </div>
      </div>

      {/* Units */}
      <span className="text-sm font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
        {course.units_applied} units
      </span>

      {/* Remove Button */}
      <button
        onClick={() => onRemove(course.id)}
        disabled={isRemoving}
        className="p-1.5 text-slate-400 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50"
        title="Remove from program"
      >
        {isRemoving ? (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-500 border-r-transparent" />
        ) : (
          <TrashIcon className="h-4 w-4" />
        )}
      </button>
    </div>
  );
};

// ===========================================
// Program Section Component
// ===========================================

interface ProgramSectionProps {
  config: SectionConfig;
  courses: CourseInProgram[];
  onAddCourse: (sectionId: RequirementType) => void;
  onRemoveCourse: (courseId: string) => void;
  removingCourseId: string | null;
}

const ProgramSection: React.FC<ProgramSectionProps> = ({
  config,
  courses,
  onAddCourse,
  onRemoveCourse,
  removingCourseId,
}) => {
  const totalUnits = courses.reduce((sum, c) => sum + Number(c.units_applied), 0);

  return (
    <div className="luminous-card">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            {config.title}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {config.description}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-luminous-600 dark:text-luminous-400">
            {totalUnits} units
          </span>
          <button
            onClick={() => onAddCourse(config.id)}
            className="luminous-button-secondary px-3 py-1.5 text-sm"
          >
            <PlusIcon className="h-4 w-4 mr-1" />
            Add Course
          </button>
        </div>
      </div>

      {/* Courses List */}
      {courses.length === 0 ? (
        <div className="py-8 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg text-center">
          <AcademicCapIcon className="h-8 w-8 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            No courses in this section
          </p>
          <button
            onClick={() => onAddCourse(config.id)}
            className="mt-2 text-luminous-600 dark:text-luminous-400 text-sm font-medium hover:underline"
          >
            Add a course
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {courses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              onRemove={onRemoveCourse}
              isRemoving={removingCourseId === course.id}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ===========================================
// Main Program Builder Page
// ===========================================

export default function ProgramBuilderPage() {
  const params = useParams();
  const router = useRouter();
  const { getToken, user } = useAuth();
  const programId = params.id as string;

  // State
  const [program, setProgram] = useState<ProgramDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [addingSection, setAddingSection] = useState<RequirementType | null>(null);
  const [removingCourseId, setRemovingCourseId] = useState<string | null>(null);

  // Fetch program
  const fetchProgram = useCallback(async () => {
    if (!programId) return;

    setLoading(true);
    setError(null);

    try {
      const token = await getToken();
      if (token) api.setToken(token);

      const data = await api.getProgram(programId);
      setProgram(data);
    } catch (err) {
      console.error('Failed to fetch program:', err);
      setError(err instanceof Error ? err.message : 'Failed to load program');
    } finally {
      setLoading(false);
    }
  }, [programId, getToken]);

  useEffect(() => {
    fetchProgram();
  }, [fetchProgram]);

  // Get courses by section
  const getCoursesBySection = (sectionId: RequirementType): CourseInProgram[] => {
    return program?.courses.filter((c) => c.requirement_type === sectionId) || [];
  };

  // Get all course IDs already in program
  const excludedCourseIds = program?.courses.map((c) => c.course_id) || [];

  // Calculate totals
  const totalUnits = program?.courses.reduce((sum, c) => sum + Number(c.units_applied), 0) || 0;
  const unitLimit = program?.type === 'Certificate' ? null : 60;
  const isOverLimit = unitLimit !== null && totalUnits > unitLimit;
  const isHighUnitMajor = program?.is_high_unit_major || false;
  const showWarning = isOverLimit && !isHighUnitMajor;

  // Handle High Unit Major toggle
  const handleHighUnitMajorToggle = async () => {
    if (!program) return;

    try {
      const token = await getToken();
      if (token) api.setToken(token);

      const updated = await api.updateProgram(program.id, {
        is_high_unit_major: !program.is_high_unit_major,
      });

      // Invalidate program cache
      await invalidateProgramCache(program.id);

      setProgram({
        ...program,
        is_high_unit_major: updated.is_high_unit_major,
      });
    } catch (err) {
      console.error('Failed to update program:', err);
      alert(err instanceof Error ? err.message : 'Failed to update program');
    }
  };

  // Handle add course
  const handleAddCourse = async (course: CourseListItem) => {
    if (!program || !addingSection) return;

    try {
      const token = await getToken();
      if (token) api.setToken(token);

      const newCourse = await api.addCourseToProgram(
        program.id,
        course.id,
        addingSection
      );

      // Invalidate program cache
      await invalidateProgramCache(program.id);

      // Update local state
      setProgram({
        ...program,
        courses: [...program.courses, newCourse],
      });
    } catch (err) {
      console.error('Failed to add course:', err);
      alert(err instanceof Error ? err.message : 'Failed to add course');
    }
  };

  // Handle remove course
  const handleRemoveCourse = async (programCourseId: string) => {
    if (!program) return;

    setRemovingCourseId(programCourseId);

    try {
      const token = await getToken();
      if (token) api.setToken(token);

      await api.removeCourseFromProgram(program.id, programCourseId);

      // Invalidate program cache
      await invalidateProgramCache(program.id);

      // Update local state
      setProgram({
        ...program,
        courses: program.courses.filter((c) => c.id !== programCourseId),
      });
    } catch (err) {
      console.error('Failed to remove course:', err);
      alert(err instanceof Error ? err.message : 'Failed to remove course');
    } finally {
      setRemovingCourseId(null);
    }
  };

  // Check permissions
  const canEdit = user && program && (
    user.role === 'Admin' ||
    program.created_by === user.id
  ) && program.status === 'Draft';

  // Loading state
  if (loading) {
    return (
      <PageShell>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 w-64 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-48 bg-slate-200 dark:bg-slate-700 rounded-lg" />
            <div className="h-48 bg-slate-200 dark:bg-slate-700 rounded-lg" />
          </div>
        </div>
      </PageShell>
    );
  }

  // Error state
  if (error || !program) {
    return (
      <PageShell>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Link
            href="/programs"
            className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700 mb-6"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Back to Programs
          </Link>
          <div className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <h2 className="text-lg font-semibold text-red-700 dark:text-red-400 mb-2">
              Error Loading Program
            </h2>
            <p className="text-red-600 dark:text-red-300">{error || 'Program not found'}</p>
            <button onClick={fetchProgram} className="mt-4 luminous-button-secondary">
              Try Again
            </button>
          </div>
        </div>
      </PageShell>
    );
  }

  // Permission denied
  if (!canEdit) {
    return (
      <PageShell>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Link
            href={`/programs/${program.id}`}
            className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700 mb-6"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Back to Program
          </Link>
          <div className="p-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <h2 className="text-lg font-semibold text-amber-700 dark:text-amber-400 mb-2">
              Cannot Edit Program
            </h2>
            <p className="text-amber-600 dark:text-amber-300">
              {program.status !== 'Draft'
                ? 'Only Draft programs can be edited.'
                : 'You do not have permission to edit this program.'}
            </p>
            <Link
              href={`/programs/${program.id}`}
              className="mt-4 inline-block luminous-button-secondary"
            >
              View Program
            </Link>
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Navigation */}
        <Link
          href={`/programs/${program.id}`}
          className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 mb-6"
        >
          <ArrowLeftIcon className="h-4 w-4 mr-2" />
          Back to Program
        </Link>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Edit: {program.title}
            </h1>
            <p className="mt-1 text-slate-600 dark:text-slate-400">
              Add and organize courses for this program
            </p>
          </div>
          <Link
            href={`/programs/${program.id}`}
            className="luminous-button-primary"
          >
            <CheckIcon className="h-5 w-5 mr-2" />
            Done Editing
          </Link>
        </div>

        {/* Unit Summary Card */}
        <div className={`mb-8 p-4 rounded-lg border ${
          showWarning
            ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
            : isHighUnitMajor && isOverLimit
              ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
              : 'bg-luminous-50 dark:bg-luminous-900/20 border-luminous-200 dark:border-luminous-800'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {showWarning && (
                <ExclamationTriangleIcon className="h-6 w-6 text-amber-500" />
              )}
              <div>
                <p className={`text-sm font-medium ${
                  showWarning
                    ? 'text-amber-800 dark:text-amber-200'
                    : isHighUnitMajor && isOverLimit
                      ? 'text-blue-800 dark:text-blue-200'
                      : 'text-luminous-800 dark:text-luminous-200'
                }`}>
                  Total Program Units
                </p>
                {isHighUnitMajor && isOverLimit && (
                  <p className="text-xs text-blue-600 dark:text-blue-400">
                    High Unit Major - 60-unit limit waived
                  </p>
                )}
              </div>
            </div>
            <div className="text-right">
              <span className={`text-3xl font-bold ${
                showWarning
                  ? 'text-amber-600 dark:text-amber-400'
                  : isHighUnitMajor && isOverLimit
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-luminous-600 dark:text-luminous-400'
              }`}>
                {totalUnits}
              </span>
              {unitLimit && (
                <span className="text-lg text-slate-500 dark:text-slate-400">
                  {' '}/ {unitLimit} units
                </span>
              )}
            </div>
          </div>

          {/* 60-Unit Warning with Explanation */}
          {showWarning && (
            <div className="mt-4 pt-4 border-t border-amber-200 dark:border-amber-700">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    Exceeds 60-Unit Transfer Limit
                  </p>
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                    California Education Code requires associate degrees to be completable in 60 semester units
                    to ensure students can transfer to CSU/UC within two years. Programs exceeding 60 units
                    must be designated as &quot;High Unit Majors&quot; with documented justification (e.g., nursing,
                    engineering, or programs with external accreditation requirements).
                  </p>
                </div>
              </div>
              <label className="mt-3 flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isHighUnitMajor}
                  onChange={handleHighUnitMajorToggle}
                  className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                />
                <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  Mark as High Unit Major (dismiss warning)
                </span>
              </label>
            </div>
          )}

          {/* Show option to remove High Unit Major designation if under 60 units */}
          {isHighUnitMajor && !isOverLimit && (
            <div className="mt-4 pt-4 border-t border-luminous-200 dark:border-luminous-700">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isHighUnitMajor}
                  onChange={handleHighUnitMajorToggle}
                  className="h-4 w-4 rounded border-luminous-300 text-luminous-600 focus:ring-luminous-500"
                />
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  High Unit Major designation (no longer needed - program is under 60 units)
                </span>
              </label>
            </div>
          )}
        </div>

        {/* Course Sections */}
        <div className="space-y-6">
          {SECTIONS.map((section) => (
            <ProgramSection
              key={section.id}
              config={section}
              courses={getCoursesBySection(section.id)}
              onAddCourse={setAddingSection}
              onRemoveCourse={handleRemoveCourse}
              removingCourseId={removingCourseId}
            />
          ))}
        </div>

        {/* Course Search Modal */}
        <CourseSearchModal
          isOpen={addingSection !== null}
          onClose={() => setAddingSection(null)}
          onSelect={handleAddCourse}
          excludeCourseIds={excludedCourseIds}
        />
      </div>
    </PageShell>
  );
}
