import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Platform, ScrollView, ActivityIndicator, Image, Modal, Alert, Linking } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { uploadDocument } from "@/lib/supabase-storage";
import { apiRequest } from "@/lib/query-client";
import LivenessCamera, { type LivenessChallenge, type LivenessCaptureResult } from "@/components/LivenessCamera";
import Colors from "@/constants/colors";

interface ClientReview {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  reviewerName: string;
}

interface ClientProfileDetails {
  clientRating: number | null;
  totalRatings: number;
  completedTrips: number;
  ratings: ClientReview[];
}

const DRIVER_APP_DEEP_LINK = "a2blift://register";
const DRIVER_ANDROID_PACKAGE = "com.a2blift";
const DRIVER_APP_STORE_URL_IOS = process.env.EXPO_PUBLIC_IOS_APP_STORE_URL || "https://apps.apple.com/app/id982107779";
const DRIVER_APP_STORE_URL_ANDROID_WEB = `https://play.google.com/store/apps/details?id=${DRIVER_ANDROID_PACKAGE}`;

function normalizeReferralCode(value?: string | null) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return normalized || null;
}

function appendQueryParam(url: string, key: string, value?: string | null) {
  if (!value) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${key}=${encodeURIComponent(value)}`;
}

function buildAndroidStoreUrl(referralCode?: string | null, useNativeStoreScheme = false) {
  const baseUrl = useNativeStoreScheme
    ? `market://details?id=${DRIVER_ANDROID_PACKAGE}`
    : DRIVER_APP_STORE_URL_ANDROID_WEB;
  if (!referralCode) return baseUrl;
  return `${baseUrl}&referrer=${encodeURIComponent(`ref=${referralCode}`)}`;
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout, pendingReferralCode, setUser } = useAuth();
  const [profileDetails, setProfileDetails] = useState<ClientProfileDetails | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [showSelfieUpdate, setShowSelfieUpdate] = useState(false);
  const [selfieUploading, setSelfieUploading] = useState(false);

  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;

    async function loadProfileDetails() {
      try {
        setProfileLoading(true);
        const res = await apiRequest("GET", `/api/clients/${user.id}/profile`);
        const data = await res.json();
        if (!cancelled) {
          setProfileDetails(data);
        }
      } catch {
        if (!cancelled) {
          setProfileDetails(null);
        }
      } finally {
        if (!cancelled) {
          setProfileLoading(false);
        }
      }
    }

    loadProfileDetails();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  async function handleUpdateSelfie(result: LivenessCaptureResult) {
    if (!user?.id || !result.uri) { setShowSelfieUpdate(false); return; }
    setSelfieUploading(true);
    try {
      const uploadedUrl = await uploadDocument(result.uri, user.id, "profile_selfie");
      const updateRes = await apiRequest("PUT", `/api/users/${user.id}/selfie`, { profilePhoto: uploadedUrl });
      const updatedUser = await updateRes.json();
      setUser(updatedUser);
      await AsyncStorage.setItem("a2b_user", JSON.stringify(updatedUser));
      Alert.alert("Selfie Updated", "Your profile photo has been updated successfully.");
    } catch (error: any) {
      const message = typeof error?.message === "string"
        ? error.message.replace(/^\d+:\s*/, "")
        : "Could not update selfie. Please try again.";
      Alert.alert("Error", message);
    } finally {
      setSelfieUploading(false);
      setShowSelfieUpdate(false);
    }
  }

  async function handleLogout() {
    await logout();
  }

  async function handleBecomeDriver() {
    const referralCode = normalizeReferralCode(pendingReferralCode);
    const driverAppUrl = appendQueryParam(DRIVER_APP_DEEP_LINK, "ref", referralCode);
    const platformStoreUrl = Platform.OS === "ios"
      ? appendQueryParam(DRIVER_APP_STORE_URL_IOS, "ref", referralCode)
      : buildAndroidStoreUrl(referralCode, true);
    const webStoreUrl = Platform.OS === "ios"
      ? appendQueryParam(DRIVER_APP_STORE_URL_IOS, "ref", referralCode)
      : buildAndroidStoreUrl(referralCode, false);

    try {
      await Linking.openURL(driverAppUrl);
      return;
    } catch {}

    try {
      await Linking.openURL(platformStoreUrl);
      return;
    } catch {}

    try {
      await Linking.openURL(webStoreUrl);
    } catch {
      Alert.alert("Unable to open driver app", "We couldn't open the driver app or store link right now. Please try again.");
    }
  }

  const averageRating = profileDetails?.clientRating ?? (user?.rating != null ? Number(user.rating) : null);
  const totalRatings = profileDetails?.totalRatings ?? 0;
  const completedTrips = profileDetails?.completedTrips ?? 0;
  const recentReviews = profileDetails?.ratings?.slice(0, 3) ?? [];

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16) }]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Profile</Text>

      <View style={styles.profileCard}>
        <Pressable onPress={() => setShowSelfieUpdate(true)} style={styles.avatar}>
          {user?.profilePhoto ? (
            <Image source={{ uri: user.profilePhoto }} style={styles.avatarImg} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="person" size={32} color={Colors.white} />
            </View>
          )}
          <View style={styles.avatarEditBadge}>
            <Ionicons name="camera" size={12} color="#fff" />
          </View>
        </Pressable>
        <Text style={styles.profileName}>{user?.name || "User"}</Text>
        <Text style={styles.profileUsername}>{user?.username || user?.email || ""}</Text>
        {user?.phone && <Text style={styles.profilePhone}>{user.phone}</Text>}
        {user?.createdAt && (
          <Text style={styles.profilePhone}>Member since {new Date(user.createdAt).getFullYear()}</Text>
        )}
        <View style={styles.ratingRow}>
          <Ionicons name="star" size={14} color={Colors.warning} />
          {profileLoading ? (
            <ActivityIndicator size="small" color={Colors.warning} />
          ) : (
            <Text style={styles.ratingText}>
              {averageRating !== null ? `${averageRating.toFixed(1)} • ${totalRatings} ratings` : "No ratings yet"}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.statsCard}>
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{averageRating !== null ? averageRating.toFixed(1) : "—"}</Text>
            <Text style={styles.statLabel}>Average Rating</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{totalRatings}</Text>
            <Text style={styles.statLabel}>Reviews</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{completedTrips}</Text>
            <Text style={styles.statLabel}>Trips</Text>
          </View>
        </View>
      </View>

      <Pressable
        style={({ pressed }) => [styles.referralCard, pressed && { opacity: 0.9 }]}
        onPress={() => router.push("/client/referrals")}
      >
        <View style={styles.referralCardIcon}>
          <Ionicons name="gift-outline" size={18} color={Colors.white} />
        </View>
        <View style={styles.referralCardCopy}>
          <Text style={styles.referralCardTitle}>Reward Programme</Text>
          <Text style={styles.referralCardText}>Invite friends, track rewards, and share your reward code.</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
      </Pressable>

      {recentReviews.length > 0 && (
        <View style={styles.reviewsCard}>
          <Text style={styles.reviewsTitle}>Recent Ratings</Text>
          {recentReviews.map((review) => (
            <View key={review.id} style={styles.reviewItem}>
              <View style={styles.reviewHeader}>
                <Text style={styles.reviewName}>{review.reviewerName}</Text>
                <Text style={styles.reviewMeta}>{review.rating.toFixed(1)} ★</Text>
              </View>
              {review.comment ? <Text style={styles.reviewComment}>{review.comment}</Text> : null}
            </View>
          ))}
        </View>
      )}

      <View style={styles.menuGroup}>
        <Pressable style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]} onPress={() => setShowSelfieUpdate(true)}>
          <View style={styles.menuIconCircle}>
            <Ionicons name="camera-outline" size={20} color={Colors.white} />
          </View>
          <Text style={styles.menuText}>Update Selfie</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </Pressable>

        <Pressable style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]} onPress={() => router.push("/client/notifications")}>
          <View style={styles.menuIconCircle}>
            <Ionicons name="notifications-outline" size={20} color={Colors.white} />
          </View>
          <Text style={styles.menuText}>Notifications</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </Pressable>

        <Pressable style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]} onPress={() => router.push("/client/safety")}>
          <View style={styles.menuIconCircle}>
            <Ionicons name="shield-checkmark-outline" size={20} color={Colors.white} />
          </View>
          <Text style={styles.menuText}>Safety</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </Pressable>

        <Pressable style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]} onPress={() => router.push("/client/help")}>
          <View style={styles.menuIconCircle}>
            <Ionicons name="help-circle-outline" size={20} color={Colors.white} />
          </View>
          <Text style={styles.menuText}>Help & Support</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </Pressable>

        <Pressable style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]} onPress={() => router.push("/client/settings")}>
          <View style={[styles.menuIconCircle, { borderBottomWidth: 0 }]}>
            <Ionicons name="settings-outline" size={20} color={Colors.white} />
          </View>
          <Text style={styles.menuText}>Settings</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </Pressable>

        <Pressable style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]} onPress={() => router.push("/client/referrals")}>
          <View style={styles.menuIconCircle}>
            <Ionicons name="gift-outline" size={20} color={Colors.white} />
          </View>
          <Text style={styles.menuText}>Rewards</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </Pressable>
      </View>

      <View style={styles.menuGroup}>
        <Pressable
          style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]}
          onPress={handleBecomeDriver}
        >
          <View style={styles.menuIconCircle}>
            <Ionicons name="car-sport-outline" size={20} color={Colors.white} />
          </View>
          <Text style={styles.menuText}>{user?.role === "chauffeur" ? "Open Driver App" : "Become a Driver"}</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </Pressable>
      </View>

      <Pressable
        style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.8 }]}
        onPress={handleLogout}
      >
        <Ionicons name="log-out-outline" size={20} color={Colors.error} />
        <Text style={styles.logoutText}>Sign Out</Text>
      </Pressable>

      <View style={styles.brandFooter}>
        <Ionicons name="car-sport" size={14} color={Colors.textMuted} />
        <Text style={styles.brandText}>A2B LIFT v1.0</Text>
      </View>

      <View style={{ height: 100 }} />

      {/* Selfie Update Modal */}
      <Modal visible={showSelfieUpdate} animationType="slide" onRequestClose={() => setShowSelfieUpdate(false)}>
        {selfieUploading ? (
          <View style={{ flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center", gap: 16 }}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={{ color: "#fff", fontSize: 15 }}>Saving your selfie...</Text>
          </View>
        ) : (
          <>
            <LivenessCamera
              challenge={"look_straight"}
              onCapture={handleUpdateSelfie}
              onCancel={() => setShowSelfieUpdate(false)}
            />
            <Pressable
              style={{ position: "absolute", bottom: 120, alignSelf: "center", paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" }}
              onPress={() => setShowSelfieUpdate(false)}
            >
              <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>Cancel</Text>
            </Pressable>
          </>
        )}
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary, paddingHorizontal: 20 },
  scrollContent: { paddingBottom: 40 },
  title: { fontSize: 24, fontFamily: "Inter_700Bold", color: Colors.white, marginBottom: 20 },
  profileCard: { alignItems: "center", backgroundColor: Colors.card, borderRadius: 20, padding: 28, gap: 6, borderWidth: 1, borderColor: Colors.border, marginBottom: 24 },
  avatar: { width: 80, height: 80, borderRadius: 40, marginBottom: 8, position: "relative" },
  avatarImg: { width: 80, height: 80, borderRadius: 40 },
  avatarPlaceholder: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center" },
  avatarEditBadge: { position: "absolute", bottom: 0, right: 0, width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: Colors.card },
  profileName: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.white },
  profileUsername: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 2 },
  profilePhone: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  ratingText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.white },
  statsCard: { backgroundColor: Colors.card, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: Colors.border, marginBottom: 16 },
  statsRow: { flexDirection: "row", alignItems: "center" },
  statBox: { flex: 1, alignItems: "center", gap: 4 },
  statValue: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.white },
  statLabel: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted, textAlign: "center" },
  statDivider: { width: 1, alignSelf: "stretch", backgroundColor: Colors.border },
  referralCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  referralCardIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  referralCardCopy: { flex: 1, gap: 2 },
  referralCardTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.white },
  referralCardText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary, lineHeight: 17 },
  reviewsCard: { backgroundColor: Colors.card, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: Colors.border, marginBottom: 16, gap: 12 },
  reviewsTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.white },
  reviewItem: { backgroundColor: Colors.surface, borderRadius: 14, padding: 12, gap: 6, borderWidth: 1, borderColor: Colors.border },
  reviewHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  reviewName: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.white, flex: 1 },
  reviewMeta: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.warning },
  reviewComment: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, lineHeight: 18 },
  menuGroup: { backgroundColor: Colors.card, borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: Colors.border, marginBottom: 16 },
  menuItem: { flexDirection: "row", alignItems: "center", padding: 16, gap: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  menuIconCircle: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center" },
  menuText: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium", color: Colors.white },
  logoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, marginTop: 8 },
  logoutText: { fontSize: 15, fontFamily: "Inter_500Medium", color: Colors.error },
  brandFooter: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 16 },
  brandText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },
});
