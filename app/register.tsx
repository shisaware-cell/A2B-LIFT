import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator, Platform, ScrollView, Image } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { getAppVariant, getAuthenticatedHomeRoute, usesRoleSelect } from "@mobile-core/app-variant";
import { useAuth } from "@mobile-core/auth";
import { apiRequest } from "@mobile-core/query";
import { Colors } from "@mobile-ui/colors";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_OAUTH_START = "https://a2blift.com/api/auth/google/start";
const NEEDS_ROLE_SELECT_KEY = "a2b_needs_role_select";
const NEEDS_OPERATOR_CHOICE_KEY = "a2b_needs_operator_choice";

function isAuthCallback(url: string) {
  return Linking.parse(url).path === "auth";
}

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ ref?: string }>();
  const { register, setUser, pendingReferralCode, setPendingReferralCode } = useAuth();
  const appVariant = getAppVariant();
  const shouldShowRoleSelect = usesRoleSelect(appVariant);
  const postRegistrationRoute = appVariant === "driver" ? "/chauffeur-onboarding" : getAuthenticatedHomeRoute(appVariant);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const fromParam =
      typeof params.ref === "string"
        ? params.ref.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
        : "";

    if (fromParam) {
      setReferralCode(fromParam);
      setPendingReferralCode(fromParam).catch(() => {});
      return;
    }

    if (pendingReferralCode) {
      setReferralCode(pendingReferralCode);
    }
  }, [params.ref, pendingReferralCode, setPendingReferralCode]);

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
      if (err) { setError("Google sign up failed. Please try again."); setGoogleLoading(false); return; }
      const payloadStr = parsed.searchParams.get("payload");
      if (!payloadStr) { setGoogleLoading(false); return; }
      const payload = JSON.parse(decodeURIComponent(payloadStr));
      await AsyncStorage.setItem("a2b_user", JSON.stringify(payload.user));
      if (payload.accessToken) await AsyncStorage.setItem("a2b_token", payload.accessToken);
      if (shouldShowRoleSelect) {
        await AsyncStorage.setItem(NEEDS_ROLE_SELECT_KEY, "1");
        await AsyncStorage.removeItem(NEEDS_OPERATOR_CHOICE_KEY);
      } else if (appVariant === "driver") {
        await AsyncStorage.setItem(NEEDS_OPERATOR_CHOICE_KEY, "1");
        await AsyncStorage.removeItem(NEEDS_ROLE_SELECT_KEY);
      } else {
        await AsyncStorage.removeItem(NEEDS_ROLE_SELECT_KEY);
        await AsyncStorage.removeItem(NEEDS_OPERATOR_CHOICE_KEY);
      }
      // Fetch the latest user profile from the server so the role is always current
      try {
        const meRes = await apiRequest("GET", "/api/auth/me");
        if (meRes.ok) {
          const freshUser = await meRes.json();
          await AsyncStorage.setItem("a2b_user", JSON.stringify(freshUser));
          setUser(freshUser);
          router.replace(postRegistrationRoute);
          return;
        }
      } catch {}
      setUser(payload.user);
      router.replace(postRegistrationRoute);
      // AuthGate handles navigation when user state changes
    } catch {
      setError("Google sign up failed. Please try again.");
    } finally {
      setGoogleLoading(false);
    }
  }

  function isValidEmail(val: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());
  }

  async function handleRegister() {
    if (!name.trim()) { setError("Full name is required"); return; }
    if (!email.trim()) { setError("Email is required"); return; }
    if (!isValidEmail(email)) { setError("Please enter a valid email address"); return; }
    if (!phone.trim()) { setError("Phone number is required"); return; }
    if (!password.trim()) { setError("Password is required"); return; }
    if (password.length < 4) { setError("Password must be at least 4 characters"); return; }
    setLoading(true); setError("");
    try {
      if (shouldShowRoleSelect) {
        await AsyncStorage.setItem(NEEDS_ROLE_SELECT_KEY, "1");
        await AsyncStorage.removeItem(NEEDS_OPERATOR_CHOICE_KEY);
      } else if (appVariant === "driver") {
        await AsyncStorage.setItem(NEEDS_OPERATOR_CHOICE_KEY, "1");
        await AsyncStorage.removeItem(NEEDS_ROLE_SELECT_KEY);
      } else {
        await AsyncStorage.removeItem(NEEDS_ROLE_SELECT_KEY);
        await AsyncStorage.removeItem(NEEDS_OPERATOR_CHOICE_KEY);
      }
      await register({
        username: email.trim().toLowerCase(),
        password,
        name: name.trim(),
        phone: phone.trim(),
        referralCode: referralCode.trim() || undefined,
      });
      await setPendingReferralCode(null);
      router.replace(postRegistrationRoute);
    } catch (e: any) {
      await AsyncStorage.removeItem(NEEDS_ROLE_SELECT_KEY);
      await AsyncStorage.removeItem(NEEDS_OPERATOR_CHOICE_KEY);
      const msg = e.message || "Registration failed.";
      if (msg.includes("already exists") || msg.includes("400")) setError("An account with this email already exists");
      else if (msg.includes("500") || msg.includes("Database")) setError("Server error. Please try again.");
      else if (msg.includes("fetch") || msg.includes("network")) setError("Cannot connect to server.");
      else setError(msg);
    } finally { setLoading(false); }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20) }]}>
      <Pressable style={styles.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace("/")}>
        <Ionicons name="chevron-back" size={24} color={Colors.white} />
      </Pressable>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Join A2B LIFT for premium rides</Text>
        </View>

        <View style={styles.form}>
          {!!error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={Colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Full Name <Text style={styles.required}>*</Text></Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="person-outline" size={18} color={Colors.textMuted} />
              <TextInput style={styles.input} placeholder="Enter your full name" placeholderTextColor={Colors.textMuted}
                value={name} onChangeText={setName} autoCorrect={false} />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email <Text style={styles.required}>*</Text></Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={18} color={Colors.textMuted} />
              <TextInput style={styles.input} placeholder="Enter your email address" placeholderTextColor={Colors.textMuted}
                value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false}
                keyboardType="email-address" textContentType="emailAddress" />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Phone Number <Text style={styles.required}>*</Text></Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="call-outline" size={18} color={Colors.textMuted} />
              <TextInput style={styles.input} placeholder="Enter your phone number" placeholderTextColor={Colors.textMuted}
                value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Reward Code</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="gift-outline" size={18} color={Colors.textMuted} />
              <TextInput
                style={styles.input}
                placeholder="Optional"
                placeholderTextColor={Colors.textMuted}
                value={referralCode}
                onChangeText={(value) => setReferralCode(value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={20}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={18} color={Colors.textMuted} />
              <TextInput style={styles.input} placeholder="Create a password" placeholderTextColor={Colors.textMuted}
                value={password} onChangeText={setPassword} secureTextEntry={!showPassword} />
              <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={8}>
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} color={Colors.textMuted} />
              </Pressable>
            </View>
          </View>

          <Pressable style={({ pressed }) => [styles.registerBtn, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }, loading && { opacity: 0.7 }]}
            onPress={handleRegister} disabled={loading}>
            {loading ? <ActivityIndicator color={Colors.primary} /> : <Text style={styles.registerBtnText}>Create Account</Text>}
          </Pressable>

          {/* ── Divider ── */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or sign up with</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* ── Google Sign Up ── */}
          <Pressable style={({ pressed }) => [styles.googleBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }, googleLoading && { opacity: 0.7 }]}
            onPress={async () => {
              setError("");
              setGoogleLoading(true);
              try {
                const redirectUrl = Linking.createURL("auth");
                const authUrl = `${GOOGLE_OAUTH_START}?redirect_uri=${encodeURIComponent(redirectUrl)}`;
                const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);

                if (result.type === "success" && result.url) {
                  await handleDeepLinkCallback(result.url);
                  return;
                }

                if (result.type !== "cancel") {
                  setError("Google sign up failed. Please try again.");
                }
              } catch {
                setError("Google sign up failed. Please try again.");
              } finally {
                setGoogleLoading(false);
              }
            }} disabled={googleLoading}>
            {googleLoading ? <ActivityIndicator color="#1a1a1a" size="small" /> : (
              <>
                <Image source={require("../assets/images/google_icon.png")} style={{ width: 22, height: 22 }} resizeMode="contain" />
                <Text style={styles.googleBtnText}>Continue with Google</Text>
              </>
            )}
          </Pressable>

          <Text style={styles.termsText}>
            By creating an account you agree to our{" "}
            <Text style={styles.termsLink}>Terms of Service</Text>
            {" "}and{" "}
            <Text style={styles.termsLink}>Privacy Policy</Text>
          </Text>
        </View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 16) }]}>
          <Text style={styles.footerText}>Already have an account?</Text>
          <Pressable onPress={() => router.replace("/login")}>
            <Text style={styles.footerLink}>Sign In</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary, paddingHorizontal: 24 },
  scrollContent: { flexGrow: 1 },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginLeft: -8 },
  header: { marginTop: 20, marginBottom: 28 },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", color: Colors.white, marginBottom: 8 },
  subtitle: { fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  form: { gap: 16 },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255,77,77,0.1)", padding: 12, borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,77,77,0.2)" },
  errorText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.error },
  inputGroup: { gap: 8 },
  label: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 1 },
  required: { color: Colors.error, fontSize: 12 },
  inputWrapper: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.card, borderRadius: 12, paddingHorizontal: 16, gap: 12, borderWidth: 1, borderColor: Colors.border },
  input: { flex: 1, paddingVertical: 15, fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.white },
  registerBtn: { backgroundColor: Colors.white, paddingVertical: 15, borderRadius: 14, alignItems: "center", marginTop: 4 },
  registerBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.primary },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 2 },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  googleBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: "#ffffff", paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: "#e0e0e0" },
  googleBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#1a1a1a" },
  googleIconWrap: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e0e0e0", alignItems: "center", justifyContent: "center" },
  googleG: { fontSize: 13, fontWeight: "700", color: "#4285F4" },
  termsText: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted, textAlign: "center", lineHeight: 18 },
  termsLink: { color: Colors.textSecondary, fontFamily: "Inter_500Medium" },
  footer: { flex: 1, justifyContent: "flex-end", flexDirection: "row", alignItems: "flex-end", gap: 4, paddingTop: 16 },
  footerText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  footerLink: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.white },
});
