import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  buildGoogleMapsNavigationUrl,
  buildGoogleMapsWebNavigationUrl,
} from "../lib/google-navigation";

const projectRoot = process.cwd();

function readProjectFile(relativePath: string) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

test("uses the Google map provider on every native platform", () => {
  const mapSource = readProjectFile("components/A2BMap.native.tsx");

  assert.match(mapSource, /provider=\{PROVIDER_GOOGLE\}/);
  assert.doesNotMatch(mapSource, /Platform\.OS === "android" \? PROVIDER_GOOGLE : undefined/);
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
