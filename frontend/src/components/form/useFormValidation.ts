'use client';

// ===========================================
// useFormValidation Hook
// ===========================================
// Comprehensive form validation hook with real-time validation,
// blur-based validation, and error management

import { useState, useCallback, useRef } from 'react';
import { ValidationError } from './ValidationSummary';

// ===========================================
// Types
// ===========================================

export interface ValidationRule<T = string> {
  /** Validation function - returns error message or undefined */
  validate: (value: T, formData?: Record<string, unknown>) => string | undefined;
  /** When to run this validation */
  validateOn?: ('change' | 'blur' | 'submit')[];
}

export interface FieldConfig<T = string> {
  /** Human-readable label for the field */
  label: string;
  /** Validation rules to apply */
  rules: ValidationRule<T>[];
  /** Initial value */
  initialValue?: T;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FieldConfigs = Record<string, FieldConfig<any>>;

export interface FormValidationState {
  /** All field errors keyed by field name */
  errors: Record<string, string | undefined>;
  /** Fields that have been touched (blurred) */
  touched: Record<string, boolean>;
  /** Whether form has been submitted at least once */
  submitted: boolean;
  /** Whether form is currently valid */
  isValid: boolean;
}

export interface UseFormValidationReturn<T extends FieldConfigs> {
  /** Current error for each field */
  errors: Record<keyof T, string | undefined>;
  /** Whether each field has been touched */
  touched: Record<keyof T, boolean>;
  /** Whether form has been submitted */
  submitted: boolean;
  /** Whether form is currently valid */
  isValid: boolean;
  /** Array of validation errors for ValidationSummary */
  validationErrors: ValidationError[];
  /** Validate a single field */
  validateField: (name: keyof T, value: unknown) => string | undefined;
  /** Validate all fields */
  validateAll: (formData: Record<string, unknown>) => boolean;
  /** Handle field blur - marks as touched and validates */
  handleBlur: (name: keyof T, value: unknown) => void;
  /** Handle field change - validates if touched or submitted */
  handleChange: (name: keyof T, value: unknown) => void;
  /** Clear error for a field */
  clearError: (name: keyof T) => void;
  /** Clear all errors */
  clearAllErrors: () => void;
  /** Reset form state */
  reset: () => void;
  /** Set error manually */
  setError: (name: keyof T, error: string) => void;
  /** Set multiple errors (e.g., from API response) */
  setErrors: (errors: Record<string, string>) => void;
  /** Mark form as submitted */
  setSubmitted: () => void;
  /** Get props for a field (errors, touched, etc.) */
  getFieldProps: (name: keyof T) => {
    hasError: boolean;
    isValid: boolean;
    error: string | undefined;
  };
}

// ===========================================
// Common Validation Rules
// ===========================================

export const validationRules = {
  /** Field is required */
  required: (label: string): ValidationRule => ({
    validate: (value) => {
      if (!value || (typeof value === 'string' && !value.trim())) {
        return `${label} is required`;
      }
      return undefined;
    },
  }),

  /** Minimum length */
  minLength: (min: number, label: string): ValidationRule => ({
    validate: (value) => {
      if (typeof value === 'string' && value.trim().length < min) {
        return `${label} must be at least ${min} characters`;
      }
      return undefined;
    },
  }),

  /** Maximum length */
  maxLength: (max: number, label: string): ValidationRule => ({
    validate: (value) => {
      if (typeof value === 'string' && value.trim().length > max) {
        return `${label} must be ${max} characters or less`;
      }
      return undefined;
    },
  }),

  /** Email format */
  email: (): ValidationRule => ({
    validate: (value) => {
      if (typeof value === 'string' && value.trim()) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value.trim())) {
          return 'Please enter a valid email address';
        }
      }
      return undefined;
    },
  }),

  /** Numeric value */
  numeric: (label: string): ValidationRule => ({
    validate: (value) => {
      if (value && isNaN(Number(value))) {
        return `${label} must be a number`;
      }
      return undefined;
    },
  }),

  /** Minimum numeric value */
  min: (min: number, label: string): ValidationRule => ({
    validate: (value) => {
      const num = Number(value);
      if (!isNaN(num) && num < min) {
        return `${label} must be at least ${min}`;
      }
      return undefined;
    },
  }),

  /** Maximum numeric value */
  max: (max: number, label: string): ValidationRule => ({
    validate: (value) => {
      const num = Number(value);
      if (!isNaN(num) && num > max) {
        return `${label} must be at most ${max}`;
      }
      return undefined;
    },
  }),

  /** Pattern match */
  pattern: (regex: RegExp, message: string): ValidationRule => ({
    validate: (value) => {
      if (typeof value === 'string' && value.trim() && !regex.test(value.trim())) {
        return message;
      }
      return undefined;
    },
  }),

  /** Custom validation */
  custom: (
    validateFn: (value: unknown, formData?: Record<string, unknown>) => string | undefined
  ): ValidationRule => ({
    validate: validateFn,
  }),
};

// ===========================================
// useFormValidation Hook
// ===========================================

export function useFormValidation<T extends FieldConfigs>(
  fieldConfigs: T
): UseFormValidationReturn<T> {
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmittedState] = useState(false);

  const configsRef = useRef(fieldConfigs);
  configsRef.current = fieldConfigs;

  // Validate a single field
  const validateField = useCallback((
    name: keyof T,
    value: unknown,
    formData?: Record<string, unknown>
  ): string | undefined => {
    const config = configsRef.current[name as string];
    if (!config) return undefined;

    for (const rule of config.rules) {
      const error = rule.validate(value as never, formData);
      if (error) return error;
    }
    return undefined;
  }, []);

  // Validate all fields
  const validateAll = useCallback((formData: Record<string, unknown>): boolean => {
    const newErrors: Record<string, string | undefined> = {};
    let isValid = true;

    for (const [name, config] of Object.entries(configsRef.current)) {
      const value = formData[name];
      const error = validateField(name as keyof T, value, formData);
      newErrors[name] = error;
      if (error) isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  }, [validateField]);

  // Handle blur - mark touched and validate
  const handleBlur = useCallback((name: keyof T, value: unknown) => {
    setTouched(prev => ({ ...prev, [name]: true }));
    const error = validateField(name, value);
    setErrors(prev => ({ ...prev, [name]: error }));
  }, [validateField]);

  // Handle change - validate if touched or submitted
  const handleChange = useCallback((name: keyof T, value: unknown) => {
    if (touched[name as string] || submitted) {
      const error = validateField(name, value);
      setErrors(prev => ({ ...prev, [name]: error }));
    } else if (errors[name as string]) {
      // Clear error if user starts typing and there was an error
      setErrors(prev => ({ ...prev, [name]: undefined }));
    }
  }, [touched, submitted, validateField, errors]);

  // Clear error for a field
  const clearError = useCallback((name: keyof T) => {
    setErrors(prev => ({ ...prev, [name]: undefined }));
  }, []);

  // Clear all errors
  const clearAllErrors = useCallback(() => {
    setErrors({});
  }, []);

  // Reset form state
  const reset = useCallback(() => {
    setErrors({});
    setTouched({});
    setSubmittedState(false);
  }, []);

  // Set error manually
  const setError = useCallback((name: keyof T, error: string) => {
    setErrors(prev => ({ ...prev, [name]: error }));
  }, []);

  // Set multiple errors
  const setErrorsFromApi = useCallback((apiErrors: Record<string, string>) => {
    setErrors(prev => ({ ...prev, ...apiErrors }));
  }, []);

  // Mark as submitted
  const setSubmitted = useCallback(() => {
    setSubmittedState(true);
    // Mark all fields as touched
    const allTouched: Record<string, boolean> = {};
    for (const name of Object.keys(configsRef.current)) {
      allTouched[name] = true;
    }
    setTouched(allTouched);
  }, []);

  // Get field props
  const getFieldProps = useCallback((name: keyof T) => {
    const error = errors[name as string];
    const isTouched = touched[name as string] || submitted;
    return {
      hasError: isTouched && Boolean(error),
      isValid: isTouched && !error,
      error: isTouched ? error : undefined,
    };
  }, [errors, touched, submitted]);

  // Compute validation errors for summary
  const validationErrors: ValidationError[] = Object.entries(errors)
    .filter(([, error]) => error)
    .map(([field, message]) => ({
      field,
      label: configsRef.current[field]?.label || field,
      message: message!,
    }));

  // Compute overall validity
  const isValid = Object.values(errors).every(error => !error);

  return {
    errors: errors as Record<keyof T, string | undefined>,
    touched: touched as Record<keyof T, boolean>,
    submitted,
    isValid,
    validationErrors,
    validateField,
    validateAll,
    handleBlur,
    handleChange,
    clearError,
    clearAllErrors,
    reset,
    setError,
    setErrors: setErrorsFromApi,
    setSubmitted,
    getFieldProps,
  };
}

export default useFormValidation;
