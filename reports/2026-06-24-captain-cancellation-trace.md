# Report — Captain Cancellation Behavior Trace (read-only)

**Date:** 2026-06-24
**Repo:** `VastkinInc/water-city-rental` (monorepo, backend in `backend/`)
**Scope:** Trace current captain-cancellation behavior. No code changed.

---

## Headline finding

**Captain-cancel = full trip cancel + 100% refund is ALREADY implemented in the backend.**
A captain flows through the same unified `cancelBooking` controller as owner/admin and lands in the same `else` branch that issues 100%. There is no captain-specific cancel logic to write.

The `needs_new_captain` flow is a **separate, pre-payment "captain-decline" action**, not the cancel path.

---

## 1. The two captain actions

| Action | Route | Controller | Gated to status | Refund? |
|---|---|---|---|---|
| **Cancel** (the one wanted) | `PATCH /api/bookings/:id/cancel` | `cancelBooking` | pending / needs_new_captain / confirmed, before trip start | **Yes — 100%** |
| **Decline** (pre-payment) | `PATCH /api/bookings/:id/captain-decline` | `captainDecline` | **pending only** | No |

- `routes/bookings.js:28` — `/cancel` has **no `restrictTo`**; authorization is by identity inside `deriveCancellation`, so a captain can hit it.
- `routes/bookings.js:34` — `/captain-decline` is `restrictTo('captain','admin')`.

## 2. What captain-cancel does now (`/cancel`)

`deriveCancellation` (bookingController.js:196) detects the captain (`isCaptain`, line 201) → `cancellerRole = 'captain'`, then lines 237-241:

```js
} else {                       // owner / captain / admin
  refundPct = 100;
  refundAmount = grandTotal;
  refundReason = `Full refund (captain cancellation)`;
}
```

Result:
- Whole booking cancelled — `status: 'cancelled'` (line 374). Does NOT set `needs_new_captain`, does NOT seek a replacement.
- 100% refund via `stripe.refunds.create` against `paymentIntentId`, idempotency key `cancel:<bookingId>` (lines 336-351).
- Final `paymentStatus: 'refunded'` (line 367); `payoutStatus: 'cancelled'`.

## 3. Owner-cancel comparison

It is **literally the same code**. Owner and captain are not separate branches — both fall into the same `else` at line 237 (only `customer` gets policy-based partial refunds). Nothing to reuse/copy; the verified refund path is shared by construction.

## 4. `needs_new_captain` / replacement flow

This is the **`captain-decline`** action, pre-payment only:
- `captainDecline` (line 701) throws unless `status === 'pending'`.
- Sets `status = 'needs_new_captain'` (line 706); pushes `captain_declined` timeline event. No refund, no whole-trip cancel.
- Owner then calls `reassignCaptain` (line 722) → re-prices → back to `pending`.

Because it is gated to `pending`, a captain CANNOT trigger `needs_new_captain` on a confirmed/paid trip. The flow can stay dormant exactly as-is (per CLAUDE.md "leave dormant, don't delete").

## 5. Payout interaction (no double-pay)

Handled correctly:
- Lines 317-323: atomically claim the payout lock — `updateOne({ payoutStatus: 'held' }, { $set: { payoutStatus: 'cancelling' } })`. Release cron queries `payoutStatus: 'held'`, so flipping to `cancelling` locks the cron out.
- If claim doesn't match (funds releasing) → abort 400.
- On Stripe failure → revert lock to `held` (lines 355-358); on success → `payoutStatus: 'cancelled'`.
- `deriveCancellation` also blocks cancel if `fundsMoved` (paid + payoutStatus ≠ held), line 223.

## 6. Notifications

`cancelBooking` fires `sendCancellationEmails` (fire-and-forget, after response) on both paid and unpaid paths. Emails **customer** (with refund amount), **owner**, and **captain** (if present). "Cancelled by" label resolves from `cancellerRole`, so captain-cancel reads "cancelled by the captain."

---

## Recommendation

**Backend needs no change.** Captain-cancel → full cancel + 100% refund is already live and uses the verified owner-cancel refund logic (same branch). The `needs_new_captain` flow is correctly dormant for paid trips.

The realistic remaining gap is **frontend wiring** in the separate `water-city-rental-frontend` repo: the captain dashboard needs a "Cancel trip" button that calls `PATCH /api/bookings/:id/cancel` (not `/captain-decline`) on confirmed trips.

**Next step:** switch to the frontend repo and trace which endpoint the captain's cancel button currently calls.

---

## Key files referenced

- `backend/src/controllers/bookingController.js` — `deriveCancellation` (196), `cancelBooking` (272), `captainDecline` (686), `reassignCaptain` (722)
- `backend/src/routes/bookings.js` — cancel + captain routes
- `backend/src/utils/mailer.js` — `sendCancellationEmails`
