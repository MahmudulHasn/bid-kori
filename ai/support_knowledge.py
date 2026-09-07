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
BidKori is an online auction marketplace. Buyers browse and bid on auctions.
Sellers list products and run auctions. The website and mobile browser UI are
the way to take actions — this assistant only explains how to use BidKori.

## Accounts and roles
- Public registration supports Buyer and Seller accounts.
- Admin accounts are platform-controlled (not self-serve via public registration).
- After login, Buyers and Sellers use role-specific workspace areas in addition
  to the public marketplace.

## Finding auctions
- Browse auctions from Marketplace / Auctions.
- Use Search and category filters to narrow listings.
- Open an auction detail page to see the current price, time remaining, images,
  and the bid form (when bidding is allowed).
- This assistant cannot search live auctions or show live results.

## Bidding
- You must be logged in to place a bid on an active auction.
- You cannot bid on your own auction (the listing's Seller cannot bid on that listing).
- Accounts registered as Seller can still bid on other people's auctions; they cannot bid on their own.
- A new bid must beat the current highest bid (or starting bid when there are no bids yet)
  by at least the auction's minimum increment.
- The BidKori server decides whether a bid is valid. If a bid is rejected, follow
  the on-screen error (for example amount too low, auction not active, or rate limit).
- Bids are placed from the auction detail page — not by chatting with this assistant.

## Auction status
- ACTIVE: the auction is live for bidding (while start/end times allow).
- CLOSED: bidding has ended; a winner may be assigned when rules are met.
- CANCELLED: the auction was cancelled and is not available for bidding/checkout.

## When auctions end
- Auctions close automatically when their end time is reached.
- Closing may finalize a few moments after the exact end time, but bids after
  the end time are rejected by the server.
- Sellers may also close or cancel eligible auctions from their Seller workspace
  when the product allows it.

## Reserve price
- A Seller may set an optional reserve price when creating an auction.
- The reserve amount is not shown publicly.
- If the highest bid does not meet the reserve, the auction can close with no
  winner (no sale).

## Notifications (in-app)
BidKori can notify users about:
- Outbid (Buyer)
- Auction won (Buyer)
- Auction lost (Buyer)
- Seller new bid (Seller)
Open Notifications in your workspace to review them. This assistant cannot read
your notification inbox.

## Buyer workspace
Relevant Buyer areas include:
- My Bids — your bidding activity
- Won — auctions you won
- Notifications
Watchlist is not available in BidKori today.

## Seller flow
Typical Seller flow:
1. Create a Product (title, details, category)
2. Manage Product photos
3. Create an Auction for that Product
4. Manage the Auction (including images when allowed)
5. Receive new-bid notifications while the auction is active
Sellers use the Seller workspace for these steps.

## Images
- Product photos: up to 5 images per Product
- Auction images: up to 10 images per Auction
- Each image up to 5MB
- Allowed formats: JPEG, PNG, WEBP, GIF

## AI listing description (Sellers)
- Sellers (and platform Admins) can generate an AI draft Product description
  from a title, a local Product photo, and optional condition/category.
- The draft must be reviewed and edited before saving.
- The photo used for AI draft generation is not automatically attached as a
  Product image — upload Product photos separately when saving the listing.

## Checkout and payments
- When a Buyer wins an auction, BidKori provides a basic/mock checkout flow for
  won auctions.
- This is not a full production payment processor. Do not promise real bank
  settlement, refunds, chargebacks, shipping guarantees, or buyer-protection
  policies.

## What this assistant cannot do
- Place bids, create/edit/delete listings, cancel auctions, checkout, or change
  account settings
- Read private account data (your bids, wins, payments, email, or other users)
- Search or browse live auction results
- Verify authenticity, seller trustworthiness, or give investment/price advice
- Answer general non-BidKori questions (coding, trivia, jokes, etc.)

## Unsupported features (do not invent)
Watchlist, Admin user management for end users, refunds, disputes, ratings,
seller verification badges, premium subscriptions, platform fees schedules,
real payment settlement, shipping guarantees, and marketplace reports are not
part of current BidKori help knowledge.
""".strip()
