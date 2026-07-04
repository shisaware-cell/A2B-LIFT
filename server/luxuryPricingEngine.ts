export const VEHICLE_CATEGORIES: Record<string, { name: string; pricePerKm: number; baseFare: number; examples: string }> = {
  budget: { name: "Budget", pricePerKm: 7, baseFare: 50, examples: "Toyota Corolla, Toyota Quest" },
  luxury: { name: "Luxury", pricePerKm: 13, baseFare: 100, examples: "BMW 3 Series, Mercedes C Class" },
  business: { name: "Business Class", pricePerKm: 35, baseFare: 150, examples: "BMW 5 Series, Mercedes E Class" },
  van: { name: "Van", pricePerKm: 13, baseFare: 120, examples: "Hyundai H1, Mercedes Vito, Staria" },
  luxury_van: { name: "Luxury Van", pricePerKm: 35, baseFare: 200, examples: "Mercedes V Class" },
};

const PRICING_CONFIG = {
  lateNightPremiumMultiplier: 1.3,
  commissionRate: 0.25,
  platformFeeRate: 0.2,
  driverAnnualShareRate: 0.05,
  maxSurgeMultiplier: 5,
  perMinuteAdjustmentRate: 1,
  cancellationGracePeriodMin: 3,
};

export interface PriceEstimate {
  baseFare: number;
  distanceFare: number;
  totalPrice: number;
  pricePerKm: number;
  distanceKm: number;
  category: string;
  currency: string;
  lateNightPremium: number;
  surgeMultiplier: number;
  surgeAmount: number;
  surgeReason: string | null;
  highDemand: boolean;
  estimatedDurationMin: number | null;
  perMinuteRate: number;
}

export interface SurgeInput {
  activeRequests: number;
  eligibleDrivers: number;
}

export interface SurgeDetails {
  multiplier: number;
  reason: string | null;
  highDemand: boolean;
}

export function calculateSurgeMultiplier(input: SurgeInput): SurgeDetails {
  const activeRequests = Math.max(0, Math.floor(Number(input.activeRequests) || 0));
  const eligibleDrivers = Math.max(0, Math.floor(Number(input.eligibleDrivers) || 0));

  if (activeRequests <= 0 || activeRequests <= eligibleDrivers) {
    return { multiplier: 1, reason: null, highDemand: false };
  }

  const driverCount = Math.max(eligibleDrivers, 1);
  const rawMultiplier = activeRequests / driverCount;
  const multiplier = Math.min(
    PRICING_CONFIG.maxSurgeMultiplier,
    Math.max(1, Math.ceil(rawMultiplier * 10) / 10),
  );

  return {
    multiplier,
    reason: "High demand: more ride requests than nearby matching cars",
    highDemand: multiplier > 1,
  };
}

export function calculatePrice(
  distanceKm: number,
  categoryId: string,
  options?: {
    isLateNight?: boolean;
    surgeMultiplier?: number;
    surgeReason?: string | null;
    estimatedDurationMin?: number | null;
  }
): PriceEstimate {
  const category = VEHICLE_CATEGORIES[categoryId] || VEHICLE_CATEGORIES.budget;
  const baseFare = category.baseFare;
  const distanceFare = distanceKm * category.pricePerKm;

  let subtotal = baseFare + distanceFare;

  let lateNightPremium = 0;
  if (options?.isLateNight) {
    lateNightPremium = subtotal * (PRICING_CONFIG.lateNightPremiumMultiplier - 1);
    subtotal += lateNightPremium;
  }

  const requestedSurge = Number(options?.surgeMultiplier ?? 1);
  const surgeMultiplier = Math.min(
    PRICING_CONFIG.maxSurgeMultiplier,
    Math.max(1, Number.isFinite(requestedSurge) ? requestedSurge : 1),
  );
  const surgeAmount = subtotal * (surgeMultiplier - 1);
  subtotal += surgeAmount;

  return {
    baseFare: Math.round(baseFare),
    distanceFare: Math.round(distanceFare),
    totalPrice: Math.round(subtotal),
    pricePerKm: category.pricePerKm,
    distanceKm: Math.round(distanceKm * 10) / 10,
    category: category.name,
    currency: "ZAR",
    lateNightPremium: Math.round(lateNightPremium),
    surgeMultiplier,
    surgeAmount: Math.round(surgeAmount),
    surgeReason: surgeMultiplier > 1 ? options?.surgeReason || "High demand" : null,
    highDemand: surgeMultiplier > 1,
    estimatedDurationMin:
      typeof options?.estimatedDurationMin === "number"
        ? Math.max(0, Math.round(options.estimatedDurationMin * 10) / 10)
        : null,
    perMinuteRate: PRICING_CONFIG.perMinuteAdjustmentRate,
  };
}

export function calculatePerMinuteAdjustment(
  estimatedDurationMin?: number | null,
  actualDurationMin?: number | null,
  ratePerMinute = PRICING_CONFIG.perMinuteAdjustmentRate,
) {
  const estimated = Number(estimatedDurationMin);
  const actual = Number(actualDurationMin);
  const extraMinutes =
    Number.isFinite(estimated) && Number.isFinite(actual)
      ? Math.max(0, Math.ceil(actual - estimated))
      : 0;

  return {
    extraMinutes,
    adjustmentAmount: Math.round(extraMinutes * Math.max(0, ratePerMinute)),
    ratePerMinute: Math.max(0, ratePerMinute),
  };
}

export function calculateCancellationFee(
  categoryId: string,
  acceptedAt?: Date | string | null,
  cancelledAt: Date | string = new Date(),
  cancelledBy: "client" | "driver" | "admin" | string = "client",
) {
  if (cancelledBy !== "client" || !acceptedAt) {
    return { fee: 0, eligible: false, elapsedMinutes: 0 };
  }

  const accepted = new Date(acceptedAt).getTime();
  const cancelled = new Date(cancelledAt).getTime();
  const elapsedMinutes = Number.isFinite(accepted) && Number.isFinite(cancelled)
    ? Math.max(0, (cancelled - accepted) / 60000)
    : 0;

  if (elapsedMinutes < PRICING_CONFIG.cancellationGracePeriodMin) {
    return { fee: 0, eligible: false, elapsedMinutes };
  }

  const category = VEHICLE_CATEGORIES[categoryId] || VEHICLE_CATEGORIES.budget;
  return { fee: Math.round(category.baseFare), eligible: true, elapsedMinutes };
}

export function calculateChauffeurEarnings(totalPrice: number) {
  const commission = totalPrice * PRICING_CONFIG.commissionRate;
  const platformFee = totalPrice * PRICING_CONFIG.platformFeeRate;
  const driverAnnualShare = totalPrice * PRICING_CONFIG.driverAnnualShareRate;
  const chauffeurEarnings = totalPrice - commission;
  return {
    totalPrice,
    commission: Math.round(commission),
    platformFee: Math.round(platformFee),
    driverAnnualShare: Math.round(driverAnnualShare),
    chauffeurEarnings: Math.round(chauffeurEarnings),
  };
}

export function getVehicleCategories() {
  return VEHICLE_CATEGORIES;
}

export function getPricingConfig() {
  return { ...PRICING_CONFIG, categories: VEHICLE_CATEGORIES };
}
