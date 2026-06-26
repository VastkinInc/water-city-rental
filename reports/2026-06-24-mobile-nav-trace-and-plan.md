# Report — Mobile Navigation: Trace + Plan (read-only, NOT changed yet)

**Date:** 2026-06-24
**Repo:** `VastkinInc/water-city-rental-frontend` (confirmed via `git remote -v`)
**Scope:** Make mobile nav reachable for (A) public top header and (B) dashboard sidebar. No redesign. No code changed.

---

## (A) Public top header

**Shared or copy-pasted?** **Copy-pasted** into 6 pages (not a shared component):
`home.html, search.html, boat.html, harbors.html, events.html, concierge.html`.

**Markup (home.html:168-183):** a `<nav>` with logo + a middle link group `<div class="hidden md:flex …">` (Boats & Jet Skis, Boat Captains, Harbors, Events) + a right cluster (account icon, **Join Now** always visible, **Sign In** `hidden md:inline-flex`).

**What happens on mobile (<768px):** the link group and Sign In are `hidden` with **no hamburger** → the 4 nav items + Sign In simply vanish. Only logo, account icon, and Join Now remain. **No `@media` query, no hamburger anywhere** on 5 of 6 pages.
- Exception: `concierge.html` has a `md:hidden` fixed **bottom** tab bar (different pattern), but still no top-header menu.

## (B) Dashboard sidebar

**Shared?** **Yes** — `WCR.buildSidebar()` → `sidebarMarkup()` in `public/api.js` (line 249), mounted via `<div id="wcr-sidebar">` on 11 pages:
`captain, customer, earnings, inquiries, my-boats, messages, owner, my-bookings, my-trips, profile, saved`.

**Markup:** `<aside class="hidden md:flex flex-col h-screen w-64 …">` — the whole sidebar is **`hidden` below md with no toggle**. On mobile the dashboard nav (Browse Boats, etc.) is **completely unreachable** through the shared component.

**Ad-hoc per-page mobile bars exist but are inconsistent** (this is the "mismatched" feeling):
| Page | Mobile nav today |
|---|---|
| customer, captain, owner | `md:hidden` fixed **bottom** tab bar (hand-rolled; some `href="#"` dead links) |
| my-boats, my-bookings | `md:hidden` **top** bar |
| **earnings, inquiries, messages, my-trips, profile, saved** | **NOTHING** — totally unreachable on mobile |

So 6 of 11 dashboard pages have no mobile nav at all, and the 5 that do are bespoke/divergent from the real sidebar items.

---

## PLAN (two separate commits, desktop untouched)

### Commit A — Public header hamburger
- Add a **`md:hidden` hamburger button** to the nav right cluster (next to Join Now). Desktop keeps the existing `hidden md:flex` links unchanged.
- On tap, open a **mobile menu** (top-anchored dropdown/drawer with glass backdrop matching the existing nav) containing: Boats & Jet Skis, Boat Captains, Harbors, Events, + Sign In. Close on link tap / backdrop tap / Esc.
- **DRY approach (recommended):** put the drawer markup + toggle in a shared `WCR.initPublicMobileNav()` in `api.js`, then add the hamburger button + one init call to each of the 6 pages. Avoids 6-way copy-paste drift (the exact problem CLAUDE.md warns about). Alternative: inline the same block in all 6 pages (simpler diff, higher drift risk).
- Style: Playfair/Manrope, cream/terracotta, glass→solid consistent with `#home-nav` scroll behavior.
- **Desktop:** zero change (hamburger is `md:hidden`; existing links are `hidden md:flex`).

### Commit B — Dashboard sidebar drawer
- In `sidebarMarkup()` (api.js), in addition to the desktop `<aside hidden md:flex>`, render:
  1. a **`md:hidden` top bar** with a hamburger + logo, and
  2. an **off-canvas drawer** (same nav links/avatar/logout/CTA) that slides in from the left with a backdrop.
- Toggle via a small `WCR`-scoped script. **One change fixes all 11 pages.** Reuses the real `SIDEBAR_CONFIG` items, so links are correct (no more `href="#"` dead links).
- Add mobile top padding to `<main>` (or the drawer offsets) so the fixed bar doesn't overlap content.
- **Desktop:** zero change (drawer + bar are `md:hidden`; the `<aside>` stays `hidden md:flex`).

**Decision point for B — the 5 ad-hoc bars:** If we add the shared drawer while the 5 bespoke bars remain, those pages show **two** mobile navs. Options:
- **B-recommended:** add the shared drawer **and remove the 5 ad-hoc bars** in the same commit → every dashboard page gets exactly one consistent mobile nav. Touches api.js + 5 pages, but all one logical change ("dashboard mobile nav").
- **B-minimal:** add the shared drawer only; leave the 5 ad-hoc bars (accept temporary double-nav on those 5), clean up later.

---

## Recommendation
- Do **A** first (self-contained, 6 public pages), verify on mobile, commit.
- Then **B** with the **B-recommended** cleanup so dashboards are consistent, verify, commit.
- Keep them as the two separate, independently-verifiable commits you asked for.

## Notes / caveats
- Public nav uses `window.parent.location` (pages may render inside an iframe shell) — the mobile drawer must account for that for navigation + z-index. Will verify when building.
- Screenshot-driven verification at 390px before/after each commit, plus a 1280px desktop sanity check (no regression), same as the last mobile fix.

## Key files
- `public/api.js` — `buildSidebar` (249), `sidebarMarkup` (~277)
- Public header (6): `home, search, boat, harbors, events, concierge`.html
- Dashboard sidebar mounts (11): `customer, owner, captain, my-boats, my-bookings, my-trips, earnings, inquiries, messages, profile, saved`.html
