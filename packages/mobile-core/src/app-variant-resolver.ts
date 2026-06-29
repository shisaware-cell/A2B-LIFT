export type ResolvedAppVariant = "mixed" | "driver" | "client";

function normalizeVariant(value: unknown): ResolvedAppVariant | null {
  const variant = String(value || "").trim().toLowerCase();
  if (variant === "driver" || variant === "client") return variant;
  return null;
}

function normalizeApplicationId(value: unknown): ResolvedAppVariant | null {
  const applicationId = String(value || "").trim().toLowerCase();
  if (applicationId === "com.a2blift.client") return "client";
  if (applicationId === "com.a2blift") return "driver";
  return null;
}

/**
 * The native package id must win first. If a locally retried Android build
 * ever leaves stale Expo config in the bundle, the package still identifies
 * the app that Play Store installed.
 *
 * The public build value is compiled into the JS bundle by Expo. It must win
 * over the manifest so an incorrectly cached manifest cannot turn a client
 * binary into the driver app.
 */
export function resolveAppVariant(
  nativeApplicationId?: string,
  publicBuildVariant?: string,
  embeddedManifestVariant?: string,
): ResolvedAppVariant {
  return (
    normalizeApplicationId(nativeApplicationId) ||
    normalizeVariant(publicBuildVariant) ||
    normalizeVariant(embeddedManifestVariant) ||
    "mixed"
  );
}
