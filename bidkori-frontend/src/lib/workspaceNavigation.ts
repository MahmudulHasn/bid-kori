/**
 * Canonical role-workspace navigation IA and pure helpers.
 * Routes marked `enabled: false` are shown as coming-soon (not navigable).
 */

import type { UserRole } from './types.ts';
import { getRoleHome } from './authRouting.ts';

export type WorkspaceNavItem = {
  id: string;
  label: string;
  /** Present only when the route exists and is navigable. */
  href?: string;
  enabled: boolean;
};

export type WorkspaceConfig = {
  role: UserRole;
  brandTitle: string;
  dashboardTitle: string;
  homePath: string;
  marketplaceHref: string;
  marketplaceLabel: string;
  navItems: readonly WorkspaceNavItem[];
};

const MARKETPLACE_HREF = '/auctions';
const MARKETPLACE_LABEL = 'Browse Marketplace';

/** Canonical Buyer account routes (Seller/Admin account pages do not exist yet). */
export const BUYER_PROFILE_PATH = '/buyer/profile';
export const BUYER_SETTINGS_PATH = '/buyer/settings';
export const SELLER_PRODUCTS_PATH = '/seller/products';
export const SELLER_PRODUCT_CREATE_PATH = '/seller/products/create';
export const SELLER_AUCTIONS_PATH = '/seller/auctions';

const BUYER_NAV: readonly WorkspaceNavItem[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/buyer', enabled: true },
  { id: 'my-bids', label: 'My Bids', href: '/buyer/my-bids', enabled: true },
  { id: 'won-auctions', label: 'Won Auctions', href: '/buyer/won', enabled: true },
  { id: 'watchlist', label: 'Watchlist', enabled: false },
  { id: 'profile', label: 'Profile', href: BUYER_PROFILE_PATH, enabled: true },
  { id: 'settings', label: 'Settings', href: BUYER_SETTINGS_PATH, enabled: true },
];

const SELLER_NAV: readonly WorkspaceNavItem[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/seller', enabled: true },
  { id: 'products', label: 'Products', href: SELLER_PRODUCTS_PATH, enabled: true },
  { id: 'auctions', label: 'Auctions', href: SELLER_AUCTIONS_PATH, enabled: true },
  { id: 'analytics', label: 'Analytics', enabled: false },
  { id: 'profile', label: 'Profile', enabled: false },
  { id: 'settings', label: 'Settings', enabled: false },
];

const ADMIN_NAV: readonly WorkspaceNavItem[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/admin', enabled: true },
  { id: 'users', label: 'Users', enabled: false },
  { id: 'products', label: 'Products', enabled: false },
  { id: 'auctions', label: 'Auctions', enabled: false },
  { id: 'bids', label: 'Bids', enabled: false },
  { id: 'categories', label: 'Categories', enabled: false },
  { id: 'reports', label: 'Reports', enabled: false },
  { id: 'analytics', label: 'Analytics', enabled: false },
  { id: 'settings', label: 'Settings', enabled: false },
];

export const WORKSPACE_CONFIGS: Record<UserRole, WorkspaceConfig> = {
  BUYER: {
    role: 'BUYER',
    brandTitle: 'BidKori Buyer',
    dashboardTitle: 'Buyer Dashboard',
    homePath: getRoleHome('BUYER'),
    marketplaceHref: MARKETPLACE_HREF,
    marketplaceLabel: MARKETPLACE_LABEL,
    navItems: BUYER_NAV,
  },
  SELLER: {
    role: 'SELLER',
    brandTitle: 'BidKori Seller',
    dashboardTitle: 'Seller Dashboard',
    homePath: getRoleHome('SELLER'),
    marketplaceHref: MARKETPLACE_HREF,
    marketplaceLabel: MARKETPLACE_LABEL,
    navItems: SELLER_NAV,
  },
  ADMIN: {
    role: 'ADMIN',
    brandTitle: 'BidKori Admin',
    dashboardTitle: 'Admin Dashboard',
    homePath: getRoleHome('ADMIN'),
    marketplaceHref: MARKETPLACE_HREF,
    marketplaceLabel: MARKETPLACE_LABEL,
    navItems: ADMIN_NAV,
  },
};

/** Human-readable role label for UI (never use raw enum as primary copy). */
export function getRoleDisplayLabel(role: UserRole): string {
  switch (role) {
    case 'BUYER':
      return 'Buyer';
    case 'SELLER':
      return 'Seller';
    case 'ADMIN':
      return 'Admin';
  }
}

export function getWorkspaceConfig(role: UserRole): WorkspaceConfig {
  return WORKSPACE_CONFIGS[role];
}

/**
 * Account-area paths that currently exist for a workspace.
 * Seller/Admin profile and settings pages are not implemented — omit hrefs
 * rather than linking to missing routes.
 */
export function getWorkspaceAccountPaths(role: UserRole): {
  profile?: string;
  settings?: string;
} {
  if (role === 'BUYER') {
    return {
      profile: BUYER_PROFILE_PATH,
      settings: BUYER_SETTINGS_PATH,
    };
  }
  return {};
}

export function sellerProductDetailPath(id: string | number): string {
  return `${SELLER_PRODUCTS_PATH}/${id}`;
}

export function sellerProductEditPath(id: string | number): string {
  return `${SELLER_PRODUCTS_PATH}/${id}/edit`;
}

export function sellerAuctionDetailPath(id: string | number): string {
  return `${SELLER_AUCTIONS_PATH}/${id}`;
}

/** True when an item is safe to navigate (enabled + href). */
export function isNavItemNavigable(
  item: Pick<WorkspaceNavItem, 'enabled' | 'href'>,
): item is WorkspaceNavItem & { enabled: true; href: string } {
  return item.enabled === true && typeof item.href === 'string' && item.href.length > 0;
}

/**
 * Pathname-aware active state that supports nested routes.
 * Dashboard (homePath) is exact-match only so `/seller/products` does not
 * keep Dashboard highlighted.
 */
export function isNavItemActive(
  pathname: string,
  item: Pick<WorkspaceNavItem, 'href' | 'enabled'>,
  homePath: string,
): boolean {
  if (!isNavItemNavigable(item)) {
    return false;
  }
  const { href } = item;
  if (href === homePath) {
    return pathname === homePath || pathname === `${homePath}/`;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Public navbar label for returning to the role workspace. */
export function getWorkspaceNavLabel(role: UserRole): string {
  switch (role) {
    case 'BUYER':
      return 'My Workspace';
    case 'SELLER':
      return 'Seller Dashboard';
    case 'ADMIN':
      return 'Admin Dashboard';
  }
}

/** Accent token for subtle role identity within the same design system. */
export function getWorkspaceAccent(role: UserRole): 'amber' | 'sky' | 'violet' {
  switch (role) {
    case 'BUYER':
      return 'amber';
    case 'SELLER':
      return 'sky';
    case 'ADMIN':
      return 'violet';
  }
}
