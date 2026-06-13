'use client';

import React, { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAnimation } from './AnimationContext';
import { variants, transitions } from './variants';

interface PageTransitionProps {
  children: ReactNode;
  /** Unique key for the page (usually the pathname) */
  pageKey?: string;
  /** Animation variant to use */
  variant?: 'fade' | 'fadeUp' | 'slideRight' | 'slideLeft';
  /** Custom className for the wrapper */
  className?: string;
}

export function PageTransition({
  children,
  pageKey,
  variant = 'fadeUp',
  className = '',
}: PageTransitionProps) {
  const { animationsEnabled } = useAnimation();

  // If animations are disabled, render children directly
  if (!animationsEnabled) {
    return <div className={className}>{children}</div>;
  }

  const selectedVariant = variants[variant];

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pageKey}
        initial="initial"
        animate="animate"
        exit="exit"
        variants={selectedVariant}
        transition={transitions.medium}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

// Wrapper for page content with standard fade-up animation
export function PageContent({
  children,
  className = '',
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const { animationsEnabled } = useAnimation();

  if (!animationsEnabled) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        ...transitions.medium,
        delay,
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
