import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";

type DriverOverlayNativeModule = {
  hasPermission(): Promise<boolean>;
  requestPermission(): Promise<boolean>;
  start(eventCount: number): Promise<boolean>;
  stop(): Promise<boolean>;
  setEventCount(eventCount: number): Promise<boolean>;
  setOverlayState?(eventCount: number, tripActive: boolean, tripLabel: string): Promise<boolean>;
};

const nativeModule = Platform.OS === "android"
  ? requireOptionalNativeModule<DriverOverlayNativeModule>("DriverOverlay")
  : null;

export const DRIVER_OVERLAY_ENABLED_KEY = "a2b_driver_overlay_enabled";

export function isDriverOverlayAvailable() {
  return Platform.OS === "android" && nativeModule !== null;
}

export async function hasDriverOverlayPermission() {
  return nativeModule ? nativeModule.hasPermission() : false;
}

export async function requestDriverOverlayPermission() {
  return nativeModule ? nativeModule.requestPermission() : false;
}

export async function startDriverOverlay(eventCount = 0, tripActive = false, tripLabel = "") {
  if (!nativeModule) return false;
  const started = await nativeModule.start(Math.max(0, eventCount));
  if (started && (tripActive || tripLabel)) {
    await updateDriverOverlayState({ eventCount, tripActive, tripLabel });
  }
  return started;
}

export async function stopDriverOverlay() {
  return nativeModule ? nativeModule.stop() : false;
}

export async function setDriverOverlayEventCount(eventCount: number) {
  return nativeModule ? nativeModule.setEventCount(Math.max(0, eventCount)) : false;
}

export async function updateDriverOverlayState({
  eventCount = 0,
  tripActive = false,
  tripLabel = "",
}: {
  eventCount?: number;
  tripActive?: boolean;
  tripLabel?: string;
}) {
  if (!nativeModule) return false;
  if (typeof nativeModule.setOverlayState === "function") {
    return nativeModule.setOverlayState(Math.max(0, eventCount), tripActive, tripLabel);
  }
  return nativeModule.setEventCount(Math.max(0, eventCount));
}
