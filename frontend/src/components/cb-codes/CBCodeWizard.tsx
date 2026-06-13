'use client';

// ===========================================
// CB Code Wizard Component
// ===========================================
// Step-by-step wizard for configuring community college
// compliance codes (CB01-CB27) using diagnostic questions instead
// of raw dropdowns.
//
// CUR-222: Now includes CCN detection step at the beginning of the
// wizard flow for AB 1111 compliance.

import { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckCircleIcon,
  InformationCircleIcon,
  AcademicCapIcon,
  BuildingLibraryIcon,
  BriefcaseIcon,
  BookOpenIcon,
  ArrowPathIcon,
  LockClosedIcon,
  CheckBadgeIcon,
  ExclamationTriangleIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { CCNDetectionStep } from './CCNDetectionStep';

// ===========================================
// Types & Constants
// ===========================================

export interface CBCodes {
  cb01?: string; // Department Code
  cb02?: string; // Credit Status
  cb03?: string; // TOP Code
  cb04?: string; // Credit Type
  cb05?: string; // Transfer Status
  cb06?: string; // Distance Learning
  cb08?: string; // Basic Skills Status
  cb09?: string; // SAM Priority Code (Vocational)
  cb10?: string; // Cooperative Work Experience
  cb11?: string; // Course Classification
  cb13?: string; // Educational Assistance Class
  cb21?: string; // Prior to College Level
  cb22?: string; // Non-Credit Category
  cb23?: string; // Funding Agency
  cb24?: string; // Program Control
  cb25?: string; // Repeat Status
  cb26?: string; // Support Course Status
  cb27?: string; // Course Prior to Transfer Level
  [key: string]: string | undefined;
}

interface WizardQuestion {
  id: string;
  cbCode: string;
  question: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  options: {
    value: string;
    label: string;
    description?: string;
  }[];
  dependency?: {
    cbCode: string;
    values: string[];
    invert?: boolean;
  };
}

const WIZARD_QUESTIONS: WizardQuestion[] = [
  {
    id: 'credit-type',
    cbCode: 'cb04',
    question: 'What type of credit does this course offer?',
    description: 'CB04 determines how this course counts toward degree requirements and state apportionment.',
    icon: AcademicCapIcon,
    options: [
      {
        value: 'A',
        label: 'Degree-Applicable Credit',
        description: 'Counts toward associate degree requirements',
      },
      {
        value: 'B',
        label: 'Credit - Not Degree Applicable',
        description: 'Credit course that does not count toward degrees',
      },
      {
        value: 'C',
        label: 'Noncredit',
        description: 'No college credit awarded',
      },
      {
        value: 'D',
        label: 'Noncredit - Enhanced Funding',
        description: 'CDCP eligible noncredit course with enhanced funding',
      },
    ],
  },
  {
    id: 'transfer-status',
    cbCode: 'cb05',
    question: 'Is this course transferable?',
    description: 'CB05 indicates whether the course can transfer to CSU, UC, or both.',
    icon: BuildingLibraryIcon,
    options: [
      {
        value: 'A',
        label: 'Transferable to UC and CSU',
        description: 'Articulated with both university systems',
      },
      {
        value: 'B',
        label: 'Transferable to CSU Only',
        description: 'Articulated with California State University only',
      },
      {
        value: 'C',
        label: 'Not Transferable',
        description: 'Does not transfer to UC or CSU',
      },
    ],
    dependency: {
      cbCode: 'cb04',
      values: ['A', 'B'], // Only show for credit courses
    },
  },
  {
    id: 'basic-skills',
    cbCode: 'cb08',
    question: 'Is this a basic skills course?',
    description: 'CB08 indicates if this course is designed to help students develop foundational skills in reading, writing, computation, or learning skills.',
    icon: BookOpenIcon,
    options: [
      {
        value: 'B',
        label: 'Yes - Basic Skills Course',
        description: 'Designed to improve foundational academic skills',
      },
      {
        value: 'N',
        label: 'No - Not Basic Skills',
        description: 'Standard college-level course',
      },
    ],
    dependency: {
      cbCode: 'cb04',
      values: ['A', 'B'], // Only show for credit courses
    },
  },
  {
    id: 'vocational',
    cbCode: 'cb09',
    question: 'Is this course designed for career/vocational training?',
    description: 'CB09 (SAM Priority Code) indicates if this course prepares students for a specific occupation.',
    icon: BriefcaseIcon,
    options: [
      {
        value: 'A',
        label: 'Apprenticeship',
        description: 'Directly related to an approved apprenticeship program',
      },
      {
        value: 'B',
        label: 'Advanced Occupational',
        description: 'Prepares for employment in a specific career, requires prior training',
      },
      {
        value: 'C',
        label: 'Clearly Occupational',
        description: 'Prepares for employment in a specific career',
      },
      {
        value: 'D',
        label: 'Possibly Occupational',
        description: 'May prepare for employment but has broader applications',
      },
      {
        value: 'E',
        label: 'Non-Occupational',
        description: 'Not designed for career preparation',
      },
    ],
  },
  {
    id: 'distance-learning',
    cbCode: 'cb06',
    question: 'How is this course delivered?',
    description: 'CB06 indicates the course delivery method.',
    icon: AcademicCapIcon,
    options: [
      {
        value: 'Y',
        label: 'Distance Education - Entirely Online',
        description: 'All instruction delivered via distance education',
      },
      {
        value: 'H',
        label: 'Hybrid',
        description: 'Combination of distance education and on-campus instruction',
      },
      {
        value: 'N',
        label: 'Not Distance Education',
        description: 'Traditional on-campus instruction only',
      },
    ],
  },
  {
    id: 'coop-work',
    cbCode: 'cb10',
    question: 'Is this a cooperative work experience course?',
    description: 'CB10 indicates if this is a supervised work experience course.',
    icon: BriefcaseIcon,
    options: [
      {
        value: 'Y',
        label: 'Yes - Cooperative Work Experience',
        description: 'Includes supervised work experience component',
      },
      {
        value: 'N',
        label: 'No - Standard Course',
        description: 'Regular classroom/lab instruction',
      },
    ],
  },
  {
    id: 'course-classification',
    cbCode: 'cb11',
    question: 'What is the course classification status?',
    description: 'CB11 indicates if this is a new, modified, or existing course.',
    icon: BookOpenIcon,
    options: [
      {
        value: 'A',
        label: 'New Course',
        description: 'Never before offered at this institution',
      },
      {
        value: 'B',
        label: 'Modified Course',
        description: 'Substantial changes from previous version',
      },
      {
        value: 'C',
        label: 'Existing Course',
        description: 'No substantial changes',
      },
    ],
  },
  {
    id: 'repeat-status',
    cbCode: 'cb25',
    question: 'Can students repeat this course?',
    description: 'CB25 indicates the repeatability rules for this course.',
    icon: ArrowPathIcon,
    options: [
      {
        value: 'N',
        label: 'Not Repeatable',
        description: 'Students may only take this course once',
      },
      {
        value: 'Y',
        label: 'Repeatable',
        description: 'Students may retake with a specific limit',
      },
      {
        value: 'V',
        label: 'Variable Units Course',
        description: 'Repeatable variable unit course',
      },
    ],
  },
];

// ===========================================
// Helper Components
// ===========================================

interface ProgressBarProps {
  currentStep: number;
  totalSteps: number;
}

function ProgressBar({ currentStep, totalSteps }: ProgressBarProps) {
  const percentage = Math.round(((currentStep + 1) / totalSteps) * 100);

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between text-sm mb-2">
        <span className="text-slate-600 dark:text-slate-400">
          Question {currentStep + 1} of {totalSteps}
        </span>
        <span className="font-medium text-luminous-600 dark:text-luminous-400">
          {percentage}% complete
        </span>
      </div>
      <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-luminous-500 transition-all duration-300 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

// ===========================================
// CCN Guidance Panel - CUR-223
// ===========================================

interface CCNGuidanceContext {
  ccnId: string;
  discipline: string;
  impliedTopCode: string;
}

interface CCNGuidancePanelProps {
  cbCode: string;
  ccnContext: CCNGuidanceContext | null;
}

function CCNGuidancePanel({ cbCode, ccnContext }: CCNGuidancePanelProps) {
  if (!ccnContext) return null;

  // Define guidance content based on CB code
  const getGuidanceContent = () => {
    switch (cbCode.toLowerCase()) {
      case 'cb05':
        return {
          title: 'CCN Transfer Recommendation',
          message: `This CCN-aligned course (${ccnContext.ccnId}) should be set to "Transferable to UC and CSU" (Code A) per AB 1111 requirements for Common Course Numbering.`,
          recommendation: 'A',
        };
      case 'cb09':
        return {
          title: 'CCN SAM Code Guidance',
          message: `For CCN-aligned transfer courses like ${ccnContext.ccnId}, the SAM Priority Code should typically be "E - Non-Occupational" unless the course has a specific vocational or career-technical focus.`,
          recommendation: 'E',
        };
      default:
        return null;
    }
  };

  const guidance = getGuidanceContent();
  if (!guidance) return null;

  return (
    <div className="p-4 bg-luminous-50 dark:bg-luminous-900/20 border border-luminous-200 dark:border-luminous-800 rounded-xl">
      <div className="flex items-start gap-3">
        <SparklesIcon className="h-5 w-5 text-luminous-600 dark:text-luminous-400 flex-shrink-0 mt-0.5" />
        <div>
          <h4 className="text-sm font-semibold text-luminous-800 dark:text-luminous-200">
            {guidance.title}
          </h4>
          <p className="text-sm text-luminous-700 dark:text-luminous-300 mt-1">
            {guidance.message}
          </p>
          <p className="text-xs text-luminous-600 dark:text-luminous-400 mt-2">
            Recommended: <span className="font-mono font-semibold">Code {guidance.recommendation}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

// ===========================================
// Question Card Component
// ===========================================

interface QuestionCardProps {
  question: WizardQuestion;
  currentValue?: string;
  onSelect: (value: string) => void;
  ccnContext?: CCNGuidanceContext | null;
}

function QuestionCard({ question, currentValue, onSelect, ccnContext = null }: QuestionCardProps) {
  const Icon = question.icon;
  const questionId = `question-${question.id}`;

  // Show CCN guidance for relevant CB codes
  const showCCNGuidance = ccnContext && ['cb05', 'cb09'].includes(question.cbCode.toLowerCase());

  return (
    <div className="space-y-6">
      {/* Question Header */}
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-luminous-100 dark:bg-luminous-900/30 flex items-center justify-center" aria-hidden="true">
          <Icon className="h-6 w-6 text-luminous-600 dark:text-luminous-400" />
        </div>
        <div>
          <h3 id={questionId} className="text-lg font-semibold text-slate-900 dark:text-white">
            {question.question}
          </h3>
          <p id={`${questionId}-desc`} className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            {question.description}
          </p>
        </div>
      </div>

      {/* CCN Guidance Panel - CUR-223 */}
      {showCCNGuidance && (
        <CCNGuidancePanel cbCode={question.cbCode} ccnContext={ccnContext} />
      )}

      {/* Options */}
      <div
        className="space-y-3"
        role="radiogroup"
        aria-labelledby={questionId}
        aria-describedby={`${questionId}-desc`}
      >
        {question.options.map((option) => (
          <button
            key={option.value}
            onClick={() => onSelect(option.value)}
            role="radio"
            aria-checked={currentValue === option.value}
            aria-label={`${option.label} - Code ${option.value}${option.description ? `. ${option.description}` : ''}`}
            className={`w-full flex items-start gap-4 p-4 rounded-xl border-2 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-luminous-500 focus-visible:ring-offset-2 ${
              currentValue === option.value
                ? 'border-luminous-500 bg-luminous-50 dark:bg-luminous-900/20'
                : 'border-slate-200 dark:border-slate-700 hover:border-luminous-300 dark:hover:border-luminous-700 hover:bg-slate-50 dark:hover:bg-slate-800/50'
            }`}
          >
            {/* Radio Indicator */}
            <div
              className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 ${
                currentValue === option.value
                  ? 'border-luminous-500 bg-luminous-500'
                  : 'border-slate-300 dark:border-slate-600'
              }`}
              aria-hidden="true"
            >
              {currentValue === option.value && (
                <div className="w-2 h-2 rounded-full bg-white" />
              )}
            </div>

            {/* Option Content */}
            <div className="flex-1 text-left">
              <div className="flex items-center gap-2">
                <span
                  className={`font-medium ${
                    currentValue === option.value
                      ? 'text-luminous-700 dark:text-luminous-300'
                      : 'text-slate-900 dark:text-white'
                  }`}
                >
                  {option.label}
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400" aria-hidden="true">
                  Code: {option.value}
                </span>
              </div>
              {option.description && (
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  {option.description}
                </p>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Info Tooltip */}
      <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <InformationCircleIcon className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-blue-700 dark:text-blue-300">
          <strong>Why this matters:</strong> The {question.cbCode.toUpperCase()} code is required for state MIS reporting and affects funding apportionment.
        </p>
      </div>
    </div>
  );
}

// ===========================================
// Locked Question Card (when CB code is set by CCN)
// ===========================================

interface LockedQuestionCardProps {
  question: WizardQuestion;
  currentValue?: string;
  adoptedCCN: string | null;
}

function LockedQuestionCard({ question, currentValue, adoptedCCN }: LockedQuestionCardProps) {
  const Icon = question.icon;
  const selectedOption = question.options.find((opt) => opt.value === currentValue);

  return (
    <div className="space-y-6">
      {/* Question Header */}
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-luminous-100 dark:bg-luminous-900/30 flex items-center justify-center">
          <Icon className="h-6 w-6 text-luminous-600 dark:text-luminous-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            {question.question}
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            {question.description}
          </p>
        </div>
      </div>

      {/* Locked State Card */}
      <div className="p-4 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
            <LockClosedIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-green-800 dark:text-green-200">
                {selectedOption?.label || 'Set by CCN Standard'}
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-green-200 dark:bg-green-800 text-green-700 dark:text-green-300">
                Code: {currentValue}
              </span>
            </div>
            <p className="text-sm text-green-700 dark:text-green-300">
              This value was automatically set when you adopted CCN standard{' '}
              <span className="font-mono font-semibold">{adoptedCCN}</span>.
            </p>
            {selectedOption?.description && (
              <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                {selectedOption.description}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Info Note */}
      <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <InformationCircleIcon className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-blue-700 dark:text-blue-300">
          <strong>CCN Locked:</strong> To change this value, you must first remove the CCN alignment
          from this course. CCN-aligned courses require specific CB code values per AB 1111.
        </p>
      </div>
    </div>
  );
}

interface SummaryViewProps {
  cbCodes: CBCodes;
  questions: WizardQuestion[];
  onEdit: (questionIndex: number) => void;
}

function SummaryView({ cbCodes, questions, onEdit }: SummaryViewProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
          CB Code Summary
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Review your selections below. Click any item to edit.
        </p>
      </div>

      <div className="space-y-3">
        {questions.map((question, index) => {
          const selectedValue = cbCodes[question.cbCode];
          const selectedOption = question.options.find(
            (opt) => opt.value === selectedValue
          );

          return (
            <button
              key={question.id}
              onClick={() => onEdit(index)}
              className="w-full flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    {question.cbCode.toUpperCase()}
                  </span>
                  <p className="font-medium text-slate-900 dark:text-white">
                    {selectedOption?.label || 'Not set'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono px-2 py-1 rounded bg-luminous-100 dark:bg-luminous-900/30 text-luminous-700 dark:text-luminous-300">
                  {selectedValue || '-'}
                </span>
                <ChevronRightIcon className="h-5 w-5 text-slate-400" />
              </div>
            </button>
          );
        })}
      </div>

      {/* Additional CB Codes Info */}
      <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-xl">
        <h4 className="font-medium text-slate-900 dark:text-white mb-2">
          Additional CB Codes
        </h4>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
          The following CB codes are typically set automatically or by administrators:
        </p>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="text-slate-600 dark:text-slate-400">CB01: Department Code</div>
          <div className="text-slate-600 dark:text-slate-400">CB02: Credit Status</div>
          <div className="text-slate-600 dark:text-slate-400">CB03: TOP Code</div>
          <div className="text-slate-600 dark:text-slate-400">CB13: Ed Assistance Class</div>
        </div>
      </div>
    </div>
  );
}

// ===========================================
// Summary View with CCN Status (CUR-222)
// ===========================================

interface SummaryViewWithCCNProps {
  cbCodes: CBCodes;
  questions: WizardQuestion[];
  onEdit: (questionIndex: number) => void;
  adoptedCCN: string | null;
  ccnJustification: CCNJustification | null;
  lockedCBCodes: Set<string>;
}

function SummaryViewWithCCN({
  cbCodes,
  questions,
  onEdit,
  adoptedCCN,
  ccnJustification,
  lockedCBCodes,
}: SummaryViewWithCCNProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
          CB Code Summary
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Review your selections below. Click any item to edit.
        </p>
      </div>

      {/* CCN Status Section */}
      {adoptedCCN && (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
          <div className="flex items-start gap-3">
            <CheckBadgeIcon className="h-6 w-6 text-green-600 dark:text-green-400 flex-shrink-0" />
            <div>
              <h4 className="font-semibold text-green-800 dark:text-green-200">
                CCN Aligned: {adoptedCCN}
              </h4>
              <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                This course is aligned with the C-ID standard. CB05 (Transfer Status) and CB03 (TOP Code)
                have been automatically set per AB 1111 requirements.
              </p>
            </div>
          </div>
        </div>
      )}

      {!adoptedCCN && ccnJustification && (
        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
          <div className="flex items-start gap-3">
            <ExclamationTriangleIcon className="h-6 w-6 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <div>
              <h4 className="font-semibold text-amber-800 dark:text-amber-200">
                Non-CCN Course
              </h4>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                <strong>Reason:</strong> {ccnJustification.reasonCode.replace(/_/g, ' ')}
              </p>
              <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
                {ccnJustification.text}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* CB Code Items */}
      <div className="space-y-3">
        {questions.map((question, index) => {
          const selectedValue = cbCodes[question.cbCode];
          const selectedOption = question.options.find(
            (opt) => opt.value === selectedValue
          );
          const isLocked = lockedCBCodes.has(question.cbCode);

          return (
            <button
              key={question.id}
              onClick={() => !isLocked && onEdit(index)}
              disabled={isLocked}
              className={`w-full flex items-center justify-between p-4 rounded-xl text-left transition-colors ${
                isLocked
                  ? 'bg-green-50 dark:bg-green-900/10 cursor-not-allowed'
                  : 'bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                  isLocked
                    ? 'bg-green-100 dark:bg-green-900/30'
                    : 'bg-green-100 dark:bg-green-900/30'
                }`}>
                  {isLocked ? (
                    <LockClosedIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
                  ) : (
                    <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                      {question.cbCode.toUpperCase()}
                    </span>
                    {isLocked && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                        CCN Set
                      </span>
                    )}
                  </div>
                  <p className="font-medium text-slate-900 dark:text-white">
                    {selectedOption?.label || 'Not set'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-mono px-2 py-1 rounded ${
                  isLocked
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                    : 'bg-luminous-100 dark:bg-luminous-900/30 text-luminous-700 dark:text-luminous-300'
                }`}>
                  {selectedValue || '-'}
                </span>
                {!isLocked && (
                  <ChevronRightIcon className="h-5 w-5 text-slate-400" />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Additional CB Codes Info */}
      <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-xl">
        <h4 className="font-medium text-slate-900 dark:text-white mb-2">
          Additional CB Codes
        </h4>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
          The following CB codes are typically set automatically or by administrators:
        </p>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="text-slate-600 dark:text-slate-400">CB01: Department Code</div>
          <div className="text-slate-600 dark:text-slate-400">CB02: Credit Status</div>
          <div className="text-slate-600 dark:text-slate-400">CB03: TOP Code</div>
          <div className="text-slate-600 dark:text-slate-400">CB13: Ed Assistance Class</div>
        </div>
      </div>
    </div>
  );
}

// ===========================================
// CCN Justification Type
// ===========================================

export interface CCNJustification {
  reasonCode: string;
  text: string;
}

// ===========================================
// Main CB Code Wizard Component
// ===========================================

export interface CBCodeWizardProps {
  initialCodes?: CBCodes;
  onChange?: (codes: CBCodes) => void;
  onComplete?: (codes: CBCodes) => void;
  // NEW: Course context for CCN detection (CUR-222)
  courseId?: string;
  courseTitle?: string;
  subjectCode?: string;
  courseUnits?: number;
  courseDescription?: string;
  enableCCNDetection?: boolean;  // Default true
  // CCN adoption callbacks
  onCCNAdopted?: (ccnId: string, cbCodes: Record<string, string>) => void;
  onCCNSkipped?: (justification?: CCNJustification) => void;
}

export function CBCodeWizard({
  initialCodes = {},
  onChange,
  onComplete,
  // CCN detection props (CUR-222)
  courseId,
  courseTitle,
  subjectCode,
  courseUnits,
  courseDescription,
  enableCCNDetection = true,
  onCCNAdopted,
  onCCNSkipped,
}: CBCodeWizardProps) {
  const [cbCodes, setCbCodes] = useState<CBCodes>(initialCodes);
  const [currentStep, setCurrentStep] = useState(0);
  const [showSummary, setShowSummary] = useState(false);

  // CCN-related state (CUR-222)
  type CCNPhase = 'ccn_detection' | 'questions' | 'complete';
  const [ccnPhase, setCcnPhase] = useState<CCNPhase>(
    enableCCNDetection && courseId && courseTitle && subjectCode && courseUnits !== undefined
      ? 'ccn_detection'
      : 'questions'
  );
  const [adoptedCCN, setAdoptedCCN] = useState<string | null>(null);
  const [ccnJustification, setCcnJustification] = useState<CCNJustification | null>(null);
  const [lockedCBCodes, setLockedCBCodes] = useState<Set<string>>(new Set());

  // Filter questions based on dependencies
  const activeQuestions = WIZARD_QUESTIONS.filter((question) => {
    if (!question.dependency) return true;
    const depValue = cbCodes[question.dependency.cbCode];
    const matches = question.dependency.values.includes(depValue || '');
    return question.dependency.invert ? !matches : matches;
  });

  const currentQuestion = activeQuestions[currentStep];

  // Update parent when codes change
  useEffect(() => {
    onChange?.(cbCodes);
  }, [cbCodes, onChange]);

  // Handle option selection
  const handleSelect = useCallback(
    (value: string) => {
      const newCodes = { ...cbCodes, [currentQuestion.cbCode]: value };
      setCbCodes(newCodes);
    },
    [cbCodes, currentQuestion]
  );

  // Navigation
  const handleNext = useCallback(() => {
    if (currentStep < activeQuestions.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      setShowSummary(true);
      onComplete?.(cbCodes);
    }
  }, [currentStep, activeQuestions.length, cbCodes, onComplete]);

  const handlePrevious = useCallback(() => {
    if (showSummary) {
      setShowSummary(false);
    } else if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  }, [currentStep, showSummary]);

  const handleEditFromSummary = useCallback((index: number) => {
    setCurrentStep(index);
    setShowSummary(false);
  }, []);

  // CCN Detection Handlers (CUR-222)
  const handleCCNAdopted = useCallback((ccnId: string, autoCBCodes: Record<string, string>) => {
    // Set the adopted CCN ID
    setAdoptedCCN(ccnId);

    // Auto-populate CB codes from CCN adoption
    const newCodes = { ...cbCodes, ...autoCBCodes };
    setCbCodes(newCodes);

    // Lock the auto-populated CB codes (CB05, CB03)
    const newLockedCodes = new Set(lockedCBCodes);
    Object.keys(autoCBCodes).forEach(code => newLockedCodes.add(code));
    setLockedCBCodes(newLockedCodes);

    // Notify parent
    onCCNAdopted?.(ccnId, autoCBCodes);
  }, [cbCodes, lockedCBCodes, onCCNAdopted]);

  const handleCCNSkipped = useCallback((justification?: { reasonCode: string; text: string }) => {
    if (justification) {
      setCcnJustification(justification);
    }
    onCCNSkipped?.(justification);
  }, [onCCNSkipped]);

  const handleCCNNext = useCallback(() => {
    setCcnPhase('questions');
  }, []);

  const handlePreviousWithCCN = useCallback(() => {
    if (showSummary) {
      setShowSummary(false);
    } else if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    } else if (ccnPhase === 'questions' && enableCCNDetection && courseId) {
      // Go back to CCN detection step
      setCcnPhase('ccn_detection');
    }
  }, [currentStep, showSummary, ccnPhase, enableCCNDetection, courseId]);

  // Check if current question is answered
  const isCurrentAnswered = currentQuestion
    ? !!cbCodes[currentQuestion.cbCode]
    : false;

  // Check if current question's CB code is locked by CCN adoption
  const isCurrentLocked = currentQuestion
    ? lockedCBCodes.has(currentQuestion.cbCode)
    : false;

  return (
    <div className="space-y-6">
      {/* CCN Detection Phase (CUR-222) */}
      {ccnPhase === 'ccn_detection' && courseId && courseTitle && subjectCode && courseUnits !== undefined && (
        <CCNDetectionStep
          courseId={courseId}
          courseTitle={courseTitle}
          subjectCode={subjectCode}
          courseUnits={courseUnits}
          courseDescription={courseDescription}
          onCCNAdopted={handleCCNAdopted}
          onCCNSkipped={handleCCNSkipped}
          onNext={handleCCNNext}
        />
      )}

      {/* CB Questions Phase */}
      {ccnPhase === 'questions' && (
        <>
          {/* Header */}
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-1">
              CB Codes Configuration
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Configure community college compliance codes for state reporting.
            </p>
            {/* CCN Status Badge */}
            {adoptedCCN && (
              <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <CheckBadgeIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
                <span className="text-sm font-medium text-green-700 dark:text-green-300">
                  CCN Aligned: {adoptedCCN}
                </span>
              </div>
            )}
            {!adoptedCCN && ccnJustification && (
              <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <ExclamationTriangleIcon className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
                  Non-CCN Course (Justified)
                </span>
              </div>
            )}
          </div>

          {/* Progress Bar */}
          {!showSummary && (
            <ProgressBar
              currentStep={currentStep}
              totalSteps={activeQuestions.length}
            />
          )}

          {/* Content */}
          <div className="min-h-[400px]">
            {showSummary ? (
              <SummaryViewWithCCN
                cbCodes={cbCodes}
                questions={activeQuestions}
                onEdit={handleEditFromSummary}
                adoptedCCN={adoptedCCN}
                ccnJustification={ccnJustification}
                lockedCBCodes={lockedCBCodes}
              />
            ) : currentQuestion ? (
              isCurrentLocked ? (
                <LockedQuestionCard
                  question={currentQuestion}
                  currentValue={cbCodes[currentQuestion.cbCode]}
                  adoptedCCN={adoptedCCN}
                />
              ) : (
                <QuestionCard
                  question={currentQuestion}
                  currentValue={cbCodes[currentQuestion.cbCode]}
                  onSelect={handleSelect}
                  ccnContext={adoptedCCN ? {
                    ccnId: adoptedCCN,
                    discipline: subjectCode || '',
                    impliedTopCode: cbCodes.cb03 || '',
                  } : null}
                />
              )
            ) : null}
          </div>
        </>
      )}

      {/* Navigation Buttons - Only show in questions phase */}
      {ccnPhase === 'questions' && (
        <nav className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-700" aria-label="CB Code wizard navigation">
          <button
            onClick={handlePreviousWithCCN}
            disabled={currentStep === 0 && !showSummary && !enableCCNDetection}
            aria-label={showSummary ? 'Edit CB codes' : currentStep === 0 && enableCCNDetection ? 'Back to CCN detection' : 'Go to previous question'}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-luminous-500 focus-visible:ring-offset-2"
          >
            <ChevronLeftIcon className="h-4 w-4" aria-hidden="true" />
            {showSummary ? 'Edit' : 'Previous'}
          </button>

          {!showSummary && (
            <button
              onClick={handleNext}
              disabled={!isCurrentAnswered && !isCurrentLocked}
              aria-label={currentStep === activeQuestions.length - 1 ? 'Review CB code selections' : 'Go to next question'}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-luminous-600 hover:bg-luminous-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-luminous-600"
            >
              {currentStep === activeQuestions.length - 1 ? 'Review' : 'Next'}
              <ChevronRightIcon className="h-4 w-4" aria-hidden="true" />
            </button>
          )}

          {showSummary && (
            <button
              onClick={() => onComplete?.(cbCodes)}
              aria-label="Save CB code selections"
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-green-600"
            >
              <CheckCircleIcon className="h-4 w-4" aria-hidden="true" />
              Save CB Codes
            </button>
          )}
        </nav>
      )}
    </div>
  );
}

export default CBCodeWizard;
