'use client';

// ===========================================
// Test Page for CCNNonMatchForm - CUR-221
// ===========================================
// This page is for testing the CCNNonMatchForm component.
// Navigate to /test-ccn-form to view.

import { useState } from 'react';
import {
  CCNNonMatchForm,
  CCNNonMatchReasonCode,
} from '@/components/ccn';
import { useToast } from '@/components/toast/ToastContext';

export default function TestCCNFormPage() {
  const toast = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastSubmission, setLastSubmission] = useState<{
    reasonCode: CCNNonMatchReasonCode;
    justificationText: string;
  } | null>(null);

  const handleSubmit = async (reasonCode: CCNNonMatchReasonCode, justificationText: string) => {
    setIsSubmitting(true);

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500));

    setLastSubmission({ reasonCode, justificationText });
    setIsSubmitting(false);

    toast.success('Success', 'Justification submitted successfully!');
  };

  const handleBack = () => {
    toast.info('Info', 'Back button clicked');
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 py-8">
      <div className="max-w-2xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            CCN Non-Match Form Test
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            Test page for the CCNNonMatchForm component (CUR-221)
          </p>
        </div>

        {/* Form Container */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 p-6">
          <CCNNonMatchForm
            onSubmit={handleSubmit}
            onBack={handleBack}
            isSubmitting={isSubmitting}
          />
        </div>

        {/* Last Submission Display */}
        {lastSubmission && (
          <div className="mt-6 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800 p-6">
            <h2 className="text-lg font-semibold text-green-800 dark:text-green-200 mb-4">
              Last Submission (Debug)
            </h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm font-medium text-green-700 dark:text-green-300">
                  Reason Code:
                </dt>
                <dd className="text-green-800 dark:text-green-200 font-mono mt-1">
                  {lastSubmission.reasonCode}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-green-700 dark:text-green-300">
                  Justification Text:
                </dt>
                <dd className="text-green-800 dark:text-green-200 mt-1 whitespace-pre-wrap">
                  {lastSubmission.justificationText}
                </dd>
              </div>
            </dl>
          </div>
        )}

        {/* Test Cases */}
        <div className="mt-8 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            Acceptance Criteria Checklist
          </h2>
          <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
            <li className="flex items-start gap-2">
              <span className="text-green-500">[ ]</span>
              <span>Displays all 5 reason options with descriptions</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500">[ ]</span>
              <span>Validates minimum 20 characters</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500">[ ]</span>
              <span>Shows character counter (updating in real-time)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500">[ ]</span>
              <span>Disables submit button until valid (reason + min chars)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500">[ ]</span>
              <span>Dark mode support (toggle in top-right)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500">[ ]</span>
              <span>Accessible form controls (ARIA labels, keyboard nav)</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
