export const PLATFORM_COMMISSION_RATE = 0.3;
export const DRIVER_SHARE_RATE = 1 - PLATFORM_COMMISSION_RATE;
export const REFERRAL_REWARD_RATE = 0.025;

export const VEHICLE_CATEGORY_PRICING = {
  budget: { pricePerKm: 8.5, baseFare: 50 },
  luxury: { pricePerKm: 14.5, baseFare: 100 },
  business: { pricePerKm: 35, baseFare: 150 },
  van: { pricePerKm: 15, baseFare: 120 },
  luxury_van: { pricePerKm: 35, baseFare: 200 },
} as const;

function roundCurrency(amount: number) {
  return Math.round(amount * 100) / 100;
}

function normalizeCommissionRate(rate: unknown) {
  const numericRate = Number(rate);
  return Number.isFinite(numericRate) && numericRate >= 0 && numericRate <= 1
    ? numericRate
    : PLATFORM_COMMISSION_RATE;
}

export function getDriverNetFare(grossFare: unknown, commissionRate: unknown = PLATFORM_COMMISSION_RATE) {
  const gross = Number(grossFare);
  if (!Number.isFinite(gross) || gross <= 0) return 0;
  return roundCurrency(gross * (1 - normalizeCommissionRate(commissionRate)));
}

export function getPlatformCommission(grossFare: unknown, commissionRate: unknown = PLATFORM_COMMISSION_RATE) {
  const gross = Number(grossFare);
  if (!Number.isFinite(gross) || gross <= 0) return 0;
  return roundCurrency(gross - getDriverNetFare(gross, commissionRate));
}
