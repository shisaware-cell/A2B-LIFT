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
