import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator, Platform, ScrollView, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/query-client";
import { uploadDocument } from "@/lib/supabase-storage";
import Colors from "@/constants/colors";

const PARTNER_DOCS = [
  { id: "partner:company_registration", label: "Company Registration", optional: true },
  { id: "partner:director_id", label: "Director ID" },
  { id: "partner:proof_of_address", label: "Proof of Address" },
  { id: "partner:operating_permit", label: "Operating Permit", optional: true },
  { id: "partner:bank_account_details", label: "Bank Account Details" },
];

type DraftFile = { uri: string; name: string; uploadedUrl?: string };
type DraftDocuments = Record<string, DraftFile | null>;

function emptyDocs(): DraftDocuments {
  return Object.fromEntries(PARTNER_DOCS.map((doc) => [doc.id, null])) as DraftDocuments;
}

function getPartnerRegistrationErrorMessage(error: any) {
  const message = String(error?.message || "");
  if (
    message.includes("/api/operator-profile") ||
    message.includes("Cannot POST /api/operator-profile") ||
    message.includes("Cannot GET /api/operator-profile")
  ) {
    return "Partner registration is waiting for the latest backend deployment. Your progress is saved on this device. Please update the backend and try again.";
  }
  return message || "Partner registration failed. Please try again.";
}

export default function PartnerRegisterScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [form, setForm] = useState({
    companyName: "",
    registrationNumber: "",
    contactPersonName: user?.name || "",
    contactPhone: user?.phone || "",
    contactEmail: user?.username || "",
    bankName: "",
    accountHolder: "",
    accountNumber: "",
  });
  const [documents, setDocuments] = useState<DraftDocuments>(emptyDocs);
  const [uploadingDocs, setUploadingDocs] = useState<Record<string, boolean>>({});
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const draftKey = user?.id ? `a2b_partner_registration_draft_${user.id}` : null;

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
          if (draft?.form) setForm((prev) => ({ ...prev, ...draft.form }));
          if (draft?.documents) setDocuments({ ...emptyDocs(), ...draft.documents });
        }
        if (Array.isArray(serverDocs)) {
          const restoredDocs = emptyDocs();
          serverDocs.forEach((doc: any) => {
            const type = String(doc?.type || "");
            const url = String(doc?.url || "");
            if (!url || !(type in restoredDocs)) return;
            restoredDocs[type] = { uri: url, uploadedUrl: url, name: type.replace("partner:", "").replace(/_/g, " ") };
          });
          setDocuments((prev) => {
            const next = { ...prev };
            Object.entries(restoredDocs).forEach(([type, file]) => {
              if (file && !next[type]) next[type] = file;
            });
            return next;
          });
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setDraftLoaded(true); });
    return () => { cancelled = true; };
  }, [draftKey]);

  useEffect(() => {
    if (!draftKey || !draftLoaded) return;
    AsyncStorage.setItem(draftKey, JSON.stringify({ form, documents })).catch(() => {});
  }, [documents, draftKey, draftLoaded, form]);

  function update(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function pickDocument(type: string) {
    try {
      if (Platform.OS !== "web") {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permission needed", "Please allow photo access.");
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.65 });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        const file = { uri: asset.uri, name: asset.fileName || `${type}.jpg` };
        setDocuments((prev) => ({ ...prev, [type]: file }));
        void autosaveDocumentUpload(type, file);
      }
    } catch {
      Alert.alert("Error", "Could not open image picker.");
    }
  }

  async function autosaveDocumentUpload(type: string, file: DraftFile) {
    if (!user) return;
    setUploadingDocs((prev) => ({ ...prev, [type]: true }));
    try {
      const url = file.uploadedUrl || await uploadDocument(file.uri, user.id, type.replace("partner:", "partner_"));
      await apiRequest("POST", "/api/operator-profile/documents", { type, url });
      setDocuments((prev) => ({ ...prev, [type]: { ...file, uri: url, uploadedUrl: url } }));
    } catch {
      // Keep the selected file in the local draft. Submission will surface any backend issue.
    } finally {
      setUploadingDocs((prev) => ({ ...prev, [type]: false }));
    }
  }

  function validate() {
    const optionalFields = new Set(["companyName", "registrationNumber"]);
    const missingFields = Object.entries(form)
      .filter(([key, value]) => !optionalFields.has(key) && !String(value || "").trim())
      .map(([key]) => key);
    if (missingFields.length > 0) {
      setError("Please complete all partner details.");
      return false;
    }
    const missingDocs = PARTNER_DOCS.filter((doc) => !doc.optional && !documents[doc.id]);
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
      for (const doc of PARTNER_DOCS) {
        const file = documents[doc.id];
        if (!file) continue;
        if (!file.uploadedUrl) {
          let url = file.uri;
          try {
            url = await uploadDocument(file.uri, user.id, doc.id.replace("partner:", "partner_"));
          } catch {}
          await apiRequest("POST", "/api/operator-profile/documents", { type: doc.id, url });
        }
      }
      const res = await apiRequest("POST", "/api/operator-profile/partner", form);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Partner registration failed");
      }
      if (draftKey) await AsyncStorage.removeItem(draftKey);
      router.replace("/chauffeur");
    } catch (e: any) {
      setError(getPartnerRegistrationErrorMessage(e));
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
          <Text style={styles.title}>Partner Registration</Text>
          <Text style={styles.subtitle}>Submit your partner profile and required documents. Your progress is saved automatically.</Text>
        </View>
        {!!error && <View style={styles.errorBox}><Ionicons name="alert-circle" size={16} color={Colors.error} /><Text style={styles.errorText}>{error}</Text></View>}

        <View style={styles.form}>
          {([
            ["companyName", "Company Name"],
            ["registrationNumber", "Registration Number"],
            ["contactPersonName", "Contact Person"],
            ["contactPhone", "Contact Phone"],
            ["contactEmail", "Contact Email"],
            ["bankName", "Bank Name"],
            ["accountHolder", "Account Holder"],
            ["accountNumber", "Account Number"],
          ] as const).map(([field, label]) => (
            <View key={field} style={styles.inputGroup}>
              <Text style={styles.label}>{label}{["companyName", "registrationNumber"].includes(field) ? " (optional)" : " *"}</Text>
              <TextInput
                style={styles.input}
                value={form[field]}
                onChangeText={(value) => update(field, value)}
                placeholderTextColor={Colors.textMuted}
                keyboardType={field.includes("Phone") ? "phone-pad" : field.includes("Email") ? "email-address" : "default"}
              />
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Partner Documents</Text>
        <View style={styles.form}>
          {PARTNER_DOCS.map((doc) => {
            const file = documents[doc.id];
            return (
              <Pressable key={doc.id} style={[styles.docRow, file && styles.docRowUploaded]} onPress={() => pickDocument(doc.id)}>
                <Ionicons name={file ? "checkmark-circle" : "cloud-upload-outline"} size={22} color={file ? Colors.success : Colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.docTitle}>{doc.label}{doc.optional ? " (optional)" : ""}</Text>
                  <Text style={styles.docMeta}>{uploadingDocs[doc.id] ? "Saving upload..." : file ? file.name : "Tap to upload"}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <Pressable style={[styles.submitBtn, loading && { opacity: 0.7 }]} onPress={submit} disabled={loading}>
          {loading ? <ActivityIndicator color={Colors.primary} /> : <Text style={styles.submitText}>Submit Partner Application</Text>}
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
  form: { gap: 12, marginBottom: 18 },
  inputGroup: { gap: 8 },
  label: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.white },
  input: { minHeight: 48, borderRadius: 12, paddingHorizontal: 14, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, color: Colors.white, fontFamily: "Inter_400Regular" },
  sectionTitle: { fontSize: 13, fontFamily: "Inter_700Bold", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },
  docRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card },
  docRowUploaded: { borderColor: "rgba(76,175,80,0.35)" },
  docTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.white },
  docMeta: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted, marginTop: 2 },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255,77,77,0.1)", padding: 12, borderRadius: 10, marginBottom: 12 },
  errorText: { flex: 1, fontSize: 13, color: Colors.error, fontFamily: "Inter_400Regular" },
  submitBtn: { minHeight: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: Colors.white, marginTop: 4 },
  submitText: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.primary },
});
