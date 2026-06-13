'use client';

// ===========================================
// Approval Actions Component
// ===========================================
// Shows approve/reject buttons for reviewers
// Only visible to CurriculumChair, ArticulationOfficer, Admin

import { useState } from 'react';
import {
  CheckCircleIcon,
  ArrowUturnLeftIcon,
  ChatBubbleLeftEllipsisIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid';
import { api, CourseStatus, StatusTransitionRequest } from '@/lib/api';
import { useAuth, UserProfile } from '@/contexts/AuthContext';
import { useToast } from '@/components/toast';

// ===========================================
// Types
// ===========================================

interface ApprovalActionsProps {
  courseId: string;
  courseTitle: string;
  currentStatus: CourseStatus;
  onStatusChange?: (newStatus: CourseStatus) => void;
}

// ===========================================
// Status Transition Logic
// ===========================================

interface TransitionOption {
  targetStatus: CourseStatus;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  variant: 'approve' | 'return';
  requiresComment: boolean;
}

function getAvailableTransitions(
  currentStatus: CourseStatus,
  userRole: UserProfile['role']
): TransitionOption[] {
  const transitions: TransitionOption[] = [];

  // CurriculumChair can approve DeptReview -> CurriculumCommittee
  // or return to Draft
  if (currentStatus === 'DeptReview') {
    if (['CurriculumChair', 'Admin'].includes(userRole)) {
      transitions.push({
        targetStatus: 'CurriculumCommittee',
        label: 'Approve for Committee',
        description: 'Forward to Curriculum Committee for review',
        icon: CheckCircleIcon,
        variant: 'approve',
        requiresComment: false,
      });
      transitions.push({
        targetStatus: 'Draft',
        label: 'Return for Revision',
        description: 'Return to faculty for revisions',
        icon: ArrowUturnLeftIcon,
        variant: 'return',
        requiresComment: true,
      });
    }
  }

  // CurriculumCommittee -> ArticulationReview
  if (currentStatus === 'CurriculumCommittee') {
    if (['CurriculumChair', 'Admin'].includes(userRole)) {
      transitions.push({
        targetStatus: 'ArticulationReview',
        label: 'Approve for Articulation',
        description: 'Forward to Articulation Officer for review',
        icon: CheckCircleIcon,
        variant: 'approve',
        requiresComment: false,
      });
      transitions.push({
        targetStatus: 'Draft',
        label: 'Return for Revision',
        description: 'Return to faculty for revisions',
        icon: ArrowUturnLeftIcon,
        variant: 'return',
        requiresComment: true,
      });
    }
  }

  // ArticulationReview -> Approved
  if (currentStatus === 'ArticulationReview') {
    if (['ArticulationOfficer', 'Admin'].includes(userRole)) {
      transitions.push({
        targetStatus: 'Approved',
        label: 'Final Approval',
        description: 'Approve course for publication',
        icon: CheckCircleSolid,
        variant: 'approve',
        requiresComment: false,
      });
      transitions.push({
        targetStatus: 'Draft',
        label: 'Return for Revision',
        description: 'Return to faculty for revisions',
        icon: ArrowUturnLeftIcon,
        variant: 'return',
        requiresComment: true,
      });
    }
  }

  return transitions;
}

function isReviewer(role: UserProfile['role']): boolean {
  return ['CurriculumChair', 'ArticulationOfficer', 'Admin'].includes(role);
}

// ===========================================
// Main Component
// ===========================================

export function ApprovalActions({
  courseId,
  courseTitle,
  currentStatus,
  onStatusChange,
}: ApprovalActionsProps) {
  const { user, getToken } = useAuth();
  const toast = useToast();

  const [isProcessing, setIsProcessing] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnComment, setReturnComment] = useState('');
  const [pendingTransition, setPendingTransition] = useState<TransitionOption | null>(null);

  // Don't render for non-reviewers
  if (!user || !isReviewer(user.role)) {
    return null;
  }

  // Get available transitions based on current status and user role
  const transitions = getAvailableTransitions(currentStatus, user.role);

  // Don't render if no transitions available
  if (transitions.length === 0) {
    return null;
  }

  // Handle transition
  const handleTransition = async (transition: TransitionOption) => {
    // If requires comment, show modal
    if (transition.requiresComment) {
      setPendingTransition(transition);
      setShowReturnModal(true);
      return;
    }

    await executeTransition(transition, '');
  };

  // Execute the actual transition
  const executeTransition = async (transition: TransitionOption, comment: string) => {
    try {
      setIsProcessing(true);

      const token = await getToken();
      if (token) {
        api.setToken(token);
      }

      const request: StatusTransitionRequest = {
        new_status: transition.targetStatus,
        comment: comment || `${transition.label} by ${user?.full_name}`,
      };

      await api.transitionCourseStatus(courseId, request);

      // Notify parent of status change
      if (onStatusChange) {
        onStatusChange(transition.targetStatus);
      }

      // Show success toast
      toast.success(
        transition.variant === 'approve' ? 'Course Approved' : 'Course Returned',
        transition.variant === 'approve'
          ? `${courseTitle} has been approved.`
          : `${courseTitle} has been returned for revision.`
      );

      // Close modal if open
      setShowReturnModal(false);
      setReturnComment('');
      setPendingTransition(null);
    } catch (error) {
      console.error('Transition failed:', error);
      toast.error(
        'Action Failed',
        error instanceof Error ? error.message : 'Failed to process this action'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle return with comment
  const handleReturnSubmit = () => {
    if (!pendingTransition) return;
    if (!returnComment.trim()) {
      toast.error('Comment Required', 'Please provide a reason for returning the course.');
      return;
    }
    executeTransition(pendingTransition, returnComment);
  };

  return (
    <>
      {/* Action Buttons */}
      <div className="luminous-card border-2 border-luminous-200 dark:border-luminous-800">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircleSolid className="h-5 w-5 text-luminous-500" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            Review Actions
          </h3>
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
          As a {user.role === 'CurriculumChair' ? 'Curriculum Chair' :
                 user.role === 'ArticulationOfficer' ? 'Articulation Officer' :
                 'Admin'}, you can take the following actions:
        </p>

        <div className="space-y-3">
          {transitions.map((transition) => {
            const Icon = transition.icon;
            const isApprove = transition.variant === 'approve';

            return (
              <button
                key={transition.targetStatus}
                onClick={() => handleTransition(transition)}
                disabled={isProcessing}
                className={`
                  w-full flex items-center gap-3 px-4 py-3 rounded-lg border-2 transition-all
                  ${isApprove
                    ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 text-green-700 dark:text-green-300'
                    : 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                  }
                  disabled:opacity-50 disabled:cursor-not-allowed
                `}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                <div className="flex-1 text-left">
                  <div className="font-medium">{transition.label}</div>
                  <div className="text-xs opacity-75">{transition.description}</div>
                </div>
                {isProcessing && (
                  <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                )}
              </button>
            );
          })}
        </div>

        {/* Current Status Indicator */}
        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <span>Current Status:</span>
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {currentStatus === 'DeptReview' ? 'Department Review' :
               currentStatus === 'CurriculumCommittee' ? 'Curriculum Committee' :
               currentStatus === 'ArticulationReview' ? 'Articulation Review' :
               currentStatus}
            </span>
          </div>
        </div>
      </div>

      {/* Return for Revision Modal */}
      {showReturnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-md w-full mx-4 overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-amber-50 dark:bg-amber-900/20">
              <div className="flex items-center gap-3">
                <ExclamationTriangleIcon className="h-6 w-6 text-amber-500" />
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                  Return for Revision
                </h3>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                You are returning <strong className="text-slate-900 dark:text-white">{courseTitle}</strong> to the author for revisions.
                Please provide a reason or specific feedback.
              </p>

              <label className="block">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Reason for Return <span className="text-red-500">*</span>
                </span>
                <textarea
                  value={returnComment}
                  onChange={(e) => setReturnComment(e.target.value)}
                  placeholder="Please clarify SLO #2 and add more detail to the content outline..."
                  rows={4}
                  className="mt-1 luminous-input w-full"
                />
              </label>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowReturnModal(false);
                  setReturnComment('');
                  setPendingTransition(null);
                }}
                disabled={isProcessing}
                className="luminous-button-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleReturnSubmit}
                disabled={isProcessing || !returnComment.trim()}
                className="luminous-button-primary bg-amber-500 hover:bg-amber-600 disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                    Processing...
                  </>
                ) : (
                  <>
                    <ArrowUturnLeftIcon className="h-4 w-4 mr-2" />
                    Return for Revision
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default ApprovalActions;
