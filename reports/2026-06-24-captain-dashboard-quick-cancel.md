# Report — Captain Dashboard Quick-Cancel Button (shipped)

**Date:** 2026-06-24
**Repo:** `VastkinInc/water-city-rental-frontend` (confirmed via `git remote -v`)
**Branch:** `main` → pushed (Hostinger auto-deploy triggered)
**Commit:** `fd0a15f` (`d4d63bc..fd0a15f`)

---

## What changed

Added a **"Cancel Trip"** quick-action button to the captain **dashboard** so captains can cancel a confirmed/paid trip directly, without first opening the booking-detail page. Reuses the existing verified cancel modal + endpoint — **no new refund logic**.

Single file: `public/captain.html` (live static source; `dist/` is gitignored and rebuilt by `vite build` on deploy).

### 1. Button (in `renderUpcomingTrip`, after the pending Accept/Decline block)
- Shows for `status === 'confirmed'` or `'needs_new_captain'`, only when the trip hasn't started (`tripStarted` guard).
- `event.stopPropagation()` so it doesn't trigger the card's navigate-to-`/booking/:id` click.
- Styling matches the existing Decline button exactly (transparent / `#991B1B` text / `#FCA5A5` border) — file uses inline styles, no destructive CSS class.

### 2. Handler `captainCancelTrip`
```js
window.captainCancelTrip = async function(id){
  var result = await WCR.openCancelBookingModal(id, { reasonPrefix: 'Cancelled by captain' });
  if (result && result.cancelled) await loadCaptainDashboard();
};
```
- Calls the shared `WCR.openCancelBookingModal` → `WCR.cancelBooking` → `PATCH /api/bookings/:id/cancel` = the **100% refund** path.
- Modal shows the customer-gets-100% confirmation (same one owner-cancel uses).
- Refreshes the dashboard on success via `loadCaptainDashboard()`.

## Pre-flight verification (before editing)
- `WCR.openCancelBookingModal` exists (api.js:523), resolves `{ cancelled: true }` (api.js:626).
- `loadCaptainDashboard` is the real reload fn (captain.html:408).
- `/captain-decline` untouched — still pending-only (pre-payment, no refund).
- No new cancel/refund code; reuses the verified path end-to-end.

## Money-logic safety
- Backend already issues 100% for captain cancellations via the unified `cancelBooking`/`deriveCancellation` path (atomic payout lock prevents double-pay). This change only adds a UI entry point to that proven path — no backend change, no new refund code.

## ⚠️ Post-deploy step (per CLAUDE.md)
**Verify in an Incognito window** (caching masks frontend changes):
1. Log in as a captain with a CONFIRMED, not-yet-started trip.
2. Confirm the dashboard card shows "Cancel Trip".
3. Click → modal shows "The customer will receive a full refund of $X".
4. Confirm → trip cancels, customer refunded 100%, card disappears from upcoming.
5. Confirm a PENDING trip still shows Accept/Decline (not Cancel Trip), and an in-progress/started trip shows no Cancel Trip.

## Files
- `public/captain.html` — `renderUpcomingTrip` button block; `captainCancelTrip` handler.
