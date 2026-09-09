"""Test runner that cleans PostgreSQL sessions around test database lifecycle."""

from __future__ import annotations

from django.db import connections
from django.test.runner import DiscoverRunner


class BidKoriDiscoverRunner(DiscoverRunner):
    """Close/terminate lingering sessions so PostgreSQL can create/drop test DBs.

    Threaded locking/checkout tests can leave sessions open; Postgres then fails
    with ``database \"test_…\" is being accessed by other users`` or leaves a
    stale ``test_bidkori`` that blocks the next non-interactive run.
    """

    def setup_databases(self, **kwargs):
        self._close_all_connections()
        if not kwargs.get('keepdb'):
            self._force_drop_stale_postgres_test_dbs()
        return super().setup_databases(**kwargs)

    def teardown_databases(self, old_config, **kwargs):
        self._close_all_connections()
        self._terminate_postgres_backends_for_config(old_config)
        self._close_all_connections()
        super().teardown_databases(old_config, **kwargs)

    def _close_all_connections(self) -> None:
        for alias in list(connections):
            try:
                connections[alias].close()
            except Exception:
                pass

    def _force_drop_stale_postgres_test_dbs(self) -> None:
        """Drop leftover test databases before create (non-interactive CI/Compose)."""
        for alias in connections:
            connection = connections[alias]
            if connection.vendor != 'postgresql':
                continue
            test_db_name = connection.creation._get_test_db_name()
            self._terminate_and_drop(connection, test_db_name)

    def _terminate_postgres_backends_for_config(self, old_config) -> None:
        for connection, old_name, destroy in old_config:
            if not destroy or connection.vendor != 'postgresql':
                continue
            test_name = connection.settings_dict.get('NAME') or old_name
            if test_name:
                self._terminate_backends(connection, test_name)

    def _terminate_and_drop(self, connection, test_db_name: str) -> None:
        self._terminate_backends(connection, test_db_name)
        maintenance = connection.settings_dict.get('OPTIONS', {}).get(
            'maintenance_db',
            'postgres',
        )
        original_name = connection.settings_dict['NAME']
        try:
            connection.close()
            connection.settings_dict['NAME'] = maintenance
            connection.connect()
            with connection.cursor() as cursor:
                cursor.execute(f'DROP DATABASE IF EXISTS "{test_db_name}"')
        except Exception:
            pass
        finally:
            try:
                connection.close()
            except Exception:
                pass
            connection.settings_dict['NAME'] = original_name

    def _terminate_backends(self, connection, test_db_name: str) -> None:
        maintenance = connection.settings_dict.get('OPTIONS', {}).get(
            'maintenance_db',
            'postgres',
        )
        original_name = connection.settings_dict['NAME']
        try:
            connection.close()
            connection.settings_dict['NAME'] = maintenance
            connection.connect()
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT pg_terminate_backend(pid)
                    FROM pg_stat_activity
                    WHERE datname = %s
                      AND pid <> pg_backend_pid()
                    """,
                    [test_db_name],
                )
        except Exception:
            pass
        finally:
            try:
                connection.close()
            except Exception:
                pass
            connection.settings_dict['NAME'] = original_name
