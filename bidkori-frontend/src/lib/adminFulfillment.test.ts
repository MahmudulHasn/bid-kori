/**
 * Tests for Admin Fulfillment types and pure helpers (ADMIN-W01).
 */

import { describe, it, assert } from 'vitest';

import {
  ADMIN_FULFILLMENT_PATH,
  ADMIN_FULFILLMENT_API_PATH,
  ADMIN_FULFILLMENT_SUMMARY_API_PATH,
  FULFILLMENT_STATUSES,
  FULFILLMENT_STATUS_BADGES,
  ADMIN_EXCLUDED_PII_FIELDS,
  FULFILLMENT_FILTER_OPTIONS,
  UNLOCK_FILTER_OPTIONS,
  adminFulfillmentDetailPath,
  adminFulfillmentDetailApiPath,
  getFulfillmentStatusBadge,
  isIntegrityWarning,
  getUnlockStatusLabel,
  formatFulfillmentMoney,
} from './adminFulfillment';

describe('Admin Fulfillment – Routes', () => {
  it('exports correct fulfillment page path', () => {
    assert.equal(ADMIN_FULFILLMENT_PATH, '/admin/fulfillment');
  });

  it('exports correct API path', () => {
    assert.equal(ADMIN_FULFILLMENT_API_PATH, '/admin/fulfillment/');
  });

  it('exports correct summary API path', () => {
    assert.equal(ADMIN_FULFILLMENT_SUMMARY_API_PATH, '/admin/fulfillment/summary/');
  });

  it('builds detail page path', () => {
    assert.equal(adminFulfillmentDetailPath(42), '/admin/fulfillment/42');
  });

  it('builds detail API path', () => {
    assert.equal(adminFulfillmentDetailApiPath(42), '/admin/fulfillment/42/');
  });
});

describe('Admin Fulfillment – Status Badges', () => {
  it('has badges for all 4 derived statuses', () => {
    assert.equal(FULFILLMENT_STATUSES.length, 4);
    for (const status of FULFILLMENT_STATUSES) {
      const badge = FULFILLMENT_STATUS_BADGES[status];
      assert.ok(badge, `Missing badge for ${status}`);
      assert.ok(badge.label.length > 0, `Empty label for ${status}`);
      assert.ok(badge.className.length > 0, `Empty className for ${status}`);
    }
  });

  it('getFulfillmentStatusBadge returns correct badge', () => {
    assert.equal(getFulfillmentStatusBadge('NOT_STARTED').label, 'Not Started');
    assert.equal(getFulfillmentStatusBadge('DRAFT').label, 'In Progress');
    assert.equal(getFulfillmentStatusBadge('COMPLETED_LOCKED').label, 'Ready to Unlock');
    assert.equal(getFulfillmentStatusBadge('UNLOCKED').label, 'Unlocked');
  });

  it('getFulfillmentStatusBadge falls back for unknown status', () => {
    const badge = getFulfillmentStatusBadge('UNKNOWN');
    assert.equal(badge.label, 'UNKNOWN');
  });
});

describe('Admin Fulfillment – Integrity', () => {
  it('isIntegrityWarning returns true for WARNING', () => {
    assert.isTrue(isIntegrityWarning('WARNING'));
  });

  it('isIntegrityWarning returns false for OK', () => {
    assert.isFalse(isIntegrityWarning('OK'));
  });
});

describe('Admin Fulfillment – Unlock Status Labels', () => {
  it('returns correct labels', () => {
    assert.equal(getUnlockStatusLabel('PAID'), 'Paid');
    assert.equal(getUnlockStatusLabel('PENDING'), 'Pending');
    assert.equal(getUnlockStatusLabel('FAILED'), 'Failed');
    assert.equal(getUnlockStatusLabel(null), '—');
    assert.equal(getUnlockStatusLabel(undefined), '—');
  });
});

describe('Admin Fulfillment – PII Exclusion', () => {
  it('documents all PII fields that must be excluded', () => {
    const expected = [
      'phone', 'email', 'full_name', 'address_line', 'area',
      'district', 'division', 'postal_code', 'delivery_note',
    ];
    assert.deepEqual([...ADMIN_EXCLUDED_PII_FIELDS], expected);
  });
});

describe('Admin Fulfillment – Filters', () => {
  it('has fulfillment filter options including "All"', () => {
    assert.ok(FULFILLMENT_FILTER_OPTIONS.length >= 5);
    assert.equal(FULFILLMENT_FILTER_OPTIONS[0].value, '');
  });

  it('has unlock filter options including "All"', () => {
    assert.ok(UNLOCK_FILTER_OPTIONS.length >= 4);
    assert.equal(UNLOCK_FILTER_OPTIONS[0].value, '');
  });
});

describe('Admin Fulfillment – Money Formatting', () => {
  it('formats BDT amounts', () => {
    assert.equal(formatFulfillmentMoney('99.50'), '৳99.50');
  });

  it('returns zero for null/undefined', () => {
    assert.equal(formatFulfillmentMoney(null), '৳0.00');
    assert.equal(formatFulfillmentMoney(undefined), '৳0.00');
  });

  it('returns zero for 0.00', () => {
    assert.equal(formatFulfillmentMoney('0.00'), '৳0.00');
  });
});
