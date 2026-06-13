'use client';

// ===========================================
// ValidationSummary Component
// ===========================================
// Displays a summary of all validation errors at the top of a form
// Helps users quickly understand what needs to be fixed

import React from 'react';
import {
  ExclamationTriangleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

// ===========================================
// Types
// ===========================================

export interface ValidationError {
  /** Field name or identifier */
  field: string;
  /** Human-readable field label */
  label: string;
  /** Error message */
  message: string;
}

export interface ValidationSummaryProps {
  /** Array of validation errors to display */
  errors: ValidationError[];
  /** Title for the summary (default: "Please fix the following errors:") */
  title?: string;
  /** Whether the summary can be dismissed */
  dismissable?: boolean;
  /** Callback when dismissed */
  onDismiss?: () => void;
  /** Additional className */
  className?: string;
  /** Scroll to field when clicking error */
  scrollToField?: boolean;
}

// ===========================================
// ValidationSummary Component
// ===========================================

export function ValidationSummary({
  errors,
  title = 'Please fix the following errors:',
  dismissable = false,
  onDismiss,
  className = '',
  scrollToField = true,
}: ValidationSummaryProps) {
  if (errors.length === 0) {
    return null;
  }

  const handleFieldClick = (field: string) => {
    if (!scrollToField) return;

    // Try to find and focus the field
    const element = document.querySelector(`[name="${field}"]`) ||
                   document.getElementById(field);

    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (element instanceof HTMLElement) {
        element.focus();
      }
    }
  };

  return (
    <div
      className={`bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 animate-fadeIn ${className}`}
      role="alert"
      aria-live="polite"
    >
      <div className="flex">
        {/* Icon */}
        <div className="flex-shrink-0">
          <ExclamationTriangleIcon
            className="h-5 w-5 text-red-500"
            aria-hidden="true"
          />
        </div>

        {/* Content */}
        <div className="ml-3 flex-1">
          <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
            {title}
          </h3>

          <ul className="mt-2 text-sm text-red-700 dark:text-red-300 list-disc list-inside space-y-1">
            {errors.map((error) => (
              <li key={error.field}>
                <button
                  type="button"
                  onClick={() => handleFieldClick(error.field)}
                  className="hover:underline focus:outline-none focus:underline text-left"
                >
                  <span className="font-medium">{error.label}:</span>{' '}
                  {error.message}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Dismiss Button */}
        {dismissable && onDismiss && (
          <div className="flex-shrink-0 ml-3">
            <button
              type="button"
              onClick={onDismiss}
              className="inline-flex rounded-md text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
              <span className="sr-only">Dismiss</span>
              <XMarkIcon className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {/* Error Count */}
      <div className="mt-3 pt-3 border-t border-red-200 dark:border-red-700">
        <p className="text-xs text-red-600 dark:text-red-400">
          {errors.length} {errors.length === 1 ? 'error' : 'errors'} found.
          Please correct {errors.length === 1 ? 'it' : 'them'} before submitting.
        </p>
      </div>
    </div>
  );
}

// ===========================================
// Simple Error Banner
// ===========================================
// For displaying a single general error message

export interface ErrorBannerProps {
  /** Error message to display */
  message: string;
  /** Whether the banner can be dismissed */
  dismissable?: boolean;
  /** Callback when dismissed */
  onDismiss?: () => void;
  /** Additional className */
  className?: string;
}

export function ErrorBanner({
  message,
  dismissable = false,
  onDismiss,
  className = '',
}: ErrorBannerProps) {
  if (!message) return null;

  return (
    <div
      className={`bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 animate-fadeIn ${className}`}
      role="alert"
    >
      <div className="flex items-start">
        <ExclamationTriangleIcon
          className="h-5 w-5 text-red-500 flex-shrink-0"
          aria-hidden="true"
        />
        <p className="ml-3 text-sm text-red-700 dark:text-red-300 flex-1">
          {message}
        </p>
        {dismissable && onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="ml-3 inline-flex rounded-md text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            <span className="sr-only">Dismiss</span>
            <XMarkIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

export default ValidationSummary;
