'use client';

// ===========================================
// CCN C-ID Comparison Modal Component - CUR-77
// ===========================================
// Side-by-side comparison view showing course vs C-ID standard requirements.
// Highlights gaps and alignment status for SLOs and content topics.

import { useState, useMemo } from 'react';
import {
  XMarkIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  AcademicCapIcon,
  BookOpenIcon,
  CalculatorIcon,
  DocumentTextIcon,
  ArrowsRightLeftIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import { CheckBadgeIcon, SparklesIcon } from '@heroicons/react/24/solid';

// ===========================================
// Types
// ===========================================

export interface CCNStandard {
  c_id: string;
  discipline: string;
  title: string;
  descriptor?: string;
  minimum_units: number;
  slo_requirements?: string[];
  content_requirements?: string[];
}

export interface CourseSLO {
  id: string;
  sequence: number;
  text: string;
  blooms_level?: string;
}

export interface CourseContent {
  id: string;
  sequence: number;
  title: string;
  hours?: number;
}

export interface CourseData {
  id: string;
  subject_code: string;
  course_number: string;
  title: string;
  units: number;
  catalog_description?: string;
  slos: CourseSLO[];
  content: CourseContent[];
}

export interface CCNComparisonModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Called when the modal should close */
  onClose: () => void;
  /** The C-ID standard to compare against */
  standard: CCNStandard;
  /** The current course data */
  course: CourseData;
  /** Optional callback when user wants to adopt the standard */
  onAdoptStandard?: () => void;
  /** Whether adoption is in progress */
  isAdopting?: boolean;
}

// ===========================================
// Helper Components
// ===========================================

type MatchStatus = 'matched' | 'partial' | 'missing' | 'extra';

interface RequirementItemProps {
  text: string;
  status: MatchStatus;
  matchedWith?: string;
  isExpanded?: boolean;
  onToggle?: () => void;
}

function RequirementItem({ text, status, matchedWith, isExpanded, onToggle }: RequirementItemProps) {
  const statusConfig = {
    matched: {
      icon: CheckCircleIcon,
      iconColor: 'text-green-500',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
      borderColor: 'border-green-200 dark:border-green-800',
    },
    partial: {
      icon: ExclamationTriangleIcon,
      iconColor: 'text-amber-500',
      bgColor: 'bg-amber-50 dark:bg-amber-900/20',
      borderColor: 'border-amber-200 dark:border-amber-800',
    },
    missing: {
      icon: ExclamationCircleIcon,
      iconColor: 'text-red-500',
      bgColor: 'bg-red-50 dark:bg-red-900/20',
      borderColor: 'border-red-200 dark:border-red-800',
    },
    extra: {
      icon: InformationCircleIcon,
      iconColor: 'text-blue-500',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      borderColor: 'border-blue-200 dark:border-blue-800',
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div
      className={`p-3 rounded-lg border ${config.bgColor} ${config.borderColor} ${onToggle ? 'cursor-pointer hover:opacity-90' : ''}`}
      onClick={onToggle}
    >
      <div className="flex items-start gap-2">
        <Icon className={`h-5 w-5 flex-shrink-0 mt-0.5 ${config.iconColor}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-700 dark:text-slate-300">{text}</p>
          {matchedWith && isExpanded && (
            <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                <span className="font-medium">Matched with:</span> {matchedWith}
              </p>
            </div>
          )}
        </div>
        {onToggle && (
          <button className="flex-shrink-0 p-1 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 rounded">
            {isExpanded ? (
              <ChevronUpIcon className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDownIcon className="h-4 w-4 text-slate-400" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

interface SectionHeaderProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  count?: number;
  matchedCount?: number;
}

function SectionHeader({ title, icon: Icon, count, matchedCount }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-luminous-500" />
        <h3 className="font-semibold text-slate-900 dark:text-white">{title}</h3>
      </div>
      {count !== undefined && matchedCount !== undefined && (
        <span className="text-sm text-slate-500 dark:text-slate-400">
          <span className={matchedCount === count ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}>
            {matchedCount}
          </span>
          <span className="mx-1">/</span>
          <span>{count}</span>
          <span className="ml-1">matched</span>
        </span>
      )}
    </div>
  );
}

// ===========================================
// Main Component
// ===========================================

export function CCNComparisonModal({
  isOpen,
  onClose,
  standard,
  course,
  onAdoptStandard,
  isAdopting = false,
}: CCNComparisonModalProps) {
  const [expandedSLO, setExpandedSLO] = useState<number | null>(null);
  const [expandedContent, setExpandedContent] = useState<number | null>(null);

  // Calculate alignment analysis
  const analysis = useMemo(() => {
    const sloRequirements = standard.slo_requirements || [];
    const contentRequirements = standard.content_requirements || [];

    // Simple keyword-based matching for SLOs
    const sloMatches = sloRequirements.map((req) => {
      const reqLower = req.toLowerCase();
      const matchedSLO = course.slos.find((slo) => {
        const sloLower = slo.text.toLowerCase();
        // Check for keyword overlap
        const reqWords = reqLower.split(/\s+/).filter(w => w.length > 4);
        const matchScore = reqWords.filter(word => sloLower.includes(word)).length;
        return matchScore >= 2 || sloLower.includes(reqLower.slice(0, 20));
      });
      return {
        requirement: req,
        status: matchedSLO ? 'matched' as MatchStatus : 'missing' as MatchStatus,
        matchedWith: matchedSLO?.text,
      };
    });

    // Content matching
    const contentMatches = contentRequirements.map((req) => {
      const reqLower = req.toLowerCase();
      const matchedContent = course.content.find((c) => {
        const contentLower = c.title.toLowerCase();
        const reqWords = reqLower.split(/\s+/).filter(w => w.length > 4);
        const matchScore = reqWords.filter(word => contentLower.includes(word)).length;
        return matchScore >= 1 || contentLower.includes(reqLower.slice(0, 15));
      });
      return {
        requirement: req,
        status: matchedContent ? 'matched' as MatchStatus : 'missing' as MatchStatus,
        matchedWith: matchedContent?.title,
      };
    });

    // Extra items in course not in standard
    const extraSLOs = course.slos.filter(slo =>
      !sloRequirements.some(req => {
        const reqLower = req.toLowerCase();
        const sloLower = slo.text.toLowerCase();
        const reqWords = reqLower.split(/\s+/).filter(w => w.length > 4);
        return reqWords.filter(word => sloLower.includes(word)).length >= 2;
      })
    );

    const extraContent = course.content.filter(c =>
      !contentRequirements.some(req => {
        const reqLower = req.toLowerCase();
        const contentLower = c.title.toLowerCase();
        const reqWords = reqLower.split(/\s+/).filter(w => w.length > 4);
        return reqWords.filter(word => contentLower.includes(word)).length >= 1;
      })
    );

    // Units check
    const unitsMatch = course.units >= standard.minimum_units;

    // Overall score
    const sloMatchedCount = sloMatches.filter(m => m.status === 'matched').length;
    const contentMatchedCount = contentMatches.filter(m => m.status === 'matched').length;
    const totalRequired = sloRequirements.length + contentRequirements.length + 1; // +1 for units
    const totalMatched = sloMatchedCount + contentMatchedCount + (unitsMatch ? 1 : 0);
    const alignmentScore = totalRequired > 0 ? Math.round((totalMatched / totalRequired) * 100) : 100;

    return {
      sloMatches,
      contentMatches,
      extraSLOs,
      extraContent,
      unitsMatch,
      sloMatchedCount,
      contentMatchedCount,
      alignmentScore,
    };
  }, [standard, course]);

  if (!isOpen) return null;

  const scoreColor = analysis.alignmentScore >= 80
    ? 'text-green-600 dark:text-green-400'
    : analysis.alignmentScore >= 50
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-red-600 dark:text-red-400';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className="relative w-full max-w-5xl bg-white dark:bg-slate-900 rounded-xl shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-luminous-50 to-indigo-50 dark:from-luminous-900/20 dark:to-indigo-900/20">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-luminous-100 dark:bg-luminous-900/40 flex items-center justify-center">
                <ArrowsRightLeftIcon className="h-5 w-5 text-luminous-600 dark:text-luminous-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  C-ID Standard Comparison
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {course.subject_code} {course.course_number} vs {standard.c_id}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-200/50 dark:hover:bg-slate-700/50 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              aria-label="Close"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 max-h-[calc(100vh-200px)] overflow-y-auto">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {/* Alignment Score */}
              <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 text-center">
                <div className={`text-3xl font-bold ${scoreColor}`}>
                  {analysis.alignmentScore}%
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  Overall Alignment
                </p>
              </div>

              {/* Course Info */}
              <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <DocumentTextIcon className="h-5 w-5 text-slate-500" />
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {course.subject_code} {course.course_number}
                  </span>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 truncate">
                  {course.title}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">
                  {course.units} units • {course.slos.length} SLOs • {course.content.length} topics
                </p>
              </div>

              {/* Standard Info */}
              <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckBadgeIcon className="h-5 w-5 text-green-500" />
                  <span className="font-mono font-semibold text-slate-900 dark:text-white">
                    {standard.c_id}
                  </span>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 truncate">
                  {standard.title}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">
                  Min {standard.minimum_units} units • {standard.slo_requirements?.length || 0} SLO reqs • {standard.content_requirements?.length || 0} content reqs
                </p>
              </div>
            </div>

            {/* Units Check */}
            <div className={`mb-6 p-4 rounded-lg border ${
              analysis.unitsMatch
                ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
            }`}>
              <div className="flex items-center gap-3">
                <CalculatorIcon className={`h-5 w-5 ${analysis.unitsMatch ? 'text-green-500' : 'text-red-500'}`} />
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">
                    Unit Requirement
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Course: <strong>{course.units}</strong> units |
                    Standard minimum: <strong>{standard.minimum_units}</strong> units
                    {!analysis.unitsMatch && (
                      <span className="text-red-600 dark:text-red-400 ml-2">
                        (Needs {standard.minimum_units - course.units} more units)
                      </span>
                    )}
                  </p>
                </div>
                {analysis.unitsMatch ? (
                  <CheckCircleIcon className="h-6 w-6 text-green-500 ml-auto" />
                ) : (
                  <ExclamationCircleIcon className="h-6 w-6 text-red-500 ml-auto" />
                )}
              </div>
            </div>

            {/* Two Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* SLO Comparison */}
              <div>
                <SectionHeader
                  title="SLO Requirements"
                  icon={AcademicCapIcon}
                  count={standard.slo_requirements?.length || 0}
                  matchedCount={analysis.sloMatchedCount}
                />

                <div className="space-y-2">
                  {analysis.sloMatches.length > 0 ? (
                    analysis.sloMatches.map((match, index) => (
                      <RequirementItem
                        key={index}
                        text={match.requirement}
                        status={match.status}
                        matchedWith={match.matchedWith}
                        isExpanded={expandedSLO === index}
                        onToggle={() => setExpandedSLO(expandedSLO === index ? null : index)}
                      />
                    ))
                  ) : (
                    <p className="text-sm text-slate-500 dark:text-slate-400 italic p-3">
                      No SLO requirements specified for this standard.
                    </p>
                  )}
                </div>

                {/* Extra SLOs in course */}
                {analysis.extraSLOs.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">
                      Additional Course SLOs (not in standard)
                    </p>
                    <div className="space-y-2">
                      {analysis.extraSLOs.map((slo) => (
                        <RequirementItem
                          key={slo.id}
                          text={slo.text}
                          status="extra"
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Content Comparison */}
              <div>
                <SectionHeader
                  title="Content Requirements"
                  icon={BookOpenIcon}
                  count={standard.content_requirements?.length || 0}
                  matchedCount={analysis.contentMatchedCount}
                />

                <div className="space-y-2">
                  {analysis.contentMatches.length > 0 ? (
                    analysis.contentMatches.map((match, index) => (
                      <RequirementItem
                        key={index}
                        text={match.requirement}
                        status={match.status}
                        matchedWith={match.matchedWith}
                        isExpanded={expandedContent === index}
                        onToggle={() => setExpandedContent(expandedContent === index ? null : index)}
                      />
                    ))
                  ) : (
                    <p className="text-sm text-slate-500 dark:text-slate-400 italic p-3">
                      No content requirements specified for this standard.
                    </p>
                  )}
                </div>

                {/* Extra Content in course */}
                {analysis.extraContent.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">
                      Additional Course Topics (not in standard)
                    </p>
                    <div className="space-y-2">
                      {analysis.extraContent.map((content) => (
                        <RequirementItem
                          key={content.id}
                          text={content.title}
                          status="extra"
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Standard Description */}
            {standard.descriptor && (
              <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <h4 className="font-medium text-slate-900 dark:text-white mb-2">
                  Standard Description
                </h4>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {standard.descriptor}
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <SparklesIcon className="h-4 w-4 text-luminous-500" />
              <span>Matching is based on keyword analysis. Review carefully.</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Close
              </button>
              {onAdoptStandard && (
                <button
                  onClick={onAdoptStandard}
                  disabled={isAdopting}
                  className="flex items-center gap-2 px-4 py-2 bg-luminous-600 hover:bg-luminous-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isAdopting ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                      Adopting...
                    </>
                  ) : (
                    <>
                      <CheckBadgeIcon className="h-4 w-4" />
                      Adopt This Standard
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CCNComparisonModal;
