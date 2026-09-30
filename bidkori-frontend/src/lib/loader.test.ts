import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  calculateLoaderProgress,
  getAccessibleLoaderStatus,
  LOADER_MESSAGES,
  LOADER_TIMING,
} from './loaderTokens.ts';

describe('LOADER_TIMING configuration', () => {
  it('enforces fast cinematic duration within 0.8s to 1.4s spec', () => {
    assert.ok(LOADER_TIMING.minDisplayMs >= 800);
    assert.ok(LOADER_TIMING.minDisplayMs <= 1400);
    assert.ok(LOADER_TIMING.targetDurationMs >= 800);
    assert.ok(LOADER_TIMING.targetDurationMs <= 1400);
  });

  it('provides safety timeout that fails-open without long block', () => {
    assert.ok(LOADER_TIMING.maxSafetyTimeoutMs <= 3000);
    assert.ok(LOADER_TIMING.maxSafetyTimeoutMs > LOADER_TIMING.minDisplayMs);
  });

  it('keeps reduced motion duration short', () => {
    assert.ok(LOADER_TIMING.reducedMotionDurationMs <= 400);
  });
});

describe('calculateLoaderProgress', () => {
  it('starts at 0 when elapsedMs is 0 or negative', () => {
    assert.equal(calculateLoaderProgress(0, 1000, false), 0);
    assert.equal(calculateLoaderProgress(-50, 1000, false), 0);
  });

  it('smoothly completes to 100% when elapsed reaches minDuration', () => {
    const progress = calculateLoaderProgress(1000, 1000, false);
    assert.equal(progress, 100);
  });

  it('caps at 100% when elapsed exceeds minDuration', () => {
    const progress = calculateLoaderProgress(1500, 1000, false);
    assert.equal(progress, 100);
  });

  it('holds at max 85% when real data is still loading', () => {
    const progressMid = calculateLoaderProgress(500, 1000, true);
    const progressLate = calculateLoaderProgress(2000, 1000, true);
    assert.ok(progressMid < 85);
    assert.equal(progressLate, 85);
  });

  it('progress increases monotonically over time', () => {
    const p1 = calculateLoaderProgress(200, 1000, false);
    const p2 = calculateLoaderProgress(500, 1000, false);
    const p3 = calculateLoaderProgress(800, 1000, false);
    const p4 = calculateLoaderProgress(1000, 1000, false);

    assert.ok(p1 < p2);
    assert.ok(p2 < p3);
    assert.ok(p3 < p4);
    assert.equal(p4, 100);
  });
});

describe('getAccessibleLoaderStatus', () => {
  it('announces polite loading text during progress', () => {
    assert.equal(getAccessibleLoaderStatus(45), LOADER_MESSAGES.screenReader);
  });

  it('announces ready text on completion', () => {
    assert.equal(getAccessibleLoaderStatus(100), 'BidKori is ready');
  });
});
