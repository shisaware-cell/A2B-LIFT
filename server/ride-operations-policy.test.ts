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
