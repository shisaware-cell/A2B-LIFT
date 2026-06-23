export type PasswordValidation = { ok: true } | { ok: false; message: string };

export function validateAdminPassword(value: unknown): PasswordValidation {
  if (String(value || "").length < 8) {
    return { ok: false, message: "Password must be at least 8 characters." };
  }
  return { ok: true };
}
