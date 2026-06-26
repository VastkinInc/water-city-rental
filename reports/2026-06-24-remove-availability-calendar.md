# Report — Remove Unwired Availability Calendar (shipped)

**Date:** 2026-06-24
**Repo:** `VastkinInc/water-city-rental-frontend`
**Branch:** `main` → pushed (Hostinger auto-deploy triggered)
**Commit:** `bbef9ee` (`b69f86b..bbef9ee`)

---

## What changed

Removed the **Availability** calendar section from the boat detail page (`public/boat.html`, was lines 203-230). It was a **hardcoded placeholder** — static month grid (days 28→11, fixed highlighted cells), not connected to any real availability data. Per product decision, deferred for now.

Replaced the block with a single breadcrumb comment:
```html
<!-- Availability calendar removed (not yet wired to real availability data); restore from git history when ready. -->
```

## Safety checks

- **No JS errors:** the only script touching the section was `updateCalendarMonth()` (display-only, updates `#calendar-month-label`). It already guards with `if (!label) return;`, so it safely no-ops now. Left in place so re-adding later is trivial.
- **No mobile regression:** boat page still renders 390/390 at phone width (verified with Playwright, 0 page errors).
- Only `public/` edited (`dist/` is gitignored, rebuilt on deploy).

## How to restore later

The full markup is in git history. To bring it back:
```
git show b69f86b:public/boat.html   # or any commit before bbef9ee
```
…and re-insert the `<section>` where the comment now sits (between the description `</section>` and `<!-- Trip Section -->`). When wiring it for real, connect the day cells to actual booking/availability data instead of the static placeholder.

## ⚠️ Post-deploy step

Verify in an Incognito window: open a boat listing — the "Availability" calendar should be gone; "Choose Your Trip" follows the description/amenities directly. No layout gaps.

## Files
- `public/boat.html` — removed Availability `<section>`
