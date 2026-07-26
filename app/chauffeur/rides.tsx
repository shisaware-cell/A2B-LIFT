import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Platform,
  RefreshControl,
  Pressable,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { getDriverNetFare } from "@shared/fare-policy";

function getGrossFare(ride: any) {
  return Number(ride?.finalFare || ride?.price || ride?.actualFare || ride?.quotedFare || 0);
}

function getDriverFare(ride: any) {
  return getDriverNetFare(getGrossFare(ride), ride?.commissionRate);
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
}

function formatTime(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
}

function getStatusColor(status: string) {
  switch (status) {
    case "trip_completed": return Colors.success;
    case "cancelled": return Colors.error;
    default: return Colors.warning;
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case "trip_completed": return "Completed";
    case "cancelled": return "Cancelled";
    case "chauffeur_assigned": return "Assigned";
    case "chauffeur_arriving": return "Arriving";
    case "trip_started": return "In Progress";
    default: return status;
  }
}

function DetailRow({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIconWrap}>
        <Ionicons name={icon} size={16} color={Colors.textMuted} />
      </View>
      <View style={styles.detailTextWrap}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

function RideDetail({ ride, onBack }: { ride: any; onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const statusColor = getStatusColor(ride.status);
  const grossFare = getGrossFare(ride);
  const driverFare = getDriverFare(ride);

  const earningsCalc = grossFare
    ? { chauffeur: driverFare.toFixed(2), commission: (grossFare - driverFare).toFixed(2) }
    : null;

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) }]}>
      {/* Header */}
      <View style={styles.detailHeader}>
        <Pressable style={styles.backBtn} onPress={onBack}>
          <Ionicons name="arrow-back" size={20} color={Colors.white} />
        </Pressable>
        <Text style={styles.detailTitle}>Ride Details</Text>
        <View style={[styles.statusBadge, { backgroundColor: `${statusColor}20`, borderColor: `${statusColor}40` }]}>
          <View style={[styles.statusDotSmall, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusBadgeText, { color: statusColor }]}>{getStatusLabel(ride.status)}</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.detailScroll}>
        {/* Route card */}
        <View style={styles.detailCard}>
          <Text style={styles.detailCardTitle}>Route</Text>
          <View style={styles.routeStack}>
            <View style={styles.routeItem}>
              <View style={styles.routeIconCol}>
                <View style={[styles.routeDot, { backgroundColor: Colors.success }]} />
                <View style={styles.routeLine} />
              </View>
              <View style={styles.routeTextCol}>
                <Text style={styles.routeTypeLabel}>Pickup</Text>
                <Text style={styles.routeAddress}>{ride.pickupAddress || "Location unavailable"}</Text>
              </View>
            </View>
            <View style={styles.routeItem}>
              <View style={styles.routeIconCol}>
                <View style={[styles.routeDot, { backgroundColor: Colors.error }]} />
              </View>
              <View style={styles.routeTextCol}>
                <Text style={styles.routeTypeLabel}>Dropoff</Text>
                <Text style={styles.routeAddress}>{ride.dropoffAddress || "Location unavailable"}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Trip info */}
        <View style={styles.detailCard}>
          <Text style={styles.detailCardTitle}>Trip Info</Text>
          <DetailRow icon="calendar-outline" label="Date" value={formatDate(ride.createdAt)} />
          <DetailRow icon="time-outline" label="Time" value={formatTime(ride.createdAt)} />
          {ride.completedAt && (
            <DetailRow icon="checkmark-circle-outline" label="Completed At" value={`${formatDate(ride.completedAt)} ${formatTime(ride.completedAt)}`} />
          )}
          {ride.distanceKm && (
            <DetailRow icon="navigate-outline" label="Distance" value={`${Number(ride.distanceKm).toFixed(1)} km`} />
          )}
          {ride.vehicleType && (
            <DetailRow icon="car-sport-outline" label="Vehicle Type" value={ride.vehicleType.replace(/_/g, " ")} />
          )}
        </View>

        {/* Earnings */}
        <View style={styles.detailCard}>
          <Text style={styles.detailCardTitle}>Earnings</Text>
          <View style={styles.earningsRow}>
            <View style={styles.earningsItem}>
              <Text style={styles.earningsAmount}>R {grossFare ? grossFare.toFixed(2) : "—"}</Text>
              <Text style={styles.earningsLabel}>Total Fare</Text>
            </View>
            {earningsCalc && (
              <>
                <View style={styles.earningsDivider} />
                <View style={styles.earningsItem}>
                  <Text style={[styles.earningsAmount, { color: Colors.success }]}>R {earningsCalc.chauffeur}</Text>
                  <Text style={styles.earningsLabel}>Your Earnings</Text>
                </View>
                <View style={styles.earningsDivider} />
                <View style={styles.earningsItem}>
                  <Text style={[styles.earningsAmount, { color: Colors.textMuted }]}>R {earningsCalc.commission}</Text>
                  <Text style={styles.earningsLabel}>Commission</Text>
                </View>
              </>
            )}
          </View>
          <DetailRow icon="cash-outline" label="Payment Method" value={(ride.paymentMethod || "cash").toUpperCase()} />
          <DetailRow icon="shield-checkmark-outline" label="Payment Status" value={(ride.paymentStatus || "unpaid").toUpperCase()} />
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>
    </View>
  );
}

export default function ChauffeurRidesScreen() {
  const insets = useSafeAreaInsets();
  const [chauffeurId, setChauffeurId] = useState<string | null>(null);
  const [selectedRide, setSelectedRide] = useState<any | null>(null);

  useEffect(() => {
    AsyncStorage.getItem("a2b_chauffeur").then((stored) => {
      if (stored) setChauffeurId(JSON.parse(stored).id);
    });
  }, []);

  const { data: rides, isLoading, refetch } = useQuery({
    queryKey: ["/api/rides/chauffeur", chauffeurId || ""],
    enabled: !!chauffeurId,
  });

  const renderRide = useCallback(({ item }: { item: any }) => (
    <Pressable
      style={({ pressed }) => [styles.rideCard, pressed && { opacity: 0.8 }]}
      onPress={() => setSelectedRide(item)}
    >
      <View style={styles.rideTop}>
        <View style={styles.routeCol}>
          <View style={styles.rideRouteRow}>
            <View style={styles.dotGreen} />
            <Text style={styles.routeText} numberOfLines={1}>{item.pickupAddress || "Pickup"}</Text>
          </View>
          <View style={styles.rideRouteRow}>
            <View style={styles.dotRed} />
            <Text style={styles.routeText} numberOfLines={1}>{item.dropoffAddress || "Dropoff"}</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
      </View>
      <View style={styles.rideBottom}>
        <View style={styles.rideMetaRow}>
          <View style={[styles.statusChip, { backgroundColor: `${getStatusColor(item.status)}20` }]}>
            <Text style={[styles.statusChipText, { color: getStatusColor(item.status) }]}>{getStatusLabel(item.status)}</Text>
          </View>
          <Text style={styles.rideDate}>{formatDate(item.createdAt)}</Text>
        </View>
        <Text style={styles.ridePrice}>R {getDriverFare(item).toFixed(0)}</Text>
      </View>
    </Pressable>
  ), []);

  if (selectedRide) {
    return <RideDetail ride={selectedRide} onBack={() => setSelectedRide(null)} />;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16) }]}>
      <Text style={styles.title}>My Rides</Text>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.white} />
        </View>
      ) : !rides || (Array.isArray(rides) && rides.length === 0) ? (
        <View style={styles.center}>
          <Ionicons name="car-sport-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyText}>No rides yet</Text>
          <Text style={styles.emptySubtext}>Go online to receive ride requests</Text>
        </View>
      ) : (
        <FlatList
          data={Array.isArray(rides) ? rides : []}
          keyExtractor={(item) => item.id}
          renderItem={renderRide}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor={Colors.white} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary, paddingHorizontal: 20 },
  title: { fontSize: 24, fontFamily: "Inter_700Bold", color: Colors.white, marginBottom: 20 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  emptyText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary },
  emptySubtext: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  list: { gap: 12, paddingBottom: 100 },

  rideCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  rideTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  routeCol: { flex: 1, gap: 8 },
  rideRouteRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  dotGreen: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success },
  dotRed: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.error },
  routeText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  rideBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rideMetaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusChipText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  rideDate: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  ridePrice: { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.white },

  // Detail view
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 16,
    paddingBottom: 20,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  detailTitle: {
    flex: 1,
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusDotSmall: { width: 6, height: 6, borderRadius: 3 },
  statusBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  detailScroll: { paddingBottom: 40 },
  detailCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 18,
    gap: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 14,
  },
  detailCardTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },

  routeStack: { gap: 0 },
  routeItem: { flexDirection: "row", gap: 12, minHeight: 48 },
  routeIconCol: { alignItems: "center", paddingTop: 4, width: 16 },
  routeDot: { width: 12, height: 12, borderRadius: 6 },
  routeLine: { flex: 1, width: 2, backgroundColor: Colors.border, marginVertical: 4 },
  routeTextCol: { flex: 1, paddingBottom: 12 },
  routeTypeLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.textMuted, marginBottom: 2 },
  routeAddress: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary, lineHeight: 20 },

  detailRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  detailIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  detailTextWrap: { flex: 1, gap: 1 },
  detailLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  detailValue: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.white },

  earningsRow: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    gap: 0,
  },
  earningsItem: { flex: 1, alignItems: "center", gap: 4 },
  earningsAmount: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.white },
  earningsLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  earningsDivider: { width: 1, backgroundColor: Colors.border, marginHorizontal: 4 },
});
