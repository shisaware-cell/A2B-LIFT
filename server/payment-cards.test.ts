import assert from "node:assert/strict";
import test from "node:test";
import {
  parsePaystackMetadata,
  normalizePaystackCardAuth,
  savePaystackCardFromTransaction,
  processPaystackChargeSuccess,
} from "./payment-cards";
import { redirectSystemPath } from "../app/+native-intent";
import { normalizePaystackReference } from "../shared/paystack-reference";

test("normalizePaystackReference collapses duplicate callback values", () => {
  const reference = "A2B-1788895755000-3346d2";

  assert.equal(normalizePaystackReference(reference), reference);
  assert.equal(normalizePaystackReference([reference, reference]), reference);
  assert.equal(normalizePaystackReference(`${reference},${reference}`), reference);
  assert.equal(normalizePaystackReference([reference, "A2B-DIFFERENT"]), null);
  assert.equal(normalizePaystackReference(`${reference}?status=success`), null);
});

test("parsePaystackMetadata handles objects and JSON strings gracefully", () => {
  // Direct object
  const meta1 = parsePaystackMetadata({
    userId: "user_123",
    saveCard: true,
    rideId: "ride_456",
  });
  assert.equal(meta1.userId, "user_123");
  assert.equal(meta1.saveCard, true);
  assert.equal(meta1.rideId, "ride_456");

  // Stringified JSON (common in Paystack webhook / raw API response)
  const meta2 = parsePaystackMetadata(
    JSON.stringify({ userId: "user_789", save_card: "true", saveCardOnly: true })
  );
  assert.equal(meta2.userId, "user_789");
  assert.equal(meta2.saveCard, true);
  assert.equal(meta2.saveCardOnly, true);

  // Malformed or empty
  const meta3 = parsePaystackMetadata("invalid-json");
  assert.equal(meta3.saveCard, false);
  assert.equal(meta3.saveCardOnly, false);
});

test("normalizePaystackCardAuth formats columns to fit DB constraints and accepts non-reusable auth", () => {
  const normalized = normalizePaystackCardAuth({
    authorization_code: "AUTH_abc12345",
    card_type: "VISA DEBIT",
    last4: "4081",
    exp_month: 9, // numeric month
    exp_year: 2028, // numeric year
    bank: "Capitec Bank",
    reusable: false, // South African 3DS debit card
  });

  assert.equal(normalized.isValid, true);
  assert.equal(normalized.paystackAuthCode, "AUTH_abc12345");
  assert.equal(normalized.last4, "4081");
  assert.equal(normalized.expMonth, "09"); // 2 digits
  assert.equal(normalized.expYear, "2028"); // 4 digits
  assert.equal(normalized.cardType, "visa debit");
  assert.equal(normalized.bank, "Capitec Bank");
  assert.equal(normalized.reusable, false);

  // Two-digit year handling
  const shortYear = normalizePaystackCardAuth({
    authorization_code: "AUTH_xyz",
    last4: "1234",
    exp_month: "12",
    exp_year: "27",
  });
  assert.equal(shortYear.expYear, "2027");
  assert.equal(shortYear.isValid, true);
});

test("savePaystackCardFromTransaction idempotently persists cards and updates token on rematch", async () => {
  const cardsDb: any[] = [];
  const mockStorage = {
    async getSavedCardsByUser(userId: string) {
      return cardsDb.filter((c) => c.userId === userId);
    },
    async createSavedCard(data: any) {
      const card = { id: `card_${cardsDb.length + 1}`, ...data };
      cardsDb.push(card);
      return card;
    },
    async updateSavedCard(id: string, data: any) {
      const idx = cardsDb.findIndex((c) => c.id === id);
      if (idx !== -1) {
        cardsDb[idx] = { ...cardsDb[idx], ...data };
        return cardsDb[idx];
      }
      return null;
    },
  };

  const txData = {
    metadata: { userId: "rider_1", saveCard: true },
    authorization: {
      authorization_code: "AUTH_initial",
      card_type: "mastercard",
      last4: "9999",
      exp_month: "05",
      exp_year: "2029",
      bank: "Standard Bank",
    },
  };

  // First save: creates new default card
  const res1 = await savePaystackCardFromTransaction(mockStorage, txData);
  assert.equal(res1.saved, true);
  assert.equal(res1.updated, false);
  assert.equal(cardsDb.length, 1);
  assert.equal(cardsDb[0].paystackAuthCode, "AUTH_initial");
  assert.equal(cardsDb[0].isDefault, true);

  // Subsequent transaction with same card but updated auth token: updates existing card
  const txData2 = {
    metadata: { userId: "rider_1", saveCard: true },
    authorization: {
      authorization_code: "AUTH_refreshed",
      card_type: "mastercard",
      last4: "9999",
      exp_month: "05",
      exp_year: "2029",
      bank: "Standard Bank",
    },
  };

  const res2 = await savePaystackCardFromTransaction(mockStorage, txData2);
  assert.equal(res2.saved, true);
  assert.equal(res2.updated, true);
  assert.equal(cardsDb.length, 1); // No duplicate
  assert.equal(cardsDb[0].paystackAuthCode, "AUTH_refreshed");
});

test("processPaystackChargeSuccess refunds R1 for saveCardOnly transactions", async () => {
  let userWallet = 50;
  const recordedTxs: any[] = [];
  const cardsDb: any[] = [];

  const mockStorage = {
    async getSavedCardsByUser() { return cardsDb; },
    async createSavedCard(data: any) {
      const card = { id: "card_1", ...data };
      cardsDb.push(card);
      return card;
    },
    async updateSavedCard() {},
    async getWalletTransactions() { return recordedTxs; },
    async getUser() { return { id: "u_1", walletBalance: userWallet }; },
    async updateUser(_id: string, data: any) {
      if (typeof data.walletBalance === "number") userWallet = data.walletBalance;
    },
  };

  const mockRecordWalletTx = async (
    userId: string,
    type: string,
    amount: number,
    balanceBefore: number,
    description: string,
    reference?: string
  ) => {
    recordedTxs.push({ userId, type, amount, balanceBefore, description, reference });
    return balanceBefore + amount;
  };

  const txData = {
    reference: "A2B-CARD-AUTH-1",
    amount: 100, // 100 cents = R1
    metadata: { userId: "u_1", saveCard: true, saveCardOnly: true },
    authorization: {
      authorization_code: "AUTH_card_auth",
      card_type: "visa",
      last4: "5555",
      exp_month: "11",
      exp_year: "2027",
      bank: "FNB",
    },
  };

  const result = await processPaystackChargeSuccess(mockStorage, txData, undefined, mockRecordWalletTx);
  assert.equal(result.success, true);
  assert.equal(result.cardResult.saved, true);
  assert.equal(userWallet, 51); // R1 refunded to wallet
  assert.equal(recordedTxs.length, 1);
  assert.equal(recordedTxs[0].type, "refund");
  assert.equal(recordedTxs[0].amount, 1);
});

test("redirectSystemPath rewrites paystack payment callbacks to client wallet", () => {
  const directUrl = redirectSystemPath({
    path: "payments/paystack-callback?reference=A2B-123456&status=success",
    initial: false,
  });
  assert.equal(directUrl, "/client/wallet?reference=A2B-123456&status=success");

  const normalRoute = redirectSystemPath({
    path: "client/trips",
    initial: false,
  });
  assert.equal(normalRoute, "/client/trips");
});
