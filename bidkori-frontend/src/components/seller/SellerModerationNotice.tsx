'use client';

type SellerModerationNoticeProps = {
  isHidden: boolean | undefined;
  moderationReason?: string | null;
  entityLabel: 'Product' | 'Auction';
};

/**
 * Read-only Seller awareness when content is hidden by BidKori moderation.
 * No restore action.
 */
export default function SellerModerationNotice({
  isHidden,
  moderationReason,
  entityLabel,
}: SellerModerationNoticeProps) {
  if (isHidden !== true) return null;
  const reason = moderationReason?.trim();

  return (
    <div
      role="status"
      className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"
    >
      <p className="font-semibold">Hidden by BidKori moderation</p>
      <p className="mt-1 text-xs opacity-90">
        This {entityLabel.toLowerCase()} remains visible to you, but it is not
        shown on the public marketplace
        {entityLabel === 'Product'
          ? ' (and linked auctions cannot accept new bids while it stays hidden)'
          : ' and cannot accept new bids while hidden'}
        .
      </p>
      {reason ? (
        <p className="mt-2 text-xs">
          <span className="font-medium">Reason:</span> {reason}
        </p>
      ) : null}
    </div>
  );
}
