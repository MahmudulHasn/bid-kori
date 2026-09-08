import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BIDDING_VOLUME_LABEL,
  isAnalyticsRevenueLabel,
} from './adminAnalytics.ts';
import {
  ADMIN_FINANCE_SUMMARY_API_PATH,
  COMPLETED_CHECKOUT_VOLUME_LABEL,
  PLATFORM_REVENUE_LABEL,
  SELLER_NET_TOTAL_LABEL,
  hasLegacyAdminPayments,
  isPlatformRevenueLabel,
  normalizeAdminFinancialSummary,
} from './adminFinance.ts';

test('admin finance summary API path', () => {
  assert.equal(ADMIN_FINANCE_SUMMARY_API_PATH, '/admin/finance/summary/');
});

test('normalize admin financial summary', () => {
  const summary = normalizeAdminFinancialSummary({
    completed_sales_count: 3,
    gross_paid_volume: '3000.00',
    platform_revenue: '100.00',
    seller_net_total: '1900.00',
    accounted_sales_count: 2,
    legacy_completed_sales_count: 1,
    legacy_gross_paid_volume: '1000.00',
    disclosure: 'mock ledger',
  });
  assert.equal(summary.platform_revenue, '100.00');
  assert.equal(summary.gross_paid_volume, '3000.00');
  assert.equal(summary.seller_net_total, '1900.00');
  assert.ok(hasLegacyAdminPayments(summary));
});

test('platform revenue labels stay distinct from bidding volume', () => {
  assert.equal(isPlatformRevenueLabel(PLATFORM_REVENUE_LABEL), true);
  assert.equal(isPlatformRevenueLabel(BIDDING_VOLUME_LABEL), false);
  assert.equal(isAnalyticsRevenueLabel(BIDDING_VOLUME_LABEL), false);
  assert.notEqual(COMPLETED_CHECKOUT_VOLUME_LABEL, BIDDING_VOLUME_LABEL);
  assert.notEqual(PLATFORM_REVENUE_LABEL, BIDDING_VOLUME_LABEL);
  assert.match(SELLER_NET_TOTAL_LABEL, /seller net/i);
});
