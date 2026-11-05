import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator, Platform, ScrollView, FlatList, Alert, Modal, KeyboardAvoidingView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/query-client";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { whiteButtonHiddenStyle } from "@/lib/maintenance-config";

const REPORT_TYPES = [
  { id: "emergency", label: "Emergency", icon: "warning" as const, color: Colors.error },
  { id: "safety", label: "Safety Concern", icon: "shield-checkmark" as const, color: Colors.warning },
  { id: "complaint", label: "Complaint", icon: "chatbubble-ellipses" as const, color: Colors.textSecondary },
];

export default function SafetyScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [showReport, setShowReport] = useState(false);
  const [reportType, setReportType] = useState("safety");
  const [description, setDescription] = useState("");
  const [aiResponse, setAiResponse] = useState("");

  const { data: reports, isLoading, refetch } = useQuery({
    queryKey: ["/api/safety-reports/user", user?.id || ""],
    enabled: !!user,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/safety-reports", {
        userId: user?.id,
        type: reportType,
        description,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setAiResponse(data.aiResponse);
      setDescription("");
      queryClient.invalidateQueries({ queryKey: ["/api/safety-reports/user", user?.id || ""] });
    },
    onError: () => {
      Alert.alert("Error", "Failed to submit report");
    },
  });

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high": return Colors.error;
      case "medium": return Colors.warning;
      default: return Colors.textSecondary;
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  const renderReport = useCallback(({ item }: { item: any }) => (
    <View style={styles.reportCard}>
      <View style={styles.reportHeader}>
        <View style={[styles.priorityDot, { backgroundColor: getPriorityColor(item.priority) }]} />
        <Text style={styles.reportType}>{item.type.charAt(0).toUpperCase() + item.type.slice(1)}</Text>
        <View style={[styles.statusBadge, { backgroundColor: item.status === "open" ? "rgba(255,183,77,0.15)" : "rgba(76,175,80,0.15)" }]}>
          <Text style={[styles.statusText, { color: item.status === "open" ? Colors.warning : Colors.success }]}>{item.status}</Text>
        </View>
      </View>
      <Text style={styles.reportDesc} numberOfLines={2}>{item.description}</Text>
      {item.aiResponse && (
        <View style={styles.aiBox}>
          <Ionicons name="sparkles" size={14} color={Colors.white} />
          <Text style={styles.aiText} numberOfLines={3}>{item.aiResponse}</Text>
        </View>
      )}
      <Text style={styles.reportDate}>{formatDate(item.createdAt)}</Text>
    </View>
  ), []);

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16) }]}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.navigate("/client/profile")}>
          <Ionicons name="chevron-back" size={24} color={Colors.white} />
        </Pressable>
        <Text style={styles.title}>Safety</Text>
        <Pressable onPress={() => { setShowReport(true); setAiResponse(""); }}>
          <Ionicons name="add" size={24} color={Colors.white} />
        </Pressable>
      </View>

      <View style={styles.emergencyBanner}>
        <Ionicons name="call" size={20} color={Colors.error} />
        <View style={styles.emergencyInfo}>
          <Text style={styles.emergencyTitle}>Emergency? Call 10111</Text>
          <Text style={styles.emergencyDesc}>For immediate danger, contact police directly</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.white} />
        </View>
      ) : !reports || (Array.isArray(reports) && reports.length === 0) ? (
        <View style={styles.center}>
          <Ionicons name="shield-checkmark-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyText}>No safety reports</Text>
          <Text style={styles.emptySubtext}>Tap + to report an issue</Text>
        </View>
      ) : (
        <FlatList
          data={Array.isArray(reports) ? reports : []}
          keyExtractor={(item) => item.id}
          renderItem={renderReport}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Modal visible={showReport} transparent animationType="slide" onRequestClose={() => setShowReport(false)}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
        <Pressable style={styles.modalOverlay} onPress={() => setShowReport(false)}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 24) }]} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Report an Issue</Text>

            <View style={styles.typeRow}>
              {REPORT_TYPES.map((rt) => (
                <Pressable
                  key={rt.id}
                  style={[styles.typeChip, reportType === rt.id && { borderColor: rt.color, backgroundColor: `${rt.color}15` }]}
                  onPress={() => setReportType(rt.id)}
                >
                  <Ionicons name={rt.icon} size={16} color={reportType === rt.id ? rt.color : Colors.textMuted} />
                  <Text style={[styles.typeText, reportType === rt.id && { color: rt.color }]}>{rt.label}</Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              style={styles.descInput}
              placeholder="Describe what happened..."
              placeholderTextColor={Colors.textMuted}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            {aiResponse ? (
              <View style={styles.aiResponseBox}>
                <View style={styles.aiResponseHeader}>
                  <Ionicons name="sparkles" size={16} color={Colors.white} />
                  <Text style={styles.aiResponseTitle}>Safety Response</Text>
                </View>
                <Text style={styles.aiResponseText}>{aiResponse}</Text>
                <Pressable style={styles.doneBtn} onPress={() => setShowReport(false)}>
                  <Text style={styles.doneBtnText}>Done</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={({ pressed }) => [styles.submitBtn, pressed && { opacity: 0.9 }, submitMutation.isPending && { opacity: 0.7 }]}
                onPress={() => {
                  if (!description.trim()) {
                    Alert.alert("Required", "Please describe the issue");
                    return;
                  }
                  submitMutation.mutate();
                }}
                disabled={submitMutation.isPending}
              >
                {submitMutation.isPending ? (
                  <ActivityIndicator color={Colors.primary} />
                ) : (
                  <Text style={styles.submitBtnText}>Submit Report</Text>
                )}
              </Pressable>
            )}
          </View>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary, paddingHorizontal: 20 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.white },
  emergencyBanner: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: "rgba(255,77,77,0.08)", borderRadius: 14, padding: 16, borderWidth: 1, borderColor: "rgba(255,77,77,0.2)", marginBottom: 20 },
  emergencyInfo: { flex: 1, gap: 2 },
  emergencyTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.error },
  emergencyDesc: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  emptyText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary },
  emptySubtext: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  list: { gap: 10, paddingBottom: 100 },
  reportCard: { backgroundColor: Colors.card, borderRadius: 14, padding: 16, gap: 10, borderWidth: 1, borderColor: Colors.border },
  reportHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  priorityDot: { width: 8, height: 8, borderRadius: 4 },
  reportType: { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.white },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase" as const },
  reportDesc: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, lineHeight: 18 },
  aiBox: { flexDirection: "row", gap: 8, backgroundColor: Colors.surface, borderRadius: 10, padding: 12, alignItems: "flex-start" },
  aiText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted, lineHeight: 17 },
  reportDate: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 16 },
  sheetHandle: { width: 36, height: 4, backgroundColor: Colors.accent, borderRadius: 2, alignSelf: "center" },
  sheetTitle: { fontSize: 20, fontFamily: "Inter_600SemiBold", color: Colors.white },
  typeRow: { flexDirection: "row", gap: 8 },
  typeChip: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  typeText: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.textMuted },
  descInput: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.white, height: 110, borderWidth: 1, borderColor: Colors.border },
  aiResponseBox: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, gap: 12 },
  aiResponseHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  aiResponseTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.white },
  aiResponseText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary, lineHeight: 20 },
  doneBtn: { backgroundColor: Colors.white, paddingVertical: 12, borderRadius: 12, alignItems: "center", ...whiteButtonHiddenStyle },
  doneBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.primary },
  submitBtn: { backgroundColor: Colors.white, paddingVertical: 16, borderRadius: 14, alignItems: "center", ...whiteButtonHiddenStyle },
  submitBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.primary },
});
