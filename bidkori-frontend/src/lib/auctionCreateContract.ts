/**
 * Contract evidence for Seller Auction creation (S05).
 *
 * Backend `AuctionSerializer` (auctions/serializers.py):
 * - `product = ProductSerializer()` — nested writable object, not a Product PK
 * - `create()` always runs `Product.objects.create(...)` then `Auction.objects.create(...)`
 * - OpenAPI create body requires `product` as an object plus starting_bid/start_time/end_time
 *
 * Therefore attaching a new Auction to an already-created Seller Product ID is
 * not supported by the current API. Frontend must not fake CASE A or recreate
 * nested Product creation inside `/seller/auctions/create`.
 */

/** Desired Seller IA route — not shipped until backend supports existing Product PK. */
export const SELLER_AUCTION_CREATE_PATH = '/seller/auctions/create';

/** Collection path used by legacy nested create: POST /api/auctions/. */
export const AUCTION_CREATE_API_PATH = '/auctions/';

export const SELLER_AUCTION_CREATE_FROM_EXISTING_PRODUCT_SUPPORTED = false;

export const SELLER_AUCTION_CREATE_BLOCK_REASON =
  'AUCTION CREATE BLOCKED — BACKEND CONTRACT EXTENSION REQUIRED';

/**
 * Desired CASE A payload shape (existing Product id).
 * Not accepted by the current backend nested ProductSerializer create path.
 */
export type ExistingProductAuctionCreateInput = {
  productId: number;
  starting_bid: string;
  min_increment?: string;
  reserve_price?: string | null;
  start_time: string;
  end_time: string;
};

/**
 * Explicitly blocked: do not serialize an existing-product auction create body.
 * Always returns null so no Seller page can invent a CASE A POST.
 */
export function serializeExistingProductAuctionCreate(
  input: ExistingProductAuctionCreateInput,
): null {
  void input;
  return null;
}

/** True when Seller UI may expose `/seller/auctions/create`. */
export function isSellerAuctionCreateRouteEnabled(): boolean {
  return SELLER_AUCTION_CREATE_FROM_EXISTING_PRODUCT_SUPPORTED;
}
