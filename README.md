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
- **`users`** — Registration, login, authenticated profile (`/me/`)
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

**Real-time note:** Bids are still placed only via REST `POST /api/auctions/<id>/place-bid/`. WebSockets are **subscribe/broadcast only** (`bid.accepted` after a successful commit; `auction.closed` after authoritative finalization). Production must use Redis (`REDIS_URL`); the test suite uses an in-memory channel layer and does not need Redis.

**Automatic closing:** Celery Beat schedules expired ACTIVE auction finalization every ~10s without HTTP traffic. Late bids are still rejected immediately by `BidService` even before Beat runs. Manual recovery remains available via `close_expired_auctions`.

Useful commands:

```powershell
docker compose logs -f web worker beat
docker compose exec web python manage.py close_expired_auctions
docker compose exec web python manage.py export_postman
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
python manage.py migrate
python manage.py seed_data
```

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
| `GET` | `/api/auctions/` | List auctions (`status`, `category`, `search` filters) |
| `POST` | `/api/auctions/` | Create auction (JSON or multipart + images) |
| `POST` | `/api/auctions/<id>/images/` | Upload auction images |
| `POST` | `/api/auctions/<id>/place-bid/` | Place bid (atomic + rate limited; broadcasts `bid.accepted` after commit) |
| `WS` | `/ws/auctions/<id>/` | Subscribe to live `bid.accepted` / `auction.closed` events (read-only; no bid submission) |
| `WS` | `/ws/notifications/` | Authenticated private inbox push (`notification.created`); first message auth with DRF token (no token in URL) |
| `POST` | `/api/auctions/<id>/checkout/` | Winner mock payment checkout |
| `GET` | `/api/auctions/my-bids/` | Buyer bid dashboard data |
| `GET` | `/api/notifications/` | Authenticated user's notifications (paginated, newest first) |
| `POST` | `/api/notifications/<id>/read/` | Mark one own notification read |
| `POST` | `/api/notifications/read-all/` | Mark all own notifications read |
| `GET` | `/api/schema/swagger-ui/` | Interactive OpenAPI docs |

Auth header:

```http
Authorization: Token <your-token>
```

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
| `python manage.py seed_data` | Demo users, products, auctions, bids |
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
