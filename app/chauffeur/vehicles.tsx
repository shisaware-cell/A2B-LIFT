import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator, Alert, RefreshControl, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { apiRequest } from "@/lib/query-client";
import { uploadDocument } from "@/lib/supabase-storage";
import Colors from "@/constants/colors";

const emptyForm = { carMake: "", vehicleModel: "", vehicleYear: "", plateNumber: "", vehicleType: "budget", carColor: "", passengerCapacity: "4", luggageCapacity: "2" };
const VEHICLE_DOCS = [
  { id: "vehicle:double_license_disk", label: "Double License Disk" },
  { id: "vehicle:passenger_liability_insurance", label: "Passenger Liability Insurance" },
  { id: "vehicle:dekra_report", label: "Dekra Report" },
];
const VEHICLE_CATEGORIES = [
  { id: "budget", label: "Budget", desc: "Toyota Corolla, Toyota Quest" },
  { id: "luxury", label: "Luxury", desc: "BMW 3 Series, Mercedes C Class" },
  { id: "business", label: "Business Class", desc: "BMW 5 Series, Mercedes E Class" },
  { id: "van", label: "Van", desc: "Hyundai H1, Mercedes Vito, Staria" },
  { id: "luxury_van", label: "Luxury Van", desc: "Mercedes V Class" },
];

export default function VehiclesScreen() {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [operatorProfile, setOperatorProfile] = useState<any>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [uploadingDocs, setUploadingDocs] = useState<Record<string, boolean>>({});
  const [submittingVehicles, setSubmittingVehicles] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    try {
      const [profileRes, vehicleRes] = await Promise.all([
        apiRequest("GET", "/api/operator-profile/me"),
        apiRequest("GET", "/api/vehicles"),
      ]);
      const profileData = await profileRes.json();
      const data = await vehicleRes.json();
      setOperatorProfile(profileData.profile || null);
      const baseVehicles = Array.isArray(data.vehicles) ? data.vehicles : [];
      const enriched = await Promise.all(baseVehicles.map(async (vehicle) => {
        try {
          const detailRes = await apiRequest("GET", `/api/vehicles/${vehicle.id}`);
          return { ...vehicle, ...(await detailRes.json()) };
        } catch {
          return vehicle;
        }
      }));
      setVehicles(enriched);
      setAssignments(Array.isArray(data.assignments) ? data.assignments : []);
    } catch {
      Alert.alert("Error", "Could not load vehicles.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function update(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function createVehicle() {
    if (!form.carMake.trim() || !form.vehicleModel.trim() || !form.vehicleYear.trim() || !form.plateNumber.trim() || !form.carColor.trim()) {
      Alert.alert("Missing details", "Please complete the vehicle details.");
      return;
    }
    setSaving(true);
    try {
      await apiRequest("POST", "/api/vehicles", {
        ...form,
        vehicleYear: Number.parseInt(form.vehicleYear, 10),
        passengerCapacity: Number.parseInt(form.passengerCapacity, 10) || 4,
        luggageCapacity: Number.parseInt(form.luggageCapacity, 10) || 2,
      });
      setForm(emptyForm);
      setShowForm(false);
      await load();
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    } catch (e: any) {
      Alert.alert("Vehicle not saved", e.message || "Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function selectVehicle(vehicleId: string) {
    try {
      await apiRequest("POST", `/api/vehicles/${vehicleId}/select-active`);
      Alert.alert("Vehicle selected", "You can now go online with this vehicle.");
      await load();
    } catch (e: any) {
      Alert.alert("Cannot select vehicle", e.message || "Vehicle must be approved and assigned to you.");
    }
  }

  async function pickAndUploadDocument(vehicleId: string, type: string) {
    const uploadKey = `${vehicleId}:${type}`;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      setUploadingDocs((prev) => ({ ...prev, [uploadKey]: true }));
      const asset = result.assets[0];
      let url = asset.uri;
      try {
        url = await uploadDocument(asset.uri, vehicleId, type.replace("vehicle:", "vehicle_"), {
          fileName: asset.name,
          mimeType: asset.mimeType,
        });
      } catch {}
      await apiRequest("POST", `/api/vehicles/${vehicleId}/documents`, { type, url });
      await load();
    } catch (e: any) {
      Alert.alert("Upload failed", e.message || "Could not upload this document.");
    } finally {
      setUploadingDocs((prev) => {
        const next = { ...prev };
        delete next[uploadKey];
        return next;
      });
    }
  }

  async function submitVehicle(vehicleId: string) {
    if (submittingVehicles[vehicleId]) return;
    setSubmittingVehicles((prev) => ({ ...prev, [vehicleId]: true }));
    try {
      await apiRequest("POST", `/api/vehicles/${vehicleId}/submit`);
      Alert.alert("Vehicle submitted", "A2B will review the vehicle documents.");
      await load();
    } catch (e: any) {
      Alert.alert("Cannot submit vehicle", e.message || "Please upload all required documents.");
      setSubmittingVehicles((prev) => {
        const next = { ...prev };
        delete next[vehicleId];
        return next;
      });
    }
  }

  if (loading) {
    return <View style={[styles.container, styles.center]}><ActivityIndicator color={Colors.white} /></View>;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 14) }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color={Colors.white} /></Pressable>
        <Text style={styles.title}>Vehicles</Text>
        <View style={styles.backBtn} />
      </View>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.white} />}
      >
        <Pressable style={styles.addVehicleBtn} onPress={() => setShowForm((prev) => !prev)}>
          <Ionicons name={showForm ? "close-circle-outline" : "add-circle-outline"} size={20} color={Colors.primary} />
          <Text style={styles.submitText}>{showForm ? "Cancel" : "Add New Vehicle"}</Text>
        </Pressable>

        {showForm && (
          <View style={styles.form}>
            <Text style={styles.sectionTitle}>Add vehicle</Text>
            {([
              ["carMake", "Car Make"],
              ["vehicleModel", "Car Model"],
              ["vehicleYear", "Model Year"],
              ["plateNumber", "Plate Number"],
              ["carColor", "Color"],
              ["passengerCapacity", "Passengers"],
              ["luggageCapacity", "Luggage"],
            ] as const).map(([field, label]) => (
              <TextInput
                key={field}
                style={styles.input}
                value={form[field]}
                onChangeText={(value) => update(field, value)}
                placeholder={label}
                placeholderTextColor={Colors.textMuted}
                keyboardType={field.includes("Year") || field.includes("Capacity") ? "number-pad" : "default"}
                autoCapitalize={field === "plateNumber" ? "characters" : "words"}
              />
            ))}
            <Pressable style={styles.categorySelect} onPress={() => setCategoryOpen((prev) => !prev)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.categoryLabel}>Category</Text>
                <Text style={styles.categoryValue}>{VEHICLE_CATEGORIES.find((item) => item.id === form.vehicleType)?.label || "Budget"}</Text>
              </View>
              <Ionicons name={categoryOpen ? "chevron-up" : "chevron-down"} size={18} color={Colors.textMuted} />
            </Pressable>
            {categoryOpen && (
              <View style={styles.categoryMenu}>
                {VEHICLE_CATEGORIES.map((item) => (
                  <Pressable
                    key={item.id}
                    style={[styles.categoryOption, form.vehicleType === item.id && styles.categoryOptionActive]}
                    onPress={() => {
                      update("vehicleType", item.id);
                      setCategoryOpen(false);
                    }}
                  >
                    <Text style={styles.categoryOptionTitle}>{item.label}</Text>
                    <Text style={styles.categoryOptionDesc}>{item.desc}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            <Pressable style={[styles.submitBtn, saving && { opacity: 0.7 }]} onPress={createVehicle} disabled={saving}>
              {saving ? <ActivityIndicator color={Colors.primary} /> : <Text style={styles.submitText}>Save Vehicle</Text>}
            </Pressable>
          </View>
        )}

        <Text style={styles.sectionTitle}>My Vehicles</Text>
        {vehicles.length === 0 ? (
          <Text style={styles.emptyText}>No vehicles yet.</Text>
        ) : vehicles.map((vehicle) => {
          const assigned = assignments.some((assignment) => assignment.vehicleId === vehicle.id && assignment.status === "active");
          const vehicleData = vehicle.vehicle || vehicle;
          const docs = Array.isArray(vehicle.documents) ? vehicle.documents : [];
          const uploadedTypes = new Set(docs.map((doc: any) => doc.type));
          const missingDocs = VEHICLE_DOCS.filter((doc) => !uploadedTypes.has(doc.id));
          const unapprovedDocs = VEHICLE_DOCS.filter((doc) => docs.find((uploaded: any) => uploaded.type === doc.id)?.status !== "approved");
          const isSubmitting = !!submittingVehicles[vehicleData.id] || vehicleData.status === "pending";
          const ownsVehicle = vehicleData.ownerOperatorProfileId === operatorProfile?.id;
          return (
            <View key={vehicle.id} style={styles.vehicleCard}>
              <View style={styles.vehicleTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.vehicleTitle}>{vehicleData.carMake} {vehicleData.vehicleModel}</Text>
                  <Text style={styles.vehicleMeta}>{vehicleData.plateNumber} · {vehicleData.vehicleYear}</Text>
                </View>
                <View style={[styles.statusChip, styles[`status_${vehicleData.status}` as keyof typeof styles] as any]}>
                  <Text style={styles.statusText}>{vehicleData.status}</Text>
                </View>
              </View>

              {vehicleData.status !== "approved" && (
                <View style={styles.docsBlock}>
                  {vehicleData.status === "waitlisted" && (
                    <Text style={styles.waitlistText}>{vehicleData.rejectionReason || "This vehicle is waitlisted and cannot be used until A2B reactivates it."}</Text>
                  )}
                  {VEHICLE_DOCS.map((doc) => {
                    const isUploading = !!uploadingDocs[`${vehicleData.id}:${doc.id}`];
                    const isUploaded = uploadedTypes.has(doc.id);
                    const documentStatus = docs.find((uploaded: any) => uploaded.type === doc.id)?.status;
                    return (
                      <Pressable key={doc.id} style={[styles.docRow, isUploading && { opacity: 0.75 }]} onPress={() => pickAndUploadDocument(vehicleData.id, doc.id)} disabled={isUploading}>
                        {isUploading ? <ActivityIndicator size="small" color={Colors.white} /> : <Ionicons name={isUploaded ? "checkmark-circle" : "cloud-upload-outline"} size={18} color={isUploaded ? Colors.success : Colors.textMuted} />}
                        <View style={{ flex: 1 }}>
                          <Text style={styles.docText}>{isUploading ? `Uploading ${doc.label}...` : doc.label}</Text>
                          {isUploaded && <Text style={styles.docStatus}>{documentStatus === "approved" ? "Activated" : documentStatus === "rejected" ? "Rejected - upload a replacement" : "Awaiting activation"}</Text>}
                        </View>
                      </Pressable>
                    );
                  })}
                  {missingDocs.length === 0 && unapprovedDocs.length > 0 && (
                    <Text style={styles.pendingText}>A2B must activate all required documents before this vehicle can be approved.</Text>
                  )}
                  <Pressable
                    style={[styles.submitBtn, (missingDocs.length > 0 || isSubmitting) && styles.submitBtnMuted]}
                    onPress={() => submitVehicle(vehicleData.id)}
                    disabled={missingDocs.length > 0 || isSubmitting}
                  >
                    {submittingVehicles[vehicleData.id] ? <ActivityIndicator color={Colors.primary} /> : <Text style={styles.submitText}>{vehicleData.status === "pending" ? "Submitted for Approval" : "Submit for Approval"}</Text>}
                  </Pressable>
                </View>
              )}

              {vehicleData.status === "approved" && (
                <View style={styles.actionRow}>
                  {operatorProfile?.type === "driver" && assigned && (
                    <Pressable style={styles.selectBtn} onPress={() => selectVehicle(vehicleData.id)}>
                      <Text style={styles.selectText}>Select for Driving</Text>
                    </Pressable>
                  )}
                  {ownsVehicle && (
                    <Pressable style={styles.selectBtn} onPress={() => router.push("/chauffeur/fleet" as never)}>
                      <Text style={styles.selectText}>Manage Drivers</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          );
        })}
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
  sectionTitle: { fontSize: 13, fontFamily: "Inter_700Bold", color: Colors.textSecondary, textTransform: "uppercase", marginTop: 14, marginBottom: 10 },
  form: { gap: 10, marginBottom: 16 },
  input: { minHeight: 46, borderRadius: 12, paddingHorizontal: 14, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, color: Colors.white },
  addVehicleBtn: { minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: Colors.white, flexDirection: "row", gap: 8, marginTop: 12 },
  categorySelect: { minHeight: 54, borderRadius: 12, paddingHorizontal: 14, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, flexDirection: "row", alignItems: "center", gap: 10 },
  categoryLabel: { color: Colors.textMuted, fontFamily: "Inter_600SemiBold", fontSize: 11, textTransform: "uppercase" },
  categoryValue: { color: Colors.white, fontFamily: "Inter_700Bold", fontSize: 14, marginTop: 2 },
  categoryMenu: { borderWidth: 1, borderColor: Colors.border, borderRadius: 12, overflow: "hidden", backgroundColor: Colors.card },
  categoryOption: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  categoryOptionActive: { backgroundColor: Colors.surface },
  categoryOptionTitle: { color: Colors.white, fontFamily: "Inter_700Bold", fontSize: 13 },
  categoryOptionDesc: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 3 },
  submitBtn: { minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: Colors.white },
  submitText: { color: Colors.primary, fontFamily: "Inter_700Bold" },
  emptyText: { color: Colors.textMuted, fontFamily: "Inter_400Regular" },
  vehicleCard: { gap: 12, backgroundColor: Colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border, marginBottom: 10 },
  vehicleTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  vehicleTitle: { color: Colors.white, fontFamily: "Inter_700Bold", fontSize: 15 },
  vehicleMeta: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 4 },
  statusChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: Colors.surface },
  status_draft: { backgroundColor: Colors.surface },
  status_pending: { backgroundColor: "rgba(255,193,7,0.16)" },
  status_approved: { backgroundColor: "rgba(76,175,80,0.16)" },
  status_rejected: { backgroundColor: "rgba(255,77,77,0.16)" },
  status_suspended: { backgroundColor: "rgba(255,77,77,0.16)" },
  status_waitlisted: { backgroundColor: "rgba(255,193,7,0.16)" },
  statusText: { color: Colors.white, fontFamily: "Inter_700Bold", fontSize: 11, textTransform: "uppercase" },
  docsBlock: { gap: 8 },
  docRow: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 12 },
  docText: { color: Colors.white, fontFamily: "Inter_600SemiBold", fontSize: 12, flex: 1 },
  docStatus: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 },
  pendingText: { color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17 },
  waitlistText: { color: Colors.warning, fontFamily: "Inter_600SemiBold", fontSize: 12, lineHeight: 17 },
  actionRow: { flexDirection: "row", justifyContent: "flex-end", flexWrap: "wrap", gap: 8 },
  selectBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.accent },
  selectText: { color: Colors.white, fontFamily: "Inter_700Bold", fontSize: 12 },
  submitBtnMuted: { opacity: 0.55 },
});
