import assert from "node:assert/strict";
import test from "node:test";

import { encodeStopsQuery, normalizeRideStops } from "../shared/ride-stops";
import { combineDirectionSegments } from "./multi-stop-routing";

test("preserves every valid stop in rider-selected order", () => {
  const stops = normalizeRideStops([
    { id: "first", address: "First stop", lat: -26.1, lng: 28.1 },
    { id: "second", address: "Second stop", lat: -26.2, lng: 28.2 },
  ]);
  assert.deepEqual(stops.map((stop) => stop.id), ["first", "second"]);
  assert.equal(encodeStopsQuery(stops), "-26.1,28.1|-26.2,28.2");
});

test("drops invalid stops instead of allowing unpriced route points", () => {
  assert.equal(normalizeRideStops([
    { address: "Invalid", lat: 200, lng: 28 },
    { address: "Valid", lat: -26, lng: 28 },
  ]).length, 1);
});

test("adds every route segment to the distance and duration used for pricing", () => {
  const route = combineDirectionSegments([
    { polyline: "_p~iF~ps|U_ulLnnqC", distanceKm: 12.4, durationMin: 18, steps: [{ instruction: "First" }] },
    { polyline: "_ulLnnqC_mqNvxq`@", distanceKm: 8.6, durationMin: 12, steps: [{ instruction: "Second" }] },
  ]);

  assert.equal(route.distanceKm, 21);
  assert.equal(route.durationMin, 30);
  assert.equal(route.distanceText, "21 km");
  assert.equal(route.durationText, "30 min");
  assert.deepEqual(route.steps.map((step) => step.instruction), ["First", "Second"]);
  assert.ok(route.polyline.length > 0);
});
