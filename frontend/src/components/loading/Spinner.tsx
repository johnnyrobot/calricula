'use client';

import React from 'react';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'primary' | 'white' | 'muted';
  className?: string;
  label?: string;
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
  xl: 'h-12 w-12',
};

const variantClasses = {
  primary: 'text-luminous-600',
  white: 'text-white',
  muted: 'text-slate-400 dark:text-slate-500',
};

/**
 * Spinner component for loading states
 */
export function Spinner({
  size = 'md',
  variant = 'primary',
  className = '',
  label = 'Loading...',
}: SpinnerProps) {
  return (
    <div className={`inline-flex items-center ${className}`} role="status">
      <svg
        className={`animate-spin ${sizeClasses[size]} ${variantClasses[variant]}`}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      <span className="sr-only">{label}</span>
    </div>
  );
}

/**
 * Button Spinner - smaller spinner for use inside buttons
 */
export function ButtonSpinner({ className = '' }: { className?: string }) {
  return <Spinner size="sm" variant="white" className={className} />;
}

/**
 * Inline Loading - spinner with text
 */
export function InlineLoading({
  text = 'Loading...',
  size = 'md',
  className = '',
}: {
  text?: string;
  size?: SpinnerProps['size'];
  className?: string;
}) {
  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <Spinner size={size} variant="primary" />
      <span className="text-slate-600 dark:text-slate-400">{text}</span>
    </div>
  );
}

/**
 * Centered Spinner - for use in content areas
 */
export function CenteredSpinner({
  size = 'lg',
  text,
  className = '',
}: {
  size?: SpinnerProps['size'];
  text?: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 ${className}`}>
      <Spinner size={size} variant="primary" />
      {text && (
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{text}</p>
      )}
    </div>
  );
}

/**
 * Full Page Spinner - for page-level loading states
 */
export function FullPageSpinner({
  text = 'Loading...',
  className = '',
}: {
  text?: string;
  className?: string;
}) {
  return (
    <div
      className={`fixed inset-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center z-50 ${className}`}
    >
      <Spinner size="xl" variant="primary" />
      <p className="mt-4 text-lg font-medium text-slate-700 dark:text-slate-300">
        {text}
      </p>
    </div>
  );
}

/**
 * Overlay Spinner - for section/modal loading states
 */
export function OverlaySpinner({
  text,
  className = '',
}: {
  text?: string;
  className?: string;
}) {
  return (
    <div
      className={`absolute inset-0 bg-white/70 dark:bg-slate-900/70 flex flex-col items-center justify-center z-10 rounded-lg ${className}`}
    >
      <Spinner size="lg" variant="primary" />
      {text && (
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">{text}</p>
      )}
    </div>
  );
}
