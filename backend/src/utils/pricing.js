export const SERVICE_FEE = 220;

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

  const grandTotal = boatTotal + captainTotal + SERVICE_FEE;

  return {
    boatTotal,
    captainTotal,
    serviceFee: SERVICE_FEE,
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
      serviceFee: SERVICE_FEE
    }
  };
};
