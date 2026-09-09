from django.core.management.base import BaseCommand

from config.db_policy import require_postgresql_connection
from products.category_bootstrap import ensure_mvp_categories


class Command(BaseCommand):
    """Create the MVP Category catalog if missing (idempotent)."""

    help = (
        'Ensures the BidKori MVP Category catalog exists. Safe to re-run; '
        'does not overwrite or delete existing categories.'
    )

    def handle(self, *args, **options):
        require_postgresql_connection('seed_categories')
        created, existing = ensure_mvp_categories()
        for category in created:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Created category '{category.name}' ({category.slug})."
                )
            )
        for category in existing:
            self.stdout.write(
                f"Category '{category.name}' already exists, skipping."
            )
        self.stdout.write(
            self.style.SUCCESS(
                f'Category bootstrap complete '
                f'({len(created)} created, {len(existing)} existing).'
            )
        )
