'use client';

// ===========================================
// Workflow Progress Bar Component
// ===========================================
// Visual progress bar showing current position in approval workflow
// Steps: Draft → DeptReview → CurriculumCommittee → ArticulationReview → Approved

import { useState } from 'react';
import {
  CheckCircleIcon,
  PencilSquareIcon,
  UserGroupIcon,
  ClipboardDocumentCheckIcon,
  AcademicCapIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/solid';
import {
  CheckCircleIcon as CheckCircleOutline,
  PencilSquareIcon as PencilSquareOutline,
  UserGroupIcon as UserGroupOutline,
  ClipboardDocumentCheckIcon as ClipboardDocumentCheckOutline,
  AcademicCapIcon as AcademicCapOutline,
  ShieldCheckIcon as ShieldCheckOutline,
} from '@heroicons/react/24/outline';

// ===========================================
// Types
// ===========================================

export type WorkflowStatus =
  | 'Draft'
  | 'DeptReview'
  | 'CurriculumCommittee'
  | 'ArticulationReview'
  | 'Approved';

interface WorkflowStep {
  id: WorkflowStatus;
  label: string;
  shortLabel: string;
  description: string;
  iconSolid: React.ComponentType<{ className?: string }>;
  iconOutline: React.ComponentType<{ className?: string }>;
}

interface WorkflowProgressBarProps {
  currentStatus: WorkflowStatus;
  showLabels?: boolean;
  showDescriptions?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

// ===========================================
// Workflow Steps Configuration
// ===========================================

const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    id: 'Draft',
    label: 'Draft',
    shortLabel: 'Draft',
    description: 'Initial course creation and editing',
    iconSolid: PencilSquareIcon,
    iconOutline: PencilSquareOutline,
  },
  {
    id: 'DeptReview',
    label: 'Department Review',
    shortLabel: 'Dept',
    description: 'Review by department curriculum chair',
    iconSolid: UserGroupIcon,
    iconOutline: UserGroupOutline,
  },
  {
    id: 'CurriculumCommittee',
    label: 'Curriculum Committee',
    shortLabel: 'Committee',
    description: 'Review by college curriculum committee',
    iconSolid: ClipboardDocumentCheckIcon,
    iconOutline: ClipboardDocumentCheckOutline,
  },
  {
    id: 'ArticulationReview',
    label: 'Articulation Review',
    shortLabel: 'Articulation',
    description: 'Review by articulation officer for transfer alignment',
    iconSolid: AcademicCapIcon,
    iconOutline: AcademicCapOutline,
  },
  {
    id: 'Approved',
    label: 'Approved',
    shortLabel: 'Approved',
    description: 'Course is approved and active',
    iconSolid: ShieldCheckIcon,
    iconOutline: ShieldCheckOutline,
  },
];

// ===========================================
// Helper Functions
// ===========================================

function getStepIndex(status: WorkflowStatus): number {
  return WORKFLOW_STEPS.findIndex((step) => step.id === status);
}

function getStepState(
  stepIndex: number,
  currentIndex: number
): 'completed' | 'current' | 'upcoming' {
  if (stepIndex < currentIndex) return 'completed';
  if (stepIndex === currentIndex) return 'current';
  return 'upcoming';
}

// ===========================================
// Step Detail Tooltip
// ===========================================

function StepTooltip({
  step,
  state,
  isVisible,
}: {
  step: WorkflowStep;
  state: 'completed' | 'current' | 'upcoming';
  isVisible: boolean;
}) {
  if (!isVisible) return null;

  const stateLabel = {
    completed: 'Completed',
    current: 'Current Step',
    upcoming: 'Pending',
  }[state];

  const stateColor = {
    completed: 'text-green-600 dark:text-green-400',
    current: 'text-luminous-600 dark:text-luminous-400',
    upcoming: 'text-slate-500 dark:text-slate-400',
  }[state];

  return (
    <div
      className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-10 w-48 p-3
                 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200
                 dark:border-slate-700 text-center animate-in fade-in duration-150"
      role="tooltip"
    >
      <div className={`text-xs font-semibold uppercase tracking-wide ${stateColor} mb-1`}>
        {stateLabel}
      </div>
      <div className="font-medium text-slate-900 dark:text-white text-sm mb-1">
        {step.label}
      </div>
      <div className="text-xs text-slate-500 dark:text-slate-400">
        {step.description}
      </div>
      {/* Tooltip arrow */}
      <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
        <div className="border-8 border-transparent border-t-white dark:border-t-slate-800" />
      </div>
    </div>
  );
}

// ===========================================
// Main Component
// ===========================================

export function WorkflowProgressBar({
  currentStatus,
  showLabels = true,
  showDescriptions = false,
  size = 'md',
  className = '',
}: WorkflowProgressBarProps) {
  const [hoveredStep, setHoveredStep] = useState<number | null>(null);
  const currentIndex = getStepIndex(currentStatus);

  // Size configurations
  const sizeConfig = {
    sm: {
      iconSize: 'h-6 w-6',
      containerSize: 'h-8 w-8',
      connectorHeight: 'h-0.5',
      fontSize: 'text-xs',
      gap: 'gap-1',
    },
    md: {
      iconSize: 'h-5 w-5',
      containerSize: 'h-10 w-10',
      connectorHeight: 'h-1',
      fontSize: 'text-sm',
      gap: 'gap-2',
    },
    lg: {
      iconSize: 'h-6 w-6',
      containerSize: 'h-12 w-12',
      connectorHeight: 'h-1',
      fontSize: 'text-base',
      gap: 'gap-3',
    },
  }[size];

  return (
    <div className={`w-full ${className}`} role="navigation" aria-label="Workflow progress">
      <div className="flex items-center justify-between">
        {WORKFLOW_STEPS.map((step, index) => {
          const state = getStepState(index, currentIndex);
          const IconSolid = step.iconSolid;
          const IconOutline = step.iconOutline;
          const isHovered = hoveredStep === index;

          return (
            <div key={step.id} className="flex items-center flex-1 last:flex-none">
              {/* Step Circle */}
              <div
                className={`relative flex flex-col items-center ${sizeConfig.gap}`}
                onMouseEnter={() => setHoveredStep(index)}
                onMouseLeave={() => setHoveredStep(null)}
                onFocus={() => setHoveredStep(index)}
                onBlur={() => setHoveredStep(null)}
              >
                {/* Tooltip */}
                <StepTooltip step={step} state={state} isVisible={isHovered} />

                {/* Icon Container */}
                <button
                  type="button"
                  className={`
                    ${sizeConfig.containerSize} rounded-full flex items-center justify-center
                    transition-all duration-200 cursor-pointer
                    focus:outline-none focus-visible:ring-2 focus-visible:ring-luminous-500 focus-visible:ring-offset-2
                    ${
                      state === 'completed'
                        ? 'bg-green-500 text-white shadow-sm'
                        : state === 'current'
                        ? 'bg-luminous-500 text-white shadow-md ring-4 ring-luminous-100 dark:ring-luminous-900/30'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500'
                    }
                    ${isHovered ? 'scale-110' : ''}
                  `}
                  aria-label={`${step.label}: ${state}`}
                  aria-current={state === 'current' ? 'step' : undefined}
                >
                  {state === 'completed' ? (
                    <CheckCircleIcon className={sizeConfig.iconSize} />
                  ) : state === 'current' ? (
                    <IconSolid className={sizeConfig.iconSize} />
                  ) : (
                    <IconOutline className={sizeConfig.iconSize} />
                  )}
                </button>

                {/* Label */}
                {showLabels && (
                  <span
                    className={`
                      ${sizeConfig.fontSize} font-medium text-center whitespace-nowrap
                      ${
                        state === 'completed'
                          ? 'text-green-600 dark:text-green-400'
                          : state === 'current'
                          ? 'text-luminous-600 dark:text-luminous-400'
                          : 'text-slate-400 dark:text-slate-500'
                      }
                    `}
                  >
                    {size === 'sm' ? step.shortLabel : step.label}
                  </span>
                )}

                {/* Description (optional) */}
                {showDescriptions && state === 'current' && (
                  <span className="text-xs text-slate-500 dark:text-slate-400 text-center max-w-[120px]">
                    {step.description}
                  </span>
                )}
              </div>

              {/* Connector Line */}
              {index < WORKFLOW_STEPS.length - 1 && (
                <div className="flex-1 mx-2 sm:mx-4">
                  <div
                    className={`
                      ${sizeConfig.connectorHeight} rounded-full transition-colors duration-300
                      ${
                        index < currentIndex
                          ? 'bg-green-500'
                          : index === currentIndex
                          ? 'bg-gradient-to-r from-luminous-500 to-slate-200 dark:to-slate-700'
                          : 'bg-slate-200 dark:bg-slate-700'
                      }
                    `}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===========================================
// Compact Variant (for smaller spaces)
// ===========================================

export function WorkflowProgressBarCompact({
  currentStatus,
  className = '',
}: {
  currentStatus: WorkflowStatus;
  className?: string;
}) {
  const currentIndex = getStepIndex(currentStatus);
  const totalSteps = WORKFLOW_STEPS.length;
  const progressPercent = ((currentIndex + 1) / totalSteps) * 100;

  const currentStep = WORKFLOW_STEPS[currentIndex];

  return (
    <div className={`w-full ${className}`}>
      {/* Progress bar */}
      <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mb-2">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            currentStatus === 'Approved'
              ? 'bg-green-500'
              : 'bg-luminous-500'
          }`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Status text */}
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-slate-700 dark:text-slate-300">
          {currentStep.label}
        </span>
        <span className="text-slate-500 dark:text-slate-400">
          Step {currentIndex + 1} of {totalSteps}
        </span>
      </div>
    </div>
  );
}

export default WorkflowProgressBar;
