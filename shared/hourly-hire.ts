/**
 * Chauffeur-by-the-hour (V-Class only).
 *
 * The rider books a chauffeur for a block of hours rather than a point-to-point
 * trip. Each hour includes a distance allowance; distance beyond the allowance
 * is billed afterwards at the normal V-Class per-km rate.
 *
 * Anchor price: 2 hours (80 km) = R2 845.00  →  R1 422.50 per hour.
 */

import { VEHICLE_CATEGORY_PRICING } from "./fare-policy";

/** Hourly hire is only offered on the V-Class category. */
export const HOURLY_VEHICLE_TYPE = "luxury_van";

export const HOURLY_HIRE_CONFIG = {
  minHours: 2,
  maxHours: 24,
  /** Distance allowance granted per booked hour. */
  includedKmPerHour: 40,
  /** R1 422.50/hour — derived from the 2-hour anchor of R2 845. */
  ratePerHour: 1422.5,
  /** Distance used beyond the allowance is billed at the V-Class per-km rate. */
  overageRatePerKm: VEHICLE_CATEGORY_PRICING.luxury_van.pricePerKm,
} as const;

export interface HourlyQuote {
  hours: number;
  includedKm: number;
  price: number;
  ratePerHour: number;
  overageRatePerKm: number;
  vehicleType: string;
}

function roundCurrency(amount: number) {
  return Math.round(amount * 100) / 100;
}

/** Clamp an arbitrary input to a bookable whole number of hours. */
export function normalizeHourlyDuration(hours: unknown): number {
  const parsed = Math.round(Number(hours));
  if (!Number.isFinite(parsed)) return HOURLY_HIRE_CONFIG.minHours;
  return Math.min(
    HOURLY_HIRE_CONFIG.maxHours,
    Math.max(HOURLY_HIRE_CONFIG.minHours, parsed),
  );
}

export function isValidHourlyDuration(hours: unknown): boolean {
  const parsed = Number(hours);
  return (
    Number.isFinite(parsed) &&
    Number.isInteger(parsed) &&
    parsed >= HOURLY_HIRE_CONFIG.minHours &&
    parsed <= HOURLY_HIRE_CONFIG.maxHours
  );
}

/** Price and distance allowance for a given number of booked hours. */
export function getHourlyQuote(hours: unknown): HourlyQuote {
  const bookedHours = normalizeHourlyDuration(hours);
  return {
    hours: bookedHours,
    includedKm: bookedHours * HOURLY_HIRE_CONFIG.includedKmPerHour,
    price: roundCurrency(bookedHours * HOURLY_HIRE_CONFIG.ratePerHour),
    ratePerHour: HOURLY_HIRE_CONFIG.ratePerHour,
    overageRatePerKm: HOURLY_HIRE_CONFIG.overageRatePerKm,
    vehicleType: HOURLY_VEHICLE_TYPE,
  };
}

/** Every bookable duration, for a picker list. */
export function getHourlyDurationOptions(): HourlyQuote[] {
  const options: HourlyQuote[] = [];
  for (let h = HOURLY_HIRE_CONFIG.minHours; h <= HOURLY_HIRE_CONFIG.maxHours; h += 1) {
    options.push(getHourlyQuote(h));
  }
  return options;
}

/**
 * Extra charge once the trip ends, for distance beyond the allowance.
 * Returns 0 when the rider stayed within the included kilometres.
 */
export function getHourlyOverageCharge(actualDistanceKm: unknown, hours: unknown): number {
  const quote = getHourlyQuote(hours);
  const distance = Number(actualDistanceKm);
  if (!Number.isFinite(distance) || distance <= quote.includedKm) return 0;
  return roundCurrency((distance - quote.includedKm) * quote.overageRatePerKm);
}

/** "2 hours (80 km)" — shared label so app and server read identically. */
export function formatHourlyOptionLabel(hours: unknown): string {
  const quote = getHourlyQuote(hours);
  return `${quote.hours} ${quote.hours === 1 ? "hour" : "hours"} (${quote.includedKm} km)`;
}
