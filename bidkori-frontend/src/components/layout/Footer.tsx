'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShieldCheck, Zap, Lock } from 'lucide-react';
import BidKoriLogo from '@/components/brand/BidKoriLogo';
import { MARKETPLACE_ROUTES } from '@/lib/marketplace';
import { isRoleWorkspacePath } from '@/lib/authRouting';

export default function Footer() {
  const pathname = usePathname();

  if (isRoleWorkspacePath(pathname)) {
    return null;
  }
  return (
    <footer
      role="contentinfo"
      className="border-t border-zinc-200/80 bg-white dark:border-zinc-800/80 dark:bg-zinc-950 pb-20 md:pb-8"
    >
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-4">
          {/* Col 1: Brand & Identity */}
          <div className="space-y-3">
            <Link
              href={MARKETPLACE_ROUTES.home}
              className="inline-flex items-center transition-opacity hover:opacity-90"
              aria-label="BidKori Home"
            >
              <BidKoriLogo size="md" />
            </Link>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              Real-time online auction marketplace with sub-second WebSocket sync and verified seller listings.
            </p>
            <div className="flex items-center gap-3 pt-2 text-xs text-zinc-400 dark:text-zinc-500">
              <span className="inline-flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                Verified
              </span>
              <span className="inline-flex items-center gap-1">
                <Zap className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                Real-Time
              </span>
              <span className="inline-flex items-center gap-1">
                <Lock className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                Secure
              </span>
            </div>
          </div>

          {/* Col 2: Marketplace Navigation */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-white">
              Marketplace
            </h3>
            <ul className="mt-3 space-y-2 text-xs">
              <li>
                <Link
                  href={MARKETPLACE_ROUTES.auctions}
                  className="text-zinc-600 hover:text-amber-700 dark:text-zinc-400 dark:hover:text-amber-300"
                >
                  Live Auctions
                </Link>
              </li>
              <li>
                <Link
                  href={MARKETPLACE_ROUTES.search}
                  className="text-zinc-600 hover:text-amber-700 dark:text-zinc-400 dark:hover:text-amber-300"
                >
                  Search Catalog
                </Link>
              </li>
              <li>
                <Link
                  href="/auth/register"
                  className="text-zinc-600 hover:text-amber-700 dark:text-zinc-400 dark:hover:text-amber-300"
                >
                  Become a Seller
                </Link>
              </li>
              <li>
                <Link
                  href={MARKETPLACE_ROUTES.contact}
                  className="text-zinc-600 hover:text-amber-700 dark:text-zinc-400 dark:hover:text-amber-300"
                >
                  Contact Support
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 3: Workspaces */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-white">
              Workspaces
            </h3>
            <ul className="mt-3 space-y-2 text-xs">
              <li>
                <Link
                  href="/buyer"
                  className="text-zinc-600 hover:text-amber-700 dark:text-zinc-400 dark:hover:text-amber-300"
                >
                  Buyer Dashboard
                </Link>
              </li>
              <li>
                <Link
                  href="/seller"
                  className="text-zinc-600 hover:text-amber-700 dark:text-zinc-400 dark:hover:text-amber-300"
                >
                  Seller Dashboard
                </Link>
              </li>
              <li>
                <Link
                  href="/admin"
                  className="text-zinc-600 hover:text-amber-700 dark:text-zinc-400 dark:hover:text-amber-300"
                >
                  Admin Portal
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 4: Platform Standards */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-white">
              Platform Standards
            </h3>
            <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
              Built with Next.js, Django Channels, Redis, and canonical PostgreSQL database engine.
            </p>
            <p className="mt-2 text-[11px] text-zinc-400 dark:text-zinc-500">
              Designed for WCAG 2.2 AA accessibility and mobile touch readiness.
            </p>
          </div>
        </div>

        <div className="mt-10 border-t border-zinc-100 pt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-zinc-400 dark:border-zinc-800/80">
          <p>&copy; {new Date().getFullYear()} BidKori Online Auction Platform. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            <span>Systems Normal</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
