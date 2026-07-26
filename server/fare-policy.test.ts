import assert from "node:assert/strict";
import test from "node:test";
import {
  PLATFORM_COMMISSION_RATE,
  REFERRAL_REWARD_RATE,
  VEHICLE_CATEGORY_PRICING,
  getDriverDisplayFare,
  getDriverNetFare,
  getPlatformCommission,
} from "../shared/fare-policy";

test("deducts 30% commission from the rider fare", () => {
  assert.equal(getDriverNetFare(100), 70);
  assert.equal(getPlatformCommission(100), 30);
});

test("driver earnings and commission always add back to the gross fare", () => {
  const grossFare = 123.45;
  assert.equal(
    getDriverNetFare(grossFare) + getPlatformCommission(grossFare),
    grossFare,
  );
});

test("preserves the commission locked on an existing ride", () => {
  assert.equal(getDriverNetFare(100, 0.25), 75);
  assert.equal(getPlatformCommission(100, 0.25), 25);
});

test("shows cash fare in full and deducts commission from digital payment displays", () => {
  assert.equal(getDriverDisplayFare(100, "cash"), 100);
  assert.equal(getDriverDisplayFare(100, undefined), 100);
  assert.equal(getDriverDisplayFare(100, "card"), 70);
  assert.equal(getDriverDisplayFare(100, "wallet"), 70);
  assert.equal(getDriverDisplayFare(100, "card", 0.25), 75);
});

test("rejects invalid and negative fare values", () => {
  assert.equal(getDriverNetFare(undefined), 0);
  assert.equal(getDriverNetFare(-100), 0);
  assert.equal(getPlatformCommission("not-a-number"), 0);
});

test("uses the requested kilometre rates for rider categories", () => {
  assert.equal(VEHICLE_CATEGORY_PRICING.budget.pricePerKm, 8.5);
  assert.equal(VEHICLE_CATEGORY_PRICING.luxury.pricePerKm, 14.5);
  assert.equal(VEHICLE_CATEGORY_PRICING.van.pricePerKm, 15);
});

test("keeps referral rewards independent from platform commission", () => {
  assert.equal(REFERRAL_REWARD_RATE, 0.025);
  assert.equal(PLATFORM_COMMISSION_RATE, 0.3);
});
