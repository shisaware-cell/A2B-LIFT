import assert from "node:assert/strict";
import test from "node:test";
import {
  dismissArrivalPrompt,
  EMPTY_ARRIVAL_GEOFENCE_STATE,
  evaluateArrivalGeofence,
} from "../lib/arrival-geofence";

const target = { lat: -26.2041, lng: 28.0473 };

function sample(
  timestamp: number,
  offsetLat = 0.0001,
  accuracyM: number | null = 10,
) {
  return {
    lat: target.lat + offsetLat,
    lng: target.lng,
    accuracyM,
    timestamp,
  };
}

test("arrival requires two fresh accurate live samples", () => {
  const now = 100_000;
  const first = evaluateArrivalGeofence(
    { ...EMPTY_ARRIVAL_GEOFENCE_STATE },
    "ride-1:pickup",
    sample(now - 2_000),
    target,
    now,
  );
  assert.equal(first.shouldPrompt, false);

  const second = evaluateArrivalGeofence(
    first.state,
    "ride-1:pickup",
    sample(now),
    target,
    now,
  );
  assert.equal(second.shouldPrompt, true);
});

test("arrival ignores stale and inaccurate samples", () => {
  const now = 100_000;
  const stale = evaluateArrivalGeofence(
    { ...EMPTY_ARRIVAL_GEOFENCE_STATE },
    "ride-1:pickup",
    sample(now - 20_000),
    target,
    now,
  );
  assert.equal(stale.state.insideSamples, 0);

  const inaccurate = evaluateArrivalGeofence(
    stale.state,
    "ride-1:pickup",
    sample(now, 0.0001, 75),
    target,
    now,
  );
  assert.equal(inaccurate.shouldPrompt, false);
  assert.equal(inaccurate.state.insideSamples, 0);
});

test("dismissed prompt stays quiet until the driver exits and re-enters", () => {
  const now = 100_000;
  const first = evaluateArrivalGeofence(
    { ...EMPTY_ARRIVAL_GEOFENCE_STATE },
    "ride-1:pickup",
    sample(now - 2_000),
    target,
    now,
  );
  const prompted = evaluateArrivalGeofence(
    first.state,
    "ride-1:pickup",
    sample(now),
    target,
    now,
  );
  const dismissed = dismissArrivalPrompt(prompted.state);
  const stillInside = evaluateArrivalGeofence(
    dismissed,
    "ride-1:pickup",
    sample(now + 2_000),
    target,
    now + 2_000,
  );
  assert.equal(stillInside.shouldPrompt, false);

  const outside = evaluateArrivalGeofence(
    stillInside.state,
    "ride-1:pickup",
    sample(now + 4_000, 0.001),
    target,
    now + 4_000,
  );
  assert.equal(outside.state.dismissedInside, false);

  const reenteredOnce = evaluateArrivalGeofence(
    outside.state,
    "ride-1:pickup",
    sample(now + 6_000),
    target,
    now + 6_000,
  );
  const reenteredTwice = evaluateArrivalGeofence(
    reenteredOnce.state,
    "ride-1:pickup",
    sample(now + 8_000),
    target,
    now + 8_000,
  );
  assert.equal(reenteredTwice.shouldPrompt, true);
});
