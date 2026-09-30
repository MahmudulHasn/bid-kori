import { isReducedMotionPreferred, MOTION_DURATIONS, MOTION_EASINGS } from '../motionTokens';

export { isReducedMotionPreferred, MOTION_DURATIONS, MOTION_EASINGS };

/**
 * Standard FadeIn variant for component entrance.
 */
export const fadeInVariants = {
  hidden: { opacity: 0 },
  visible: (custom: number = 0) => ({
    opacity: 1,
    transition: {
      duration: MOTION_DURATIONS.normal,
      delay: custom * 0.05,
      ease: MOTION_EASINGS.easeOutCubic,
    },
  }),
};

/**
 * Standard FadeUp variant with subtle 12-16px vertical translate.
 */
export const fadeUpVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: (custom: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: MOTION_DURATIONS.normal,
      delay: custom * 0.05,
      ease: MOTION_EASINGS.easeOutCubic,
    },
  }),
};

/**
 * Standard ScaleIn variant for badges, indicators, and highlight cards.
 */
export const scaleInVariants = {
  hidden: { opacity: 0, scale: 0.94 },
  visible: (custom: number = 0) => ({
    opacity: 1,
    scale: 1,
    transition: {
      duration: MOTION_DURATIONS.normal,
      delay: custom * 0.05,
      ease: MOTION_EASINGS.easeOutCubic,
    },
  }),
};

/**
 * Stagger container for orchestrating children items.
 */
export const staggerListVariants = {
  hidden: { opacity: 0 },
  visible: (staggerSpeed: number = 0.06) => ({
    opacity: 1,
    transition: {
      staggerChildren: staggerSpeed,
      delayChildren: 0.02,
    },
  }),
};

/**
 * Stagger list item variant.
 */
export const staggerItemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: MOTION_DURATIONS.normal,
      ease: MOTION_EASINGS.easeOutCubic,
    },
  },
};

/**
 * Wizard step transition variants (used in Winner Details form).
 */
export const stepTransitionVariants = {
  enter: (direction: number = 1) => ({
    x: direction > 0 ? 16 : -16,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: {
      duration: MOTION_DURATIONS.fast,
      ease: MOTION_EASINGS.easeOutCubic,
    },
  },
  exit: (direction: number = 1) => ({
    x: direction > 0 ? -16 : 16,
    opacity: 0,
    transition: {
      duration: MOTION_DURATIONS.fast,
      ease: MOTION_EASINGS.easeOutCubic,
    },
  }),
};

/**
 * Realtime numeric highlight variant (brief color highlight / subtle pulse).
 */
export const realtimeUpdateHighlight = {
  rest: { scale: 1 },
  updated: {
    scale: [1, 1.05, 1],
    transition: {
      duration: 0.35,
      ease: 'easeOut',
    },
  },
};
