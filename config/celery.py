"""
Celery application for BidKori background / scheduled work.

Broker/result backend use Redis (separate logical DB from Channels by default).
ASGI/Channels configuration is independent of this module.
"""

import os

from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

app = Celery('bidkori')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()
