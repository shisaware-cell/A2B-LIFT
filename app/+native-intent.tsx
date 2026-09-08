export function redirectSystemPath({
  path,
  initial,
}: { path: string; initial: boolean }) {
  const normalizedPath = String(path || "").trim();

  // If returning from Paystack payment or card connection, route directly to client wallet
  if (normalizedPath.includes("payments/paystack-callback") || normalizedPath.includes("paystack-callback")) {
    const queryIndex = normalizedPath.indexOf("?");
    const query = queryIndex !== -1 ? normalizedPath.slice(queryIndex) : "";
    return `/client/wallet${query}`;
  }

  // Preserve valid deep link routes
  if (
    normalizedPath.startsWith("/client") ||
    normalizedPath.startsWith("client") ||
    normalizedPath.startsWith("/chauffeur") ||
    normalizedPath.startsWith("chauffeur") ||
    normalizedPath.startsWith("/register") ||
    normalizedPath.startsWith("register") ||
    normalizedPath.startsWith("/login") ||
    normalizedPath.startsWith("login")
  ) {
    return normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`;
  }

  return '/';
}
