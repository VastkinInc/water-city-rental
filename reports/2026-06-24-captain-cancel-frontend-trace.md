# Report — Captain Cancel/Decline UI Trace (frontend, read-only)

**Date:** 2026-06-24
**Repo:** `VastkinInc/water-city-rental-frontend` (confirmed via `git remote -v`)
**Scope:** Trace captain dashboard cancel/decline UI. No code changed.
**Live frontend code = static files in `public/`** (per CLAUDE.md), not `src/`.

---

## Headline finding

**Captain cancel = full trip cancel + 100% refund already WORKS — on the booking-detail page.**
The `/booking/:id` detail page has a role-aware "Cancel Booking (Captain)" button wired to the shared cancel modal → `PATCH /api/bookings/:id/cancel` (the 100% path), with a confirmation modal that explicitly says the customer gets a full refund.

The only gap is a **UX convenience**: the captain **dashboard** (`captain.html`) shows no cancel button on confirmed-trip cards — the captain must click into the booking detail to cancel.

---

## 1. Captain dashboard buttons (`public/captain.html`)

`renderUpcomingTrip` (line 359) renders action buttons ONLY for `pending && !captainApproved`:
- **Accept** → `captainAcceptTrip` → `PATCH /bookings/:id/captain-accept` (line 392)
- **Decline** → `captainDeclineTrip` → `PATCH /bookings/:id/captain-decline` (line 401), confirm text: "The owner will be asked to assign a new captain."

For a **confirmed/paid** trip the card has **no action button**. The whole card is clickable and navigates to `/booking/:id` (line 375).

## 2. What the captain's "cancel" calls for a CONFIRMED/PAID trip

On the dashboard: nothing (no button).
On the **booking-detail page** (`public/booking-detail.html`), the captain gets the shared cancel button:
- `#cancel-btn` exists in markup (line 391).
- Visibility logic (lines 656-668): shows for `amCaptain` when status ∈ {pending, needs_new_captain, confirmed} and trip hasn't started. Label: **"Cancel Booking (Captain)"**.
- Click → `WCR.openCancelBookingModal` (line 675) → `WCR.cancelBooking` → `PATCH /bookings/:id/cancel` (api.js line 419) = **the 100% refund path**. ✅ Correct endpoint, NOT `/captain-decline`.

## 3. Confirmation modal showing 100% refund?

**Yes**, and it's role-aware. The shared modal (`api.js` `openCancelBookingModal`, line 523) fetches the server refund preview and, for a non-customer canceller, shows:
> "The customer will receive a full refund of **$X**." (api.js line 593)
> Sub-line: "When a captain cancels, the customer always receives 100% per our Refund Policy." (line 600)

Same verified modal owner-cancel uses — captain reuses it as-is.

## 4. Is `/captain-decline` correctly limited to pending (pre-payment)?

**Yes.** It only appears for `amCaptain && status === 'pending' && !captainApproved`:
- Dashboard card: line 368.
- Booking-detail action banner: `captainDeclineHere` button rendered at line 591.

It cannot fire on a confirmed/paid trip from either surface. Matches the backend (`captainDecline` throws unless status === 'pending').

---

## The exact gap

Nothing is broken or wired to the wrong endpoint. The capability is complete on the detail page. The only shortfall is **discoverability**: the captain dashboard has no direct "Cancel Trip" button on confirmed-trip cards, so a captain who wants to cancel must open the booking detail first.

## Minimal frontend fix (optional, UX only)

Add a "Cancel Trip" button to `renderUpcomingTrip` in `public/captain.html` for confirmed (and `needs_new_captain`) trips that haven't started, calling the SAME shared modal already used everywhere:

```js
// inside renderUpcomingTrip, after the pending Accept/Decline block:
var tripStarted = b.startDate && new Date(b.startDate).getTime() <= Date.now();
if ((b.status === 'confirmed' || b.status === 'needs_new_captain') && !tripStarted) {
  actionsHtml +=
    '<button onclick="event.stopPropagation();captainCancelTrip(\'' + bookingId + '\')" '
    + 'style="padding:6px 12px;background:transparent;color:#991B1B;border:1px solid #FCA5A5;'
    + 'border-radius:8px;font-weight:600;cursor:pointer;font-size:12px;">Cancel Trip</button>';
}
```
```js
window.captainCancelTrip = async function(id){
  var result = await WCR.openCancelBookingModal(id, { reasonPrefix: 'Cancelled by captain' });
  if (result && result.cancelled) await loadCaptainDashboard();
};
```

- Reuses the verified shared modal (100%-refund preview) and the correct `/cancel` endpoint — no new refund/cancel code.
- `event.stopPropagation()` prevents the card's navigate-to-detail click.
- Leaves `/captain-decline` untouched (still pending-only).

**Verify in Incognito after deploy** (per CLAUDE.md caching note).

---

## Decision needed

Is the existing **booking-detail** cancel path enough, or do you want the **dashboard quick-action** button added too? The fix above is the minimal change if yes.

## Key files referenced

- `public/captain.html` — `renderUpcomingTrip` (359), decline handler (398)
- `public/booking-detail.html` — action banner (581-603), cancel button visibility (656-685), `#cancel-btn` (391)
- `public/api.js` — `cancelBooking` (417), `openCancelBookingModal` (523), 100% headline (593)
