'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import WorkspaceHeader from '@/components/layout/WorkspaceHeader';
import WorkspaceSidebar from '@/components/layout/WorkspaceSidebar';
import NotificationRealtimeBridge from '@/components/notifications/NotificationRealtimeBridge';
import { getWorkspaceConfig } from '@/lib/workspaceNavigation';
import type { UserRole } from '@/lib/types';

type RoleWorkspaceLayoutProps = {
  role: UserRole;
  children: ReactNode;
};

/**
 * Shared chrome for Buyer / Seller / Admin workspaces.
 * Navigation IA comes from workspaceNavigation.ts — not duplicated per role page.
 */
export default function RoleWorkspaceLayout({
  role,
  children,
}: RoleWorkspaceLayoutProps) {
  const pathname = usePathname();
  const config = getWorkspaceConfig(role);
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
    <div className="flex min-h-0 flex-1 bg-zinc-50 dark:bg-zinc-950">
      {/* Desktop sidebar */}
      <div className="hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:shrink-0">
        <WorkspaceSidebar config={config} pathname={pathname} />
      </div>

      {/* Mobile drawer */}
      {mobileNavOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-zinc-950/40"
            aria-label="Close navigation menu"
            onClick={closeMobileNav}
          />
          <div className="absolute inset-y-0 left-0 flex max-w-[85vw] shadow-xl">
            <WorkspaceSidebar
              config={config}
              pathname={pathname}
              onNavigate={closeMobileNav}
            />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <WorkspaceHeader
          config={config}
          menuOpen={mobileNavOpen}
          onMenuToggle={() => setMobileNavOpen((open) => !open)}
        />
        {role === 'BUYER' || role === 'SELLER' ? (
          <NotificationRealtimeBridge role={role} />
        ) : null}
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
