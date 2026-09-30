'use client';

import { useEffect, useRef, useState } from 'react';
import { getGoogleClientId } from '@/lib/config';
import { loadGoogleIdentityScript } from '@/lib/googleAuth';

interface GoogleAccountsId {
  initialize: (config: {
    client_id: string;
    callback: (response: { credential?: string }) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      type?: 'standard' | 'icon';
      theme?: 'outline' | 'filled_blue' | 'filled_black';
      size?: 'large' | 'medium' | 'small';
      text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
      shape?: 'rectangular' | 'pill' | 'circle' | 'square';
      logo_alignment?: 'left' | 'center';
      width?: number | string;
      locale?: string;
    }
  ) => void;
}

interface GoogleSignInButtonProps {
  onSuccess: (credential: string) => void;
  onError?: (error: Error) => void;
  disabled?: boolean;
  isLoading?: boolean;
  text?: 'signin' | 'signup' | 'continue';
  className?: string;
}

export default function GoogleSignInButton({
  onSuccess,
  onError,
  disabled = false,
  isLoading = false,
  text = 'continue',
  className = '',
}: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const clientId = getGoogleClientId();
  const [gisLoaded, setGisLoaded] = useState(false);
  const [scriptError, setScriptError] = useState<string | null>(() =>
    !clientId ? 'Google Client ID is not configured.' : null
  );

  useEffect(() => {
    if (!clientId) {
      return;
    }

    let isMounted = true;

    loadGoogleIdentityScript()
      .then(() => {
        if (!isMounted) return;
        const google = (
          window as unknown as { google?: { accounts?: { id?: GoogleAccountsId } } }
        ).google;
        if (!google?.accounts?.id) {
          throw new Error('Google Identity Services unavailable.');
        }

        // Initialize Google Identity Services client
        google.accounts.id.initialize({
          client_id: clientId,
          callback: (response: { credential?: string }) => {
            if (response.credential) {
              onSuccess(response.credential);
            } else {
              onError?.(new Error('No credential returned from Google.'));
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        // Render official Google button into container
        if (containerRef.current) {
          containerRef.current.innerHTML = '';
          google.accounts.id.renderButton(containerRef.current, {
            type: 'standard',
            theme: 'filled_black',
            size: 'large',
            text: text === 'signup' ? 'signup_with' : text === 'signin' ? 'signin_with' : 'continue_with',
            shape: 'pill',
            logo_alignment: 'left',
            width: 340,
            locale: 'en',
          });
        }

        setGisLoaded(true);
      })
      .catch((err) => {
        if (!isMounted) return;
        setScriptError(err.message || 'Failed to load Google Sign-In.');
        onError?.(err);
      });

    return () => {
      isMounted = false;
    };
  }, [clientId, onSuccess, onError, text]);

  // Loading state overlay
  if (isLoading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`flex h-11 w-full max-w-[340px] items-center justify-center gap-3 rounded-full border border-zinc-700/80 bg-zinc-900/90 px-4 text-xs font-semibold text-zinc-300 shadow-sm ${className}`}
      >
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        <span>Signing in with Google...</span>
      </div>
    );
  }

  // Script load error or missing client ID
  if (scriptError && !gisLoaded) {
    return (
      <div className="text-center">
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="flex h-11 w-full max-w-[340px] items-center justify-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/50 px-4 text-xs font-medium text-zinc-500 cursor-not-allowed opacity-60"
        >
          Google Sign-In unavailable
        </button>
      </div>
    );
  }

  return (
    <div
      className={`relative flex justify-center ${disabled ? 'pointer-events-none opacity-50' : ''} ${className}`}
    >
      {/* Official GIS Button Container */}
      <div
        ref={containerRef}
        className="min-h-[44px] flex items-center justify-center transition-opacity duration-200"
      />
    </div>
  );
}
