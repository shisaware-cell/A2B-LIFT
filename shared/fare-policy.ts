export const PLATFORM_COMMISSION_RATE = 0.3;
export const A2B_LITE_COMMISSION_RATE = 0.1;
export const DRIVER_SHARE_RATE = 1 - PLATFORM_COMMISSION_RATE;
export const REFERRAL_REWARD_RATE = 0.025;

export const VEHICLE_CATEGORY_PRICING = {
  a2b_lite: {
    pricePerKm: 3.5,
    baseFare: 50,
    includedKm: 0,
    maxPassengers: 2,
  },
  budget: { pricePerKm: 8.5, baseFare: 50, includedKm: 0, maxPassengers: 4 },
  luxury: { pricePerKm: 14.5, baseFare: 60, includedKm: 0, maxPassengers: 4 },
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

export const CATEGORY_ALIASES: Record<string, string> = {
  a2b_lite: "a2b_lite",
  "a2b-lite": "a2b_lite",
  lite: "a2b_lite",
  economy_lite: "a2b_lite",
  budget: "budget",
  budget_car: "budget",
  economy_car: "budget",
  compact: "budget",
  economy: "budget",
  standard: "budget",
  sedan: "budget",
  luxury: "luxury",
  luxury_car: "luxury",
  luxury_sedan: "luxury",
  premium: "luxury",
  business: "business",
  business_class: "business",
  vip: "business",
  vip_car: "business",
  luxury_vip: "business",
  luxury_vip_car: "business",
  business_vip: "business",
  executive: "business",
  executive_car: "business",
  van: "van",
  minivan: "van",
  xl: "van",
  people_carrier: "van",
  luxury_van: "luxury_van",
  vclass: "luxury_van",
  v_class: "luxury_van",
  "v-class": "luxury_van",
};

export const VEHICLE_CATEGORY_TITLES: Record<string, string> = {
  a2b_lite: "A2B Lite",
  budget: "Budget",
  luxury: "Luxury",
  business: "VIP",
  van: "Van",
  luxury_van: "V-Class",
};

export function normalizeVehicleType(vehicleType?: string | null): string {
  const normalized = String(vehicleType || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return CATEGORY_ALIASES[normalized] || CATEGORY_ALIASES[String(vehicleType || "").trim().toLowerCase()] || "budget";
}

export function getVehicleCategoryTitle(vehicleType?: string | null): string {
  const key = normalizeVehicleType(vehicleType);
  return VEHICLE_CATEGORY_TITLES[key] || key.replace(/_/g, " ");
}

export function getVehicleCategoryCommissionRate(vehicleType: unknown) {
  const normalized = normalizeVehicleType(vehicleType as any);
  return normalized === "a2b_lite"
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
