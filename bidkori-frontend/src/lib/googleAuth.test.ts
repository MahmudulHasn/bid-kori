import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getGoogleClientId } from './config.ts';
import {
  GOOGLE_AUTH_API_PATH,
  GOOGLE_AUTH_METHOD,
  buildGoogleAuthPayload,
  getGoogleAuthErrorMessage,
  isGoogleAuthEnabled,
} from './googleAuth.ts';

describe('Google Auth Configuration', () => {
  it('reads Google Client ID when configured in process.env', () => {
    const original = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    try {
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = 'test-client-id-12345.apps.googleusercontent.com';
      assert.equal(getGoogleClientId(), 'test-client-id-12345.apps.googleusercontent.com');
      assert.equal(isGoogleAuthEnabled(), true);
    } finally {
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = original;
    }
  });

  it('handles empty Google Client ID gracefully', () => {
    const original = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    try {
      delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
      assert.equal(getGoogleClientId(), '');
      assert.equal(isGoogleAuthEnabled(), false);
    } finally {
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = original;
    }
  });

  it('uses canonical backend path and method', () => {
    assert.equal(GOOGLE_AUTH_API_PATH, '/users/google/');
    assert.equal(GOOGLE_AUTH_METHOD, 'POST');
  });

  it('builds payload with trimmed credential and role', () => {
    const payload = buildGoogleAuthPayload({
      credential: '  my-credential-token  ',
      role: 'BUYER',
    });
    assert.deepEqual(payload, {
      credential: 'my-credential-token',
      role: 'BUYER',
    });
  });

  it('builds payload with signup token and role', () => {
    const payload = buildGoogleAuthPayload({
      signupToken: 'signed-token-xyz',
      role: 'SELLER',
    });
    assert.deepEqual(payload, {
      signup_token: 'signed-token-xyz',
      role: 'SELLER',
    });
  });

  it('maps error responses cleanly without leaking internal traces', () => {
    assert.equal(
      getGoogleAuthErrorMessage({ response: { data: { detail: 'Account suspended.' } } }),
      'Account suspended.'
    );
    assert.equal(
      getGoogleAuthErrorMessage({ response: { data: { role: ['Role must be BUYER or SELLER.'] } } }),
      'Role must be BUYER or SELLER.'
    );
    assert.equal(
      getGoogleAuthErrorMessage(new Error('Network error')),
      "Couldn't verify your Google account. Please try again."
    );
  });
});
