import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView,
  ActivityIndicator, Alert, Modal, TextInput, Platform, KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/query-client";
import Colors from "@/constants/colors";

interface Bank { name: string; code: string; }
interface Withdrawal { id: string; amount: number; status: string; bankName: string; accountNumber: string; createdAt: string; }

const SA_BANKS: Bank[] = [
  { name: "ABSA Bank", code: "632005" },
  { name: "African Bank", code: "430000" },
  { name: "Albaraka Bank", code: "800000" },
  { name: "Bidvest Bank", code: "462005" },
  { name: "Capitec Bank", code: "470010" },
  { name: "Discovery Bank", code: "679000" },
  { name: "Finbond Mutual Bank", code: "589000" },
  { name: "First National Bank (FNB)", code: "250655" },
  { name: "Grindrod Bank", code: "584000" },
  { name: "HBZ Bank", code: "570000" },
  { name: "Investec Bank", code: "580105" },
  { name: "Mercantile Bank", code: "450905" },
  { name: "Nedbank", code: "198765" },
  { name: "Old Mutual Bank", code: "462005" },
  { name: "Postbank", code: "460005" },
  { name: "Sasfin Bank", code: "683000" },
  { name: "Standard Bank", code: "051001" },
  { name: "State Bank of India", code: "801000" },
  { name: "TymeBank", code: "678910" },
  { name: "Ubank (Teba Bank)", code: "431010" },
  { name: "VBS Mutual Bank", code: "588000" },
];

interface Earning { id: string; amount: number; commission: number; createdAt: string; rideId: string; type?: string; }

export default function ChauffeurWalletScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [chauffeur, setChauffeur] = useState<any>(null);
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [walletBalance, setWalletBalance] = useState(0);
  const [banks, setBanks] = useState<Bank[]>(SA_BANKS);
  const [loading, setLoading] = useState(true);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [selectedTab, setSelectedTab] = useState<"earnings" | "withdrawals">("earnings");

  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [selectedBank, setSelectedBank] = useState<Bank | null>(null);
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [showBankPicker, setShowBankPicker] = useState(false);

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const [chaufRes, banksRes, meRes] = await Promise.all([
        apiRequest("GET", `/api/chauffeurs/user/${user.id}`).catch(() => null),
        apiRequest("GET", "/api/wallet/banks").catch(() => null),
        apiRequest("GET", "/api/auth/me").catch(() => null),
      ]);
      if (meRes) {
        try {
          const meData = await meRes.json();
          setWalletBalance(Number((meData?.user || meData)?.walletBalance || 0));
        } catch {}
      }
      if (chaufRes) {
        const chaufData = await chaufRes.json();
        setChauffeur(chaufData);

        if (chaufData?.id) {
          const [earningsRes, withdrawRes] = await Promise.all([
            apiRequest("GET", `/api/earnings/chauffeur/${chaufData.id}`).catch(() => null),
            apiRequest("GET", `/api/withdrawals/chauffeur/${chaufData.id}`).catch(() => null),
          ]);
          if (earningsRes) setEarnings(await earningsRes.json());
          if (withdrawRes) setWithdrawals(await withdrawRes.json());
        }
      }
      if (banksRes) {
        const banksData = await banksRes.json();
        if (Array.isArray(banksData) && banksData.length > 0) setBanks(banksData);
      }
    } catch (e) { console.error("Wallet load error", e); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { loadData(); }, []);

  async function handleWithdraw() {
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount < 50) { Alert.alert("Minimum withdrawal is R50"); return; }
    if (!selectedBank) { Alert.alert("Please select your bank"); return; }
    if (!accountNumber.trim() || accountNumber.length < 8) { Alert.alert("Please enter a valid account number"); return; }
    if (!accountName.trim()) { Alert.alert("Please enter the account holder name"); return; }
    const cardAvailable = earnings.filter(e => e.type === "card").reduce((s, e) => s + e.amount, 0);
    // Server draws from card earnings first, otherwise the wallet (referral earnings),
    // so a single request can withdraw up to the larger of the two sources.
    const available = Math.max(cardAvailable, walletBalance);
    if (available < amount) {
      Alert.alert("Not Enough Balance", `You have R${cardAvailable.toFixed(2)} in card earnings and R${walletBalance.toFixed(2)} in referral wallet available to withdraw. Please enter a lower amount.`);
      return;
    }

    setWithdrawLoading(true);
    try {
      const res = await apiRequest("POST", "/api/withdrawals", {
        amount,
        bankName: selectedBank.name,
        accountNumber: accountNumber.trim(),
        accountHolder: accountName.trim(),
      });
      const data = await res.json();
      setShowWithdraw(false);
      loadData();
      Alert.alert("✅ Withdrawal Requested",
        data.message || "Your request was sent to the A2B admin team for approval. Once approved, you will be paid via EFT.",
        [{ text: "OK" }]
      );
    } catch (e: any) {
      Alert.alert("Withdrawal Failed", (e.message || "Please try again").replace(/^\d+:\s*/, ""));
    } finally { setWithdrawLoading(false); }
  }

  const cardBalance = earnings
    .filter(e => e.type === "card")
    .reduce((sum, e) => sum + e.amount, 0);
  const earnings_total = cardBalance;
  const totalEarned = earnings
    .filter(e => e.type === "card" || e.type === "wallet")
    .reduce((sum, e) => sum + e.amount, 0);
  const totalWithdrawn = withdrawals.filter(w => ["completed", "paid", "approved"].includes(w.status)).reduce((sum, w) => sum + w.amount, 0);
  const maxWithdrawable = Math.max(earnings_total, walletBalance);

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEarnings = earnings
    .filter(e => e.createdAt && new Date(e.createdAt) >= todayStart)
    .reduce((sum, e) => sum + e.amount, 0);

  if (loading) {
    return (
      <View style={[styles.container, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator size="large" color={Colors.white} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>

        {/* ── Earnings Card ── */}
        <View style={styles.earningsCard}>
          <Text style={styles.earningsLabel}>Card Earnings (Withdrawable)</Text>
          <Text style={styles.earningsAmount}>R {earnings_total.toFixed(2)}</Text>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>R {todayEarnings.toFixed(2)}</Text>
              <Text style={styles.statLabel}>Today</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>R {totalEarned.toFixed(2)}</Text>
              <Text style={styles.statLabel}>Total Earned</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>R {totalWithdrawn.toFixed(2)}</Text>
              <Text style={styles.statLabel}>Withdrawn</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{earnings.length}</Text>
              <Text style={styles.statLabel}>Total Rides</Text>
            </View>
          </View>
          <Pressable
            style={[styles.withdrawBtn, maxWithdrawable < 50 && styles.withdrawBtnDisabled]}
            onPress={() => setShowWithdraw(true)}
            disabled={maxWithdrawable < 50}
          >
            <Ionicons name="arrow-down-circle-outline" size={16} color={maxWithdrawable < 50 ? Colors.textMuted : Colors.primary} />
            <Text style={[styles.withdrawBtnText, maxWithdrawable < 50 && styles.withdrawBtnTextDisabled]}>Withdraw to Bank</Text>
          </Pressable>
          {maxWithdrawable < 50 && (
            <View style={styles.minNoteRow}>
              <Ionicons name="information-circle-outline" size={14} color={Colors.textMuted} />
              <Text style={styles.minNote}>Minimum withdrawal is R50. Earn more rides or referral rewards to unlock.</Text>
            </View>
          )}
        </View>

        {/* ── Referral Wallet Card ── */}
        {walletBalance > 0 && (
          <View style={styles.referralWalletCard}>
            <View style={styles.referralWalletRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.referralWalletLabel}>Referral Wallet (Withdrawable)</Text>
                <Text style={styles.referralWalletAmount}>R {walletBalance.toFixed(2)}</Text>
                <Text style={styles.referralWalletSub}>Earnings from your referral programme. Withdraw them with the button above — requests go to A2B admin for approval.</Text>
              </View>
              <Ionicons name="gift-outline" size={26} color={Colors.accent} />
            </View>
          </View>
        )}

        {/* ── Tabs ── */}
        <View style={styles.tabs}>
          <Pressable
            style={[styles.tab, selectedTab === "earnings" && styles.tabActive]}
            onPress={() => setSelectedTab("earnings")}
          >
            <Text style={[styles.tabText, selectedTab === "earnings" && styles.tabTextActive]}>Earnings</Text>
          </Pressable>
          <Pressable
            style={[styles.tab, selectedTab === "withdrawals" && styles.tabActive]}
            onPress={() => setSelectedTab("withdrawals")}
          >
            <Text style={[styles.tabText, selectedTab === "withdrawals" && styles.tabTextActive]}>Withdrawals</Text>
          </Pressable>
        </View>

        {selectedTab === "earnings" && (
          <View style={styles.listSection}>
            {earnings.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyIcon}>💰</Text>
                <Text style={styles.emptyText}>No earnings yet</Text>
                <Text style={styles.emptySub}>Complete rides to earn money</Text>
              </View>
            ) : (
              earnings.map(e => {
                const method = e.type || (e.amount < 0 ? "cash" : "card");
                const isCash = method === "cash";
                const isWallet = method === "wallet";
                const iconName = isCash ? "cash-outline" : isWallet ? "wallet-outline" : "card-outline";
                const iconColor = isCash ? Colors.success : isWallet ? Colors.accent : "#60a5fa";
                const label = isCash ? "Cash Trip Commission" : isWallet ? "Wallet Trip Earnings" : "Card Trip Earnings";
                const sub = isCash
                  ? `Commission charged: R${e.commission.toFixed(2)} (cash collected)`
                  : `Commission: R${e.commission.toFixed(2)} deducted`;
                return (
                  <View key={e.id} style={styles.listRow}>
                    <View style={styles.listIcon}>
                      <Ionicons name={iconName as any} size={20} color={iconColor} />
                    </View>
                    <View style={styles.listInfo}>
                      <Text style={styles.listTitle}>{label}</Text>
                      <Text style={styles.listSub}>{sub}</Text>
                      <Text style={styles.listDate}>
                        {new Date(e.createdAt).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })}
                      </Text>
                    </View>
                    <Text style={[styles.listAmount, isCash && { color: Colors.error }]}>
                      {isCash ? `-R ${Math.abs(e.amount).toFixed(2)}` : `+R ${e.amount.toFixed(2)}`}
                    </Text>
                  </View>
                );
              })
            )}
          </View>
        )}

        {selectedTab === "withdrawals" && (
          <View style={styles.listSection}>
            {withdrawals.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyIcon}>🏦</Text>
                <Text style={styles.emptyText}>No withdrawals yet</Text>
                <Text style={styles.emptySub}>Your withdrawal history will appear here</Text>
              </View>
            ) : (
              withdrawals.map(w => (
                <View key={w.id} style={styles.listRow}>
                  <View style={styles.listIcon}>
                    <Text style={{ fontSize: 18 }}>⬇️</Text>
                  </View>
                  <View style={styles.listInfo}>
                    <Text style={styles.listTitle}>Bank Withdrawal</Text>
                    <Text style={styles.listSub}>{w.bankName} · {w.accountNumber?.slice(-4).padStart(w.accountNumber?.length, "•")}</Text>
                    <Text style={styles.listDate}>
                      {new Date(w.createdAt).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <Text style={[styles.listAmount, { color: Colors.error }]}>-R {w.amount.toFixed(2)}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: w.status === "completed" ? "rgba(34,197,94,0.12)" : w.status === "failed" ? "rgba(239,68,68,0.12)" : "rgba(255,214,0,0.12)" }]}>
                      <Text style={[styles.statusText, { color: w.status === "completed" ? Colors.success : w.status === "failed" ? Colors.error : "#b8860b" }]}>
                        {w.status === "completed" ? "Paid" : w.status === "pending" ? "Processing" : w.status === "failed" ? "Failed" : w.status}
                      </Text>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* ── Withdrawal Modal (single modal with internal bank picker view) ── */}
      <Modal visible={showWithdraw} transparent animationType="slide" onRequestClose={() => { if (showBankPicker) setShowBankPicker(false); else setShowWithdraw(false); }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 24, maxHeight: "90%" }]}>
            <View style={styles.sheetHandle} />

            {showBankPicker ? (
              /* ── Inline bank list ── */
              <>
                <View style={styles.bankPickerHeader}>
                  <Pressable onPress={() => setShowBankPicker(false)} hitSlop={12}>
                    <Ionicons name="chevron-back" size={22} color={Colors.white} />
                  </Pressable>
                  <Text style={styles.modalTitle}>Select Bank</Text>
                  <View style={{ width: 22 }} />
                </View>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {banks.map((bank, idx) => (
                    <Pressable
                      key={`${bank.code}-${idx}`}
                      style={[styles.bankRow, selectedBank?.code === bank.code && selectedBank?.name === bank.name && styles.bankRowSelected]}
                      onPress={() => { setSelectedBank(bank); setShowBankPicker(false); }}
                    >
                      <Text style={styles.bankName}>{bank.name}</Text>
                      {selectedBank?.code === bank.code && selectedBank?.name === bank.name && (
                        <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
                      )}
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            ) : (
              /* ── Withdrawal form ── */
              <>
                <Text style={styles.modalTitle}>Withdraw Earnings</Text>
                <Text style={styles.modalSub}>Card earnings available: R {earnings_total.toFixed(2)}</Text>

                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Amount (min R50)</Text>
                    <View style={styles.fieldWrap}>
                      <Text style={styles.randSign}>R</Text>
                      <TextInput
                        style={styles.fieldInput}
                        value={withdrawAmount}
                        onChangeText={setWithdrawAmount}
                        keyboardType="numeric"
                        placeholder="0.00"
                        placeholderTextColor={Colors.textMuted}
                      />
                    </View>
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Bank</Text>
                    <Pressable style={styles.bankPicker} onPress={() => setShowBankPicker(true)}>
                      <Text style={selectedBank ? styles.bankPickerValue : styles.bankPickerPlaceholder}>
                        {selectedBank?.name || "Select your bank"}
                      </Text>
                      <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
                    </Pressable>
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Account Number</Text>
                    <View style={styles.fieldWrap}>
                      <TextInput
                        style={[styles.fieldInput, { paddingLeft: 0 }]}
                        value={accountNumber}
                        onChangeText={setAccountNumber}
                        keyboardType="numeric"
                        placeholder="Enter account number"
                        placeholderTextColor={Colors.textMuted}
                      />
                    </View>
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Account Holder Name</Text>
                    <View style={styles.fieldWrap}>
                      <TextInput
                        style={[styles.fieldInput, { paddingLeft: 0 }]}
                        value={accountName}
                        onChangeText={setAccountName}
                        placeholder="As it appears on your bank account"
                        placeholderTextColor={Colors.textMuted}
                      />
                    </View>
                  </View>

                  <View style={styles.paystackNote}>
                    <Ionicons name="shield-checkmark-outline" size={14} color={Colors.textSecondary} />
                    <Text style={styles.paystackNoteText}>Powered by Paystack · Funds arrive within 24hrs</Text>
                  </View>

                  <View style={styles.modalActions}>
                    <Pressable style={styles.cancelBtn} onPress={() => setShowWithdraw(false)}>
                      <Text style={styles.cancelBtnText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.confirmBtn, withdrawLoading && { opacity: 0.7 }]}
                      onPress={handleWithdraw}
                      disabled={withdrawLoading}
                    >
                      {withdrawLoading
                        ? <ActivityIndicator color={Colors.primary} size="small" />
                        : <Text style={styles.confirmBtnText}>Withdraw</Text>
                      }
                    </Pressable>
                  </View>
                </ScrollView>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  earningsCard: {
    margin: 20, padding: 24,
    backgroundColor: Colors.card, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.border, alignItems: "center", gap: 8,
  },
  earningsLabel: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 },
  earningsAmount: { fontSize: 42, fontFamily: "Inter_700Bold", color: Colors.white, letterSpacing: -1 },
  referralWalletCard: {
    marginHorizontal: 20, marginBottom: 4, padding: 18,
    backgroundColor: Colors.card, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border,
  },
  referralWalletRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  referralWalletLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 },
  referralWalletAmount: { fontSize: 26, fontFamily: "Inter_700Bold", color: Colors.white, marginTop: 4 },
  referralWalletSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 6, lineHeight: 17 },
  statsRow: { flexDirection: "row", alignItems: "center", marginTop: 8, marginBottom: 4 },
  stat: { flex: 1, alignItems: "center", gap: 2 },
  statValue: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.white },
  statLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  statDivider: { width: 1, height: 28, backgroundColor: Colors.border },
  withdrawBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: Colors.white, paddingVertical: 10, paddingHorizontal: 24,
    borderRadius: 12, marginTop: 4,
  },
  withdrawBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.primary },
  withdrawBtnDisabled: { backgroundColor: Colors.surface, opacity: 0.6 },
  withdrawBtnTextDisabled: { color: Colors.textMuted },
  minNoteRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  minNote: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  tabs: { flexDirection: "row", marginHorizontal: 20, backgroundColor: Colors.surface, borderRadius: 12, padding: 4, marginBottom: 16 },
  tab: { flex: 1, paddingVertical: 9, alignItems: "center", borderRadius: 10 },
  tabActive: { backgroundColor: Colors.card },
  tabText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.textMuted },
  tabTextActive: { color: Colors.white, fontFamily: "Inter_600SemiBold" },
  listSection: { marginHorizontal: 20 },
  listRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: Colors.card, borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  listIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center" },
  listInfo: { flex: 1, gap: 2 },
  listTitle: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.white },
  listSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  listDate: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  listAmount: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.success },
  statusBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
  statusText: { fontSize: 10, fontFamily: "Inter_600SemiBold", textTransform: "uppercase" },
  empty: { alignItems: "center", paddingVertical: 40, gap: 8 },
  emptyIcon: { fontSize: 36 },
  emptyText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.white },
  emptySub: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 12 },
  sheetHandle: { width: 36, height: 4, backgroundColor: Colors.accent, borderRadius: 2, alignSelf: "center" },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.white },
  modalSub: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textMuted, marginTop: -6 },
  fieldGroup: { gap: 6, marginBottom: 12 },
  fieldLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 1 },
  fieldWrap: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 16, borderWidth: 1, borderColor: Colors.border },
  randSign: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.white, marginRight: 4 },
  fieldInput: { flex: 1, paddingVertical: 13, fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.white },
  bankPicker: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1, borderColor: Colors.border },
  bankPickerValue: { fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.white },
  bankPickerPlaceholder: { fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  paystackNote: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  paystackNoteText: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  modalActions: { flexDirection: "row", gap: 12 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center", backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  cancelBtnText: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  confirmBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center", backgroundColor: Colors.white },
  confirmBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.primary },
  bankPickerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, marginBottom: 8 },
  bankRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: Colors.border },
  bankRowSelected: { backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 8 },
  bankName: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.white },
});
