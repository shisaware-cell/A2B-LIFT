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

test("keeps the client map centred on a city or active ride while GPS settles", () => {
  const clientMapSource = readProjectFile("app/client/index.tsx");

  assert.match(clientMapSource, /const JHB_FALLBACK = \{ lat: -26\.2041, lng: 28\.0473 \}/);
  assert.match(clientMapSource, /const mapPickupLocation = location \|\| validRidePickup \|\| JHB_FALLBACK/);
  assert.match(clientMapSource, /pickupLocation=\{mapPickupLocation\}/);
  assert.match(clientMapSource, /dropoffLocation=\{mapDropoffLocation\}/);
  assert.match(clientMapSource, /initialZoom=\{mapHasLiveRideFocus \? "street" : "city"\}/);
});

test("renders nearby drivers with the bundled rich car marker", () => {
  const mapSource = readProjectFile("components/A2BMap.native.tsx");
  const nearbyMarkerStart = mapSource.indexOf("NearbyDriverMarker =");
  const nearbyMarkerEnd = mapSource.indexOf(
    "function decodePolyline",
    nearbyMarkerStart,
  );
  const nearbyMarkerBlock = mapSource.slice(nearbyMarkerStart, nearbyMarkerEnd);

  assert.match(mapSource, /nearby-car-marker\.png/);
  assert.match(nearbyMarkerBlock, /<Image/);
  assert.match(nearbyMarkerBlock, /source=\{NEARBY_CAR_MARKER\}/);
  assert.match(nearbyMarkerBlock, /tracksViewChanges=\{false\}/);
  assert.doesNotMatch(nearbyMarkerBlock, /name="car-sport"/);
});

test("marks the driver's next stop with a visible white map label", () => {
  const mapSource = readProjectFile("components/A2BMap.native.tsx");

  assert.match(mapSource, /activeStopIndex\?: number/);
  assert.match(mapSource, /\{index === activeStopIndex \? "NEXT" : index \+ 1\}/);
  assert.match(mapSource, /activeStopMarkerText:[\s\S]*?color: Colors\.white/);
});

test("requires ML Kit face validation before a selfie can be used", () => {
  const cameraSource = readProjectFile("components/LivenessCamera.tsx");

  assert.match(cameraSource, /useFacesInPhoto\(capturedUri \|\| undefined\)/);
  assert.match(cameraSource, /faceCount !== 1/);
  assert.match(cameraSource, /validation\.passed/);
  assert.match(cameraSource, /checkComplete &&\s*validation\.passed/);
  assert.doesNotMatch(cameraSource, /Use anyway/);
  assert.doesNotMatch(cameraSource, /onCapture\(\{ uri: capturedUri, passed: true/);
});

test("keeps every selfie action above Android system navigation", () => {
  const cameraSource = readProjectFile("components/LivenessCamera.tsx");
  const clientSource = readProjectFile("app/client/index.tsx");

  assert.match(cameraSource, /const insets = useSafeAreaInsets\(\)/);
  assert.match(cameraSource, /const bottomActionInset = Math\.max\(/);
  assert.match(cameraSource, /styles\.bottomArea, \{ paddingBottom: bottomActionInset \}/);
  assert.match(cameraSource, /styles\.reviewPanel, \{ bottom: bottomActionInset \}/);
  assert.match(clientSource, /navigationBarTranslucent=\{false\}/);
  assert.match(clientSource, /styles\.cashSelfiePromptOverlay,[\s\S]*?insets\.bottom/);
  assert.match(clientSource, /cashSelfiePromptOverlay: \{\s*flexGrow: 1/);
});

test("moves referral funds atomically and records both ledgers", () => {
  const routesSource = readProjectFile("server/routes.ts");

  assert.match(routesSource, /WHERE id = \$1\s+FOR UPDATE/);
  assert.match(routesSource, /INSERT INTO wallet_transactions/);
  assert.match(routesSource, /INSERT INTO reward_transactions/);
  assert.match(routesSource, /await client\.query\("COMMIT"\)/);
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

test("keeps mobile API traffic on Railway and referral links on a2blift.com", () => {
  const easConfig = JSON.parse(readProjectFile("eas.json"));
  for (const [profileName, profile] of Object.entries<any>(easConfig.build)) {
    assert.equal(
      profile.env?.EXPO_PUBLIC_DOMAIN,
      "https://a2b-lift-backend-production-4fea.up.railway.app",
      `${profileName} should call the live Railway backend directly`,
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

  const apiClientSource = readProjectFile("lib/query-client.ts");
  assert.match(apiClientSource, /normalizedDomain === "https:\/\/api\.a2blift\.com"/);
  assert.match(apiClientSource, /normalizedDomain === "https:\/\/api-production-0783\.up\.railway\.app"/);
  assert.match(apiClientSource, /normalizedDomain === "https:\/\/a2blift\.com"/);
  assert.match(apiClientSource, /return PRODUCTION_API_URL/);
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

test("includes ordered ride stops in Google Maps navigation", () => {
  const url = buildGoogleMapsNavigationUrl(
    { lat: -26.3, lng: 28.2 },
    "ios",
    [{ lat: -26.2, lng: 28.1 }, { lat: -26.25, lng: 28.15 }],
  );
  assert.match(String(url), /waypoints=/);
  assert.ok(String(url).indexOf("-26.200000") < String(url).indexOf("-26.250000"));
});

test("driver app navigate button opens external navigation with deep link", () => {
  const chauffeurSource = readProjectFile("app/chauffeur/index.tsx");
  assert.match(chauffeurSource, /async function openAcceptedRideNavigation\(\)/);
  assert.match(chauffeurSource, /buildGoogleMapsNavigationUrl/);
  assert.match(chauffeurSource, /Linking\.openURL\(appUrl\)/);
  assert.doesNotMatch(chauffeurSource, /cardRouteOptionsWrap/);
});

test("client app provides Fastest and Safest (Highway) route options", () => {
  const clientSource = readProjectFile("app/client/index.tsx");
  assert.match(clientSource, /title: "Fastest"/);
  assert.match(clientSource, /title: "Safest"/);
  assert.match(clientSource, /badge: "Highway"/);
});

test("floating driver overlay indicates incoming trips and active trip live blinking dot", () => {
  const serviceSource = readProjectFile("modules/driver-overlay/android/src/main/java/expo/modules/driveroverlay/DriverOverlayService.kt");
  assert.match(serviceSource, /isIncomingTrip/);
  assert.match(serviceSource, /isTripActive/);
  assert.match(serviceSource, /liveDot/);
  assert.match(serviceSource, /clipToOutline/);
  assert.match(serviceSource, /Trip in Progress/);
});

test("driver app confirms destination and pickup arrival from validated live GPS samples", () => {
  const chauffeurSource = readProjectFile("app/chauffeur/index.tsx");
  assert.match(chauffeurSource, /Destination Arrival Geofence Detection/);
  assert.match(chauffeurSource, /Pickup Arrival Geofence Detection/);
  assert.match(chauffeurSource, /evaluateArrivalGeofence/);
  assert.match(chauffeurSource, /driverLocationSample/);
  assert.match(chauffeurSource, /dismissArrivalPrompt/);
  assert.match(chauffeurSource, /You have arrived at the pickup location/);
  assert.match(chauffeurSource, /updateRideStatus\("chauffeur_arrived"\)/);
});

test("trip completion recalculates unfinished early completed trips based on distance covered", () => {
  const routesSource = readProjectFile("server/routes.ts");
  assert.match(routesSource, /calculateUnfinishedTripFare/);
  assert.match(routesSource, /recordedDistanceKm < quotedDistanceKm \* 0\.8/);
  assert.match(routesSource, /actualDistanceKm/);
});

test("apps target Android 16 (API Level 36) for Google Play compliance", () => {
  const configSource = readProjectFile("app.config.shared.js");
  assert.match(configSource, /compileSdkVersion:\s*36/);
  assert.match(configSource, /targetSdkVersion:\s*36/);
});

test("VIP and V-Class categories cross-match each other so available drivers can take both", () => {
  const rideOpsSource = readProjectFile("server/rideOperations.ts");
  assert.match(rideOpsSource, /business:\s*\["luxury_van"\]/);
  assert.match(rideOpsSource, /luxury_van:\s*\["business"\]/);
});

test("cleanErrorMessage strips HTTP status code prefixes from all error dialogs", () => {
  const queryClientSource = readProjectFile("lib/query-client.ts");
  assert.match(queryClientSource, /export function cleanErrorMessage/);
  assert.match(queryClientSource, /replace\(\/\^\(\?:Error\\s\*\)\?\(\?:\[1-5\]\\d\{2\}\)\\s\*:\\s\*\/i/);
});

test("chauffeur profile photo resolution searches chauffeur, user, application, and documents", () => {
  const routesSource = readProjectFile("server/routes.ts");
  assert.match(routesSource, /function resolveChauffeurProfilePhoto/);
  assert.match(routesSource, /driver_photo/);
});

test("driver app provides cash settlement with live overpayment and underpayment wallet adjustment", () => {
  const chauffeurSource = readProjectFile("app/chauffeur/index.tsx");
  assert.match(chauffeurSource, /submitCashSettlementAndContinue/);
  assert.match(chauffeurSource, /\/api\/rides\/\$\{completedTrip\.id\}\/cash-settlement/);
  assert.match(chauffeurSource, /Cash Fare Settlement/);
  assert.match(chauffeurSource, /Overpayment of \+R/);
  assert.match(chauffeurSource, /Underpayment of -R/);
});

test("register screen provides separate name and surname fields with pre-set +27 phone prefix", () => {
  const registerSource = readProjectFile("app/register.tsx");
  assert.match(registerSource, /Full Name/);
  assert.match(registerSource, /Surname/);
  assert.match(registerSource, /firstName/);
  assert.match(registerSource, /lastName/);
  assert.match(registerSource, /placeholder="First and middle names"/);
  assert.match(registerSource, /placeholder="Surname"/);
  assert.match(registerSource, /\+27/);
  assert.match(registerSource, /normalizeSouthAfricanPhone/);
});

test("driver application reinstates insurance docs and replaces dekra with 5 vehicle photos", () => {
  const chauffeurRegisterSource = readProjectFile("app/chauffeur-register.tsx");
  const vehiclesSource = readProjectFile("app/chauffeur/vehicles.tsx");
  const routesSource = readProjectFile("server/routes.ts");

  assert.doesNotMatch(chauffeurRegisterSource, /driver:driver_evaluation/);
  assert.match(chauffeurRegisterSource, /driver:passenger_liability_insurance/);
  assert.match(chauffeurRegisterSource, /\+27/);
  assert.match(chauffeurRegisterSource, /normalizeSouthAfricanPhone/);

  assert.match(vehiclesSource, /vehicle:passenger_liability_insurance/);
  assert.match(vehiclesSource, /vehicle:inspection_photos/);
  assert.match(vehiclesSource, /VEHICLE_PHOTO_ANGLES/);
  assert.match(vehiclesSource, /saveAllVehiclePhotos/);
  assert.match(vehiclesSource, /isAll5PhotosTaken/);

  assert.match(routesSource, /const VEHICLE_REQUIRED_DOCS = new Set\(\[\s*"vehicle:double_license_disk",\s*"vehicle:passenger_liability_insurance",?\s*\]\)/);
  assert.match(routesSource, /vehicle:inspection_photos/);
});

test("driver app supports capturing documents using device camera and gallery", () => {
  const chauffeurRegisterSource = readProjectFile("app/chauffeur-register.tsx");
  const vehiclesSource = readProjectFile("app/chauffeur/vehicles.tsx");
  const settingsSource = readProjectFile("app/chauffeur/settings.tsx");

  assert.match(chauffeurRegisterSource, /launchCameraAsync/);
  assert.match(chauffeurRegisterSource, /promptDocumentChoice/);
  assert.match(vehiclesSource, /launchCameraAsync/);
  assert.match(vehiclesSource, /handleDocumentUploadPress/);
  assert.match(settingsSource, /launchCameraAsync/);
  assert.match(settingsSource, /handleSettingsDocumentPress/);
});

test("map recentering reliably centers on driver overview view and fits active routes", () => {
  const mapNativeSource = readProjectFile("components/A2BMap.native.tsx");
  const mapWebSource = readProjectFile("components/A2BMap.web.tsx");
  const chauffeurSource = readProjectFile("app/chauffeur/index.tsx");

  assert.match(mapNativeSource, /fitMap/);
  assert.match(mapNativeSource, /IDLE_DELTA/);
  assert.match(mapNativeSource, /CITY_DELTA/);
  assert.match(mapNativeSource, /isMapMoved/);
  assert.match(mapNativeSource, /onRegionChangeComplete/);
  assert.match(mapWebSource, /fitMap/);
  assert.match(mapWebSource, /idleZoom/);
  assert.match(mapWebSource, /isMapMoved/);
  assert.match(chauffeurSource, /initialZoom="city"/);
});

test("driver navigation settings and bottom-left green vehicle button are configured", () => {
  const navSettingsSource = readProjectFile("app/chauffeur/navigation-settings.tsx");
  const settingsSource = readProjectFile("app/chauffeur/settings.tsx");
  const chauffeurSource = readProjectFile("app/chauffeur/index.tsx");
  const navPrefsSource = readProjectFile("lib/navigation-preferences.ts");

  assert.match(navSettingsSource, /A2B Navigation/);
  assert.match(navSettingsSource, /Google Maps/);
  assert.match(navSettingsSource, /Auto-navigate/);
  assert.match(settingsSource, /\/chauffeur\/navigation-settings/);
  assert.match(chauffeurSource, /greenVehicleBtn/);
  assert.match(chauffeurSource, /getNavigationPreferences/);
  assert.match(navPrefsSource, /getNavigationPreferences/);
  assert.match(navPrefsSource, /setNavigationApp/);
});

test("supports live trip destination change with price recalculation and Waze deep navigation", () => {
  const routesSource = readProjectFile("server/routes.ts");
  const clientSource = readProjectFile("app/client/index.tsx");
  const chauffeurSource = readProjectFile("app/chauffeur/index.tsx");
  const navHelperSource = readProjectFile("lib/google-navigation.ts");

  assert.match(routesSource, /\/api\/rides\/:id\/destination/);
  assert.match(routesSource, /ride:destinationUpdated/);
  assert.match(routesSource, /priceEstimate/);
  assert.match(clientSource, /active_dropoff/);
  assert.match(clientSource, /openActiveDestinationEditor/);
  assert.match(clientSource, /activeDestinationCard/);
  assert.match(chauffeurSource, /handleDestinationUpdated/);
  assert.match(chauffeurSource, /ride:destinationUpdated/);
  assert.match(navHelperSource, /buildWazeNavigationUrl/);
  assert.match(navHelperSource, /waze:\/\//);
});

test("driver cancellation notifies client and automatically resumes ride search", () => {
  const routesSource = readProjectFile("server/routes.ts");
  const clientSource = readProjectFile("app/client/index.tsx");

  assert.match(routesSource, /cancelledBy === "driver"/);
  assert.match(routesSource, /We are automatically searching for another driver for you now/);
  assert.match(clientSource, /isDriverCancellation/);
  assert.match(clientSource, /reRequestCancelledRide/);
  assert.match(clientSource, /Your driver had to cancel this trip\. We are automatically searching for another nearby driver/);
  assert.match(clientSource, /on\("ride:cancelled", handleStatusUpdate\)/);
});

test("admin document viewer ignores local device URIs and shows re-upload indicator", () => {
  const adminSource = readProjectFile("server/templates/admin.html");
  const a2bAdminSource = readProjectFile("a2b-admin.html");
  const routesSource = readProjectFile("server/routes.ts");
  const vehiclesAppSource = readProjectFile("app/chauffeur/vehicles.tsx");

  assert.match(adminSource, /trimmed\.startsWith\('file:'\)/);
  assert.match(adminSource, /Re-upload needed/);
  assert.match(a2bAdminSource, /trimmed\.startsWith\('file:'\)/);
  assert.match(routesSource, /Invalid document URL\. Documents must be uploaded via \/api\/upload-document\./);
  assert.doesNotMatch(vehiclesAppSource, /catch \{\}\s+await apiRequest\("POST", `\/api\/vehicles\/\$\{vehicleId\}\/documents`/);
});

test("destination update route supports client auth and rejects after trip completion", () => {
  const routesSource = readProjectFile("server/routes.ts");
  assert.match(routesSource, /app\.put\("\/api\/rides\/:id\/destination", authOptional/);
  assert.match(routesSource, /callerUserId && existingRide\.clientId && existingRide\.clientId !== callerUserId/);
  assert.match(routesSource, /Destination cannot be changed after the trip has ended/);
});

test("admin dashboard provides comprehensive vehicle editing", () => {
  const adminSource = readProjectFile("server/templates/admin.html");
  const a2bAdminSource = readProjectFile("a2b-admin.html");
  const routesSource = readProjectFile("server/routes.ts");

  assert.match(adminSource, /editVehicle/);
  assert.match(adminSource, /vehicle-carMake/);
  assert.match(adminSource, /vehicle-vehicleModel/);
  assert.match(adminSource, /vehicle-plateNumber/);
  assert.match(adminSource, /vehicle-status/);
  assert.match(adminSource, /vehicle-rejectionReason/);
  assert.match(a2bAdminSource, /editVehicle/);
  assert.match(routesSource, /app\.put\("\/api\/admin\/vehicles\/:id", requireAuth/);
});

test("Resend email templates are configured for driver onboarding and vehicle reviews", async () => {
  const {
    sendDriverSignupReceivedEmail,
    sendDriverApprovedEmail,
    sendDriverRejectedEmail,
    sendVehicleApprovedEmail,
    sendVehicleRejectedEmail,
    sendDocumentApprovedEmail,
    sendDocumentRejectedEmail,
  } = await import("./email-templates");

  assert.strictEqual(typeof sendDriverSignupReceivedEmail, "function");
  assert.strictEqual(typeof sendDriverApprovedEmail, "function");
  assert.strictEqual(typeof sendDriverRejectedEmail, "function");
  assert.strictEqual(typeof sendVehicleApprovedEmail, "function");
  assert.strictEqual(typeof sendVehicleRejectedEmail, "function");
  assert.strictEqual(typeof sendDocumentApprovedEmail, "function");
  assert.strictEqual(typeof sendDocumentRejectedEmail, "function");

  const signupRes = await sendDriverSignupReceivedEmail({ to: "test@example.com", name: "John Doe" });
  assert.ok(["sent", "pending_configuration"].includes(signupRes.status));

  const approveRes = await sendDriverApprovedEmail({ to: "test@example.com", name: "John Doe" });
  assert.ok(["sent", "pending_configuration"].includes(approveRes.status));

  const rejectRes = await sendDriverRejectedEmail({ to: "test@example.com", name: "John Doe", reason: "License expired" });
  assert.ok(["sent", "pending_configuration"].includes(rejectRes.status));

  const vehApproveRes = await sendVehicleApprovedEmail({ to: "test@example.com", name: "John Doe", carMake: "Mercedes-Benz", vehicleModel: "C-Class", plateNumber: "CA 123456" });
  assert.ok(["sent", "pending_configuration"].includes(vehApproveRes.status));

  const vehRejectRes = await sendVehicleRejectedEmail({ to: "test@example.com", name: "John Doe", carMake: "Toyota", vehicleModel: "Corolla", plateNumber: "CA 123456", reason: "Interior photo missing" });
  assert.ok(["sent", "pending_configuration"].includes(vehRejectRes.status));
});

test("driver overlay module and service contain robust crash protection for Android 12-15", () => {
  const serviceSource = readProjectFile("modules/driver-overlay/android/src/main/java/expo/modules/driveroverlay/DriverOverlayService.kt");
  const moduleSource = readProjectFile("modules/driver-overlay/android/src/main/java/expo/modules/driveroverlay/DriverOverlayModule.kt");
  const overlayLibSource = readProjectFile("lib/driver-overlay.ts");
  const layoutSource = readProjectFile("app/chauffeur/_layout.tsx");
  const appConfigSource = readProjectFile("app.config.shared.js");

  // Android 14+ Foreground Service Type
  assert.match(serviceSource, /FOREGROUND_SERVICE_TYPE_SPECIAL_USE/);
  assert.match(serviceSource, /UPSIDE_DOWN_CAKE/);

  // Crash guards in native module
  assert.match(moduleSource, /catch \(e: Throwable\)/);
  assert.match(moduleSource, /startService\(intent\)/);

  // JavaScript wrapper fail-safe try-catches
  assert.match(overlayLibSource, /export async function startDriverOverlay/);
  assert.match(overlayLibSource, /try \{/);

  // Service trigger in layout
  assert.match(layoutSource, /keepDriverServiceActive/);

  // Required Android permissions
  assert.match(appConfigSource, /android\.permission\.FOREGROUND_SERVICE_SPECIAL_USE/);
  assert.match(appConfigSource, /android\.permission\.SYSTEM_ALERT_WINDOW/);
});




