import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Alert,
  RefreshControl,
  Modal,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/query-client";
import Colors from "@/constants/colors";

export default function EarningsScreen() {
  const insets = useSafeAreaInsets();
  const [chauffeurId, setChauffeurId] = useState<string | null>(null);
  const [chauffeur, setChauffeur] = useState<any>(null);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [selectedBank, setSelectedBank] = useState<{ name: string; code: string } | null>(null);
  const [showBankPicker, setShowBankPicker] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem("a2b_chauffeur").then((stored) => {
      if (stored) {
        const c = JSON.parse(stored);
        setChauffeurId(c.id);
        setChauffeur(c);
      }
    });
  }, []);

  const { data: earningsData, isLoading, refetch } = useQuery({
    queryKey: ["/api/earnings/chauffeur", chauffeurId || ""],
    enabled: !!chauffeurId,
  });

  const { data: withdrawals } = useQuery({
    queryKey: ["/api/withdrawals/chauffeur", chauffeurId || ""],
    enabled: !!chauffeurId,
  });

  const { data: annualShare } = useQuery({
    queryKey: ["/api/earnings/chauffeur", chauffeurId || "", "annual-share"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/earnings/chauffeur/${chauffeurId}/annual-share`);
      return res.json();
    },
    enabled: !!chauffeurId,
  });

  const { data: banksData, isLoading: banksLoading } = useQuery({
    queryKey: ["/api/wallet/banks"],
    enabled: showWithdraw,
    staleTime: 1000 * 60 * 10,
  });

  const withdrawMutation = useMutation({
    mutationFn: async () => {
      const amt = parseFloat(withdrawAmount);
      if (!amt || amt <= 0) throw new Error("Enter a valid amount");
      if (amt > totalEarnings) throw new Error(`You only have R${totalEarnings.toFixed(2)} available to withdraw`);
      if (!selectedBank) throw new Error("Select a bank");
      if (!accountNumber.trim()) throw new Error("Enter your account number");
      if (!accountName.trim()) throw new Error("Enter the account holder name");

      const res = await apiRequest("POST", "/api/wallet/withdraw", {
        amount: amt,
        bankCode: selectedBank.code,
        bankName: selectedBank.name,
        accountNumber: accountNumber.trim(),
        accountName: accountName.trim(),
      });
      return res.json();
    },
    onSuccess: (data) => {
      setShowWithdraw(false);
      setWithdrawAmount("");
      setAccountNumber("");
      setAccountName("");
      setSelectedBank(null);
      queryClient.invalidateQueries({ queryKey: ["/api/withdrawals/chauffeur"] });
      Alert.alert("Withdrawal Submitted", data.message || "Transfer initiated — funds arrive within 24hrs");
    },
    onError: (err: any) => {
      Alert.alert("Error", err.message || "Failed to submit withdrawal");
    },
  });

  const earningsList = Array.isArray(earningsData) ? earningsData : [];
  const cardEarnings = earningsList.filter((e: any) => e.type === "card" || e.type === "wallet" || String(e.type || "").startsWith("long_distance_card"));
  const totalEarnings = cardEarnings.reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
  const totalCommission = cardEarnings.reduce((sum: number, e: any) => sum + (e.commission || 0), 0);
  const withdrawalsList = Array.isArray(withdrawals) ? withdrawals : [];
  const banksList = Array.isArray(banksData) ? banksData : [];

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16) }]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor={Colors.white} />}
    >
      <Text style={styles.title}>Earnings</Text>

      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Card Trip Earnings</Text>
        <Text style={styles.totalValue}>R {totalEarnings.toFixed(0)}</Text>
        <Text style={styles.totalSub}>Commission paid: R {totalCommission.toFixed(0)} (30%)</Text>
        <Pressable
          style={({ pressed }) => [styles.withdrawBtn, pressed && { opacity: 0.9 }]}
          onPress={() => setShowWithdraw(true)}
        >
          <Ionicons name="arrow-up-circle" size={18} color={Colors.primary} />
          <Text style={styles.withdrawBtnText}>Request Withdrawal</Text>
        </Pressable>
      </View>

      <View style={styles.shareCard}>
        <View style={styles.shareHeader}>
          <View>
            <Text style={styles.shareEyebrow}>Annual Driver Share</Text>
            <Text style={styles.shareTitle}>{annualShare?.year || new Date().getFullYear()} December payout</Text>
          </View>
          <Ionicons name="gift-outline" size={22} color={Colors.success} />
        </View>
        <Text style={styles.shareAmount}>R {(annualShare?.annualShare || 0).toFixed(0)}</Text>
        <Text style={styles.shareCopy}>
          5% of every qualifying normal and long-distance trip is accumulated for your annual driver reward. Daily Lift Club trips are excluded.
        </Text>
        <View style={styles.shareRules}>
          <Text style={styles.shareRule}>Trips counted: {annualShare?.qualifyingTrips || 0}</Text>
          <Text style={styles.shareRule}>Total commission: 30% | Annual share allocation: 5%</Text>
          <Text style={styles.shareRule}>Rules: 3+ months active, 5 trips/week, good service standards</Text>
        </View>
        <Text style={styles.shareMotto}>Improving Drivers' Lives and Building True Partnerships.</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Ionicons name="car-sport" size={20} color={Colors.textSecondary} />
          <Text style={styles.statValue}>{earningsList.length}</Text>
          <Text style={styles.statLabel}>Completed Trips</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="trending-up" size={20} color={Colors.success} />
          <Text style={styles.statValue}>R {totalEarnings.toFixed(0)}</Text>
          <Text style={styles.statLabel}>Card Earnings</Text>
        </View>
      </View>

      {withdrawalsList.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Withdrawal History</Text>
          {withdrawalsList.map((w: any) => (
            <View key={w.id} style={styles.withdrawalItem}>
              <View style={styles.withdrawalInfo}>
                <Text style={styles.withdrawalAmount}>R {w.amount}</Text>
                <Text style={styles.withdrawalDate}>
                  {new Date(w.createdAt).toLocaleDateString("en-ZA")}
                </Text>
              </View>
              <View style={[styles.statusChip, {
                backgroundColor: w.status === "completed" ? `${Colors.success}20` :
                  w.status === "pending" ? `${Colors.warning}20` : `${Colors.textMuted}20`
              }]}>
                <Text style={[styles.statusChipText, {
                  color: w.status === "completed" ? Colors.success :
                    w.status === "pending" ? Colors.warning : Colors.textMuted
                }]}>
                  {w.status.charAt(0).toUpperCase() + w.status.slice(1)}
                </Text>
              </View>
            </View>
          ))}
        </>
      )}

      {earningsList.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Recent Earnings</Text>
          {earningsList.slice(0, 10).map((e: any) => (
            <View key={e.id} style={styles.earningItem}>
              <View style={styles.earningIcon}>
                <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
              </View>
              <View style={styles.earningInfo}>
                <Text style={styles.earningAmount}>R {e.amount?.toFixed(0)}</Text>
                <Text style={styles.earningCommission}>Commission: R {e.commission?.toFixed(0)}</Text>
              </View>
              <Text style={styles.earningDate}>
                {new Date(e.createdAt).toLocaleDateString("en-ZA")}
              </Text>
            </View>
          ))}
        </>
      )}

      {isLoading && <ActivityIndicator color={Colors.white} style={{ marginTop: 40 }} />}

      <View style={{ height: 120 }} />

      {/* Withdrawal Modal */}
      <Modal visible={showWithdraw} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Withdraw Earnings</Text>
              <Pressable onPress={() => setShowWithdraw(false)}>
                <Ionicons name="close" size={22} color={Colors.white} />
              </Pressable>
            </View>

            <Text style={styles.balanceHint}>
              Card earnings available: R {totalEarnings.toFixed(2)}
            </Text>

            <Text style={styles.fieldLabel}>Amount (ZAR)</Text>
            <View style={[styles.amountRow, parseFloat(withdrawAmount) > totalEarnings && !!withdrawAmount && { borderColor: Colors.error }]}>
              <Text style={styles.currencyPrefix}>R</Text>
              <TextInput
                style={styles.amountInput}
                placeholder="0"
                placeholderTextColor={Colors.textMuted}
                value={withdrawAmount}
                onChangeText={setWithdrawAmount}
                keyboardType="number-pad"
              />
            </View>
            {!!withdrawAmount && parseFloat(withdrawAmount) > totalEarnings && (
              <Text style={styles.inputError}>
                You only have R{totalEarnings.toFixed(2)} available. Please enter a lower amount.
              </Text>
            )}

            <Text style={styles.fieldLabel}>Bank</Text>
            <Pressable
              style={[styles.bankSelector, showBankPicker && { borderColor: Colors.white }]}
              onPress={() => setShowBankPicker((v) => !v)}
            >
              <Text style={[styles.bankSelectorText, !selectedBank && { color: Colors.textMuted }]}>
                {selectedBank ? selectedBank.name : "Select your bank"}
              </Text>
              <Ionicons name={showBankPicker ? "chevron-up" : "chevron-down"} size={16} color={Colors.textMuted} />
            </Pressable>

            {showBankPicker && (
              <View style={styles.bankDropdown}>
                {banksLoading ? (
                  <ActivityIndicator color={Colors.white} style={{ paddingVertical: 16 }} />
                ) : banksList.length === 0 ? (
                  <Text style={styles.bankEmptyText}>No banks found. Try again.</Text>
                ) : (
                  <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                    {banksList.map((bank: any) => (
                      <Pressable
                        key={bank.code}
                        style={({ pressed }) => [styles.bankDropdownItem, pressed && { opacity: 0.7 }]}
                        onPress={() => { setSelectedBank(bank); setShowBankPicker(false); }}
                      >
                        <Text style={styles.bankItemText}>{bank.name}</Text>
                        {selectedBank?.code === bank.code && (
                          <Ionicons name="checkmark" size={16} color={Colors.success} />
                        )}
                      </Pressable>
                    ))}
                  </ScrollView>
                )}
              </View>
            )}

            <Text style={styles.fieldLabel}>Account Number</Text>
            <TextInput
              style={styles.textField}
              placeholder="Enter account number"
              placeholderTextColor={Colors.textMuted}
              value={accountNumber}
              onChangeText={setAccountNumber}
              keyboardType="number-pad"
            />

            <Text style={styles.fieldLabel}>Account Holder Name</Text>
            <TextInput
              style={styles.textField}
              placeholder="Name as on bank account"
              placeholderTextColor={Colors.textMuted}
              value={accountName}
              onChangeText={setAccountName}
            />

            <Pressable
              style={({ pressed }) => [styles.submitBtn, pressed && { opacity: 0.85 }, withdrawMutation.isPending && { opacity: 0.6 }]}
              onPress={() => withdrawMutation.mutate()}
              disabled={withdrawMutation.isPending}
            >
              {withdrawMutation.isPending
                ? <ActivityIndicator color={Colors.primary} />
                : <Text style={styles.submitBtnText}>Submit Withdrawal</Text>
              }
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary, paddingHorizontal: 20 },
  scrollContent: { paddingBottom: 40 },
  title: { fontSize: 24, fontFamily: "Inter_700Bold", color: Colors.white, marginBottom: 20 },
  totalCard: { backgroundColor: Colors.card, borderRadius: 20, padding: 28, alignItems: "center", gap: 6, borderWidth: 1, borderColor: Colors.border, marginBottom: 20 },
  totalLabel: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.textSecondary, textTransform: "uppercase" as const, letterSpacing: 1 },
  totalValue: { fontSize: 40, fontFamily: "Inter_700Bold", color: Colors.white },
  totalSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  shareCard: { backgroundColor: Colors.card, borderRadius: 18, padding: 20, gap: 10, borderWidth: 1, borderColor: Colors.border, marginBottom: 20 },
  shareHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  shareEyebrow: { fontSize: 11, fontFamily: "Inter_700Bold", color: Colors.success, textTransform: "uppercase" as const, letterSpacing: 1 },
  shareTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.white, marginTop: 3 },
  shareAmount: { fontSize: 34, fontFamily: "Inter_700Bold", color: Colors.white },
  shareCopy: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, lineHeight: 19 },
  shareRules: { gap: 5, paddingTop: 4 },
  shareRule: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.textMuted },
  shareMotto: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.success, paddingTop: 2 },
  withdrawBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.white, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 12, marginTop: 12 },
  withdrawBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.primary },
  statsRow: { flexDirection: "row", gap: 12, marginBottom: 24 },
  statCard: { flex: 1, backgroundColor: Colors.card, borderRadius: 14, padding: 18, alignItems: "center", gap: 6, borderWidth: 1, borderColor: Colors.border },
  statValue: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.white },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  sectionTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary, textTransform: "uppercase" as const, letterSpacing: 1, marginBottom: 12 },
  withdrawalItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: Colors.card, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  withdrawalInfo: { gap: 2 },
  withdrawalAmount: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.white },
  withdrawalDate: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  statusChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusChipText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  earningItem: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: Colors.card, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  earningIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: `${Colors.success}20`, alignItems: "center", justifyContent: "center" },
  earningInfo: { flex: 1, gap: 2 },
  earningAmount: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.white },
  earningCommission: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  earningDate: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 14, borderWidth: 1, borderColor: Colors.border },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.white },
  balanceHint: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textMuted, marginBottom: 4 },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary, textTransform: "uppercase" as const, letterSpacing: 0.8 },
  amountRow: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 16, borderWidth: 1, borderColor: Colors.border },
  currencyPrefix: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.textSecondary },
  amountInput: { flex: 1, paddingVertical: 14, fontSize: 24, fontFamily: "Inter_700Bold", color: Colors.white, marginLeft: 8 },
  bankSelector: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1, borderColor: Colors.border },
  bankSelectorText: { fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.white },
  textField: { backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.white, borderWidth: 1, borderColor: Colors.border },
  submitBtn: { backgroundColor: Colors.white, paddingVertical: 16, borderRadius: 14, alignItems: "center", marginTop: 4 },
  submitBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.primary },
  inputError: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.error, marginTop: 4, marginBottom: 2 },
  bankDropdown: { backgroundColor: Colors.accent, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, marginTop: 4, marginBottom: 4, overflow: "hidden" },
  bankDropdownItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  bankEmptyText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textMuted, textAlign: "center" as const, paddingVertical: 16 },
  bankItemText: { fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.white },
});
