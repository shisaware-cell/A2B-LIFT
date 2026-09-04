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

export default function EarningsBreakdownScreen() {
  const insets = useSafeAreaInsets();
  const [chauffeurId, setChauffeurId] = useState<string | null>(null);
  const [driverSearch, setDriverSearch] = useState("");
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [selectedBank, setSelectedBank] = useState<{ name: string; code: string } | null>(null);
  const [showBankPicker, setShowBankPicker] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem("a2b_chauffeur").then((stored) => {
      if (stored) {
        try {
          const c = JSON.parse(stored);
          setChauffeurId(c.id);
        } catch {
          // fallback
        }
      }
    });
  }, []);

  const { data: profileData } = useQuery({
    queryKey: ["/api/operator-profile/me"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/operator-profile/me");
      return res.ok ? res.json() : null;
    },
    staleTime: 1000 * 60 * 5,
  });

  const effectiveProfile = profileData?.profile;
  const isPartner =
    effectiveProfile?.type === "partner" && effectiveProfile?.status === "approved";

  // Primary breakdown query from backend fleet/driver earnings summary
  const {
    data: summaryData,
    isLoading: summaryLoading,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ["/api/fleet/earnings-summary"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/fleet/earnings-summary");
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 1000 * 30,
  });

  // Chauffeur direct earnings fallback query
  const { data: driverEarnings, refetch: refetchDriver } = useQuery({
    queryKey: ["/api/earnings/chauffeur", chauffeurId || ""],
    enabled: !!chauffeurId && !summaryData,
  });

  const { data: withdrawals } = useQuery({
    queryKey: ["/api/withdrawals/chauffeur", chauffeurId || ""],
    enabled: !!chauffeurId,
  });

  const { data: banksData, isLoading: banksLoading } = useQuery({
    queryKey: ["/api/wallet/banks"],
    enabled: showWithdraw,
    staleTime: 1000 * 60 * 10,
  });

  const handleRefresh = () => {
    refetchSummary();
    if (chauffeurId) refetchDriver();
  };

  // Resolve breakdown figures
  const driverEarningsList = Array.isArray(driverEarnings) ? driverEarnings : [];
  const soloEarnings = driverEarningsList
    .filter((e: any) => e.type === "card" || e.type === "wallet" || String(e.type || "").startsWith("long_distance_card"))
    .reduce((sum: number, e: any) => sum + (e.amount || 0), 0);

  const startBalance = Number(summaryData?.startBalance ?? 0);
  const totalEarnings = Number(summaryData?.totalEarnings ?? summaryData?.totalFleetNetEarnings ?? soloEarnings);
  const refundsAndExpenses = Number(summaryData?.refundsAndExpenses ?? 0);
  const adjustments = Number(summaryData?.adjustmentsFromPreviousPeriods ?? 0);
  const payout = Number(summaryData?.payout ?? 0);
  const endBalance = Number(
    summaryData?.endBalance ?? Math.max(0, startBalance + totalEarnings - refundsAndExpenses + adjustments - payout)
  );

  const availableWithdrawBalance = endBalance;

  // Filter drivers for Driver Net earnings table
  const allDrivers = useMemo(() => {
    if (Array.isArray(summaryData?.drivers) && summaryData.drivers.length > 0) {
      return summaryData.drivers;
    }
    return [];
  }, [summaryData]);

  const filteredDrivers = useMemo(() => {
    if (!driverSearch.trim()) return allDrivers;
    const q = driverSearch.trim().toLowerCase();
    return allDrivers.filter((d: any) => {
      const searchTarget = [d.driverName, d.driverPhone, d.vehicle].filter(Boolean).join(" ").toLowerCase();
      return searchTarget.includes(q);
    });
  }, [allDrivers, driverSearch]);

  const withdrawMutation = useMutation({
    mutationFn: async () => {
      const amt = parseFloat(withdrawAmount);
      if (!amt || amt <= 0) throw new Error("Enter a valid amount");
      if (amt > availableWithdrawBalance) {
        throw new Error(`You only have ZAR ${availableWithdrawBalance.toFixed(2)} available to withdraw`);
      }
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

  const banksList = Array.isArray(banksData) ? banksData : [];

  return (
    <View style={styles.mainContainer}>
      {/* ─── Top Header (Clean back button) ─── */}
      <View style={[styles.topHeaderBar, { paddingTop: Math.max(insets.top, Platform.OS === "android" ? 28 : 16) }]}>
        <Pressable
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="arrow-back" size={26} color="#000000" />
        </Pressable>

        {endBalance > 0 && (
          <Pressable
            style={styles.headerPayoutBtn}
            onPress={() => setShowWithdraw(true)}
            accessibilityRole="button"
            accessibilityLabel="Payout"
          >
            <Ionicons name="cash-outline" size={16} color="#10B981" />
            <Text style={styles.headerPayoutText}>Payout</Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={summaryLoading}
            onRefresh={handleRefresh}
            tintColor="#000000"
            colors={["#000000"]}
          />
        }
      >
        {/* ─── Menu Icon (Image 1 reference) ─── */}
        <View style={styles.menuIconRow}>
          <Ionicons name="menu" size={26} color="#000000" />
        </View>

        {/* ─── Screen Title: Earnings (Image 1 reference) ─── */}
        <Text style={styles.screenTitle}>Earnings</Text>

        {/* ─── Circular Calendar Button (Image 1 reference) ─── */}
        <Pressable
          style={styles.calendarCircleBtn}
          onPress={() => router.push("/chauffeur/earnings-select-week" as never)}
          accessibilityRole="button"
          accessibilityLabel="Select date range"
        >
          <Ionicons name="calendar" size={20} color="#000000" />
        </Pressable>

        {/* ─── Breakdown Summary Table (Image 1 reference) ─── */}
        <View style={styles.breakdownTable}>
          {/* Start balance */}
          <View style={styles.tableRow}>
            <Text style={styles.rowLabel}>Start balance</Text>
            <Text style={styles.rowValue}>ZAR {startBalance.toFixed(2)}</Text>
          </View>
          <View style={styles.thinDivider} />

          {/* Total earnings */}
          <View style={styles.tableRow}>
            <Text style={styles.rowLabel}>Total earnings</Text>
            <Text style={styles.rowValue}>ZAR {totalEarnings.toFixed(2)}</Text>
          </View>
          <View style={styles.thinDivider} />

          {/* Refunds & Expenses */}
          <View style={styles.tableRow}>
            <Text style={styles.rowLabel}>Refunds & Expenses</Text>
            <Text style={styles.rowValue}>ZAR {refundsAndExpenses.toFixed(2)}</Text>
          </View>
          <View style={styles.thinDivider} />

          {/* Adjustments from previous periods */}
          <View style={styles.tableRow}>
            <Text style={[styles.rowLabel, { maxWidth: "70%" }]}>Adjustments from previous periods</Text>
            <Text style={styles.rowValue}>ZAR {adjustments.toFixed(2)}</Text>
          </View>
          <View style={styles.thinDivider} />

          {/* Payout */}
          <View style={styles.tableRow}>
            <Text style={styles.rowLabel}>Payout</Text>
            <Text style={styles.rowValue}>ZAR {payout.toFixed(2)}</Text>
          </View>

          {/* Solid bold divider above End Balance */}
          <View style={styles.boldDivider} />

          {/* End Balance */}
          <View style={styles.tableRow}>
            <Text style={styles.endBalanceLabel}>End Balance</Text>
            <Text style={styles.endBalanceValue}>ZAR {endBalance.toFixed(2)}</Text>
          </View>

          {/* Solid bold divider below End Balance */}
          <View style={styles.boldDivider} />
        </View>

        {/* ─── Information Notice Card (Image 2 reference) ─── */}
        <View style={styles.noticeCard}>
          <View style={styles.noticeBookmarkWrap}>
            <Ionicons name="bookmark" size={22} color="#000000" />
          </View>
          <Text style={styles.noticeText}>
            Weekly earnings cycles run from Monday at 00:00 to Sunday at 23:59. Real-time trip earnings, customer fare shares, and platform adjustments update automatically. Verified payouts are disbursed on Mondays directly to your South African bank account.
          </Text>
        </View>

        {/* ─── Driver Net Earnings Section (Image 2 reference) ─── */}
        <Text style={styles.driverSectionHeading}>Driver Net earnings</Text>

        {/* ─── Search Bar (Image 2 reference) ─── */}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color="#000000" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Driver name"
            placeholderTextColor="#9CA3AF"
            value={driverSearch}
            onChangeText={setDriverSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {!!driverSearch && (
            <Pressable
              onPress={() => setDriverSearch("")}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Clear search"
            >
              <Ionicons name="close-circle" size={18} color="#9CA3AF" />
            </Pressable>
          )}
        </View>

        {/* ─── Driver Table / Empty State (Image 2 reference) ─── */}
        {filteredDrivers.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>No results</Text>
            <Text style={styles.emptySubtitle}>There are no results to show in this table.</Text>
          </View>
        ) : (
          <View style={styles.driversList}>
            {filteredDrivers.map((driver: any) => (
              <View key={driver.driverOperatorProfileId || driver.chauffeurId || driver.userId} style={styles.driverCard}>
                <View style={styles.driverCardHeader}>
                  {driver.profilePhoto ? (
                    <Image source={{ uri: driver.profilePhoto }} style={styles.driverAvatar} />
                  ) : (
                    <View style={styles.driverAvatarPlaceholder}>
                      <Ionicons name="person" size={18} color="#4B5563" />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.driverName}>{driver.driverName}</Text>
                    <Text style={styles.driverMeta}>{driver.vehicle || driver.driverPhone || "Active Driver"}</Text>
                  </View>
                  <View style={styles.tripCountBadge}>
                    <Text style={styles.tripCountText}>{driver.totalTrips || 0} trips</Text>
                  </View>
                </View>

                <View style={styles.driverMetricsRow}>
                  <View style={styles.driverMetricItem}>
                    <Text style={styles.metricLabel}>Gross Fares</Text>
                    <Text style={styles.metricValue}>ZAR {(driver.grossFares || 0).toFixed(2)}</Text>
                  </View>
                  <View style={styles.driverMetricItem}>
                    <Text style={styles.metricLabel}>Commission</Text>
                    <Text style={styles.metricValue}>ZAR {(driver.commissionTotal || 0).toFixed(2)}</Text>
                  </View>
                  <View style={styles.driverMetricItem}>
                    <Text style={styles.metricLabel}>Net Earnings</Text>
                    <Text style={[styles.metricValue, styles.netEarningsHighlight]}>
                      ZAR {(driver.netEarnings || 0).toFixed(2)}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* ─── Payout Withdrawal Modal ─── */}
      <Modal visible={showWithdraw} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Withdraw Payout</Text>
              <Pressable onPress={() => setShowWithdraw(false)}>
                <Ionicons name="close" size={24} color="#111827" />
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
                  !!withdrawAmount && { borderColor: "#EF4444" },
              ]}
            >
              <Text style={styles.currencyPrefix}>R</Text>
              <TextInput
                style={styles.amountInput}
                placeholder="0.00"
                placeholderTextColor="#9CA3AF"
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
              style={[styles.bankSelector, showBankPicker && { borderColor: "#111827" }]}
              onPress={() => setShowBankPicker((v) => !v)}
            >
              <Text style={[styles.bankSelectorText, !selectedBank && { color: "#9CA3AF" }]}>
                {selectedBank ? selectedBank.name : "Select your bank"}
              </Text>
              <Ionicons
                name={showBankPicker ? "chevron-up" : "chevron-down"}
                size={16}
                color="#6B7280"
              />
            </Pressable>

            {showBankPicker && (
              <View style={styles.bankDropdown}>
                {banksLoading ? (
                  <ActivityIndicator color="#111827" style={{ paddingVertical: 16 }} />
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
                          <Ionicons name="checkmark" size={16} color="#10B981" />
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
              placeholderTextColor="#9CA3AF"
              value={accountNumber}
              onChangeText={setAccountNumber}
              keyboardType="number-pad"
            />

            <Text style={styles.fieldLabel}>Account Holder Name</Text>
            <TextInput
              style={styles.textField}
              placeholder="Name as on bank account"
              placeholderTextColor="#9CA3AF"
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
                <ActivityIndicator color="#FFFFFF" />
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
  mainContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  topHeaderBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 8,
    backgroundColor: "#FFFFFF",
  },
  backBtn: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  headerPayoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ECFDF5",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  headerPayoutText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#065F46",
  },
  scrollContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },

  // Menu icon row (Image 1 reference)
  menuIconRow: {
    marginTop: 4,
    marginBottom: 8,
  },

  // Main Screen Title (Image 1 reference)
  screenTitle: {
    fontSize: 34,
    fontFamily: "Inter_700Bold",
    color: "#000000",
    letterSpacing: -0.5,
    marginBottom: 16,
  },

  // Circular calendar button (Image 1 reference)
  calendarCircleBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },

  // Breakdown Summary Table (Image 1 reference)
  breakdownTable: {
    marginBottom: 20,
  },
  tableRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
  },
  rowLabel: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: "#111827",
    flex: 1,
    paddingRight: 10,
  },
  rowValue: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: "#111827",
    textAlign: "right",
  },
  thinDivider: {
    height: 1,
    backgroundColor: "#E5E7EB",
  },
  boldDivider: {
    height: 1.5,
    backgroundColor: "#000000",
  },
  endBalanceLabel: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: "#000000",
  },
  endBalanceValue: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: "#000000",
    textAlign: "right",
  },

  // Information Notice Card (Image 2 reference)
  noticeCard: {
    flexDirection: "row",
    backgroundColor: "#F0F4FA",
    borderRadius: 16,
    padding: 16,
    alignItems: "flex-start",
    gap: 14,
    marginBottom: 24,
  },
  noticeBookmarkWrap: {
    marginTop: 2,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#1F2937",
    lineHeight: 19,
  },

  // Driver Net Earnings Section Heading (Image 2 reference)
  driverSectionHeading: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#000000",
    letterSpacing: -0.4,
    marginBottom: 12,
  },

  // Search Bar (Image 2 reference)
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: 24,
    paddingHorizontal: 16,
    height: 48,
    marginBottom: 28,
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

  // Empty State (Image 2 reference)
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 50,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#000000",
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: "#6B7280",
    textAlign: "center",
  },

  // Drivers List (when drivers exist)
  driversList: {
    gap: 12,
  },
  driverCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
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
  driverName: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#111827",
  },
  driverMeta: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#6B7280",
    marginTop: 2,
  },
  tripCountBadge: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tripCountText: {
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
    color: "#6B7280",
    textTransform: "uppercase",
  },
  metricValue: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#111827",
  },
  netEarningsHighlight: {
    color: "#059669",
    fontWeight: "700",
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 14,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: "#111827",
  },
  balanceHint: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#6B7280",
    marginBottom: 4,
  },
  fieldLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#4B5563",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  currencyPrefix: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#111827",
  },
  amountInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: "#111827",
    marginLeft: 8,
  },
  inputError: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#EF4444",
    marginTop: 4,
    marginBottom: 2,
  },
  bankSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  bankSelectorText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: "#111827",
  },
  bankDropdown: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
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
    borderBottomColor: "#F3F4F6",
  },
  bankEmptyText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#6B7280",
    textAlign: "center",
    paddingVertical: 16,
  },
  bankItemText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: "#111827",
  },
  textField: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: "#111827",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  submitBtn: {
    backgroundColor: "#000000",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 6,
  },
  submitBtnText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },
});
