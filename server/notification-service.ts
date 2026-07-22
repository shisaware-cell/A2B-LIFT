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

const SMS_API_URL = process.env.SMS_API_URL || "";
const SMS_API_KEY = process.env.SMS_API_KEY || "";
const SMS_SENDER_ID = process.env.SMS_SENDER_ID || "A2BLIFT";

export const emailEnabled = (): boolean => Boolean(RESEND_API_KEY);
export const smsEnabled = (): boolean => Boolean(SMS_API_URL && SMS_API_KEY);

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
 * Send an SMS via a generic HTTP provider. No-op ("pending_configuration") until
 * SMS_API_URL + SMS_API_KEY are set. The payload shape below is a common
 * bulk-SMS format; adjust the body mapping when the final provider is chosen.
 */
export async function sendSms(options: SendSmsOptions): Promise<DeliveryResult> {
  const to = normalisePhone(options.to);
  if (!to) {
    return { status: "skipped", error: "No valid phone number on file." };
  }
  if (!smsEnabled()) {
    return { status: "pending_configuration", error: "SMS provider is not configured yet." };
  }
  try {
    const res = await axios.post(
      SMS_API_URL,
      {
        to,
        from: SMS_SENDER_ID,
        body: options.message,
        text: options.message,
      },
      {
        headers: {
          Authorization: `Bearer ${SMS_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      },
    );
    return { status: "sent", id: res.data?.id || res.data?.messageId || null };
  } catch (error: any) {
    const message = error?.response?.data?.message || error?.message || "SMS send failed.";
    return { status: "failed", error: String(message) };
  }
}

function normalisePhone(raw?: string | null): string {
  if (!raw) return "";
  const trimmed = String(raw).trim();
  if (!trimmed) return "";
  // Keep leading + then digits only.
  const cleaned = trimmed.replace(/(?!^\+)[^\d]/g, "");
  return cleaned.length >= 9 ? cleaned : "";
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
