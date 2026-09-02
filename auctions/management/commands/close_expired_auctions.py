from django.core.management.base import BaseCommand
from django.utils import timezone

from auctions.models import Auction
from auctions.services import AuctionLifecycleService


class Command(BaseCommand):
    """Close expired ACTIVE auctions via the authoritative lifecycle service."""

    help = (
        'Close expired ACTIVE auctions through AuctionLifecycleService.close_auction().'
    )

    def handle(self, *args, **options):
        now = timezone.now()
        expired_ids = list(
            Auction.objects.filter(
                status=Auction.Status.ACTIVE,
                end_time__lte=now,
            )
            .order_by('id')
            .values_list('pk', flat=True)
        )

        closed_count = 0
        for auction_id in expired_ids:
            _, closed = AuctionLifecycleService.close_auction(
                auction_id,
                source='expired',
            )
            if closed:
                closed_count += 1
                auction = Auction.objects.select_related('winning_bidder').get(
                    pk=auction_id
                )
                winner_label = (
                    auction.winning_bidder.username
                    if auction.winning_bidder_id
                    else None
                )
                self.stdout.write(
                    f'[CLOSED] Auction ID {auction_id} closed. '
                    f'Winning bidder: {winner_label}.'
                )

        self.stdout.write(
            self.style.SUCCESS(
                f'Done. Closed {closed_count} expired auction(s).'
            )
        )
