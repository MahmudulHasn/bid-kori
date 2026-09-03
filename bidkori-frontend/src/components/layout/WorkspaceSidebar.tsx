'use client';

import Link from 'next/link';
import { Store } from 'lucide-react';

import {
  getWorkspaceAccent,
  isNavItemActive,
  isNavItemNavigable,
  type WorkspaceConfig,
  type WorkspaceNavItem,
} from '@/lib/workspaceNavigation';

type WorkspaceSidebarProps = {
  config: WorkspaceConfig;
  pathname: string;
  onNavigate?: () => void;
  className?: string;
};

const accentBrand: Record<
  ReturnType<typeof getWorkspaceAccent>,
  string
> = {
  amber: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  sky: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  violet: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
};

const accentActive: Record<
  ReturnType<typeof getWorkspaceAccent>,
  string
> = {
  amber:
    'bg-amber-500/15 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200',
  sky: 'bg-sky-500/15 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200',
  violet:
    'bg-violet-500/15 text-violet-800 dark:bg-violet-500/20 dark:text-violet-200',
};

function NavList({
  items,
  pathname,
  homePath,
  accent,
  onNavigate,
}: {
  items: readonly WorkspaceNavItem[];
  pathname: string;
  homePath: string;
  accent: ReturnType<typeof getWorkspaceAccent>;
  onNavigate?: () => void;
}) {
  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const navigable = isNavItemNavigable(item);
        const active = isNavItemActive(pathname, item, homePath);

        if (!navigable) {
          return (
            <li key={item.id}>
              <span
                aria-disabled="true"
                title="Coming soon"
                className="flex cursor-not-allowed items-center justify-between rounded-lg px-3 py-2 text-sm text-zinc-400 dark:text-zinc-500"
              >
                <span>{item.label}</span>
                <span className="text-[10px] font-semibold uppercase tracking-wide">
                  Soon
                </span>
              </span>
            </li>
          );
        }

        return (
          <li key={item.id}>
            <Link
              href={item.href}
              aria-current={active ? 'page' : undefined}
              onClick={onNavigate}
              className={[
                'flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400',
                active
                  ? accentActive[accent]
                  : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white',
              ].join(' ')}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default function WorkspaceSidebar({
  config,
  pathname,
  onNavigate,
  className = '',
}: WorkspaceSidebarProps) {
  const accent = getWorkspaceAccent(config.role);

  return (
    <aside
      className={[
        'flex h-full w-64 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900',
        className,
      ].join(' ')}
      aria-label={`${config.brandTitle} navigation`}
    >
      <div className="border-b border-zinc-200 px-4 py-5 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <span
            className={[
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
              accentBrand[accent],
            ].join(' ')}
          >
            <Store className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-zinc-900 dark:text-white">
              {config.brandTitle}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Workspace
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Workspace sections">
        <NavList
          items={config.navItems}
          pathname={pathname}
          homePath={config.homePath}
          accent={accent}
          onNavigate={onNavigate}
        />
      </nav>

      <div className="border-t border-zinc-200 px-3 py-4 dark:border-zinc-800">
        <Link
          href={config.marketplaceHref}
          onClick={onNavigate}
          className="flex items-center rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
        >
          {config.marketplaceLabel}
        </Link>
      </div>
    </aside>
  );
}
