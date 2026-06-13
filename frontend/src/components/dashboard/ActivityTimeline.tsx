'use client';

// ===========================================
// ActivityTimeline Component - Dashboard Widget
// ===========================================
// Full activity timeline with pagination and filtering
// Shows workflow changes with actor names and time

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ClockIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ArrowPathIcon,
  ExclamationCircleIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  ArrowUturnLeftIcon,
  PaperAirplaneIcon,
  PencilSquareIcon,
  UserCircleIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';
import { api, DashboardActivityItem, DashboardActivityType } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

// ===========================================
// Helper Functions
// ===========================================

function getActivityIcon(type: DashboardActivityType) {
  switch (type) {
    case 'approved':
      return CheckCircleIcon;
    case 'returned':
      return ArrowUturnLeftIcon;
    case 'submitted':
      return PaperAirplaneIcon;
    case 'created':
      return DocumentTextIcon;
    case 'updated':
    default:
      return PencilSquareIcon;
  }
}

function getActivityColor(type: DashboardActivityType): string {
  switch (type) {
    case 'approved':
      return 'text-green-600 bg-green-100 dark:bg-green-900/50 dark:text-green-400';
    case 'returned':
      return 'text-red-600 bg-red-100 dark:bg-red-900/50 dark:text-red-400';
    case 'submitted':
      return 'text-blue-600 bg-blue-100 dark:bg-blue-900/50 dark:text-blue-400';
    case 'created':
      return 'text-purple-600 bg-purple-100 dark:bg-purple-900/50 dark:text-purple-400';
    case 'updated':
    default:
      return 'text-slate-600 bg-slate-100 dark:bg-slate-700 dark:text-slate-400';
  }
}

function formatAbsoluteTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ===========================================
// Activity Item Component
// ===========================================

interface ActivityItemProps {
  activity: DashboardActivityItem;
}

const ActivityItem: React.FC<ActivityItemProps> = ({ activity }) => {
  const Icon = getActivityIcon(activity.type);
  const colorClass = getActivityColor(activity.type);
  const [showAbsoluteTime, setShowAbsoluteTime] = useState(false);

  return (
    <Link
      href={`/courses/${activity.course_id}`}
      className="flex items-start gap-4 py-4 px-2 -mx-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group"
    >
      {/* Icon */}
      <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${colorClass}`}>
        <Icon className="w-5 h-5" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 dark:text-white">
          {activity.title}
        </p>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
          {activity.description}
        </p>
        <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 dark:text-slate-400">
          {activity.actor_name && (
            <span className="flex items-center gap-1">
              <UserCircleIcon className="h-3.5 w-3.5" />
              {activity.actor_name}
            </span>
          )}
          <span
            className="flex items-center gap-1 cursor-help"
            onMouseEnter={() => setShowAbsoluteTime(true)}
            onMouseLeave={() => setShowAbsoluteTime(false)}
            title={formatAbsoluteTime(activity.created_at)}
          >
            <ClockIcon className="h-3.5 w-3.5" />
            {showAbsoluteTime ? formatAbsoluteTime(activity.created_at) : activity.time}
          </span>
        </div>
      </div>
    </Link>
  );
};

// ===========================================
// Loading Skeleton
// ===========================================

const ActivitySkeleton: React.FC = () => (
  <div className="space-y-4">
    {[1, 2, 3].map((i) => (
      <div key={i} className="flex items-start gap-4 py-4 animate-pulse">
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700" />
        <div className="flex-1">
          <div className="h-4 w-48 bg-slate-200 dark:bg-slate-700 rounded mb-2" />
          <div className="h-3 w-32 bg-slate-200 dark:bg-slate-700 rounded mb-2" />
          <div className="h-3 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
        </div>
      </div>
    ))}
  </div>
);

// ===========================================
// Empty State Component
// ===========================================

const EmptyState: React.FC = () => (
  <div className="text-center py-8">
    <ClockIcon className="h-12 w-12 mx-auto text-slate-300 dark:text-slate-600 mb-4" />
    <p className="text-slate-500 dark:text-slate-400">
      No activity to display.
    </p>
    <p className="text-sm text-slate-400 dark:text-slate-500 mt-2">
      Start by creating a new Course Outline of Record.
    </p>
  </div>
);

// ===========================================
// Filter Chips Component
// ===========================================

interface FilterChipsProps {
  selectedFilter: DashboardActivityType | null;
  onFilterChange: (filter: DashboardActivityType | null) => void;
}

const FilterChips: React.FC<FilterChipsProps> = ({ selectedFilter, onFilterChange }) => {
  const filters: { type: DashboardActivityType | null; label: string }[] = [
    { type: null, label: 'All' },
    { type: 'submitted', label: 'Submitted' },
    { type: 'approved', label: 'Approved' },
    { type: 'returned', label: 'Returned' },
    { type: 'updated', label: 'Updated' },
  ];

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <FunnelIcon className="h-4 w-4 text-slate-400" />
      {filters.map((filter) => (
        <button
          key={filter.type ?? 'all'}
          onClick={() => onFilterChange(filter.type)}
          className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors ${
            selectedFilter === filter.type
              ? 'bg-luminous-100 text-luminous-700 dark:bg-luminous-900/50 dark:text-luminous-300'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
          }`}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
};

// ===========================================
// ActivityTimeline Component
// ===========================================

interface ActivityTimelineProps {
  initialLimit?: number;
  loadMoreIncrement?: number;
  defaultExpanded?: boolean;
  showFilters?: boolean;
}

export const ActivityTimeline: React.FC<ActivityTimelineProps> = ({
  initialLimit = 10,
  loadMoreIncrement = 10,
  defaultExpanded = true,
  showFilters = true,
}) => {
  const { getToken } = useAuth();
  const [activities, setActivities] = useState<DashboardActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState<DashboardActivityType | null>(null);

  // Fetch activities
  const fetchActivities = useCallback(async (
    currentOffset: number = 0,
    append: boolean = false,
  ) => {
    try {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const token = await getToken();
      if (token) {
        api.setToken(token);
      }

      const data = await api.getDashboardActivity({
        limit: append ? loadMoreIncrement : initialLimit,
        offset: currentOffset,
        activity_type: filter ?? undefined,
      });

      if (append) {
        setActivities((prev) => [...prev, ...data.items]);
      } else {
        setActivities(data.items);
      }
      setHasMore(data.has_more);
      setTotal(data.total);
      setOffset(currentOffset + data.items.length);
    } catch (err) {
      console.error('Failed to fetch activity:', err);
      setError('Failed to load activity');
      if (!append) {
        setActivities([]);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [getToken, initialLimit, loadMoreIncrement, filter]);

  // Initial fetch and refetch on filter change
  useEffect(() => {
    setOffset(0);
    fetchActivities(0, false);
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle filter change
  const handleFilterChange = (newFilter: DashboardActivityType | null) => {
    setFilter(newFilter);
  };

  // Handle load more
  const handleLoadMore = () => {
    fetchActivities(offset, true);
  };

  return (
    <div className="luminous-card">
      {/* Header with expand/collapse toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-2">
          <ClockIcon className="h-5 w-5 text-slate-500" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Activity Timeline
          </h2>
          {(loading || loadingMore) && (
            <ArrowPathIcon className="h-4 w-4 text-slate-400 animate-spin" />
          )}
        </div>
        <div className="flex items-center gap-2">
          {!loading && total > 0 && (
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {total} total
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

          {/* Filters */}
          {showFilters && !loading && activities.length > 0 && (
            <div className="mb-4">
              <FilterChips selectedFilter={filter} onFilterChange={handleFilterChange} />
            </div>
          )}

          {loading ? (
            <ActivitySkeleton />
          ) : activities.length > 0 ? (
            <>
              <div className="divide-y divide-slate-200 dark:divide-slate-700">
                {activities.map((activity) => (
                  <ActivityItem key={activity.id} activity={activity} />
                ))}
              </div>

              {/* Load More button */}
              {hasMore && (
                <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                  <button
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="w-full py-2 text-sm font-medium text-luminous-600 hover:text-luminous-700 dark:text-luminous-400 dark:hover:text-luminous-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {loadingMore ? (
                      <>
                        <ArrowPathIcon className="h-4 w-4 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>Load more activity</>
                    )}
                  </button>
                </div>
              )}

              {/* Showing count */}
              {!hasMore && activities.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-200 dark:divide-slate-700 text-center">
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    Showing all {activities.length} activities
                  </span>
                </div>
              )}
            </>
          ) : (
            <EmptyState />
          )}
        </div>
      )}
    </div>
  );
};

export default ActivityTimeline;
