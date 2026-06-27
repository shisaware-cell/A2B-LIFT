import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  buildGoogleMapsNavigationUrl,
  buildGoogleMapsWebNavigationUrl,
} from "../lib/google-navigation";
import { createRequire } from "node:module";

const projectRoot = process.cwd();
const requireFromProject = createRequire(path.join(projectRoot, "server/mobile-map-release.test.ts"));

function readProjectFile(relativePath: string) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function listFilesRecursive(relativePath: string): string[] {
  const absolutePath = path.join(projectRoot, relativePath);
  const entries = fs.readdirSync(absolutePath, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const entryPath = path.join(relativePath, entry.name);
    if (entry.isDirectory()) return listFilesRecursive(entryPath);
    return entryPath;
  });
}

function loadAppConfigWithEnv(env: Record<string, string | undefined>) {
  const configPath = requireFromProject.resolve("../app.config.shared.js");
  const previousEnv = { ...process.env };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  delete requireFromProject.cache[configPath];
  const config = requireFromProject("../app.config.shared.js");
  process.env = previousEnv;
  delete requireFromProject.cache[configPath];
  return config;
}

test("uses the Google map provider on every native platform", () => {
  const mapSource = readProjectFile("components/A2BMap.native.tsx");

  assert.match(mapSource, /provider=\{PROVIDER_GOOGLE\}/);
  assert.doesNotMatch(mapSource, /Platform\.OS === "android" \? PROVIDER_GOOGLE : undefined/);
});

test("uses the iOS Google Maps key for iOS builds even when Android key is present", () => {
  const config = loadAppConfigWithEnv({
    MAPS_BUILD_PLATFORM: "ios",
    APP_VARIANT: "driver",
    EXPO_PUBLIC_APP_VARIANT: "driver",
    EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY: "ios-key",
    EXPO_PUBLIC_GOOGLE_MAPS_API_KEY: "android-key",
  });
  const appConfig = config.createMobileAppConfig({ variant: "driver" });

  assert.equal(appConfig.ios.config.googleMapsApiKey, "ios-key");
  assert.equal(appConfig.extra.googleMapsApiKey, "ios-key");
});

test("uses a2blift.com as the app and website API host", () => {
  const easConfig = JSON.parse(readProjectFile("eas.json"));
  for (const [profileName, profile] of Object.entries<any>(easConfig.build)) {
    assert.equal(
      profile.env?.EXPO_PUBLIC_DOMAIN,
      "https://a2blift.com",
      `${profileName} should call the live a2blift.com backend`,
    );
    assert.equal(
      profile.env?.EXPO_PUBLIC_REFERRAL_BASE_URL,
      "https://a2blift.com",
      `${profileName} should keep referral links on a2blift.com`,
    );
  }

  const activeFiles = [
    "app/login.tsx",
    "app/register.tsx",
    ...listFilesRecursive("website").filter((file) => /\.(html|js)$/.test(file)),
  ];

  for (const file of activeFiles) {
    assert.doesNotMatch(readProjectFile(file), /https:\/\/api\.a2blift\.com/, file);
  }
});

test("keeps the QR code inside a padded card with room for its copy", () => {
  const rewardsSource = readProjectFile("app/client/referrals.tsx");

  assert.match(rewardsSource, /width: 148/);
  assert.match(rewardsSource, /height: 148/);
  assert.match(rewardsSource, /gap: 20/);
});

test("creates a Google Maps navigation deep link for Android", () => {
  assert.equal(
    buildGoogleMapsNavigationUrl({ lat: -26.2041, lng: 28.0473 }, "android"),
    "google.navigation:q=-26.204100,28.047300&mode=d",
  );
});

test("creates a Google Maps navigation deep link for iOS and a universal fallback", () => {
  const destination = { lat: -26.2041, lng: 28.0473 };

  assert.equal(
    buildGoogleMapsNavigationUrl(destination, "ios"),
    "comgooglemaps://?daddr=-26.204100,28.047300&directionsmode=driving",
  );
  assert.equal(
    buildGoogleMapsWebNavigationUrl(destination),
    "https://www.google.com/maps/dir/?api=1&destination=-26.204100%2C28.047300&travelmode=driving",
  );
});

test("rejects invalid navigation coordinates", () => {
  assert.equal(buildGoogleMapsNavigationUrl({ lat: 999, lng: 28 }, "ios"), null);
  assert.equal(buildGoogleMapsWebNavigationUrl({ lat: -26, lng: Number.NaN }), null);
});
