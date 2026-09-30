# BidKori — Comprehensive Architecture, Tech Stack & Business Model Guide

---

## 1. What is BidKori?

**BidKori** is a modern, real-time online auction marketplace engineered for dynamic, transparent, and fair peer-to-peer and business-to-consumer bidding. 

In traditional e-commerce platforms, prices are fixed, and in traditional classified platforms, buyers and sellers must negotiate manually through messages, often leading to ghosting, price disputes, and lack of market valuation. BidKori solves this by providing:

1. **Live Auction Engine**: Real-time bidding with sub-second WebSocket updates, live countdown timers, and immediate outbid notifications.
2. **Fair & Fraud-Resistant Marketplace**: Strict anti-shill bidding safeguards, seller ownership validation, and pessimistic database row-locking (`select_for_update()`) to eliminate bid-race conditions.
3. **AI-Powered Assistance**:
   - **AI Product Description Generator**: Allows sellers to generate compelling, SEO-friendly, and professional product descriptions in seconds using Google Gemini AI.
   - **AI Site Chatbot & Navigation Agent**: An auction-aware conversational assistant that helps buyers discover products, query live auctions, check current top bids, and navigate directly to relevant listings.
4. **Structured Monetization & Fulfillment**: Post-auction workflows where winners submit verified shipping details and sellers unlock buyer fulfillment information via platform-audited monetization rules.
5. **Multi-Role Workspaces**: Tailored user dashboards for **Buyers** (bidding history, won items, watchlists), **Sellers** (product inventory, auction creation, earnings, winner unlock), and **Staff/Admins** (financial health, platform volume, dispute moderation).

---

## 2. BidKori Business Model & Monetization Strategy

BidKori operates on a multi-sided marketplace business model combining transactional success fees, value-added service fees, and premium promotional features.

```
                           +------------------------+
                           |   BidKori Marketplace  |
                           +------------------------+
                                       |
       +-------------------------------+-------------------------------+
       |                               |                               |
       v                               v                               v
[ Transaction Fees ]       [ Value-Added Services ]      [ Premium Promotions ]
- Platform Success Fee      - Winner Details Unlock Fee   - Featured Auction Slots
- 2% on completed sales     - Fixed BDT fee per sale      - Homepage Hero Placement
- Automatically deducted    - Unlocks shipping & PII      - Category Top Listings
  from Seller net payout      for safe delivery
```

### 1. Platform Success Fee (Transaction Fee)
- **Mechanism**: When an auction closes with a winner and payment is marked completed, BidKori charges a percentage fee on the final winning bid (configured via `PLATFORM_SUCCESS_FEE_PERCENT`, e.g., **2.00%**).
- **Buyer Experience**: The buyer pays the exact winning hammer price without surprise hidden markups.
- **Seller Net**: The fee is deducted from the seller's gross payout, leaving an immutable snapshot of `fee_rate`, `platform_fee`, and `seller_net_amount` recorded in the platform financial ledger.

### 2. Winner Details Unlock Fee (Seller Fulfillment Entitlement)
- **Mechanism**: To safeguard buyer privacy and combat phantom buyers, winner contact and shipping details (phone number, shipping address, delivery preferences) remain sealed upon auction completion.
- **Unlock Charge**: The seller pays a platform-configured fee (e.g., `WINNER_DETAILS_UNLOCK_FEE = 50.00 BDT` or percentage-scaled) to unlock the winner's complete fulfillment details.
- **Value Delivered**: Ensures only committed sellers initiate contact and dispatch physical goods, generating steady platform revenue even on diverse item values.

### 3. Featured Auction Promotion (Listing Boosts)
- **Mechanism**: Sellers can promote their high-value auctions to premium slots:
  - **Homepage Hero Showcase**: Maximum visibility on the landing page hero carousel and live drone showcase.
  - **Category Highlights**: Sticky placement at the top of category filters (e.g., Electronics, Watches, Collectibles).
- **Pricing**: Tiered flat fees (e.g., 24-hour boost, 7-day campaign).

### 4. Escrow & Payment Processing Margins (Future Roadmap)
- Integration with local payment gateways (bKash, Nagad, Rocket, SSLCommerz) allows holding buyer funds in escrow until shipment delivery confirmation, earning micro-interest or charging a nominal 1.5% checkout processing fee.

### 5. Financial Audit & Ledger Integrity
- All monetization reads in BidKori derive from immutable `Payment` snapshots and `WinnerDetailsUnlock` records in PostgreSQL. Platform revenue is strictly distinguished from seller gross volume to prevent double-counting.

---

## 3. Tech Stack Matrix (Which Tech is Used for What?)

| Technology | Layer | BidKori Features & Responsibility | Why This Tech Was Chosen |
|---|---|---|---|
| **Django (v5+)** | Backend Core | Core Web Framework, ORM, Model relations, Migration engine, Admin dashboard, Security middlewares, Signal handling. | Rapid development, built-in security (CSRF, SQLi protection), robust ORM, battle-tested in financial and marketplace apps. |
| **Django REST Framework (DRF)** | API Layer | RESTful endpoints (`/api/v1/...`), ModelSerializers, Token Authentication, Permissions (`IsAuthenticated`, `IsSeller`, `IsAdmin`). | Industry-standard for clean API design, strict validation pipelines, and decoupled frontend-backend communication. |
| **Django Channels (v4+)** | Real-Time Engine | WebSocket routing (`ws://...`), live bidding consumer (`AuctionBidConsumer`), live auction room broadcasts. | Extends Django to handle asynchronous protocols like WebSockets alongside traditional HTTP. |
| **Daphne** | ASGI Server | Unified ASGI HTTP + WebSocket web server running the BidKori backend application inside Docker. | Native ASGI server maintained by the Django project; efficiently handles thousands of concurrent long-lived WebSocket connections. |
| **PostgreSQL 15** | Primary Database | Relational storage for Users, Products, Auctions, Bids, Payments, Unlock records, Notifications. Uses `select_for_update()`. | ACID compliance, robust transaction isolation, support for pessimistic row-level locking needed to prevent concurrent outbid races. |
| **Redis 7** | In-Memory Data Store | 1. Channel layer for Django Channels (real-time message bus).<br>2. Celery message broker and task result backend.<br>3. Temporary cache. | Sub-millisecond read/write latency, pub/sub capabilities, rock-solid broker reliability for distributed queues. |
| **Celery Worker** | Asynchronous Tasks | Background task processor executing long-running jobs (closing expired auctions, sending email/notifications). | Offloads heavy computation from the HTTP request-response cycle, ensuring zero delay for user-facing requests. |
| **Celery Beat** | Periodic Scheduler | Automated cron scheduler running every minute to trigger `close_expired_auctions_task`. | Automates auction lifecycle state transitions reliably without requiring manual triggers or external cron jobs. |
| **Next.js (App Router, v14/15)** | Frontend Framework | High-performance React application, Server and Client Components, file-based routing, SEO optimization, responsive layout. | Modern web standards, fast page transitions, built-in image optimization, hybrid server/client execution. |
| **TypeScript** | Frontend Language | Static typing across all components, API client helpers, hook contracts, and WebSocket payload interfaces. | Eliminates runtime bugs, provides autocomplete and self-documenting code across large frontend codebases. |
| **Tailwind CSS** | Styling & Theme | Dark-mode design system, responsive breakpoints, auction card grids, glassmorphism, accent badges. | Highly maintainable utility classes, zero stylesheet bloat, unified design token configuration (`tailwind.config.ts`). |
| **Framer Motion & GSAP** | Motion & Polish | Component transitions, modal reveals, cinematic homepage loading screen, interactive floating stats, hero animations. | Framer Motion handles declarative component motion; GSAP handles high-performance timeline and scroll-driven animation. |
| **SWR & Axios** | Data Fetching & HTTP | Client-side API requests, automatic revalidation, optimistic cache updates, error interceptors, Auth token injection. | Eliminates stale data on auction listings, automatic retry on network blips, clean request/response abstraction. |
| **Google Identity Services (GIS)** | Authentication | One-click Google Sign-In & Sign-Up via OAuth 2.0 / OpenID Connect, linked with authoritative Django backend accounts. | Frictionless onboarding for users, increases conversion rate, eliminates password friction while keeping Django authoritative. |
| **Google Gemini AI** | Artificial Intelligence | 1. AI Product Description Generator for sellers.<br>2. AI Chatbot Assistant with live auction search and navigation for buyers. | State-of-the-art multimodal language understanding, fast inference, rich contextual recommendations. |
| **Docker & Docker Compose** | DevOps & Infrastructure | Multi-container setup orchestrating `web`, `db`, `redis`, `worker`, `beat`, and frontend services identically across dev and prod. | Zero configuration drift, reproducible environments, simplified dependencies installation across operating systems. |
| **WhiteNoise & Pillow** | Static & Media Assets | WhiteNoise serves production static assets directly from ASGI; Pillow handles upload validation, resizing, and processing of product photos. | Low-overhead asset serving without needing an external Nginx proxy in development; reliable image processing. |
| **drf-spectacular** | API Documentation | OpenAPI 3.0 specification auto-generation, Swagger UI (`/api/docs/`), ReDoc (`/api/redoc/`). | Self-documenting, interactive REST API explorer for frontend engineers and external integrations. |

---

## 4. Deep-Dive: Tech Stacks Explained One by One

---

### 1. Celery & Celery Beat

#### What is Celery?
**Celery** is an open-source, asynchronous distributed task queue system written in Python. It allows applications to execute time-consuming operations in the background, separate from the primary web request-response loop. **Celery Beat** is Celery's companion scheduler that acts like a distributed cron daemon, firing periodic tasks at configured intervals.

#### Why do we use Celery in BidKori?
In a live auction platform, operations like closing an auction, determining the winner, calculating platform commissions, generating invoices, and sending notifications involve multiple database transactions and network calls. If these were executed inside a user's HTTP request, the user's browser would freeze, and any server timeout would leave the auction in an inconsistent state.

Celery enables:
1. **Asynchronous Execution**: Heavy tasks run independently in worker processes.
2. **Scheduled Lifecycle Automation**: Celery Beat wakes up every minute to check which auctions have surpassed their `end_time` and transitions them from `ACTIVE` to `CLOSED`.
3. **Fault Tolerance & Retries**: If a worker fails or an external email service is temporarily unreachable, Celery automatically retries the task without dropping data.

#### In which features is Celery used in BidKori?
1. **Periodic Auction Lifecycle Closing (`auctions.tasks.close_expired_auctions_task`)**:
   - Celery Beat triggers this task every 60 seconds.
   - It queries all auctions where `status='ACTIVE'` and `end_time <= timezone.now()`.
   - Calls the authoritative `close_all_expired_auctions()` service.
   - For each expired auction:
     - Identifies the highest valid bid.
     - Declares the winner or marks the auction as `UNSOLD` if no bids exist or reserve price was not met.
     - Creates the pending `Payment` ledger record.
     - Emits a real-time `auction.closed` event over Django Channels so all open browser tabs update instantly.
2. **Notification & Email Dispatch (Background)**:
   - Notifies outbid participants when a higher bid arrives.
   - Sends winning notification emails and delivery instructions to the victorious bidder.

---

### 2. Redis (Remote Dictionary Server)

#### What is Redis?
**Redis** is an open-source, in-memory key-value data structure store used as a database, cache, message broker, and streaming engine. It keeps all data in RAM, offering sub-millisecond response times.

#### Why do we use Redis in BidKori?
A real-time auction marketplace has two extreme demands:
1. **High-Speed Message Brokering**: Thousands of concurrent users watching an auction require immediate WebSocket push notifications when a bid is placed.
2. **Distributed Queue Storage**: Celery requires a lightning-fast queue where tasks can be produced and consumed instantly.

Redis is the high-performance backbone connecting these distributed components without burdening the PostgreSQL database.

#### In which features is Redis used in BidKori?
1. **Django Channels Channel Layer (`channels_redis.core.RedisChannelLayer`)**:
   - When a user bids on Auction #12, the Django server sends a broadcast message to group `auction_12`.
   - Redis receives this message and broadcasts it across all worker processes and Daphne server threads, pushing the new bid data to every connected WebSocket client in under 50 milliseconds.
2. **Celery Task Broker & Result Backend (`redis://redis:6379/1` and `/2`)**:
   - Stores Celery task queues and keeps track of task completion states and execution logs.
3. **Session & Live Participant Caching**:
   - Caches active viewer counts and temporary rate-limiting tokens.

---

### 3. PostgreSQL

#### What is PostgreSQL?
**PostgreSQL** is an advanced, enterprise-grade open-source relational database known for its reliability, data integrity, robust feature set, and strict adherence to ACID (Atomicity, Consistency, Isolation, Durability) principles.

#### Why do we use PostgreSQL in BidKori?
Auctions deal directly with real money, binding bids, inventory ownership, and legal checkout states. A simple NoSQL database lacks the ACID guarantees needed to prevent financial inconsistencies. 

PostgreSQL provides:
1. **Pessimistic Row-Level Locking (`SELECT ... FOR UPDATE`)**: Guarantees that when two bids arrive in the exact same millisecond, one bid must wait for the other, preventing double-acceptance of identical amounts.
2. **Relational Integrity**: Foreign key constraints guarantee that bids cannot exist without valid users and valid auctions.
3. **Decimal Precision**: Accurate storage of financial amounts (`DecimalField(max_digits=12, decimal_places=2)`) without floating-point rounding errors.

#### In which features is PostgreSQL used in BidKori?
1. **Bidding Engine (`BidService.place_bid`)**:
   - Uses `transaction.atomic()` and `Auction.objects.select_for_update()` to lock the auction row during validation.
   - Checks if `bid_amount >= current_price + min_increment`.
   - Prevents self-bidding (seller bidding on their own item) and duplicate consecutive bids.
2. **Financial Ledgers & Monetization**:
   - Stores `Payment` records with immutable fee snapshots (`platform_fee`, `fee_rate`, `seller_net_amount`).
   - Stores `WinnerDetailsUnlock` records to track whether a seller has paid the fee to view buyer shipping info.
3. **Product Catalog & Category Trees**:
   - Relational tables for categories, product conditions, multiple images per item, and seller profiles.

---

### 4. Django & Django REST Framework (DRF)

#### What is Django & DRF?
- **Django**: A high-level Python web framework that encourages rapid development and clean, pragmatic design. It follows the Model-View-Template (MVT) pattern.
- **Django REST Framework (DRF)**: A powerful and flexible toolkit built on top of Django for building Web APIs, providing serialization, request parsing, authentication policies, and viewsets.

#### Why do we use Django & DRF in BidKori?
1. **Security Out of the Box**: Automatically protects against SQL injection, cross-site scripting (XSS), and cross-site request forgery (CSRF).
2. **Standardized Architecture**: Clear separation of concerns into dedicated Django apps:
   - `accounts`: User authentication, roles (Buyer, Seller, Admin), Google account linking.
   - `products`: Product listings, image uploads, AI description generation.
   - `auctions`: Auction lifecycles, bidding engine, winner resolution, monetization.
   - `core`: Shared utilities, base models, permission classes.
3. **Decoupled API-First Design**: The backend serves clean, documented JSON responses consumed by the Next.js frontend, mobile apps, or external integrations.

#### In which features is Django & DRF used in BidKori?
1. **REST API Endpoints**:
   - `GET /api/v1/auctions/`: Paginated auction listings with filtering by category, status, search query, and sorting.
   - `POST /api/v1/auctions/{id}/bid/`: Fallback HTTP bid submission.
   - `POST /api/v1/products/generate-description/`: Calls AI service to produce listing copy.
   - `POST /api/v1/auth/google/`: Authenticates Google ID tokens and creates or links Django user accounts.
   - `POST /api/v1/auctions/{id}/unlock-winner-details/`: Processes seller unlock fee transactions.
2. **Serializers & Validation**:
   - Validates that auction start time is before end time, reserve prices are logical, and bid increments adhere to marketplace guidelines.
3. **Role-Based Permission Classes**:
   - `IsSeller`: Ensures only verified sellers can create products and initiate auctions.
   - `IsBuyer`: Authorizes bidding and winner fulfillment submission.
   - `IsAdminUser`: Restricts access to the financial dashboard and moderation endpoints.

---

### 5. Django Channels & Daphne (ASGI)

#### What is Django Channels & Daphne?
Traditional Django is based on WSGI (Web Server Gateway Interface), which is synchronous and can only handle standard HTTP request-response cycles. 
- **Django Channels**: Replaces Django's request-driven core with an ASGI (Asynchronous Server Gateway Interface) foundation, allowing Django to handle long-running connections such as WebSockets.
- **Daphne**: The ASGI HTTP and WebSocket server that runs the Python application and accepts incoming client connections.

#### Why do we use Channels & Daphne in BidKori?
In a live auction, bidders cannot be expected to manually refresh their browsers every few seconds. Polling an HTTP endpoint creates unnecessary server load and introduces a 2–5 second delay. 
With WebSockets via Django Channels:
- The connection between browser and server remains continuously open.
- When any user places a bid, the server broadcasts the new bid and updated countdown timer to all active viewers in milliseconds.

#### In which features is Channels & Daphne used in BidKori?
1. **Live Auction Bidding Consumer (`auctions.consumers.AuctionBidConsumer`)**:
   - When a user views an auction page, the frontend establishes a WebSocket connection to `ws://localhost:8000/ws/auctions/{id}/`.
   - The consumer authenticates the user's token and subscribes their connection to the Redis group `auction_{id}`.
   - When a bid is placed:
     - The consumer validates the incoming bid payload.
     - Runs the transaction through `BidService`.
     - Broadcasts `new_bid` event to all group members containing the new highest bid, bidder username masked for privacy (e.g., `j***e`), and new minimum bid amount.
2. **Auction Lifecycle Broadcasts**:
   - Broadcasts `auction.closed` when time expires, instantly showing "Auction Ended" and naming the winner without a page reload.

---

### 6. Next.js 14+ (App Router)

#### What is Next.js?
**Next.js** is a production React framework created by Vercel that offers hybrid static & server rendering, file-system based routing (App Router), smart data pre-fetching, and built-in optimization tools.

#### Why do we use Next.js in BidKori?
1. **High Performance & Fast First Load**: Next.js combines Server Components for rapid initial HTML generation with Client Components for dynamic, interactive widgets.
2. **SEO Optimization**: Public auction listings and category pages are rendered so that Google and social search crawlers can index live auction titles, photos, and descriptions.
3. **App Router Conventions**: Clean route hierarchy (`src/app/(public)`, `src/app/dashboard/(buyer)`, `src/app/dashboard/(seller)`), shared layouts, and parallel loading states.

#### In which features is Next.js used in BidKori?
1. **Live Auction Room (`/auctions/[id]`)**:
   - Renders interactive bidding cards, image carousels, real-time bid history lists, and seller profile cards.
2. **Dynamic Marketplace (`/auctions`)**:
   - Multi-facet search, price range filtering, category chips, and sort-by-countdown controls.
3. **Dedicated Role Dashboards**:
   - **Buyer Dashboard**: `/dashboard/bids`, `/dashboard/won-items`, `/dashboard/profile`.
   - **Seller Dashboard**: `/dashboard/inventory`, `/dashboard/sales`, `/dashboard/create-auction`.
   - **Admin Dashboard**: `/admin/finances`, `/admin/auctions`, `/admin/disputes`.
4. **Cinematic Landing Page (`/`)**:
   - Fullscreen video showcase, live stats chips, category sliders, and call-to-action sections.

---

### 7. TypeScript

#### What is TypeScript?
**TypeScript** is a strongly typed programming language that builds on JavaScript by adding static type definitions.

#### Why do we use TypeScript in BidKori?
In a financial bidding system, sending a string instead of a number for a bid amount or misnaming a payload key (e.g., `bidAmount` vs `bid_amount`) can cause failed bids or UI crashes during intense last-second auctions. TypeScript catches these errors at compile time before code ever reaches production.

#### In which features is TypeScript used in BidKori?
1. **API Contracts & Model Interfaces (`src/types/`)**:
   - Defines strict interfaces for `Auction`, `Bid`, `Product`, `User`, `Payment`, and `WinnerDetails`.
2. **WebSocket Message Contracts**:
   - Types for inbound and outbound socket packets (`WebSocketBidPayload`, `WebSocketAuctionUpdate`).
3. **Component Props & State Management**:
   - Type-safe form inputs, button states, and authentication store hooks.

---

### 8. Tailwind CSS

#### What is Tailwind CSS?
**Tailwind CSS** is a utility-first CSS framework packed with classes like `flex`, `pt-4`, `text-center`, and `rotate-90` that can be composed to build any design directly in markup.

#### Why do we use Tailwind CSS in BidKori?
1. **Custom Dark-Mode Aesthetic**: BidKori uses a bespoke luxury dark-theme palette (charcoal zinc-900/950, glowing BidKori amber-orange accents, glassmorphic backdrop-blur cards).
2. **Maintainability & Zero Unused CSS**: Tailwind purges unused styles in production, resulting in tiny CSS bundle sizes (< 25 KB) for instant page rendering.
3. **Responsive Grids**: Effortlessly adapts from mobile phone screens (1 column) to large desktop monitors (4 columns) using `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4`.

#### In which features is Tailwind CSS used in BidKori?
1. **Design System & Cards**:
   - Product auction cards with glowing countdown borders, badge status indicators (`LIVE`, `ENDING SOON`, `CLOSED`).
2. **Navigation Bar & Floating Controls**:
   - Glassmorphism navigation bar with blur filters, user dropdowns, and mobile drawers.
3. **Form Elements & Interactive States**:
   - Form fields with focus-ring styling, interactive toggle pills, and custom scrollbars.

---

### 9. Framer Motion & GSAP (GreenSock Animation Platform)

#### What are Framer Motion & GSAP?
- **Framer Motion**: A production-ready motion library for React that simplifies declarative animations, exit animations, and gesture interactions.
- **GSAP (GreenSock Animation Platform)**: The industry standard for high-performance JavaScript animations, timeline sequencing, and scroll-driven triggers via **ScrollTrigger**.

#### Why do we use them in BidKori?
Auctions are high-energy, exciting experiences. Static, lifeless pages make the bidding process feel tedious. 
- We use **Framer Motion** for component-level reactivity: smooth tab switching, modal slide-ins, and animated number increments when a new top bid arrives.
- We use **GSAP** for cinematic storytelling: the full-screen landing page preloader, smooth scrolling animations, and hero showcase reveals.

#### In which features are they used in BidKori?
1. **Cinematic Home Loader (`src/components/home/HomeCinematicLoader.tsx`)**:
   - GSAP timeline sequence that animates the BidKori logo, loading percentage, and smooth curtain reveal upon initial load.
2. **Live Bid Pulse Animations**:
   - Framer Motion animates the current price badge with a subtle gold pulse each time an outbid occurs.
3. **Scroll-Driven Marketplace Highlights**:
   - GSAP ScrollTrigger reveals feature cards and category items as the user scrolls down the landing page.

---

### 10. Google Identity Services (Google OAuth 2.0)

#### What is Google Identity Services (GIS)?
**Google Identity Services** is Google’s modern authentication SDK offering one-click "Sign in with Google" and "Sign up with Google" buttons using OpenID Connect (OIDC).

#### Why do we use it in BidKori?
Asking users to fill out multi-field registration forms increases drop-off rates. Google Sign-In lets users sign up in under 5 seconds with an existing Google account while providing a verified email address.

#### Critical Architecture: Django Remains the Sole Authority
BidKori enforces a strict security separation:
- **Google Authenticates Identity**: Confirms the user owns the email address and provides a cryptographically signed JWT ID Token.
- **Django Authorizes Access**: The backend receives the token, validates Google's cryptographic signature, checks or creates the BidKori `User` profile, assigns their selected role (`Buyer` or `Seller`), and issues an official BidKori auth token.
- Google never controls user roles, permissions, or wallet balances.

#### In which features is Google Auth used in BidKori?
1. **Login & Registration Pages (`/auth/login`, `/auth/register`)**:
   - Official Google button rendered via `GoogleSignInButton.tsx` (configured with `locale: 'en'`).
2. **Account Linking (`/api/v1/auth/google/`)**:
   - Allows users who registered with username/password to link their Google account for single-click login in the future.

---

### 11. Google Gemini AI Engine

#### What is Google Gemini AI?
**Google Gemini** is Google’s state-of-the-art multimodal generative artificial intelligence model capable of reasoning over text, images, and complex structured data.

#### Why do we use Gemini AI in BidKori?
1. **Reduces Seller Friction**: Many sellers struggle to write informative, SEO-optimized product titles and descriptions, leading to low buyer interest.
2. **Buyer Discovery & Support**: Buyers often don't want to browse through dozens of pages; they want to ask natural questions like *"Are there any vintage automatic watches ending today?"* and receive immediate recommendations.

#### In which features is Gemini AI used in BidKori?
1. **AI Product Description Generator (`products/ai_views.py`)**:
   - The seller enters basic bullet points (e.g., *"iPhone 15 Pro, 256GB, battery health 94%, Natural Titanium, no scratches"*).
   - Gemini transforms this into a structured, persuasive, and transparent auction listing highlighting condition, specs, and estimated market value.
2. **AI Site Assistant & Navigation Agent (`src/components/chat/SupportChatWidget.tsx`)**:
   - An interactive floating chatbot available across the marketplace.
   - Detects user intent (Search, Navigation, Auction Inquiry, Rules Explanation).
   - Connects with the live database to provide real-time auction recommendations with direct clickable links to active listings.

---

### 12. SWR & Axios

#### What are SWR & Axios?
- **Axios**: A promise-based HTTP client for the browser and node.js with request/response interceptors, automatic JSON transformation, and cancellation support.
- **SWR (Stale-While-Revalidate)**: A React Hooks data-fetching strategy developed by Vercel. It first returns data from cache (stale), then sends the fetch request (revalidate), and finally comes with up-to-date data.

#### Why do we use them in BidKori?
1. **Zero UI Freezing**: SWR renders cached data instantly while fetching fresh data in the background, making navigation feel instantaneous.
2. **Automatic Revalidation**: Automatically refetches auction details when the user refocuses the browser window.
3. **Centralized Interceptors**: Axios interceptors automatically attach the `Authorization: Token <token>` header to every outgoing API request and gracefully handle 401 unauthorized responses.

#### In which features are they used in BidKori?
1. **Marketplace Listings (`src/hooks/useAuctions.ts`)**:
   - Fetches and caches paginated auction cards and category listings.
2. **Dashboard Data**:
   - Manages user profiles, placed bids, watchlist items, and sales statistics.

---

### 13. Docker & Docker Compose

#### What is Docker & Docker Compose?
- **Docker**: A containerization platform that packages an application and all its dependencies into an isolated container image.
- **Docker Compose**: A tool for defining and running multi-container Docker applications using a single YAML configuration file (`docker-compose.yml`).

#### Why do we use Docker in BidKori?
BidKori is a sophisticated distributed system consisting of 6 interacting services:
1. `web` (Django + Daphne ASGI server)
2. `db` (PostgreSQL 15 database)
3. `redis` (Redis 7 pub/sub and broker)
4. `worker` (Celery background worker)
5. `beat` (Celery Beat periodic scheduler)
6. `frontend` (Next.js development/production server)

Running these manually on a developer's machine requires installing Python, PostgreSQL, Redis, Node.js, and configuring environment paths manually. With Docker Compose, running:
```bash
docker compose up -d
```
spins up the entire ecosystem in seconds with isolated networking and persistent volumes.

---

## 5. Key System Workflows

### A. Live Bidding Concurrency Workflow

```
User Places Bid ($150)
         │
         ▼
[ WebSocket / HTTP API ]
         │
         ▼
[ Django BidService.place_bid ]
         │
         ▼
BEGIN TRANSACTION (PostgreSQL)
  ├── 1. Lock Auction Row: SELECT * FROM auctions WHERE id = 1 FOR UPDATE
  ├── 2. Verify: Auction status == 'ACTIVE' and now() < end_time
  ├── 3. Verify: Bidder != Auction.seller (Anti-Shill Bidding)
  ├── 4. Verify: $150 >= current_price + min_increment
  ├── 5. Insert new Bid record into database
  ├── 6. Update Auction: current_price = $150, highest_bidder = User
COMMIT TRANSACTION
         │
         ▼
[ Django Channels / Redis Channel Layer ]
         │
         ▼
Broadcast to 'auction_1' Group
         │
         ▼
All Connected Viewers' Browsers Update in Sub-Second Real-Time
```

---

### B. Auction Expiration & Winner Resolution Workflow

```
[ Celery Beat Scheduler ] (Every 60s)
         │
         ▼
[ auctions.tasks.close_expired_auctions_task ]
         │
         ▼
Query: status == 'ACTIVE' AND end_time <= now()
         │
    ┌────┴────────────────────────┐
    │ Has Valid Bids?             │
    ├──────────────┬──────────────┤
    │ YES          │ NO           │
    ▼              ▼              ▼
1. Mark CLOSED     1. Mark CLOSED
2. Assign Winner   2. Status = 'UNSOLD'
3. Create Payment  3. Emit 'auction.closed'
   Record with
   Fee Snapshots
4. Emit 'auction.closed'
   via WebSockets
```

---

## 6. Directory Structure Reference

```
bid-kori/
├── accounts/                  # User accounts, profiles, roles, Google Auth linking
├── auctions/                  # Auction engine, bids, lifecycle tasks, fees, unlock
├── products/                  # Products catalog, categories, AI description generator
├── core/                      # Global permissions, timestamps, base models
├── config/                    # Django project settings, ASGI/WSGI routing, URLs
├── bidkori-frontend/          # Next.js App Router frontend application
│   ├── src/
│   │   ├── app/               # Next.js routes (landing, marketplace, dashboards, auth)
│   │   ├── components/        # React components (cards, navigation, chat, modals)
│   │   ├── hooks/             # Custom SWR and WebSocket hooks
│   │   ├── lib/               # API clients, Google Auth, formatting utilities
│   │   └── types/             # TypeScript interfaces and contracts
├── demo_assets/               # Demo product imagery and seed assets
├── docker-compose.yml         # Container orchestration configuration
└── Dockerfile                 # Backend container definition
```

---

## 7. Conclusion

BidKori combines the stability, security, and financial rigor of **Django and PostgreSQL** with the real-time responsiveness of **Django Channels and Redis**, the scalability of **Celery**, and the modern visual experience of **Next.js, TypeScript, Tailwind CSS, and Framer Motion**. 

With its transparent multi-tier business model (success fees, unlock entitlements, listing promotions) and integrated **Gemini AI** capabilities, BidKori represents a complete, production-grade real-time auction marketplace.
