'use client';

/**
 * AI Insight Card Component
 *
 * Reusable card for displaying AI-generated suggestions inline within forms.
 * Features smooth animations, apply/regenerate/dismiss actions, and context display.
 *
 * @see CUR-93 - AI - Create AI Insight Card component
 */

import { useState, useEffect } from 'react';
import {
  SparklesIcon,
  XMarkIcon,
  ArrowPathIcon,
  CheckIcon,
} from '@heroicons/react/24/solid';

// =============================================================================
// Types
// =============================================================================

export interface AIInsightCardProps {
  /** Title/context for the suggestion (e.g., "Catalog Description Suggestion") */
  title: string;
  /** The AI-generated suggestion text */
  suggestion: string;
  /** Callback when user clicks "Apply Suggestion" */
  onApply: (suggestion: string) => void;
  /** Callback when user clicks "Regenerate" */
  onRegenerate?: () => void;
  /** Callback when user dismisses the card */
  onDismiss?: () => void;
  /** Whether the AI is currently regenerating a suggestion */
  isLoading?: boolean;
  /** Optional field name for context */
  fieldName?: string;
  /** Optional className for additional styling */
  className?: string;
}

// =============================================================================
// AI Insight Card Component
// =============================================================================

export function AIInsightCard({
  title,
  suggestion,
  onApply,
  onRegenerate,
  onDismiss,
  isLoading = false,
  fieldName,
  className = '',
}: AIInsightCardProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isApplied, setIsApplied] = useState(false);

  // Trigger enter animation on mount
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  // Handle apply suggestion
  const handleApply = () => {
    setIsApplied(true);
    onApply(suggestion);
    // Auto-dismiss after apply
    setTimeout(() => {
      handleDismiss();
    }, 1500);
  };

  // Handle dismiss with exit animation
  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(() => {
      onDismiss?.();
    }, 300);
  };

  // Handle regenerate
  const handleRegenerate = () => {
    setIsApplied(false);
    onRegenerate?.();
  };

  return (
    <div
      className={`
        transform transition-all duration-300 ease-out
        ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}
        ${className}
      `}
      role="alert"
      aria-live="polite"
    >
      <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900 rounded-lg p-4 shadow-sm">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1">
            {/* Icon */}
            <div className="flex-shrink-0 mt-0.5">
              {isApplied ? (
                <div className="h-6 w-6 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center">
                  <CheckIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
                </div>
              ) : (
                <SparklesIcon className="h-6 w-6 text-luminous-600 dark:text-luminous-400" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              {/* Title */}
              <h4 className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">
                {title}
                {fieldName && (
                  <span className="ml-2 text-xs font-normal text-indigo-600 dark:text-indigo-400">
                    for {fieldName}
                  </span>
                )}
              </h4>

              {/* Suggestion Text */}
              {isLoading ? (
                <div className="mt-2 flex items-center gap-2">
                  <div className="animate-spin h-4 w-4 border-2 border-luminous-500 border-t-transparent rounded-full" />
                  <span className="text-sm text-indigo-600 dark:text-indigo-400">
                    Generating suggestion...
                  </span>
                </div>
              ) : (
                <p className="mt-1.5 text-sm text-indigo-700 dark:text-indigo-300 whitespace-pre-wrap">
                  {suggestion}
                </p>
              )}

              {/* Applied Message */}
              {isApplied && (
                <p className="mt-2 text-xs text-green-700 dark:text-green-400 font-medium">
                  ✓ Suggestion applied successfully
                </p>
              )}
            </div>
          </div>

          {/* Dismiss Button */}
          {onDismiss && !isApplied && (
            <button
              onClick={handleDismiss}
              className="flex-shrink-0 p-1 rounded-md text-indigo-400 hover:text-indigo-600 dark:text-indigo-500 dark:hover:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
              aria-label="Dismiss suggestion"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Action Buttons */}
        {!isApplied && !isLoading && (
          <div className="mt-4 flex items-center gap-3 pl-9">
            {/* Apply Suggestion Button */}
            <button
              onClick={handleApply}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-luminous-600 hover:bg-luminous-700 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-luminous-500 focus:ring-offset-2"
            >
              <CheckIcon className="h-4 w-4" />
              Apply Suggestion
            </button>

            {/* Regenerate Button */}
            {onRegenerate && (
              <button
                onClick={handleRegenerate}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-900/50 hover:bg-indigo-200 dark:hover:bg-indigo-900 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                <ArrowPathIcon className="h-4 w-4" />
                Regenerate
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Compact Variant
// =============================================================================

export interface AIInsightCompactProps {
  /** The AI-generated suggestion text */
  suggestion: string;
  /** Callback when user clicks "Use This" */
  onApply: (suggestion: string) => void;
  /** Callback when user dismisses */
  onDismiss?: () => void;
  /** Optional className */
  className?: string;
}

/**
 * Compact inline variant of AI Insight Card
 * For use in tight spaces like form field hints
 */
export function AIInsightCompact({
  suggestion,
  onApply,
  onDismiss,
  className = '',
}: AIInsightCompactProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(() => onDismiss?.(), 300);
  };

  return (
    <div
      className={`
        transform transition-all duration-200 ease-out
        ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1'}
        ${className}
      `}
    >
      <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900 rounded-md text-sm">
        <SparklesIcon className="h-4 w-4 text-luminous-500 flex-shrink-0" />
        <span className="text-indigo-700 dark:text-indigo-300 truncate flex-1">
          {suggestion}
        </span>
        <button
          onClick={() => onApply(suggestion)}
          className="text-xs font-medium text-luminous-600 hover:text-luminous-700 dark:text-luminous-400 dark:hover:text-luminous-300 whitespace-nowrap"
        >
          Use this
        </button>
        {onDismiss && (
          <button
            onClick={handleDismiss}
            className="text-indigo-400 hover:text-indigo-600 dark:text-indigo-500 dark:hover:text-indigo-300"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export default AIInsightCard;
