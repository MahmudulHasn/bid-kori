import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import {
  buildSellerWinnerDetailsPath,
  buildSellerWinnerDetailsStatusPath,
  buildSellerWinnerDetailsUnlockPath,
  canUnlockWinnerDetails,
  formatUnlockFee,
  isWinnerDetailsInProgress,
  isWinnerDetailsUnlocked,
  isWinnerDetailsWaitingForBuyer,
  normalizeSellerUnlockedWinnerDetails,
  normalizeSellerWinnerDetailsStatus,
} from './sellerWinnerDetails.ts';
import type { SellerWinnerDetailsStatus } from './types.ts';

describe('sellerWinnerDetails helpers', () => {
  test('builds correct seller winner details API routes', () => {
    assert.equal(
      buildSellerWinnerDetailsStatusPath(42),
      '/seller/auctions/42/winner-details/status/',
    );
    assert.equal(
      buildSellerWinnerDetailsUnlockPath(42),
      '/seller/auctions/42/winner-details/unlock/',
    );
    assert.equal(
      buildSellerWinnerDetailsPath(42),
      '/seller/auctions/42/winner-details/',
    );
  });

  test('formats unlock fee with BDT symbol by default', () => {
    assert.equal(formatUnlockFee('50.00'), '৳50.00');
    assert.equal(formatUnlockFee('50.00', 'BDT'), '৳50.00');
    assert.equal(formatUnlockFee(50), '৳50.00');
    assert.equal(formatUnlockFee('0.00'), '৳0.00');
    assert.equal(formatUnlockFee(null), '৳0.00');
    assert.equal(formatUnlockFee(undefined), '৳0.00');
    assert.equal(formatUnlockFee(''), '৳0.00');
    assert.equal(formatUnlockFee('25.50', 'USD'), 'USD 25.50');
  });

  test('state predicates correctly categorize fulfillment readiness', () => {
    const notStarted: SellerWinnerDetailsStatus = {
      auction_id: 1,
      winner_exists: true,
      details_status: 'NOT_STARTED',
      can_unlock: false,
      is_unlocked: false,
      unlock_fee: '50.00',
      currency: 'BDT',
    };
    assert.equal(isWinnerDetailsWaitingForBuyer(notStarted), true);
    assert.equal(isWinnerDetailsInProgress(notStarted), false);
    assert.equal(canUnlockWinnerDetails(notStarted), false);
    assert.equal(isWinnerDetailsUnlocked(notStarted), false);

    const inProgress: SellerWinnerDetailsStatus = {
      ...notStarted,
      details_status: 'DRAFT',
    };
    assert.equal(isWinnerDetailsWaitingForBuyer(inProgress), false);
    assert.equal(isWinnerDetailsInProgress(inProgress), true);
    assert.equal(canUnlockWinnerDetails(inProgress), false);
    assert.equal(isWinnerDetailsUnlocked(inProgress), false);

    const readyToUnlock: SellerWinnerDetailsStatus = {
      ...notStarted,
      details_status: 'COMPLETED',
      can_unlock: true,
      is_unlocked: false,
    };
    assert.equal(isWinnerDetailsWaitingForBuyer(readyToUnlock), false);
    assert.equal(isWinnerDetailsInProgress(readyToUnlock), false);
    assert.equal(canUnlockWinnerDetails(readyToUnlock), true);
    assert.equal(isWinnerDetailsUnlocked(readyToUnlock), false);

    const alreadyUnlocked: SellerWinnerDetailsStatus = {
      ...readyToUnlock,
      is_unlocked: true,
      can_unlock: false,
    };
    assert.equal(isWinnerDetailsWaitingForBuyer(alreadyUnlocked), false);
    assert.equal(isWinnerDetailsInProgress(alreadyUnlocked), false);
    assert.equal(canUnlockWinnerDetails(alreadyUnlocked), false);
    assert.equal(isWinnerDetailsUnlocked(alreadyUnlocked), true);

    const noWinner: SellerWinnerDetailsStatus = {
      ...notStarted,
      winner_exists: false,
    };
    assert.equal(isWinnerDetailsWaitingForBuyer(noWinner), false);
    assert.equal(isWinnerDetailsInProgress(noWinner), false);
    assert.equal(canUnlockWinnerDetails(noWinner), false);
  });

  test('normalizeSellerWinnerDetailsStatus parses response and ensures zero PII fields', () => {
    const raw = {
      auction_id: 270,
      winner_exists: true,
      details_status: 'COMPLETED',
      can_unlock: true,
      is_unlocked: false,
      unlock_fee: '50.00',
      currency: 'BDT',
      // Attacker or rogue backend sending PII in status endpoint:
      full_name: 'Secret Buyer',
      phone: '01700000000',
      email: 'buyer@example.com',
      address_line: 'Secret Address',
    };

    const normalized = normalizeSellerWinnerDetailsStatus(raw);
    assert.ok(normalized);
    assert.equal(normalized.auction_id, 270);
    assert.equal(normalized.winner_exists, true);
    assert.equal(normalized.details_status, 'COMPLETED');
    assert.equal(normalized.can_unlock, true);
    assert.equal(normalized.is_unlocked, false);
    assert.equal(normalized.unlock_fee, '50.00');
    assert.equal(normalized.currency, 'BDT');

    // Verify PII is NOT attached to the normalized status object
    const normalizedKeys = Object.keys(normalized);
    assert.equal(normalizedKeys.includes('full_name'), false);
    assert.equal(normalizedKeys.includes('phone'), false);
    assert.equal(normalizedKeys.includes('email'), false);
    assert.equal(normalizedKeys.includes('address_line'), false);
  });

  test('normalizeSellerUnlockedWinnerDetails maps full fulfillment fields', () => {
    const raw = {
      auction_id: 270,
      buyer_username: 'demo_buyer_c',
      full_name: 'Demo Buyer C',
      phone: '01712345678',
      email: 'demo_buyer_c@bidkori.local',
      address_line: 'House 42, Road 7, Sector 3',
      area: 'Uttara',
      district: 'Dhaka',
      division: 'Dhaka',
      postal_code: '1230',
      preferred_contact_method: 'PHONE',
      delivery_note: 'Leave with guard',
      status: 'COMPLETED',
      submitted_at: '2026-09-23T12:00:00Z',
      created_at: '2026-09-23T11:00:00Z',
      updated_at: '2026-09-23T12:00:00Z',
    };

    const normalized = normalizeSellerUnlockedWinnerDetails(raw);
    assert.ok(normalized);
    assert.equal(normalized.auction_id, 270);
    assert.equal(normalized.buyer_username, 'demo_buyer_c');
    assert.equal(normalized.full_name, 'Demo Buyer C');
    assert.equal(normalized.phone, '01712345678');
    assert.equal(normalized.email, 'demo_buyer_c@bidkori.local');
    assert.equal(normalized.address_line, 'House 42, Road 7, Sector 3');
    assert.equal(normalized.area, 'Uttara');
    assert.equal(normalized.district, 'Dhaka');
    assert.equal(normalized.division, 'Dhaka');
    assert.equal(normalized.postal_code, '1230');
    assert.equal(normalized.preferred_contact_method, 'PHONE');
    assert.equal(normalized.delivery_note, 'Leave with guard');
  });

  test('normalizeSellerUnlockedWinnerDetails handles empty optional fields safely', () => {
    const raw = {
      auction_id: 270,
      buyer_username: 'demo_buyer_c',
      full_name: 'Demo Buyer C',
      phone: '01712345678',
      email: '',
      address_line: 'House 42, Road 7',
      area: 'Uttara',
      district: 'Dhaka',
      division: 'Dhaka',
      postal_code: '',
      preferred_contact_method: 'PHONE',
      delivery_note: null,
      status: 'COMPLETED',
    };

    const normalized = normalizeSellerUnlockedWinnerDetails(raw);
    assert.ok(normalized);
    assert.equal(normalized.email, undefined);
    assert.equal(normalized.postal_code, undefined);
    assert.equal(normalized.delivery_note, undefined);
  });
});
