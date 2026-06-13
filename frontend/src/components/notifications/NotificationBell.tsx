'use client';

/**
 * NotificationBell Component
 *
 * Displays a bell icon with unread count badge and dropdown panel
 * showing recent notifications for the current user.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  BellIcon,
  CheckIcon,
  XMarkIcon,
  DocumentTextIcon,
  FolderIcon,
  ChatBubbleLeftIcon,
  ArrowPathIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { BellIcon as BellIconSolid } from '@heroicons/react/24/solid';
import { api, Notification, NotificationType } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

// =============================================================================
// Types
// =============================================================================

interface NotificationBellProps {
  className?: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

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
      return 'text-green-600 bg-green-100';
    case 'course_returned':
    case 'program_returned':
      return 'text-amber-600 bg-amber-100';
    case 'course_submitted':
    case 'program_submitted':
      return 'text-blue-600 bg-blue-100';
    case 'course_commented':
    case 'program_commented':
      return 'text-purple-600 bg-purple-100';
    default:
      return 'text-slate-600 bg-slate-100';
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
  return date.toLocaleDateString();
}

// =============================================================================
// NotificationItem Component
// =============================================================================

interface NotificationItemProps {
  notification: Notification;
  onMarkRead: (id: string) => void;
  onClick: (notification: Notification) => void;
}

const NotificationItem: React.FC<NotificationItemProps> = ({
  notification,
  onMarkRead,
  onClick,
}) => {
  const Icon = getNotificationIcon(notification.type);
  const colorClass = getNotificationColor(notification.type);

  return (
    <div
      className={`flex items-start gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors ${
        !notification.is_read ? 'bg-luminous-50 dark:bg-luminous-900/20' : ''
      }`}
      onClick={() => onClick(notification)}
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
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {formatTimeAgo(notification.created_at)}
          </span>
          {notification.actor_name && (
            <span className="text-xs text-slate-400 dark:text-slate-500">
              by {notification.actor_name}
            </span>
          )}
        </div>
      </div>

      {/* Unread indicator / Mark read button */}
      {!notification.is_read && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onMarkRead(notification.id);
          }}
          className="flex-shrink-0 w-2 h-2 rounded-full bg-luminous-500"
          title="Mark as read"
        />
      )}
    </div>
  );
};

// =============================================================================
// NotificationBell Component
// =============================================================================

const NotificationBell: React.FC<NotificationBellProps> = ({ className = '' }) => {
  const router = useRouter();
  const { getToken } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch notifications and counts
  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getToken();
      if (token) {
        api.setToken(token);
      }

      const [notificationList, counts] = await Promise.all([
        api.listNotifications({ limit: 10 }),
        api.getNotificationCounts(),
      ]);

      setNotifications(notificationList);
      setUnreadCount(counts.unread);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
      setError('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  // Fetch on mount and periodically
  useEffect(() => {
    fetchNotifications();
    // Refresh every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

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
      setIsOpen(false);
    }
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-luminous-500 focus-visible:ring-offset-2
                   transition-colors"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        {isOpen ? (
          <BellIconSolid className="h-6 w-6 text-luminous-600" />
        ) : (
          <BellIcon className="h-6 w-6" />
        )}
        {/* Unread Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden z-50"
          role="menu"
          aria-orientation="vertical"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Notifications
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchNotifications}
                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400"
                title="Refresh"
                disabled={loading}
              >
                <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs text-luminous-600 hover:text-luminous-700 dark:text-luminous-400 dark:hover:text-luminous-300"
                >
                  Mark all read
                </button>
              )}
            </div>
          </div>

          {/* Notification List */}
          <div className="max-h-96 overflow-y-auto">
            {error ? (
              <div className="p-4 text-center text-sm text-red-600 dark:text-red-400">
                {error}
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center">
                <CheckCircleIcon className="h-12 w-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  You&apos;re all caught up!
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  No new notifications
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-700">
                {notifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onMarkRead={handleMarkRead}
                    onClick={handleNotificationClick}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-slate-200 dark:border-slate-700 p-2">
              <button
                onClick={() => {
                  // Could navigate to a full notifications page
                  setIsOpen(false);
                }}
                className="w-full text-center text-xs text-luminous-600 hover:text-luminous-700 dark:text-luminous-400 py-2 rounded hover:bg-slate-50 dark:hover:bg-slate-700/50"
              >
                View all notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
