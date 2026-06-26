# Report — Mobile-First Card Pass: stats + saved + featured (shipped)

**Date:** 2026-06-24
**Repo:** `VastkinInc/water-city-rental-frontend`
**Branch:** `main` → pushed (Hostinger auto-deploy triggered)
**Commit:** `a1b71f4` (`f08ba09..a1b71f4`)
**Method:** Screenshot-driven (Playwright @ 390px + 1280px); data pages verified by mocking their API responses.

**Context:** user manages the platform mobile-first; goal = less scrolling, easier scanning. This continues the earlier search/earnings work.

---

## Changes (all mobile-only; desktop verified intact)

### 1. owner dashboard stats — 2×2 grid
`grid-cols-1 md:grid-cols-4` → `grid-cols-2 md:grid-cols-4 gap-3 md:gap-6`.
Owner was the outlier (4 stacked cards); customer/captain already used 2-up. Now 2×2 on mobile, 4-col on desktop.

### 2. saved boats — 2-up compact
Added classes (`saved-card/photo/info/detail/cta`) + `@media(max-width:767px)`:
- grid → 2 columns, gap 12px
- image 200 → 120px, info padding 16 → 12px, name 18 → 15px
- hide guests/length row + "View Details →"
Desktop unchanged (`auto-fill minmax(280px,1fr)`).

### 3. home Featured boats — 2-up compact
`@media(max-width:767px)` on `#featured-boats-grid`:
- grid → 2 columns, gap 12px
- image (`h-64`) 256 → 144px, padding trimmed, name 1.05rem
- spec chips (`.flex-wrap`: FT / guests / crew) hidden (details live on the boat page)
Desktop still 3-up with chips visible.

---

## Verification
| Page | Mobile (390px) | Desktop (1280px) |
|---|---|---|
| owner stats | 2 cols (157px) ✅ | 4 cols ✅ |
| saved | 2 cols (165px), card 238px, no overflow ✅ | auto-fill unchanged ✅ |
| home featured | 2 cols (157px), image 144px, chips hidden ✅ | 3 cols, chips visible ✅ |

## Consistent pattern now app-wide
Search, Saved, and Featured all use **compact 2-up boat cards on mobile** with secondary detail moved to the boat page. Dashboard stat grids are 2-up on mobile across customer/owner/captain.

## Deliberately left as-is
- `my-boats`: already a compact horizontal card (140px image + info). Could shrink the image on mobile if desired.
- `my-trips` / `my-bookings`: JS-rendered list items (fewer rows; the `h-64` on my-trips is a decorative blur graphic, not a card image). Not the bulk problem.

## ⚠️ Post-deploy verification (Incognito, phone)
1. Owner dashboard: stats show as 2×2.
2. Saved: 2 boats per row, compact; tap → boat detail; heart still unfavorites.
3. Home: Featured section shows 2-up compact cards; Book buttons work.
4. Desktop: owner 4-up stats, featured 3-up with chips — unchanged.

## Files
- `public/owner.html` — stat grid classes
- `public/saved.html` — card classes + mobile style block
- `public/home.html` — featured mobile style block
