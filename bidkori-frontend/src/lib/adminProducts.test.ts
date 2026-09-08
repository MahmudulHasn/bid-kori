import assert from 'node:assert/strict';
import test from 'node:test';

import { getRoleHome } from './authRouting.ts';
import {
  ADMIN_PRODUCTS_PATH,
  ADMIN_PRODUCT_READ_METHODS,
  ADMIN_PRODUCT_READONLY_COPY,
  adminProductAllowsMutationUi,
  adminProductDetailPath,
  filterAdminProducts,
  formatAdminProductCategory,
  formatAdminProductSeller,
  getAdminLinkedAuctionSummary,
  sortAdminProducts,
} from './adminProducts.ts';
import {
  PRODUCT_CREATE_API_PATH,
  productUpdateApiPath,
} from './seller.ts';
import type { Auction, Product } from './types.ts';
import {
  ADMIN_PRODUCTS_PATH as NAV_ADMIN_PRODUCTS_PATH,
  WORKSPACE_CONFIGS,
  getWorkspaceAccountPaths,
  isNavItemActive,
} from './workspaceNavigation.ts';

test('admin product list and detail API paths are GET catalog routes', () => {
  assert.equal(PRODUCT_CREATE_API_PATH, '/products/');
  assert.equal(productUpdateApiPath(42), '/products/42/');
  assert.deepEqual([...ADMIN_PRODUCT_READ_METHODS], ['GET']);
});

test('admin product pages introduce no Admin PATCH/DELETE helpers', () => {
  assert.equal(adminProductAllowsMutationUi(), false);
  assert.match(ADMIN_PRODUCT_READONLY_COPY.toLowerCase(), /read-only/);
  assert.equal(
    /\bdelete product\b|\bedit product\b|\bpatch\b/i.test(
      ADMIN_PRODUCT_READONLY_COPY,
    ),
    false,
  );
});

test('admin product route helpers', () => {
  assert.equal(ADMIN_PRODUCTS_PATH, '/admin/products');
  assert.equal(adminProductDetailPath(9), '/admin/products/9');
  assert.equal(NAV_ADMIN_PRODUCTS_PATH, '/admin/products');
});

test('seller identity formatting uses Seller ID when only PK is available', () => {
  assert.equal(formatAdminProductSeller(17), 'Seller ID #17');
  assert.equal(formatAdminProductSeller('17'), 'Seller ID #17');
  assert.equal(formatAdminProductSeller(null), 'Unavailable');
  assert.equal(formatAdminProductSeller(undefined), 'Unavailable');
});

test('category formatting never invents names', () => {
  assert.equal(formatAdminProductCategory(3), 'Category ID #3');
  assert.equal(formatAdminProductCategory(null), null);
  assert.equal(formatAdminProductCategory(undefined), null);
});

test('client-side product search and sorts do not mutate sources', () => {
  const products: Product[] = [
    {
      id: 2,
      title: 'Zebra Lamp',
      description: 'vintage',
      condition: 'USED_GOOD',
      seller: 10,
      created_at: '2026-01-02T00:00:00Z',
    },
    {
      id: 1,
      title: 'Apple Watch',
      description: 'new box',
      condition: 'NEW',
      seller: 99,
      created_at: '2026-01-01T00:00:00Z',
    },
  ];
  const frozen = products.map((p) => ({ ...p }));

  assert.equal(filterAdminProducts(products, 'zebra').length, 1);
  assert.equal(filterAdminProducts(products, '99')[0]?.id, 1);
  assert.equal(filterAdminProducts(products, 'seller id #10')[0]?.id, 2);
  assert.equal(filterAdminProducts([], 'x').length, 0);

  assert.deepEqual(
    sortAdminProducts(products, 'newest').map((p) => p.id),
    [2, 1],
  );
  assert.deepEqual(
    sortAdminProducts(products, 'oldest').map((p) => p.id),
    [1, 2],
  );
  assert.deepEqual(
    sortAdminProducts(products, 'title-asc').map((p) => p.id),
    [1, 2],
  );
  assert.deepEqual(
    sortAdminProducts(products, 'title-desc').map((p) => p.id),
    [2, 1],
  );
  assert.deepEqual(products, frozen);
});

test('cross-owner products remain visible; mutation UI never offered', () => {
  const otherSellerProduct: Product = {
    id: 50,
    title: 'Other seller item',
    seller: 777,
  };
  assert.equal(
    formatAdminProductSeller(otherSellerProduct.seller),
    'Seller ID #777',
  );
  assert.equal(adminProductAllowsMutationUi(), false);
});

test('linked auction summary uses catalog without inventing links', () => {
  const auctions: Auction[] = [
    {
      id: 8,
      current_highest_bid: 10,
      status: 'ACTIVE',
      product: { id: 50, title: 'X' },
    },
  ];
  assert.deepEqual(getAdminLinkedAuctionSummary(50, auctions), {
    id: 8,
    statusLabel: 'Active',
  });
  assert.equal(getAdminLinkedAuctionSummary(51, auctions), null);
});

test('admin products navigation is enabled with nested active state', () => {
  const admin = WORKSPACE_CONFIGS.ADMIN;
  const products = admin.navItems.find((item) => item.id === 'products');
  assert.equal(products?.enabled, true);
  assert.equal(products?.href, '/admin/products');

  const home = getRoleHome('ADMIN');
  assert.equal(isNavItemActive('/admin/products', products!, home), true);
  assert.equal(isNavItemActive('/admin/products/42', products!, home), true);

  for (const id of [
    'dashboard',
    'users',
    'profile',
    'settings',
    'products',
    'auctions',
    'bids',
    'analytics',
  ]) {
    assert.equal(admin.navItems.find((item) => item.id === id)?.enabled, true);
  }
  for (const id of ['categories', 'reports']) {
    assert.equal(admin.navItems.find((item) => item.id === id)?.enabled, false);
  }

  assert.deepEqual(getWorkspaceAccountPaths('ADMIN'), {
    profile: '/admin/profile',
    settings: '/admin/settings',
  });
});
