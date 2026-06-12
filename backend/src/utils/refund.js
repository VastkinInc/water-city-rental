// Three preset cancellation policies. Owners pick one per listing; the chosen
// policy snapshots onto the booking at create-time so renters are bound by
// the policy they saw at checkout — NOT whatever the owner edits later.
//
// Boundary points are fixed at 7 days and 48 hours across all policies so the
// legal page describes two boundaries, not six. Only the refund percentages
// in each band vary.
//
//                   >7d   48h–7d  <48h
//   flexible        100%  100%    50%
//   standard (def)  100%   50%     0%   ← matches the published /refund text
//   strict          100%    0%     0%
//
// Owner / captain cancellations get 100% regardless of policy and don't pass
// through this helper — that's enforced in bookingController.deriveCancellation.

const HOURS_7_DAYS = 168;
const HOURS_48     = 48;

const POLICIES = {
  flexible: {
    key:   'flexible',
    label: 'Flexible',
    tagline: 'Customer-friendly. Owners with fewer cancellations or off-peak listings.',
    tiers: { gt7d: 100, mid: 100, lt48h: 50 }
  },
  standard: {
    key:   'standard',
    label: 'Standard',
    tagline: 'Matches the Water City Rental published Refund Policy.',
    tiers: { gt7d: 100, mid: 50,  lt48h: 0  }
  },
  strict: {
    key:   'strict',
    label: 'Strict',
    tagline: 'High-demand listings. Customers cancel late, owner keeps the booking.',
    tiers: { gt7d: 100, mid: 0,   lt48h: 0  }
  }
};

export const POLICY_KEYS    = Object.keys(POLICIES);
export const DEFAULT_POLICY = 'standard';

export function listPolicies() {
  return POLICY_KEYS.map((k) => {
    const p = POLICIES[k];
    return { key: p.key, label: p.label, tagline: p.tagline, tiers: { ...p.tiers } };
  });
}

export function getPolicy(key) {
  return POLICIES[key] || POLICIES[DEFAULT_POLICY];
}

export function isValidPolicy(key) {
  return Object.prototype.hasOwnProperty.call(POLICIES, key);
}

/**
 * Compute a customer-cancellation refund.
 *
 * @param {number} grandTotalDollars - the booking's pricing.grandTotal in $
 * @param {Date|string} startDate   - the booking's trip start
 * @param {Date}        now         - clock; defaults to new Date()
 * @param {string}      policyKey   - 'flexible' | 'standard' | 'strict';
 *                                    unknown / missing falls back to DEFAULT_POLICY
 *                                    so legacy bookings (no snapshot) keep working.
 * @returns {{
 *   pct: number, amount: number, hoursToStart: number,
 *   reason: string, policyKey: string, policyLabel: string
 * }}
 */
export function computeCustomerRefund(grandTotalDollars, startDate, now = new Date(), policyKey = DEFAULT_POLICY) {
  const total  = Number(grandTotalDollars) || 0;
  const policy = getPolicy(policyKey);

  if (!startDate) {
    return {
      pct: 0, amount: 0, hoursToStart: 0,
      reason: 'No trip start date on booking',
      policyKey: policy.key, policyLabel: policy.label
    };
  }

  const ms = new Date(startDate).getTime() - new Date(now).getTime();
  const hoursToStart = ms / (1000 * 60 * 60);

  let pct, band;
  if (hoursToStart > HOURS_7_DAYS) {
    pct = policy.tiers.gt7d;
    band = 'More than 7 days before trip';
  } else if (hoursToStart > HOURS_48) {
    pct = policy.tiers.mid;
    band = 'Between 48 hours and 7 days before trip';
  } else {
    pct = policy.tiers.lt48h;
    band = 'Less than 48 hours before trip';
  }

  const amount = round2(total * pct / 100);
  const reason = `${band} — ${pct}% refund (${policy.label} policy)`;
  return {
    pct, amount, hoursToStart, reason,
    policyKey: policy.key, policyLabel: policy.label
  };
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}
