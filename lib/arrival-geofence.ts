export const ARRIVAL_RADIUS_M = 50;
export const ARRIVAL_EXIT_RADIUS_M = 90;
export const ARRIVAL_MAX_ACCURACY_M = 40;
export const ARRIVAL_MAX_SAMPLE_AGE_MS = 15_000;
export const ARRIVAL_REQUIRED_SAMPLES = 2;
export const ARRIVAL_MIN_SAMPLE_GAP_MS = 1_500;

export type ArrivalLocationSample = {
  lat: number;
  lng: number;
  accuracyM: number | null;
  timestamp: number;
};

export type ArrivalGeofenceState = {
  key: string | null;
  insideSamples: number;
  lastCountedSampleAt: number;
  dismissedInside: boolean;
  prompted: boolean;
};

export const EMPTY_ARRIVAL_GEOFENCE_STATE: ArrivalGeofenceState = {
  key: null,
  insideSamples: 0,
  lastCountedSampleAt: 0,
  dismissedInside: false,
  prompted: false,
};

export function distanceBetweenMeters(
  from: Pick<ArrivalLocationSample, "lat" | "lng">,
  to: { lat: number; lng: number },
) {
  const radiusM = 6_371_000;
  const dLat = ((to.lat - from.lat) * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const fromLat = (from.lat * Math.PI) / 180;
  const toLat = (to.lat * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(dLng / 2) ** 2;
  return radiusM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function evaluateArrivalGeofence(
  current: ArrivalGeofenceState,
  key: string,
  sample: ArrivalLocationSample,
  target: { lat: number; lng: number },
  now = Date.now(),
): { state: ArrivalGeofenceState; shouldPrompt: boolean } {
  let state = current.key === key
    ? current
    : { ...EMPTY_ARRIVAL_GEOFENCE_STATE, key };

  const sampleAgeMs = now - sample.timestamp;
  const hasUsableAccuracy =
    sample.accuracyM !== null &&
    Number.isFinite(sample.accuracyM) &&
    sample.accuracyM >= 0 &&
    sample.accuracyM <= ARRIVAL_MAX_ACCURACY_M;
  if (sampleAgeMs < 0 || sampleAgeMs > ARRIVAL_MAX_SAMPLE_AGE_MS || !hasUsableAccuracy) {
    return { state, shouldPrompt: false };
  }

  const distanceM = distanceBetweenMeters(sample, target);
  if (distanceM >= ARRIVAL_EXIT_RADIUS_M) {
    return {
      state: {
        ...state,
        insideSamples: 0,
        lastCountedSampleAt: 0,
        dismissedInside: false,
        prompted: false,
      },
      shouldPrompt: false,
    };
  }

  if (distanceM > ARRIVAL_RADIUS_M || state.dismissedInside || state.prompted) {
    return { state, shouldPrompt: false };
  }

  if (
    state.lastCountedSampleAt > 0 &&
    sample.timestamp - state.lastCountedSampleAt < ARRIVAL_MIN_SAMPLE_GAP_MS
  ) {
    return { state, shouldPrompt: false };
  }

  const insideSamples = state.insideSamples + 1;
  state = {
    ...state,
    insideSamples,
    lastCountedSampleAt: sample.timestamp,
    prompted: insideSamples >= ARRIVAL_REQUIRED_SAMPLES,
  };

  return { state, shouldPrompt: state.prompted };
}

export function dismissArrivalPrompt(
  state: ArrivalGeofenceState,
): ArrivalGeofenceState {
  return {
    ...state,
    dismissedInside: true,
    prompted: false,
  };
}
