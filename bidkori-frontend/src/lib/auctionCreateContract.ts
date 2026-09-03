/**
 * Seller Auction creation/edit against the existing-product API contract.
 *
 * POST /api/auctions/ accepts `product` as an existing Product PK.
 * PATCH /api/auctions/<id>/ updates configuration only while pre-freeze.
 * Nested Product create remains a legacy path only (`/auctions/create`).
 */

import type { Auction } from './types.ts';
import { SELLER_AUCTION_CREATE_PATH } from './workspaceNavigation.ts';

export { SELLER_AUCTION_CREATE_PATH };

/** Collection path: POST /api/auctions/. */
export const AUCTION_CREATE_API_PATH = '/auctions/';

/** Backend now supports attaching one Auction to an existing owned Product. */
export const SELLER_AUCTION_CREATE_FROM_EXISTING_PRODUCT_SUPPORTED = true;

/** Exact Django model default for `Auction.min_increment`. */
export const DEFAULT_AUCTION_MIN_INCREMENT = '100.00';

export type AuctionFormMode = 'create' | 'edit';

export type AuctionFormValues = {
  starting_bid: string;
  min_increment: string;
  reserve_price: string;
  /** `datetime-local` value in the user's local timezone. */
  start_time: string;
  /** `datetime-local` value in the user's local timezone. */
  end_time: string;
};

export type ExistingProductAuctionCreatePayload = {
  product: number;
  starting_bid: string;
  min_increment?: string;
  reserve_price?: string;
  start_time: string;
  end_time: string;
};

/** PATCH body — never includes product/seller/status/server fields. */
export type AuctionUpdatePayload = {
  starting_bid: string;
  min_increment: string;
  start_time: string;
  end_time: string;
  reserve_price?: string;
};

export type AuctionFormField = keyof AuctionFormValues | 'product';

/** True when Seller UI may expose `/seller/auctions/create`. */
export function isSellerAuctionCreateRouteEnabled(): boolean {
  return SELLER_AUCTION_CREATE_FROM_EXISTING_PRODUCT_SUPPORTED;
}

/** Format a Date as a `datetime-local` input value (local wall time). */
export function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Convert an API ISO timestamp into a `datetime-local` wall-time value.
 * Uses the browser local timezone (same convention as create).
 */
export function isoToDatetimeLocalValue(iso: string | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return toDatetimeLocalValue(date);
}

/**
 * Convert a `datetime-local` string to an ISO-8601 UTC string for the API.
 * `new Date(localWithoutZ)` uses the browser's local timezone — do not append `Z`.
 */
export function datetimeLocalToIso(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/** Prefill edit form from Auction detail. Reserve stays blank (write-only). */
export function auctionFormValuesFromAuction(auction: Auction): AuctionFormValues {
  const starting =
    auction.starting_bid != null ? String(auction.starting_bid) : '';
  const increment =
    auction.min_increment != null
      ? String(auction.min_increment)
      : DEFAULT_AUCTION_MIN_INCREMENT;
  return {
    starting_bid: starting,
    min_increment: increment,
    reserve_price: '',
    start_time: isoToDatetimeLocalValue(auction.start_time),
    end_time: isoToDatetimeLocalValue(auction.end_time),
  };
}

/** Positive decimal money string (up to 2 fractional digits). Does not mutate input. */
export function isPositiveMoneyString(value: string): boolean {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return false;
  const amount = Number(trimmed);
  return Number.isFinite(amount) && amount > 0;
}

export function emptyAuctionFormValues(
  now: Date = new Date(),
): AuctionFormValues {
  const start = new Date(now.getTime());
  const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return {
    starting_bid: '',
    min_increment: DEFAULT_AUCTION_MIN_INCREMENT,
    reserve_price: '',
    start_time: toDatetimeLocalValue(start),
    end_time: toDatetimeLocalValue(end),
  };
}

export function validateAuctionForm(
  values: AuctionFormValues,
  productId: number | null,
  options?: { mode?: AuctionFormMode; changeReserve?: boolean },
): Partial<Record<AuctionFormField, string>> {
  const mode = options?.mode ?? 'create';
  const changeReserve = options?.changeReserve ?? false;
  const errors: Partial<Record<AuctionFormField, string>> = {};

  if (mode === 'create') {
    if (productId == null || !Number.isFinite(productId) || productId <= 0) {
      errors.product = 'Select a product for this auction.';
    }
  }

  if (!values.starting_bid.trim()) {
    errors.starting_bid = 'Starting bid is required.';
  } else if (!isPositiveMoneyString(values.starting_bid)) {
    errors.starting_bid = 'Enter a valid starting bid greater than 0.';
  }

  if (!values.min_increment.trim()) {
    errors.min_increment = 'Minimum bid increment is required.';
  } else if (!isPositiveMoneyString(values.min_increment)) {
    errors.min_increment = 'Enter a valid increment greater than 0.';
  }

  if (mode === 'create') {
    if (
      values.reserve_price.trim() &&
      !isPositiveMoneyString(values.reserve_price)
    ) {
      errors.reserve_price =
        'Enter a valid reserve price greater than 0, or leave blank.';
    }
  } else if (changeReserve) {
    if (!values.reserve_price.trim()) {
      errors.reserve_price = 'Enter a new reserve price, or uncheck Change reserve.';
    } else if (!isPositiveMoneyString(values.reserve_price)) {
      errors.reserve_price = 'Enter a valid reserve price greater than 0.';
    }
  }

  const startIso = datetimeLocalToIso(values.start_time);
  const endIso = datetimeLocalToIso(values.end_time);
  if (!values.start_time.trim() || !startIso) {
    errors.start_time = 'Start time is required.';
  }
  if (!values.end_time.trim() || !endIso) {
    errors.end_time = 'End time is required.';
  } else if (
    startIso &&
    endIso &&
    new Date(endIso).getTime() <= new Date(startIso).getTime()
  ) {
    errors.end_time = 'End time must be after start time.';
  }

  return errors;
}

/**
 * Build the existing-product create body for POST /auctions/.
 * Omits blank optional reserve. Does not mutate `values`.
 * Does not include nested product, seller, or server-controlled fields.
 */
export function buildExistingProductAuctionPayload(
  productId: number,
  values: AuctionFormValues,
): ExistingProductAuctionCreatePayload {
  const start_time = datetimeLocalToIso(values.start_time);
  const end_time = datetimeLocalToIso(values.end_time);
  if (!start_time || !end_time) {
    throw new Error('Invalid auction datetime values.');
  }

  const payload: ExistingProductAuctionCreatePayload = {
    product: productId,
    starting_bid: values.starting_bid.trim(),
    start_time,
    end_time,
  };

  const minIncrement = values.min_increment.trim();
  if (minIncrement) {
    payload.min_increment = minIncrement;
  }

  const reserve = values.reserve_price.trim();
  if (reserve) {
    payload.reserve_price = reserve;
  }

  return payload;
}

/** @deprecated Use buildExistingProductAuctionPayload — kept as alias for clarity. */
export function serializeExistingProductAuctionCreate(
  productId: number,
  values: AuctionFormValues,
): ExistingProductAuctionCreatePayload {
  return buildExistingProductAuctionPayload(productId, values);
}

/**
 * Build PATCH body for Auction configuration edit.
 * Omits reserve unless the Seller explicitly opted to change it.
 * Never includes product, seller, status, or server-controlled fields.
 * Does not mutate `values`.
 */
export function buildAuctionUpdatePayload(
  values: AuctionFormValues,
  options: { changeReserve: boolean },
): AuctionUpdatePayload {
  const start_time = datetimeLocalToIso(values.start_time);
  const end_time = datetimeLocalToIso(values.end_time);
  if (!start_time || !end_time) {
    throw new Error('Invalid auction datetime values.');
  }

  const payload: AuctionUpdatePayload = {
    starting_bid: values.starting_bid.trim(),
    min_increment: values.min_increment.trim(),
    start_time,
    end_time,
  };

  if (options.changeReserve) {
    payload.reserve_price = values.reserve_price.trim();
  }

  return payload;
}
