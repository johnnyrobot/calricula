'use client';

// ===========================================
// Program Detail Page - View Program
// ===========================================
// Displays full program details including courses organized by requirement type

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeftIcon,
  PencilIcon,
  AcademicCapIcon,
  DocumentTextIcon,
  ClockIcon,
  UserIcon,
  ExclamationTriangleIcon,
  DocumentArrowDownIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { PageShell } from '@/components/layout';
import { useAuth } from '@/contexts/AuthContext';
import { api, ProgramDetail, CourseInProgram, ProgramStatus, ProgramType, ProgramNarrativeResponse } from '@/lib/api';
import { invalidateProgramCache } from '@/lib/swr';

// ===========================================
// Status Badge Component
// ===========================================

interface StatusBadgeProps {
  status: ProgramStatus;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const statusConfig: Record<ProgramStatus, { label: string; className: string }> = {
    Draft: {
      label: 'Draft',
      className: 'luminous-badge luminous-badge-draft',
    },
    Review: {
      label: 'In Review',
      className: 'luminous-badge luminous-badge-warning',
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
// Program Type Badge Component
// ===========================================

interface TypeBadgeProps {
  type: ProgramType;
}

const TypeBadge: React.FC<TypeBadgeProps> = ({ type }) => {
  const typeConfig: Record<ProgramType, { label: string; className: string }> = {
    AA: {
      label: 'Associate of Arts (AA)',
      className: 'inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    },
    AS: {
      label: 'Associate of Science (AS)',
      className: 'inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    },
    AAT: {
      label: 'AA for Transfer (AA-T)',
      className: 'inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    },
    AST: {
      label: 'AS for Transfer (AS-T)',
      className: 'inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
    },
    Certificate: {
      label: 'Certificate of Achievement',
      className: 'inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    },
    ADT: {
      label: 'Associate Degree for Transfer',
      className: 'inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400',
    },
  };

  const config = typeConfig[type] || typeConfig.AA;
  return <span className={config.className}>{config.label}</span>;
};

// ===========================================
// Course Section Component
// ===========================================

interface CourseSectionProps {
  title: string;
  description: string;
  courses: CourseInProgram[];
}

const CourseSection: React.FC<CourseSectionProps> = ({ title, description, courses }) => {
  if (courses.length === 0) return null;

  const totalUnits = courses.reduce((sum, c) => sum + Number(c.units_applied), 0);

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">{description}</p>
        </div>
        <span className="text-sm font-medium text-luminous-600 dark:text-luminous-400">
          {totalUnits} units
        </span>
      </div>
      <div className="space-y-2">
        {courses.map((course) => (
          <Link
            key={course.id}
            href={`/courses/${course.course_id}`}
            className="block p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-luminous-300 dark:hover:border-luminous-700 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <DocumentTextIcon className="h-5 w-5 text-luminous-500" />
                <div>
                  <span className="font-medium text-luminous-600 dark:text-luminous-400">
                    {course.subject_code} {course.course_number}
                  </span>
                  <span className="mx-2 text-slate-400">·</span>
                  <span className="text-slate-700 dark:text-slate-300">{course.title}</span>
                </div>
              </div>
              <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                {course.units_applied} units
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

// ===========================================
// Loading Skeleton
// ===========================================

const LoadingSkeleton: React.FC = () => (
  <div className="animate-pulse">
    <div className="mb-8">
      <div className="h-8 w-64 bg-slate-200 dark:bg-slate-700 rounded mb-2" />
      <div className="h-6 w-48 bg-slate-200 dark:bg-slate-700 rounded" />
    </div>
    <div className="grid lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-4">
        <div className="h-32 bg-slate-200 dark:bg-slate-700 rounded-lg" />
        <div className="h-48 bg-slate-200 dark:bg-slate-700 rounded-lg" />
      </div>
      <div className="space-y-4">
        <div className="h-48 bg-slate-200 dark:bg-slate-700 rounded-lg" />
      </div>
    </div>
  </div>
);

// ===========================================
// Main Component
// ===========================================

export default function ProgramDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { getToken, user } = useAuth();
  const programId = params.id as string;

  const [program, setProgram] = useState<ProgramDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [generatingNarrative, setGeneratingNarrative] = useState(false);
  const [narrativeResult, setNarrativeResult] = useState<ProgramNarrativeResponse | null>(null);
  const [showNarrativeModal, setShowNarrativeModal] = useState(false);

  // Fetch program data
  const fetchProgram = useCallback(async () => {
    if (!programId) return;

    setLoading(true);
    setError(null);

    try {
      const token = await getToken();
      if (token) {
        api.setToken(token);
      }

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

  // Export program as PDF
  const handleExportPDF = async () => {
    if (!programId || exporting) return;

    setExporting(true);
    try {
      const token = await getToken();
      if (token) {
        api.setToken(token);
      }

      // Fetch PDF from API
      const response = await fetch(`http://localhost:8001/api/export/program/${programId}/pdf`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }

      // Create blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${program?.title || 'Program'}_Program.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Failed to export PDF:', err);
      alert('Failed to export PDF. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  // Generate program narrative with AI
  const handleGenerateNarrative = async () => {
    if (!program || generatingNarrative) return;

    setGeneratingNarrative(true);
    setNarrativeResult(null);

    try {
      const token = await getToken();
      if (token) {
        api.setToken(token);
      }

      // Determine if this is a CTE program based on TOP code
      // TOP codes 09xx-13xx, 30xx-35xx, 47xx-49xx are typically vocational
      const isCTE = program.top_code ? /^(0[9]|1[0-3]|3[0-5]|4[7-9])/.test(program.top_code) : false;

      // Prepare course data for the API
      const coursesForNarrative = program.courses.map(c => ({
        subject_code: c.subject_code,
        course_number: c.course_number,
        title: c.title,
        units: Number(c.units_applied),
      }));

      const result = await api.suggestProgramNarrative({
        program_title: program.title,
        program_type: program.type,
        total_units: Number(program.total_units),
        catalog_description: program.catalog_description || undefined,
        courses: coursesForNarrative.length > 0 ? coursesForNarrative : undefined,
        department: program.department?.name,
        top_code: program.top_code || undefined,
        is_cte: isCTE,
      });

      setNarrativeResult(result);
      setShowNarrativeModal(true);
    } catch (err) {
      console.error('Failed to generate narrative:', err);
      alert('Failed to generate narrative. Please try again.');
    } finally {
      setGeneratingNarrative(false);
    }
  };

  // Apply the generated narrative to the program
  const handleApplyNarrative = async () => {
    if (!program || !narrativeResult) return;

    try {
      const token = await getToken();
      if (token) {
        api.setToken(token);
      }

      await api.updateProgram(program.id, {
        program_narrative: narrativeResult.narrative,
      });

      // Invalidate program cache
      await invalidateProgramCache(program.id);

      // Refresh program data
      await fetchProgram();
      setShowNarrativeModal(false);
      setNarrativeResult(null);
    } catch (err) {
      console.error('Failed to apply narrative:', err);
      alert('Failed to save narrative. Please try again.');
    }
  };

  // Organize courses by requirement type
  const coursesByType = program?.courses.reduce((acc, course) => {
    const type = course.requirement_type;
    if (!acc[type]) acc[type] = [];
    acc[type].push(course);
    return acc;
  }, {} as Record<string, CourseInProgram[]>) || {};

  // Check if user can edit
  const canEdit = user && program && (
    user.role === 'Admin' ||
    program.created_by === user.id
  ) && program.status === 'Draft';

  // Calculate totals
  const totalUnits = program?.courses.reduce((sum, c) => sum + Number(c.units_applied), 0) || 0;
  const isOverLimit = program?.type !== 'Certificate' && totalUnits > 60;
  const showHighUnitWarning = isOverLimit && !program?.is_high_unit_major;

  return (
    <PageShell>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Navigation */}
        <Link
          href="/programs"
          className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 mb-6"
        >
          <ArrowLeftIcon className="h-4 w-4 mr-2" />
          Back to Programs
        </Link>

        {/* Error State */}
        {error && (
          <div className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <h2 className="text-lg font-semibold text-red-700 dark:text-red-400 mb-2">
              Error Loading Program
            </h2>
            <p className="text-red-600 dark:text-red-300">{error}</p>
            <button
              onClick={fetchProgram}
              className="mt-4 luminous-button-secondary"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Loading State */}
        {loading && <LoadingSkeleton />}

        {/* Program Content */}
        {!loading && !error && program && (
          <>
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <TypeBadge type={program.type} />
                  <StatusBadge status={program.status} />
                </div>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
                  {program.title}
                </h1>
                {program.department && (
                  <p className="mt-2 text-slate-600 dark:text-slate-400">
                    {program.department.name}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                {/* Export PDF Button */}
                <button
                  onClick={handleExportPDF}
                  disabled={exporting}
                  className="luminous-button-secondary inline-flex items-center"
                >
                  <DocumentArrowDownIcon className="h-5 w-5 mr-2" />
                  {exporting ? 'Exporting...' : 'Export PDF'}
                </button>

                {/* Edit Button */}
                {canEdit && (
                  <Link
                    href={`/programs/${program.id}/edit`}
                    className="luminous-button-primary"
                  >
                    <PencilIcon className="h-5 w-5 mr-2" />
                    Edit Program
                  </Link>
                )}
              </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-8">
              {/* Main Content */}
              <div className="lg:col-span-2">
                {/* Catalog Description */}
                {program.catalog_description && (
                  <div className="luminous-card mb-6">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">
                      Catalog Description
                    </h2>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                      {program.catalog_description}
                    </p>
                  </div>
                )}

                {/* Program Narrative */}
                {program.program_narrative && (
                  <div className="luminous-card mb-6">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">
                      Program Narrative
                    </h2>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap">
                      {program.program_narrative}
                    </p>
                  </div>
                )}

                {/* Course Requirements */}
                <div className="luminous-card">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                      Program Requirements
                    </h2>
                    <span className="text-lg font-bold text-luminous-600 dark:text-luminous-400">
                      {totalUnits} Total Units
                    </span>
                  </div>

                  {/* High Unit Warning - shown when over 60 units and NOT marked as High Unit Major */}
                  {showHighUnitWarning && (
                    <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-start gap-3">
                      <ExclamationTriangleIcon className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-amber-800 dark:text-amber-200">
                          Exceeds 60-Unit Limit
                        </p>
                        <p className="text-sm text-amber-700 dark:text-amber-300">
                          This program exceeds the standard 60-unit limit for associate degrees.
                          Edit the program to mark as &quot;High Unit Major&quot; if justified per Title 5 regulations.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* High Unit Major Info - shown when marked as High Unit Major */}
                  {isOverLimit && program?.is_high_unit_major && (
                    <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex items-start gap-3">
                      <AcademicCapIcon className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-blue-800 dark:text-blue-200">
                          High Unit Major
                        </p>
                        <p className="text-sm text-blue-700 dark:text-blue-300">
                          This program is designated as a High Unit Major. The 60-unit limit is waived per Title 5 regulations.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Course Sections */}
                  {program.courses.length === 0 ? (
                    <div className="text-center py-8">
                      <AcademicCapIcon className="h-12 w-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                      <p className="text-slate-500 dark:text-slate-400">
                        No courses have been added to this program yet.
                      </p>
                      {canEdit && (
                        <Link
                          href={`/programs/${program.id}/edit`}
                          className="mt-4 inline-block luminous-button-primary"
                        >
                          Add Courses
                        </Link>
                      )}
                    </div>
                  ) : (
                    <>
                      <CourseSection
                        title="Required Core"
                        description="Courses that all students must complete"
                        courses={coursesByType['RequiredCore'] || []}
                      />
                      <CourseSection
                        title="List A - Restricted Electives"
                        description="Choose from this list to complete requirements"
                        courses={coursesByType['ListA'] || []}
                      />
                      <CourseSection
                        title="List B - Additional Electives"
                        description="Additional elective options"
                        courses={coursesByType['ListB'] || []}
                      />
                      <CourseSection
                        title="General Education"
                        description="GE requirements for degree completion"
                        courses={coursesByType['GE'] || []}
                      />
                    </>
                  )}
                </div>
              </div>

              {/* Sidebar */}
              <div className="space-y-6">
                {/* Program Info Card */}
                <div className="luminous-card">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                    Program Information
                  </h3>
                  <dl className="space-y-4">
                    <div>
                      <dt className="text-sm text-slate-500 dark:text-slate-400">Total Units</dt>
                      <dd className={`mt-1 text-2xl font-bold ${
                        showHighUnitWarning
                          ? 'text-amber-600 dark:text-amber-400'
                          : isOverLimit && program.is_high_unit_major
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-luminous-600 dark:text-luminous-400'
                      }`}>
                        {program.total_units}
                        {program.type !== 'Certificate' && (
                          <span className="text-sm font-normal text-slate-400"> / 60</span>
                        )}
                      </dd>
                      {program.is_high_unit_major && (
                        <dd className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                          High Unit Major
                        </dd>
                      )}
                    </div>
                    {program.top_code && (
                      <div>
                        <dt className="text-sm text-slate-500 dark:text-slate-400">TOP Code</dt>
                        <dd className="mt-1 font-medium text-slate-900 dark:text-white">
                          {program.top_code}
                        </dd>
                      </div>
                    )}
                    {program.cip_code && (
                      <div>
                        <dt className="text-sm text-slate-500 dark:text-slate-400">CIP Code</dt>
                        <dd className="mt-1 font-medium text-slate-900 dark:text-white">
                          {program.cip_code}
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt className="text-sm text-slate-500 dark:text-slate-400">Status</dt>
                      <dd className="mt-1">
                        <StatusBadge status={program.status} />
                      </dd>
                    </div>
                  </dl>
                </div>

                {/* Metadata Card */}
                <div className="luminous-card">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                    Details
                  </h3>
                  <dl className="space-y-3 text-sm">
                    <div className="flex items-center gap-2">
                      <ClockIcon className="h-4 w-4 text-slate-400" />
                      <span className="text-slate-500 dark:text-slate-400">Created:</span>
                      <span className="text-slate-700 dark:text-slate-300">
                        {new Date(program.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ClockIcon className="h-4 w-4 text-slate-400" />
                      <span className="text-slate-500 dark:text-slate-400">Updated:</span>
                      <span className="text-slate-700 dark:text-slate-300">
                        {new Date(program.updated_at).toLocaleDateString()}
                      </span>
                    </div>
                  </dl>
                </div>

                {/* AI Narrative Generator Card */}
                {canEdit && (
                  <div className="luminous-card border-2 border-dashed border-purple-200 dark:border-purple-800 bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/10 dark:to-indigo-900/10">
                    <div className="flex items-center gap-2 mb-2">
                      <SparklesIcon className="h-5 w-5 text-purple-500" />
                      <h3 className="text-lg font-semibold text-purple-900 dark:text-purple-100">
                        AI Narrative Generator
                      </h3>
                    </div>
                    <p className="text-sm text-purple-700 dark:text-purple-300 mb-4">
                      Generate a professional program narrative for Chancellor&apos;s Office submissions, including goals, requirements justification, and catalog description.
                    </p>
                    <button
                      onClick={handleGenerateNarrative}
                      disabled={generatingNarrative}
                      className="w-full inline-flex items-center justify-center px-4 py-2 rounded-lg font-medium text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      {generatingNarrative ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Generating...
                        </>
                      ) : (
                        <>
                          <SparklesIcon className="h-4 w-4 mr-2" />
                          Generate Narrative
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Actions Card */}
                {program.status === 'Draft' && canEdit && (
                  <div className="luminous-card bg-luminous-50 dark:bg-luminous-900/20 border-luminous-200 dark:border-luminous-800">
                    <h3 className="text-lg font-semibold text-luminous-900 dark:text-luminous-100 mb-2">
                      Ready to Submit?
                    </h3>
                    <p className="text-sm text-luminous-700 dark:text-luminous-300 mb-4">
                      Once your program is complete, submit it for review by the curriculum committee.
                    </p>
                    <button
                      className="w-full luminous-button-primary"
                      onClick={() => alert('Workflow submission coming soon!')}
                    >
                      Submit for Review
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Narrative Generation Modal */}
        {showNarrativeModal && narrativeResult && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
              {/* Backdrop */}
              <div
                className="fixed inset-0 bg-slate-900/50 transition-opacity"
                onClick={() => setShowNarrativeModal(false)}
              />

              {/* Modal */}
              <div className="relative inline-block w-full max-w-4xl p-6 my-8 text-left align-middle bg-white dark:bg-slate-800 rounded-2xl shadow-xl transform transition-all">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                      <SparklesIcon className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                        Generated Program Narrative
                      </h2>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Review and edit before applying
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowNarrativeModal(false)}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Content */}
                <div className="max-h-[60vh] overflow-y-auto pr-2">
                  {narrativeResult.success ? (
                    <div className="prose prose-slate dark:prose-invert max-w-none">
                      <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700 whitespace-pre-wrap text-sm leading-relaxed">
                        {narrativeResult.narrative}
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                      <p className="text-red-700 dark:text-red-300">
                        Failed to generate narrative: {narrativeResult.error || 'Unknown error'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
                  <button
                    onClick={handleGenerateNarrative}
                    disabled={generatingNarrative}
                    className="luminous-button-secondary inline-flex items-center"
                  >
                    {generatingNarrative ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Regenerating...
                      </>
                    ) : (
                      <>
                        <SparklesIcon className="h-4 w-4 mr-1" />
                        Regenerate
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setShowNarrativeModal(false)}
                    className="luminous-button-secondary"
                  >
                    Cancel
                  </button>
                  {narrativeResult.success && (
                    <button
                      onClick={handleApplyNarrative}
                      className="luminous-button-primary inline-flex items-center"
                    >
                      <DocumentTextIcon className="h-4 w-4 mr-2" />
                      Apply to Program
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
