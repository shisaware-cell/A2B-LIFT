export const PLATFORM_COMMISSION_RATE = 0.25;
export const DRIVER_SHARE_RATE = 1 - PLATFORM_COMMISSION_RATE;

function roundCurrency(amount: number) {
  return Math.round(amount * 100) / 100;
}

export function getDriverNetFare(grossFare: unknown) {
  const gross = Number(grossFare);
  if (!Number.isFinite(gross) || gross <= 0) return 0;
  return roundCurrency(gross * DRIVER_SHARE_RATE);
}

export function getPlatformCommission(grossFare: unknown) {
  const gross = Number(grossFare);
  if (!Number.isFinite(gross) || gross <= 0) return 0;
  return roundCurrency(gross - getDriverNetFare(gross));
}
