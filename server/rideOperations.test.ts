import assert from "node:assert/strict";
import test from "node:test";
import {
  getVehicleDispatchPriority,
  isVehicleEligibleForRide,
  normalizeVehicleType,
  resolveVehicleDispatchCategory,
} from "./rideOperations";

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

test("matches exact categories and only cross-matches Lite with Budget", () => {
  for (const category of ["a2b_lite", "budget", "luxury", "business", "van", "luxury_van"]) {
    assert.equal(isVehicleEligibleForRide(category, category), true, category);
  }
  assert.equal(isVehicleEligibleForRide("a2b_lite", "budget"), true);
  assert.equal(isVehicleEligibleForRide("budget", "a2b_lite"), true);
  assert.equal(isVehicleEligibleForRide("VIP", "Luxury VIP"), true);
  assert.equal(isVehicleEligibleForRide("budget", "luxury"), false);
  assert.equal(isVehicleEligibleForRide("a2b_lite", "business"), false);
  assert.equal(isVehicleEligibleForRide("luxury", "business"), false);
  assert.equal(isVehicleEligibleForRide("van", "luxury_van"), false);
  assert.equal(isVehicleEligibleForRide("van", "budget"), false);
});

test("normalizes legacy premium fleet values before dispatch", () => {
  assert.equal(normalizeVehicleType("Premium"), "luxury");
  assert.equal(normalizeVehicleType("Executive"), "business");
  assert.equal(normalizeVehicleType("XL"), "van");
  assert.equal(isVehicleEligibleForRide("Luxury", "Premium"), true);
  assert.equal(isVehicleEligibleForRide("VIP", "Executive"), true);
});

test("keeps VIP sedans and V-Class vans strictly separated without cross-dispatch", () => {
  assert.equal(isVehicleEligibleForRide("VIP", "VIP"), true);
  assert.equal(isVehicleEligibleForRide("VIP", "Executive"), true);
  assert.equal(isVehicleEligibleForRide("VIP", "V-Class"), false);
  assert.equal(isVehicleEligibleForRide("V-Class", "VIP"), false);
  assert.equal(getVehicleDispatchPriority("VIP", "VIP"), 0);
  assert.equal(getVehicleDispatchPriority("VIP", "V-Class"), null);
});

test("reconciles production fleet models whose stored category is stale", () => {
  assert.equal(resolveVehicleDispatchCategory({ carMake: "BMW", vehicleModel: "3 Series", vehicleType: "budget" }), "luxury");
  assert.equal(resolveVehicleDispatchCategory({ carMake: "Mercedes-Benz", vehicleModel: "S Class", vehicleType: "budget" }), "business");
  assert.equal(resolveVehicleDispatchCategory({ carMake: "Mercedes", vehicleModel: "V CLASS", vehicleType: "business" }), "luxury_van");
  assert.equal(resolveVehicleDispatchCategory({ carMake: "Hyundai", vehicleModel: "H1", vehicleType: "budget" }), "van");
  assert.equal(resolveVehicleDispatchCategory({ carMake: "Hyundai", vehicleModel: "i10", vehicleType: "budget" }), "a2b_lite");
  assert.equal(resolveVehicleDispatchCategory({ carMake: "Toyota", vehicleModel: "Corolla", vehicleType: "budget" }), "budget");
});
