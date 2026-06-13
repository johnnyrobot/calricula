'use client';

// ===========================================
// Review Section Component
// ===========================================
// Final review step showing course completeness
// and compliance checks before submission.

import { useState, useMemo, useEffect } from 'react';
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  DocumentTextIcon,
  AcademicCapIcon,
  ListBulletIcon,
  LinkIcon,
  Cog6ToothIcon,
  PaperAirplaneIcon,
  ArrowsRightLeftIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import { CheckBadgeIcon, SparklesIcon } from '@heroicons/react/24/solid';
import { CourseDetail, CourseStatus, api } from '@/lib/api';
import { CCNComparisonModal } from '@/components/ccn';

// ===========================================
// Types
// ===========================================

interface CCNStandardMatch {
  id: string;
  c_id: string;
  discipline: string;
  title: string;
  descriptor?: string;
  minimum_units: number;
  slo_requirements: string[];
  content_requirements: string[];
}

interface ReviewSectionProps {
  course: CourseDetail;
  onSubmitForReview: () => void;
  isSubmitting?: boolean;
}

interface ComplianceCheck {
  id: string;
  label: string;
  description: string;
  status: 'pass' | 'warning' | 'fail';
  category: 'required' | 'recommended';
}

// ===========================================
// Compliance Check Logic
// ===========================================

function getComplianceChecks(course: CourseDetail): ComplianceCheck[] {
  const checks: ComplianceCheck[] = [];

  // Basic Info Checks
  checks.push({
    id: 'title',
    label: 'Course Title',
    description: 'Course has a title',
    status: course.title ? 'pass' : 'fail',
    category: 'required',
  });

  checks.push({
    id: 'description',
    label: 'Catalog Description',
    description: 'Course has a catalog description',
    status: course.catalog_description ? 'pass' : 'fail',
    category: 'required',
  });

  checks.push({
    id: 'description_length',
    label: 'Description Length',
    description: 'Catalog description is 25-75 words',
    status: course.catalog_description
      ? course.catalog_description.split(/\s+/).length >= 25 &&
        course.catalog_description.split(/\s+/).length <= 75
        ? 'pass'
        : 'warning'
      : 'fail',
    category: 'recommended',
  });

  checks.push({
    id: 'units',
    label: 'Unit Value',
    description: 'Course has valid unit value (0.5-18)',
    status:
      course.units > 0 && course.units <= 18
        ? 'pass'
        : course.units > 0
        ? 'warning'
        : 'fail',
    category: 'required',
  });

  // 54-Hour Rule Check
  const calculatedUnits =
    ((course.lecture_hours || 0) * 18 +
      (course.lab_hours || 0) * 54 +
      (course.outside_of_class_hours || 0) * 18) /
    54;
  const unitDifference = Math.abs(Number(course.units) - calculatedUnits);

  checks.push({
    id: 'hour_rule',
    label: '54-Hour Rule Compliance',
    description: 'Hours align with unit value per Title 5 § 55002.5',
    status:
      unitDifference < 0.5
        ? 'pass'
        : unitDifference < 1
        ? 'warning'
        : 'fail',
    category: 'required',
  });

  // SLO Checks
  checks.push({
    id: 'slos_exist',
    label: 'Student Learning Outcomes',
    description: 'Course has at least 3 SLOs',
    status:
      course.slos.length >= 3
        ? 'pass'
        : course.slos.length > 0
        ? 'warning'
        : 'fail',
    category: 'required',
  });

  // Check Bloom's distribution
  const bloomLevels = new Set(course.slos.map((s) => s.bloom_level));
  const hasHigherOrder = ['Analyze', 'Evaluate', 'Create'].some((level) =>
    bloomLevels.has(level)
  );

  checks.push({
    id: 'slos_bloom',
    label: "Bloom's Taxonomy Distribution",
    description: 'SLOs include higher-order thinking skills',
    status: hasHigherOrder ? 'pass' : course.slos.length > 0 ? 'warning' : 'fail',
    category: 'recommended',
  });

  // Content Outline Checks
  checks.push({
    id: 'content_exists',
    label: 'Content Outline',
    description: 'Course has content outline topics',
    status:
      course.content_items.length >= 5
        ? 'pass'
        : course.content_items.length > 0
        ? 'warning'
        : 'fail',
    category: 'required',
  });

  // Check content hours sum
  const totalContentHours = course.content_items.reduce(
    (sum, item) => sum + Number(item.hours_allocated || 0),
    0
  );
  const expectedHours = (course.lecture_hours || 0) + (course.lab_hours || 0);

  checks.push({
    id: 'content_hours',
    label: 'Content Hours Allocation',
    description: 'Content hours align with course hours',
    status:
      totalContentHours >= expectedHours * 0.9 &&
      totalContentHours <= expectedHours * 1.1
        ? 'pass'
        : totalContentHours > 0
        ? 'warning'
        : 'fail',
    category: 'recommended',
  });

  // CB Codes Check
  const cbCodesCount = Object.keys(course.cb_codes || {}).length;
  checks.push({
    id: 'cb_codes',
    label: 'CB Codes Complete',
    description: 'California compliance codes are set',
    status: cbCodesCount >= 10 ? 'pass' : cbCodesCount > 0 ? 'warning' : 'fail',
    category: 'required',
  });

  // Requisites Check (just informational)
  checks.push({
    id: 'requisites',
    label: 'Requisites Reviewed',
    description: 'Prerequisites, corequisites, and advisories defined',
    status:
      course.requisites && course.requisites.length > 0
        ? 'pass'
        : 'warning',
    category: 'recommended',
  });

  // Content Review for Prerequisites
  const prereqs = course.requisites?.filter((r) => r.type === 'Prerequisite') || [];
  const prereqsWithReview = prereqs.filter((r) => r.content_review);

  if (prereqs.length > 0) {
    checks.push({
      id: 'content_review',
      label: 'Content Review Documentation',
      description: 'Prerequisites have content review per Title 5 § 55003',
      status:
        prereqsWithReview.length === prereqs.length
          ? 'pass'
          : prereqsWithReview.length > 0
          ? 'warning'
          : 'fail',
      category: 'required',
    });
  }

  return checks;
}

// ===========================================
// Status Icon Component
// ===========================================

function StatusIcon({ status }: { status: 'pass' | 'warning' | 'fail' }) {
  if (status === 'pass') {
    return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
  }
  if (status === 'warning') {
    return <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500" />;
  }
  return <ExclamationCircleIcon className="h-5 w-5 text-red-500" />;
}

// ===========================================
// Section Summary Component
// ===========================================

interface SectionSummaryProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  status: 'complete' | 'incomplete' | 'empty';
  items: string[];
}

function SectionSummary({ icon: Icon, title, status, items }: SectionSummaryProps) {
  const statusColors = {
    complete: 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20',
    incomplete: 'border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20',
    empty: 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20',
  };

  const statusBadges = {
    complete: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    incomplete: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    empty: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };

  return (
    <div className={`border rounded-lg p-4 ${statusColors[status]}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-slate-600 dark:text-slate-400" />
          <span className="font-medium text-slate-900 dark:text-white">{title}</span>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadges[status]}`}>
          {status === 'complete' ? 'Complete' : status === 'incomplete' ? 'Incomplete' : 'Empty'}
        </span>
      </div>
      {items.length > 0 && (
        <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
          {items.slice(0, 3).map((item, i) => (
            <li key={i} className="truncate">• {item}</li>
          ))}
          {items.length > 3 && (
            <li className="text-slate-400 dark:text-slate-500">
              +{items.length - 3} more
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

// ===========================================
// Main Review Section Component
// ===========================================

export function ReviewSection({
  course,
  onSubmitForReview,
  isSubmitting = false,
}: ReviewSectionProps) {
  const [ccnMatches, setCcnMatches] = useState<CCNStandardMatch[]>([]);
  const [isLoadingCCN, setIsLoadingCCN] = useState(false);
  const [selectedStandard, setSelectedStandard] = useState<CCNStandardMatch | null>(null);
  const [showComparisonModal, setShowComparisonModal] = useState(false);

  const complianceChecks = useMemo(() => getComplianceChecks(course), [course]);

  const requiredChecks = complianceChecks.filter((c) => c.category === 'required');
  const recommendedChecks = complianceChecks.filter((c) => c.category === 'recommended');

  const requiredPassing = requiredChecks.filter((c) => c.status === 'pass').length;
  const requiredFailing = requiredChecks.filter((c) => c.status === 'fail').length;

  // Fetch potential CCN matches when component mounts
  useEffect(() => {
    async function fetchCCNMatches() {
      if (!course.subject_code) return;

      setIsLoadingCCN(true);
      try {
        const response = await fetch(
          `/api/reference/ccn-standards/match/${course.subject_code}?title=${encodeURIComponent(course.title)}`
        );
        if (response.ok) {
          const data = await response.json();
          setCcnMatches(data);
        }
      } catch (error) {
        console.error('Failed to fetch CCN matches:', error);
      } finally {
        setIsLoadingCCN(false);
      }
    }

    fetchCCNMatches();
  }, [course.subject_code, course.title]);

  const handleViewComparison = (standard: CCNStandardMatch) => {
    setSelectedStandard(standard);
    setShowComparisonModal(true);
  };

  const canSubmit = requiredFailing === 0 && course.status === 'Draft';

  // Build section summaries
  const sectionSummaries = [
    {
      icon: DocumentTextIcon,
      title: 'Basic Information',
      status: course.catalog_description ? 'complete' : 'incomplete',
      items: [
        `${course.subject_code} ${course.course_number}: ${course.title}`,
        `${course.units} units`,
        `${course.lecture_hours}h lecture, ${course.lab_hours}h lab`,
      ],
    },
    {
      icon: Cog6ToothIcon,
      title: 'CB Codes',
      status:
        Object.keys(course.cb_codes || {}).length >= 10
          ? 'complete'
          : Object.keys(course.cb_codes || {}).length > 0
          ? 'incomplete'
          : 'empty',
      items: Object.entries(course.cb_codes || {})
        .slice(0, 3)
        .map(([key, val]) => `${key}: ${val}`),
    },
    {
      icon: AcademicCapIcon,
      title: 'Student Learning Outcomes',
      status:
        course.slos.length >= 3
          ? 'complete'
          : course.slos.length > 0
          ? 'incomplete'
          : 'empty',
      items: course.slos.map((s) => s.outcome_text),
    },
    {
      icon: ListBulletIcon,
      title: 'Content Outline',
      status:
        course.content_items.length >= 5
          ? 'complete'
          : course.content_items.length > 0
          ? 'incomplete'
          : 'empty',
      items: course.content_items.map((c) => c.topic),
    },
    {
      icon: LinkIcon,
      title: 'Requisites',
      status:
        course.requisites && course.requisites.length > 0
          ? 'complete'
          : 'incomplete',
      items: (course.requisites || []).map((r) =>
        r.requisite_course
          ? `${r.type}: ${r.requisite_course.subject_code} ${r.requisite_course.course_number}`
          : `${r.type}: ${r.requisite_text || 'None'}`
      ),
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
          Review & Submit
        </h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Review your course outline for completeness and compliance before submitting
          for departmental review.
        </p>
      </div>

      {/* Section Summaries Grid */}
      <div>
        <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
          Course Sections
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sectionSummaries.map((section, i) => (
            <SectionSummary
              key={i}
              icon={section.icon}
              title={section.title}
              status={section.status as 'complete' | 'incomplete' | 'empty'}
              items={section.items}
            />
          ))}
        </div>
      </div>

      {/* C-ID Alignment Section */}
      <div className="border border-luminous-200 dark:border-luminous-800 rounded-lg overflow-hidden bg-gradient-to-r from-luminous-50 to-indigo-50 dark:from-luminous-900/20 dark:to-indigo-900/20">
        <div className="px-4 py-3 border-b border-luminous-200 dark:border-luminous-800 bg-white/50 dark:bg-slate-800/50">
          <div className="flex items-center gap-2">
            <CheckBadgeIcon className="h-5 w-5 text-luminous-500" />
            <h4 className="text-sm font-medium text-slate-900 dark:text-white">
              C-ID Standard Alignment (AB 1111)
            </h4>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Check if this course aligns with Common Course Numbering standards for transfer.
          </p>
        </div>
        <div className="p-4">
          {isLoadingCCN ? (
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <div className="animate-spin h-4 w-4 border-2 border-luminous-500 border-t-transparent rounded-full" />
              Searching for matching C-ID standards...
            </div>
          ) : ccnMatches.length > 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                <SparklesIcon className="h-4 w-4 inline text-luminous-500 mr-1" />
                Found {ccnMatches.length} potential C-ID standard{ccnMatches.length > 1 ? 's' : ''} for this course:
              </p>
              <div className="space-y-2">
                {ccnMatches.slice(0, 3).map((match) => (
                  <div
                    key={match.id}
                    className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700"
                  >
                    <div className="flex items-center gap-3">
                      <CheckBadgeIcon className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-slate-900 dark:text-white">
                            {match.c_id}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-luminous-100 dark:bg-luminous-900/30 text-luminous-700 dark:text-luminous-300">
                            Min {match.minimum_units} units
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                          {match.title}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleViewComparison(match)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-luminous-600 dark:text-luminous-400 hover:bg-luminous-100 dark:hover:bg-luminous-900/30 rounded-lg transition-colors"
                    >
                      <ArrowsRightLeftIcon className="h-4 w-4" />
                      Compare
                    </button>
                  </div>
                ))}
              </div>
              {course.units < (ccnMatches[0]?.minimum_units || 0) && (
                <div className="flex items-start gap-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-xs text-amber-700 dark:text-amber-300">
                  <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>
                    This course has {course.units} units, but the matched standard requires a minimum of {ccnMatches[0]?.minimum_units} units.
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
              <MagnifyingGlassIcon className="h-5 w-5 flex-shrink-0" />
              <p>
                No matching C-ID standards found for {course.subject_code} courses.
                This course may not have a statewide common course number, which is acceptable for unique local offerings.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* CCN Comparison Modal */}
      {selectedStandard && (
        <CCNComparisonModal
          isOpen={showComparisonModal}
          onClose={() => {
            setShowComparisonModal(false);
            setSelectedStandard(null);
          }}
          standard={{
            c_id: selectedStandard.c_id,
            discipline: selectedStandard.discipline,
            title: selectedStandard.title,
            descriptor: selectedStandard.descriptor,
            minimum_units: selectedStandard.minimum_units,
            slo_requirements: selectedStandard.slo_requirements || [],
            content_requirements: selectedStandard.content_requirements || [],
          }}
          course={{
            id: course.id,
            subject_code: course.subject_code,
            course_number: course.course_number,
            title: course.title,
            units: course.units,
            catalog_description: course.catalog_description || undefined,
            slos: course.slos.map((slo) => ({
              id: slo.id,
              sequence: slo.sequence,
              text: slo.outcome_text,
              blooms_level: slo.bloom_level,
            })),
            content: course.content_items.map((item) => ({
              id: item.id,
              sequence: item.sequence,
              title: item.topic,
              hours: item.hours_allocated,
            })),
          }}
        />
      )}

      {/* Compliance Checks */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Compliance Checklist
          </h4>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {requiredPassing}/{requiredChecks.length} required checks passing
          </span>
        </div>

        {/* Required Checks */}
        <div className="border border-slate-200 dark:border-slate-700 rounded-lg divide-y divide-slate-200 dark:divide-slate-700">
          <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Required
            </span>
          </div>
          {requiredChecks.map((check) => (
            <div
              key={check.id}
              className="flex items-center gap-3 px-4 py-3"
            >
              <StatusIcon status={check.status} />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-900 dark:text-white text-sm">
                  {check.label}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {check.description}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Recommended Checks */}
        <div className="border border-slate-200 dark:border-slate-700 rounded-lg divide-y divide-slate-200 dark:divide-slate-700">
          <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Recommended
            </span>
          </div>
          {recommendedChecks.map((check) => (
            <div
              key={check.id}
              className="flex items-center gap-3 px-4 py-3"
            >
              <StatusIcon status={check.status} />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-900 dark:text-white text-sm">
                  {check.label}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {check.description}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Submit Button */}
      <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
        {course.status !== 'Draft' ? (
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              This course is already in the review process (status: {course.status}).
              Changes can only be made if it is returned for revision.
            </p>
          </div>
        ) : !canSubmit ? (
          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <p className="text-sm text-yellow-700 dark:text-yellow-300">
              <ExclamationTriangleIcon className="h-5 w-5 inline mr-1" />
              Please address all required compliance checks before submitting for review.
            </p>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="text-sm text-slate-600 dark:text-slate-400">
              All required checks are passing. You can now submit for departmental review.
            </div>
            <button
              onClick={onSubmitForReview}
              disabled={isSubmitting}
              className="luminous-button-primary flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  Submitting...
                </>
              ) : (
                <>
                  <PaperAirplaneIcon className="h-5 w-5" />
                  Submit for Review
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
