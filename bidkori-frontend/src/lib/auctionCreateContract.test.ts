import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AUCTION_CREATE_API_PATH,
  DEFAULT_AUCTION_MIN_INCREMENT,
  SELLER_AUCTION_CREATE_FROM_EXISTING_PRODUCT_SUPPORTED,
  SELLER_AUCTION_CREATE_PATH,
  auctionFormValuesFromAuction,
  buildAuctionUpdatePayload,
  buildExistingProductAuctionPayload,
  datetimeLocalToIso,
  emptyAuctionFormValues,
  isoToDatetimeLocalValue,
  isPositiveMoneyString,
  isSellerAuctionCreateRouteEnabled,
  serializeExistingProductAuctionCreate,
  toDatetimeLocalValue,
  validateAuctionForm,
  type AuctionFormValues,
} from './auctionCreateContract.ts';
import {
  LEGACY_AUCTION_CREATE_PATH,
  SELLER_AUCTIONS_PATH,
  WORKSPACE_CONFIGS,
  isNavItemActive,
  sellerAuctionCreatePath,
} from './workspaceNavigation.ts';

test('existing-product auction creation is supported', () => {
  assert.equal(SELLER_AUCTION_CREATE_FROM_EXISTING_PRODUCT_SUPPORTED, true);
  assert.equal(isSellerAuctionCreateRouteEnabled(), true);
  assert.equal(SELLER_AUCTION_CREATE_PATH, '/seller/auctions/create');
  assert.equal(AUCTION_CREATE_API_PATH, '/auctions/');
  assert.equal(DEFAULT_AUCTION_MIN_INCREMENT, '100.00');
});

test('Seller create path nests under Auctions nav without a separate nav item', () => {
  const sellerAuctions = WORKSPACE_CONFIGS.SELLER.navItems.find(
    (item) => item.id === 'auctions',
  );
  assert.equal(sellerAuctions?.enabled, true);
  assert.equal(sellerAuctions?.href, SELLER_AUCTIONS_PATH);
  assert.notEqual(sellerAuctions?.href, SELLER_AUCTION_CREATE_PATH);
  assert.equal(
    isNavItemActive(
      '/seller/auctions/create',
      { href: SELLER_AUCTIONS_PATH, enabled: true },
      '/seller',
    ),
    true,
  );
  assert.equal(
    isNavItemActive(
      '/seller/auctions/create',
      { href: '/seller', enabled: true },
      '/seller',
    ),
    false,
  );
});

test('Seller auction create CTAs use the new route, not legacy create', () => {
  assert.equal(sellerAuctionCreatePath(), '/seller/auctions/create');
  assert.equal(
    sellerAuctionCreatePath(42),
    '/seller/auctions/create?product=42',
  );
  assert.equal(LEGACY_AUCTION_CREATE_PATH, '/auctions/create');
  assert.notEqual(sellerAuctionCreatePath(), LEGACY_AUCTION_CREATE_PATH);
  assert.notEqual(sellerAuctionCreatePath(7), LEGACY_AUCTION_CREATE_PATH);
});

test('payload includes product PK and money fields; omits blank reserve', () => {
  const values: AuctionFormValues = {
    starting_bid: '1000.00',
    min_increment: '100.00',
    reserve_price: '',
    start_time: '2026-09-04T10:00',
    end_time: '2026-09-05T10:00',
  };
  const snapshot = { ...values };
  const payload = buildExistingProductAuctionPayload(42, values);
  assert.deepEqual(values, snapshot);
  assert.equal(payload.product, 42);
  assert.equal(payload.starting_bid, '1000.00');
  assert.equal(payload.min_increment, '100.00');
  assert.equal('reserve_price' in payload, false);
  assert.ok(payload.start_time.includes('T'));
  assert.ok(payload.end_time.includes('T'));
  assert.equal('current_highest_bid' in payload, false);
  assert.equal('winning_bidder' in payload, false);
  assert.equal('status' in payload, false);
  assert.equal('is_paid' in payload, false);
  assert.equal('is_featured' in payload, false);
  assert.equal('seller' in payload, false);
  assert.equal('title' in payload, false);
  assert.equal('description' in payload, false);
  assert.equal('condition' in payload, false);
  assert.equal(typeof payload.product === 'number', true);
});

test('payload includes reserve when supplied; alias serializer returns same shape', () => {
  const values = emptyAuctionFormValues(new Date('2026-09-04T12:00:00'));
  values.starting_bid = '50.00';
  values.reserve_price = '150.00';
  const payload = serializeExistingProductAuctionCreate(9, values);
  assert.equal(payload.product, 9);
  assert.equal(payload.reserve_price, '150.00');
});

test('client validation covers product, money, and end after start', () => {
  const base = emptyAuctionFormValues(new Date('2026-09-04T12:00:00'));
  assert.ok(validateAuctionForm(base, null).product);
  assert.ok(validateAuctionForm(base, 1).starting_bid);

  const invalidStart = {
    ...base,
    starting_bid: '0',
    min_increment: '10.00',
  };
  assert.ok(validateAuctionForm(invalidStart, 1).starting_bid);

  const invalidInc = {
    ...base,
    starting_bid: '10.00',
    min_increment: '-1',
  };
  assert.ok(validateAuctionForm(invalidInc, 1).min_increment);

  const invalidReserve = {
    ...base,
    starting_bid: '10.00',
    min_increment: '1.00',
    reserve_price: '0',
  };
  assert.ok(validateAuctionForm(invalidReserve, 1).reserve_price);

  const badDates = {
    ...base,
    starting_bid: '10.00',
    min_increment: '1.00',
    start_time: '2026-09-05T10:00',
    end_time: '2026-09-05T10:00',
  };
  assert.ok(validateAuctionForm(badDates, 1).end_time);

  const valid: AuctionFormValues = {
    starting_bid: '100.00',
    min_increment: '10.00',
    reserve_price: '',
    start_time: '2026-09-10T09:00',
    end_time: '2026-09-12T09:00',
  };
  const snapshot = { ...valid };
  assert.deepEqual(validateAuctionForm(valid, 3), {});
  assert.deepEqual(valid, snapshot);
});

test('datetime helpers convert local wall time without inventing Z on input', () => {
  const local = toDatetimeLocalValue(new Date(2026, 8, 4, 14, 30));
  assert.equal(local, '2026-09-04T14:30');
  const iso = datetimeLocalToIso(local);
  assert.ok(iso);
  assert.ok(iso.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(iso));
  assert.equal(datetimeLocalToIso(''), null);
  assert.equal(isPositiveMoneyString('10.50'), true);
  assert.equal(isPositiveMoneyString('0'), false);
  assert.equal(isPositiveMoneyString('abc'), false);
});

test('edit payload includes safe fields; omits reserve unless changeReserve', () => {
  const values: AuctionFormValues = {
    starting_bid: '1000.00',
    min_increment: '50.00',
    reserve_price: '2000.00',
    start_time: '2026-09-04T10:00',
    end_time: '2026-09-05T10:00',
  };
  const snapshot = { ...values };

  const withoutReserve = buildAuctionUpdatePayload(values, {
    changeReserve: false,
  });
  assert.deepEqual(values, snapshot);
  assert.equal(withoutReserve.starting_bid, '1000.00');
  assert.equal(withoutReserve.min_increment, '50.00');
  assert.ok(withoutReserve.start_time.includes('T'));
  assert.ok(withoutReserve.end_time.includes('T'));
  assert.equal('reserve_price' in withoutReserve, false);
  assert.equal('product' in withoutReserve, false);
  assert.equal('product_id' in withoutReserve, false);
  assert.equal('current_highest_bid' in withoutReserve, false);
  assert.equal('winning_bidder' in withoutReserve, false);
  assert.equal('status' in withoutReserve, false);
  assert.equal('is_paid' in withoutReserve, false);
  assert.equal('is_featured' in withoutReserve, false);
  assert.equal('seller' in withoutReserve, false);

  const withReserve = buildAuctionUpdatePayload(values, {
    changeReserve: true,
  });
  assert.equal(withReserve.reserve_price, '2000.00');
  assert.deepEqual(values, snapshot);
});

test('edit validation skips product; reserve only when changeReserve', () => {
  const values: AuctionFormValues = {
    starting_bid: '100.00',
    min_increment: '10.00',
    reserve_price: '',
    start_time: '2026-09-10T09:00',
    end_time: '2026-09-12T09:00',
  };
  assert.deepEqual(
    validateAuctionForm(values, null, { mode: 'edit', changeReserve: false }),
    {},
  );
  assert.ok(
    validateAuctionForm(values, null, { mode: 'edit', changeReserve: true })
      .reserve_price,
  );
});

test('auctionFormValuesFromAuction prefills starting_bid not current_highest_bid', () => {
  const form = auctionFormValuesFromAuction({
    id: 1,
    starting_bid: '250.00',
    current_highest_bid: '999.00',
    min_increment: '25.00',
    start_time: '2026-09-04T14:30:00.000Z',
    end_time: '2026-09-05T14:30:00.000Z',
  });
  assert.equal(form.starting_bid, '250.00');
  assert.equal(form.min_increment, '25.00');
  assert.equal(form.reserve_price, '');
  assert.ok(form.start_time.length > 0);
  assert.ok(form.end_time.length > 0);
  assert.equal(isoToDatetimeLocalValue('2026-09-04T14:30:00.000Z'), form.start_time);
});
