# Report — Mobile: Compact Search Cards + Earnings Overflow (shipped)

**Date:** 2026-06-24
**Repo:** `VastkinInc/water-city-rental-frontend`
**Branch:** `main` → pushed (Hostinger auto-deploy triggered)
**Commit:** `f08ba09` (`31c32aa..f08ba09`)
**Method:** Screenshot-driven (Playwright @ 390px); search verified by mocking the `/boats` API response.

---

## 1. earnings.html — horizontal overflow (718 → 390)

**Cause:** the Recent Payouts table sits in an `overflow-x-auto` wrapper, but `<main class="flex-1 …">` is a flex item with the default `min-width:auto`, so it refused to shrink below the wide table's content — stretching the whole page to ~718px on mobile (zoomed-out feel).

**Fix:** add `min-w-0` to `<main>` → `flex-1 min-w-0 p-6 md:p-12`. The flex item can now shrink to 390px and the table scrolls inside its own wrapper.

**Verified:** innerWidth 718 → 390 at 390px. Diagnosed by bisecting sections (hiding the table section dropped the page to 390).

## 2. search.html — oversized boat cards (436px → 227px, ~4× density)

**Cause:** results grid was `grid-cols-1` on mobile → one full-width card per row, each ~436px tall (4:3 image + full info). 24 boats = an endless scroll; only ~1 card visible per screen.

**Fix (mobile-only, `@media (max-width:767px)`):**
- `#boat-grid` → 2 columns, gap 12px.
- `.boat-info` padding 12px; `h3` 15px; `p` 12px; `.boat-price` 15px.
- Hide `.boat-card-detail-row` (guests/length) and `.boat-card-cta` ("View Details →") on narrow cards.
- Added those classes to the `renderBoatCard()` template so the media query can target them.

**Verified:** 2 columns (173px each), card height 436 → 227px, ~4 boats visible per screen. Desktop (1280px): unchanged — 3-col grid, detail row + CTA still visible.

---

## Desktop safety
Both changes are mobile-scoped (`min-w-0` only affects the overflow case; the search style block is `max-width:767px`). Verified at 1280px: search card unchanged.

## Deliberately NOT changed (await direction)
- **home "Featured" boats** (3 cards, dynamic JS template with `h-64` image): making them tiny 2-up would undercut their "featured" prominence — left as-is pending a decision.
- **saved.html / my-boats.html** card pages: not yet audited; can get the same treatment if wanted.

## ⚠️ Post-deploy verification (Incognito)
1. **Search** on a phone: 2 boats per row, compact cards, much shorter scroll; tap a card → boat detail. Desktop still 3-up with full detail.
2. **Earnings** (owner) on a phone: no sideways scroll; the Payouts table scrolls horizontally inside its card.

## Files
- `public/earnings.html` — `min-w-0` on `<main>`
- `public/search.html` — mobile card style block + card-template classes
