import { z } from "zod";
import { VEHICLE_CATEGORY_PRICING } from "./fare-policy";

export const MATRIC_DANCE_CATEGORIES = [
  { id: "luxury", title: "Luxury", description: "Premium sedan for a couple or small group", maxPassengers: VEHICLE_CATEGORY_PRICING.luxury.maxPassengers },
  { id: "business", title: "VIP / S-Class preference", description: "Executive sedan; request an S-Class, subject to confirmation", maxPassengers: VEHICLE_CATEGORY_PRICING.business.maxPassengers },
  { id: "luxury_van", title: "V-Class", description: "Premium group transport", maxPassengers: VEHICLE_CATEGORY_PRICING.luxury_van.maxPassengers },
] as const;
export const MATRIC_MIN_LEAD_HOURS = 24;
const text = (max: number) => z.string().trim().min(2).max(max);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export function southAfricaTime(day: string, clock: string): number {
  const value = Date.parse(`${day}T${clock}:00+02:00`);
  return Number.isFinite(value) && new Date(value + 7200000).toISOString().slice(0, 10) === day ? value : NaN;
}
export const matricDanceRequestSchema = z.object({
  contactName: text(100),
  contactPhone: z.string().trim().regex(/^\+?[\d ()-]{9,24}$/, "Enter a valid contact number").refine(v => { const n=v.replace(/\D/g, "").length; return n>=9 && n<=15; }, "Enter a valid contact number"),
  school: text(160), eventDate: date, pickupTime: time,
  pickupAddress: text(400), venueAddress: text(400),
  vehicleType: z.enum(["luxury", "business", "luxury_van"]),
  preferredModel: z.string().trim().max(100).optional().default(""),
  passengers: z.number().int().min(1).max(6),
  serviceHours: z.number().int().min(1).max(12),
  photoMinutes: z.number().int().min(0).max(120),
  returnRequested: z.boolean(), returnDate: date.optional(), returnTime: time.optional(),
  notes: z.string().trim().max(2000).optional().default(""),
  adultContactConfirmed: z.literal(true, { errorMap: () => ({ message: "An adult must be the booking contact" }) }),
}).superRefine((value, ctx) => {
  const pickup = southAfricaTime(value.eventDate, value.pickupTime);
  if (!Number.isFinite(pickup) || pickup < Date.now() + MATRIC_MIN_LEAD_HOURS * 3600000) {
    ctx.addIssue({ code: "custom", path: ["eventDate"], message: "Choose a valid pickup at least 24 hours ahead (South Africa time)" });
  }
  const category = MATRIC_DANCE_CATEGORIES.find(c => c.id === value.vehicleType)!;
  if (value.passengers > category.maxPassengers) ctx.addIssue({ code: "custom", path: ["passengers"], message: `${category.title} accommodates up to ${category.maxPassengers} passengers` });
  if (value.returnRequested) {
    const back = southAfricaTime(value.returnDate || value.eventDate, value.returnTime || "");
    if (!Number.isFinite(back) || back <= pickup || back > pickup + 48 * 3600000) ctx.addIssue({ code: "custom", path: ["returnTime"], message: "Choose a return after pickup, within 48 hours; select the next date for an after-midnight return" });
  }
});
export type MatricDanceDetails = z.infer<typeof matricDanceRequestSchema>;
export const MATRIC_STATUSES = ["requested", "reviewing", "quoted", "accepted", "confirmed", "declined", "cancelled"] as const;
export type MatricStatus = typeof MATRIC_STATUSES[number];
export const MATRIC_STATUS_LABELS: Record<MatricStatus, string> = {
  requested: "Request received", reviewing: "Under review", quoted: "Quote ready", accepted: "Quote accepted — awaiting confirmation", confirmed: "Booking confirmed", declined: "Unavailable", cancelled: "Cancelled",
};
