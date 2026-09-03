import assert from 'node:assert/strict';
import test from 'node:test';

import { getApiFieldErrors } from './apiErrors.ts';

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
