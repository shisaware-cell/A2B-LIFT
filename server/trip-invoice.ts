import { sendEmail, renderBrandedEmail } from "./notification-service";
import { normalizeRideStops } from "../shared/ride-stops";
import { normalizeVehicleType, getVehicleCategoryTitle } from "../shared/fare-policy";

export interface InvoiceTripData {
  id: string;
  pickupAddress?: string | null;
  dropoffAddress?: string | null;
  stops?: any;
  distanceKm?: number | null;
  durationMin?: number | null;
  actualDurationMin?: number | null;
  price?: number | null;
  finalFare?: number | null;
  baseFare?: number | null;
  pricePerKm?: number | null;
  waitingFee?: number | null;
  surgeMultiplier?: number | null;
  demandMultiplier?: number | null;
  vehicleType?: string | null;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  completedAt?: Date | string | null;
  createdAt?: Date | string | null;
}

export interface InvoiceRecipient {
  email: string;
  name?: string | null;
}

export interface InvoiceDriverInfo {
  name?: string | null;
  carMake?: string | null;
  vehicleModel?: string | null;
  plateNumber?: string | null;
}

export function formatZarCurrency(amount: number): string {
  return `R ${Math.max(0, Number(amount || 0)).toFixed(2)}`;
}

export function generateTripInvoiceHtml(opts: {
  trip: InvoiceTripData;
  recipient: InvoiceRecipient;
  driver?: InvoiceDriverInfo | null;
}): string {
  const { trip, recipient, driver } = opts;
  const totalFare = Number(trip.finalFare ?? trip.price ?? 0);
  const baseFare = Number(trip.baseFare ?? 0);
  const waitingFee = Number(trip.waitingFee ?? 0);
  const distanceKm = Number(trip.distanceKm ?? 0);
  const durationMin = Math.round(Number(trip.actualDurationMin ?? trip.durationMin ?? 0));
  const categoryTitle = getVehicleCategoryTitle(trip.vehicleType || "budget");
  const stops = normalizeRideStops(trip.stops);
  const paymentMethodLabel = String(trip.paymentMethod || "cash").toUpperCase().replace(/_/g, " ");

  const tripDate = trip.completedAt ? new Date(trip.completedAt) : new Date();
  const formattedDate = tripDate.toLocaleDateString("en-ZA", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const formattedTime = tripDate.toLocaleTimeString("en-ZA", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const stopsHtml = stops.length > 0
    ? stops.map((stop, idx) => `
      <div style="margin-top:6px;padding-left:14px;border-left:2px solid #e0e0e0;font-size:13px;color:#555;">
        <strong>Stop ${idx + 1}:</strong> ${stop.address || "En route stop"}
      </div>
    `).join("")
    : "";

  const driverSection = driver?.name
    ? `
      <div style="background:#f8f9fa;border-radius:10px;padding:12px 16px;margin:16px 0;border:1px solid #eef0f2;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:13px;color:#333;">
          <tr>
            <td style="font-weight:600;">Driver:</td>
            <td style="text-align:right;">${driver.name}</td>
          </tr>
          ${driver.vehicleModel || driver.plateNumber ? `
          <tr>
            <td style="color:#666;padding-top:4px;">Vehicle:</td>
            <td style="text-align:right;color:#666;padding-top:4px;">
              ${[driver.carMake, driver.vehicleModel].filter(Boolean).join(" ")} ${driver.plateNumber ? `(${driver.plateNumber})` : ""}
            </td>
          </tr>
          ` : ""}
        </table>
      </div>
    `
    : "";

  const bodyHtml = `
    <div style="margin-bottom:16px;">
      <p style="margin:0 0 8px;font-size:15px;color:#333;">Hi ${recipient.name || "there"},</p>
      <p style="margin:0;font-size:14px;color:#555;">Thanks for riding with A2B LIFT. Here is your trip receipt and tax invoice.</p>
    </div>

    <!-- Trip Total Highlight -->
    <div style="background:#0b0b0f;border-radius:12px;padding:20px;text-align:center;color:#ffffff;margin:16px 0;">
      <div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#a0a0a0;">Total Amount Paid</div>
      <div style="font-size:32px;font-weight:800;color:#ffffff;margin:6px 0;">${formatZarCurrency(totalFare)}</div>
      <div style="font-size:12px;color:#34d399;">✓ Paid via ${paymentMethodLabel}</div>
    </div>

    <!-- Trip Details Card -->
    <div style="border:1px solid #eef0f2;border-radius:10px;padding:16px;margin-bottom:16px;">
      <div style="font-size:12px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;">Trip Summary</div>
      
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:13px;color:#333;margin-bottom:12px;">
        <tr>
          <td style="color:#666;">Date & Time:</td>
          <td style="text-align:right;font-weight:500;">${formattedDate} at ${formattedTime}</td>
        </tr>
        <tr>
          <td style="color:#666;padding-top:4px;">Trip Reference:</td>
          <td style="text-align:right;font-family:monospace;font-size:12px;padding-top:4px;">#${trip.id.slice(0, 8).toUpperCase()}</td>
        </tr>
        <tr>
          <td style="color:#666;padding-top:4px;">Vehicle Category:</td>
          <td style="text-align:right;font-weight:500;padding-top:4px;">${categoryTitle}</td>
        </tr>
        <tr>
          <td style="color:#666;padding-top:4px;">Distance & Duration:</td>
          <td style="text-align:right;font-weight:500;padding-top:4px;">${distanceKm.toFixed(1)} km · ${durationMin} min</td>
        </tr>
      </table>

      <!-- Route details -->
      <div style="background:#fafafa;border-radius:8px;padding:12px;margin-top:12px;">
        <div style="font-size:13px;color:#222;margin-bottom:6px;">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#10b981;margin-right:8px;"></span>
          <strong>Pickup:</strong> ${trip.pickupAddress || "Pickup location"}
        </div>
        ${stopsHtml}
        <div style="font-size:13px;color:#222;margin-top:6px;">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#ef4444;margin-right:8px;"></span>
          <strong>Dropoff:</strong> ${trip.dropoffAddress || "Destination"}
        </div>
      </div>

      ${driverSection}
    </div>

    <!-- Fare Breakdown Table -->
    <div style="border:1px solid #eef0f2;border-radius:10px;padding:16px;margin-bottom:16px;">
      <div style="font-size:12px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;">Fare Breakdown</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:13px;color:#333;">
        ${baseFare > 0 ? `
        <tr>
          <td style="padding:4px 0;color:#555;">Base fare</td>
          <td style="padding:4px 0;text-align:right;">${formatZarCurrency(baseFare)}</td>
        </tr>
        ` : ""}
        <tr>
          <td style="padding:4px 0;color:#555;">Distance fare (${distanceKm.toFixed(1)} km)</td>
          <td style="padding:4px 0;text-align:right;">${formatZarCurrency(Math.max(0, totalFare - baseFare - waitingFee))}</td>
        </tr>
        ${waitingFee > 0 ? `
        <tr>
          <td style="padding:4px 0;color:#555;">Waiting time fee</td>
          <td style="padding:4px 0;text-align:right;">${formatZarCurrency(waitingFee)}</td>
        </tr>
        ` : ""}
        <tr style="border-top:1px solid #eef0f2;font-weight:700;font-size:14px;">
          <td style="padding:10px 0 0 0;">Total (incl. VAT)</td>
          <td style="padding:10px 0 0 0;text-align:right;">${formatZarCurrency(totalFare)}</td>
        </tr>
      </table>
    </div>
  `;

  return renderBrandedEmail({
    heading: `Trip Invoice — ${formatZarCurrency(totalFare)}`,
    bodyHtml,
  });
}

export async function sendTripInvoiceEmail(opts: {
  trip: InvoiceTripData;
  recipient: InvoiceRecipient;
  driver?: InvoiceDriverInfo | null;
}) {
  if (!opts.recipient.email || !opts.recipient.email.includes("@")) {
    return { status: "skipped" as const, error: "No recipient email address." };
  }

  const html = generateTripInvoiceHtml(opts);
  const tripRef = opts.trip.id.slice(0, 8).toUpperCase();
  const subject = `Your A2B LIFT Trip Receipt [#${tripRef}]`;

  return sendEmail({
    to: opts.recipient.email,
    subject,
    html,
  });
}
