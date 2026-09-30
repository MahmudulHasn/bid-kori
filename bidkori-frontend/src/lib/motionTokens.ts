/**
 * BidKori Motion System Tokens & Variants
 * Consistent motion timing, easings, and reduced-motion-safe variants
 * for Framer Motion and GSAP coordination.
 */

export const MOTION_DURATIONS = {
  instant: 0,
  fast: 0.15,
  normal: 0.25,
  slow: 0.4,
  entrance: 0.6,
  cinematic: 0.8,
} as const;

export const MOTION_EASINGS = {
  easeOutCubic: [0.215, 0.61, 0.355, 1] as const,
  easeInOutCubic: [0.645, 0.045, 0.355, 1] as const,
  springTactile: { type: 'spring', stiffness: 400, damping: 28 } as const,
  springGentle: { type: 'spring', stiffness: 260, damping: 20 } as const,
};

/**
 * Check if the user has requested reduced motion.
 */
export function isReducedMotionPreferred(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Common Framer Motion Variants respecting prefers-reduced-motion
 */
export const pageEnterVariants = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: MOTION_DURATIONS.normal,
      ease: MOTION_EASINGS.easeOutCubic,
    },
  },
  exit: {
    opacity: 0,
    transition: {
      duration: MOTION_DURATIONS.fast,
    },
  },
};

export const staggerContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.04,
    },
  },
};

export const staggeredItemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: MOTION_DURATIONS.normal,
      ease: MOTION_EASINGS.easeOutCubic,
    },
  },
};

export const cardHoverMotion = {
  rest: { y: 0, scale: 1 },
  hover: {
    y: -4,
    scale: 1.008,
    transition: {
      duration: MOTION_DURATIONS.fast,
      ease: MOTION_EASINGS.easeOutCubic,
    },
  },
};

export const buttonPressMotion = {
  tap: { scale: 0.98 },
};

export const badgePulseMotion = {
  initial: { scale: 1 },
  animate: {
    scale: [1, 1.08, 1],
    transition: {
      repeat: Infinity,
      duration: 2.2,
      ease: 'easeInOut',
    },
  },
};
