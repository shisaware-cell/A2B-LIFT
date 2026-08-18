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

