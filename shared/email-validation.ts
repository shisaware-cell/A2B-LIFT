const COMMON_TLD_TYPOS: Record<string, string> = {
  con: "com",
  cmo: "com",
  comm: "com",
  coom: "com",
  om: "com",
  nte: "net",
  ogr: "org",
};

export type EmailValidationResult = {
  valid: boolean;
  normalized: string;
  message?: string;
};

export function validateEmailAddress(value: unknown): EmailValidationResult {
  const normalized = String(value || "").trim().toLowerCase();
  const parts = normalized.split("@");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { valid: false, normalized, message: "Please enter a valid email address." };
  }

  const [localPart, domain] = parts;
  if (
    normalized.length > 254 ||
    localPart.length > 64 ||
    localPart.startsWith(".") ||
    localPart.endsWith(".") ||
    localPart.includes("..") ||
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(localPart)
  ) {
    return { valid: false, normalized, message: "Please enter a valid email address." };
  }

  const labels = domain.split(".");
  if (
    labels.length < 2 ||
    labels.some((label) => !label || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label))
  ) {
    return { valid: false, normalized, message: "Please enter a valid email domain." };
  }

  const tld = labels[labels.length - 1];
  const suggestedTld = COMMON_TLD_TYPOS[tld];
  if (suggestedTld) {
    const suggestedDomain = [...labels.slice(0, -1), suggestedTld].join(".");
    return {
      valid: false,
      normalized,
      message: `Please check the email domain. Did you mean ${localPart}@${suggestedDomain}?`,
    };
  }

  if (!/^[a-z]{2,24}$/i.test(tld) && !/^xn--[a-z0-9-]{2,59}$/i.test(tld)) {
    return { valid: false, normalized, message: "Please enter a valid email domain." };
  }

  return { valid: true, normalized };
}
