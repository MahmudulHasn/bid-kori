import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hasSessionHintCookie,
  isProtectedPath,
  isSafeNextPath,
  SESSION_HINT_COOKIE,
  LEGACY_TOKEN_COOKIE,
} from './authRouting.ts';

test('isProtectedPath covers dashboard and create auction roots', () => {
  assert.equal(isProtectedPath('/dashboard'), true);
  assert.equal(isProtectedPath('/dashboard/settings'), true);
  assert.equal(isProtectedPath('/auctions/create'), true);
  assert.equal(isProtectedPath('/auctions/create/extra'), true);
  assert.equal(isProtectedPath('/'), false);
  assert.equal(isProtectedPath('/auctions/1'), false);
  assert.equal(isProtectedPath('/auth/login'), false);
});

test('isSafeNextPath rejects open redirects', () => {
  assert.equal(isSafeNextPath('/dashboard'), true);
  assert.equal(isSafeNextPath('/auctions/create'), true);
  assert.equal(isSafeNextPath('https://evil.example'), false);
  assert.equal(isSafeNextPath('//evil.example'), false);
  assert.equal(isSafeNextPath('\\evil'), false);
  assert.equal(isSafeNextPath(null), false);
});

test('hasSessionHintCookie treats cookies as UX hints only', () => {
  assert.equal(
    hasSessionHintCookie({
      get: (name) => (name === SESSION_HINT_COOKIE ? { value: '1' } : undefined),
    }),
    true,
  );
  assert.equal(
    hasSessionHintCookie({
      get: (name) =>
        name === LEGACY_TOKEN_COOKIE ? { value: 'not-validated' } : undefined,
    }),
    true,
  );
  assert.equal(
    hasSessionHintCookie({
      get: () => undefined,
    }),
    false,
  );
});
