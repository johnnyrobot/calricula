'use client';

import React from 'react';
import { CourseCardSkeleton, ProgramCardSkeleton, StatsCardSkeleton, TableSkeleton } from './Skeleton';
import { CenteredSpinner } from './Spinner';

interface PageLoadingProps {
  variant?: 'cards' | 'table' | 'detail' | 'spinner';
  count?: number;
  className?: string;
}

/**
 * Page Loading component with different variants for different page types
 */
export function PageLoading({
  variant = 'spinner',
  count = 6,
  className = '',
}: PageLoadingProps) {
  if (variant === 'spinner') {
    return <CenteredSpinner text="Loading content..." className={className} />;
  }

  if (variant === 'table') {
    return (
      <div className={className}>
        <TableSkeleton rows={count} />
      </div>
    );
  }

  if (variant === 'cards') {
    return (
      <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 ${className}`}>
        {Array.from({ length: count }).map((_, i) => (
          <CourseCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  return <CenteredSpinner className={className} />;
}

/**
 * Courses Page Loading State
 */
export function CoursesPageLoading() {
  return (
    <div className="animate-fadeIn">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <div className="h-8 w-32 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
          <div className="h-4 w-64 bg-slate-200 dark:bg-slate-700 rounded mt-2 animate-pulse" />
        </div>
        <div className="h-10 w-32 bg-luminous-200 dark:bg-luminous-800 rounded-lg animate-pulse" />
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <div className="flex-1 h-10 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse" />
        <div className="w-40 h-10 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse" />
      </div>

      {/* Course Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 9 }).map((_, i) => (
          <CourseCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

/**
 * Programs Page Loading State
 */
export function ProgramsPageLoading() {
  return (
    <div className="animate-fadeIn">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <div className="h-8 w-32 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
          <div className="h-4 w-72 bg-slate-200 dark:bg-slate-700 rounded mt-2 animate-pulse" />
        </div>
        <div className="h-10 w-36 bg-luminous-200 dark:bg-luminous-800 rounded-lg animate-pulse" />
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <div className="flex-1 h-10 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse" />
        <div className="w-36 h-10 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse" />
        <div className="w-40 h-10 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse" />
      </div>

      {/* Program Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <ProgramCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

/**
 * Dashboard Page Loading State
 */
export function DashboardPageLoading() {
  return (
    <div className="animate-fadeIn">
      {/* Welcome Message */}
      <div className="mb-8">
        <div className="h-10 w-64 bg-slate-200 dark:bg-slate-700 rounded animate-pulse mb-2" />
        <div className="h-5 w-80 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {Array.from({ length: 3 }).map((_, i) => (
          <StatsCardSkeleton key={i} />
        ))}
      </div>

      {/* Quick Actions and Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick Actions */}
        <div className="luminous-card">
          <div className="h-6 w-32 bg-slate-200 dark:bg-slate-700 rounded animate-pulse mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-20 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="luminous-card">
          <div className="h-6 w-36 bg-slate-200 dark:bg-slate-700 rounded animate-pulse mb-4" />
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-3 w-3 bg-slate-200 dark:bg-slate-700 rounded-full animate-pulse" />
                <div className="flex-1">
                  <div className="h-4 w-48 bg-slate-200 dark:bg-slate-700 rounded animate-pulse mb-1" />
                  <div className="h-3 w-32 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                </div>
                <div className="h-3 w-16 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Approval Queue Page Loading State
 */
export function ApprovalsPageLoading() {
  return (
    <div className="animate-fadeIn">
      {/* Header */}
      <div className="mb-6">
        <div className="h-8 w-40 bg-slate-200 dark:bg-slate-700 rounded animate-pulse mb-2" />
        <div className="h-4 w-64 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b border-slate-200 dark:border-slate-700 pb-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-8 w-32 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
        ))}
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="h-10 w-full max-w-md bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse" />
      </div>

      {/* Queue Items */}
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="luminous-card">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="h-5 w-48 bg-slate-200 dark:bg-slate-700 rounded animate-pulse mb-2" />
                <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
              </div>
              <div className="h-6 w-24 bg-slate-200 dark:bg-slate-700 rounded-full animate-pulse" />
            </div>
            <div className="mt-4 flex justify-between items-center">
              <div className="h-4 w-40 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
              <div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
