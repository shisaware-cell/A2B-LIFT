import assert from "node:assert/strict";
import test from "node:test";

import {
  detectMobilePlatform,
  getAppDownloadLinks,
  getPlatformDownloadUrl,
  renderDownloadChooser,
} from "./app-download-links";

test("detects Android and Apple mobile user agents", () => {
  assert.equal(detectMobilePlatform("Mozilla/5.0 (Linux; Android 15; Pixel 9)"), "android");
  assert.equal(detectMobilePlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X)"), "ios");
  assert.equal(detectMobilePlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"), "other");
});

test("uses the correct store listing for each app and platform", () => {
  assert.equal(
    getPlatformDownloadUrl("driver", "Android"),
    "https://play.google.com/store/apps/details?id=com.a2blift",
  );
  assert.equal(
    getPlatformDownloadUrl("driver", "iPhone"),
    "https://apps.apple.com/za/app/a2b-lift-driver/id6779553841",
  );
  assert.equal(
    getPlatformDownloadUrl("client", "Android"),
    "https://play.google.com/store/apps/details?id=com.a2blift.client",
  );
  assert.equal(
    getPlatformDownloadUrl("client", "iPad"),
    "https://apps.apple.com/za/app/a2b-lift/id6779557968",
  );
});

test("allows deployment store URLs to override defaults", () => {
  const links = getAppDownloadLinks("driver", {
    A2B_DRIVER_ANDROID_STORE_URL: "https://example.com/android",
    A2B_DRIVER_IOS_APP_STORE_URL: "https://example.com/ios",
  } as NodeJS.ProcessEnv);

  assert.equal(links.androidUrl, "https://example.com/android");
  assert.equal(links.iosUrl, "https://example.com/ios");
});

test("renders a desktop chooser with both client store destinations", () => {
  const html = renderDownloadChooser("client", {} as NodeJS.ProcessEnv);

  assert.match(html, /A2B LIFT/);
  assert.match(html, /com\.a2blift\.client/);
  assert.match(html, /id6779557968/);
});
