from django.db import migrations


STATUS_MAP = {
    'DRAFT': 'ACTIVE',
    'SCHEDULED': 'ACTIVE',
    'LIVE': 'ACTIVE',
    'ENDED': 'CLOSED',
    'WINNER_VALIDATION': 'CLOSED',
    'READY_TO_SHIP': 'CLOSED',
    'COMPLETED': 'CLOSED',
    'CANCELLED': 'CANCELLED',
}


def forwards_map_statuses(apps, schema_editor):
    Auction = apps.get_model('auctions', 'Auction')
    for old_status, new_status in STATUS_MAP.items():
        Auction.objects.filter(status=old_status).update(status=new_status)


def backwards_map_statuses(apps, schema_editor):
    Auction = apps.get_model('auctions', 'Auction')
    reverse_map = {
        'ACTIVE': 'LIVE',
        'CLOSED': 'ENDED',
        'CANCELLED': 'CANCELLED',
    }
    for new_status, old_status in reverse_map.items():
        Auction.objects.filter(status=new_status).update(status=old_status)


class Migration(migrations.Migration):

    dependencies = [
        ('auctions', '0003_auction_lifecycle_and_winning_bidder'),
    ]

    operations = [
        migrations.RunPython(forwards_map_statuses, backwards_map_statuses),
    ]
