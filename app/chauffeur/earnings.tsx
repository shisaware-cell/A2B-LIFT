import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ScrollView,
  RefreshControl,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";
import Colors from "@/constants/colors";

export default function EarningsScreen() {
  const insets = useSafeAreaInsets();
  const [chauffeurId, setChauffeurId] = useState<string | null>(null);
  const [showHelpModal, setShowHelpModal] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem("a2b_chauffeur").then((stored) => {
      if (stored) {
        try {
          const c = JSON.parse(stored);
          setChauffeurId(c.id);
        } catch {
          // fallback
        }
      }
    });
  }, []);

  const {
    data: overviewData,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["/api/earnings/chauffeur", chauffeurId, "overview"],
    queryFn: async () => {
      if (!chauffeurId) return null;
      const res = await apiRequest("GET", `/api/earnings/chauffeur/${chauffeurId}/overview`);
      if (!res.ok) throw new Error("Failed to load overview");
      return res.json();
    },
    enabled: !!chauffeurId,
  });

  const periodLabel = overviewData?.currentWeek?.periodLabel || "Current Week";
  const weekAmount = Number(overviewData?.currentWeek?.amount || 0).toFixed(2);
  const walletBalance = Number(overviewData?.wallet?.balance || 0).toFixed(2);
  const nextPayout = overviewData?.wallet?.nextPayoutLabel || "Monday at 4:00 AM";

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, Platform.OS === "android" ? 28 : 16) + (Platform.OS === "web" ? 50 : 0) }]}>
      {/* ─── Top Header Bar ─── */}
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Earnings</Text>
        <Pressable
          style={styles.helpButton}
          onPress={() => setShowHelpModal(true)}
          accessibilityRole="button"
          accessibilityLabel="Help"
        >
          <View style={styles.helpIconCircle}>
            <Text style={styles.helpQuestionMark}>?</Text>
          </View>
          <Text style={styles.helpText}>Help</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refetch}
            tintColor="#FFFFFF"
            colors={["#10B981"]}
          />
        }
      >
        {/* ─── Current Week Card (Image 1 top card) ─── */}
        <View style={styles.weekCard}>
          <Text style={styles.weekPeriodLabel}>{periodLabel}</Text>
          <Text style={styles.weekAmountText}>ZAR {weekAmount}</Text>

          <Pressable
            style={styles.viewDetailsBtn}
            onPress={() => router.push("/chauffeur/earnings-details" as never)}
            accessibilityRole="button"
            accessibilityLabel="View details"
          >
            <Text style={styles.viewDetailsText}>View details</Text>
            <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
          </Pressable>
        </View>

        {/* ─── Balance & Payout Card (Image 1 middle card) ─── */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Balance</Text>
          <Text style={styles.balanceAmountText}>ZAR {walletBalance}</Text>
          <Text style={styles.payoutNoticeText}>Next payout {nextPayout}</Text>

          <Pressable
            style={styles.cashOutBtn}
            onPress={() => router.push("/chauffeur/wallet" as never)}
            accessibilityRole="button"
            accessibilityLabel="Cash out and more"
          >
            <Ionicons name="flash" size={16} color="#FFFFFF" style={styles.boltIcon} />
            <Text style={styles.cashOutBtnText}>Cash out and more</Text>
          </Pressable>
        </View>

        {/* ─── Map Trends Banner (Image 1 bottom banner) ─── */}
        <Pressable
          style={styles.trendsBanner}
          onPress={() => router.push("/chauffeur/live-map" as never)}
          accessibilityRole="button"
          accessibilityLabel="See map of earnings trends in Johannesburg and Pretoria"
        >
          <View style={styles.trendsIconWrap}>
            <Ionicons name="map-outline" size={22} color="#10B981" />
          </View>
          <View style={styles.trendsTextWrap}>
            <Text style={styles.trendsTitle}>
              See a map of earnings trends in Johannesburg and Pretoria
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#6B7280" />
        </Pressable>
      </ScrollView>

      {/* ─── Help Modal ─── */}
      <Modal
        visible={showHelpModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowHelpModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Earnings & Payout Help</Text>
              <Pressable
                style={styles.modalCloseBtn}
                onPress={() => setShowHelpModal(false)}
                hitSlop={12}
              >
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <View style={styles.helpSection}>
                <Text style={styles.helpSectionTitle}>How weekly earnings work</Text>
                <Text style={styles.helpSectionDesc}>
                  Earnings cycle runs weekly from Monday at 4:00 AM SAST to the following Monday at 3:59 AM SAST. All completed trips in this period are accounted for in real-time.
                </Text>
              </View>

              <View style={styles.helpSection}>
                <Text style={styles.helpSectionTitle}>Weekly payouts</Text>
                <Text style={styles.helpSectionDesc}>
                  Scheduled payouts are processed automatically each Monday to your verified South African banking account or wallet balance without transfer fees.
                </Text>
              </View>

              <View style={styles.helpSection}>
                <Text style={styles.helpSectionTitle}>Instant Cash Out</Text>
                <Text style={styles.helpSectionDesc}>
                  Need your funds immediately? Tap "Cash out and more" anytime to transfer available earnings directly to your bank account 24/7.
                </Text>
              </View>
            </ScrollView>

            <Pressable
              style={styles.modalDoneBtn}
              onPress={() => setShowHelpModal(false)}
            >
              <Text style={styles.modalDoneBtnText}>Got it</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary || "#0B0C10",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  headerTitle: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    letterSpacing: -0.5,
  },
  helpButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#161922",
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#252A38",
    gap: 6,
  },
  helpIconCircle: {
    width: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  helpQuestionMark: {
    color: "#FFFFFF",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    lineHeight: 13,
    textAlign: "center",
  },
  helpText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 16,
  },
  weekCard: {
    backgroundColor: Colors.card || "#14161F",
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: "#202532",
  },
  weekPeriodLabel: {
    fontSize: 14,
    color: "#9CA3AF",
    fontFamily: "Inter_500Medium",
    marginBottom: 8,
  },
  weekAmountText: {
    fontSize: 34,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    letterSpacing: -0.8,
    marginBottom: 16,
  },
  viewDetailsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.surface || "#1C202C",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  viewDetailsText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  balanceCard: {
    backgroundColor: "#14161F",
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: "#202532",
  },
  balanceLabel: {
    fontSize: 13,
    color: "#9CA3AF",
    fontFamily: "Inter_500Medium",
    marginBottom: 6,
    textTransform: "capitalize",
  },
  balanceAmountText: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    marginBottom: 6,
  },
  payoutNoticeText: {
    fontSize: 13,
    color: "#9CA3AF",
    fontFamily: "Inter_400Regular",
    marginBottom: 18,
  },
  cashOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#10B981",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    gap: 8,
  },
  boltIcon: {
    marginTop: 1,
  },
  cashOutBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  trendsBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#14161F",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#202532",
    gap: 14,
  },
  trendsIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  trendsTextWrap: {
    flex: 1,
  },
  trendsTitle: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: "#151821",
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: "#262D3D",
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalBody: {
    marginBottom: 16,
  },
  helpSection: {
    marginBottom: 16,
  },
  helpSectionTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#10B981",
    marginBottom: 4,
  },
  helpSectionDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#9CA3AF",
    lineHeight: 18,
  },
  modalDoneBtn: {
    backgroundColor: "#10B981",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  modalDoneBtnText: {
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
    fontSize: 14,
  },
});
