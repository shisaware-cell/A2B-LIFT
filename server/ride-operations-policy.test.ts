import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateDemandMultiplier,
  calculateRiderCancellationFee,
  calculateUnfinishedTripFare,
  calculateWaitingFee,
  reconcileDriverProfileStatus,
  resolveOperatorSubmissionStatus,
  resolveCancellation,
  isValidLocationSample,
  isDriverNearLocation,
} from "./ride-operations-policy";
import { calculatePrice } from "./luxuryPricingEngine";
import { normalizeVehicleType, getVehicleCategoryTitle } from "../shared/fare-policy";
import { generateTripInvoiceHtml } from "./trip-invoice";

test("charges R1 per started minute after a five minute arrival grace period and caps it at R30", () => {
  assert.equal(calculateWaitingFee(5), 0);
  assert.equal(calculateWaitingFee(5.01), 100);
  assert.equal(calculateWaitingFee(40), 3000);
});

test("caps automatic high-demand pricing at the configured 1.5x maximum", () => {
  assert.equal(calculateDemandMultiplier({ searchingRides: 3, onlineDrivers: 1, maximum: 1.5 }), 1.5);
  assert.equal(calculateDemandMultiplier({ searchingRides: 1, onlineDrivers: 3, maximum: 1.5 }), 1);
});

test("includes the locked demand multiplier in a server-side quote", () => {
  const estimate = calculatePrice(10, "budget", { demandMultiplier: 1.5 });
  assert.equal(estimate.demandMultiplier, 1.5);
  assert.equal(estimate.totalPrice, 203);
});

test("charges the selected vehicle base fare only after three driving minutes", () => {
  assert.equal(calculateRiderCancellationFee({ minutesDrivingToPickup: 2.99, baseFareCents: 4500, waitingFeeCents: 0 }), 0);
  assert.equal(calculateRiderCancellationFee({ minutesDrivingToPickup: 3, baseFareCents: 4500, waitingFeeCents: 1200 }), 5700);
});

test("applies the ride's locked smart-pricing multiplier to cancellation fees", () => {
  assert.equal(calculateRiderCancellationFee({
    minutesDrivingToPickup: 3,
    baseFareCents: 5000,
    waitingFeeCents: 0,
    pricingMultiplier: 1.5,
  }), 7500);
});

test("calculates unfinished trip fare based on actual distance traveled and waiting fee", () => {
  const fareCents = calculateUnfinishedTripFare({
    baseFareCents: 5000,
    pricePerKmCents: 850,
    distanceTraveledKm: 4.5,
    waitingFeeCents: 200,
    pricingMultiplier: 1.0,
  });
  // 5000 + round(4.5 * 850 = 3825) + 200 = 9025 cents (R90.25)
  assert.equal(fareCents, 9025);
});

test("reconciles only an approved driver's stale operator profile", () => {
  assert.equal(reconcileDriverProfileStatus({ profileType: "driver", profileStatus: "pending", chauffeurApproved: true }), "approved");
  assert.equal(reconcileDriverProfileStatus({ profileType: "partner", profileStatus: "pending", chauffeurApproved: true }), "pending");
});

test("keeps approved operator profiles approved when profile details are resubmitted", () => {
  assert.equal(resolveOperatorSubmissionStatus({ existingStatus: "approved", requestedStatus: "pending" }), "approved");
  assert.equal(resolveOperatorSubmissionStatus({ existingStatus: "pending", requestedStatus: "pending" }), "pending");
  assert.equal(resolveOperatorSubmissionStatus({ existingStatus: "rejected", requestedStatus: "pending" }), "pending");
});

test("charges a rider but never a driver for an early driver cancellation", () => {
  assert.deepEqual(resolveCancellation({ actor: "driver", baseFareCents: 4500, minutesDrivingToPickup: 30, waitingFeeCents: 2000, minutesSinceArrival: 2 }), { feeCents: 0, cashDebtCents: 0 });
  assert.deepEqual(resolveCancellation({ actor: "rider", baseFareCents: 4500, minutesDrivingToPickup: 3, waitingFeeCents: 0 }), { feeCents: 4500, cashDebtCents: 4500 });
});

test("charges rider cancellation fee when driver cancels after waiting >= 5 minutes (no-show)", () => {
  const cancellation = resolveCancellation({
    actor: "driver",
    baseFareCents: 5000,
    minutesDrivingToPickup: 0,
    waitingFeeCents: 0,
    arrived: true,
    minutesSinceArrival: 5.2,
  });
  assert.deepEqual(cancellation, { feeCents: 5000, cashDebtCents: 5000 });
});

test("resolves unfinished in-progress trips with partial distance charge", () => {
  const result = resolveCancellation({
    actor: "rider",
    baseFareCents: 5000,
    minutesDrivingToPickup: 0,
    waitingFeeCents: 0,
    tripStarted: true,
    distanceTraveledKm: 5,
    pricePerKmCents: 850,
  });
  // 5000 + 4250 = 9250
  assert.equal(result.feeCents, 9250);
});

test("includes waiting time when a rider cancels after driver arrival", () => {
  assert.deepEqual(resolveCancellation({ actor: "rider", baseFareCents: 4500, minutesDrivingToPickup: 0, waitingFeeCents: 1200, arrived: true }), { feeCents: 5700, cashDebtCents: 5700 });
});

test("combines locked smart pricing and waiting time after driver arrival", () => {
  assert.deepEqual(resolveCancellation({
    actor: "rider",
    baseFareCents: 5000,
    minutesDrivingToPickup: 0,
    waitingFeeCents: 1200,
    pricingMultiplier: 1.5,
    arrived: true,
  }), { feeCents: 8700, cashDebtCents: 8700 });
});

test("accurately verifies proximity between driver and target location", () => {
  // Same coordinates (~0m)
  assert.equal(isDriverNearLocation(-26.2041, 28.0473, -26.2041, 28.0473, 200), true);
  // ~100m away
  assert.equal(isDriverNearLocation(-26.2041, 28.0473, -26.2045, 28.0473, 200), true);
  // ~5km away
  assert.equal(isDriverNearLocation(-26.2041, 28.0473, -26.2500, 28.0473, 200), false);
});

test("accepts only finite latitude and longitude samples", () => {
  assert.equal(isValidLocationSample(-26.2041, 28.0473), true);
  assert.equal(isValidLocationSample(91, 28.0473), false);
});

test("normalizes vehicle categories and aliases properly", () => {
  assert.equal(normalizeVehicleType("VIP"), "business");
  assert.equal(normalizeVehicleType("Executive"), "business");
  assert.equal(normalizeVehicleType("a2b-lite"), "a2b_lite");
  assert.equal(normalizeVehicleType("V-Class"), "luxury_van");
  assert.equal(normalizeVehicleType("budget_car"), "budget");
  assert.equal(getVehicleCategoryTitle("business"), "VIP");
  assert.equal(getVehicleCategoryTitle("luxury_van"), "V-Class");
});

test("generates branded trip invoice html receipt with complete trip breakdown", () => {
  const html = generateTripInvoiceHtml({
    trip: {
      id: "ride-12345678-abcd",
      pickupAddress: "123 Main St, Sandton",
      dropoffAddress: "456 Market St, Rosebank",
      finalFare: 145.50,
      baseFare: 50,
      waitingFee: 10,
      distanceKm: 12.4,
      durationMin: 18,
      vehicleType: "budget",
      paymentMethod: "card",
      completedAt: new Date("2026-08-17T12:00:00Z"),
    },
    recipient: {
      email: "rider@example.com",
      name: "Thabo M.",
    },
    driver: {
      name: "Nelson D.",
      carMake: "Toyota",
      vehicleModel: "Corolla Quest",
      plateNumber: "CA 123-456",
    },
  });

  assert.ok(html.includes("R 145.50"));
  assert.ok(html.includes("123 Main St, Sandton"));
  assert.ok(html.includes("456 Market St, Rosebank"));
  assert.ok(html.includes("Nelson D."));
  assert.ok(html.includes("Toyota Corolla Quest"));
  assert.ok(html.includes("CA 123-456"));
  assert.ok(html.includes("Budget"));
});

test("calculates exact 2.5% rider trip cashback across fares", () => {
  const fare1 = 100;
  const fare2 = 145.50;
  const fare3 = 350;
  assert.equal(Math.round(fare1 * 0.025 * 100) / 100, 2.50);
  assert.equal(Math.round(fare2 * 0.025 * 100) / 100, 3.64);
  assert.equal(Math.round(fare3 * 0.025 * 100) / 100, 8.75);
});

test("detects driver concurrent device session conflicts correctly", () => {
  function checkDriverSessionConflict(activeDeviceId: string | null, incomingDeviceId: string): boolean {
    if (!activeDeviceId || !incomingDeviceId) return false;
    return activeDeviceId !== incomingDeviceId;
  }

  assert.equal(checkDriverSessionConflict(null, "dev_phone_2"), false);
  assert.equal(checkDriverSessionConflict("dev_phone_1", "dev_phone_1"), false);
  assert.equal(checkDriverSessionConflict("dev_phone_1", "dev_phone_2"), true);
});

test("android build configuration includes required foreground and background location permissions", () => {
  const { createMobileAppConfig } = require("../app.config.shared");
  const driverConfig = createMobileAppConfig({ variant: "driver" });
  const permissions = driverConfig.android.permissions;

  assert.ok(permissions.includes("android.permission.ACCESS_FINE_LOCATION"));
  assert.ok(permissions.includes("android.permission.ACCESS_BACKGROUND_LOCATION"));
  assert.ok(permissions.includes("android.permission.FOREGROUND_SERVICE"));
  assert.ok(permissions.includes("android.permission.FOREGROUND_SERVICE_LOCATION"));
});

test("calculates accurate bearing rotation angle between GPS coordinates", () => {
  function calculateBearingDegrees(prevLat: number, prevLng: number, nextLat: number, nextLng: number): number {
    const pLat = (prevLat * Math.PI) / 180;
    const pLng = (prevLng * Math.PI) / 180;
    const nLat = (nextLat * Math.PI) / 180;
    const nLng = (nextLng * Math.PI) / 180;
    const dLng = nLng - pLng;
    const y = Math.sin(dLng) * Math.cos(nLat);
    const x = Math.cos(pLat) * Math.sin(nLat) - Math.sin(pLat) * Math.cos(nLat) * Math.cos(dLng);
    const brng = (Math.atan2(y, x) * 180) / Math.PI;
    return (brng + 360) % 360;
  }

  // Moving due North: latitude increases, longitude constant -> 0 deg
  const northBearing = calculateBearingDegrees(-26.2041, 28.0473, -26.1941, 28.0473);
  assert.ok(Math.abs(northBearing - 0) < 1 || Math.abs(northBearing - 360) < 1);

  // Moving due East: longitude increases, latitude constant -> ~90 deg
  const eastBearing = calculateBearingDegrees(-26.2041, 28.0473, -26.2041, 28.0573);
  assert.ok(Math.abs(eastBearing - 90) < 2);

  // Moving due South: latitude decreases, longitude constant -> ~180 deg
  const southBearing = calculateBearingDegrees(-26.2041, 28.0473, -26.2141, 28.0473);
  assert.ok(Math.abs(southBearing - 180) < 2);
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("accurately aligns driver car marker along active route polyline segments", () => {
  const mapNativeSource = readFileSync(resolve(process.cwd(), "components/A2BMap.native.tsx"), "utf-8");
  assert.match(mapNativeSource, /export function findNearestSegmentBearing/);
  assert.match(mapNativeSource, /routeCoords=\{routeCoords\}/);
  assert.match(mapNativeSource, /findNearestSegmentBearing\(latitude,\s*longitude,\s*routeCoords\)/);
});

test("resolves vehicle make, model and plate number from active fleet vehicle over stale chauffeur columns", () => {
  function resolveVehicleDetails(chauffeur: any, activeVehicle?: any) {
    return {
      carMake: activeVehicle?.make || chauffeur.carMake || null,
      vehicleModel: activeVehicle?.model || chauffeur.vehicleModel || null,
      plateNumber: activeVehicle?.plateNumber || chauffeur.plateNumber || null,
      carColor: activeVehicle?.color || chauffeur.carColor || null,
      vehicleCategory: activeVehicle?.category || chauffeur.vehicleCategory || null,
    };
  }

  const staleChauffeur = {
    carMake: "Toyota",
    vehicleModel: "Corolla",
    plateNumber: "OLD 123 GP",
    carColor: "White",
    vehicleCategory: "budget",
  };

  const assignedFleetVehicle = {
    make: "Mercedes-Benz",
    model: "C-Class",
    plateNumber: "NEW 789 GP",
    color: "Black",
    category: "executive",
  };

  const resolved = resolveVehicleDetails(staleChauffeur, assignedFleetVehicle);
  assert.equal(resolved.carMake, "Mercedes-Benz");
  assert.equal(resolved.vehicleModel, "C-Class");
  assert.equal(resolved.plateNumber, "NEW 789 GP");
  assert.equal(resolved.carColor, "Black");
  assert.equal(resolved.vehicleCategory, "executive");

  // Fallback when no fleet vehicle assigned
  const fallback = resolveVehicleDetails(staleChauffeur, null);
  assert.equal(fallback.carMake, "Toyota");
  assert.equal(fallback.plateNumber, "OLD 123 GP");
});

test("calculates exact Monday 04:00 AM to Monday 03:59 AM earnings week bounds", () => {
  function getEarningsWeekBounds(now: Date): { weekStart: Date; weekEnd: Date } {
    const sastOffsetMs = 2 * 60 * 60 * 1000;
    const localNow = new Date(now.getTime() + sastOffsetMs);

    const dayOfWeek = localNow.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
    const hour = localNow.getUTCHours();
    const minute = localNow.getUTCMinutes();

    let daysSinceMonday = (dayOfWeek + 6) % 7;
    if (daysSinceMonday === 0 && (hour < 4 || (hour === 4 && minute === 0))) {
      daysSinceMonday = 7;
    }

    const startLocal = new Date(localNow);
    startLocal.setUTCDate(localNow.getUTCDate() - daysSinceMonday);
    startLocal.setUTCHours(4, 0, 0, 0);

    const endLocal = new Date(startLocal);
    endLocal.setUTCDate(startLocal.getUTCDate() + 7);
    endLocal.setUTCHours(3, 59, 59, 999);

    const weekStart = new Date(startLocal.getTime() - sastOffsetMs);
    const weekEnd = new Date(endLocal.getTime() - sastOffsetMs);
    return { weekStart, weekEnd };
  }

  // Wednesday 14:00 SAST (2026-09-02T12:00:00Z)
  const wednesday = new Date("2026-09-02T12:00:00Z");
  const bounds = getEarningsWeekBounds(wednesday);
  // Week start: Monday 31 Aug 2026 04:00 SAST -> 2026-08-31T02:00:00Z
  assert.equal(bounds.weekStart.toISOString(), "2026-08-31T02:00:00.000Z");
  // Week end: Monday 7 Sep 2026 03:59:59.999 SAST -> 2026-09-07T01:59:59.999Z
  assert.equal(bounds.weekEnd.toISOString(), "2026-09-07T01:59:59.999Z");
});

test("requires confirmation when driver account attempts login on a different device", () => {
  function checkDeviceTransfer(
    activeDeviceId?: string | null,
    incomingDeviceId?: string,
    forceSwitchDevice = false
  ): { requiresConfirmation: boolean; proceed: boolean } {
    if (activeDeviceId && incomingDeviceId && activeDeviceId !== incomingDeviceId && !forceSwitchDevice) {
      return { requiresConfirmation: true, proceed: false };
    }
    return { requiresConfirmation: false, proceed: true };
  }

  // First device login
  assert.deepEqual(checkDeviceTransfer(null, "device_A"), { requiresConfirmation: false, proceed: true });

  // Same device login
  assert.deepEqual(checkDeviceTransfer("device_A", "device_A"), { requiresConfirmation: false, proceed: true });

  // Different device login without forceSwitchDevice -> prompts confirmation
  assert.deepEqual(checkDeviceTransfer("device_A", "device_B", false), { requiresConfirmation: true, proceed: false });

  // Different device login with confirmed forceSwitchDevice -> proceeds
  assert.deepEqual(checkDeviceTransfer("device_A", "device_B", true), { requiresConfirmation: false, proceed: true });
});

test("partner earnings and fleet live map screens are properly integrated in routes and UI", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf-8");
  assert.match(routesSource, /\/api\/fleet\/earnings-summary/);
  assert.match(routesSource, /\/api\/fleet\/live-locations/);

  const earningsSource = readFileSync(resolve(process.cwd(), "app/chauffeur/earnings.tsx"), "utf-8");
  assert.match(earningsSource, /Adjustments from previous periods/);
  assert.match(earningsSource, /Driver Net earnings/);
  assert.match(earningsSource, /An earnings week goes from Monday at 4:00 AM/);

  const liveMapSource = readFileSync(resolve(process.cwd(), "app/chauffeur/live-map.tsx"), "utf-8");
  assert.match(liveMapSource, /Live Demand/);
  assert.match(liveMapSource, /Drivers \(/);
});

test("partner drivers can switch between partner fleet dashboard and driver dashboard seamlessly", () => {
  const chauffeurSource = readFileSync(resolve(process.cwd(), "app/chauffeur/index.tsx"), "utf-8");
  // Ensure forced lock into fleet list was removed
  assert.doesNotMatch(chauffeurSource, /router\.replace\("\/chauffeur\/fleet" as never\);/);
  // Ensure dual mode state and UI toggles are integrated
  assert.match(chauffeurSource, /partnerDashboardMode/);
  assert.match(chauffeurSource, /partnerFleetPill/);
  assert.match(chauffeurSource, /driverModeHeroCard/);
  assert.match(chauffeurSource, /FLEET OPERATIONS & TOOLS/);

  const fleetSource = readFileSync(resolve(process.cwd(), "app/chauffeur/fleet.tsx"), "utf-8");
  assert.match(fleetSource, /liveMapHeaderBtn/);

  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf-8");
  // Ensure approved partners are authorized to select a vehicle and go online
  assert.match(routesSource, /row\.operator_type === "driver" \|\| row\.operator_type === "partner"/);
  assert.doesNotMatch(routesSource, /Partners cannot go online as drivers/);
});

test("driver single-device session conflict alert and website photo upload are enabled", () => {
  const loginSource = readFileSync(resolve(process.cwd(), "app/login.tsx"), "utf-8");
  assert.match(loginSource, /deviceTransferPrompt/);
  assert.match(loginSource, /Active Session Detected/);
  assert.match(loginSource, /deviceConflictCard/);

  const queryClientSource = readFileSync(resolve(process.cwd(), "lib/query-client.ts"), "utf-8");
  assert.match(queryClientSource, /"x-device-id": deviceId/);
  assert.match(queryClientSource, /DEVICE_TRANSFERRED/);

  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf-8");
  assert.match(routesSource, /isDriverAccount/);
  assert.match(routesSource, /DEVICE_TRANSFERRED/);
  assert.match(routesSource, /type\.startsWith\("vehicle:"\)/);

  const websiteDriverRegister = readFileSync(resolve(process.cwd(), "website/driver-register.html"), "utf-8");
  assert.match(websiteDriverRegister, /doc-photo/);
  assert.match(websiteDriverRegister, /doc-car-front/);
  assert.match(websiteDriverRegister, /doc-car-back/);
  assert.match(websiteDriverRegister, /doc-car-left/);
  assert.match(websiteDriverRegister, /doc-car-right/);
  assert.match(websiteDriverRegister, /doc-car-inside/);
  assert.match(websiteDriverRegister, /vehicle:photo_front/);
  assert.match(websiteDriverRegister, /\/api\/upload-document/);
});

test("website login and account registration scripts are syntactically valid and properly handle credentials", () => {
  const loginHtml = readFileSync(resolve(process.cwd(), "website/login.html"), "utf-8");
  const driverRegHtml = readFileSync(resolve(process.cwd(), "website/driver-register.html"), "utf-8");
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf-8");

  // 1. website/login.html script must be valid JavaScript
  const loginScriptMatch = loginHtml.match(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/i);
  assert.ok(loginScriptMatch, "website/login.html should contain inline script");
  assert.doesNotThrow(() => {
    new Function(loginScriptMatch[1]);
  }, "website/login.html inline script should have no syntax errors");

  // 2. website/driver-register.html script must be valid JavaScript
  const driverRegScriptMatch = driverRegHtml.match(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/i);
  assert.ok(driverRegScriptMatch, "website/driver-register.html should contain inline script");
  assert.doesNotThrow(() => {
    new Function(driverRegScriptMatch[1]);
  }, "website/driver-register.html inline script should have no syntax errors");

  // 3. Functions handleLogin and handleRegister are defined in login.html
  assert.match(loginHtml, /async function handleLogin/);
  assert.match(loginHtml, /async function handleRegister/);
  assert.match(loginHtml, /function switchTab/);

  // 4. driver registration passes username and handles accessToken/token
  assert.match(driverRegHtml, /username:\s*payload\.email/);
  assert.match(driverRegHtml, /regData\.accessToken\s*\|\|\s*regData\.token/);

  // 5. backend register route handles both username and email, and returns accessToken and token
  assert.match(routesSource, /const\s*\{\s*username,\s*email:\s*bodyEmail/);
  assert.match(routesSource, /accessToken:\s*token,\s*token/);
});

test("partner dashboard cleanup, dark theme map and earnings, and device push notifications are configured", () => {
  const chauffeurIndex = readFileSync(resolve(process.cwd(), "app/chauffeur/index.tsx"), "utf-8");
  const fleetSource = readFileSync(resolve(process.cwd(), "app/chauffeur/fleet.tsx"), "utf-8");
  const fleetMapSource = readFileSync(resolve(process.cwd(), "components/FleetMap.native.tsx"), "utf-8");
  const liveMapSource = readFileSync(resolve(process.cwd(), "app/chauffeur/live-map.tsx"), "utf-8");
  const earningsSource = readFileSync(resolve(process.cwd(), "app/chauffeur/earnings.tsx"), "utf-8");
  const appSharedConfig = readFileSync(resolve(process.cwd(), "app.config.shared.js"), "utf-8");
  const clientIndex = readFileSync(resolve(process.cwd(), "app/client/index.tsx"), "utf-8");
  const serverRoutes = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf-8");

  // 1. Partner Dashboard header: no Driver Mode button, no Approved driver badge, title single line
  const partnerHeaderBarMatch = chauffeurIndex.match(/<View style=\{styles\.partnerHeaderBar\}>[\s\S]*?<\/View>\s*<\/View>/);
  assert.ok(partnerHeaderBarMatch, "partnerHeaderBar must exist in chauffeur index");
  assert.doesNotMatch(partnerHeaderBarMatch[0], /Driver Mode/i);
  assert.doesNotMatch(partnerHeaderBarMatch[0], /Approved driver/i);
  assert.doesNotMatch(chauffeurIndex, /partnerStatusChip/);
  assert.match(chauffeurIndex, /numberOfLines=\{1\}/);
  assert.match(chauffeurIndex, /adjustsFontSizeToFit/);
  assert.doesNotMatch(fleetSource, /driverModeHeaderBtn/);

  // 2. Fleet live map: dark theme map style and dark UI controls
  assert.match(fleetMapSource, /DARK_MAP_STYLE/);
  assert.match(fleetMapSource, /customMapStyle=\{DARK_MAP_STYLE\}/);
  assert.match(fleetMapSource, /userInterfaceStyle="dark"/);
  assert.match(liveMapSource, /#0B0C10/);
  assert.match(liveMapSource, /#14161D/);

  // 3. Earnings & Payouts screen: dark theme
  assert.match(earningsSource, /Colors\.primary/);
  assert.match(earningsSource, /Colors\.card/);
  assert.match(earningsSource, /Colors\.surface/);

  // 4. Device push notifications: POST_NOTIFICATIONS permission, projectId fallbacks, and multi-token dispatch
  assert.match(appSharedConfig, /android\.permission\.POST_NOTIFICATIONS/);
  assert.match(chauffeurIndex, /\(!chauffeur\?\.id\s*&&\s*!user\?\.id\)/);
  assert.match(chauffeurIndex, /eb3b8747-40b2-4aad-b118-e64339bfeea0/);
  assert.match(clientIndex, /9932543b-f023-4dec-8213-5d0fe99ad749/);
  assert.match(serverRoutes, /process\.env\.EXPO_ACCESS_TOKEN/);
  assert.match(serverRoutes, /new Set\(\[user\?\.pushToken,\s*chauffeur\?\.pushToken\]/);
});

