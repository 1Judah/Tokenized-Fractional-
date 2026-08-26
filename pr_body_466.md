Closes #466

## What

Adds a Redis caching layer for historical price aggregates to serve price chart data instantly.

### New file: `backend/services/priceHistoryCache.js`

- Cache key format: `price_history:{tokenId}:{interval}`
- Interval-specific TTLs:
  - 1D chart: 60s (1 minute)
  - 1W chart: 900s (15 minutes)
  - 1M chart: 3600s (1 hour)
  - 1Y chart: 3600s (1 hour)
- Transparent fallback to PostgreSQL when Redis is unreachable
- `invalidatePriceHistoryCache(tokenId)` evicts all intervals for a token

### Changes to `backend/dataloader.js`

- `batchPriceHistory` now checks Redis cache first via `getPriceHistory()`, falling back to the in-memory data layer

### Changes to `backend/src/routes/purchases.js`

- After recording a purchase, calls `invalidatePriceHistoryCache(contractId)` to ensure stale price data is evicted

## Verification

- Backend tests should pass via the CI Backend Tests job
