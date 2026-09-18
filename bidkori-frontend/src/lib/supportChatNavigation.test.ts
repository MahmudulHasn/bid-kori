import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SAFE_ROUTE_REGISTRY,
  isApprovedInternalRoute,
} from './supportChatNavigation.ts';
import { getRoleBasedStarters } from './supportChat.ts';

test('approved internal routes validate correctly', () => {
  assert.equal(isApprovedInternalRoute('/'), true);
  assert.equal(isApprovedInternalRoute('/auctions'), true);
  assert.equal(isApprovedInternalRoute('/search'), true);
  assert.equal(isApprovedInternalRoute('/buyer/my-bids'), true);
  assert.equal(isApprovedInternalRoute('/buyer/won'), true);
  assert.equal(isApprovedInternalRoute('/seller/products'), true);
  assert.equal(isApprovedInternalRoute('/seller/sales'), true);
  assert.equal(isApprovedInternalRoute('/admin/users'), true);
  assert.equal(isApprovedInternalRoute('/admin/analytics'), true);
});

test('malicious and unsafe URLs are rejected by route validator', () => {
  assert.equal(isApprovedInternalRoute('javascript:alert(1)'), false);
  assert.equal(isApprovedInternalRoute('data:text/html,<script>'), false);
  assert.equal(isApprovedInternalRoute('https://evil.com'), false);
  assert.equal(isApprovedInternalRoute('http://evil.com/phish'), false);
  assert.equal(isApprovedInternalRoute('//evil.com'), false);
  assert.equal(isApprovedInternalRoute('/unknown/route'), false);
  assert.equal(isApprovedInternalRoute('/buyer/watchlist'), false);
  assert.equal(isApprovedInternalRoute(''), false);
});

test('role-based starters provide role-appropriate guidance', () => {
  const anonStarters = getRoleBasedStarters(null);
  assert.ok(anonStarters.some((s) => s.includes('place a bid')));
  assert.ok(anonStarters.some((s) => s.includes('reserve price')));

  const buyerStarters = getRoleBasedStarters('BUYER');
  assert.ok(buyerStarters.some((s) => s.includes('My Bids')));
  assert.ok(buyerStarters.some((s) => s.includes('won auctions')));

  const sellerStarters = getRoleBasedStarters('SELLER');
  assert.ok(sellerStarters.some((s) => s.includes('create a product') || s.includes('Create Product')));
  assert.ok(sellerStarters.some((s) => s.includes('sales') || s.includes('Sales')));

  const adminStarters = getRoleBasedStarters('ADMIN');
  assert.ok(adminStarters.some((s) => s.includes('user management') || s.includes('User Management')));
  assert.ok(adminStarters.some((s) => s.includes('analytics') || s.includes('Analytics')));
});

test('all routes in registry have allowed roles and default labels', () => {
  for (const entry of SAFE_ROUTE_REGISTRY) {
    assert.ok(entry.href.startsWith('/'));
    assert.ok(entry.roles.length > 0);
    assert.ok(entry.title.length > 0);
    assert.ok(entry.defaultLabel.length > 0);
    assert.ok(entry.description.length > 0);
  }
});
