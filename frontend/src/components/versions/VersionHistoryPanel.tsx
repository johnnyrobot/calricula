'use client';

/**
 * Version History Panel Component
 *
 * Displays a list of all versions of a course, allowing users to:
 * - See version history with dates, status, and creators
 * - Click to view a specific version
 * - Compare two versions
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ClockIcon,
  DocumentDuplicateIcon,
  ArrowsRightLeftIcon,
  EyeIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '@/contexts/AuthContext';
import { api, CourseListItem, CourseStatus } from '@/lib/api';

// =============================================================================
// Types
// =============================================================================

interface VersionHistoryPanelProps {
  courseId: string;
  currentVersion?: number;
}

// =============================================================================
// Status Badge Component
// =============================================================================

function StatusBadge({ status }: { status: CourseStatus }) {
  const statusConfig: Record<CourseStatus, { bg: string; text: string }> = {
    Draft: {
      bg: 'bg-slate-100 dark:bg-slate-800',
      text: 'text-slate-600 dark:text-slate-400',
    },
    DeptReview: {
      bg: 'bg-yellow-100 dark:bg-yellow-900/30',
      text: 'text-yellow-700 dark:text-yellow-300',
    },
    CurriculumCommittee: {
      bg: 'bg-blue-100 dark:bg-blue-900/30',
      text: 'text-blue-700 dark:text-blue-300',
    },
    ArticulationReview: {
      bg: 'bg-purple-100 dark:bg-purple-900/30',
      text: 'text-purple-700 dark:text-purple-300',
    },
    Approved: {
      bg: 'bg-green-100 dark:bg-green-900/30',
      text: 'text-green-700 dark:text-green-300',
    },
  };

  const config = statusConfig[status] || statusConfig.Draft;

  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded ${config.bg} ${config.text}`}>
      {status === 'Approved' && <CheckCircleIcon className="w-3 h-3 mr-1" />}
      {status}
    </span>
  );
}

// =============================================================================
// Version Item Component
// =============================================================================

interface VersionItemProps {
  version: CourseListItem;
  isCurrentVersion: boolean;
  onCompare: (versionId: string) => void;
}

function VersionItem({ version, isCurrentVersion, onCompare }: VersionItemProps) {
  const formattedDate = new Date(version.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const formattedTime = new Date(version.created_at).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className={`relative p-3 rounded-lg border transition-colors ${
        isCurrentVersion
          ? 'border-luminous-300 dark:border-luminous-700 bg-luminous-50 dark:bg-luminous-900/20'
          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
      }`}
    >
      {/* Current Version Indicator */}
      {isCurrentVersion && (
        <div className="absolute -top-2 -right-2">
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-luminous-500 text-white">
            Current
          </span>
        </div>
      )}

      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* Version Number & Status */}
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-slate-900 dark:text-white">
              {version.title || 'Version 1'}
            </span>
            <StatusBadge status={version.status} />
          </div>

          {/* Date and Time */}
          <div className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
            <ClockIcon className="w-4 h-4" />
            <span>{formattedDate}</span>
            <span className="text-slate-300 dark:text-slate-600">•</span>
            <span>{formattedTime}</span>
          </div>

          {/* Department */}
          {version.department && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">
              {version.department.name}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <Link
            href={`/courses/${version.id}`}
            className="p-1.5 rounded-md text-slate-400 hover:text-luminous-600 hover:bg-luminous-50 dark:hover:bg-luminous-900/20 transition-colors"
            title="View this version"
          >
            <EyeIcon className="w-4 h-4" />
          </Link>
          {!isCurrentVersion && (
            <button
              onClick={() => onCompare(version.id)}
              className="p-1.5 rounded-md text-slate-400 hover:text-luminous-600 hover:bg-luminous-50 dark:hover:bg-luminous-900/20 transition-colors"
              title="Compare with current version"
            >
              <ArrowsRightLeftIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export default function VersionHistoryPanel({ courseId, currentVersion = 1 }: VersionHistoryPanelProps) {
  const { getToken } = useAuth();
  const [versions, setVersions] = useState<CourseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);

  // Fetch versions on mount
  useEffect(() => {
    const fetchVersions = async () => {
      try {
        setLoading(true);
        setError(null);
        const token = await getToken();
        if (token) {
          api.setToken(token);
        }
        const data = await api.getCourseVersions(courseId);
        setVersions(data);
      } catch (err) {
        console.error('Failed to fetch versions:', err);
        setError(err instanceof Error ? err.message : 'Failed to load versions');
      } finally {
        setLoading(false);
      }
    };

    fetchVersions();
  }, [courseId, getToken]);

  // Handle compare action
  const handleCompare = (compareVersionId: string) => {
    window.location.href = `/courses/${courseId}/compare?target=${compareVersionId}`;
  };

  // Loading state
  if (loading) {
    return (
      <div className="luminous-card">
        <div className="flex items-center gap-2 mb-4">
          <DocumentDuplicateIcon className="w-5 h-5 text-luminous-500" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            Version History
          </h3>
        </div>
        <div className="flex justify-center py-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-luminous-500" />
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="luminous-card">
        <div className="flex items-center gap-2 mb-4">
          <DocumentDuplicateIcon className="w-5 h-5 text-luminous-500" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            Version History
          </h3>
        </div>
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  // No versions found
  if (versions.length === 0) {
    return (
      <div className="luminous-card">
        <div className="flex items-center gap-2 mb-4">
          <DocumentDuplicateIcon className="w-5 h-5 text-luminous-500" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            Version History
          </h3>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 italic">
          No version history available
        </p>
      </div>
    );
  }

  return (
    <div className="luminous-card">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between gap-2 mb-4"
      >
        <div className="flex items-center gap-2">
          <DocumentDuplicateIcon className="w-5 h-5 text-luminous-500" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            Version History
          </h3>
          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
            {versions.length} {versions.length === 1 ? 'version' : 'versions'}
          </span>
        </div>
        {isExpanded ? (
          <ChevronUpIcon className="w-5 h-5 text-slate-400" />
        ) : (
          <ChevronDownIcon className="w-5 h-5 text-slate-400" />
        )}
      </button>

      {/* Version List */}
      {isExpanded && (
        <div className="space-y-3">
          {versions.map((version, index) => (
            <VersionItem
              key={version.id}
              version={version}
              isCurrentVersion={version.id === courseId}
              onCompare={handleCompare}
            />
          ))}

          {/* Compare Link */}
          {versions.length > 1 && (
            <Link
              href={`/courses/${courseId}/compare`}
              className="flex items-center justify-center gap-2 w-full py-2 mt-2 text-sm font-medium text-luminous-600 dark:text-luminous-400 hover:text-luminous-700 dark:hover:text-luminous-300 hover:bg-luminous-50 dark:hover:bg-luminous-900/20 rounded-lg transition-colors"
            >
              <ArrowsRightLeftIcon className="w-4 h-4" />
              Compare Versions
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
