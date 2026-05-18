import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator, Alert, RefreshControl, Platform, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { apiRequest } from "@/lib/query-client";
import Colors from "@/constants/colors";

export default function FleetScreen() {
  const insets = useSafeAreaInsets();
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [overview, setOverview] = useState({ vehicles: 0, assignedDrivers: 0, activeTrips: 0, pendingApprovals: 0 });
  const [query, setQuery] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [vehicleRes, assignmentRes, overviewRes] = await Promise.all([
        apiRequest("GET", "/api/vehicles"),
        apiRequest("GET", "/api/fleet/assignments"),
        apiRequest("GET", "/api/fleet/overview"),
      ]);
      const profileRes = await apiRequest("GET", "/api/operator-profile/me").catch(() => null);
      const profileData = profileRes?.ok ? await profileRes.json() : null;
      const vehicleData = await vehicleRes.json();
      const assignmentData = await assignmentRes.json();
      const overviewData = await overviewRes.json();
      const profile = profileData?.profile || null;
      setVehicles((vehicleData.vehicles || []).filter((vehicle: any) => (
        vehicle.status === "approved" && (!profile?.id || vehicle.ownerOperatorProfileId === profile.id)
      )));
      setAssignments(assignmentData.assignments || []);
      setOverview({
        vehicles: overviewData?.overview?.vehicles || 0,
        assignedDrivers: overviewData?.overview?.assignedDrivers || 0,
        activeTrips: overviewData?.overview?.activeTrips || 0,
        pendingApprovals: overviewData?.overview?.pendingApprovals || 0,
      });
    } catch {
      Alert.alert("Error", "Could not load fleet.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const searchDrivers = useCallback(async () => {
    try {
      const res = await apiRequest("GET", `/api/fleet/drivers/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setDrivers(data.drivers || []);
    } catch {}
  }, [query]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const timer = setTimeout(searchDrivers, 250);
    return () => clearTimeout(timer);
  }, [searchDrivers]);

  async function assignDriver() {
    if (!selectedVehicleId || !selectedDriverId) {
      Alert.alert("Select vehicle and driver", "Choose an approved vehicle and an approved driver first.");
      return;
    }
    setSaving(true);
    try {
      await apiRequest("POST", "/api/fleet/assignments", {
        vehicleId: selectedVehicleId,
        driverOperatorProfileId: selectedDriverId,
      });
      setSelectedDriverId("");
      await load();
      Alert.alert("Driver assigned", "Both parties have been notified.");
    } catch (e: any) {
      Alert.alert("Could not assign driver", e.message || "Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function removeAssignment(assignmentId: string) {
    try {
      await apiRequest("DELETE", `/api/fleet/assignments/${assignmentId}`);
      await load();
      Alert.alert("Assignment removed", "The driver has been notified.");
    } catch (e: any) {
      Alert.alert("Could not remove assignment", e.message || "Please try again.");
    }
  }

  function callDriver(phone?: string | null) {
    if (!phone) {
      Alert.alert("No phone number", "This driver does not have a phone number on file.");
      return;
    }
    Linking.openURL(`tel:${phone}`).catch(() => Alert.alert("Could not start call", phone));
  }

  if (loading) return <View style={[styles.container, styles.center]}><ActivityIndicator color={Colors.white} /></View>;

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 14) }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color={Colors.white} /></Pressable>
        <Text style={styles.title}>Fleet</Text>
        <View style={styles.backBtn} />
      </View>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.white} />}
      >
        <View style={styles.overviewGrid}>
          {[
            ["Vehicles", overview.vehicles],
            ["Drivers", overview.assignedDrivers],
            ["Active trips", overview.activeTrips],
            ["Pending", overview.pendingApprovals],
          ].map(([label, value]) => (
            <View key={label} style={styles.overviewCard}>
              <Text style={styles.overviewValue}>{value}</Text>
              <Text style={styles.overviewLabel}>{label}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Assign driver to vehicle</Text>
        <View style={styles.form}>
          <Text style={styles.helperText}>Search A2B-approved drivers, choose one of your approved cars, then assign them. Drivers can be called from this screen before matching.</Text>
          <TextInput style={styles.input} value={query} onChangeText={setQuery} placeholder="Search approved drivers" placeholderTextColor={Colors.textMuted} />
          <View style={styles.choiceGrid}>
            {vehicles.length === 0 ? (
              <Text style={styles.emptyText}>No approved vehicles available for matching yet.</Text>
            ) : vehicles.map((vehicle) => (
              <Pressable key={vehicle.id} style={[styles.choice, selectedVehicleId === vehicle.id && styles.choiceActive]} onPress={() => setSelectedVehicleId(vehicle.id)}>
                <Text style={styles.choiceTitle}>{vehicle.carMake} {vehicle.vehicleModel}</Text>
                <Text style={styles.choiceMeta}>{vehicle.plateNumber}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.choiceGrid}>
            {drivers.length === 0 ? (
              <Text style={styles.emptyText}>{query.trim() ? "No approved drivers matched your search." : "Approved drivers will appear here."}</Text>
            ) : drivers.map((driver) => (
              <Pressable key={driver.id} style={[styles.choice, selectedDriverId === driver.id && styles.choiceActive]} onPress={() => setSelectedDriverId(driver.id)}>
                <Text style={styles.choiceTitle}>{driver.user?.name || "Approved driver"}</Text>
                <Pressable onPress={() => callDriver(driver.user?.phone || driver.chauffeur?.phone)}>
                  <Text style={styles.choiceMeta}>{driver.user?.phone || driver.chauffeur?.phone || driver.user?.username}</Text>
                </Pressable>
              </Pressable>
            ))}
          </View>
          <Pressable style={[styles.submitBtn, saving && { opacity: 0.7 }]} onPress={assignDriver} disabled={saving}>
            {saving ? <ActivityIndicator color={Colors.primary} /> : <Text style={styles.submitText}>Assign Driver</Text>}
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>Current assignments</Text>
        {assignments.length === 0 ? (
          <Text style={styles.emptyText}>No assignments yet.</Text>
        ) : assignments.map((assignment) => (
          <View key={assignment.id} style={styles.assignmentCard}>
            <Ionicons name={assignment.status === "active" ? "link-outline" : "unlink-outline"} size={20} color={assignment.status === "active" ? Colors.success : Colors.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={styles.assignmentTitle}>{assignment.vehicle?.carMake} {assignment.vehicle?.vehicleModel}</Text>
              <Text style={styles.assignmentMeta}>{assignment.driver?.user?.name || "Driver"} · {assignment.status}</Text>
              <Pressable onPress={() => callDriver(assignment.driver?.user?.phone || assignment.driver?.chauffeur?.phone)}>
                <Text style={styles.assignmentPhone}>{assignment.driver?.user?.phone || assignment.driver?.chauffeur?.phone || "No phone number"}</Text>
              </Pressable>
            </View>
            {assignment.status === "active" && (
              <Pressable style={styles.removeBtn} onPress={() => removeAssignment(assignment.id)}>
                <Ionicons name="remove-circle-outline" size={20} color={Colors.error} />
              </Pressable>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  center: { alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 12 },
  backBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.white },
  content: { paddingHorizontal: 20 },
  overviewGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  overviewCard: { width: "48%", minHeight: 74, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card, alignItems: "center", justifyContent: "center" },
  overviewValue: { color: Colors.white, fontFamily: "Inter_700Bold", fontSize: 20 },
  overviewLabel: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 11, textTransform: "uppercase", marginTop: 2 },
  sectionTitle: { fontSize: 13, fontFamily: "Inter_700Bold", color: Colors.textSecondary, textTransform: "uppercase", marginTop: 14, marginBottom: 10 },
  form: { gap: 10, marginBottom: 18 },
  helperText: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18 },
  input: { minHeight: 46, borderRadius: 12, paddingHorizontal: 14, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, color: Colors.white },
  choiceGrid: { gap: 8 },
  choice: { padding: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card },
  choiceActive: { borderColor: Colors.accent, backgroundColor: "rgba(255,255,255,0.06)" },
  choiceTitle: { color: Colors.white, fontFamily: "Inter_700Bold", fontSize: 14 },
  choiceMeta: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 3 },
  submitBtn: { minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: Colors.white },
  submitText: { color: Colors.primary, fontFamily: "Inter_700Bold" },
  emptyText: { color: Colors.textMuted, fontFamily: "Inter_400Regular" },
  assignmentCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 12, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, marginBottom: 10 },
  assignmentTitle: { color: Colors.white, fontFamily: "Inter_700Bold", fontSize: 14 },
  assignmentMeta: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 3 },
  assignmentPhone: { color: Colors.accent, fontFamily: "Inter_600SemiBold", fontSize: 12, marginTop: 5 },
  removeBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,77,77,0.1)" },
});
