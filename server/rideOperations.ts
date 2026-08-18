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

// Do not cross-match premium sedans (e.g. Mercedes S-Class / VIP) with V-Class vans.
// Each category must strictly dispatch to vehicles belonging to the requested category.
const FALLBACK_CATEGORY_MATCHES: Record<string, string[]> = {};

export function normalizeVehicleType(vehicleType?: string | null) {
  const normalized = String(vehicleType || "budget")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  return CATEGORY_ALIASES[normalized] || normalized || "budget";
}

type DispatchVehicle = {
  carMake?: string | null;
  vehicleModel?: string | null;
  vehicleType?: string | null;
};

function normalizeVehicleName(vehicle: DispatchVehicle) {
  return `${vehicle.carMake || ""} ${vehicle.vehicleModel || ""}`
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * Reconcile legacy fleet rows whose selected category conflicts with the
 * make/model approved by A2B. The explicit category remains authoritative for
 * unknown vehicles; these rules only cover models named by the fleet UI.
 */
export function resolveVehicleDispatchCategory(vehicle: DispatchVehicle) {
  const name = normalizeVehicleName(vehicle);
  const matches = (pattern: RegExp) => pattern.test(name);

  if (matches(/\b(v class|vclass)\b/)) return "luxury_van";
  if (matches(/\b(h1|staria|vito|rumion)\b/)) return "van";
  if (matches(/\b(s class|e class|bmw (5|7) series|audi (a6|a8))\b/)) return "business";
  if (matches(/\b(c class|bmw 3 series|audi a4)\b/)) return "luxury";
  if (matches(/\b(i10|agya|vitz)\b/)) return "a2b_lite";

  return normalizeVehicleType(vehicle.vehicleType);
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
