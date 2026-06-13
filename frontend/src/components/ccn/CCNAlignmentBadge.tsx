'use client';

// ===========================================
// CCN Alignment Status Badge Component - CUR-75
// ===========================================
// UI indicator showing CCN/C-ID alignment status for a course.
// Shows green (aligned), yellow (potential), or gray (no match) badges.

import { useState, useCallback, Fragment } from 'react';
import {
  CheckBadgeIcon,
  ExclamationTriangleIcon,
  MinusCircleIcon,
  InformationCircleIcon,
  ArrowTopRightOnSquareIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import {
  CheckBadgeIcon as CheckBadgeSolidIcon,
} from '@heroicons/react/24/solid';

// ===========================================
// Types
// ===========================================

export type CCNAlignmentStatus = 'aligned' | 'potential' | 'none';

export interface CCNStandard {
  c_id: string;
  discipline: string;
  title: string;
  descriptor?: string;
  minimum_units: number;
  slo_requirements?: string[];
  content_requirements?: string[];
}

export interface CCNAlignmentInfo {
  status: CCNAlignmentStatus;
  standard?: CCNStandard;
  confidence_score?: number;
  match_reasons?: string[];
  units_sufficient?: boolean;
}

export interface CCNAlignmentBadgeProps {
  alignment: CCNAlignmentInfo;
  size?: 'sm' | 'md' | 'lg';
  showTooltip?: boolean;
  onClick?: () => void;
  onViewComparison?: (standard: CCNStandard) => void;
  className?: string;
}

// ===========================================
// Badge Configurations
// ===========================================

const BADGE_CONFIG = {
  aligned: {
    label: 'C-ID Aligned',
    shortLabel: 'Aligned',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    textColor: 'text-green-800 dark:text-green-300',
    borderColor: 'border-green-200 dark:border-green-800',
    hoverBg: 'hover:bg-green-200 dark:hover:bg-green-900/50',
    icon: CheckBadgeSolidIcon,
    iconColor: 'text-green-600 dark:text-green-400',
    description: 'This course is aligned with a C-ID standard',
  },
  potential: {
    label: 'Potential C-ID Match',
    shortLabel: 'Potential',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    textColor: 'text-amber-800 dark:text-amber-300',
    borderColor: 'border-amber-200 dark:border-amber-800',
    hoverBg: 'hover:bg-amber-200 dark:hover:bg-amber-900/50',
    icon: ExclamationTriangleIcon,
    iconColor: 'text-amber-600 dark:text-amber-400',
    description: 'This course may match a C-ID standard',
  },
  none: {
    label: 'No C-ID Match',
    shortLabel: 'No Match',
    bgColor: 'bg-slate-100 dark:bg-slate-800',
    textColor: 'text-slate-600 dark:text-slate-400',
    borderColor: 'border-slate-200 dark:border-slate-700',
    hoverBg: 'hover:bg-slate-200 dark:hover:bg-slate-700',
    icon: MinusCircleIcon,
    iconColor: 'text-slate-400 dark:text-slate-500',
    description: 'No matching C-ID standard found',
  },
};

const SIZE_CONFIG = {
  sm: {
    padding: 'px-2 py-0.5',
    iconSize: 'h-3.5 w-3.5',
    textSize: 'text-xs',
    gap: 'gap-1',
  },
  md: {
    padding: 'px-2.5 py-1',
    iconSize: 'h-4 w-4',
    textSize: 'text-sm',
    gap: 'gap-1.5',
  },
  lg: {
    padding: 'px-3 py-1.5',
    iconSize: 'h-5 w-5',
    textSize: 'text-base',
    gap: 'gap-2',
  },
};

// ===========================================
// Tooltip Component
// ===========================================

interface TooltipContentProps {
  alignment: CCNAlignmentInfo;
  onViewComparison?: (standard: CCNStandard) => void;
  onClose: () => void;
}

function TooltipContent({ alignment, onViewComparison, onClose }: TooltipContentProps) {
  const config = BADGE_CONFIG[alignment.status];
  const standard = alignment.standard;

  return (
    <div className="w-80 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      {/* Header */}
      <div className={`px-4 py-3 ${config.bgColor} border-b ${config.borderColor}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <config.icon className={`h-5 w-5 ${config.iconColor}`} />
            <span className={`font-medium ${config.textColor}`}>
              {config.label}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
            aria-label="Close tooltip"
          >
            <XMarkIcon className="h-4 w-4 text-slate-500" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Description */}
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {config.description}
        </p>

        {/* Standard Info (for aligned or potential) */}
        {standard && (
          <div className="space-y-3">
            {/* Standard Name */}
            <div>
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                C-ID Standard
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-medium text-luminous-600 dark:text-luminous-400">
                  {standard.c_id}
                </span>
                <span className="text-slate-600 dark:text-slate-300">
                  {standard.title}
                </span>
              </div>
            </div>

            {/* Discipline */}
            <div className="flex items-center gap-4 text-sm">
              <div>
                <span className="text-slate-500 dark:text-slate-400">Discipline:</span>{' '}
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {standard.discipline}
                </span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Min Units:</span>{' '}
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {standard.minimum_units}
                </span>
              </div>
            </div>

            {/* Confidence Score (for potential matches) */}
            {alignment.status === 'potential' && alignment.confidence_score !== undefined && (
              <div>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                  Match Confidence
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 transition-all"
                      style={{ width: `${Math.round(alignment.confidence_score * 100)}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {Math.round(alignment.confidence_score * 100)}%
                  </span>
                </div>
              </div>
            )}

            {/* Match Reasons */}
            {alignment.match_reasons && alignment.match_reasons.length > 0 && (
              <div>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                  Match Reasons
                </div>
                <ul className="space-y-1">
                  {alignment.match_reasons.slice(0, 3).map((reason, index) => (
                    <li
                      key={index}
                      className="flex items-start gap-1.5 text-sm text-slate-600 dark:text-slate-400"
                    >
                      <CheckBadgeIcon className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Units Warning */}
            {alignment.units_sufficient === false && (
              <div className="flex items-start gap-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                <ExclamationTriangleIcon className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  Course units are below the minimum required ({standard.minimum_units} units)
                </p>
              </div>
            )}

            {/* Descriptor */}
            {standard.descriptor && (
              <div>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                  Description
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-3">
                  {standard.descriptor}
                </p>
              </div>
            )}
          </div>
        )}

        {/* No Match Info */}
        {alignment.status === 'none' && (
          <div className="flex items-start gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
            <InformationCircleIcon className="h-5 w-5 text-slate-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-slate-600 dark:text-slate-400">
              <p className="mb-2">
                This course does not match any C-ID standard. This is common for:
              </p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>Specialized or vocational courses</li>
                <li>Courses unique to this institution</li>
                <li>Newly developed courses</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      {standard && onViewComparison && (
        <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={() => onViewComparison(standard)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-luminous-600 dark:text-luminous-400 hover:bg-luminous-50 dark:hover:bg-luminous-900/20 rounded-lg transition-colors"
          >
            <ArrowTopRightOnSquareIcon className="h-4 w-4" />
            View Full Comparison
          </button>
        </div>
      )}
    </div>
  );
}

// ===========================================
// Main Component
// ===========================================

export function CCNAlignmentBadge({
  alignment,
  size = 'md',
  showTooltip = true,
  onClick,
  onViewComparison,
  className = '',
}: CCNAlignmentBadgeProps) {
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);

  const config = BADGE_CONFIG[alignment.status];
  const sizeConfig = SIZE_CONFIG[size];
  const Icon = config.icon;

  const handleClick = useCallback(() => {
    if (onClick) {
      onClick();
    } else if (showTooltip) {
      setIsTooltipOpen((prev) => !prev);
    }
  }, [onClick, showTooltip]);

  const handleCloseTooltip = useCallback(() => {
    setIsTooltipOpen(false);
  }, []);

  // Generate label with standard number if aligned
  const label = alignment.status === 'aligned' && alignment.standard
    ? `C-ID: ${alignment.standard.c_id}`
    : alignment.status === 'potential' && alignment.standard
    ? `Potential: ${alignment.standard.c_id}`
    : size === 'sm'
    ? config.shortLabel
    : config.label;

  return (
    <div className={`relative inline-block ${className}`}>
      {/* Badge Button */}
      <button
        onClick={handleClick}
        className={`
          inline-flex items-center ${sizeConfig.gap} ${sizeConfig.padding}
          ${config.bgColor} ${config.textColor}
          border ${config.borderColor} ${config.hoverBg}
          rounded-full font-medium transition-all
          focus:outline-none focus-visible:ring-2 focus-visible:ring-luminous-500 focus-visible:ring-offset-2
        `}
        aria-label={`${config.label}${alignment.standard ? `: ${alignment.standard.c_id}` : ''}`}
        aria-expanded={isTooltipOpen}
        aria-haspopup="dialog"
      >
        <Icon className={`${sizeConfig.iconSize} ${config.iconColor}`} />
        <span className={sizeConfig.textSize}>{label}</span>
      </button>

      {/* Tooltip Popover */}
      {showTooltip && isTooltipOpen && (
        <Fragment>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={handleCloseTooltip}
            aria-hidden="true"
          />

          {/* Tooltip */}
          <div
            className="absolute z-50 mt-2 left-0"
            role="dialog"
            aria-label="C-ID alignment details"
          >
            <TooltipContent
              alignment={alignment}
              onViewComparison={onViewComparison}
              onClose={handleCloseTooltip}
            />
          </div>
        </Fragment>
      )}
    </div>
  );
}

// ===========================================
// Compact Badge Variant (for course cards)
// ===========================================

export interface CCNAlignmentBadgeCompactProps {
  alignment: CCNAlignmentInfo;
  onClick?: () => void;
  className?: string;
}

export function CCNAlignmentBadgeCompact({
  alignment,
  onClick,
  className = '',
}: CCNAlignmentBadgeCompactProps) {
  const config = BADGE_CONFIG[alignment.status];
  const Icon = config.icon;

  // Don't render for "none" status in compact mode
  if (alignment.status === 'none') {
    return null;
  }

  const label = alignment.standard
    ? alignment.standard.c_id
    : alignment.status === 'potential'
    ? 'Potential'
    : 'Aligned';

  return (
    <button
      onClick={onClick}
      className={`
        inline-flex items-center gap-1 px-2 py-0.5
        ${config.bgColor} ${config.textColor}
        border ${config.borderColor} ${config.hoverBg}
        rounded-full text-xs font-medium transition-all
        focus:outline-none focus-visible:ring-2 focus-visible:ring-luminous-500
        ${className}
      `}
      title={`${config.label}${alignment.standard ? `: ${alignment.standard.title}` : ''}`}
    >
      <Icon className={`h-3 w-3 ${config.iconColor}`} />
      <span>{label}</span>
    </button>
  );
}

export default CCNAlignmentBadge;
