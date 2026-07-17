import React from "react";
import { View, Text, StyleSheet, Pressable, Platform, Linking, Image } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@mobile-core/auth";
import { getAppVariant } from "@mobile-core/app-variant";
import { Colors } from "@mobile-ui/colors";
import { EntranceView } from "@mobile-ui/motion";

export default function SplashLanding() {
  const insets = useSafeAreaInsets();
  const { user, isLoading } = useAuth();
  const appVariant = getAppVariant();
  const isDriverApp = appVariant === "driver";
  const appName = isDriverApp ? "A2B LIFT DRIVER" : "A2B LIFT";
  const slogan = isDriverApp ? "Drive With Confidence" : "Premium Ride Experience";

  // Navigation handled by AuthGate in _layout.tsx

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: Colors.primary }]}>
        {isDriverApp ? (
          <Image source={require("../assets/images/driver-icon.png")} style={styles.loadingLogo} resizeMode="contain" />
        ) : (
          <Image source={require("../assets/images/icon.png")} style={styles.loadingLogo} resizeMode="contain" />
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#000000", "#0a0a0a", "#111111"]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.content, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) }]}>
        <EntranceView direction="up" duration={800} delay={200} style={styles.logoArea}>
          {isDriverApp ? (
            <Image source={require("../assets/images/driver-icon.png")} style={styles.driverLogo} resizeMode="contain" />
          ) : (
            <View style={styles.clientLogoFrame}>
              <Image source={require("../assets/images/icon.png")} style={styles.clientLogo} resizeMode="cover" />
            </View>
          )}
          <Text style={[styles.appName, isDriverApp && styles.driverAppName]}>{appName}</Text>
          <Text style={styles.slogan}>{slogan}</Text>
        </EntranceView>

        <EntranceView duration={800} delay={600} style={styles.bottomArea}>
          <View style={styles.featureRow}>
            <View style={styles.featureItem}>
              <Ionicons name="shield-checkmark" size={20} color={Colors.textSecondary} />
              <Text style={styles.featureText}>Executive Service</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="time" size={20} color={Colors.textSecondary} />
              <Text style={styles.featureText}>24/7 Available</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="diamond" size={20} color={Colors.textSecondary} />
              <Text style={styles.featureText}>Luxury Fleet</Text>
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed]}
            onPress={() => router.push("/login")}
          >
            <Text style={styles.primaryBtnText}>Login</Text>
            <Ionicons name="arrow-forward" size={20} color={Colors.primary} />
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.6 }]}
            onPress={() => router.push("/register")}
          >
            <Text style={styles.secondaryBtnText}>Create Account</Text>
          </Pressable>

          <View style={styles.termsContainer}>
            <Text style={styles.termsText}>
              {"By signing up, you agree to our "}
              <Text
                style={styles.termsLink}
                onPress={() => Linking.openURL("https://sites.google.com/view/a2bliftclub/termsofuse")}
              >
                Terms &amp; Conditions
              </Text>
              {", acknowledge our "}
              <Text
                style={styles.termsLink}
                onPress={() => Linking.openURL("https://sites.google.com/view/a2bliftclub/home")}
              >
                Privacy Policy
              </Text>
              {", and confirm that you\u2019re over 18. We may send promotions related to our services \u2013 you can unsubscribe anytime in Communication Settings under your profile."}
            </Text>
          </View>

          <View style={{ height: insets.bottom + (Platform.OS === "web" ? 34 : 16) }} />
        </EntranceView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
    width: "100%",
    justifyContent: "space-between",
    alignItems: "center",
  },
  logoArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    overflow: "hidden",
  },
  driverLogo: {
    width: 88,
    height: 88,
    marginBottom: 8,
  },
  clientLogo: {
    width: 80,
    height: 80,
  },
  clientLogoFrame: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    overflow: "hidden",
    marginBottom: 8,
  },
  loadingLogo: {
    width: 76,
    height: 76,
  },
  appName: {
    fontSize: 36,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
    letterSpacing: 4,
  },
  driverAppName: {
    fontSize: 28,
    letterSpacing: 2,
  },
  slogan: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  bottomArea: {
    width: "100%",
    paddingHorizontal: 24,
    gap: 8,
  },
  featureRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 12,
  },
  termsContainer: {
    paddingHorizontal: 8,
    paddingTop: 4,
  },
  termsText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 17,
  },
  termsLink: {
    color: "#4CAF50",
    textDecorationLine: "underline",
  },
  featureItem: {
    alignItems: "center",
    gap: 6,
  },
  featureText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  primaryBtn: {
    backgroundColor: Colors.white,
    paddingVertical: 16,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  btnPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  primaryBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.primary,
  },
  secondaryBtn: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  secondaryBtnText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
});
