"""Database policy helpers for BidKori (PostgreSQL-first).

Normal runtime and development require PostgreSQL via DATABASE_URL.
SQLite is allowed only when USE_SQLITE_FOR_TESTS=True during the test suite.
"""

from __future__ import annotations

from django.core.exceptions import ImproperlyConfigured
from django.core.management.base import CommandError

POSTGRES_REQUIRED_MESSAGE = (
    'PostgreSQL DATABASE_URL is required for BidKori runtime. '
    'SQLite fallback is disabled. Use Docker Compose (canonical) or set '
    'DATABASE_URL to a postgres:// / postgresql:// URL. '
    'For host-side unit tests without Postgres, set USE_SQLITE_FOR_TESTS=True.'
)

SQLITE_TEST_ONLY_MESSAGE = (
    'USE_SQLITE_FOR_TESTS is only allowed while running the Django test suite '
    '(manage.py test / DJANGO_TEST=1).'
)

NON_POSTGRES_URL_MESSAGE = (
    'BidKori requires PostgreSQL. DATABASE_URL must use a postgres:// or '
    'postgresql:// scheme (SQLite URLs are not accepted for runtime).'
)


def is_postgres_database_url(url: str) -> bool:
    normalized = (url or '').strip().lower()
    return normalized.startswith(('postgres://', 'postgresql://'))


def build_default_database(
    *,
    database_url: str,
    use_sqlite_for_tests: bool,
    running_tests: bool,
    conn_max_age: int,
    sqlite_name: str = ':memory:',
) -> dict:
    """Return a Django DATABASES['default'] configuration.

    Raises ImproperlyConfigured when the request violates BidKori DB policy.
    """
    url = (database_url or '').strip()

    if use_sqlite_for_tests:
        if not running_tests:
            raise ImproperlyConfigured(SQLITE_TEST_ONLY_MESSAGE)
        return {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': sqlite_name,
        }

    if not url:
        raise ImproperlyConfigured(POSTGRES_REQUIRED_MESSAGE)

    if not is_postgres_database_url(url):
        raise ImproperlyConfigured(NON_POSTGRES_URL_MESSAGE)

    import dj_database_url

    return dj_database_url.parse(url, conn_max_age=conn_max_age)


def require_postgresql_connection(action: str = 'this command') -> None:
    """Fail management commands that must never target SQLite."""
    from django.db import connection

    if connection.vendor != 'postgresql':
        raise CommandError(
            f'Refusing to run {action} on {connection.vendor!r}. '
            'BidKori demo/seed/runtime commands require PostgreSQL. '
            'Use: docker compose exec web python manage.py …'
        )


def database_identity_summary() -> dict[str, str]:
    """Safe identity fields for logs/preflight (never includes password)."""
    from django.conf import settings
    from django.db import connection

    default = settings.DATABASES.get('default', {})
    return {
        'vendor': connection.vendor,
        'engine': str(default.get('ENGINE', '')),
        'name': str(default.get('NAME', '')),
        'host': str(default.get('HOST') or '(none)'),
        'port': str(default.get('PORT') or ''),
    }
