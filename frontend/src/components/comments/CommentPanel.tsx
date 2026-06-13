/**
 * CommentPanel - Inline commenting system for course editor
 *
 * Allows reviewers to:
 * - View comments on specific sections or the whole course
 * - Add new comments with section context
 * - Resolve/unresolve comments
 * - Filter by resolved status
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ChatBubbleLeftRightIcon,
  PaperAirplaneIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  XMarkIcon,
  UserCircleIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolidIcon } from '@heroicons/react/24/solid';
import { api, WorkflowComment, EntityType } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

// =============================================================================
// Types
// =============================================================================

interface CommentPanelProps {
  entityType: EntityType;
  entityId: string;
  currentSection?: string;
  sectionLabels?: Record<string, string>;
  onClose?: () => void;
}

// =============================================================================
// Comment Item Component
// =============================================================================

interface CommentItemProps {
  comment: WorkflowComment;
  currentUserId?: string;
  sectionLabels?: Record<string, string>;
  onResolve: (id: string) => void;
  onUnresolve: (id: string) => void;
  isResolving: boolean;
}

function CommentItem({
  comment,
  currentUserId,
  sectionLabels,
  onResolve,
  onUnresolve,
  isResolving,
}: CommentItemProps) {
  const isOwnComment = currentUserId === comment.user_id;
  const sectionLabel = comment.section && sectionLabels
    ? sectionLabels[comment.section] || comment.section
    : comment.section;

  // Format date to relative time
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div
      className={`p-3 rounded-lg border transition-colors ${
        comment.resolved
          ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800'
          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <UserCircleIcon className="h-6 w-6 flex-shrink-0 text-slate-400" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm text-slate-900 dark:text-white truncate">
                {comment.user?.full_name || 'Unknown User'}
              </span>
              {comment.user?.role && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                  {comment.user.role}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>{formatDate(comment.created_at)}</span>
              {sectionLabel && (
                <>
                  <span>•</span>
                  <span className="text-luminous-600 dark:text-luminous-400">
                    {sectionLabel}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Resolve/Unresolve Button */}
        <button
          onClick={() =>
            comment.resolved ? onUnresolve(comment.id) : onResolve(comment.id)
          }
          disabled={isResolving}
          className={`flex-shrink-0 p-1.5 rounded-full transition-colors ${
            comment.resolved
              ? 'text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30'
              : 'text-slate-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20'
          }`}
          title={comment.resolved ? 'Reopen comment' : 'Mark as resolved'}
        >
          {isResolving ? (
            <ArrowPathIcon className="h-5 w-5 animate-spin" />
          ) : comment.resolved ? (
            <CheckCircleSolidIcon className="h-5 w-5" />
          ) : (
            <CheckCircleIcon className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* Content */}
      <div
        className={`text-sm whitespace-pre-wrap ${
          comment.resolved
            ? 'text-slate-600 dark:text-slate-400'
            : 'text-slate-700 dark:text-slate-300'
        }`}
      >
        {comment.content}
      </div>

      {/* Resolved indicator */}
      {comment.resolved && (
        <div className="mt-2 flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
          <CheckCircleSolidIcon className="h-3.5 w-3.5" />
          <span>Resolved</span>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Main CommentPanel Component
// =============================================================================

export function CommentPanel({
  entityType,
  entityId,
  currentSection,
  sectionLabels,
  onClose,
}: CommentPanelProps) {
  const { getToken, user } = useAuth();
  const [comments, setComments] = useState<WorkflowComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [filterResolved, setFilterResolved] = useState<boolean | undefined>(undefined);
  const [filterSection, setFilterSection] = useState<string | undefined>(undefined);

  // Fetch comments
  const fetchComments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const token = await getToken();
      if (token) {
        api.setToken(token);
      }

      const data = await api.getCourseComments(entityId, {
        section: filterSection,
        resolved: filterResolved,
      });

      setComments(data);
    } catch (err) {
      console.error('Failed to fetch comments:', err);
      setError(err instanceof Error ? err.message : 'Failed to load comments');
    } finally {
      setLoading(false);
    }
  }, [entityId, filterSection, filterResolved, getToken]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  // Submit new comment
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || submitting) return;

    try {
      setSubmitting(true);
      setError(null);

      const token = await getToken();
      if (token) {
        api.setToken(token);
      }

      const comment = await api.createComment({
        entity_type: entityType,
        entity_id: entityId,
        section: currentSection,
        content: newComment.trim(),
      });

      setComments((prev) => [comment, ...prev]);
      setNewComment('');
    } catch (err) {
      console.error('Failed to create comment:', err);
      setError(err instanceof Error ? err.message : 'Failed to create comment');
    } finally {
      setSubmitting(false);
    }
  };

  // Resolve comment
  const handleResolve = async (commentId: string) => {
    try {
      setResolvingId(commentId);
      setError(null);

      const token = await getToken();
      if (token) {
        api.setToken(token);
      }

      const updated = await api.resolveComment(commentId);
      setComments((prev) =>
        prev.map((c) => (c.id === commentId ? updated : c))
      );
    } catch (err) {
      console.error('Failed to resolve comment:', err);
      setError(err instanceof Error ? err.message : 'Failed to resolve comment');
    } finally {
      setResolvingId(null);
    }
  };

  // Unresolve comment
  const handleUnresolve = async (commentId: string) => {
    try {
      setResolvingId(commentId);
      setError(null);

      const token = await getToken();
      if (token) {
        api.setToken(token);
      }

      const updated = await api.unresolveComment(commentId);
      setComments((prev) =>
        prev.map((c) => (c.id === commentId ? updated : c))
      );
    } catch (err) {
      console.error('Failed to unresolve comment:', err);
      setError(err instanceof Error ? err.message : 'Failed to reopen comment');
    } finally {
      setResolvingId(null);
    }
  };

  // Count stats
  const totalComments = comments.length;
  const unresolvedCount = comments.filter((c) => !c.resolved).length;
  const resolvedCount = comments.filter((c) => c.resolved).length;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-900">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ChatBubbleLeftRightIcon className="h-5 w-5 text-luminous-500" />
            <h2 className="font-semibold text-slate-900 dark:text-white">
              Comments
            </h2>
            {totalComments > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-luminous-100 dark:bg-luminous-900/30 text-luminous-700 dark:text-luminous-300">
                {unresolvedCount > 0 ? unresolvedCount : totalComments}
              </span>
            )}
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Stats */}
        {totalComments > 0 && (
          <div className="mt-2 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
            <span>{unresolvedCount} open</span>
            <span>{resolvedCount} resolved</span>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex-shrink-0 px-4 py-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
        <div className="flex items-center gap-2">
          <FunnelIcon className="h-4 w-4 text-slate-400" />
          <select
            value={filterResolved === undefined ? 'all' : filterResolved ? 'resolved' : 'open'}
            onChange={(e) => {
              const val = e.target.value;
              setFilterResolved(val === 'all' ? undefined : val === 'resolved');
            }}
            className="text-xs border-0 bg-transparent text-slate-600 dark:text-slate-300 focus:ring-0 cursor-pointer"
          >
            <option value="all">All comments</option>
            <option value="open">Open only</option>
            <option value="resolved">Resolved only</option>
          </select>
          {sectionLabels && (
            <select
              value={filterSection || 'all'}
              onChange={(e) => {
                setFilterSection(e.target.value === 'all' ? undefined : e.target.value);
              }}
              className="text-xs border-0 bg-transparent text-slate-600 dark:text-slate-300 focus:ring-0 cursor-pointer"
            >
              <option value="all">All sections</option>
              {Object.entries(sectionLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Comments List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <ArrowPathIcon className="h-6 w-6 animate-spin text-luminous-500" />
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-red-500 text-sm">{error}</p>
            <button
              onClick={fetchComments}
              className="mt-2 text-sm text-luminous-600 hover:text-luminous-700"
            >
              Try again
            </button>
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center py-8">
            <ChatBubbleLeftRightIcon className="h-12 w-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No comments yet
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              Add feedback for the course author below
            </p>
          </div>
        ) : (
          comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              currentUserId={user?.id}
              sectionLabels={sectionLabels}
              onResolve={handleResolve}
              onUnresolve={handleUnresolve}
              isResolving={resolvingId === comment.id}
            />
          ))
        )}
      </div>

      {/* New Comment Form */}
      <form
        onSubmit={handleSubmit}
        className="flex-shrink-0 p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50"
      >
        {currentSection && sectionLabels && (
          <div className="mb-2 text-xs text-slate-500 dark:text-slate-400">
            Commenting on:{' '}
            <span className="font-medium text-luminous-600 dark:text-luminous-400">
              {sectionLabels[currentSection] || currentSection}
            </span>
          </div>
        )}
        <div className="flex gap-2">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            rows={2}
            className="flex-1 luminous-input text-sm resize-none"
          />
          <button
            type="submit"
            disabled={!newComment.trim() || submitting}
            className="self-end p-2 rounded-lg bg-luminous-500 text-white hover:bg-luminous-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? (
              <ArrowPathIcon className="h-5 w-5 animate-spin" />
            ) : (
              <PaperAirplaneIcon className="h-5 w-5" />
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export default CommentPanel;
