import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView,
  ActivityIndicator, Alert, Platform, Modal, TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import Colors from "@/constants/colors";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

interface SavedCard {
  id: string;
  cardType: string;
  last4: string;
  expMonth: string;
  expYear: string;
  bank: string;
  isDefault: boolean;
}

interface WalletTx {
  id: string;
  type: string;
  amount: number;
  description: string;
  balanceAfter: number;
  createdAt: string;
  status: string;
}

const TX_ICONS: Record<string, string> = {
  topup: "⬆️", ride_charge: "🚗", earning: "💰",
  withdrawal: "⬇️", refund: "↩️", referral_reward: "🎁", referral_transfer: "🎁",
};

function RandIcon({ size = 20, color = "#fff" }: { size?: number; color?: string }) {
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: size * 0.72, fontWeight: "700", color, lineHeight: size }}>R</Text>
    </View>
  );
}

export default function ClientWalletScreen() {
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();
  const router = useRouter();

  const [cards, setCards] = useState<SavedCard[]>([]);
  const [transactions, setTransactions] = useState<WalletTx[]>([]);
  const [loading, setLoading] = useState(true);

  // Top-up modal state
  const [showTopup, setShowTopup] = useState(false);
  const [topupAmount, setTopupAmount] = useState("100");
  const [topupLoading, setTopupLoading] = useState(false);

  // Add Card modal state (separate from top-up)
  const [showAddCard, setShowAddCard] = useState(false);
  const [addCardLoading, setAddCardLoading] = useState(false);

  // Withdrawal modal state
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawBank, setWithdrawBank] = useState("");
  const [withdrawAccountNumber, setWithdrawAccountNumber] = useState("");
  const [withdrawAccountHolder, setWithdrawAccountHolder] = useState("");
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [myWithdrawals, setMyWithdrawals] = useState<any[]>([]);

  // In-app Paystack popup state
  const [paystackVerifying, setPaystackVerifying] = useState(false);
  const paystackRef = useRef<string | null>(null);
  const paystackPopup = useRef<Window | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [cardsRes, txRes] = await Promise.all([
        apiRequest("GET", "/api/payments/cards").catch((e: any) => {
          if (e?.message?.startsWith("401")) throw e;
          return null;
        }),
        apiRequest("GET", "/api/wallet/transactions").catch((e: any) => {
          if (e?.message?.startsWith("401")) throw e;
          return null;
        }),
      ]);
      if (cardsRes) setCards(await cardsRes.json());
      if (txRes) setTransactions(await txRes.json());
      apiRequest("GET", "/api/withdrawals/my")
        .then((r) => r.json())
        .then((list) => setMyWithdrawals(Array.isArray(list) ? list : []))
        .catch(() => {});
    } catch (e: any) {
      const msg = e?.message || "";
      if (msg.startsWith("401")) {
        router.replace("/login" as any);
        return;
      }
      console.error("Failed to load wallet data", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshUser();
      void loadData();
    }, [loadData, refreshUser]),
  );

  // Listen for postMessage from the Paystack popup callback (web only)
  useEffect(() => {
    if (Platform.OS !== "web") return;
    async function onMessage(e: MessageEvent) {
      if (e.data?.type !== "paystack-done") return;
      const ref = e.data.reference || paystackRef.current;
      if (!ref) return;
      try {
        paystackPopup.current?.close();
      } catch {}
      paystackPopup.current = null;
      await verifyPaystackPayment(ref);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  async function verifyPaystackPayment(reference: string, successMsg?: string, silentOnFail = false) {
    setPaystackVerifying(true);
    try {
      await apiRequest("POST", "/api/payments/verify", { reference });
      await refreshUser();
      await loadData();
      Alert.alert("Success", successMsg || "Payment verified and card saved!");
    } catch (e: any) {
      if (!silentOnFail) {
        const msg = e?.message || "";
        Alert.alert("Verification Failed", msg || "Could not verify payment. Contact support if you were charged.");
      }
    } finally {
      setPaystackVerifying(false);
      paystackRef.current = null;
    }
  }

  async function openPaystackInApp(authorizationUrl: string, reference: string, successMsg: string) {
    paystackRef.current = reference;

    if (Platform.OS === "web") {
      // ── Web: open a popup window, poll for close, auto-verify when closed ──
      const popup = (window as any).open(
        authorizationUrl, "paystack-checkout",
        "width=500,height=700,scrollbars=yes,resizable=yes,left=200,top=80"
      );
      paystackPopup.current = popup;
      if (!popup) {
        Alert.alert(
          "Popup Blocked",
          "Please allow popups for this site, then tap 'Add Card' again to continue."
        );
        paystackRef.current = null;
        return;
      }
      const poll = setInterval(() => {
        try {
          if (popup.closed) {
            clearInterval(poll);
            if (paystackRef.current) {
              verifyPaystackPayment(reference, successMsg, true);
            }
          }
        } catch {}
      }, 800);
    } else {
      const redirectUrl = Linking.createURL("payments/paystack-callback");
      try {
        const result = await WebBrowser.openAuthSessionAsync(
          authorizationUrl,
          redirectUrl
        );
        // Extract reference from the redirect URL if Paystack returned it
        let resolvedRef = reference;
        if ((result as any).url) {
          try {
            const urlRef = new URL((result as any).url).searchParams.get("reference");
            if (urlRef) resolvedRef = urlRef;
          } catch {}
        }
        // Auto-verify silently — works whether user paid or dismissed
        await verifyPaystackPayment(resolvedRef, successMsg, true);
      } catch {
        await verifyPaystackPayment(reference, successMsg, true);
      }
    }
  }

  // Top up wallet (also saves card)
  async function handleTopup() {
    if (!user) return;
    setTopupLoading(true);
    try {
      const amount = parseFloat(topupAmount);
      if (isNaN(amount) || amount < 10) {
        Alert.alert("Invalid amount", "Minimum top-up is R10"); return;
      }
      const res = await apiRequest("POST", "/api/payments/initialize", {
        amount,
        email: user.email || user.username,
        saveCard: true,
        rideId: null,
        appVariant: "client",
        appReturnUrl: Platform.OS === "web" ? null : Linking.createURL("payments/paystack-callback"),
      });
      const data = await res.json();
      if (!data.authorizationUrl) throw new Error(data.message || "Could not initialize payment");
      setShowTopup(false);
      await openPaystackInApp(data.authorizationUrl, data.reference, `R${amount.toFixed(2)} added to wallet and card saved!`);
    } catch (e: any) {
      const msg = e?.message || "";
      if (msg.startsWith("401")) {
        setShowTopup(false);
        Alert.alert("Session expired", "Please log in again to continue.", [
          { text: "Log in", onPress: () => router.replace("/login" as any) },
        ]);
        return;
      }
      Alert.alert("Error", msg || "Failed to initialize payment");
    } finally {
      setTopupLoading(false);
    }
  }

  // Save card — R1 authorization charge, refunded immediately to wallet (net zero to user)
  async function handleAddCard() {
    if (!user) return;
    setAddCardLoading(true);
    try {
      const res = await apiRequest("POST", "/api/payments/initialize", {
        amount: 1,
        email: user.email || user.username,
        saveCard: true,
        saveCardOnly: true,
        rideId: null,
        appVariant: "client",
        appReturnUrl: Platform.OS === "web" ? null : Linking.createURL("payments/paystack-callback"),
      });
      const data = await res.json();
      if (!data.authorizationUrl) throw new Error(data.message || "Could not initialize payment");
      setShowAddCard(false);
      await openPaystackInApp(data.authorizationUrl, data.reference, "Your card has been saved successfully!");
    } catch (e: any) {
      const msg = e?.message || "";
      if (msg.startsWith("401")) {
        setShowAddCard(false);
        Alert.alert("Session expired", "Please log in again to continue.", [
          { text: "Log in", onPress: () => router.replace("/login" as any) },
        ]);
        return;
      }
      Alert.alert("Error", msg || "Failed to save card");
    } finally {
      setAddCardLoading(false);
    }
  }

  async function setDefaultCard(cardId: string) {
    try {
      await apiRequest("PUT", `/api/payments/cards/${cardId}/default`, {});
      loadData();
    } catch {
      Alert.alert("Error", "Failed to set default card");
    }
  }

  async function deleteCard(cardId: string) {
    Alert.alert("Remove Card", "Are you sure you want to remove this card?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: "destructive",
        onPress: async () => {
          try {
            await apiRequest("DELETE", `/api/payments/cards/${cardId}`);
            loadData();
          } catch {
            Alert.alert("Error", "Failed to remove card");
          }
        },
      },
    ]);
  }

  const balance = user?.walletBalance || 0;
  async function handleWithdrawRequest() {
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount < 50) { Alert.alert("Minimum withdrawal is R50"); return; }
    if (amount > balance) { Alert.alert("Not enough balance", `You have R ${balance.toFixed(2)} available.`); return; }
    if (!withdrawBank.trim()) { Alert.alert("Please enter your bank name"); return; }
    if (withdrawAccountNumber.trim().length < 6) { Alert.alert("Please enter a valid account number"); return; }
    if (!withdrawAccountHolder.trim()) { Alert.alert("Please enter the account holder name"); return; }
    setWithdrawLoading(true);
    try {
      const res = await apiRequest("POST", "/api/withdrawals", {
        amount,
        bankName: withdrawBank.trim(),
        accountNumber: withdrawAccountNumber.trim(),
        accountHolder: withdrawAccountHolder.trim(),
      });
      const data = await res.json();
      setShowWithdraw(false);
      setWithdrawAmount("");
      await refreshUser();
      await loadData();
      Alert.alert("✅ Withdrawal Requested", data.message || "Your request was sent to the A2B admin team for approval. Once approved, you will be paid via EFT.");
    } catch (e: any) {
      Alert.alert("Withdrawal Failed", (e?.message || "Please try again.").replace(/^\d+:\s*/, ""));
    } finally {
      setWithdrawLoading(false);
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>

        {/* ── Balance Card ── */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Wallet Balance</Text>
          <Text style={styles.balanceAmount}>R {balance.toFixed(2)}</Text>
          <Text style={styles.balanceSub}>Available for rides</Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              style={({ pressed }) => [styles.topupBtn, pressed && { opacity: 0.85 }]}
              onPress={() => setShowTopup(true)}
            >
              <Ionicons name="add" size={16} color={Colors.primary} />
              <Text style={styles.topupBtnText}>Add Money</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.topupBtn, { backgroundColor: "transparent", borderWidth: 1, borderColor: "rgba(255,255,255,0.35)" }, pressed && { opacity: 0.85 }]}
              onPress={() => {
                if (balance < 50) { Alert.alert("Not enough balance", "You need at least R50 in your wallet to request a withdrawal."); return; }
                setWithdrawAccountHolder((prev) => prev || user?.name || "");
                setShowWithdraw(true);
              }}
            >
              <Ionicons name="arrow-down" size={16} color="#fff" />
              <Text style={[styles.topupBtnText, { color: "#fff" }]}>Withdraw</Text>
            </Pressable>
          </View>
        </View>

        {myWithdrawals.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Withdrawal Requests</Text>
            </View>
            {myWithdrawals.slice(0, 5).map((w) => (
              <View key={w.id} style={styles.paymentRow}>
                <View style={[styles.paymentIcon, { backgroundColor: w.status === "paid" ? Colors.success : w.status === "rejected" ? Colors.error : "#B8860B" }]}>
                  <Ionicons name={w.status === "paid" ? "checkmark" : w.status === "rejected" ? "close" : "time-outline"} size={18} color="#fff" />
                </View>
                <View style={styles.paymentInfo}>
                  <Text style={styles.paymentName}>R {Number(w.amount || 0).toFixed(2)} · {w.bankName || "Bank"}</Text>
                  <Text style={styles.paymentSub}>
                    {w.status === "pending" ? "Waiting for admin approval"
                      : w.status === "approved" ? "Approved — EFT being processed"
                      : w.status === "paid" ? "Paid via EFT"
                      : w.status === "rejected" ? "Declined — funds returned"
                      : w.status}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <Pressable style={styles.rewardsCard} onPress={() => router.push("/client/referrals") as any}>
          <View style={styles.rewardsInfo}>
            <Text style={styles.rewardsLabel}>Rewards Balance</Text>
            <Text style={styles.rewardsAmount}>R {(user?.rewardsBalance || 0).toFixed(2)}</Text>
            <Text style={styles.rewardsSub}>Rewards keep growing. Lift Club approval unlocks spending and withdrawals.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </Pressable>

        {/* ── Payment Methods ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Payment Methods</Text>
            <Pressable onPress={() => setShowAddCard(true)}>
              <Text style={[styles.sectionAction, { color: "#2196F3" }]}>+ Add Card</Text>
            </Pressable>
          </View>

          {/* Cash row */}
          <View style={styles.paymentRow}>
            <View style={[styles.paymentIcon, { backgroundColor: "#1a6b3c" }]}>
              <RandIcon size={20} color="#fff" />
            </View>
            <View style={styles.paymentInfo}>
              <Text style={styles.paymentName}>Cash</Text>
              <Text style={styles.paymentSub}>Pay driver directly after ride</Text>
            </View>
            <View style={styles.defaultBadge}>
              <Text style={styles.defaultBadgeText}>Available</Text>
            </View>
          </View>

          {/* Wallet balance row */}
          {balance > 0 && (
            <View style={styles.paymentRow}>
              <View style={[styles.paymentIcon, { backgroundColor: Colors.success }]}>
                <Ionicons name="wallet" size={18} color="#fff" />
              </View>
              <View style={styles.paymentInfo}>
                <Text style={styles.paymentName}>Wallet Balance</Text>
                <Text style={styles.paymentSub}>R {balance.toFixed(2)} available</Text>
              </View>
              <View style={styles.defaultBadge}>
                <Text style={styles.defaultBadgeText}>Ready</Text>
              </View>
            </View>
          )}

          {/* Saved cards */}
          {loading ? (
            <ActivityIndicator color={Colors.white} style={{ marginVertical: 20 }} />
          ) : cards.length === 0 ? (
            <Pressable style={styles.addCardRow} onPress={() => setShowAddCard(true)}>
              <Ionicons name="card-outline" size={20} color={Colors.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={styles.addCardText}>No saved cards</Text>
                <Text style={styles.addCardSub}>Add a card to pay for rides instantly</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </Pressable>
          ) : (
            cards.map(card => (
              <View key={card.id} style={[styles.paymentRow, card.isDefault && styles.paymentRowDefault]}>
                <View style={[styles.paymentIcon, { backgroundColor: "#1434CB" }]}>
                  <Ionicons name="card" size={18} color="#fff" />
                </View>
                <View style={styles.paymentInfo}>
                  <Text style={styles.paymentName}>
                    {card.cardType?.toUpperCase()} •••• {card.last4}
                  </Text>
                  <Text style={styles.paymentSub}>{card.bank} · Expires {card.expMonth}/{card.expYear}</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  {card.isDefault ? (
                    <View style={styles.defaultBadge}>
                      <Text style={styles.defaultBadgeText}>Default</Text>
                    </View>
                  ) : (
                    <Pressable onPress={() => setDefaultCard(card.id)} hitSlop={8}>
                      <Text style={styles.setDefaultText}>Set default</Text>
                    </Pressable>
                  )}
                  <Pressable onPress={() => deleteCard(card.id)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={16} color={Colors.error} />
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>

        {/* ── Transaction History ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Transaction History</Text>
          {transactions.length === 0 ? (
            <View style={styles.emptyTx}>
              <Text style={styles.emptyTxIcon}>📋</Text>
              <Text style={styles.emptyTxText}>No transactions yet</Text>
            </View>
          ) : (
            transactions.map(tx => (
              <View key={tx.id} style={styles.txRow}>
                <View style={styles.txIcon}>
                  <Text style={{ fontSize: 18 }}>{TX_ICONS[tx.type] || "💳"}</Text>
                </View>
                <View style={styles.txInfo}>
                  <Text style={styles.txDesc}>{tx.description || tx.type}</Text>
                  <Text style={styles.txDate}>
                    {new Date(tx.createdAt).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })}
                  </Text>
                </View>
                <Text style={[
                  styles.txAmount,
                  { color: ["topup", "earning", "refund", "referral_reward", "referral_transfer"].includes(tx.type) ? Colors.success : Colors.error }
                ]}>
                  {["topup", "earning", "refund", "referral_reward", "referral_transfer"].includes(tx.type) ? "+" : "-"}R {tx.amount.toFixed(2)}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* ── Add Money Modal ── */}
      <Modal visible={showTopup} transparent animationType="slide" onRequestClose={() => setShowTopup(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowTopup(false)}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.modalTitle}>Add Money to Wallet</Text>
            <Text style={styles.modalSub}>Your card will be saved for future ride payments</Text>

            <View style={styles.amountRow}>
              {["50", "100", "200", "500"].map(amt => (
                <Pressable
                  key={amt}
                  style={[styles.amountChip, topupAmount === amt && styles.amountChipActive]}
                  onPress={() => setTopupAmount(amt)}
                >
                  <Text style={[styles.amountChipText, topupAmount === amt && styles.amountChipTextActive]}>
                    R{amt}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.customAmountWrap}>
              <Text style={styles.randSign}>R</Text>
              <TextInput
                style={styles.customAmountInput}
                value={topupAmount}
                onChangeText={setTopupAmount}
                keyboardType="numeric"
                placeholder="Enter amount"
                placeholderTextColor={Colors.textMuted}
              />
            </View>

            <View style={styles.paystackNote}>
              <Ionicons name="shield-checkmark-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.paystackNoteText}>Card details encrypted and stored securely</Text>
            </View>

            <Pressable
              style={[styles.payBtn, topupLoading && { opacity: 0.7 }]}
              onPress={handleTopup}
              disabled={topupLoading}
            >
              {topupLoading
                ? <ActivityIndicator color={Colors.primary} />
                : <Text style={styles.payBtnText}>Pay R{topupAmount} with Card</Text>
              }
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* ── Withdraw Modal ── */}
      <Modal visible={showWithdraw} transparent animationType="slide" onRequestClose={() => setShowWithdraw(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowWithdraw(false)}>
          <View
            style={[styles.modalSheet, { paddingBottom: insets.bottom + 24 }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.sheetHandle} />
            <Text style={styles.modalTitle}>Withdraw Funds</Text>
            <Text style={styles.modalSub}>
              Your request is reviewed by the A2B admin team. Once approved, payment is made via EFT to your bank account.
            </Text>

            <View style={styles.customAmountWrap}>
              <Text style={styles.randSign}>R</Text>
              <TextInput
                style={styles.customAmountInput}
                value={withdrawAmount}
                onChangeText={setWithdrawAmount}
                keyboardType="numeric"
                placeholder={`Amount (max R ${balance.toFixed(0)})`}
                placeholderTextColor={Colors.textMuted}
              />
            </View>
            <View style={[styles.customAmountWrap, { marginTop: 10 }]}>
              <TextInput
                style={styles.customAmountInput}
                value={withdrawBank}
                onChangeText={setWithdrawBank}
                placeholder="Bank name (e.g. Capitec)"
                placeholderTextColor={Colors.textMuted}
              />
            </View>
            <View style={[styles.customAmountWrap, { marginTop: 10 }]}>
              <TextInput
                style={styles.customAmountInput}
                value={withdrawAccountNumber}
                onChangeText={setWithdrawAccountNumber}
                keyboardType="numeric"
                placeholder="Account number"
                placeholderTextColor={Colors.textMuted}
              />
            </View>
            <View style={[styles.customAmountWrap, { marginTop: 10 }]}>
              <TextInput
                style={styles.customAmountInput}
                value={withdrawAccountHolder}
                onChangeText={setWithdrawAccountHolder}
                placeholder="Account holder name"
                placeholderTextColor={Colors.textMuted}
              />
            </View>

            <View style={styles.paystackNote}>
              <Ionicons name="time-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.paystackNoteText}>The amount is reserved from your wallet while the request is reviewed</Text>
            </View>

            <Pressable
              style={[styles.payBtn, withdrawLoading && { opacity: 0.7 }]}
              onPress={handleWithdrawRequest}
              disabled={withdrawLoading}
            >
              {withdrawLoading
                ? <ActivityIndicator color={Colors.primary} />
                : <Text style={styles.payBtnText}>Request Withdrawal</Text>
              }
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* ── Paystack verifying overlay ── */}
      {paystackVerifying && (
        <Modal visible transparent animationType="fade">
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.75)", alignItems: "center", justifyContent: "center", gap: 16 }}>
            <ActivityIndicator size="large" color={Colors.accent} />
            <Text style={{ color: Colors.white, fontFamily: "Inter_500Medium", fontSize: 16 }}>Verifying payment…</Text>
          </View>
        </Modal>
      )}

      {/* ── Add Card Modal ── */}
      <Modal visible={showAddCard} transparent animationType="slide" onRequestClose={() => setShowAddCard(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowAddCard(false)}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.modalTitle}>Save a Card</Text>
            <Text style={styles.modalSub}>Add your card once and pay rides instantly — no re-entering details.</Text>

            {/* Card illustration */}
            <View style={styles.cardIllustration}>
              <View style={styles.cardIllustrationInner}>
                <Ionicons name="card" size={32} color={Colors.textMuted} />
                <Text style={styles.cardIllustrationText}>Any Visa, Mastercard or Verve card</Text>
              </View>
            </View>

            <View style={styles.addCardSteps}>
              {[
                { icon: "shield-checkmark-outline", text: "Card details are encrypted and stored securely" },
                { icon: "lock-closed-outline", text: "Your card is never shared with drivers or third parties" },
                { icon: "flash-outline", text: "Ride fares are charged automatically at the end of each trip" },
              ].map((step, i) => (
                <View key={i} style={styles.addCardStep}>
                  <Ionicons name={step.icon as any} size={16} color={Colors.accent} />
                  <Text style={styles.addCardStepText}>{step.text}</Text>
                </View>
              ))}
            </View>

            <Pressable
              style={[styles.payBtn, addCardLoading && { opacity: 0.7 }]}
              onPress={handleAddCard}
              disabled={addCardLoading}
            >
              {addCardLoading
                ? <ActivityIndicator color={Colors.primary} />
                : (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name="card-outline" size={18} color={Colors.primary} />
                    <Text style={styles.payBtnText}>Add Card</Text>
                  </View>
                )
              }
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  balanceCard: {
    margin: 20, padding: 24,
    backgroundColor: Colors.card, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.border, alignItems: "center", gap: 6,
  },
  balanceLabel: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 },
  balanceAmount: { fontSize: 42, fontFamily: "Inter_700Bold", color: Colors.white, letterSpacing: -1 },
  balanceSub: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  rewardsCard: {
    marginHorizontal: 20,
    marginBottom: 24,
    padding: 18,
    backgroundColor: Colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  rewardsInfo: { flex: 1 },
  rewardsLabel: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1 },
  rewardsAmount: { fontSize: 24, fontFamily: "Inter_700Bold", color: Colors.white, marginTop: 6 },
  rewardsSub: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 4 },
  topupBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: Colors.white, paddingVertical: 10, paddingHorizontal: 24,
    borderRadius: 12, marginTop: 8,
  },
  topupBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.primary },
  section: { marginHorizontal: 20, marginBottom: 24 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.white },
  sectionAction: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.accent },
  paymentRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: Colors.card, borderRadius: 12, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: Colors.border,
  },
  paymentRowDefault: { borderColor: Colors.accent },
  paymentIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center",
  },
  paymentInfo: { flex: 1 },
  paymentName: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.white },
  paymentSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted, marginTop: 2 },
  defaultBadge: {
    backgroundColor: "rgba(34,197,94,0.12)", paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, borderWidth: 1, borderColor: "rgba(34,197,94,0.3)",
  },
  defaultBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: Colors.success },
  setDefaultText: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.accent },
  addCardRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: Colors.border, borderStyle: "dashed",
  },
  addCardText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.white },
  addCardSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted, marginTop: 2 },
  txRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  txIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center" },
  txInfo: { flex: 1 },
  txDesc: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.white },
  txDate: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted, marginTop: 2 },
  txAmount: { fontSize: 14, fontFamily: "Inter_700Bold" },
  emptyTx: { alignItems: "center", paddingVertical: 32, gap: 8 },
  emptyTxIcon: { fontSize: 32 },
  emptyTxText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 16 },
  sheetHandle: { width: 36, height: 4, backgroundColor: Colors.accent, borderRadius: 2, alignSelf: "center" },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.white },
  modalSub: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textMuted, marginTop: -8 },
  amountRow: { flexDirection: "row", gap: 10 },
  amountChip: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: Colors.surface, alignItems: "center", borderWidth: 1, borderColor: Colors.border },
  amountChipActive: { backgroundColor: Colors.white, borderColor: Colors.white },
  amountChipText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary },
  amountChipTextActive: { color: Colors.primary },
  customAmountWrap: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 16, borderWidth: 1, borderColor: Colors.border },
  randSign: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.white, marginRight: 4 },
  customAmountInput: { flex: 1, paddingVertical: 14, fontSize: 24, fontFamily: "Inter_700Bold", color: Colors.white },
  paystackNote: { flexDirection: "row", alignItems: "center", gap: 6 },
  paystackNoteText: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  payBtn: { backgroundColor: Colors.white, paddingVertical: 15, borderRadius: 14, alignItems: "center" },
  payBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.primary },
  cardIllustration: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 24,
    borderWidth: 1, borderColor: Colors.border, alignItems: "center",
  },
  cardIllustrationInner: { alignItems: "center", gap: 10 },
  cardIllustrationText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted, textAlign: "center" },
  addCardSteps: { gap: 12 },
  addCardStep: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  addCardStepText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary, lineHeight: 18 },
});
