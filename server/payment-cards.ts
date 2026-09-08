export interface ParsedPaystackMetadata {
  userId?: string;
  rideId?: string | null;
  saveCard?: boolean;
  saveCardOnly?: boolean;
  [key: string]: any;
}

export interface NormalizedCardAuth {
  paystackAuthCode: string;
  cardType: string;
  last4: string;
  expMonth: string;
  expYear: string;
  bank: string;
  reusable?: boolean;
  isValid: boolean;
}

/**
 * Safely parses Paystack metadata whether it arrives as an object or a JSON string.
 */
export function parsePaystackMetadata(rawMetadata: any): ParsedPaystackMetadata {
  let meta: any = {};
  if (typeof rawMetadata === "string") {
    try {
      meta = JSON.parse(rawMetadata);
    } catch {
      meta = {};
    }
  } else if (rawMetadata && typeof rawMetadata === "object") {
    meta = rawMetadata;
  }

  const saveCardRaw = meta.saveCard ?? meta.save_card ?? meta.savecard;
  const saveCardOnlyRaw = meta.saveCardOnly ?? meta.save_card_only ?? meta.savecardonly;

  const saveCard = saveCardRaw === true || saveCardRaw === "true" || saveCardRaw === 1 || saveCardRaw === "1";
  const saveCardOnly = saveCardOnlyRaw === true || saveCardOnlyRaw === "true" || saveCardOnlyRaw === 1 || saveCardOnlyRaw === "1";

  return {
    ...meta,
    userId: meta.userId || meta.user_id || undefined,
    rideId: meta.rideId || meta.ride_id || null,
    saveCard: saveCard || saveCardOnly,
    saveCardOnly,
  };
}

/**
 * Normalizes card authorization data to fit PostgreSQL column types and prevents DB errors.
 */
export function normalizePaystackCardAuth(auth: any): NormalizedCardAuth {
  if (!auth || typeof auth !== "object") {
    return {
      paystackAuthCode: "",
      cardType: "card",
      last4: "",
      expMonth: "",
      expYear: "",
      bank: "Bank Card",
      isValid: false,
    };
  }

  const paystackAuthCode = String(auth.authorization_code || "").trim();
  const last4 = String(auth.last4 || "").replace(/\D/g, "").slice(-4);
  const rawMonth = String(auth.exp_month || "").replace(/\D/g, "");
  const expMonth = rawMonth ? rawMonth.padStart(2, "0").slice(-2) : "";
  const rawYear = String(auth.exp_year || "").replace(/\D/g, "");
  const expYear = rawYear ? (rawYear.length === 2 ? `20${rawYear}` : rawYear.slice(-4)) : "";
  const cardType = String(auth.card_type || auth.brand || "card").trim().toLowerCase();
  const bank = String(auth.bank || "").trim() || "Bank Card";

  const isValid = Boolean(
    paystackAuthCode &&
    last4.length === 4 &&
    expMonth.length === 2 &&
    expYear.length === 4
  );

  return {
    paystackAuthCode,
    cardType,
    last4,
    expMonth,
    expYear,
    bank,
    reusable: typeof auth.reusable === "boolean" ? auth.reusable : undefined,
    isValid,
  };
}

/**
 * Idempotently saves or updates a card for a user from a successful Paystack transaction.
 */
export async function savePaystackCardFromTransaction(
  storage: any,
  txData: any,
  fallbackUserId?: string
): Promise<{ saved: boolean; card?: any; updated?: boolean; reason?: string }> {
  const metadata = parsePaystackMetadata(txData?.metadata);
  const userId = metadata.userId || fallbackUserId;

  if (!userId) {
    return { saved: false, reason: "No userId found in metadata or fallback" };
  }

  const shouldSave = Boolean(metadata.saveCard || metadata.saveCardOnly);
  if (!shouldSave) {
    return { saved: false, reason: "Card saving not requested in transaction metadata" };
  }

  const auth = normalizePaystackCardAuth(txData?.authorization);
  if (!auth.isValid) {
    return { saved: false, reason: "Invalid card authorization data" };
  }

  try {
    const existingCards = (await storage.getSavedCardsByUser(userId)) || [];
    const matched = existingCards.find(
      (c: any) => String(c.last4) === auth.last4 && String(c.expYear) === auth.expYear
    );

    if (matched) {
      // Update with the latest authorization code to ensure recurring charges work
      const updated = await storage.updateSavedCard(matched.id, {
        paystackAuthCode: auth.paystackAuthCode,
        cardType: auth.cardType || matched.cardType,
        bank: auth.bank || matched.bank,
      });
      return { saved: true, updated: true, card: updated || matched };
    }

    const newCard = await storage.createSavedCard({
      userId,
      paystackAuthCode: auth.paystackAuthCode,
      cardType: auth.cardType,
      last4: auth.last4,
      expMonth: auth.expMonth,
      expYear: auth.expYear,
      bank: auth.bank,
      isDefault: existingCards.length === 0,
    });

    return { saved: true, updated: false, card: newCard };
  } catch (error: any) {
    console.error("[savePaystackCardFromTransaction error]", error?.message || error);
    return { saved: false, reason: error?.message || "Storage error saving card" };
  }
}

/**
 * Processes a successful Paystack charge: saves cards, credits wallets / refunds R1,
 * and updates ride payment status. Idempotent across webhook and verify endpoint calls.
 */
export async function processPaystackChargeSuccess(
  storage: any,
  txData: any,
  fallbackUserId?: string,
  recordWalletTx?: (
    userId: string,
    type: string,
    amount: number,
    balanceBefore: number,
    description: string,
    reference?: string,
    rideId?: string
  ) => Promise<number>
): Promise<{
  success: boolean;
  cardResult: { saved: boolean; card?: any; updated?: boolean; reason?: string };
  amount: number;
  userId?: string;
}> {
  const metadata = parsePaystackMetadata(txData?.metadata);
  const userId = metadata.userId || fallbackUserId;
  const amount = Number(txData?.amount || 0) / 100;
  const reference = String(txData?.reference || "");

  // 1. Save card if requested
  const cardResult = await savePaystackCardFromTransaction(storage, txData, userId);

  // 2. Handle Ride payment if rideId is present
  if (metadata.rideId) {
    try {
      const payments = (await storage.getPaymentsByRide(metadata.rideId)) || [];
      const pending = payments.find((p: any) => p.paystackReference === reference || p.status === "pending");
      if (pending) {
        await storage.updatePayment(pending.id, {
          status: "paid",
          paidAt: new Date(),
          paystackAuthCode: txData.authorization?.authorization_code,
        });
      }
      await storage.updateRide(metadata.rideId, { paymentStatus: "paid" });
    } catch (err: any) {
      console.error("[processPaystackChargeSuccess ride error]", err?.message || err);
    }
  }

  // 3. Handle Wallet operations (when not paying for a specific ride)
  if (!metadata.rideId && userId && amount > 0) {
    try {
      const existingTxs = (await storage.getWalletTransactions(userId)) || [];
      const alreadyProcessed = existingTxs.some((tx: any) => tx.reference === reference);

      if (!alreadyProcessed) {
        const user = await storage.getUser(userId);
        const balanceBefore = Number(user?.walletBalance || 0);

        if (metadata.saveCardOnly) {
          // R1 authorization charge: refund back to wallet (net zero to user)
          const newBalance = balanceBefore + amount;
          await storage.updateUser(userId, { walletBalance: newBalance });
          if (recordWalletTx) {
            await recordWalletTx(userId, "refund", amount, balanceBefore, "Card verification refund", reference);
          } else {
            await storage.createWalletTransaction({
              userId,
              type: "refund",
              amount,
              balanceBefore,
              balanceAfter: newBalance,
              reference,
              description: "Card verification refund",
              status: "completed",
            });
          }
        } else {
          // Regular wallet top-up via card
          const newBalance = balanceBefore + amount;
          await storage.updateUser(userId, { walletBalance: newBalance });
          if (recordWalletTx) {
            await recordWalletTx(userId, "topup", amount, balanceBefore, "Wallet top-up via card", reference);
          } else {
            await storage.createWalletTransaction({
              userId,
              type: "topup",
              amount,
              balanceBefore,
              balanceAfter: newBalance,
              reference,
              description: "Wallet top-up via card",
              status: "completed",
            });
          }
        }
      }
    } catch (err: any) {
      console.error("[processPaystackChargeSuccess wallet error]", err?.message || err);
    }
  }

  return {
    success: true,
    cardResult,
    amount,
    userId,
  };
}
