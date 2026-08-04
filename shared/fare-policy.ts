export const PLATFORM_COMMISSION_RATE = 0.3;
export const A2B_LITE_COMMISSION_RATE = 0.1;
export const DRIVER_SHARE_RATE = 1 - PLATFORM_COMMISSION_RATE;
export const REFERRAL_REWARD_RATE = 0.025;

export const VEHICLE_CATEGORY_PRICING = {
  // A2B Lite — the cheapest category. R50 covers the first 2km, then R6/km
  // beyond that. Deliberately tiered (rather than base+per-km from 0km) so a
  // slightly longer trip can never cost less than a shorter one.
  a2b_lite: { pricePerKm: 6, baseFare: 50, includedKm: 2, maxPassengers: 2 },
  budget: { pricePerKm: 8.5, baseFare: 50, includedKm: 0, maxPassengers: 4 },
  luxury: { pricePerKm: 14.5, baseFare: 100, includedKm: 0, maxPassengers: 4 },
  business: { pricePerKm: 35, baseFare: 150, includedKm: 0, maxPassengers: 4 },
  van: { pricePerKm: 15, baseFare: 120, includedKm: 0, maxPassengers: 8 },
  luxury_van: { pricePerKm: 35, baseFare: 200, includedKm: 0, maxPassengers: 6 },
} as const;

export function getBillableDistanceKm(distanceKm: unknown, includedKm: unknown = 0) {
  const distance = Number(distanceKm);
  const included = Number(includedKm);
  if (!Number.isFinite(distance) || distance <= 0) return 0;
  return Math.max(0, distance - (Number.isFinite(included) ? Math.max(0, included) : 0));
}

export function getVehicleCategoryCommissionRate(vehicleType: unknown) {
  const normalized = String(vehicleType || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return normalized === "a2b_lite" || normalized === "lite"
    ? A2B_LITE_COMMISSION_RATE
    : PLATFORM_COMMISSION_RATE;
}

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

export function getDriverDisplayFare(
  grossFare: unknown,
  paymentMethod: unknown,
  commissionRate: unknown = PLATFORM_COMMISSION_RATE,
) {
  const gross = Number(grossFare);
  if (!Number.isFinite(gross) || gross <= 0) return 0;
  return String(paymentMethod || "cash").toLowerCase() === "cash"
    ? roundCurrency(gross)
    : getDriverNetFare(gross, commissionRate);
}

export function getPlatformCommission(grossFare: unknown, commissionRate: unknown = PLATFORM_COMMISSION_RATE) {
  const gross = Number(grossFare);
  if (!Number.isFinite(gross) || gross <= 0) return 0;
  return roundCurrency(gross - getDriverNetFare(gross, commissionRate));
}
