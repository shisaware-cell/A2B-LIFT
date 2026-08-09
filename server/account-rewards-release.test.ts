import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const projectRoot = process.cwd();

function readProjectFile(relativePath: string) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

test("registration keeps fields visible above the mobile keyboard", () => {
  const registerSource = readProjectFile("app/register.tsx");
  const scrollSource = readProjectFile("components/KeyboardAwareScrollViewCompat.tsx");

  assert.match(registerSource, /KeyboardAwareScrollViewCompat/);
  assert.match(registerSource, /keyboardShouldPersistTaps="handled"/);
  assert.match(registerSource, /automaticallyAdjustKeyboardInsets=\{Platform\.OS === "ios"\}/);
  assert.match(scrollSource, /automaticallyAdjustKeyboardInsets=\{Platform\.OS === "ios"\}/);
});

test("one cross-app identity policy rejects duplicate emails and phones", () => {
  const routesSource = readProjectFile("server/routes.ts");

  assert.match(routesSource, /lower\(trim\(username\)\) = \$1/);
  assert.match(routesSource, /regexp_replace\(COALESCE\(phone, ''\)/);
  assert.match(routesSource, /pg_advisory_lock\(hashtext\(\$1\)\)/);
  assert.match(routesSource, /DUPLICATE_\$\{error\.field\.toUpperCase\(\)\}/);
  assert.match(routesSource, /assertUserIdentityAvailable\(\{ email, phone: normalizedPhone \}\)/);
  assert.match(routesSource, /app\.post\("\/api\/chauffeurs", requireAuth/);
});

test("reward use requires an approved Lift Club membership", () => {
  const routesSource = readProjectFile("server/routes.ts");
  const referralsSource = readProjectFile("app/client/referrals.tsx");
  const rideSource = readProjectFile("app/client/index.tsx");

  assert.match(routesSource, /LIFT_CLUB_MEMBERSHIP_REQUIRED/);
  assert.match(routesSource, /app\.post\("\/api\/rewards\/cashout"[\s\S]*?requireLiftClubRewardAccess/);
  assert.match(routesSource, /app\.post\("\/api\/rewards\/transfer-to-wallet"[\s\S]*?requireLiftClubRewardAccess/);
  assert.match(routesSource, /fromRewards > 0 && !await requireLiftClubRewardAccess/);
  assert.match(referralsSource, /LiftClubMembershipRequiredModal/);
  assert.match(rideSource, /lockedRewardsWouldCoverFare/);
});

test("Android driver overlay survives task removal when the user enables it", () => {
  const layoutSource = readProjectFile("app/chauffeur/_layout.tsx");
  const settingsSource = readProjectFile("app/chauffeur/settings.tsx");
  const manifestSource = readProjectFile("modules/driver-overlay/android/src/main/AndroidManifest.xml");

  assert.match(layoutSource, /DRIVER_OVERLAY_ENABLED_KEY/);
  assert.match(layoutSource, /state === "active" \|\| state === "background"/);
  assert.match(settingsSource, /Platform\.OS === "android"/);
  assert.match(settingsSource, /Install the latest Driver build to enable/);
  assert.match(settingsSource, /disabled=\{!overlayAvailable\}/);
  assert.match(manifestSource, /android:stopWithTask="false"/);
});

test("EAS keeps the custom Android overlay module in build archives", () => {
  const easIgnore = readProjectFile(".easignore");
  const gitIgnore = readProjectFile(".gitignore");

  assert.match(easIgnore, /^\/android\/$/m);
  assert.doesNotMatch(easIgnore, /^android\/$/m);
  assert.match(easIgnore, /^modules\/driver-overlay\/android\/build\/$/m);
  assert.match(gitIgnore, /^\/android\/$/m);
  assert.doesNotMatch(gitIgnore, /^android\/$/m);
  assert.match(gitIgnore, /^modules\/driver-overlay\/android\/build\/$/m);
});
