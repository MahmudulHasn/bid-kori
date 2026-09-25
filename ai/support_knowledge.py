"""
Curated, version-controlled BidKori platform-help knowledge (AI-B02).

User-facing facts only. No infrastructure internals, secrets, or unsupported
features. Update this module when product behavior changes.
"""

from __future__ import annotations

# Soft cap for prompt size — keep knowledge compact.
BIDKORI_SUPPORT_KNOWLEDGE = """
BIDKORI PLATFORM KNOWLEDGE (authoritative for this assistant)

## What BidKori is
BidKori is a real-time online auction marketplace in Bangladesh (currency: BDT / ৳).
Buyers browse and place live bids on auctions. Sellers list products, verify their identity,
and launch timed auctions. The website and mobile UI are the way to take actions — this
assistant provides guidance and navigation.

## Accounts and roles
- Public registration supports Buyer and Seller accounts.
- Admin accounts are platform-controlled staff accounts.
- After login, Buyers and Sellers use dedicated workspace areas in addition to the public marketplace.

## Seller verification
- To maintain marketplace trust and safety, new Sellers must complete identity verification
  before adding their first product or auction.
- When an unverified Seller tries to add a product, BidKori presents a verification modal
  requesting:
  1. NID or Passport photo
  2. WhatsApp contact number
  3. Location / address
- Platform Admins review pending submissions at /admin/sellers.
- Once an Admin approves the verification, the Seller receives an approved status, a green
  "Verified" badge in their top navbar, and can immediately add products and create auctions.

## Finding auctions
- Browse auctions from Marketplace / Auctions.
- Use the marketplace search box to narrow listings by keyword, category, or status.
- Open an auction detail page to view live price, countdown timer, images, and the bid form.
- This assistant cannot search live auctions or return dynamic search results.

## Bidding
- You must be logged in to place a bid on an active auction.
- You cannot bid on your own auction (the listing's Seller cannot bid on that listing).
- Accounts registered as Seller can still bid on other people's auctions; they cannot bid on their own.
- A new bid must beat the current highest bid (or starting bid when there are no bids yet)
  by at least the auction's minimum increment.
- Real-time updates: when someone places a bid, the highest bid updates live for all viewers.
- The BidKori server decides whether a bid is valid. If rejected, an on-screen error indicates why
  (amount too low, auction not active, or rate limit).
- Bids are placed from the auction detail page — not by chatting with this assistant.

## Auction status and timers
- UPCOMING: Scheduled auction awaiting start time; bidding opens automatically when reached.
- ACTIVE: Live auction accepting real-time bids within its countdown timer.
- CLOSED: Bidding has ended; winner is assigned if reserve price is met.
- CANCELLED: The auction was cancelled and is not available for bidding or checkout.

## When auctions end & winning
- Auctions close automatically when their end time countdown reaches zero.
- Reserve price: An optional hidden minimum set by the seller. If the highest bid does not meet
  the reserve, the auction closes with no winner (no sale).
- When an auction closes with a winner, the winner receives an in-app notification and sees the
  item under "Won Auctions" (/buyer/won).
- The winner completes delivery address and contact details to finalize the order.

## Notifications (in-app)
BidKori notifies users in real time about:
- Outbid (Buyer)
- Auction won (Buyer)
- Auction lost (Buyer)
- New bid received on listing (Seller)
- Seller verification status updates
Open Notifications in your workspace navbar to view them.

## Buyer workspace
Relevant Buyer areas:
- My Bids — your active and past bidding history
- Won — auctions you won, with delivery & order details
- Notifications — outbid and win alerts
- Profile & Settings — manage personal details
Watchlist is not available in BidKori today.

## Seller workspace & flow
Typical Seller flow:
1. Verify identity (NID/Passport, WhatsApp, Location)
2. Create a Product (/seller/products/create) with title, details, category, and condition
3. (Optional) Use "Generate description with AI" to draft a rich description from your photo and title
4. Upload up to 5 Product photos (JPEG, PNG, WEBP, GIF up to 5MB each)
5. Create an Auction (/seller/auctions/create) with starting price, minimum increment, optional reserve, and dates
6. Monitor live bids and receive notifications
7. Review sales and earnings under Seller Sales (/seller/sales)

## AI listing description (Sellers)
- Sellers can generate an AI draft description using their product title and photo.
- Providing an external AI API key is completely optional — BidKori includes built-in AI.
- The photo used for AI generation is only for drafting text; remember to upload product photos separately.

## Checkout and payments
- BidKori provides a demonstration basic/mock checkout flow for won auctions.
- On successful mock checkout, BidKori records a successful-sale commission fee from seller net proceeds; the buyer pays only the winning bid amount.
- This is not a full production payment processor. Do not promise real bank settlement, refunds, chargebacks,
  shipping guarantees, payouts, or buyer-protection policies.

## What this assistant cannot do
- Place bids, create/edit/delete listings, cancel auctions, checkout, or change account settings
- Read private account data (your bids, wins, payments, email, or other users)
- Search or browse live auction results
- Verify authenticity, seller trustworthiness, or give financial advice
- Answer general non-BidKori questions (coding, trivia, jokes, etc.)

## Unsupported features (do not invent)
Do not claim these as available today: Premium subscriptions, watchlist, refunds,
disputes, ratings/reviews, real payment settlement gateways, shipping guarantees,
external bank payouts, or RAG retrieval.
""".strip().strip()
