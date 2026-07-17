import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiRequest } from "@/lib/query-client";
import Colors from "@/constants/colors";

type LiftClubRouteState = {
  route: any | null;
  canPublish: boolean;
  isApproved: boolean;
  vehicle: any | null;
};

export default function ChauffeurLiftClubScreen() {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<LiftClubRouteState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pickupArea, setPickupArea] = useState("");
  const [destinationArea, setDestinationArea] = useState("");
  const [departureWindow, setDepartureWindow] = useState("Weekday mornings");
  const [weeklyPrice, setWeeklyPrice] = useState("");
  const [monthlyPrice, setMonthlyPrice] = useState("");
  const [totalSeats, setTotalSeats] = useState("");

  async function loadRoute() {
    try {
      setLoading(true);
      const res = await apiRequest("GET", "/api/lift-club/my-route");
      const data = await res.json();
      setState(data);
      const route = data.route;
      if (route) {
        setPickupArea(String(route.pickupArea || ""));
        setDestinationArea(String(route.destinationArea || ""));
        setDepartureWindow(String(route.departureWindow || "Weekday mornings"));
        setWeeklyPrice(route.weeklyPrice ? String(Math.round(Number(route.weeklyPrice))) : "");
        setMonthlyPrice(route.monthlyPrice ? String(Math.round(Number(route.monthlyPrice))) : "");
        setTotalSeats(route.totalSeats ? String(route.totalSeats) : "");
      } else if (data.vehicle) {
        setTotalSeats(String(data.vehicle.passengerCapacity || 1));
      }
    } catch (error: any) {
      Alert.alert("Daily Lift Club", error?.message?.replace(/^\d+:\s*/, "") || "Unable to load your Lift Club availability.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRoute();
  }, []);

  async function saveRoute(available = true) {
    try {
      setSaving(true);
      const body = available
        ? {
            available: true,
            pickupArea,
            destinationArea,
            departureWindow,
            weeklyPrice: Number(weeklyPrice),
            monthlyPrice: Number(monthlyPrice),
            totalSeats: Number(totalSeats),
          }
        : { available: false };
      const res = await apiRequest("POST", "/api/lift-club/my-route", body);
      const data = await res.json();
      setState((current) => ({ ...(current || {}), route: data.route || null, canPublish: current?.canPublish ?? true, isApproved: current?.isApproved ?? true, vehicle: current?.vehicle || null }));
      Alert.alert("Daily Lift Club", available ? "Your Lift Club car is now available to approved members." : "Your Lift Club car is now turned off.");
      await loadRoute();
    } catch (error: any) {
      Alert.alert("Could not save", error?.message?.replace(/^\d+:\s*/, "") || "Please check your route details and try again.");
    } finally {
      setSaving(false);
    }
  }

  const routeStatus = state?.route?.status || "not_published";
  const seatsHint = state?.vehicle ? `${state.vehicle.carMake || ""} ${state.vehicle.vehicleModel || ""} · ${state.vehicle.vehicleYear || ""}`.trim() : "Approved active vehicle required";

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 60 : 12) }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 140 }]}
      showsVerticalScrollIndicator={false}
    >
      <Pressable style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={26} color={Colors.white} />
      </Pressable>

      <Text style={styles.title}>Daily Lift Club Availability</Text>
      <Text style={styles.subtitle}>Publish weekday commute seats for approved Lift Club members. Only approved vehicles from 2015 onward can be listed.</Text>

      {loading ? (
        <View style={styles.card}>
          <ActivityIndicator color={Colors.white} />
          <Text style={styles.muted}>Loading availability...</Text>
        </View>
      ) : (
        <>
          <View style={styles.statusCard}>
            <View style={styles.statusIcon}>
              <Ionicons name="ribbon-outline" size={22} color="#2A1D00" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.statusTitle}>{routeStatus.replace(/_/g, " ")}</Text>
              <Text style={styles.muted}>{seatsHint}</Text>
            </View>
          </View>

          {!state?.canPublish && (
            <View style={styles.notice}>
              <Ionicons name="alert-circle-outline" size={20} color={Colors.warning} />
              <Text style={styles.noticeText}>
                Your driver profile and active vehicle must be approved before you can publish a Lift Club route.
              </Text>
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Route details</Text>
            <TextInput style={styles.input} placeholder="Pickup area, e.g. Randburg" placeholderTextColor={Colors.textMuted} value={pickupArea} onChangeText={setPickupArea} />
            <TextInput style={styles.input} placeholder="Workplace area, e.g. Sandton" placeholderTextColor={Colors.textMuted} value={destinationArea} onChangeText={setDestinationArea} />
            <TextInput style={styles.input} placeholder="Departure window, e.g. 06:30 - 08:00" placeholderTextColor={Colors.textMuted} value={departureWindow} onChangeText={setDepartureWindow} />
            <View style={styles.twoCols}>
              <TextInput style={[styles.input, styles.colInput]} placeholder="Weekly price" placeholderTextColor={Colors.textMuted} value={weeklyPrice} onChangeText={setWeeklyPrice} keyboardType="numeric" />
              <TextInput style={[styles.input, styles.colInput]} placeholder="Monthly price" placeholderTextColor={Colors.textMuted} value={monthlyPrice} onChangeText={setMonthlyPrice} keyboardType="numeric" />
            </View>
            <TextInput style={styles.input} placeholder="Available seats" placeholderTextColor={Colors.textMuted} value={totalSeats} onChangeText={setTotalSeats} keyboardType="numeric" />
          </View>

          <Pressable style={[styles.primaryButton, (!state?.canPublish || saving) && styles.disabled]} disabled={!state?.canPublish || saving} onPress={() => saveRoute(true)}>
            {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryText}>Publish Lift Club car</Text>}
          </Pressable>

          {state?.route && (
            <Pressable style={[styles.secondaryButton, saving && styles.disabled]} disabled={saving} onPress={() => saveRoute(false)}>
              <Text style={styles.secondaryText}>Disable Lift Club availability</Text>
            </Pressable>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary, paddingHorizontal: 20 },
  content: { paddingBottom: 48 },
  backButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", color: Colors.white, marginBottom: 8 },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary, lineHeight: 21, marginBottom: 18 },
  card: { backgroundColor: Colors.card, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: Colors.border, gap: 12, marginBottom: 16 },
  statusCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: Colors.card, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: Colors.border, marginBottom: 16 },
  statusIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#F7C948", alignItems: "center", justifyContent: "center" },
  statusTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.white, textTransform: "capitalize", marginBottom: 3 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.white },
  muted: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, lineHeight: 19 },
  notice: { flexDirection: "row", gap: 10, backgroundColor: "rgba(247,201,72,0.1)", borderWidth: 1, borderColor: "rgba(247,201,72,0.25)", borderRadius: 16, padding: 14, marginBottom: 16 },
  noticeText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.warning, lineHeight: 19 },
  input: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, color: Colors.white, fontSize: 14, fontFamily: "Inter_400Regular", backgroundColor: "rgba(255,255,255,0.04)" },
  twoCols: { flexDirection: "row", gap: 10 },
  colInput: { flex: 1 },
  primaryButton: { height: 58, borderRadius: 16, backgroundColor: Colors.white, alignItems: "center", justifyContent: "center" },
  primaryText: { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.primary },
  secondaryButton: { height: 52, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center", marginTop: 12 },
  secondaryText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.white },
  disabled: { opacity: 0.55 },
});
