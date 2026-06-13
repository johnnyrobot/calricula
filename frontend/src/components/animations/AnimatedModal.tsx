'use client';

import React, { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAnimation } from './AnimationContext';
import { transitions } from './variants';

interface AnimatedModalProps {
  isOpen: boolean;
  children: ReactNode;
  /** Optional callback when backdrop is clicked */
  onBackdropClick?: () => void;
  /** Additional classes for the modal container */
  className?: string;
  /** Additional classes for the backdrop */
  backdropClassName?: string;
}

export function AnimatedModal({
  isOpen,
  children,
  onBackdropClick,
  className = '',
  backdropClassName = '',
}: AnimatedModalProps) {
  const { animationsEnabled } = useAnimation();

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && onBackdropClick) {
      onBackdropClick();
    }
  };

  // Render without animation if disabled
  if (!animationsEnabled) {
    if (!isOpen) return null;
    return (
      <div
        className={`fixed inset-0 z-50 ${backdropClassName}`}
        onClick={handleBackdropClick}
      >
        <div className={className}>{children}</div>
      </div>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transitions.default}
            onClick={handleBackdropClick}
            className={`fixed inset-0 z-50 bg-slate-900/50 dark:bg-slate-900/70 ${backdropClassName}`}
          />

          {/* Modal content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={transitions.default}
            className={`fixed z-50 ${className}`}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Animated dialog panel with proper centering
interface AnimatedDialogProps {
  isOpen: boolean;
  onClose?: () => void;
  children: ReactNode;
  className?: string;
}

export function AnimatedDialog({
  isOpen,
  onClose,
  children,
  className = '',
}: AnimatedDialogProps) {
  const { animationsEnabled } = useAnimation();

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && onClose) {
      onClose();
    }
  };

  // Render without animation if disabled
  if (!animationsEnabled) {
    if (!isOpen) return null;
    return (
      <div
        className="fixed inset-0 z-50 overflow-y-auto"
        role="dialog"
        aria-modal="true"
      >
        <div
          className="fixed inset-0 bg-slate-900/50 dark:bg-slate-900/70"
          onClick={handleBackdropClick}
        />
        <div className="flex min-h-full items-center justify-center p-4">
          <div className={className}>{children}</div>
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transitions.default}
            onClick={handleBackdropClick}
            className="fixed inset-0 bg-slate-900/50 dark:bg-slate-900/70"
          />

          {/* Dialog positioning */}
          <div className="flex min-h-full items-center justify-center p-4">
            {/* Dialog panel */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{
                ...transitions.default,
                type: 'spring',
                stiffness: 300,
                damping: 25,
              }}
              className={className}
            >
              {children}
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}
