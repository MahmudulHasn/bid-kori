import type { Auction, AuctionProduct } from '@/lib/types';

export function getAuctionTitle(auction: Auction): string {
  if (auction.product_title && auction.product_title.trim()) {
    return auction.product_title;
  }
  if (auction.product && typeof auction.product === 'object') {
    const title = (auction.product as AuctionProduct).title;
    if (title?.trim()) return title;
  }
  return 'Untitled listing';
}

export function getAuctionProduct(
  auction: Auction,
): AuctionProduct | null {
  if (auction.product && typeof auction.product === 'object') {
    return auction.product;
  }
  return null;
}

/**
 * Honest bid label for cards.
 * When we know there are no competing bids yet, prefer "Starting price".
 */
export function getAuctionPriceLabel(auction: Auction): {
  label: string;
  amount: number;
} {
  const starting = Number(auction.starting_bid);
  const current = Number(
    auction.current_highest_bid ?? auction.starting_bid ?? 0,
  );
  const hasStarting = Number.isFinite(starting);
  const amount = Number.isFinite(current)
    ? current
    : hasStarting
      ? starting
      : 0;

  if (auction.status === 'CANCELLED') {
    return { label: 'Cancelled', amount };
  }
  if (auction.status === 'CLOSED') {
    return { label: 'Final bid', amount };
  }

  // Active-list payloads include recent_bids; empty means no bids yet.
  if (Array.isArray(auction.recent_bids)) {
    if (auction.recent_bids.length > 0) {
      return { label: 'Current bid', amount };
    }
    return {
      label: 'Starting price',
      amount: hasStarting ? starting : amount,
    };
  }

  if (hasStarting && Number.isFinite(current) && current <= starting) {
    return { label: 'Starting price', amount: starting };
  }

  if (hasStarting && Number.isFinite(current) && current > starting) {
    return { label: 'Current bid', amount: current };
  }

  if (hasStarting) {
    return { label: 'Starting price', amount: starting };
  }

  return { label: 'Current bid', amount };
}

export function formatAuctionMoney(amount: number): string {
  return `৳${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatAuctionStatus(status: string | undefined): string | null {
  if (!status) return null;
  switch (status.toUpperCase()) {
    case 'ACTIVE':
      return 'Active';
    case 'CLOSED':
      return 'Closed';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      return status;
  }
}
