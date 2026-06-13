'use client';

import { useEffect } from 'react';
import { GenericError } from '@/components/error';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Next.js Error Page
 *
 * This page is automatically rendered when an error is thrown
 * in a route segment or its nested children.
 */
export default function Error({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Error page caught error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <GenericError
        title="Something went wrong"
        message={
          process.env.NODE_ENV === 'development'
            ? error.message
            : 'An unexpected error occurred. Please try again.'
        }
        onRetry={reset}
        showRetry={true}
        showGoHome={true}
      />
    </div>
  );
}
