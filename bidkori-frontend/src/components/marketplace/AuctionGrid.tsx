import AuctionCard from '@/components/AuctionCard';
import type { Auction } from '@/lib/types';

type AuctionGridProps = {
  auctions: readonly Auction[];
};

export default function AuctionGrid({ auctions }: AuctionGridProps) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {auctions.map((auction) => (
        <AuctionCard key={auction.id} auction={auction} />
      ))}
    </div>
  );
}

