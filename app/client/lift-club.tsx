import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/query-client";
import { uploadDocument } from "@/lib/supabase-storage";
import Colors from "@/constants/colors";

type Membership = {
  id?: string;
  status: "not_applied" | "pending_payment" | "pending_review" | "approved" | "rejected";
  feeAmount?: number;
  rejectionReason?: string | null;
  bankingDetailsUrl?: string;
  proofDocument?: { url?: string | null } | null;
};

const DEFAULT_BANKING_URL = "https://a2blift.com/lift-club-payment.html";
const DEFAULT_APPLICATION_FEE = 200;

function statusCopy(status?: string) {
  switch (status) {
    case "approved":
      return { title: "Lift Club dashboard", body: "Your Lift Club membership is active. Search approved weekday commute cars and book available seats.", icon: "ribbon" as const };
    case "pending_review":
      return { title: "Pending admin approval", body: "Your R200 proof is with the A2B admin team. You will see your Lift Club badge after approval.", icon: "time" as const };
    case "pending_payment":
      return { title: "Payment proof needed", body: "Pay the once-off R200 application fee, then upload your proof here.", icon: "wallet" as const };
    case "rejected":
      return { title: "Proof needs attention", body: "Please check the reason below, then upload a new proof of payment.", icon: "alert-circle" as const };
    default:
      return { title: "Register as Lift Club member", body: "Apply, pay the once-off R200 fee manually, upload proof, and wait for admin approval.", icon: "add-circle" as const };
  }
}

export default function LiftClubMembershipScreen() {
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();
  const [membership, setMembership] = useState<Membership | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [routes, setRoutes] = useState<any[]>([]);
  const [routesLoading, setRoutesLoading] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  async function loadMembership() {
    try {
      setLoading(true);
      const res = await apiRequest("GET", "/api/lift-club/membership/me");
      const data = await res.json();
      setMembership(data);
    } catch (error: any) {
      Alert.alert("Lift Club", error?.message?.replace(/^\d+:\s*/, "") || "Unable to load your membership.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMembership();
  }, []);

  async function searchRoutes() {
    try {
      setRoutesLoading(true);
      const params = new URLSearchParams();
      if (from.trim()) params.set("from", from.trim());
      if (to.trim()) params.set("to", to.trim());
      const res = await apiRequest("GET", `/api/lift-club/routes${params.toString() ? `?${params.toString()}` : ""}`);
      const data = await res.json();
      setRoutes(Array.isArray(data) ? data : []);
    } catch (error: any) {
      Alert.alert("Lift Club cars", error?.message?.replace(/^\d+:\s*/, "") || "Unable to load cars right now.");
    } finally {
      setRoutesLoading(false);
    }
  }

  useEffect(() => {
    if (!loading) searchRoutes();
  }, [loading]);

  async function apply() {
    try {
      setBusy(true);
      const res = await apiRequest("POST", "/api/lift-club/membership/apply", {});
      const data = await res.json();
      setMembership(data);
      await refreshUser().catch(() => undefined);
    } catch (error: any) {
      Alert.alert("Application failed", error?.message?.replace(/^\d+:\s*/, "") || "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function openPaymentPage() {
    const url = membership?.bankingDetailsUrl || DEFAULT_BANKING_URL;
    const canOpen = await Linking.canOpenURL(url).catch(() => false);
    if (!canOpen) {
      Alert.alert("Unable to open page", "Please visit a2blift.com/lift-club-payment.html for payment instructions.");
      return;
    }
    await Linking.openURL(url);
  }

  async function uploadProof() {
    if (!user?.id) return;
    try {
      setBusy(true);
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: ["image/*", "application/pdf"],
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const url = await uploadDocument(asset.uri, user.id, "lift_club_payment_proof", {
        fileName: asset.name,
        mimeType: asset.mimeType || "application/octet-stream",
      });
      const res = await apiRequest("POST", "/api/lift-club/membership/proof", { url });
      const data = await res.json();
      setMembership(data);
      await refreshUser().catch(() => undefined);
      Alert.alert("Proof uploaded", "Your proof is now waiting for admin review.");
    } catch (error: any) {
      Alert.alert("Upload failed", error?.message?.replace(/^\d+:\s*/, "") || "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const status = statusCopy(membership?.status);
  const isApproved = membership?.status === "approved";
  const needsApply = !membership || membership.status === "not_applied";

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 60 : 12) }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 140 }]}
      showsVerticalScrollIndicator={false}
    >
      <Pressable style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={26} color={Colors.white} />
      </Pressable>

      <Text style={styles.title}>Lift Club dashboard</Text>

      {loading ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator color={Colors.white} />
          <Text style={styles.muted}>Loading membership...</Text>
        </View>
      ) : (
        <>
          <View style={[styles.statusCard, isApproved && styles.approvedCard]}>
            <View style={[styles.statusIcon, isApproved && styles.approvedIcon]}>
              <Ionicons name={status.icon} size={24} color={isApproved ? "#2A1D00" : Colors.white} />
            </View>
            <Text style={styles.statusTitle}>{status.title}</Text>
            <Text style={styles.statusBody}>{status.body}</Text>
            {isApproved && (
              <View style={styles.badge}>
                <Ionicons name="ribbon" size={14} color="#2A1D00" />
                <Text style={styles.badgeText}>Yellow badge active</Text>
              </View>
            )}
            {membership?.status === "rejected" && membership.rejectionReason ? (
              <Text style={styles.rejection}>Reason: {membership.rejectionReason}</Text>
            ) : null}
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Once-off application fee</Text>
            <Text style={styles.fee}>R {Number(membership?.feeAmount || DEFAULT_APPLICATION_FEE).toFixed(0)}</Text>
            <Text style={styles.muted}>Manual payment is reviewed by admin. Upload proof after paying to move your application to review.</Text>
            <Pressable style={styles.secondaryButton} onPress={openPaymentPage}>
              <Ionicons name="open-outline" size={18} color={Colors.white} />
              <Text style={styles.secondaryButtonText}>Open banking details</Text>
            </Pressable>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Reward note</Text>
            <Text style={styles.muted}>Your existing 2.5% reward programme stays active. You also earn R100 once when someone you invited pays the R200 Lift Club registration fee and is approved by admin.</Text>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>{isApproved ? "Available Lift Club cars" : "Preview available Lift Club cars"}</Text>
            <Text style={styles.muted}>
              Search approved weekday commute cars by pickup area and workplace. Booking opens after your Lift Club membership is approved.
            </Text>
            <View style={styles.searchRow}>
              <TextInput
                style={styles.searchInput}
                placeholder="Pickup area"
                placeholderTextColor={Colors.textMuted}
                value={from}
                onChangeText={setFrom}
              />
              <TextInput
                style={styles.searchInput}
                placeholder="Workplace"
                placeholderTextColor={Colors.textMuted}
                value={to}
                onChangeText={setTo}
              />
            </View>
            <Pressable style={styles.secondaryButton} onPress={searchRoutes} disabled={routesLoading}>
              {routesLoading ? <ActivityIndicator color={Colors.white} /> : <Ionicons name="search-outline" size={18} color={Colors.white} />}
              <Text style={styles.secondaryButtonText}>Search cars</Text>
            </Pressable>
            <View style={styles.routesList}>
              {routesLoading ? null : routes.length ? routes.map((route) => {
                const seatsLeft = Math.max(0, Number(route.totalSeats || 0) - Number(route.bookedSeats || 0));
                const actionLabel = isApproved ? "Book from website" : needsApply ? "Apply to book" : "Complete approval to book";
                const action = isApproved
                  ? () => Linking.openURL("https://a2blift.com/lift-club.html")
                  : needsApply
                    ? apply
                    : membership?.status === "pending_payment" || membership?.status === "rejected"
                      ? openPaymentPage
                      : undefined;
                return (
                  <View key={route.id} style={styles.routeCard}>
                    <View style={styles.routeHeader}>
                      <Text style={styles.routeTitle}>{route.pickupArea} to {route.destinationArea}</Text>
                      <View style={[styles.seatPill, seatsLeft <= 0 && styles.fullSeatPill]}>
                        <Text style={[styles.seatPillText, seatsLeft <= 0 && styles.fullSeatPillText]}>{seatsLeft > 0 ? `${seatsLeft} seats` : "Full"}</Text>
                      </View>
                    </View>
                    <Text style={styles.routeMeta}>{route.departureWindow || "Weekday mornings"}</Text>
                    <Text style={styles.routeMeta}>
                      Weekly R{Number(route.weeklyPrice || 0).toFixed(0)} · Monthly R{Number(route.monthlyPrice || 0).toFixed(0)}
                    </Text>
                    <Text style={styles.routeMeta}>
                      {route.carMake || "Vehicle"} {route.vehicleModel || ""} · {route.vehicleYear || "2015+"}
                    </Text>
                    <Pressable style={[styles.routeAction, (!action || seatsLeft <= 0) && styles.disabledButton]} disabled={!action || seatsLeft <= 0 || busy} onPress={action}>
                      <Text style={styles.routeActionText}>{seatsLeft <= 0 ? "Full" : actionLabel}</Text>
                    </Pressable>
                  </View>
                );
              }) : <Text style={styles.muted}>No Lift Club cars found yet. Try a nearby pickup area or workplace.</Text>}
            </View>
          </View>

          {needsApply ? (
            <Pressable style={[styles.primaryButton, busy && styles.disabledButton]} disabled={busy} onPress={apply}>
              {busy ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryButtonText}>Register as Lift Club member</Text>}
            </Pressable>
          ) : membership?.status !== "approved" ? (
            <Pressable style={[styles.primaryButton, busy && styles.disabledButton]} disabled={busy} onPress={uploadProof}>
              {busy ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryButtonText}>Upload proof of payment</Text>}
            </Pressable>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary, paddingHorizontal: 20 },
  content: { paddingBottom: 48 },
  backButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", color: Colors.white, marginBottom: 20 },
  loadingCard: { backgroundColor: Colors.card, borderRadius: 18, padding: 24, gap: 12, alignItems: "center", borderWidth: 1, borderColor: Colors.border },
  statusCard: { backgroundColor: Colors.card, borderRadius: 22, padding: 22, borderWidth: 1, borderColor: Colors.border, gap: 10, marginBottom: 16 },
  approvedCard: { borderColor: "rgba(247,201,72,0.55)" },
  statusIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: Colors.accent },
  approvedIcon: { backgroundColor: "#F7C948" },
  statusTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: Colors.white },
  statusBody: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary, lineHeight: 21 },
  badge: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#F7C948", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  badgeText: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#2A1D00", textTransform: "uppercase", letterSpacing: 0.5 },
  rejection: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.error, marginTop: 4 },
  infoCard: { backgroundColor: Colors.card, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: Colors.border, gap: 10, marginBottom: 16 },
  infoTitle: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.white },
  fee: { fontSize: 34, fontFamily: "Inter_700Bold", color: Colors.white },
  muted: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary, lineHeight: 21 },
  primaryButton: { height: 58, borderRadius: 16, backgroundColor: Colors.white, alignItems: "center", justifyContent: "center", marginTop: 4 },
  primaryButtonText: { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.primary },
  secondaryButton: { height: 48, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, marginTop: 4 },
  secondaryButtonText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.white },
  searchRow: { gap: 10 },
  searchInput: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    color: Colors.white,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  routesList: { gap: 10, marginTop: 6 },
  routeCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    gap: 7,
  },
  routeHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  routeTitle: { flex: 1, fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.white, lineHeight: 20 },
  routeMeta: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, lineHeight: 18 },
  seatPill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: "#F7C948" },
  fullSeatPill: { backgroundColor: "rgba(255,255,255,0.14)" },
  seatPillText: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#2A1D00" },
  fullSeatPillText: { color: Colors.textSecondary },
  routeAction: { minHeight: 42, borderRadius: 12, backgroundColor: "#F7C948", alignItems: "center", justifyContent: "center", marginTop: 4 },
  routeActionText: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#2A1D00" },
  disabledButton: { opacity: 0.65 },
});
