import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { isReducedMotionPreferred } from '../motionTokens';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

export { gsap, ScrollTrigger };

export interface LandingHeroAnimationResult {
  timeline: gsap.core.Timeline | null;
  cleanup: () => void;
}

/**
 * Isolated GSAP Hero entrance animation with safe fromTo to avoid stuck opacities.
 */
export function initLandingHero(container: HTMLElement | null): LandingHeroAnimationResult {
  if (typeof window === 'undefined' || !container || isReducedMotionPreferred()) {
    return {
      timeline: null,
      cleanup: () => {},
    };
  }

  const ctx = gsap.context(() => {
    const tl = gsap.timeline({ defaults: { ease: 'power3.out', duration: 0.6 } });
    tl.fromTo('.gsap-hero-badge', { opacity: 0, y: -12 }, { opacity: 1, y: 0, delay: 0.05 })
      .fromTo('.gsap-hero-title', { opacity: 0, y: 18 }, { opacity: 1, y: 0 }, '-=0.35')
      .fromTo('.gsap-hero-desc', { opacity: 0, y: 14 }, { opacity: 1, y: 0 }, '-=0.35')
      .fromTo('.gsap-hero-cta', { opacity: 0, y: 10 }, { opacity: 1, y: 0 }, '-=0.35')
      .fromTo('.gsap-hero-visual', { opacity: 0, scale: 0.96, y: 16 }, { opacity: 1, scale: 1, y: 0 }, '-=0.4');
  }, container);

  return {
    timeline: null,
    cleanup: () => {
      ctx.revert();
    },
  };
}

/**
 * Isolated GSAP ScrollTrigger section reveals for landing page sections.
 */
export function initLandingScrollTriggers(container: HTMLElement | null): () => void {
  if (typeof window === 'undefined' || !container || isReducedMotionPreferred()) {
    return () => {};
  }

  const ctx = gsap.context(() => {
    const scrollSections = [
      { trigger: '.gsap-categories', y: 20 },
      { trigger: '.gsap-live-auctions', y: 24 },
      { trigger: '.gsap-ending-soon', y: 24 },
      { trigger: '.gsap-why-choose', y: 24 },
      { trigger: '.gsap-how-works', y: 24 },
      { trigger: '.gsap-seller-cta', y: 24 },
    ];

    scrollSections.forEach(({ trigger, y }) => {
      const el = container.querySelector(trigger);
      if (el) {
        gsap.fromTo(
          el,
          { opacity: 0, y },
          {
            scrollTrigger: {
              trigger: el,
              start: 'top 88%',
              toggleActions: 'play none none none',
            },
            opacity: 1,
            y: 0,
            duration: 0.6,
            ease: 'power2.out',
          }
        );
      }
    });
  }, container);

  return () => {
    ctx.revert();
  };
}
