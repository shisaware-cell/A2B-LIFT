import { Platform } from "react-native";
import * as Location from "expo-location";

export const RIDE_MATCH_RADIUS_KM = 4;
export const LOCATION_STALE_WINDOW_MS = 10 * 60 * 1000;
export const LOCATION_DISTANCE_INTERVAL_M = 2;
export const LOCATION_TIME_INTERVAL_MS = 1000;

export const HIGH_ACCURACY =
  Platform.select({
    ios: Location.Accuracy.BestForNavigation,
    android: Location.Accuracy.Highest,
    default: Location.Accuracy.High,
  }) ?? Location.Accuracy.High;

export function toLatLng(location: Pick<Location.LocationObject, "coords">) {
  const coords = location.coords;
  return {
    lat: coords.latitude,
    lng: coords.longitude,
    heading: typeof coords.heading === "number" && Number.isFinite(coords.heading) && coords.heading >= 0
      ? coords.heading
      : undefined,
    speed: typeof coords.speed === "number" && Number.isFinite(coords.speed) && coords.speed >= 0
      ? coords.speed
      : undefined,
  };
}

export function isRecentLocation(updatedAt?: string | Date | null, maxAgeMs = LOCATION_STALE_WINDOW_MS) {
  if (!updatedAt) return true;
  const timestamp = new Date(updatedAt).getTime();
  if (!Number.isFinite(timestamp)) return true;
  return Date.now() - timestamp <= maxAgeMs;
}

export async function enablePreciseLocationIfAvailable() {
  if (Platform.OS !== "android") return;
  try {
    await Location.enableNetworkProviderAsync();
  } catch {
    // ignore when the provider is already enabled or unavailable
  }
}

function withLocationTimeout<T>(
  promise: Promise<T>,
  ms: number,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Location timeout")), ms),
    ),
  ]);
}

export async function getBestAvailablePosition() {
  await enablePreciseLocationIfAvailable();

  try {
    return await withLocationTimeout(
      Location.getCurrentPositionAsync({
        accuracy: HIGH_ACCURACY,
        mayShowUserSettingsDialog: true,
      }),
      8000,
    );
  } catch {
    try {
      const lastKnown = await Location.getLastKnownPositionAsync({
        maxAge: LOCATION_STALE_WINDOW_MS,
      });
      if (lastKnown) return lastKnown;
    } catch {
      // ignore and fall through to a simpler retry
    }

    return withLocationTimeout(
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        mayShowUserSettingsDialog: true,
      }),
      8000,
    );
  }
}

export async function watchBestPosition(
  callback: (location: Location.LocationObject) => void,
) {
  await enablePreciseLocationIfAvailable();

  return Location.watchPositionAsync(
    {
      accuracy: HIGH_ACCURACY,
      distanceInterval: LOCATION_DISTANCE_INTERVAL_M,
      timeInterval: LOCATION_TIME_INTERVAL_MS,
      mayShowUserSettingsDialog: true,
    },
    callback,
  );
}