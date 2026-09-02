import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, Pressable, TextInput,
  ActivityIndicator, Platform, Image,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@mobile-core/auth";
import { getAppVariant } from "@mobile-core/app-variant";
import { apiRequest } from "@mobile-core/query";
import { Colors } from "@mobile-ui/colors";
import { KeyboardAwareScrollViewCompat } from "@mobile-ui/scroll";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_OAUTH_START = "https://a2blift.com/api/auth/google/start";
const APP_VARIANT = getAppVariant();
type ClientLoginMode = "client" | "lift_club";

function isAuthCallback(url: string) {
  return Linking.parse(url).path === "auth";
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { login, setUser, pendingReferralCode } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [clientLoginMode, setClientLoginMode] = useState<ClientLoginMode>("client");
  const showClientModeChoice = APP_VARIANT === "client";

  // Clear error whenever screen comes into focus (e.g. after logout)
  useFocusEffect(useCallback(() => { setError(""); setResetMessage(""); }, []));

  // Handle the deep link callback from the backend OAuth flow
  useEffect(() => {
    const sub = Linking.addEventListener("url", ({ url }) => {
      if (!isAuthCallback(url)) return;
      handleDeepLinkCallback(url);
    });
    return () => sub.remove();
  }, []);

  async function handleDeepLinkCallback(url: string) {
    try {
      const parsed = new URL(url);
      const err = parsed.searchParams.get("error");
      if (err) { setError("Google sign in failed. Please try again."); setGoogleLoading(false); return; }
      const payloadStr = parsed.searchParams.get("payload");
      if (!payloadStr) { setGoogleLoading(false); return; }
      const payload = JSON.parse(decodeURIComponent(payloadStr));
      await AsyncStorage.setItem("a2b_last_mode", showClientModeChoice ? clientLoginMode : APP_VARIANT === "driver" ? "chauffeur" : "client");
      await AsyncStorage.setItem("a2b_user", JSON.stringify(payload.user));
      if (payload.accessToken) await AsyncStorage.setItem("a2b_token", payload.accessToken);
      // Fetch the latest user profile from the server so the role is always current
      try {
        const meRes = await apiRequest("GET", "/api/auth/me");
        if (meRes.ok) {
          const freshUser = await meRes.json();
          await AsyncStorage.setItem("a2b_user", JSON.stringify(freshUser));
          setUser(freshUser);
          return;
        }
      } catch {}
      setUser(payload.user);
      // AuthGate handles navigation when user state changes
    } catch {
      setError("Google sign in failed. Please try again.");
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleLogin() {
    if (!username.trim() || !password.trim()) { setError("Please fill in all fields"); return; }
    setLoading(true); setError(""); setResetMessage("");
    try {
      await AsyncStorage.setItem("a2b_last_mode", showClientModeChoice ? clientLoginMode : APP_VARIANT === "driver" ? "chauffeur" : "client");
      const result = await login(username.trim(), password);
      if (result?.requiresDeviceTransferConfirmation) {
        setLoading(false);
        Alert.alert(
          "Active Session Detected",
          result.message || "This account is currently active on another device. Signing in here will log out the other device. Do you want to proceed?",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Sign In & Switch Device",
              style: "destructive",
              onPress: async () => {
                setLoading(true);
                setError("");
                try {
                  await login(username.trim(), password, true);
                } catch (err: any) {
                  setError(err?.message || "Login failed. Please try again.");
                } finally {
                  setLoading(false);
                }
              },
            },
          ]
        );
        return;
      }
      // AuthGate handles navigation when user state changes
    } catch (e: any) {
      const raw = (e?.message || "").toLowerCase();
      if (raw.includes("invalid") || raw.includes("wrong") || raw.includes("incorrect") || raw.includes("password") || raw.includes("credentials") || raw.includes("not found") || raw.includes("username")) {
        setError("Incorrect email or password. Please check and try again.");
      } else if (raw.includes("fetch") || raw.includes("network") || raw.includes("connect") || raw.includes("timeout")) {
        setError("Unable to connect. Please check your internet connection.");
      } else if (raw.includes("too many") || raw.includes("rate")) {
        setError("Too many attempts. Please wait a moment and try again.");
      } else if (raw.includes("suspended") || raw.includes("banned") || raw.includes("blocked")) {
        setError("Your account has been suspended. Please contact support.");
      } else {
        setError(e.message || "Login failed. Please try again.");
      }
    } finally { setLoading(false); }
  }

  async function handlePasswordResetRequest() {
    const email = username.trim().toLowerCase();
    if (!email) {
      setError("Enter your email address first, then tap Forgot password.");
      return;
    }
    setError("");
    setResetMessage("");
    setResetLoading(true);
    try {
      const response = await apiRequest("POST", "/api/auth/forgot-password", { email });
      const result = await response.json();
      setResetMessage(result.message || "Check your email for a password reset link.");
    } catch {
      setError("Unable to request a password reset. Please try again.");
    } finally {
      setResetLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    setError("");
    try {
      const redirectUrl = Linking.createURL("auth");
      const authUrl = `${GOOGLE_OAUTH_START}?redirect_uri=${encodeURIComponent(redirectUrl)}`;
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl, {
        preferEphemeralSession: true,
      });
      // On web, the redirect URL comes back in result.url instead of a deep link event
      if (result.type === "success" && result.url) {
        await handleDeepLinkCallback(result.url);
      }
    } catch {
      setError("Google sign in failed. Please try again.");
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20) }]}>
      <Pressable style={styles.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace("/")}>
        <Ionicons name="chevron-back" size={24} color={Colors.white} />
      </Pressable>

      <KeyboardAwareScrollViewCompat
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 16) }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>
            {showClientModeChoice
              ? "Choose how you want to continue, then sign in."
              : APP_VARIANT === "driver"
                ? "Sign in to your A2B LIFT DRIVER account"
                : "Sign in to your A2B LIFT account"}
          </Text>
        </View>

        {showClientModeChoice && (
          <View style={styles.modeCard}>
            <Pressable
              style={[styles.modeOption, clientLoginMode === "client" && styles.modeOptionActive]}
              onPress={() => setClientLoginMode("client")}
            >
              <Ionicons name="car-sport-outline" size={20} color={clientLoginMode === "client" ? Colors.primary : Colors.white} />
              <View style={styles.modeCopy}>
                <Text style={[styles.modeTitle, clientLoginMode === "client" && styles.modeTitleActive]}>Continue as Client</Text>
                <Text style={styles.modeText}>Book normal A2B rides from your current dashboard.</Text>
              </View>
            </Pressable>
            <Pressable
              style={[styles.modeOption, clientLoginMode === "lift_club" && styles.modeOptionActive]}
              onPress={() => setClientLoginMode("lift_club")}
            >
              <Ionicons name="ribbon-outline" size={20} color={clientLoginMode === "lift_club" ? "#2A1D00" : "#F7C948"} />
              <View style={styles.modeCopy}>
                <Text style={[styles.modeTitle, clientLoginMode === "lift_club" && styles.modeTitleActive]}>Join Lift Club</Text>
                <Text style={styles.modeText}>Apply for weekday Lift Club membership and upload R200 proof.</Text>
              </View>
            </Pressable>
          </View>
        )}

        {!!pendingReferralCode && (
          <View style={styles.referralNotice}>
            <Ionicons name="gift-outline" size={18} color={Colors.white} />
            <View style={styles.referralNoticeCopy}>
              <Text style={styles.referralNoticeTitle}>Reward code saved</Text>
              <Text style={styles.referralNoticeText}>
                Code {pendingReferralCode} will be applied when you create your account.
              </Text>
            </View>
          </View>
        )}

        <View style={styles.form}>
          {!!error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={Colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
          {!!resetMessage && (
            <View style={styles.successBox}>
              <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
              <Text style={styles.successText}>{resetMessage}</Text>
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={18} color={Colors.textMuted} />
              <TextInput style={styles.input} placeholder="Enter your email address" placeholderTextColor={Colors.textMuted}
                value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false}
                keyboardType="email-address" textContentType="emailAddress" />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.passwordLabelRow}>
              <Text style={styles.label}>Password</Text>
              <Pressable onPress={handlePasswordResetRequest} disabled={resetLoading} hitSlop={8}>
                <Text style={[styles.forgotLink, resetLoading && styles.forgotLinkDisabled]}>
                  {resetLoading ? "Sending..." : "Forgot password?"}
                </Text>
              </Pressable>
            </View>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={18} color={Colors.textMuted} />
              <TextInput style={styles.input} placeholder="Enter password" placeholderTextColor={Colors.textMuted}
                value={password} onChangeText={setPassword} secureTextEntry={!showPassword} />
              <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={8}>
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} color={Colors.textMuted} />
              </Pressable>
            </View>
          </View>

          <Pressable style={({ pressed }) => [styles.loginBtn, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }, loading && { opacity: 0.7 }]}
            onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color={Colors.primary} /> : <Text style={styles.loginBtnText}>Sign In</Text>}
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account?</Text>
          <Pressable onPress={() => router.replace({ pathname: "/register", params: pendingReferralCode ? { ref: pendingReferralCode } : {} })}> 
            <Text style={styles.footerLink}>Create Account</Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary, paddingHorizontal: 24 },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: "space-between" },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginLeft: -8 },
  header: { marginTop: 20, marginBottom: 36 },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", color: Colors.white, marginBottom: 8 },
  subtitle: { fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  referralNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
  },
  referralNoticeCopy: { flex: 1, gap: 4 },
  referralNoticeTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.white },
  referralNoticeText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, lineHeight: 19 },
  form: { gap: 16 },
  modeCard: {
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 18,
    padding: 10,
    marginBottom: 18,
  },
  modeOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  modeOptionActive: { backgroundColor: Colors.white, borderColor: Colors.white },
  modeCopy: { flex: 1, gap: 3 },
  modeTitle: { fontSize: 14, fontFamily: "Inter_700Bold", color: Colors.white },
  modeTitleActive: { color: Colors.primary },
  modeText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted, lineHeight: 17 },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255,77,77,0.1)", padding: 12, borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,77,77,0.2)" },
  errorText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.error },
  successBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(76,175,80,0.1)", padding: 12, borderRadius: 10, borderWidth: 1, borderColor: "rgba(76,175,80,0.22)" },
  successText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.success, lineHeight: 18 },
  inputGroup: { gap: 8 },
  passwordLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  label: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 1 },
  forgotLink: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.white },
  forgotLinkDisabled: { opacity: 0.6 },
  inputWrapper: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.card, borderRadius: 12, paddingHorizontal: 16, gap: 12, borderWidth: 1, borderColor: Colors.border },
  input: { flex: 1, paddingVertical: 15, fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.white },
  loginBtn: { backgroundColor: Colors.white, paddingVertical: 15, borderRadius: 14, alignItems: "center", marginTop: 4 },
  loginBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.primary },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 2 },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  googleBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: "#ffffff", paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: "#e0e0e0" },
  googleBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#1a1a1a" },
  googleIconWrap: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e0e0e0", alignItems: "center", justifyContent: "center" },
  googleG: { fontSize: 13, fontWeight: "700", color: "#4285F4" },
  footer: { flexDirection: "row", alignItems: "flex-end", gap: 4, paddingTop: 24 },
  footerText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  footerLink: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.white },
});
