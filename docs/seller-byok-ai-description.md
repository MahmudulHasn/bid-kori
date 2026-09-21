# Seller BYOK AI Description Generator (AI-DESC02)

## Feature Overview

Sellers can optionally provide their own OpenAI API key when generating AI
product descriptions. The key is used for a single generation request and is
never persisted, logged, or returned in API responses.

## Architecture

```
Seller Browser
    │
    │  POST /api/products/generate-description/
    │  FormData: title, image, condition?, category?, api_key?
    │
    ▼
BidKori Django Backend
    │
    │  Request-scoped OpenAI client using:
    │    1. Seller-supplied BYOK key (if provided)
    │    2. Server AI_API_KEY (fallback)
    │    3. 503 (neither available)
    │
    ▼
OpenAI Responses API
    │
    │  Generated description text
    │
    ▼
Response: { "description": "..." }
```

### Key Precedence

| Priority | Source | Condition |
|----------|--------|-----------|
| 1 | Seller-supplied `api_key` in request | Non-empty |
| 2 | Server `settings.AI_API_KEY` | Non-empty, BYOK absent |
| 3 | Error 503 | Neither available |

## Security Architecture

### Key Lifecycle

1. **Entered**: Seller types/pastes key into `type="password"` input
2. **Transmitted**: Sent via HTTPS POST FormData to BidKori backend only
3. **Used**: Backend creates a request-scoped `OpenAI` client with the key
4. **Discarded**: Key exists only for the duration of the HTTP request handler
5. **Cleared**: Frontend clears the key from component state after successful generation

### What is NOT done with the key

- ❌ Never stored in PostgreSQL (no model field, no migration)
- ❌ Never stored in Redis, Django cache, Celery, or session
- ❌ Never logged (all `logger.*` calls verified key-free)
- ❌ Never returned in API responses
- ❌ Never stored in localStorage, sessionStorage, or cookies
- ❌ Never sent directly from browser to AI provider
- ❌ Never passed to Celery task payloads
- ❌ Never sent over WebSocket/Channels
- ❌ Never used by the support chatbot (`AIChatService`)
- ❌ Never cached as a global/singleton provider credential

### Request-Scoped Provider Client

The `AIListingService._build_client(api_key=...)` creates a **new** `OpenAI`
client instance per request. This prevents cross-user credential leakage when
concurrent requests use different BYOK keys.

```python
# Each request gets its own client — no global mutation.
client = OpenAI(api_key=resolved_key, timeout=..., max_retries=0)
```

## HTTPS Production Requirement

> **⚠️ Production deployments MUST use HTTPS.**
>
> The BYOK API key necessarily appears in the request payload from browser to
> BidKori backend. HTTPS ensures transport encryption. HTTP localhost is
> acceptable for development only.

## API Contract

### Request

```
POST /api/products/generate-description/
Content-Type: multipart/form-data
Authorization: Token <seller-token>

Fields:
  title     (required, string, max 255)
  image     (required, image file)
  condition (optional, enum: NEW|USED_LIKE_NEW|USED_GOOD|FAIR)
  category  (optional, integer PK)
  api_key   (optional, string, max 256)
```

### Response (Success — 200)

```json
{
  "description": "Generated marketplace description text..."
}
```

### Response (Error)

```json
{
  "error": "Human-readable error message"
}
```

| Status | Meaning |
|--------|---------|
| 200 | Success |
| 400 | Validation error (title/image/condition/category) |
| 401 | API key rejected by provider (BYOK invalid) |
| 402 | Provider quota/billing issue |
| 429 | Rate limit (BidKori or provider) |
| 502 | Provider failure |
| 503 | AI not configured (no BYOK + no server key) |
| 504 | Provider timeout |

## Chatbot Isolation

The support chatbot (`AIChatService` in `ai/chat_service.py`) always uses the
server-configured `settings.AI_API_KEY`. Seller BYOK keys are never:

- Passed to the chatbot
- Used for any purpose other than listing description generation
- Shared across users or requests

## Frontend Behavior

### API Key Input

- `type="password"` with show/hide toggle
- `name="ai-api-key"` (avoids password manager confusion)
- `autocomplete="off"`, `spellcheck={false}`
- Paste allowed
- Labeled "OpenAI API Key"
- Helper text: "Used only for this generation request. BidKori does not save your API key."
- Cleared from component state after successful generation
- Not persisted in any browser storage

### Generation Flow

1. Seller fills Product fields (title, image, condition, category)
2. Seller enters their OpenAI API key
3. Clicks "Generate with AI"
4. Frontend validates inputs locally
5. Frontend sends multipart POST to BidKori backend
6. Backend creates request-scoped OpenAI client
7. Provider returns description draft
8. Backend returns `{ "description": "..." }`
9. Frontend inserts draft into description textarea
10. Seller reviews/edits the generated text
11. API key is cleared from component state
12. Seller submits Product form normally

## Testing

All tests use mocked providers — no live OpenAI traffic.

### Backend Tests (products.test_ai_listing)

- `SellerBYOKAIListingTests` — 15+ test cases covering BYOK success, invalid
  key, quota, timeout, rate limit, authorization (anonymous/buyer denied),
  server key fallback, missing both keys, prompt safety, key-not-in-DB,
  key-not-in-logs, concurrent key isolation, build-client BYOK override

### Frontend Tests (aiListing.test.ts)

- `buildGenerateDescriptionFormData` — api_key append/omit
- `canGenerateAiListingDescription` — apiKey required
- `validateApiKeyInput` — empty, valid, too-long
- `getAiListingErrorMessage` — 401/402 mapping
- BYOK constants
- Product save payload exclusion

## Files Changed

| File | Change |
|------|--------|
| `products/ai_listing.py` | Request-scoped client, BYOK key resolution, new error classes |
| `products/serializers.py` | `api_key` field on generation serializer |
| `products/views.py` | Pass `api_key` through to service |
| `products/test_ai_listing.py` | BYOK test suite |
| `bidkori-frontend/src/lib/aiListing.ts` | BYOK types, helpers, constants |
| `bidkori-frontend/src/lib/aiListingApi.ts` | BYOK passthrough |
| `bidkori-frontend/src/components/seller/ProductForm.tsx` | API key input UI |
| `bidkori-frontend/src/lib/aiListing.test.ts` | BYOK test cases |
| `docs/seller-byok-ai-description.md` | This documentation |

## Files NOT Changed

| File | Reason |
|------|--------|
| `products/models.py` | No schema change — key never persisted |
| `products/migrations/*` | No migration needed |
| `ai/chat_service.py` | Chatbot uses server key only |
| `config/settings.py` | No new settings |
