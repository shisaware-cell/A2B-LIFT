import React, { useState, useEffect, useCallback } from "react";
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
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest } from "@/lib/query-client";
import Colors from "@/constants/colors";

type WeekItem = {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  amount: number;
  days: number[];
  isCurrentWeek: boolean;
  hasTrips: boolean;
};

export default function EarningsSelectWeekScreen() {
  const insets = useSafeAreaInsets();
  const [chauffeurId, setChauffeurId] = useState<string | null>(null);
  const [weeks, setWeeks] = useState<WeekItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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

  const loadWeeks = useCallback(
    async (targetPage = 1, isRefresh = false) => {
      if (!chauffeurId) return;
      if (targetPage > 1) setLoadingMore(true);
      else if (!isRefresh) setLoading(true);

      try {
        const res = await apiRequest(
          "GET",
          `/api/earnings/chauffeur/${chauffeurId}/weeks?page=${targetPage}&limit=20`
        );
        if (res.ok) {
          const data = await res.json();
          const incomingWeeks: WeekItem[] = data.weeks || [];
          if (targetPage === 1) {
            setWeeks(incomingWeeks);
          } else {
            setWeeks((prev) => {
              const existingIds = new Set(prev.map((w) => w.id));
              const fresh = incomingWeeks.filter((w) => !existingIds.has(w.id));
              return [...prev, ...fresh];
            });
          }
          setHasMore(data.hasMore);
          setPage(targetPage);
        }
      } catch {
        // handle silently
      } finally {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [chauffeurId]
  );

  useEffect(() => {
    if (chauffeurId) {
      loadWeeks(1);
    }
  }, [chauffeurId, loadWeeks]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadWeeks(1, true);
  };

  const handleEndReached = () => {
    if (!loading && !loadingMore && hasMore) {
      loadWeeks(page + 1);
    }
  };

  const selectWeek = (week: WeekItem) => {
    router.replace({
      pathname: "/chauffeur/earnings-details",
      params: { weekStart: week.startDate },
    });
  };

  const renderWeekItem = ({ item }: { item: WeekItem }) => {
    return (
      <Pressable
        style={[styles.weekRow, item.isCurrentWeek && styles.currentWeekRow]}
        onPress={() => selectWeek(item)}
        accessibilityRole="button"
        accessibilityLabel={`Select week ${item.label}`}
      >
        <View style={styles.weekLeft}>
          <Text style={styles.weekLabel}>{item.label}</Text>
          <Text style={styles.weekAmount}>ZAR {Number(item.amount || 0).toFixed(2)}</Text>
        </View>

        <View style={styles.weekRight}>
          {/* 7-day mini indicator dots matching M T W T F S S columns */}
          <View style={styles.miniDaysRow}>
            {[0, 1, 2, 3, 4, 5, 6].map((dayIdx) => (
              <View
                key={dayIdx}
                style={[
                  styles.miniDayDot,
                  item.amount > 0 ? styles.miniDayDotActive : styles.miniDayDotDim,
                ]}
              />
            ))}
          </View>
          <Ionicons name="chevron-forward" size={16} color="#6B7280" />
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 64 : 12) }]}>
      {/* ─── Header ─── */}
      <View style={styles.headerRow}>
        <Pressable
          style={styles.closeBtn}
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={24} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.headerTitle}>Select week</Text>
      </View>

      {/* ─── Subheader / Column Labels (Image 3) ─── */}
      <View style={styles.columnsHeader}>
        <Text style={styles.colHeaderLeft}>Weekly earnings</Text>
        <View style={styles.colHeaderRight}>
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <Text key={i} style={styles.dayLetter}>
              {d}
            </Text>
          ))}
          <View style={{ width: 16 }} />
        </View>
      </View>

      {/* ─── Weeks List ─── */}
      {loading && weeks.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#10B981" />
        </View>
      ) : (
        <FlatList
          data={weeks}
          keyExtractor={(item) => item.id}
          renderItem={renderWeekItem}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#FFFFFF"
              colors={["#10B981"]}
            />
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color="#10B981" />
              </View>
            ) : null
          }
          ListEmptyComponent={
            !loading ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No historical weeks found.</Text>
              </View>
            ) : null
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 16,
  },
  closeBtn: {
    padding: 6,
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },
  columnsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1A1E29",
  },
  colHeaderLeft: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#9CA3AF",
  },
  colHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dayLetter: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#6B7280",
    width: 10,
    textAlign: "center",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  weekRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#141720",
  },
  currentWeekRow: {
    backgroundColor: "rgba(16, 185, 129, 0.05)",
    borderRadius: 12,
    borderBottomColor: "transparent",
  },
  weekLeft: {
    flex: 1,
  },
  weekLabel: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  weekAmount: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#9CA3AF",
  },
  weekRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  miniDaysRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  miniDayDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  miniDayDotActive: {
    backgroundColor: "#10B981",
  },
  miniDayDotDim: {
    backgroundColor: "#222736",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: "center",
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: "center",
  },
  emptyText: {
    color: "#6B7280",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
});
