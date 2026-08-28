import AsyncStorage from "@react-native-async-storage/async-storage";

export type NavigationAppType = "a2b" | "google" | "waze" | "apple";

export interface NavigationPreferences {
  navigationApp: NavigationAppType;
  autoNavigate: boolean;
  navigationVoice: boolean;
}

const STORAGE_KEY_NAV_APP = "a2b_navigation_app_preference";
const STORAGE_KEY_AUTO_NAV = "a2b_auto_navigate_preference";
const STORAGE_KEY_NAV_VOICE = "a2b_navigation_voice_enabled";

const listeners = new Set<(prefs: NavigationPreferences) => void>();

let cachedPreferences: NavigationPreferences = {
  navigationApp: "a2b",
  autoNavigate: true,
  navigationVoice: true,
};

let isInitialized = false;

async function initCache(): Promise<NavigationPreferences> {
  if (isInitialized) return cachedPreferences;
  try {
    const [storedApp, storedAutoNav, storedVoice] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEY_NAV_APP),
      AsyncStorage.getItem(STORAGE_KEY_AUTO_NAV),
      AsyncStorage.getItem(STORAGE_KEY_NAV_VOICE),
    ]);

    cachedPreferences = {
      navigationApp: (storedApp as NavigationAppType) || "a2b",
      autoNavigate: storedAutoNav !== null ? storedAutoNav === "true" : true,
      navigationVoice: storedVoice !== null ? storedVoice === "true" : true,
    };
    isInitialized = true;
  } catch {
    // fallback to defaults
  }
  return cachedPreferences;
}

export async function getNavigationPreferences(): Promise<NavigationPreferences> {
  return await initCache();
}

export async function setNavigationApp(app: NavigationAppType): Promise<void> {
  await initCache();
  cachedPreferences = { ...cachedPreferences, navigationApp: app };
  try {
    await AsyncStorage.setItem(STORAGE_KEY_NAV_APP, app);
  } catch {}
  notifyListeners();
}

export async function setAutoNavigate(enabled: boolean): Promise<void> {
  await initCache();
  cachedPreferences = { ...cachedPreferences, autoNavigate: enabled };
  try {
    await AsyncStorage.setItem(STORAGE_KEY_AUTO_NAV, enabled ? "true" : "false");
  } catch {}
  notifyListeners();
}

export async function setNavigationVoice(enabled: boolean): Promise<void> {
  await initCache();
  cachedPreferences = { ...cachedPreferences, navigationVoice: enabled };
  try {
    await AsyncStorage.setItem(STORAGE_KEY_NAV_VOICE, enabled ? "true" : "false");
  } catch {}
  notifyListeners();
}

export function subscribeNavigationPreferences(
  listener: (prefs: NavigationPreferences) => void
): () => void {
  listeners.add(listener);
  // Send current cached value immediately
  listener(cachedPreferences);
  // Ensure cache is populated
  initCache().then((prefs) => listener(prefs));
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners() {
  for (const listener of listeners) {
    try {
      listener(cachedPreferences);
    } catch {}
  }
}
