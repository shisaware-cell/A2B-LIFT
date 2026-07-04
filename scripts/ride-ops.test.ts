import assert from "node:assert/strict";

import {
  calculateCancellationFee,
  calculatePerMinuteAdjustment,
  calculatePrice,
  calculateSurgeMultiplier,
} from "../server/luxuryPricingEngine";
import {
  isRideOfferActive,
  isVehicleEligibleForRide,
  RIDE_OFFER_WINDOW_MS,
} from "../server/rideOperations";

const baseBudgetFare = 50;

{
  const surge = calculateSurgeMultiplier({ activeRequests: 8, eligibleDrivers: 2 });
  assert.equal(surge.multiplier, 4);
  assert.equal(surge.highDemand, true);

  const capped = calculateSurgeMultiplier({ activeRequests: 30, eligibleDrivers: 2 });
  assert.equal(capped.multiplier, 5);
  assert.equal(capped.highDemand, true);

  const normal = calculateSurgeMultiplier({ activeRequests: 2, eligibleDrivers: 5 });
  assert.equal(normal.multiplier, 1);
  assert.equal(normal.highDemand, false);
}

{
  const estimate = calculatePrice(10, "budget", {
    surgeMultiplier: 2.5,
    surgeReason: "High demand",
  });

  assert.equal(estimate.surgeMultiplier, 2.5);
  assert.equal(estimate.highDemand, true);
  assert.equal(estimate.baseFare, baseBudgetFare);
  assert.equal(estimate.totalPrice, 300);
}

{
  const noExtra = calculatePerMinuteAdjustment(35, 35);
  assert.equal(noExtra.extraMinutes, 0);
  assert.equal(noExtra.adjustmentAmount, 0);

  const extra = calculatePerMinuteAdjustment(35, 42.2);
  assert.equal(extra.extraMinutes, 8);
  assert.equal(extra.adjustmentAmount, 8);
}

{
  const acceptedAt = new Date("2026-07-04T10:00:00.000Z");
  assert.equal(
    calculateCancellationFee("budget", acceptedAt, new Date("2026-07-04T10:02:59.000Z"), "client").fee,
    0,
  );
  assert.equal(
    calculateCancellationFee("budget", acceptedAt, new Date("2026-07-04T10:03:00.000Z"), "client").fee,
    baseBudgetFare,
  );
  assert.equal(
    calculateCancellationFee("budget", acceptedAt, new Date("2026-07-04T10:10:00.000Z"), "driver").fee,
    0,
  );
}

{
  assert.equal(isVehicleEligibleForRide("budget", "budget"), true);
  assert.equal(isVehicleEligibleForRide("budget", "luxury_van"), false);
  assert.equal(isVehicleEligibleForRide("luxury_van", "luxury_van"), true);
  assert.equal(isVehicleEligibleForRide("luxury_van", "van"), false);
}

{
  const offeredAt = new Date("2026-07-04T11:00:00.000Z");
  const expiresAt = new Date(offeredAt.getTime() + RIDE_OFFER_WINDOW_MS);

  assert.equal(
    isRideOfferActive(
      { currentOfferedChauffeurId: "chauffeur-1", currentOfferExpiresAt: expiresAt },
      "chauffeur-1",
      new Date(expiresAt.getTime() - 1),
    ),
    true,
  );
  assert.equal(
    isRideOfferActive(
      { currentOfferedChauffeurId: "chauffeur-1", currentOfferExpiresAt: expiresAt },
      "chauffeur-1",
      expiresAt,
    ),
    false,
  );
  assert.equal(
    isRideOfferActive(
      { currentOfferedChauffeurId: "chauffeur-1", currentOfferExpiresAt: expiresAt },
      "chauffeur-2",
      new Date(expiresAt.getTime() - 1),
    ),
    false,
  );
}

console.log("ride operations tests passed");
