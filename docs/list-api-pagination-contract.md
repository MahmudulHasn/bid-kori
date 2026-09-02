# List API pagination contract (deferred)

## Decision

Do **not** enable DRF pagination on list endpoints yet.

The current frontend treats these responses as bare JSON arrays:

- `GET /api/auctions/` → `Auction[]`
- `GET /api/auctions/active/` → auction detail array
- `GET /api/auctions/my-bids/` → `UserBid[]`
- `GET /api/products/` → product array
- `GET /api/products/my-listings/` → product array

Enabling `PageNumberPagination` / `LimitOffsetPagination` would change the shape to:

```json
{
  "count": 0,
  "next": null,
  "previous": null,
  "results": []
}
```

That breaks home, dashboard, and any consumer that indexes the response as an array.

## Required contract when pagination is introduced

1. Keep unpaginated arrays for existing clients **or** ship a coordinated frontend change in the same release.
2. Prefer an explicit opt-in, e.g. `?page=1&page_size=20`, with default behavior remaining a bare array until the frontend migrates.
3. Document `count` / `next` / `previous` / `results` in OpenAPI once enabled.
4. Preserve existing query filters on auction list/active: `status` (list only), `category`, `search`.
