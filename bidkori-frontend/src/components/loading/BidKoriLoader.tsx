'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';
import { gsap } from '@/lib/motion/gsap';
import {
  LOADER_TIMING,
  LOADER_MESSAGES,
  calculateLoaderProgress,
  getAccessibleLoaderStatus,
} from '@/lib/loaderTokens';

export interface BidKoriLoaderProps {
  /**
   * If true, keeps loader visible until real data finishes loading (cruising up to ~85%).
   * Once false, loader smoothly completes to 100% and triggers onComplete.
   */
  isLoading?: boolean;
  /**
   * Callback fired when the exit animation finishes and Home content should be revealed.
   */
  onComplete?: () => void;
  /**
   * Minimum display time for the visual branding sequence (default 850ms).
   */
  minDurationMs?: number;
  /**
   * Maximum safety timeout in case of client issues or hanging requests (default 2800ms).
   */
  maxSafetyTimeoutMs?: number;
  /**
   * Whether to take over the full viewport (default true).
   */
  fullscreen?: boolean;
  /**
   * Optional custom status message.
   */
  statusMessage?: string;
  /**
   * Additional container classes.
   */
  className?: string;
}

export default function BidKoriLoader({
  isLoading = false,
  onComplete,
  minDurationMs = LOADER_TIMING.minDisplayMs,
  maxSafetyTimeoutMs = LOADER_TIMING.maxSafetyTimeoutMs,
  fullscreen = true,
  statusMessage = LOADER_MESSAGES.initial,
  className = '',
}: BidKoriLoaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const streakRef = useRef<HTMLDivElement>(null);
  const barFillRef = useRef<HTMLDivElement>(null);
  const glowSweepRef = useRef<HTMLDivElement>(null);

  const prefersReduced = useReducedMotion();
  const [progress, setProgress] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const completedRef = useRef(false);

  // Scroll lock effect on mount with robust cleanup
  useEffect(() => {
    if (!fullscreen || typeof document === 'undefined') return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [fullscreen]);

  // Reduced motion: short simple fade-out
  useEffect(() => {
    if (!prefersReduced) return;

    const reducedTimer = setTimeout(() => {
      setProgress(100);
      setIsFinished(true);
      if (!completedRef.current) {
        completedRef.current = true;
        onComplete?.();
      }
    }, LOADER_TIMING.reducedMotionDurationMs);

    return () => clearTimeout(reducedTimer);
  }, [prefersReduced, onComplete]);

  // GSAP light streak and cinematic timeline sequencing
  useEffect(() => {
    if (prefersReduced || !containerRef.current) return;

    const ctx = gsap.context(() => {
      // 1. Light streak entrance
      if (streakRef.current) {
        gsap.fromTo(
          streakRef.current,
          { scaleX: 0, opacity: 0 },
          {
            scaleX: 1,
            opacity: 1,
            duration: 0.6,
            ease: 'power2.out',
            transformOrigin: 'center center',
          }
        );
      }
    }, containerRef);

    return () => {
      ctx.revert();
    };
  }, [prefersReduced]);

  // Progress interpolation loop & safety fallback
  useEffect(() => {
    if (prefersReduced) return;

    const startTime = performance.now();
    let animationFrameId: number;

    const updateLoop = () => {
      const now = performance.now();
      const elapsed = now - startTime;

      const current = calculateLoaderProgress(elapsed, minDurationMs, isLoading);
      setProgress(current);

      if (current >= 100) {
        // Trigger completion glow sweep
        if (glowSweepRef.current) {
          gsap.fromTo(
            glowSweepRef.current,
            { x: '-100%', opacity: 0.9 },
            {
              x: '200%',
              opacity: 0,
              duration: 0.45,
              ease: 'power2.inOut',
            }
          );
        }

        // Brief delay for glow sweep before signaling exit
        const exitTimer = setTimeout(() => {
          setIsFinished(true);
          if (!completedRef.current) {
            completedRef.current = true;
            onComplete?.();
          }
        }, 120);

        return () => clearTimeout(exitTimer);
      } else {
        animationFrameId = requestAnimationFrame(updateLoop);
      }
    };

    animationFrameId = requestAnimationFrame(updateLoop);

    // Fail-open safety timeout
    const safetyTimer = setTimeout(() => {
      setProgress(100);
      setIsFinished(true);
      if (!completedRef.current) {
        completedRef.current = true;
        onComplete?.();
      }
    }, maxSafetyTimeoutMs);

    return () => {
      cancelAnimationFrame(animationFrameId);
      clearTimeout(safetyTimer);
    };
  }, [isLoading, minDurationMs, maxSafetyTimeoutMs, prefersReduced, onComplete]);

  // Sync GSAP progress bar fill smoothly with state progress
  useEffect(() => {
    if (prefersReduced || !barFillRef.current) return;
    gsap.to(barFillRef.current, {
      width: `${progress}%`,
      duration: 0.15,
      ease: 'power1.out',
      overwrite: 'auto',
    });
  }, [progress, prefersReduced]);

  return (
    <motion.div
      ref={containerRef}
      role="status"
      aria-live="polite"
      aria-busy={!isFinished}
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={
        prefersReduced
          ? { opacity: 0, transition: { duration: 0.25 } }
          : {
              opacity: 0,
              scale: 1.025,
              transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] },
            }
      }
      className={`fixed inset-0 z-[100000] flex flex-col items-center justify-center bg-[#06080D] select-none ${className}`}
      style={{
        background:
          'radial-gradient(ellipse 90% 65% at 50% 45%, #0F1424 0%, #06080D 100%)',
      }}
    >
      {/* Screen Reader polite announcement */}
      <span className="sr-only">{getAccessibleLoaderStatus(progress)}</span>

      {/* Ambient background glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute h-[320px] w-[320px] sm:h-[420px] sm:w-[420px] -translate-y-6 rounded-full bg-amber-500/10 blur-[90px]"
      />

      <div className="relative z-10 flex flex-col items-center px-4 text-center">
        {/* Real BidKori Logo Asset with Framer Motion entrance */}
        <motion.div
          initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.96 }}
          animate={prefersReduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="relative mb-5 flex items-center justify-center"
        >
          <Image
            src="/bidkori-logo-dark.png"
            alt="BidKori"
            width={180}
            height={50}
            priority
            className="h-10 w-auto sm:h-12 object-contain drop-shadow-[0_2px_12px_rgba(245,158,11,0.25)]"
          />
        </motion.div>

        {/* Thin GSAP Orange Light Streak */}
        {!prefersReduced && (
          <div className="relative mb-6 h-[2px] w-36 sm:w-48 overflow-hidden rounded-full bg-zinc-800/60">
            <div
              ref={streakRef}
              className="h-full w-full bg-gradient-to-r from-transparent via-amber-400 to-transparent shadow-[0_0_8px_#F59E0B]"
            />
          </div>
        )}

        {/* Cinematic Progress Bar Container */}
        <div className="relative w-56 sm:w-64 max-w-[85vw]">
          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-zinc-800/80 border border-zinc-700/40">
            {/* GSAP Animated Fill */}
            <div
              ref={barFillRef}
              style={{ width: prefersReduced ? `${progress}%` : '0%' }}
              className="h-full rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.6)]"
            />

            {/* Sweep light highlight at 100% */}
            {!prefersReduced && (
              <div
                ref={glowSweepRef}
                className="pointer-events-none absolute inset-y-0 w-16 -translate-x-full bg-gradient-to-r from-transparent via-white/80 to-transparent opacity-0"
              />
            )}
          </div>

          {/* Progress percentage & status subtitle */}
          <div className="mt-3 flex items-center justify-between text-[11px] sm:text-xs">
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="font-medium tracking-wide text-zinc-400"
            >
              {progress >= 100 ? LOADER_MESSAGES.ready : statusMessage}
            </motion.span>

            <span
              aria-hidden="true"
              className="font-mono font-semibold tabular-nums text-amber-400/90"
            >
              {progress}%
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
