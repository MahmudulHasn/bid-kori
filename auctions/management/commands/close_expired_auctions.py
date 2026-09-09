from django.core.management.base import BaseCommand

from auctions.models import Auction
from auctions.services import close_all_expired_auctions
from config.db_policy import require_postgresql_connection


class Command(BaseCommand):
    """Close expired ACTIVE auctions via the authoritative lifecycle service."""

    help = (
        'Close expired ACTIVE auctions through AuctionLifecycleService.close_auction().'
    )

    def handle(self, *args, **options):
        require_postgresql_connection('close_expired_auctions')
        result = close_all_expired_auctions()

        for auction_id in result['closed_ids']:
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

        for error in result['errors']:
            self.stderr.write(
                self.style.ERROR(
                    f"[FAILED] Auction ID {error['auction_id']}: {error['error']}"
                )
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"Done. Closed {result['closed']} expired auction(s)."
            )
        )
