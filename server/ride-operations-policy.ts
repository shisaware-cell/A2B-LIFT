export const WAITING_GRACE_MINUTES = 5;
export const WAITING_RATE_CENTS_PER_MINUTE = 100;
export const WAITING_CAP_CENTS = 3000;
export const RIDER_CANCELLATION_TRAVEL_MINUTES = 3;

export function calculateWaitingFee(minutesSinceArrival: number): number {
  const chargeableMinutes = Math.max(0, Math.ceil(minutesSinceArrival - WAITING_GRACE_MINUTES));
  return Math.min(chargeableMinutes * WAITING_RATE_CENTS_PER_MINUTE, WAITING_CAP_CENTS);
}

export function calculateDemandMultiplier(options: {
  searchingRides: number;
  onlineDrivers: number;
  maximum: number;
}): number {
  const maximum = Math.max(1, options.maximum);
  if (options.searchingRides <= 1 || options.onlineDrivers <= 0) return 1;
  const demandRatio = options.searchingRides / options.onlineDrivers;
  return Math.min(maximum, Math.max(1, Math.round(demandRatio * 100) / 100));
}

export function calculateRiderCancellationFee(options: {
  minutesDrivingToPickup: number;
  baseFareCents: number;
  waitingFeeCents: number;
  pricingMultiplier?: number;
}): number {
  if (options.minutesDrivingToPickup < RIDER_CANCELLATION_TRAVEL_MINUTES) return 0;
  const multiplier = Number.isFinite(options.pricingMultiplier)
    ? Math.max(1, Number(options.pricingMultiplier))
    : 1;
  return Math.round(Math.max(0, options.baseFareCents) * multiplier) + Math.max(0, options.waitingFeeCents);
}

export function calculateUnfinishedTripFare(options: {
  baseFareCents: number;
  pricePerKmCents: number;
  distanceTraveledKm: number;
  waitingFeeCents?: number;
  pricingMultiplier?: number;
}): number {
  const multiplier = Number.isFinite(options.pricingMultiplier)
    ? Math.max(1, Number(options.pricingMultiplier))
    : 1;
  const distanceFareCents = Math.round(
    Math.max(0, options.distanceTraveledKm) * Math.max(0, options.pricePerKmCents) * multiplier
  );
  const baseCents = Math.round(Math.max(0, options.baseFareCents) * multiplier);
  const waitingCents = Math.max(0, options.waitingFeeCents || 0);
  return baseCents + distanceFareCents + waitingCents;
}

export function resolveCancellation(options: {
  actor: "rider" | "driver";
  baseFareCents: number;
  minutesDrivingToPickup: number;
  waitingFeeCents: number;
  pricingMultiplier?: number;
  arrived?: boolean;
  minutesSinceArrival?: number;
  tripStarted?: boolean;
  distanceTraveledKm?: number;
  pricePerKmCents?: number;
}): { feeCents: number; cashDebtCents: number } {
  // If the trip was already in progress (trip_started) and cancelled mid-way
  if (options.tripStarted) {
    const feeCents = calculateUnfinishedTripFare({
      baseFareCents: options.baseFareCents,
      pricePerKmCents: options.pricePerKmCents || 0,
      distanceTraveledKm: options.distanceTraveledKm || 0,
      waitingFeeCents: options.waitingFeeCents,
      pricingMultiplier: options.pricingMultiplier,
    });
    return { feeCents, cashDebtCents: feeCents };
  }

  // Driver cancelled
  if (options.actor === "driver") {
    // If driver waited >= 5 minutes (WAITING_GRACE_MINUTES) after arriving at pickup (client no-show)
    if (options.arrived && (options.minutesSinceArrival || 0) >= WAITING_GRACE_MINUTES) {
      const feeCents = calculateRiderCancellationFee({
        ...options,
        minutesDrivingToPickup: RIDER_CANCELLATION_TRAVEL_MINUTES,
      });
      return { feeCents, cashDebtCents: feeCents };
    }
    return { feeCents: 0, cashDebtCents: 0 };
  }

  // Rider cancelled
  const feeCents = options.arrived
    ? calculateRiderCancellationFee({
        ...options,
        minutesDrivingToPickup: RIDER_CANCELLATION_TRAVEL_MINUTES,
      })
    : calculateRiderCancellationFee(options);
  return { feeCents, cashDebtCents: feeCents };
}

export function isDriverNearLocation(
  driverLat: number,
  driverLng: number,
  targetLat: number,
  targetLng: number,
  maxDistanceMeters = 250,
): boolean {
  if (!isValidLocationSample(driverLat, driverLng) || !isValidLocationSample(targetLat, targetLng)) {
    return false;
  }
  const R = 6371000;
  const dLat = ((targetLat - driverLat) * Math.PI) / 180;
  const dLng = ((targetLng - driverLng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((driverLat * Math.PI) / 180) *
      Math.cos((targetLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const distMeters = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return distMeters <= maxDistanceMeters;
}

export function reconcileDriverProfileStatus(options: {
  profileType: string;
  profileStatus: string;
  chauffeurApproved: boolean;
}): string {
  if (options.profileType === "driver" && options.profileStatus !== "approved" && options.chauffeurApproved) {
    return "approved";
  }
  return options.profileStatus;
}

export function resolveOperatorSubmissionStatus(options: {
  existingStatus?: string | null;
  requestedStatus?: string | null;
}): string {
  const existingStatus = String(options.existingStatus || "").trim();
  const requestedStatus = String(options.requestedStatus || "").trim();
  if (existingStatus === "approved" && requestedStatus === "pending") return "approved";
  return requestedStatus || existingStatus || "pending";
}

export function isValidLocationSample(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}
