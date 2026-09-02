import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  ReactNode,
} from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import * as Linking from "expo-linking";
import { apiRequest, isUnauthorizedError, cleanErrorMessage } from "@/lib/query-client";

interface AuthUser {
  id: string;
  username: string;
  name: string;
  phone: string | null;
  email?: string | null;
  profilePhoto?: string | null;
  role: string;
  rating: number | null;
  walletBalance: number | null;
  rewardsBalance?: number | null;
  referralCode?: string | null;
  referredByUserId?: string | null;
  createdAt?: string | null;
  liftClubMembership?: {
    id?: string | null;
    status?: string | null;
    isApproved?: boolean;
  } | null;
}

type LoginResponse =
  | AuthUser
  | {
      user: AuthUser;
      accessToken?: string;
    };

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
  pendingReferralCode: string | null;
  login: (username: string, password: string, forceSwitchDevice?: boolean) => Promise<{ requiresDeviceTransferConfirmation?: boolean; message?: string } | void>;
  register: (data: {
    username: string;
    password: string;
    name: string;
    phone: string;
    referralCode?: string;
  }) => Promise<AuthUser>;
  logout: () => Promise<void>;
  setUser: (user: AuthUser | null) => void;
  setPendingReferralCode: (code: string | null) => Promise<void>;
  refreshUser: () => Promise<void>;
  clearSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function normalizeReferralCode(value?: string | null) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function extractReferralCodeFromUrl(rawUrl?: string | null) {
  if (!rawUrl) return "";

  try {
    const parsed = Linking.parse(rawUrl);
    const queryParams = parsed.queryParams || {};
    const fromQuery = normalizeReferralCode(
      String(
        queryParams.ref ||
        queryParams.referral ||
        queryParams.referralCode ||
        queryParams.code ||
        "",
      ),
    );
    if (fromQuery) return fromQuery;

    const path = String(parsed.path || "");
    const routeMatch = path.match(/(?:^|\/)r\/?([A-Za-z0-9_-]+)/i);
    if (routeMatch?.[1]) {
      return normalizeReferralCode(routeMatch[1]);
    }
  } catch {
    return "";
  }

  return "";
}

function extractReferralCodeFromInstallReferrer(rawReferrer?: string | null) {
  if (!rawReferrer) return "";
  try {
    const params = new URLSearchParams(rawReferrer);
    return normalizeReferralCode(
      params.get("ref") ||
      params.get("referral") ||
      params.get("referralCode") ||
      params.get("code") ||
      "",
    );
  } catch {
    return "";
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [pendingReferralCode, setPendingReferralCodeState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function clearLocalSession() {
    setUser(null);
    setAccessToken(null);
    await AsyncStorage.removeItem("a2b_user");
    await AsyncStorage.removeItem("a2b_chauffeur");
    await AsyncStorage.removeItem("a2b_last_mode");
    await AsyncStorage.removeItem("a2b_current_ride");
    await AsyncStorage.removeItem("a2b_token");
    await AsyncStorage.removeItem("a2b_needs_role_select");
    await AsyncStorage.removeItem("a2b_needs_operator_choice");
  }

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    let isActive = true;

    const maybeStoreReferral = async (candidate?: string | null) => {
      const normalized = normalizeReferralCode(candidate);
      if (!isActive || !normalized) return;
      if (user) return;
      await setPendingReferralCode(normalized);
    };

    Linking.getInitialURL()
      .then((url) => maybeStoreReferral(extractReferralCodeFromUrl(url)))
      .catch(() => {});

    const sub = Linking.addEventListener("url", ({ url }) => {
      void maybeStoreReferral(extractReferralCodeFromUrl(url));
    });

    if (Platform.OS === "android") {
      Application.getInstallReferrerAsync()
        .then((referrer) => maybeStoreReferral(extractReferralCodeFromInstallReferrer(referrer)))
        .catch(() => {});
    }

    return () => {
      isActive = false;
      sub.remove();
    };
  }, [setPendingReferralCode, user]);

  async function loadUser() {
    try {
      const stored = await AsyncStorage.getItem("a2b_user");
      const token = await AsyncStorage.getItem("a2b_token");
      const pendingReferral = await AsyncStorage.getItem("a2b_pending_referral");
      if (token) setAccessToken(token);
      if (stored) {
        setUser(JSON.parse(stored));
      }
      if (pendingReferral) {
        setPendingReferralCodeState(pendingReferral);
      }
    } catch (e) {
      console.error("Failed to load user:", e);
    } finally {
      setIsLoading(false);
    }
    // After the app is unblocked, silently refresh from server to pick up role/profile changes
    try {
      const token = await AsyncStorage.getItem("a2b_token");
      if (!token) return;
      const meRes = await apiRequest("GET", "/api/auth/me");
      if (meRes.ok) {
        const freshUser = await meRes.json();
        setUser(freshUser);
        await AsyncStorage.setItem("a2b_user", JSON.stringify(freshUser));
      }
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await clearLocalSession();
      }
    }
  }

  function normalizeAuthPayload(payload: LoginResponse): {
    user: AuthUser;
    accessToken: string | null;
  } {
    if ((payload as any)?.user) {
      return {
        user: (payload as any).user,
        accessToken: (payload as any).accessToken || null,
      };
    }
    return { user: payload as AuthUser, accessToken: null };
  }

  async function getOrCreateDeviceId(): Promise<string> {
    try {
      let deviceId = await AsyncStorage.getItem("a2b_device_id");
      if (!deviceId) {
        if (Platform.OS === "android" && typeof (Application as any).getAndroidId === "function") {
          try {
            deviceId = (Application as any).getAndroidId();
          } catch {}
        }
        if (!deviceId) {
          deviceId = "dev_" + Math.random().toString(36).substring(2, 15) + "_" + Date.now();
        }
        await AsyncStorage.setItem("a2b_device_id", deviceId);
      }
      return deviceId;
    } catch {
      return "dev_fallback_" + Date.now();
    }
  }

  async function login(username: string, password: string, forceSwitchDevice = false): Promise<{ requiresDeviceTransferConfirmation?: boolean; message?: string } | void> {
    const deviceId = await getOrCreateDeviceId();
    const appVariant = process.env.EXPO_PUBLIC_APP_VARIANT || (Platform.OS === "web" ? "web" : "driver");
    const res = await apiRequest("POST", "/api/auth/login", {
      username,
      password,
      deviceId,
      appVariant,
      forceSwitchDevice,
    });
    const payload = (await res.json()) as any;
    if (payload?.requiresDeviceTransferConfirmation) {
      return {
        requiresDeviceTransferConfirmation: true,
        message: payload.message || "This account is currently active on another device. Signing in here will log out the other device. Do you want to proceed?",
      };
    }
    if (!res.ok) {
      throw new Error(payload?.message || "Invalid credentials");
    }
    const normalized = normalizeAuthPayload(payload);
    setUser(normalized.user);
    setAccessToken(normalized.accessToken);
    await AsyncStorage.setItem("a2b_user", JSON.stringify(normalized.user));
    if (normalized.accessToken) {
      await AsyncStorage.setItem("a2b_token", normalized.accessToken);
    }
  }

  async function register(data: {
    username: string;
    password: string;
    name: string;
    phone: string;
    referralCode?: string;
  }): Promise<AuthUser> {
    const res = await apiRequest("POST", "/api/auth/register", data);
    const payload = (await res.json()) as LoginResponse;
    if (!res.ok) {
      throw new Error((payload as any).message || "Registration failed. Please try again.");
    }
    const normalized = normalizeAuthPayload(payload);
    setUser(normalized.user);
    setAccessToken(normalized.accessToken);
    await AsyncStorage.setItem("a2b_user", JSON.stringify(normalized.user));
    if (normalized.accessToken) {
      await AsyncStorage.setItem("a2b_token", normalized.accessToken);
    }
    return normalized.user;
  }

  async function logout() {
    try {
      await apiRequest("POST", "/api/auth/logout");
    } catch {}
    await clearLocalSession();
  }

  async function setPendingReferralCode(code: string | null) {
    const normalized = code?.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") || null;
    setPendingReferralCodeState(normalized);
    if (normalized) {
      await AsyncStorage.setItem("a2b_pending_referral", normalized);
    } else {
      await AsyncStorage.removeItem("a2b_pending_referral");
    }
  }

  async function refreshUser() {
    if (!user) return;
    try {
      // If JWT is configured, prefer /me; otherwise fall back to legacy /users/:id
      try {
        const me = await apiRequest("GET", `/api/auth/me`);
        const meData = (await me.json()) as AuthUser;
        setUser(meData);
        await AsyncStorage.setItem("a2b_user", JSON.stringify(meData));
        return;
      } catch (error) {
        if (isUnauthorizedError(error)) {
          await clearLocalSession();
          return;
        }
        // ignore and fall back
      }

      const res = await apiRequest("GET", `/api/users/${user.id}`);
      const userData = (await res.json()) as AuthUser;
      setUser(userData);
      await AsyncStorage.setItem("a2b_user", JSON.stringify(userData));
    } catch (e) {
      console.error("Failed to refresh user:", e);
    }
  }

  const value = useMemo(
    () => ({
      user,
      accessToken,
      isLoading,
      pendingReferralCode,
      login,
      register,
      logout,
      setUser,
      setPendingReferralCode,
      refreshUser,
      clearSession: clearLocalSession,
    }),
    [user, accessToken, isLoading, pendingReferralCode],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
