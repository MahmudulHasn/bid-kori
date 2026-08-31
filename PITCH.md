# BidKori — Pitch Deck Notes

**Status:** Full-Stack Platform Ready / Production Hardened  
**Milestone:** Update 3 (Backend/DevOps + Next.js frontend) complete

---

## Problem

Online auctions fail in the moments that matter most:

- Concurrent bidders race the same listing and overwrite each other, producing **lost bids**, **inconsistent highest prices**, and support disputes.
- Soft inventory / auction locks break under load when two requests both read “still winning” before either write commits.
- Listings linger past `end_time` without reliable winner resolution.
- Bots and burst traffic spam place-bid endpoints, degrading fairness for real buyers.
- Sellers and buyers lack a cohesive live UI for countdown, gallery media, and post-win checkout.

Traditional CRUD APIs are not enough. Auction engines need **atomicity**, **lifecycle automation**, and a **live client**.

---

## Solution

**BidKori** is a production-hardened auction platform that pairs a Django REST backend with a Next.js frontend:

1. **Atomic bidding** — PostgreSQL row locks via `select_for_update()` inside `transaction.atomic()` ensure only one bid mutation evaluates the live highest price at a time.
2. **Automated expiration** — `close_expired_auctions` closes overdue `ACTIVE` auctions and assigns `winning_bidder` from the highest bid.
3. **Rate-limited fairness** — `BidBurstThrottle` (scoped `bids`: 10/minute) stops burst abuse while keeping normal bidding usable.
4. **Media-rich listings** — Multi-image uploads with persistent Docker media volumes.
5. **Live marketplace UI** — Next.js + SWR polls auction detail every 3s, drives countdown timers, and powers winner checkout on the dashboard.

---

## Key Innovations & Differentiators

| Capability | Why it matters |
| --- | --- |
| Real-time bidding UX (Next.js + SWR) | Buyers see refreshed highest bids and timers without a full page reload |
| Atomic PostgreSQL locking | Prevents race conditions under concurrent outbids |
| Automated expiration resolution | Winners are assigned when the clock hits zero — no manual admin pass required |
| Rate-limited bot protection | Scoped DRF throttles on place-bid reduce spam and API abuse |
| Automated outbid email alerts | Losing bidders can be notified when they are outbid |
| Mock winner checkout | Closed auctions support `POST /checkout/` with transaction IDs and `is_paid` |
| OpenAPI + Postman export | Swagger/ReDoc docs and offline collection generation for QA and partners |
| Dockerized Postgres stack | Repeatable Windows/DevOps setup with healthchecks and media persistence |

---

## System Metrics & Stress Test Results (Update 3)

From `scripts/stress_test.py` against the Dockerized API (50 concurrent place-bid workers):

| Metric | Result |
| --- | --- |
| Concurrent workers | **50** |
| HTTP 500 / transport failures | **0** |
| Database deadlock crashes | **0** |
| Bid consistency | **Final `current_highest_bid` == max accepted bid amount** |
| Outcome mix | Accepted **201** + rejected **400** under contention (expected) |
| Locking strategy verified | `select_for_update` + atomic write path held under load |

Additional verification:

- Mahmud media + auto-close integration script: image upload **201**, URL reachable, auction forced past `end_time` → status **CLOSED**.
- Frontend auth, catalog, create-auction multipart upload, detail polling, and dashboard Pay Now checkout wired to the live API.

---

## Platform Status

| Phase | Status |
| --- | --- |
| Backend core (models, auth, bidding) | Complete |
| Update 3 DevOps / hardening | Complete |
| Next.js marketplace client | Complete |
| Overall | **Full-Stack Platform Ready / Production Hardened** |

Previous framing (“Backend Core Complete”) is superseded: BidKori now ships as a containerized, documented, concurrency-safe full-stack auction platform ready for demo, QA, and partner onboarding.
