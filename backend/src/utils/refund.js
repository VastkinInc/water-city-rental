// Refund tier logic — published in /refund (lawyer-finalized June 2026):
//   > 7 days before trip   → 100% refund
//   48 hours - 7 days       → 50% refund
//   < 48 hours              → 0% refund (no refund)
//
// Owner / captain cancellations get 100% regardless and don't use this helper.

const HOURS_7_DAYS = 168;
const HOURS_48     = 48;

/**
 * Compute a customer-cancellation refund given the trip's grand total (dollars)
 * and the trip's startDate. Pure function — no DB, no time-of-day assumption.
 *
 * @returns {{ pct: number, amount: number, reason: string, hoursToStart: number }}
 */
export function computeCustomerRefund(grandTotalDollars, startDate, now = new Date()) {
  const total = Number(grandTotalDollars) || 0;
  if (!startDate) {
    return { pct: 0, amount: 0, hoursToStart: 0, reason: 'No trip start date on booking' };
  }

  const ms = new Date(startDate).getTime() - new Date(now).getTime();
  const hoursToStart = ms / (1000 * 60 * 60);

  if (hoursToStart > HOURS_7_DAYS) {
    return {
      pct: 100,
      amount: round2(total),
      hoursToStart,
      reason: 'More than 7 days before trip — 100% refund'
    };
  }
  if (hoursToStart > HOURS_48) {
    return {
      pct: 50,
      amount: round2(total * 0.5),
      hoursToStart,
      reason: 'Between 48 hours and 7 days before trip — 50% refund'
    };
  }
  return {
    pct: 0,
    amount: 0,
    hoursToStart,
    reason: 'Less than 48 hours before trip — no refund'
  };
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}
