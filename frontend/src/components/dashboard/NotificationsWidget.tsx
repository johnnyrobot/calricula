'use client';

// ===========================================
// NotificationsWidget Component - Dashboard Widget
// ===========================================
// Displays recent notifications with unread count
// and quick access to mark as read functionality

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  BellIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ArrowPathIcon,
  ExclamationCircleIcon,
  DocumentTextIcon,
  FolderIcon,
  ChatBubbleLeftIcon,
  CheckCircleIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { api, Notification, NotificationType } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

// ===========================================
// Helper Functions
// ===========================================

function getNotificationIcon(type: NotificationType) {
  switch (type) {
    case 'course_submitted':
    case 'course_approved':
    case 'course_returned':
      return DocumentTextIcon;
    case 'program_submitted':
    case 'program_approved':
    case 'program_returned':
      return FolderIcon;
    case 'course_commented':
    case 'program_commented':
      return ChatBubbleLeftIcon;
    default:
      return BellIcon;
  }
}

function getNotificationColor(type: NotificationType): string {
  switch (type) {
    case 'course_approved':
    case 'program_approved':
      return 'text-green-600 bg-green-100 dark:bg-green-900/50 dark:text-green-400';
    case 'course_returned':
    case 'program_returned':
      return 'text-amber-600 bg-amber-100 dark:bg-amber-900/50 dark:text-amber-400';
    case 'course_submitted':
    case 'program_submitted':
      return 'text-blue-600 bg-blue-100 dark:bg-blue-900/50 dark:text-blue-400';
    case 'course_commented':
    case 'program_commented':
      return 'text-purple-600 bg-purple-100 dark:bg-purple-900/50 dark:text-purple-400';
    default:
      return 'text-slate-600 bg-slate-100 dark:bg-slate-700 dark:text-slate-400';
  }
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ===========================================
// Notification Item Component
// ===========================================

interface NotificationItemProps {
  notification: Notification;
  onMarkRead: (id: string) => void;
  onNavigate: (notification: Notification) => void;
}

const NotificationItem: React.FC<NotificationItemProps> = ({
  notification,
  onMarkRead,
  onNavigate,
}) => {
  const Icon = getNotificationIcon(notification.type);
  const colorClass = getNotificationColor(notification.type);

  return (
    <div
      onClick={() => onNavigate(notification)}
      className={`flex items-start gap-3 py-3 px-2 -mx-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors group ${
        !notification.is_read ? 'bg-luminous-50/50 dark:bg-luminous-900/10' : ''
      }`}
    >
      {/* Icon */}
      <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${colorClass}`}>
        <Icon className="w-5 h-5" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${!notification.is_read ? 'font-semibold text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`}>
          {notification.title}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
          {notification.message}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {formatTimeAgo(notification.created_at)}
          </span>
          {notification.actor_name && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              by {notification.actor_name}
            </span>
          )}
        </div>
      </div>

      {/* Unread indicator and arrow */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {!notification.is_read && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMarkRead(notification.id);
            }}
            className="w-2 h-2 rounded-full bg-luminous-500 hover:bg-luminous-600 transition-colors"
            title="Mark as read"
          />
        )}
        <ChevronRightIcon className="h-4 w-4 text-slate-400 group-hover:text-luminous-500 transition-colors" />
      </div>
    </div>
  );
};

// ===========================================
// Loading Skeleton
// ===========================================

const NotificationsSkeleton: React.FC = () => (
  <div className="space-y-3">
    {[1, 2, 3].map((i) => (
      <div key={i} className="flex items-start gap-3 py-3 animate-pulse">
        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-700" />
        <div className="flex-1">
          <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded mb-2" />
          <div className="h-3 w-48 bg-slate-200 dark:bg-slate-700 rounded mb-2" />
          <div className="h-2 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
        </div>
        <div className="h-4 w-4 bg-slate-200 dark:bg-slate-700 rounded" />
      </div>
    ))}
  </div>
);

// ===========================================
// Empty State Component
// ===========================================

const EmptyState: React.FC = () => (
  <div className="text-center py-6">
    <CheckCircleIcon className="h-10 w-10 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
    <p className="text-sm text-slate-600 dark:text-slate-400">
      You're all caught up!
    </p>
    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
      No new notifications
    </p>
  </div>
);

// ===========================================
// NotificationsWidget Component
// ===========================================

interface NotificationsWidgetProps {
  limit?: number;
  defaultExpanded?: boolean;
}

export const NotificationsWidget: React.FC<NotificationsWidgetProps> = ({
  limit = 5,
  defaultExpanded = true,
}) => {
  const router = useRouter();
  const { getToken } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(defaultExpanded);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getToken();
      if (token) {
        api.setToken(token);
      }

      const [notificationList, counts] = await Promise.all([
        api.listNotifications({ limit }),
        api.getNotificationCounts(),
      ]);

      setNotifications(notificationList);
      setUnreadCount(counts.unread);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
      setError('Failed to load notifications');
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [getToken, limit]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Handle marking notification as read
  const handleMarkRead = async (id: string) => {
    try {
      const token = await getToken();
      if (token) {
        api.setToken(token);
      }
      await api.markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  // Handle marking all as read
  const handleMarkAllRead = async () => {
    try {
      const token = await getToken();
      if (token) {
        api.setToken(token);
      }
      await api.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
    }
  };

  // Handle clicking a notification
  const handleNotificationClick = async (notification: Notification) => {
    // Mark as read
    if (!notification.is_read) {
      handleMarkRead(notification.id);
    }

    // Navigate to the entity if available
    if (notification.entity_type && notification.entity_id) {
      const path =
        notification.entity_type === 'Course'
          ? `/courses/${notification.entity_id}`
          : `/programs/${notification.entity_id}`;
      router.push(path);
    }
  };

  return (
    <div className="luminous-card">
      {/* Header with expand/collapse toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-2">
          <BellIcon className="h-5 w-5 text-luminous-500" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Notifications
          </h2>
          {loading && (
            <ArrowPathIcon className="h-4 w-4 text-slate-400 animate-spin" />
          )}
        </div>
        <div className="flex items-center gap-2">
          {!loading && unreadCount > 0 && (
            <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200">
              {unreadCount} unread
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

          {/* Mark all read button */}
          {!loading && unreadCount > 0 && (
            <div className="mb-3">
              <button
                onClick={handleMarkAllRead}
                className="text-xs font-medium text-luminous-600 hover:text-luminous-700 dark:text-luminous-400 dark:hover:text-luminous-300"
              >
                Mark all as read
              </button>
            </div>
          )}

          {loading ? (
            <NotificationsSkeleton />
          ) : notifications.length > 0 ? (
            <>
              <div className="divide-y divide-slate-200 dark:divide-slate-700">
                {notifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onMarkRead={handleMarkRead}
                    onNavigate={handleNotificationClick}
                  />
                ))}
              </div>

              {/* View All link - could link to a full notifications page */}
              <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => fetchNotifications()}
                  className="text-sm font-medium text-luminous-600 hover:text-luminous-700 dark:text-luminous-400 dark:hover:text-luminous-300"
                >
                  Refresh notifications
                </button>
              </div>
            </>
          ) : (
            <EmptyState />
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationsWidget;
