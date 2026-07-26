import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useSegments } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import { apiRequest } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import Colors from "@/constants/colors";

type ReferralSummary = {
  referralCode: string;
  shareUrl: string;
  rewardsBalance: number;
  referredCount: number;
  rewardedReferrals: number;
  totalRewardsEarned: number;
  pendingCashoutAmount: number;
};

type RewardTransaction = {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  description: string | null;
  status: string;
  createdAt: string;
};

type ReferredPerson = {
  id: string;
  name: string;
  joinedAt: string;
  firstRewardAt?: string | null;
  lastRewardAt?: string | null;
  rewardedAt?: string | null;
  totalRewards: number;
  status: string;
};

type RewardCashout = {
  id: string;
  amount: number;
  status: string;
  bankName: string | null;
  accountHolder: string | null;
  requestedAt: string;
};

type ReferralDashboardResponse = ReferralSummary & {
  referredPeople?: ReferredPerson[];
  transactions?: RewardTransaction[];
  cashouts?: RewardCashout[];
};

const REWARD_LINK_BASE_URL =
  process.env.EXPO_PUBLIC_REFERRAL_LINK_BASE_URL ||
  process.env.EXPO_PUBLIC_REFERRAL_BASE_URL ||
  "https://a2blift.com";
const MIN_CASHOUT_AMOUNT = 100;
const REFERRAL_PREVIEW_COUNT = 5;
const REFERRALS_REFRESH_INTERVAL_MS = 60000;

const TX_LABELS: Record<string, string> = {
  referral_reward: "Reward programme",
  ride_cashback: "Trip cashback",
  ride_redemption: "Ride redemption",
  ride_refund: "Ride refund",
  cashout_request: "Cash-out request",
  cashout_reversal: "Cash-out reversal",
  wallet_transfer: "Transferred to wallet",
};

const REWARD_STEPS = [
  {
    number: "01",
    title: "Share your invite",
    copy: "Send your code or link to new riders.",
  },
  {
    number: "02",
    title: "Earn another 2.5%",
    copy: "When your invited rider completes a trip, you earn another 2.5%.",
  },
  {
    number: "03",
    title: "Earn 2.5% on your rides",
    copy: "Every completed trip you take adds 2.5% to your loyalty balance.",
  },
];

function formatCurrency(value: number) {
  return `R ${Number(value || 0).toFixed(2)}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function transactionTone(type: string) {
  if (type === "ride_redemption" || type === "cashout_request" || type === "wallet_transfer") {
    return styles.rowAmountNegative;
  }
  return styles.rowAmountPositive;
}

function transactionPrefix(type: string) {
  if (type === "ride_redemption" || type === "cashout_request" || type === "wallet_transfer") {
    return "-";
  }
  return "+";
}

type RewardAppTarget = "client" | "driver";

function appendRewardSource(url: string, appTarget: RewardAppTarget) {
  const publicUrl = url.replace(/^https:\/\/api\.a2blift\.com(?=\/)/i, "https://a2blift.com");
  if (/[?&]app=/.test(publicUrl)) return publicUrl;
  const separator = publicUrl.includes("?") ? "&" : "?";
  return `${publicUrl}${separator}app=${encodeURIComponent(appTarget)}`;
}

function buildRewardLandingUrl(referralCode: string, appTarget: RewardAppTarget = "client") {
  const normalizedCode = referralCode.trim().toUpperCase();
  const base = String(REWARD_LINK_BASE_URL).replace(/\/$/, "");
  return `${base}/r/${encodeURIComponent(normalizedCode)}?app=${encodeURIComponent(appTarget)}`;
}

function buildRewardShareUrl(referralCode?: string | null, shareUrl?: string | null, appTarget: RewardAppTarget = "client") {
  const code = referralCode?.trim().toUpperCase();
  const providedUrl = shareUrl?.trim();
  if (providedUrl) return appendRewardSource(providedUrl, appTarget);
  if (!code) return "";
  return buildRewardLandingUrl(code, appTarget);
}

function getReferralActivityDate(person: ReferredPerson) {
  return person.rewardedAt || person.lastRewardAt || person.firstRewardAt || person.joinedAt;
}

function getReferralActivityCopy(person: ReferredPerson) {
  if (person.totalRewards > 0 && person.rewardedAt) {
    return `Rewarded on ${formatDate(person.rewardedAt)}`;
  }
  return `Joined with your invite on ${formatDate(person.joinedAt)}`;
}

function buildFallbackSummary(
  referralCode?: string | null,
  rewardsBalance?: number | null,
  appTarget: RewardAppTarget = "client",
): ReferralSummary | null {
  const normalizedCode = referralCode?.trim().toUpperCase();
  if (!normalizedCode) return null;

  return {
    referralCode: normalizedCode,
    shareUrl: buildRewardShareUrl(normalizedCode, null, appTarget),
    rewardsBalance: Number(rewardsBalance || 0),
    referredCount: 0,
    rewardedReferrals: 0,
    totalRewardsEarned: 0,
    pendingCashoutAmount: 0,
  };
}

function getFriendlyRewardsError(error: any) {
  const message = String(error?.message || "");
  if (message.includes("404")) {
    return "Some rewards activity is not available right now, but your invite link is ready to share.";
  }
  if (message.includes("401")) {
    return "Your session expired. Please log in again to refresh rewards activity.";
  }
  return "Rewards activity could not be refreshed right now.";
}

export default function ReferralsScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const segments = useSegments();
  const { user, setUser, refreshUser } = useAuth();
  const hasLoadedOnceRef = useRef(false);
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [referredPeople, setReferredPeople] = useState<ReferredPerson[]>([]);
  const [transactions, setTransactions] = useState<RewardTransaction[]>([]);
  const [cashouts, setCashouts] = useState<RewardCashout[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadNotice, setLoadNotice] = useState<string | null>(null);
  const [showCashout, setShowCashout] = useState(false);
  const [showReferredPeople, setShowReferredPeople] = useState(false);
  const [cashoutAmount, setCashoutAmount] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [cashoutBusy, setCashoutBusy] = useState(false);
  const [transferBusy, setTransferBusy] = useState(false);

  const isWide = width >= 900;
  const rewardsBalance = Number(summary?.rewardsBalance ?? user?.rewardsBalance ?? 0);
  const canRequestCashout = rewardsBalance >= MIN_CASHOUT_AMOUNT;
  const enteredCashoutAmount = Number(cashoutAmount);
  const canSubmitCashout =
    !cashoutBusy &&
    enteredCashoutAmount >= MIN_CASHOUT_AMOUNT &&
    enteredCashoutAmount <= rewardsBalance;
  const backRoute = segments[0] === "chauffeur" ? "/chauffeur" : "/client/profile";
  const appTarget: RewardAppTarget = segments[0] === "chauffeur" ? "driver" : "client";
  const referralPreview = referredPeople.slice(0, REFERRAL_PREVIEW_COUNT);
  const rewardLink = useMemo(
    () => buildRewardShareUrl(summary?.referralCode || user?.referralCode, summary?.shareUrl, appTarget),
    [appTarget, summary?.referralCode, summary?.shareUrl, user?.referralCode],
  );
  const loadData = useCallback(async (options?: { showLoader?: boolean }) => {
    const showLoader = options?.showLoader ?? !hasLoadedOnceRef.current;

    if (showLoader) {
      setLoading(true);
    }
    setLoadNotice(null);

    const fallbackSummary = buildFallbackSummary(user?.referralCode, user?.rewardsBalance, appTarget);

    try {
      let nextSummary = fallbackSummary;
      let nextReferredPeople: ReferredPerson[] = [];
      let nextTransactions: RewardTransaction[] = [];
      let nextCashouts: RewardCashout[] = [];
      let shouldFetchTransactions = true;
      let shouldFetchCashouts = true;

      try {
        const summaryRes = await apiRequest("GET", "/api/referrals/me");
        const summaryPayload = (await summaryRes.json()) as ReferralDashboardResponse;

        nextSummary = {
          referralCode: summaryPayload.referralCode,
          shareUrl: buildRewardShareUrl(summaryPayload.referralCode, summaryPayload.shareUrl, appTarget),
          rewardsBalance: Number(summaryPayload.rewardsBalance || 0),
          referredCount: Number(summaryPayload.referredCount || 0),
          rewardedReferrals: Number(summaryPayload.rewardedReferrals || 0),
          totalRewardsEarned: Number(summaryPayload.totalRewardsEarned || 0),
          pendingCashoutAmount: Number(summaryPayload.pendingCashoutAmount || 0),
        };

        if (Array.isArray(summaryPayload.referredPeople)) {
          nextReferredPeople = summaryPayload.referredPeople;
        }

        if (Array.isArray(summaryPayload.transactions)) {
          nextTransactions = summaryPayload.transactions;
          shouldFetchTransactions = false;
        }
        if (Array.isArray(summaryPayload.cashouts)) {
          nextCashouts = summaryPayload.cashouts;
          shouldFetchCashouts = false;
        }
      } catch (error: any) {
        setLoadNotice(getFriendlyRewardsError(error));
      }

      if (shouldFetchTransactions || shouldFetchCashouts) {
        const [txResult, cashoutResult] = await Promise.allSettled([
          shouldFetchTransactions ? apiRequest("GET", "/api/rewards/transactions") : Promise.resolve(null),
          shouldFetchCashouts ? apiRequest("GET", "/api/rewards/cashouts") : Promise.resolve(null),
        ]);

        if (shouldFetchTransactions && txResult.status === "fulfilled" && txResult.value) {
          nextTransactions = await txResult.value.json();
        } else if (shouldFetchTransactions && txResult.status === "rejected") {
          setLoadNotice((current) => current || getFriendlyRewardsError(txResult.reason));
        }

        if (shouldFetchCashouts && cashoutResult.status === "fulfilled" && cashoutResult.value) {
          nextCashouts = await cashoutResult.value.json();
        } else if (shouldFetchCashouts && cashoutResult.status === "rejected") {
          setLoadNotice((current) => current || getFriendlyRewardsError(cashoutResult.reason));
        }
      }

      if (!nextSummary?.referralCode) {
        try {
          const meRes = await apiRequest("GET", "/api/auth/me");
          const mePayload = await meRes.json();
          const fallbackCode = String(mePayload?.referralCode || "").trim().toUpperCase();
          if (fallbackCode) {
            nextSummary = {
              referralCode: fallbackCode,
              shareUrl: buildRewardShareUrl(fallbackCode, mePayload?.shareUrl, appTarget),
              rewardsBalance: Number(mePayload?.rewardsBalance || 0),
              referredCount: nextSummary?.referredCount || 0,
              rewardedReferrals: nextSummary?.rewardedReferrals || 0,
              totalRewardsEarned: nextSummary?.totalRewardsEarned || 0,
              pendingCashoutAmount: nextSummary?.pendingCashoutAmount || 0,
            };
          }
        } catch {}
      }

      setSummary(nextSummary);
      setReferredPeople(Array.isArray(nextReferredPeople) ? nextReferredPeople : []);
      setTransactions(Array.isArray(nextTransactions) ? nextTransactions : []);
      setCashouts(Array.isArray(nextCashouts) ? nextCashouts : []);
      hasLoadedOnceRef.current = true;
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  }, [appTarget, user?.referralCode, user?.rewardsBalance]);

  useFocusEffect(
    useCallback(() => {
      const refreshDashboard = async (showLoader = false) => {
        await loadData({ showLoader });
        void refreshUser();
      };

      void refreshDashboard(!hasLoadedOnceRef.current);
      const intervalId = setInterval(() => {
        void loadData({ showLoader: false });
      }, REFERRALS_REFRESH_INTERVAL_MS);

      return () => clearInterval(intervalId);
    }, [loadData, refreshUser]),
  );

  async function handleShareReferral() {
    const referralCode = summary?.referralCode || user?.referralCode || "";
    const shareUrl = rewardLink || buildRewardShareUrl(referralCode, summary?.shareUrl, appTarget);
    if (!referralCode || !shareUrl) {
      Alert.alert("Invite Unavailable", "Your reward link is still being prepared. Please try again in a moment.");
      return;
    }

    try {
      await Share.share({
        message: `Join A2B LIFT with my reward code ${referralCode}. Tap this link to open the app and start registration: ${shareUrl}`,
        url: shareUrl,
      });
    } catch (error: any) {
      Alert.alert("Share Failed", error.message || "Could not open the share sheet.");
    }
  }

  async function handleCashoutRequest() {
    const amount = Number(cashoutAmount);
    if (!amount || amount <= 0) {
      Alert.alert("Invalid Amount", "Enter a valid cash-out amount.");
      return;
    }
    if (amount < MIN_CASHOUT_AMOUNT) {
      Alert.alert("Minimum Withdrawal", `Rewards withdrawals start at R ${MIN_CASHOUT_AMOUNT.toFixed(2)}.`);
      return;
    }
    if (amount > rewardsBalance) {
      Alert.alert("Insufficient Balance", "Your requested withdrawal exceeds your available loyalty balance.");
      return;
    }

    setCashoutBusy(true);
    try {
      await apiRequest("POST", "/api/rewards/cashout", {
        amount,
        bankName: bankName.trim() || null,
        accountHolder: accountHolder.trim() || null,
        accountNumber: accountNumber.trim() || null,
      });
      await refreshUser();
      await loadData({ showLoader: false });
      setShowCashout(false);
      setCashoutAmount("");
      setBankName("");
      setAccountHolder("");
      setAccountNumber("");
      Alert.alert("Request Submitted", "Your rewards cash-out request has been sent for review.");
    } catch (error: any) {
      Alert.alert("Cash-Out Failed", error.message || "Could not submit your request.");
    } finally {
      setCashoutBusy(false);
    }
  }

  async function handleTransferToWallet() {
    if (rewardsBalance <= 0) {
      Alert.alert("Nothing to transfer", "You have no referral balance to move to your wallet yet.");
      return;
    }
    setTransferBusy(true);
    try {
      const res = await apiRequest("POST", "/api/rewards/transfer-to-wallet");
      const data = await res.json().catch(() => ({}));
      if (user && Number.isFinite(Number(data.walletBalance))) {
        setUser({
          ...user,
          walletBalance: Number(data.walletBalance),
          rewardsBalance: Number(data.rewardsBalance || 0),
        });
      }
      await refreshUser();
      await loadData({ showLoader: false });
      Alert.alert(
        "Transferred to wallet",
        `R ${Number(data.amount || rewardsBalance).toFixed(2)} moved to your wallet. You can now withdraw it (admin-approved) or use it to pay for rides.`,
      );
    } catch (error: any) {
      Alert.alert("Transfer failed", error.message || "Could not transfer your referral balance.");
    } finally {
      setTransferBusy(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.loadingWrap, { paddingTop: insets.top + 16 }]}> 
        <ActivityIndicator color={Colors.white} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16) }]}> 
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + (Platform.OS === "web" ? 120 : 144) }]}
      >
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.navigate(backRoute as any)} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color={Colors.white} />
          </Pressable>
          <Text style={styles.title}>Reward Programme</Text>
          <Pressable onPress={handleShareReferral} hitSlop={10}>
            <Ionicons name="share-social-outline" size={22} color={Colors.white} />
          </Pressable>
        </View>

        <Text style={styles.eyebrow}>INVITE. EARN. RIDE.</Text>
        <Text style={styles.pageLead}>
          Earn 2.5% back on every ride and another 2.5% when someone you invited completes a trip.
        </Text>

        {loadNotice ? <Text style={styles.inlineNotice}>{loadNotice}</Text> : null}

        <View style={styles.qrCard}>
          <View style={styles.qrHeader}>
            <View>
              <Text style={styles.qrEyebrow}>SCAN TO JOIN</Text>
              <Text style={styles.qrTitle}>Reward QR code</Text>
            </View>
            <Ionicons name="qr-code-outline" size={24} color={Colors.white} />
          </View>
          <View style={styles.qrBody}>
            <View style={styles.qrBox}>
              {rewardLink ? (
                <QRCode
                  value={rewardLink}
                  size={132}
                  color="#111111"
                  backgroundColor="#FFFFFF"
                  quietZone={8}
                />
              ) : (
                <ActivityIndicator color={Colors.primary} />
              )}
            </View>
            <View style={styles.qrCopyWrap}>
              <Text style={styles.qrCopy}>Scan this code to open the {appTarget === "driver" ? "driver" : "client"} app invite.</Text>
              <Text style={styles.qrLink} numberOfLines={2}>{rewardLink || "Preparing your reward link..."}</Text>
            </View>
          </View>
        </View>

        <View style={[styles.heroGrid, isWide && styles.heroGridWide]}>
          <View style={[styles.inviteCard, isWide && styles.heroColumn]}>
            <View style={styles.stepBadgeRow}>
              <View style={styles.stepBadgeLight}>
                <Text style={styles.stepBadgeLightText}>1</Text>
              </View>
              <Text style={styles.cardTitleDark}>Share your invite</Text>
            </View>

            <Text style={styles.cardCopyDark}>
              Share your code. When someone you invited completes a trip, you earn another 2.5%.
            </Text>

            <View style={styles.codeBlock}>
              <Text style={styles.codeBlockLabel}>Reward code</Text>
              <Text style={styles.codeBlockValue}>{summary?.referralCode || "-"}</Text>
            </View>

            <View style={styles.linkPill}>
              <Ionicons name="link-outline" size={15} color="#181818" />
              <Text style={styles.linkPillText} numberOfLines={1}>
                {(() => {
                  const code = summary?.referralCode || user?.referralCode;
                  if (!code) return "Loading your link...";
                  return buildRewardShareUrl(code.trim().toUpperCase(), summary?.shareUrl, appTarget);
                })()}
              </Text>
            </View>

            <Pressable style={styles.primaryAction} onPress={handleShareReferral}>
              <Ionicons name="paper-plane-outline" size={16} color="#181818" />
              <Text style={styles.primaryActionText}>Invite Friends</Text>
            </Pressable>

            <Text style={styles.cardHintDark}>Your loyalty balance updates automatically after completed trips.</Text>
          </View>

          <View style={[styles.balanceCard, isWide && styles.heroColumn]}>
            <View style={styles.stepBadgeRow}>
              <View style={styles.stepBadgeDark}>
                <Text style={styles.stepBadgeDarkText}>2</Text>
              </View>
              <Text style={styles.cardTitleLight}>Rewards wallet</Text>
            </View>

            <Text style={styles.balanceAmount}>{formatCurrency(rewardsBalance)}</Text>
            <Text style={styles.balanceCopy}>
              You earn 2.5% back on every completed ride. Spend it on trips or withdraw it.
            </Text>

            <View style={styles.balanceMetaRow}>
              <View style={styles.balanceMetaCard}>
                <Text style={styles.balanceMetaLabel}>Pending cash-outs</Text>
                <Text style={styles.balanceMetaValue}>{formatCurrency(summary?.pendingCashoutAmount || 0)}</Text>
              </View>
              <View style={styles.balanceMetaCard}>
                <Text style={styles.balanceMetaLabel}>Rewarded riders</Text>
                <Text style={styles.balanceMetaValue}>{summary?.rewardedReferrals || 0}</Text>
              </View>
            </View>

            <View style={styles.balanceNotice}>
              <Ionicons name="sparkles-outline" size={16} color={Colors.white} />
              <Text style={styles.balanceNoticeText}>Balances refresh after completed trips and reward programme earnings post automatically.</Text>
            </View>

            <Text style={styles.minimumHint}>Move your referral earnings to your wallet, then withdraw (admin-approved) or spend them on rides.</Text>

            <Pressable
              style={[styles.primaryAction, (rewardsBalance <= 0 || transferBusy) && styles.secondaryActionDisabled]}
              onPress={handleTransferToWallet}
              disabled={rewardsBalance <= 0 || transferBusy}
            >
              <Ionicons name="wallet-outline" size={16} color="#181818" />
              <Text style={styles.primaryActionText}>{transferBusy ? "Transferring…" : "Transfer to Wallet"}</Text>
            </Pressable>

            <View style={styles.balanceActionsRow}>
              <Pressable
                style={[styles.secondaryAction, !canRequestCashout && styles.secondaryActionDisabled]}
                onPress={() => setShowCashout(true)}
                disabled={!canRequestCashout}
              >
                <Text style={styles.secondaryActionText}>Withdraw</Text>
              </Pressable>
              <Pressable style={styles.outlineAction} onPress={handleShareReferral}>
                <Text style={styles.outlineActionText}>Share Link</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>How It Works</Text>
            <Text style={styles.sectionCaption}>Three simple steps</Text>
          </View>
          {REWARD_STEPS.map((step, index) => (
            <View key={step.number} style={[styles.stepRow, index > 0 && styles.stepRowBorder]}>
              <Text style={styles.stepRowNumber}>{step.number}</Text>
              <View style={styles.stepRowBody}>
                <Text style={styles.stepRowTitle}>{step.title}</Text>
                <Text style={styles.stepRowCopy}>{step.copy}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={[styles.metricGrid, isWide && styles.metricGridWide]}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>People invited</Text>
            <Text style={styles.metricValue}>{summary?.referredCount || 0}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Total earned</Text>
            <Text style={styles.metricValue}>{formatCurrency(summary?.totalRewardsEarned || 0)}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Ready to spend</Text>
            <Text style={styles.metricValue}>{formatCurrency(rewardsBalance)}</Text>
          </View>
        </View>

        <View style={[styles.detailGrid, isWide && styles.detailGridWide]}>
          <View style={[styles.sectionCard, styles.detailCard, isWide && styles.detailCardWide]}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Recent Reward Activity</Text>
                {referredPeople.length > 0 ? (
                  <Pressable onPress={() => setShowReferredPeople(true)}>
                    <Text style={styles.sectionAction}>View more</Text>
                  </Pressable>
                ) : (
                  <Text style={styles.sectionCaption}>{transactions.length} entries</Text>
                )}
            </View>
              {referredPeople.length > 0 ? (
                referralPreview.map((person, index) => (
                  <View key={person.id} style={[styles.rowItem, index > 0 && styles.rowItemBorder]}>
                    <View style={styles.rowIconWrap}>
                      <Ionicons name={person.totalRewards > 0 ? "gift-outline" : "person-outline"} size={18} color={Colors.white} />
                    </View>
                    <View style={styles.rowMain}>
                      <Text style={styles.rowTitle}>{person.name}</Text>
                      <Text style={styles.rowSub}>{getReferralActivityCopy(person)}</Text>
                    </View>
                    <View style={styles.rowRight}>
                      <Text style={[styles.rowAmount, person.totalRewards > 0 ? styles.rowAmountPositive : styles.rowAmountNeutral]}>
                        {person.totalRewards > 0 ? `+${formatCurrency(person.totalRewards)}` : "Joined"}
                      </Text>
                      <Text style={styles.rowMeta}>{formatDate(getReferralActivityDate(person))}</Text>
                    </View>
                  </View>
                ))
              ) : transactions.length === 0 ? (
              <Text style={styles.emptyText}>No rewards activity yet.</Text>
            ) : (
              transactions.map((tx, index) => (
                <View key={tx.id} style={[styles.rowItem, index > 0 && styles.rowItemBorder]}>
                  <View style={styles.rowIconWrap}>
                    <Ionicons
                      name={tx.type === "ride_redemption" ? "car-outline" : tx.type === "cashout_request" ? "cash-outline" : tx.type === "ride_cashback" ? "sparkles-outline" : "gift-outline"}
                      size={18}
                      color={Colors.white}
                    />
                  </View>
                  <View style={styles.rowMain}>
                    <Text style={styles.rowTitle}>{TX_LABELS[tx.type] || tx.type}</Text>
                    <Text style={styles.rowSub}>{tx.description || "Rewards update"}</Text>
                  </View>
                  <View style={styles.rowRight}>
                    <Text style={[styles.rowAmount, transactionTone(tx.type)]}>
                      {transactionPrefix(tx.type)}{formatCurrency(tx.amount)}
                    </Text>
                    <Text style={styles.rowMeta}>Bal: {formatCurrency(tx.balanceAfter)}</Text>
                  </View>
                </View>
              ))
            )}
          </View>

          <View style={[styles.sectionCard, styles.detailCard, isWide && styles.detailCardWide]}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Withdrawal History</Text>
              <Pressable onPress={() => setShowCashout(true)} disabled={!canRequestCashout}>
                <Text style={[styles.sectionAction, !canRequestCashout && styles.sectionActionDisabled]}>Request</Text>
              </Pressable>
            </View>
            {cashouts.length === 0 ? (
              <Text style={styles.emptyText}>No withdrawal requests yet.</Text>
            ) : (
              cashouts.map((cashout, index) => (
                <View key={cashout.id} style={[styles.rowItem, index > 0 && styles.rowItemBorder]}>
                  <View style={[styles.rowIconWrap, styles.cashoutIconWrap]}>
                    <Ionicons name="arrow-down-outline" size={18} color={Colors.white} />
                  </View>
                  <View style={styles.rowMain}>
                    <Text style={styles.rowTitle}>{formatCurrency(cashout.amount)}</Text>
                    <Text style={styles.rowSub}>{cashout.bankName || "Manual payout"}</Text>
                  </View>
                  <View style={styles.rowRight}>
                    <Text style={styles.cashoutStatus}>{cashout.status.toUpperCase()}</Text>
                    <Text style={styles.rowMeta}>{formatDate(cashout.requestedAt)}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>

      <Modal visible={showCashout} transparent animationType="slide" onRequestClose={() => setShowCashout(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowCashout(false)} />
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}> 
            <Text style={styles.modalEyebrow}>WITHDRAW REWARDS</Text>
            <Text style={styles.modalTitle}>Request Balance Payout</Text>
            <Text style={styles.modalCopy}>
              Submit your preferred bank details and the A2B team will review the request manually.
            </Text>
            <Text style={styles.modalHint}>Minimum payout request is R {MIN_CASHOUT_AMOUNT.toFixed(2)}.</Text>
            <TextInput
              value={cashoutAmount}
              onChangeText={setCashoutAmount}
              placeholder="Amount"
              placeholderTextColor={Colors.textMuted}
              keyboardType="decimal-pad"
              style={styles.input}
            />
            <TextInput
              value={bankName}
              onChangeText={setBankName}
              placeholder="Bank Name"
              placeholderTextColor={Colors.textMuted}
              style={styles.input}
            />
            <TextInput
              value={accountHolder}
              onChangeText={setAccountHolder}
              placeholder="Account Holder"
              placeholderTextColor={Colors.textMuted}
              style={styles.input}
            />
            <TextInput
              value={accountNumber}
              onChangeText={setAccountNumber}
              placeholder="Account Number"
              placeholderTextColor={Colors.textMuted}
              keyboardType="number-pad"
              style={styles.input}
            />
            <Pressable style={[styles.submitBtn, !canSubmitCashout && styles.submitBtnDisabled]} onPress={handleCashoutRequest} disabled={!canSubmitCashout}>
              {cashoutBusy ? <ActivityIndicator color={Colors.primary} /> : <Text style={styles.submitBtnText}>Submit Withdrawal Request</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={showReferredPeople} transparent animationType="slide" onRequestClose={() => setShowReferredPeople(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowReferredPeople(false)} />
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}> 
            <View style={styles.modalHeaderRow}>
              <View style={styles.modalHeaderCopy}>
                <Text style={styles.modalEyebrow}>YOUR INVITES</Text>
                <Text style={styles.modalTitle}>People you invited</Text>
              </View>
              <Pressable style={styles.modalCloseButton} onPress={() => setShowReferredPeople(false)} hitSlop={10}>
                <Ionicons name="close" size={18} color={Colors.textSecondary} />
              </Pressable>
            </View>
            <Text style={styles.modalCopy}>
              See who joined with your invite and when each person started earning rewards.
            </Text>
            {referredPeople.length === 0 ? (
              <Text style={styles.emptyText}>No invited riders yet.</Text>
            ) : (
              <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
                {referredPeople.map((person, index) => (
                  <View key={person.id} style={[styles.rowItem, index > 0 && styles.rowItemBorder]}>
                    <View style={styles.rowIconWrap}>
                      <Ionicons name={person.totalRewards > 0 ? "gift-outline" : "person-outline"} size={18} color={Colors.white} />
                    </View>
                    <View style={styles.rowMain}>
                      <Text style={styles.rowTitle}>{person.name}</Text>
                      <Text style={styles.rowSub}>{getReferralActivityCopy(person)}</Text>
                    </View>
                    <View style={styles.rowRight}>
                      <Text style={[styles.rowAmount, person.totalRewards > 0 ? styles.rowAmountPositive : styles.rowAmountNeutral]}>
                        {person.totalRewards > 0 ? `+${formatCurrency(person.totalRewards)}` : "Joined"}
                      </Text>
                      <Text style={styles.rowMeta}>{formatDate(getReferralActivityDate(person))}</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
  },
  eyebrow: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#B69455",
    letterSpacing: 1.8,
    marginBottom: 10,
  },
  pageLead: {
    fontSize: 24,
    lineHeight: 32,
    color: Colors.white,
    fontFamily: "Inter_700Bold",
    marginBottom: 20,
    maxWidth: 760,
  },
  inlineNotice: {
    fontSize: 12,
    lineHeight: 18,
    color: Colors.warning,
    fontFamily: "Inter_500Medium",
    marginBottom: 6,
  },
  qrCard: {
    backgroundColor: "#111111",
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: "#242424",
    marginBottom: 14,
    gap: 14,
  },
  qrHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  qrEyebrow: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: "#B69455",
    letterSpacing: 1.2,
  },
  qrTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
    marginTop: 3,
  },
  qrBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
  },
  qrBox: {
    width: 148,
    height: 148,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
    overflow: "hidden",
    flexShrink: 0,
  },
  qrCopyWrap: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  qrCopy: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  qrLink: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  heroGrid: {
    gap: 14,
    marginBottom: 14,
  },
  heroGridWide: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  heroColumn: {
    flex: 1,
  },
  inviteCard: {
    backgroundColor: "#F4EFE6",
    borderRadius: 26,
    padding: 22,
    minHeight: 320,
  },
  balanceCard: {
    backgroundColor: "#151515",
    borderRadius: 26,
    padding: 22,
    borderWidth: 1,
    borderColor: "#242424",
    minHeight: 320,
  },
  stepBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  stepBadgeLight: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(24,24,24,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  stepBadgeLightText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: "#181818",
  },
  stepBadgeDark: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    alignItems: "center",
    justifyContent: "center",
  },
  stepBadgeDarkText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
  },
  cardTitleDark: {
    fontSize: 28,
    lineHeight: 34,
    fontFamily: "Inter_700Bold",
    color: "#181818",
  },
  cardTitleLight: {
    fontSize: 28,
    lineHeight: 34,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
  },
  cardCopyDark: {
    fontSize: 15,
    lineHeight: 22,
    color: "#5D574D",
    fontFamily: "Inter_400Regular",
    marginBottom: 18,
    maxWidth: 420,
  },
  codeBlock: {
    backgroundColor: "rgba(24,24,24,0.08)",
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
  },
  codeBlockLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#6B6459",
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  codeBlockValue: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: "#181818",
    letterSpacing: 1.4,
  },
  linkPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.7)",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  linkPillText: {
    flex: 1,
    fontSize: 13,
    color: "#181818",
    fontFamily: "Inter_500Medium",
  },
  primaryAction: {
    backgroundColor: "#181818",
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryActionText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#F4EFE6",
  },
  cardHintDark: {
    marginTop: 14,
    fontSize: 12,
    lineHeight: 18,
    color: "#6B6459",
    fontFamily: "Inter_400Regular",
  },
  balanceAmount: {
    fontSize: 34,
    lineHeight: 38,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
    marginBottom: 10,
  },
  balanceCopy: {
    fontSize: 14,
    lineHeight: 21,
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
    marginBottom: 16,
    maxWidth: 420,
  },
  balanceMetaRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  balanceMetaCard: {
    flex: 1,
    backgroundColor: "#202020",
    borderRadius: 16,
    padding: 14,
  },
  balanceMetaLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.textMuted,
    marginBottom: 6,
  },
  balanceMetaValue: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
  },
  balanceNotice: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  balanceNoticeText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
  },
  minimumHint: {
    fontSize: 12,
    color: Colors.textMuted,
    fontFamily: "Inter_500Medium",
    marginBottom: 12,
  },
  balanceActionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  secondaryAction: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryActionDisabled: {
    opacity: 0.45,
  },
  secondaryActionText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.primary,
  },
  outlineAction: {
    flex: 1,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  outlineActionText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  sectionCard: {
    backgroundColor: Colors.card,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 14,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  sectionCaption: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.textMuted,
  },
  sectionAction: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#D8B26B",
  },
  sectionActionDisabled: {
    color: Colors.textMuted,
  },
  stepRow: {
    flexDirection: "row",
    gap: 14,
    paddingVertical: 14,
  },
  stepRowBorder: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  stepRowNumber: {
    width: 30,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: "#D8B26B",
  },
  stepRowBody: {
    flex: 1,
  },
  stepRowTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
    marginBottom: 4,
  },
  stepRowCopy: {
    fontSize: 13,
    lineHeight: 20,
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
  },
  metricGrid: {
    gap: 12,
    marginTop: 14,
  },
  metricGridWide: {
    flexDirection: "row",
  },
  metricCard: {
    flex: 1,
    backgroundColor: "#111111",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 18,
  },
  metricLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.textMuted,
    marginBottom: 10,
  },
  metricValue: {
    fontSize: 24,
    lineHeight: 30,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
  },
  detailGrid: {
    gap: 14,
  },
  detailGridWide: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  detailCard: {
    marginTop: 14,
  },
  detailCardWide: {
    flex: 1,
    minHeight: 320,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginTop: 8,
  },
  rowItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
  },
  rowItemBorder: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  rowIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1F1F1F",
  },
  cashoutIconWrap: {
    backgroundColor: "#2A2117",
  },
  rowMain: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  rowSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginTop: 3,
  },
  rowRight: {
    alignItems: "flex-end",
  },
  rowAmount: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  rowAmountPositive: {
    color: Colors.success,
  },
  rowAmountNegative: {
    color: "#D8B26B",
  },
  rowAmountNeutral: {
    color: Colors.textSecondary,
  },
  rowMeta: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginTop: 4,
  },
  cashoutStatus: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#121212",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#252525",
  },
  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  modalHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
  },
  modalEyebrow: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#B69455",
    letterSpacing: 1.6,
  },
  modalTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
  },
  modalCopy: {
    fontSize: 13,
    lineHeight: 20,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  modalHint: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: "Inter_500Medium",
    color: Colors.textMuted,
    marginBottom: 4,
  },
  modalList: {
    maxHeight: 420,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.white,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontFamily: "Inter_400Regular",
  },
  submitBtn: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    marginTop: 4,
  },
  submitBtnDisabled: {
    opacity: 0.45,
  },
  submitBtnText: {
    color: Colors.primary,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
