'use client';

/**
 * ComplianceAuditSidebar - Real-time compliance checking sidebar
 *
 * Displays compliance audit results for a course in real-time,
 * showing pass/fail/warning status for each compliance rule.
 * Integrates with the course editor to provide immediate feedback.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ArrowPathIcon,
  XMarkIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import { api, CourseDetail, SLOItem, ContentItem, RequisiteItem } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

// ===========================================
// Types
// ===========================================

export type ComplianceStatus = 'pass' | 'fail' | 'warn';

export interface ComplianceResult {
  rule_id: string;
  rule_name: string;
  category: string;
  status: ComplianceStatus;
  message: string;
  section?: string;
  citation?: string;
  recommendation?: string;
}

export interface ComplianceAuditResponse {
  overall_status: ComplianceStatus;
  compliance_score: number;
  total_checks: number;
  passed: number;
  failed: number;
  warnings: number;
  results: ComplianceResult[];
  results_by_category: Record<string, ComplianceResult[]>;
}

interface ComplianceAuditSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  course: CourseDetail;
  currentSection?: string;
}

// ===========================================
// Category Display Names
// ===========================================

const CATEGORY_LABELS: Record<string, string> = {
  Title5: 'Title 5 Regulations',
  PCAH: 'PCAH Requirements',
  CBCodes: 'CB Codes',
  CCNAlignment: 'CCN Alignment (AB 1111)',
  UnitsHours: 'Units & Hours',
  SLO: 'Student Learning Outcomes',
  Content: 'Course Content',
  Requisites: 'Prerequisites',
  General: 'General Requirements',
};

const CATEGORY_ORDER = [
  'UnitsHours',
  'Title5',
  'CBCodes',
  'CCNAlignment',
  'SLO',
  'Content',
  'Requisites',
  'PCAH',
  'General',
];

// ===========================================
// CCN Compliance Check Generator - CUR-227
// ===========================================

/**
 * Generates CCN compliance check results based on course data.
 * This runs client-side to supplement backend checks.
 */
function generateCCNComplianceChecks(course: CourseDetail): ComplianceResult[] {
  const results: ComplianceResult[] = [];
  const cbCodes = course.cb_codes as Record<string, string> || {};

  // CCN-001: Transfer Status Validation
  // CCN-aligned courses must be transferable (CB05 = 'A' for UC+CSU)
  if (course.ccn_id) {
    const cb05Value = cbCodes.CB05 || cbCodes.cb05;
    if (cb05Value === 'A') {
      results.push({
        rule_id: 'CCN-001',
        rule_name: 'Transfer Status',
        category: 'CCNAlignment',
        status: 'pass',
        message: 'Course is transferable to UC and CSU',
        citation: 'AB 1111 (Common Course Numbering)',
      });
    } else {
      results.push({
        rule_id: 'CCN-001',
        rule_name: 'Transfer Status',
        category: 'CCNAlignment',
        status: 'fail',
        message: `CCN-aligned courses must be transferable (CB05=A). Current: ${cb05Value || 'Not set'}`,
        citation: 'AB 1111 (Common Course Numbering)',
        recommendation: 'Set CB05 (Transfer Status) to "A - Transferable to UC and CSU" in CB Codes section.',
      });
    }

    // CCN-002: Minimum Units Check
    // This would require knowing the CCN standard's minimum units - for now, warn if < 3 units
    if (course.units >= 3) {
      results.push({
        rule_id: 'CCN-002',
        rule_name: 'CCN Minimum Units',
        category: 'CCNAlignment',
        status: 'pass',
        message: `Course has ${course.units} units`,
        citation: 'AB 1111 (Common Course Numbering)',
      });
    } else {
      results.push({
        rule_id: 'CCN-002',
        rule_name: 'CCN Minimum Units',
        category: 'CCNAlignment',
        status: 'warn',
        message: `Course has ${course.units} units. Many CCN standards require 3+ units.`,
        citation: 'AB 1111 (Common Course Numbering)',
        recommendation: 'Verify this course meets the minimum unit requirement for its CCN standard.',
      });
    }

    // Show CCN alignment status
    results.push({
      rule_id: 'CCN-000',
      rule_name: `Aligned with ${course.ccn_id}`,
      category: 'CCNAlignment',
      status: 'pass',
      message: 'Course is aligned with a C-ID standard per AB 1111',
      citation: 'AB 1111 § 66745',
    });
  } else {
    // CCN-003: Justification Status
    // Non-CCN courses should have a justification
    const justification = course.ccn_justification as Record<string, unknown> | null;
    if (justification && justification.reason_code) {
      results.push({
        rule_id: 'CCN-003',
        rule_name: 'CCN Non-Match Justification',
        category: 'CCNAlignment',
        status: 'pass',
        message: `Justification provided: ${justification.reason_code}`,
        citation: 'AB 1111 § 66745.5',
      });
    } else {
      results.push({
        rule_id: 'CCN-003',
        rule_name: 'CCN Alignment Required',
        category: 'CCNAlignment',
        status: 'warn',
        message: 'Course is not aligned with any CCN standard',
        citation: 'AB 1111 § 66745',
        recommendation: 'Either align with a CCN standard or provide a justification for non-alignment in the CB Codes wizard.',
      });
    }
  }

  return results;
}

// ===========================================
// Helper Components
// ===========================================

function StatusIcon({ status, className = 'h-5 w-5' }: { status: ComplianceStatus; className?: string }) {
  switch (status) {
    case 'pass':
      return <CheckCircleIcon className={`${className} text-green-500`} />;
    case 'fail':
      return <XCircleIcon className={`${className} text-red-500`} />;
    case 'warn':
      return <ExclamationTriangleIcon className={`${className} text-amber-500`} />;
    default:
      return <InformationCircleIcon className={`${className} text-slate-400`} />;
  }
}

function ScoreRing({ score, size = 80 }: { score: number; size?: number }) {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const getColor = () => {
    if (score >= 80) return '#22c55e'; // green-500
    if (score >= 60) return '#f59e0b'; // amber-500
    return '#ef4444'; // red-500
  };

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-slate-200 dark:text-slate-700"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={getColor()}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      {/* Score text */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xl font-bold text-slate-900 dark:text-white">
          {score}%
        </span>
      </div>
    </div>
  );
}

interface CategoryGroupProps {
  category: string;
  results: ComplianceResult[];
  defaultExpanded?: boolean;
}

function CategoryGroup({ category, results, defaultExpanded = false }: CategoryGroupProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const categoryId = `compliance-category-${category}`;

  const passCount = results.filter(r => r.status === 'pass').length;
  const failCount = results.filter(r => r.status === 'fail').length;
  const warnCount = results.filter(r => r.status === 'warn').length;

  // Determine overall category status
  const categoryStatus: ComplianceStatus = failCount > 0 ? 'fail' : warnCount > 0 ? 'warn' : 'pass';
  const categoryLabel = CATEGORY_LABELS[category] || category;

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
      {/* Category Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-controls={`${categoryId}-content`}
        aria-label={`${categoryLabel}: ${passCount} passed, ${failCount} failed, ${warnCount} warnings. Click to ${expanded ? 'collapse' : 'expand'}`}
        className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-luminous-500 focus-visible:ring-inset"
      >
        <div className="flex items-center gap-2">
          <StatusIcon status={categoryStatus} className="h-4 w-4" />
          <span className="text-sm font-medium text-slate-900 dark:text-white">
            {categoryLabel}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Mini counts */}
          <div className="flex items-center gap-1 text-xs" aria-hidden="true">
            {passCount > 0 && (
              <span className="text-green-600 dark:text-green-400">{passCount}✓</span>
            )}
            {failCount > 0 && (
              <span className="text-red-600 dark:text-red-400">{failCount}✗</span>
            )}
            {warnCount > 0 && (
              <span className="text-amber-600 dark:text-amber-400">{warnCount}!</span>
            )}
          </div>
          {expanded ? (
            <ChevronDownIcon className="h-4 w-4 text-slate-400" aria-hidden="true" />
          ) : (
            <ChevronRightIcon className="h-4 w-4 text-slate-400" aria-hidden="true" />
          )}
        </div>
      </button>

      {/* Results List */}
      {expanded && (
        <div id={`${categoryId}-content`} className="divide-y divide-slate-100 dark:divide-slate-800" role="list" aria-label={`${categoryLabel} compliance results`}>
          {results.map((result) => (
            <ResultItem key={result.rule_id} result={result} />
          ))}
        </div>
      )}
    </div>
  );
}

function ResultItem({ result }: { result: ComplianceResult }) {
  const [showDetails, setShowDetails] = useState(false);
  const hasDetails = result.citation || result.recommendation;
  const statusLabel = result.status === 'pass' ? 'Passed' : result.status === 'fail' ? 'Failed' : 'Warning';

  return (
    <div className="px-3 py-2" role="listitem">
      <button
        onClick={() => setShowDetails(!showDetails)}
        aria-expanded={hasDetails ? showDetails : undefined}
        aria-label={`${result.rule_name}: ${statusLabel}. ${result.status !== 'pass' ? result.message : ''}${hasDetails ? ` Click for more details.` : ''}`}
        className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-luminous-500 focus-visible:ring-offset-2 rounded"
      >
        <div className="flex items-start gap-2">
          <StatusIcon status={result.status} className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className={`text-sm ${
              result.status === 'pass'
                ? 'text-slate-600 dark:text-slate-400'
                : 'text-slate-900 dark:text-white'
            }`}>
              {result.rule_name}
            </p>
            {result.status !== 'pass' && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {result.message}
              </p>
            )}
          </div>
        </div>
      </button>

      {/* Expandable details */}
      {showDetails && hasDetails && (
        <div className="mt-2 ml-6 p-2 bg-slate-50 dark:bg-slate-800/50 rounded text-xs space-y-1" role="region" aria-label={`Details for ${result.rule_name}`}>
          {result.citation && (
            <p className="text-slate-600 dark:text-slate-400">
              <span className="font-medium">Citation:</span> {result.citation}
            </p>
          )}
          {result.recommendation && (
            <p className="text-slate-600 dark:text-slate-400">
              <span className="font-medium">Fix:</span> {result.recommendation}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ===========================================
// Main Component
// ===========================================

export function ComplianceAuditSidebar({
  isOpen,
  onClose,
  course,
  currentSection,
}: ComplianceAuditSidebarProps) {
  const { getToken } = useAuth();
  const [auditResult, setAuditResult] = useState<ComplianceAuditResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generate client-side CCN compliance checks and merge with backend results
  const enhancedAuditResult = useMemo(() => {
    if (!auditResult) return null;

    // Generate CCN checks from course data
    const ccnChecks = generateCCNComplianceChecks(course);

    // If backend already returned CCN results, use them instead
    const hasCCNFromBackend = auditResult.results_by_category['CCNAlignment']?.length > 0;
    if (hasCCNFromBackend) {
      return auditResult;
    }

    // Merge client-side CCN checks into the audit results
    const updatedResultsByCategory = {
      ...auditResult.results_by_category,
      CCNAlignment: ccnChecks,
    };

    // Update totals
    const ccnPassed = ccnChecks.filter(r => r.status === 'pass').length;
    const ccnFailed = ccnChecks.filter(r => r.status === 'fail').length;
    const ccnWarnings = ccnChecks.filter(r => r.status === 'warn').length;

    return {
      ...auditResult,
      total_checks: auditResult.total_checks + ccnChecks.length,
      passed: auditResult.passed + ccnPassed,
      failed: auditResult.failed + ccnFailed,
      warnings: auditResult.warnings + ccnWarnings,
      results: [...auditResult.results, ...ccnChecks],
      results_by_category: updatedResultsByCategory,
      overall_status: ccnFailed > 0 || auditResult.overall_status === 'fail'
        ? 'fail'
        : ccnWarnings > 0 || auditResult.overall_status === 'warn'
        ? 'warn'
        : auditResult.overall_status,
    } as ComplianceAuditResponse;
  }, [auditResult, course]);

  // Run compliance audit
  const runAudit = useCallback(async () => {
    if (!course?.id) return;

    setLoading(true);
    setError(null);

    try {
      // Get auth token
      const token = await getToken();

      // Build course data for audit
      const courseData = {
        title: course.title,
        catalog_description: course.catalog_description,
        units: course.units,
        lecture_hours: course.lecture_hours,
        lab_hours: course.lab_hours,
        outside_of_class_hours: course.outside_of_class_hours,
        activity_hours: course.activity_hours,
        tba_hours: course.tba_hours,
        top_code: course.top_code,
        cb_codes: course.cb_codes || {},
        transferability: course.transferability || {},
        ge_applicability: course.ge_applicability || {},
        // CCN data for AB 1111 compliance checks
        ccn_id: course.ccn_id || null,
        ccn_justification: course.ccn_justification || null,
      };

      // Convert SLOs
      const slos = (course.slos || []).map((slo: SLOItem) => ({
        id: slo.id,
        sequence: slo.sequence,
        outcome_text: slo.outcome_text,
        bloom_level: slo.bloom_level,
        performance_criteria: slo.performance_criteria,
      }));

      // Convert content items
      const contentItems = (course.content_items || []).map((item: ContentItem) => ({
        id: item.id,
        sequence: item.sequence,
        topic: item.topic,
        subtopics: item.subtopics,
        hours_allocated: item.hours_allocated,
        linked_slos: item.linked_slos,
      }));

      // Convert requisites
      const requisites = (course.requisites || []).map((req: RequisiteItem) => ({
        id: req.id,
        type: req.type,
        requisite_course_id: req.requisite_course_id,
        requisite_text: req.requisite_text,
        content_review: req.content_review,
      }));

      // Call the compliance audit API with authentication
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'}/api/compliance/audit`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          course_data: courseData,
          slos,
          content_items: contentItems,
          requisites,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to run compliance audit');
      }

      const result = await response.json();
      setAuditResult(result);
    } catch (err) {
      console.error('Compliance audit error:', err);
      setError(err instanceof Error ? err.message : 'Failed to run audit');
    } finally {
      setLoading(false);
    }
  }, [course, getToken]);

  // Run audit when sidebar opens or course changes
  useEffect(() => {
    if (isOpen && course?.id) {
      runAudit();
    }
  }, [isOpen, course?.id, course?.title, course?.units, course?.lecture_hours,
      course?.lab_hours, course?.outside_of_class_hours, course?.cb_codes,
      course?.slos, course?.content_items, course?.requisites,
      course?.ccn_id, course?.ccn_justification, runAudit]);

  if (!isOpen) return null;

  return (
    <aside className="h-full flex flex-col bg-white dark:bg-slate-900" aria-label="Compliance Audit Panel" role="complementary">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <ShieldCheckIcon className="h-5 w-5 text-luminous-600 dark:text-luminous-400" aria-hidden="true" />
          <h3 className="font-semibold text-slate-900 dark:text-white">
            Compliance Audit
          </h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={runAudit}
            disabled={loading}
            aria-label={loading ? 'Refreshing compliance audit...' : 'Refresh compliance audit'}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-luminous-500 focus-visible:ring-offset-2"
          >
            <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
          <button
            onClick={onClose}
            aria-label="Close compliance audit panel"
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-luminous-500 focus-visible:ring-offset-2"
          >
            <XMarkIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading && !enhancedAuditResult ? (
          <div className="flex flex-col items-center justify-center py-8">
            <ArrowPathIcon className="h-8 w-8 text-luminous-500 animate-spin mb-2" />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Running compliance checks...
            </p>
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <XCircleIcon className="h-8 w-8 text-red-500 mx-auto mb-2" />
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            <button
              onClick={runAudit}
              className="mt-3 text-sm text-luminous-600 dark:text-luminous-400 hover:underline"
            >
              Try again
            </button>
          </div>
        ) : enhancedAuditResult ? (
          <div className="space-y-4">
            {/* Score Summary */}
            <div className="flex items-center justify-center py-2">
              <div className="flex flex-col items-center">
                <ScoreRing score={Math.round(enhancedAuditResult.compliance_score)} />
                <p className="mt-2 text-sm font-medium text-slate-900 dark:text-white">
                  Compliance Score
                </p>
                <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 dark:text-slate-400">
                  <span className="text-green-600 dark:text-green-400">
                    {enhancedAuditResult.passed} passed
                  </span>
                  <span className="text-red-600 dark:text-red-400">
                    {enhancedAuditResult.failed} failed
                  </span>
                  <span className="text-amber-600 dark:text-amber-400">
                    {enhancedAuditResult.warnings} warnings
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Status */}
            <div className={`p-3 rounded-lg ${
              enhancedAuditResult.overall_status === 'pass'
                ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                : enhancedAuditResult.overall_status === 'fail'
                ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                : 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'
            }`}>
              <div className="flex items-center gap-2">
                <StatusIcon status={enhancedAuditResult.overall_status} className="h-5 w-5" />
                <span className={`text-sm font-medium ${
                  enhancedAuditResult.overall_status === 'pass'
                    ? 'text-green-700 dark:text-green-300'
                    : enhancedAuditResult.overall_status === 'fail'
                    ? 'text-red-700 dark:text-red-300'
                    : 'text-amber-700 dark:text-amber-300'
                }`}>
                  {enhancedAuditResult.overall_status === 'pass'
                    ? 'Course passes compliance checks'
                    : enhancedAuditResult.overall_status === 'fail'
                    ? 'Course has compliance issues'
                    : 'Course has compliance warnings'}
                </span>
              </div>
            </div>

            {/* Results by Category */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Audit Results
              </h4>
              {CATEGORY_ORDER.filter(cat => enhancedAuditResult.results_by_category[cat]?.length > 0).map((category) => (
                <CategoryGroup
                  key={category}
                  category={category}
                  results={enhancedAuditResult.results_by_category[category]}
                  defaultExpanded={
                    enhancedAuditResult.results_by_category[category].some(r => r.status !== 'pass')
                  }
                />
              ))}
              {/* Show any categories not in our order */}
              {Object.keys(enhancedAuditResult.results_by_category)
                .filter(cat => !CATEGORY_ORDER.includes(cat) && enhancedAuditResult.results_by_category[cat]?.length > 0)
                .map((category) => (
                  <CategoryGroup
                    key={category}
                    category={category}
                    results={enhancedAuditResult.results_by_category[category]}
                    defaultExpanded={
                      enhancedAuditResult.results_by_category[category].some(r => r.status !== 'pass')
                    }
                  />
                ))}
            </div>

            {/* Tip */}
            <div className="p-3 bg-luminous-50 dark:bg-luminous-900/20 rounded-lg border border-luminous-200 dark:border-luminous-800">
              <p className="text-xs text-luminous-700 dark:text-luminous-300">
                <strong>Tip:</strong> Click on any failed check to see the regulatory citation and recommended fix.
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

export default ComplianceAuditSidebar;
