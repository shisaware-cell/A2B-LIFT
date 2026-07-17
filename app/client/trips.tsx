import React, { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, Platform,
  RefreshControl, Pressable, Modal, ScrollView, TextInput, Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/query-client";
import Colors from "@/constants/colors";

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  reserved:           { label: "Reserved",    color: "#7B5CD6" },
  searching:          { label: "Searching",   color: Colors.warning },
  requested:          { label: "Searching",   color: Colors.warning },
  chauffeur_assigned: { label: "Assigned",    color: "#4A9EFF" },
  chauffeur_arriving: { label: "Arriving",    color: "#4A9EFF" },
  trip_started:       { label: "In Progress", color: "#A78BFA" },
  trip_completed:     { label: "Completed",   color: Colors.success },
  cancelled:          { label: "Cancelled",   color: Colors.error },
};

function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] ?? { label: status, color: Colors.textSecondary };
}
function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}
function formatTime(d: string) {
  return new Date(d).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
}

export default function TripsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [selectedTrip, setSelectedTrip] = useState<any>(null);
  const [helpMessage, setHelpMessage] = useState("");
  const [helpSent, setHelpSent] = useState(false);

  const { data: trips, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["/api/rides/client", user?.id ?? ""],
    enabled: !!user?.id,
    staleTime: 0,
  });

  useFocusEffect(
    useCallback(() => {
      if (user?.id) refetch();
    }, [user?.id])
  );

  const sendEnquiry = useMutation({
    mutationFn: async ({ rideId, message }: { rideId: string; message: string }) => {
      const res = await apiRequest("POST", "/api/trip-enquiries", { rideId, message });
      return res.json();
    },
    onSuccess: () => { setHelpSent(true); setHelpMessage(""); },
    onError: () => Alert.alert("Error", "Could not send message. Try again."),
  });

  function openTrip(trip: any) { setSelectedTrip(trip); setHelpSent(false); setHelpMessage(""); }
  function closeTrip() { setSelectedTrip(null); }

  const renderTrip = useCallback(({ item }: { item: any }) => {
    const { label, color } = getStatusConfig(item.status);
    const isActive = ["searching","requested","chauffeur_assigned","chauffeur_arriving","trip_started"].includes(item.status);
    return (
      <Pressable style={({ pressed }) => [styles.tripCard, isActive && styles.tripCardActive, pressed && { opacity: 0.85 }]} onPress={() => openTrip(item)}>
        <View style={styles.tripHeader}>
          <View style={[styles.statusChip, { backgroundColor: `${color}22` }]}>
            <View style={[styles.statusDot, { backgroundColor: color }]} />
            <Text style={[styles.statusLabel, { color }]}>{label}</Text>
          </View>
          <View style={styles.dateTimeRow}>
            <Text style={styles.tripDate}>{formatDate(item.status === "reserved" && item.scheduledFor ? item.scheduledFor : item.createdAt)}</Text>
            <Text style={styles.tripTime}>{formatTime(item.status === "reserved" && item.scheduledFor ? item.scheduledFor : item.createdAt)}</Text>
          </View>
        </View>
        <View style={styles.routeRow}>
          <View style={styles.routeDots}>
            <View style={styles.dotGreen} />
            <View style={styles.routeLine} />
            <View style={styles.dotRed} />
          </View>
          <View style={styles.routeAddresses}>
            <Text style={styles.routeAddress} numberOfLines={1}>{item.pickupAddress || "Pickup"}</Text>
            <Text style={styles.routeAddress} numberOfLines={1}>{item.dropoffAddress || "Dropoff"}</Text>
          </View>
        </View>
        <View style={styles.tripFooter}>
          <Text style={styles.vehicleType}>{(item.vehicleType || "Standard").replace(/\b\w/g, (c: string) => c.toUpperCase())}</Text>
          {item.distanceKm ? <Text style={styles.tripDistance}>{Number(item.distanceKm).toFixed(1)} km</Text> : null}
          <Text style={styles.tripPrice}>{item.price ? `R ${Number(item.price).toFixed(0)}` : "—"}</Text>
          <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
        </View>
      </Pressable>
    );
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16) }]}>
      <Text style={styles.title}>Trip History</Text>
      {isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.white} /></View>
      ) : !trips || !(trips as any[]).length ? (
        <View style={styles.center}>
          <Ionicons name="car-sport-outline" size={52} color={Colors.textMuted} />
          <Text style={styles.emptyText}>No trips yet</Text>
          <Text style={styles.emptySubtext}>Your ride history will appear here</Text>
        </View>
      ) : (
        <FlatList
          data={trips as any[]}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderTrip}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.white} />}
        />
      )}

      <Modal visible={!!selectedTrip} animationType="slide" presentationStyle="overFullScreen" transparent={false} onRequestClose={closeTrip}>
        <View style={styles.modalContainer}>
          <View style={[styles.modalHeader, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20) }]}>
            <Pressable onPress={closeTrip} style={styles.backBtn} hitSlop={8}>
              <Ionicons name="chevron-back" size={24} color={Colors.white} />
            </Pressable>
            <Text style={styles.modalTitle}>Trip Details</Text>
            <View style={styles.backBtn} />
          </View>
          {selectedTrip && (
            <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
              {(() => {
                const { label, color } = getStatusConfig(selectedTrip.status);
                return (
                  <View style={[styles.detailStatusChip, { backgroundColor: `${color}22` }]}>
                    <View style={[styles.statusDot, { backgroundColor: color }]} />
                    <Text style={[styles.statusLabel, { color, fontSize: 13 }]}>{label}</Text>
                  </View>
                );
              })()}

              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>{selectedTrip.status === "reserved" ? "Reserved for" : "Date & Time"}</Text>
                <Text style={styles.detailValue}>
                  {selectedTrip.status === "reserved" && selectedTrip.scheduledFor
                    ? `${formatDate(selectedTrip.scheduledFor)} at ${formatTime(selectedTrip.scheduledFor)}`
                    : `${formatDate(selectedTrip.createdAt)} at ${formatTime(selectedTrip.createdAt)}`}
                </Text>
              </View>

              {selectedTrip.status === "reserved" && (
                <Pressable
                  style={({ pressed }) => [styles.cancelReservationBtn, pressed && { opacity: 0.8 }]}
                  onPress={() => {
                    const half = (Number(selectedTrip.price || 0) / 2).toFixed(2);
                    Alert.alert(
                      "Cancel reservation?",
                      `If you cancel, a 50% cancellation fee of R${half} applies and R${half} is refunded to your card.`,
                      [
                        { text: "Keep reservation", style: "cancel" },
                        {
                          text: `Cancel & pay R${half} fee`,
                          style: "destructive",
                          onPress: async () => {
                            try {
                              await apiRequest("PUT", `/api/rides/${selectedTrip.id}/status`, { status: "cancelled" });
                              queryClient.invalidateQueries({ queryKey: ["/api/rides/client", user?.id ?? ""] });
                              closeTrip();
                              Alert.alert("Reservation cancelled", `R${half} will be refunded to your card.`);
                            } catch (e: any) {
                              Alert.alert("Error", (e?.message || "Could not cancel.").replace(/^\d+:\s*/, ""));
                            }
                          },
                        },
                      ],
                    );
                  }}
                >
                  <Ionicons name="close-circle-outline" size={18} color={Colors.error} />
                  <Text style={styles.cancelReservationText}>Cancel reservation (50% fee applies)</Text>
                </Pressable>
              )}

              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>Route</Text>
                <View style={styles.routeRow}>
                  <View style={styles.routeDots}>
                    <View style={styles.dotGreen} />
                    <View style={[styles.routeLine, { minHeight: 24 }]} />
                    <View style={styles.dotRed} />
                  </View>
                  <View style={styles.routeAddresses}>
                    <Text style={styles.detailValue}>{selectedTrip.pickupAddress || "—"}</Text>
                    <Text style={styles.detailValue}>{selectedTrip.dropoffAddress || "—"}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.fareCard}>
                <View style={styles.fareRow}>
                  <Text style={styles.fareLabel}>Vehicle</Text>
                  <Text style={styles.fareValue}>{selectedTrip.vehicleType || "Standard"}</Text>
                </View>
                {selectedTrip.distanceKm && (
                  <View style={styles.fareRow}>
                    <Text style={styles.fareLabel}>Distance</Text>
                    <Text style={styles.fareValue}>{Number(selectedTrip.distanceKm).toFixed(1)} km</Text>
                  </View>
                )}
                <View style={styles.fareRow}>
                  <Text style={styles.fareLabel}>Payment</Text>
                  <Text style={styles.fareValue}>{selectedTrip.paymentStatus || "—"}</Text>
                </View>
                <View style={[styles.fareRow, styles.fareTotalRow]}>
                  <Text style={styles.fareTotalLabel}>Total</Text>
                  <Text style={styles.fareTotalValue}>{selectedTrip.price ? `R ${Number(selectedTrip.price).toFixed(2)}` : "—"}</Text>
                </View>
              </View>

              <View style={styles.helpSection}>
                <View style={styles.helpHeader}>
                  <Ionicons name="help-circle-outline" size={20} color={Colors.white} />
                  <Text style={styles.helpTitle}>Need help with this trip?</Text>
                </View>
                <Text style={styles.helpSubtext}>Describe your issue and our team will respond via notification.</Text>
                {helpSent ? (
                  <View style={styles.helpSentBox}>
                    <Ionicons name="checkmark-circle" size={24} color={Colors.success} />
                    <Text style={styles.helpSentText}>Message sent! We'll get back to you shortly.</Text>
                  </View>
                ) : (
                  <>
                    <TextInput
                      style={styles.helpInput}
                      placeholder="e.g. I was overcharged, driver was late..."
                      placeholderTextColor={Colors.textMuted}
                      value={helpMessage}
                      onChangeText={setHelpMessage}
                      multiline
                      numberOfLines={4}
                      textAlignVertical="top"
                    />
                    <Pressable
                      style={({ pressed }) => [styles.helpSendBtn, (pressed || sendEnquiry.isPending) && { opacity: 0.7 }]}
                      onPress={() => {
                        if (!helpMessage.trim()) { Alert.alert("Empty message", "Please describe your issue."); return; }
                        sendEnquiry.mutate({ rideId: selectedTrip.id, message: helpMessage.trim() });
                      }}
                      disabled={sendEnquiry.isPending}
                    >
                      {sendEnquiry.isPending
                        ? <ActivityIndicator size="small" color={Colors.primary} />
                        : <Text style={styles.helpSendBtnText}>Send Message</Text>}
                    </Pressable>
                  </>
                )}
              </View>
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary, paddingHorizontal: 20 },
  title: { fontSize: 24, fontFamily: "Inter_700Bold", color: Colors.white, marginBottom: 20 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  emptyText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary, marginTop: 8 },
  emptySubtext: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  list: { gap: 12, paddingBottom: 100 },
  tripCard: { backgroundColor: Colors.card, borderRadius: 16, padding: 16, gap: 14, borderWidth: 1, borderColor: Colors.border },
  tripCardActive: { borderColor: "#4A9EFF44" },
  tripHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statusChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  dateTimeRow: { alignItems: "flex-end", gap: 1 },
  tripDate: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  tripTime: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  routeRow: { flexDirection: "row", gap: 12, alignItems: "stretch" },
  routeDots: { alignItems: "center", paddingVertical: 2, gap: 3 },
  dotGreen: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success },
  routeLine: { width: 1.5, flex: 1, minHeight: 16, backgroundColor: Colors.border },
  dotRed: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.error },
  routeAddresses: { flex: 1, gap: 10 },
  routeAddress: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  tripFooter: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 4, borderTopWidth: 1, borderTopColor: Colors.border },
  vehicleType: { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.textMuted },
  tripDistance: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  tripPrice: { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.white },
  modalContainer: { flex: 1, backgroundColor: Colors.primary },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.white },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  modalContent: { padding: 20, gap: 20, paddingBottom: 60 },
  detailStatusChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, alignSelf: "flex-start" },
  detailSection: { gap: 8 },
  detailLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  detailValue: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  fareCard: { backgroundColor: Colors.card, borderRadius: 14, padding: 16, gap: 12, borderWidth: 1, borderColor: Colors.border },
  fareRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  fareLabel: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  fareValue: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.textSecondary, textTransform: "capitalize" },
  fareTotalRow: { paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border },
  fareTotalLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.white },
  fareTotalValue: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.white },
  helpSection: { backgroundColor: Colors.card, borderRadius: 14, padding: 16, gap: 12, borderWidth: 1, borderColor: Colors.border },
  helpHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  helpTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.white },
  helpSubtext: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textMuted, lineHeight: 18 },
  helpInput: { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.white, minHeight: 100, borderWidth: 1, borderColor: Colors.border },
  helpSendBtn: { backgroundColor: Colors.white, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  helpSendBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.primary },
  helpSentBox: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: `${Colors.success}18`, borderRadius: 10, padding: 14 },
  helpSentText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.success, flex: 1 },
  cancelReservationBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 13, borderWidth: 1, borderColor: `${Colors.error}55`, backgroundColor: `${Colors.error}11` },
  cancelReservationText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.error },
});
