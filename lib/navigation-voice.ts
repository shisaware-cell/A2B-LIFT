import AsyncStorage from "@react-native-async-storage/async-storage";

export const NAVIGATION_VOICE_ENABLED_KEY = "a2b_driver_navigation_voice_enabled";

const listeners = new Set<(enabled: boolean) => void>();

export async function getNavigationVoiceEnabled() {
  return (await AsyncStorage.getItem(NAVIGATION_VOICE_ENABLED_KEY)) !== "false";
}

export async function setNavigationVoiceEnabled(enabled: boolean) {
  await AsyncStorage.setItem(NAVIGATION_VOICE_ENABLED_KEY, enabled ? "true" : "false");
  listeners.forEach((listener) => listener(enabled));
}

export function subscribeNavigationVoiceEnabled(listener: (enabled: boolean) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
