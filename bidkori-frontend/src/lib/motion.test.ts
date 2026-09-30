import {
  isReducedMotionPreferred,
  MOTION_DURATIONS,
  MOTION_EASINGS,
} from './motionTokens';
import {
  fadeInVariants,
  fadeUpVariants,
  scaleInVariants,
  staggerListVariants,
  staggerItemVariants,
  stepTransitionVariants,
  realtimeUpdateHighlight,
} from './motion/variants';
import { initLandingHero, initLandingScrollTriggers } from './motion/gsap';

describe('BidKori Motion Tokens and Reduced Motion', () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  test('MOTION_DURATIONS defines consistent fast, normal, and slow constants', () => {
    expect(MOTION_DURATIONS.fast).toBeGreaterThanOrEqual(0.15);
    expect(MOTION_DURATIONS.fast).toBeLessThanOrEqual(0.25);
    expect(MOTION_DURATIONS.normal).toBeGreaterThanOrEqual(0.25);
    expect(MOTION_DURATIONS.normal).toBeLessThanOrEqual(0.4);
    expect(MOTION_DURATIONS.slow).toBeGreaterThanOrEqual(0.45);
    expect(MOTION_DURATIONS.slow).toBeLessThanOrEqual(0.7);
  });

  test('MOTION_EASINGS defines standard cubic-bezier curves', () => {
    expect(Array.isArray(MOTION_EASINGS.easeOutCubic)).toBe(true);
    expect(MOTION_EASINGS.easeOutCubic).toHaveLength(4);
    expect(MOTION_EASINGS.easeOutCubic[0]).toBe(0.22);
    expect(MOTION_EASINGS.easeOutCubic[1]).toBe(1);
    expect(MOTION_EASINGS.easeOutCubic[2]).toBe(0.36);
    expect(MOTION_EASINGS.easeOutCubic[3]).toBe(1);
  });

  test('isReducedMotionPreferred respects window.matchMedia prefers-reduced-motion', () => {
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion: reduce'),
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));

    expect(isReducedMotionPreferred()).toBe(true);

    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));

    expect(isReducedMotionPreferred()).toBe(false);
  });
});

describe('BidKori Shared Motion Variants', () => {
  test('fadeInVariants generates standard opacity transitions', () => {
    expect(fadeInVariants.hidden).toEqual({ opacity: 0 });
    const visible = fadeInVariants.visible(2);
    expect(visible.opacity).toBe(1);
    expect(visible.transition.duration).toBe(MOTION_DURATIONS.normal);
    expect(visible.transition.delay).toBe(0.1);
  });

  test('fadeUpVariants applies subtle 16px travel and opacity reveal', () => {
    expect(fadeUpVariants.hidden).toEqual({ opacity: 0, y: 16 });
    const visible = fadeUpVariants.visible(0);
    expect(visible.opacity).toBe(1);
    expect(visible.y).toBe(0);
    expect(visible.transition.duration).toBe(MOTION_DURATIONS.normal);
  });

  test('scaleInVariants applies subtle scale 0.94 to 1', () => {
    expect(scaleInVariants.hidden).toEqual({ opacity: 0, scale: 0.94 });
    const visible = scaleInVariants.visible(1);
    expect(visible.opacity).toBe(1);
    expect(visible.scale).toBe(1);
  });

  test('staggerListVariants configures children stagger interval', () => {
    expect(staggerListVariants.hidden).toEqual({ opacity: 0 });
    const visible = staggerListVariants.visible(0.08);
    expect(visible.opacity).toBe(1);
    expect(visible.transition.staggerChildren).toBe(0.08);
  });

  test('staggerItemVariants defines subtle 14px rise', () => {
    expect(staggerItemVariants.hidden).toEqual({ opacity: 0, y: 14 });
    expect(staggerItemVariants.visible).toEqual({
      opacity: 1,
      y: 0,
      transition: {
        duration: MOTION_DURATIONS.normal,
        ease: MOTION_EASINGS.easeOutCubic,
      },
    });
  });

  test('stepTransitionVariants handles wizard forward and backward directions', () => {
    const forwardEnter = stepTransitionVariants.enter(1);
    expect(forwardEnter.x).toBe(16);
    expect(forwardEnter.opacity).toBe(0);

    const forwardExit = stepTransitionVariants.exit(1);
    expect(forwardExit.x).toBe(-16);
    expect(forwardExit.opacity).toBe(0);

    const backwardEnter = stepTransitionVariants.enter(-1);
    expect(backwardEnter.x).toBe(-16);
    expect(backwardEnter.opacity).toBe(0);

    const backwardExit = stepTransitionVariants.exit(-1);
    expect(backwardExit.x).toBe(16);
    expect(backwardExit.opacity).toBe(0);
  });

  test('realtimeUpdateHighlight provides a brief non-repeating pulse', () => {
    expect(realtimeUpdateHighlight.rest).toEqual({ scale: 1 });
    expect(realtimeUpdateHighlight.updated.scale).toEqual([1, 1.05, 1]);
    expect(realtimeUpdateHighlight.updated.transition.duration).toBe(0.35);
  });
});

describe('BidKori GSAP Helpers and Reduced Motion safety', () => {
  test('initLandingHero returns safe no-op cleanup when container is null', () => {
    const result = initLandingHero(null);
    expect(result.timeline).toBeNull();
    expect(typeof result.cleanup).toBe('function');
    expect(() => result.cleanup()).not.toThrow();
  });

  test('initLandingScrollTriggers returns safe no-op cleanup when container is null', () => {
    const cleanup = initLandingScrollTriggers(null);
    expect(typeof cleanup).toBe('function');
    expect(() => cleanup()).not.toThrow();
  });
});
