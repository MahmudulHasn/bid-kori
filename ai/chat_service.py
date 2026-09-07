"""Stateless BidKori support chatbot service (AI-B02).

No tools, no private data lookups, no persistence, no actions.
"""

from __future__ import annotations

import logging
import time

from django.conf import settings

from .chat_prompt import build_support_instructions, build_user_message_payload

logger = logging.getLogger(__name__)

AI_CHAT_UNAVAILABLE_MESSAGE = 'AI assistant is temporarily unavailable.'
AI_CHAT_NOT_CONFIGURED_MESSAGE = (
    'AI assistant is not configured on this server.'
)
AI_CHAT_TIMEOUT_MESSAGE = 'AI assistant timed out. Please try again.'
AI_CHAT_EMPTY_MESSAGE = 'AI assistant returned an empty answer.'
AI_CHAT_RATE_LIMIT_MESSAGE = (
    'AI assistant is rate limited. Please try again shortly.'
)

# Valid role labels passed to the provider (never Admin-specific).
CHAT_ROLE_ANONYMOUS = 'anonymous'
CHAT_ROLE_BUYER = 'buyer'
CHAT_ROLE_SELLER = 'seller'
CHAT_ROLE_GENERAL = 'general'


class AIChatError(Exception):
    """Base support-chat error with an HTTP status for the API layer."""

    def __init__(self, message: str, *, status_code: int = 503):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class AIChatConfigurationError(AIChatError):
    def __init__(self, message: str = AI_CHAT_NOT_CONFIGURED_MESSAGE):
        super().__init__(message, status_code=503)


class AIChatTimeoutError(AIChatError):
    def __init__(self, message: str = AI_CHAT_TIMEOUT_MESSAGE):
        super().__init__(message, status_code=504)


class AIChatProviderError(AIChatError):
    def __init__(self, message: str = AI_CHAT_UNAVAILABLE_MESSAGE):
        super().__init__(message, status_code=502)


class AIChatRateLimitError(AIChatError):
    def __init__(self, message: str = AI_CHAT_RATE_LIMIT_MESSAGE):
        super().__init__(message, status_code=429)


class AIChatEmptyOutputError(AIChatError):
    def __init__(self, message: str = AI_CHAT_EMPTY_MESSAGE):
        super().__init__(message, status_code=502)


def is_ai_chat_configured() -> bool:
    return bool(getattr(settings, 'AI_API_KEY', '').strip()) and bool(
        getattr(settings, 'AI_CHAT_MODEL', '').strip()
    )


def resolve_chat_role_label(user) -> str:
    """Derive a minimal visitor role label for prompt flavor only."""
    if user is None or not getattr(user, 'is_authenticated', False):
        return CHAT_ROLE_ANONYMOUS

    from users.models import resolve_user_role

    role = resolve_user_role(user)
    if role == 'BUYER':
        return CHAT_ROLE_BUYER
    if role == 'SELLER':
        return CHAT_ROLE_SELLER
    # ADMIN (and anything else) → generic help context, no special capabilities.
    return CHAT_ROLE_GENERAL


def extract_response_text(response) -> str:
    """Extract plain text from an OpenAI Responses API result."""
    output_text = getattr(response, 'output_text', None)
    if isinstance(output_text, str) and output_text.strip():
        return output_text

    chunks: list[str] = []
    for item in getattr(response, 'output', None) or []:
        for content in getattr(item, 'content', None) or []:
            text = getattr(content, 'text', None)
            if isinstance(text, str) and text.strip():
                chunks.append(text)
            elif isinstance(content, dict):
                value = content.get('text')
                if isinstance(value, str) and value.strip():
                    chunks.append(value)
    return '\n'.join(chunks).strip()


def clean_chat_answer(text: str) -> str:
    cleaned = (text or '').strip()
    if cleaned.startswith('```'):
        lines = cleaned.splitlines()
        if lines and lines[0].startswith('```'):
            lines = lines[1:]
        if lines and lines[-1].strip() == '```':
            lines = lines[:-1]
        cleaned = '\n'.join(lines).strip()
    return cleaned.strip()


class AIChatService:
    """Answer one BidKori platform-help question (stateless)."""

    @classmethod
    def answer(cls, *, message: str, role_label: str) -> str:
        started = time.monotonic()
        role = (role_label or CHAT_ROLE_ANONYMOUS).strip().lower()
        try:
            if not is_ai_chat_configured():
                raise AIChatConfigurationError()

            raw = cls._call_provider(message=message, role_label=role)
            answer = clean_chat_answer(raw)
            if not answer:
                raise AIChatEmptyOutputError()

            logger.info(
                'AI chat succeeded role=%s duration_ms=%s',
                role,
                int((time.monotonic() - started) * 1000),
            )
            return answer
        except AIChatError as exc:
            logger.info(
                'AI chat failed role=%s duration_ms=%s error_class=%s',
                role,
                int((time.monotonic() - started) * 1000),
                type(exc).__name__,
            )
            raise
        except Exception:
            logger.exception(
                'AI chat unexpected failure role=%s duration_ms=%s',
                role,
                int((time.monotonic() - started) * 1000),
            )
            raise AIChatProviderError() from None

    @classmethod
    def _build_client(cls):
        from openai import OpenAI

        timeout = float(getattr(settings, 'AI_TIMEOUT_SECONDS', 20) or 20)
        # One chat message ≈ one provider attempt (no silent billable retries).
        return OpenAI(
            api_key=settings.AI_API_KEY,
            timeout=timeout,
            max_retries=0,
        )

    @classmethod
    def _call_provider(cls, *, message: str, role_label: str) -> str:
        from openai import (
            APIConnectionError,
            APIStatusError,
            APITimeoutError,
            RateLimitError,
        )

        client = cls._build_client()
        instructions = build_support_instructions(role_label=role_label)
        user_payload = build_user_message_payload(message)
        max_tokens = int(getattr(settings, 'AI_CHAT_MAX_OUTPUT_TOKENS', 400) or 400)
        model = getattr(settings, 'AI_CHAT_MODEL', '').strip()

        try:
            response = client.responses.create(
                model=model,
                instructions=instructions,
                input=[
                    {
                        'role': 'user',
                        'content': [
                            {'type': 'input_text', 'text': user_payload},
                        ],
                    }
                ],
                max_output_tokens=max_tokens,
            )
        except RateLimitError as exc:
            raise AIChatRateLimitError() from exc
        except APITimeoutError as exc:
            raise AIChatTimeoutError() from exc
        except APIConnectionError as exc:
            raise AIChatProviderError() from exc
        except APIStatusError as exc:
            status = getattr(exc, 'status_code', None)
            if status == 429:
                raise AIChatRateLimitError() from exc
            raise AIChatProviderError() from exc
        except Exception as exc:
            name = type(exc).__name__.lower()
            message_l = str(exc).lower()
            if 'timeout' in name or 'timeout' in message_l:
                raise AIChatTimeoutError() from exc
            raise AIChatProviderError() from exc

        return extract_response_text(response)
