import assert from 'node:assert/strict';
import test from 'node:test';

import { getApiFieldErrors, isAuctionProductConflictError } from './apiErrors.ts';

test('getApiFieldErrors maps DRF field lists without exposing other keys', () => {
  const payload = {
    response: {
      data: {
        title: ['This field is required.'],
        description: 'Too short.',
        seller: ['ignored unless requested'],
      },
    },
  };
  const snapshot = JSON.stringify(payload);
  const errors = getApiFieldErrors(payload, ['title', 'description', 'condition']);
  assert.equal(errors.title, 'This field is required.');
  assert.equal(errors.description, 'Too short.');
  assert.equal(errors.condition, undefined);
  assert.equal('seller' in errors, false);
  assert.equal(JSON.stringify(payload), snapshot);
});

test('getApiFieldErrors reads BidKori nested error maps', () => {
  const payload = {
    response: {
      data: {
        status_code: 400,
        error: {
          product: 'This product already has an auction.',
          starting_bid: ['Starting bid must be greater than 0.'],
        },
      },
    },
  };
  const errors = getApiFieldErrors(payload, ['product', 'starting_bid']);
  assert.equal(errors.product, 'This product already has an auction.');
  assert.equal(errors.starting_bid, 'Starting bid must be greater than 0.');
});

test('auction product conflict helper recognizes duplicate create errors', () => {
  assert.equal(
    isAuctionProductConflictError({
      response: {
        status: 400,
        data: {
          status_code: 400,
          error: { product: 'This product already has an auction.' },
        },
      },
    }),
    true,
  );
  assert.equal(
    isAuctionProductConflictError({
      response: {
        status: 400,
        data: { error: 'Starting bid must be greater than 0.' },
      },
    }),
    false,
  );
});
