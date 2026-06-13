'use client';

// ===========================================
// Approval Queue Page
// ===========================================
// Displays courses and programs pending approval
// Role-based: only visible to reviewers (CurriculumChair, ArticulationOfficer, Admin)

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  CheckCircleIcon,
  ClockIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  ExclamationCircleIcon,
  DocumentTextIcon,
  UserCircleIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { PageShell } from '@/components/layout';
import { EmptyApprovalsState } from '@/components/empty-state';
import { useAuth, UserProfile } from '@/contexts/AuthContext';
import { api, ApprovalQueueItem, ApprovalCountsResponse, CourseStatus } from '@/lib/api';

// ===========================================
// Types
// ===========================================

type TabType = 'my_review' | 'all_pending' | 'recently_reviewed';

interface TabConfig {
  id: TabType;
  name: string;
  countKey: keyof ApprovalCountsResponse;
  icon: React.ComponentType<{ className?: string }>;
  emptyMessage: string;
}

// ===========================================
// Tab Configuration
// ===========================================

const TABS: TabConfig[] = [
  {
    id: 'my_review',
    name: 'Pending My Review',
    countKey: 'pending_my_review',
    icon: ClockIcon,
    emptyMessage: 'No items are currently pending your review.',
  },
  {
    id: 'all_pending',
    name: 'All Pending',
    countKey: 'all_pending',
    icon: DocumentTextIcon,
    emptyMessage: 'No items are pending approval.',
  },
  {
    id: 'recently_reviewed',
    name: 'Recently Reviewed',
    countKey: 'recently_reviewed',
    icon: CheckCircleIcon,
    emptyMessage: 'You haven\'t reviewed any items in the last 7 days.',
  },
];

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
    CurriculumCommittee: 'Curriculum Committee',
    ArticulationReview: 'Articulation Review',
    Approved: 'Approved',
  };
  return labels[status] || status;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
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
      return diffMinutes <= 1 ? 'Just now' : `${diffMinutes} minutes ago`;
    }
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  }
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return formatDate(dateString);
}

// ===========================================
// Tab Button Component
// ===========================================

function TabButton({
  tab,
  isActive,
  count,
  onClick,
}: {
  tab: TabConfig;
  isActive: boolean;
  count: number;
  onClick: () => void;
}) {
  const Icon = tab.icon;

  return (
    <button
      onClick={onClick}
      className={`
        relative flex items-center gap-2 px-4 py-3 text-sm font-medium rounded-lg transition-colors
        ${
          isActive
            ? 'bg-luminous-100 text-luminous-700 dark:bg-luminous-900/30 dark:text-luminous-300'
            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
        }
      `}
    >
      <Icon className="h-5 w-5" />
      <span>{tab.name}</span>
      {count > 0 && (
        <span
          className={`
            ml-1 px-2 py-0.5 text-xs font-semibold rounded-full
            ${
              isActive
                ? 'bg-luminous-200 text-luminous-800 dark:bg-luminous-800 dark:text-luminous-200'
                : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
            }
          `}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ===========================================
// Queue Item Card Component
// ===========================================

function QueueItemCard({ item, canReview }: { item: ApprovalQueueItem; canReview: boolean }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-all hover:shadow-md hover:border-luminous-300 dark:hover:border-luminous-700 group">
      <Link href={`/courses/${item.id}`} className="block">
        <div className="flex items-start justify-between gap-4">
          {/* Left side: Course info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <span className="text-lg font-bold text-luminous-600 dark:text-luminous-400">
                {item.subject_code} {item.course_number}
              </span>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClasses(
                  item.status
                )}`}
              >
                {formatStatusLabel(item.status)}
              </span>
            </div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white truncate">
              {item.title}
            </h3>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-slate-500 dark:text-slate-400">
              {item.department && (
                <span className="shrink-0">{item.department.name}</span>
              )}
              {item.submitter && (
                <span className="flex items-center gap-1 shrink-0">
                  <UserCircleIcon className="h-4 w-4" />
                  {item.submitter.full_name}
                </span>
              )}
              <span className="flex items-center gap-1 shrink-0">
                <ClockIcon className="h-4 w-4" />
                {formatRelativeTime(item.submitted_at)}
              </span>
            </div>
          </div>

          {/* Right side: Action indicator */}
          <div className="flex items-center text-slate-400 dark:text-slate-500 group-hover:text-luminous-500 transition-colors shrink-0">
            <span className="text-sm mr-2 hidden sm:inline">{canReview ? 'Review' : 'View'}</span>
            <ChevronRightIcon className="h-5 w-5" />
          </div>
        </div>
      </Link>
    </div>
  );
}

// ===========================================
// Read-Only Notice Component
// ===========================================

function ReadOnlyNotice() {
  return (
    <div className="mb-6 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
      <div className="flex items-start gap-3">
        <ExclamationCircleIcon className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
            View-Only Mode
          </p>
          <p className="text-sm text-blue-600 dark:text-blue-400 mt-0.5">
            You can view pending courses, but only Curriculum Chairs, Articulation Officers, and Administrators can take review actions.
          </p>
        </div>
      </div>
    </div>
  );
}

// ===========================================
// Main Component
// ===========================================

export default function ApprovalsPage() {
  const router = useRouter();
  const { user, getToken, loading: authLoading } = useAuth();

  const [activeTab, setActiveTab] = useState<TabType>('my_review');
  const [searchQuery, setSearchQuery] = useState('');
  const [items, setItems] = useState<ApprovalQueueItem[]>([]);
  const [counts, setCounts] = useState<ApprovalCountsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch approval counts
  const fetchCounts = useCallback(async () => {
    try {
      const token = await getToken();
      if (token) {
        api.setToken(token);
      }
      const data = await api.getApprovalCounts();
      setCounts(data);
    } catch (err) {
      console.error('Failed to fetch approval counts:', err);
    }
  }, [getToken]);

  // Fetch queue items
  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getToken();
      if (token) {
        api.setToken(token);
      }
      const data = await api.listPendingApprovals({
        tab: activeTab,
        search: searchQuery || undefined,
      });
      setItems(data.items);
    } catch (err) {
      console.error('Failed to fetch approvals:', err);
      setError(err instanceof Error ? err.message : 'Failed to load approvals');
    } finally {
      setLoading(false);
    }
  }, [getToken, activeTab, searchQuery]);

  // Check if user can take review actions
  const canReview = user ? isReviewer(user.role) : false;

  // Fetch data on mount and when filters change
  useEffect(() => {
    if (user) {
      fetchCounts();
      fetchItems();
    }
  }, [user, fetchCounts, fetchItems]);

  // Handle search with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (user) {
        fetchItems();
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, user, fetchItems]);

  // Show loading during auth check
  if (authLoading) {
    return (
      <PageShell>
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-luminous-500" />
        </div>
      </PageShell>
    );
  }

  // Require authentication
  if (!user) {
    return (
      <PageShell>
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <ExclamationCircleIcon className="h-16 w-16 mx-auto text-yellow-500 mb-4" />
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
            Authentication Required
          </h2>
          <p className="text-slate-600 dark:text-slate-400">
            Please log in to view the approval queue.
          </p>
        </div>
      </PageShell>
    );
  }

  const currentTab = TABS.find((t) => t.id === activeTab) || TABS[0];

  return (
    <PageShell>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {canReview ? 'Approval Queue' : 'Pending Reviews'}
          </h1>
          <p className="mt-1 text-slate-600 dark:text-slate-400">
            {canReview
              ? 'Review and approve courses and programs pending your attention'
              : 'View courses and programs currently awaiting review'}
          </p>
        </div>

        {/* Read-only notice for non-reviewers */}
        {!canReview && <ReadOnlyNotice />}

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          {TABS.map((tab) => (
            <TabButton
              key={tab.id}
              tab={tab}
              isActive={activeTab === tab.id}
              count={counts?.[tab.countKey] || 0}
              onClick={() => setActiveTab(tab.id)}
            />
          ))}
        </div>

        {/* Search and Refresh */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by course title or number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="luminous-input pl-10 w-full"
            />
          </div>
          <button
            onClick={() => {
              fetchCounts();
              fetchItems();
            }}
            disabled={loading}
            className="luminous-button-secondary flex items-center gap-2"
          >
            <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <ExclamationCircleIcon className="h-5 w-5" />
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Queue Items */}
        <div className="space-y-4">
          {loading ? (
            // Loading skeletons
            <>
              {[1, 2, 3].map((i) => (
                <div key={i} className="luminous-card animate-pulse">
                  <div className="flex items-start gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="h-6 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
                        <div className="h-5 w-20 bg-slate-200 dark:bg-slate-700 rounded-full" />
                      </div>
                      <div className="h-5 w-64 bg-slate-200 dark:bg-slate-700 rounded mb-2" />
                      <div className="h-4 w-48 bg-slate-200 dark:bg-slate-700 rounded" />
                    </div>
                  </div>
                </div>
              ))}
            </>
          ) : items.length === 0 ? (
            <EmptyApprovalsState message={currentTab.emptyMessage} />
          ) : (
            items.map((item) => (
              <QueueItemCard key={item.id} item={item} canReview={canReview} />
            ))
          )}
        </div>
      </div>
    </PageShell>
  );
}
