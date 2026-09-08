import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LEGACY_SALE_FEE_UNAVAILABLE,
  SELLER_EARNINGS_API_PATH,
  SELLER_FINANCE_DISCLOSURE,
  SELLER_LEGACY_FEE_NOTE,
  SELLER_SALES_API_PATH,
  SELLER_SALES_PATH,
  buildSellerSalesApiPath,
  formatFeeRateDisplay,
  hasLegacySellerSales,
  isLegacySaleRow,
  isPayoutControlLabel,
  normalizeSellerEarnings,
  normalizeSellerSaleRow,
  normalizeSellerSalesList,
  parseSellerSalesPageParam,
} from './sellerFinance.ts';
import { WORKSPACE_CONFIGS } from './workspaceNavigation.ts';

test('seller finance API paths and page route', () => {
  assert.equal(SELLER_SALES_PATH, '/seller/sales');
  assert.equal(SELLER_EARNINGS_API_PATH, '/seller/earnings/');
  assert.equal(SELLER_SALES_API_PATH, '/seller/sales/');
  assert.equal(buildSellerSalesApiPath(1), '/seller/sales/');
  assert.equal(buildSellerSalesApiPath(2), '/seller/sales/?page=2');
  assert.equal(parseSellerSalesPageParam('3'), 3);
  assert.equal(parseSellerSalesPageParam('nope'), 1);
});

test('seller nav includes Sales', () => {
  const sales = WORKSPACE_CONFIGS.SELLER.navItems.find((item) => item.id === 'sales');
  assert.equal(sales?.enabled, true);
  assert.equal(sales?.href, SELLER_SALES_PATH);
});

test('normalize seller earnings keeps money as strings', () => {
  const earnings = normalizeSellerEarnings({
    completed_sales_count: 2,
    gross_sales: '3000.00',
    platform_fees: '100.00',
    net_earnings: '1900.00',
    accounted_sales_count: 1,
    legacy_completed_sales_count: 1,
    legacy_gross_sales: '1000.00',
    disclosure: 'mock',
  });
  assert.equal(earnings.gross_sales, '3000.00');
  assert.equal(earnings.platform_fees, '100.00');
  assert.equal(earnings.net_earnings, '1900.00');
  assert.equal(earnings.legacy_completed_sales_count, 1);
  assert.ok(hasLegacySellerSales(earnings));
});

test('legacy sale row rendering helpers', () => {
  const legacy = normalizeSellerSaleRow({
    payment_id: 1,
    auction_id: 9,
    auction_title: 'Old',
    buyer_username: 'buyer',
    amount: '1000.00',
    fee_rate: null,
    platform_fee: null,
    seller_net_amount: null,
    status: 'COMPLETED',
    created_at: '2026-01-01T00:00:00Z',
    has_fee_snapshot: false,
  });
  assert.ok(legacy);
  assert.equal(isLegacySaleRow(legacy!), true);
  assert.equal(formatFeeRateDisplay(null), '—');
  assert.match(LEGACY_SALE_FEE_UNAVAILABLE, /legacy/i);
  assert.match(SELLER_LEGACY_FEE_NOTE, /predate fee tracking/i);
});

test('normalize sales list', () => {
  const list = normalizeSellerSalesList({
    count: 1,
    next: null,
    previous: null,
    results: [
      {
        payment_id: 2,
        auction_id: 3,
        auction_title: 'New',
        buyer_username: 'buyer',
        amount: '2000.00',
        fee_rate: '5.00',
        platform_fee: '100.00',
        seller_net_amount: '1900.00',
        status: 'COMPLETED',
        created_at: '2026-01-02T00:00:00Z',
        has_fee_snapshot: true,
      },
    ],
  });
  assert.equal(list.count, 1);
  assert.equal(list.results[0]?.platform_fee, '100.00');
  assert.equal(formatFeeRateDisplay('5.00'), '5.00%');
  assert.equal(isLegacySaleRow(list.results[0]!), false);
});

test('no payout control labels in seller finance copy', () => {
  assert.equal(isPayoutControlLabel('Net Earnings'), false);
  assert.equal(isPayoutControlLabel('Withdraw'), true);
  assert.equal(isPayoutControlLabel('Available Balance'), true);
  assert.match(SELLER_FINANCE_DISCLOSURE, /mock checkout/i);
  assert.match(SELLER_FINANCE_DISCLOSURE, /not a withdrawable balance/i);
  assert.doesNotMatch(SELLER_FINANCE_DISCLOSURE, /\bwithdraw\b(?!able)/i);
});

test('buyer workspace has no sales/earnings nav', () => {
  assert.equal(
    WORKSPACE_CONFIGS.BUYER.navItems.some((item) => item.id === 'sales'),
    false,
  );
  assert.equal(
    WORKSPACE_CONFIGS.BUYER.navItems.some((item) =>
      (item.href ?? '').includes('earnings'),
    ),
    false,
  );
});
