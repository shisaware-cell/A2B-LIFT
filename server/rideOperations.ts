export const RIDE_OFFER_WINDOW_MS = 45_000;

const CATEGORY_ALIASES: Record<string, string> = {
  budget: "budget",
  economy: "budget",
  standard: "budget",
  sedan: "budget",
  luxury: "luxury",
  business: "business",
  business_class: "business",
  van: "van",
  luxury_van: "luxury_van",
  vclass: "luxury_van",
  v_class: "luxury_van",
  "v-class": "luxury_van",
};

// Vehicle categories that are eligible for MULTIPLE request categories.
// e.g. an "executive" vehicle can serve both business and luxury requests.
const MULTI_CATEGORY_MATCHES: Record<string, string[]> = {
  executive: ["business", "luxury"],
};

export function normalizeVehicleType(vehicleType?: string | null) {
  const normalized = String(vehicleType || "budget")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  return CATEGORY_ALIASES[normalized] || normalized || "budget";
}

export function isVehicleEligibleForRide(requestedVehicleType?: string | null, activeVehicleType?: string | null) {
  const requested = normalizeVehicleType(requestedVehicleType);
  const active = normalizeVehicleType(activeVehicleType);
  if (requested === active) return true;
  return (MULTI_CATEGORY_MATCHES[active] || []).includes(requested);
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
