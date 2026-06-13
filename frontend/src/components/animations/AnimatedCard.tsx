'use client';

import React, { ReactNode } from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';
import { useAnimation } from './AnimationContext';
import { transitions } from './variants';

interface AnimatedCardProps extends Omit<HTMLMotionProps<'div'>, 'onHoverStart' | 'onHoverEnd'> {
  children: ReactNode;
  /** Enable hover lift effect */
  hoverLift?: boolean;
  /** Enable tap/click scale effect */
  tapScale?: boolean;
  /** Custom hover shadow */
  hoverShadow?: string;
  className?: string;
  onClick?: () => void;
}

export function AnimatedCard({
  children,
  hoverLift = true,
  tapScale = false,
  hoverShadow,
  className = '',
  onClick,
  ...motionProps
}: AnimatedCardProps) {
  const { animationsEnabled } = useAnimation();

  // Base classes for cards
  const baseClasses = `luminous-card ${className}`;

  // Render without animation if disabled
  if (!animationsEnabled) {
    return (
      <div
        className={baseClasses}
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
      >
        {children}
      </div>
    );
  }

  // Animation variants
  const hoverAnimation = hoverLift
    ? {
        y: -4,
        boxShadow: hoverShadow || '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
      }
    : {};

  const tapAnimation = tapScale ? { scale: 0.98 } : {};

  return (
    <motion.div
      whileHover={hoverAnimation}
      whileTap={onClick ? tapAnimation : undefined}
      transition={transitions.fast}
      className={baseClasses}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      {...motionProps}
    >
      {children}
    </motion.div>
  );
}

// Interactive card that acts like a button
interface AnimatedCardButtonProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

export function AnimatedCardButton({
  children,
  onClick,
  disabled = false,
  className = '',
  'aria-label': ariaLabel,
}: AnimatedCardButtonProps) {
  const { animationsEnabled } = useAnimation();

  const baseClasses = `luminous-card-interactive ${className} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`;

  if (!animationsEnabled) {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className={baseClasses}
        aria-label={ariaLabel}
      >
        {children}
      </button>
    );
  }

  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? {} : { y: -2, boxShadow: '0 8px 20px -5px rgba(0, 0, 0, 0.1)' }}
      whileTap={disabled ? {} : { scale: 0.98 }}
      transition={transitions.fast}
      className={baseClasses}
      aria-label={ariaLabel}
    >
      {children}
    </motion.button>
  );
}

// Animated list item for staggered lists
interface AnimatedListItemProps {
  children: ReactNode;
  index?: number;
  className?: string;
  onClick?: () => void;
}

export function AnimatedListItem({
  children,
  index = 0,
  className = '',
  onClick,
}: AnimatedListItemProps) {
  const { animationsEnabled } = useAnimation();

  if (!animationsEnabled) {
    return (
      <div className={className} onClick={onClick}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        ...transitions.default,
        delay: index * 0.05,
      }}
      whileHover={onClick ? { scale: 1.01 } : undefined}
      className={className}
      onClick={onClick}
    >
      {children}
    </motion.div>
  );
}
