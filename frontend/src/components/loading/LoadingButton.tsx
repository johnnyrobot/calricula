'use client';

import React from 'react';
import { ButtonSpinner } from './Spinner';

interface LoadingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingText?: string;
  variant?: 'primary' | 'secondary' | 'danger';
  children: React.ReactNode;
}

const variantClasses = {
  primary: 'luminous-button-primary',
  secondary: 'luminous-button-secondary',
  danger: 'luminous-button-danger',
};

/**
 * Button with built-in loading state
 */
export function LoadingButton({
  loading = false,
  loadingText,
  variant = 'primary',
  children,
  disabled,
  className = '',
  ...props
}: LoadingButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`${variantClasses[variant]} ${className}`}
      {...props}
    >
      {loading ? (
        <>
          <ButtonSpinner className="mr-2" />
          {loadingText || children}
        </>
      ) : (
        children
      )}
    </button>
  );
}

/**
 * Submit Button - specialized loading button for forms
 */
export function SubmitButton({
  loading = false,
  loadingText = 'Submitting...',
  children = 'Submit',
  ...props
}: Omit<LoadingButtonProps, 'type'>) {
  return (
    <LoadingButton
      type="submit"
      loading={loading}
      loadingText={loadingText}
      {...props}
    >
      {children}
    </LoadingButton>
  );
}

/**
 * Save Button - specialized loading button for save actions
 */
export function SaveButton({
  loading = false,
  loadingText = 'Saving...',
  children = 'Save',
  ...props
}: Omit<LoadingButtonProps, 'type'>) {
  return (
    <LoadingButton
      type="submit"
      loading={loading}
      loadingText={loadingText}
      {...props}
    >
      {children}
    </LoadingButton>
  );
}
