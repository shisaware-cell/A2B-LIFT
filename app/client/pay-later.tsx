import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/query-client";
import { uploadDocument } from "@/lib/supabase-storage";
import Colors from "@/constants/colors";

const REQUIRED_DOCUMENTS = [
  { type: "pay_later:id_copy", label: "ID copy", icon: "id-card-outline" as const },
  { type: "pay_later:employment_contract", label: "Employment contract", icon: "briefcase-outline" as const },
  { type: "pay_later:payslip", label: "Latest payslip", icon: "document-text-outline" as const },
  { type: "pay_later:proof_of_address", label: "Proof of address", icon: "home-outline" as const },
];

type PayLaterDocument = { type: string; url: string; name?: string };

export default function PayLaterScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [data, setData] = useState<any>(null);
  const [documents, setDocuments] = useState<Record<string, PayLaterDocument>>({});

  async function load() {
    try {
      const response = await apiRequest("GET", "/api/pay-later/me");
      setData(await response.json());
    } catch (error: any) {
      Alert.alert("Pay Later", error?.message || "Unable to load Pay Later.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function chooseDocument(type: string) {
    if (!user?.id || submitting) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setSubmitting(true);
      const url = await uploadDocument(asset.uri, user.id, type.replace(":", "_"), {
        fileName: asset.name,
        mimeType: asset.mimeType,
      });
      setDocuments((current) => ({ ...current, [type]: { type, url, name: asset.name } }));
    } catch (error: any) {
      Alert.alert("Upload failed", error?.message || "This document could not be uploaded.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitApplication() {
    if (Object.keys(documents).length !== REQUIRED_DOCUMENTS.length) {
      Alert.alert("Documents required", "Upload all four documents before submitting.");
      return;
    }
    try {
      setSubmitting(true);
      const response = await apiRequest("POST", "/api/pay-later/apply", {
        documents: Object.values(documents),
      });
      const application = await response.json();
      setData((current: any) => ({ ...current, application }));
      setDocuments({});
      Alert.alert("Application submitted", "Your Pay Later documents are now with the admin team.");
    } catch (error: any) {
      Alert.alert("Application failed", error?.message?.replace(/^\d+:\s*/, "") || "Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const application = data?.application;
  const canApply = data?.eligible && (!application || application.status === "rejected");

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}> 
      <View style={styles.header}>
        <Pressable style={styles.iconButton} onPress={() => router.back()} accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Pay Later</Text>
        <View style={styles.iconButton} />
      </View>

      {loading ? <ActivityIndicator style={styles.loader} color={Colors.primary} /> : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}>
          {!data?.eligible ? (
            <View style={styles.section}>
              <Ionicons name="ribbon-outline" size={28} color={Colors.primary} />
              <Text style={styles.sectionTitle}>Lift Club approval required</Text>
              <Text style={styles.body}>Pay Later applications are available only to approved Lift Club members.</Text>
              <Pressable style={styles.primaryButton} onPress={() => router.push("/client/lift-club" as any)}>
                <Text style={styles.primaryButtonText}>Open Lift Club</Text>
              </Pressable>
            </View>
          ) : application && application.status !== "rejected" ? (
            <>
              <View style={styles.balancePanel}>
                <Text style={styles.balanceLabel}>Available Pay Later credit</Text>
                <Text style={styles.balanceValue}>R {Number(application.availableCredit || 0).toFixed(2)}</Text>
                <Text style={styles.body}>This credit is separate from your A2B wallet.</Text>
              </View>
              <View style={styles.section}>
                <View style={styles.statusRow}>
                  <Text style={styles.sectionTitle}>Application status</Text>
                  <Text style={styles.status}>{String(application.status).replace(/_/g, " ")}</Text>
                </View>
                <Text style={styles.body}>{application.status === "approved" ? "You can select Pay Later when requesting a ride if your available credit covers the fare." : "Your documents are waiting for admin review."}</Text>
              </View>
            </>
          ) : canApply ? (
            <>
              {application?.rejectionReason ? (
                <View style={styles.warning}><Text style={styles.warningText}>{application.rejectionReason}</Text></View>
              ) : null}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Required documents</Text>
                <Text style={styles.body}>Upload a clear PDF or image for each item.</Text>
                {REQUIRED_DOCUMENTS.map((item) => {
                  const selected = documents[item.type];
                  return (
                    <Pressable key={item.type} style={styles.documentRow} onPress={() => chooseDocument(item.type)}>
                      <Ionicons name={selected ? "checkmark-circle" : item.icon} size={22} color={selected ? Colors.success : Colors.textMuted} />
                      <View style={styles.documentCopy}>
                        <Text style={styles.documentName}>{item.label}</Text>
                        <Text numberOfLines={1} style={styles.documentMeta}>{selected?.name || "Tap to upload"}</Text>
                      </View>
                      <Ionicons name="cloud-upload-outline" size={20} color={Colors.textMuted} />
                    </Pressable>
                  );
                })}
                <Pressable style={[styles.primaryButton, (submitting || Object.keys(documents).length !== 4) && styles.disabled]} disabled={submitting || Object.keys(documents).length !== 4} onPress={submitApplication}>
                  {submitting ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryButtonText}>Submit application</Text>}
                </Pressable>
              </View>
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.primary },
  header: { height: 56, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  iconButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { color: Colors.textPrimary, fontSize: 18, fontFamily: "Inter_600SemiBold" },
  loader: { marginTop: 48 },
  content: { padding: 16, gap: 14 },
  section: { backgroundColor: Colors.card, borderRadius: 8, padding: 16, gap: 10 },
  balancePanel: { backgroundColor: "#151515", borderRadius: 8, padding: 18, gap: 5, borderWidth: 1, borderColor: Colors.border },
  balanceLabel: { color: Colors.textMuted, fontSize: 13, fontFamily: "Inter_400Regular" },
  balanceValue: { color: Colors.textPrimary, fontSize: 30, fontFamily: "Inter_700Bold" },
  sectionTitle: { color: Colors.textPrimary, fontSize: 16, fontFamily: "Inter_600SemiBold" },
  body: { color: Colors.textMuted, fontSize: 13, lineHeight: 19, fontFamily: "Inter_400Regular" },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  status: { color: Colors.warning, fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" },
  documentRow: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  documentCopy: { flex: 1, minWidth: 0 },
  documentName: { color: Colors.textPrimary, fontSize: 14, fontFamily: "Inter_500Medium" },
  documentMeta: { color: Colors.textMuted, fontSize: 12, marginTop: 3, fontFamily: "Inter_400Regular" },
  primaryButton: { height: 48, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: Colors.white, marginTop: 8 },
  primaryButtonText: { color: "#000", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  disabled: { opacity: 0.45 },
  warning: { borderRadius: 8, padding: 14, backgroundColor: "#2B1717" },
  warningText: { color: "#FFB4AB", fontSize: 13, lineHeight: 19, fontFamily: "Inter_400Regular" },
});
