'use client';

// ===========================================
// CCN Adopt Standard Prompt Component - CUR-76
// ===========================================
// AI Insight card style prompt that appears when a course matches
// a C-ID standard, offering to adopt it.

import { useState, useCallback } from 'react';
import {
  SparklesIcon,
  CheckBadgeIcon,
  XMarkIcon,
  ArrowTopRightOnSquareIcon,
  LinkIcon,
  MagnifyingGlassIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  BookOpenIcon,
  AcademicCapIcon,
} from '@heroicons/react/24/outline';
import {
  SparklesIcon as SparklesSolidIcon,
} from '@heroicons/react/24/solid';

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

export interface CCNMatchResult {
  c_id: string;
  discipline: string;
  title: string;
  descriptor?: string;
  minimum_units: number;
  confidence_score: number;
  match_reasons: string[];
  slo_requirements: string[];
  content_requirements: string[];
  alignment_status: 'aligned' | 'potential' | 'review_needed';
  units_sufficient: boolean;
}

export interface CCNAdoptPromptProps {
  /** The matched C-ID standard */
  match: CCNMatchResult;
  /** Current course title for display */
  courseTitle?: string;
  /** Current course units for comparison */
  courseUnits?: number;
  /** Called when user adopts the standard */
  onAdopt: (standard: CCNStandard) => void;
  /** Called when user dismisses the prompt */
  onDismiss: () => void;
  /** Called when user wants to view full comparison */
  onViewRequirements?: (standard: CCNStandard) => void;
  /** Called when user wants to search for other standards */
  onSearchStandards?: () => void;
  /** Whether the adoption is in progress */
  isAdopting?: boolean;
  /** Optional className */
  className?: string;
}

// ===========================================
// Sub-Components
// ===========================================

interface RequirementSectionProps {
  title: string;
  items: string[];
  icon: React.ComponentType<{ className?: string }>;
  maxItems?: number;
}

function RequirementSection({ title, items, icon: Icon, maxItems = 3 }: RequirementSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const displayItems = isExpanded ? items : items.slice(0, maxItems);
  const hasMore = items.length > maxItems;

  if (items.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-slate-500 dark:text-slate-400" />
        <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {title}
        </h4>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          ({items.length})
        </span>
      </div>
      <ul className="space-y-1 ml-6">
        {displayItems.map((item, index) => (
          <li
            key={index}
            className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400"
          >
            <CheckCircleIcon className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      {hasMore && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1 ml-6 text-xs font-medium text-luminous-600 dark:text-luminous-400 hover:text-luminous-700 dark:hover:text-luminous-300"
        >
          {isExpanded ? (
            <>
              <ChevronUpIcon className="h-3 w-3" />
              Show less
            </>
          ) : (
            <>
              <ChevronDownIcon className="h-3 w-3" />
              Show {items.length - maxItems} more
            </>
          )}
        </button>
      )}
    </div>
  );
}

// ===========================================
// Main Component
// ===========================================

export function CCNAdoptPrompt({
  match,
  courseTitle,
  courseUnits,
  onAdopt,
  onDismiss,
  onViewRequirements,
  onSearchStandards,
  isAdopting = false,
  className = '',
}: CCNAdoptPromptProps) {
  const [showDetails, setShowDetails] = useState(false);

  const handleAdopt = useCallback(() => {
    const standard: CCNStandard = {
      c_id: match.c_id,
      discipline: match.discipline,
      title: match.title,
      descriptor: match.descriptor,
      minimum_units: match.minimum_units,
      slo_requirements: match.slo_requirements,
      content_requirements: match.content_requirements,
    };
    onAdopt(standard);
  }, [match, onAdopt]);

  const handleViewRequirements = useCallback(() => {
    const standard: CCNStandard = {
      c_id: match.c_id,
      discipline: match.discipline,
      title: match.title,
      descriptor: match.descriptor,
      minimum_units: match.minimum_units,
      slo_requirements: match.slo_requirements,
      content_requirements: match.content_requirements,
    };
    onViewRequirements?.(standard);
  }, [match, onViewRequirements]);

  const confidencePercent = Math.round(match.confidence_score * 100);
  const isHighConfidence = match.confidence_score >= 0.7;
  const hasUnitsIssue = !match.units_sufficient && courseUnits !== undefined;

  return (
    <div
      className={`
        bg-gradient-to-br from-luminous-50 to-indigo-50
        dark:from-luminous-900/20 dark:to-indigo-900/20
        border border-luminous-200 dark:border-luminous-800
        rounded-xl overflow-hidden shadow-sm
        ${className}
      `}
    >
      {/* Header */}
      <div className="flex items-start justify-between p-4 pb-3">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-luminous-100 dark:bg-luminous-900/40 flex items-center justify-center">
            <SparklesSolidIcon className="h-5 w-5 text-luminous-600 dark:text-luminous-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-900 dark:text-white">
                C-ID Standard Match Found
              </h3>
              {isHighConfidence && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 font-medium">
                  High Match
                </span>
              )}
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
              {courseTitle ? (
                <>
                  &ldquo;{courseTitle}&rdquo; matches{' '}
                  <span className="font-mono font-medium text-luminous-600 dark:text-luminous-400">
                    {match.c_id}
                  </span>
                </>
              ) : (
                <>
                  This course matches{' '}
                  <span className="font-mono font-medium text-luminous-600 dark:text-luminous-400">
                    {match.c_id}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
        <button
          onClick={onDismiss}
          className="p-1.5 rounded-lg hover:bg-slate-200/50 dark:hover:bg-slate-700/50 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          aria-label="Dismiss"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Standard Info Card */}
      <div className="mx-4 p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <CheckBadgeIcon className="h-5 w-5 text-green-500" />
              <span className="font-mono font-bold text-lg text-slate-900 dark:text-white">
                {match.c_id}
              </span>
            </div>
            <h4 className="font-medium text-slate-800 dark:text-slate-200">
              {match.title}
            </h4>
            <div className="flex items-center gap-4 mt-2 text-sm text-slate-600 dark:text-slate-400">
              <span>
                <span className="text-slate-500">Discipline:</span>{' '}
                <span className="font-medium">{match.discipline}</span>
              </span>
              <span>
                <span className="text-slate-500">Min Units:</span>{' '}
                <span className="font-medium">{match.minimum_units}</span>
              </span>
            </div>
          </div>

          {/* Confidence Score */}
          <div className="text-right">
            <div className="text-2xl font-bold text-luminous-600 dark:text-luminous-400">
              {confidencePercent}%
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              match confidence
            </div>
          </div>
        </div>

        {/* Match Reasons */}
        {match.match_reasons.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
            <div className="flex flex-wrap gap-2">
              {match.match_reasons.slice(0, 3).map((reason, index) => (
                <span
                  key={index}
                  className="text-xs px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400"
                >
                  {reason}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Units Warning */}
        {hasUnitsIssue && (
          <div className="mt-3 flex items-start gap-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
            <ExclamationTriangleIcon className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 dark:text-amber-300">
              Your course has {courseUnits} units, but this standard requires a minimum of{' '}
              {match.minimum_units} units. Consider adjusting course units before adopting.
            </p>
          </div>
        )}
      </div>

      {/* Expandable Requirements */}
      <div className="px-4 py-3">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-2 text-sm font-medium text-luminous-600 dark:text-luminous-400 hover:text-luminous-700 dark:hover:text-luminous-300"
        >
          {showDetails ? (
            <>
              <ChevronUpIcon className="h-4 w-4" />
              Hide Standard Requirements
            </>
          ) : (
            <>
              <ChevronDownIcon className="h-4 w-4" />
              View Standard Requirements
            </>
          )}
        </button>

        {showDetails && (
          <div className="mt-4 space-y-4">
            {/* Descriptor */}
            {match.descriptor && (
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Standard Description
                </h4>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {match.descriptor}
                </p>
              </div>
            )}

            {/* SLO Requirements */}
            <RequirementSection
              title="SLO Requirements"
              items={match.slo_requirements}
              icon={AcademicCapIcon}
            />

            {/* Content Requirements */}
            <RequirementSection
              title="Content Requirements"
              items={match.content_requirements}
              icon={BookOpenIcon}
            />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 pb-4 flex flex-wrap items-center gap-3">
        {/* Primary: Adopt Standard */}
        <button
          onClick={handleAdopt}
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
              <LinkIcon className="h-4 w-4" />
              Adopt Standard
            </>
          )}
        </button>

        {/* Secondary: View Requirements */}
        {onViewRequirements && (
          <button
            onClick={handleViewRequirements}
            className="flex items-center gap-2 px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium rounded-lg transition-colors"
          >
            <ArrowTopRightOnSquareIcon className="h-4 w-4" />
            View Requirements
          </button>
        )}

        {/* Tertiary: Search Other Standards */}
        {onSearchStandards && (
          <button
            onClick={onSearchStandards}
            className="flex items-center gap-2 px-3 py-2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 text-sm rounded-lg transition-colors ml-auto"
          >
            <MagnifyingGlassIcon className="h-4 w-4" />
            Search Other Standards
          </button>
        )}
      </div>
    </div>
  );
}

// ===========================================
// Compact Variant for Sidebars
// ===========================================

export interface CCNAdoptPromptCompactProps {
  match: CCNMatchResult;
  onAdopt: (standard: CCNStandard) => void;
  onDismiss: () => void;
  onViewDetails?: () => void;
  isAdopting?: boolean;
  className?: string;
}

export function CCNAdoptPromptCompact({
  match,
  onAdopt,
  onDismiss,
  onViewDetails,
  isAdopting = false,
  className = '',
}: CCNAdoptPromptCompactProps) {
  const handleAdopt = useCallback(() => {
    const standard: CCNStandard = {
      c_id: match.c_id,
      discipline: match.discipline,
      title: match.title,
      descriptor: match.descriptor,
      minimum_units: match.minimum_units,
      slo_requirements: match.slo_requirements,
      content_requirements: match.content_requirements,
    };
    onAdopt(standard);
  }, [match, onAdopt]);

  const confidencePercent = Math.round(match.confidence_score * 100);

  return (
    <div
      className={`
        p-3 bg-luminous-50 dark:bg-luminous-900/20
        border border-luminous-200 dark:border-luminous-800
        rounded-lg
        ${className}
      `}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <SparklesIcon className="h-4 w-4 text-luminous-500 flex-shrink-0" />
          <div>
            <p className="text-xs font-medium text-luminous-700 dark:text-luminous-300">
              C-ID Match: {match.c_id}
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              {confidencePercent}% confidence
            </p>
          </div>
        </div>
        <button
          onClick={onDismiss}
          className="p-1 rounded hover:bg-slate-200/50 dark:hover:bg-slate-700/50 text-slate-400"
          aria-label="Dismiss"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center gap-2 mt-2">
        <button
          onClick={handleAdopt}
          disabled={isAdopting}
          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 bg-luminous-600 hover:bg-luminous-700 text-white text-xs font-medium rounded transition-colors disabled:opacity-50"
        >
          {isAdopting ? (
            <div className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full" />
          ) : (
            <LinkIcon className="h-3 w-3" />
          )}
          Adopt
        </button>
        {onViewDetails && (
          <button
            onClick={onViewDetails}
            className="px-2 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            Details
          </button>
        )}
      </div>
    </div>
  );
}

export default CCNAdoptPrompt;
