export type MobileApp = "driver" | "client";
export type MobilePlatform = "android" | "ios" | "other";

export interface AppDownloadLinks {
  appName: string;
  androidUrl: string;
  iosUrl: string;
}

const DEFAULT_DOWNLOAD_LINKS: Record<MobileApp, AppDownloadLinks> = {
  driver: {
    appName: "A2B LIFT DRIVER",
    androidUrl: "https://play.google.com/store/apps/details?id=com.a2blift",
    iosUrl: "https://apps.apple.com/za/app/a2b-lift-driver/id6779553841",
  },
  client: {
    appName: "A2B LIFT",
    androidUrl: "https://play.google.com/store/apps/details?id=com.a2blift.client",
    iosUrl: "https://apps.apple.com/za/app/a2b-lift/id6779557968",
  },
};

export function detectMobilePlatform(userAgent = ""): MobilePlatform {
  if (/android/i.test(userAgent)) return "android";
  if (/iphone|ipad|ipod/i.test(userAgent)) return "ios";
  return "other";
}

export function getAppDownloadLinks(
  app: MobileApp,
  env: NodeJS.ProcessEnv = process.env,
): AppDownloadLinks {
  const defaults = DEFAULT_DOWNLOAD_LINKS[app];
  const prefix = app === "driver" ? "A2B_DRIVER" : "A2B_CLIENT";

  return {
    appName: defaults.appName,
    androidUrl:
      env[`${prefix}_ANDROID_STORE_URL`] ||
      env[`EXPO_PUBLIC_${prefix}_ANDROID_STORE_URL`] ||
      defaults.androidUrl,
    iosUrl:
      env[`${prefix}_IOS_APP_STORE_URL`] ||
      env[`EXPO_PUBLIC_${prefix}_IOS_APP_STORE_URL`] ||
      defaults.iosUrl,
  };
}

export function getPlatformDownloadUrl(
  app: MobileApp,
  userAgent = "",
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const platform = detectMobilePlatform(userAgent);
  const links = getAppDownloadLinks(app, env);

  if (platform === "android") return links.androidUrl;
  if (platform === "ios") return links.iosUrl;
  return undefined;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function renderDownloadChooser(app: MobileApp, env: NodeJS.ProcessEnv = process.env): string {
  const links = getAppDownloadLinks(app, env);
  const title = escapeHtml(links.appName);
  const iosUrl = escapeHtml(links.iosUrl);
  const androidUrl = escapeHtml(links.androidUrl);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>Download ${title}</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        background: #090b0d;
        color: #f7f7f5;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main { width: min(100%, 420px); }
      .eyebrow { color: #a6abb2; font-size: 12px; font-weight: 700; text-transform: uppercase; }
      h1 { margin: 12px 0 10px; font-size: 34px; line-height: 1.06; }
      p { margin: 0 0 26px; color: #b8bcc2; font-size: 16px; line-height: 1.55; }
      a {
        display: flex;
        align-items: center;
        justify-content: space-between;
        min-height: 58px;
        margin-top: 12px;
        padding: 0 18px;
        border: 1px solid #30343a;
        border-radius: 8px;
        color: #f7f7f5;
        text-decoration: none;
        font-size: 16px;
        font-weight: 700;
      }
      a:first-of-type { background: #f7f7f5; color: #090b0d; border-color: #f7f7f5; }
      span { font-size: 20px; }
    </style>
  </head>
  <body>
    <main>
      <div class="eyebrow">A2B LIFT</div>
      <h1>Download ${title}</h1>
      <p>Select the app store for your device. Phones scanning the pamphlet QR code are sent to the correct store automatically.</p>
      <a href="${iosUrl}">Download for iPhone <span aria-hidden="true">&#8599;</span></a>
      <a href="${androidUrl}">Download for Android <span aria-hidden="true">&#8599;</span></a>
    </main>
  </body>
</html>`;
}
