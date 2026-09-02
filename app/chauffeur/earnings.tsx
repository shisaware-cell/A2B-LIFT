import React, { useState, useEffect, useMemo } from "react";
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
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/query-client";
import Colors from "@/constants/colors";

export default function EarningsScreen() {
  const insets = useSafeAreaInsets();
  const [chauffeurId, setChauffeurId] = useState<string | null>(null);
  const [chauffeur, setChauffeur] = useState<any>(null);
  const [operatorProfile, setOperatorProfile] = useState<any>(null);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [selectedBank, setSelectedBank] = useState<{ name: string; code: string } | null>(null);
  const [showBankPicker, setShowBankPicker] = useState(false);
  const [driverSearch, setDriverSearch] = useState("");

  useEffect(() => {
    AsyncStorage.getItem("a2b_chauffeur").then((stored) => {
      if (stored) {
        const c = JSON.parse(stored);
        setChauffeurId(c.id);
        setChauffeur(c);
      }
    });
    apiRequest("GET", "/api/operator-profile/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.profile) setOperatorProfile(data.profile);
      })
      .catch(() => {});
  }, []);

  const isPartner =
    operatorProfile?.type === "partner" ||
    operatorProfile?.type === "fleet" ||
    (operatorProfile?.status === "approved" && operatorProfile?.type !== "driver");

  // Partner fleet earnings query
  const {
    data: fleetEarningsData,
    isLoading: fleetLoading,
    refetch: refetchFleet,
  } = useQuery({
    queryKey: ["/api/fleet/earnings-summary"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/fleet/earnings-summary");
      return res.json();
    },
    enabled: isPartner,
  });

  // Solo driver queries
  const { data: earningsData, isLoading: driverLoading, refetch: refetchDriver } = useQuery({
    queryKey: ["/api/earnings/chauffeur", chauffeurId || ""],
    enabled: !isPartner && !!chauffeurId,
  });

  const { data: withdrawals } = useQuery({
    queryKey: ["/api/withdrawals/chauffeur", chauffeurId || ""],
    enabled: !!chauffeurId || isPartner,
  });

  const { data: annualShare } = useQuery({
    queryKey: ["/api/earnings/chauffeur", chauffeurId || "", "annual-share"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/earnings/chauffeur/${chauffeurId}/annual-share`);
      return res.json();
    },
    enabled: !isPartner && !!chauffeurId,
  });

  const { data: banksData, isLoading: banksLoading } = useQuery({
    queryKey: ["/api/wallet/banks"],
    enabled: showWithdraw,
    staleTime: 1000 * 60 * 10,
  });

  const availableWithdrawBalance = isPartner
    ? fleetEarningsData?.endBalance || 0
    : (Array.isArray(earningsData) ? earningsData : [])
        .filter((e: any) => e.type === "card" || e.type === "wallet" || String(e.type || "").startsWith("long_distance_card"))
        .reduce((sum: number, e: any) => sum + (e.amount || 0), 0);

  const withdrawMutation = useMutation({
    mutationFn: async () => {
      const amt = parseFloat(withdrawAmount);
      if (!amt || amt <= 0) throw new Error("Enter a valid amount");
      if (amt > availableWithdrawBalance)
        throw new Error(`You only have R${availableWithdrawBalance.toFixed(2)} available to withdraw`);
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
      queryClient.invalidateQueries({ queryKey: ["/api/fleet/earnings-summary"] });
      Alert.alert("Withdrawal Submitted", data.message || "Transfer initiated — funds arrive within 24hrs");
    },
    onError: (err: any) => {
      Alert.alert("Error", err.message || "Failed to submit withdrawal");
    },
  });

  const earningsList = Array.isArray(earningsData) ? earningsData : [];
  const cardEarnings = earningsList.filter(
    (e: any) => e.type === "card" || e.type === "wallet" || String(e.type || "").startsWith("long_distance_card")
  );
  const totalEarnings = cardEarnings.reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
  const totalCommission = cardEarnings.reduce((sum: number, e: any) => sum + (e.commission || 0), 0);
  const withdrawalsList = Array.isArray(withdrawals) ? withdrawals : [];
  const banksList = Array.isArray(banksData) ? banksData : [];

  const partnerDrivers = useMemo(() => {
    const list = fleetEarningsData?.drivers || [];
    if (!driverSearch.trim()) return list;
    const q = driverSearch.trim().toLowerCase();
    return list.filter((d: any) => {
      const haystack = [d.driverName, d.driverPhone, d.vehicle].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [fleetEarningsData, driverSearch]);

  const handleRefresh = () => {
    if (isPartner) refetchFleet();
    else refetchDriver();
  };

  return (
    <View style={[styles.mainContainer, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 12) }]}>
      {/* ─── Header ─── */}
      <View style={styles.headerBar}>
        <Pressable
          style={styles.headerBtn}
          onPress={() => router.back()}
          accessibilityLabel="Back"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color="#000000" />
        </Pressable>
        <Text style={styles.headerTitle}>Earnings</Text>
        <Pressable
          style={styles.payoutActionBtn}
          onPress={() => setShowWithdraw(true)}
          accessibilityLabel="Request Payout"
        >
          <Ionicons name="cash-outline" size={18} color="#000000" />
          <Text style={styles.payoutActionText}>Payout</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isPartner ? fleetLoading : driverLoading}
            onRefresh={handleRefresh}
            tintColor="#000000"
          />
        }
      >
        {isPartner ? (
          /* ─── PARTNER / FLEET MANAGER VIEW (Image 1 reference) ─── */
          <>
            {/* Top Summary Table */}
            <View style={styles.partnerSummaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Adjustments from previous periods</Text>
                <Text style={styles.summaryValue}>
                  ZAR {(fleetEarningsData?.adjustmentsFromPreviousPeriods || 0).toFixed(2)}
                </Text>
              </View>

              <View style={styles.summaryDivider} />

              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Payout</Text>
                <Text style={styles.summaryValue}>
                  ZAR {(fleetEarningsData?.payout || 0).toFixed(2)}
                </Text>
              </View>

              <View style={styles.summaryDividerBold} />

              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, styles.endBalanceLabel]}>End Balance</Text>
                <Text style={[styles.summaryValue, styles.endBalanceValue]}>
                  ZAR {(fleetEarningsData?.endBalance || 0).toFixed(2)}
                </Text>
              </View>
            </View>

            {/* Information Notice Card */}
            <View style={styles.infoNoticeCard}>
              <View style={styles.infoNoticeIconWrap}>
                <Ionicons name="bookmark" size={16} color="#FFFFFF" />
              </View>
              <Text style={styles.infoNoticeText}>
                An earnings week goes from Monday at 4:00 AM to the following Monday at 3:59 AM in your local time zone. Processing times can vary depending on your bank.
              </Text>
            </View>

            {/* Driver Net Earnings Section */}
            <View style={styles.driverSectionHeader}>
              <Text style={styles.driverSectionTitle}>Driver Net earnings</Text>
            </View>

            {/* Search Bar */}
            <View style={styles.searchBarContainer}>
              <Ionicons name="search" size={18} color="#6B7280" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Driver name"
                placeholderTextColor="#9CA3AF"
                value={driverSearch}
                onChangeText={setDriverSearch}
                autoCorrect={false}
              />
              {!!driverSearch && (
                <Pressable onPress={() => setDriverSearch("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={16} color="#9CA3AF" />
                </Pressable>
              )}
            </View>

            {/* Driver Table / List / Empty State */}
            {partnerDrivers.length === 0 ? (
              <View style={styles.emptyStateContainer}>
                <Text style={styles.emptyStateTitle}>No results</Text>
                <Text style={styles.emptyStateSubtitle}>There are no results to show in this table.</Text>
              </View>
            ) : (
              <View style={styles.driverListContainer}>
                {partnerDrivers.map((driver: any) => (
                  <View key={driver.driverOperatorProfileId} style={styles.driverEarningsCard}>
                    <View style={styles.driverCardHeader}>
                      {driver.profilePhoto ? (
                        <Image source={{ uri: driver.profilePhoto }} style={styles.driverAvatar} />
                      ) : (
                        <View style={styles.driverAvatarPlaceholder}>
                          <Ionicons name="person" size={18} color="#6B7280" />
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.driverCardName}>{driver.driverName}</Text>
                        <Text style={styles.driverCardSub}>{driver.vehicle || driver.driverPhone || "Assigned Driver"}</Text>
                      </View>
                      <View style={styles.driverTripBadge}>
                        <Text style={styles.driverTripBadgeText}>{driver.totalTrips} trips</Text>
                      </View>
                    </View>

                    <View style={styles.driverMetricsRow}>
                      <View style={styles.driverMetricItem}>
                        <Text style={styles.metricLabel}>Gross Fares</Text>
                        <Text style={styles.metricValue}>ZAR {driver.grossFares.toFixed(2)}</Text>
                      </View>
                      <View style={styles.driverMetricItem}>
                        <Text style={styles.metricLabel}>Commission</Text>
                        <Text style={styles.metricValue}>ZAR {driver.commissionTotal.toFixed(2)}</Text>
                      </View>
                      <View style={styles.driverMetricItem}>
                        <Text style={styles.metricLabel}>Net Earnings</Text>
                        <Text style={[styles.metricValue, { color: "#10B981", fontWeight: "700" }]}>
                          ZAR {driver.netEarnings.toFixed(2)}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        ) : (
          /* ─── SOLO DRIVER VIEW ─── */
          <>
            <View style={styles.totalCard}>
              <Text style={styles.totalLabel}>Card Trip Earnings</Text>
              <Text style={styles.totalValue}>R {totalEarnings.toFixed(0)}</Text>
              <Text style={styles.totalSub}>Commission paid: R {totalCommission.toFixed(0)} (rate varies by category)</Text>
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
                    <View
                      style={[
                        styles.statusChip,
                        {
                          backgroundColor:
                            w.status === "completed"
                              ? `${Colors.success}20`
                              : w.status === "pending"
                              ? `${Colors.warning}20`
                              : `${Colors.textMuted}20`,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusChipText,
                          {
                            color:
                              w.status === "completed"
                                ? Colors.success
                                : w.status === "pending"
                                ? Colors.warning
                                : Colors.textMuted,
                          },
                        ]}
                      >
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
          </>
        )}
      </ScrollView>

      {/* ─── Withdrawal Modal ─── */}
      <Modal visible={showWithdraw} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Withdraw Payout</Text>
              <Pressable onPress={() => setShowWithdraw(false)}>
                <Ionicons name="close" size={22} color={Colors.white} />
              </Pressable>
            </View>

            <Text style={styles.balanceHint}>
              Available balance: ZAR {availableWithdrawBalance.toFixed(2)}
            </Text>

            <Text style={styles.fieldLabel}>Amount (ZAR)</Text>
            <View
              style={[
                styles.amountRow,
                parseFloat(withdrawAmount) > availableWithdrawBalance &&
                  !!withdrawAmount && { borderColor: Colors.error },
              ]}
            >
              <Text style={styles.currencyPrefix}>R</Text>
              <TextInput
                style={styles.amountInput}
                placeholder="0.00"
                placeholderTextColor={Colors.textMuted}
                value={withdrawAmount}
                onChangeText={setWithdrawAmount}
                keyboardType="numeric"
              />
            </View>
            {!!withdrawAmount && parseFloat(withdrawAmount) > availableWithdrawBalance && (
              <Text style={styles.inputError}>
                You only have ZAR {availableWithdrawBalance.toFixed(2)} available. Please enter a lower amount.
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
              <Ionicons
                name={showBankPicker ? "chevron-up" : "chevron-down"}
                size={16}
                color={Colors.textMuted}
              />
            </Pressable>

            {showBankPicker && (
              <View style={styles.bankDropdown}>
                {banksLoading ? (
                  <ActivityIndicator color={Colors.white} style={{ paddingVertical: 16 }} />
                ) : banksList.length === 0 ? (
                  <Text style={styles.bankEmptyText}>No banks found. Try again.</Text>
                ) : (
                  <ScrollView
                    style={{ maxHeight: 200 }}
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="handled"
                  >
                    {banksList.map((bank: any) => (
                      <Pressable
                        key={bank.code}
                        style={({ pressed }) => [styles.bankDropdownItem, pressed && { opacity: 0.7 }]}
                        onPress={() => {
                          setSelectedBank(bank);
                          setShowBankPicker(false);
                        }}
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
              style={({ pressed }) => [
                styles.submitBtn,
                pressed && { opacity: 0.85 },
                withdrawMutation.isPending && { opacity: 0.6 },
              ]}
              onPress={() => withdrawMutation.mutate()}
              disabled={withdrawMutation.isPending}
            >
              {withdrawMutation.isPending ? (
                <ActivityIndicator color={Colors.primary} />
              ) : (
                <Text style={styles.submitBtnText}>Submit Payout Request</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: "#FFFFFF" },
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8 },

  // Header Bar
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#000000",
    letterSpacing: -0.3,
  },
  payoutActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F3F4F6",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  payoutActionText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#000000",
  },

  // Partner Summary Table (Image 1 reference)
  partnerSummaryCard: {
    backgroundColor: "#FFFFFF",
    marginTop: 8,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
  },
  summaryLabel: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: "#111827",
    flex: 1,
    paddingRight: 12,
  },
  summaryValue: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: "#111827",
  },
  summaryDivider: {
    height: 1,
    backgroundColor: "#F3F4F6",
  },
  summaryDividerBold: {
    height: 1.5,
    backgroundColor: "#111827",
    marginVertical: 4,
  },
  endBalanceLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
  },
  endBalanceValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
  },

  // Information Notice Card (Image 1 reference)
  infoNoticeCard: {
    flexDirection: "row",
    backgroundColor: "#F0F4FA",
    borderRadius: 16,
    padding: 18,
    alignItems: "flex-start",
    gap: 14,
    marginBottom: 26,
  },
  infoNoticeIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  infoNoticeText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#374151",
    lineHeight: 20,
  },

  // Driver Net Earnings Section Header
  driverSectionHeader: {
    marginBottom: 12,
  },
  driverSectionTitle: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: "#000000",
    letterSpacing: -0.4,
  },

  // Search Bar (Image 1 reference)
  searchBarContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: 24,
    paddingHorizontal: 16,
    height: 50,
    marginBottom: 40,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: "#000000",
  },

  // Empty State (Image 1 reference)
  emptyStateContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 50,
  },
  emptyStateTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#000000",
    marginBottom: 8,
  },
  emptyStateSubtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: "#6B7280",
    textAlign: "center",
  },

  // Driver List / Cards
  driverListContainer: {
    gap: 12,
  },
  driverEarningsCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 12,
  },
  driverCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  driverAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  driverAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  driverCardName: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#111827",
  },
  driverCardSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#6B7280",
    marginTop: 2,
  },
  driverTripBadge: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  driverTripBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#374151",
  },
  driverMetricsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    paddingTop: 10,
  },
  driverMetricItem: {
    gap: 2,
  },
  metricLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "#9CA3AF",
    textTransform: "uppercase",
  },
  metricValue: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#111827",
  },

  // ─── Solo Driver Styles ───
  totalCard: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 20,
  },
  totalLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
    textTransform: "uppercase" as const,
    letterSpacing: 1,
  },
  totalValue: { fontSize: 40, fontFamily: "Inter_700Bold", color: Colors.white },
  totalSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  shareCard: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    padding: 20,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 20,
  },
  shareHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  shareEyebrow: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: Colors.success,
    textTransform: "uppercase" as const,
    letterSpacing: 1,
  },
  shareTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.white, marginTop: 3 },
  shareAmount: { fontSize: 34, fontFamily: "Inter_700Bold", color: Colors.white },
  shareCopy: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, lineHeight: 19 },
  shareRules: { gap: 5, paddingTop: 4 },
  shareRule: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.textMuted },
  shareMotto: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.success, paddingTop: 2 },
  withdrawBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.white,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 12,
  },
  withdrawBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.primary },
  statsRow: { flexDirection: "row", gap: 12, marginBottom: 24 },
  statCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statValue: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.white },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  sectionTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
    textTransform: "uppercase" as const,
    letterSpacing: 1,
    marginBottom: 12,
  },
  withdrawalItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  withdrawalInfo: { gap: 2 },
  withdrawalAmount: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.white },
  withdrawalDate: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  statusChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusChipText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  earningItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  earningIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: `${Colors.success}20`,
    alignItems: "center",
    justifyContent: "center",
  },
  earningInfo: { flex: 1, gap: 2 },
  earningAmount: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.white },
  earningCommission: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  earningDate: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted },

  // Withdrawal Modal Styles
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.white },
  balanceHint: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textMuted, marginBottom: 4 },
  fieldLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  currencyPrefix: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.textSecondary },
  amountInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
    marginLeft: 8,
  },
  bankSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  bankSelectorText: { fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.white },
  textField: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  submitBtn: {
    backgroundColor: Colors.white,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 4,
  },
  submitBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.primary },
  inputError: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.error,
    marginTop: 4,
    marginBottom: 2,
  },
  bankDropdown: {
    backgroundColor: Colors.accent,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 4,
    marginBottom: 4,
    overflow: "hidden",
  },
  bankDropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  bankEmptyText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    textAlign: "center" as const,
    paddingVertical: 16,
  },
  bankItemText: { fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.white },
});
