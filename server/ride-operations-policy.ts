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
}): number {
  if (options.minutesDrivingToPickup < RIDER_CANCELLATION_TRAVEL_MINUTES) return 0;
  return Math.max(0, options.baseFareCents) + Math.max(0, options.waitingFeeCents);
}

export function resolveCancellation(options: {
  actor: "rider" | "driver";
  baseFareCents: number;
  minutesDrivingToPickup: number;
  waitingFeeCents: number;
  arrived?: boolean;
}): { feeCents: number; cashDebtCents: number } {
  if (options.actor === "driver") return { feeCents: 0, cashDebtCents: 0 };
  const feeCents = options.arrived
    ? Math.max(0, options.baseFareCents) + Math.max(0, options.waitingFeeCents)
    : calculateRiderCancellationFee(options);
  return { feeCents, cashDebtCents: feeCents };
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
