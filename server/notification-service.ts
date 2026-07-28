/**
 * Notification service — outbound email + SMS.
 *
 * Both channels are pluggable and stay DORMANT until credentials are provided:
 *   - Email  → Resend  (set RESEND_API_KEY, optional RESEND_FROM_EMAIL)
 *   - SMS    → generic HTTP provider (set SMS_API_URL + SMS_API_KEY, optional SMS_SENDER_ID)
 *
 * When a channel is not configured the send call resolves with
 * status "pending_configuration" instead of throwing, so callers can persist
 * the intent and retry once keys are added. Nothing here blocks the request.
 */

import axios from "axios";

export type DeliveryStatus = "sent" | "failed" | "pending_configuration" | "skipped";

export interface DeliveryResult {
  status: DeliveryStatus;
  id?: string | null;
  error?: string | null;
}

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "A2B LIFT <no-reply@a2blift.com>";

// BulkSMS JSON API v1 (https://www.bulksms.com/developer/json/v1/).
// Preferred: an API token (Settings → Advanced → API Tokens) via
// BULKSMS_TOKEN_ID + BULKSMS_TOKEN_SECRET. Falls back to account
// username/password if a token isn't set.
const BULKSMS_TOKEN_ID = process.env.BULKSMS_TOKEN_ID || "";
const BULKSMS_TOKEN_SECRET = process.env.BULKSMS_TOKEN_SECRET || "";
const BULKSMS_USERNAME = process.env.BULKSMS_USERNAME || "";
const BULKSMS_PASSWORD = process.env.BULKSMS_PASSWORD || "";
// Optional sender ID. In South Africa an alphanumeric sender (e.g. "A2BLIFT")
// must be pre-registered with BulkSMS; leave unset to use the account default.
const SMS_SENDER_ID = process.env.SMS_SENDER_ID || "";
const SMS_DEFAULT_COUNTRY_CODE = process.env.SMS_DEFAULT_COUNTRY_CODE || "27"; // South Africa

function bulkSmsAuthHeader(): string | null {
  if (BULKSMS_TOKEN_ID && BULKSMS_TOKEN_SECRET) {
    return "Basic " + Buffer.from(`${BULKSMS_TOKEN_ID}:${BULKSMS_TOKEN_SECRET}`).toString("base64");
  }
  if (BULKSMS_USERNAME && BULKSMS_PASSWORD) {
    return "Basic " + Buffer.from(`${BULKSMS_USERNAME}:${BULKSMS_PASSWORD}`).toString("base64");
  }
  return null;
}

export const emailEnabled = (): boolean => Boolean(RESEND_API_KEY);
export const smsEnabled = (): boolean => Boolean(bulkSmsAuthHeader());

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

/**
 * Send a transactional email via Resend. No-op ("pending_configuration") until
 * RESEND_API_KEY is set — supply it later and email starts flowing with no code change.
 */
export async function sendEmail(options: SendEmailOptions): Promise<DeliveryResult> {
  if (!options.to || !options.to.includes("@")) {
    return { status: "skipped", error: "No valid email address on file." };
  }
  if (!emailEnabled()) {
    return { status: "pending_configuration", error: "RESEND_API_KEY is not configured yet." };
  }
  try {
    const res = await axios.post(
      "https://api.resend.com/emails",
      {
        from: RESEND_FROM_EMAIL,
        to: [options.to],
        subject: options.subject,
        html: options.html,
        ...(options.text ? { text: options.text } : {}),
        ...(options.replyTo ? { reply_to: options.replyTo } : {}),
      },
      {
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      },
    );
    return { status: "sent", id: res.data?.id || null };
  } catch (error: any) {
    const message = error?.response?.data?.message || error?.message || "Email send failed.";
    return { status: "failed", error: String(message) };
  }
}

export interface SendSmsOptions {
  to: string;
  message: string;
}

/**
 * Send an SMS via the BulkSMS JSON API v1. No-op ("pending_configuration")
 * until BulkSMS credentials are set (token pair or username/password).
 */
export async function sendSms(options: SendSmsOptions): Promise<DeliveryResult> {
  const to = normalisePhone(options.to);
  if (!to) {
    return { status: "skipped", error: "No valid phone number on file." };
  }
  const auth = bulkSmsAuthHeader();
  if (!auth) {
    return { status: "pending_configuration", error: "BulkSMS is not configured yet." };
  }
  try {
    const res = await axios.post(
      "https://api.bulksms.com/v1/messages",
      {
        to,
        body: options.message,
        ...(SMS_SENDER_ID ? { from: SMS_SENDER_ID } : {}),
      },
      {
        headers: {
          Authorization: auth,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      },
    );
    // BulkSMS returns an array of submitted messages.
    const first = Array.isArray(res.data) ? res.data[0] : res.data;
    return { status: "sent", id: first?.id || null };
  } catch (error: any) {
    const detail = error?.response?.data;
    const message =
      (Array.isArray(detail) ? detail[0]?.detail : detail?.detail) ||
      detail?.title ||
      error?.message ||
      "SMS send failed.";
    return { status: "failed", error: String(message) };
  }
}

/** Normalise a phone number to E.164 (+27…) for BulkSMS. Converts SA local 0… numbers. */
function normalisePhone(raw?: string | null): string {
  if (!raw) return "";
  let s = String(raw).trim();
  if (!s) return "";
  const hasPlus = s.startsWith("+");
  let digits = s.replace(/\D/g, "");
  if (!digits) return "";
  if (hasPlus) return "+" + digits;
  // Local South African number starting with 0 → +27…
  if (digits.startsWith("0")) return "+" + SMS_DEFAULT_COUNTRY_CODE + digits.slice(1);
  // Already has a country code but no + (e.g. 2782…)
  if (digits.startsWith(SMS_DEFAULT_COUNTRY_CODE)) return "+" + digits;
  return digits.length >= 9 ? "+" + digits : "";
}

/** Shared branded wrapper so all A2B emails look consistent. */
export function renderBrandedEmail(opts: {
  heading: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
}): string {
  const cta =
    opts.ctaLabel && opts.ctaUrl
      ? `<a href="${opts.ctaUrl}" style="display:inline-block;margin-top:20px;padding:12px 22px;background:#0b0b0f;color:#ffffff;border-radius:10px;text-decoration:none;font-weight:600;font-family:Arial,sans-serif;">${opts.ctaLabel}</a>`
      : "";
  return `<!DOCTYPE html><html><body style="margin:0;background:#f4f4f6;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #ececf1;">
    <div style="background:#0b0b0f;padding:20px 24px;color:#ffffff;font-size:20px;font-weight:700;">A2B&nbsp;LIFT</div>
    <div style="padding:24px;">
      <h1 style="font-size:20px;margin:0 0 12px;">${opts.heading}</h1>
      <div style="font-size:15px;line-height:1.6;color:#333;">${opts.bodyHtml}</div>
      ${cta}
    </div>
    <div style="padding:16px 24px;background:#fafafa;color:#888;font-size:12px;border-top:1px solid #ececf1;">
      A2B LIFT · Improving Drivers' Lives and Building True Partnerships.
    </div>
  </div></body></html>`;
}
