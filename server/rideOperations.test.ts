import assert from "node:assert/strict";
import test from "node:test";
import { isVehicleEligibleForRide, normalizeVehicleType } from "./rideOperations";

test("normalizes every rider and fleet category label used by the apps", () => {
  assert.equal(normalizeVehicleType("A2B Lite"), "a2b_lite");
  assert.equal(normalizeVehicleType("Budget Car"), "budget");
  assert.equal(normalizeVehicleType("Luxury Car"), "luxury");
  assert.equal(normalizeVehicleType("Luxury Sedan"), "luxury");
  assert.equal(normalizeVehicleType("Business Class"), "business");
  assert.equal(normalizeVehicleType("VIP"), "business");
  assert.equal(normalizeVehicleType("Luxury VIP"), "business");
  assert.equal(normalizeVehicleType("V-Class"), "luxury_van");
});

test("matches exact categories and lets higher classes serve Lite requests", () => {
  for (const category of ["a2b_lite", "budget", "luxury", "business", "van", "luxury_van"]) {
    assert.equal(isVehicleEligibleForRide(category, category), true, category);
  }
  assert.equal(isVehicleEligibleForRide("a2b_lite", "budget"), true);
  assert.equal(isVehicleEligibleForRide("Luxury", "Luxury VIP"), true);
  assert.equal(isVehicleEligibleForRide("VIP", "Luxury VIP"), true);
  assert.equal(isVehicleEligibleForRide("budget", "a2b_lite"), false);
  assert.equal(isVehicleEligibleForRide("van", "budget"), false);
});
