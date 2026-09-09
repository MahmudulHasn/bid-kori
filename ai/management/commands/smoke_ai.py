"""Opt-in live OpenAI smoke for showcase verification (AI-R01).

Requires AI_API_KEY plus AI_MODEL / AI_CHAT_MODEL. Never prints secrets.
Normal ``manage.py test`` does not invoke this command.
"""

from __future__ import annotations

import io
import time

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from PIL import Image

from ai.chat_service import AIChatService, is_ai_chat_configured
from products.ai_listing import AIListingService, is_ai_listing_configured


def _tiny_jpeg() -> io.BytesIO:
    buf = io.BytesIO()
    Image.new('RGB', (64, 64), color=(180, 180, 190)).save(buf, format='JPEG')
    buf.seek(0)
    buf.name = 'smoke.jpg'
    return buf


class Command(BaseCommand):
    help = (
        'Opt-in live AI provider smoke (listing + chat). '
        'Requires configured AI_API_KEY and models. Exits non-zero on failure.'
    )

    def handle(self, *args, **options):
        if not getattr(settings, 'AI_API_KEY', '').strip():
            raise CommandError(
                'AI_API_KEY is not set. Add it to .env and restart/recreate '
                'the web process, then re-run smoke_ai.'
            )
        if not is_ai_listing_configured():
            raise CommandError(
                'Listing AI is not configured (need AI_API_KEY and AI_MODEL).'
            )
        if not is_ai_chat_configured():
            raise CommandError(
                'Chat AI is not configured (need AI_API_KEY and AI_CHAT_MODEL).'
            )

        listing_model = settings.AI_MODEL.strip()
        chat_model = settings.AI_CHAT_MODEL.strip()
        self.stdout.write(
            f'Smoke models: listing={listing_model} chat={chat_model}'
        )

        started = time.monotonic()
        image = _tiny_jpeg()
        description = AIListingService.generate_description(
            title='Used iPhone 13 128GB',
            image_file=image,
            condition_label='Used',
            category_name=None,
            user_id=None,
        )
        listing_ms = int((time.monotonic() - started) * 1000)
        if not (description or '').strip():
            raise CommandError('Listing smoke returned empty description.')
        self.stdout.write(
            self.style.SUCCESS(
                f'Listing OK ({listing_ms}ms, chars={len(description.strip())})'
            )
        )

        started = time.monotonic()
        answer = AIChatService.answer(
            message='How do I place a bid?',
            role_label='anonymous',
        )
        chat_ms = int((time.monotonic() - started) * 1000)
        if not (answer or '').strip():
            raise CommandError('Chat smoke returned empty answer.')
        self.stdout.write(
            self.style.SUCCESS(
                f'Chat OK ({chat_ms}ms, chars={len(answer.strip())})'
            )
        )
        self.stdout.write(self.style.SUCCESS('AI provider smoke passed.'))
