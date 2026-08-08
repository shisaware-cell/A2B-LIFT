export function normalizeEmailIdentity(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export function normalizePhoneIdentity(value: unknown) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith("0")) return `27${digits.slice(1)}`;
  if (digits.length === 9) return `27${digits}`;
  return digits;
}

export class UserIdentityConflictError extends Error {
  constructor(public field: "email" | "phone") {
    super(field === "email"
      ? "An account with this email already exists"
      : "An account with this phone number already exists");
    this.name = "UserIdentityConflictError";
  }
}
