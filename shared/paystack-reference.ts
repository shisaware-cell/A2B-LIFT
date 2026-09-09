const PAYSTACK_REFERENCE_PATTERN = /^[A-Za-z0-9._=-]+$/;

function collectReferenceValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectReferenceValues);
  }

  if (typeof value !== "string") return [];

  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Paystack can append a second reference parameter to a callback URL. Express
 * and Expo may expose those duplicate values as an array or a comma-joined
 * string, so collapse identical values before sending the reference back.
 */
export function normalizePaystackReference(value: unknown): string | null {
  const values = collectReferenceValues(value);
  if (values.length === 0) return null;

  const [reference] = values;
  if (!values.every((candidate) => candidate === reference)) return null;
  if (!PAYSTACK_REFERENCE_PATTERN.test(reference)) return null;

  return reference;
}
