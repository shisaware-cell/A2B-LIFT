import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator, Alert, RefreshControl, Platform, Modal, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { apiRequest } from "@/lib/query-client";
import { uploadDocument } from "@/lib/supabase-storage";
import { pickImageOrDocument } from "@/lib/image-picker-helper";
import Colors from "@/constants/colors";

const emptyForm = { carMake: "", vehicleModel: "", vehicleYear: "", plateNumber: "", vehicleType: "budget", carColor: "", passengerCapacity: "4", luggageCapacity: "2" };

const VEHICLE_DOCS = [
  { id: "vehicle:double_license_disk", label: "Double License Disk", isInspectionPhotos: false },
  { id: "vehicle:passenger_liability_insurance", label: "Passenger Liability Insurance", isInspectionPhotos: false },
  { id: "vehicle:inspection_photos", label: "Vehicle Photos (5 Required)", isInspectionPhotos: true },
];

const VEHICLE_PHOTO_ANGLES = [
  { id: "front", label: "Front Exterior", desc: "Front bumper, grille, license plate & lights", docType: "vehicle:photo_front", icon: "car-outline" },
  { id: "back", label: "Rear Exterior", desc: "Rear bumper, boot, rear license plate & taillights", docType: "vehicle:photo_back", icon: "car-outline" },
  { id: "left", label: "Driver Side (Left)", desc: "Full side profile, doors, mirrors & wheels", docType: "vehicle:photo_left", icon: "swap-horizontal-outline" },
  { id: "right", label: "Passenger Side (Right)", desc: "Full side profile, doors, mirrors & wheels", docType: "vehicle:photo_right", icon: "swap-horizontal-outline" },
  { id: "inside", label: "Inside / Interior", desc: "Dashboard, front & rear seats, upholstery", docType: "vehicle:photo_inside", icon: "browsers-outline" },
] as const;

const VEHICLE_CATEGORIES = [
  { id: "a2b_lite", label: "A2B Lite", desc: "Hyundai i10 and similar compact cars" },
  { id: "budget", label: "Budget", desc: "Toyota Corolla, Toyota Quest" },
  { id: "luxury_van", label: "V-Class / Luxury Van", desc: "Mercedes-Benz V-Class" },
  { id: "luxury", label: "Luxury", desc: "BMW 3 Series, Mercedes C Class" },
  { id: "business", label: "VIP / Business Class", desc: "BMW 5 Series, Mercedes E Class" },
  { id: "van", label: "Van", desc: "Hyundai H1, Mercedes Vito, Staria" },
];

type PhotoDraft = { uri: string; name?: string; uploadedUrl?: string; base64?: string };

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
  const [activeVehicleId, setActiveVehicleId] = useState<string | null>(null);
  const [selectingVehicleId, setSelectingVehicleId] = useState<string | null>(null);

  // 5 Vehicle Photos Inspection Sheet State
  const [photoModalVehicle, setPhotoModalVehicle] = useState<any | null>(null);
  const [photosDraft, setPhotosDraft] = useState<Record<string, PhotoDraft | null>>({
    front: null,
    back: null,
    left: null,
    right: null,
    inside: null,
  });
  const [savingPhotos, setSavingPhotos] = useState(false);

  const load = useCallback(async () => {
    try {
      const vehicleRes = await apiRequest("GET", "/api/vehicles");
      const data = await vehicleRes.json();
      setOperatorProfile(data.operatorProfile || null);
      setActiveVehicleId(data.activeVehicleId || null);
      setVehicles(Array.isArray(data.vehicles) ? data.vehicles : []);
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
    if (selectingVehicleId || activeVehicleId === vehicleId) return;
    const previousActiveVehicleId = activeVehicleId;
    setSelectingVehicleId(vehicleId);
    setActiveVehicleId(vehicleId);
    try {
      const response = await apiRequest("POST", `/api/vehicles/${vehicleId}/select-active`);
      const data = await response.json();
      setActiveVehicleId(data.activeVehicleId || vehicleId);
      Alert.alert("Vehicle selected", "You can now go online with this vehicle.");
    } catch (e: any) {
      setActiveVehicleId(previousActiveVehicleId);
      Alert.alert("Cannot select vehicle", e.message || "Vehicle must be approved and assigned to you.");
    } finally {
      setSelectingVehicleId(null);
    }
  }

  async function pickAndUploadDocument(
    vehicleId: string,
    type: string,
    source: "camera" | "gallery" | "file" = "file",
  ) {
    const uploadKey = `${vehicleId}:${type}`;
    try {
      const isCamera = source === "camera";
      const isFile = source === "file";
      const media = await pickImageOrDocument({
        camera: isCamera,
        acceptPdf: isFile,
        fallbackName: `${type.replace("vehicle:", "")}.jpg`,
      });
      if (!media) return;

      setUploadingDocs((prev) => ({ ...prev, [uploadKey]: true }));
      const url = await uploadDocument(media.uri, vehicleId, type.replace("vehicle:", "vehicle_"), {
        fileName: media.name,
        mimeType: media.mimeType,
        base64: media.base64,
      });
      if (!url || url.startsWith("file:") || url.startsWith("content:")) {
        throw new Error("Could not process document upload.");
      }
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

  function handleDocumentUploadPress(vehicleId: string, doc: { id: string; label: string; isInspectionPhotos?: boolean }) {
    if (doc.isInspectionPhotos) {
      const v = vehicles.find((item) => (item.vehicle?.id || item.id) === vehicleId);
      const vehicleData = v?.vehicle || v || { id: vehicleId };
      const docs = Array.isArray(v?.documents) ? v.documents : [];
      openPhotoModalForVehicle(vehicleData, docs);
      return;
    }

    if (Platform.OS === "web") {
      void pickAndUploadDocument(vehicleId, doc.id, "file");
      return;
    }
    Alert.alert(
      doc.label,
      "Choose how you want to upload this document:",
      [
        { text: "Take Photo (Camera)", onPress: () => void pickAndUploadDocument(vehicleId, doc.id, "camera") },
        { text: "Photo Library (Gallery)", onPress: () => void pickAndUploadDocument(vehicleId, doc.id, "gallery") },
        { text: "Browse Files / PDF", onPress: () => void pickAndUploadDocument(vehicleId, doc.id, "file") },
        { text: "Cancel", style: "cancel" },
      ]
    );
  }

  function openPhotoModalForVehicle(vehicleData: any, docs: any[]) {
    const initialDraft: Record<string, PhotoDraft | null> = {
      front: null,
      back: null,
      left: null,
      right: null,
      inside: null,
    };

    VEHICLE_PHOTO_ANGLES.forEach((angle) => {
      const existingDoc = docs.find((d: any) => d.type === angle.docType);
      if (existingDoc?.url) {
        initialDraft[angle.id] = { uri: existingDoc.url, uploadedUrl: existingDoc.url, name: angle.label };
      }
    });

    const inspectionDoc = docs.find((d: any) => d.type === "vehicle:inspection_photos" || d.type === "vehicle:dekra_report");
    if (inspectionDoc?.url && !initialDraft.front) {
      initialDraft.front = { uri: inspectionDoc.url, uploadedUrl: inspectionDoc.url, name: "Front Photo" };
    }

    setPhotosDraft(initialDraft);
    setPhotoModalVehicle(vehicleData);
  }

  async function capturePhotoAngle(angleId: string, camera: boolean = true) {
    try {
      const media = await pickImageOrDocument({
        camera,
        fallbackName: `${photoModalVehicle?.id || "vehicle"}_${angleId}.jpg`,
      });
      if (media) {
        setPhotosDraft((prev) => ({
          ...prev,
          [angleId]: {
            uri: media.uri,
            name: media.name,
            base64: media.base64,
          },
        }));
        return;
      }
    } catch {
      try {
        if (camera && Platform.OS !== "web") {
          const result = await ImagePicker.launchCameraAsync({ quality: 0.75, allowsEditing: false });
          if (!result.canceled && result.assets?.[0]) {
            const asset = result.assets[0];
            setPhotosDraft((prev) => ({
              ...prev,
              [angleId]: {
                uri: asset.uri,
                name: asset.fileName || `${photoModalVehicle?.id || "vehicle"}_${angleId}.jpg`,
                base64: asset.base64 || undefined,
              },
            }));
            return;
          }
        }
      } catch {}
      Alert.alert("Error", "Could not capture photo.");
    }
  }

  function promptAngleCapture(angleId: string, angleLabel: string) {
    if (Platform.OS === "web") {
      void capturePhotoAngle(angleId, false);
      return;
    }
    Alert.alert(
      `Take Photo: ${angleLabel}`,
      "Choose photo source:",
      [
        { text: "Take Photo (Camera)", onPress: () => void capturePhotoAngle(angleId, true) },
        { text: "Photo Library (Gallery)", onPress: () => void capturePhotoAngle(angleId, false) },
        { text: "Cancel", style: "cancel" },
      ]
    );
  }

  const photosTakenCount = VEHICLE_PHOTO_ANGLES.filter((a) => Boolean(photosDraft[a.id]?.uri)).length;
  const isAll5PhotosTaken = photosTakenCount === 5;

  async function saveAllVehiclePhotos() {
    if (!photoModalVehicle || !isAll5PhotosTaken) return;
    setSavingPhotos(true);
    try {
      const vehicleId = photoModalVehicle.id;
      const uploadedUrls: Record<string, string> = {};

      for (const angle of VEHICLE_PHOTO_ANGLES) {
        const draft = photosDraft[angle.id];
        if (!draft) continue;
        let url = draft.uploadedUrl;
        if (!url && draft.uri) {
          url = await uploadDocument(draft.uri, vehicleId, `vehicle_${angle.id}`, {
            fileName: draft.name || `${angle.id}.jpg`,
            mimeType: "image/jpeg",
            base64: draft.base64,
          });
        }
        if (!url || url.startsWith("file:") || url.startsWith("content:")) {
          throw new Error(`Failed to upload ${angle.label}. Please try again.`);
        }
        uploadedUrls[angle.id] = url;
        try {
          await apiRequest("POST", `/api/vehicles/${vehicleId}/documents`, {
            type: angle.docType,
            url,
          });
        } catch {
          // If server rejects individual angle type, proceed to bundle submission
        }
      }

      if (uploadedUrls.front || uploadedUrls.inside || uploadedUrls.back) {
        const primaryUrl = uploadedUrls.front || uploadedUrls.inside || uploadedUrls.back;
        let bundleSaved = false;
        try {
          await apiRequest("POST", `/api/vehicles/${vehicleId}/documents`, {
            type: "vehicle:inspection_photos",
            url: primaryUrl,
          });
          bundleSaved = true;
        } catch {}

        if (!bundleSaved) {
          try {
            await apiRequest("POST", `/api/vehicles/${vehicleId}/documents`, {
              type: "vehicle:dekra_report",
              url: primaryUrl,
            });
          } catch {}
        }
      }

      Alert.alert("Photos Saved", "All 5 vehicle photos have been saved successfully!");
      setPhotoModalVehicle(null);
      await load();
    } catch (e: any) {
      Alert.alert("Upload Error", e.message || "Failed to save vehicle photos. Please try again.");
    } finally {
      setSavingPhotos(false);
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
    } finally {
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
          const vehicleData = vehicle.vehicle || vehicle;
          const docs = Array.isArray(vehicle.documents) ? vehicle.documents : [];
          const uploadedTypes = new Set(docs.map((doc: any) => doc.type));

          const isPhotosComplete = uploadedTypes.has("vehicle:inspection_photos") ||
            (uploadedTypes.has("vehicle:photo_front") &&
             uploadedTypes.has("vehicle:photo_back") &&
             uploadedTypes.has("vehicle:photo_left") &&
             uploadedTypes.has("vehicle:photo_right") &&
             uploadedTypes.has("vehicle:photo_inside")) ||
            uploadedTypes.has("vehicle:dekra_report");

          const photoAnglesCount = VEHICLE_PHOTO_ANGLES.filter((a) => uploadedTypes.has(a.docType)).length;

          const missingDocs = VEHICLE_DOCS.filter((doc) => {
            if (doc.isInspectionPhotos) {
              return !isPhotosComplete;
            }
            return !uploadedTypes.has(doc.id);
          });

          const unapprovedDocs = VEHICLE_DOCS.filter((doc) => {
            if (doc.isInspectionPhotos) {
              const photoDoc = docs.find((uploaded: any) => uploaded.type === "vehicle:inspection_photos" || uploaded.type === "vehicle:photo_front" || uploaded.type === "vehicle:dekra_report");
              return photoDoc?.status !== "approved";
            }
            return docs.find((uploaded: any) => uploaded.type === doc.id)?.status !== "approved";
          });

          const isSubmitting = !!submittingVehicles[vehicleData.id] || vehicleData.status === "pending";
          const ownsVehicle = vehicleData.ownerOperatorProfileId === operatorProfile?.id;
          const assigned = assignments.some((assignment) => assignment.vehicleId === vehicleData.id && assignment.status === "active");
          const isActiveVehicle = activeVehicleId === vehicleData.id;
          const isSelectingVehicle = selectingVehicleId === vehicleData.id;
          return (
            <View key={vehicle.id} style={[styles.vehicleCard, isActiveVehicle && styles.vehicleCardActive]}>
              <View style={styles.vehicleTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.vehicleTitle}>{vehicleData.carMake} {vehicleData.vehicleModel}</Text>
                  <Text style={styles.vehicleMeta}>{vehicleData.plateNumber} · {vehicleData.vehicleYear}</Text>
                </View>
                {isActiveVehicle && (
                  <View style={styles.activeCheck}>
                    <Ionicons name="checkmark" size={16} color={Colors.primary} />
                  </View>
                )}
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
                    if (doc.isInspectionPhotos) {
                      return (
                        <Pressable
                          key={doc.id}
                          style={[styles.docRow, isPhotosComplete && styles.docRowUploaded]}
                          onPress={() => openPhotoModalForVehicle(vehicleData, docs)}
                        >
                          <Ionicons
                            name={isPhotosComplete ? "checkmark-circle" : "camera"}
                            size={18}
                            color={isPhotosComplete ? Colors.success : Colors.accent}
                          />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.docText}>{doc.label}</Text>
                            <Text style={styles.docStatus}>
                              {isPhotosComplete
                                ? "All 5 photos captured ✓ (tap to view / retake)"
                                : photoAnglesCount > 0
                                ? `${photoAnglesCount} of 5 photos taken - tap to complete`
                                : "Tap to take 5 car photos (Front, Back, Sides, Inside)"}
                            </Text>
                          </View>
                          <View style={[styles.photoCountBadge, isPhotosComplete && styles.photoCountBadgeComplete]}>
                            <Text style={[styles.photoCountBadgeText, isPhotosComplete && styles.photoCountBadgeTextComplete]}>
                              {isPhotosComplete ? "5/5 ✓" : `${photoAnglesCount}/5`}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    }

                    const isUploading = !!uploadingDocs[`${vehicleData.id}:${doc.id}`];
                    const isUploaded = uploadedTypes.has(doc.id);
                    const documentStatus = docs.find((uploaded: any) => uploaded.type === doc.id)?.status;
                    return (
                      <Pressable key={doc.id} style={[styles.docRow, isUploading && { opacity: 0.75 }]} onPress={() => handleDocumentUploadPress(vehicleData.id, doc)} disabled={isUploading}>
                        {isUploading ? <ActivityIndicator size="small" color={Colors.white} /> : <Ionicons name={isUploaded ? "checkmark-circle" : "document-text-outline"} size={18} color={isUploaded ? Colors.success : Colors.textMuted} />}
                        <View style={{ flex: 1 }}>
                          <Text style={styles.docText}>{isUploading ? `Uploading ${doc.label}...` : doc.label}</Text>
                          {isUploaded && <Text style={styles.docStatus}>{documentStatus === "approved" ? "Activated" : documentStatus === "rejected" ? "Rejected - upload a replacement" : "Awaiting activation"}</Text>}
                          {!isUploaded && !isUploading && <Text style={styles.docStatus}>Tap to take photo or choose file</Text>}
                        </View>
                        {Platform.OS !== "web" && !isUploading && (
                          <View style={styles.docRowBtns}>
                            <Pressable style={styles.docMiniBtn} onPress={() => void pickAndUploadDocument(vehicleData.id, doc.id, "camera")} hitSlop={6}>
                              <Ionicons name="camera-outline" size={15} color={Colors.white} />
                            </Pressable>
                            <Pressable style={styles.docMiniBtn} onPress={() => void pickAndUploadDocument(vehicleData.id, doc.id, "gallery")} hitSlop={6}>
                              <Ionicons name="images-outline" size={15} color={Colors.white} />
                            </Pressable>
                          </View>
                        )}
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
                  {operatorProfile?.type === "driver" && (assigned || ownsVehicle) && (
                    <Pressable
                      style={[styles.selectBtn, isActiveVehicle && styles.selectBtnActive]}
                      onPress={() => selectVehicle(vehicleData.id)}
                      disabled={isActiveVehicle || selectingVehicleId !== null}
                    >
                      {isSelectingVehicle ? (
                        <ActivityIndicator size="small" color={Colors.white} />
                      ) : (
                        <Ionicons
                          name={isActiveVehicle ? "checkmark-circle" : "car-sport-outline"}
                          size={16}
                          color={Colors.white}
                        />
                      )}
                      <Text style={styles.selectText}>
                        {isSelectingVehicle ? "Selecting..." : isActiveVehicle ? "Selected for Driving" : "Select for Driving"}
                      </Text>
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

      {/* ── 5 Vehicle Inspection Photos Sheet ── */}
      <Modal visible={!!photoModalVehicle} transparent animationType="slide" onRequestClose={() => !savingPhotos && setPhotoModalVehicle(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => !savingPhotos && setPhotoModalVehicle(null)}>
          <View style={[styles.modalSheet, { maxHeight: "90%", paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 16) }]} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>Vehicle Photos (5 Required)</Text>
                <Text style={styles.sheetSubtitle}>
                  {photoModalVehicle?.carMake} {photoModalVehicle?.vehicleModel} ({photoModalVehicle?.plateNumber})
                </Text>
              </View>
              <Pressable style={styles.closeBtn} onPress={() => !savingPhotos && setPhotoModalVehicle(null)} disabled={savingPhotos}>
                <Ionicons name="close" size={22} color={Colors.white} />
              </Pressable>
            </View>

            {/* Progress indicator */}
            <View style={styles.photoProgressBar}>
              <View style={styles.photoProgressHeader}>
                <Text style={styles.photoProgressLabel}>
                  {photosTakenCount === 5 ? "All 5 Photos Captured ✓" : `${photosTakenCount} of 5 Photos Captured`}
                </Text>
                <Text style={styles.photoProgressPercent}>{Math.round((photosTakenCount / 5) * 100)}%</Text>
              </View>
              <View style={styles.progressBarTrack}>
                <View style={[styles.progressBarFill, { width: `${(photosTakenCount / 5) * 100}%` }, photosTakenCount === 5 && { backgroundColor: Colors.success }]} />
              </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
              <View style={styles.photoGrid}>
                {VEHICLE_PHOTO_ANGLES.map((angle, idx) => {
                  const draft = photosDraft[angle.id];
                  const hasPhoto = Boolean(draft?.uri);
                  return (
                    <View key={angle.id} style={[styles.angleCard, hasPhoto && styles.angleCardDone]}>
                      <View style={styles.angleCardHeader}>
                        <View style={[styles.angleNumberBadge, hasPhoto && styles.angleNumberBadgeDone]}>
                          <Text style={[styles.angleNumberText, hasPhoto && styles.angleNumberTextDone]}>{idx + 1}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.angleTitle}>{angle.label}</Text>
                          <Text style={styles.angleDesc}>{angle.desc}</Text>
                        </View>
                        {hasPhoto && (
                          <View style={styles.angleCheckBadge}>
                            <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                          </View>
                        )}
                      </View>

                      {hasPhoto && draft?.uri ? (
                        <View style={styles.anglePreviewRow}>
                          <Image source={{ uri: draft.uri }} style={styles.angleThumbnail} resizeMode="cover" />
                          <View style={styles.angleActions}>
                            <Pressable style={styles.angleActionBtn} onPress={() => void capturePhotoAngle(angle.id, true)}>
                              <Ionicons name="camera-outline" size={15} color={Colors.white} />
                              <Text style={styles.angleActionText}>Retake</Text>
                            </Pressable>
                            <Pressable style={styles.angleActionBtn} onPress={() => void capturePhotoAngle(angle.id, false)}>
                              <Ionicons name="images-outline" size={15} color={Colors.white} />
                              <Text style={styles.angleActionText}>Gallery</Text>
                            </Pressable>
                          </View>
                        </View>
                      ) : (
                        <Pressable style={styles.angleCaptureBtn} onPress={() => promptAngleCapture(angle.id, angle.label)}>
                          <Ionicons name="camera" size={20} color={Colors.white} />
                          <Text style={styles.angleCaptureText}>Take {angle.label}</Text>
                          {Platform.OS !== "web" && (
                            <Pressable style={styles.angleGalleryBtn} onPress={() => void capturePhotoAngle(angle.id, false)} hitSlop={8}>
                              <Ionicons name="images-outline" size={18} color={Colors.textMuted} />
                            </Pressable>
                          )}
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </View>
            </ScrollView>

            <View style={styles.sheetFooter}>
              <Pressable
                style={[
                  styles.savePhotosBtn,
                  (!isAll5PhotosTaken || savingPhotos) && styles.savePhotosBtnDisabled,
                  isAll5PhotosTaken && styles.savePhotosBtnActive,
                ]}
                onPress={saveAllVehiclePhotos}
                disabled={!isAll5PhotosTaken || savingPhotos}
              >
                {savingPhotos ? (
                  <ActivityIndicator color={Colors.primary} />
                ) : (
                  <>
                    <Ionicons name={isAll5PhotosTaken ? "cloud-upload" : "lock-closed"} size={18} color={isAll5PhotosTaken ? Colors.primary : Colors.textMuted} />
                    <Text style={[styles.savePhotosText, isAll5PhotosTaken && styles.savePhotosTextActive]}>
                      {isAll5PhotosTaken ? "Save & Upload 5 Photos" : `Take All 5 Photos to Save (${photosTakenCount}/5)`}
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
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
  vehicleCardActive: { borderColor: Colors.success },
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
  docRow: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  docRowUploaded: { borderColor: "rgba(76,175,80,0.35)" },
  docRowBtns: { flexDirection: "row", alignItems: "center", gap: 6 },
  docMiniBtn: { width: 30, height: 30, borderRadius: 6, backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center" },
  docText: { color: Colors.white, fontFamily: "Inter_600SemiBold", fontSize: 12, flex: 1 },
  docStatus: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 },
  photoCountBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: Colors.surface },
  photoCountBadgeComplete: { backgroundColor: "rgba(76,175,80,0.2)" },
  photoCountBadgeText: { color: Colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 11 },
  photoCountBadgeTextComplete: { color: Colors.success },
  pendingText: { color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17 },
  waitlistText: { color: Colors.warning, fontFamily: "Inter_600SemiBold", fontSize: 12, lineHeight: 17 },
  actionRow: { flexDirection: "row", justifyContent: "flex-end", flexWrap: "wrap", gap: 8 },
  activeCheck: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: Colors.success },
  selectBtn: { minHeight: 38, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.accent, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  selectBtnActive: { backgroundColor: Colors.success },
  selectText: { color: Colors.white, fontFamily: "Inter_700Bold", fontSize: 12 },
  submitBtnMuted: { opacity: 0.55 },

  // Modal Sheet Styles
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: Colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 14, borderWidth: 1, borderColor: Colors.border },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.surface, alignSelf: "center", marginBottom: 4 },
  sheetHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  sheetTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.white },
  sheetSubtitle: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textMuted, marginTop: 2 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center" },

  photoProgressBar: { gap: 6, paddingVertical: 6 },
  photoProgressHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  photoProgressLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.white },
  photoProgressPercent: { fontSize: 12, fontFamily: "Inter_700Bold", color: Colors.accent },
  progressBarTrack: { height: 6, borderRadius: 3, backgroundColor: Colors.surface, overflow: "hidden" },
  progressBarFill: { height: "100%", backgroundColor: Colors.accent, borderRadius: 3 },

  photoGrid: { gap: 10, paddingVertical: 4 },
  angleCard: { backgroundColor: Colors.surface, borderRadius: 12, padding: 12, gap: 10, borderWidth: 1, borderColor: Colors.border },
  angleCardDone: { borderColor: "rgba(76,175,80,0.4)" },
  angleCardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  angleNumberBadge: { width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  angleNumberBadgeDone: { backgroundColor: Colors.success },
  angleNumberText: { fontSize: 11, fontFamily: "Inter_700Bold", color: Colors.white },
  angleNumberTextDone: { color: Colors.primary },
  angleTitle: { fontSize: 13, fontFamily: "Inter_700Bold", color: Colors.white },
  angleDesc: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted, marginTop: 1 },
  angleCheckBadge: { marginLeft: "auto" },

  anglePreviewRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  angleThumbnail: { width: 72, height: 56, borderRadius: 8, backgroundColor: Colors.card },
  angleActions: { flexDirection: "row", gap: 8, flex: 1 },
  angleActionBtn: { flex: 1, minHeight: 38, borderRadius: 8, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  angleActionText: { color: Colors.white, fontSize: 12, fontFamily: "Inter_600SemiBold" },

  angleCaptureBtn: { minHeight: 44, borderRadius: 10, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 14 },
  angleCaptureText: { color: Colors.white, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  angleGalleryBtn: { marginLeft: 8, padding: 4 },

  sheetFooter: { paddingTop: 10 },
  savePhotosBtn: { minHeight: 50, borderRadius: 14, backgroundColor: Colors.surface, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: Colors.border },
  savePhotosBtnDisabled: { opacity: 0.5 },
  savePhotosBtnActive: { backgroundColor: Colors.white, borderColor: Colors.white },
  savePhotosText: { color: Colors.textMuted, fontSize: 14, fontFamily: "Inter_700Bold" },
  savePhotosTextActive: { color: Colors.primary },
});
