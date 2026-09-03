import assert from 'node:assert/strict';
import test from 'node:test';

import { getRoleHome } from './authRouting.ts';
import {
  WORKSPACE_CONFIGS,
  getRoleDisplayLabel,
  getWorkspaceConfig,
  getWorkspaceNavLabel,
  isNavItemActive,
  isNavItemNavigable,
} from './workspaceNavigation.ts';
import type { UserRole } from './types.ts';

const BUYER_ONLY = new Set([
  'my-bids',
  'won-auctions',
  'watchlist',
]);
const SELLER_ONLY = new Set(['products']);
const ADMIN_ONLY = new Set([
  'users',
  'bids',
  'categories',
  'reports',
]);

test('getRoleHome remains the canonical role→home mapping', () => {
  assert.equal(getRoleHome('BUYER'), '/buyer');
  assert.equal(getRoleHome('SELLER'), '/seller');
  assert.equal(getRoleHome('ADMIN'), '/admin');
  assert.equal(WORKSPACE_CONFIGS.BUYER.homePath, getRoleHome('BUYER'));
  assert.equal(WORKSPACE_CONFIGS.SELLER.homePath, getRoleHome('SELLER'));
  assert.equal(WORKSPACE_CONFIGS.ADMIN.homePath, getRoleHome('ADMIN'));
});

test('dashboard path is correct for every role', () => {
  for (const role of ['BUYER', 'SELLER', 'ADMIN'] as const) {
    const config = getWorkspaceConfig(role);
    const dashboard = config.navItems.find((item) => item.id === 'dashboard');
    assert.ok(dashboard);
    assert.equal(dashboard.enabled, true);
    assert.equal(dashboard.href, getRoleHome(role));
    assert.equal(config.homePath, getRoleHome(role));
  }
});

test('buyer config does not contain seller/admin-only items', () => {
  const ids = new Set(WORKSPACE_CONFIGS.BUYER.navItems.map((item) => item.id));
  for (const id of SELLER_ONLY) {
    // "products" is seller-only; buyer must not list a Products section
    if (id === 'products') {
      assert.equal(ids.has('products'), false);
    }
  }
  for (const id of ADMIN_ONLY) {
    assert.equal(ids.has(id), false);
  }
  assert.ok(ids.has('my-bids'));
  assert.ok(ids.has('won-auctions'));
  assert.ok(ids.has('watchlist'));
  assert.equal(WORKSPACE_CONFIGS.BUYER.brandTitle, 'BidKori Buyer');
  const myBids = WORKSPACE_CONFIGS.BUYER.navItems.find((item) => item.id === 'my-bids');
  assert.equal(myBids?.enabled, true);
  assert.equal(myBids?.href, '/buyer/my-bids');
  const won = WORKSPACE_CONFIGS.BUYER.navItems.find((item) => item.id === 'won-auctions');
  assert.equal(won?.enabled, true);
  assert.equal(won?.href, '/buyer/won');
});

test('seller config does not contain buyer/admin-only items', () => {
  const ids = new Set(WORKSPACE_CONFIGS.SELLER.navItems.map((item) => item.id));
  for (const id of BUYER_ONLY) {
    assert.equal(ids.has(id), false);
  }
  for (const id of ADMIN_ONLY) {
    assert.equal(ids.has(id), false);
  }
  assert.ok(ids.has('products'));
  assert.ok(ids.has('auctions'));
  assert.ok(ids.has('analytics'));
  assert.equal(WORKSPACE_CONFIGS.SELLER.brandTitle, 'BidKori Seller');
});

test('admin config does not contain buyer/seller-only items', () => {
  const ids = new Set(WORKSPACE_CONFIGS.ADMIN.navItems.map((item) => item.id));
  for (const id of BUYER_ONLY) {
    assert.equal(ids.has(id), false);
  }
  // Seller-only "products" conflicts with admin Products IA — admin may have
  // products, but must not include buyer-only sections.
  assert.equal(ids.has('my-bids'), false);
  assert.equal(ids.has('won-auctions'), false);
  assert.equal(ids.has('watchlist'), false);
  assert.ok(ids.has('users'));
  assert.ok(ids.has('bids'));
  assert.ok(ids.has('categories'));
  assert.ok(ids.has('reports'));
  assert.equal(WORKSPACE_CONFIGS.ADMIN.brandTitle, 'BidKori Admin');
});

test('active-route detection handles nested paths', () => {
  const sellerHome = getRoleHome('SELLER');
  const dashboard = { href: '/seller', enabled: true as const };
  const products = { href: '/seller/products', enabled: true as const };
  const buyerHome = getRoleHome('BUYER');
  const myBids = { href: '/buyer/my-bids', enabled: true as const };
  const won = { href: '/buyer/won', enabled: true as const };

  assert.equal(isNavItemActive('/seller', dashboard, sellerHome), true);
  assert.equal(isNavItemActive('/seller/', dashboard, sellerHome), true);
  assert.equal(
    isNavItemActive('/seller/products', dashboard, sellerHome),
    false,
  );
  assert.equal(
    isNavItemActive('/seller/products/42', dashboard, sellerHome),
    false,
  );
  assert.equal(
    isNavItemActive('/seller/products', products, sellerHome),
    true,
  );
  assert.equal(
    isNavItemActive('/seller/products/42', products, sellerHome),
    true,
  );
  assert.equal(isNavItemActive('/seller', products, sellerHome), false);
  assert.equal(isNavItemActive('/buyer/my-bids', myBids, buyerHome), true);
  assert.equal(
    isNavItemActive('/buyer/my-bids', { href: '/buyer', enabled: true }, buyerHome),
    false,
  );
  assert.equal(isNavItemActive('/buyer/won', won, buyerHome), true);
  assert.equal(
    isNavItemActive('/buyer/won', { href: '/buyer', enabled: true }, buyerHome),
    false,
  );
  assert.equal(isNavItemActive('/buyer/won', myBids, buyerHome), false);
});

test('disabled items cannot be treated as navigable', () => {
  const disabled = { id: 'watchlist', label: 'Watchlist', enabled: false };
  const missingHref = {
    id: 'profile',
    label: 'Profile',
    enabled: true,
  };
  const emptyHref = {
    id: 'settings',
    label: 'Settings',
    enabled: true,
    href: '',
  };
  const enabled = {
    id: 'dashboard',
    label: 'Dashboard',
    enabled: true,
    href: '/buyer',
  };

  assert.equal(isNavItemNavigable(disabled), false);
  assert.equal(isNavItemNavigable(missingHref), false);
  assert.equal(isNavItemNavigable(emptyHref), false);
  assert.equal(isNavItemNavigable(enabled), true);
  assert.equal(
    isNavItemActive('/buyer', disabled, '/buyer'),
    false,
  );
});

test('role display labels and public workspace labels are correct', () => {
  const roles: UserRole[] = ['BUYER', 'SELLER', 'ADMIN'];
  assert.deepEqual(
    roles.map(getRoleDisplayLabel),
    ['Buyer', 'Seller', 'Admin'],
  );
  assert.equal(getWorkspaceNavLabel('BUYER'), 'My Workspace');
  assert.equal(getWorkspaceNavLabel('SELLER'), 'Seller Dashboard');
  assert.equal(getWorkspaceNavLabel('ADMIN'), 'Admin Dashboard');
});

test('every workspace shares Browse Marketplace to public auctions', () => {
  for (const role of ['BUYER', 'SELLER', 'ADMIN'] as const) {
    const config = getWorkspaceConfig(role);
    assert.equal(config.marketplaceHref, '/auctions');
    assert.equal(config.marketplaceLabel, 'Browse Marketplace');
  }
});
