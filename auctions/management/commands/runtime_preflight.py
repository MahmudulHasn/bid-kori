"""Operational preflight for BidKori Compose / PostgreSQL runtime."""

from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import connection
from django.db.utils import OperationalError

from config.db_policy import database_identity_summary, require_postgresql_connection


class Command(BaseCommand):
    help = (
        'Verify PostgreSQL, Redis, migrations, and Django system checks for '
        'the canonical BidKori runtime.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--skip-redis',
            action='store_true',
            help='Skip Redis ping (not recommended for realtime stacks).',
        )
        parser.add_argument(
            '--skip-celery-broker',
            action='store_true',
            help='Skip Celery broker ping.',
        )

    def handle(self, *args, **options):
        require_postgresql_connection('runtime_preflight')
        identity = database_identity_summary()
        self.stdout.write(
            f"Database vendor: {identity['vendor']} | "
            f"name: {identity['name']} | host: {identity['host']}"
        )

        try:
            connection.ensure_connection()
        except OperationalError as exc:
            raise CommandError(f'PostgreSQL is not reachable: {exc}') from exc
        self.stdout.write(self.style.SUCCESS('PostgreSQL: reachable'))

        if not options['skip_redis']:
            self._check_redis()

        if not options['skip_celery_broker']:
            self._check_celery_broker()

        self._check_migrations()
        call_command('check', verbosity=0)
        self.stdout.write(self.style.SUCCESS('Django system check: OK'))
        self.stdout.write(self.style.SUCCESS('runtime_preflight passed'))

    def _check_redis(self):
        from django.conf import settings

        try:
            from redis import Redis
        except ImportError as exc:
            raise CommandError('redis package is required for Redis preflight') from exc

        client = Redis.from_url(settings.REDIS_URL, socket_connect_timeout=3)
        if client.ping() is not True:
            raise CommandError(f'Redis ping failed for {settings.REDIS_URL!r}')
        self.stdout.write(self.style.SUCCESS(f'Redis: reachable ({settings.REDIS_URL})'))

    def _check_celery_broker(self):
        from django.conf import settings

        try:
            from redis import Redis
        except ImportError as exc:
            raise CommandError(
                'redis package is required for Celery broker preflight'
            ) from exc

        broker = getattr(settings, 'CELERY_BROKER_URL', '') or ''
        client = Redis.from_url(broker, socket_connect_timeout=3)
        if client.ping() is not True:
            raise CommandError(f'Celery broker ping failed for {broker!r}')
        self.stdout.write(self.style.SUCCESS(f'Celery broker: reachable ({broker})'))

    def _check_migrations(self):
        from django.db.migrations.executor import MigrationExecutor

        executor = MigrationExecutor(connection)
        plan = executor.migration_plan(executor.loader.graph.leaf_nodes())
        if plan:
            names = ', '.join(f'{mig.app_label}.{mig.name}' for mig, _ in plan)
            raise CommandError(f'Unapplied migrations: {names}')
        self.stdout.write(self.style.SUCCESS('Migrations: all applied'))
