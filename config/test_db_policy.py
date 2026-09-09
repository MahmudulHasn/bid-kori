"""Unit tests for PostgreSQL-first database policy (no live DB required)."""

from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase

from config.db_policy import (
    NON_POSTGRES_URL_MESSAGE,
    POSTGRES_REQUIRED_MESSAGE,
    SQLITE_TEST_ONLY_MESSAGE,
    build_default_database,
    is_postgres_database_url,
)


class DatabasePolicyTests(SimpleTestCase):
    def test_postgres_url_detection(self):
        self.assertTrue(is_postgres_database_url('postgres://u:p@db:5432/bidkori'))
        self.assertTrue(is_postgres_database_url('postgresql://u:p@127.0.0.1:5432/bidkori'))
        self.assertFalse(is_postgres_database_url('sqlite:///db.sqlite3'))
        self.assertFalse(is_postgres_database_url(''))

    def test_missing_url_fails_outside_sqlite_test_mode(self):
        with self.assertRaises(ImproperlyConfigured) as ctx:
            build_default_database(
                database_url='',
                use_sqlite_for_tests=False,
                running_tests=False,
                conn_max_age=0,
            )
        self.assertIn('SQLite fallback is disabled', str(ctx.exception))
        self.assertEqual(str(ctx.exception), POSTGRES_REQUIRED_MESSAGE)

    def test_sqlite_url_rejected_for_runtime(self):
        with self.assertRaises(ImproperlyConfigured) as ctx:
            build_default_database(
                database_url=f'sqlite:///{self._testMethodName}.sqlite3',
                use_sqlite_for_tests=False,
                running_tests=False,
                conn_max_age=0,
            )
        self.assertEqual(str(ctx.exception), NON_POSTGRES_URL_MESSAGE)

    def test_sqlite_test_flag_requires_running_tests(self):
        with self.assertRaises(ImproperlyConfigured) as ctx:
            build_default_database(
                database_url='',
                use_sqlite_for_tests=True,
                running_tests=False,
                conn_max_age=0,
            )
        self.assertEqual(str(ctx.exception), SQLITE_TEST_ONLY_MESSAGE)

    def test_sqlite_test_mode_uses_memory(self):
        cfg = build_default_database(
            database_url='',
            use_sqlite_for_tests=True,
            running_tests=True,
            conn_max_age=0,
        )
        self.assertEqual(cfg['ENGINE'], 'django.db.backends.sqlite3')
        self.assertEqual(cfg['NAME'], ':memory:')

    def test_postgres_url_parses(self):
        cfg = build_default_database(
            database_url='postgres://bidkori_user:secret@db:5432/bidkori',
            use_sqlite_for_tests=False,
            running_tests=False,
            conn_max_age=600,
        )
        self.assertIn('postgresql', cfg['ENGINE'])
        self.assertEqual(cfg['NAME'], 'bidkori')
        self.assertEqual(cfg['HOST'], 'db')
        self.assertEqual(cfg['USER'], 'bidkori_user')
