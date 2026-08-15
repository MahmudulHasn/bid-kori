# BidKori API

A decoupled RESTful auction and live bidding backend built with **Django** and **Django REST Framework**.

BidKori powers product catalog management, authenticated buyer/seller workflows, and a bidding engine that validates live bids, enforces minimum increments, and tracks winning bidders.

---

## Tech Stack & Tools

| Layer | Technology |
| --- | --- |
| Backend Framework | Django 6, Django REST Framework (DRF) |
| Authentication | Token-based auth (`rest_framework.authtoken`) |
| Database | SQLite (development) / PostgreSQL-compatible |
| Environment | Python 3.x, Virtual Environment (`venv`) |
| Supporting packages | `django-cors-headers`, `python-dotenv`, `psycopg2-binary` |

---

## Team Contributions & Architecture Breakdown

| Contributor | Focus | Highlights |
| --- | --- | --- |
| **Mahmud** | Core Infrastructure & Catalog | App architecture, base routing, Product models, categories, and catalog endpoints (`/api/products/`) |
| **Rafi** | Authentication & Security | Identity management, user registration, token-based authentication (`/api/users/login/`, `/api/users/register/`), and DRF global security settings |
| **Samira** | Profiles, Guardrails & Dashboards | Foreign Key model linkage, custom DRF permissions (`IsSellerOrReadOnly`, `IsNotSeller`), Seller Dashboard (`/api/products/my-listings/`), and Buyer Dashboard (`/api/auctions/my-bids/`) |
| **Toufiq** | Bidding Engine & Automation | Real-time bid validation, minimum bid calculations, winning bidder updates, active auctions list (`/api/auctions/active/`), and live bid history (`/api/auctions/<id>/history/`) |

### App Boundaries

- **`products`** — Product listings, categories, seller catalog endpoints
- **`auctions`** — Auction lifecycle, bidding engine, bid history, buyer dashboard
- **`users`** — Registration, login, authenticated profile (`/me/`)

---

## Getting Started & Local Setup

### 1. Clone the repository

```bash
git clone https://github.com/<your-org>/bid-kori.git
cd bid-kori
```

### 2. Create and activate a virtual environment

```bash
python3 -m venv venv
source venv/bin/activate        # macOS / Linux
# venv\Scripts\activate         # Windows
```

### 3. Install dependencies

```bash
pip install Django djangorestframework django-cors-headers python-dotenv psycopg2-binary
```

> Tip: once `requirements.txt` is populated, prefer `pip install -r requirements.txt`.

### 4. (Optional) Configure PostgreSQL

By default the project uses SQLite. To use PostgreSQL, create a `.env` file in the project root:

```env
DB_NAME=bidkori
DB_USER=postgres
DB_PASSWORD=your_password
DB_HOST=localhost
DB_PORT=5432
```

### 5. Run migrations

```bash
python manage.py makemigrations
python manage.py migrate
```

### 6. Create a superuser

```bash
python manage.py createsuperuser
```

### 7. Launch the development server

```bash
python manage.py runserver
```

The API root is available at [http://127.0.0.1:8000/](http://127.0.0.1:8000/).

---

## API Endpoint Reference

### Products

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| `GET` | `/api/products/` | Public | List all products |
| `POST` | `/api/products/` | Authenticated | Create a product listing |
| `GET` | `/api/products/<id>/` | Public | Retrieve a single product |
| `PUT` / `PATCH` | `/api/products/<id>/` | Authenticated (seller) | Update own product |
| `DELETE` | `/api/products/<id>/` | Authenticated (seller) | Delete own product |
| `GET` | `/api/products/my-listings/` | Authenticated | Seller dashboard — current user's listings |

### Authentication

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| `POST` | `/api/users/register/` | Public | Register a new user and receive an auth token |
| `POST` | `/api/users/login/` | Public | Authenticate with username/password and receive a token |
| `GET` | `/api/users/me/` | Authenticated | Return the authenticated user's profile |

### Auctions & Bidding

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| `GET` | `/api/auctions/` | Public | List all auctions |
| `POST` | `/api/auctions/` | Authenticated | Create an auction (with nested product) |
| `GET` | `/api/auctions/<id>/` | Public | Retrieve auction details |
| `PUT` / `PATCH` / `DELETE` | `/api/auctions/<id>/` | Authenticated | Update or delete an auction |
| `GET` | `/api/auctions/active/` | Public | List active auctions (`ACTIVE` + future `end_time`) |
| `POST` | `/api/auctions/<auction_id>/place-bid/` | Authenticated (not seller) | Place a bid; validates activity, amount, and min increment |
| `GET` | `/api/auctions/<auction_id>/history/` | Public | Live bid history ordered by highest amount |
| `GET` | `/api/auctions/my-bids/` | Authenticated | Buyer dashboard — bids placed by the current user |
| `POST` | `/api/auctions/<id>/transition/` | Authenticated | Transition auction status via the state machine |

### Admin

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| — | `/admin/` | Staff | Django Admin for models and data management |

---

## Testing & Usage

### Django Admin

1. Start the server and open [http://127.0.0.1:8000/admin/](http://127.0.0.1:8000/admin/).
2. Sign in with the superuser created during setup.
3. Inspect and manage **Products**, **Auctions**, and **Bids** directly.

### DRF Browsable API

Browse HTML forms for endpoints when session authentication is enabled (e.g. after logging in via Admin). Useful for quick manual checks during development.

### Postman (or any HTTP client)

1. **Register or log in** to obtain a token:

```http
POST /api/users/login/
Content-Type: application/json

{
  "username": "buyer_test",
  "password": "your_password"
}
```

2. Copy the `token` from the response.

3. Send authenticated requests with the DRF token header:

```http
Authorization: Token <your-token>
Content-Type: application/json
```

4. **Example — place a bid:**

```http
POST /api/auctions/1/place-bid/
Authorization: Token <your-token>
Content-Type: application/json

{
  "bid_amount": "550.00"
}
```

5. **Example — fetch active auctions:**

```http
GET /api/auctions/active/
```

6. **Example — view bid history:**

```http
GET /api/auctions/1/history/
```

> **Note:** This project uses DRF **Token Authentication**. The correct header scheme is `Authorization: Token <token>` (not `Bearer`, unless you later adopt JWT).

---

## Project Structure

```text
bid-kori/
├── auctions/          # Bidding engine, auction lifecycle, bid history
├── products/          # Catalog, categories, seller listings
├── users/             # Registration, login, profile
├── config/            # Django settings, root URLconf
├── manage.py
└── README.md
```

---

## License

This project is licensed under the [MIT License](LICENSE).
