"""Populate BidKori with deterministic showcase marketplace data (SHOW-D01)."""

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from auctions.demo_marketplace import (
    DEMO_PASSWORD,
    clear_demo_marketplace,
    seed_demo_marketplace,
)
from config.db_policy import database_identity_summary, require_postgresql_connection


class Command(BaseCommand):
    help = (
        'Seed deterministic demo marketplace data for software-lab showcase. '
        'Use --reset to remove prior demo_* / [DEMO] records first. '
        'Requires PostgreSQL (Compose canonical).'
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
        require_postgresql_connection('seed_demo_marketplace')

        debug = bool(getattr(settings, 'DEBUG', False))
        verbosity = int(options.get('verbosity', 1))
        if not debug and not options['confirm_demo_data']:
            raise CommandError(
                'Refusing to seed demo data while DEBUG=False. '
                'Pass --confirm-demo-data for an intentional non-debug run.'
            )

        def say(message, style=None):
            if verbosity < 1:
                return
            if style:
                self.stdout.write(style(message))
            else:
                self.stdout.write(message)

        say(
            'SHOW-D01 demo seed — local/showcase use only. '
            'Never point this at production without explicit confirmation.',
            self.style.WARNING,
        )

        identity = database_identity_summary()
        say(
            f"Target database: vendor={identity['vendor']} "
            f"name={identity['name']} host={identity['host']}"
        )

        if options['clear_only']:
            deleted = clear_demo_marketplace()
            say(
                f'Cleared demo marketplace ({deleted} demo user(s) removed).',
                self.style.SUCCESS,
            )
            return

        summary = seed_demo_marketplace(
            reset=bool(options['reset']),
            live_duration_minutes=int(options['live_duration_minutes']),
        )

        say('')
        say('Demo marketplace seed complete.', self.style.SUCCESS)
        say(f'  Users created:     {summary.users_created}')
        say(f'  Users updated:     {summary.users_existing}')
        say(f'  Categories:        {summary.categories_ensured}')
        say(f'  Products:          {summary.products}')
        say(f'  Live auctions:     {summary.live_auctions}')
        say(f'  Upcoming auctions: {summary.upcoming_auctions}')
        say(f'  Closed (winner):   {summary.closed_auctions}')
        say(f'  Closed (no win):   {summary.closed_no_winner}')
        say(f'  Cancelled:         {summary.cancelled_auctions}')
        say(f'  Bids placed:       {summary.bids}')
        say(f'  Payments:          {summary.payments}')
        say(f'  Notifications:     {summary.notifications}')
        if summary.reset_deleted_users:
            say(f'  Reset deleted users: {summary.reset_deleted_users}')
        for note in summary.notes:
            say(f'  note: {note}')

        say('')
        say('Local-only demo credentials (not for production):')
        say(f'  password (all demo users): {DEMO_PASSWORD}')
        say('  Sellers: demo_seller_electronics | demo_seller_gaming | demo_seller_collectibles')
        say('  Buyers:  demo_buyer_a (primary) | demo_buyer_b | demo_buyer_c | demo_buyer_d')
        say('  Admin:   demo_admin (staff)')
