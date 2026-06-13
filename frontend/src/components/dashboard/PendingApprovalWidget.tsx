'use client';

// ===========================================
// PendingApprovalWidget Component - Dashboard Widget
// ===========================================
// Displays items pending the current user's approval
// Only visible to reviewer roles (CurriculumChair, ArticulationOfficer, Admin)

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ClockIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ArrowPathIcon,
  ExclamationCircleIcon,
  UserCircleIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { api, ApprovalQueueItem, ApprovalCountsResponse, CourseStatus } from '@/lib/api';
import { useAuth, UserProfile } from '@/contexts/AuthContext';

// ===========================================
// Helper Functions
// ===========================================

function isReviewer(role: UserProfile['role']): boolean {
  return ['CurriculumChair', 'ArticulationOfficer', 'Admin'].includes(role);
}

function getStatusBadgeClasses(status: CourseStatus): string {
  const config: Record<CourseStatus, string> = {
    Draft: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    DeptReview: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200',
    CurriculumCommittee: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
    ArticulationReview: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200',
    Approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
  };
  return config[status] || config.Draft;
}

function formatStatusLabel(status: CourseStatus): string {
  const labels: Record<CourseStatus, string> = {
    Draft: 'Draft',
    DeptReview: 'Dept Review',
    CurriculumCommittee: 'Committee',
    ArticulationReview: 'Articulation',
    Approved: 'Approved',
  };
  return labels[status] || status;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      return diffMinutes <= 1 ? 'Just now' : `${diffMinutes}m ago`;
    }
    return `${diffHours}h ago`;
  }
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ===========================================
// Approval Item Component
// ===========================================

interface ApprovalItemProps {
  item: ApprovalQueueItem;
}

const ApprovalItem: React.FC<ApprovalItemProps> = ({ item }) => {
  const courseCode = `${item.subject_code} ${item.course_number}`;

  return (
    <Link
      href={`/courses/${item.id}`}
      className="flex items-center justify-between py-3 px-2 -mx-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-900 dark:text-white truncate">
            {courseCode}
          </span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getStatusBadgeClasses(item.status)}`}>
            {formatStatusLabel(item.status)}
          </span>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 truncate mt-0.5">
          {item.title}
        </p>
        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 dark:text-slate-400">
          {item.submitter && (
            <span className="flex items-center gap-1">
              <UserCircleIcon className="h-3 w-3" />
              {item.submitter.full_name}
            </span>
          )}
          <span className="flex items-center gap-1">
            <ClockIcon className="h-3 w-3" />
            {formatRelativeTime(item.submitted_at)}
          </span>
        </div>
      </div>
      <div className="flex-shrink-0 ml-2 text-slate-400 dark:text-slate-500 group-hover:text-luminous-500 transition-colors">
        <ChevronRightIcon className="h-5 w-5" />
      </div>
    </Link>
  );
};

// ===========================================
// Loading Skeleton
// ===========================================

const ApprovalsSkeleton: React.FC = () => (
  <div className="space-y-3">
    {[1, 2, 3].map((i) => (
      <div key={i} className="flex items-center justify-between py-3 animate-pulse">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <div className="h-4 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-5 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
          </div>
          <div className="h-3 w-40 bg-slate-200 dark:bg-slate-700 rounded mt-2" />
          <div className="h-2 w-32 bg-slate-200 dark:bg-slate-700 rounded mt-2" />
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
    <ClockIcon className="h-10 w-10 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
    <p className="text-sm text-slate-600 dark:text-slate-400">
      No items pending your review.
    </p>
  </div>
);

// ===========================================
// PendingApprovalWidget Component
// ===========================================

interface PendingApprovalWidgetProps {
  limit?: number;
  defaultExpanded?: boolean;
}

export const PendingApprovalWidget: React.FC<PendingApprovalWidgetProps> = ({
  limit = 5,
  defaultExpanded = true,
}) => {
  const { user, getToken } = useAuth();
  const [items, setItems] = useState<ApprovalQueueItem[]>([]);
  const [count, setCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(defaultExpanded);

  // Don't render anything if user is not a reviewer
  const canReview = user && isReviewer(user.role);

  useEffect(() => {
    const fetchData = async () => {
      if (!canReview) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const token = await getToken();
        if (token) {
          api.setToken(token);
        }

        // Fetch counts and items in parallel
        const [countsData, itemsData] = await Promise.all([
          api.getApprovalCounts(),
          api.listPendingApprovals({ tab: 'my_review', limit }),
        ]);

        setCount(countsData.pending_my_review);
        setItems(itemsData.items);
      } catch (err) {
        console.error('Failed to fetch pending approvals:', err);
        setError('Failed to load approvals');
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [canReview, getToken, limit]);

  // Don't render the widget if user is not a reviewer
  if (!canReview) {
    return null;
  }

  return (
    <div className="luminous-card">
      {/* Header with expand/collapse toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-2">
          <ClockIcon className="h-5 w-5 text-amber-500" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Pending My Approval
          </h2>
          {loading && (
            <ArrowPathIcon className="h-4 w-4 text-slate-400 animate-spin" />
          )}
        </div>
        <div className="flex items-center gap-2">
          {!loading && count > 0 && (
            <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
              {count}
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
            <ApprovalsSkeleton />
          ) : items.length > 0 ? (
            <>
              <div className="divide-y divide-slate-200 dark:divide-slate-700">
                {items.map((item) => (
                  <ApprovalItem key={item.id} item={item} />
                ))}
              </div>

              {/* View All link */}
              {count > items.length && (
                <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                  <Link
                    href="/approvals"
                    className="text-sm font-medium text-luminous-600 hover:text-luminous-700 dark:text-luminous-400 dark:hover:text-luminous-300"
                  >
                    View all {count} pending items →
                  </Link>
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

export default PendingApprovalWidget;
