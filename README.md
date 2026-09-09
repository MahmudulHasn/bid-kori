# BidKori

A full-stack real-time auction marketplace: **Django REST** backend + **Next.js** frontend.

BidKori handles product catalogs, authenticated buyer/seller workflows, atomic live bidding, multi-image media, automated auction lifecycle closure, rate-limited bid protection, winner checkout simulation, and an interactive web client with live polling.

**Platform status:** Full-Stack Platform Ready / Production Hardened (Update 3 complete).

---

## Tech Stack

### Backend

| Layer | Technology |
| --- | --- |
| Framework | Django, Django REST Framework, Django Channels |
| Database | PostgreSQL 15 |
| Real-time | Redis 7 (Channels channel layer) + Daphne ASGI |
| Scheduler | Celery worker + Celery Beat (Redis broker, expired-auction closing) |
| Containers | Docker & Docker Compose |
| Static files | WhiteNoise |
| API docs | drf-spectacular (OpenAPI 3.0) — Swagger UI & ReDoc |
| Media | Pillow (`ImageField` uploads) |
| Auth | DRF Token Authentication |
| Supporting | `django-cors-headers`, `python-dotenv`, `dj-database-url`, `psycopg2-binary`, `gunicorn` (optional WSGI), `daphne`, `channels`, `channels-redis`, `celery`, `requests` |

### Frontend (`bidkori-frontend/`)

| Layer | Technology |
| --- | --- |
| Framework | Next.js (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Data fetching | SWR |
| HTTP client | Axios |
| Icons / toasts | Lucide React, React Hot Toast |

---

## Project Architecture & Progress Checklist

### Update 3 — Backend / DevOps + Frontend (100% complete)

- [x] **PostgreSQL & Dockerization (Toufiq)** — Containerized Postgres + web services, WhiteNoise static serving, 50-thread atomic concurrency stress test (`select_for_update`).
- [x] **Media & Lifecycle Engine (Mahmud)** — Multi-image auction uploads, persistent Docker `media_data` volume, `close_expired_auctions` management command.
- [x] **API Docs & Security (Rafi)** — Interactive OpenAPI docs at `/api/schema/swagger-ui/` and `/api/schema/redoc/`, CORS for frontend origins, offline Postman exporter (`export_postman`).
- [x] **Hardening & Payments (Samira)** — DRF rate limiting (`BidBurstThrottle` / `bids: 10/minute`), outbid Django email signals, winner payment checkout (`POST /api/auctions/{id}/checkout/`).
- [x] **Next.js Frontend Phase (Toufiq)** — Auth context, responsive catalog grid, multi-image create forms, real-time SWR polling + countdown timers, winner payment dashboard.

### App Boundaries

- **`products`** — Product listings, categories, seller catalog endpoints
- **`auctions`** — Auction lifecycle, bidding engine, media, payments, analytics
- **`users`** — Registration, login, authenticated profile (`/me/`), Admin user directory + Suspend/Reactivate
- **`notifications`** — Persistent in-app inbox (list / read / read-all); server-created only
- **`bidkori-frontend`** — Next.js App Router client for marketplace UX

---

## Team Contributions

| Contributor | Focus | Highlights |
| --- | --- | --- |
| **Mahmud** | Catalog, media, lifecycle | Product models, multi-image uploads, `close_expired_auctions`, persistent media volumes |
| **Rafi** | Auth, docs, CORS | Token auth, OpenAPI/Swagger/ReDoc, Postman export, CORS for Next.js |
| **Samira** | Guardrails, throttling, payments | Seller/bidder permissions, `BidBurstThrottle`, checkout simulation, outbid alerts |
| **Toufiq** | Bidding, Docker, frontend | Atomic `select_for_update` bidding, Docker Compose, stress tests, Next.js marketplace UI |

---

## Quickstart (Windows PowerShell)

### A. Backend with Docker (recommended)

```powershell
cd G:\bid-kori
docker compose up --build -d
docker compose exec web python manage.py seed_data
docker compose exec web python manage.py createsuperuser
```

Services:

| Service | Role |
| --- | --- |
| `db` | PostgreSQL |
| `redis` | Channels channel layer + Celery broker/result backend |
| `web` | Django ASGI via **Daphne** (`config.asgi:application`) — HTTP + WebSockets |
| `worker` | Celery worker — runs `close_expired_auctions_task` |
| `beat` | Celery Beat — enqueues expired-auction closing every **10 seconds** (configurable via `CELERY_CLOSE_EXPIRED_INTERVAL_SECONDS`) |

API: [http://127.0.0.1:8000/](http://127.0.0.1:8000/)  
WebSocket (auction room): `ws://127.0.0.1:8000/ws/auctions/<auction_id>/`  
Swagger: [http://127.0.0.1:8000/api/schema/swagger-ui/](http://127.0.0.1:8000/api/schema/swagger-ui/)  
Admin: [http://127.0.0.1:8000/admin/](http://127.0.0.1:8000/admin/)

**Real-time note:** Bids are still placed only via REST `POST /api/auctions/<id>/place-bid/`. WebSockets are **subscribe/broadcast only** (`bid.accepted` after a successful commit; `auction.closed` after authoritative finalization; `auction.cancelled` after ACTIVE → CANCELLED, regardless of Seller vs Admin actor). Production must use Redis (`REDIS_URL`); the test suite uses an in-memory channel layer and does not need Redis.

**Automatic closing:** Celery Beat schedules expired ACTIVE auction finalization every ~10s without HTTP traffic. Late bids are still rejected immediately by `BidService` even before Beat runs. Manual recovery remains available via `close_expired_auctions`.

### Demo marketplace population (SHOW-D01)

Deterministic showcase data for software-lab demos. **Manual only** — never runs on migrate/startup.

```powershell
docker compose up -d
docker compose exec web python manage.py migrate
docker compose exec web python manage.py seed_demo_marketplace --reset
cd G:\bid-kori\bidkori-frontend
npm run dev
```

Local-only credentials (all demo users share the same password):

| Role | Username | Password |
| --- | --- | --- |
| Buyer (primary) | `demo_buyer_a` | `DemoShowcase123!` |
| Buyer | `demo_buyer_b` / `c` / `d` | `DemoShowcase123!` |
| Seller (primary) | `demo_seller_electronics` | `DemoShowcase123!` |
| Seller | `demo_seller_gaming` / `demo_seller_collectibles` | `DemoShowcase123!` |
| Admin (staff) | `demo_admin` | `DemoShowcase123!` |

- Product titles are prefixed with `[DEMO]`; usernames use `demo_*`.
- `--reset` deletes only those demo records, then reseeds.
- `--clear-only` removes demo data without reseeding.
- When `DEBUG=False`, require `--confirm-demo-data`.
- Optional: `--live-duration-minutes 60` to keep LIVE auctions open longer.

Useful commands:

```powershell
docker compose logs -f web worker beat
docker compose exec web python manage.py close_expired_auctions
docker compose exec web python manage.py export_postman
docker compose exec web python manage.py seed_demo_marketplace --reset
.\venv\Scripts\python.exe scripts\stress_test.py --docker
```

### B. Backend local (venv + SQLite fallback)

```powershell
cd G:\bid-kori
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
# Start Redis locally (required for live WebSocket broadcasts + Celery), e.g.:
#   docker run --rm -p 6379:6379 redis:7-alpine
# Ensure `.env` includes:
#   REDIS_URL=redis://127.0.0.1:6379/0
#   CELERY_BROKER_URL=redis://127.0.0.1:6379/1
# Optional AI (backend-only; leave blank to boot without AI):
#   AI_API_KEY=
#   AI_MODEL=gpt-4o-mini
#   AI_CHAT_MODEL=gpt-4o-mini
#   AI_TIMEOUT_SECONDS=20
#   AI_LISTING_RATE=5/minute
#   AI_CHAT_RATE=10/minute
python manage.py migrate
python manage.py seed_data
```

### AI showcase readiness (Compose)

MVP AI today: **description generator** + **basic platform chatbot** only
(no RAG, tools/actions, Premium, highlights, or structured multi-field AI output).

1. In the project-root `.env` (never commit real secrets):

```text
AI_API_KEY=<your OpenAI key>
AI_MODEL=gpt-4o-mini
AI_CHAT_MODEL=gpt-4o-mini
```

2. Recreate backend containers so they pick up env (restart alone is enough if
   `.env` changed and Compose substitutes afresh; recreate is the reliable path):

```powershell
docker compose up -d --force-recreate web worker beat
```

3. Verify (optional opt-in live smoke — not part of `manage.py test`):

```powershell
docker compose exec web python manage.py smoke_ai
```

Or use Seller `POST /api/products/generate-description/` and public
`POST /api/ai/chat/` from the UI / API docs.

4. Without `AI_API_KEY` / models: both endpoints stay safe **HTTP 503**
   (no stack traces, no key hints). The frontend shows a short unavailable message
   and leaves existing Product descriptions unchanged.

Run the local real-time stack in separate terminals:

```powershell
# Terminal 1 — Redis (if not already running)
docker run --rm -p 6379:6379 redis:7-alpine

# Terminal 2 — Django/ASGI
python manage.py runserver

# Terminal 3 — Celery worker
celery -A config worker -l INFO

# Terminal 4 — Celery Beat
celery -A config beat -l INFO

# Terminal 5 — Next.js (see section C)
```

`runserver` uses Daphne/Channels (ASGI) when `daphne` is installed.  
Optional Postgres via `.env` / `DATABASE_URL` (used automatically by `dj-database-url`).

### C. Next.js frontend

```powershell
cd G:\bid-kori\bidkori-frontend
npm install
npm run dev
```

Frontend: [http://localhost:3000/](http://localhost:3000/)  
Ensure the Django API is reachable at `http://127.0.0.1:8000`.

**Local real-time stack:** PostgreSQL (or SQLite) + **Redis** + Django ASGI (`runserver` / Daphne) + **Celery worker** + **Celery Beat** + Next.js. Auction detail still polls (~3s) as a fallback alongside WebSocket updates.
---

## API Endpoint Reference (selected)

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/users/register/` | Register + token |
| `POST` | `/api/users/login/` | Login + token |
| `GET` | `/api/admin/users/` | Staff-only user directory (search / role / is_active; paginated) |
| `GET` | `/api/admin/users/<id>/` | Staff-only user detail (read-only) |
| `POST` | `/api/admin/users/<id>/suspend/` | Suspend marketplace BUYER/SELLER (`is_active=false` + revoke token) |
| `POST` | `/api/admin/users/<id>/reactivate/` | Reactivate marketplace BUYER/SELLER (no token restore) |
| `GET` | `/api/auctions/` | List auctions (`status`, `category`, `search` filters) |
| `GET` | `/api/categories/` | Public Category catalog (`id`, `name`, `slug`; read-only) |
| `GET` | `/api/categories/<id>/` | Category detail (read-only) |
| `GET` | `/api/products/` | List products (includes nested `images`) |
| `POST` | `/api/products/` | Create product (JSON catalog fields; images via dedicated upload) |
| `POST` | `/api/products/generate-description/` | Seller/Admin AI draft description (multipart title + image; no persistence) |
| `POST` | `/api/ai/chat/` | Stateless BidKori support chat (`{ "message": "..." }` → `{ "answer": "..." }`) |
| `GET` | `/api/products/<id>/images/` | List Product images (ordered by `uploaded_at`, `id`) |
| `POST` | `/api/products/<id>/images/` | Upload Product images (multipart field `images`; owner; freeze-aware) |
| `DELETE` | `/api/products/<id>/images/<image_id>/` | Delete Product image (owner; freeze-aware) |
| `POST` | `/api/admin/products/<id>/hide/` | Admin hide Product (visibility only; optional `reason`) |
| `POST` | `/api/admin/products/<id>/restore/` | Admin restore Product visibility |
| `POST` | `/api/admin/auctions/<id>/hide/` | Admin hide Auction (visibility only; does not cancel) |
| `POST` | `/api/admin/auctions/<id>/restore/` | Admin restore Auction visibility |
| `POST` | `/api/auctions/` | Create auction (JSON or multipart + images) |
| `POST` | `/api/auctions/<id>/images/` | Upload auction images |
| `POST` | `/api/auctions/<id>/place-bid/` | Place bid (atomic + rate limited; broadcasts `bid.accepted` after commit) |
| `WS` | `/ws/auctions/<id>/` | Subscribe to live `bid.accepted` / `auction.closed` / `auction.cancelled` events (read-only; no bid submission) |
| `WS` | `/ws/notifications/` | Authenticated private inbox push (`notification.created`); first message auth with DRF token (no token in URL) |
| `POST` | `/api/auctions/<id>/checkout/` | Winner mock payment checkout (ledger only; seller-side fee snapshot) |
| `GET` | `/api/auctions/my-bids/` | Buyer bid dashboard data |
| `GET` | `/api/notifications/` | Authenticated user's notifications (paginated, newest first) |
| `POST` | `/api/notifications/<id>/read/` | Mark one own notification read |
| `POST` | `/api/notifications/read-all/` | Mark all own notifications read |
| `GET` | `/api/schema/swagger-ui/` | Interactive OpenAPI docs |

Auth header:

```http
Authorization: Token <your-token>
```

### Successful-sale fee (mock checkout accounting)

BidKori MVP monetization is **seller-side successful-sale commission** recorded on mock checkout — **not** real payment-provider settlement, bank capture, payouts, refunds, tax, or subscription billing.

| Rule | Detail |
| --- | --- |
| Who pays the sale amount | Buyer pays the **winning amount only** (`Payment.amount`) |
| Platform fee | Deducted from Seller gross proceeds (commission) |
| Default rate | **5.00%** via `PLATFORM_SUCCESS_FEE_PERCENT` (env/settings; `0`–`100`) |
| When fee is recognized | Only when mock checkout creates a **COMPLETED** Payment |
| Snapshots | `fee_rate`, `platform_fee`, `seller_net_amount` stored immutably on Payment |
| Historical rows | Pre-fee Payments may have **null** fee fields — do not invent backfilled revenue |
| Concurrency | Checkout locks the Auction row (`select_for_update`) before Payment create. Full concurrent duplicate safety requires a DB that supports row locking (PostgreSQL in Docker/production). Local SQLite falls back without `select_for_update`; sequential duplicate checks + OneToOne uniqueness still apply. |
| Not included | Gateways, payouts, refunds, Premium, buyer surcharge, VAT |

Changing `PLATFORM_SUCCESS_FEE_PERCENT` never recalculates existing Payment snapshots.

### Seller earnings & Admin platform revenue (mock ledger reads)

Exact financial visibility derives from **COMPLETED** `Payment` rows only — never from auction samples, bidding volume, or frontend page sums.

| Role | Endpoint | Notes |
| --- | --- | --- |
| Seller | `GET /api/seller/earnings/` | Exact gross / platform fees / net for owned auctions; legacy null-snapshot sales reported separately |
| Seller | `GET /api/seller/sales/` | Paginated (20) completed sale ledger for the authenticated Seller only |
| Admin | `GET /api/admin/finance/summary/` | Exact completed checkout volume, platform revenue (`Sum(platform_fee)`), seller net total |

- UI: Seller `/seller/sales`; Admin Analytics includes a separate mock-checkout financial section.
- Legacy COMPLETED Payments with null fee fields count toward **gross** only; they do **not** invent platform revenue/net.
- No payouts, refunds, gateway settlement, or financial mutation endpoints.

### Admin Users (Suspend / Reactivate)

Staff-only (`IsAdminUser` — Django `is_staff` / superuser). Public auth routes under `/api/users/` stay separate.

| Method | Endpoint | Notes |
| --- | --- | --- |
| `GET` | `/api/admin/users/` | Paginated (20); `search`, `role=BUYER\|SELLER\|ADMIN`, `is_active=true\|false` |
| `GET` | `/api/admin/users/<id>/` | Read-only detail |
| `POST` | `/api/admin/users/<id>/suspend/` | Marketplace BUYER/SELLER only → `is_active=false` + revoke DRF token |
| `POST` | `/api/admin/users/<id>/reactivate/` | `is_active=true`; does **not** restore/issue a token — user must log in again |

- Suspend/reactivate are **idempotent** (safe to retry).
- Cannot suspend/reactivate: self, staff, superuser, or any ADMIN-resolved account.
- No user delete, no generic PATCH/PUT, no role/password/staff mutation.
- Suspension does **not** cancel Auctions or delete/disqualify historical Bids/Products.
- Primary app auth is DRF token; global session purge remains out of scope.

### Product images

- Max **5** images per Product; max **5** per request; **5MB** each.
- Formats: JPEG / PNG / WEBP / GIF (Pillow content validation).
- Upload/delete: Product **owner only**; blocked when Product mutation is frozen.
- Default display image = first by `uploaded_at`, then `id` (no primary API).

### Admin visibility moderation (MOD-B01)

Staff-only (`IsAdminUser`) action endpoints:

- `POST /api/admin/products/<id>/hide/` — optional JSON `{ "reason": "..." }`
- `POST /api/admin/products/<id>/restore/`
- `POST /api/admin/auctions/<id>/hide/` — optional JSON `{ "reason": "..." }`
- `POST /api/admin/auctions/<id>/restore/`

Behavior:

- Hide removes public marketplace visibility (list/active/search/detail) without deleting data.
- Hide does **not** cancel Auction lifecycle (`ACTIVE`/`CLOSED`/`CANCELLED` unchanged).
- Hidden Auction **or** hidden Product blocks new bids; auto-close still runs.
- Seller still sees own hidden Product/Auction; Admin lists remain unfiltered for staff.
- Buyer My Bids / winner history access is preserved for participants.
- Seller cannot clear `is_hidden` via Product/Auction PATCH.
- Direct media file URLs may remain reachable if the URL is known (storage ACL not redesigned).

### Admin Auction Cancel (MOD-B02)

Staff-only (`IsAdminUser`):

- `POST /api/admin/auctions/<id>/cancel/` — optional JSON `{ "reason": "..." }` (same ~500-char moderation reason limit as hide)

Semantics:

- Admin only (Seller cancel remains a separate owner transition endpoint).
- ACTIVE unpaid auctions only via `AuctionLifecycleService` (no raw status writes).
- Rejects `CLOSED`, `is_paid=True`, or any existing `Payment` row (even if `is_paid` is inconsistent).
- The same unpaid/Payment guard applies to Seller lifecycle cancel (owner transition), not only Admin cancel.
- Already `CANCELLED` → idempotent **200** (no duplicate `auction.cancelled` broadcast).
- Preserves all Bid rows; clears `winning_bidder`; does not delete Product/Auction/Payment.
- Does **not** auto-set `is_hidden` — hide/restore stay independent of lifecycle cancel.
- Irreversible: no reopen (`CANCELLED` → `ACTIVE` / `CLOSED` → `CANCELLED` forbidden).
- Emits exactly one public WebSocket `auction.cancelled` after commit (`winning_bidder: null`; no moderation_reason on the wire).
- Does **not** emit `auction.closed` on cancel.
- Seller cancellation also emits `auction.cancelled` (same lifecycle broadcast).
- Auction WebSocket subscribe mirrors REST retrieve: hidden auctions are not joinable by anonymous/public users (Seller/Admin/participants may still subscribe).

### AI listing description draft

`POST /api/products/generate-description/` (multipart):

| Field | Required | Notes |
| --- | --- | --- |
| `title` | yes | max 255 |
| `image` | yes | same Product image validation (JPEG/PNG/WEBP/GIF, ≤5MB, ≤4096×4096) |
| `condition` | no | `NEW` / `USED_LIKE_NEW` / `USED_GOOD` / `FAIR` |
| `category` | no | existing Category PK |

Success response: `{ "description": "..." }`.

- **Auth:** Seller or Admin only (same create roles). Buyer → 403; anonymous → 401.
- **Throttle:** scoped `ai_listing` (default `5/minute`).
- AI text is a **draft** — Sellers must review/edit before Product create/PATCH.
- Generation does **not** create or update Product / ProductImage rows.
- Provider API key stays **backend-only** (`AI_API_KEY`). Do not use `NEXT_PUBLIC_*`.
- Title, condition, category, and image bytes are sent to the configured external AI provider.

Required backend env (see `.env.example`):

```text
AI_API_KEY=
AI_MODEL=
AI_TIMEOUT_SECONDS=20
AI_LISTING_RATE=5/minute
AI_LISTING_MAX_OUTPUT_TOKENS=450
```

`AI_MODEL` must be a vision-capable model that accepts image input via the OpenAI Responses API (recommended showcase default: `gpt-4o-mini`). Leave key/model blank to boot without AI; generation then returns 503.

**MVP scope:** description text only. Product-doc “highlights / structured details” are a later enhancement — not generated by this endpoint.

### BidKori support chatbot (stateless)

`POST /api/ai/chat/`

Request:

```json
{ "message": "How do I place a bid?" }
```

Success response:

```json
{ "answer": "..." }
```

- **Public** (`AllowAny`) — optional login only flavors Buyer/Seller navigation hints.
- **Informational only** — no account-specific data, no marketplace search tools, no actions, no chat persistence.
- **Throttle:** scoped `ai_chat` (default `10/minute`), independent of `ai_listing`.
- One message in → one answer out. No conversation history/thread IDs.
- Provider key stays **backend-only** (`AI_API_KEY`). Do not use `NEXT_PUBLIC_*`.

Chat env (see `.env.example`):

```text
AI_API_KEY=
AI_CHAT_MODEL=
AI_CHAT_RATE=10/minute
AI_CHAT_MAX_OUTPUT_TOKENS=400
AI_TIMEOUT_SECONDS=20
```

Leave `AI_CHAT_MODEL` / `AI_API_KEY` blank to boot without chat; the endpoint then returns 503. Docker Compose passes these from root `.env` into `web` / `worker` / `beat` via `x-app-environment`.

### Notification WebSocket handshake

```text
1. Connect to /ws/notifications/  (no query token)
2. Send: {"type": "authenticate", "token": "<your-drf-token>"}
3. Receive: {"type": "authenticated", "user_id": <id>}
4. Receive live: {"type": "notification.created", "notification": {...}}
```

Read / read-all remain REST-only. Offline users recover via `GET /api/notifications/`.

---

## Testing Scripts

| Script / command | Purpose |
| --- | --- |
| `python manage.py seed_data` | Demo users, MVP categories, products, auctions, bids |
| `python manage.py seed_categories` | Idempotent MVP Category catalog only |
| `python manage.py close_expired_auctions` | Close expired ACTIVE auctions + assign winners (manual / recovery; same logic as Celery) |
| `celery -A config worker -l INFO` | Process scheduled close tasks |
| `celery -A config beat -l INFO` | Enqueue expired-auction closing every ~10s |
| `python manage.py export_postman` | Write `docs/BidKori_v3.postman_collection.json` |
| `python scripts/integration_test.py` | End-to-end bidding lifecycle |
| `python scripts/stress_test.py --docker` | 50 concurrent place-bid workers |
| `python scripts/test_mahmud_features.py --docker` | Media upload + auto-close verification |

### Update 3 stress-test highlights

- **50 concurrent workers** posting incremental bids
- **Zero HTTP 500 / deadlock crashes**
- **Final `current_highest_bid` matched max accepted bid** (atomic consistency under `select_for_update`)

---

## Project Structure

```text
bid-kori/
├── auctions/                 # Bidding, media, payments, lifecycle commands
├── products/                 # Catalog & seed data
├── users/                    # Auth & profiles
├── config/                   # Settings, Celery app, URLs, CORS, spectacular
├── scripts/                  # Integration & stress tests
├── docs/                     # Exported Postman collection
├── bidkori-frontend/         # Next.js App Router client
├── docker-compose.yml
├── Dockerfile
├── requirements.txt
├── PITCH.md
└── README.md
```

---

## License

This project is licensed under the [MIT License](LICENSE).
