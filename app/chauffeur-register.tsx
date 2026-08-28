import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator, Platform, ScrollView, Alert, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/query-client";
import { uploadDocument } from "@/lib/supabase-storage";
import Colors from "@/constants/colors";

const DRIVER_DOCS = [
  { id: "driver:pdrp_certificate", label: "PDRP Certificate", optional: false },
  { id: "driver:drivers_license", label: "Valid Driver's License", optional: false },
  { id: "driver:criminal_background_check", label: "Criminal Background Check", optional: false },
  { id: "driver:passenger_liability_insurance", label: "Passenger Liability Insurance", optional: false },
];

function formatPhoneLocalDisplay(raw: string): string {
  let cleaned = raw.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+27")) cleaned = cleaned.slice(3);
  else if (cleaned.startsWith("27")) cleaned = cleaned.slice(2);
  if (cleaned.startsWith("0")) cleaned = cleaned.slice(1);
  return cleaned;
}

function normalizeSouthAfricanPhone(raw: string): string {
  const local = formatPhoneLocalDisplay(raw);
  return local ? `+27${local}` : "";
}

type DraftFile = { uri: string; name: string; uploadedUrl?: string };
type DraftDocuments = Record<string, DraftFile | null>;

function emptyDocs(): DraftDocuments {
  return Object.fromEntries(DRIVER_DOCS.map((doc) => [doc.id, null])) as DraftDocuments;
}

function getDriverRegistrationErrorMessage(error: any) {
  const message = String(error?.message || "");
  if (
    message.includes("/api/operator-profile") ||
    message.includes("Cannot POST /api/operator-profile") ||
    message.includes("Cannot GET /api/operator-profile")
  ) {
    return "Driver registration is waiting for the latest backend deployment. Your progress is saved on this device. Please update the backend and try again.";
  }
  return message || "Driver registration failed. Please try again.";
}

export default function ChauffeurRegisterScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [phoneLocal, setPhoneLocal] = useState(formatPhoneLocalDisplay(user?.phone || ""));
  const [documents, setDocuments] = useState<DraftDocuments>(emptyDocs);
  const [driverPhoto, setDriverPhoto] = useState<DraftFile | null>(null);
  const [uploadingDocs, setUploadingDocs] = useState<Record<string, boolean>>({});
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const draftKey = user?.id ? `a2b_driver_registration_draft_${user.id}` : null;

  useEffect(() => {
    let cancelled = false;
    if (!draftKey) { setDraftLoaded(true); return; }
    Promise.all([
      AsyncStorage.getItem(draftKey),
      apiRequest("GET", "/api/operator-profile/me/documents").then((res) => res.json()).catch(() => []),
    ])
      .then(([raw, serverDocs]) => {
        if (cancelled) return;
        if (raw) {
          const draft = JSON.parse(raw);
          if (typeof draft?.phone === "string") setPhoneLocal(formatPhoneLocalDisplay(draft.phone));
          if (draft?.documents) setDocuments({ ...emptyDocs(), ...draft.documents });
          if (draft?.driverPhoto?.uri) setDriverPhoto(draft.driverPhoto);
        }
        if (Array.isArray(serverDocs)) {
          const restoredDocs = emptyDocs();
          let restoredPhoto: DraftFile | null = null;
          serverDocs.forEach((doc: any) => {
            const type = String(doc?.type || "");
            const url = String(doc?.url || "");
            if (!url) return;
            const file = { uri: url, uploadedUrl: url, name: type.replace("driver:", "").replace(/_/g, " ") };
            if (type === "driver:driver_photo") restoredPhoto = file;
            else if (type in restoredDocs) restoredDocs[type] = file;
          });
          setDocuments((prev) => {
            const next = { ...prev };
            Object.entries(restoredDocs).forEach(([type, file]) => {
              if (file && !next[type]) next[type] = file;
            });
            return next;
          });
          if (restoredPhoto) setDriverPhoto((prev) => prev || restoredPhoto);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setDraftLoaded(true); });
    return () => { cancelled = true; };
  }, [draftKey]);

  useEffect(() => {
    if (!draftKey || !draftLoaded) return;
    const phone = normalizeSouthAfricanPhone(phoneLocal);
    AsyncStorage.setItem(draftKey, JSON.stringify({ phone, documents, driverPhoto })).catch(() => {});
  }, [documents, draftKey, draftLoaded, driverPhoto, phoneLocal]);

  async function pickImage(docId: string, camera = false) {
    try {
      if (Platform.OS !== "web") {
        const permission = camera
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (permission.status !== "granted") {
          Alert.alert("Permission needed", `Please allow ${camera ? "camera" : "photo"} access.`);
          return;
        }
      }
      const result = camera && Platform.OS !== "web"
        ? await ImagePicker.launchCameraAsync({ quality: 0.75, allowsEditing: docId === "driver_photo", aspect: docId === "driver_photo" ? [1, 1] : undefined })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.75, allowsEditing: docId === "driver_photo", aspect: docId === "driver_photo" ? [1, 1] : undefined });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        const file = { uri: asset.uri, name: asset.fileName || `${docId}.jpg` };
        if (docId === "driver_photo") setDriverPhoto(file);
        else setDocuments((prev) => ({ ...prev, [docId]: file }));
        void autosaveDocumentUpload(docId, file);
      }
    } catch {
      Alert.alert("Error", "Could not open camera or image picker.");
    }
  }

  function promptDocumentChoice(docId: string, label: string) {
    if (Platform.OS === "web") {
      void pickImage(docId, false);
      return;
    }
    Alert.alert(
      label,
      "Choose how you want to upload this document:",
      [
        { text: "Take Photo (Camera)", onPress: () => void pickImage(docId, true) },
        { text: "Photo Library (Gallery)", onPress: () => void pickImage(docId, false) },
        { text: "Cancel", style: "cancel" },
      ]
    );
  }

  async function autosaveDocumentUpload(docId: string, file: DraftFile) {
    if (!user) return;
    setUploadingDocs((prev) => ({ ...prev, [docId]: true }));
    try {
      const type = docId === "driver_photo" ? "driver:driver_photo" : docId;
      const storageType = type.replace("driver:", "driver_");
      const url = file.uploadedUrl || await uploadDocument(file.uri, user.id, storageType);
      await apiRequest("POST", "/api/operator-profile/documents", { type, url });
      const savedFile = { ...file, uri: url, uploadedUrl: url };
      if (docId === "driver_photo") setDriverPhoto(savedFile);
      else setDocuments((prev) => ({ ...prev, [docId]: savedFile }));
    } catch {
      // Keep the selected file in the local draft. Submission will surface any backend issue.
    } finally {
      setUploadingDocs((prev) => ({ ...prev, [docId]: false }));
    }
  }

  function validate() {
    const normalizedPhone = normalizeSouthAfricanPhone(phoneLocal);
    if (!normalizedPhone || normalizedPhone.length < 11) {
      setError("Please enter a valid South African phone number.");
      return false;
    }
    if (!driverPhoto) {
      setError("Please upload a clear driver profile photo.");
      return false;
    }
    const missingDocs = DRIVER_DOCS.filter((doc) => !doc.optional && !documents[doc.id]);
    if (missingDocs.length > 0) {
      setError(`Please upload: ${missingDocs.map((doc) => doc.label).join(", ")}`);
      return false;
    }
    setError("");
    return true;
  }

  async function submit() {
    if (!user || !validate()) return;
    setLoading(true);
    setError("");
    try {
      for (const doc of DRIVER_DOCS) {
        const file = documents[doc.id];
        if (!file) continue;
        let url = file.uploadedUrl;
        if (!url && file.uri) {
          url = await uploadDocument(file.uri, user.id, doc.id.replace("driver:", "driver_"));
        }
        if (!url || url.startsWith("file:") || url.startsWith("content:")) {
          throw new Error(`Failed to upload ${doc.label}. Please try uploading again.`);
        }
        await apiRequest("POST", "/api/operator-profile/documents", { type: doc.id, url });
      }
      let finalPhotoUrl = driverPhoto?.uploadedUrl || null;
      if (driverPhoto && !finalPhotoUrl && driverPhoto.uri) {
        finalPhotoUrl = await uploadDocument(driverPhoto.uri, user.id, "driver_photo");
      }
      if (finalPhotoUrl && (finalPhotoUrl.startsWith("file:") || finalPhotoUrl.startsWith("content:"))) {
        throw new Error("Failed to upload profile photo. Please try again.");
      }
      if (driverPhoto && finalPhotoUrl) {
        await apiRequest("POST", "/api/operator-profile/documents", { type: "driver:driver_photo", url: finalPhotoUrl });
      }
      const fullPhone = normalizeSouthAfricanPhone(phoneLocal);
      const res = await apiRequest("POST", "/api/operator-profile/driver", { phone: fullPhone, profilePhoto: finalPhotoUrl });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Driver registration failed");
      }
      if (draftKey) await AsyncStorage.removeItem(draftKey);
      router.replace("/chauffeur");
    } catch (e: any) {
      setError(getDriverRegistrationErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20) }]}>
      <Pressable style={styles.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace("/chauffeur-onboarding")}>
        <Ionicons name="chevron-back" size={24} color={Colors.white} />
      </Pressable>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Driver Registration</Text>
          <Text style={styles.subtitle}>Submit your driver profile first. Vehicles are added after A2B approves your driver account. Your progress is saved automatically.</Text>
        </View>
        {!!error && <View style={styles.errorBox}><Ionicons name="alert-circle" size={16} color={Colors.error} /><Text style={styles.errorText}>{error}</Text></View>}

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Phone Number *</Text>
          <View style={styles.phoneInputRow}>
            <View style={styles.phonePrefixBadge}>
              <Text style={styles.phonePrefixText}>+27</Text>
            </View>
            <TextInput
              style={styles.phoneInput}
              value={phoneLocal}
              onChangeText={(text) => setPhoneLocal(formatPhoneLocalDisplay(text))}
              placeholder="82 123 4567"
              placeholderTextColor={Colors.textMuted}
              keyboardType="phone-pad"
              maxLength={12}
            />
          </View>
        </View>

        <Text style={styles.sectionTitle}>Driver Photo</Text>
        <View style={styles.photoRow}>
          <View style={styles.photoPreview}>
            {driverPhoto ? <Image source={{ uri: driverPhoto.uri }} style={styles.photoImage} /> : <Ionicons name="person" size={42} color={Colors.textMuted} />}
          </View>
          <View style={styles.photoActions}>
            {Platform.OS !== "web" && (
              <Pressable style={styles.secondaryBtn} onPress={() => pickImage("driver_photo", true)}>
                <Ionicons name="camera-outline" size={18} color={Colors.white} />
                <Text style={styles.secondaryBtnText}>Camera</Text>
              </Pressable>
            )}
            <Pressable style={styles.secondaryBtn} onPress={() => pickImage("driver_photo", false)}>
              <Ionicons name="images-outline" size={18} color={Colors.white} />
              <Text style={styles.secondaryBtnText}>Gallery</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Driver Documents</Text>
        <View style={styles.docs}>
          {DRIVER_DOCS.map((doc) => {
            const file = documents[doc.id];
            return (
              <Pressable key={doc.id} style={[styles.docRow, file && styles.docUploaded]} onPress={() => promptDocumentChoice(doc.id, doc.label)}>
                <Ionicons name={file ? "checkmark-circle" : "document-text-outline"} size={22} color={file ? Colors.success : Colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.docTitle}>{doc.label}</Text>
                  <Text style={styles.docMeta}>{uploadingDocs[doc.id] ? "Saving upload..." : file ? file.name : "Tap to take photo or choose from gallery"}</Text>
                </View>
                {Platform.OS !== "web" && (
                  <View style={styles.docActionIcons}>
                    <Pressable style={styles.docMiniBtn} onPress={() => void pickImage(doc.id, true)} hitSlop={6}>
                      <Ionicons name="camera-outline" size={17} color={Colors.white} />
                    </Pressable>
                    <Pressable style={styles.docMiniBtn} onPress={() => void pickImage(doc.id, false)} hitSlop={6}>
                      <Ionicons name="images-outline" size={17} color={Colors.white} />
                    </Pressable>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        <Pressable style={[styles.submitBtn, loading && { opacity: 0.7 }]} onPress={submit} disabled={loading}>
          {loading ? <ActivityIndicator color={Colors.primary} /> : <Text style={styles.submitText}>Submit Driver Application</Text>}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary, paddingHorizontal: 24 },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginLeft: -8 },
  content: { flexGrow: 1 },
  header: { marginTop: 12, marginBottom: 20, gap: 8 },
  title: { fontSize: 24, fontFamily: "Inter_700Bold", color: Colors.white },
  subtitle: { fontSize: 13, lineHeight: 19, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  inputGroup: { gap: 8, marginBottom: 20 },
  label: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.white },
  phoneInputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  phonePrefixBadge: {
    minHeight: 50,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  phonePrefixText: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.white },
  phoneInput: {
    flex: 1,
    minHeight: 50,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.white,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
  },
  input: { minHeight: 50, borderRadius: 12, paddingHorizontal: 14, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, color: Colors.white, fontFamily: "Inter_400Regular" },
  sectionTitle: { fontSize: 13, fontFamily: "Inter_700Bold", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },
  photoRow: { flexDirection: "row", gap: 14, alignItems: "center", marginBottom: 22 },
  photoPreview: { width: 92, height: 92, borderRadius: 46, alignItems: "center", justifyContent: "center", overflow: "hidden", backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border },
  photoImage: { width: "100%", height: "100%" },
  photoActions: { flex: 1, gap: 10 },
  secondaryBtn: { minHeight: 42, borderRadius: 12, backgroundColor: Colors.surface, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  secondaryBtnText: { color: Colors.white, fontFamily: "Inter_600SemiBold", fontSize: 13 },
  docs: { gap: 10 },
  docRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card },
  docUploaded: { borderColor: "rgba(76,175,80,0.35)" },
  docActionIcons: { flexDirection: "row", alignItems: "center", gap: 6 },
  docMiniBtn: { width: 34, height: 34, borderRadius: 8, backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center" },
  docTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.white },
  docMeta: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted, marginTop: 2 },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255,77,77,0.1)", padding: 12, borderRadius: 10, marginBottom: 12 },
  errorText: { flex: 1, fontSize: 13, color: Colors.error, fontFamily: "Inter_400Regular" },
  submitBtn: { minHeight: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: Colors.white, marginTop: 20 },
  submitText: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.primary },
});
