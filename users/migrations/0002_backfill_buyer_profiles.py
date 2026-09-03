# Generated manually for backward-compatible BUYER profiles on existing users.

from django.db import migrations


def create_missing_buyer_profiles(apps, schema_editor):
    User = apps.get_model('auth', 'User')
    UserProfile = apps.get_model('users', 'UserProfile')
    existing_user_ids = set(UserProfile.objects.values_list('user_id', flat=True))
    to_create = [
        UserProfile(user_id=user.id, role='BUYER')
        for user in User.objects.all().only('id')
        if user.id not in existing_user_ids
    ]
    if to_create:
        UserProfile.objects.bulk_create(to_create, batch_size=500)


def noop_reverse(apps, schema_editor):
    # Keep profiles on reverse; schema reverse of 0001 drops the table.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0001_user_profile_role'),
    ]

    operations = [
        migrations.RunPython(create_missing_buyer_profiles, noop_reverse),
    ]
