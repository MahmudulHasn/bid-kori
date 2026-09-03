/**
 * Seller Auction image management safety gates (S07).
 *
 * Backend contract (read-only audit):
 *
 * UPLOAD — POST /api/auctions/<auction_id>/images/ (multipart field `images`).
 *   Ownership: IsAuctionSellerOrReadOnly + object check on product.seller.
 *   Validation: Pillow content inspection; size/dimension/format quotas.
 *   Caps: AUCTION_IMAGE_MAX_PER_AUCTION=10, AUCTION_IMAGE_MAX_PER_REQUEST=5.
 *   Lifecycle: NO freeze — owner may upload while ACTIVE (with bids), CLOSED,
 *   or CANCELLED. Same integrity class as economic edit after bidding starts.
 *
 * DELETE IMAGE — no dedicated AuctionImage delete route. Only Auction DELETE
 *   cascades images (and bids/payments). Not safe to expose as image remove.
 *
 * REORDER / PRIMARY — AuctionImage has id, image, uploaded_at only (ordered by
 *   uploaded_at). No is_primary, display_order, or reorder endpoint.
 */

/** Ownership is hardened, but live listing appearance can still change after bids. */
export const SELLER_AUCTION_IMAGE_UPLOAD_ENABLED = false;

/** No ownership-scoped AuctionImage DELETE endpoint exists. */
export const SELLER_AUCTION_IMAGE_DELETE_ENABLED = false;

/** No persistent ordering API beyond uploaded_at. */
export const SELLER_AUCTION_IMAGE_REORDER_ENABLED = false;

/** No is_primary / cover field on AuctionImage. */
export const SELLER_AUCTION_IMAGE_PRIMARY_ENABLED = false;

export const SELLER_AUCTION_IMAGE_UPLOAD_BLOCK_REASON =
  'UPLOAD DEFERRED — BACKEND GUARD REQUIRED';

export const SELLER_AUCTION_IMAGE_DELETE_BLOCK_REASON =
  'IMAGE DELETE DEFERRED — BACKEND GUARD REQUIRED';

export const SELLER_AUCTION_IMAGE_REORDER_BLOCK_REASON =
  'REORDER DEFERRED — BACKEND GUARD REQUIRED';

export const SELLER_AUCTION_IMAGE_PRIMARY_BLOCK_REASON =
  'PRIMARY IMAGE DEFERRED — BACKEND GUARD REQUIRED';

/** Documented upload route (not wired into Seller UI while deferred). */
export const AUCTION_IMAGE_UPLOAD_METHOD = 'POST';
export const AUCTION_IMAGE_UPLOAD_FIELD = 'images';

/** Defaults mirrored from auctions/image_validation.py / settings. */
export const AUCTION_IMAGE_MAX_PER_AUCTION = 10;
export const AUCTION_IMAGE_MAX_PER_REQUEST = 5;
export const AUCTION_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const AUCTION_IMAGE_ACCEPT =
  'image/jpeg,image/png,image/webp,image/gif';

export function buildAuctionImagesUploadApiPath(
  auctionId: string | number,
): string {
  return `/auctions/${auctionId}/images/`;
}

/** Always false until backend lifecycle freeze + (for delete) a real endpoint. */
export function canSellerUploadAuctionImages(): boolean {
  return SELLER_AUCTION_IMAGE_UPLOAD_ENABLED;
}

export function canSellerDeleteAuctionImages(): boolean {
  return SELLER_AUCTION_IMAGE_DELETE_ENABLED;
}

export function canSellerReorderAuctionImages(): boolean {
  return SELLER_AUCTION_IMAGE_REORDER_ENABLED;
}

export function canSellerSetPrimaryAuctionImage(): boolean {
  return SELLER_AUCTION_IMAGE_PRIMARY_ENABLED;
}
