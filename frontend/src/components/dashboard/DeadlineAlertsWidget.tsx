'use client';

// ===========================================
// DeadlineAlertsWidget Component - Dashboard Widget
// ===========================================
// Shows stale drafts and stale review items that need attention
// Color-coded by urgency (amber for warning, red for critical)

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ExclamationTriangleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ArrowPathIcon,
  ExclamationCircleIcon,
  DocumentTextIcon,
  ClockIcon,
  CheckCircleIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { api, StaleItem, StaleItemsResponse, StaleItemUrgency } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

// ===========================================
// Helper Functions
// ===========================================

function getUrgencyStyles(urgency: StaleItemUrgency): { bg: string; text: string; icon: string } {
  switch (urgency) {
    case 'critical':
      return {
        bg: 'bg-red-100 dark:bg-red-900/30',
        text: 'text-red-700 dark:text-red-300',
        icon: 'text-red-500',
      };
    case 'warning':
    default:
      return {
        bg: 'bg-amber-100 dark:bg-amber-900/30',
        text: 'text-amber-700 dark:text-amber-300',
        icon: 'text-amber-500',
      };
  }
}

function formatDaysStale(days: number): string {
  if (days === 1) return '1 day';
  if (days < 7) return `${days} days`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? '1 week' : `${weeks} weeks`;
  }
  const months = Math.floor(days / 30);
  return months === 1 ? '1 month' : `${months} months`;
}

function formatStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    Draft: 'Draft',
    DeptReview: 'Dept Review',
    CurriculumCommittee: 'Committee',
    ArticulationReview: 'Articulation',
    Approved: 'Approved',
  };
  return labels[status] || status;
}

// ===========================================
// Stale Item Component
// ===========================================

interface StaleItemRowProps {
  item: StaleItem;
}

const StaleItemRow: React.FC<StaleItemRowProps> = ({ item }) => {
  const urgencyStyles = getUrgencyStyles(item.urgency);
  const courseCode = `${item.subject_code} ${item.course_number}`;

  return (
    <Link
      href={`/courses/${item.id}`}
      className="flex items-center justify-between py-3 px-2 -mx-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group"
    >
      <div className="flex items-start gap-3 flex-1 min-w-0">
        {/* Urgency Icon */}
        <div className={`flex-shrink-0 mt-0.5 ${urgencyStyles.icon}`}>
          {item.urgency === 'critical' ? (
            <ExclamationCircleIcon className="h-5 w-5" />
          ) : (
            <ExclamationTriangleIcon className="h-5 w-5" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-slate-900 dark:text-white">
              {courseCode}
            </span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${urgencyStyles.bg} ${urgencyStyles.text}`}>
              {formatStatusLabel(item.status)}
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 truncate mt-0.5">
            {item.title}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 flex items-center gap-1">
            <ClockIcon className="h-3 w-3" />
            Not updated for {formatDaysStale(item.days_stale)}
          </p>
        </div>
      </div>

      {/* Arrow */}
      <div className="flex-shrink-0 ml-2 text-slate-400 group-hover:text-luminous-500 transition-colors">
        <ChevronRightIcon className="h-5 w-5" />
      </div>
    </Link>
  );
};

// ===========================================
// Loading Skeleton
// ===========================================

const StaleItemsSkeleton: React.FC = () => (
  <div className="space-y-3">
    {[1, 2, 3].map((i) => (
      <div key={i} className="flex items-center gap-3 py-3 animate-pulse">
        <div className="flex-shrink-0 w-5 h-5 rounded bg-slate-200 dark:bg-slate-700" />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <div className="h-4 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-5 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
          </div>
          <div className="h-3 w-40 bg-slate-200 dark:bg-slate-700 rounded mt-2" />
          <div className="h-2 w-24 bg-slate-200 dark:bg-slate-700 rounded mt-2" />
        </div>
        <div className="h-5 w-5 bg-slate-200 dark:bg-slate-700 rounded" />
      </div>
    ))}
  </div>
);

// ===========================================
// Empty State Component
// ===========================================

const EmptyState: React.FC = () => (
  <div className="text-center py-6">
    <CheckCircleIcon className="h-10 w-10 mx-auto text-green-400 dark:text-green-500 mb-3" />
    <p className="text-sm text-slate-500 dark:text-slate-400">
      All caught up!
    </p>
    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
      No overdue or stale items
    </p>
  </div>
);

// ===========================================
// Section Component
// ===========================================

interface StaleSectionProps {
  title: string;
  items: StaleItem[];
  icon: React.ComponentType<{ className?: string }>;
}

const StaleSection: React.FC<StaleSectionProps> = ({ title, items, icon: Icon }) => {
  if (items.length === 0) return null;

  return (
    <div className="mb-4 last:mb-0">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-slate-400" />
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {title}
        </h3>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          ({items.length})
        </span>
      </div>
      <div className="divide-y divide-slate-200 dark:divide-slate-700">
        {items.map((item) => (
          <StaleItemRow key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
};

// ===========================================
// DeadlineAlertsWidget Component
// ===========================================

interface DeadlineAlertsWidgetProps {
  defaultExpanded?: boolean;
  draftThresholdDays?: number;
  reviewThresholdDays?: number;
}

export const DeadlineAlertsWidget: React.FC<DeadlineAlertsWidgetProps> = ({
  defaultExpanded = true,
  draftThresholdDays = 30,
  reviewThresholdDays = 7,
}) => {
  const { getToken } = useAuth();
  const [data, setData] = useState<StaleItemsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(defaultExpanded);

  // Fetch stale items
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getToken();
      if (token) {
        api.setToken(token);
      }

      const response = await api.getStaleItems({
        draft_threshold_days: draftThresholdDays,
        review_threshold_days: reviewThresholdDays,
      });
      setData(response);
    } catch (err) {
      console.error('Failed to fetch stale items:', err);
      setError('Failed to load deadline alerts');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [getToken, draftThresholdDays, reviewThresholdDays]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalCount = data?.total_count ?? 0;
  const hasCritical = data?.stale_drafts.some(i => i.urgency === 'critical') ||
                      data?.stale_reviews.some(i => i.urgency === 'critical');

  return (
    <div className="luminous-card">
      {/* Header with expand/collapse toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-2">
          <ExclamationTriangleIcon className={`h-5 w-5 ${hasCritical ? 'text-red-500' : totalCount > 0 ? 'text-amber-500' : 'text-slate-400'}`} />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Deadline Alerts
          </h2>
          {loading && (
            <ArrowPathIcon className="h-4 w-4 text-slate-400 animate-spin" />
          )}
        </div>
        <div className="flex items-center gap-2">
          {!loading && totalCount > 0 && (
            <span className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
              hasCritical
                ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200'
                : 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200'
            }`}>
              {totalCount} {totalCount === 1 ? 'item' : 'items'}
            </span>
          )}
          {expanded ? (
            <ChevronUpIcon className="h-5 w-5 text-slate-400" />
          ) : (
            <ChevronDownIcon className="h-5 w-5 text-slate-400" />
          )}
        </div>
      </button>

      {/* Expandable content */}
      {expanded && (
        <div className="mt-4">
          {error && (
            <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center gap-2 text-amber-700 dark:text-amber-400 text-sm">
              <ExclamationCircleIcon className="h-5 w-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <StaleItemsSkeleton />
          ) : totalCount > 0 ? (
            <>
              <StaleSection
                title="Stale Drafts"
                items={data?.stale_drafts ?? []}
                icon={DocumentTextIcon}
              />
              <StaleSection
                title="Stale Reviews"
                items={data?.stale_reviews ?? []}
                icon={ClockIcon}
              />
            </>
          ) : (
            <EmptyState />
          )}
        </div>
      )}
    </div>
  );
};

export default DeadlineAlertsWidget;
