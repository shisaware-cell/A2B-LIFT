export type ResolvedAppVariant = "mixed" | "driver" | "client";

function normalizeVariant(value: unknown): ResolvedAppVariant | null {
  const variant = String(value || "").trim().toLowerCase();
  if (variant === "driver" || variant === "client") return variant;
  return null;
}

/**
 * The public build value is compiled into the JS bundle by Expo. It must win
 * over the manifest so an incorrectly cached manifest cannot turn a client
 * binary into the driver app.
 */
export function resolveAppVariant(
  publicBuildVariant?: string,
  embeddedManifestVariant?: string,
): ResolvedAppVariant {
  return normalizeVariant(publicBuildVariant) || normalizeVariant(embeddedManifestVariant) || "mixed";
}
