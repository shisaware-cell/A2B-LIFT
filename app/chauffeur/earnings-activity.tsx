import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";
import Colors from "@/constants/colors";

type ActivityItem = {
  id: string;
  date: string;
  timeFormatted: string;
  dateFormatted: string;
  pickupAddress: string;
  dropoffAddress: string;
  grossFare: number;
  netAmount: number;
  vehicleType: string;
  paymentMethod: string;
};

export default function EarningsActivityScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ weekStart?: string }>();
  const [chauffeurId, setChauffeurId] = useState<string | null>(null);
  const [currentWeekStart, setCurrentWeekStart] = useState<string | null>(params.weekStart || null);

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
    data: activityData,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["/api/earnings/chauffeur", chauffeurId, "activity", currentWeekStart],
    queryFn: async () => {
      if (!chauffeurId) return null;
      const url = currentWeekStart
        ? `/api/earnings/chauffeur/${chauffeurId}/activity?weekStart=${encodeURIComponent(currentWeekStart)}`
        : `/api/earnings/chauffeur/${chauffeurId}/activity`;
      const res = await apiRequest("GET", url);
      if (!res.ok) throw new Error("Failed to load activity");
      return res.json();
    },
    enabled: !!chauffeurId,
  });

  const periodLabel = activityData?.periodLabel || "Selected Week";
  const activities: ActivityItem[] = activityData?.activities || [];
  const totalAmount = Number(activityData?.totalAmount || 0).toFixed(2);

  const renderActivityItem = ({ item }: { item: ActivityItem }) => {
    const title =
      item.vehicleType === "luxury_van" ? "Luxury Van Ride" :
      item.vehicleType === "business" ? "Business Class Ride" :
      item.vehicleType === "lift_club" ? "Daily Lift Club" : "Standard Ride";

    return (
      <View style={styles.activityCard}>
        <View style={styles.activityHeaderRow}>
          <View style={styles.activityTitleWrap}>
            <View style={styles.activityIconWrap}>
              <Ionicons name="car-sport" size={16} color="#10B981" />
            </View>
            <Text style={styles.activityTitle}>{title}</Text>
          </View>
          <Text style={styles.activityAmount}>ZAR {Number(item.netAmount || 0).toFixed(2)}</Text>
        </View>

        <View style={styles.activityMetaRow}>
          <Text style={styles.activityTime}>
            {item.dateFormatted}, {item.timeFormatted}
          </Text>
          <Text style={styles.paymentBadge}>{item.paymentMethod.toUpperCase()}</Text>
        </View>

        <View style={styles.routeContainer}>
          <View style={styles.routeStep}>
            <View style={[styles.routeDot, { backgroundColor: "#10B981" }]} />
            <Text style={styles.routeText} numberOfLines={1}>
              {item.pickupAddress}
            </Text>
          </View>
          <View style={styles.routeStep}>
            <View style={[styles.routeDot, { backgroundColor: "#3B82F6" }]} />
            <Text style={styles.routeText} numberOfLines={1}>
              {item.dropoffAddress}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const renderFooter = () => {
    return (
      <View style={styles.footerContainer}>
        <Text style={styles.endOfActivitiesText}>
          End of activities during {periodLabel}
        </Text>
        <Pressable
          style={styles.editDateBtn}
          onPress={() => router.push("/chauffeur/earnings-select-week" as never)}
          accessibilityRole="button"
          accessibilityLabel="Edit date range"
        >
          <Ionicons name="calendar-outline" size={16} color="#FFFFFF" />
          <Text style={styles.editDateBtnText}>Edit date range</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 64 : 12) }]}>
      {/* ─── Header Bar ─── */}
      <View style={styles.headerRow}>
        <Pressable
          style={styles.headerActionBtn}
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </Pressable>

        <Text style={styles.headerTitle}>Earnings Activity</Text>

        <View style={styles.headerRightIcons}>
          <Pressable
            style={styles.headerIconBtn}
            onPress={() => router.push("/chauffeur/earnings-select-week" as never)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Select date"
          >
            <Ionicons name="calendar-outline" size={20} color="#FFFFFF" />
          </Pressable>
          <Pressable
            style={styles.headerIconBtn}
            onPress={() => router.push("/chauffeur/earnings-select-week" as never)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Filter"
          >
            <Ionicons name="options-outline" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      {/* ─── Date Range Pill (Image 4 top pill) ─── */}
      <View style={styles.datePillContainer}>
        <Pressable
          style={styles.datePill}
          onPress={() => router.push("/chauffeur/earnings-select-week" as never)}
          accessibilityRole="button"
          accessibilityLabel="Change date range"
        >
          <Text style={styles.datePillText}>{periodLabel}</Text>
          <Ionicons name="chevron-down" size={14} color="#9CA3AF" />
        </Pressable>
        <Text style={styles.totalWeekSum}>Total: ZAR {totalAmount}</Text>
      </View>

      {/* ─── Activities List ─── */}
      {isLoading && activities.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#10B981" />
        </View>
      ) : (
        <FlatList
          data={activities}
          keyExtractor={(item) => item.id}
          renderItem={renderActivityItem}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={refetch}
              tintColor="#FFFFFF"
              colors={["#10B981"]}
            />
          }
          ListFooterComponent={renderFooter}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="receipt-outline" size={28} color="#4B5563" />
              </View>
              <Text style={styles.emptyTitle}>No activities for this period</Text>
              <Text style={styles.emptySubtitle}>
                Completed rides and fare adjustments will appear here automatically.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B0C10",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerActionBtn: {
    padding: 6,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },
  headerRightIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerIconBtn: {
    padding: 6,
  },
  datePillContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#171A24",
  },
  datePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#161922",
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#252B3A",
    gap: 6,
  },
  datePillText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  totalWeekSum: {
    color: "#10B981",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 12,
  },
  activityCard: {
    backgroundColor: "#14161F",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#202532",
    marginBottom: 12,
  },
  activityHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  activityTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  activityIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  activityTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },
  activityAmount: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#10B981",
  },
  activityMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  activityTime: {
    fontSize: 12,
    color: "#9CA3AF",
    fontFamily: "Inter_400Regular",
  },
  paymentBadge: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: "#6B7280",
    letterSpacing: 0.5,
  },
  routeContainer: {
    gap: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#1C202C",
  },
  routeStep: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  routeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  routeText: {
    fontSize: 12,
    color: "#D1D5DB",
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  footerContainer: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 14,
  },
  endOfActivitiesText: {
    color: "#6B7280",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
  editDateBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1F2432",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 20,
    gap: 8,
  },
  editDateBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: "center",
    gap: 8,
  },
  emptyIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#161922",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  emptyTitle: {
    color: "#E5E7EB",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  emptySubtitle: {
    color: "#6B7280",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    maxWidth: 260,
  },
});
