'use client';

import React from 'react';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
  width?: string | number;
  height?: string | number;
  animation?: 'pulse' | 'wave' | 'none';
}

/**
 * Base Skeleton component for loading placeholders
 */
export function Skeleton({
  className = '',
  variant = 'rectangular',
  width,
  height,
  animation = 'pulse',
}: SkeletonProps) {
  const baseClasses = 'bg-slate-200 dark:bg-slate-700';

  const variantClasses = {
    text: 'rounded',
    circular: 'rounded-full',
    rectangular: '',
    rounded: 'rounded-lg',
  };

  const animationClasses = {
    pulse: 'animate-pulse',
    wave: 'animate-shimmer',
    none: '',
  };

  const style: React.CSSProperties = {
    width: width || '100%',
    height: height || (variant === 'text' ? '1em' : '100%'),
  };

  return (
    <div
      className={`${baseClasses} ${variantClasses[variant]} ${animationClasses[animation]} ${className}`}
      style={style}
      aria-hidden="true"
    />
  );
}

/**
 * Card Skeleton - matches luminous-card styling
 */
export function CardSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`luminous-card ${className}`}>
      <div className="flex justify-between items-start mb-4">
        <Skeleton variant="text" width="60%" height={20} />
        <Skeleton variant="rounded" width={70} height={24} />
      </div>
      <Skeleton variant="text" width="80%" height={16} className="mb-2" />
      <Skeleton variant="text" width="50%" height={14} className="mb-4" />
      <div className="flex justify-between items-center pt-4 border-t border-slate-200 dark:border-slate-700">
        <Skeleton variant="text" width={60} height={14} />
        <Skeleton variant="text" width={100} height={12} />
      </div>
    </div>
  );
}

/**
 * Course Card Skeleton - specific to course list cards
 */
export function CourseCardSkeleton() {
  return (
    <div className="luminous-card cursor-pointer">
      {/* Header with code and status */}
      <div className="flex justify-between items-start mb-2">
        <Skeleton variant="text" width={100} height={18} />
        <Skeleton variant="rounded" width={60} height={22} />
      </div>

      {/* Title */}
      <Skeleton variant="text" width="90%" height={20} className="mb-1" />

      {/* Department */}
      <Skeleton variant="text" width="70%" height={14} className="mb-4" />

      {/* Footer with units and date */}
      <div className="flex justify-between items-center pt-4 border-t border-slate-200 dark:border-slate-700">
        <Skeleton variant="text" width={70} height={14} />
        <Skeleton variant="text" width={120} height={12} />
      </div>
    </div>
  );
}

/**
 * Program Card Skeleton - specific to program list cards
 */
export function ProgramCardSkeleton() {
  return (
    <div className="luminous-card cursor-pointer">
      {/* Header with type badge and status */}
      <div className="flex justify-between items-start mb-2">
        <Skeleton variant="rounded" width={80} height={22} />
        <Skeleton variant="rounded" width={70} height={22} />
      </div>

      {/* Title */}
      <Skeleton variant="text" width="85%" height={20} className="mb-1" />

      {/* Department */}
      <Skeleton variant="text" width="60%" height={14} className="mb-4" />

      {/* Footer with units and date */}
      <div className="flex justify-between items-center pt-4 border-t border-slate-200 dark:border-slate-700">
        <Skeleton variant="text" width={80} height={14} />
        <Skeleton variant="text" width={120} height={12} />
      </div>
    </div>
  );
}

/**
 * Table Row Skeleton
 */
export function TableRowSkeleton({ columns = 5 }: { columns?: number }) {
  return (
    <tr className="border-b border-slate-200 dark:border-slate-700">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-6 py-4">
          <Skeleton variant="text" width={i === 0 ? '80%' : '60%'} height={16} />
        </td>
      ))}
    </tr>
  );
}

/**
 * Table Skeleton - full table with headers and rows
 */
export function TableSkeleton({
  columns = 5,
  rows = 5,
  headers = ['Column 1', 'Column 2', 'Column 3', 'Column 4', 'Column 5']
}: {
  columns?: number;
  rows?: number;
  headers?: string[];
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
      <table className="luminous-table">
        <thead className="bg-slate-50 dark:bg-slate-800">
          <tr>
            {headers.slice(0, columns).map((header, i) => (
              <th key={i} className="luminous-th">
                <Skeleton variant="text" width={80} height={12} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-700">
          {Array.from({ length: rows }).map((_, i) => (
            <TableRowSkeleton key={i} columns={columns} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Stats Card Skeleton - for dashboard stat cards
 */
export function StatsCardSkeleton() {
  return (
    <div className="luminous-card flex items-center gap-4">
      <Skeleton variant="rounded" width={48} height={48} />
      <div className="flex-1">
        <Skeleton variant="text" width={80} height={14} className="mb-1" />
        <Skeleton variant="text" width={40} height={28} />
      </div>
    </div>
  );
}

/**
 * Form Field Skeleton
 */
export function FormFieldSkeleton() {
  return (
    <div className="mb-4">
      <Skeleton variant="text" width={100} height={14} className="mb-2" />
      <Skeleton variant="rounded" width="100%" height={40} />
    </div>
  );
}

/**
 * Course Detail Skeleton - for course detail page
 */
export function CourseDetailSkeleton() {
  return (
    <div className="animate-fadeIn">
      {/* Header */}
      <div className="mb-6">
        <Skeleton variant="text" width={120} height={14} className="mb-2" />
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <Skeleton variant="text" width={150} height={28} />
              <Skeleton variant="rounded" width={70} height={24} />
            </div>
            <Skeleton variant="text" width="60%" height={24} className="mb-1" />
            <Skeleton variant="text" width={200} height={16} />
          </div>
          <div className="flex gap-2">
            <Skeleton variant="rounded" width={110} height={40} />
            <Skeleton variant="rounded" width={110} height={40} />
          </div>
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Description Card */}
          <div className="luminous-card">
            <Skeleton variant="text" width={180} height={20} className="mb-4" />
            <Skeleton variant="text" width="100%" height={14} className="mb-2" />
            <Skeleton variant="text" width="95%" height={14} className="mb-2" />
            <Skeleton variant="text" width="80%" height={14} />
          </div>

          {/* SLOs Card */}
          <div className="luminous-card">
            <Skeleton variant="text" width={220} height={20} className="mb-4" />
            {[1, 2, 3].map((i) => (
              <div key={i} className="mb-4 last:mb-0">
                <div className="flex items-start gap-3">
                  <Skeleton variant="circular" width={24} height={24} />
                  <div className="flex-1">
                    <Skeleton variant="text" width="90%" height={14} className="mb-1" />
                    <Skeleton variant="text" width={100} height={12} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="luminous-card">
            <Skeleton variant="text" width={120} height={18} className="mb-4" />
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex justify-between items-center mb-3 last:mb-0">
                <Skeleton variant="text" width={100} height={14} />
                <Skeleton variant="text" width={40} height={14} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
