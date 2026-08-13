import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const projectRoot = process.cwd();

function readProjectFile(relativePath: string) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

test("shows every vehicle category with route-specific pricing", () => {
  const clientSource = readProjectFile("app/client/index.tsx");
  const routesSource = readProjectFile("server/routes.ts");

  assert.match(clientSource, /VEHICLE_TYPES\.map\(\(vehicle\) =>/);
  assert.match(clientSource, /categoryPricing\[vehicle\.id\]\?\.\[routeId\]/);
  assert.match(clientSource, /Choose your ride/);
  assert.match(routesSource, /app\.post\("\/api\/pricing\/options"/);
  assert.ok(clientSource.indexOf('id: "luxury_van"') < clientSource.indexOf('id: "a2b_lite"'));
  assert.ok(clientSource.indexOf('id: "a2b_lite"') < clientSource.indexOf('id: "budget"'));
  assert.match(clientSource, /name: "VIP"/);
  assert.match(clientSource, /people-outline/);
  assert.match(clientSource, /maxPassengers/);
});

test("offers an Android-only floating driver shortcut with event counts", () => {
  const settingsSource = readProjectFile("app/chauffeur/settings.tsx");
  const dashboardSource = readProjectFile("app/chauffeur/index.tsx");
  const overlaySource = readProjectFile("lib/driver-overlay.ts");
  const overlayManifest = readProjectFile("modules/driver-overlay/android/src/main/AndroidManifest.xml");
  const appConfigSource = readProjectFile("app.config.shared.js");
  const clientManifestGuard = readProjectFile("plugins/without-driver-overlay.js");

  assert.match(settingsSource, /Floating driver shortcut/);
  assert.match(settingsSource, /isDriverOverlayAvailable\(\)/);
  assert.match(dashboardSource, /unreadCount \+ \(incomingRide\?\.id \? 1 : 0\)/);
  assert.match(overlaySource, /Platform\.OS === "android"/);
  assert.match(overlayManifest, /android\.permission\.SYSTEM_ALERT_WINDOW/);
  assert.match(overlayManifest, /android:foregroundServiceType="specialUse"/);
  assert.match(appConfigSource, /config\.variant === "client"/);
  assert.match(clientManifestGuard, /DriverOverlayService/);
  assert.match(clientManifestGuard, /tools:node.*remove/);
});

test("emits rider cancellations before slow refund processing", () => {
  const routesSource = readProjectFile("server/routes.ts");
  const immediateCancellationBlock = routesSource.indexOf("Clear the active ride immediately");
  const cancellationEmit = routesSource.indexOf(
    'io.emit("ride:statusUpdate", {',
    immediateCancellationBlock,
  );
  const refundRequest = routesSource.indexOf('"https://api.paystack.co/refund"');

  assert.ok(immediateCancellationBlock >= 0);
  assert.ok(cancellationEmit >= 0);
  assert.ok(refundRequest > cancellationEmit);
  assert.match(routesSource, /driverCancellationEarnings/);
});

test("driver closes cancelled trips and shows any earnings due", () => {
  const driverSource = readProjectFile("app/chauffeur/index.tsx");

  assert.match(driverSource, /handleRiderCancellation/);
  assert.match(driverSource, /No cancellation earnings are due/);
  assert.match(driverSource, /has been added to your earnings/);
  assert.match(driverSource, /setInterval\(checkRideStatus, 4000\)/);
});

test("driver offers show net earnings and the completed popup shows trip total", () => {
  const driverSource = readProjectFile("app/chauffeur/index.tsx");
  const completedPopupStart = driverSource.indexOf("Post-trip payment popup");
  const completedPopupEnd = driverSource.indexOf(
    "Post-trip client rating modal",
    completedPopupStart,
  );
  const completedPopup = driverSource.slice(completedPopupStart, completedPopupEnd);
  const rideHistorySource = readProjectFile("app/chauffeur/rides.tsx");

  assert.match(completedPopup, /Cash Fare/);
  assert.match(completedPopup, /The full cash fare is/);
  assert.match(completedPopup, /Trip Total/);
  assert.match(completedPopup, /getRideClientFare\(completedTrip\)/);
  assert.match(driverSource, /getDriverDisplayFare/);
  assert.match(driverSource, /getIncomingRideFare\(incomingRide\)/);
  assert.doesNotMatch(completedPopup, /platform commission/i);
  assert.match(rideHistorySource, /"Cash Collected" : "Your Earnings"/);
  assert.match(rideHistorySource, /getDriverDisplayFare/);
  assert.doesNotMatch(rideHistorySource, />Total Fare</);
  assert.doesNotMatch(rideHistorySource, />Commission</);
});

test("requires drivers to confirm every requested stop before ending a trip", () => {
  const driverSource = readProjectFile("app/chauffeur/index.tsx");
  const routesSource = readProjectFile("server/routes.ts");
  const storageSource = readProjectFile("server/storage.ts");
  const schemaSource = readProjectFile("shared/schema.ts");

  assert.match(schemaSource, /completedStopCount: integer\("completed_stop_count"\)/);
  assert.match(storageSource, /completeNextRideStop/);
  assert.match(storageSource, /eq\(rides\.completedStopCount, expectedCompletedCount\)/);
  assert.match(routesSource, /"\/api\/rides\/:id\/stops\/complete"/);
  assert.match(routesSource, /Confirm every requested stop before ending this trip/);
  assert.match(driverSource, /getActiveTripTarget/);
  assert.match(driverSource, /Confirm Arrival at Stop \$\{completedStopCount \+ 1\}/);
  assert.match(driverSource, /"End Trip"/);
  assert.match(driverSource, /styles\.stopProgressIndexComplete/);
  assert.match(driverSource, /stopConfirmationInFlightRef/);
  assert.match(driverSource, /completedStopCount: getCompletedStopCount\(previousRide\) \+ 1/);
  const confirmStopStart = driverSource.indexOf("function confirmCurrentStop");
  const confirmStopEnd = driverSource.indexOf("function confirmCancelRide", confirmStopStart);
  const confirmStopSource = driverSource.slice(confirmStopStart, confirmStopEnd);
  assert.doesNotMatch(confirmStopSource, /await fetchDriverRoute/);
});

test("acknowledges stop confirmation before notification bookkeeping", () => {
  const routesSource = readProjectFile("server/routes.ts");
  const endpointStart = routesSource.indexOf('"/api/rides/:id/stops/complete"');
  const endpointEnd = routesSource.indexOf('app.post("/api/rides/:id/pay"', endpointStart);
  const endpointSource = routesSource.slice(endpointStart, endpointEnd);

  assert.ok(endpointStart >= 0);
  assert.match(endpointSource, /io\.emit\("ride:statusUpdate", updatedRide\);[\s\S]*?res\.json\(updatedRide\);/);
  assert.ok(endpointSource.indexOf("res.json(updatedRide)") < endpointSource.indexOf("storage.createNotification"));
  assert.match(endpointSource, /if \(res\.headersSent\) return/);
});

test("acknowledges trip completion before background settlement work", () => {
  const routesSource = readProjectFile("server/routes.ts");
  const immediateResponse = routesSource.indexOf(
    'if (status === "trip_completed") {\n        const immediateRide',
  );
  const settlementWork = routesSource.indexOf(
    'if (status === "trip_completed" && ride.chauffeurId && ride.price)',
  );

  assert.ok(immediateResponse >= 0);
  assert.ok(settlementWork > immediateResponse);
  assert.match(routesSource, /if \(!res\.headersSent\)/);
});

test("reprices rider stop updates and notifies the assigned driver", () => {
  const routesSource = readProjectFile("server/routes.ts");
  const driverSource = readProjectFile("app/chauffeur/index.tsx");
  const clientSource = readProjectFile("app/client/index.tsx");

  assert.match(routesSource, /"\/api\/rides\/:id\/stops"/);
  assert.match(routesSource, /fetchVerifiedDirections\(\s*pickup,\s*destination,\s*nextStops/);
  assert.match(routesSource, /io\.emit\("ride:stopsUpdated"/);
  assert.match(routesSource, /Trip Stops Updated/);
  assert.match(driverSource, /on\("ride:stopsUpdated", handleStopsUpdated\)/);
  assert.match(clientSource, /Save Stops and Update Fare/);
  assert.match(clientSource, /getActiveRideTarget/);
});

test("uses realistic vehicle artwork throughout the rider category selectors", () => {
  const clientSource = readProjectFile("app/client/index.tsx");

  assert.match(clientSource, /nearby-car-marker\.png/);
  assert.match(clientSource, /category-van\.png/);
  assert.match(clientSource, /source=\{vehicle\.artwork\}/);
  assert.match(clientSource, /source=\{vt\.artwork\}/);
  assert.match(clientSource, /source=\{selectedVehicle\.artwork\}/);
  assert.ok(clientSource.indexOf('id: "luxury_van"') < clientSource.indexOf('id: "budget"'));
  assert.match(clientSource, /vehicleOptionBadge:[\s\S]*?color: Colors\.white/);
  assert.doesNotMatch(clientSource, /name=\{vehicle\.icon\}/);
  assert.doesNotMatch(clientSource, /name=\{vt\.icon\}/);
  assert.doesNotMatch(clientSource, /selectedVehicle\.icon/);
});

test("locks the commission rate onto each new ride", () => {
  const schemaSource = readProjectFile("shared/schema.ts");
  const routesSource = readProjectFile("server/routes.ts");

  assert.match(schemaSource, /commissionRate: real\("commission_rate"\)/);
  assert.match(routesSource, /commissionRate: getVehicleCategoryCommissionRate\(categoryId\)/);
  assert.match(routesSource, /calculateChauffeurEarnings\(ride\.price, ride\.commissionRate\)/);
});

test("lets drivers select every approved owned or assigned fleet vehicle", () => {
  const routesSource = readProjectFile("server/routes.ts");
  const vehiclesSource = readProjectFile("app/chauffeur/vehicles.tsx");

  assert.match(routesSource, /const ownsVehicle = row\.owner_operator_profile_id === row\.operator_profile_id/);
  assert.match(routesSource, /SET status = 'active', removed_at = NULL/);
  assert.match(routesSource, /INSERT INTO vehicle_assignments/);
  assert.match(vehiclesSource, /\(assigned \|\| ownsVehicle\)/);
});

test("shows driver photos to riders from either driver profile record", () => {
  const routesSource = readProjectFile("server/routes.ts");
  const clientSource = readProjectFile("app/client/index.tsx");

  const detailsStart = routesSource.indexOf('app.get("/api/chauffeurs/:id/details"');
  const profileStart = routesSource.indexOf('app.get("/api/chauffeurs/:id/profile"');
  const clientProfileStart = routesSource.indexOf('app.get("/api/clients/:id/profile"');
  const detailsSource = routesSource.slice(detailsStart, profileStart);
  const profileSource = routesSource.slice(profileStart, clientProfileStart);

  assert.match(detailsSource, /profilePhoto: chauffeur\.profilePhoto \|\| user\?\.profilePhoto \|\| null/);
  assert.match(profileSource, /profilePhoto: chauffeur\.profilePhoto \|\| user\?\.profilePhoto \|\| null/);
  assert.match(clientSource, /source=\{\{ uri: chauffeurDetails\.profilePhoto \}\}/);
  assert.match(clientSource, /source=\{\{ uri: driverProfile\.profilePhoto \}\}/);
});
