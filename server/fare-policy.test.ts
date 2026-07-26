import assert from "node:assert/strict";
import test from "node:test";
import {
  getDriverNetFare,
  getPlatformCommission,
} from "../shared/fare-policy";

test("deducts 25% commission from the rider fare", () => {
  assert.equal(getDriverNetFare(100), 75);
  assert.equal(getPlatformCommission(100), 25);
});

test("driver earnings and commission always add back to the gross fare", () => {
  const grossFare = 123.45;
  assert.equal(
    getDriverNetFare(grossFare) + getPlatformCommission(grossFare),
    grossFare,
  );
});

test("rejects invalid and negative fare values", () => {
  assert.equal(getDriverNetFare(undefined), 0);
  assert.equal(getDriverNetFare(-100), 0);
  assert.equal(getPlatformCommission("not-a-number"), 0);
});
