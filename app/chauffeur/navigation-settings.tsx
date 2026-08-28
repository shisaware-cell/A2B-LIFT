import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Switch,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import {
  NavigationAppType,
  NavigationPreferences,
  getNavigationPreferences,
  setNavigationApp,
  setAutoNavigate,
  setNavigationVoice,
  subscribeNavigationPreferences,
} from "@/lib/navigation-preferences";

interface NavOption {
  id: NavigationAppType;
  title: string;
  subtitle: string;
  isRecommended?: boolean;
  iosOnly?: boolean;
}

const NAV_APPS: NavOption[] = [
  {
    id: "a2b",
    title: "A2B Navigation",
    subtitle: "Recommended: Stay in this app",
    isRecommended: true,
  },
  {
    id: "google",
    title: "Google Maps",
    subtitle: "Opens in separate app",
  },
  {
    id: "waze",
    title: "Waze",
    subtitle: "Opens in separate app",
  },
  ...(Platform.OS === "ios"
    ? [
        {
          id: "apple" as NavigationAppType,
          title: "Apple Maps",
          subtitle: "Opens in separate app",
          iosOnly: true,
        },
      ]
    : []),
];

export default function NavigationSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [prefs, setPrefs] = useState<NavigationPreferences>({
    navigationApp: "a2b",
    autoNavigate: true,
    navigationVoice: true,
  });

  useEffect(() => {
    const unsub = subscribeNavigationPreferences((p) => {
      setPrefs(p);
    });
    return unsub;
  }, []);

  async function handleSelectApp(appId: NavigationAppType) {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } catch {}
    await setNavigationApp(appId);
  }

  async function handleToggleAutoNavigate(value: boolean) {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } catch {}
    await setAutoNavigate(value);
  }

  async function handleToggleVoice(value: boolean) {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } catch {}
    await setNavigationVoice(value);
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 14) }]}>
      {/* ─── Header ─── */}
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityLabel="Back"
          hitSlop={12}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.white} />
        </Pressable>
        <Text style={styles.headerTitle}>Navigation</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Section 1: Navigation App ─── */}
        <Text style={styles.sectionTitle}>Navigation App</Text>

        <View style={styles.card}>
          {NAV_APPS.map((item, index) => {
            const isSelected = prefs.navigationApp === item.id;
            return (
              <Pressable
                key={item.id}
                style={[
                  styles.appRow,
                  index < NAV_APPS.length - 1 && styles.appRowBorder,
                  isSelected && styles.appRowSelected,
                ]}
                onPress={() => handleSelectApp(item.id)}
              >
                <View style={styles.appInfo}>
                  <Text style={[styles.appTitle, isSelected && styles.appTitleActive]}>
                    {item.title}
                  </Text>
                  <Text style={styles.appSubtitle}>{item.subtitle}</Text>
                </View>
                {isSelected && (
                  <Ionicons name="checkmark" size={24} color="#3B82F6" style={styles.checkIcon} />
                )}
              </Pressable>
            );
          })}
        </View>

        {/* ─── Section 2: Navigation Settings ─── */}
        <Text style={[styles.sectionTitle, { marginTop: 28 }]}>Navigation Settings</Text>

        <View style={styles.card}>
          <View style={[styles.settingRow, styles.appRowBorder]}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Auto-navigate</Text>
              <Text style={styles.settingSubtitle}>
                You'll see a route overview before navigation starts automatically.
              </Text>
            </View>
            <Switch
              value={prefs.autoNavigate}
              onValueChange={handleToggleAutoNavigate}
              trackColor={{ false: "#333333", true: "#FFFFFF" }}
              thumbColor={prefs.autoNavigate ? "#000000" : "#888888"}
              ios_backgroundColor="#333333"
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Navigation voice</Text>
              <Text style={styles.settingSubtitle}>
                Spoken turn-by-turn directions during trips.
              </Text>
            </View>
            <Switch
              value={prefs.navigationVoice}
              onValueChange={handleToggleVoice}
              trackColor={{ false: "#333333", true: "#FFFFFF" }}
              thumbColor={prefs.navigationVoice ? "#000000" : "#888888"}
              ios_backgroundColor="#333333"
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A0A0A",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.white,
    fontFamily: "Inter_700Bold",
  },
  headerRight: {
    width: 40,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#8E8E93",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontFamily: "Inter_600SemiBold",
  },
  card: {
    backgroundColor: "#161618",
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  appRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  appRowSelected: {
    backgroundColor: "rgba(59, 130, 246, 0.04)",
  },
  appRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  appInfo: {
    flex: 1,
    marginRight: 12,
  },
  appTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: Colors.white,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
  },
  appTitleActive: {
    color: Colors.white,
  },
  appSubtitle: {
    fontSize: 13,
    color: "#8E8E93",
    fontFamily: "Inter_400Regular",
  },
  checkIcon: {
    marginLeft: 8,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.white,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
  },
  settingSubtitle: {
    fontSize: 13,
    color: "#8E8E93",
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
});
