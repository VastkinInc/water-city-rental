// Batch 4B-1 (Day Z): Platform fee removed per client decision.
// Customer pays 6.25% local tax on (boatRental + captainFee). Platform takes 0%.
// SERVICE_FEE kept at 0 for backwards compat while frontend (Batch 4B-2) is still
// reading pricing.serviceFee. TODO Batch 4C: remove SERVICE_FEE + serviceFee
// response fields once frontend switches to pricing.localTax.
export const SERVICE_FEE = 0;
export const TAX_RATE = 0.0625;

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
  const grandTotal = boatTotal + captainTotal + localTax;

  return {
    boatTotal,
    captainTotal,
    serviceFee: SERVICE_FEE,   // 0 (backwards-compat shim for Batch 4B-2)
    localTax,                  // NEW: 6.25% of (boatTotal + captainTotal)
    taxRate: TAX_RATE,         // NEW: 0.0625
    grandTotal,
    breakdown: {
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
      serviceFee: SERVICE_FEE, // 0 (backwards-compat shim for Batch 4B-2)
      localTax,                // NEW
      taxRate: TAX_RATE        // NEW
    }
  };
};
