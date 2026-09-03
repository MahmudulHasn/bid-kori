/**
 * Seller Auction image management safety gates.
 *
 * UPLOAD — POST /api/auctions/<auction_id>/images/ (multipart field `images`).
 * Allowed by backend only while pre-freeze (same rule as economic edit).
 * Frontend mirrors status + start_time; Bid existence is backend-authoritative.
 *
 * DELETE / REORDER / PRIMARY — still unsupported by the API.
 */

import { isAuctionOwnedByUser } from './auctionOwnership.ts';
import { isAuctionPreFreezeByClientClock } from './auctionManagementSafety.ts';
import type { AuthUser, Auction } from './types.ts';

/** Feature shipped; per-auction UX uses freeze helpers. */
export const SELLER_AUCTION_IMAGE_UPLOAD_ENABLED = true;

/** No ownership-scoped AuctionImage DELETE endpoint exists. */
export const SELLER_AUCTION_IMAGE_DELETE_ENABLED = false;

/** No persistent ordering API beyond uploaded_at. */
export const SELLER_AUCTION_IMAGE_REORDER_ENABLED = false;

/** No is_primary / cover field on AuctionImage. */
export const SELLER_AUCTION_IMAGE_PRIMARY_ENABLED = false;

export const SELLER_AUCTION_IMAGE_DELETE_BLOCK_REASON =
  'IMAGE DELETE DEFERRED — BACKEND GUARD REQUIRED';

export const SELLER_AUCTION_IMAGE_REORDER_BLOCK_REASON =
  'REORDER DEFERRED — BACKEND GUARD REQUIRED';

export const SELLER_AUCTION_IMAGE_PRIMARY_BLOCK_REASON =
  'PRIMARY IMAGE DEFERRED — BACKEND GUARD REQUIRED';

export const AUCTION_IMAGE_UPLOAD_METHOD = 'POST';
export const AUCTION_IMAGE_UPLOAD_FIELD = 'images';

/** Defaults mirrored from auctions/image_validation.py / settings. */
export const AUCTION_IMAGE_MAX_PER_AUCTION = 10;
export const AUCTION_IMAGE_MAX_PER_REQUEST = 5;
export const AUCTION_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const AUCTION_IMAGE_ACCEPT =
  'image/jpeg,image/png,image/webp,image/gif';

export const AUCTION_IMAGE_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export function buildAuctionImagesUploadApiPath(
  auctionId: string | number,
): string {
  return `/auctions/${auctionId}/images/`;
}

export function canSellerUploadAuctionImages(
  auction: Auction | null | undefined,
  user: Pick<AuthUser, 'id'> | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!SELLER_AUCTION_IMAGE_UPLOAD_ENABLED) return false;
  if (!isAuctionOwnedByUser(auction, user)) return false;
  return isAuctionPreFreezeByClientClock(auction, nowMs);
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

export function auctionImageRemainingCapacity(auction: Auction): number {
  const existing = auction.images?.length ?? 0;
  return Math.max(0, AUCTION_IMAGE_MAX_PER_AUCTION - existing);
}

export type AuctionImageClientValidationResult = {
  ok: boolean;
  error?: string;
};

/**
 * UX-only file checks before upload. Does not mutate `files`.
 * Backend Pillow validation remains authoritative.
 */
export function validateAuctionImageSelection(
  files: readonly File[],
  auction: Auction,
): AuctionImageClientValidationResult {
  const selected = [...files];
  if (selected.length === 0) {
    return { ok: false, error: 'Choose at least one image to upload.' };
  }
  if (selected.length > AUCTION_IMAGE_MAX_PER_REQUEST) {
    return {
      ok: false,
      error: `Upload at most ${AUCTION_IMAGE_MAX_PER_REQUEST} images per request.`,
    };
  }
  const remaining = auctionImageRemainingCapacity(auction);
  if (selected.length > remaining) {
    return {
      ok: false,
      error: `This auction can accept ${remaining} more image${remaining === 1 ? '' : 's'} (max ${AUCTION_IMAGE_MAX_PER_AUCTION}).`,
    };
  }
  for (const file of selected) {
    if (file.size > AUCTION_IMAGE_MAX_BYTES) {
      return {
        ok: false,
        error: `"${file.name}" exceeds the ${AUCTION_IMAGE_MAX_BYTES / (1024 * 1024)}MB size limit.`,
      };
    }
    const mime = (file.type || '').toLowerCase();
    if (
      mime &&
      !AUCTION_IMAGE_ALLOWED_MIME_TYPES.includes(
        mime as (typeof AUCTION_IMAGE_ALLOWED_MIME_TYPES)[number],
      )
    ) {
      return {
        ok: false,
        error: `"${file.name}" is not a supported image type (JPEG, PNG, WEBP, GIF).`,
      };
    }
  }
  return { ok: true };
}

export function buildAuctionImagesFormData(files: readonly File[]): FormData {
  const formData = new FormData();
  for (const file of files) {
    formData.append(AUCTION_IMAGE_UPLOAD_FIELD, file);
  }
  return formData;
}

export function isAuctionImageFreezeError(error: unknown): boolean {
  const data = (error as { response?: { data?: { error?: unknown } } })?.response
    ?.data;
  const raw = data?.error;
  const message =
    typeof raw === 'string'
      ? raw
      : Array.isArray(raw)
        ? raw.join(' ')
        : typeof raw === 'object' && raw
          ? JSON.stringify(raw)
          : '';
  return message.toLowerCase().includes('images cannot be changed');
}
