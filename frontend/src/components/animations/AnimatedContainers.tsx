'use client';

import React, { ReactNode } from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';
import { useAnimation } from './AnimationContext';
import { variants, transitions } from './variants';

type AnimationVariant = keyof typeof variants;

interface AnimatedContainerProps extends Omit<HTMLMotionProps<'div'>, 'initial' | 'animate' | 'exit'> {
  children: ReactNode;
  variant?: AnimationVariant;
  delay?: number;
  duration?: number;
  className?: string;
  /** Whether to animate on mount */
  animate?: boolean;
}

// Generic animated container with configurable variants
export function AnimatedContainer({
  children,
  variant = 'fadeUp',
  delay = 0,
  duration,
  className = '',
  animate = true,
  ...motionProps
}: AnimatedContainerProps) {
  const { animationsEnabled } = useAnimation();

  if (!animationsEnabled || !animate) {
    return <div className={className}>{children}</div>;
  }

  const selectedVariant = variants[variant];
  const transition = {
    ...transitions.default,
    delay,
    ...(duration !== undefined && { duration }),
  };

  return (
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={selectedVariant}
      transition={transition}
      className={className}
      {...motionProps}
    >
      {children}
    </motion.div>
  );
}

// Fade in animation
export function FadeIn({
  children,
  delay = 0,
  duration = 0.3,
  className = '',
  ...props
}: {
  children: ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
}) {
  const { animationsEnabled } = useAnimation();

  if (!animationsEnabled) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration, delay, ease: 'easeOut' }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

// Slide in animation
export function SlideIn({
  children,
  direction = 'up',
  delay = 0,
  duration = 0.3,
  distance = 20,
  className = '',
}: {
  children: ReactNode;
  direction?: 'up' | 'down' | 'left' | 'right';
  delay?: number;
  duration?: number;
  distance?: number;
  className?: string;
}) {
  const { animationsEnabled } = useAnimation();

  if (!animationsEnabled) {
    return <div className={className}>{children}</div>;
  }

  const directionMap = {
    up: { y: distance },
    down: { y: -distance },
    left: { x: distance },
    right: { x: -distance },
  };

  return (
    <motion.div
      initial={{ opacity: 0, ...directionMap[direction] }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ duration, delay, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Scale in animation
export function ScaleIn({
  children,
  delay = 0,
  duration = 0.2,
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
}) {
  const { animationsEnabled } = useAnimation();

  if (!animationsEnabled) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration, delay, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Staggered children container
export function StaggerContainer({
  children,
  staggerDelay = 0.05,
  initialDelay = 0.1,
  className = '',
}: {
  children: ReactNode;
  staggerDelay?: number;
  initialDelay?: number;
  className?: string;
}) {
  const { animationsEnabled } = useAnimation();

  if (!animationsEnabled) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial="initial"
      animate="animate"
      variants={{
        initial: {},
        animate: {
          transition: {
            staggerChildren: staggerDelay,
            delayChildren: initialDelay,
          },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Staggered child item
export function StaggerItem({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  const { animationsEnabled } = useAnimation();

  if (!animationsEnabled) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      variants={variants.staggerItem}
      transition={transitions.default}
      className={className}
    >
      {children}
    </motion.div>
  );
}
