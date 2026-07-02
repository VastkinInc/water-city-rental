// Customer pays 6.25% local tax on (boatRental + captainFee), plus a service fee
// that grosses the total up so Stripe's processing fee is covered — otherwise the
// platform pays owner+captain+tax out of a charge Stripe already skimmed, and goes
// negative (worst on tiny charges, where the flat $0.30 dominates).
// ponytail: assumes standard US card pricing (2.9% + $0.30); Amex/international
// cost more — bump these if that traffic grows.
export const TAX_RATE = 0.0625;
export const STRIPE_PCT = 0.029;
export const STRIPE_FIXED = 0.30;

export const calculatePrice = ({ boat, captain, days, hours }) => {
  let boatTotal = 0;
  let captainTotal = 0;

  if (boat.rateType === 'daily') {
    if (!days || days < 1) {
      throw new Error('Daily-rate boats require days >= 1');
    }
    boatTotal = boat.dayRate * days;
    captainTotal = (captain?.captainProfile?.dayRate || 0) * days;
  } else if (boat.rateType === 'hourly') {
    if (!hours || hours < 1) {
      throw new Error('Hourly-rate boats require hours >= 1');
    }
    boatTotal = boat.hourlyRate * hours;
    captainTotal = (captain?.captainProfile?.hourlyRate || 0) * hours;
  } else {
    throw new Error(`Unknown rateType: ${boat.rateType}`);
  }

  // 6.25% local tax on (boat + captain). Round to nearest cent.
  const taxableSubtotal = boatTotal + captainTotal;
  const localTax = Math.round(taxableSubtotal * TAX_RATE * 100) / 100;

  // Gross-up: charge enough that after Stripe's fee, base is fully funded.
  // net = grandTotal - (PCT*grandTotal + FIXED) = base  ->  grandTotal = (base+FIXED)/(1-PCT).
  // ceil to the cent so the platform is never a fraction short.
  const base = boatTotal + captainTotal + localTax;
  const grandTotal = Math.ceil((base + STRIPE_FIXED) / (1 - STRIPE_PCT) * 100) / 100;
  const platformFee = Math.round((grandTotal - base) * 100) / 100;

  return {
    boatTotal,
    captainTotal,
    localTax,
    platformFee,
    taxRate: TAX_RATE,
    grandTotal,
    breakdown: {
      platformFee,
      boat: {
        rate: boat.rateType === 'daily' ? boat.dayRate : boat.hourlyRate,
        unit: boat.rateType === 'daily' ? 'day' : 'hour',
        quantity: boat.rateType === 'daily' ? days : hours,
        subtotal: boatTotal
      },
      captain: {
        rate: boat.rateType === 'daily'
          ? (captain?.captainProfile?.dayRate || 0)
          : (captain?.captainProfile?.hourlyRate || 0),
        unit: boat.rateType === 'daily' ? 'day' : 'hour',
        quantity: boat.rateType === 'daily' ? days : hours,
        subtotal: captainTotal
      },
      localTax,
      taxRate: TAX_RATE
    }
  };
};

// ponytail: money-path self-check — `node src/utils/pricing.js`
if (import.meta.url === `file://${process.argv[1]}`) {
  const assert = (c, m) => { if (!c) throw new Error('pricing check failed: ' + m); };
  for (const t of [
    calculatePrice({ boat: { rateType: 'daily', dayRate: 1000 }, captain: { captainProfile: { dayRate: 200 } }, days: 1 }),
    calculatePrice({ boat: { rateType: 'daily', dayRate: 1 }, captain: null, days: 1 }) // tiny charge, flat-fee edge
  ]) {
    const stripeFee = STRIPE_PCT * t.grandTotal + STRIPE_FIXED;
    assert(t.grandTotal - stripeFee >= t.boatTotal + t.captainTotal + t.localTax - 0.005, 'net after Stripe must fund owner+captain+tax');
    assert(Math.abs(t.grandTotal - (t.boatTotal + t.captainTotal + t.localTax + t.platformFee)) < 0.001, 'lines must sum to grandTotal');
  }
  console.log('pricing OK');
}
