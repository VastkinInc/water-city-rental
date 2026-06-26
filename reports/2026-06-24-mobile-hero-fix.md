# Report — Mobile Hero Fix: clear the nav + right-size type (shipped)

**Date:** 2026-06-24
**Repo:** `VastkinInc/water-city-rental-frontend`
**Branch:** `main` → pushed (Hostinger auto-deploy triggered)
**Commit:** `e116510`
**Method:** Screenshot-driven (Playwright @ 390px + 1280px).

---

## Problems (from user screenshot)
1. **Hero headline cut off under the fixed nav.** The hero was `h-screen min-h-[800px] flex items-center`. On mobile the content (large heading + paragraph + "Plan Your Voyage" card) is taller than the viewport, and because it was vertically **centered** in a fixed-height section, the top spilled **up under the fixed nav** — hiding "Rent Boats." / clipping "Explore the".
2. **Oversized type & padding** on mobile (desktop-scale): heading 48px, paragraph 20px, card padding 40px, button `py-5` — congested.

## Fix (all mobile-only; desktop via `md:` unchanged)
`public/home.html` hero section:
- Layout: `h-screen … items-center` → `min-h-screen md:h-screen md:min-h-[800px] flex items-start md:items-center pt-28 md:pt-20 pb-16 md:pb-0`. Mobile now top-aligns content **below** the nav and grows with content instead of clipping.
- Heading: `text-5xl` → `text-3xl md:text-7xl`.
- Paragraph: `text-xl` → `text-base md:text-xl`, `mt-6` → `mt-4 md:mt-6`.
- Booking card: `p-10` → `p-6 md:p-10`, added `w-full`.
- "Plan Your Voyage": `text-2xl mb-8` → `text-xl md:text-2xl mb-5 md:mb-8`; inner `space-y-6` → `space-y-4 md:space-y-6`.
- Search button: `py-5` → `py-4 md:py-5`.

## Verification
| | Mobile (390px) | Desktop (1280px) |
|---|---|---|
| Headline vs nav | top 112px > nav bottom 96px — **clears** ✅ | n/a |
| Heading font | 48 → **30px** ✅ | **72px** (unchanged) ✅ |
| Section height | grows with content (min-h-screen) | 900px (unchanged) ✅ |

Result: full headline visible, hero + booking card fit in ~one screen, no congestion. Desktop hero identical.

## ⚠️ Post-deploy verification (Incognito, phone)
Open the homepage: the headline "Rent Boats. Explore the Water. Earn More." sits fully below the nav; the booking card fits on screen; desktop hero unchanged.

## Files
- `public/home.html` — hero section responsive sizing + layout
