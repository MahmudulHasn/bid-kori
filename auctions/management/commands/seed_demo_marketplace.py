"""Populate BidKori with deterministic showcase marketplace data (SHOW-D01)."""

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from auctions.demo_marketplace import (
    DEMO_PASSWORD,
    clear_demo_marketplace,
    seed_demo_marketplace,
)


class Command(BaseCommand):
    help = (
        'Seed deterministic demo marketplace data for software-lab showcase. '
        'Use --reset to remove prior demo_* / [DEMO] records first.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--reset',
            action='store_true',
            help='Delete previous SHOW-D01 demo records before seeding.',
        )
        parser.add_argument(
            '--confirm-demo-data',
            action='store_true',
            help='Required when DEBUG is False.',
        )
        parser.add_argument(
            '--live-duration-minutes',
            type=int,
            default=45,
            help='Base remaining minutes for LIVE demo auctions (default 45).',
        )
        parser.add_argument(
            '--clear-only',
            action='store_true',
            help='Only delete demo records; do not reseed.',
        )

    def handle(self, *args, **options):
        debug = bool(getattr(settings, 'DEBUG', False))
        if not debug and not options['confirm_demo_data']:
            raise CommandError(
                'Refusing to seed demo data while DEBUG=False. '
                'Pass --confirm-demo-data for an intentional non-debug run.'
            )

        self.stdout.write(
            self.style.WARNING(
                'SHOW-D01 demo seed — local/showcase use only. '
                'Never point this at production without explicit confirmation.'
            )
        )

        if options['clear_only']:
            deleted = clear_demo_marketplace()
            self.stdout.write(
                self.style.SUCCESS(
                    f'Cleared demo marketplace ({deleted} demo user(s) removed).'
                )
            )
            return

        summary = seed_demo_marketplace(
            reset=bool(options['reset']),
            live_duration_minutes=int(options['live_duration_minutes']),
        )

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('Demo marketplace seed complete.'))
        self.stdout.write(f'  Users created:     {summary.users_created}')
        self.stdout.write(f'  Users updated:     {summary.users_existing}')
        self.stdout.write(f'  Categories:        {summary.categories_ensured}')
        self.stdout.write(f'  Products:          {summary.products}')
        self.stdout.write(f'  Live auctions:     {summary.live_auctions}')
        self.stdout.write(f'  Upcoming auctions: {summary.upcoming_auctions}')
        self.stdout.write(f'  Closed (winner):   {summary.closed_auctions}')
        self.stdout.write(f'  Closed (no win):   {summary.closed_no_winner}')
        self.stdout.write(f'  Cancelled:         {summary.cancelled_auctions}')
        self.stdout.write(f'  Bids placed:       {summary.bids}')
        self.stdout.write(f'  Payments:          {summary.payments}')
        self.stdout.write(f'  Notifications:     {summary.notifications}')
        if summary.reset_deleted_users:
            self.stdout.write(
                f'  Reset deleted users: {summary.reset_deleted_users}'
            )
        for note in summary.notes:
            self.stdout.write(f'  note: {note}')

        self.stdout.write('')
        self.stdout.write('Local-only demo credentials (not for production):')
        self.stdout.write(f'  password (all demo users): {DEMO_PASSWORD}')
        self.stdout.write('  Sellers: demo_seller_electronics | demo_seller_gaming | demo_seller_collectibles')
        self.stdout.write('  Buyers:  demo_buyer_a (primary) | demo_buyer_b | demo_buyer_c | demo_buyer_d')
        self.stdout.write('  Admin:   demo_admin (staff)')
