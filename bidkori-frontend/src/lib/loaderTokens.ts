/**
 * Cinematic Loader Timing and State Configuration Tokens
 */

export const LOADER_TIMING = {
  // Target intro duration (0.8 - 1.4s per specification)
  minDisplayMs: 850,
  targetDurationMs: 1000,
  maxSafetyTimeoutMs: 2800,
  reducedMotionDurationMs: 300,
  exitTransitionMs: 350,
} as const;

export const LOADER_MESSAGES = {
  initial: 'Preparing live auctions...',
  syncing: 'Synchronizing real-time catalog...',
  ready: 'Entering BidKori...',
  screenReader: 'Loading BidKori — Preparing live auctions',
} as const;

/**
 * Calculates display progress given elapsed time, min duration, and whether underlying data is still loading.
 * Provides smooth non-linear interpolation avoiding artificial pauses while remaining responsive.
 */
export function calculateLoaderProgress(
  elapsedMs: number,
  minDurationMs: number = LOADER_TIMING.minDisplayMs,
  isDataLoading: boolean = false
): number {
  if (elapsedMs <= 0) return 0;

  if (isDataLoading) {
    // If real data is still fetching, smoothly cruise up to 85% and wait
    const ratio = Math.min(elapsedMs / (minDurationMs * 1.5), 1);
    // Ease-out curve towards 85%
    return Math.min(Math.round(85 * (1 - Math.pow(1 - ratio, 2))), 85);
  }

  // Once data is ready (or for visual intro), interpolate from current position to 100%
  const ratio = Math.min(elapsedMs / minDurationMs, 1);
  // Quartic ease out: 1 - (1 - t)^4
  const eased = 1 - Math.pow(1 - ratio, 3);
  return Math.min(Math.round(eased * 100), 100);
}

/**
 * Returns accessible loading announcement.
 */
export function getAccessibleLoaderStatus(progress: number): string {
  if (progress >= 100) return 'BidKori is ready';
  return LOADER_MESSAGES.screenReader;
}
