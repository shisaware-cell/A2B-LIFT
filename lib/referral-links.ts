export type ReferralAppTarget = "client" | "driver";

export function setReferralAppTarget(url: string, appTarget: ReferralAppTarget) {
  const publicUrl = url.replace(
    /^https:\/\/api\.a2blift\.com(?=\/)/i,
    "https://a2blift.com",
  );
  const [base, hash = ""] = publicUrl.split("#", 2);
  const target = encodeURIComponent(appTarget);
  const targetedBase = /([?&])app=[^&#]*/i.test(base)
    ? base.replace(/([?&])app=[^&#]*/i, `$1app=${target}`)
    : `${base}${base.includes("?") ? "&" : "?"}app=${target}`;
  return hash ? `${targetedBase}#${hash}` : targetedBase;
}

export function buildReferralLandingUrl(
  baseUrl: string,
  referralCode: string,
  appTarget: ReferralAppTarget,
) {
  const normalizedCode = referralCode.trim().toUpperCase();
  const base = String(baseUrl).replace(/\/$/, "");
  return `${base}/r/${encodeURIComponent(normalizedCode)}?app=${encodeURIComponent(appTarget)}`;
}

export function buildReferralShareUrl(options: {
  baseUrl: string;
  referralCode?: string | null;
  shareUrl?: string | null;
  appTarget: ReferralAppTarget;
}) {
  const code = options.referralCode?.trim().toUpperCase();
  const providedUrl = options.shareUrl?.trim();
  if (providedUrl) return setReferralAppTarget(providedUrl, options.appTarget);
  if (!code) return "";
  return buildReferralLandingUrl(options.baseUrl, code, options.appTarget);
}
