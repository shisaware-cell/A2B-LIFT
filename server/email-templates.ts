import { sendEmail, renderBrandedEmail, type DeliveryResult } from "./notification-service";

function escapeHtml(str?: string | null): string {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export interface DriverEmailProps {
  to: string;
  name?: string | null;
  reason?: string | null;
}

export interface VehicleEmailProps {
  to: string;
  name?: string | null;
  carMake?: string | null;
  vehicleModel?: string | null;
  plateNumber?: string | null;
  reason?: string | null;
}

export interface DocumentEmailProps {
  to: string;
  name?: string | null;
  docType?: string | null;
  reason?: string | null;
}

/**
 * 1. Driver Signup / Application Received Email
 */
export async function sendDriverSignupReceivedEmail(props: DriverEmailProps): Promise<DeliveryResult> {
  const driverName = escapeHtml(props.name || "Chauffeur");
  const html = renderBrandedEmail({
    heading: `Welcome to A2B LIFT, ${driverName}!`,
    bodyHtml: `
      <p>Thank you for submitting your driver application to <strong>A2B LIFT</strong>. We have successfully received your profile and documents.</p>
      <p>Our team is currently reviewing your documents and vehicle details. Application reviews typically take <strong>24 to 48 hours</strong>.</p>
      <div style="background:#f4f4f6;padding:16px;border-radius:12px;margin:18px 0;font-size:14px;color:#333;">
        <strong style="color:#000;">What happens next?</strong>
        <ul style="margin:8px 0 0;padding-left:20px;line-height:1.6;">
          <li>We verify your driver's license, PrDP, and vehicle documents.</li>
          <li>You will receive an email confirmation once your profile is activated.</li>
          <li>You can log into the <strong>A2B Driver app</strong> anytime to check your real-time status.</li>
        </ul>
      </div>
      <p>We look forward to partnering with you!</p>
    `,
    ctaLabel: "Open A2B Driver",
    ctaUrl: "https://a2blift.com",
  });

  return sendEmail({
    to: props.to,
    subject: "Welcome to A2B LIFT - Driver Application Received",
    html,
  });
}

/**
 * 2. Driver Application Approved Email
 */
export async function sendDriverApprovedEmail(props: DriverEmailProps): Promise<DeliveryResult> {
  const driverName = escapeHtml(props.name || "Chauffeur");
  const html = renderBrandedEmail({
    heading: `🎉 Congratulations ${driverName}, You're Approved!`,
    bodyHtml: `
      <p>Great news! Your driver application and submitted documents have been reviewed and <strong>approved</strong> by our team.</p>
      <p>Your chauffeur account is now fully active. You are ready to go online, accept trip requests across South Africa, and start earning on A2B LIFT.</p>
      <div style="background:#ecfdf5;border-left:4px solid #10b981;padding:16px;border-radius:8px;margin:18px 0;color:#065f46;font-size:14px;line-height:1.5;">
        <strong>Quick Checklist Before Going Online:</strong>
        <ul style="margin:8px 0 0;padding-left:20px;">
          <li>Ensure your GPS and notifications are enabled.</li>
          <li>Select your active approved vehicle.</li>
          <li>Switch your status to <strong>Online</strong> to receive nearby trip requests.</li>
        </ul>
      </div>
      <p>Thank you for choosing A2B LIFT. Drive safely and let's elevate travel together!</p>
    `,
    ctaLabel: "Go Online in Driver App",
    ctaUrl: "https://a2blift.com",
  });

  return sendEmail({
    to: props.to,
    subject: "🎉 Your A2B Driver Application is Approved!",
    html,
  });
}

/**
 * 3. Driver Application Rejected / Waitlisted Email
 */
export async function sendDriverRejectedEmail(props: DriverEmailProps): Promise<DeliveryResult> {
  const driverName = escapeHtml(props.name || "Chauffeur");
  const reasonHtml = props.reason
    ? `<div style="background:#fef2f2;border-left:4px solid #ef4444;padding:16px;border-radius:8px;margin:18px 0;color:#991b1b;font-size:14px;line-height:1.5;">
        <strong>Feedback / Reason from Admin:</strong><br>
        <span style="display:inline-block;margin-top:6px;">${escapeHtml(props.reason)}</span>
      </div>`
    : "";

  const html = renderBrandedEmail({
    heading: "Update on Your A2B Driver Application",
    bodyHtml: `
      <p>Hi ${driverName},</p>
      <p>Thank you for your interest in partnering with A2B LIFT. We have reviewed your driver application and submitted documents.</p>
      <p>Unfortunately, we could not approve your application at this time.</p>
      ${reasonHtml}
      <p>If you need to upload clearer or updated documents, please log into the <strong>A2B Driver app</strong>, go to <strong>Settings &gt; Documents</strong>, and re-submit your files for review.</p>
      <p>If you have any questions, feel free to contact our support team at <a href="mailto:support@a2blift.com" style="color:#000;font-weight:600;">support@a2blift.com</a>.</p>
    `,
    ctaLabel: "Update Documents in App",
    ctaUrl: "https://a2blift.com",
  });

  return sendEmail({
    to: props.to,
    subject: "Update on Your A2B Driver Application",
    html,
  });
}

/**
 * 4. Vehicle Approved Email
 */
export async function sendVehicleApprovedEmail(props: VehicleEmailProps): Promise<DeliveryResult> {
  const ownerName = escapeHtml(props.name || "Partner");
  const carInfo = escapeHtml(
    [props.carMake, props.vehicleModel, props.plateNumber ? `(${props.plateNumber})` : ""]
      .filter(Boolean)
      .join(" ") || "Your vehicle",
  );

  const html = renderBrandedEmail({
    heading: `🚗 Vehicle Approved: ${carInfo}`,
    bodyHtml: `
      <p>Hi ${ownerName},</p>
      <p>Great news! Your vehicle <strong>${carInfo}</strong> has been inspected, reviewed, and <strong>approved</strong> for service on A2B LIFT.</p>
      <p>This vehicle is now active and can be selected by assigned drivers to accept ride requests immediately.</p>
    `,
    ctaLabel: "View in Fleet & Vehicles",
    ctaUrl: "https://a2blift.com",
  });

  return sendEmail({
    to: props.to,
    subject: `🚗 Vehicle Approved: ${carInfo}`,
    html,
  });
}

/**
 * 5. Vehicle Rejected Email
 */
export async function sendVehicleRejectedEmail(props: VehicleEmailProps): Promise<DeliveryResult> {
  const ownerName = escapeHtml(props.name || "Partner");
  const carInfo = escapeHtml(
    [props.carMake, props.vehicleModel, props.plateNumber ? `(${props.plateNumber})` : ""]
      .filter(Boolean)
      .join(" ") || "Your vehicle",
  );
  const reasonHtml = props.reason
    ? `<div style="background:#fef2f2;border-left:4px solid #ef4444;padding:16px;border-radius:8px;margin:18px 0;color:#991b1b;font-size:14px;line-height:1.5;">
        <strong>Reason for Rejection:</strong><br>
        <span style="display:inline-block;margin-top:6px;">${escapeHtml(props.reason)}</span>
      </div>`
    : "";

  const html = renderBrandedEmail({
    heading: "Vehicle Review Update",
    bodyHtml: `
      <p>Hi ${ownerName},</p>
      <p>We have reviewed the submission and documents for <strong>${carInfo}</strong>.</p>
      <p>Unfortunately, this vehicle could not be approved for service at this time.</p>
      ${reasonHtml}
      <p>Please open the A2B app to review and update your vehicle details or re-upload the required vehicle photos/inspection reports.</p>
    `,
    ctaLabel: "Open Vehicles Screen",
    ctaUrl: "https://a2blift.com",
  });

  return sendEmail({
    to: props.to,
    subject: `Vehicle Review Update: ${carInfo}`,
    html,
  });
}

/**
 * 6. Document Approved / Activated Email
 */
export async function sendDocumentApprovedEmail(props: DocumentEmailProps): Promise<DeliveryResult> {
  const name = escapeHtml(props.name || "Driver");
  const docLabel = escapeHtml(
    (props.docType || "Document").replace(/^driver:|^partner:|^vehicle:/, "").replace(/_/g, " "),
  );

  const html = renderBrandedEmail({
    heading: `Document Approved: ${docLabel}`,
    bodyHtml: `
      <p>Hi ${name},</p>
      <p>Your uploaded document <strong>${docLabel}</strong> has been reviewed and <strong>activated</strong> by our verification team.</p>
    `,
  });

  return sendEmail({
    to: props.to,
    subject: `Document Approved: ${docLabel}`,
    html,
  });
}

/**
 * 7. Document Rejected Email
 */
export async function sendDocumentRejectedEmail(props: DocumentEmailProps): Promise<DeliveryResult> {
  const name = escapeHtml(props.name || "Driver");
  const docLabel = escapeHtml(
    (props.docType || "Document").replace(/^driver:|^partner:|^vehicle:/, "").replace(/_/g, " "),
  );
  const reasonHtml = props.reason
    ? `<div style="background:#fef2f2;border-left:4px solid #ef4444;padding:16px;border-radius:8px;margin:18px 0;color:#991b1b;font-size:14px;line-height:1.5;">
        <strong>Reason:</strong><br>
        <span style="display:inline-block;margin-top:6px;">${escapeHtml(props.reason)}</span>
      </div>`
    : "";

  const html = renderBrandedEmail({
    heading: `Document Update Needed: ${docLabel}`,
    bodyHtml: `
      <p>Hi ${name},</p>
      <p>We reviewed your uploaded document <strong>${docLabel}</strong>, but unfortunately could not accept it.</p>
      ${reasonHtml}
      <p>Please upload a clear, valid replacement document in the A2B app.</p>
    `,
    ctaLabel: "Upload Document in App",
    ctaUrl: "https://a2blift.com",
  });

  return sendEmail({
    to: props.to,
    subject: `Document Update Needed: ${docLabel}`,
    html,
  });
}
