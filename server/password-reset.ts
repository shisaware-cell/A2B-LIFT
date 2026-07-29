import crypto from "node:crypto";

export const PASSWORD_RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
export const PASSWORD_RESET_MIN_LENGTH = 8;

export function createPasswordResetToken(): {
  token: string;
  tokenHash: string;
  expiresAt: Date;
} {
  const token = crypto.randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: hashPasswordResetToken(token),
    expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
  };
}

export function hashPasswordResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function buildPasswordResetUrl(token: string, baseUrl?: string): string {
  const url = new URL(
    baseUrl || process.env.PASSWORD_RESET_URL || "https://a2blift.com/reset-password",
  );
  url.searchParams.set("token", token);
  return url.toString();
}

export function validateResetPassword(password: unknown): string | null {
  if (typeof password !== "string" || password.length < PASSWORD_RESET_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_RESET_MIN_LENGTH} characters.`;
  }
  if (password.length > 128) {
    return "Password must be 128 characters or fewer.";
  }
  return null;
}
