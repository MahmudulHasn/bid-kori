"""
Authenticated private notification WebSocket consumer (NT-B03).

Handshake: connect → client sends ``{"type":"authenticate","token":"<DRF token>"}``
→ join ``user_<id>`` → receive ``notification.created`` events.

Tokens must never appear in the WebSocket URL. This socket is receive-only after
auth; read/read-all remain REST.
"""

from __future__ import annotations

import asyncio
import logging

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.contrib.auth.models import AnonymousUser
from rest_framework.authtoken.models import Token

from .realtime import user_notification_group_name

logger = logging.getLogger(__name__)

# Short window for the first authenticate message (overridable in tests).
AUTH_TIMEOUT_SECONDS = 5


class NotificationConsumer(AsyncJsonWebsocketConsumer):
    """Private inbox stream for one authenticated user."""

    authenticated: bool
    user: object | None
    group_name: str | None
    _auth_timeout_task: asyncio.Task | None

    async def connect(self):
        self.authenticated = False
        self.user = None
        self.group_name = None
        self._auth_timeout_task = None

        await self.accept()

        scope_user = self.scope.get('user')
        if (
            scope_user is not None
            and not isinstance(scope_user, AnonymousUser)
            and getattr(scope_user, 'is_authenticated', False)
            and getattr(scope_user, 'is_active', True)
            and getattr(scope_user, 'pk', None)
        ):
            await self._complete_authentication(scope_user)
            return

        self._auth_timeout_task = asyncio.create_task(self._auth_timeout())

    async def disconnect(self, code):
        await self._cancel_auth_timeout()
        group = getattr(self, 'group_name', None)
        if group:
            await self.channel_layer.group_discard(group, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        """Decode JSON safely; never crash the consumer on malformed input."""
        if text_data is not None:
            try:
                content = await self.decode_json(text_data)
            except Exception:
                if not self.authenticated:
                    await self._reject_authentication()
                else:
                    await self.send_json(
                        {
                            'type': 'error',
                            'code': 'invalid_json',
                            'detail': 'Malformed JSON message.',
                        }
                    )
                return
            await self.receive_json(content)
            return
        if bytes_data is not None:
            if not self.authenticated:
                await self._reject_authentication()
            else:
                await self.send_json(
                    {
                        'type': 'error',
                        'code': 'unsupported_message',
                        'detail': 'Binary messages are not supported.',
                    }
                )

    async def receive_json(self, content, **kwargs):
        if not self.authenticated:
            await self._handle_authenticate(content)
            return

        if isinstance(content, dict) and content.get('type') == 'authenticate':
            await self.send_json(
                {
                    'type': 'error',
                    'code': 'already_authenticated',
                    'detail': 'This connection is already authenticated.',
                }
            )
            return

        await self.send_json(
            {
                'type': 'error',
                'code': 'unsupported_message',
                'detail': (
                    'This WebSocket is receive-only after authentication. '
                    'Use REST for notification read state.'
                ),
            }
        )

    async def notification_created(self, event):
        """Channels handler for group_send type ``notification.created``."""
        if not self.authenticated:
            return
        payload = event.get('payload')
        if isinstance(payload, dict):
            await self.send_json(payload)

    async def _handle_authenticate(self, content) -> None:
        if not isinstance(content, dict):
            await self._reject_authentication()
            return
        if content.get('type') != 'authenticate':
            await self._reject_authentication()
            return

        token_key = content.get('token')
        if not isinstance(token_key, str) or not token_key.strip():
            await self._reject_authentication()
            return
        # Any client-supplied user_id is ignored — identity comes from the token.

        user = await self._resolve_user_from_token(token_key.strip())
        if user is None:
            await self._reject_authentication()
            return

        await self._complete_authentication(user)

    async def _complete_authentication(self, user) -> None:
        await self._cancel_auth_timeout()
        self.authenticated = True
        self.user = user
        self.group_name = user_notification_group_name(user.pk)
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        logger.info(
            'Notification WebSocket authenticated user_id=%s',
            user.pk,
        )
        await self.send_json(
            {
                'type': 'authenticated',
                'user_id': user.pk,
            }
        )

    async def _reject_authentication(self) -> None:
        await self._cancel_auth_timeout()
        logger.info('Notification WebSocket authentication rejected')
        try:
            await self.send_json(
                {
                    'type': 'error',
                    'code': 'authentication_failed',
                    'detail': 'Authentication failed.',
                }
            )
        except Exception:
            pass
        await self.close(code=4401)

    async def _auth_timeout(self) -> None:
        try:
            await asyncio.sleep(AUTH_TIMEOUT_SECONDS)
        except asyncio.CancelledError:
            return
        if self.authenticated:
            return
        logger.info('Notification WebSocket closed: auth timeout')
        try:
            await self.send_json(
                {
                    'type': 'error',
                    'code': 'auth_timeout',
                    'detail': 'Authentication timed out.',
                }
            )
        except Exception:
            pass
        await self.close(code=4408)

    async def _cancel_auth_timeout(self) -> None:
        task = getattr(self, '_auth_timeout_task', None)
        if task is not None and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        self._auth_timeout_task = None

    @staticmethod
    @database_sync_to_async
    def _resolve_user_from_token(token_key: str):
        """Return an active user for a valid DRF Token, else None."""
        try:
            token = (
                Token.objects.select_related('user')
                .filter(key=token_key)
                .first()
            )
        except Exception:
            logger.exception('Token lookup failed during notification WS auth')
            return None
        if token is None:
            return None
        user = token.user
        if user is None or not user.is_active:
            return None
        return user
