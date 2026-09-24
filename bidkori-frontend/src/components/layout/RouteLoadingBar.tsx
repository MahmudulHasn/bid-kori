'use client';

import { Suspense, useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

function LoadingBarInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  // When pathname or searchParams change, route navigation has finished
  useEffect(() => {
    if (loading) {
      setProgress(100);
      const timer = setTimeout(() => {
        setLoading(false);
        setProgress(0);
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [pathname, searchParams]);

  // Listen for clicks on internal navigation links
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      // Find closest anchor tag
      const anchor = (event.target as HTMLElement).closest('a');
      if (!anchor) return;

      const href = anchor.getAttribute('href');
      if (
        !href ||
        href.startsWith('#') ||
        href.startsWith('mailto:') ||
        href.startsWith('tel:') ||
        anchor.target === '_blank' ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      try {
        const targetUrl = new URL(href, window.location.origin);
        // Only trigger for same-origin links
        if (targetUrl.origin === window.location.origin) {
          const currentUrl = window.location.pathname + window.location.search;
          const nextUrl = targetUrl.pathname + targetUrl.search;
          if (currentUrl !== nextUrl) {
            setLoading(true);
            setProgress(30);
          }
        }
      } catch {
        // Invalid URL, ignore
      }
    };

    window.addEventListener('click', handleClick, { capture: true });
    return () => {
      window.removeEventListener('click', handleClick, { capture: true });
    };
  }, []);

  // Animate progress smoothly while waiting
  useEffect(() => {
    if (!loading) return;

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 85) {
          clearInterval(interval);
          return 85;
        }
        const increment = prev < 50 ? 18 : 6;
        return Math.min(prev + increment, 85);
      });
    }, 150);

    return () => clearInterval(interval);
  }, [loading]);

  if (!loading && progress === 0) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[99999] h-[3px] overflow-hidden bg-transparent"
    >
      <div
        className="h-full bg-gradient-to-r from-amber-500 via-orange-500 to-violet-600 shadow-[0_0_12px_rgba(245,158,11,0.7)] transition-all ease-out"
        style={{
          width: `${progress}%`,
          opacity: progress === 100 ? 0 : 1,
          transitionDuration: progress === 100 ? '300ms' : '200ms',
        }}
      />
    </div>
  );
}

export default function RouteLoadingBar() {
  return (
    <Suspense fallback={null}>
      <LoadingBarInner />
    </Suspense>
  );
}
