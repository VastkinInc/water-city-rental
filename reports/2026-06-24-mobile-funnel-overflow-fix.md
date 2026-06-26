# Report — Mobile UI Fix: Funnel Page Overflow (shipped)

**Date:** 2026-06-24
**Repo:** `VastkinInc/water-city-rental-frontend` (confirmed via `git remote -v`)
**Branch:** `main` → pushed (Hostinger auto-deploy triggered)
**Commit:** `b69f86b` (rebased onto remote nav commits `c9f954f`, no conflict)
**Method:** Screenshot-driven (Playwright @ 390px iPhone viewport) + overflow instrumentation.

---

## The problem (root cause)

The marketplace looked "zoomed-out, oversized graphics, uneven" on phones. Root cause was **horizontal overflow**, not big images:

On **home.html** and **boat.html**, a footer row (and boat's date grid) was wider than 390px and "leaked" (overflow-x: visible). On real mobile, the browser then expands the **whole page's layout viewport** to the widest element (~458px) and shrink-to-fits it into the 390px screen — scaling **every** section/graphic down. One small overflow drags the entire page.

Login, register, and checkout were already fine on mobile — damage was concentrated on home + boat.

## Diagnosis (measured at 390px)

| Page | innerWidth before | Cause |
|---|---|---|
| home | **458px** | footer bottom bar: `© …` + `flex gap-8` link row (Privacy/Terms/Refund/Liability/Cookies) — no wrap |
| boat | **453px** | (1) footer `flex gap-8` 6-link row = 514px; (2) `#hourly-controls` hard 3-col grid (`1fr 1fr 1fr`) — native date/time inputs have a min width and can't shrink |

The events carousel (`#events-track`, scrollWidth 5512) was a **false lead** — it's safely clipped by its `overflow:hidden` parent.

## The fix (3 surgical, mobile-only changes)

`public/home.html` (footer bottom bar, ~line 806):
- `flex justify-between items-center` → `flex flex-col gap-4 text-center sm:flex-row sm:justify-between sm:items-center sm:text-left`
- link row `flex gap-8` → `flex flex-wrap justify-center gap-x-6 gap-y-2`

`public/boat.html`:
- footer link row (line 477) `flex gap-8` → `flex flex-wrap justify-center gap-x-6 gap-y-2`
- `#hourly-controls` grid (line 244) `grid-template-columns:1fr 1fr 1fr` → `repeat(auto-fit,minmax(150px,1fr))`

All changes preserve the original desktop layout (`sm:` prefixes; auto-fit keeps 3-up when wide).

## Proof (after fix)

| Page | Before | After |
|---|---|---|
| home @390 | 458px (overflow) | **390px** ✅ |
| boat @390 | 453px (overflow) | **390px** ✅ |
| home @1280 | — | **1280px, intact** ✅ |
| boat @1280 | — | **1280px, 3-up date controls intact** ✅ |

## Not covered / follow-ups

- **search.html results grid** — could not be tested locally; the page fetches from the live backend, which returns "Failed to fetch" from localhost. Header/filter chrome looks fine. Needs backend reachable to audit the results grid on mobile.
- Remaining 33 pages (dashboards, legal, etc.) not yet mobile-audited — funnel was the agreed scope.
- Diagnostic scripts (`scripts/mobile-shots.mjs`, `scripts/find-overflow.mjs`) left **untracked/local** — not committed (they hardcode a local Playwright path).

## ⚠️ Post-deploy step (per CLAUDE.md)

**Verify in an Incognito window on a phone (or DevTools 390px):**
1. Open the homepage — no sideways scroll; hero/sections fill the screen at correct scale (not zoomed-out).
2. Open a boat listing — same; the Start Date / Start Time / Duration controls stack/reflow cleanly.
3. Footers wrap neatly instead of pushing the page wide.

## Files
- `public/home.html` — footer bottom bar
- `public/boat.html` — footer link row; `#hourly-controls` grid
