'use client';

import React, { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAnimation } from './AnimationContext';
import { transitions } from './variants';

interface AnimatedDropdownProps {
  isOpen: boolean;
  children: ReactNode;
  className?: string;
  /** Position of the dropdown relative to trigger */
  position?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
  /** Origin point for the scale animation */
  origin?: string;
}

export function AnimatedDropdown({
  isOpen,
  children,
  className = '',
  position = 'bottom-right',
  origin,
}: AnimatedDropdownProps) {
  const { animationsEnabled } = useAnimation();

  // Determine transform origin based on position
  const getTransformOrigin = () => {
    if (origin) return origin;
    switch (position) {
      case 'bottom-left':
        return 'top left';
      case 'bottom-right':
        return 'top right';
      case 'top-left':
        return 'bottom left';
      case 'top-right':
        return 'bottom right';
      default:
        return 'top right';
    }
  };

  // Get initial position based on dropdown position
  const getInitialY = () => {
    return position.startsWith('top') ? 8 : -8;
  };

  // Render without animation if disabled
  if (!animationsEnabled) {
    return isOpen ? <div className={className}>{children}</div> : null;
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{
            opacity: 0,
            scale: 0.95,
            y: getInitialY(),
          }}
          animate={{
            opacity: 1,
            scale: 1,
            y: 0,
          }}
          exit={{
            opacity: 0,
            scale: 0.95,
            y: getInitialY(),
          }}
          transition={transitions.fast}
          style={{ transformOrigin: getTransformOrigin() }}
          className={className}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Menu item with hover animation
interface AnimatedMenuItemProps {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}

export function AnimatedMenuItem({
  children,
  onClick,
  className = '',
  disabled = false,
}: AnimatedMenuItemProps) {
  const { animationsEnabled } = useAnimation();

  if (!animationsEnabled) {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className={className}
      >
        {children}
      </button>
    );
  }

  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileHover={{ backgroundColor: 'rgba(0, 0, 0, 0.05)' }}
      whileTap={{ scale: 0.98 }}
      transition={transitions.fast}
      className={className}
    >
      {children}
    </motion.button>
  );
}
