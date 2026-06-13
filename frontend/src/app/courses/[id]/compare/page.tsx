'use client';

/**
 * Course Comparison Page
 *
 * Allows comparing two versions of a course side-by-side.
 * Shows differences in basic info, SLOs, content outline, and CB codes.
 */

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeftIcon,
  ArrowsRightLeftIcon,
  CheckCircleIcon,
  PlusCircleIcon,
  MinusCircleIcon,
  PencilSquareIcon,
  DocumentDuplicateIcon,
} from '@heroicons/react/24/outline';
import { PageShell } from '@/components/layout';
import { useAuth } from '@/contexts/AuthContext';
import {
  api,
  CourseCompareResponse,
  CourseListItem,
  DiffField,
  SLODiff,
  ContentDiff,
} from '@/lib/api';

// =============================================================================
// Diff Display Components
// =============================================================================

function ChangeTypeBadge({ type }: { type: string }) {
  const badges = {
    added: {
      bg: 'bg-green-100 dark:bg-green-900/30',
      text: 'text-green-700 dark:text-green-400',
      icon: PlusCircleIcon,
      label: 'Added',
    },
    removed: {
      bg: 'bg-red-100 dark:bg-red-900/30',
      text: 'text-red-700 dark:text-red-400',
      icon: MinusCircleIcon,
      label: 'Removed',
    },
    modified: {
      bg: 'bg-amber-100 dark:bg-amber-900/30',
      text: 'text-amber-700 dark:text-amber-400',
      icon: PencilSquareIcon,
      label: 'Modified',
    },
    unchanged: {
      bg: 'bg-gray-100 dark:bg-gray-800',
      text: 'text-gray-500 dark:text-gray-400',
      icon: CheckCircleIcon,
      label: 'Unchanged',
    },
  };

  const badge = badges[type as keyof typeof badges] || badges.unchanged;
  const Icon = badge.icon;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${badge.bg} ${badge.text}`}
    >
      <Icon className="w-3 h-3" />
      {badge.label}
    </span>
  );
}

function DiffValue({ value, isOld }: { value: unknown; isOld?: boolean }) {
  const formattedValue =
    value === null || value === undefined
      ? '(empty)'
      : typeof value === 'object'
      ? JSON.stringify(value)
      : String(value);

  if (isOld) {
    return (
      <span className="line-through text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-1 rounded">
        {formattedValue}
      </span>
    );
  }

  return (
    <span className="text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-1 rounded">
      {formattedValue}
    </span>
  );
}

function BasicInfoDiffSection({ diffs }: { diffs: DiffField[] }) {
  const changedDiffs = diffs.filter((d) => d.changed);

  if (changedDiffs.length === 0) {
    return (
      <div className="text-gray-500 dark:text-gray-400 text-sm italic">
        No changes to basic information
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {diffs.map((diff) => (
        <div
          key={diff.field}
          className={`p-3 rounded-lg border ${
            diff.changed
              ? 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10'
              : 'border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium text-gray-700 dark:text-gray-300">
              {diff.label}
            </span>
            {diff.changed && <ChangeTypeBadge type="modified" />}
          </div>
          {diff.changed ? (
            <div className="space-y-1 text-sm">
              <div>
                <span className="text-gray-500 mr-2">Before:</span>
                <DiffValue value={diff.old_value} isOld />
              </div>
              <div>
                <span className="text-gray-500 mr-2">After:</span>
                <DiffValue value={diff.new_value} />
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {String(diff.new_value) || '(empty)'}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function SLODiffSection({ diffs }: { diffs: SLODiff[] }) {
  if (diffs.length === 0) {
    return (
      <div className="text-gray-500 dark:text-gray-400 text-sm italic">
        No SLOs to compare
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {diffs.map((slo, index) => (
        <div
          key={slo.id || `slo-${index}`}
          className={`p-3 rounded-lg border ${
            slo.change_type === 'added'
              ? 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10'
              : slo.change_type === 'removed'
              ? 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10'
              : slo.change_type === 'modified'
              ? 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10'
              : 'border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium text-gray-700 dark:text-gray-300">
              SLO #{slo.sequence}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded">
                {slo.bloom_level}
              </span>
              <ChangeTypeBadge type={slo.change_type} />
            </div>
          </div>
          <div className="text-sm">
            {slo.change_type === 'modified' && slo.old_text && (
              <div className="mb-2">
                <span className="text-gray-500 mr-2">Before:</span>
                <DiffValue value={slo.old_text} isOld />
              </div>
            )}
            <div>
              {slo.change_type === 'modified' && (
                <span className="text-gray-500 mr-2">After:</span>
              )}
              <span
                className={
                  slo.change_type === 'removed'
                    ? 'line-through text-red-600 dark:text-red-400'
                    : slo.change_type === 'added'
                    ? 'text-green-700 dark:text-green-400'
                    : ''
                }
              >
                {slo.outcome_text}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ContentDiffSection({ diffs }: { diffs: ContentDiff[] }) {
  if (diffs.length === 0) {
    return (
      <div className="text-gray-500 dark:text-gray-400 text-sm italic">
        No content outline to compare
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {diffs.map((item, index) => (
        <div
          key={item.id || `content-${index}`}
          className={`p-3 rounded-lg border ${
            item.change_type === 'added'
              ? 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10'
              : item.change_type === 'removed'
              ? 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10'
              : item.change_type === 'modified'
              ? 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10'
              : 'border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <span className="text-gray-500 text-sm mr-2">
                {item.sequence}.
              </span>
              {item.change_type === 'modified' && item.old_topic && (
                <>
                  <DiffValue value={item.old_topic} isOld />
                  <span className="mx-2 text-gray-400">→</span>
                </>
              )}
              <span
                className={
                  item.change_type === 'removed'
                    ? 'line-through text-red-600 dark:text-red-400'
                    : item.change_type === 'added'
                    ? 'text-green-700 dark:text-green-400'
                    : ''
                }
              >
                {item.topic}
              </span>
            </div>
            <ChangeTypeBadge type={item.change_type} />
          </div>
        </div>
      ))}
    </div>
  );
}

function CBCodesDiffSection({ diffs }: { diffs: DiffField[] }) {
  const changedDiffs = diffs.filter((d) => d.changed);

  if (changedDiffs.length === 0) {
    return (
      <div className="text-gray-500 dark:text-gray-400 text-sm italic">
        No changes to CB codes
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
      {diffs
        .filter((d) => d.changed)
        .map((diff) => (
          <div
            key={diff.field}
            className="p-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10"
          >
            <div className="font-mono text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
              {diff.label}
            </div>
            <div className="text-xs">
              <span className="line-through text-red-600 dark:text-red-400 mr-1">
                {String(diff.old_value) || '—'}
              </span>
              <span className="mx-1">→</span>
              <span className="text-green-700 dark:text-green-400">
                {String(diff.new_value) || '—'}
              </span>
            </div>
          </div>
        ))}
    </div>
  );
}

// =============================================================================
// Version Selector Component
// =============================================================================

function VersionSelector({
  versions,
  selectedId,
  onSelect,
  label,
}: {
  versions: CourseListItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  label: string;
}) {
  return (
    <div className="flex-1">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}
      </label>
      <select
        value={selectedId}
        onChange={(e) => onSelect(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                   bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                   focus:ring-2 focus:ring-luminous-500 focus:border-luminous-500"
      >
        {versions.map((v) => (
          <option key={v.id} value={v.id}>
            v{v.id.slice(0, 8)}... - {v.status} - {new Date(v.updated_at).toLocaleDateString()}
          </option>
        ))}
      </select>
    </div>
  );
}

// =============================================================================
// Main Page Component
// =============================================================================

export default function CourseComparePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, getToken, isAuthenticated } = useAuth();

  const courseId = params.id as string;
  const compareWithId = searchParams.get('with');

  const [versions, setVersions] = useState<CourseListItem[]>([]);
  const [sourceId, setSourceId] = useState<string>(courseId);
  const [targetId, setTargetId] = useState<string>(compareWithId || '');
  const [comparison, setComparison] = useState<CourseCompareResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tokenReady, setTokenReady] = useState(false);

  // Set auth token
  useEffect(() => {
    async function setupToken() {
      const token = await getToken();
      if (token) {
        api.setToken(token);
        setTokenReady(true);
      }
    }
    if (isAuthenticated) {
      setupToken();
    }
  }, [isAuthenticated, getToken]);

  // Load versions
  useEffect(() => {
    async function loadVersions() {
      try {
        const versionList = await api.getCourseVersions(courseId);
        setVersions(versionList);

        // If no target specified, use the second version if available
        if (!targetId && versionList.length > 1) {
          const otherVersion = versionList.find((v) => v.id !== courseId);
          if (otherVersion) {
            setTargetId(otherVersion.id);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load versions');
      }
    }

    if (tokenReady) {
      loadVersions();
    }
  }, [courseId, tokenReady, targetId]);

  // Load comparison when both IDs are set
  useEffect(() => {
    async function loadComparison() {
      if (!sourceId || !targetId || sourceId === targetId) {
        setComparison(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const result = await api.compareCourses(sourceId, targetId);
        setComparison(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to compare courses');
      } finally {
        setLoading(false);
      }
    }

    if (tokenReady && sourceId && targetId) {
      loadComparison();
    }
  }, [sourceId, targetId, tokenReady]);

  // Swap versions
  const handleSwap = () => {
    const temp = sourceId;
    setSourceId(targetId);
    setTargetId(temp);
  };

  if (!user) {
    return (
      <PageShell>
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Please log in to view course comparisons.</div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link
            href={`/courses/${courseId}`}
            className="inline-flex items-center text-sm text-luminous-600 hover:text-luminous-700 dark:text-luminous-400 dark:hover:text-luminous-300 mb-4"
          >
            <ArrowLeftIcon className="w-4 h-4 mr-1" />
            Back to Course
          </Link>

          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <DocumentDuplicateIcon className="w-7 h-7 text-luminous-600 dark:text-luminous-400" />
            Compare Course Versions
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            View differences between two versions of this course.
          </p>
        </div>

        {/* Version Selectors */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-6">
          <div className="flex items-end gap-4">
            <VersionSelector
              versions={versions}
              selectedId={sourceId}
              onSelect={setSourceId}
              label="Source Version (Old)"
            />

            <button
              onClick={handleSwap}
              className="p-2 rounded-lg border border-gray-300 dark:border-gray-600
                         hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors mb-0.5"
              title="Swap versions"
            >
              <ArrowsRightLeftIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>

            <VersionSelector
              versions={versions}
              selectedId={targetId}
              onSelect={setTargetId}
              label="Target Version (New)"
            />
          </div>

          {sourceId === targetId && (
            <div className="mt-3 text-amber-600 dark:text-amber-400 text-sm">
              Please select two different versions to compare.
            </div>
          )}
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-6">
            <p className="text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-luminous-600"></div>
          </div>
        )}

        {/* Comparison Results */}
        {comparison && !loading && (
          <>
            {/* Summary */}
            <div
              className={`rounded-xl p-4 mb-6 ${
                comparison.has_changes
                  ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'
                  : 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
              }`}
            >
              <div className="flex items-center gap-2">
                {comparison.has_changes ? (
                  <PencilSquareIcon className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                ) : (
                  <CheckCircleIcon className="w-5 h-5 text-green-600 dark:text-green-400" />
                )}
                <span
                  className={
                    comparison.has_changes
                      ? 'text-amber-800 dark:text-amber-300'
                      : 'text-green-800 dark:text-green-300'
                  }
                >
                  {comparison.summary}
                </span>
              </div>
            </div>

            {/* Diff Sections */}
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  Basic Information
                </h2>
                <BasicInfoDiffSection diffs={comparison.basic_info_diff} />
              </div>

              {/* SLOs */}
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  Student Learning Outcomes
                </h2>
                <SLODiffSection diffs={comparison.slo_diff} />
              </div>

              {/* Content Outline */}
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  Course Content Outline
                </h2>
                <ContentDiffSection diffs={comparison.content_diff} />
              </div>

              {/* CB Codes */}
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  CB Codes (Compliance)
                </h2>
                <CBCodesDiffSection diffs={comparison.cb_codes_diff} />
              </div>
            </div>
          </>
        )}

        {/* No Comparison State */}
        {!comparison && !loading && !error && versions.length < 2 && (
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-8 text-center">
            <DocumentDuplicateIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
              No Versions to Compare
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              This course only has one version. Create a new version from an approved
              course to enable comparison.
            </p>
          </div>
        )}
      </div>
    </PageShell>
  );
}
