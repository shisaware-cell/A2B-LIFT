export const RIDE_OFFER_WINDOW_MS = 45_000;

const CATEGORY_ALIASES: Record<string, string> = {
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

// Lite and Budget are the only interchangeable categories. Premium vehicles
// must not receive economy requests simply because they are more expensive.
const MULTI_CATEGORY_MATCHES: Record<string, string[]> = {
  budget: ["a2b_lite"],
  a2b_lite: ["budget"],
};

// VIP requests may fall back to V-Class, but only after VIP-compatible
// vehicles have been exhausted. Keep this separate from the general hierarchy
// so the reverse V-Class -> VIP match is never enabled.
const FALLBACK_CATEGORY_MATCHES: Record<string, string[]> = {
  luxury_van: ["business"],
};

export function normalizeVehicleType(vehicleType?: string | null) {
  const normalized = String(vehicleType || "budget")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  return CATEGORY_ALIASES[normalized] || normalized || "budget";
}

export function isVehicleEligibleForRide(requestedVehicleType?: string | null, activeVehicleType?: string | null) {
  return getVehicleDispatchPriority(requestedVehicleType, activeVehicleType) !== null;
}

export function getVehicleDispatchPriority(
  requestedVehicleType?: string | null,
  activeVehicleType?: string | null,
) {
  const requested = normalizeVehicleType(requestedVehicleType);
  const active = normalizeVehicleType(activeVehicleType);
  if (requested === active) return 0;
  if ((MULTI_CATEGORY_MATCHES[active] || []).includes(requested)) return 1;
  if ((FALLBACK_CATEGORY_MATCHES[active] || []).includes(requested)) return 2;
  return null;
}

export function getRideOfferExpiresAt(now = new Date()) {
  return new Date(now.getTime() + RIDE_OFFER_WINDOW_MS);
}

export function isRideOfferActive(
  ride: {
    currentOfferedChauffeurId?: string | null;
    currentOfferExpiresAt?: Date | string | null;
  },
  chauffeurId: string,
  now = new Date(),
) {
  if (!ride.currentOfferedChauffeurId || ride.currentOfferedChauffeurId !== chauffeurId) {
    return false;
  }

  if (!ride.currentOfferExpiresAt) {
    return false;
  }

  return new Date(ride.currentOfferExpiresAt).getTime() > now.getTime();
}
