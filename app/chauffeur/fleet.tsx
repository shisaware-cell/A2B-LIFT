import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Platform,
  Linking,
  Modal,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { apiRequest } from "@/lib/query-client";
import Colors from "@/constants/colors";

type FleetInvite = {
  id: string;
  driverOperatorProfileId?: string;
  invitedByOperatorProfileId?: string;
  invitedByUserId?: string;
  status: string;
  emailStatus: string;
  emailError?: string | null;
  message?: string | null;
  createdAt?: string;
  sentAt?: string | null;
  acceptedAt?: string | null;
  declinedAt?: string | null;
  driver?: any;
  manager?: any;
};

export default function FleetScreen() {
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<any>(null);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [sentInvites, setSentInvites] = useState<FleetInvite[]>([]);
  const [receivedInvites, setReceivedInvites] = useState<FleetInvite[]>([]);
  const [overview, setOverview] = useState({ vehicles: 0, assignedDrivers: 0, activeTrips: 0, pendingApprovals: 0 });
  const [query, setQuery] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [selectedDriver, setSelectedDriver] = useState<any>(null);
  const [inviteMessage, setInviteMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingInviteId, setSendingInviteId] = useState<string | null>(null);
  const [respondingInviteId, setRespondingInviteId] = useState<string | null>(null);

  // Any approved operator — fleet partner OR an approved driver adding drivers to
  // their own additional car(s) — can search, invite, and assign drivers.
  const isFleetManager = profile?.status === "approved";
  const inviteByDriverId = useMemo(() => {
    const map = new Map<string, FleetInvite>();
    sentInvites.forEach((invite) => {
      const driverId = invite.driver?.id || invite.driverOperatorProfileId;
      if (driverId && !map.has(driverId)) map.set(driverId, invite);
    });
    return map;
  }, [sentInvites]);

  const load = useCallback(async () => {
    try {
      const [vehicleRes, assignmentRes, overviewRes, profileRes, invitesRes] = await Promise.all([
        apiRequest("GET", "/api/vehicles"),
        apiRequest("GET", "/api/fleet/assignments"),
        apiRequest("GET", "/api/fleet/overview"),
        apiRequest("GET", "/api/operator-profile/me").catch(() => null),
        apiRequest("GET", "/api/fleet/invites").catch(() => null),
      ]);
      const profileData = profileRes?.ok ? await profileRes.json() : null;
      const vehicleData = await vehicleRes.json();
      const assignmentData = await assignmentRes.json();
      const overviewData = await overviewRes.json();
      const inviteData = invitesRes?.ok ? await invitesRes.json() : { sentInvites: [], receivedInvites: [] };
      const currentProfile = profileData?.profile || null;
      setProfile(currentProfile);
      setVehicles((vehicleData.vehicles || []).filter((vehicle: any) => (
        vehicle.status === "approved" && (!currentProfile?.id || vehicle.ownerOperatorProfileId === currentProfile.id)
      )));
      setAssignments(assignmentData.assignments || []);
      setSentInvites(inviteData.sentInvites || []);
      setReceivedInvites(inviteData.receivedInvites || []);
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
    // Marketplace stays empty until the user searches — no full driver list on load.
    if (!query.trim()) {
      setDrivers([]);
      return;
    }
    try {
      const res = await apiRequest("GET", `/api/fleet/drivers/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setDrivers(data.drivers || []);
    } catch {
      setDrivers([]);
    }
  }, [query]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!isFleetManager) return;
    const timer = setTimeout(searchDrivers, 250);
    return () => clearTimeout(timer);
  }, [isFleetManager, searchDrivers]);

  async function assignDriver(driverId = selectedDriverId) {
    if (!selectedVehicleId || !driverId) {
      Alert.alert("Select vehicle and driver", "Choose an approved vehicle and an approved driver first.");
      return;
    }
    setSaving(true);
    try {
      await apiRequest("POST", "/api/fleet/assignments", {
        vehicleId: selectedVehicleId,
        driverOperatorProfileId: driverId,
      });
      setSelectedDriverId("");
      setSelectedDriver(null);
      await load();
      Alert.alert("Driver assigned", "The driver has been linked to your vehicle.");
    } catch (e: any) {
      Alert.alert("Could not assign driver", e.message || "Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function sendInvite(driver: any) {
    setSendingInviteId(driver.id);
    try {
      const res = await apiRequest("POST", "/api/fleet/invites", {
        driverOperatorProfileId: driver.id,
        message: inviteMessage.trim() || undefined,
      });
      const data = await res.json();
      setInviteMessage("");
      await load();
      const emailStatus = data?.invite?.emailStatus;
      if (emailStatus === "sent") {
        Alert.alert("Invite sent", "The driver has been emailed and notified in the app.");
      } else if (emailStatus === "pending_configuration") {
        Alert.alert("Invite saved", "The invite was created, but Resend is not configured yet. Add RESEND_API_KEY to send emails.");
      } else {
        Alert.alert("Invite saved", data?.invite?.emailError || "The invite was created, but the email could not be sent yet.");
      }
    } catch (e: any) {
      Alert.alert("Could not send invite", e.message || "Please try again.");
    } finally {
      setSendingInviteId(null);
    }
  }

  async function respondToInvite(inviteId: string, status: "accepted" | "declined") {
    setRespondingInviteId(inviteId);
    try {
      await apiRequest("PUT", `/api/fleet/invites/${inviteId}/respond`, { status });
      await load();
      Alert.alert(status === "accepted" ? "Invite accepted" : "Invite declined");
    } catch (e: any) {
      Alert.alert("Could not update invite", e.message || "Please try again.");
    } finally {
      setRespondingInviteId(null);
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

  function emailDriver(email?: string | null) {
    if (!email) {
      Alert.alert("No email", "This driver does not have an email address on file.");
      return;
    }
    Linking.openURL(`mailto:${email}`).catch(() => Alert.alert("Could not open email", email));
  }

  function getInviteStatus(driver: any) {
    return inviteByDriverId.get(driver.id);
  }

  function statusColor(status?: string) {
    if (status === "accepted" || status === "active") return Colors.success;
    if (status === "declined" || status === "failed") return Colors.error;
    if (status === "pending" || status === "pending_configuration") return Colors.warning;
    return Colors.textMuted;
  }

  function formatDate(date?: string | null) {
    if (!date) return "Not yet";
    return new Date(date).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
  }

  function driverPhone(driver: any) {
    return driver?.user?.phone || driver?.chauffeur?.phone || null;
  }

  function driverEmail(driver: any) {
    return driver?.user?.username || null;
  }

  function vehicleLabel(vehicle: any) {
    return `${vehicle?.carMake || ""} ${vehicle?.vehicleModel || ""}`.trim() || "Approved vehicle";
  }

  if (loading) return <View style={[styles.container, styles.center]}><ActivityIndicator color={Colors.white} /></View>;

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 14) }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color={Colors.white} /></Pressable>
        <Text style={styles.title}>Fleet</Text>
        <Pressable
          style={styles.liveMapHeaderBtn}
          onPress={() => router.push("/chauffeur/live-map" as never)}
          accessibilityLabel="Open Live Map"
        >
          <Ionicons name="map-outline" size={18} color={Colors.white} />
          <Text style={styles.liveMapHeaderBtnText}>Live Map</Text>
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.white} />}
      >
        <Pressable
          style={styles.liveMapBanner}
          onPress={() => router.push("/chauffeur/live-map" as never)}
        >
          <View style={styles.liveMapBannerIcon}>
            <Ionicons name="map" size={20} color="#10B981" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.liveMapBannerTitle}>Fleet Live Map</Text>
            <Text style={styles.liveMapBannerSub}>Track your drivers and vehicles in real time</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </Pressable>

        <View style={styles.overviewGrid}>
          {[
            ["Vehicles", overview.vehicles],
            ["Assigned", overview.assignedDrivers],
            ["Active trips", overview.activeTrips],
            ["Pending", overview.pendingApprovals],
          ].map(([label, value]) => (
            <View key={label} style={styles.overviewCard}>
              <Text style={styles.overviewValue}>{value}</Text>
              <Text style={styles.overviewLabel}>{label}</Text>
            </View>
          ))}
        </View>

        {isFleetManager && (
          <>
            <View style={styles.panel}>
              <View style={styles.panelHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Driver marketplace</Text>
                  <Text style={styles.helperText}>Search for an approved A2B driver by name, phone, or email, then invite them to your fleet.</Text>
                </View>
                <Ionicons name="people-circle-outline" size={28} color={Colors.white} />
              </View>
              <TextInput style={styles.input} value={query} onChangeText={setQuery} placeholder="Search by name, phone, or email" placeholderTextColor={Colors.textMuted} />
              <View style={styles.driverGrid}>
                {drivers.length === 0 ? (
                  <Text style={styles.emptyText}>{query.trim() ? "No approved drivers matched your search." : "Search by name, phone, or email to find approved drivers to add to your fleet."}</Text>
                ) : drivers.map((driver) => {
                  const invite = getInviteStatus(driver);
                  return (
                    <Pressable key={driver.id} style={styles.driverCard} onPress={() => setSelectedDriver(driver)}>
                      <View style={styles.driverAvatar}>
                        {driver.chauffeur?.profilePhoto || driver.user?.profilePhoto ? (
                          <Image source={{ uri: driver.chauffeur?.profilePhoto || driver.user?.profilePhoto }} style={styles.driverAvatarImg} />
                        ) : (
                          <Ionicons name="person" size={24} color={Colors.white} />
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.driverName}>{driver.user?.name || "Approved driver"}</Text>
                        <Text style={styles.driverMeta}>{driver.chauffeur?.vehicleModel || "A2B approved driver"}</Text>
                        <Text style={styles.driverMeta}>{driverEmail(driver)}</Text>
                      </View>
                      {invite ? (
                        <View style={[styles.statusPill, { borderColor: statusColor(invite.status) }]}>
                          <Text style={[styles.statusPillText, { color: statusColor(invite.status) }]}>{invite.status}</Text>
                        </View>
                      ) : (
                        <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.panel}>
              <Text style={styles.sectionTitle}>Choose vehicle for accepted drivers</Text>
              <Text style={styles.helperText}>After a driver accepts your invite, select one of your approved vehicles and assign them.</Text>
              <View style={styles.choiceGrid}>
                {vehicles.length === 0 ? (
                  <Text style={styles.emptyText}>No approved vehicles available for matching yet.</Text>
                ) : vehicles.map((vehicle) => (
                  <Pressable key={vehicle.id} style={[styles.choice, selectedVehicleId === vehicle.id && styles.choiceActive]} onPress={() => setSelectedVehicleId(vehicle.id)}>
                    <Text style={styles.choiceTitle}>{vehicleLabel(vehicle)}</Text>
                    <Text style={styles.choiceMeta}>{vehicle.plateNumber}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <InviteList
              title="Invites sent"
              empty="No fleet invites sent yet."
              invites={sentInvites}
              statusColor={statusColor}
              formatDate={formatDate}
              onAssign={(invite) => {
                if (!invite.driver?.id) return;
                setSelectedDriverId(invite.driver.id);
                assignDriver(invite.driver.id);
              }}
              canAssign
              saving={saving}
            />
          </>
        )}

        {receivedInvites.length > 0 && (
          <View style={styles.panel}>
            <Text style={styles.sectionTitle}>Fleet invitations for you</Text>
            <Text style={styles.helperText}>Another operator wants you to drive one of their vehicles. Accept an invite when you are ready to join their fleet.</Text>
            {receivedInvites.map((invite) => (
              <View key={invite.id} style={styles.inviteCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.assignmentTitle}>{invite.manager?.partnerProfile?.companyName || invite.manager?.user?.name || "Fleet partner"}</Text>
                  <Text style={styles.assignmentMeta}>Invited {formatDate(invite.createdAt)}</Text>
                  <Text style={[styles.assignmentPhone, { color: statusColor(invite.status) }]}>{invite.status}</Text>
                  {!!invite.message && <Text style={styles.inviteMessage}>{invite.message}</Text>}
                </View>
                {invite.status === "pending" && (
                  <View style={styles.responseActions}>
                    <Pressable style={styles.acceptBtn} onPress={() => respondToInvite(invite.id, "accepted")} disabled={respondingInviteId === invite.id}>
                      <Text style={styles.acceptText}>Accept</Text>
                    </Pressable>
                    <Pressable style={styles.declineBtn} onPress={() => respondToInvite(invite.id, "declined")} disabled={respondingInviteId === invite.id}>
                      <Text style={styles.declineText}>Decline</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        <Text style={styles.sectionTitle}>Current assignments</Text>
        {assignments.length === 0 ? (
          <Text style={styles.emptyText}>No assignments yet.</Text>
        ) : assignments.map((assignment) => (
          <View key={assignment.id} style={styles.assignmentCard}>
            <Ionicons name={assignment.status === "active" ? "link-outline" : "unlink-outline"} size={20} color={assignment.status === "active" ? Colors.success : Colors.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={styles.assignmentTitle}>{vehicleLabel(assignment.vehicle)}</Text>
              <Text style={styles.assignmentMeta}>{assignment.driver?.user?.name || "Driver"} · {assignment.status}</Text>
              <Pressable onPress={() => callDriver(driverPhone(assignment.driver))}>
                <Text style={styles.assignmentPhone}>{driverPhone(assignment.driver) || "No phone number"}</Text>
              </Pressable>
            </View>
            {assignment.status === "active" && isFleetManager && (
              <Pressable style={styles.removeBtn} onPress={() => removeAssignment(assignment.id)}>
                <Ionicons name="remove-circle-outline" size={20} color={Colors.error} />
              </Pressable>
            )}
          </View>
        ))}
      </ScrollView>

      <Modal visible={!!selectedDriver} transparent animationType="slide" onRequestClose={() => setSelectedDriver(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setSelectedDriver(null)}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 18 }]} onStartShouldSetResponder={() => true}>
            {selectedDriver && (
              <>
                <View style={styles.sheetHandle} />
                <View style={styles.driverModalHeader}>
                  <View style={styles.driverAvatarLarge}>
                    {selectedDriver.chauffeur?.profilePhoto || selectedDriver.user?.profilePhoto ? (
                      <Image source={{ uri: selectedDriver.chauffeur?.profilePhoto || selectedDriver.user?.profilePhoto }} style={styles.driverAvatarLargeImg} />
                    ) : (
                      <Ionicons name="person" size={34} color={Colors.white} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalTitle}>{selectedDriver.user?.name || "Approved driver"}</Text>
                    <Text style={styles.modalSubtitle}>{selectedDriver.user?.username}</Text>
                  </View>
                </View>

                <View style={styles.detailGrid}>
                  <Detail label="Phone" value={driverPhone(selectedDriver) || "Not provided"} />
                  <Detail label="Rating" value={`${Number(selectedDriver.user?.rating || 5).toFixed(1)} / 5`} />
                  <Detail label="Approval" value={selectedDriver.status || "approved"} />
                  <Detail label="Online" value={selectedDriver.chauffeur?.isOnline ? "Online" : "Offline"} />
                  <Detail label="Vehicle" value={selectedDriver.chauffeur?.vehicleModel || "Not listed"} />
                  <Detail label="Plate" value={selectedDriver.chauffeur?.plateNumber || "Not listed"} />
                  <Detail label="Capacity" value={`${selectedDriver.chauffeur?.passengerCapacity || 4} passengers`} />
                  <Detail label="Joined" value={formatDate(selectedDriver.createdAt)} />
                </View>

                <TextInput
                  style={[styles.input, styles.messageInput]}
                  value={inviteMessage}
                  onChangeText={setInviteMessage}
                  placeholder="Optional message to include in the email"
                  placeholderTextColor={Colors.textMuted}
                  multiline
                />

                <View style={styles.modalActions}>
                  <Pressable style={styles.secondaryBtn} onPress={() => callDriver(driverPhone(selectedDriver))}>
                    <Ionicons name="call-outline" size={18} color={Colors.white} />
                    <Text style={styles.secondaryText}>Call</Text>
                  </Pressable>
                  <Pressable style={styles.secondaryBtn} onPress={() => emailDriver(driverEmail(selectedDriver))}>
                    <Ionicons name="mail-outline" size={18} color={Colors.white} />
                    <Text style={styles.secondaryText}>Email</Text>
                  </Pressable>
                </View>

                <Pressable
                  style={[styles.submitBtn, sendingInviteId === selectedDriver.id && { opacity: 0.7 }]}
                  onPress={() => sendInvite(selectedDriver)}
                  disabled={sendingInviteId === selectedDriver.id}
                >
                  {sendingInviteId === selectedDriver.id ? <ActivityIndicator color={Colors.primary} /> : <Text style={styles.submitText}>Send Fleet Invite Email</Text>}
                </Pressable>
              </>
            )}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailItem}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function InviteList({
  title,
  empty,
  invites,
  statusColor,
  formatDate,
  onAssign,
  canAssign,
  saving,
}: {
  title: string;
  empty: string;
  invites: FleetInvite[];
  statusColor: (status?: string) => string;
  formatDate: (date?: string | null) => string;
  onAssign: (invite: FleetInvite) => void;
  canAssign?: boolean;
  saving?: boolean;
}) {
  return (
    <View style={styles.panel}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {invites.length === 0 ? (
        <Text style={styles.emptyText}>{empty}</Text>
      ) : invites.map((invite) => (
        <View key={invite.id} style={styles.inviteCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.assignmentTitle}>{invite.driver?.user?.name || "Approved driver"}</Text>
            <Text style={styles.assignmentMeta}>Invited {formatDate(invite.createdAt)} · Email {invite.emailStatus}</Text>
            <Text style={[styles.assignmentPhone, { color: statusColor(invite.status) }]}>{invite.status}</Text>
            {!!invite.emailError && <Text style={styles.errorText}>{invite.emailError}</Text>}
          </View>
          {canAssign && invite.status === "accepted" && (
            <Pressable style={[styles.smallAssignBtn, saving && { opacity: 0.7 }]} onPress={() => onAssign(invite)} disabled={saving}>
              <Text style={styles.smallAssignText}>Assign</Text>
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  center: { alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 12 },
  backBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.white },
  liveMapHeaderBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  liveMapHeaderBtnText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  liveMapBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  liveMapBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(16,185,129,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  liveMapBannerTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
  },
  liveMapBannerSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginTop: 2,
  },
  content: { paddingHorizontal: 20, gap: 14 },
  overviewGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  overviewCard: { width: "48%", minHeight: 74, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card, alignItems: "center", justifyContent: "center" },
  overviewValue: { color: Colors.white, fontFamily: "Inter_700Bold", fontSize: 20 },
  overviewLabel: { color: Colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 11, textTransform: "uppercase", marginTop: 2 },
  panel: { gap: 12, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card, padding: 14 },
  panelHeader: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  sectionTitle: { fontSize: 13, fontFamily: "Inter_700Bold", color: Colors.textSecondary, textTransform: "uppercase" },
  helperText: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18 },
  input: { minHeight: 46, borderRadius: 12, paddingHorizontal: 14, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, color: Colors.white, fontFamily: "Inter_400Regular" },
  messageInput: { minHeight: 86, paddingTop: 12, textAlignVertical: "top" },
  driverGrid: { gap: 10 },
  driverCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  driverAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  driverAvatarImg: { width: 46, height: 46, borderRadius: 23 },
  driverName: { color: Colors.white, fontFamily: "Inter_700Bold", fontSize: 14 },
  driverMeta: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  statusPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  statusPillText: { fontSize: 11, fontFamily: "Inter_700Bold", textTransform: "uppercase" },
  choiceGrid: { gap: 8 },
  choice: { padding: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  choiceActive: { borderColor: Colors.white, backgroundColor: "rgba(255,255,255,0.06)" },
  choiceTitle: { color: Colors.white, fontFamily: "Inter_700Bold", fontSize: 14 },
  choiceMeta: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 3 },
  emptyText: { color: Colors.textMuted, fontFamily: "Inter_400Regular", lineHeight: 20 },
  assignmentCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 12, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border },
  assignmentTitle: { color: Colors.white, fontFamily: "Inter_700Bold", fontSize: 14 },
  assignmentMeta: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 3 },
  assignmentPhone: { color: Colors.accent, fontFamily: "Inter_600SemiBold", fontSize: 12, marginTop: 5, textTransform: "capitalize" },
  removeBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,77,77,0.1)" },
  inviteCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 12, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  inviteMessage: { color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18, marginTop: 8 },
  errorText: { color: Colors.error, fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 6, lineHeight: 16 },
  responseActions: { gap: 8 },
  acceptBtn: { borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: Colors.success },
  acceptText: { color: Colors.white, fontFamily: "Inter_700Bold", fontSize: 12 },
  declineBtn: { borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: "rgba(255,77,77,0.12)", borderWidth: 1, borderColor: "rgba(255,77,77,0.35)" },
  declineText: { color: Colors.error, fontFamily: "Inter_700Bold", fontSize: 12 },
  smallAssignBtn: { borderRadius: 999, paddingVertical: 9, paddingHorizontal: 16, backgroundColor: Colors.white },
  smallAssignText: { color: Colors.primary, fontFamily: "Inter_700Bold", fontSize: 12 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 14, maxHeight: "88%" },
  sheetHandle: { width: 36, height: 4, backgroundColor: Colors.accent, borderRadius: 2, alignSelf: "center" },
  driverModalHeader: { flexDirection: "row", alignItems: "center", gap: 14 },
  driverAvatarLarge: { width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  driverAvatarLargeImg: { width: 64, height: 64, borderRadius: 32 },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.white },
  modalSubtitle: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted, marginTop: 3 },
  detailGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  detailItem: { width: "48%", minHeight: 66, borderRadius: 12, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, padding: 12, justifyContent: "center" },
  detailLabel: { color: Colors.textMuted, fontFamily: "Inter_600SemiBold", fontSize: 11, textTransform: "uppercase" },
  detailValue: { color: Colors.white, fontFamily: "Inter_600SemiBold", fontSize: 13, marginTop: 4 },
  modalActions: { flexDirection: "row", gap: 10 },
  secondaryBtn: { flex: 1, minHeight: 46, borderRadius: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  secondaryText: { color: Colors.white, fontFamily: "Inter_700Bold" },
  submitBtn: { minHeight: 50, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: Colors.white },
  submitText: { color: Colors.primary, fontFamily: "Inter_700Bold" },
});
