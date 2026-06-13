'use client';

// ===========================================
// DepartmentAnalyticsWidget Component - Dashboard Widget
// ===========================================
// Shows department-level statistics for curriculum work
// Adapts based on user role (admin, chair, faculty)

import { useState, useEffect, useCallback } from 'react';
import {
  ChartBarIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ArrowPathIcon,
  ExclamationCircleIcon,
  CheckCircleIcon,
  ClockIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';
import { api, DepartmentAnalyticsResponse, CoursesByStatusItem } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

// ===========================================
// Helper Functions
// ===========================================

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    Draft: 'bg-slate-400',
    DeptReview: 'bg-yellow-500',
    CurriculumCommittee: 'bg-blue-500',
    ArticulationReview: 'bg-purple-500',
    Approved: 'bg-green-500',
  };
  return colors[status] || 'bg-slate-400';
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
// Status Bar Component (Simple Bar Chart)
// ===========================================

interface StatusBarProps {
  items: CoursesByStatusItem[];
  totalCourses: number;
}

const StatusBar: React.FC<StatusBarProps> = ({ items, totalCourses }) => {
  if (totalCourses === 0) return null;

  return (
    <div className="space-y-2">
      {/* Stacked Bar */}
      <div className="flex h-4 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700">
        {items.map((item, index) => (
          <div
            key={item.status}
            className={`${getStatusColor(item.status)} transition-all duration-500`}
            style={{ width: `${item.percentage}%` }}
            title={`${formatStatusLabel(item.status)}: ${item.count} (${item.percentage}%)`}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {items.map((item) => (
          <div key={item.status} className="flex items-center gap-1.5 text-xs">
            <div className={`w-2.5 h-2.5 rounded-full ${getStatusColor(item.status)}`} />
            <span className="text-slate-600 dark:text-slate-400">
              {formatStatusLabel(item.status)}
            </span>
            <span className="text-slate-500 dark:text-slate-500">
              ({item.count})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ===========================================
// Stat Card Component
// ===========================================

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  subtext?: string;
}

const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  icon: Icon,
  iconColor,
  subtext,
}) => (
  <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
    <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${iconColor}`}>
      <Icon className="h-5 w-5" />
    </div>
    <div>
      <p className="text-lg font-semibold text-slate-900 dark:text-white">
        {value}
      </p>
      <p className="text-xs text-slate-600 dark:text-slate-400">{label}</p>
      {subtext && (
        <p className="text-xs text-slate-500 dark:text-slate-400">{subtext}</p>
      )}
    </div>
  </div>
);

// ===========================================
// Loading Skeleton
// ===========================================

const AnalyticsSkeleton: React.FC = () => (
  <div className="space-y-4 animate-pulse">
    <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded" />
    <div className="h-4 rounded-full bg-slate-200 dark:bg-slate-700" />
    <div className="grid grid-cols-3 gap-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-20 bg-slate-200 dark:bg-slate-700 rounded-lg" />
      ))}
    </div>
  </div>
);

// ===========================================
// Empty State Component
// ===========================================

const EmptyState: React.FC = () => (
  <div className="text-center py-6">
    <ChartBarIcon className="h-10 w-10 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
    <p className="text-sm text-slate-600 dark:text-slate-400">
      No course data available yet.
    </p>
    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
      Start by creating some courses.
    </p>
  </div>
);

// ===========================================
// DepartmentAnalyticsWidget Component
// ===========================================

interface DepartmentAnalyticsWidgetProps {
  defaultExpanded?: boolean;
}

export const DepartmentAnalyticsWidget: React.FC<DepartmentAnalyticsWidgetProps> = ({
  defaultExpanded = true,
}) => {
  const { getToken } = useAuth();
  const [data, setData] = useState<DepartmentAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(defaultExpanded);

  // Fetch analytics
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getToken();
      if (token) {
        api.setToken(token);
      }

      const response = await api.getDepartmentAnalytics();
      setData(response);
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
      setError('Failed to load analytics');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="luminous-card">
      {/* Header with expand/collapse toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-2">
          <ChartBarIcon className="h-5 w-5 text-luminous-500" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            {data?.department_name || 'Analytics'}
          </h2>
          {loading && (
            <ArrowPathIcon className="h-4 w-4 text-slate-400 animate-spin" />
          )}
        </div>
        <div className="flex items-center gap-2">
          {!loading && data && (
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {data.total_courses} course{data.total_courses !== 1 ? 's' : ''}
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
            <AnalyticsSkeleton />
          ) : data && data.total_courses > 0 ? (
            <div className="space-y-4">
              {/* Status Distribution Bar */}
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Courses by Status
                </p>
                <StatusBar items={data.courses_by_status} totalCourses={data.total_courses} />
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <StatCard
                  label="Total Courses"
                  value={data.total_courses}
                  icon={DocumentTextIcon}
                  iconColor="bg-luminous-100 text-luminous-600 dark:bg-luminous-900/50 dark:text-luminous-400"
                />
                <StatCard
                  label="Approval Rate"
                  value={`${data.approval_rate}%`}
                  icon={CheckCircleIcon}
                  iconColor="bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-400"
                  subtext="approved vs returned"
                />
                <StatCard
                  label="Avg. Review Time"
                  value={data.avg_review_days !== null ? `${data.avg_review_days} days` : 'N/A'}
                  icon={ClockIcon}
                  iconColor="bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-400"
                  subtext="in review queue"
                />
              </div>
            </div>
          ) : (
            <EmptyState />
          )}
        </div>
      )}
    </div>
  );
};

export default DepartmentAnalyticsWidget;
