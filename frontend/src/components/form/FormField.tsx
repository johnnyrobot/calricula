'use client';

// ===========================================
// FormField Component
// ===========================================
// Reusable form field wrapper with built-in validation feedback
// Provides consistent error display, icons, and accessibility

import React, { forwardRef, useId } from 'react';
import {
  ExclamationCircleIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/solid';

// ===========================================
// Types
// ===========================================

export interface FormFieldProps {
  /** Field label text */
  label: string;
  /** Field name for form state */
  name: string;
  /** Error message to display */
  error?: string;
  /** Whether field has been validated and is valid */
  isValid?: boolean;
  /** Helper text shown below input */
  helperText?: string;
  /** Whether the field is required */
  required?: boolean;
  /** Children (input, select, textarea) */
  children: React.ReactNode;
  /** Additional className for container */
  className?: string;
  /** Show success state when valid */
  showSuccess?: boolean;
}

// ===========================================
// FormField Component
// ===========================================

export function FormField({
  label,
  name,
  error,
  isValid,
  helperText,
  required = false,
  children,
  className = '',
  showSuccess = false,
}: FormFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const helperId = `${id}-helper`;

  const hasError = Boolean(error);
  const showValidState = showSuccess && isValid && !hasError;

  return (
    <div className={`form-field ${className}`}>
      {/* Label */}
      <label
        htmlFor={name}
        className="luminous-label flex items-center gap-1"
      >
        {label}
        {required && (
          <span className="text-red-500" aria-hidden="true">*</span>
        )}
      </label>

      {/* Input Container */}
      <div className="relative">
        {children}

        {/* Status Icon */}
        {(hasError || showValidState) && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
            {hasError ? (
              <ExclamationCircleIcon
                className="h-5 w-5 text-red-500"
                aria-hidden="true"
              />
            ) : showValidState ? (
              <CheckCircleIcon
                className="h-5 w-5 text-green-500"
                aria-hidden="true"
              />
            ) : null}
          </div>
        )}
      </div>

      {/* Error Message */}
      {hasError && (
        <p
          id={errorId}
          className="mt-1.5 text-sm text-red-600 dark:text-red-400 flex items-center gap-1.5 animate-fadeIn"
          role="alert"
        >
          <ExclamationCircleIcon className="h-4 w-4 flex-shrink-0" />
          {error}
        </p>
      )}

      {/* Helper Text */}
      {helperText && !hasError && (
        <p
          id={helperId}
          className="mt-1.5 text-sm text-slate-500 dark:text-slate-400"
        >
          {helperText}
        </p>
      )}
    </div>
  );
}

// ===========================================
// FormInput Component
// ===========================================
// Pre-styled input with error state handling

export interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Error state for styling */
  hasError?: boolean;
  /** Valid state for styling */
  isValid?: boolean;
}

export const FormInput = forwardRef<HTMLInputElement, FormInputProps>(
  ({ hasError, isValid, className = '', ...props }, ref) => {
    const baseClasses = 'luminous-input pr-10';
    const errorClasses = hasError
      ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
      : '';
    const validClasses = isValid && !hasError
      ? 'border-green-500 focus:border-green-500 focus:ring-green-500'
      : '';

    return (
      <input
        ref={ref}
        className={`${baseClasses} ${errorClasses} ${validClasses} ${className}`}
        aria-invalid={hasError ? 'true' : 'false'}
        {...props}
      />
    );
  }
);

FormInput.displayName = 'FormInput';

// ===========================================
// FormSelect Component
// ===========================================
// Pre-styled select with error state handling

export interface FormSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** Error state for styling */
  hasError?: boolean;
  /** Valid state for styling */
  isValid?: boolean;
}

export const FormSelect = forwardRef<HTMLSelectElement, FormSelectProps>(
  ({ hasError, isValid, className = '', children, ...props }, ref) => {
    const baseClasses = 'luminous-select pr-10';
    const errorClasses = hasError
      ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
      : '';
    const validClasses = isValid && !hasError
      ? 'border-green-500 focus:border-green-500 focus:ring-green-500'
      : '';

    return (
      <select
        ref={ref}
        className={`${baseClasses} ${errorClasses} ${validClasses} ${className}`}
        aria-invalid={hasError ? 'true' : 'false'}
        {...props}
      >
        {children}
      </select>
    );
  }
);

FormSelect.displayName = 'FormSelect';

// ===========================================
// FormTextarea Component
// ===========================================
// Pre-styled textarea with error state handling

export interface FormTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Error state for styling */
  hasError?: boolean;
  /** Valid state for styling */
  isValid?: boolean;
}

export const FormTextarea = forwardRef<HTMLTextAreaElement, FormTextareaProps>(
  ({ hasError, isValid, className = '', ...props }, ref) => {
    const baseClasses = 'luminous-textarea';
    const errorClasses = hasError
      ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
      : '';
    const validClasses = isValid && !hasError
      ? 'border-green-500 focus:border-green-500 focus:ring-green-500'
      : '';

    return (
      <textarea
        ref={ref}
        className={`${baseClasses} ${errorClasses} ${validClasses} ${className}`}
        aria-invalid={hasError ? 'true' : 'false'}
        {...props}
      />
    );
  }
);

FormTextarea.displayName = 'FormTextarea';

export default FormField;
