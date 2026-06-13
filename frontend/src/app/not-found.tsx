'use client';

import { NotFoundError } from '@/components/error';

/**
 * Next.js 404 Not Found Page
 *
 * This page is automatically rendered when navigating to a route that doesn't exist
 * or when notFound() is called from a Server Component.
 */
export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <NotFoundError />
    </div>
  );
}
