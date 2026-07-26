import assert from "node:assert/strict";
import test from "node:test";

import { encodeStopsQuery, normalizeRideStops } from "../shared/ride-stops";
import {
  buildOsrmRouteUrl,
  combineDirectionSegments,
  parseOsrmRoutes,
} from "./multi-stop-routing";

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

test("builds ordered OSRM routes and converts route totals for fare pricing", () => {
  const url = buildOsrmRouteUrl(
    { lat: -26.1, lng: 28.1 },
    { lat: -26.3, lng: 28.3 },
    [{ lat: -26.2, lng: 28.2 }],
  );
  assert.match(url, /28\.1,-26\.1;28\.2,-26\.2;28\.3,-26\.3/);

  const [route] = parseOsrmRoutes({
    code: "Ok",
    routes: [{
      distance: 21500,
      duration: 1801,
      geometry: "encoded-route",
      legs: [{
        summary: "Main Road",
        steps: [{
          distance: 1500,
          duration: 121,
          name: "Main Road",
          maneuver: { type: "turn", modifier: "left", location: [28.2, -26.2] },
        }],
      }],
    }],
  });

  assert.equal(route.distanceKm, 21.5);
  assert.equal(route.durationMin, 31);
  assert.equal(route.polyline, "encoded-route");
  assert.match(route.steps[0].instruction, /Turn Left onto Main Road/);
});
