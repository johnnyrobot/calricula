import { Variants, Transition } from 'framer-motion';

// ===========================================
// Animation Variants
// ===========================================
// Reusable animation presets for consistent motion across the app

export const variants = {
  // Fade animations
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  } as Variants,

  // Fade with slight upward movement (page content)
  fadeUp: {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
  } as Variants,

  // Fade with downward movement (dropdowns)
  fadeDown: {
    initial: { opacity: 0, y: -10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
  } as Variants,

  // Slide from right (mobile menu, side panels)
  slideRight: {
    initial: { x: '100%', opacity: 0 },
    animate: { x: 0, opacity: 1 },
    exit: { x: '100%', opacity: 0 },
  } as Variants,

  // Slide from left (sidebar)
  slideLeft: {
    initial: { x: '-100%', opacity: 0 },
    animate: { x: 0, opacity: 1 },
    exit: { x: '-100%', opacity: 0 },
  } as Variants,

  // Scale up (modals, popovers)
  scale: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
  } as Variants,

  // Scale from center with bounce
  scaleBounce: {
    initial: { opacity: 0, scale: 0.9 },
    animate: {
      opacity: 1,
      scale: 1,
      transition: {
        type: 'spring',
        stiffness: 300,
        damping: 20,
      }
    },
    exit: { opacity: 0, scale: 0.9 },
  } as Variants,

  // Card hover effect
  cardHover: {
    initial: {},
    hover: {
      y: -4,
      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
    },
    tap: { scale: 0.98 },
  } as Variants,

  // Button press effect
  buttonPress: {
    initial: { scale: 1 },
    hover: { scale: 1.02 },
    tap: { scale: 0.98 },
  } as Variants,

  // Stagger children container
  staggerContainer: {
    initial: {},
    animate: {
      transition: {
        staggerChildren: 0.05,
        delayChildren: 0.1,
      },
    },
  } as Variants,

  // Stagger child item
  staggerItem: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
  } as Variants,

  // List item for staggered lists
  listItem: {
    initial: { opacity: 0, x: -20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 20 },
  } as Variants,
};

// ===========================================
// Transition Presets
// ===========================================

export const transitions = {
  // Fast - for micro-interactions
  fast: {
    duration: 0.15,
    ease: 'easeOut',
  } as Transition,

  // Default - for most animations
  default: {
    duration: 0.2,
    ease: 'easeOut',
  } as Transition,

  // Medium - for page transitions
  medium: {
    duration: 0.3,
    ease: 'easeInOut',
  } as Transition,

  // Slow - for dramatic reveals
  slow: {
    duration: 0.5,
    ease: 'easeInOut',
  } as Transition,

  // Spring - for bouncy feel
  spring: {
    type: 'spring',
    stiffness: 300,
    damping: 25,
  } as Transition,

  // Gentle spring - less bouncy
  gentleSpring: {
    type: 'spring',
    stiffness: 200,
    damping: 30,
  } as Transition,
};

// ===========================================
// Stagger Utilities
// ===========================================

export const stagger = {
  fast: 0.03,
  default: 0.05,
  slow: 0.1,
};

// ===========================================
// Reduced Motion Variants
// ===========================================
// These variants provide instant transitions for users who prefer reduced motion

export const reducedMotionVariants = {
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  } as Variants,

  // All positional animations become simple fades
  fadeUp: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  } as Variants,

  scale: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  } as Variants,
};
