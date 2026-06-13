'use client';

// ===========================================
// CCN Non-Match Justification Form - CUR-221
// ===========================================
// Form component for faculty to provide justification when their
// course doesn't align with any CCN (Common Course Numbering) standard.
// Per AB 1111, courses not aligning with CCN must provide a justification.

import { useState, useCallback, useMemo } from 'react';
import {
  ExclamationTriangleIcon,
  DocumentTextIcon,
  ArrowLeftIcon,
  CheckIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';

// ===========================================
// Types
// ===========================================

export type CCNNonMatchReasonCode =
  | 'specialized'
  | 'vocational'
  | 'local_need'
  | 'new_course'
  | 'other';

export interface CCNReasonOption {
  value: CCNNonMatchReasonCode;
  label: string;
  description: string;
}

export interface CCNNonMatchFormProps {
  /** Called when user submits the justification */
  onSubmit: (reasonCode: CCNNonMatchReasonCode, justificationText: string) => void;
  /** Called when user wants to go back to previous step */
  onBack: () => void;
  /** Whether the submission is in progress */
  isSubmitting?: boolean;
  /** Minimum character count for justification text */
  minCharacters?: number;
  /** Maximum character count for justification text */
  maxCharacters?: number;
  /** Optional className */
  className?: string;
}

// ===========================================
// Constants
// ===========================================

export const CCN_REASON_OPTIONS: CCNReasonOption[] = [
  {
    value: 'specialized',
    label: 'Specialized Course',
    description: 'Course covers specialized content not in CCN templates',
  },
  {
    value: 'vocational',
    label: 'Vocational/CTE Course',
    description: 'Career technical education course outside CCN scope',
  },
  {
    value: 'local_need',
    label: 'Local Community Need',
    description: 'Course addresses specific local workforce or community needs',
  },
  {
    value: 'new_course',
    label: 'Newly Developed Course',
    description: 'Course is new and CCN template may not yet exist',
  },
  {
    value: 'other',
    label: 'Other',
    description: 'Other reason (explain below)',
  },
];

const DEFAULT_MIN_CHARACTERS = 20;
const DEFAULT_MAX_CHARACTERS = 500;

// ===========================================
// Helper Components
// ===========================================

interface ReasonRadioOptionProps {
  option: CCNReasonOption;
  isSelected: boolean;
  onSelect: (value: CCNNonMatchReasonCode) => void;
  disabled?: boolean;
}

function ReasonRadioOption({
  option,
  isSelected,
  onSelect,
  disabled = false,
}: ReasonRadioOptionProps) {
  return (
    <label
      className={`
        relative flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer
        transition-all duration-200
        ${
          isSelected
            ? 'border-luminous-500 bg-luminous-50 dark:bg-luminous-900/20'
            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      {/* Radio Input */}
      <input
        type="radio"
        name="ccn-reason"
        value={option.value}
        checked={isSelected}
        onChange={() => onSelect(option.value)}
        disabled={disabled}
        className="sr-only"
        aria-describedby={`reason-${option.value}-description`}
      />

      {/* Custom Radio Circle */}
      <div
        className={`
          flex-shrink-0 w-5 h-5 rounded-full border-2 mt-0.5
          flex items-center justify-center transition-colors
          ${
            isSelected
              ? 'border-luminous-500 bg-luminous-500'
              : 'border-slate-300 dark:border-slate-600'
          }
        `}
      >
        {isSelected && <CheckIcon className="h-3 w-3 text-white" />}
      </div>

      {/* Label Content */}
      <div className="flex-1 min-w-0">
        <span
          className={`
            block font-medium transition-colors
            ${
              isSelected
                ? 'text-luminous-700 dark:text-luminous-300'
                : 'text-slate-900 dark:text-white'
            }
          `}
        >
          {option.label}
        </span>
        <span
          id={`reason-${option.value}-description`}
          className="block text-sm text-slate-500 dark:text-slate-400 mt-0.5"
        >
          {option.description}
        </span>
      </div>
    </label>
  );
}

// ===========================================
// Main Component
// ===========================================

export function CCNNonMatchForm({
  onSubmit,
  onBack,
  isSubmitting = false,
  minCharacters = DEFAULT_MIN_CHARACTERS,
  maxCharacters = DEFAULT_MAX_CHARACTERS,
  className = '',
}: CCNNonMatchFormProps) {
  const [selectedReason, setSelectedReason] = useState<CCNNonMatchReasonCode | null>(null);
  const [justificationText, setJustificationText] = useState('');
  const [touched, setTouched] = useState(false);

  // Validation
  const characterCount = justificationText.length;
  const isTextValid = characterCount >= minCharacters && characterCount <= maxCharacters;
  const isFormValid = selectedReason !== null && isTextValid;
  const showError = touched && !isTextValid && characterCount > 0;

  // Character count color
  const characterCountColor = useMemo(() => {
    if (characterCount === 0) return 'text-slate-400 dark:text-slate-500';
    if (characterCount < minCharacters) return 'text-amber-600 dark:text-amber-400';
    if (characterCount > maxCharacters) return 'text-red-600 dark:text-red-400';
    return 'text-green-600 dark:text-green-400';
  }, [characterCount, minCharacters, maxCharacters]);

  // Handlers
  const handleReasonSelect = useCallback((value: CCNNonMatchReasonCode) => {
    setSelectedReason(value);
  }, []);

  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setJustificationText(e.target.value);
    if (!touched) setTouched(true);
  }, [touched]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setTouched(true);

      if (isFormValid && selectedReason) {
        onSubmit(selectedReason, justificationText.trim());
      }
    },
    [isFormValid, selectedReason, justificationText, onSubmit]
  );

  return (
    <div className={`${className}`}>
      {/* Warning Banner */}
      <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
        <div className="flex items-start gap-3">
          <ExclamationTriangleIcon className="h-6 w-6 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-amber-800 dark:text-amber-200">
              AB 1111 Compliance Required
            </h3>
            <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
              Per Assembly Bill 1111 (Common Course Numbering), courses that do not align
              with a C-ID standard must provide a documented justification. This
              justification will be included in your course proposal for review.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Reason Selection */}
        <fieldset className="mb-6">
          <legend className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
            <DocumentTextIcon className="h-5 w-5" />
            Select a reason for non-alignment
            <span className="text-red-500" aria-hidden="true">*</span>
          </legend>

          <div className="space-y-3" role="radiogroup" aria-required="true">
            {CCN_REASON_OPTIONS.map((option) => (
              <ReasonRadioOption
                key={option.value}
                option={option}
                isSelected={selectedReason === option.value}
                onSelect={handleReasonSelect}
                disabled={isSubmitting}
              />
            ))}
          </div>
        </fieldset>

        {/* Justification Textarea */}
        <div className="mb-6">
          <label
            htmlFor="justification-text"
            className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2"
          >
            <InformationCircleIcon className="h-5 w-5" />
            Provide detailed justification
            <span className="text-red-500" aria-hidden="true">*</span>
          </label>

          <textarea
            id="justification-text"
            value={justificationText}
            onChange={handleTextChange}
            onBlur={() => setTouched(true)}
            disabled={isSubmitting}
            placeholder="Explain why this course does not align with any CCN standard..."
            rows={4}
            aria-describedby="justification-hint justification-error"
            aria-invalid={showError}
            className={`
              w-full px-4 py-3 rounded-lg border-2
              bg-white dark:bg-slate-800
              text-slate-900 dark:text-white
              placeholder-slate-400 dark:placeholder-slate-500
              transition-colors duration-200
              focus:outline-none focus:ring-2 focus:ring-offset-2
              focus:ring-luminous-500 dark:focus:ring-offset-slate-900
              disabled:opacity-50 disabled:cursor-not-allowed
              resize-none
              ${
                showError
                  ? 'border-red-500 dark:border-red-400'
                  : 'border-slate-200 dark:border-slate-700 focus:border-luminous-500'
              }
            `}
          />

          {/* Helper Text and Character Counter */}
          <div className="flex items-center justify-between mt-2">
            <div className="flex-1">
              {showError ? (
                <p
                  id="justification-error"
                  className="text-sm text-red-600 dark:text-red-400"
                  role="alert"
                >
                  {characterCount < minCharacters
                    ? `Please enter at least ${minCharacters} characters`
                    : `Maximum ${maxCharacters} characters allowed`}
                </p>
              ) : (
                <p
                  id="justification-hint"
                  className="text-sm text-slate-500 dark:text-slate-400"
                >
                  Minimum {minCharacters} characters required
                </p>
              )}
            </div>
            <p className={`text-sm font-medium ${characterCountColor}`} aria-live="polite">
              {characterCount}/{maxCharacters}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={onBack}
            disabled={isSubmitting}
            className="
              flex items-center gap-2 px-4 py-2.5
              text-slate-700 dark:text-slate-300
              hover:bg-slate-100 dark:hover:bg-slate-800
              font-medium rounded-lg transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed
            "
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back
          </button>

          <button
            type="submit"
            disabled={!isFormValid || isSubmitting}
            className="
              flex items-center gap-2 px-6 py-2.5
              bg-luminous-600 hover:bg-luminous-700
              text-white font-medium rounded-lg
              transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed
            "
          >
            {isSubmitting ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                Submitting...
              </>
            ) : (
              <>
                <CheckIcon className="h-4 w-4" />
                Submit Justification
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export default CCNNonMatchForm;
