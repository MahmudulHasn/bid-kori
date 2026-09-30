/**
 * Google Identity Services (GIS) client helpers, contracts, and script loader.
 */

import { getGoogleClientId } from './config.ts';
import type { AuthUser, PublicRegistrationRole } from './types.ts';

export const GOOGLE_AUTH_API_PATH = '/users/google/';
export const GOOGLE_AUTH_METHOD = 'POST';

export interface GoogleAuthBackendResponse {
  token?: string;
  user?: AuthUser;
  requires_role_selection?: boolean;
  signup_token?: string;
  email?: string;
  name?: string;
  detail?: string;
  error?: string | Record<string, string[]>;
}

export interface GoogleAuthPayload {
  credential?: string;
  signup_token?: string;
  role?: PublicRegistrationRole;
}

/**
 * Validates and normalizes Google auth request payloads.
 */
export function buildGoogleAuthPayload(options: {
  credential?: string;
  signupToken?: string;
  role?: PublicRegistrationRole;
}): GoogleAuthPayload {
  const payload: GoogleAuthPayload = {};
  if (options.credential?.trim()) {
    payload.credential = options.credential.trim();
  }
  if (options.signupToken?.trim()) {
    payload.signup_token = options.signupToken.trim();
  }
  if (options.role) {
    payload.role = options.role;
  }
  return payload;
}

/**
 * Maps error responses to user-friendly messages without exposing internals.
 */
export function getGoogleAuthErrorMessage(error: unknown): string {
  const data = (error as { response?: { data?: Record<string, unknown> } })?.response?.data;
  if (typeof data?.detail === 'string' && data.detail) {
    return data.detail;
  }
  if (typeof data?.error === 'string' && data.error) {
    return data.error;
  }
  if (data?.role && Array.isArray(data.role) && data.role[0]) {
    return String(data.role[0]);
  }
  return "Couldn't verify your Google account. Please try again.";
}

/**
 * Loads the official Google Identity Services client script (https://accounts.google.com/gsi/client).
 * Ensures only a single script element is ever injected.
 */
export function loadGoogleIdentityScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }

  // Check if already available on window
  if ((window as unknown as { google?: { accounts?: { id?: unknown } } }).google?.accounts?.id) {
    return Promise.resolve();
  }

  const existingScript = document.getElementById('google-gsi-client');
  if (existingScript) {
    return new Promise((resolve, reject) => {
      existingScript.addEventListener('load', () => resolve());
      existingScript.addEventListener('error', () =>
        reject(new Error('Failed to load Google Identity Services.'))
      );
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = 'google-gsi-client';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services.'));
    document.head.appendChild(script);
  });
}

/**
 * Authenticate or register with Google ID token via BidKori Django backend.
 */
export async function authenticateWithGoogle(
  payload: GoogleAuthPayload
): Promise<GoogleAuthBackendResponse> {
  const { default: api } = await import('@/lib/api');
  const { data } = await api.post<GoogleAuthBackendResponse>(GOOGLE_AUTH_API_PATH, payload);
  return data;
}

/**
 * Validates whether Google Client ID is configured.
 */
export function isGoogleAuthEnabled(): boolean {
  return Boolean(getGoogleClientId());
}
