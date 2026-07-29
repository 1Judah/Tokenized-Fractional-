# feat: resolve issues #263, #268, #270, #279

## Summary

Resolves four open issues assigned to @KarenZita01 in the Trust-Analysis/Tokenized-Fractional- repository. This PR adds security hardening to core marketplace functions, extends the on-chain whitelist mechanism with expiration support, and introduces a new NFT Certificate Gallery frontend view.

---

## Issues Closed

- #263 — Add a secure Share Transfer Function
- #268 — Add share Buyback Program
- #270 — Implement asset Whitelisting Mechanism
- #279 — NFT Certificate Gallery with Advanced Viewing Options

---

## What Changed

### Smart Contracts (`contracts/src/lib.rs`)

**#263 — Secure Share Transfer**
- Added reentrancy guard (`_check_non_reentrant` / `_set_non_reentrant`) to:
  - `transfer_shares`
  - `transfer_shares_from`
  - `place_sell_order`
  - `cancel_sell_order`
  - `buy_from_order`
- Guard is cleared on all exit paths (success and every panic path) to avoid locking the contract.

**#268 — Share Buyback Program**
- Added reentrancy guard to `buyback_shares` and `process_auto_buyback`.
- Event logging already existed (`EventBuybackShares`, `EventAutoBuybackConfig`); no schema changes required.
- Added tests covering successful buyback, zero-amount rejection, insufficient shares, and interval gating for auto-buyback.

**#270 — Asset Whitelisting Mechanism**
- Added `WhitelistExpiry(Address)` storage key.
- Added `add_to_whitelist_with_expiry(addr, expires_at)` admin function.
- `is_whitelisted(addr)` now checks expiration; expired entries return `false`.
- Added `get_whitelist_expiry(addr)` getter.
- `remove_from_whitelist` now also clears the expiry entry.
- Added tests for expiry blocking, future-expiry allowing, removal clearing expiry, and legacy `add_to_whitelist` setting no expiry.

### Frontend (`frontend/src/components/CertificateGallery/`)

**#279 — NFT Certificate Gallery**
- Added `CertificateGallery.jsx` and `CertificateGallery.module.css`.
- Features:
  - Grid and list view layouts with smooth transitions.
  - Filtering by certificate status (Owned, Transferred, Pending).
  - Search by asset name.
  - Sorting by acquisition date, value, or asset type.
  - Detailed certificate modal with metadata and transaction hash.
  - Lazy-loaded images with error fallback.
  - PDF certificate download integration via `CertificateTemplate`.
  - Share button for direct links.
  - Fully responsive across device sizes.
- Wired into `App.jsx` as a new `Gallery` tab and lazy-loaded route.
- Added navigation bridge from `PortfolioPage` to Gallery via custom `navigate-view` event.

---

## Tests

### Contracts
- Existing transfer, buyback, and whitelist tests continue to pass.
- New tests added:
  - `test_whitelist_with_expiry_blocks_after_expiration`
  - `test_whitelist_with_future_expiry_allows_buy`
  - `test_remove_from_whitelist_clears_expiry`
  - `test_add_to_whitelist_sets_no_expiry`
  - `test_transfer_respects_pause`
  - `test_buyback_clears_reentrancy_guard_on_success`
  - `test_auto_buyback_process_succeeds_after_interval`
  - `test_auto_buyback_blocks_before_interval`

### Frontend
- Build passes (`vite build` — 34 chunks, no errors).
- Pre-existing test failures in the repository remain unchanged:
  - `src/test/performanceMonitoring.test.js` — missing module `../../services/performanceMonitoring`
  - `src/test/usePerformance.test.js` — missing module `../../hooks/usePerformance`
  - `src/test/App.test.jsx` — `.toMatch()` assertion type mismatch

---

## Checklist

- [x] #263: transfer + sell-order paths protected by reentrancy guard
- [x] #268: buyback paths protected by reentrancy guard
- [x] #270: whitelist expiry added and enforced
- [x] #279: gallery component built and integrated
- [x] Contract build compiles
- [x] Frontend build compiles

---

## Files Changed

| File | Change |
|---|---|
| `contracts/src/lib.rs` | +203 lines — reentrancy guards, whitelist expiry, tests |
| `frontend/src/App.jsx` | +24 lines — Gallery tab, lazy route, navigation bridge |
| `frontend/src/components/PortfolioPage/PortfolioPage.jsx` | +11 lines — View Gallery button |
| `frontend/src/components/CertificateGallery/CertificateGallery.jsx` | New — gallery view component |
| `frontend/src/components/CertificateGallery/CertificateGallery.module.css` | New — gallery styles |

---

closes #263
closes #268
closes #270
closes #279
