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

test("driver trip screens reveal earnings without the rider's total fare", () => {
  const driverSource = readProjectFile("app/chauffeur/index.tsx");
  const completedPopupStart = driverSource.indexOf("Post-trip payment popup");
  const completedPopupEnd = driverSource.indexOf(
    "Post-trip client rating modal",
    completedPopupStart,
  );
  const completedPopup = driverSource.slice(completedPopupStart, completedPopupEnd);
  const rideHistorySource = readProjectFile("app/chauffeur/rides.tsx");

  assert.match(completedPopup, /Your Trip Earnings/);
  assert.doesNotMatch(completedPopup, /getRideClientFare\(completedTrip\)/);
  assert.doesNotMatch(completedPopup, /platform commission/i);
  assert.match(rideHistorySource, /Your Earnings/);
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
  assert.match(driverSource, /Confirm Stop \$\{completedStopCount \+ 1\} of \$\{currentRideStops\.length\}/);
  assert.match(driverSource, /"End Trip"/);
  assert.match(driverSource, /styles\.stopProgressIndexComplete/);
});

test("uses realistic vehicle artwork throughout the rider category selectors", () => {
  const clientSource = readProjectFile("app/client/index.tsx");

  assert.match(clientSource, /nearby-car-marker\.png/);
  assert.match(clientSource, /category-van\.png/);
  assert.match(clientSource, /source=\{vehicle\.artwork\}/);
  assert.match(clientSource, /source=\{vt\.artwork\}/);
  assert.doesNotMatch(clientSource, /name=\{vehicle\.icon\}/);
  assert.doesNotMatch(clientSource, /name=\{vt\.icon\}/);
});

test("locks the commission rate onto each new ride", () => {
  const schemaSource = readProjectFile("shared/schema.ts");
  const routesSource = readProjectFile("server/routes.ts");

  assert.match(schemaSource, /commissionRate: real\("commission_rate"\)/);
  assert.match(routesSource, /commissionRate: PLATFORM_COMMISSION_RATE/);
  assert.match(routesSource, /calculateChauffeurEarnings\(ride\.price, ride\.commissionRate\)/);
});
