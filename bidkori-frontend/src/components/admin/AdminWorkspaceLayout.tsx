'use client';

import { useEffect, useState, type ReactNode } from 'react';
import AdminHeader from './AdminHeader';
import AdminSidebar from './AdminSidebar';

export default function AdminWorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileNavOpen]);

  const closeMobileNav = () => setMobileNavOpen(false);

  return (
    <div className="flex min-h-screen w-full bg-zinc-50 dark:bg-zinc-950">
      {/* Desktop Sticky Sidebar */}
      <div className="hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:shrink-0">
        <AdminSidebar />
      </div>

      {/* Mobile Drawer */}
      {mobileNavOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-zinc-950/60 backdrop-blur-xs transition-opacity"
            aria-label="Close navigation menu"
            onClick={closeMobileNav}
          />
          <div className="absolute inset-y-0 left-0 flex max-w-[85vw] shadow-2xl">
            <AdminSidebar onNavigate={closeMobileNav} />
          </div>
        </div>
      ) : null}

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminHeader
          menuOpen={mobileNavOpen}
          onMenuToggle={() => setMobileNavOpen((open) => !open)}
        />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
