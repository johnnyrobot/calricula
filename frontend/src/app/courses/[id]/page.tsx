'use client';

// ===========================================
// Course Detail Page
// ===========================================
// Displays course information in read-only mode
// Provides edit button for authors/admins

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeftIcon,
  PencilSquareIcon,
  DocumentDuplicateIcon,
  TrashIcon,
  AcademicCapIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  DocumentArrowDownIcon,
  ArrowDownTrayIcon,
  ArrowsRightLeftIcon,
  ChartBarIcon,
  DocumentTextIcon,
  ListBulletIcon,
  CheckBadgeIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';
import { PageShell } from '@/components/layout';
import { WorkflowProgressBar, WorkflowProgressBarCompact, WorkflowStatus, WorkflowHistoryPanel, ApprovalActions } from '@/components/workflow';
import { VersionHistoryPanel } from '@/components/versions';
import { LMIDetailView } from '@/components/lmi';
import { CCNAlignmentBadge } from '@/components/ccn';
import { useAuth } from '@/contexts/AuthContext';
import { api, CourseDetail, CourseStatus } from '@/lib/api';

// ===========================================
// Tab Type Definition
// ===========================================

type CourseTab = 'overview' | 'slos' | 'content' | 'lmi';

// ===========================================
// Status Badge Component
// ===========================================

function StatusBadge({ status }: { status: CourseStatus }) {
  const config: Record<CourseStatus, { bg: string; text: string }> = {
    Draft: {
      bg: 'bg-slate-100 dark:bg-slate-800',
      text: 'text-slate-800 dark:text-slate-200',
    },
    DeptReview: {
      bg: 'bg-yellow-100 dark:bg-yellow-900/30',
      text: 'text-yellow-800 dark:text-yellow-200',
    },
    CurriculumCommittee: {
      bg: 'bg-blue-100 dark:bg-blue-900/30',
      text: 'text-blue-800 dark:text-blue-200',
    },
    ArticulationReview: {
      bg: 'bg-purple-100 dark:bg-purple-900/30',
      text: 'text-purple-800 dark:text-purple-200',
    },
    Approved: {
      bg: 'bg-green-100 dark:bg-green-900/30',
      text: 'text-green-800 dark:text-green-200',
    },
  };

  const { bg, text } = config[status];

  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${bg} ${text}`}
    >
      {status === 'Approved' && <CheckCircleIcon className="h-4 w-4 mr-1.5" />}
      {status}
    </span>
  );
}

// ===========================================
// Main Component
// ===========================================

export default function CourseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { getToken } = useAuth();
  const courseId = params.id as string;

  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [activeTab, setActiveTab] = useState<CourseTab>('overview');

  // Check if course has LMI data - check both legacy lmi_data and new individual fields
  const hasLMIData = Boolean(
    course?.lmi_soc_code ||
    course?.lmi_occupation_title ||
    (course?.lmi_data && Object.keys(course.lmi_data).length > 0)
  );

  // Handle PDF export
  const handleExportPdf = async () => {
    try {
      setExportingPdf(true);
      const token = await getToken();
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'}/api/export/course/${courseId}/pdf`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to export PDF');
      }

      // Create download link
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${course?.subject_code}_${course?.course_number}_COR.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Failed to export PDF. Please try again.');
    } finally {
      setExportingPdf(false);
    }
  };

  // Handle course duplication (create new version)
  const handleDuplicate = async () => {
    if (!course) return;

    const confirmed = window.confirm(
      `Create a new version of ${course.subject_code} ${course.course_number}?\n\nThis will create a copy of the course as Version ${course.version + 1} in Draft status, including all SLOs, content outline, and requisites.`
    );

    if (!confirmed) return;

    try {
      setDuplicating(true);
      const token = await getToken();
      if (token) {
        api.setToken(token);
      }
      const result = await api.duplicateCourse(courseId);

      // Navigate to edit the new course
      router.push(`/courses/${result.id}/edit`);
    } catch (err) {
      console.error('Duplication failed:', err);
      alert(err instanceof Error ? err.message : 'Failed to create new version. Please try again.');
    } finally {
      setDuplicating(false);
    }
  };

  // Fetch course data
  useEffect(() => {
    const fetchCourse = async () => {
      try {
        setLoading(true);
        setError(null);
        const token = await getToken();
        if (token) {
          api.setToken(token);
        }
        const data = await api.getCourse(courseId);
        setCourse(data);
      } catch (err) {
        console.error('Failed to fetch course:', err);
        setError(err instanceof Error ? err.message : 'Failed to load course');
      } finally {
        setLoading(false);
      }
    };

    if (courseId) {
      fetchCourse();
    }
  }, [courseId, getToken]);

  // Loading state
  if (loading) {
    return (
      <PageShell>
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-luminous-500" />
        </div>
      </PageShell>
    );
  }

  // Error state
  if (error || !course) {
    return (
      <PageShell>
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <ExclamationCircleIcon className="h-16 w-16 mx-auto text-red-500 mb-4" />
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
            Failed to Load Course
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            {error || 'Course not found'}
          </p>
          <Link href="/courses" className="luminous-button-primary">
            Back to Courses
          </Link>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Link */}
        <Link
          href="/courses"
          className="inline-flex items-center text-sm text-slate-500 dark:text-slate-400 hover:text-luminous-600 dark:hover:text-luminous-400 mb-6"
        >
          <ArrowLeftIcon className="h-4 w-4 mr-2" />
          Back to Courses
        </Link>

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <span className="text-2xl font-bold text-luminous-600 dark:text-luminous-400">
                {course.subject_code} {course.course_number}
              </span>
              <StatusBadge status={course.status} />
              {course.ccn_id && (
                <CCNAlignmentBadge
                  alignment={{
                    status: 'aligned',
                    standard: {
                      c_id: course.ccn_id,
                      discipline: course.subject_code,
                      title: course.title,
                      minimum_units: course.units,
                    },
                  }}
                  size="sm"
                />
              )}
            </div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
              {course.title}
            </h1>
            <p className="mt-2 text-slate-600 dark:text-slate-400">
              {course.department?.name || 'No department'}
              {course.version > 1 && ` • Version ${course.version}`}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {/* Export Dropdown */}
            <div className="relative group">
              <button
                onClick={handleExportPdf}
                disabled={exportingPdf}
                className="luminous-button-secondary flex items-center gap-2"
              >
                {exportingPdf ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <DocumentArrowDownIcon className="h-4 w-4" />
                    Export PDF
                  </>
                )}
              </button>
            </div>

            {course.status === 'Approved' ? (
              <button
                onClick={handleDuplicate}
                disabled={duplicating}
                className="luminous-button-secondary flex items-center gap-2"
              >
                {duplicating ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                    Creating...
                  </>
                ) : (
                  <>
                    <DocumentDuplicateIcon className="h-4 w-4" />
                    Create New Version
                  </>
                )}
              </button>
            ) : (
              <>
                <Link
                  href={`/courses/${course.id}/edit`}
                  className="luminous-button-primary flex items-center gap-2"
                >
                  <PencilSquareIcon className="h-4 w-4" />
                  Edit Course
                </Link>
                <Link
                  href={`/courses/${course.id}/compare`}
                  className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-luminous-600 dark:hover:text-luminous-400 hover:border-luminous-300 dark:hover:border-luminous-700"
                  title="Compare versions"
                >
                  <ArrowsRightLeftIcon className="h-5 w-5" />
                </Link>
                <button className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:border-red-300 dark:hover:border-red-700">
                  <TrashIcon className="h-5 w-5" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Workflow Progress Bar */}
        <div className="mb-8">
          <div className="luminous-card">
            <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-4">
              Approval Workflow Progress
            </h3>
            <WorkflowProgressBar
              currentStatus={course.status as WorkflowStatus}
              showLabels={true}
              size="md"
            />
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mb-6 border-b border-slate-200 dark:border-slate-700">
          <nav className="flex gap-1 -mb-px overflow-x-auto" aria-label="Course sections">
            <button
              onClick={() => setActiveTab('overview')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === 'overview'
                  ? 'border-luminous-500 text-luminous-600 dark:text-luminous-400'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:border-slate-300'
              }`}
            >
              <DocumentTextIcon className="h-4 w-4" />
              Overview
            </button>
            <button
              onClick={() => setActiveTab('slos')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === 'slos'
                  ? 'border-luminous-500 text-luminous-600 dark:text-luminous-400'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:border-slate-300'
              }`}
            >
              <AcademicCapIcon className="h-4 w-4" />
              SLOs ({course.slos?.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('content')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === 'content'
                  ? 'border-luminous-500 text-luminous-600 dark:text-luminous-400'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:border-slate-300'
              }`}
            >
              <ListBulletIcon className="h-4 w-4" />
              Content
            </button>
            {hasLMIData && (
              <button
                onClick={() => setActiveTab('lmi')}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === 'lmi'
                    ? 'border-luminous-500 text-luminous-600 dark:text-luminous-400'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:border-slate-300'
                }`}
              >
                <ChartBarIcon className="h-4 w-4" />
                Labor Market
              </button>
            )}
          </nav>
        </div>

        {/* Content Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div className="luminous-card">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">
                  Catalog Description
                </h3>
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                  {course.catalog_description || (
                    <span className="text-slate-400 dark:text-slate-500 italic">
                      No description provided
                    </span>
                  )}
                </p>
              </div>
            )}

            {/* SLOs Tab */}
            {activeTab === 'slos' && (
              <div className="luminous-card">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                  <AcademicCapIcon className="h-5 w-5 text-luminous-500" />
                  Student Learning Outcomes
                </h3>
                {course.slos && course.slos.length > 0 ? (
                  <ol className="space-y-3">
                    {course.slos.map((slo, index) => (
                      <li key={slo.id} className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-luminous-100 dark:bg-luminous-900/30 text-luminous-700 dark:text-luminous-300 text-sm font-medium flex items-center justify-center">
                          {index + 1}
                        </span>
                        <div className="flex-1">
                          <p className="text-slate-700 dark:text-slate-300">
                            {slo.outcome_text}
                          </p>
                          <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 inline-block">
                            Bloom&apos;s Level: {slo.bloom_level}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-slate-400 dark:text-slate-500 italic">
                    No SLOs defined yet
                  </p>
                )}
              </div>
            )}

            {/* Content Tab */}
            {activeTab === 'content' && (
              <div className="luminous-card">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">
                  Content Outline
                </h3>
                {course.content_items && course.content_items.length > 0 ? (
                  <ol className="space-y-2">
                    {course.content_items.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-start gap-3 py-2 border-b border-slate-100 dark:border-slate-800 last:border-0"
                      >
                        <span className="text-sm font-medium text-slate-500 dark:text-slate-400 w-8">
                          {item.sequence}.
                        </span>
                        <div className="flex-1">
                          <p className="font-medium text-slate-900 dark:text-white">
                            {item.topic}
                          </p>
                          {item.subtopics && item.subtopics.length > 0 && (
                            <ul className="mt-1 ml-4 text-sm text-slate-600 dark:text-slate-400">
                              {item.subtopics.map((sub, i) => (
                                <li key={i}>&bull; {sub}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <span className="text-sm text-slate-500 dark:text-slate-400">
                          {item.hours_allocated}h
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-slate-400 dark:text-slate-500 italic">
                    No content outline defined yet
                  </p>
                )}
              </div>
            )}

            {/* Labor Market Tab */}
            {activeTab === 'lmi' && hasLMIData && (
              <LMIDetailView
                lmiData={{
                  soc_code: course.lmi_soc_code || undefined,
                  occupation_title: course.lmi_occupation_title || undefined,
                  area: (course.lmi_wage_data as Record<string, unknown>)?.area as string || 'Los Angeles County',
                  retrieved_at: course.lmi_retrieved_at || undefined,
                  wage_data: (course.lmi_wage_data as unknown) as Parameters<typeof LMIDetailView>[0]['lmiData']['wage_data'],
                  projection_data: (course.lmi_projection_data as unknown) as Parameters<typeof LMIDetailView>[0]['lmiData']['projection_data'],
                  narrative: course.lmi_narrative || undefined,
                }}
                courseId={course.id}
                courseCode={`${course.subject_code} ${course.course_number}`}
              />
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Approval Actions (for reviewers) */}
            {course.status !== 'Draft' && course.status !== 'Approved' && (
              <ApprovalActions
                courseId={course.id}
                courseTitle={`${course.subject_code} ${course.course_number}: ${course.title}`}
                currentStatus={course.status}
                onStatusChange={(newStatus) => {
                  setCourse((prev) => prev ? { ...prev, status: newStatus } : null);
                }}
              />
            )}

            {/* Units & Hours */}
            <div className="luminous-card">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <ClockIcon className="h-5 w-5 text-luminous-500" />
                Units & Hours
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-slate-600 dark:text-slate-400">Units</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {course.units}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600 dark:text-slate-400">
                    Lecture Hours
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {course.lecture_hours}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600 dark:text-slate-400">Lab Hours</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {course.lab_hours}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600 dark:text-slate-400">
                    Outside-of-Class Hours
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {course.outside_of_class_hours}
                  </span>
                </div>
                <div className="pt-3 mt-3 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    Total Student Learning Hours
                  </span>
                  <span className="font-bold text-luminous-600 dark:text-luminous-400">
                    {/* Use pre-calculated total from model */}
                    {course.total_student_learning_hours}
                  </span>
                </div>
              </div>
            </div>

            {/* CCN Alignment - CUR-226 */}
            {course.ccn_id && (
              <div className="luminous-card">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <CheckBadgeIcon className="h-5 w-5 text-green-500" />
                  CCN Alignment
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-400">C-ID Standard</span>
                    <span className="font-mono font-semibold text-green-600 dark:text-green-400">
                      {course.ccn_id}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    This course is aligned with a C-ID standard per AB 1111 (Common Course Numbering).
                  </p>
                  <a
                    href={`https://c-id.net/descriptors/${course.ccn_id.replace(/\s+/g, '-')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-luminous-600 dark:text-luminous-400 hover:underline"
                  >
                    <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                    View C-ID Standard
                  </a>
                </div>
              </div>
            )}

            {/* Metadata */}
            <div className="luminous-card">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                Course Information
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-slate-600 dark:text-slate-400">Version</span>
                  <span className="text-slate-900 dark:text-white">
                    {course.version}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600 dark:text-slate-400">
                    Effective Term
                  </span>
                  <span className="text-slate-900 dark:text-white">
                    {course.effective_term || '—'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600 dark:text-slate-400">Created</span>
                  <span className="text-slate-900 dark:text-white">
                    {new Date(course.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600 dark:text-slate-400">
                    Last Updated
                  </span>
                  <span className="text-slate-900 dark:text-white">
                    {new Date(course.updated_at).toLocaleDateString()}
                  </span>
                </div>
                {course.approved_at && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600 dark:text-slate-400">
                      Approved
                    </span>
                    <span className="text-green-600 dark:text-green-400">
                      {new Date(course.approved_at).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Version History */}
            <VersionHistoryPanel
              courseId={course.id}
              currentVersion={course.version}
            />

            {/* Workflow History */}
            <WorkflowHistoryPanel
              entityType="Course"
              entityId={course.id}
            />

            {/* Edit Button (Duplicate for visibility) */}
            {course.status !== 'Approved' && (
              <Link
                href={`/courses/${course.id}/edit`}
                className="luminous-button-primary w-full flex items-center justify-center gap-2"
              >
                <PencilSquareIcon className="h-4 w-4" />
                Edit Course
              </Link>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
