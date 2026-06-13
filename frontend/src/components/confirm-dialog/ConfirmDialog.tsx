'use client';

// ===========================================
// Confirmation Dialog Component
// ===========================================
// Modal dialog for confirming destructive actions
// Supports optional text input confirmation for extra safety

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ExclamationTriangleIcon, XMarkIcon } from '@heroicons/react/24/outline';

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning';
  // Optional: require typing a specific text to confirm
  confirmationText?: string;
  confirmationPlaceholder?: string;
  isLoading?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  confirmationText,
  confirmationPlaceholder,
  isLoading = false,
}: ConfirmDialogProps) {
  const [inputValue, setInputValue] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  // Reset input when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      setInputValue('');
      setIsConfirming(false);
      // Focus on input if confirmation text required, otherwise cancel button
      setTimeout(() => {
        if (confirmationText && inputRef.current) {
          inputRef.current.focus();
        } else if (cancelButtonRef.current) {
          cancelButtonRef.current.focus();
        }
      }, 100);
    }
  }, [isOpen, confirmationText]);

  // Handle escape key and focus trap
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      // Escape key closes dialog
      if (e.key === 'Escape' && !isConfirming) {
        onClose();
        return;
      }

      // Tab trap - keep focus within modal
      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          // Shift+Tab: if on first element, go to last
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement?.focus();
          }
        } else {
          // Tab: if on last element, go to first
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement?.focus();
          }
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isConfirming, onClose]);

  // Handle click outside
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget && !isConfirming) {
        onClose();
      }
    },
    [isConfirming, onClose]
  );

  // Handle confirm action
  const handleConfirm = async () => {
    if (confirmationText && inputValue !== confirmationText) {
      return;
    }
    setIsConfirming(true);
    try {
      await onConfirm();
      onClose();
    } catch (error) {
      console.error('Confirmation action failed:', error);
    } finally {
      setIsConfirming(false);
    }
  };

  // Check if confirm button should be enabled
  const isConfirmEnabled = !confirmationText || inputValue === confirmationText;

  if (!isOpen) return null;

  const variantStyles = {
    danger: {
      iconBg: 'bg-red-100 dark:bg-red-900/30',
      iconColor: 'text-red-600 dark:text-red-400',
      confirmButton:
        'bg-red-600 hover:bg-red-700 focus:ring-red-500 text-white disabled:bg-red-400',
    },
    warning: {
      iconBg: 'bg-amber-100 dark:bg-amber-900/30',
      iconColor: 'text-amber-600 dark:text-amber-400',
      confirmButton:
        'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500 text-white disabled:bg-amber-400',
    },
  };

  const styles = variantStyles[variant];

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      aria-labelledby="confirm-dialog-title"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/50 dark:bg-slate-900/70 transition-opacity"
        onClick={handleBackdropClick}
      />

      {/* Dialog positioning */}
      <div className="flex min-h-full items-center justify-center p-4">
        {/* Dialog panel */}
        <div
          ref={modalRef}
          className="relative transform overflow-hidden rounded-xl bg-white dark:bg-slate-800 shadow-2xl transition-all w-full max-w-md"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            disabled={isConfirming}
            className="absolute top-4 right-4 p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-luminous-500 disabled:opacity-50"
            aria-label="Close dialog"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>

          {/* Content */}
          <div className="p-6">
            {/* Icon and Title */}
            <div className="flex items-start gap-4">
              <div
                className={`flex-shrink-0 p-3 rounded-full ${styles.iconBg}`}
              >
                <ExclamationTriangleIcon
                  className={`h-6 w-6 ${styles.iconColor}`}
                />
              </div>
              <div className="flex-1 min-w-0">
                <h3
                  id="confirm-dialog-title"
                  className="text-lg font-semibold text-slate-900 dark:text-white"
                >
                  {title}
                </h3>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  {message}
                </p>
              </div>
            </div>

            {/* Optional confirmation input */}
            {confirmationText && (
              <div className="mt-4">
                <label
                  htmlFor="confirmation-input"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
                >
                  Type{' '}
                  <span className="font-mono bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded text-red-600 dark:text-red-400">
                    {confirmationText}
                  </span>{' '}
                  to confirm
                </label>
                <input
                  ref={inputRef}
                  type="text"
                  id="confirmation-input"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={confirmationPlaceholder || confirmationText}
                  className="luminous-input w-full"
                  disabled={isConfirming}
                  autoComplete="off"
                />
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700">
            <button
              ref={cancelButtonRef}
              onClick={onClose}
              disabled={isConfirming}
              className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-luminous-500 focus-visible:ring-offset-2 disabled:opacity-50"
            >
              {cancelText}
            </button>
            <button
              onClick={handleConfirm}
              disabled={!isConfirmEnabled || isConfirming || isLoading}
              className={`px-4 py-2 text-sm font-medium rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed transition-colors ${styles.confirmButton}`}
            >
              {isConfirming || isLoading ? (
                <span className="flex items-center gap-2">
                  <svg
                    className="animate-spin h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Processing...
                </span>
              ) : (
                confirmText
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
