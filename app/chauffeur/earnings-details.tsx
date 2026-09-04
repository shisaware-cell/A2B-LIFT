import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ScrollView,
  RefreshControl,
  Modal,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";
import Colors from "@/constants/colors";

const SCREEN_WIDTH = Dimensions.get("window").width;

export default function EarningsDetailsScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ weekStart?: string }>();
  const [chauffeurId, setChauffeurId] = useState<string | null>(null);
  const [currentWeekStart, setCurrentWeekStart] = useState<string | null>(params.weekStart || null);
  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(null);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

  useEffect(() => {
    if (params.weekStart) {
      setCurrentWeekStart(params.weekStart);
    }
  }, [params.weekStart]);

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
    data: weekDetails,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["/api/earnings/chauffeur", chauffeurId, "week-details", currentWeekStart],
    queryFn: async () => {
      if (!chauffeurId) return null;
      const url = currentWeekStart
        ? `/api/earnings/chauffeur/${chauffeurId}/week-details?weekStart=${encodeURIComponent(currentWeekStart)}`
        : `/api/earnings/chauffeur/${chauffeurId}/week-details`;
      const res = await apiRequest("GET", url);
      if (!res.ok) throw new Error("Failed to load week details");
      return res.json();
    },
    enabled: !!chauffeurId,
  });

  const weekLabel = weekDetails?.week?.label || "This Week";
  const totalWeekAmount = Number(weekDetails?.week?.totalAmount || 0).toFixed(2);
  const dailyEarnings = weekDetails?.dailyEarnings || [];
  const stats = weekDetails?.stats || { onlineFormatted: "0 s", trips: 0, points: 5.0 };

  // Calculate max daily earnings for chart bar heights
  const maxDayAmount = useMemo(() => {
    const max = Math.max(...dailyEarnings.map((d: any) => Number(d.amount) || 0));
    return max > 0 ? max : 100;
  }, [dailyEarnings]);

  const handlePrevWeek = () => {
    if (weekDetails?.previousWeek?.start) {
      setCurrentWeekStart(weekDetails.previousWeek.start);
      setSelectedDayIndex(null);
    }
  };

  const handleNextWeek = () => {
    if (weekDetails?.nextWeek?.start) {
      setCurrentWeekStart(weekDetails.nextWeek.start);
      setSelectedDayIndex(null);
    }
  };

  const selectedDayInfo = selectedDayIndex !== null && dailyEarnings[selectedDayIndex]
    ? dailyEarnings[selectedDayIndex]
    : null;

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 64 : 12) }]}>
      {/* ─── Header Bar (Back, Date pill, Help) ─── */}
      <View style={styles.headerBar}>
        <Pressable
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={12}
        >
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </Pressable>

        {/* Date range button in center: redirects to select-week screen */}
        <Pressable
          style={styles.dateRangePill}
          onPress={() => router.push("/chauffeur/earnings-select-week" as never)}
          accessibilityRole="button"
          accessibilityLabel="Select week"
        >
          <Text style={styles.dateRangeText}>{weekLabel}</Text>
          <Ionicons name="chevron-down" size={15} color="#9CA3AF" style={{ marginTop: 1 }} />
        </Pressable>

        <Pressable
          style={styles.helpIconBtn}
          onPress={() => setShowHelpModal(true)}
          accessibilityRole="button"
          accessibilityLabel="Help"
          hitSlop={12}
        >
          <View style={styles.helpCircle}>
            <Text style={styles.helpQuestion}>?</Text>
          </View>
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
        {/* ─── Week Carousel (< ZAR 0.00 >) ─── */}
        <View style={styles.carouselRow}>
          <Pressable
            style={styles.carouselArrow}
            onPress={handlePrevWeek}
            accessibilityRole="button"
            accessibilityLabel="Previous week"
            hitSlop={16}
          >
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </Pressable>

          <View style={styles.carouselCenter}>
            <Text style={styles.carouselAmount}>ZAR {totalWeekAmount}</Text>
          </View>

          <Pressable
            style={[styles.carouselArrow, !weekDetails?.nextWeek && styles.carouselArrowDisabled]}
            onPress={handleNextWeek}
            disabled={!weekDetails?.nextWeek}
            accessibilityRole="button"
            accessibilityLabel="Next week"
            hitSlop={16}
          >
            <Ionicons
              name="chevron-forward"
              size={24}
              color={weekDetails?.nextWeek ? "#FFFFFF" : "#374151"}
            />
          </Pressable>
        </View>

        {/* ─── 7-Day Bar Chart ─── */}
        <View style={styles.chartCard}>
          <View style={styles.chartBarsContainer}>
            {dailyEarnings.map((day: any, idx: number) => {
              const amount = Number(day.amount) || 0;
              const heightPercent = maxDayAmount > 0 ? (amount / maxDayAmount) * 100 : 0;
              const barHeight = Math.max(heightPercent > 0 ? (heightPercent * 1.1) : 4, 4);
              const isSelected = selectedDayIndex === idx;

              return (
                <Pressable
                  key={idx}
                  style={styles.chartCol}
                  onPress={() => setSelectedDayIndex(isSelected ? null : idx)}
                >
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        { height: barHeight },
                        isSelected && styles.barFillSelected,
                        amount > 0 && !isSelected && styles.barFillActive,
                      ]}
                    />
                  </View>
                  <Text style={[styles.dayName, isSelected && styles.dayNameSelected]}>
                    {day.dayName}
                  </Text>
                  <Text style={[styles.dateNum, isSelected && styles.dateNumSelected]}>
                    {day.dateNum}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Selected Day Toast/Banner */}
          {selectedDayInfo && (
            <View style={styles.selectedDayBadge}>
              <Text style={styles.selectedDayText}>
                {selectedDayInfo.dayName} {selectedDayInfo.dateNum}:{" "}
                <Text style={{ color: "#10B981", fontWeight: "700" }}>
                  ZAR {Number(selectedDayInfo.amount || 0).toFixed(2)}
                </Text>{" "}
                • {selectedDayInfo.tripsCount || 0} trips
              </Text>
            </View>
          )}
        </View>

        {/* ─── Stats Section ─── */}
        <View style={styles.statsCard}>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Online</Text>
              <Text style={styles.statValue}>{stats.onlineFormatted || "0 s"}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Trips</Text>
              <Text style={styles.statValue}>{stats.trips || 0}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Points</Text>
              <Text style={styles.statValue}>{stats.points ?? "5.0"}</Text>
            </View>
          </View>

          <Pressable
            style={styles.calcStatsBtn}
            onPress={() => setShowStatsModal(true)}
            accessibilityRole="button"
            accessibilityLabel="How we calculate stats"
          >
            <Text style={styles.calcStatsText}>How we calculate stats</Text>
            <Ionicons name="information-circle-outline" size={16} color="#9CA3AF" />
          </Pressable>
        </View>

        {/* ─── Bottom Navigation Buttons ─── */}
        <View style={styles.actionButtonsContainer}>
          {/* Button 1: Customer fare breakdown */}
          <Pressable
            style={styles.navActionButton}
            onPress={() => router.push("/chauffeur/earnings-breakdown" as never)}
            accessibilityRole="button"
            accessibilityLabel="Customer fare breakdown"
          >
            <View style={styles.actionBtnLeft}>
              <View style={styles.actionIconWrap}>
                <Ionicons name="receipt-outline" size={20} color="#10B981" />
              </View>
              <Text style={styles.actionBtnText}>Customer fare breakdown</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
          </Pressable>

          {/* Button 2: Earnings Activity */}
          <Pressable
            style={styles.navActionButton}
            onPress={() => {
              const weekParam = currentWeekStart ? `?weekStart=${encodeURIComponent(currentWeekStart)}` : "";
              router.push(`/chauffeur/earnings-activity${weekParam}` as never);
            }}
            accessibilityRole="button"
            accessibilityLabel="Earnings Activity"
          >
            <View style={styles.actionBtnLeft}>
              <View style={styles.actionIconWrap}>
                <Ionicons name="time-outline" size={20} color="#3B82F6" />
              </View>
              <Text style={styles.actionBtnText}>Earnings Activity</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
          </Pressable>
        </View>
      </ScrollView>

      {/* ─── Stats Calculation Modal ─── */}
      <Modal
        visible={showStatsModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowStatsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>How we calculate stats</Text>
              <Pressable onPress={() => setShowStatsModal(false)} hitSlop={12}>
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <View style={styles.modalItem}>
                <Text style={styles.modalSubtitle}>Online Time</Text>
                <Text style={styles.modalDesc}>
                  The total time you were online in the A2B Chauffeur app available for rides or on active trips during this weekly cycle.
                </Text>
              </View>

              <View style={styles.modalItem}>
                <Text style={styles.modalSubtitle}>Trips</Text>
                <Text style={styles.modalDesc}>
                  The total number of completed rides during this weekly cycle, including standard, VIP, and daily lift club rides.
                </Text>
              </View>

              <View style={styles.modalItem}>
                <Text style={styles.modalSubtitle}>Points &amp; Rating</Text>
                <Text style={styles.modalDesc}>
                  Your chauffeur quality score based on passenger reviews, punctuality, trip acceptance rate, and completion rate.
                </Text>
              </View>
            </ScrollView>

            <Pressable
              style={styles.modalDoneBtn}
              onPress={() => setShowStatsModal(false)}
            >
              <Text style={styles.modalDoneBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

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
              <Text style={styles.modalTitle}>Weekly Earnings Details</Text>
              <Pressable onPress={() => setShowHelpModal(false)} hitSlop={12}>
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <View style={styles.modalItem}>
                <Text style={styles.modalSubtitle}>Cycle Timing</Text>
                <Text style={styles.modalDesc}>
                  Weeks run from Monday 4:00 AM SAST to Monday 3:59 AM SAST. All amounts are calculated and settled in South African Rand (ZAR).
                </Text>
              </View>
              <View style={styles.modalItem}>
                <Text style={styles.modalSubtitle}>Breakdown vs Activity</Text>
                <Text style={styles.modalDesc}>
                  Use "Customer fare breakdown" to inspect fare splits, platform commissions, and taxes. Use "Earnings Activity" to review trip-by-trip earnings.
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
    backgroundColor: "#0B0C10",
  },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    padding: 6,
  },
  dateRangePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#161922",
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#262C3A",
    gap: 6,
  },
  dateRangeText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  helpIconBtn: {
    padding: 6,
  },
  helpCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: "#9CA3AF",
    alignItems: "center",
    justifyContent: "center",
  },
  helpQuestion: {
    color: "#9CA3AF",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    lineHeight: 16,
    textAlign: "center",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 16,
  },
  carouselRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  carouselArrow: {
    padding: 10,
  },
  carouselArrowDisabled: {
    opacity: 0.3,
  },
  carouselCenter: {
    alignItems: "center",
  },
  carouselAmount: {
    fontSize: 34,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    letterSpacing: -0.8,
  },
  chartCard: {
    backgroundColor: "#14161F",
    borderRadius: 18,
    paddingVertical: 20,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#202532",
  },
  chartBarsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    height: 140,
    paddingHorizontal: 6,
    paddingBottom: 6,
  },
  chartCol: {
    alignItems: "center",
    flex: 1,
  },
  barTrack: {
    height: 100,
    width: 22,
    justifyContent: "flex-end",
    alignItems: "center",
    marginBottom: 8,
  },
  barFill: {
    width: 14,
    borderRadius: 7,
    backgroundColor: "#222736",
  },
  barFillActive: {
    backgroundColor: "#3B82F6",
  },
  barFillSelected: {
    backgroundColor: "#10B981",
  },
  dayName: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "#9CA3AF",
    marginBottom: 2,
  },
  dayNameSelected: {
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
  },
  dateNum: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#6B7280",
  },
  dateNumSelected: {
    color: "#10B981",
    fontFamily: "Inter_700Bold",
  },
  selectedDayBadge: {
    marginTop: 12,
    backgroundColor: "#1B202D",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  selectedDayText: {
    color: "#E5E7EB",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  statsCard: {
    backgroundColor: "#14161F",
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "#202532",
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingVertical: 8,
  },
  statItem: {
    alignItems: "center",
    flex: 1,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: "#262C3A",
  },
  statLabel: {
    fontSize: 13,
    color: "#9CA3AF",
    fontFamily: "Inter_500Medium",
    marginBottom: 6,
  },
  statValue: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },
  calcStatsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#1F2432",
    gap: 6,
  },
  calcStatsText: {
    color: "#9CA3AF",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  actionButtonsContainer: {
    gap: 12,
  },
  navActionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#14161F",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#202532",
  },
  actionBtnLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  actionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#1C202C",
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnText: {
    fontSize: 15,
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
  modalBody: {
    marginBottom: 16,
  },
  modalItem: {
    marginBottom: 14,
  },
  modalSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#10B981",
    marginBottom: 4,
  },
  modalDesc: {
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
