import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateDemandMultiplier,
  calculateRiderCancellationFee,
  calculateWaitingFee,
  reconcileDriverProfileStatus,
  resolveOperatorSubmissionStatus,
  resolveCancellation,
  isValidLocationSample,
} from "./ride-operations-policy";
import { calculatePrice } from "./luxuryPricingEngine";

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
  assert.equal(estimate.totalPrice, 180);
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

test("reconciles only an approved driver's stale operator profile", () => {
  assert.equal(reconcileDriverProfileStatus({ profileType: "driver", profileStatus: "pending", chauffeurApproved: true }), "approved");
  assert.equal(reconcileDriverProfileStatus({ profileType: "partner", profileStatus: "pending", chauffeurApproved: true }), "pending");
});

test("keeps approved operator profiles approved when profile details are resubmitted", () => {
  assert.equal(resolveOperatorSubmissionStatus({ existingStatus: "approved", requestedStatus: "pending" }), "approved");
  assert.equal(resolveOperatorSubmissionStatus({ existingStatus: "pending", requestedStatus: "pending" }), "pending");
  assert.equal(resolveOperatorSubmissionStatus({ existingStatus: "rejected", requestedStatus: "pending" }), "pending");
});

test("charges a rider but never a driver for an eligible cancellation", () => {
  assert.deepEqual(resolveCancellation({ actor: "driver", baseFareCents: 4500, minutesDrivingToPickup: 30, waitingFeeCents: 2000 }), { feeCents: 0, cashDebtCents: 0 });
  assert.deepEqual(resolveCancellation({ actor: "rider", baseFareCents: 4500, minutesDrivingToPickup: 3, waitingFeeCents: 0 }), { feeCents: 4500, cashDebtCents: 4500 });
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

test("accepts only finite latitude and longitude samples", () => {
  assert.equal(isValidLocationSample(-26.2041, 28.0473), true);
  assert.equal(isValidLocationSample(91, 28.0473), false);
});
