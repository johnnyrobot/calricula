'use client';

// ===========================================
// Dashboard Page - Main Application Entry
// ===========================================
// Shows welcome message, stats cards, and activity timeline
// Fetches real data from /api/dashboard/stats and /api/dashboard/activity

import { useState, useEffect } from 'react';
import {
  DocumentTextIcon,
  ClockIcon,
  CheckBadgeIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';
import { PageShell } from '@/components/layout';
import { MyCoursesList, PendingApprovalWidget, NotificationsWidget, ActivityTimeline, DeadlineAlertsWidget, QuickSearchWidget, DepartmentAnalyticsWidget } from '@/components/dashboard';
import { useAuth } from '@/contexts/AuthContext';
import { api, DashboardStatsResponse } from '@/lib/api';

// ===========================================
// Stats Card Component
// ===========================================

interface StatsCardProps {
  title: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  iconBgColor: string;
  iconColor: string;
  href?: string;
  loading?: boolean;
}

const StatsCard: React.FC<StatsCardProps> = ({
  title,
  value,
  icon: Icon,
  iconBgColor,
  iconColor,
  href,
  loading = false,
}) => {
  const content = (
    <div className="luminous-card group cursor-pointer hover:shadow-md transition-shadow">
      <div className="flex items-center gap-4">
        <div className={`flex items-center justify-center w-12 h-12 rounded-lg ${iconBgColor}`}>
          <Icon className={`h-6 w-6 ${iconColor}`} />
        </div>
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">{title}</p>
          {loading ? (
            <div className="h-8 w-12 bg-slate-200 dark:bg-slate-700 animate-pulse rounded" />
          ) : (
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
          )}
        </div>
      </div>
    </div>
  );

  if (href) {
    return <a href={href}>{content}</a>;
  }
  return content;
};

// ===========================================
// Quick Action Button Component
// ===========================================

interface QuickActionProps {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  primary?: boolean;
}

const QuickAction: React.FC<QuickActionProps> = ({
  title,
  description,
  icon: Icon,
  href,
  primary = false,
}) => {
  return (
    <a
      href={href}
      className={`block p-4 rounded-lg border-2 border-dashed transition-all hover:border-solid ${
        primary
          ? 'border-luminous-300 dark:border-luminous-700 hover:border-luminous-500 hover:bg-luminous-50 dark:hover:bg-luminous-950'
          : 'border-slate-300 dark:border-slate-600 hover:border-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-1 ${primary ? 'text-luminous-600' : 'text-slate-500'}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h3 className={`font-medium ${primary ? 'text-luminous-700 dark:text-luminous-400' : 'text-slate-700 dark:text-slate-300'}`}>
            {title}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {description}
          </p>
        </div>
      </div>
    </a>
  );
};

// ===========================================
// Dashboard Page Component
// ===========================================

export default function DashboardPage() {
  const { user, getToken } = useAuth();

  // State for stats
  const [stats, setStats] = useState<DashboardStatsResponse | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  // Get display name for welcome message
  // Handle honorific prefixes like "Dr." by using the second word if first is a prefix
  const getDisplayName = (fullName?: string): string => {
    if (!fullName) return 'User';
    const parts = fullName.trim().split(' ');
    const prefixes = ['Dr.', 'Dr', 'Prof.', 'Prof', 'Mr.', 'Mr', 'Mrs.', 'Mrs', 'Ms.', 'Ms'];
    if (parts.length > 1 && prefixes.includes(parts[0])) {
      return parts[1]; // Return first name after prefix
    }
    return parts[0]; // Return first word
  };
  const displayName = getDisplayName(user?.full_name);

  // Fetch dashboard stats
  useEffect(() => {
    const fetchStats = async () => {
      try {
        setStatsLoading(true);
        setStatsError(null);
        const token = await getToken();
        if (token) {
          api.setToken(token);
        }
        const data = await api.getDashboardStats();
        setStats(data);
      } catch (err) {
        console.error('Failed to fetch dashboard stats:', err);
        setStatsError('Failed to load stats');
        // Fallback to zeros
        setStats({ my_drafts: 0, pending_review: 0, recently_approved: 0 });
      } finally {
        setStatsLoading(false);
      }
    };

    fetchStats();
  }, [getToken]);

  return (
    <PageShell>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            Welcome back, {displayName}!
          </h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            Here's an overview of your curriculum work.
          </p>
        </div>

        {/* Quick Search */}
        <div className="mb-8 max-w-xl">
          <QuickSearchWidget placeholder="Search courses and programs..." />
        </div>

        {/* Stats Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <StatsCard
            title="My Drafts"
            value={stats?.my_drafts ?? 0}
            icon={DocumentTextIcon}
            iconBgColor="bg-luminous-100 dark:bg-luminous-900"
            iconColor="text-luminous-600 dark:text-luminous-400"
            href="/courses?status=Draft"
            loading={statsLoading}
          />
          <StatsCard
            title="Pending Review"
            value={stats?.pending_review ?? 0}
            icon={ClockIcon}
            iconBgColor="bg-amber-100 dark:bg-amber-900"
            iconColor="text-amber-600 dark:text-amber-400"
            href="/approvals"
            loading={statsLoading}
          />
          <StatsCard
            title="Recently Approved"
            value={stats?.recently_approved ?? 0}
            icon={CheckBadgeIcon}
            iconBgColor="bg-green-100 dark:bg-green-900"
            iconColor="text-green-600 dark:text-green-400"
            href="/courses?status=Approved"
            loading={statsLoading}
          />
        </div>

        {statsError && (
          <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center gap-2 text-amber-700 dark:text-amber-400 text-sm">
            <ExclamationCircleIcon className="h-5 w-5 flex-shrink-0" />
            <span>{statsError}</span>
          </div>
        )}

        {/* Department Analytics Section */}
        <div className="mb-8">
          <DepartmentAnalyticsWidget defaultExpanded={true} />
        </div>

        {/* Notifications Section */}
        <div className="mb-8">
          <NotificationsWidget limit={5} defaultExpanded={true} />
        </div>

        {/* My Courses Section */}
        <div className="mb-8">
          <MyCoursesList limit={5} defaultExpanded={true} />
        </div>

        {/* Pending Approvals Section - Only visible to reviewers */}
        <div className="mb-8">
          <PendingApprovalWidget limit={5} defaultExpanded={true} />
        </div>

        {/* Deadline Alerts Section */}
        <div className="mb-8">
          <DeadlineAlertsWidget defaultExpanded={true} />
        </div>

        {/* Activity Timeline - Full Width */}
        <ActivityTimeline
          initialLimit={5}
          loadMoreIncrement={5}
          defaultExpanded={true}
          showFilters={true}
        />

      </div>
    </PageShell>
  );
}
