from django.core.management.base import BaseCommand
from django.db import transaction as db_transaction
from django.utils import timezone

from auctions.models import Auction


class Command(BaseCommand):
    """Close ACTIVE auctions whose end_time has passed and assign winners."""

    help = (
        'Close expired ACTIVE auctions, set status to CLOSED, and assign '
        'winning_bidder from the highest bid (if any).'
    )

    def handle(self, *args, **options):
        now = timezone.now()
        expired_auctions = (
            Auction.objects.filter(
                status=Auction.Status.ACTIVE,
                end_time__lte=now,
            )
            .select_related('winning_bidder')
            .prefetch_related('bids__bidder')
            .order_by('id')
        )

        closed_count = 0

        for auction in expired_auctions:
            with db_transaction.atomic():
                # Re-fetch and lock the auction row only (no nullable joins).
                locked = (
                    Auction.objects.select_for_update()
                    .filter(
                        pk=auction.pk,
                        status=Auction.Status.ACTIVE,
                        end_time__lte=now,
                    )
                    .first()
                )
                if locked is None:
                    continue

                highest_bid = (
                    locked.bids.select_related('bidder')
                    .order_by('-amount', 'timestamp')
                    .first()
                )

                locked.status = Auction.Status.CLOSED
                if highest_bid is not None:
                    # Bid model uses ``bidder`` (not ``user``).
                    locked.winning_bidder = highest_bid.bidder
                    locked.current_highest_bid = highest_bid.amount
                    locked.save(
                        update_fields=[
                            'status',
                            'winning_bidder',
                            'current_highest_bid',
                        ]
                    )
                    winner_label = highest_bid.bidder.username
                else:
                    locked.winning_bidder = None
                    locked.save(update_fields=['status', 'winning_bidder'])
                    winner_label = None

                closed_count += 1
                self.stdout.write(
                    f'[CLOSED] Auction ID {locked.pk} closed. '
                    f'Winning bidder: {winner_label}.'
                )

        self.stdout.write(
            self.style.SUCCESS(
                f'Done. Closed {closed_count} expired auction(s).'
            )
        )
