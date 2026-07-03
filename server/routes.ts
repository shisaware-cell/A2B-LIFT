import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import axios from "axios";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { storage } from "./storage";
import { db, pool } from "./db";
import { users, livenessSessions, rides as ridesTable } from "../shared/schema";
import { desc, eq, sql } from "drizzle-orm";
import { uploadLivenessPhoto, getAdminSignedUrl } from "./livenessPhotoService";
import {
  calculatePrice,
  calculateChauffeurEarnings,
  getPricingConfig,
  getVehicleCategories,
} from "./luxuryPricingEngine";
import { authOptional, requireAuth, requireRole, type AuthedRequest } from "./auth-middleware";
import { signAccessToken, type UserRole } from "./auth";
import { externalApiService } from "./external-api-service";
import {
  calculateDemandMultiplier,
  calculateWaitingFee,
  isValidLocationSample,
  reconcileDriverProfileStatus,
  resolveCancellation,
  resolveOperatorSubmissionStatus,
} from "./ride-operations-policy";
import { validateAdminPassword } from "./admin-password-policy";
import { getReleaseFingerprint } from "./release-info";

const RIDE_MATCH_RADIUS_KM = 25;
const CHAUFFEUR_LOCATION_STALE_WINDOW_MS = 10 * 60 * 1000;
const TOTAL_COMMISSION_RATE = 0.25;
const DRIVER_ANNUAL_SHARE_RATE = 0.05;
const REFERRAL_REWARD_RATE = 0.025;
const DRIVER_SHARE_MIN_ACTIVE_MONTHS = 3;
const DRIVER_SHARE_MIN_WEEKLY_TRIPS = 5;
const DEMAND_PRICING_CAP = 1.5;

// Distance helper used by demand pricing, address ranking, ride matching, and route fallbacks.
// Keep this module-scoped so top-level helpers and route handlers can call it after bundling.
function calculateHaversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function getDemandPricingMultiplier(pickup?: { lat: number; lng: number }) {
  const [allRides, chauffeurs] = await Promise.all([
    storage.getAllRides(),
    storage.getAllChauffeurs(),
  ]);
  return calculateDemandMultiplier({
    searchingRides: allRides.filter((ride) => ride.status === "searching" && (!pickup || calculateHaversineDistanceKm(pickup.lat, pickup.lng, Number(ride.pickupLat), Number(ride.pickupLng)) <= 5)).length + 1,
    onlineDrivers: chauffeurs.filter((chauffeur) => chauffeur.isApproved && chauffeur.isOnline && (!pickup || (chauffeur.lat != null && chauffeur.lng != null && calculateHaversineDistanceKm(pickup.lat, pickup.lng, Number(chauffeur.lat), Number(chauffeur.lng)) <= 10))).length,
    maximum: DEMAND_PRICING_CAP,
  });
}

function getAnnualShareGrossFromEarning(earning: any): number {
  const amount = Math.abs(Number(earning?.amount || 0));
  const commission = Math.abs(Number(earning?.commission || 0));
  if (commission > 0) return commission / TOTAL_COMMISSION_RATE;
  return amount > 0 ? amount / (1 - TOTAL_COMMISSION_RATE) : 0;
}

function summarizeAnnualDriverShare(earnings: any[], year = new Date().getFullYear()) {
  const start = new Date(year, 0, 1).getTime();
  const end = new Date(year + 1, 0, 1).getTime();
  const qualifying = earnings.filter((earning) => {
    const createdAt = new Date(earning.createdAt || Date.now()).getTime();
    const type = String(earning.type || "");
    return (
      createdAt >= start &&
      createdAt < end &&
      !type.includes("lift_club") &&
      (type === "cash" || type === "card" || type === "wallet" || type.startsWith("long_distance"))
    );
  });
  const gross = qualifying.reduce((sum, earning) => sum + getAnnualShareGrossFromEarning(earning), 0);
  return {
    year,
    qualifyingTrips: qualifying.length,
    grossQualifyingFare: Math.round(gross * 100) / 100,
    annualShare: Math.round(gross * DRIVER_ANNUAL_SHARE_RATE * 100) / 100,
    platformFee: Math.round(gross * 0.2 * 100) / 100,
    totalCommission: Math.round(gross * TOTAL_COMMISSION_RATE * 100) / 100,
    rules: {
      minimumActiveMonths: DRIVER_SHARE_MIN_ACTIVE_MONTHS,
      minimumWeeklyTrips: DRIVER_SHARE_MIN_WEEKLY_TRIPS,
      excludes: "Daily Lift Club trips and bookings",
      payoutMonth: "December",
    },
  };
}

async function creditReferralReward(options: {
  referredUserId?: string | null;
  riderUserId?: string | null;
  rideId?: string | null;
  sourceUserId?: string | null;
  grossFare: number;
  type: "driver_referral_commission" | "rider_referral_commission";
  description: string;
  notificationBody: string;
  referencePrefix: string;
}) {
  const sourceUserId = options.sourceUserId || options.referredUserId || options.riderUserId;
  const sourceUser = sourceUserId ? await storage.getUser(sourceUserId) : undefined;
  const referrerUserId = sourceUser?.referredByUserId;
  if (!referrerUserId) return;

  const reward = Math.round(options.grossFare * REFERRAL_REWARD_RATE * 100) / 100;
  if (reward <= 0) return;

  if (options.rideId) {
    const alreadyPaid = await storage.getRewardTransactionByRideAndType(
      referrerUserId,
      options.rideId,
      options.type,
      sourceUserId || undefined,
    );
    if (alreadyPaid) return;
  }

  const referrer = await storage.getUser(referrerUserId);
  if (!referrer) return;

  const balanceBefore = referrer.rewardsBalance || 0;
  const balanceAfter = balanceBefore + reward;
  await storage.updateUser(referrer.id, { rewardsBalance: balanceAfter });
  await storage.createRewardTransaction({
    userId: referrer.id,
    sourceUserId,
    rideId: options.rideId || null,
    type: options.type,
    amount: reward,
    balanceBefore,
    balanceAfter,
    description: options.description,
    status: "completed",
    reference: `${options.referencePrefix}_${options.rideId || Date.now()}_${referrer.id.slice(0, 6)}`,
  });

  if (sourceUserId) {
    const refEvent = await storage.getReferralEventByReferredUserId(sourceUserId);
    if (refEvent) {
      await storage.updateReferralEvent(refEvent.id, {
        totalRewards: (refEvent.totalRewards || 0) + reward,
        lastRewardAt: new Date(),
        status: "active",
      });
    }
  }

  await storage.createNotification({
    userId: referrer.id,
    title: "Reward Earnings",
    body: options.notificationBody.replace("{amount}", reward.toFixed(2)),
    type: "reward",
  });
}

function hasFreshChauffeurLocation(chauffeur: { lat?: number | null; lng?: number | null; locationUpdatedAt?: Date | string | null }) {
  if (chauffeur.lat == null || chauffeur.lng == null) return false;
  if (!chauffeur.locationUpdatedAt) return true;
  const timestamp = new Date(chauffeur.locationUpdatedAt).getTime();
  if (!Number.isFinite(timestamp)) return true;
  return Date.now() - timestamp <= CHAUFFEUR_LOCATION_STALE_WINDOW_MS;
}

async function sendExpoPushNotification(
  tokens: string[],
  title: string,
  body: string,
  data?: object,
  options?: { urgent?: boolean; channelId?: string },
) {
  const urgent = options?.urgent ?? false;
  const channelId = options?.channelId || (urgent ? "ride-alerts-v3" : "default");
  const sound = urgent ? "trip_alert.wav" : "default";
  const messages = tokens
    .filter(t => t && (t.startsWith("ExponentPushToken[") || t.startsWith("ExpoPushToken[")))
    .map(to => ({
      to,
      sound,
      title,
      body,
      data: data || {},
      badge: urgent ? 1 : undefined,
      priority: urgent ? "high" : "normal",
      ttl: urgent ? 300 : 3600,
      channelId,
      // iOS: mark as time-sensitive so it breaks through Focus modes
      interruptionLevel: urgent ? "time-sensitive" : "active",
      // Android: explicit channel + max priority on the notification object
      android: {
        channelId,
        sound,
        priority: urgent ? "max" : "high",
        sticky: false,
        vibrate: urgent ? [0, 250, 250, 250] : undefined,
      },
    }));
  if (messages.length === 0) return [];
  try {
    const res = await axios.post("https://exp.host/--/api/v2/push/send", messages, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      timeout: 8000,
    });
    // Log any per-message errors from Expo
    const results = Array.isArray(res.data?.data) ? res.data.data : [];
    results.forEach((r: any, i: number) => {
      if (r?.status === "error") {
        console.error(`[push] Token ${tokens[i]} error: ${r.message} (${r.details?.error})`);
      }
    });
    return results;
  } catch (e: any) {
    console.error("[push] Failed to send Expo push notification:", e.message);
    return [];
  }
}

async function notifyUserEvent(options: {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: object;
}) {
  await storage.createNotification({
    userId: options.userId,
    type: options.type,
    title: options.title,
    body: options.body,
    isRead: false,
  });

  const [user, chauffeur] = await Promise.all([
    storage.getUser(options.userId).catch(() => undefined),
    storage.getChauffeurByUserId(options.userId).catch(() => undefined),
  ]);
  const pushToken = user?.pushToken || chauffeur?.pushToken;
  if (pushToken) {
    await sendExpoPushNotification([pushToken], options.title, options.body, options.data);
  }
}

function generateAIResponse(type: string, description: string): string {
  const responses: Record<string, string[]> = {
    safety: [
      "We take your safety seriously. Your report has been logged and our safety team has been notified immediately. If you are in immediate danger, please call emergency services (10111). We will follow up within 24 hours.",
      "Thank you for reporting this safety concern. A safety specialist has been assigned to review your case. Please stay in a safe location. Emergency contacts have been alerted.",
    ],
    complaint: [
      "We apologize for the inconvenience. Your complaint has been recorded and will be reviewed by our quality assurance team within 24 hours. We strive to maintain the highest standards of service.",
      "Your feedback is important to us. This complaint has been escalated to our management team for immediate review. You may be eligible for a ride credit pending investigation.",
    ],
    emergency: [
      "EMERGENCY ALERT: Your report has been flagged as urgent. Our emergency response team has been notified. If you are in immediate danger, please call 10111 (police) or 10177 (ambulance). Your GPS location has been logged.",
      "This emergency has been escalated to the highest priority. Safety team and local authorities will be contacted. Please remain calm and stay connected. Your location is being tracked for your safety.",
    ],
  };

  const options = responses[type] || responses.complaint;
  void description;
  return options[Math.floor(Math.random() * options.length)];
}

function setAuthCookie(res: Response, token: string) {
  const isProd = process.env.NODE_ENV === "production";
  res.cookie("a2b_token", token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function getPaystackConfig() {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    throw new Error("PAYSTACK_SECRET_KEY is not configured");
  }
  const currency = process.env.PAYSTACK_CURRENCY || "ZAR";
  const callbackUrl = process.env.PAYSTACK_CALLBACK_URL;
  return { secret, currency, callbackUrl };
}

function encodeGoogleAuthState(data: Record<string, string>) {
  return Buffer.from(JSON.stringify(data)).toString("base64url");
}

function decodeGoogleAuthState(rawState?: string) {
  if (!rawState) return {} as Record<string, string>;
  try {
    const parsed = JSON.parse(Buffer.from(rawState, "base64url").toString("utf8"));
    return parsed && typeof parsed === "object" ? parsed as Record<string, string> : {};
  } catch {
    return {} as Record<string, string>;
  }
}

function isAllowedGoogleWebRedirect(rawUrl?: string) {
  if (!rawUrl) return false;

  try {
    const parsed = new URL(rawUrl);
    const exactAllowed = new Set([
      "https://a2blift.com",
      "https://www.a2blift.com",
      "https://peaceful-mousse-459c85.netlify.app",
      "https://api-production-0783.up.railway.app",
    ]);

    if (exactAllowed.has(parsed.origin)) return true;
    if (parsed.hostname.endsWith(".netlify.app")) return true;
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") return true;
    return false;
  } catch {
    return false;
  }
}

function buildGoogleWebRedirect(rawUrl: string, params: Record<string, string>) {
  const redirectUrl = new URL(rawUrl);
  const hashParams = new URLSearchParams(params);
  redirectUrl.hash = hashParams.toString();
  return redirectUrl.toString();
}

/**
 * Determines the base URL for Paystack callback redirects.
 * Checks env vars in priority order so it works on Replit dev AND Railway production.
 */
function getAppBaseUrl(req?: Request): string {
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  }
  if (process.env.PAYSTACK_CALLBACK_URL) {
    // Strip any path — we just want origin
    try {
      const u = new URL(process.env.PAYSTACK_CALLBACK_URL);
      return u.origin;
    } catch {
      return process.env.PAYSTACK_CALLBACK_URL;
    }
  }
  // Final fallback: derive from the incoming request
  if (req) {
    const proto = req.header("x-forwarded-proto") || req.protocol || "https";
    const host = req.header("x-forwarded-host") || req.get("host") || "";
    return `${proto}://${host}`;
  }
  return "https://api-production-0783.up.railway.app";
}

function getLivenessProvider(): "mock" | "smile_id" {
  const raw = (process.env.LIVENESS_PROVIDER || "mock").toLowerCase().trim();
  return raw === "smile_id" ? "smile_id" : "mock";
}

function buildChallengeCode(): string {
  const pool = ["BLINK", "TURN_LEFT", "TURN_RIGHT", "SMILE"];
  const first = pool[Math.floor(Math.random() * pool.length)];
  const second = pool[Math.floor(Math.random() * pool.length)];
  return `${first}-${second}`;
}

function challengeLabel(code: string): string {
  const labels: Record<string, string> = {
    BLINK: "Blink your eyes",
    TURN_LEFT: "Turn your face left",
    TURN_RIGHT: "Turn your face right",
    SMILE: "Give a clear smile",
  };
  return code
    .split("-")
    .map((part) => labels[part] || part)
    .join(" then ");
}

function isAllowedSelfieUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (!["https:"].includes(parsed.protocol)) return false;

    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    if (supabaseUrl) {
      const supabaseHost = new URL(supabaseUrl).host;
      if (parsed.host === supabaseHost) return true;
    }

    // Allow known Supabase storage domains when explicit env is missing.
    return parsed.host.endsWith("supabase.co");
  } catch {
    return false;
  }
}

function getImageDimensions(buffer: Buffer): { width: number; height: number } | null {
  // PNG
  if (
    buffer.length > 24 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }

  // JPEG (scan markers for SOF0/SOF2)
  if (buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset < buffer.length - 1) {
      if (buffer[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = buffer[offset + 1];
      if (marker === 0xc0 || marker === 0xc2) {
        if (offset + 8 >= buffer.length) return null;
        const height = buffer.readUInt16BE(offset + 5);
        const width = buffer.readUInt16BE(offset + 7);
        return { width, height };
      }
      if (marker === 0xda || marker === 0xd9) break;
      if (offset + 3 >= buffer.length) break;
      const segmentLength = buffer.readUInt16BE(offset + 2);
      if (segmentLength <= 0) break;
      offset += 2 + segmentLength;
    }
  }

  return null;
}

async function runMockSelfieQualityCheck(
  selfieUrl: string,
  faceData?: any,
  challenge?: string | null
): Promise<{ passed: boolean; score: number; reason?: string }> {
  // Only validation: selfie must be from our secure Supabase storage domain.
  // Drivers review the photo before accepting — they are the quality gate.
  if (!isAllowedSelfieUrl(selfieUrl)) {
    return { passed: false, score: 0.05, reason: "Selfie URL is not from a trusted storage domain." };
  }
  return { passed: true, score: 0.95 };
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  try {
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo text");
    await pool.query("ALTER TABLE chauffeurs ADD COLUMN IF NOT EXISTS vehicle_year integer");
  } catch (error) {
    console.warn("[routes] startup schema checks skipped:", error instanceof Error ? error.message : error);
  }

  const SUPABASE_SERVICE_KEY_CONFIGURED = !!(process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Attach optional auth to all API requests (doesn't break legacy endpoints)
  app.use("/api", authOptional);

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);

    // Driver registers their chauffeurId on connect so we can target them for nearby trips
    socket.on("chauffeur:register", (data: { chauffeurId: string }) => {
      if (data?.chauffeurId) {
        (socket.data as any).chauffeurId = data.chauffeurId;
      }
    });

    socket.on("chauffeur:location", async (data) => {
      const { chauffeurId, lat, lng } = data;
      if (chauffeurId) {
        // Store chauffeurId on socket for targeted ride dispatch
        (socket.data as any).chauffeurId = chauffeurId;
        await storage.updateChauffeur(chauffeurId, {
          lat,
          lng,
          locationUpdatedAt: new Date(),
        });
        io.emit("location:update", { chauffeurId, lat, lng });
      }
    });

    socket.on("ride:request", async (data) => {
      io.emit("ride:new", data);
    });

    // ride:accept and ride:status are intentionally NOT relayed from socket events.
    // All ride state changes must go through the authenticated REST endpoints
    // (PUT /api/rides/:id/accept and PUT /api/rides/:id/status) which enforce
    // ownership checks and emit the socket events server-side after validation.

    socket.on("chat:message", async (data) => {
      io.emit("chat:newMessage", data);
    });

    socket.on("disconnect", () => {
      console.log("Socket disconnected:", socket.id);
    });
  });

  // Health check for Railway / Render uptime monitoring
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      release: getReleaseFingerprint(),
    });
  });

  // Public config for the website (safe, non-secret values only)
  app.get("/api/config", (_req: Request, res: Response) => {
    res.json({
      paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY || "",
    });
  });

  // ─── Airport Transfer: save booking + notify admins ────────────────────
  app.post("/api/airport-transfers/book", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { airport, destination, date, time, flightNumber, passengers, phone } = req.body || {};
      if (!airport || !destination || !date || !time) {
        return res.status(400).json({ message: "Airport, destination, date, and time are required" });
      }
      const rider = await storage.getUser(req.auth!.sub);
      if (!rider) return res.status(404).json({ message: "User not found" });

      const riderName = rider.name || rider.username || "Passenger";
      const summary = `${airport} → ${destination} on ${date} at ${time}${flightNumber ? ` (Flight: ${flightNumber})` : ""}`;

      // Notify the rider
      await storage.createNotification({
        userId: rider.id,
        title: "Airport transfer requested",
        body: `Your transfer: ${summary}. Our team will confirm your chauffeur shortly.`,
        type: "airport_transfer",
      });

      // Notify all admins
      try {
        const allUsers = await storage.getAllUsers();
        const admins = (allUsers || []).filter((u: any) => u.role === "admin");
        for (const admin of admins) {
          await storage.createNotification({
            userId: admin.id,
            title: "New airport transfer booking",
            body: `${riderName}: ${summary}. Passengers: ${passengers || 1}. Phone: ${phone || "N/A"}`,
            type: "airport_transfer",
          });
          if (admin.pushToken) {
            sendExpoPushNotification(
              [admin.pushToken],
              "New airport transfer",
              `${riderName} booked: ${summary}`,
              { type: "airport_transfer", riderId: rider.id, airport, destination, date, time, phone: phone || "" },
              { urgent: true, channelId: "ride-alerts-v3" }
            );
          }
        }
      } catch(e) { /* non-fatal */ }

      return res.json({ success: true, message: "Transfer request received. You will be contacted to confirm." });
    } catch (error: any) {
      return res.status(500).json({ message: error.message || "Could not save airport transfer" });
    }
  });

  // ─── Airport Transfer: get rider's pending transfers ──────────────────
  app.get("/api/airport-transfers/my", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const notifications = await storage.getNotificationsByUser(req.auth!.sub);
      const transfers = notifications.filter((n: any) => n.type === "airport_transfer");
      return res.json(transfers);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  function getUserFirstName(user: { name?: string | null; username?: string | null } | null | undefined, fallback = "Rider"): string {
    const candidates = [user?.name, user?.username]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.trim());

    for (const candidate of candidates) {
      const normalized = candidate.includes("@") ? candidate.split("@")[0] : candidate;
      const first = normalized
        .replace(/[._-]+/g, " ")
        .split(/\s+/)
        .find(Boolean);

      if (!first) continue;

      const lowered = first.toLowerCase();
      if (["a2b", "client", "rider", "user", "oauth"].includes(lowered)) continue;

      return first.charAt(0).toUpperCase() + first.slice(1);
    }

    return fallback;
  }

  let clientRatingsReady: Promise<void> | null = null;
  function ensureClientRatingsTable() {
    if (!clientRatingsReady) {
      clientRatingsReady = (async () => {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS client_ratings (
            id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
            ride_id varchar NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
            client_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            chauffeur_id varchar NOT NULL REFERENCES chauffeurs(id) ON DELETE CASCADE,
            rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
            comment text,
            created_at timestamp DEFAULT now()
          )
        `);
        await pool.query(`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_client_ratings_ride_chauffeur_unique
          ON client_ratings (ride_id, chauffeur_id)
        `);
        await pool.query(`
          CREATE INDEX IF NOT EXISTS idx_client_ratings_client_id
          ON client_ratings (client_id)
        `);
      })().catch((error) => {
        clientRatingsReady = null;
        throw error;
      });
    }
    return clientRatingsReady;
  }

  function normalizeReferralCode(rawValue: unknown): string {
    return String(rawValue || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
  }

  async function generateUniqueReferralCode(name: string, email: string): Promise<string> {
    const seed = normalizeReferralCode(name || email || "A2B") || "A2B";
    const base = seed.slice(0, 6);

    for (let attempt = 0; attempt < 30; attempt++) {
      const suffix = Math.floor(1000 + Math.random() * 9000).toString();
      const candidate = `${base}${suffix}`;
      const existing = await storage.getUserByReferralCode(candidate);
      if (!existing) return candidate;
    }

    return `${base}${Date.now().toString().slice(-6)}`;
  }

  async function getUserRewardsBalance(userId: string): Promise<number> {
    try {
      const result = await pool.query(
        "SELECT COALESCE(rewards_balance, 0) AS rewards_balance FROM users WHERE id = $1 LIMIT 1",
        [userId],
      );
      return Number(result.rows?.[0]?.rewards_balance || 0);
    } catch {
      return 0;
    }
  }

  async function ensureUserReferralCode(user: any): Promise<string> {
    const existing = normalizeReferralCode(user?.referralCode || user?.referral_code);
    if (existing) return existing;

    const generated = await generateUniqueReferralCode(user?.name || "A2B", user?.username || "");
    try {
      await pool.query("UPDATE users SET referral_code = $1 WHERE id = $2", [generated, user.id]);
      return generated;
    } catch {
      return generated;
    }
  }

  async function hydrateAuthUser(user: any) {
    const { password: _pw, ...safeUser } = user;
    const referralCode = await ensureUserReferralCode(user);
    const rewardsBalance = Number(
      safeUser?.rewardsBalance ??
      safeUser?.rewards_balance ??
      (await getUserRewardsBalance(user.id)),
    );

    return {
      ...safeUser,
      referralCode,
      rewardsBalance,
    };
  }

  function normalizeEmail(value: unknown): string {
    return String(value || "").trim().toLowerCase();
  }

  function hashPasswordResetToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  function getPasswordResetBaseUrl(): string {
    return (
      process.env.A2B_WEB_URL ||
      process.env.PUBLIC_APP_URL ||
      process.env.EXPO_PUBLIC_REFERRAL_BASE_URL ||
      "https://a2blift.com"
    ).replace(/\/$/, "");
  }

  function buildPasswordResetEmail(options: {
    resetUrl: string;
    name?: string | null;
    expiresInMinutes: number;
  }) {
    const safeName = escapeHtml(options.name || "there");
    const safeUrl = escapeHtml(options.resetUrl);
    const subject = "Reset your A2B LIFT password";
    const text = [
      `Hello ${options.name || "there"},`,
      "",
      "We received a request to reset your A2B LIFT password.",
      `Open this secure link to create a new password: ${options.resetUrl}`,
      "",
      `This link expires in ${options.expiresInMinutes} minutes. If you did not request it, you can ignore this email.`,
      "",
      "A2B LIFT",
    ].join("\n");

    const html = `
      <!doctype html>
      <html>
        <body style="margin:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#111;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:28px 12px;">
            <tr>
              <td align="center">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border-radius:22px;overflow:hidden;border:1px solid #e5e7eb;">
                  <tr>
                    <td style="background:#050505;padding:30px 32px;color:#fff;">
                      <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#bdbdbd;font-weight:700;">A2B LIFT Account</div>
                      <h1 style="margin:12px 0 0;font-size:28px;line-height:1.15;">Reset your password</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:30px 32px;">
                      <p style="margin:0 0 16px;font-size:16px;line-height:1.65;">Hello ${safeName},</p>
                      <p style="margin:0 0 20px;font-size:16px;line-height:1.65;">We received a request to reset your A2B LIFT password. Use the secure button below to create a new one.</p>
                      <a href="${safeUrl}" style="display:inline-block;background:#050505;color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 22px;border-radius:999px;">Reset password</a>
                      <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#777;">This link expires in ${options.expiresInMinutes} minutes. If you did not request it, you can ignore this email.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;

    return { subject, html, text };
  }

  async function sendPasswordResetEmail(options: {
    to: string;
    name?: string | null;
    resetUrl: string;
    expiresInMinutes: number;
  }) {
    const apiKey = process.env.RESEND_API_KEY;
    const email = buildPasswordResetEmail(options);
    if (!apiKey) {
      if (process.env.NODE_ENV === "production") {
        console.warn("[Password reset] RESEND_API_KEY is not configured.");
      } else {
        console.warn(`[Password reset] RESEND_API_KEY is not configured. Reset link for ${options.to}: ${options.resetUrl}`);
      }
      return { emailStatus: "pending_configuration", emailError: "RESEND_API_KEY is not configured", resendId: null };
    }

    const from = process.env.RESEND_FROM_EMAIL || "A2B LIFT <support@a2blift.com>";
    try {
      const response = await axios.post(
        "https://api.resend.com/emails",
        {
          from,
          to: [options.to],
          subject: email.subject,
          html: email.html,
          text: email.text,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 12000,
        },
      );
      return { emailStatus: "sent", emailError: null, resendId: response.data?.id || null };
    } catch (error: any) {
      return {
        emailStatus: "failed",
        emailError: error?.response?.data?.message || error?.message || "Resend email failed",
        resendId: null,
      };
    }
  }

  // -----------------------------
  // Auth (JWT)
  // -----------------------------
  app.post("/api/auth/password-reset/request", async (req: Request, res: Response) => {
    const genericResponse = {
      ok: true,
      message: "If an A2B LIFT account exists for that email, a password reset link will be sent.",
    };

    try {
      const email = normalizeEmail(req.body?.email || req.body?.username);
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ message: "Please enter a valid email address." });
      }

      const user = await storage.getUserByUsername(email);
      if (!user) {
        return res.json(genericResponse);
      }

      const token = crypto.randomBytes(32).toString("base64url");
      const tokenHash = hashPasswordResetToken(token);
      const expiresInMinutes = 60;
      const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

      await pool.query(
        "UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL",
        [user.id],
      );
      await pool.query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [user.id, tokenHash, expiresAt],
      );

      const resetUrl = `${getPasswordResetBaseUrl()}/login.html?resetToken=${encodeURIComponent(token)}`;
      const emailResult = await sendPasswordResetEmail({
        to: email,
        name: user.name,
        resetUrl,
        expiresInMinutes,
      });

      if (emailResult.emailError) {
        console.warn("[Password reset] Email was not sent:", emailResult.emailError);
      }

      return res.json(genericResponse);
    } catch (error: any) {
      console.error("[Password reset] Request error:", error);
      return res.status(500).json({ message: "Unable to process password reset right now. Please try again." });
    }
  });

  app.post("/api/auth/password-reset/confirm", async (req: Request, res: Response) => {
    try {
      const token = String(req.body?.token || "").trim();
      const password = String(req.body?.password || "");
      if (!token) {
        return res.status(400).json({ message: "Reset token is required." });
      }
      if (password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters." });
      }

      const tokenHash = hashPasswordResetToken(token);
      const tokenResult = await pool.query(
        `
          SELECT id, user_id
          FROM password_reset_tokens
          WHERE token_hash = $1
            AND used_at IS NULL
            AND expires_at > now()
          LIMIT 1
        `,
        [tokenHash],
      );

      const reset = tokenResult.rows?.[0];
      if (!reset) {
        return res.status(400).json({ message: "This reset link is invalid or has expired." });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      await pool.query("UPDATE users SET password = $1 WHERE id = $2", [hashedPassword, reset.user_id]);
      await pool.query("UPDATE password_reset_tokens SET used_at = now() WHERE id = $1", [reset.id]);
      await pool.query(
        "UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL",
        [reset.user_id],
      );

      return res.json({ ok: true, message: "Password updated. You can now log in with your new password." });
    } catch (error: any) {
      console.error("[Password reset] Confirm error:", error);
      return res.status(500).json({ message: "Unable to reset password right now. Please try again." });
    }
  });

  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const { username, password, name, phone, role, referralCode } = req.body;
      const normalizedPhone = typeof phone === "string" ? phone.trim() : "";

      if (!username || !password || !name) {
        return res.status(400).json({ message: "Email, password, name, and phone number are required" });
      }
      if (!normalizedPhone) {
        return res.status(400).json({ message: "Phone number is required" });
      }

      // Normalise email — username field now stores email address
      const email = username.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ message: "Please enter a valid email address" });
      }

      // Email must be unique
      const existing = await storage.getUserByUsername(email);
      if (existing) {
        return res.status(400).json({ message: "An account with this email already exists" });
      }

      // Resolve referral code → referrer
      let referrerUser: Awaited<ReturnType<typeof storage.getUser>> | undefined;
      const normalizedReferralCode = referralCode?.trim().toUpperCase();
      if (normalizedReferralCode) {
        referrerUser = await storage.getUserByReferralCode(normalizedReferralCode);
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await storage.createUser({
        username: email,
        password: hashedPassword,
        name: name.trim(),
        phone: normalizedPhone,
        role: (role || "client") as UserRole,
        ...(referrerUser ? { referredByUserId: referrerUser.id } : {}),
      });

      // Create referral event so commission tracking can fire later
      if (referrerUser) {
        try {
          await storage.createReferralEvent({
            referrerUserId: referrerUser.id,
            referredUserId: user.id,
            referralCodeUsed: normalizedReferralCode,
            status: "registered",
          });
        } catch (refErr: any) {
          // Non-fatal — unique constraint fires if somehow duplicate
          console.warn("createReferralEvent non-fatal:", refErr.message);
        }
      }

      const token = signAccessToken({ sub: user.id, role: user.role as UserRole, email: user.username, name: user.name });
      setAuthCookie(res, token);
      const safeUser = await hydrateAuthUser(user);
      return res.json({ user: safeUser, accessToken: token });
    } catch (error: any) {
      if (error.code === "23505") {
        return res.status(400).json({ message: "An account with this email already exists" });
      }
      if (error.code === "42P01") {
        return res.status(500).json({ message: "Database table not found. Please run: npm run db:push" });
      }
      return res.status(500).json({ message: error.message || "Registration failed. Please try again." });
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;
      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      const token = signAccessToken({ sub: user.id, role: user.role as UserRole, email: user.username, name: user.name });
      setAuthCookie(res, token);
      const safeUser = await hydrateAuthUser(user);
      return res.json({ user: safeUser, accessToken: token });
    } catch (error: any) {
      const message = String(error?.message || "");
      if (
        error?.code === "28P01" ||
        message.includes("password authentication failed") ||
        message.includes("ENETUNREACH") ||
        message.includes("ECONNREFUSED") ||
        message.includes("timeout")
      ) {
        console.error("[auth/login] database connection/authentication failed:", message);
        return res.status(503).json({
          message: "Authentication service is temporarily unavailable. Please try again shortly.",
        });
      }
      return res.status(500).json({ message: "Login failed. Please try again shortly." });
    }
  });

  app.post("/api/auth/logout", async (_req: Request, res: Response) => {
    res.clearCookie("a2b_token", { path: "/" });
    return res.json({ ok: true });
  });

  app.get("/api/auth/me", requireAuth, async (req: AuthedRequest, res: Response) => {
    const user = await storage.getUser(req.auth!.sub);
    if (!user) return res.status(404).json({ message: "User not found" });
    const safeUser = await hydrateAuthUser(user);
    return res.json(safeUser);
  });

  app.delete("/api/auth/me", requireAuth, async (req: AuthedRequest, res: Response) => {
    const userId = req.auth!.sub;
    const client = await pool.connect();

    const maybeQuery = async (query: string, params: unknown[] = []) => {
      try {
        return await client.query(query, params);
      } catch (error: any) {
        if (error?.code === "42P01" || error?.code === "42703") return null;
        throw error;
      }
    };

    try {
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      const chauffeurRows = await pool.query("SELECT id FROM chauffeurs WHERE user_id = $1", [userId]);
      const chauffeurIds = chauffeurRows.rows.map((row) => row.id).filter(Boolean);
      const activeRideStatuses = ["requested", "accepted", "arrived", "in_progress", "en_route"];
      const activeRideCheck = await pool.query(
        `
          SELECT id
          FROM rides
          WHERE (client_id = $1 OR chauffeur_id = ANY($2::varchar[]))
            AND status = ANY($3::text[])
          LIMIT 1
        `,
        [userId, chauffeurIds, activeRideStatuses],
      );

      if (activeRideCheck.rowCount && activeRideCheck.rowCount > 0) {
        return res.status(409).json({ message: "Please complete or cancel any active trip before deleting your account." });
      }

      const deletedEmail = `deleted-${userId}@deleted.a2b.local`;
      const deletedPassword = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);

      await client.query("BEGIN");
      await maybeQuery("DELETE FROM notifications WHERE user_id = $1", [userId]);
      await maybeQuery("DELETE FROM saved_cards WHERE user_id = $1", [userId]);
      await maybeQuery("DELETE FROM wallet_transactions WHERE user_id = $1", [userId]);
      await maybeQuery("DELETE FROM messages WHERE sender_id = $1", [userId]);
      await maybeQuery("DELETE FROM safety_reports WHERE user_id = $1", [userId]);
      await maybeQuery("DELETE FROM trip_enquiries WHERE user_id = $1", [userId]);
      await maybeQuery("DELETE FROM liveness_sessions WHERE user_id = $1", [userId]);
      await maybeQuery("DELETE FROM documents WHERE user_id = $1", [userId]);
      await maybeQuery("DELETE FROM lift_club_bookings WHERE rider_id = $1", [userId]);

      await maybeQuery(
        `
          DELETE FROM lift_club_bookings
          WHERE route_id IN (
            SELECT id FROM lift_club_routes WHERE chauffeur_id = ANY($1::varchar[])
          )
        `,
        [chauffeurIds],
      );
      await maybeQuery("DELETE FROM lift_club_routes WHERE chauffeur_id = ANY($1::varchar[])", [chauffeurIds]);

      await maybeQuery("UPDATE payments SET paystack_auth_code = NULL WHERE payer_user_id = $1", [userId]);
      await maybeQuery(
        `
          UPDATE reward_transactions
          SET source_user_id = NULL
          WHERE source_user_id = $1
        `,
        [userId],
      );
      await maybeQuery(
        `
          UPDATE reward_transactions
          SET referral_event_id = NULL
          WHERE referral_event_id IN (
            SELECT id
            FROM referral_events
            WHERE referrer_user_id = $1 OR referred_user_id = $1
          )
        `,
        [userId],
      );
      await maybeQuery("DELETE FROM reward_transactions WHERE user_id = $1", [userId]);
      await maybeQuery("DELETE FROM reward_cashouts WHERE user_id = $1 OR reviewed_by_admin_id = $1", [userId]);
      await maybeQuery("DELETE FROM referral_events WHERE referrer_user_id = $1 OR referred_user_id = $1", [userId]);

      await maybeQuery(
        `
          UPDATE driver_applications
          SET status = 'withdrawn',
              notes = 'Applicant deleted their account.',
              reviewed_at = NOW(),
              reviewer_admin_id = NULL
          WHERE user_id = $1
        `,
        [userId],
      );
      await maybeQuery(
        `
          UPDATE chauffeurs
          SET is_online = false,
              is_approved = false,
              available_for_long_distance = false,
              long_distance_from = NULL,
              long_distance_to = NULL,
              long_distance_date = NULL,
              long_distance_price_per_seat = NULL,
              long_distance_seats_available = 0,
              phone = NULL,
              profile_photo = NULL,
              push_token = NULL,
              lat = NULL,
              lng = NULL,
              location_updated_at = NULL,
              car_make = 'Deleted',
              vehicle_model = 'Deleted',
              plate_number = 'Deleted',
              vehicle_type = 'Deleted',
              car_color = 'Deleted'
          WHERE user_id = $1
        `,
        [userId],
      );
      await maybeQuery(
        `
          UPDATE users
          SET username = $2,
              password = $3,
              name = 'Deleted Account',
              phone = NULL,
              profile_photo = NULL,
              push_token = NULL,
              referral_code = NULL,
              referred_by_user_id = NULL,
              rewards_balance = 0,
              wallet_balance = 0
          WHERE id = $1
        `,
        [userId, deletedEmail, deletedPassword],
      );

      await client.query("COMMIT");
      res.clearCookie("a2b_token", { path: "/" });
      return res.json({ ok: true, message: "Account deleted" });
    } catch (error: any) {
      try {
        await client.query("ROLLBACK");
      } catch {}
      return res.status(500).json({ message: error.message || "Account deletion failed" });
    } finally {
      client.release();
    }
  });

  app.get("/api/referrals/me", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const user = await storage.getUser(req.auth!.sub);
      if (!user) return res.status(404).json({ message: "User not found" });

      const hydratedUser = await hydrateAuthUser(user);
      const [referralEvents, transactions, cashouts] = await Promise.all([
        storage.getReferralEventsByReferrerUserId(user.id),
        storage.getRewardTransactions(user.id),
        storage.getRewardCashoutsByUser(user.id),
      ]);

      const referredUserIds = (referralEvents || [])
        .map((event) => event.referredUserId)
        .filter(Boolean) as string[];

      const referredUsersMap = new Map<string, { id: string; name: string | null }>();
      if (referredUserIds.length > 0) {
        try {
          const result = await pool.query(
            "SELECT id, name FROM users WHERE id = ANY($1)",
            [referredUserIds],
          );
          for (const row of result.rows) {
            referredUsersMap.set(row.id, row);
          }
        } catch {}
      }

      const referredPeople = (referralEvents || []).map((event) => {
        const referredUser = event?.referredUserId ? referredUsersMap.get(event.referredUserId) : null;
        return {
          id: event.id,
          name: referredUser?.name || "A2B User",
          joinedAt: event.createdAt,
          firstRewardAt: event.firstRewardAt || null,
          lastRewardAt: event.lastRewardAt || null,
          rewardedAt: event.status === "rewarded" ? (event.lastRewardAt || event.firstRewardAt || event.updatedAt || event.createdAt) : null,
          totalRewards: Number(event.totalRewards || 0),
          status: event.status || "registered",
        };
      });

      const totalRewardsEarned = (transactions || [])
        .filter((tx) => Number(tx.amount || 0) > 0 && tx.status !== "failed")
        .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

      const pendingCashoutAmount = (cashouts || [])
        .filter((cashout) => ["pending", "processing"].includes(String(cashout.status || "").toLowerCase()))
        .reduce((sum, cashout) => sum + Number(cashout.amount || 0), 0);

      const rewardedReferrals = (referralEvents || []).filter(
        (event) => Number(event.totalRewards || 0) > 0 || event.status === "rewarded",
      ).length;

      const configuredReferralBase =
        process.env.EXPO_PUBLIC_REFERRAL_LINK_BASE_URL ||
        process.env.EXPO_PUBLIC_REFERRAL_BASE_URL ||
        process.env.A2B_PUBLIC_SITE_URL ||
        process.env.PUBLIC_SITE_URL ||
        "https://a2blift.com";
      const referralBase = String(configuredReferralBase)
        .replace(/\/$/, "")
        .replace(/^https:\/\/api\.a2blift\.com$/i, "https://a2blift.com");
      const rewardApp = hydratedUser.role === "chauffeur" ? "driver" : "client";

      return res.json({
        referralCode: hydratedUser.referralCode,
        shareUrl: `${referralBase}/r/${encodeURIComponent(hydratedUser.referralCode)}?app=${encodeURIComponent(rewardApp)}`,
        rewardsBalance: Number(hydratedUser.rewardsBalance || 0),
        referredCount: referralEvents.length,
        rewardedReferrals,
        totalRewardsEarned,
        pendingCashoutAmount,
        referredPeople,
        transactions,
        cashouts,
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message || "Failed to load referral dashboard" });
    }
  });

  app.get("/api/rewards/transactions", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const rows = await storage.getRewardTransactions(req.auth!.sub);
      return res.json(rows || []);
    } catch (error: any) {
      return res.status(500).json({ message: error.message || "Failed to load reward transactions" });
    }
  });

  app.get("/api/rewards/cashouts", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const rows = await storage.getRewardCashoutsByUser(req.auth!.sub);
      return res.json(rows || []);
    } catch (error: any) {
      return res.status(500).json({ message: error.message || "Failed to load reward cashouts" });
    }
  });

  app.post("/api/rewards/cashout", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const amount = Number(req.body?.amount || 0);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ message: "Invalid amount" });
      }

      if (amount < 100) {
        return res.status(400).json({ message: "Minimum cash-out amount is R 100.00" });
      }

      const balance = await getUserRewardsBalance(req.auth!.sub);
      if (amount > balance) {
        return res.status(400).json({ message: "Requested amount exceeds available rewards balance" });
      }

      const created = await storage.createRewardCashout({
        userId: req.auth!.sub,
        amount,
        bankName: req.body?.bankName || null,
        accountHolder: req.body?.accountHolder || null,
        accountNumber: req.body?.accountNumber || null,
        status: "pending",
      });

      return res.status(201).json(created);
    } catch (error: any) {
      return res.status(500).json({ message: error.message || "Failed to submit cash-out request" });
    }
  });

  // -----------------------------
  // Maps helpers — Google Places API only
  // -----------------------------

  const GOOGLE_KEY =
    process.env.GOOGLE_PLACES_API_KEY ||
    process.env.GOOGLE_MAPS_SERVER_API_KEY ||
    process.env.GOOGLE_MAPS_WEB_SERVICE_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    "";
  const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";
  const PHOTON_BASE_URL = "https://photon.komoot.io/api";
  const MAPS_USER_AGENT = "A2B-LIFT/1.0 (support@a2blift.app)";
  const GOOGLE_AUTOCOMPLETE_FIELD_MASK = [
    "suggestions.placePrediction.placeId",
    "suggestions.placePrediction.text.text",
    "suggestions.placePrediction.structuredFormat.mainText.text",
    "suggestions.placePrediction.structuredFormat.secondaryText.text",
    "suggestions.placePrediction.types",
    "suggestions.queryPrediction.text.text",
  ].join(",");
  const GOOGLE_PLACE_DETAILS_FIELD_MASK = [
    "id",
    "displayName.text",
    "formattedAddress",
    "location.latitude",
    "location.longitude",
  ].join(",");
  const DIRECTIONS_CACHE_TTL_MS = 5 * 60 * 1000;
  const DIRECTIONS_CACHE_MAX_ENTRIES = 250;
  const directionsCache = new Map<string, { expiresAt: number; payload: any }>();
  const SA_DEFAULT_BIAS = { lat: -25.7479, lng: 28.2293 }; // Pretoria/Gauteng, where most street-level ambiguity is costly.
  const SOUTH_AFRICAN_CITY_SUGGESTIONS = [
    ["Pretoria", "Gauteng", -25.7479, 28.2293],
    ["Johannesburg", "Gauteng", -26.2041, 28.0473],
    ["Sandton", "Gauteng", -26.1076, 28.0567],
    ["Midrand", "Gauteng", -25.9992, 28.1263],
    ["Centurion", "Gauteng", -25.8640, 28.1881],
    ["Soweto", "Gauteng", -26.2485, 27.8540],
    ["Benoni", "Gauteng", -26.1885, 28.3208],
    ["Boksburg", "Gauteng", -26.2326, 28.2400],
    ["Kempton Park", "Gauteng", -26.1000, 28.2333],
    ["Roodepoort", "Gauteng", -26.1625, 27.8725],
    ["Vereeniging", "Gauteng", -26.6731, 27.9261],
    ["Cape Town", "Western Cape", -33.9249, 18.4241],
    ["Stellenbosch", "Western Cape", -33.9321, 18.8602],
    ["Paarl", "Western Cape", -33.7342, 18.9621],
    ["George", "Western Cape", -33.9648, 22.4617],
    ["Durban", "KwaZulu-Natal", -29.8587, 31.0218],
    ["Pietermaritzburg", "KwaZulu-Natal", -29.6006, 30.3794],
    ["Richards Bay", "KwaZulu-Natal", -28.7807, 32.0383],
    ["Newcastle", "KwaZulu-Natal", -27.7570, 29.9318],
    ["Bloemfontein", "Free State", -29.0852, 26.1596],
    ["Welkom", "Free State", -27.9777, 26.7351],
    ["Gqeberha", "Eastern Cape", -33.9608, 25.6022],
    ["Port Elizabeth", "Eastern Cape", -33.9608, 25.6022],
    ["East London", "Eastern Cape", -33.0192, 27.8999],
    ["Mthatha", "Eastern Cape", -31.5889, 28.7844],
    ["Polokwane", "Limpopo", -23.9045, 29.4689],
    ["Tzaneen", "Limpopo", -23.8332, 30.1635],
    ["Thohoyandou", "Limpopo", -22.9456, 30.4849],
    ["Mbombela", "Mpumalanga", -25.4753, 30.9694],
    ["Nelspruit", "Mpumalanga", -25.4753, 30.9694],
    ["Witbank", "Mpumalanga", -25.8770, 29.2010],
    ["Emalahleni", "Mpumalanga", -25.8770, 29.2010],
    ["Rustenburg", "North West", -25.6676, 27.2421],
    ["Mahikeng", "North West", -25.8652, 25.6442],
    ["Klerksdorp", "North West", -26.8521, 26.6667],
    ["Kimberley", "Northern Cape", -28.7282, 24.7499],
    ["Upington", "Northern Cape", -28.4478, 21.2561],
  ] as const;

  async function fetchMapsJson(url: string) {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Accept-Language": "en-ZA,en;q=0.9",
        "User-Agent": MAPS_USER_AGENT,
      },
    });
    const rawBody = await response.text();
    if (!rawBody) return null;

    try {
      return JSON.parse(rawBody) as any;
    } catch {
      const provider = (() => {
        try {
          return new URL(url).hostname;
        } catch {
          return "maps-provider";
        }
      })();
      const preview = rawBody.replace(/\s+/g, " ").trim().slice(0, 80);
      throw new Error(`Invalid JSON from ${provider}: ${preview}`);
    }
  }

  async function fetchMapsJsonSafely(url: string) {
    try {
      return await fetchMapsJson(url);
    } catch (error) {
      console.warn(
        "[maps] Upstream maps response was not valid JSON:",
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }
  }

  async function fetchMapsJsonPost(url: string, body: unknown, headers: Record<string, string>) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Language": "en-ZA,en;q=0.9",
        "Content-Type": "application/json",
        "User-Agent": MAPS_USER_AGENT,
        ...headers,
      },
      body: JSON.stringify(body),
    });
    const rawBody = await response.text();
    if (!rawBody) return null;

    try {
      return JSON.parse(rawBody) as any;
    } catch {
      const provider = (() => {
        try {
          return new URL(url).hostname;
        } catch {
          return "maps-provider";
        }
      })();
      const preview = rawBody.replace(/\s+/g, " ").trim().slice(0, 80);
      throw new Error(`Invalid JSON from ${provider}: ${preview}`);
    }
  }

  async function fetchMapsJsonPostSafely(url: string, body: unknown, headers: Record<string, string>) {
    try {
      return await fetchMapsJsonPost(url, body, headers);
    } catch (error) {
      console.warn(
        "[maps] Upstream maps response was not valid JSON:",
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }
  }

  function normalizeCoordinate(raw: string | number) {
    const value = Number(raw);
    if (!Number.isFinite(value)) return null;
    return Number(value.toFixed(4));
  }

  function buildDirectionsCacheKey(originLat: string, originLng: string, destLat: string, destLng: string) {
    const normalized = [originLat, originLng, destLat, destLng].map(normalizeCoordinate);
    if (normalized.some((value) => value == null)) return null;
    return normalized.join(":");
  }

  function getDirectionsCacheEntry(cacheKey: string) {
    const cached = directionsCache.get(cacheKey);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
      directionsCache.delete(cacheKey);
      return null;
    }
    return cached.payload;
  }

  function setDirectionsCacheEntry(cacheKey: string, payload: any) {
    directionsCache.set(cacheKey, {
      expiresAt: Date.now() + DIRECTIONS_CACHE_TTL_MS,
      payload,
    });

    if (directionsCache.size <= DIRECTIONS_CACHE_MAX_ENTRIES) return;

    for (const [key, entry] of directionsCache) {
      if (entry.expiresAt <= Date.now()) {
        directionsCache.delete(key);
      }
    }

    while (directionsCache.size > DIRECTIONS_CACHE_MAX_ENTRIES) {
      const oldestKey = directionsCache.keys().next().value;
      if (!oldestKey) break;
      directionsCache.delete(oldestKey);
    }
  }

  function sanitizeAddressAutocompleteParts(parts: unknown[]) {
    return parts.reduce<string[]>((cleaned, part) => {
      if (typeof part !== "string") return cleaned;

      const trimmedPart = part.trim();
      if (!trimmedPart) return cleaned;
      if (/\b(ward\b|municipality|district municipality|administrative area)\b/i.test(trimmedPart)) {
        return cleaned;
      }
      if (cleaned.includes(trimmedPart)) return cleaned;

      cleaned.push(trimmedPart);
      return cleaned;
    }, []);
  }

  function formatNominatimAddress(address: any, fallbackDisplayName?: string) {
    const primary = [address?.house_number, address?.road].filter(Boolean).join(" ").trim();
    const locality = sanitizeAddressAutocompleteParts([
      address?.suburb,
      address?.city || address?.town || address?.village,
      address?.state,
    ])
      .join(", ")
      .trim();
    const description = [primary, locality].filter(Boolean).join(", ") || fallbackDisplayName || "";

    return {
      description,
      mainText: primary || fallbackDisplayName?.split(",")[0] || "Pinned location",
      secondaryText: locality || fallbackDisplayName?.split(",").slice(1).join(", ").trim() || "South Africa",
    };
  }

  function isCityLikeNominatimResult(result: any) {
    const type = String(result?.type || result?.addresstype || "").toLowerCase();
    const className = String(result?.class || "").toLowerCase();
    const cityTypes = ["city", "town", "village", "municipality", "hamlet", "suburb"];
    return cityTypes.includes(type) || (className === "place" && cityTypes.includes(type));
  }

  function isValidCoordinate(value: unknown) {
    const n = Number(value);
    return Number.isFinite(n);
  }

  const ADDRESS_TERM_NORMALIZATIONS: Array<[RegExp, string]> = [
    [/\bpretoriou+s\b/gi, "Pretorius"],
    [/\bpretorious\b/gi, "Pretorius"],
    [/\bpretoriaus\b/gi, "Pretorius"],
    [/\bst\.?\b/gi, "Street"],
    [/\bave\.?\b/gi, "Avenue"],
    [/\brd\.?\b/gi, "Road"],
    [/\bdr\.?\b/gi, "Drive"],
    [/\bln\.?\b/gi, "Lane"],
    [/\bcl\.?\b/gi, "Close"],
    [/\bblvd\.?\b/gi, "Boulevard"],
    [/\bcres\.?\b/gi, "Crescent"],
  ];
  const NON_DISTINCT_ADDRESS_TOKENS = new Set([
    "south",
    "africa",
    "street",
    "avenue",
    "road",
    "drive",
    "lane",
    "close",
    "boulevard",
    "crescent",
    "city",
    "town",
  ]);
  const ADDRESS_SEARCH_TYPE_HINTS = ["Street", "Avenue", "Road", "Drive", "Lane", "Close"] as const;
  const ADDRESS_AUTOCOMPLETE_RESULT_LIMIT = 10;

  type AddressAutocompletePrediction = {
    placeId: string;
    description: string;
    mainText: string;
    secondaryText: string;
    lat: number | null;
    lng: number | null;
  };

  function normalizeMapsQuery(value: string) {
    return ADDRESS_TERM_NORMALIZATIONS.reduce(
      (normalized, [pattern, replacement]) => normalized.replace(pattern, replacement),
      value.trim(),
    ).replace(/\s+/g, " ");
  }

  function extractAddressTokens(value: string, minimumLength = 3) {
    return normalizeMapsQuery(value)
      .toLowerCase()
      .match(new RegExp(`[a-z]{${minimumLength},}`, "g"))?.filter((token) => !NON_DISTINCT_ADDRESS_TOKENS.has(token)) || [];
  }

  function getLeadingAddressNumber(value: string) {
    return normalizeMapsQuery(value).match(/^\d+\b/)?.[0] || "";
  }

  function stripLeadingAddressNumber(value: string) {
    return normalizeMapsQuery(value).replace(/^\d+\s+/, "").trim();
  }

  function getPredictionPrimaryLine(prediction: Pick<AddressAutocompletePrediction, "mainText" | "description">) {
    const mainText = normalizeMapsQuery(prediction.mainText || "");
    const descriptionPrimary = normalizeMapsQuery(prediction.description.split(",")[0] || "");
    return getLeadingAddressNumber(mainText) ? mainText : descriptionPrimary || mainText;
  }

  function hasMismatchedPrimaryAddressNumber(
    prediction: Pick<AddressAutocompletePrediction, "mainText" | "description">,
    expectedNumber: string,
  ) {
    if (!expectedNumber) return false;

    const primaryNumber = getLeadingAddressNumber(getPredictionPrimaryLine(prediction));
    return Boolean(primaryNumber && primaryNumber !== expectedNumber);
  }

  function hasStackedPrimaryAddressNumbers(prediction: Pick<AddressAutocompletePrediction, "mainText" | "description">) {
    return /^\d+\s+\d+\b/.test(getPredictionPrimaryLine(prediction));
  }

  function predictionMatchesAddressPrefixes(
    prediction: Pick<AddressAutocompletePrediction, "mainText" | "description">,
    prefixes: string[],
  ) {
    if (prefixes.length === 0) return true;

    const primaryWords = normalizeMapsQuery(
      `${prediction.mainText} ${prediction.description.split(",")[0] || ""}`,
    ).toLowerCase().match(/[a-z]{1,}/g) || [];

    return prefixes.every((prefix) => primaryWords.some((word) => word.startsWith(prefix)));
  }

  function chooseBestReverseGeocodeResult(results: any[]) {
    return [...results].sort((left, right) => {
      const score = (result: any) => {
        const types = Array.isArray(result?.types) ? result.types : [];
        const components = Array.isArray(result?.address_components) ? result.address_components : [];
        const formattedAddress = normalizeMapsQuery(result?.formatted_address || "").toLowerCase();
        const hasType = (type: string) => types.includes(type);
        const hasComponent = (type: string) => components.some((component: any) => component?.types?.includes(type) && component?.long_name);
        const hasSuburbLikeComponent = hasComponent("sublocality_level_1") || hasComponent("sublocality") || hasComponent("neighborhood");
        const hasCityLikeComponent = hasComponent("locality") || hasComponent("administrative_area_level_2");
        let total = 0;

        if (hasType("street_address")) total += 160;
        if (hasType("premise")) total += 90;
        if (hasType("establishment") || hasType("point_of_interest")) total += 70;
        if (hasType("subpremise")) total += 70;
        if (hasType("route")) total += 60;
        if (hasComponent("street_number")) total += 55;
        if (hasComponent("route")) total += 45;
        if (hasSuburbLikeComponent) total += 28;
        if (hasCityLikeComponent) total += 18;
        if (hasType("plus_code")) total -= 40;
        if (hasType("political")) total -= 25;
        if (/\bward\b/.test(formattedAddress)) total -= 160;
        if (/\b(municipality|district municipality|administrative area|province)\b/.test(formattedAddress)) total -= 60;
        if (!hasComponent("street_number") && !hasComponent("route") && !hasSuburbLikeComponent && !hasCityLikeComponent) {
          total -= 35;
        }

        return total;
      };

      return score(right) - score(left);
    })[0];
  }

  function rankAddressAutocompletePredictions(
    input: string,
    predictions: AddressAutocompletePrediction[],
    lat?: number | null,
    lng?: number | null,
  ) {
    return [...predictions].sort(
      (left, right) => scoreMapsPrediction(right, input, lat, lng) - scoreMapsPrediction(left, input, lat, lng),
    );
  }

  function hasLocalityHint(query: string) {
    return SOUTH_AFRICAN_CITY_SUGGESTIONS.some(([city]) =>
      new RegExp(`\\b${city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(query)
    );
  }

  function buildAddressSearchQueries(input: string, lat?: number | null, lng?: number | null) {
    const normalized = normalizeMapsQuery(input);
    const queries = new Set<string>();
    queries.add(normalized);

    const lower = normalized.toLowerCase();
    const startsWithNumber = /^\d+\s+/.test(lower);
    const bias = lat != null && lng != null ? { lat, lng } : SA_DEFAULT_BIAS;
    const nearPretoria = calculateHaversineDistanceKm(bias.lat, bias.lng, -25.7479, 28.2293) < 130;
    const looksPretoriaSpecific = /\bpretorius\b/i.test(normalized) || nearPretoria;

    if (!hasLocalityHint(normalized)) {
      if (looksPretoriaSpecific) {
        queries.add(`${normalized}, Pretoria, Gauteng`);
        if (!startsWithNumber) {
          queries.add(`${normalized}, Arcadia, Pretoria`);
          queries.add(`${normalized}, Pretoria Central`);
        }
      }
      queries.add(`${normalized}, South Africa`);
    }

    if (lower !== input.toLowerCase()) {
      queries.add(`${normalized}, South Africa`);
    }

    return Array.from(queries);
  }

  function buildExpandedAddressFallbackQueries(input: string) {
    const normalized = normalizeMapsQuery(input);
    const queries = new Set<string>();
    const hasStreetType = /\b(street|avenue|road|drive|lane|close|boulevard|crescent)\b/i.test(normalized);
    const numberOnlyMatch = normalized.match(/^(\d+)$/);

    if (numberOnlyMatch) {
      for (const suffix of ADDRESS_SEARCH_TYPE_HINTS) {
        queries.add(`${numberOnlyMatch[1]} ${suffix}`);
      }
      return Array.from(queries);
    }

    const shortStemMatch = normalized.match(/^(\d+)\s+([a-z]{3,5})$/i);
    if (shortStemMatch && !hasStreetType) {
      const [, leadingNumber, streetStem] = shortStemMatch;
      for (const suffix of ADDRESS_SEARCH_TYPE_HINTS) {
        queries.add(`${leadingNumber} ${streetStem} ${suffix}`);
      }
    }

    return Array.from(queries);
  }

  function scoreMapsPrediction(
    prediction: AddressAutocompletePrediction,
    input: string,
    lat?: number | null,
    lng?: number | null,
  ) {
    const normalizedInput = normalizeMapsQuery(input).toLowerCase();
    const haystack = normalizeMapsQuery(`${prediction.description} ${prediction.mainText} ${prediction.secondaryText}`).toLowerCase();
    const mainText = normalizeMapsQuery(prediction.mainText).toLowerCase();
    const leadingNumber = normalizedInput.match(/^\d+/)?.[0] || "";
    const significantTokens = extractAddressTokens(normalizedInput);
    let score = 0;

    if (haystack.startsWith(normalizedInput)) score += 80;
    if (mainText.startsWith(normalizedInput)) score += 90;
    if (haystack.includes(normalizedInput)) score += 45;
    if (haystack.includes("south africa")) score += 8;
    if (haystack.includes("gauteng")) score += 8;
    if (haystack.includes("pretoria")) score += 18;
    if (normalizedInput.includes("pretorius") && haystack.includes("pretorius")) score += 30;
    if (/\bward\b/.test(haystack)) score -= 45;
    if (/\b(municipality|district municipality|administrative area)\b/.test(haystack)) score -= 35;
    if (leadingNumber && new RegExp(`(^|\\D)${leadingNumber}(\\D|$)`).test(haystack)) score += 25;
    if (leadingNumber && !new RegExp(`(^|\\D)${leadingNumber}(\\D|$)`).test(haystack)) score -= 30;

    for (const token of significantTokens) {
      if (new RegExp(`\\b${token}\\b`).test(haystack)) {
        score += 12;
      } else if (haystack.includes(token)) {
        score += 5;
      } else {
        score -= 10;
      }
    }

    if (prediction.lat != null && prediction.lng != null) {
      const bias = lat != null && lng != null ? { lat, lng } : SA_DEFAULT_BIAS;
      const distanceKm = calculateHaversineDistanceKm(bias.lat, bias.lng, prediction.lat, prediction.lng);
      score += Math.max(0, 35 - distanceKm / 4);
    }
    if (haystack.includes("cape town") && normalizedInput.includes("pretorius")) score -= 12;
    if (haystack.includes("buffalo city")) score -= 20;

    return score;
  }

  function filterAddressAutocompletePredictions(
    input: string,
    predictions: AddressAutocompletePrediction[],
    lat?: number | null,
    lng?: number | null,
  ) {
    const normalizedInput = normalizeMapsQuery(input).toLowerCase();
    const rankedPredictions = rankAddressAutocompletePredictions(input, predictions, lat, lng);
    const leadingNumber = normalizedInput.match(/^\d+/)?.[0] || "";
    const significantTokens = extractAddressTokens(normalizedInput);
    const startsWithNumber = /^\d+\s+/.test(normalizedInput);
    if (significantTokens.length === 0 && !leadingNumber) return rankedPredictions;

    const minimumTokenMatches = significantTokens.length > 1 ? Math.min(significantTokens.length, 2) : significantTokens.length;

    const filteredPredictions = rankedPredictions.filter((prediction) => {
      const haystack = normalizeMapsQuery(`${prediction.description} ${prediction.mainText} ${prediction.secondaryText}`).toLowerCase();
      if (/\b(ward|municipality|district municipality|administrative area)\b/.test(haystack)) {
        return false;
      }
      if (hasStackedPrimaryAddressNumbers(prediction)) {
        return false;
      }
      if (hasMismatchedPrimaryAddressNumber(prediction, leadingNumber)) {
        return false;
      }
      if (leadingNumber && !new RegExp(`(^|\\D)${leadingNumber}(\\D|$)`).test(haystack)) {
        return false;
      }

      if (significantTokens.length === 0) {
        return true;
      }

      if (haystack.includes(normalizedInput)) {
        return true;
      }

      const tokenMatches = significantTokens.filter((token) => haystack.includes(token)).length;
      if (startsWithNumber) {
        return tokenMatches === significantTokens.length;
      }

      return tokenMatches >= minimumTokenMatches;
    });

    return filteredPredictions.length > 0 ? filteredPredictions : leadingNumber ? [] : rankedPredictions;
  }

  function dedupeAddressAutocompletePredictions(predictions: AddressAutocompletePrediction[]) {
    const seen = new Set<string>();

    return predictions.filter((prediction) => {
      const normalizedMain = normalizeMapsQuery(prediction.mainText).toLowerCase();
      const normalizedSecondary = normalizeMapsQuery(prediction.secondaryText).toLowerCase();
      const normalizedDescription = normalizeMapsQuery(prediction.description).toLowerCase();
      const keys = [
        normalizedDescription,
        `${normalizedMain}|${normalizedSecondary}`,
        prediction.placeId,
      ].filter(Boolean);

      if (keys.some((key) => seen.has(key))) return false;
      keys.forEach((key) => seen.add(key));
      return true;
    });
  }

  function mapPhotonFeatureToPrediction(feature: any): AddressAutocompletePrediction | null {
    const properties = feature?.properties || {};
    const countryCode = String(properties.countrycode || "").toLowerCase();
    if (countryCode && countryCode !== "za") return null;

    const type = String(properties.type || "").toLowerCase();
    const houseNumber = String(properties.housenumber || "").trim();
    const street = String(properties.street || "").trim();
    const name = String(properties.name || "").trim();
    const addressLike = type === "street" || Boolean(street) || Boolean(houseNumber);
    if (!addressLike) return null;

    const coordinates = Array.isArray(feature?.geometry?.coordinates) ? feature.geometry.coordinates : [];
    const lng = typeof coordinates[0] === "number" ? coordinates[0] : null;
    const lat = typeof coordinates[1] === "number" ? coordinates[1] : null;
    const mainText = [houseNumber, street || name].filter(Boolean).join(" ").trim() || street || name;
    const secondaryParts = sanitizeAddressAutocompleteParts([
      properties.locality,
      properties.district,
      properties.city,
      properties.state,
    ]);
    const secondaryText = secondaryParts.join(", ") || String(properties.country || "South Africa");
    const description = [mainText, secondaryText].filter(Boolean).join(", ") || name;
    if (!description) return null;

    const stableKey = [
      properties.osm_type || feature?.id || "feature",
      properties.osm_id || mainText || description,
    ].filter(Boolean).join(":");

    return {
      placeId: `photon:${stableKey}`,
      description,
      mainText: mainText || description.split(",")[0] || "Pinned location",
      secondaryText,
      lat,
      lng,
    };
  }

  async function photonCitySearch(
    query: string,
    limit = 8,
    options?: { lat?: number | null; lng?: number | null },
  ): Promise<AddressAutocompletePrediction[]> {
    const normalizedQuery = normalizeMapsQuery(query);
    if (normalizedQuery.length < 2) return [];
    const hasBias =
      typeof options?.lat === "number" && Number.isFinite(options.lat) &&
      typeof options?.lng === "number" && Number.isFinite(options.lng);
    const biasLat = hasBias ? Number(options?.lat) : SA_DEFAULT_BIAS.lat;
    const biasLng = hasBias ? Number(options?.lng) : SA_DEFAULT_BIAS.lng;
    const url = `${PHOTON_BASE_URL}/?q=${encodeURIComponent(normalizedQuery)}&limit=${Math.max(limit, 8)}&lang=en&lat=${biasLat}&lon=${biasLng}&osm_tag=place:city&osm_tag=place:town&osm_tag=place:village&osm_tag=place:municipality`;
    const response = await fetchMapsJsonSafely(url);
    const features = Array.isArray(response?.features) ? response.features : [];
    if (features.length === 0) return [];
    return dedupeAddressAutocompletePredictions(
      features
        .map(mapPhotonFeatureToPrediction)
        .filter((p): p is AddressAutocompletePrediction => Boolean(p)),
    )
      .map((prediction) => ({
        ...prediction,
        score: scoreMapsPrediction(prediction, normalizedQuery, options?.lat, options?.lng),
      }))
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, limit)
      .map(({ score: _score, ...prediction }: any) => prediction);
  }

  async function photonSearch(
    query: string,
    limit = 6,
    options?: { lat?: number | null; lng?: number | null; minQueryLength?: number },
  ): Promise<AddressAutocompletePrediction[]> {
    const normalizedQuery = normalizeMapsQuery(query);
    const minQueryLength = Math.max(1, options?.minQueryLength ?? 2);
    if (normalizedQuery.length < minQueryLength) return [];

    const hasBias =
      typeof options?.lat === "number" &&
      Number.isFinite(options.lat) &&
      typeof options?.lng === "number" &&
      Number.isFinite(options.lng);
    const biasLat = hasBias ? Number(options?.lat) : SA_DEFAULT_BIAS.lat;
    const biasLng = hasBias ? Number(options?.lng) : SA_DEFAULT_BIAS.lng;
    const searchQueries = buildAddressSearchQueries(normalizedQuery, options?.lat, options?.lng);
    const rawFeatures: any[] = [];

    for (const searchQuery of searchQueries) {
      const url = `${PHOTON_BASE_URL}/?q=${encodeURIComponent(searchQuery)}&limit=${Math.max(limit, 8)}&lang=en&lat=${biasLat}&lon=${biasLng}`;
      const response = await fetchMapsJsonSafely(url);
      const features = Array.isArray(response?.features) ? response.features : [];
      rawFeatures.push(...features);
      if (rawFeatures.length >= limit * 3) break;
    }

    if (rawFeatures.length === 0) return [];

    const searchTokens = extractAddressTokens(normalizedQuery.replace(/^\d+\s*/, ""));

    return dedupeAddressAutocompletePredictions(
      rawFeatures
        .map(mapPhotonFeatureToPrediction)
        .filter((prediction): prediction is AddressAutocompletePrediction => Boolean(prediction))
        .filter((prediction) => {
          if (searchTokens.length === 0) return true;
          const primaryText = normalizeMapsQuery(`${prediction.mainText} ${prediction.description.split(",")[0] || ""}`).toLowerCase();
          return searchTokens.some((token) => primaryText.includes(token));
        }),
    )
      .map((prediction) => ({
        ...prediction,
        score: scoreMapsPrediction(prediction, normalizedQuery, options?.lat, options?.lng),
      }))
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, limit)
      .map(({ score: _score, ...prediction }: any) => prediction);
  }

  async function fetchNumberedStreetAutocompletePredictions(
    input: string,
    limit = 5,
    options?: { lat?: number | null; lng?: number | null },
  ): Promise<AddressAutocompletePrediction[]> {
    const normalizedInput = normalizeMapsQuery(input);
    const leadingNumber = normalizedInput.match(/^\d+/)?.[0] || "";
    if (!leadingNumber) return [];

    const streetFragment = normalizedInput.replace(/^\d+\s*/, "").trim();
    const prefixTokens = extractAddressTokens(streetFragment, 1);
    const significantTokens = extractAddressTokens(streetFragment, 3);
    const usePrefixMatching = significantTokens.length === 0 && prefixTokens.length > 0;
    const activeTokens = usePrefixMatching ? prefixTokens : significantTokens;
    const longestTokenLength = prefixTokens.reduce((longest, token) => Math.max(longest, token.length), 0);
    const hasStreetType = /\b(street|avenue|road|drive|lane|close|boulevard|crescent)\b/i.test(streetFragment);
    if (!streetFragment || activeTokens.length === 0) {
      return [];
    }

    const providerLimit = usePrefixMatching && !hasStreetType
      ? Math.max(limit * 6, 30)
      : limit * 2;

    const useNominatim = !usePrefixMatching || hasStreetType;
    const [photonPredictions, nominatimPredictions] = await Promise.all([
      photonSearch(streetFragment, providerLimit, { ...options, minQueryLength: 1 }),
      useNominatim ? nominatimSearch(streetFragment, providerLimit, options) : Promise.resolve([]),
    ]);
    const syntheticPredictions = dedupeAddressAutocompletePredictions([
      ...photonPredictions,
      ...nominatimPredictions,
    ])
      .map((prediction) => {
        if (hasStackedPrimaryAddressNumbers(prediction)) return null;
        if (hasMismatchedPrimaryAddressNumber(prediction, leadingNumber)) return null;

        if (usePrefixMatching) {
          if (!predictionMatchesAddressPrefixes(prediction, activeTokens)) return null;
        } else {
          const primaryText = normalizeMapsQuery(`${prediction.mainText} ${prediction.description.split(",")[0] || ""}`).toLowerCase();
          if (!activeTokens.some((token) => primaryText.includes(token))) return null;
        }

        const existingNumber = getLeadingAddressNumber(prediction.mainText);
        const streetText = existingNumber === leadingNumber
          ? stripLeadingAddressNumber(prediction.mainText)
          : prediction.mainText;
        const mainText = existingNumber === leadingNumber
          ? prediction.mainText
          : `${leadingNumber} ${streetText}`.replace(/\s+/g, " ").trim();

        return {
          placeId: `synthetic:${leadingNumber}:${prediction.placeId}`,
          description: [mainText, prediction.secondaryText].filter(Boolean).join(", "),
          mainText,
          secondaryText: prediction.secondaryText,
          lat: prediction.lat,
          lng: prediction.lng,
        };
      })
      .filter((prediction): prediction is AddressAutocompletePrediction => Boolean(prediction));

    return rankAddressAutocompletePredictions(normalizedInput, syntheticPredictions, options?.lat, options?.lng).slice(0, limit);
  }

  async function searchExpandedAddressFallbackQueries(
    input: string,
    limit = 6,
    options?: { lat?: number | null; lng?: number | null },
  ) {
    const expandedQueries = buildExpandedAddressFallbackQueries(input);
    if (expandedQueries.length === 0) return [];

    const batches = await Promise.all(
      expandedQueries.flatMap((expandedQuery) => [
        photonSearch(expandedQuery, Math.max(limit, 6), { ...options, minQueryLength: 1 }),
        nominatimSearch(expandedQuery, Math.max(limit, 6), options),
      ]),
    );

    return rankAddressAutocompletePredictions(
      input,
      dedupeAddressAutocompletePredictions(batches.flat()),
      options?.lat,
      options?.lng,
    ).slice(0, limit);
  }

  function mapGoogleGeocodeResultToPrediction(result: any): AddressAutocompletePrediction {
    const components = Array.isArray(result?.address_components) ? result.address_components : [];
    const get = (type: string) => components.find((component: any) => component?.types?.includes(type))?.long_name || "";
    const streetNumber = get("street_number");
    const route = get("route");
    const suburb = get("sublocality_level_1") || get("sublocality") || get("neighborhood");
    const city = get("locality") || get("administrative_area_level_2");
    const province = get("administrative_area_level_1");
    const mainText = route ? `${streetNumber ? `${streetNumber} ` : ""}${route}` : result.formatted_address.split(",")[0];
    const secondaryParts = sanitizeAddressAutocompleteParts([suburb, city, province]);

    return {
      placeId: result.place_id,
      description: [mainText, ...secondaryParts].join(", ") || result.formatted_address,
      mainText,
      secondaryText: secondaryParts.join(", "),
      lat: result.geometry?.location?.lat ?? null,
      lng: result.geometry?.location?.lng ?? null,
    };
  }

  function shouldSupplementAddressAutocompleteWithGeocode(
    input: string,
    predictions: AddressAutocompletePrediction[],
  ) {
    const normalizedInput = normalizeMapsQuery(input).toLowerCase();
    const leadingNumber = normalizedInput.match(/^\d+/)?.[0] || "";
    const significantTokens = extractAddressTokens(normalizedInput, /^\d+\s+/.test(normalizedInput) ? 2 : 3);
    const longestTokenLength = significantTokens.reduce((longest, token) => Math.max(longest, token.length), 0);

    if (!leadingNumber || longestTokenLength < 4) return false;

    return !predictions.some((prediction) => {
      const haystack = normalizeMapsQuery(
        `${prediction.description} ${prediction.mainText} ${prediction.secondaryText}`,
      ).toLowerCase();
      if (!new RegExp(`(^|\\D)${leadingNumber}(\\D|$)`).test(haystack)) {
        return false;
      }

      if (haystack.includes(normalizedInput)) {
        return true;
      }

      const tokenMatches = significantTokens.filter((token) => haystack.includes(token)).length;
      return tokenMatches >= significantTokens.length;
    });
  }

  function mapGoogleAutocompleteNewSuggestionToPrediction(suggestion: any): AddressAutocompletePrediction | null {
    const placePrediction = suggestion?.placePrediction;
    if (!placePrediction?.placeId) {
      const queryText = String(suggestion?.queryPrediction?.text?.text || "").trim();
      if (!queryText) return null;
      const [mainText, ...secondaryParts] = queryText.split(",").map((part: string) => part.trim()).filter(Boolean);

      return {
        placeId: `query:${encodeURIComponent(queryText)}`,
        description: queryText,
        mainText: mainText || queryText,
        secondaryText: secondaryParts.join(", "),
        lat: null,
        lng: null,
      };
    }

    const description = String(placePrediction.text?.text || "").trim();
    const mainText = String(
      placePrediction.structuredFormat?.mainText?.text ||
      description.split(",")[0] ||
      "",
    ).trim();
    const secondaryText = String(
      placePrediction.structuredFormat?.secondaryText?.text ||
      description.split(",").slice(1).join(", ").trim() ||
      "",
    ).trim();

    return {
      placeId: placePrediction.placeId,
      description: description || [mainText, secondaryText].filter(Boolean).join(", "),
      mainText: mainText || description.split(",")[0] || "Pinned location",
      secondaryText,
      lat: null,
      lng: null,
    };
  }

  async function fetchGoogleAutocompleteNewPredictions(options: {
    input: string;
    cityOnly: boolean;
    hasLocationBias: boolean;
    lat: number | null;
    lng: number | null;
    sessionToken: string;
  }) {
    const bias = options.hasLocationBias && options.lat !== null && options.lng !== null
      ? { lat: options.lat, lng: options.lng }
      : SA_DEFAULT_BIAS;
    const requestedRadius = options.hasLocationBias
      ? options.cityOnly ? 220000 : 90000
      : options.cityOnly ? 450000 : 160000;
    const radius = Math.min(requestedRadius, 50000);
    const body: any = {
      input: options.input,
      includedRegionCodes: ["za"],
      inputOffset: Array.from(options.input).length,
      languageCode: "en",
      regionCode: "za",
      includeQueryPredictions: !options.cityOnly,
      locationBias: {
        circle: {
          center: {
            latitude: bias.lat,
            longitude: bias.lng,
          },
          radius,
        },
      },
    };

    if (options.cityOnly) {
      body.includedPrimaryTypes = ["(cities)"];
    }

    if (options.sessionToken) {
      body.sessionToken = options.sessionToken;
    }

    const response = await fetchMapsJsonPostSafely(
      "https://places.googleapis.com/v1/places:autocomplete",
      body,
      {
        "X-Goog-Api-Key": GOOGLE_KEY,
        "X-Goog-FieldMask": GOOGLE_AUTOCOMPLETE_FIELD_MASK,
      },
    );

    const predictions = Array.isArray(response?.suggestions)
      ? response.suggestions
          .map(mapGoogleAutocompleteNewSuggestionToPrediction)
          .filter((prediction: AddressAutocompletePrediction | null): prediction is AddressAutocompletePrediction => Boolean(prediction))
      : [];

    return {
      predictions,
      status: predictions.length > 0 ? "OK" : response?.error?.status || "ZERO_RESULTS",
      errorMessage: response?.error?.message || "",
    };
  }

  async function fetchGoogleAutocompleteLegacyPredictions(options: {
    input: string;
    cityOnly: boolean;
    hasLocationBias: boolean;
    lat: number | null;
    lng: number | null;
    sessionToken: string;
  }) {
    const tokenQuery = options.sessionToken ? `&sessiontoken=${encodeURIComponent(options.sessionToken)}` : "";
    const typeQuery = options.cityOnly ? "&types=(cities)" : "";
    const zaBiasQuery = options.hasLocationBias
      ? `&location=${options.lat},${options.lng}&radius=${options.cityOnly ? 220000 : 90000}`
      : `&location=${SA_DEFAULT_BIAS.lat},${SA_DEFAULT_BIAS.lng}&radius=${options.cityOnly ? 450000 : 160000}`;
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(options.input)}&components=country:za&region=za&language=en${typeQuery}${zaBiasQuery}${tokenQuery}&key=${GOOGLE_KEY}`;
    const response = await fetchMapsJson(url);
    const predictions: AddressAutocompletePrediction[] = Array.isArray(response?.predictions)
      ? response.predictions.slice(0, ADDRESS_AUTOCOMPLETE_RESULT_LIMIT).map((p: any) => ({
          placeId: p.place_id,
          description: p.description,
          mainText: p.structured_formatting?.main_text || p.description.split(",")[0],
          secondaryText: p.structured_formatting?.secondary_text || "",
          lat: null,
          lng: null,
        }))
      : [];

    return {
      predictions,
      status: response?.status || (predictions.length > 0 ? "OK" : "ZERO_RESULTS"),
      errorMessage: response?.error_message || "",
    };
  }

  async function fetchGooglePlaceDetailsNew(placeId: string, sessionToken: string) {
    const placeName = placeId.startsWith("places/") ? placeId : `places/${placeId}`;
    const encodedPlaceName = placeName.split("/").map(encodeURIComponent).join("/");
    const params = new URLSearchParams({
      languageCode: "en",
      regionCode: "za",
    });
    if (sessionToken) params.set("sessionToken", sessionToken);

    const response = await fetch(`https://places.googleapis.com/v1/${encodedPlaceName}?${params.toString()}`, {
      headers: {
        Accept: "application/json",
        "Accept-Language": "en-ZA,en;q=0.9",
        "User-Agent": MAPS_USER_AGENT,
        "X-Goog-Api-Key": GOOGLE_KEY,
        "X-Goog-FieldMask": GOOGLE_PLACE_DETAILS_FIELD_MASK,
      },
    });
    const rawBody = await response.text();
    if (!rawBody) return null;

    let result: any;
    try {
      result = JSON.parse(rawBody);
    } catch {
      return null;
    }

    const latitude = result?.location?.latitude;
    const longitude = result?.location?.longitude;
    if (typeof latitude !== "number" || typeof longitude !== "number") {
      if (result?.error?.status) {
        console.warn("[maps] Google place details new fallback engaged:", result.error.status);
      }
      return null;
    }

    return {
      lat: latitude,
      lng: longitude,
      address: result.formattedAddress || result.displayName?.text || null,
    };
  }

  async function fetchGeocodeAutocompletePredictions(
    input: string,
    limit = 5,
    options?: { cityOnly?: boolean },
  ): Promise<AddressAutocompletePrediction[]> {
    if (!GOOGLE_KEY) return [];

    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(`${input}, South Africa`)}&components=country:ZA&region=za&key=${GOOGLE_KEY}`;
    const geocodeResponse = await fetchMapsJsonSafely(geocodeUrl);
    if (geocodeResponse?.status !== "OK" || !Array.isArray(geocodeResponse.results) || geocodeResponse.results.length === 0) {
      return [];
    }

    const geocodeResults = options?.cityOnly
      ? geocodeResponse.results.filter((result: any) => {
          const types = Array.isArray(result?.types) ? result.types : [];
          return types.includes("locality") || types.includes("postal_town") || types.includes("administrative_area_level_2");
        })
      : geocodeResponse.results;

    return geocodeResults.slice(0, Math.max(limit, 5)).map(mapGoogleGeocodeResultToPrediction);
  }

  function southAfricanCityFallback(input: string, lat?: number | null, lng?: number | null) {
    const query = normalizeMapsQuery(input).toLowerCase();
    if (query.length < 2) return [];
    const bias = lat != null && lng != null ? { lat, lng } : null;

    return SOUTH_AFRICAN_CITY_SUGGESTIONS
      .map(([city, province, cityLat, cityLng]) => {
        const cityLower = city.toLowerCase();
        const starts = cityLower.startsWith(query);
        const includes = cityLower.includes(query);
        if (!starts && !includes) return null;
        const distanceBoost = bias ? Math.max(0, 10 - calculateHaversineDistanceKm(bias.lat, bias.lng, cityLat, cityLng) / 80) : 0;
        return {
          placeId: `sa-city:${cityLower.replace(/\s+/g, "-")}`,
          description: `${city}, ${province}, South Africa`,
          mainText: city,
          secondaryText: `${province}, South Africa`,
          lat: cityLat,
          lng: cityLng,
          score: (starts ? 50 : 25) + distanceBoost,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, ADDRESS_AUTOCOMPLETE_RESULT_LIMIT)
      .map(({ score: _score, ...prediction }: any) => prediction);
  }

  async function nominatimSearch(
    query: string,
    limit = 6,
    options?: { cityOnly?: boolean; lat?: number | null; lng?: number | null },
  ) {
    const normalizedQuery = normalizeMapsQuery(query);
    const cityOnly = options?.cityOnly ?? false;
    const hasBias =
      typeof options?.lat === "number" &&
      Number.isFinite(options.lat) &&
      typeof options?.lng === "number" &&
      Number.isFinite(options.lng);
    const biasLat = hasBias ? Number(options?.lat) : null;
    const biasLng = hasBias ? Number(options?.lng) : null;
    const searchQueries = cityOnly ? [normalizedQuery] : buildAddressSearchQueries(normalizedQuery, options?.lat, options?.lng);
    const allRawResults: any[] = [];

    for (const searchQuery of searchQueries) {
      const biasQuery = hasBias
        ? `&viewbox=${biasLng! - 1.6},${biasLat! + 1.6},${biasLng! + 1.6},${biasLat! - 1.6}&bounded=0`
        : "";
      const url = `${NOMINATIM_BASE_URL}/search?format=jsonv2&addressdetails=1&limit=${Math.max(limit, 8)}&countrycodes=za${biasQuery}&q=${encodeURIComponent(searchQuery)}`;
      const rawResults = await fetchMapsJsonSafely(url);
      if (Array.isArray(rawResults)) allRawResults.push(...rawResults);
      if (allRawResults.length >= limit * 3) break;
    }

    if (allRawResults.length === 0) return [];

    const seen = new Set<string>();
    const results = (cityOnly ? allRawResults.filter((result: any) => isCityLikeNominatimResult(result)) : allRawResults)
      .filter((result: any) => {
        const key = `${result.place_id || ""}:${result.lat || ""}:${result.lon || ""}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    return results
      .map((result: any) => {
        const formatted = formatNominatimAddress(result.address, result.display_name);
        const prediction = {
        placeId: `nominatim:${result.place_id}`,
        description: formatted.description || result.display_name,
        mainText: formatted.mainText,
        secondaryText: formatted.secondaryText,
        lat: result.lat ? Number(result.lat) : null,
        lng: result.lon ? Number(result.lon) : null,
        };
        return {
          ...prediction,
          score: scoreMapsPrediction(prediction, normalizedQuery, options?.lat, options?.lng),
        };
      })
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, limit)
      .map(({ score: _score, ...prediction }: any) => prediction);
  }

  async function nominatimReverse(lat: string | number, lng: string | number) {
    const url = `${NOMINATIM_BASE_URL}/reverse?format=jsonv2&addressdetails=1&lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}&zoom=18`;
    const result = await fetchMapsJsonSafely(url);
    if (!result || !result.address) return null;

    const formatted = formatNominatimAddress(result.address, result.display_name);
    return {
      placeId: `nominatim:${result.place_id || `${lat},${lng}`}`,
      description: formatted.description || result.display_name,
      mainText: formatted.mainText,
      secondaryText: formatted.secondaryText,
      lat: parseFloat(String(lat)),
      lng: parseFloat(String(lng)),
    };
  }

  // Geocode: Google only
  app.get("/api/geocode", async (req: Request, res: Response) => {
    try {
      const address = req.query.address as string;
      if (!address) return res.status(400).json({ message: "Address is required" });

      if (GOOGLE_KEY) {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&components=country:ZA&key=${GOOGLE_KEY}`;
        const r = await fetchMapsJsonSafely(url);
        if (r.status === "OK" && r.results.length > 0) {
          const loc = r.results[0].geometry.location;
          return res.json({ lat: loc.lat, lng: loc.lng });
        }
        console.warn("[maps] Google geocode fallback engaged:", r.status || "unknown");
      }

      const osmResults = await nominatimSearch(address, 1);
      if (osmResults.length > 0 && osmResults[0].lat != null && osmResults[0].lng != null) {
        return res.json({ lat: osmResults[0].lat, lng: osmResults[0].lng });
      }
      return res.status(404).json({ message: "Location not found" });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // Autocomplete: Google Places API only
  app.get("/api/places/autocomplete", async (req: Request, res: Response) => {
    try {
      const input = req.query.input as string;
      const lat = isValidCoordinate(req.query.lat) ? Number(req.query.lat) : null;
      const lng = isValidCoordinate(req.query.lng) ? Number(req.query.lng) : null;
      const hasLocationBias = lat !== null && lng !== null;
      const cityOnly = ["1", "true", "yes", "city", "cities"].includes(
        String(req.query.cityOnly || req.query.mode || "").toLowerCase(),
      );
      const sessionToken = typeof req.query.sessionToken === "string"
        ? req.query.sessionToken
        : typeof req.query.sessiontoken === "string"
          ? req.query.sessiontoken
          : "";
      if (!input || input.trim().length < 2) return res.json({ predictions: [] });
      const normalizedInput = normalizeMapsQuery(input);
      const staticCityPredictions = cityOnly ? southAfricanCityFallback(normalizedInput, lat, lng) : [];
      const providerDebug: Record<string, any> = {
        googleConfigured: Boolean(GOOGLE_KEY),
      };

      if (GOOGLE_KEY) {
        let googleResult = await fetchGoogleAutocompleteNewPredictions({
          input: normalizedInput,
          cityOnly,
          hasLocationBias,
          lat,
          lng,
          sessionToken,
        });
        providerDebug.googleNewStatus = googleResult.status;
        providerDebug.googleNewCount = googleResult.predictions.length;
        if (googleResult.errorMessage) providerDebug.googleNewError = googleResult.errorMessage;

        if (googleResult.predictions.length === 0 && googleResult.status !== "OK") {
          googleResult = await fetchGoogleAutocompleteLegacyPredictions({
            input: normalizedInput,
            cityOnly,
            hasLocationBias,
            lat,
            lng,
            sessionToken,
          });
          providerDebug.googleLegacyStatus = googleResult.status;
          providerDebug.googleLegacyCount = googleResult.predictions.length;
          if (googleResult.errorMessage) providerDebug.googleLegacyError = googleResult.errorMessage;
        }

        const mappedPredictions = googleResult.predictions;
        const geocodePredictions = !cityOnly && shouldSupplementAddressAutocompleteWithGeocode(normalizedInput, mappedPredictions)
          ? await fetchGeocodeAutocompletePredictions(normalizedInput, 5)
          : [];
        providerDebug.googleMappedCount = mappedPredictions.length;
        providerDebug.googleGeocodeSupplementCount = geocodePredictions.length;
        const mergedPredictions = cityOnly
          ? mappedPredictions
          : dedupeAddressAutocompletePredictions([...geocodePredictions, ...mappedPredictions]);
        const filteredPredictions = cityOnly
          ? mappedPredictions
          : filterAddressAutocompletePredictions(normalizedInput, mergedPredictions, lat, lng);
        providerDebug.googleFilteredCount = filteredPredictions.length;

        if (cityOnly && (staticCityPredictions.length > 0 || mappedPredictions.length > 0)) {
          return res.json({
            predictions: [...staticCityPredictions, ...mappedPredictions].slice(0, ADDRESS_AUTOCOMPLETE_RESULT_LIMIT),
            debug: providerDebug,
          });
        }

        if (filteredPredictions.length > 0) {
          return res.json({
            predictions: filteredPredictions.slice(0, ADDRESS_AUTOCOMPLETE_RESULT_LIMIT),
            debug: providerDebug,
          });
        }

        if (normalizedInput.trim().length >= 3) {
          const geocodePredictions = await fetchGeocodeAutocompletePredictions(normalizedInput, 5, { cityOnly });
          providerDebug.googleGeocodeFallbackCount = geocodePredictions.length;
          if (geocodePredictions.length > 0) {
            const filteredGeocodePredictions = cityOnly
              ? geocodePredictions
              : filterAddressAutocompletePredictions(normalizedInput, geocodePredictions, lat, lng);
            providerDebug.googleGeocodeFallbackFilteredCount = filteredGeocodePredictions.length;
            if (filteredGeocodePredictions.length === 0) {
              console.warn("[maps] Google geocode autocomplete fallback had no token-matching predictions");
            } else {
              return res.json({
                predictions: filteredGeocodePredictions.slice(0, ADDRESS_AUTOCOMPLETE_RESULT_LIMIT),
                debug: providerDebug,
              });
            }
          }
        }

        if (googleResult.status !== "ZERO_RESULTS") {
          console.warn("[maps] Google autocomplete fallback engaged:", googleResult.status || "unknown");
        }
      }

      if (!cityOnly) {
        const [photonPredictions, numberedStreetPredictions] = await Promise.all([
          photonSearch(normalizedInput, ADDRESS_AUTOCOMPLETE_RESULT_LIMIT, { lat, lng }),
          fetchNumberedStreetAutocompletePredictions(normalizedInput, ADDRESS_AUTOCOMPLETE_RESULT_LIMIT, { lat, lng }),
        ]);
        const providerPredictions = filterAddressAutocompletePredictions(
          normalizedInput,
          dedupeAddressAutocompletePredictions([...numberedStreetPredictions, ...photonPredictions]),
          lat,
          lng,
        );
        providerDebug.photonCount = photonPredictions.length;
        providerDebug.numberedStreetCount = numberedStreetPredictions.length;
        providerDebug.providerFilteredCount = providerPredictions.length;
        if (providerPredictions.length > 0) {
          return res.json({
            predictions: providerPredictions.slice(0, ADDRESS_AUTOCOMPLETE_RESULT_LIMIT),
            debug: providerDebug,
          });
        }

        const expandedRawPredictions = await searchExpandedAddressFallbackQueries(normalizedInput, ADDRESS_AUTOCOMPLETE_RESULT_LIMIT, { lat, lng });
        const expandedProviderPredictions = filterAddressAutocompletePredictions(
          normalizedInput,
          expandedRawPredictions,
          lat,
          lng,
        );
        providerDebug.expandedProviderCount = expandedRawPredictions.length;
        providerDebug.expandedProviderFilteredCount = expandedProviderPredictions.length;
        if (expandedProviderPredictions.length > 0) {
          return res.json({
            predictions: expandedProviderPredictions.slice(0, ADDRESS_AUTOCOMPLETE_RESULT_LIMIT),
            debug: providerDebug,
          });
        }
      }

      const [osmPredictions, photonCityPredictions] = await Promise.all([
        nominatimSearch(normalizedInput, ADDRESS_AUTOCOMPLETE_RESULT_LIMIT, { cityOnly, lat, lng }),
        cityOnly ? photonCitySearch(normalizedInput, ADDRESS_AUTOCOMPLETE_RESULT_LIMIT, { lat, lng }) : Promise.resolve([]),
      ]);
      providerDebug.osmCount = osmPredictions.length;
      providerDebug.photonCityCount = photonCityPredictions.length;
      const filteredOsmPredictions = cityOnly
        ? osmPredictions
        : filterAddressAutocompletePredictions(normalizedInput, osmPredictions, lat, lng);
      providerDebug.osmFilteredCount = filteredOsmPredictions.length;
      if (cityOnly) {
        const seenCities = new Set<string>();
        const cityPredictions = [...staticCityPredictions, ...photonCityPredictions, ...osmPredictions].filter((prediction: any) => {
          const key = String(prediction.mainText || prediction.description || "").toLowerCase();
          if (!key || seenCities.has(key)) return false;
          seenCities.add(key);
          return true;
        });
        return res.json({
          predictions: cityPredictions.slice(0, ADDRESS_AUTOCOMPLETE_RESULT_LIMIT),
          debug: providerDebug,
        });
      }

      return res.json({
        predictions: filteredOsmPredictions,
        debug: providerDebug,
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // Place details: Google Places API only
  app.get("/api/places/details", async (req: Request, res: Response) => {
    try {
      const placeId = req.query.placeId as string;
      const description = typeof req.query.description === "string"
        ? req.query.description.trim()
        : "";
      const sessionToken = typeof req.query.sessionToken === "string"
        ? req.query.sessionToken
        : typeof req.query.sessiontoken === "string"
          ? req.query.sessiontoken
          : "";
      if (!placeId) return res.status(400).json({ message: "placeId is required" });

      const isGooglePlaceId = !/^(nominatim|photon|sa-city|manual|synthetic|query):/i.test(placeId);

      if (!isGooglePlaceId && description) {
        const fallbackPredictions = await nominatimSearch(description, 1);
        const bestMatch = fallbackPredictions.find((prediction) => prediction.lat != null && prediction.lng != null);
        if (bestMatch && bestMatch.lat != null && bestMatch.lng != null) {
          return res.json({
            lat: bestMatch.lat,
            lng: bestMatch.lng,
            address: bestMatch.description,
          });
        }
      }

      if (!GOOGLE_KEY) return res.status(500).json({ message: "Google Maps API key not configured" });

      const newDetails = await fetchGooglePlaceDetailsNew(placeId, sessionToken);
      if (newDetails) {
        return res.json(newDetails);
      }

      const tokenQuery = sessionToken ? `&sessiontoken=${encodeURIComponent(sessionToken)}` : "";
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry,formatted_address,name${tokenQuery}&key=${GOOGLE_KEY}`;
      const r = await (await fetch(url)).json() as any;
      if (r.status === "OK") {
        const loc = r.result.geometry.location;
        return res.json({ lat: loc.lat, lng: loc.lng, address: r.result.formatted_address });
      }
      return res.status(404).json({ message: "Place not found" });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // Reverse geocode: Google only
  app.get("/api/places/reverse", async (req: Request, res: Response) => {
    try {
      const { lat, lng } = req.query;
      if (!lat || !lng) return res.status(400).json({ message: "lat and lng are required" });

      if (GOOGLE_KEY) {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_KEY}`;
        const r = await fetchMapsJson(url);
        if (r.status === "OK" && r.results.length > 0) {
          const best = chooseBestReverseGeocodeResult(r.results) || r.results[0];
          const components = best.address_components;
          const get = (type: string) => components.find((c: any) => c.types.includes(type))?.long_name || "";
          const streetNumber = get("street_number");
          const route = get("route");
          const suburb = get("sublocality_level_1") || get("sublocality") || get("neighborhood");
          const city = get("locality") || get("administrative_area_level_2");
          const province = get("administrative_area_level_1");
          const mainText = route ? `${streetNumber ? streetNumber + " " : ""}${route}` : best.formatted_address.split(",")[0];
          const secondaryParts = [suburb, city, province].filter(Boolean);
          const composedDescription = [mainText, ...secondaryParts]
            .filter((part, index, parts) => Boolean(part) && parts.indexOf(part) === index)
            .join(", ");
          return res.json({
            placeId: best.place_id,
            description: composedDescription || best.formatted_address,
            mainText,
            secondaryText: secondaryParts.join(", "),
            lat: parseFloat(lat as string),
            lng: parseFloat(lng as string),
          });
        }

        console.warn("[maps] Google reverse geocode fallback engaged:", r.status || "unknown");
      }

      const osmResult = await nominatimReverse(lat as string, lng as string);
      if (osmResult) return res.json(osmResult);

      return res.status(404).json({ message: "Location not found" });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/directions", async (req: Request, res: Response) => {
    try {
      const originLat = typeof req.query.originLat === "string" ? req.query.originLat : "";
      const originLng = typeof req.query.originLng === "string" ? req.query.originLng : "";
      const destLat = typeof req.query.destLat === "string" ? req.query.destLat : "";
      const destLng = typeof req.query.destLng === "string" ? req.query.destLng : "";
      if (!originLat || !originLng || !destLat || !destLng) {
        return res
          .status(400)
          .json({ message: "Origin and destination coordinates are required" });
      }
      const apiKey =
        process.env.GOOGLE_MAPS_SERVER_API_KEY ||
        process.env.GOOGLE_MAPS_API_KEY ||
        process.env.GOOGLE_API_KEY;
      if (!apiKey) {
        return res
          .status(500)
          .json({ message: "Google Maps API key not configured" });
      }
      const cacheKey = buildDirectionsCacheKey(originLat, originLng, destLat, destLng);
      if (cacheKey) {
        const cached = getDirectionsCacheEntry(cacheKey);
        if (cached) {
          return res.json(cached);
        }
      }
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originLat},${originLng}&destination=${destLat},${destLng}&alternatives=true&key=${apiKey}`;
      const response = await fetch(url);
      const data = (await response.json()) as any;
      if (data.status === "OK" && data.routes?.length > 0) {
        const parseRoute = (route: any, idx: number) => {
          const leg = route.legs[0];
          const steps = (leg.steps || []).map((step: any) => ({
            instruction: step.html_instructions.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
            distance: step.distance?.text || "",
            duration: step.duration?.text || "",
            endLat: step.end_location?.lat,
            endLng: step.end_location?.lng,
            maneuver: step.maneuver || "straight",
          }));
          return {
            polyline: route.overview_polyline.points,
            distanceKm: leg.distance.value / 1000,
            distanceText: leg.distance.text,
            durationMin: Math.ceil(leg.duration.value / 60),
            durationText: leg.duration.text,
            summary: route.summary || `Route ${idx + 1}`,
            steps,
          };
        };
        const primary = parseRoute(data.routes[0], 0);
        const alternatives = data.routes.map((r: any, i: number) => parseRoute(r, i));
        const payload = { ...primary, alternatives };
        if (cacheKey) {
          setDirectionsCacheEntry(cacheKey, payload);
        }
        return res.json(payload);
      }
      return res.status(404).json({ message: "No route found" });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // -----------------------------
  // Users
  // -----------------------------
  // List all users (admin)
  app.get("/api/users", requireAuth, requireRole(["admin"]), async (_req: AuthedRequest, res: Response) => {
    try {
      const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));
      return res.json(allUsers.map((user) => {
        const { password: _pw, ...safeUser } = user;
        return safeUser;
      }));
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/users/:id", async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) return res.status(404).json({ message: "User not found" });
      const { password: _pw, ...safeUser } = user;
      return res.json(safeUser);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/users/:id", async (req: Request, res: Response) => {
    try {
      const user = await storage.updateUser(req.params.id, req.body);
      if (!user) return res.status(404).json({ message: "User not found" });
      const { password: _pw, ...safeUser } = user;
      return res.json(safeUser);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // Update user selfie / profile photo
  app.put("/api/users/:id/selfie", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { profilePhoto } = req.body;
      if (typeof profilePhoto !== "string" || !profilePhoto.trim()) {
        return res.status(400).json({ message: "profilePhoto URL is required" });
      }
      // Only allow users to update their own selfie
      if (req.auth!.sub !== req.params.id) return res.status(403).json({ message: "Forbidden" });
      const user = await storage.updateUser(req.params.id, { profilePhoto: profilePhoto.trim() } as any);
      if (!user) return res.status(404).json({ message: "User not found" });
      const { password: _pw, ...safeUser } = user;
      return res.json(safeUser);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/users/:id/push-token", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      if (req.auth!.sub !== req.params.id) {
        const caller = await storage.getUser(req.auth!.sub);
        if (caller?.role !== "admin") {
          return res.status(403).json({ message: "Forbidden" });
        }
      }

      const { pushToken } = req.body as { pushToken?: string };
      if (!pushToken || typeof pushToken !== "string") {
        return res.status(400).json({ message: "pushToken is required" });
      }
      if (!pushToken.startsWith("ExponentPushToken[") && !pushToken.startsWith("ExpoPushToken[")) {
        return res.status(400).json({ message: "Invalid Expo push token" });
      }

      const updatedUser = await storage.updateUser(req.params.id, { pushToken } as any);
      if (!updatedUser) return res.status(404).json({ message: "User not found" });
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/users/:id/role", async (req: Request, res: Response) => {
    try {
      const { role } = req.body;
      const user = await storage.updateUser(req.params.id, { role });
      if (!user) return res.status(404).json({ message: "User not found" });
      const { password: _pw, ...safeUser } = user;
      return res.json(safeUser);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/users/:id/topup", async (req: Request, res: Response) => {
    try {
      const { amount } = req.body;
      if (!amount || amount <= 0) {
        return res.status(400).json({ message: "Invalid amount" });
      }
      const user = await storage.getUser(req.params.id);
      if (!user) return res.status(404).json({ message: "User not found" });
      const newBalance = (user.walletBalance || 0) + amount;
      const updated = await storage.updateUser(req.params.id, {
        walletBalance: newBalance,
      });
      if (!updated) return res.status(500).json({ message: "Failed to update balance" });
      await storage.createNotification({
        userId: req.params.id,
        title: "Wallet Top Up",
        body: `R ${amount.toFixed(2)} has been added to your wallet. New balance: R ${newBalance.toFixed(2)}`,
        type: "wallet",
      });
      const { password: _pw, ...safeUser } = updated;
      return res.json(safeUser);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // Version probe — confirms this build is live
  app.get("/api/version", (_req: Request, res: Response) => {
    res.json({ version: "google-oauth-v2", built: new Date().toISOString() });
  });

  // -----------------------------
  // Google OAuth
  // -----------------------------
  // Backend-driven Google OAuth — no proxy, no consent screen.
  // App opens /api/auth/google/start in the browser, Google redirects to
  // /api/auth/google/callback, backend creates user and deep-links back to app.
  app.get("/api/auth/google/start", (req: Request, res: Response) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) return res.status(500).send("Google OAuth not configured");
    const callbackUrl = `https://api-production-0783.up.railway.app/api/auth/google/callback`;
    const redirect = typeof req.query.redirect === "string" ? req.query.redirect : "";
    const platform = req.query.platform === "web" && isAllowedGoogleWebRedirect(redirect) ? "web" : "app";
    const state = encodeGoogleAuthState(platform === "web" ? { platform, redirect } : { platform: "app" });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", callbackUrl);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "select_account");
    url.searchParams.set("state", state);
    return res.redirect(url.toString());
  });

  app.get("/api/auth/google/callback", async (req: Request, res: Response) => {
    try {
      const { code, error, state } = req.query as any;
      const authState = decodeGoogleAuthState(typeof state === "string" ? state : undefined);
      const isWeb = authState.platform === "web" && isAllowedGoogleWebRedirect(authState.redirect);
      if (error || !code) {
        if (isWeb) {
          return res.redirect(buildGoogleWebRedirect(authState.redirect, { error: String(error || "cancelled") }));
        }
        return res.redirect(`a2blift://auth?error=${encodeURIComponent(error || "cancelled")}`);
      }
      const clientId = process.env.GOOGLE_CLIENT_ID!;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
      const callbackUrl = `https://api-production-0783.up.railway.app/api/auth/google/callback`;

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: callbackUrl, grant_type: "authorization_code" }).toString(),
      });
      const tokens = await tokenRes.json() as any;
      if (tokens.error) {
        if (isWeb) {
          return res.redirect(buildGoogleWebRedirect(authState.redirect, { error: String(tokens.error_description || tokens.error) }));
        }
        return res.redirect(`a2blift://auth?error=${encodeURIComponent(tokens.error_description || tokens.error)}`);
      }

      const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const googleUser = await userInfoRes.json() as any;
      if (!googleUser.email) {
        if (isWeb) {
          return res.redirect(buildGoogleWebRedirect(authState.redirect, { error: "no_email" }));
        }
        return res.redirect(`a2blift://auth?error=no_email`);
      }

      const email = googleUser.email.trim().toLowerCase();
      let user = await storage.getUserByUsername(email);
      if (!user) {
        const randomPassword = await bcrypt.hash(Math.random().toString(36), 10);
        user = await storage.createUser({ username: email, password: randomPassword, name: googleUser.name || email.split("@")[0], phone: null, role: "client" });
      }

      const appToken = signAccessToken({ sub: user.id, role: user.role as UserRole, email: user.username, name: user.name });
      const { password: _pw, ...safeUser } = user;
      if (isWeb) {
        return res.redirect(buildGoogleWebRedirect(authState.redirect, {
          accessToken: appToken,
          user: JSON.stringify(safeUser),
        }));
      }
      // Deep link back into the app with the JWT
      const payload = encodeURIComponent(JSON.stringify({ user: safeUser, accessToken: appToken }));
      return res.redirect(`a2blift://auth?payload=${payload}`);
    } catch (err: any) {
      const authState = decodeGoogleAuthState(typeof req.query.state === "string" ? req.query.state : undefined);
      if (authState.platform === "web" && isAllowedGoogleWebRedirect(authState.redirect)) {
        return res.redirect(buildGoogleWebRedirect(authState.redirect, { error: err.message || "oauth_failed" }));
      }
      return res.redirect(`a2blift://auth?error=${encodeURIComponent(err.message)}`);
    }
  });

  app.post("/api/auth/google", async (req: Request, res: Response) => {
    try {
      const { code, redirectUri } = req.body;
      if (!code || !redirectUri) {
        return res.status(400).json({ message: "code and redirectUri are required" });
      }

      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        return res.status(500).json({ message: "Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in environment variables." });
      }

      // Exchange auth code for tokens
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }).toString(),
      });

      const tokens = await tokenRes.json() as any;
      if (tokens.error) {
        return res.status(400).json({ message: `Google token error: ${tokens.error_description || tokens.error}` });
      }

      // Get user info from Google
      const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const googleUser = await userInfoRes.json() as any;

      if (!googleUser.email) {
        return res.status(400).json({ message: "Could not retrieve email from Google" });
      }

      // Use full email as username — consistent with manual registration
      const email = googleUser.email.trim().toLowerCase();
      let user = await storage.getUserByUsername(email);

      if (!user) {
        const randomPassword = await bcrypt.hash(Math.random().toString(36), 10);
        user = await storage.createUser({
          username: email,
          password: randomPassword,
          name: googleUser.name || email.split("@")[0],
          phone: null,
          role: "client",
        });
      }

      const token = signAccessToken({ sub: user.id, role: user.role as UserRole, email: user.username, name: user.name });
      setAuthCookie(res, token);
      const { password: _pw, ...safeUser } = user;
      return res.json({ user: safeUser, accessToken: token });
    } catch (error: any) {
      console.error("Google OAuth error:", error);
      return res.status(500).json({ message: error.message || "Google authentication failed" });
    }
  });


  // Google implicit-flow: accepts an access_token directly (no code exchange needed).
  // Used by the mobile app which uses response_type=token to avoid redirect URI issues.
  app.post("/api/auth/google-token", async (req: Request, res: Response) => {
    try {
      const { accessToken } = req.body;
      if (!accessToken) {
        return res.status(400).json({ message: "accessToken is required" });
      }

      // Fetch user info directly from Google using the access token
      const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const googleUser = await userInfoRes.json() as any;

      if (!googleUser.email) {
        return res.status(400).json({ message: "Could not retrieve email from Google" });
      }

      // Use full email as username so Google and manual accounts share the same record
      const email = googleUser.email.trim().toLowerCase();
      let user = await storage.getUserByUsername(email);

      if (!user) {
        const randomPassword = await bcrypt.hash(Math.random().toString(36), 10);
        user = await storage.createUser({
          username: email,
          password: randomPassword,
          name: googleUser.name || email.split("@")[0],
          phone: null,
          role: "client",
        });
      }

      const token = signAccessToken({ sub: user.id, role: user.role as UserRole, email: user.username, name: user.name });
      setAuthCookie(res, token);
      const { password: _pw, ...safeUser } = user;
      return res.json({ user: safeUser, accessToken: token });
    } catch (error: any) {
      console.error("Google token auth error:", error);
      return res.status(500).json({ message: error.message || "Google authentication failed" });
    }
  });

  app.post("/api/chauffeurs", authOptional, async (req: AuthedRequest, res: Response) => {
    try {
      const userId = req.body.userId;
      const currentYear = new Date().getFullYear();
      const rawVehicleYear = req.body.vehicleYear;

      // If authenticated, only allow creating/updating own chauffeur profile (unless admin)
      if (req.auth && req.auth.role !== "admin" && req.auth.sub !== userId) {
        return res.status(403).json({ message: "You can only register your own chauffeur profile" });
      }

      // Auto-upsert user in this DB — handles cross-environment tokens (e.g. Railway user vs dev DB)
      if (userId) {
        const existingUser = await storage.getUser(userId);
        if (!existingUser) {
          const randomPw = Math.random().toString(36).slice(2);
          await storage.createUser({
            id: userId,
            username: `driver_${userId.slice(0, 12)}@a2blift.placeholder`,
            password: randomPw,
            name: req.body.name || "A2B Driver",
            phone: req.body.phone || null,
            role: "chauffeur",
          });
        }
      }

      // Upsert: if chauffeur already exists for this user, update instead of creating duplicate
      if (!userId) return res.status(400).json({ message: "userId is required" });
      let chauffeur;
      const existingChauffeur = await storage.getChauffeurByUserId(userId);
      const normalizedVehicleYear = rawVehicleYear == null || rawVehicleYear === ""
        ? existingChauffeur?.vehicleYear ?? null
        : Number.parseInt(String(rawVehicleYear), 10);

      if (!Number.isFinite(normalizedVehicleYear) || normalizedVehicleYear == null) {
        return res.status(400).json({ message: "Please add your vehicle model year before continuing." });
      }
      if (normalizedVehicleYear < 2015 || normalizedVehicleYear > currentYear + 1) {
        return res.status(400).json({ message: `Please enter a vehicle model year between 2015 and ${currentYear + 1}.` });
      }

      if (existingChauffeur) {
        chauffeur = await storage.updateChauffeur(existingChauffeur.id, {
          carMake: req.body.carMake || existingChauffeur.carMake,
          vehicleModel: req.body.vehicleModel || existingChauffeur.vehicleModel,
          vehicleYear: normalizedVehicleYear,
          plateNumber: req.body.plateNumber || existingChauffeur.plateNumber,
          vehicleType: req.body.vehicleType || existingChauffeur.vehicleType,
          carColor: req.body.carColor || existingChauffeur.carColor,
          phone: req.body.phone || existingChauffeur.phone,
          passengerCapacity: req.body.passengerCapacity || existingChauffeur.passengerCapacity,
          luggageCapacity: req.body.luggageCapacity || existingChauffeur.luggageCapacity,
          profilePhoto: req.body.profilePhoto || existingChauffeur.profilePhoto,
        });
      } else {
        chauffeur = await storage.createChauffeur({
          ...req.body,
          vehicleYear: normalizedVehicleYear,
        });
      }
      await storage.updateUser(req.body.userId, { role: "chauffeur" });

      // Create/ensure a driver application (pending) for admin review
      const existingApp = await storage.getDriverApplicationByUserId(req.body.userId);
      if (!existingApp) {
        await storage.createDriverApplication({
          userId: req.body.userId,
          chauffeurId: chauffeur!.id,
          status: "pending",
        });
      } else if (existingApp.chauffeurId !== chauffeur!.id) {
        await storage.updateDriverApplication(existingApp.id, { chauffeurId: chauffeur!.id });
      }

      return res.json(chauffeur);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  const PARTNER_REQUIRED_DOCS = new Set([
    "partner:director_id",
    "partner:proof_of_address",
    "partner:bank_account_details",
  ]);
  const VEHICLE_REQUIRED_DOCS = new Set([
    "vehicle:double_license_disk",
    "vehicle:passenger_liability_insurance",
    "vehicle:dekra_report",
  ]);

  function requireStringField(body: any, field: string) {
    const value = String(body?.[field] || "").trim();
    if (!value) throw new Error(`${field} is required`);
    return value;
  }

  function optionalStringField(body: any, field: string) {
    return String(body?.[field] || "").trim();
  }

  async function getOrCreateOperatorProfile(options: {
    userId: string;
    type: "driver" | "partner";
    status?: string;
  }) {
    const existing = await storage.getOperatorProfileByUserId(options.userId);
    if (existing) {
      if (existing.type !== options.type) {
        throw new Error(`This account is already registered as a ${existing.type}`);
      }
      return storage.updateOperatorProfile(existing.id, {
        status: resolveOperatorSubmissionStatus({
          existingStatus: existing.status,
          requestedStatus: options.status,
        }),
        submittedAt: new Date(),
      });
    }

    return storage.createOperatorProfile({
      userId: options.userId,
      type: options.type,
      status: options.status || "pending",
      submittedAt: new Date(),
    });
  }

  async function syncDriverOperatorReview(options: {
    userId?: string | null;
    status: string;
    adminId?: string | null;
    reason?: string | null;
  }) {
    const userId = String(options.userId || "").trim();
    if (!userId) return null;

    const existing = await storage.getOperatorProfileByUserId(userId).catch(() => undefined);
    const reviewUpdate = {
      status: options.status,
      rejectionReason: options.status === "rejected" || options.status === "waitlisted"
        ? String(options.reason || "").trim() || null
        : null,
      reviewedAt: new Date(),
      reviewerAdminId: options.adminId || null,
    };

    if (existing) {
      if (existing.type !== "driver") return existing;
      return storage.updateOperatorProfile(existing.id, reviewUpdate);
    }

    return storage.createOperatorProfile({
      userId,
      type: "driver",
      submittedAt: new Date(),
      ...reviewUpdate,
    });
  }

  async function serializeOperatorProfile(profile: any) {
    const [user, chauffeur, partnerProfile] = await Promise.all([
      storage.getUser(profile.userId).catch(() => undefined),
      profile.type === "driver" ? storage.getChauffeurByUserId(profile.userId).catch(() => undefined) : Promise.resolve(null),
      profile.type === "partner" ? storage.getPartnerProfileByOperatorId(profile.id).catch(() => undefined) : Promise.resolve(null),
    ]);
    const safeUser = user ? (({ password: _password, ...rest }) => rest)(user as any) : null;
    return { ...profile, user: safeUser, chauffeur: chauffeur || null, partnerProfile: partnerProfile || null };
  }

  function escapeHtml(value: unknown): string {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getOperatorDisplayName(profile: any, partnerProfile?: any | null, user?: any | null): string {
    return (
      partnerProfile?.companyName ||
      partnerProfile?.company_name ||
      user?.name ||
      (profile?.type === "partner" ? "A2B fleet partner" : "A2B operator")
    );
  }

  function buildFleetInviteEmail(options: {
    inviteId: string;
    driverName: string;
    managerName: string;
    managerEmail?: string | null;
    message?: string | null;
  }) {
    const appUrl = (
      process.env.EXPO_PUBLIC_REFERRAL_LINK_BASE_URL ||
      process.env.PUBLIC_APP_URL ||
      process.env.EXPO_PUBLIC_DOMAIN ||
      "https://a2blift.com"
    ).replace(/\/$/, "");
    const acceptUrl = `${appUrl}/dashboard.html?fleetInvite=${encodeURIComponent(options.inviteId)}`;
    const note = options.message?.trim();
    const safeDriverName = escapeHtml(options.driverName || "Driver");
    const safeManagerName = escapeHtml(options.managerName);
    const safeManagerEmail = escapeHtml(options.managerEmail || "support@a2blift.com");

    const text = [
      `Hello ${options.driverName || "Driver"},`,
      "",
      `${options.managerName} has invited you to join their A2B LIFT fleet/team.`,
      note ? `Message: ${note}` : "",
      "",
      `Open A2B LIFT Driver to accept or decline this invite. Invite link: ${acceptUrl}`,
      "",
      "A2B LIFT",
    ].filter(Boolean).join("\n");

    const html = `
      <!doctype html>
      <html>
        <body style="margin:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#111;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:28px 12px;">
            <tr>
              <td align="center">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border-radius:22px;overflow:hidden;border:1px solid #e5e7eb;">
                  <tr>
                    <td style="background:#050505;padding:30px 32px;color:#fff;">
                      <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#bdbdbd;font-weight:700;">A2B LIFT Fleet Invite</div>
                      <h1 style="margin:12px 0 0;font-size:28px;line-height:1.15;">You have been invited to join a fleet</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:30px 32px;">
                      <p style="margin:0 0 16px;font-size:16px;line-height:1.65;">Hello ${safeDriverName},</p>
                      <p style="margin:0 0 16px;font-size:16px;line-height:1.65;"><strong>${safeManagerName}</strong> has invited you to join their A2B LIFT fleet/team.</p>
                      ${note ? `<div style="margin:20px 0;padding:16px;border-radius:14px;background:#f7f7f7;border:1px solid #ececec;"><div style="font-size:12px;text-transform:uppercase;letter-spacing:1.4px;color:#777;font-weight:700;margin-bottom:8px;">Message</div><div style="font-size:15px;line-height:1.6;">${escapeHtml(note)}</div></div>` : ""}
                      <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#444;">Open your A2B LIFT Driver app to review the invite. You can accept or decline it from your Fleet screen.</p>
                      <a href="${acceptUrl}" style="display:inline-block;background:#050505;color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 22px;border-radius:999px;">Review fleet invite</a>
                      <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#777;">If you have questions, contact ${safeManagerName} or reply to A2B support at ${safeManagerEmail}.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;

    return { subject: `${options.managerName} invited you to join their A2B LIFT fleet`, html, text };
  }

  async function sendFleetInviteEmail(options: {
    inviteId: string;
    to: string;
    driverName: string;
    managerName: string;
    managerEmail?: string | null;
    message?: string | null;
  }) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return { emailStatus: "pending_configuration", emailError: "RESEND_API_KEY is not configured", resendId: null };
    }
    const from = process.env.RESEND_FROM_EMAIL || "A2B LIFT <support@a2blift.com>";
    const email = buildFleetInviteEmail(options);
    try {
      const response = await axios.post(
        "https://api.resend.com/emails",
        {
          from,
          to: [options.to],
          subject: email.subject,
          html: email.html,
          text: email.text,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 12000,
        },
      );
      return { emailStatus: "sent", emailError: null, resendId: response.data?.id || null };
    } catch (error: any) {
      return {
        emailStatus: "failed",
        emailError: error?.response?.data?.message || error?.message || "Resend email failed",
        resendId: null,
      };
    }
  }

  async function serializeFleetInvite(row: any) {
    const [driverProfile, managerProfile] = await Promise.all([
      storage.getOperatorProfile(row.driver_operator_profile_id || row.driverOperatorProfileId).catch(() => undefined),
      storage.getOperatorProfile(row.invited_by_operator_profile_id || row.invitedByOperatorProfileId).catch(() => undefined),
    ]);
    const [driver, manager] = await Promise.all([
      driverProfile ? serializeOperatorProfile(driverProfile) : Promise.resolve(null),
      managerProfile ? serializeOperatorProfile(managerProfile) : Promise.resolve(null),
    ]);
    return {
      id: row.id,
      driverOperatorProfileId: row.driver_operator_profile_id || row.driverOperatorProfileId,
      invitedByOperatorProfileId: row.invited_by_operator_profile_id || row.invitedByOperatorProfileId,
      invitedByUserId: row.invited_by_user_id || row.invitedByUserId,
      status: row.status,
      emailStatus: row.email_status || row.emailStatus,
      emailError: row.email_error || row.emailError,
      message: row.message,
      resendId: row.resend_id || row.resendId,
      sentAt: row.sent_at || row.sentAt,
      acceptedAt: row.accepted_at || row.acceptedAt,
      declinedAt: row.declined_at || row.declinedAt,
      createdAt: row.created_at || row.createdAt,
      updatedAt: row.updated_at || row.updatedAt,
      driver,
      manager,
    };
  }

  async function serializeVehicle(vehicle: any) {
    const [ownerProfile, documents, assignments] = await Promise.all([
      storage.getOperatorProfile(vehicle.ownerOperatorProfileId).catch(() => undefined),
      storage.getDocumentsByVehicle(vehicle.id).catch(() => []),
      storage.getVehicleAssignments({ vehicleId: vehicle.id }).catch(() => []),
    ]);
    const owner = ownerProfile
      ? await serializeOperatorProfile(ownerProfile).catch((error) => ({
          ...ownerProfile,
          serializationWarning: error?.message || "Could not load owner details",
        }))
      : null;
    const enrichedAssignments = await Promise.all(assignments.map(async (assignment) => {
      const driverProfile = await storage.getOperatorProfile(assignment.driverOperatorProfileId).catch(() => undefined);
      return {
        ...assignment,
        driver: driverProfile
          ? await serializeOperatorProfile(driverProfile).catch((error) => ({
              ...driverProfile,
              serializationWarning: error?.message || "Could not load driver details",
            }))
          : null,
      };
    }));
    return { ...vehicle, owner, documents, assignments: enrichedAssignments };
  }

  async function ensureDriverOperatorForChauffeur(userId: string) {
    let profile = await storage.getOperatorProfileByUserId(userId);
    const chauffeur = await storage.getChauffeurByUserId(userId).catch(() => undefined);
    if (!chauffeur) return profile || null;

    if (!profile) {
      profile = await storage.createOperatorProfile({
        userId,
        type: "driver",
        status: chauffeur.isApproved ? "approved" : "pending",
        submittedAt: chauffeur.createdAt || new Date(),
      });
    }

    if (profile.type !== "driver") return profile;

    const reconciledStatus = reconcileDriverProfileStatus({
      profileType: profile.type,
      profileStatus: profile.status,
      chauffeurApproved: chauffeur.isApproved,
    });
    if (reconciledStatus !== profile.status) {
      profile = await storage.updateOperatorProfile(profile.id, {
        status: reconciledStatus,
        rejectionReason: null,
        reviewedAt: new Date(),
      }) || profile;
    }

    const ownedVehicles = await storage.getVehiclesByOwnerOperator(profile.id).catch(() => []);
    const hasLegacyVehicle = !!(chauffeur.carMake || chauffeur.vehicleModel || chauffeur.plateNumber);
    if (ownedVehicles.length === 0 && hasLegacyVehicle) {
      const currentYear = new Date().getFullYear();
      const vehicleYear = Number(chauffeur.vehicleYear) || currentYear;
      const vehicle = await storage.createVehicle({
        ownerOperatorProfileId: profile.id,
        status: chauffeur.isApproved ? "approved" : "pending",
        submittedAt: chauffeur.createdAt || new Date(),
        carMake: String(chauffeur.carMake || "A2B").trim(),
        vehicleModel: String(chauffeur.vehicleModel || "Vehicle").trim(),
        vehicleYear,
        plateNumber: String(chauffeur.plateNumber || `LEGACY-${chauffeur.id.slice(0, 6)}`).trim().toUpperCase(),
        vehicleType: String(chauffeur.vehicleType || "budget").trim(),
        carColor: String(chauffeur.carColor || "Unknown").trim(),
        passengerCapacity: chauffeur.passengerCapacity || 4,
        luggageCapacity: chauffeur.luggageCapacity || 2,
      });
      await storage.createVehicleAssignment({
        vehicleId: vehicle.id,
        driverOperatorProfileId: profile.id,
        assignedByOperatorProfileId: profile.id,
        status: "active",
      });
      if (chauffeur.isApproved) {
        await storage.updateChauffeur(chauffeur.id, { activeVehicleId: vehicle.id });
      }
    }

    return profile;
  }

  app.get("/api/operator-profile/me", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const profile = await ensureDriverOperatorForChauffeur(req.auth!.sub);
      const chauffeur = await storage.getChauffeurByUserId(req.auth!.sub).catch(() => undefined);
      if (!profile) return res.status(404).json({ message: "Operator profile not found" });
      const partnerProfile = profile.type === "partner"
        ? await storage.getPartnerProfileByOperatorId(profile.id)
        : null;
      return res.json({ profile, partnerProfile, chauffeur: chauffeur || null });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/operator-profile/me/documents", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const docs = await storage.getDocumentsByUser(req.auth!.sub);
      return res.json(docs.filter((doc) => String(doc.type || "").startsWith("driver:") || String(doc.type || "").startsWith("partner:")));
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/operator-profile/documents", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const type = requireStringField(req.body, "type");
      const url = requireStringField(req.body, "url");
      if (!type.startsWith("driver:") && !type.startsWith("partner:")) {
        return res.status(400).json({ message: "Document type must start with driver: or partner:" });
      }

      const existingDocs = await storage.getDocumentsByUser(req.auth!.sub);
      const existing = existingDocs.find((doc) =>
        doc.type === type &&
        !doc.applicationId &&
        !doc.chauffeurId &&
        !doc.vehicleId
      );
      if (existing) {
        const updated = await storage.updateDocument(existing.id, {
          url,
          status: "pending",
          reviewedAt: null,
          reviewerAdminId: null,
        });
        return res.json(updated);
      }

      const doc = await storage.createDocument({
        userId: req.auth!.sub,
        applicationId: null,
        chauffeurId: null,
        vehicleId: null,
        type,
        url,
        status: "pending",
      });
      return res.status(201).json(doc);
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/operator-profile/driver", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const phone = requireStringField(req.body, "phone");
      const profile = await getOrCreateOperatorProfile({
        userId: req.auth!.sub,
        type: "driver",
        status: "pending",
      });
      if (!profile) return res.status(500).json({ message: "Could not create driver profile" });

      let chauffeur = await storage.getChauffeurByUserId(req.auth!.sub);
      if (chauffeur) {
        chauffeur = await storage.updateChauffeur(chauffeur.id, {
          phone,
          profilePhoto: req.body.profilePhoto || chauffeur.profilePhoto,
          isApproved: profile.status === "approved" ? true : chauffeur.isApproved,
        });
      } else {
        chauffeur = await storage.createChauffeur({
          userId: req.auth!.sub,
          phone,
          profilePhoto: req.body.profilePhoto || null,
          isApproved: false,
        });
      }

      await storage.updateUser(req.auth!.sub, { role: "chauffeur", phone });
      let application = await storage.getDriverApplicationByUserId(req.auth!.sub);
      if (application) {
        application = await storage.updateDriverApplication(application.id, {
          chauffeurId: chauffeur!.id,
          status: "pending",
          submittedAt: new Date(),
        });
      } else {
        application = await storage.createDriverApplication({
          userId: req.auth!.sub,
          chauffeurId: chauffeur!.id,
          status: "pending",
          submittedAt: new Date(),
        });
      }

      return res.status(201).json({ profile, chauffeur, application });
    } catch (error: any) {
      const message = error.message || "Failed to submit driver profile";
      return res.status(message.includes("already registered") ? 409 : 400).json({ message });
    }
  });

  app.post("/api/operator-profile/partner", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const partnerData = {
        companyName: optionalStringField(req.body, "companyName"),
        registrationNumber: optionalStringField(req.body, "registrationNumber"),
        contactPersonName: requireStringField(req.body, "contactPersonName"),
        contactPhone: requireStringField(req.body, "contactPhone"),
        contactEmail: requireStringField(req.body, "contactEmail"),
        bankName: requireStringField(req.body, "bankName"),
        accountHolder: requireStringField(req.body, "accountHolder"),
        accountNumber: requireStringField(req.body, "accountNumber"),
      };
      const docs = await storage.getDocumentsByUser(req.auth!.sub);
      const uploadedTypes = new Set(docs.map((doc) => doc.type));
      const missingDocs = [...PARTNER_REQUIRED_DOCS].filter((type) => !uploadedTypes.has(type));
      if (missingDocs.length > 0) {
        return res.status(400).json({
          message: `Please upload all required partner documents: ${missingDocs.map((type) => type.replace("partner:", "")).join(", ")}`,
        });
      }

      const profile = await getOrCreateOperatorProfile({
        userId: req.auth!.sub,
        type: "partner",
        status: "pending",
      });
      if (!profile) return res.status(500).json({ message: "Could not create partner profile" });
      const existingPartnerProfile = await storage.getPartnerProfileByOperatorId(profile.id);
      const partnerProfile = existingPartnerProfile
        ? await storage.updatePartnerProfile(existingPartnerProfile.id, partnerData)
        : await storage.createPartnerProfile({
            operatorProfileId: profile.id,
            ...partnerData,
          });

      await storage.updateUser(req.auth!.sub, { role: "chauffeur", phone: partnerData.contactPhone });
      return res.status(201).json({ profile, partnerProfile });
    } catch (error: any) {
      const message = error.message || "Failed to submit partner profile";
      return res.status(message.includes("already registered") ? 409 : 400).json({ message });
    }
  });

  app.get("/api/vehicles", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const profile = await ensureDriverOperatorForChauffeur(req.auth!.sub);
      if (!profile) return res.status(404).json({ message: "Operator profile not found" });
      const ownedVehicles = await storage.getVehiclesByOwnerOperator(profile.id);
      const assignments = profile.type === "driver"
        ? await storage.getVehicleAssignments({ driverOperatorProfileId: profile.id, status: "active" })
        : [];
      const assignedVehicles = await Promise.all(
        assignments
          .filter((assignment) => !ownedVehicles.some((vehicle) => vehicle.id === assignment.vehicleId))
          .map((assignment) => storage.getVehicle(assignment.vehicleId)),
      );
      return res.json({
        vehicles: [...ownedVehicles, ...assignedVehicles.filter(Boolean)],
        assignments,
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/vehicles", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const profile = await ensureDriverOperatorForChauffeur(req.auth!.sub);
      if (!profile) return res.status(404).json({ message: "Operator profile not found" });
      if (profile.status !== "approved") {
        return res.status(403).json({ message: "Your operator profile must be approved before adding vehicles." });
      }
      const currentYear = new Date().getFullYear();
      const vehicleYear = Number.parseInt(requireStringField(req.body, "vehicleYear"), 10);
      if (!Number.isFinite(vehicleYear) || vehicleYear < 2015 || vehicleYear > currentYear + 1) {
        return res.status(400).json({ message: `Please enter a vehicle model year between 2015 and ${currentYear + 1}.` });
      }
      const vehicle = await storage.createVehicle({
        ownerOperatorProfileId: profile.id,
        status: req.body.submit ? "pending" : "draft",
        submittedAt: req.body.submit ? new Date() : null,
        carMake: requireStringField(req.body, "carMake"),
        vehicleModel: requireStringField(req.body, "vehicleModel"),
        vehicleYear,
        plateNumber: requireStringField(req.body, "plateNumber").toUpperCase(),
        vehicleType: requireStringField(req.body, "vehicleType"),
        carColor: requireStringField(req.body, "carColor"),
        passengerCapacity: Number.parseInt(String(req.body.passengerCapacity || "4"), 10) || 4,
        luggageCapacity: Number.parseInt(String(req.body.luggageCapacity || "2"), 10) || 2,
      });
      return res.status(201).json(vehicle);
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/vehicles/:id", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const profile = await storage.getOperatorProfileByUserId(req.auth!.sub);
      if (!profile) return res.status(404).json({ message: "Operator profile not found" });
      const vehicle = await storage.getVehicle(req.params.id);
      if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });
      const assignment = await storage.getActiveVehicleAssignment(vehicle.id, profile.id);
      if (vehicle.ownerOperatorProfileId !== profile.id && !assignment && req.auth!.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }
      const documents = await storage.getDocumentsByVehicle(vehicle.id);
      return res.json({ vehicle, documents, assignment: assignment || null });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/vehicles/:id", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const vehicle = await storage.getVehicle(req.params.id);
      if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });
      if (req.auth!.role !== "admin") {
        const profile = await storage.getOperatorProfileByUserId(req.auth!.sub);
        if (!profile) return res.status(404).json({ message: "Operator profile not found" });
        if (vehicle.ownerOperatorProfileId !== profile.id) {
          return res.status(403).json({ message: "Forbidden" });
        }
      }
      if (vehicle.status === "approved" && req.auth!.role !== "admin") {
        return res.status(400).json({ message: "Approved vehicles cannot be edited from the app. Contact support." });
      }
      const update: any = {};
      for (const field of ["carMake", "vehicleModel", "plateNumber", "vehicleType", "carColor"] as const) {
        if (req.body[field] !== undefined) update[field] = String(req.body[field]).trim();
      }
      if (req.body.vehicleYear !== undefined) update.vehicleYear = Number.parseInt(String(req.body.vehicleYear), 10);
      if (req.body.passengerCapacity !== undefined) update.passengerCapacity = Number.parseInt(String(req.body.passengerCapacity), 10) || 4;
      if (req.body.luggageCapacity !== undefined) update.luggageCapacity = Number.parseInt(String(req.body.luggageCapacity), 10) || 2;
      const updated = await storage.updateVehicle(vehicle.id, update);
      return res.json(updated);
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/vehicles/:id/documents", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const profile = await storage.getOperatorProfileByUserId(req.auth!.sub);
      if (!profile) return res.status(404).json({ message: "Operator profile not found" });
      const vehicle = await storage.getVehicle(req.params.id);
      if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });
      if (vehicle.ownerOperatorProfileId !== profile.id && req.auth!.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }
      const type = requireStringField(req.body, "type");
      const url = requireStringField(req.body, "url");
      if (!VEHICLE_REQUIRED_DOCS.has(type)) {
        return res.status(400).json({ message: "Invalid vehicle document type" });
      }
      const doc = await storage.createDocument({
        userId: req.auth!.sub,
        applicationId: null,
        chauffeurId: null,
        vehicleId: vehicle.id,
        type,
        url,
        status: "pending",
      });
      return res.status(201).json(doc);
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/vehicles/:id/submit", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const profile = await storage.getOperatorProfileByUserId(req.auth!.sub);
      if (!profile) return res.status(404).json({ message: "Operator profile not found" });
      const vehicle = await storage.getVehicle(req.params.id);
      if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });
      if (vehicle.ownerOperatorProfileId !== profile.id && req.auth!.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }
      const docs = await storage.getDocumentsByVehicle(vehicle.id);
      const uploadedTypes = new Set(docs.map((doc) => doc.type));
      const missingDocs = [...VEHICLE_REQUIRED_DOCS].filter((type) => !uploadedTypes.has(type));
      if (missingDocs.length > 0) {
        return res.status(400).json({
          message: `Please upload all required vehicle documents: ${missingDocs.map((type) => type.replace("vehicle:", "")).join(", ")}`,
        });
      }
      const updated = await storage.updateVehicle(vehicle.id, { status: "pending", submittedAt: new Date(), rejectionReason: null });
      return res.json(updated);
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/vehicles/:id/select-active", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const profile = await ensureDriverOperatorForChauffeur(req.auth!.sub);
      if (!profile) return res.status(404).json({ message: "Operator profile not found" });
      if (profile.type !== "driver" || profile.status !== "approved") {
        return res.status(403).json({ message: "Only approved drivers can select a driving vehicle." });
      }
      const [vehicle, chauffeur] = await Promise.all([
        storage.getVehicle(req.params.id),
        storage.getChauffeurByUserId(req.auth!.sub),
      ]);
      if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });
      if (!chauffeur) return res.status(404).json({ message: "Driver profile not found" });
      if (vehicle.status !== "approved") {
        return res.status(400).json({ message: "Select an approved vehicle before going online." });
      }
      const assignment = await storage.getActiveVehicleAssignment(vehicle.id, profile.id);
      if (!assignment) {
        return res.status(403).json({ message: "This vehicle is no longer approved or assigned to you." });
      }
      const updated = await storage.updateChauffeur(chauffeur.id, { activeVehicleId: vehicle.id });
      return res.json({ activeVehicleId: vehicle.id, chauffeur: updated });
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/fleet/approved-drivers", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const profile = await storage.getOperatorProfileByUserId(req.auth!.sub);
      if (!profile) return res.status(404).json({ message: "Operator profile not found" });
      if (profile.status !== "approved") {
        return res.status(403).json({ message: "Your operator profile must be approved first." });
      }
      const query = String(req.query.q || "").trim().toLowerCase();
      const driverProfiles = await storage.getOperatorProfiles({ type: "driver", status: "approved" });
      const drivers = await Promise.all(driverProfiles.map(serializeOperatorProfile));
      const filtered = drivers
        .filter((driver: any) => driver.id !== profile.id)
        .filter((driver: any) => {
          if (!query) return true;
          const haystack = [
            driver.user?.name,
            driver.user?.username,
            driver.user?.phone,
            driver.chauffeur?.phone,
          ].filter(Boolean).join(" ").toLowerCase();
          return haystack.includes(query);
        })
        .slice(0, 25);
      return res.json({ drivers: filtered });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/fleet/drivers/search", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const profile = await storage.getOperatorProfileByUserId(req.auth!.sub);
      if (!profile) return res.status(404).json({ message: "Operator profile not found" });
      if (profile.status !== "approved") {
        return res.status(403).json({ message: "Your operator profile must be approved first." });
      }
      const query = String(req.query.q || "").trim().toLowerCase();
      const driverProfiles = await storage.getOperatorProfiles({ type: "driver", status: "approved" });
      const drivers = await Promise.all(driverProfiles.map(serializeOperatorProfile));
      const filtered = drivers
        .filter((driver: any) => driver.id !== profile.id)
        .filter((driver: any) => {
          if (!query) return true;
          const haystack = [
            driver.user?.name,
            driver.user?.username,
            driver.user?.phone,
            driver.chauffeur?.phone,
          ].filter(Boolean).join(" ").toLowerCase();
          return haystack.includes(query);
        })
        .slice(0, 25);
      return res.json({ drivers: filtered });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/fleet/invites", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const profile = await storage.getOperatorProfileByUserId(req.auth!.sub);
      if (!profile) return res.status(404).json({ message: "Operator profile not found" });
      const [sentResult, receivedResult] = await Promise.all([
        pool.query(
          `
            SELECT *
            FROM fleet_driver_invites
            WHERE invited_by_operator_profile_id = $1
            ORDER BY created_at DESC
            LIMIT 100
          `,
          [profile.id],
        ),
        pool.query(
          `
            SELECT *
            FROM fleet_driver_invites
            WHERE driver_operator_profile_id = $1
            ORDER BY created_at DESC
            LIMIT 100
          `,
          [profile.id],
        ),
      ]);
      const [sentInvites, receivedInvites] = await Promise.all([
        Promise.all(sentResult.rows.map(serializeFleetInvite)),
        Promise.all(receivedResult.rows.map(serializeFleetInvite)),
      ]);
      return res.json({ sentInvites, receivedInvites });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/fleet/invites", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const profile = await storage.getOperatorProfileByUserId(req.auth!.sub);
      if (!profile) return res.status(404).json({ message: "Operator profile not found" });
      if (profile.status !== "approved") {
        return res.status(403).json({ message: "Your operator profile must be approved first." });
      }
      if (profile.type !== "partner") {
        return res.status(403).json({ message: "Only approved fleet partners can invite drivers to a fleet." });
      }

      const driverOperatorProfileId = requireStringField(req.body, "driverOperatorProfileId");
      const message = typeof req.body.message === "string" ? req.body.message.trim().slice(0, 600) : "";
      if (driverOperatorProfileId === profile.id) {
        return res.status(400).json({ message: "You cannot invite yourself." });
      }

      const [driverProfile, managerUser, managerPartner] = await Promise.all([
        storage.getOperatorProfile(driverOperatorProfileId),
        storage.getUser(profile.userId),
        storage.getPartnerProfileByOperatorId(profile.id).catch(() => undefined),
      ]);
      if (!driverProfile || driverProfile.type !== "driver" || driverProfile.status !== "approved") {
        return res.status(400).json({ message: "Only approved A2B drivers can be invited." });
      }
      const driverUser = await storage.getUser(driverProfile.userId);
      if (!driverUser?.username) {
        return res.status(400).json({ message: "This driver does not have an email address on file." });
      }

      const pending = await pool.query(
        `
          SELECT *
          FROM fleet_driver_invites
          WHERE driver_operator_profile_id = $1
            AND invited_by_operator_profile_id = $2
            AND status = 'pending'
          LIMIT 1
        `,
        [driverProfile.id, profile.id],
      );
      if (pending.rowCount && pending.rowCount > 0 && pending.rows[0]?.email_status === "sent") {
        return res.status(409).json({ message: "You already have a pending invite for this driver." });
      }
      let invite = pending.rows[0];
      if (invite) {
        const refreshed = await pool.query(
          `
            UPDATE fleet_driver_invites
            SET message = COALESCE($2, message),
                email_status = 'queued',
                email_error = NULL,
                updated_at = NOW()
            WHERE id = $1
            RETURNING *
          `,
          [invite.id, message || null],
        );
        invite = refreshed.rows[0];
      } else {
        const inserted = await pool.query(
          `
            INSERT INTO fleet_driver_invites (
              driver_operator_profile_id,
              invited_by_operator_profile_id,
              invited_by_user_id,
              status,
              email_status,
              message
            )
            VALUES ($1, $2, $3, 'pending', 'queued', $4)
            RETURNING *
          `,
          [driverProfile.id, profile.id, req.auth!.sub, message || null],
        );
        invite = inserted.rows[0];
      }
      const managerName = getOperatorDisplayName(profile, managerPartner, managerUser);
      const emailResult = await sendFleetInviteEmail({
        inviteId: invite.id,
        to: driverUser.username,
        driverName: driverUser.name || "Driver",
        managerName,
        managerEmail: managerUser?.username || managerPartner?.contactEmail || null,
        message,
      });
      const updated = await pool.query(
        `
          UPDATE fleet_driver_invites
          SET email_status = $2,
              email_error = $3,
              resend_id = $4,
              sent_at = CASE WHEN $2 = 'sent' THEN NOW() ELSE sent_at END,
              updated_at = NOW()
          WHERE id = $1
          RETURNING *
        `,
        [invite.id, emailResult.emailStatus, emailResult.emailError, emailResult.resendId],
      );

      await notifyUserEvent({
        userId: driverProfile.userId,
        type: "fleet_invite",
        title: "Fleet invite received",
        body: `${managerName} invited you to join their A2B LIFT fleet/team.`,
        data: { inviteId: invite.id, invitedByOperatorProfileId: profile.id },
      });

      return res.status(201).json({ invite: await serializeFleetInvite(updated.rows[0]) });
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.put("/api/fleet/invites/:id/respond", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const status = String(req.body?.status || "").toLowerCase();
      if (!["accepted", "declined"].includes(status)) {
        return res.status(400).json({ message: "Invite status must be accepted or declined." });
      }
      const profile = await storage.getOperatorProfileByUserId(req.auth!.sub);
      if (!profile) return res.status(404).json({ message: "Operator profile not found" });
      const existing = await pool.query("SELECT * FROM fleet_driver_invites WHERE id = $1 LIMIT 1", [req.params.id]);
      const invite = existing.rows[0];
      if (!invite) return res.status(404).json({ message: "Invite not found" });
      if (invite.driver_operator_profile_id !== profile.id) {
        return res.status(403).json({ message: "Only the invited driver can respond to this invite." });
      }
      if (invite.status !== "pending") {
        return res.status(409).json({ message: "This invite has already been responded to." });
      }
      const updated = await pool.query(
        `
          UPDATE fleet_driver_invites
          SET status = $2,
              accepted_at = CASE WHEN $2 = 'accepted' THEN NOW() ELSE accepted_at END,
              declined_at = CASE WHEN $2 = 'declined' THEN NOW() ELSE declined_at END,
              updated_at = NOW()
          WHERE id = $1
          RETURNING *
        `,
        [invite.id, status],
      );
      const managerProfile = await storage.getOperatorProfile(invite.invited_by_operator_profile_id).catch(() => undefined);
      if (managerProfile) {
        const driverUser = await storage.getUser(profile.userId).catch(() => undefined);
        await notifyUserEvent({
          userId: managerProfile.userId,
          type: "fleet_invite_response",
          title: status === "accepted" ? "Fleet invite accepted" : "Fleet invite declined",
          body: `${driverUser?.name || "A driver"} ${status} your fleet invite.`,
          data: { inviteId: invite.id, driverOperatorProfileId: profile.id },
        });
      }
      return res.json({ invite: await serializeFleetInvite(updated.rows[0]) });
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/fleet/overview", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const profile = await ensureDriverOperatorForChauffeur(req.auth!.sub);
      if (!profile) return res.status(404).json({ message: "Operator profile not found" });
      const vehicles = await storage.getVehiclesByOwnerOperator(profile.id);
      const vehicleIds = new Set(vehicles.map((vehicle) => vehicle.id));
      const assignments = await storage.getVehicleAssignments(
        profile.type === "driver"
          ? { driverOperatorProfileId: profile.id, status: "active" }
          : { assignedByOperatorProfileId: profile.id, status: "active" },
      );
      assignments.forEach((assignment) => vehicleIds.add(assignment.vehicleId));
      const activeStatuses = new Set(["chauffeur_assigned", "chauffeur_arriving", "trip_started"]);
      const activeTrips = (await storage.getAllRides())
        .filter((ride: any) => ride.vehicleId && vehicleIds.has(ride.vehicleId) && activeStatuses.has(ride.status));
      return res.json({
        overview: {
          vehicles: vehicles.length,
          approvedVehicles: vehicles.filter((vehicle) => vehicle.status === "approved").length,
          pendingApprovals: vehicles.filter((vehicle) => vehicle.status === "pending").length,
          assignedDrivers: new Set(assignments.map((assignment) => assignment.driverOperatorProfileId)).size,
          activeTrips: activeTrips.length,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/fleet/assignments", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const profile = await storage.getOperatorProfileByUserId(req.auth!.sub);
      if (!profile) return res.status(404).json({ message: "Operator profile not found" });
      const assignments = await storage.getVehicleAssignments(
        profile.type === "driver"
          ? { driverOperatorProfileId: profile.id }
          : { assignedByOperatorProfileId: profile.id },
      );
      const enriched = await Promise.all(assignments.map(async (assignment) => {
        const [vehicle, driverProfile] = await Promise.all([
          storage.getVehicle(assignment.vehicleId),
          storage.getOperatorProfile(assignment.driverOperatorProfileId),
        ]);
        return {
          ...assignment,
          vehicle: vehicle || null,
          driver: driverProfile ? await serializeOperatorProfile(driverProfile) : null,
        };
      }));
      return res.json({ assignments: enriched });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/fleet/assignments", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const profile = await storage.getOperatorProfileByUserId(req.auth!.sub);
      if (!profile) return res.status(404).json({ message: "Operator profile not found" });
      if (profile.status !== "approved") {
        return res.status(403).json({ message: "Your operator profile must be approved first." });
      }
      const vehicleId = requireStringField(req.body, "vehicleId");
      const driverOperatorProfileId = requireStringField(req.body, "driverOperatorProfileId");
      const [vehicle, driverProfile] = await Promise.all([
        storage.getVehicle(vehicleId),
        storage.getOperatorProfile(driverOperatorProfileId),
      ]);
      if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });
      if (!driverProfile || driverProfile.type !== "driver" || driverProfile.status !== "approved") {
        return res.status(400).json({ message: "Only approved A2B drivers can be assigned to vehicles." });
      }
      if (vehicle.ownerOperatorProfileId !== profile.id) {
        return res.status(403).json({ message: "You can only assign drivers to vehicles you own." });
      }
      if (vehicle.status !== "approved") {
        return res.status(400).json({ message: "Vehicle must be approved before assigning a driver." });
      }
      const existing = await storage.getActiveVehicleAssignment(vehicle.id, driverProfile.id);
      if (existing) return res.status(409).json({ message: "This driver is already assigned to this vehicle." });

      const assignment = await storage.createVehicleAssignment({
        vehicleId: vehicle.id,
        driverOperatorProfileId: driverProfile.id,
        assignedByOperatorProfileId: profile.id,
        status: "active",
      });
      const ownerLabel = profile.type === "partner" ? "A fleet partner" : "A2B LIFT";
      await notifyUserEvent({
        userId: driverProfile.userId,
        type: "vehicle_assignment",
        title: "Vehicle assigned",
        body: `${ownerLabel} assigned you to ${vehicle.carMake} ${vehicle.vehicleModel} (${vehicle.plateNumber}).`,
        data: { vehicleId: vehicle.id, assignmentId: assignment.id },
      });
      if (driverProfile.userId !== profile.userId) {
        await notifyUserEvent({
          userId: profile.userId,
          type: "vehicle_assignment",
          title: "Driver assigned",
          body: "The driver has been linked to your vehicle.",
          data: { vehicleId: vehicle.id, assignmentId: assignment.id },
        });
      }
      return res.status(201).json(assignment);
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/fleet/assignments/:id", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const profile = await storage.getOperatorProfileByUserId(req.auth!.sub);
      if (!profile) return res.status(404).json({ message: "Operator profile not found" });
      const [assignment] = await storage.getVehicleAssignments({ status: "active" })
        .then((rows) => rows.filter((row) => row.id === req.params.id));
      if (!assignment) return res.status(404).json({ message: "Assignment not found" });
      if (assignment.assignedByOperatorProfileId !== profile.id && req.auth!.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }
      const [updated, vehicle, driverProfile] = await Promise.all([
        storage.updateVehicleAssignment(assignment.id, { status: "removed", removedAt: new Date() }),
        storage.getVehicle(assignment.vehicleId),
        storage.getOperatorProfile(assignment.driverOperatorProfileId),
      ]);
      if (driverProfile) {
        const chauffeur = await storage.getChauffeurByUserId(driverProfile.userId).catch(() => undefined);
        if (chauffeur?.activeVehicleId === assignment.vehicleId) {
          await storage.updateChauffeur(chauffeur.id, { activeVehicleId: null, isOnline: false });
        }
        await notifyUserEvent({
          userId: driverProfile.userId,
          type: "vehicle_assignment_removed",
          title: "Vehicle assignment removed",
          body: vehicle ? `You are no longer assigned to ${vehicle.carMake} ${vehicle.vehicleModel} (${vehicle.plateNumber}).` : "A vehicle assignment was removed.",
          data: { vehicleId: assignment.vehicleId, assignmentId: assignment.id },
        });
      }
      return res.json(updated);
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/chauffeurs/user/:userId", async (req: Request, res: Response) => {
    try {
      const chauffeur = await storage.getChauffeurByUserId(req.params.userId);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      const application = await storage.getDriverApplicationByUserId(req.params.userId).catch(() => undefined);
      return res.json({
        ...chauffeur,
        applicationStatus: application?.status || (chauffeur.isApproved ? "approved" : "pending"),
        applicationNotes: application?.notes || null,
        waitlistReason: application?.status === "waitlisted" ? application?.notes || null : null,
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/chauffeurs/:id/push-token", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { pushToken } = req.body;
      if (!pushToken || typeof pushToken !== "string") {
        return res.status(400).json({ message: "pushToken is required" });
      }
      if (!pushToken.startsWith("ExponentPushToken[") && !pushToken.startsWith("ExpoPushToken[")) {
        return res.status(400).json({ message: "Invalid Expo push token" });
      }
      // Verify the chauffeur belongs to the authenticated user
      const chauffeur = await storage.getChauffeur(req.params.id);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      if (chauffeur.userId !== req.auth!.sub && req.auth!.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }
      await storage.updateChauffeur(req.params.id, { pushToken });
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/chauffeurs/:id", async (req: Request, res: Response) => {
    try {
      const chauffeur = await storage.getChauffeur(req.params.id);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      const [ratings, earningsList] = await Promise.all([
        storage.getRatingsByChauffeur(req.params.id),
        storage.getEarningsByChauffeur(req.params.id).catch(() => []),
      ]);
      const application = chauffeur.userId
        ? await storage.getDriverApplicationByUserId(chauffeur.userId).catch(() => undefined)
        : undefined;
      const computedRating =
        ratings.length > 0
          ? parseFloat((ratings.reduce((s, r) => s + r.rating, 0) / ratings.length).toFixed(1))
          : null;
      const cardEarningsTotal = (earningsList as any[])
        .filter((e: any) => e.type === "card" || e.type === "wallet")
        .reduce((s: number, e: any) => s + (e.amount || 0), 0);
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      // Today's earnings: digital earnings already store the driver's net share,
      // while cash trips contribute the driver's net take-home after commission.
      const todayCardEarnings = (earningsList as any[])
        .filter((e: any) => e.createdAt && new Date(e.createdAt) >= todayStart && (e.type === "card" || e.type === "wallet"))
        .reduce((s: number, e: any) => s + (e.amount || 0), 0);
      // For cash: convert each completed fare into the driver's net share.
      const chauffeurRides = await storage.getRidesByChauffeur(req.params.id);
      const todayCashFares = chauffeurRides
        .filter((r: any) => r.status === "trip_completed" && r.paymentMethod === "cash" && r.completedAt && new Date(r.completedAt) >= todayStart)
        .reduce((s: number, r: any) => s + calculateChauffeurEarnings(r.price || 0).chauffeurEarnings, 0);
      const todayEarnings = Math.round(todayCardEarnings + todayCashFares);
      return res.json({
        ...chauffeur,
        computedRating,
        totalRatings: ratings.length,
        cardEarningsTotal,
        todayEarnings,
        applicationStatus: application?.status || (chauffeur.isApproved ? "approved" : "pending"),
        applicationNotes: application?.notes || null,
        waitlistReason: application?.status === "waitlisted" ? application?.notes || null : null,
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/chauffeurs/:id/details", async (req: Request, res: Response) => {
    try {
      const chauffeur = await storage.getChauffeur(req.params.id);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      const user = await storage.getUser(chauffeur.userId);
      const ratings = await storage.getRatingsByChauffeur(req.params.id);
      const avgRating =
        ratings.length > 0
          ? parseFloat((ratings.reduce((s, r) => s + r.rating, 0) / ratings.length).toFixed(1))
          : null;
      return res.json({
        ...chauffeur,
        driverName: user?.name || "Chauffeur",
        driverPhone: chauffeur.phone || user?.phone || null,
        driverRating: avgRating,
        totalRatings: ratings.length,
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/chauffeurs/:id/profile", async (req: Request, res: Response) => {
    try {
      const chauffeur = await storage.getChauffeur(req.params.id);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      const user = await storage.getUser(chauffeur.userId);
      const ratings = await storage.getRatingsByChauffeur(req.params.id);

      const avgRating =
        ratings.length > 0
          ? parseFloat((ratings.reduce((s, r) => s + r.rating, 0) / ratings.length).toFixed(2))
          : null;

      const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      ratings.forEach((r) => { distribution[r.rating] = (distribution[r.rating] || 0) + 1; });

      const uniqueClientIds = [...new Set(ratings.slice(0, 30).map((r) => r.clientId))];
      const reviewerMap: Record<string, string> = {};
      await Promise.all(
        uniqueClientIds.map(async (id) => {
          const u = await storage.getUser(id);
          if (u) reviewerMap[id] = u.name;
        })
      );

      const ratingsWithNames = ratings.slice(0, 30).map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        reviewerName: reviewerMap[r.clientId] || "Anonymous",
      }));

      const rides = await storage.getRidesByChauffeur(req.params.id);
      const completedTrips = rides.filter((r) => r.status === "trip_completed").length;

      return res.json({
        id: chauffeur.id,
        driverName: user?.name || "Chauffeur",
        driverRating: avgRating,
        totalRatings: ratings.length,
        completedTrips,
        distribution,
        profilePhoto: chauffeur.profilePhoto,
        carMake: chauffeur.carMake,
        vehicleModel: chauffeur.vehicleModel,
        carColor: chauffeur.carColor,
        plateNumber: chauffeur.plateNumber,
        vehicleCategory: chauffeur.vehicleCategory,
        ratings: ratingsWithNames,
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/clients/:id/profile", async (req: Request, res: Response) => {
    try {
      await ensureClientRatingsTable();

      const client = await storage.getUser(req.params.id);
      if (!client) return res.status(404).json({ message: "Client not found" });

      const rides = await storage.getRidesByClient(req.params.id);
      const completedTrips = rides.filter((ride) => ride.status === "trip_completed").length;

      const [summaryResult, distributionResult, reviewsResult] = await Promise.all([
        pool.query(
          `
            SELECT ROUND(AVG(rating)::numeric, 2) AS avg_rating,
                   COUNT(*)::int AS total_ratings
            FROM client_ratings
            WHERE client_id = $1
          `,
          [req.params.id]
        ),
        pool.query(
          `
            SELECT rating, COUNT(*)::int AS count
            FROM client_ratings
            WHERE client_id = $1
            GROUP BY rating
          `,
          [req.params.id]
        ),
        pool.query(
          `
            SELECT
              cr.id,
              cr.rating,
              cr.comment,
              cr.created_at AS "createdAt",
              COALESCE(u.name, 'Chauffeur') AS "reviewerName"
            FROM client_ratings cr
            JOIN chauffeurs ch ON ch.id = cr.chauffeur_id
            JOIN users u ON u.id = ch.user_id
            WHERE cr.client_id = $1
            ORDER BY cr.created_at DESC
            LIMIT 30
          `,
          [req.params.id]
        ),
      ]);

      const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      for (const row of distributionResult.rows) {
        distribution[Number(row.rating)] = Number(row.count);
      }

      const avgRating = summaryResult.rows[0]?.avg_rating != null
        ? Number(summaryResult.rows[0].avg_rating)
        : null;
      const totalRatings = Number(summaryResult.rows[0]?.total_ratings || 0);

      return res.json({
        id: client.id,
        clientName: client.name || getUserFirstName(client, "Client"),
        clientPhone: client.phone || null,
        clientRating: avgRating,
        totalRatings,
        completedTrips,
        memberSince: client.createdAt,
        profilePhoto: client.profilePhoto || null,
        distribution,
        ratings: reviewsResult.rows,
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/chauffeurs/:id", async (req: Request, res: Response) => {
    try {
      const { name, ...chauffeurData } = req.body;
      const chauffeur = await storage.updateChauffeur(req.params.id, chauffeurData);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      if (name && chauffeur.userId) {
        await storage.updateUser(chauffeur.userId, { name: name.trim() });
      }
      return res.json({ ...chauffeur, userName: name || chauffeur.userName });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/chauffeurs/:id", requireAuth, requireRole(["admin"]), async (req: AuthedRequest, res: Response) => {
    try {
      const chauffeur = await storage.getChauffeur(req.params.id);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      // Also delete associated driver application
      if (chauffeur.userId) {
        const app = await storage.getDriverApplicationByUserId(chauffeur.userId);
        if (app) await storage.deleteDriverApplication(app.id);
      }
      await storage.deleteChauffeur(req.params.id);
      return res.json({ message: "Chauffeur deleted" });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/chauffeurs/:id/approve", requireAuth, requireRole(["admin"]), async (req: AuthedRequest, res: Response) => {
    try {
      const chauffeur = await storage.getChauffeur(req.params.id);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      await storage.updateChauffeur(req.params.id, { isApproved: true });
      if (chauffeur.userId) {
        await syncDriverOperatorReview({
          userId: chauffeur.userId,
          status: "approved",
          adminId: req.auth!.sub,
        });
        await notifyUserEvent({
          userId: chauffeur.userId,
          type: "approval",
          title: "Application approved",
          body: "Your driver profile has been approved. Add or select an approved vehicle before going online.",
        });
        try {
          const app = await storage.getDriverApplicationByUserId(chauffeur.userId);
          if (app) {
            await storage.updateDriverApplication(app.id, {
              status: "approved",
              notes: null,
              reviewedAt: new Date(),
              reviewerAdminId: req.auth!.sub,
            });
          }
        } catch (e: any) {
          console.error("[approve] application update failed:", e.message);
        }
        try {
          const docs = await storage.getDocumentsByUser(chauffeur.userId);
          for (const doc of docs) {
            await storage.updateDocument(doc.id, { status: "approved" });
          }
        } catch (e: any) {
          console.error("[approve] document update failed:", e.message);
        }
      }
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/chauffeurs/:id/reject", requireAuth, requireRole(["admin"]), async (req: AuthedRequest, res: Response) => {
    try {
      const { reason } = req.body;
      if (!reason?.trim()) return res.status(400).json({ message: "Rejection reason is required" });
      const chauffeur = await storage.getChauffeur(req.params.id);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      await storage.updateChauffeur(req.params.id, { isApproved: false });
      if (chauffeur.userId) {
        await syncDriverOperatorReview({
          userId: chauffeur.userId,
          status: "rejected",
          adminId: req.auth!.sub,
          reason: reason.trim(),
        });
        await notifyUserEvent({
          userId: chauffeur.userId,
          type: "rejection",
          title: "Application Not Approved",
          body: `Your driver application was not approved. Reason: ${reason.trim()}. Please contact support if you have questions.`,
        });
        try {
          const app = await storage.getDriverApplicationByUserId(chauffeur.userId);
          if (app) {
            await storage.updateDriverApplication(app.id, {
              status: "rejected",
              notes: reason.trim(),
              reviewedAt: new Date(),
              reviewerAdminId: req.auth!.sub,
            });
          }
        } catch {}
      }
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/chauffeurs/:id/waitlist", requireAuth, requireRole(["admin"]), async (req: AuthedRequest, res: Response) => {
    try {
      const { reason } = req.body;
      if (!reason?.trim()) return res.status(400).json({ message: "Waitlist reason is required" });
      const chauffeur = await storage.getChauffeur(req.params.id);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      await storage.updateChauffeur(req.params.id, { isApproved: false, isOnline: false });
      if (chauffeur.userId) {
        await syncDriverOperatorReview({
          userId: chauffeur.userId,
          status: "waitlisted",
          adminId: req.auth!.sub,
          reason: reason.trim(),
        });
        const app = await storage.getDriverApplicationByUserId(chauffeur.userId);
        if (app) {
          await storage.updateDriverApplication(app.id, {
            status: "waitlisted",
            notes: reason.trim(),
            reviewedAt: new Date(),
            reviewerAdminId: req.auth!.sub,
          });
        } else {
          await storage.createDriverApplication({
            userId: chauffeur.userId,
            chauffeurId: chauffeur.id,
            status: "waitlisted",
            notes: reason.trim(),
            reviewedAt: new Date(),
            reviewerAdminId: req.auth!.sub,
          } as any);
        }
        await notifyUserEvent({
          userId: chauffeur.userId,
          type: "waitlisted",
          title: "Driver profile waitlisted",
          body: `Your A2B driver profile has been waitlisted. Reason: ${reason.trim()}`,
        });
      }
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/chauffeurs/:id/reactivate", requireAuth, requireRole(["admin"]), async (req: AuthedRequest, res: Response) => {
    try {
      const chauffeur = await storage.getChauffeur(req.params.id);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      await storage.updateChauffeur(req.params.id, { isApproved: true, isOnline: false });
      if (chauffeur.userId) {
        await syncDriverOperatorReview({
          userId: chauffeur.userId,
          status: "approved",
          adminId: req.auth!.sub,
        });
        const app = await storage.getDriverApplicationByUserId(chauffeur.userId);
        if (app) {
          await storage.updateDriverApplication(app.id, {
            status: "approved",
            notes: null,
            reviewedAt: new Date(),
            reviewerAdminId: req.auth!.sub,
          });
        }
        await notifyUserEvent({
          userId: chauffeur.userId,
          type: "approval",
          title: "Driver profile reactivated",
          body: "Your A2B driver profile has been reactivated. You can go online after selecting an approved vehicle.",
        });
      }
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // Get documents for a specific chauffeur (admin)
  app.get("/api/chauffeurs/:id/documents", requireAuth, requireRole(["admin"]), async (req: AuthedRequest, res: Response) => {
    try {
      const chauffeur = await storage.getChauffeur(req.params.id);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      const docs = chauffeur.userId ? await storage.getDocumentsByUser(chauffeur.userId) : [];
      return res.json(docs);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/chauffeurs/:id/toggle-online", async (req: Request, res: Response) => {
    try {
      const chauffeur = await storage.getChauffeur(req.params.id);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      const nextOnline = !chauffeur.isOnline;
      if (nextOnline) {
        const application = await storage.getDriverApplicationByUserId(chauffeur.userId).catch(() => undefined);
        if (application?.status === "waitlisted") {
          await storage.updateChauffeur(req.params.id, { isOnline: false });
          return res.status(403).json({ message: application.notes || "Your driver profile is waitlisted. Please contact support before going online." });
        }
        const profile = await ensureDriverOperatorForChauffeur(chauffeur.userId);
        if (profile?.type === "partner") {
          return res.status(403).json({ message: "Partners cannot go online as drivers." });
        }
        if (!profile || profile.status !== "approved" || !chauffeur.isApproved) {
          return res.status(403).json({ message: "Account not yet approved" });
        }
        if (!chauffeur.activeVehicleId) {
          return res.status(400).json({ message: "Select an approved vehicle before going online." });
        }
        const vehicle = await storage.getVehicle(chauffeur.activeVehicleId);
        const assignment = await storage.getActiveVehicleAssignment(chauffeur.activeVehicleId, profile.id);
        if (!vehicle || vehicle.status !== "approved" || !assignment) {
          await storage.updateChauffeur(req.params.id, { activeVehicleId: null, isOnline: false });
          return res.status(400).json({ message: "This vehicle is no longer approved or assigned to you." });
        }
      }
      const updated = await storage.updateChauffeur(req.params.id, {
        isOnline: nextOnline,
      });
      return res.json(updated);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/chauffeurs", async (_req: Request, res: Response) => {
    try {
      const allChauffeurs = await storage.getAllChauffeurs();
      // Enrich with user details (name, username, phone)
      const enriched = await Promise.all(
        allChauffeurs.map(async (c) => {
          const [user, application] = c.userId
            ? await Promise.all([
                storage.getUser(c.userId).catch(() => null),
                storage.getDriverApplicationByUserId(c.userId).catch(() => undefined),
              ])
            : [null, undefined];
          return {
            ...c,
            userName: user?.name || "—",
            userPhone: user?.phone || c.phone || "—",
            userEmail: user?.username || "—",
            applicationStatus: application?.status || (c.isApproved ? "approved" : "pending"),
            applicationNotes: application?.notes || null,
            waitlistReason: application?.status === "waitlisted" ? application?.notes || null : null,
          };
        })
      );
      return res.json(enriched);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/chauffeurs", async (_req: Request, res: Response) => {
    try {
      const allChauffeurs = await storage.getAllChauffeurs();
      // Enrich with user details (name, username, phone)
      const enriched = await Promise.all(
        allChauffeurs.map(async (c) => {
          const user = c.userId ? await storage.getUser(c.userId) : null;
          return {
            ...c,
            userName: user?.name || "—",
            userPhone: user?.phone || c.phone || "—",
            userEmail: user?.username || "—",
          };
        })
      );
      return res.json(enriched);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  function normalizeLongDistanceCity(value?: string | null) {
    return String(value || "")
      .replace(/\([^)]*\)/g, " ")
      .replace(/\b(south africa|sa)\b/gi, " ")
      .split(",")[0]
      .replace(/[^a-zA-Z\s'-]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function formatLongDistanceCity(value?: string | null) {
    const normalized = normalizeLongDistanceCity(value);
    if (!normalized) return "";

    return normalized.replace(/\b\w+/g, (segment) => segment.charAt(0).toUpperCase() + segment.slice(1));
  }

  function isFutureLongDistanceDate(value?: string | null) {
    const raw = String(value || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;

    const parsed = new Date(`${raw}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return parsed.getTime() > today.getTime();
  }

  function longDistanceCityMatches(candidate?: string | null, query?: string | null) {
    const normalizedQuery = normalizeLongDistanceCity(query);
    if (!normalizedQuery) return true;

    const normalizedCandidate = normalizeLongDistanceCity(candidate);
    if (!normalizedCandidate) return false;

    return (
      normalizedCandidate === normalizedQuery ||
      normalizedCandidate.includes(normalizedQuery) ||
      normalizedQuery.includes(normalizedCandidate)
    );
  }

  app.get("/r/:code", (req: Request, res: Response) => {
    const normalizedCode = String(req.params.code || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");

    if (!normalizedCode) {
      return res.status(400).send("Invalid reward code");
    }

    const requestedApp = String(req.query.app || req.query.source || req.query.role || "")
      .trim()
      .toLowerCase();
    const appTarget = requestedApp === "driver" || requestedApp === "chauffeur" ? "driver" : "client";

    return res.redirect(302, `https://a2blift.com/referral-launch.html?ref=${encodeURIComponent(normalizedCode)}&app=${encodeURIComponent(appTarget)}`);
  });

  // ─── Long Distance: driver availability toggle ───────────────────────────
  app.post("/api/long-distance/availability", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const userId = req.auth!.sub;
      const chauffeur = await storage.getChauffeurByUserId(userId);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur profile not found" });
      if (!chauffeur.isApproved) return res.status(403).json({ message: "Account not yet approved" });

      const {
        available,
        from,
        to,
        date,
        pricePerSeat,
        seatsAvailable,
      } = req.body as {
        available: boolean;
        from?: string;
        to?: string;
        date?: string;
        pricePerSeat?: number;
        seatsAvailable?: number;
      };

      const normalizedFrom = formatLongDistanceCity(from);
      const normalizedTo = formatLongDistanceCity(to);
      const normalizedDate = String(date || "").trim();
      const numericPricePerSeat = Number(pricePerSeat);
      const numericSeatsAvailable = Math.max(1, Math.floor(Number(seatsAvailable) || 0));

      if (available) {
        if (!normalizedFrom || !normalizedTo) {
          return res.status(400).json({ message: "Departure city and destination are required" });
        }

        if (normalizeLongDistanceCity(normalizedFrom) === normalizeLongDistanceCity(normalizedTo)) {
          return res.status(400).json({ message: "Departure city and destination must be different" });
        }

        if (!isFutureLongDistanceDate(normalizedDate)) {
          return res.status(400).json({ message: "Travel date must be a future date in YYYY-MM-DD format" });
        }

        if (!Number.isFinite(numericPricePerSeat) || numericPricePerSeat <= 0) {
          return res.status(400).json({ message: "Price per seat must be greater than zero" });
        }

        if (!Number.isFinite(numericSeatsAvailable) || numericSeatsAvailable < 1) {
          return res.status(400).json({ message: "At least one seat must be available" });
        }
      }

      await storage.updateChauffeur(chauffeur.id, {
        availableForLongDistance: available,
        longDistanceFrom: available ? normalizedFrom : null,
        longDistanceTo: available ? normalizedTo : null,
        longDistanceDate: available ? normalizedDate : null,
        longDistancePricePerSeat: available ? numericPricePerSeat : null,
        longDistanceSeatsAvailable: available ? numericSeatsAvailable : 0,
      } as any);

      return res.json({ success: true, available });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // ─── Long Distance: search available drivers ─────────────────────────────
  app.get("/api/long-distance/search", async (req: Request, res: Response) => {
    try {
      const { from, to, date } = req.query as { from?: string; to?: string; date?: string };
      const normalizedFrom = formatLongDistanceCity(from);
      const normalizedTo = formatLongDistanceCity(to);
      const normalizedDate = String(date || "").trim();
      const allChauffeurs = await storage.getAllChauffeurs();
      const available = allChauffeurs.filter((c: any) => {
        if (!c.availableForLongDistance || !c.isApproved) return false;
        if (!longDistanceCityMatches(c.longDistanceFrom, normalizedFrom)) return false;
        if (!longDistanceCityMatches(c.longDistanceTo, normalizedTo)) return false;
        if (normalizedDate && c.longDistanceDate && c.longDistanceDate !== normalizedDate) return false;
        return true;
      });

      const enriched = await Promise.all(
        available.map(async (c: any) => {
          const user = c.userId ? await storage.getUser(c.userId) : null;
          return {
            id: c.id,
            name: user?.name || "Driver",
            photo: c.profilePhoto || user?.profilePhoto || null,
            vehicleType: c.vehicleType,
            vehicleModel: c.vehicleModel,
            carColor: c.carColor,
            rating: user?.rating || 5.0,
            from: formatLongDistanceCity(c.longDistanceFrom),
            to: formatLongDistanceCity(c.longDistanceTo),
            date: c.longDistanceDate,
            pricePerSeat: c.longDistancePricePerSeat,
            seatsAvailable: c.longDistanceSeatsAvailable,
            lat: c.lat,
            lng: c.lng,
          };
        })
      );

      return res.json(enriched);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/long-distance/book", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const {
        driverId,
        from,
        to,
        date,
        seats,
        paymentMethod,
        paystackRef,
        passengerName,
        passengerPhone,
      } = req.body || {};

      const seatsRequested = Math.max(1, Math.floor(Number(seats) || 1));
      const method = paymentMethod === "cash" ? "cash" : paymentMethod === "card" ? "card" : null;

      if (!driverId || !from || !to || !date || !method) {
        return res.status(400).json({ message: "driverId, from, to, date, seats, and a valid payment method are required" });
      }

      const rider = await storage.getUser(req.auth!.sub);
      if (!rider) return res.status(404).json({ message: "Passenger not found" });

      const chauffeur = await storage.getChauffeur(driverId);
      if (!chauffeur || !chauffeur.isApproved || !chauffeur.availableForLongDistance) {
        return res.status(404).json({ message: "This route is no longer available" });
      }

      if (chauffeur.userId === rider.id) {
        return res.status(400).json({ message: "You cannot book your own route" });
      }

      const seatsAvailable = Number(chauffeur.longDistanceSeatsAvailable || 0);
      if (seatsAvailable < seatsRequested) {
        return res.status(409).json({ message: `Only ${seatsAvailable} seat${seatsAvailable === 1 ? "" : "s"} remain on this route` });
      }

      const chauffeurUser = await storage.getUser(chauffeur.userId);
      const remainingSeats = seatsAvailable - seatsRequested;

      await storage.updateChauffeur(chauffeur.id, {
        longDistanceSeatsAvailable: remainingSeats,
        availableForLongDistance: remainingSeats > 0,
      });

      const bookingFare = Number(chauffeur.longDistancePricePerSeat || 0) * seatsRequested;
      const earningsCalc = calculateChauffeurEarnings(bookingFare);
      if (bookingFare > 0) {
        await storage.createEarning({
          chauffeurId: chauffeur.id,
          rideId: null,
          amount: method === "cash" ? -earningsCalc.commission : earningsCalc.chauffeurEarnings,
          commission: earningsCalc.commission,
          type: `long_distance_${method}`,
        });
        await storage.updateChauffeur(chauffeur.id, {
          earningsTotal:
            (chauffeur.earningsTotal || 0) +
            (method === "cash" ? -earningsCalc.commission : earningsCalc.chauffeurEarnings),
        });
      }

      const riderFirstName = String((passengerName || rider.name || "Passenger")).trim().split(" ")[0] || "Passenger";
      const routeFrom = chauffeur.longDistanceFrom || from;
      const routeTo = chauffeur.longDistanceTo || to;
      const travelDate = chauffeur.longDistanceDate || date;
      const paymentNote = method === "cash"
        ? "The rider selected cash payment for the day of travel."
        : "Card payment was confirmed online.";
      const driverBody = `${riderFirstName} booked ${seatsRequested} seat${seatsRequested === 1 ? "" : "s"} for ${routeFrom} to ${routeTo} on ${travelDate}. ${paymentNote}`;

      await storage.createNotification({
        userId: chauffeur.userId,
        title: "New long-distance booking",
        body: driverBody,
        type: "long_distance",
      });

      const pushTokens = Array.from(new Set([chauffeur.pushToken, chauffeurUser?.pushToken].filter(Boolean) as string[]));
      if (pushTokens.length) {
        sendExpoPushNotification(
          pushTokens,
          "New long-distance booking",
          `${riderFirstName} booked ${seatsRequested} seat${seatsRequested === 1 ? "" : "s"} for ${routeFrom} to ${routeTo}.`,
          {
            type: "long_distance:booking",
            driverId: chauffeur.id,
            passengerId: rider.id,
            from: routeFrom,
            to: routeTo,
            date: travelDate,
            seats: seatsRequested,
            paymentMethod: method,
            paystackRef: paystackRef || null,
            passengerPhone: passengerPhone || rider.phone || null,
          },
          { urgent: true, channelId: "ride-alerts-v3" },
        );
      }

      await storage.createNotification({
        userId: rider.id,
        title: "Long-distance trip confirmed",
        body: `${routeFrom} to ${routeTo} on ${travelDate} is confirmed with ${chauffeurUser?.name || "your driver"}. ${method === "cash" ? "Pay your driver in cash on the day." : "Your card payment has been recorded."}`,
        type: "long_distance",
      });

      if (bookingFare > 0) {
        try {
          await creditReferralReward({
            referredUserId: chauffeur.userId,
            sourceUserId: chauffeur.userId,
            grossFare: bookingFare,
            type: "driver_referral_commission",
            description: "2.5% reward programme earning from a long-distance booking by a driver you invited",
            notificationBody: "You earned R {amount} — 2.5% from a long-distance booking by a driver you invited.",
            referencePrefix: "drv_ld_ref",
          });
          await creditReferralReward({
            riderUserId: rider.id,
            sourceUserId: rider.id,
            grossFare: bookingFare,
            type: "rider_referral_commission",
            description: "2.5% reward programme earning from a long-distance booking by a rider you invited",
            notificationBody: "You earned R {amount} — 2.5% from a long-distance booking by a rider you invited.",
            referencePrefix: "rdr_ld_ref",
          });
        } catch (referralErr: any) {
          console.error("long-distance referral commission failed (non-fatal):", referralErr.message);
        }
      }

      return res.json({
        success: true,
        seatsRemaining: remainingSeats,
        driverName: chauffeurUser?.name || "Driver",
        route: { from: routeFrom, to: routeTo, date: travelDate },
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message || "Unable to confirm long-distance booking" });
    }
  });

  function addBusinessDays(start: Date, businessDays: number): Date {
    const result = new Date(start);
    let added = 0;
    while (added < businessDays) {
      result.setDate(result.getDate() + 1);
      const day = result.getDay();
      if (day !== 0 && day !== 6) added += 1;
    }
    return result;
  }

  async function verifyLiftClubPaystack(reference: string, expectedAmount: number) {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      console.warn("[lift-club] PAYSTACK_SECRET_KEY is missing; accepting client callback reference without server verification.");
      return { ok: true, skipped: true };
    }
    const response = await axios.get(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
      timeout: 10000,
    });
    const tx = response.data?.data;
    const expectedCents = Math.round(Number(expectedAmount || 0) * 100);
    const paidCents = Math.round(Number(tx?.amount || 0));
    return {
      ok: tx?.status === "success" && paidCents >= expectedCents,
      skipped: false,
      amount: paidCents / 100,
      status: tx?.status,
    };
  }

  async function getApprovedLiftClubVehicleForChauffeur(userId: string, chauffeur: any) {
    const activeVehicle = chauffeur.activeVehicleId
      ? await storage.getVehicle(chauffeur.activeVehicleId).catch(() => undefined)
      : undefined;
    if (
      activeVehicle &&
      activeVehicle.status === "approved" &&
      Number(activeVehicle.vehicleYear || 0) >= 2015
    ) {
      return activeVehicle;
    }

    const profile = await ensureDriverOperatorForChauffeur(userId);
    if (!profile) return null;
    const ownedVehicles = await storage.getVehiclesByOwnerOperator(profile.id).catch(() => []);
    const assignments = profile.type === "driver"
      ? await storage.getVehicleAssignments({ driverOperatorProfileId: profile.id, status: "active" }).catch(() => [])
      : [];
    const assignedVehicles = await Promise.all(
      assignments.map((assignment: any) => storage.getVehicle(assignment.vehicleId).catch(() => undefined)),
    );
    return [...ownedVehicles, ...assignedVehicles.filter(Boolean)].find((vehicle: any) =>
      vehicle.status === "approved" &&
      Number(vehicle.vehicleYear || 0) >= 2015
    ) || null;
  }

  // ─── Daily Lift Club: public search + paid seat bookings ─────────────────
  app.get("/api/lift-club/routes", async (req: Request, res: Response) => {
    try {
      const routes = await storage.searchLiftClubRoutes({
        from: typeof req.query.from === "string" ? req.query.from : undefined,
        to: typeof req.query.to === "string" ? req.query.to : undefined,
      });
      return res.json(routes);
    } catch (error: any) {
      return res.status(500).json({ message: error.message || "Unable to load lift club routes" });
    }
  });

  app.get("/api/lift-club/my-route", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const chauffeur = await storage.getChauffeurByUserId(req.auth!.sub);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur profile not found" });
      const route = await storage.getLiftClubRouteByChauffeurId(chauffeur.id);
      const vehicle = await getApprovedLiftClubVehicleForChauffeur(req.auth!.sub, chauffeur);
      return res.json({
        route: route || null,
        canPublish: Boolean(chauffeur.isApproved && vehicle),
        isApproved: Boolean(chauffeur.isApproved),
        vehicle: vehicle || null,
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message || "Unable to load lift club route" });
    }
  });

  app.post("/api/lift-club/my-route", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const chauffeur = await storage.getChauffeurByUserId(req.auth!.sub);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur profile not found" });
      if (!chauffeur.isApproved) return res.status(403).json({ message: "Your driver profile must be approved before publishing a lift club route." });

      const available = req.body?.available !== false;
      if (!available) {
        const route = await storage.updateLiftClubRouteStatus(chauffeur.id, "inactive");
        return res.json({ success: true, route: route || null, available: false });
      }

      const vehicle = await getApprovedLiftClubVehicleForChauffeur(req.auth!.sub, chauffeur);
      if (!vehicle) {
        return res.status(403).json({ message: "An approved vehicle from 2015 onwards is required before publishing a lift club route." });
      }

      const pickupArea = String(req.body?.pickupArea || "").trim();
      const destinationArea = String(req.body?.destinationArea || "").trim();
      const departureWindow = String(req.body?.departureWindow || "Weekday mornings").trim();
      const weeklyPrice = Number(req.body?.weeklyPrice);
      const monthlyPrice = Number(req.body?.monthlyPrice);
      const requestedSeats = Math.floor(Number(req.body?.totalSeats) || 0);
      const vehicleCapacity = Math.max(1, Number(vehicle.passengerCapacity || chauffeur.passengerCapacity || 1));
      const totalSeats = Math.max(1, Math.min(vehicleCapacity, requestedSeats || vehicleCapacity));

      if (!pickupArea || !destinationArea) {
        return res.status(400).json({ message: "Pickup area and workplace are required." });
      }
      if (pickupArea.toLowerCase() === destinationArea.toLowerCase()) {
        return res.status(400).json({ message: "Pickup area and workplace must be different." });
      }
      if (!Number.isFinite(weeklyPrice) || weeklyPrice <= 0 || !Number.isFinite(monthlyPrice) || monthlyPrice <= 0) {
        return res.status(400).json({ message: "Weekly and monthly prices must be greater than zero." });
      }

      const existingRoute = await storage.getLiftClubRouteByChauffeurId(chauffeur.id);
      const hasBookedSeats = Number(existingRoute?.bookedSeats || 0) > 0;
      const routeChanged = existingRoute && (
        String(existingRoute.pickupArea || "").trim().toLowerCase() !== pickupArea.toLowerCase() ||
        String(existingRoute.destinationArea || "").trim().toLowerCase() !== destinationArea.toLowerCase()
      );
      if (hasBookedSeats && routeChanged) {
        return res.status(409).json({ message: "This lift club already has booked riders. Turn it off or contact support before changing the route areas." });
      }

      const route = await storage.upsertLiftClubRoute({
        chauffeurId: chauffeur.id,
        vehicleId: vehicle.id,
        pickupArea,
        destinationArea,
        pickupLat: Number.isFinite(Number(req.body?.pickupLat)) ? Number(req.body.pickupLat) : null,
        pickupLng: Number.isFinite(Number(req.body?.pickupLng)) ? Number(req.body.pickupLng) : null,
        destinationLat: Number.isFinite(Number(req.body?.destinationLat)) ? Number(req.body.destinationLat) : null,
        destinationLng: Number.isFinite(Number(req.body?.destinationLng)) ? Number(req.body.destinationLng) : null,
        departureWindow,
        weeklyPrice,
        monthlyPrice,
        totalSeats,
        status: "active",
      });

      return res.json({ success: true, route, available: true });
    } catch (error: any) {
      return res.status(500).json({ message: error.message || "Unable to save lift club route" });
    }
  });

  app.get("/api/lift-club/my-bookings", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const bookings = await storage.getLiftClubBookingsByUser(req.auth!.sub);
      return res.json(bookings);
    } catch (error: any) {
      return res.status(500).json({ message: error.message || "Unable to load lift club bookings" });
    }
  });

  app.post("/api/lift-club/bookings", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { routeId, passType, paystackReference } = req.body || {};
      const normalizedPassType = passType === "monthly" ? "monthly" : passType === "weekly" ? "weekly" : null;
      if (!routeId || !normalizedPassType || !paystackReference) {
        return res.status(400).json({ message: "routeId, passType, and Paystack reference are required." });
      }

      const [rider, route] = await Promise.all([
        storage.getUser(req.auth!.sub),
        storage.getLiftClubRoute(String(routeId)),
      ]);
      if (!rider) return res.status(404).json({ message: "Rider not found." });
      if (!route || route.status !== "active") return res.status(404).json({ message: "Lift club route not found." });
      if (route.chauffeurUserId === rider.id) return res.status(400).json({ message: "You cannot book your own lift club car." });
      if (Number(route.vehicleYear || 0) < 2015) return res.status(409).json({ message: "This vehicle is not eligible for Daily Lift Club." });

      const seatsLeft = Number(route.totalSeats || 0) - Number(route.bookedSeats || 0);
      if (seatsLeft <= 0) return res.status(409).json({ message: "This lift club car is already full." });

      const amount = normalizedPassType === "monthly" ? Number(route.monthlyPrice || 0) : Number(route.weeklyPrice || 0);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ message: "This lift club pass is not priced correctly." });
      }

      const verification = await verifyLiftClubPaystack(String(paystackReference), amount);
      if (!verification.ok) {
        return res.status(402).json({ message: "Paystack payment could not be verified." });
      }

      const startDate = new Date();
      const endDate = normalizedPassType === "weekly"
        ? addBusinessDays(startDate, 5)
        : addBusinessDays(startDate, 22);

      const booking = await storage.confirmLiftClubBookingWithSeat({
        routeId: route.id,
        riderId: rider.id,
        passType: normalizedPassType,
        startDate: startDate.toISOString().slice(0, 10),
        endDate: endDate.toISOString().slice(0, 10),
        seatCount: 1,
        amount,
        paymentStatus: "paid",
        bookingStatus: "confirmed",
        paystackReference: String(paystackReference),
        confirmedAt: new Date(),
      });

      await storage.createNotification({
        userId: rider.id,
        title: "Lift club seat confirmed",
        body: `${route.pickupArea} to ${route.destinationArea} is confirmed for your ${normalizedPassType} weekday pass.`,
        type: "lift_club",
      });
      if (route.chauffeurUserId) {
        await storage.createNotification({
          userId: route.chauffeurUserId,
          title: "New lift club rider",
          body: `${rider.name || "A rider"} booked a ${normalizedPassType} seat for ${route.pickupArea} to ${route.destinationArea}.`,
          type: "lift_club",
        });
      }

      return res.json({ booking, seatsRemaining: seatsLeft - 1 });
    } catch (error: any) {
      const status = String(error?.message || "").includes("already full") ? 409 : 500;
      return res.status(status).json({ message: error.message || "Unable to confirm lift club booking" });
    }
  });

  // ─── Long Distance: get driver's current availability status ─────────────
  app.get("/api/long-distance/my-availability", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const chauffeur = await storage.getChauffeurByUserId(req.auth!.sub);
      if (!chauffeur) return res.status(404).json({ message: "Not found" });
      return res.json({
        available: (chauffeur as any).availableForLongDistance || false,
        from: (chauffeur as any).longDistanceFrom || "",
        to: (chauffeur as any).longDistanceTo || "",
        date: (chauffeur as any).longDistanceDate || "",
        pricePerSeat: (chauffeur as any).longDistancePricePerSeat || 0,
        seatsAvailable: (chauffeur as any).longDistanceSeatsAvailable || 1,
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // -----------------------------
  // Driver Applications + Documents (Admin + Driver)
  // -----------------------------
  app.get("/api/driver/applications/me", authOptional, async (req: AuthedRequest, res: Response) => {
    const userId = req.auth?.sub || (req.query.userId as string);
    if (!userId) return res.status(400).json({ message: "userId required" });
    const appRow = await storage.getDriverApplicationByUserId(userId);
    return res.json(appRow || null);
  });

  app.get(
    "/api/admin/driver-applications",
    requireAuth,
    requireRole(["admin"]),
    async (_req: AuthedRequest, res: Response) => {
      const apps = await storage.getDriverApplications();
      return res.json(apps);
    },
  );

  app.get("/api/admin/operator-profiles", requireAuth, requireRole(["admin"]), async (req: AuthedRequest, res: Response) => {
    try {
      const type = typeof req.query.type === "string" ? req.query.type : undefined;
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const profiles = await storage.getOperatorProfiles({ type, status });
      return res.json(await Promise.all(profiles.map(serializeOperatorProfile)));
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/admin/operator-profiles/:id/status", requireAuth, requireRole(["admin"]), async (req: AuthedRequest, res: Response) => {
    try {
      const status = requireStringField(req.body, "status");
      if (!["approved", "rejected", "pending"].includes(status)) {
        return res.status(400).json({ message: "Invalid operator profile status" });
      }
      const profile = await storage.getOperatorProfile(req.params.id);
      if (!profile) return res.status(404).json({ message: "Operator profile not found" });
      const reason = String(req.body.reason || "").trim();
      const updated = await storage.updateOperatorProfile(profile.id, {
        status,
        rejectionReason: status === "rejected" ? reason : null,
        reviewedAt: new Date(),
        reviewerAdminId: req.auth!.sub,
      });
      if (profile.type === "driver") {
        const chauffeur = await storage.getChauffeurByUserId(profile.userId).catch(() => undefined);
        if (chauffeur) {
          await storage.updateChauffeur(chauffeur.id, {
            isApproved: status === "approved",
            ...(status === "rejected" ? { isOnline: false, activeVehicleId: null } : {}),
          });
        }
        const application = await storage.getDriverApplicationByUserId(profile.userId).catch(() => undefined);
        if (application) {
          await storage.updateDriverApplication(application.id, {
            status,
            notes: reason || application.notes,
            reviewedAt: new Date(),
            reviewerAdminId: req.auth!.sub,
          });
        }
      }
      await notifyUserEvent({
        userId: profile.userId,
        type: `operator_${status}`,
        title: status === "approved" ? "Application approved" : status === "rejected" ? "Application not approved" : "Application updated",
        body: status === "approved"
          ? profile.type === "partner"
            ? "Your partner profile has been approved. You can now add vehicles and assign approved drivers."
            : "Your driver profile has been approved. Add or select an approved vehicle before going online."
          : status === "rejected"
            ? `Your ${profile.type} application was not approved.${reason ? ` Reason: ${reason}.` : ""}`
            : "Your application is back under review.",
        data: { operatorProfileId: profile.id },
      });
      return res.json(await serializeOperatorProfile(updated));
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.put("/api/admin/operator-profiles/:id", requireAuth, requireRole(["admin"]), async (req: AuthedRequest, res: Response) => {
    try {
      const profile = await storage.getOperatorProfile(req.params.id);
      if (!profile) return res.status(404).json({ message: "Operator profile not found" });

      const profileUpdate: any = {};
      if (req.body.status !== undefined) {
        const status = String(req.body.status).trim();
        if (!["draft", "pending", "approved", "rejected"].includes(status)) {
          return res.status(400).json({ message: "Invalid operator profile status" });
        }
        profileUpdate.status = status;
      }
      if (req.body.rejectionReason !== undefined) {
        profileUpdate.rejectionReason = String(req.body.rejectionReason || "").trim() || null;
      }
      const updatedProfile = Object.keys(profileUpdate).length
        ? await storage.updateOperatorProfile(profile.id, profileUpdate)
        : profile;

      if (profile.type === "partner") {
        const partnerProfile = await storage.getPartnerProfileByOperatorId(profile.id);
        const partnerUpdate: any = {};
        for (const field of ["companyName", "registrationNumber", "contactPersonName", "contactPhone", "contactEmail", "bankName", "accountHolder", "accountNumber"] as const) {
          if (req.body[field] !== undefined) partnerUpdate[field] = String(req.body[field]).trim();
        }
        if (partnerProfile && Object.keys(partnerUpdate).length) {
          await storage.updatePartnerProfile(partnerProfile.id, partnerUpdate);
        }
      }

      return res.json(await serializeOperatorProfile(updatedProfile));
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/admin/operator-profiles/:id", requireAuth, requireRole(["admin"]), async (req: AuthedRequest, res: Response) => {
    try {
      const deleted = await storage.deleteOperatorProfile(req.params.id);
      if (!deleted) return res.status(404).json({ message: "Operator profile not found" });
      return res.json({ message: "Operator profile deleted" });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/vehicles", requireAuth, requireRole(["admin"]), async (req: AuthedRequest, res: Response) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const vehicles = await storage.getVehicles({ status });
      const serialized = await Promise.all(vehicles.map(async (vehicle) => {
        try {
          return await serializeVehicle(vehicle);
        } catch (error: any) {
          return {
            ...vehicle,
            owner: null,
            documents: [],
            assignments: [],
            serializationWarning: error?.message || "Could not load related vehicle details",
          };
        }
      }));
      return res.json(serialized);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/admin/vehicles/:id/status", requireAuth, requireRole(["admin"]), async (req: AuthedRequest, res: Response) => {
    try {
      const status = requireStringField(req.body, "status");
      if (!["approved", "rejected", "suspended", "waitlisted", "pending"].includes(status)) {
        return res.status(400).json({ message: "Invalid vehicle status" });
      }
      const vehicle = await storage.getVehicle(req.params.id);
      if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });
      const ownerProfile = await storage.getOperatorProfile(vehicle.ownerOperatorProfileId);
      if (!ownerProfile) return res.status(404).json({ message: "Vehicle owner profile not found" });
      const reason = String(req.body.reason || "").trim();
      if ((status === "rejected" || status === "suspended" || status === "waitlisted") && !reason) {
        return res.status(400).json({ message: "A reason is required for this vehicle status." });
      }
      if (status === "approved") {
        const documents = await storage.getDocumentsByVehicle(vehicle.id);
        const approvedTypes = new Set(documents.filter((document) => document.status === "approved").map((document) => document.type));
        const missingApproval = [...VEHICLE_REQUIRED_DOCS].filter((type) => !approvedTypes.has(type));
        if (missingApproval.length > 0) {
          return res.status(400).json({
            message: `Approve all required vehicle documents first: ${missingApproval.map((type) => type.replace("vehicle:", "")).join(", ")}`,
          });
        }
      }
      const updated = await storage.updateVehicle(vehicle.id, {
        status,
        rejectionReason: status === "rejected" || status === "suspended" || status === "waitlisted" ? reason : null,
        reviewedAt: new Date(),
        reviewerAdminId: req.auth!.sub,
      });
      if (status === "approved" && ownerProfile.type === "driver") {
        try {
          const existing = await storage.getActiveVehicleAssignment(vehicle.id, ownerProfile.id);
          if (!existing) {
            await storage.createVehicleAssignment({
              vehicleId: vehicle.id,
              driverOperatorProfileId: ownerProfile.id,
              assignedByOperatorProfileId: ownerProfile.id,
              status: "active",
            });
          }
        } catch (assignmentError) {
          console.warn("[admin/vehicles] vehicle approved but self-assignment failed", assignmentError);
        }
      }
      if (status !== "approved") {
        try {
          const activeAssignments = await storage.getVehicleAssignments({ vehicleId: vehicle.id, status: "active" });
          for (const assignment of activeAssignments) {
            await storage.updateVehicleAssignment(assignment.id, { status: "removed", removedAt: new Date() });
            const driverProfile = await storage.getOperatorProfile(assignment.driverOperatorProfileId).catch(() => undefined);
            if (driverProfile) {
              const chauffeur = await storage.getChauffeurByUserId(driverProfile.userId).catch(() => undefined);
              if (chauffeur?.activeVehicleId === vehicle.id) {
                await storage.updateChauffeur(chauffeur.id, { activeVehicleId: null, isOnline: false });
              }
              if (driverProfile.userId !== ownerProfile.userId) {
                await notifyUserEvent({
                  userId: driverProfile.userId,
                  type: "vehicle_assignment_removed",
                  title: "Vehicle unavailable",
                  body: `${vehicle.carMake} ${vehicle.vehicleModel} (${vehicle.plateNumber}) is no longer available for trips.`,
                  data: { vehicleId: vehicle.id },
                }).catch((notifyError) => {
                  console.warn("[admin/vehicles] assignment removal notification failed", notifyError);
                });
              }
            }
          }
        } catch (assignmentError) {
          console.warn("[admin/vehicles] vehicle status updated but assignment cleanup failed", assignmentError);
        }
      }
      await notifyUserEvent({
        userId: ownerProfile.userId,
        type: `vehicle_${status}`,
        title: status === "approved" ? "Vehicle approved" : status === "waitlisted" ? "Vehicle waitlisted" : status === "rejected" ? "Vehicle not approved" : "Vehicle status updated",
        body: status === "approved"
          ? `${vehicle.carMake} ${vehicle.vehicleModel} (${vehicle.plateNumber}) has been approved.`
          : status === "waitlisted"
            ? `${vehicle.carMake} ${vehicle.vehicleModel} (${vehicle.plateNumber}) has been waitlisted.${reason ? ` Reason: ${reason}.` : ""}`
          : status === "rejected"
            ? `${vehicle.carMake} ${vehicle.vehicleModel} (${vehicle.plateNumber}) was not approved.${reason ? ` Reason: ${reason}.` : ""}`
            : `${vehicle.carMake} ${vehicle.vehicleModel} (${vehicle.plateNumber}) status is now ${status}.`,
        data: { vehicleId: vehicle.id },
      }).catch((notifyError) => {
        console.warn("[admin/vehicles] owner notification failed", notifyError);
      });
      return res.json(await serializeVehicle(updated));
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.put("/api/admin/vehicles/:id", requireAuth, requireRole(["admin"]), async (req: AuthedRequest, res: Response) => {
    try {
      const vehicle = await storage.getVehicle(req.params.id);
      if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });
      const update: any = {};
      for (const field of ["carMake", "vehicleModel", "plateNumber", "vehicleType", "carColor", "status", "rejectionReason"] as const) {
        if (req.body[field] !== undefined) update[field] = String(req.body[field]).trim();
      }
      if (req.body.vehicleYear !== undefined) update.vehicleYear = Number.parseInt(String(req.body.vehicleYear), 10);
      if (req.body.passengerCapacity !== undefined) update.passengerCapacity = Number.parseInt(String(req.body.passengerCapacity), 10) || 4;
      if (req.body.luggageCapacity !== undefined) update.luggageCapacity = Number.parseInt(String(req.body.luggageCapacity), 10) || 2;
      const updated = await storage.updateVehicle(vehicle.id, update);
      return res.json(await serializeVehicle(updated));
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/admin/vehicles/:id", requireAuth, requireRole(["admin"]), async (req: AuthedRequest, res: Response) => {
    try {
      const deleted = await storage.deleteVehicle(req.params.id);
      if (!deleted) return res.status(404).json({ message: "Vehicle not found" });
      return res.json({ message: "Vehicle deleted" });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.put(
    "/api/admin/driver-applications/:id",
    requireAuth,
    requireRole(["admin"]),
    async (req: AuthedRequest, res: Response) => {
      const { status, notes } = req.body;
      if (!["pending", "approved", "rejected", "waitlisted"].includes(String(status || ""))) {
        return res.status(400).json({ message: "Invalid driver application status" });
      }
      if (status === "waitlisted" && !String(notes || "").trim()) {
        return res.status(400).json({ message: "Waitlist reason is required" });
      }
      const updated = await storage.updateDriverApplication(req.params.id, {
        status,
        notes,
        reviewedAt: new Date(),
        reviewerAdminId: req.auth!.sub,
      });
      if (!updated) return res.status(404).json({ message: "Application not found" });

      if (updated.chauffeurId) {
        if (status === "approved") {
          await storage.updateChauffeur(updated.chauffeurId, { isApproved: true });
        }
        if (status === "rejected") {
          await storage.updateChauffeur(updated.chauffeurId, { isApproved: false, isOnline: false, activeVehicleId: null });
        }
        if (status === "waitlisted") {
          await storage.updateChauffeur(updated.chauffeurId, { isApproved: false, isOnline: false });
        }
      }
      const profile = await syncDriverOperatorReview({
        userId: updated.userId,
        status,
        adminId: req.auth!.sub,
        reason: notes,
      });
      if (status === "approved" || status === "rejected" || status === "waitlisted") {
        await notifyUserEvent({
          userId: updated.userId,
          type: status === "approved" ? "operator_approved" : status === "waitlisted" ? "waitlisted" : "operator_rejected",
          title: status === "approved" ? "Application approved" : status === "waitlisted" ? "Driver profile waitlisted" : "Application not approved",
          body: status === "approved"
            ? "Your driver profile has been approved. Add or select an approved vehicle before going online."
            : status === "waitlisted"
              ? `Your driver profile has been waitlisted.${notes ? ` Reason: ${String(notes).trim()}.` : ""}`
            : `Your driver application was not approved.${notes ? ` Reason: ${String(notes).trim()}.` : ""}`,
          data: { driverApplicationId: updated.id, operatorProfileId: profile?.id },
        });
      }

      return res.json(updated);
    },
  );

  app.delete(
    "/api/admin/driver-applications/:id",
    requireAuth,
    requireRole(["admin"]),
    async (req: AuthedRequest, res: Response) => {
      try {
        const deleted = await storage.deleteDriverApplication(req.params.id);
        if (!deleted) return res.status(404).json({ message: "Application not found" });
        return res.json({ message: "Application deleted" });
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    },
  );

  // ── Profile photo upload for admin (base64 → Supabase Storage) — admin-only ──
  app.post("/api/upload/profile-photo", requireAuth, requireRole(["admin"]), async (req: AuthedRequest, res: Response) => {
    try {
      const { base64Data, chauffeurId } = req.body;
      if (!base64Data || typeof base64Data !== "string" || !chauffeurId || typeof chauffeurId !== "string") {
        return res.status(400).json({ message: "base64Data and chauffeurId are required" });
      }
      // Enforce maximum base64 size (~5 MB)
      if (base64Data.length > 7_000_000) {
        return res.status(400).json({ message: "Image too large. Maximum 5 MB." });
      }
      const SUPABASE_URL = process.env.SUPABASE_URL || "https://zzwkieiktbhptvgsqerd.supabase.co";
      const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
      const BUCKET = "driver-documents";
      const safeId = chauffeurId.replace(/[^a-zA-Z0-9_-]/g, "");
      const fileName = `${safeId}/profile_${Date.now()}.jpg`;
      const buffer = Buffer.from(base64Data, "base64");
      const uploadRes = await fetch(
        `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${fileName}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
            apikey: SUPABASE_SERVICE_KEY,
            "Content-Type": "image/jpeg",
            "x-upsert": "true",
          },
          body: buffer,
        },
      );
      if (!uploadRes.ok) {
        const errText = await uploadRes.text().catch(() => uploadRes.statusText);
        console.error("[upload/profile-photo] Supabase error:", uploadRes.status, errText);
        if (uploadRes.status === 401 || uploadRes.status === 403) {
          return res.status(500).json({ message: "Photo upload failed: Supabase service key not configured. Please add SUPABASE_SERVICE_ROLE_KEY to environment secrets." });
        }
        return res.status(500).json({ message: `Photo upload failed (${uploadRes.status}): ${errText}` });
      }
      const url = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${fileName}`;
      // Persist the photo URL in the chauffeur profile immediately
      try {
        await storage.updateChauffeur(chauffeurId, { profilePhoto: url });
      } catch {}
      return res.json({ url });
    } catch (error: any) {
      console.error("[upload/profile-photo] error:", error.message);
      return res.status(500).json({ message: error.message || "Photo upload failed. Please try again." });
    }
  });

  // ── Document upload proxy (server → Supabase, bypasses client CORS/RLS) ──
  app.post("/api/upload-document", authOptional, async (req: AuthedRequest, res: Response) => {
    try {
      const { base64Data, userId, docType, mimeType, fileExtension } = req.body;
      if (!base64Data || !userId || !docType) {
        return res.status(400).json({ message: "base64Data, userId, and docType are required" });
      }

      const SUPABASE_URL = process.env.SUPABASE_URL || "https://zzwkieiktbhptvgsqerd.supabase.co";
      const SUPABASE_ANON_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
      const BUCKET = "driver-documents";

      const contentType =
        typeof mimeType === "string" && mimeType.includes("/") ? mimeType : "image/jpeg";
      const extension =
        typeof fileExtension === "string" && /^[a-zA-Z0-9]{1,10}$/.test(fileExtension)
          ? fileExtension.toLowerCase()
          : contentType === "application/pdf"
            ? "pdf"
            : "jpg";
      const safeUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, "_") || "user";
      const safeDocType = String(docType).replace(/[^a-zA-Z0-9_-]/g, "_") || "document";
      const fileName = `${safeUserId}/${safeDocType}_${Date.now()}.${extension}`;
      const buffer = Buffer.from(base64Data, "base64");

      const uploadRes = await fetch(
        `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${fileName}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            apikey: SUPABASE_ANON_KEY,
            "Content-Type": contentType,
            "x-upsert": "true",
          },
          body: buffer,
        },
      );

      if (!uploadRes.ok) {
        const err = await uploadRes.text();
        console.error("[upload-document] Supabase error:", err);
        return res.status(500).json({ message: `Supabase upload failed: ${err}` });
      }

      const url = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${fileName}`;
      return res.json({ url });
    } catch (error: any) {
      console.error("[upload-document] error:", error.message);
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/driver/documents", authOptional, async (req: AuthedRequest, res: Response) => {
    const { applicationId, chauffeurId, type, url, userId: bodyUserId } = req.body;
    const userId = req.auth?.sub || bodyUserId;
    if (!type || !url) return res.status(400).json({ message: "type and url are required" });
    if (!userId) return res.status(400).json({ message: "userId required" });
    const doc = await storage.createDocument({
      userId,
      applicationId: applicationId || null,
      chauffeurId: chauffeurId || null,
      type,
      url,
      status: "pending",
    });
    return res.json(doc);
  });

  app.get("/api/driver/documents", authOptional, async (req: AuthedRequest, res: Response) => {
    const userId = req.auth?.sub || (req.query.userId as string);
    if (!userId) return res.status(400).json({ message: "userId required" });
    const docs = await storage.getDocumentsByUser(userId);
    return res.json(docs);
  });

  app.get(
    "/api/admin/documents",
    requireAuth,
    requireRole(["admin"]),
    async (_req: AuthedRequest, res: Response) => {
      const docs = await storage.getAllDocuments();
      return res.json(docs);
    },
  );

  app.get(
    "/api/admin/documents/user/:userId",
    requireAuth,
    requireRole(["admin"]),
    async (req: AuthedRequest, res: Response) => {
      const docs = await storage.getDocumentsByUser(req.params.userId);
      return res.json(docs);
    },
  );

  app.put(
    "/api/admin/documents/:id",
    requireAuth,
    requireRole(["admin"]),
    async (req: AuthedRequest, res: Response) => {
      const status = String(req.body?.status || "");
      const reviewReason = String(req.body?.reviewReason || "").trim();
      if (!["approved", "rejected", "pending"].includes(status)) {
        return res.status(400).json({ message: "Invalid document status" });
      }
      if (status === "rejected" && !reviewReason) {
        return res.status(400).json({ message: "A rejection reason is required" });
      }
      const doc = await storage.updateDocument(req.params.id, {
        status,
        reviewReason: status === "rejected" ? reviewReason : null,
        reviewedAt: new Date(),
        reviewerAdminId: req.auth!.sub,
      });
      if (!doc) return res.status(404).json({ message: "Document not found" });
      return res.json(doc);
    },
  );

  app.post("/api/admin/notifications/test", requireAuth, requireRole(["admin"]), async (req: AuthedRequest, res: Response) => {
    try {
      const userId = requireStringField(req.body, "userId");
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      const chauffeur = await storage.getChauffeurByUserId(userId).catch(() => undefined);
      const notification = await storage.createNotification({ userId, title: "A2B notification test", body: "Your notifications are working.", type: "system" });
      const tokens = Array.from(new Set([user.pushToken, chauffeur?.pushToken].filter(Boolean) as string[]));
      const tickets = await sendExpoPushNotification(tokens, notification.title, notification.body, { type: "admin:test" });
      for (const ticket of tickets) {
        await pool.query(
          "INSERT INTO push_delivery_logs (user_id, notification_id, expo_ticket_id, status, error_message, delivered_at) VALUES ($1,$2,$3,$4,$5,$6)",
          [userId, notification.id, ticket.id || null, ticket.status || "unknown", ticket.message || null, ticket.status === "ok" ? new Date() : null],
        );
      }
      return res.json({ notification, tickets, sent: tickets.length });
    } catch (error: any) {
      return res.status(400).json({ message: error.message || "Unable to send test notification" });
    }
  });

  // -----------------------------
  // Pricing
  // -----------------------------
  app.post("/api/pricing/estimate", async (req: Request, res: Response) => {
    try {
      const { distanceKm, categoryId, isLateNight, pickupLat, pickupLng } = req.body;
      const demandMultiplier = await getDemandPricingMultiplier(Number.isFinite(Number(pickupLat)) && Number.isFinite(Number(pickupLng)) ? { lat: Number(pickupLat), lng: Number(pickupLng) } : undefined);
      const estimate = calculatePrice(distanceKm, categoryId || "budget", { isLateNight, demandMultiplier });
      return res.json(estimate);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/pricing/config", async (_req: Request, res: Response) => {
    return res.json(getPricingConfig());
  });

  app.get("/api/pricing/categories", async (_req: Request, res: Response) => {
    return res.json(getVehicleCategories());
  });

  app.put("/api/chauffeurs/:id/location", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const chauffeur = await storage.getChauffeur(req.params.id);
      if (!chauffeur || chauffeur.userId !== req.auth!.sub) return res.status(403).json({ message: "Forbidden" });
      const lat = Number(req.body?.lat);
      const lng = Number(req.body?.lng);
      if (!isValidLocationSample(lat, lng)) return res.status(400).json({ message: "A valid latitude and longitude are required" });
      const updated = await storage.updateChauffeur(chauffeur.id, { lat, lng, locationUpdatedAt: new Date() });
      const activeRide = (await storage.getRidesByChauffeur(chauffeur.id)).find((ride) =>
        ["chauffeur_assigned", "chauffeur_arriving", "chauffeur_arrived", "trip_started"].includes(ride.status),
      );
      if (activeRide) {
        const last = await pool.query(
          "SELECT latitude, longitude FROM ride_location_samples WHERE ride_id = $1 ORDER BY recorded_at DESC LIMIT 1",
          [activeRide.id],
        );
        const previous = last.rows[0];
        const travelledKm = previous ? calculateHaversineDistanceKm(Number(previous.latitude), Number(previous.longitude), lat, lng) : 0;
        await pool.query(
          "INSERT INTO ride_location_samples (ride_id, chauffeur_id, latitude, longitude) VALUES ($1, $2, $3, $4)",
          [activeRide.id, chauffeur.id, lat, lng],
        );
        if (travelledKm > 0 && travelledKm < 5) {
          await storage.updateRide(activeRide.id, { actualDistanceKm: Number(activeRide.actualDistanceKm || 0) + travelledKm });
        }
      }
      return res.json(updated);
    } catch (error: any) {
      return res.status(400).json({ message: error.message || "Unable to update location" });
    }
  });

  // -----------------------------
  // Liveness (Cash Ride Security)
  // -----------------------------
  app.post("/api/liveness/session", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const provider = getLivenessProvider();
      const userId = req.auth!.sub;
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      const challengeCode = buildChallengeCode();

      const existing = await storage.getLatestPendingLivenessSessionByUser(userId);
      if (existing && existing.expiresAt && new Date(existing.expiresAt).getTime() > Date.now()) {
        return res.json({
          sessionId: existing.id,
          provider: existing.provider,
          expiresAt: existing.expiresAt,
          challenge: challengeLabel(existing.challengeCode),
          maxAttempts: existing.maxAttempts,
          attempts: existing.attempts,
        });
      }

      const session = await storage.createLivenessSession({
        userId,
        provider,
        status: "pending",
        challengeCode,
        maxAttempts: 3,
        attempts: 0,
        expiresAt,
      });

      return res.json({
        sessionId: session.id,
        provider: session.provider,
        expiresAt: session.expiresAt,
        challenge: challengeLabel(session.challengeCode),
        maxAttempts: session.maxAttempts,
        attempts: session.attempts,
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message || "Failed to create liveness session" });
    }
  });

  app.post("/api/liveness/verify", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { sessionId, selfieUrl, faceData, challenge } = req.body as {
        sessionId?: string;
        selfieUrl?: string;
        faceData?: any;
        challenge?: string;
      };
      if (!sessionId || !selfieUrl) {
        return res.status(400).json({ message: "sessionId and selfieUrl are required" });
      }

      const session = await storage.getLivenessSession(sessionId);
      if (!session || session.userId !== req.auth!.sub) {
        return res.status(404).json({ message: "Liveness session not found" });
      }

      if (session.status === "passed") {
        return res.json({
          passed: true,
          sessionId: session.id,
          score: session.score || 0.99,
          provider: session.provider,
          selfieUrl: session.selfieUrl || selfieUrl,
        });
      }

      if (new Date(session.expiresAt).getTime() <= Date.now()) {
        await storage.updateLivenessSession(session.id, {
          status: "expired",
          errorReason: "Session expired. Please retry liveness.",
        });
        return res.status(410).json({ message: "Session expired. Please retry liveness." });
      }

      const nextAttempts = (session.attempts || 0) + 1;
      if (nextAttempts > (session.maxAttempts || 3)) {
        await storage.updateLivenessSession(session.id, {
          status: "failed",
          attempts: nextAttempts,
          errorReason: "Maximum attempts reached",
        });
        return res.status(429).json({ message: "Maximum liveness attempts reached" });
      }

      if (session.provider !== "mock") {
        await storage.updateLivenessSession(session.id, {
          attempts: nextAttempts,
          selfieUrl,
          errorReason: "Provider integration pending",
        });
        return res.status(501).json({
          message: "Selected liveness provider is not configured yet. Switch LIVENESS_PROVIDER=mock for now.",
        });
      }

      const qualityResult = await runMockSelfieQualityCheck(selfieUrl, faceData || null, challenge || session.challengeCode || null);
      const passed = qualityResult.passed;
      const score = qualityResult.score;
      const status = passed ? "passed" : "failed";

      const updated = await storage.updateLivenessSession(session.id, {
        attempts: nextAttempts,
        selfieUrl,
        score,
        status,
        verifiedAt: passed ? new Date() : null,
        errorReason: passed ? null : (qualityResult.reason || "Selfie quality check failed"),
      });

      return res.json({
        passed,
        sessionId: updated?.id || session.id,
        score,
        provider: session.provider,
        selfieUrl,
        reason: passed ? null : (qualityResult.reason || "Selfie quality check failed"),
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message || "Liveness verification failed" });
    }
  });

  // -----------------------------
  // Rides
  // -----------------------------
  app.post("/api/rides", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { distanceKm, isLateNight, ...rideData } = req.body;

      // Always use the verified JWT subject as the clientId (ignore untrusted body value)
      const clientId = req.auth!.sub;
      rideData.clientId = clientId;

      // Ensure the user exists in this database — auto-create from JWT claims if not.
      // This handles cross-environment JWTs (e.g. Railway token used against dev backend).
      let clientUser = await storage.getUser(clientId);
      if (!clientUser) {
        const { email, name, role } = req.auth!;
        const placeholderEmail = email || `oauth_${clientId.slice(0, 12)}@a2blift.placeholder`;
        const existingByEmail = email ? await storage.getUserByUsername(email) : null;
        if (existingByEmail) {
          clientUser = existingByEmail;
          // Ensure id matches token sub
        } else {
          try {
            const randomPw = await bcrypt.hash(Math.random().toString(36), 10);
            clientUser = await storage.createUser({
              id: clientId,
              username: placeholderEmail,
              password: randomPw,
              name: name || "A2B LIFT",
              phone: null,
              role: (role || "client") as UserRole,
            } as any);
          } catch (_createErr: any) {
            // Race condition — another request created it first
            clientUser = await storage.getUser(clientId);
            if (!clientUser) {
              return res.status(401).json({ success: false, message: "Session expired. Please log out and log in again." });
            }
          }
        }
      } else {
        const claimedName = typeof req.auth!.name === "string" ? req.auth!.name.trim() : "";
        const storedName = typeof clientUser.name === "string" ? clientUser.name.trim() : "";
        if (claimedName && getUserFirstName({ name: storedName }, "") !== getUserFirstName({ name: claimedName }, "")) {
          const normalizedStoredName = storedName.toLowerCase();
          const storedLooksGeneric = ["", "client", "rider"].includes(normalizedStoredName)
            || (normalizedStoredName.startsWith("a2b ") && normalizedStoredName.endsWith("client"));
          if (storedLooksGeneric) {
            clientUser = await storage.updateUser(clientUser.id, { name: claimedName }) as any;
          }
        }
      }

      if (Number(clientUser.walletBalance || 0) < 0) {
        return res.status(409).json({
          success: false,
          message: "Please settle your outstanding cancellation balance before requesting another ride.",
        });
      }

      const categoryId = rideData.vehicleType || "budget";
      const normalizedDistanceKm = Number(rideData.selectedRouteDistanceKm ?? distanceKm ?? 10);
      const safeDistanceKm = Number.isFinite(normalizedDistanceKm) && normalizedDistanceKm > 0 ? normalizedDistanceKm : 10;
      const normalizedDurationMin = Number(rideData.durationMin ?? 0);
      const safeDurationMin = Number.isFinite(normalizedDurationMin) && normalizedDurationMin > 0 ? normalizedDurationMin : null;
      const selectedRouteId = typeof rideData.selectedRouteId === "string" && rideData.selectedRouteId.trim()
        ? rideData.selectedRouteId.trim()
        : null;
      const demandMultiplier = await getDemandPricingMultiplier({ lat: Number(rideData.pickupLat), lng: Number(rideData.pickupLng) });
      const priceEstimate = calculatePrice(safeDistanceKm, categoryId, { isLateNight, demandMultiplier });
      const safeFare = priceEstimate.totalPrice;
      const routeCurrency = typeof rideData.routeCurrency === "string" && rideData.routeCurrency.trim()
        ? rideData.routeCurrency.trim().toUpperCase()
        : priceEstimate.currency;

      const paymentMethod = (rideData.paymentMethod || "cash") as string;
      
      // Set livenessVerifiedAt on server side (Date object, never trust client strings for timestamps)
      const livenessVerifiedAt = (rideData as any).livenessStatus === "passed" ? new Date() : undefined;

      // Whitelist only valid ride columns — never spread raw client body into Drizzle
      const ride = await storage.createRide({
        clientId,
        pickupLat: rideData.pickupLat,
        pickupLng: rideData.pickupLng,
        pickupAddress: rideData.pickupAddress || null,
        dropoffLat: rideData.dropoffLat,
        dropoffLng: rideData.dropoffLng,
        dropoffAddress: rideData.dropoffAddress || null,
        vehicleType: rideData.vehicleType || "budget",
        paymentMethod: rideData.paymentMethod || "cash",
        price: safeFare,
        quotedFare: safeFare,
        finalFare: null,
        distanceKm: safeDistanceKm,
        durationMin: safeDurationMin,
        pricePerKm: priceEstimate.pricePerKm,
        baseFare: priceEstimate.baseFare,
        status: "searching",
        paymentStatus: paymentMethod === "cash" ? "unpaid" : (rideData.paymentStatus || "pending"),
        cashSelfieUrl: rideData.cashSelfieUrl || null,
        livenessStatus: rideData.livenessStatus || "not_required",
        livenessProvider: rideData.livenessProvider || null,
        livenessSessionId: rideData.livenessSessionId || null,
        livenessScore: rideData.livenessScore || null,
        selectedRouteId,
        selectedRouteDistanceKm: selectedRouteId ? safeDistanceKm : null,
        actualFare: selectedRouteId ? safeFare : null,
        demandMultiplier,
        routeCurrency,
        routeSelectedAt: selectedRouteId ? new Date() : null,
        ...(livenessVerifiedAt ? { livenessVerifiedAt } : {}),
      } as any);

      // Enrich ride with client first name for driver display
      let clientFirstName = "Rider";
      try {
        const clientUser = await storage.getUser(clientId);
        clientFirstName = getUserFirstName(clientUser, "Rider");
      } catch {}
      const enrichedRide = { ...ride, clientFirstName };

      // Send trip only to nearby approved online drivers (sorted by distance)
      const allChauffeurs = await storage.getAllChauffeurs();
      const pickupLat = parseFloat(rideData.pickupLat);
      const pickupLng = parseFloat(rideData.pickupLng);

      const nearbyChauffeurs = allChauffeurs
        .filter(c => c.isOnline && c.isApproved && hasFreshChauffeurLocation(c))
        .map(c => ({
          ...c,
          distKm: calculateHaversineDistanceKm(pickupLat, pickupLng, Number(c.lat), Number(c.lng)),
        }))
        .filter(c => c.distKm <= RIDE_MATCH_RADIUS_KM)
        .sort((a, b) => a.distKm - b.distKm)
        .slice(0, 10); // notify up to 10 nearest drivers

      async function getDriverPushTokens(drivers: any[]) {
        const tokens = new Set<string>();
        await Promise.all(drivers.map(async (driver) => {
          if (driver?.pushToken) tokens.add(driver.pushToken);
          if (!driver?.userId) return;
          try {
            const driverUser = await storage.getUser(driver.userId);
            if ((driverUser as any)?.pushToken) tokens.add((driverUser as any).pushToken);
          } catch {}
        }));
        return Array.from(tokens);
      }

      if (nearbyChauffeurs.length > 0) {
        // Emit only to connected sockets belonging to nearby drivers
        const sockets = await io.fetchSockets();
        let notified = 0;
        for (const socket of sockets) {
          const socketData = socket.data as any;
          if (socketData?.chauffeurId && nearbyChauffeurs.some(c => c.id === socketData.chauffeurId)) {
            socket.emit("ride:new", { ...enrichedRide, distanceToPickup: nearbyChauffeurs.find(c => c.id === socketData.chauffeurId)?.distKm });
            notified++;
          }
        }
        // Fallback: if no sockets matched (drivers not connected via socket), broadcast to all
        if (notified === 0) {
          io.emit("ride:new", enrichedRide);
        }
        // Push notification to all nearby drivers (wakes up drivers not in the app)
        const pushTokens = await getDriverPushTokens(nearbyChauffeurs);
        if (pushTokens.length > 0) {
          sendExpoPushNotification(
            pushTokens,
            "🚗 New Ride Request",
            `Pickup: ${ride.pickupAddress || "Nearby"} — tap to accept`,
              { rideId: ride.id, type: "ride:new" },
              { urgent: true }
          );
        }
      } else {
        // No nearby drivers — broadcast to all online approved drivers as fallback
        io.emit("ride:new", enrichedRide);
        // Push to ALL online approved drivers with tokens
          const allDrivers = (await storage.getAllChauffeurs()).filter(c => c.isOnline && c.isApproved && hasFreshChauffeurLocation(c));
        const pushTokens = await getDriverPushTokens(allDrivers);
        if (pushTokens.length > 0) {
          sendExpoPushNotification(
            pushTokens,
            "🚗 New Ride Request",
            `Pickup: ${ride.pickupAddress || "Nearby"} — tap to accept`,
              { rideId: ride.id, type: "ride:new" },
              { urgent: true }
          );
        }
      }

      // Always return success immediately — client shows "searching" UI
      return res.json({
        success: true,
        status: ride.status,
        message: nearbyChauffeurs.length > 0
          ? `Notifying ${nearbyChauffeurs.length} driver${nearbyChauffeurs.length > 1 ? "s" : ""} nearby...`
          : "Searching for drivers...",
        ride: ride,
      });
    } catch (error: any) {
      console.error("Ride creation error:", error);
      return res.status(500).json({ 
        success: false,
        message: error.message || "Failed to create ride request" 
      });
    }
  });

  // -----------------------------
  // Paystack Payments
  // -----------------------------
  app.post(
    "/api/paystack/initialize",
    requireAuth,
    async (req: AuthedRequest, res: Response) => {
      try {
        const { rideId } = req.body as { rideId?: string };
        if (!rideId) {
          return res.status(400).json({ message: "rideId is required" });
        }

        const ride = await storage.getRide(rideId);
        if (!ride) {
          return res.status(404).json({ message: "Ride not found" });
        }
        if (!ride.price || ride.price <= 0) {
          return res
            .status(400)
            .json({ message: "Ride does not have a valid price" });
        }

        const user = await storage.getUser(req.auth!.sub);
        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }

        const { secret, currency } = getPaystackConfig();
        const rideReference = `A2B-RIDE-${Date.now()}-${user.id.slice(0, 6)}`;
        const domain = getAppBaseUrl(req);
        const rideCallbackUrl = `${domain}/api/payments/webview-callback?reference=${rideReference}`;

        const amountInMinorUnits = Math.round(ride.price * 100); // kobo/cents
        const email =
          user.username.includes("@")
            ? user.username
            : `${user.username}@example.com`;

        const initBody: Record<string, unknown> = {
          email,
          amount: amountInMinorUnits,
          currency,
          reference: rideReference,
          callback_url: rideCallbackUrl,
          metadata: {
            rideId: ride.id,
            userId: user.id,
          },
        };

        const response = await fetch(
          "https://api.paystack.co/transaction/initialize",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${secret}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(initBody),
          },
        );

        const data = (await response.json()) as any;
        if (!response.ok || !data?.status) {
          return res
            .status(502)
            .json({ message: "Failed to initialize Paystack", raw: data });
        }

        return res.json({
          authorizationUrl: data.data.authorization_url,
          reference: data.data.reference,
        });
      } catch (error: any) {
        if (error instanceof Error && error.message.includes("PAYSTACK")) {
          return res.status(500).json({ message: error.message });
        }
        return res.status(500).json({ message: error.message || "Server error" });
      }
    },
  );

  app.post("/api/paystack/webhook", async (req: Request, res: Response) => {
    try {
      const signature = req.header("x-paystack-signature");
      if (!signature) {
        return res.status(400).json({ message: "Missing signature" });
      }

      let secret: string;
      try {
        secret = getPaystackConfig().secret;
      } catch (e: any) {
        console.error("Paystack webhook misconfigured:", e);
        return res.status(500).json({ message: "Paystack not configured" });
      }

      const rawBody = (req as any).rawBody as Buffer | string | undefined;
      const raw =
        typeof rawBody === "string"
          ? rawBody
          : Buffer.isBuffer(rawBody)
          ? rawBody
          : JSON.stringify(req.body);

      const hash = crypto
        .createHmac("sha512", secret)
        .update(raw)
        .digest("hex");

      if (hash !== signature) {
        console.warn("Invalid Paystack webhook signature");
        return res.status(401).json({ message: "Invalid signature" });
      }

      const payload = req.body as any;
      if (payload?.event !== "charge.success") {
        // Acknowledge but ignore other events for now
        return res.status(200).json({ received: true });
      }

      const eventData = payload.data || {};
      const metadata = eventData.metadata || {};
      const rideId = metadata.rideId as string | undefined;
      const userId = (metadata.userId as string | undefined) ?? undefined;

      if (!rideId) {
        return res
          .status(200)
          .json({ received: true, message: "No rideId in metadata" });
      }

      const amountMinor = eventData.amount as number | undefined;
      const amount = typeof amountMinor === "number" ? amountMinor / 100 : 0;

      try {
        const ride = await storage.getRide(rideId);
        if (!ride) {
          console.warn("Paystack webhook for unknown ride:", rideId);
          return res.status(200).json({ received: true });
        }

        const finalAmount = amount || ride.price || 0;

        await storage.createPayment({
          rideId: ride.id,
          payerUserId: userId || ride.clientId,
          amount: finalAmount,
          method: "paystack",
          status: "paid",
          provider: "paystack",
          providerRef: eventData.reference,
        });

        await storage.updateRide(ride.id, {
          paymentStatus: "paid",
          paymentMethod: "card",
        });

        // Record earnings and commission if not already done (webhook may fire before trip_completed)
        if (ride.chauffeurId && finalAmount > 0) {
          try {
            const earningsCalc = calculateChauffeurEarnings(finalAmount);
            const existing = await storage.getEarningsByChauffeur(ride.chauffeurId);
            const alreadyRecorded = existing.some((e) => e.rideId === ride.id);
            if (!alreadyRecorded) {
              await storage.createEarning({
                chauffeurId: ride.chauffeurId,
                rideId: ride.id,
                amount: earningsCalc.chauffeurEarnings,
                commission: earningsCalc.commission,
                type: "card",
              });
              const chauffeur = await storage.getChauffeur(ride.chauffeurId);
              if (chauffeur) {
                await storage.updateChauffeur(ride.chauffeurId, {
                  earningsTotal: (chauffeur.earningsTotal || 0) + earningsCalc.chauffeurEarnings,
                });
              }
            }
          } catch (earningsErr: any) {
            console.error("Webhook earnings record failed (non-fatal):", earningsErr.message);
          }
        }
      } catch (dbError) {
        console.error("Error applying Paystack payment:", dbError);
        // Still return 200 so Paystack does not retry indefinitely
        return res.status(200).json({ received: true, error: "db_error" });
      }

      return res.status(200).json({ received: true });
    } catch (error: any) {
      console.error("Paystack webhook error:", error);
      return res.status(500).json({ message: "Webhook processing failed" });
    }
  });

  app.get("/api/rides/:id", async (req: Request, res: Response) => {
    try {
      const ride = await storage.getRide(req.params.id);
      if (!ride) return res.status(404).json({ message: "Ride not found" });
      let clientFirstName = "Client";
      try {
        const client = await storage.getUser(ride.clientId);
        clientFirstName = getUserFirstName(client, "Client");
      } catch {}
      return res.json({ ...ride, clientFirstName });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/rides/:id", async (req: Request, res: Response) => {
    try {
      const ride = await storage.updateRide(req.params.id, req.body);
      if (!ride) return res.status(404).json({ message: "Ride not found" });
      let clientFirstName = "Client";
      try {
        const client = await storage.getUser(ride.clientId);
        clientFirstName = getUserFirstName(client, "Client");
      } catch {}
      const rideWithClientName = { ...ride, clientFirstName };

      io.emit("ride:statusUpdate", rideWithClientName);
      return res.json(rideWithClientName);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/rides/:id/accept", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { chauffeurId } = req.body;
      if (!chauffeurId) return res.status(400).json({ message: "chauffeurId is required" });

      // Verify the authenticated user actually owns this chauffeur profile
      const chauffeur = await storage.getChauffeur(chauffeurId);
      if (!chauffeur || chauffeur.userId !== req.auth!.sub) {
        return res.status(403).json({ message: "Forbidden: chauffeur mismatch" });
      }

      // Atomic accept — returns undefined if another driver already claimed the ride
      const updated = await storage.acceptRideAtomic(req.params.id, chauffeurId, chauffeur.activeVehicleId || null);
      if (!updated) {
        return res.status(409).json({ message: "Ride already assigned to another driver" });
      }

      // Enrich with client first name before emitting — nav modal uses it immediately
      let clientFirstName = "Rider";
      try {
        const client = await storage.getUser(updated.clientId);
        clientFirstName = getUserFirstName(client, "Rider");
      } catch {}
      const enrichedAccepted = { ...updated, clientFirstName };

      io.emit("ride:accepted", enrichedAccepted);
      if (updated.clientId) {
        await storage.createNotification({
          userId: updated.clientId,
          title: "Driver Assigned",
          body: "Your premium chauffeur has been assigned and is on the way.",
          type: "ride",
        });
        const riderUser = await storage.getUser(updated.clientId);
        if ((riderUser as any)?.pushToken) {
          sendExpoPushNotification(
            [(riderUser as any).pushToken],
            "🚘 Driver Assigned",
            "Your premium chauffeur has been assigned and is on the way.",
            { rideId: updated.id, type: "ride:accepted" },
            { urgent: true, channelId: "client-alerts" },
          );
        }
      }
      // Notify the driver they are on the way to pick up
      await storage.createNotification({
        userId: chauffeur.userId,
        title: "Ride Accepted",
        body: "You're on your way to pick up the client. Head to the pickup location.",
        type: "ride",
      });
      if (chauffeur.pushToken) {
        sendExpoPushNotification(
          [chauffeur.pushToken],
          "🚗 Going to Pick Up",
          "You've accepted the ride. Head to the pickup location now.",
          { rideId: updated.id, type: "ride:accepted" }
        );
      }
      return res.json(enrichedAccepted);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/rides/:id/status", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { status } = req.body;

      // Verify caller is a party to this ride (chauffeur or rider)
      const existingRide = await storage.getRide(req.params.id);
      if (!existingRide) return res.status(404).json({ message: "Ride not found" });

      const callerUser = await storage.getUser(req.auth!.sub);
      if (!callerUser) return res.status(403).json({ message: "Forbidden" });

      const isRider = existingRide.clientId === callerUser.id;
      let isChauffeur = false;
      if (existingRide.chauffeurId) {
        const ch = await storage.getChauffeur(existingRide.chauffeurId);
        isChauffeur = ch?.userId === callerUser.id;
      }
      // Admins bypass ownership check
      const isAdmin = callerUser.role === "admin";
      if (!isRider && !isChauffeur && !isAdmin) {
        return res.status(403).json({ message: "Forbidden: not a party to this ride" });
      }

      // For cancellations, capture the pre-update ride first so we can refund
      const rideBeforeUpdate = status === "cancelled" ? existingRide : null;
      const now = new Date();
      const isRiderCancellation = status === "cancelled" && isRider && !isAdmin;
      const minutesDrivingToPickup = existingRide.pickupTravelStartedAt
        ? Math.max(0, (now.getTime() - new Date(existingRide.pickupTravelStartedAt).getTime()) / 60000)
        : 0;
      const waitingFee = existingRide.arrivedAt
        ? calculateWaitingFee(Math.max(0, (now.getTime() - new Date(existingRide.arrivedAt).getTime()) / 60000)) / 100
        : 0;
      const cancellation = status === "cancelled"
        ? resolveCancellation({
            actor: isRiderCancellation ? "rider" : "driver",
            baseFareCents: Math.round(Number(existingRide.baseFare || 0) * 100),
            minutesDrivingToPickup,
            waitingFeeCents: Math.round(waitingFee * 100),
            arrived: !!existingRide.arrivedAt,
          })
        : null;
      const finalEstimate = status === "trip_completed"
        ? calculatePrice(Number(existingRide.actualDistanceKm || existingRide.distanceKm || 0), existingRide.vehicleType || "budget", {
            demandMultiplier: Number(existingRide.demandMultiplier || 1),
          })
        : null;

      const ride = await storage.updateRide(req.params.id, {
        status,
        ...(status === "trip_completed" ? { completedAt: new Date() } : {}),
        ...(finalEstimate ? { price: finalEstimate.totalPrice, finalFare: finalEstimate.totalPrice, settlementStatus: "finalised" } : {}),
        ...(status === "chauffeur_arriving" && isChauffeur && !existingRide.pickupTravelStartedAt ? { pickupTravelStartedAt: now } : {}),
        ...(status === "chauffeur_arrived" && isChauffeur ? { arrivedAt: now } : {}),
        ...(cancellation ? { waitingFee, cancellationFee: cancellation.feeCents / 100, finalFare: cancellation.feeCents / 100, settlementStatus: cancellation.feeCents > 0 ? "cancellation_due" : "cancelled" } : {}),
      });
      if (!ride) return res.status(404).json({ message: "Ride not found" });

      if (status === "trip_completed" && ride.paymentMethod === "card") {
        const adjustment = Number(ride.price || 0) - Number(rideBeforeUpdate?.price || existingRide.price || 0);
        if (adjustment > 0) await chargeFinalFareAdjustment(ride, adjustment);
        if (adjustment < 0) await refundFinalFareAdjustment(ride, Math.abs(adjustment));
      }

      // ── Cancellation: refunds + notifications for all parties ──
      if (status === "cancelled" && rideBeforeUpdate) {
        try {
          const payments = await storage.getPaymentsByRide(req.params.id);

          const cancellationFee = Number(ride.cancellationFee || 0);
          const refundAmount = Math.max(0, Number(rideBeforeUpdate.price || 0) - cancellationFee);

          // ── Card payment → a single direct Paystack refund, less any earned cancellation fee ──
          const cardPayment = payments.find((p: any) =>
            p.method === "card" && p.status === "paid" && p.paystackReference
          );
          if (cardPayment?.paystackReference && refundAmount > 0) {
            const secret = process.env.PAYSTACK_SECRET_KEY || "";
            await axios.post(
              "https://api.paystack.co/refund",
              { transaction: cardPayment.paystackReference, amount: Math.round(refundAmount * 100) },
              { headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" } }
            );
            await storage.updatePayment(cardPayment.id, { status: cancellationFee > 0 ? "paid" : "refunded" });
            const rider = await storage.getUser(rideBeforeUpdate.clientId);
            if (rider) {
              await storage.createNotification({
                userId: rider.id,
                title: "Refund Issued",
                body: `Your ride was cancelled. R${refundAmount.toFixed(2)} has been refunded to your card.`,
                type: "payment",
              });
              if ((rider as any)?.pushToken) {
                sendExpoPushNotification(
                  [(rider as any).pushToken],
                  "Refund Issued",
                  `R${refundAmount.toFixed(2)} has been refunded to your card.`,
                  { rideId: ride.id, type: "ride:cancelled" },
                  { urgent: true, channelId: "client-alerts" },
                );
              }
            }
          }

          // ── Wallet payment → reverse the wallet deduction ──
          const walletPayment = !cardPayment
            ? payments.find((p: any) => p.method === "wallet" && p.status === "paid")
            : null;
          if (walletPayment && refundAmount > 0) {
            const rider = await storage.getUser(rideBeforeUpdate.clientId);
            if (rider) {
              const amt = refundAmount;
              const balanceBefore = rider.walletBalance || 0;
              const newBalance = balanceBefore + amt;
              await storage.updateUser(rider.id, { walletBalance: newBalance });
              await storage.updatePayment(walletPayment.id, { status: cancellationFee > 0 ? "paid" : "refunded" });
              await storage.createWalletTransaction({
                userId: rider.id, type: "refund", amount: amt,
                balanceBefore, balanceAfter: newBalance,
                reference: `wallet_refund_${ride.id}_${Date.now()}`,
                description: "Ride cancelled — wallet balance restored",
                rideId: ride.id, status: "completed",
              });
              await storage.createNotification({
                userId: rider.id,
                title: "Refund Issued",
                body: `Your ride was cancelled. R${amt.toFixed(2)} has been returned to your A2B wallet.`,
                type: "payment",
              });
              if ((rider as any)?.pushToken) {
                sendExpoPushNotification(
                  [(rider as any).pushToken],
                  "Refund Issued",
                  `R${amt.toFixed(2)} has been returned to your A2B wallet.`,
                  { rideId: ride.id, type: "ride:cancelled" },
                  { urgent: true, channelId: "client-alerts" },
                );
              }
            }
          }

          // ── Cash rides → notify client (no charge to reverse) ──
          const paymentMethod = rideBeforeUpdate.paymentMethod || "cash";
          if (!cardPayment && !walletPayment && paymentMethod === "cash") {
            const rider = await storage.getUser(rideBeforeUpdate.clientId);
            if (rider && cancellationFee > 0) {
              const balanceBefore = Number(rider.walletBalance || 0);
              const balanceAfter = balanceBefore - cancellationFee;
              await storage.updateUser(rider.id, { walletBalance: balanceAfter });
              await storage.createWalletTransaction({
                userId: rider.id, type: "cancellation_fee", amount: -cancellationFee,
                balanceBefore, balanceAfter,
                reference: `cash_cancellation_${ride.id}`,
                description: "Cash ride cancellation fee",
                rideId: ride.id, status: "completed",
              });
            }
            await storage.createNotification({
              userId: rideBeforeUpdate.clientId,
              title: "Ride Cancelled",
              body: cancellationFee > 0 ? `Your cancellation fee is R${cancellationFee.toFixed(2)}.` : "No cancellation fee was charged.",
              type: "ride",
            });
            if ((rider as any)?.pushToken) {
              sendExpoPushNotification(
                [(rider as any).pushToken],
                "Ride Cancelled",
                cancellationFee > 0 ? `A cancellation fee of R${cancellationFee.toFixed(2)} was applied.` : "No cancellation fee was charged.",
                { rideId: ride.id, type: "ride:cancelled" },
                { urgent: true, channelId: "client-alerts" },
              );
            }
          }

          // ── Notify the assigned chauffeur (if any) ──
          if (rideBeforeUpdate.chauffeurId) {
            const chauffeur = await storage.getChauffeur(rideBeforeUpdate.chauffeurId);
            if (chauffeur?.userId) {
              await storage.createNotification({
                userId: chauffeur.userId,
                title: "Ride Cancelled",
                body: "The client has cancelled this trip.",
                type: "ride",
              });
            }
            if ((chauffeur as any)?.pushToken) {
              sendExpoPushNotification(
                [(chauffeur as any).pushToken],
                "Ride Cancelled",
                "The client has cancelled this trip."
              );
            }
          }
        } catch (refundErr: any) {
          console.error("Cancellation refund/notification failed (non-fatal):", refundErr.message);
        }
      }

      if (status === "trip_completed" && ride.chauffeurId && ride.price) {
        // Wrap each ancillary operation independently so a DB hiccup
        // on earnings / notifications does NOT kill the status update.
        try {
          const earningsCalc = calculateChauffeurEarnings(ride.price);
          // Guard against double-counting: Paystack webhook may have already created
          // the earning record for card payments before trip_completed fires.
          const existingEarnings = await storage.getEarningsByChauffeur(ride.chauffeurId);
          const alreadyRecorded = existingEarnings.some((e: any) => e.rideId === ride.id);
          const paymentMethod = ride.paymentMethod || "cash";
          if (!alreadyRecorded) {
            if (paymentMethod === "cash") {
              // Cash trips: driver collects the gross fare in hand,
              // while the platform records the 25% commission digitally.
              await storage.createEarning({
                chauffeurId: ride.chauffeurId,
                rideId: ride.id,
                amount: -earningsCalc.commission,
                commission: earningsCalc.commission,
                type: "cash",
              });
              const chauffeur = await storage.getChauffeur(ride.chauffeurId);
              if (chauffeur) {
                await storage.updateChauffeur(ride.chauffeurId, {
                  earningsTotal:
                    (chauffeur.earningsTotal || 0) - earningsCalc.commission,
                });
              }
            } else {
              // Card / wallet trips: add the driver's 75% share to the digital wallet balance.
              await storage.createEarning({
                chauffeurId: ride.chauffeurId,
                rideId: ride.id,
                amount: earningsCalc.chauffeurEarnings,
                commission: earningsCalc.commission,
                type: paymentMethod,
              });
              const chauffeur = await storage.getChauffeur(ride.chauffeurId);
              if (chauffeur) {
                await storage.updateChauffeur(ride.chauffeurId, {
                  earningsTotal:
                    (chauffeur.earningsTotal || 0) + earningsCalc.chauffeurEarnings,
                });
              }
            }
          }
        } catch (earningsErr: any) {
          console.error("earnings record failed (non-fatal):", earningsErr.message);
        }

        // ── Reward programme earnings: credit 2.5% for invited drivers and riders ──
        try {
          const completingChauffeur = await storage.getChauffeur(ride.chauffeurId);
          if (completingChauffeur?.userId) {
            await creditReferralReward({
              referredUserId: completingChauffeur.userId,
              sourceUserId: completingChauffeur.userId,
              rideId: ride.id,
              grossFare: ride.price,
              type: "driver_referral_commission",
              description: "2.5% reward programme earning from a trip completed by a driver you invited",
              notificationBody: "You earned R {amount} — 2.5% from a trip completed by a driver you invited.",
              referencePrefix: "drv_ref",
            });
          }
          if (ride.clientId) {
            await creditReferralReward({
              riderUserId: ride.clientId,
              sourceUserId: ride.clientId,
              rideId: ride.id,
              grossFare: ride.price,
              type: "rider_referral_commission",
              description: "2.5% reward programme earning from a trip completed by a rider you invited",
              notificationBody: "You earned R {amount} — 2.5% from a trip completed by a rider you invited.",
              referencePrefix: "rdr_ref",
            });
          }
        } catch (referralCommErr: any) {
          console.error("referral commission failed (non-fatal):", referralCommErr.message);
        }

        try {
          await storage.createNotification({
            userId: ride.clientId,
            title: "Trip Completed",
            body: `Your trip has been completed. Fare: R ${ride.price}. Thank you for choosing A2B LIFT.`,
            type: "ride",
          });
          const riderUser = await storage.getUser(ride.clientId);
          if ((riderUser as any)?.pushToken) {
            sendExpoPushNotification(
              [(riderUser as any).pushToken],
              "Trip Completed",
              `Fare: R ${ride.price}. Thank you for choosing A2B LIFT.`,
              { rideId: ride.id, type: "ride:completed" },
              { urgent: true, channelId: "client-alerts" },
            );
          }
        } catch (notifErr: any) {
          console.error("notification failed (non-fatal):", notifErr.message);
        }

        try {
          const paymentMethod = ride.paymentMethod || "cash";
          if (paymentMethod === "cash") {
            const existingPayments = await storage.getPaymentsByRide(ride.id);
            if (existingPayments.length === 0) {
              await storage.createPayment({
                rideId: ride.id,
                payerUserId: ride.clientId,
                amount: ride.price,
                method: "cash",
                status: "paid",
                provider: "cash",
                providerRef: `cash_${ride.id}_${Date.now()}`,
              });
              await storage.updateRide(ride.id, { paymentStatus: "paid", paymentMethod: "cash" });
            } else {
              const pendingPayment = existingPayments.find((p) => p.status === "pending" && p.method === "cash");
              if (pendingPayment) {
                await storage.updatePayment(pendingPayment.id, { status: "paid" });
                await storage.updateRide(ride.id, { paymentStatus: "paid" });
              }
            }
          }
        } catch (payErr: any) {
          console.error("payment record failed (non-fatal):", payErr.message);
        }
      }

      let clientFirstName = "Client";
      try {
        const client = await storage.getUser(ride.clientId);
        clientFirstName = getUserFirstName(client, "Client");
      } catch {}
      const rideWithClientName = { ...ride, clientFirstName };

      io.emit("ride:statusUpdate", rideWithClientName);

      // ── Notify rider for key status transitions ──
      try {
        if (status === "chauffeur_arriving" && ride.clientId) {
          await storage.createNotification({
            userId: ride.clientId,
            title: "Driver Arriving",
            body: "Your chauffeur is arriving at your pickup location. Please be ready.",
            type: "ride",
          });
          const riderUser = await storage.getUser(ride.clientId);
          if ((riderUser as any)?.pushToken) {
            sendExpoPushNotification(
              [(riderUser as any).pushToken],
              "🚗 Driver Arriving",
              "Your chauffeur is arriving at your pickup. Please be ready!",
              { rideId: ride.id, type: "ride:arriving" },
              { urgent: true, channelId: "client-alerts" }
            );
          }
        } else if (status === "trip_started" && ride.clientId) {
          await storage.createNotification({
            userId: ride.clientId,
            title: "Trip Started",
            body: `Your trip is underway to ${ride.dropoffAddress || "your destination"}.`,
            type: "ride",
          });
          const riderUser = await storage.getUser(ride.clientId);
          if ((riderUser as any)?.pushToken) {
            sendExpoPushNotification(
              [(riderUser as any).pushToken],
              "🚀 Trip Started",
              `Your ride is underway to ${ride.dropoffAddress || "your destination"}.`,
              { rideId: ride.id, type: "ride:started" },
              { urgent: true, channelId: "client-alerts" }
            );
          }
        }
      } catch (notifErr: any) {
        console.error("rider status notification failed (non-fatal):", notifErr.message);
      }

      return res.json(rideWithClientName);
    } catch (error: any) {
      console.error("ride status update error:", error.message, error.stack);
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/rides/:id/pay", requireAuth, async (req: AuthedRequest, res: Response) => {
    const ride = await storage.getRide(req.params.id);
    if (!ride) return res.status(404).json({ message: "Ride not found" });
    if (ride.clientId !== req.auth!.sub) return res.status(403).json({ message: "Forbidden" });
    const amount = ride.price || 0;
    const method = (req.body?.method || ride.paymentMethod || "cash") as string;

    const payment = await storage.createPayment({
      rideId: ride.id,
      payerUserId: req.auth!.sub,
      amount,
      method,
      status: method === "cash" ? "pending" : "paid",
    });

    await storage.updateRide(ride.id, {
      paymentStatus: payment.status === "paid" ? "paid" : "pending",
      paymentMethod: method,
    });

    return res.json({ payment });
  });

  app.post("/api/rides/:id/rate", requireAuth, async (req: AuthedRequest, res: Response) => {
    const { rating, comment } = req.body;
    const ride = await storage.getRide(req.params.id);
    if (!ride) return res.status(404).json({ message: "Ride not found" });
    if (ride.clientId !== req.auth!.sub) return res.status(403).json({ message: "Forbidden" });
    if (!ride.chauffeurId) return res.status(400).json({ message: "Ride has no chauffeur" });
    if (ride.status !== "trip_completed") return res.status(400).json({ message: "Ride not completed" });

    const rr = await storage.createRideRating({
      rideId: ride.id,
      clientId: ride.clientId,
      chauffeurId: ride.chauffeurId,
      rating,
      comment: comment || null,
    });

    const chauffeur = await storage.getChauffeur(ride.chauffeurId);
    if (chauffeur) {
      const avgRating = await storage.getAverageRatingForUser(chauffeur.userId);
      if (avgRating != null) {
        await storage.updateUser(chauffeur.userId, { rating: avgRating });
      }
    }

    return res.json(rr);
  });

  app.post("/api/rides/:id/rate-client", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      await ensureClientRatingsTable();

      const { rating, comment } = req.body;
      const numericRating = Number(rating);
      if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
        return res.status(400).json({ message: "Rating must be an integer between 1 and 5" });
      }

      const ride = await storage.getRide(req.params.id);
      if (!ride) return res.status(404).json({ message: "Ride not found" });
      if (!ride.chauffeurId) return res.status(400).json({ message: "Ride has no chauffeur" });
      if (ride.status !== "trip_completed") return res.status(400).json({ message: "Ride not completed" });

      const chauffeur = await storage.getChauffeur(ride.chauffeurId);
      if (!chauffeur || chauffeur.userId !== req.auth!.sub) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const result = await pool.query(
        `
          INSERT INTO client_ratings (ride_id, client_id, chauffeur_id, rating, comment)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (ride_id, chauffeur_id)
          DO UPDATE SET
            rating = EXCLUDED.rating,
            comment = EXCLUDED.comment,
            created_at = now()
          RETURNING
            id,
            ride_id AS "rideId",
            client_id AS "clientId",
            chauffeur_id AS "chauffeurId",
            rating,
            comment,
            created_at AS "createdAt"
        `,
        [ride.id, ride.clientId, ride.chauffeurId, numericRating, comment || null]
      );

      const averageResult = await pool.query(
        `SELECT ROUND(AVG(rating)::numeric, 2) AS avg_rating FROM client_ratings WHERE client_id = $1`,
        [ride.clientId]
      );
      const average = averageResult.rows[0]?.avg_rating != null ? Number(averageResult.rows[0].avg_rating) : null;
      if (average != null) {
        await storage.updateUser(ride.clientId, { rating: average });
      }

      return res.json(result.rows[0]);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/rides/client/:clientId", async (req: Request, res: Response) => {
    try {
      const ridesList = await storage.getRidesByClient(req.params.clientId);
      return res.json(ridesList);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/rides/chauffeur/:chauffeurId", async (req: Request, res: Response) => {
    try {
      const ridesList = await storage.getRidesByChauffeur(req.params.chauffeurId);
      return res.json(ridesList);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // Polling fallback: returns the nearest unassigned searching ride for a driver.
  // Used by the driver app when the socket event was missed.
  // All nearby searching rides (for driver trip list panel)
  app.get("/api/rides/available/:chauffeurId", async (req: Request, res: Response) => {
    try {
      const chauffeur = await storage.getChauffeur(req.params.chauffeurId);
      if (!chauffeur || !chauffeur.isOnline || !chauffeur.isApproved) {
        return res.json([]);
      }
      const allRides = await storage.getAllRides();
      const searching = allRides.filter((r) => r.status === "searching");
      if (!searching.length) return res.json([]);

      let candidates = searching;
      if (chauffeur.lat && chauffeur.lng) {
        candidates = searching
          .map((r) => ({
            ...r,
            distKm: calculateHaversineDistanceKm(
              Number(chauffeur.lat), Number(chauffeur.lng),
              parseFloat(r.pickupLat as any), parseFloat(r.pickupLng as any)
            ),
          }))
            .filter((r: any) => r.distKm <= RIDE_MATCH_RADIUS_KM)
          .sort((a: any, b: any) => a.distKm - b.distKm) as typeof searching;
      }

      // Enrich with client first name
      const enriched = await Promise.all(
        candidates.slice(0, 10).map(async (r: any) => {
          try {
            const client = await storage.getUser(r.clientId);
            const firstName = getUserFirstName(client, "Rider");
            return { ...r, clientFirstName: firstName };
          } catch {
            return { ...r, clientFirstName: "Rider" };
          }
        })
      );

      return res.json(enriched);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/rides/chauffeur-pending/:chauffeurId", async (req: Request, res: Response) => {
    try {
      const chauffeur = await storage.getChauffeur(req.params.chauffeurId);
      if (!chauffeur || !chauffeur.isOnline || !chauffeur.isApproved) {
        return res.status(204).end();
      }
      const allRides = await storage.getAllRides();
      const searching = allRides.filter((r) => r.status === "searching");
      if (!searching.length) return res.status(204).end();

      // Helper to enrich a ride with clientFirstName
      async function enrichRide(r: any) {
        try {
          const client = await storage.getUser(r.clientId);
          const firstName = getUserFirstName(client, "Rider");
          return { ...r, clientFirstName: firstName };
        } catch {
          return { ...r, clientFirstName: "Rider" };
        }
      }

        // If driver has a fresh location, return the nearest searching ride within the match radius
        if (hasFreshChauffeurLocation(chauffeur)) {
        const withDist = searching
          .map((r) => ({
            ...r,
            distKm: calculateHaversineDistanceKm(
              Number(chauffeur.lat), Number(chauffeur.lng),
              parseFloat(r.pickupLat as any), parseFloat(r.pickupLng as any)
            ),
          }))
            .filter((r) => r.distKm <= RIDE_MATCH_RADIUS_KM)
          .sort((a, b) => a.distKm - b.distKm);
        if (!withDist.length) return res.status(204).end();
        return res.json(await enrichRide(withDist[0]));
      }

      // No location on file — return the most recent searching ride
      return res.json(await enrichRide(searching[searching.length - 1]));
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/rides", async (_req: Request, res: Response) => {
    try {
      const allRides = await storage.getAllRides();
      return res.json(allRides);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // -----------------------------
  // Earnings / Withdrawals
  // -----------------------------
  app.get("/api/earnings/chauffeur/:chauffeurId", async (req: Request, res: Response) => {
    try {
      const earningsList = await storage.getEarningsByChauffeur(req.params.chauffeurId);
      return res.json(earningsList);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/earnings/chauffeur/:chauffeurId/annual-share", async (req: Request, res: Response) => {
    try {
      const yearParam = Number(req.query.year);
      const year = Number.isFinite(yearParam) && yearParam > 2020 ? yearParam : new Date().getFullYear();
      const [chauffeur, earningsList] = await Promise.all([
        storage.getChauffeur(req.params.chauffeurId),
        storage.getEarningsByChauffeur(req.params.chauffeurId),
      ]);
      const summary = summarizeAnnualDriverShare(earningsList, year);
      const createdAt = chauffeur?.createdAt ? new Date(chauffeur.createdAt).getTime() : Date.now();
      const activeMonths = Math.max(0, Math.floor((Date.now() - createdAt) / (1000 * 60 * 60 * 24 * 30)));
      return res.json({
        ...summary,
        activeMonths,
        eligibleByAccountAge: activeMonths >= DRIVER_SHARE_MIN_ACTIVE_MONTHS,
        note: "Final December payout is subject to active driver status, consistent weekly trips, and service standards review.",
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/withdrawals", async (req: Request, res: Response) => {
    try {
      const withdrawal = await storage.createWithdrawal(req.body);
      return res.json(withdrawal);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/withdrawals/chauffeur/:chauffeurId", async (req: Request, res: Response) => {
    try {
      const withdrawalsList = await storage.getWithdrawalsByChauffeur(req.params.chauffeurId);
      return res.json(withdrawalsList);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/withdrawals", async (_req: Request, res: Response) => {
    try {
      const allWithdrawals = await storage.getAllWithdrawals();
      return res.json(allWithdrawals);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/withdrawals/:id", async (req: Request, res: Response) => {
    try {
      const withdrawal = await storage.updateWithdrawal(req.params.id, req.body);
      if (!withdrawal) return res.status(404).json({ message: "Withdrawal not found" });
      return res.json(withdrawal);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // -----------------------------
  // Chat
  // -----------------------------
  app.post("/api/messages", async (req: Request, res: Response) => {
    try {
      const { rideId: _rid, senderId: _sid, messageText: _mt } = req.body;
      console.log(`[POST /api/messages] rideId=${_rid} senderId=${_sid} text="${(_mt || "").slice(0, 40)}"`);
      const message = await storage.createMessage(req.body);
      io.emit("chat:newMessage", message);
      const { rideId, senderId, messageText: msgText } = req.body;
      if (rideId && senderId) {
        try {
          const ride = await storage.getRide(rideId);
          if (ride) {
            const previewText = (msgText || "").slice(0, 80);
            if (senderId === ride.clientId && ride.chauffeurId) {
              const chauffeur = await storage.getChauffeur(ride.chauffeurId);
              if (chauffeur?.pushToken) {
                sendExpoPushNotification([chauffeur.pushToken], "New message from rider", previewText);
              }
              if (chauffeur?.userId) {
                await storage.createNotification({ userId: chauffeur.userId, type: "chat", title: "New message from rider", body: previewText, isRead: false });
              }
            } else if (ride.chauffeurId) {
              const chauffeur = await storage.getChauffeur(ride.chauffeurId);
              if (chauffeur?.userId && senderId !== ride.clientId) {
                const rider = await storage.getUser(ride.clientId);
                if ((rider as any)?.pushToken) {
                  sendExpoPushNotification(
                    [(rider as any).pushToken],
                    "New message from chauffeur",
                    previewText,
                    { rideId: ride.id, type: "chat:new" },
                    { urgent: true, channelId: "client-alerts" },
                  );
                }
                await storage.createNotification({ userId: ride.clientId, type: "chat", title: "New message from chauffeur", body: previewText, isRead: false });
              }
            }
          }
        } catch (e: any) {
          console.error("[chat] notification failed (non-fatal):", e.message);
        }
      }
      return res.json(message);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/messages/ride/:rideId", async (req: Request, res: Response) => {
    try {
      const messagesList = await storage.getMessagesByRide(req.params.rideId);
      return res.json(messagesList);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // -----------------------------
  // Safety + Notifications
  // -----------------------------
  app.post("/api/safety-reports", async (req: Request, res: Response) => {
    try {
      const { userId, rideId, type, description } = req.body;
      const aiResponse = generateAIResponse(type, description);
      const priority =
        type === "emergency" ? "high" : type === "safety" ? "medium" : "low";
      const report = await storage.createSafetyReport({
        userId,
        rideId: rideId || null,
        type,
        description,
        aiResponse,
        priority,
        status: "open",
      });
      await storage.createNotification({
        userId,
        title: type === "emergency" ? "Emergency Report Filed" : "Report Received",
        body: aiResponse,
        type: "safety",
      });
      io.emit("safety:newReport", report);
      return res.json({ report, aiResponse });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/safety-reports/user/:userId", async (req: Request, res: Response) => {
    try {
      const reports = await storage.getSafetyReportsByUser(req.params.userId);
      return res.json(reports);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/safety-reports", async (_req: Request, res: Response) => {
    try {
      const allReports = await storage.getAllSafetyReports();
      return res.json(allReports);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/safety-reports/:id", async (req: Request, res: Response) => {
    try {
      const report = await storage.updateSafetyReport(req.params.id, req.body);
      if (!report) return res.status(404).json({ message: "Report not found" });
      return res.json(report);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/notifications/user/:userId", async (req: Request, res: Response) => {
    try {
      const notifs = await storage.getNotificationsByUser(req.params.userId);
      return res.json(notifs);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/notifications/:id/read", async (req: Request, res: Response) => {
    try {
      const notif = await storage.markNotificationRead(req.params.id);
      if (!notif) return res.status(404).json({ message: "Notification not found" });
      return res.json(notif);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/notifications/user/:userId/all", async (req: Request, res: Response) => {
    try {
      await storage.deleteAllNotificationsByUser(req.params.userId);
      return res.json({ message: "All notifications cleared" });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // -----------------------------
  // Trip Enquiries
  // -----------------------------

  // Client submits a help message about a trip
  app.post("/api/trip-enquiries", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { rideId, message } = req.body;
      if (!rideId || !message?.trim()) return res.status(400).json({ message: "rideId and message are required" });
      const enquiry = await storage.createTripEnquiry({ rideId, userId: req.auth!.sub, message: message.trim() });
      // Notify all admins via notification (stored for admin dashboard badge)
      const allUsers = await db.select().from(users).where(eq(users.role, "admin" as any));
      for (const admin of allUsers) {
        await storage.createNotification({
          userId: admin.id,
          type: "general",
          title: "📩 New Trip Enquiry",
          body: `A user submitted a help request about a trip: "${message.trim().slice(0, 80)}${message.length > 80 ? "…" : ""}"`,
          isRead: false,
        });
      }
      return res.json(enquiry);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // Admin: list all enquiries
  app.get("/api/trip-enquiries", requireAuth, requireRole(["admin"]), async (_req: AuthedRequest, res: Response) => {
    try {
      const enquiries = await storage.getAllTripEnquiries();
      return res.json(enquiries);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // Admin: reply to an enquiry — sends in-app notification to user
  app.post("/api/trip-enquiries/:id/reply", requireAuth, requireRole(["admin"]), async (req: AuthedRequest, res: Response) => {
    try {
      const { reply } = req.body;
      if (!reply?.trim()) return res.status(400).json({ message: "reply is required" });
      const enquiry = await storage.replyToTripEnquiry(req.params.id, reply.trim());
      if (!enquiry) return res.status(404).json({ message: "Enquiry not found" });
      // Notify the user who submitted the enquiry
      await storage.createNotification({
        userId: enquiry.userId,
        type: "general",
        title: "💬 Admin replied to your trip enquiry",
        body: reply.trim(),
        isRead: false,
      });
      return res.json(enquiry);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // -----------------------------
  // Admin
  // -----------------------------
  app.get(
    "/api/admin/payments",
    requireAuth,
    requireRole(["admin"]),
    async (_req: AuthedRequest, res: Response) => {
      try {
        const [allPayments, allUsers, allRides] = await Promise.all([
          storage.getAllPayments(),
          storage.getAllUsers ? storage.getAllUsers() : [] as any[],
          storage.getAllRides(),
        ]);
        const usersById = Object.fromEntries((allUsers as any[]).map((u: any) => [u.id, u]));
        const ridesById = Object.fromEntries(allRides.map((r: any) => [r.id, r]));
        const enriched = allPayments.map((p: any) => ({
          ...p,
          riderName: usersById[p.payerUserId]?.name || "Unknown",
          riderEmail: usersById[p.payerUserId]?.username || "—",
          rideRoute: ridesById[p.rideId]
            ? `${ridesById[p.rideId].pickupAddress || "?"} → ${ridesById[p.rideId].dropoffAddress || "?"}`
            : p.rideId ? `Ride ${p.rideId.slice(0, 8)}` : "Wallet top-up",
        }));
        return res.json(enriched);
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    },
  );

  app.get(
    "/api/admin/liveness-selfies",
    requireAuth,
    requireRole(["admin"]),
    async (_req: AuthedRequest, res: Response) => {
      try {
        const allRides = await storage.getAllRides();
        const selfieRides = allRides
          .filter((ride) => Boolean(ride.cashSelfieUrl))
          .sort((a, b) => {
            const left = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const right = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return right - left;
          });

        const records = await Promise.all(
          selfieRides.map(async (ride) => {
            const rider = await storage.getUser(ride.clientId);
            const chauffeur = ride.chauffeurId
              ? await storage.getChauffeur(ride.chauffeurId)
              : undefined;
            const chauffeurUser = chauffeur?.userId
              ? await storage.getUser(chauffeur.userId)
              : undefined;

            return {
              rideId: ride.id,
              riderId: ride.clientId,
              riderName: rider?.name || "Unknown Rider",
              riderEmail: rider?.username || "",
              chauffeurId: chauffeur?.id || null,
              chauffeurName: chauffeurUser?.name || null,
              pickupAddress: ride.pickupAddress || null,
              dropoffAddress: ride.dropoffAddress || null,
              paymentMethod: ride.paymentMethod || "cash",
              paymentStatus: ride.paymentStatus || "unpaid",
              rideStatus: ride.status || "requested",
              price: ride.price || 0,
              cashSelfieUrl: ride.cashSelfieUrl,
              livenessStatus: ride.livenessStatus || "not_required",
              livenessProvider: ride.livenessProvider || "mock",
              livenessScore: ride.livenessScore,
              livenessVerifiedAt: ride.livenessVerifiedAt,
              createdAt: ride.createdAt,
            };
          }),
        );

        return res.json(records);
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    },
  );

  app.get(
    "/api/admin/stats",
    requireAuth,
    requireRole(["admin"]),
    async (_req: AuthedRequest, res: Response) => {
      try {
        const allRides = await storage.getAllRides();
        const allChauffeurs = await storage.getAllChauffeurs();
        const allWithdrawals = await storage.getAllWithdrawals();
        const allReports = await storage.getAllSafetyReports();
        const allEarnings = await storage.getAllEarnings();
        const driverApplications = await storage.getDriverApplications().catch(() => []);
        const applicationStatusByUserId = new Map(driverApplications.map((app: any) => [app.userId, app.status]));

        const completedRides = allRides.filter((r) => r.status === "trip_completed");
        const totalRevenue = completedRides.reduce((sum, r) => sum + (r.price || 0), 0);
        const totalPlatformCommission = allEarnings.reduce((sum, e) => sum + (e.commission || 0), 0);
        const totalDriverEarnings = allEarnings.reduce((sum, e) => sum + (e.amount || 0), 0);
        const activeRides = allRides.filter(
          (r) => !["trip_completed", "cancelled"].includes(r.status as string),
        );
        const pendingApprovals = allChauffeurs.filter((c) => !c.isApproved && applicationStatusByUserId.get(c.userId) !== "waitlisted");
        const pendingWithdrawals = allWithdrawals.filter((w) => w.status === "pending");
        const openReports = allReports.filter((r) => r.status === "open");

        return res.json({
          totalRides: allRides.length,
          completedRides: completedRides.length,
          activeRides: activeRides.length,
          totalRevenue: Math.round(totalRevenue),
          totalPlatformCommission: Math.round(totalPlatformCommission),
          totalDriverEarnings: Math.round(totalDriverEarnings),
          commissionRate: 25,
          totalChauffeurs: allChauffeurs.length,
          onlineChauffeurs: allChauffeurs.filter((c) => c.isOnline).length,
          pendingApprovals: pendingApprovals.length,
          pendingWithdrawals: pendingWithdrawals.length,
          openReports: openReports.length,
          totalReports: allReports.length,
        });
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    },
  );

  // -----------------------------
  // Admin seed — creates initial admin user (only works if no admin exists)
  // -----------------------------
  app.post("/api/admin/seed", async (req: Request, res: Response) => {
    try {
      const { username, password, name, seedSecret } = req.body;
      const existing = await storage.getUserByUsername(username || "admin");
      if (existing && existing.role === "admin") {
        return res.status(400).json({ message: "Admin user already exists" });
      }
      // Only require secret if an admin already exists (prevent re-seeding without auth)
      // First-time setup (no admin yet) is allowed freely
      const validSecret = process.env.ADMIN_SEED_SECRET || process.env.JWT_SECRET;
      if (existing && seedSecret !== validSecret) {
        return res.status(403).json({ message: "Invalid seed secret" });
      }
      const hashedPassword = await bcrypt.hash(password || "Admin@2026!", 10);
      const user = await storage.createUser({
        username: username || "admin",
        password: hashedPassword,
        name: name || "A2B Admin",
        phone: null,
        role: "admin",
      });
      const { password: _pw, ...safeUser } = user;
      return res.json({ message: "Admin user created", user: safeUser });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // -----------------------------
  // External API Proxy (103.154.2.122)
  // -----------------------------
  app.get("/api/external/health", async (_req: Request, res: Response) => {
    try {
      const result = await externalApiService.healthCheck();
      return res.status(result.statusCode || 200).json(result);
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/external/status", async (_req: Request, res: Response) => {
    try {
      const result = await externalApiService.getStatus();
      return res.status(result.statusCode || 200).json(result);
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  // Generic proxy for all external API routes (catch-all)
  app.use("/api/external", async (req: Request, res: Response, next: any) => {
    try {
      const endpoint = req.path.replace("/api/external", "") || "/";
      const result = await externalApiService.request(endpoint, {
        method: (req.method as "GET" | "POST" | "PUT" | "DELETE" | "PATCH") || "GET",
        body: Object.keys(req.body || {}).length > 0 ? req.body : undefined,
        headers: req.headers as Record<string, string>,
      });
      return res.status(result.statusCode || 200).json(result);
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============================================================
  // PAYSTACK PAYMENT ROUTES
  // ============================================================

  const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || "";
  const paystackAPI = axios.create({
    baseURL: "https://api.paystack.co",
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET}`,
      "Content-Type": "application/json",
    },
  });

  async function chargeFinalFareAdjustment(ride: any, amount: number) {
    const adjustmentKey = `final-fare-charge:${ride.id}:${Math.round(amount * 100)}`;
    const inserted = await pool.query(
      "INSERT INTO payment_adjustments (ride_id, adjustment_key, direction, amount, status) VALUES ($1,$2,'charge',$3,'pending') ON CONFLICT (adjustment_key) DO NOTHING RETURNING id",
      [ride.id, adjustmentKey, amount],
    );
    if (!inserted.rowCount) return;
    const rider = await storage.getUser(ride.clientId);
    const cards = rider ? await storage.getSavedCardsByUser(rider.id) : [];
    const card = cards.find((item: any) => item.isDefault) || cards[0];
    if (!rider || !card) {
      await pool.query("UPDATE payment_adjustments SET status = 'requires_payment' WHERE adjustment_key = $1", [adjustmentKey]);
      return;
    }
    const reference = `A2B-FINAL-${ride.id}-${Date.now()}`;
    const response = await paystackAPI.post("/transaction/charge_authorization", {
      authorization_code: card.paystackAuthCode, email: rider.username, amount: Math.round(amount * 100), currency: "ZAR", reference,
      metadata: { userId: rider.id, rideId: ride.id, adjustmentKey },
    });
    if (response.data?.data?.status !== "success") throw new Error("Final fare card adjustment failed");
    await storage.createPayment({ rideId: ride.id, payerUserId: rider.id, amount, method: "card", status: "paid", currency: "ZAR", paidAt: new Date(), paystackReference: reference, paystackAuthCode: card.paystackAuthCode });
    await pool.query("UPDATE payment_adjustments SET status = 'completed', provider_reference = $2, completed_at = now() WHERE adjustment_key = $1", [adjustmentKey, reference]);
  }

  async function refundFinalFareAdjustment(ride: any, amount: number) {
    const adjustmentKey = `final-fare-refund:${ride.id}:${Math.round(amount * 100)}`;
    const inserted = await pool.query("INSERT INTO payment_adjustments (ride_id, adjustment_key, direction, amount, status) VALUES ($1,$2,'refund',$3,'pending') ON CONFLICT (adjustment_key) DO NOTHING RETURNING id", [ride.id, adjustmentKey, amount]);
    if (!inserted.rowCount) return;
    const payment = (await storage.getPaymentsByRide(ride.id)).find((item: any) => item.method === "card" && item.status === "paid" && item.paystackReference);
    if (!payment?.paystackReference) { await pool.query("UPDATE payment_adjustments SET status = 'requires_payment' WHERE adjustment_key = $1", [adjustmentKey]); return; }
    await paystackAPI.post("/refund", { transaction: payment.paystackReference, amount: Math.round(amount * 100) });
    await pool.query("UPDATE payment_adjustments SET status = 'completed', provider_reference = $2, completed_at = now() WHERE adjustment_key = $1", [adjustmentKey, payment.paystackReference]);
  }

  async function recordWalletTx(
    userId: string, type: string, amount: number,
    balanceBefore: number, description: string, reference?: string, rideId?: string
  ) {
    const balanceAfter = type === "ride_charge" || type === "withdrawal"
      ? balanceBefore - amount
      : balanceBefore + amount;
    await storage.createWalletTransaction({
      userId, type, amount, balanceBefore, balanceAfter,
      reference, description, rideId, status: "completed",
    });
    return balanceAfter;
  }

  // GET /api/payments/webview-callback  — Paystack redirects here after payment; sends postMessage back to opener/parent
  app.get("/api/payments/webview-callback", (req: Request, res: Response) => {
    const reference = (req.query.reference || req.query.trxref || "") as string;
    const appBase = getAppBaseUrl(req);
    // Frontend URL for the fallback "Return to App" redirect
    // FRONTEND_URL env var on Railway should be set to the Netlify app URL
    const appReturnUrl = process.env.FRONTEND_URL
      || "https://peaceful-mousse-459c85.netlify.app";
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Payment Complete</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#0a0a0a;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
         display:flex;flex-direction:column;align-items:center;justify-content:center;
         min-height:100vh;gap:16px;text-align:center;padding:32px}
    .ring{width:72px;height:72px;animation:pop .45s cubic-bezier(.34,1.56,.64,1)}
    @keyframes pop{0%{transform:scale(.4);opacity:0}100%{transform:scale(1);opacity:1}}
    h2{font-size:20px;font-weight:700;letter-spacing:-.3px}
    .sub{font-size:14px;color:rgba(255,255,255,0.45);line-height:1.5;max-width:260px}
    .btn{margin-top:8px;padding:13px 28px;background:#fff;color:#000;font-weight:700;
         font-size:14px;border-radius:12px;border:none;cursor:pointer;letter-spacing:-.2px}
  </style>
</head>
<body>
  <svg class="ring" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="36" cy="36" r="34" stroke="rgba(255,255,255,0.12)" stroke-width="2"/>
    <circle cx="36" cy="36" r="34" stroke="#ffffff" stroke-width="2"
      stroke-dasharray="213" stroke-dashoffset="213"
      style="animation:draw .55s .3s ease forwards;transform-origin:center;transform:rotate(-90deg)"/>
    <polyline points="22,36 32,46 50,28" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
      style="opacity:0;animation:fadein .2s .75s forwards"/>
    <style>
      @keyframes draw{to{stroke-dashoffset:0}}
      @keyframes fadein{to{opacity:1}}
    </style>
  </svg>
  <h2>Payment Complete</h2>
  <p class="sub">Your payment was processed. You can close this window — the app will update automatically.</p>
  <button class="btn" id="back-btn" style="display:none" onclick="goBack()">Return to App</button>
  <script>
    var ref = ${JSON.stringify(reference)};
    var appUrl = ${JSON.stringify(appReturnUrl)};
    var msg = { type: 'paystack-done', reference: ref };

    // 1. Send postMessage to any listening parent/opener (web popup flow)
    var sent = false;
    try { if(window.opener){ window.opener.postMessage(msg,'*'); sent=true; } } catch(e){}
    try { if(window.parent && window.parent!==window){ window.parent.postMessage(msg,'*'); sent=true; } } catch(e){}

    // 2. Attempt to close popup/tab
    function tryClose() {
      try { window.close(); } catch(e){}
    }

    // 3. If window didn't close (mobile browser / standalone tab), show button after 1.5s
    var closeTimer = setTimeout(tryClose, 800);
    setTimeout(function() {
      // If we're still here, closing failed — show the back button
      document.getElementById('back-btn').style.display = 'inline-block';
      document.getElementById('status').textContent = sent
        ? 'App notified. Tap the button if the screen did not update.'
        : 'Tap below to return to the app.';
    }, 1600);

    function goBack() {
      // Try postMessage one more time then close / redirect
      try { if(window.opener){ window.opener.postMessage(msg,'*'); } } catch(e){}
      try { window.close(); } catch(e){}
      // Redirect as last resort (works for native in-app browser scenarios)
      setTimeout(function(){ window.location.href = appUrl; }, 300);
    }
  </script>
</body>
</html>`;
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  });

  // POST /api/payments/initialize
  app.post("/api/payments/initialize", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { amount, email: clientEmail, rideId, saveCard, saveCardOnly } = req.body;
      const userId = req.auth!.sub;
      const reference = `A2B-${Date.now()}-${userId.slice(0, 6)}`;

      const user = await storage.getUser(userId);
      const email = (user?.email && user.email.includes("@")) ? user.email : clientEmail;

      if (!email || !email.includes("@")) {
        return res.status(400).json({ message: "A valid email address is required to process payments. Please update your profile email." });
      }

      const domain = getAppBaseUrl(req);
      const callbackUrl = `${domain}/api/payments/webview-callback?reference=${reference}`;

      const response = await paystackAPI.post("/transaction/initialize", {
        email,
        amount: Math.round(amount * 100),
        currency: "ZAR",
        reference,
        ...(callbackUrl ? { callback_url: callbackUrl } : {}),
        metadata: {
          userId,
          rideId: rideId || null,
          saveCard: saveCard || false,
          saveCardOnly: saveCardOnly || false,
          custom_fields: [
            { display_name: "App", variable_name: "app", value: "A2B LIFT" }
          ],
        },
        channels: ["card"],
      });

      const { authorization_url, access_code, reference: ref } = response.data.data;

      if (rideId) {
        await storage.createPayment({
          rideId, payerUserId: userId, amount,
          method: "card", status: "pending",
          currency: "ZAR", paystackReference: reference,
        });
      }

      return res.json({ authorizationUrl: authorization_url, accessCode: access_code, reference: ref });
    } catch (error: any) {
      console.error("[Paystack Initialize]", error.response?.data || error.message);
      return res.status(500).json({ message: "Payment initialization failed" });
    }
  });

  // POST /api/payments/verify
  app.post("/api/payments/verify", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { reference } = req.body;
      const userId = req.auth!.sub;

      const response = await paystackAPI.get(`/transaction/verify/${reference}`);
      const txData = response.data.data;

      if (txData.status !== "success") {
        return res.status(400).json({ message: "Payment not successful", status: txData.status });
      }

      const amount = txData.amount / 100;
      const metadata = txData.metadata || {};

      if (metadata.saveCard && txData.authorization?.reusable) {
        const auth = txData.authorization;
        const existingCards = await storage.getSavedCardsByUser(userId);
        const alreadySaved = existingCards.find((c: any) => c.last4 === auth.last4 && c.expYear === auth.exp_year);
        if (!alreadySaved) {
          await storage.createSavedCard({
            userId,
            paystackAuthCode: auth.authorization_code,
            cardType: auth.card_type,
            last4: auth.last4,
            expMonth: auth.exp_month,
            expYear: auth.exp_year,
            bank: auth.bank,
            isDefault: existingCards.length === 0,
          });
        }
      }

      if (metadata.rideId) {
        const payments = await storage.getPaymentsByRide(metadata.rideId);
        const pending = payments.find((p: any) => p.paystackReference === reference);
        if (pending) {
          await storage.updatePayment(pending.id, {
            status: "paid",
            paidAt: new Date(),
            paystackAuthCode: txData.authorization?.authorization_code,
          });
        }
        await storage.updateRide(metadata.rideId, { paymentStatus: "paid" });
      }

      if (!metadata.rideId && !metadata.saveCardOnly) {
        const user = await storage.getUser(userId);
        const balanceBefore = user?.walletBalance || 0;
        const newBalance = balanceBefore + amount;
        await storage.updateUser(userId, { walletBalance: newBalance });
        await recordWalletTx(userId, "topup", amount, balanceBefore, "Wallet top-up via card", reference);
      }

      return res.json({ success: true, amount, status: "paid" });
    } catch (error: any) {
      console.error("[Paystack Verify]", error.response?.data || error.message);
      const psMsg = error.response?.data?.message;
      if (psMsg) return res.status(400).json({ message: psMsg });
      return res.status(500).json({ message: "Payment verification failed" });
    }
  });

  // POST /api/payments/charge-card
  app.post("/api/payments/charge-card", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { cardId, rideId, amount, email } = req.body;
      const userId = req.auth!.sub;

      const card = await storage.getSavedCard(cardId);
      if (!card || card.userId !== userId) {
        return res.status(404).json({ message: "Card not found" });
      }

      const reference = `A2B-RIDE-${rideId}-${Date.now()}`;
      const response = await paystackAPI.post("/transaction/charge_authorization", {
        authorization_code: card.paystackAuthCode,
        email, amount: Math.round(amount * 100), currency: "ZAR", reference,
        metadata: { userId, rideId },
      });

      const txData = response.data.data;
      if (txData.status === "success") {
        await storage.createPayment({
          rideId, payerUserId: userId, amount,
          method: "card", status: "paid",
          currency: "ZAR", paidAt: new Date(), paystackReference: reference,
        });
        await storage.updateRide(rideId, { paymentStatus: "paid" });
        return res.json({ success: true, reference });
      }

      return res.status(400).json({ message: "Card charge failed", status: txData.status });
    } catch (error: any) {
      console.error("[Paystack Charge Card]", error.response?.data || error.message);
      return res.status(500).json({ message: "Card charge failed" });
    }
  });

  // POST /api/payments/charge-ride  — charges user's default saved card for a ride
  app.post("/api/payments/charge-ride", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { rideId } = req.body;
      const userId = req.auth!.sub;

      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      const ride = await storage.getRide(rideId);
      if (!ride) return res.status(404).json({ message: "Ride not found" });

      const cards = await storage.getSavedCardsByUser(userId);
      const defaultCard = cards.find((c: any) => c.isDefault) || cards[0];
      if (!defaultCard) {
        return res.status(400).json({ message: "No saved card found. Please add a card in your wallet.", needsCard: true });
      }

      const amount = (ride as any).price || (ride as any).totalPrice || (ride as any).estimatedPrice;
      if (!amount) return res.status(400).json({ message: "Ride has no price set" });

      const reference = `A2B-RIDE-${rideId}-${Date.now()}`;
      const response = await paystackAPI.post("/transaction/charge_authorization", {
        authorization_code: defaultCard.paystackAuthCode,
        email: user.username,
        amount: Math.round(Number(amount) * 100),
        currency: "ZAR",
        reference,
        metadata: { userId, rideId },
      });

      const txData = response.data.data;
      if (txData.status === "success") {
        await storage.createPayment({
          rideId, payerUserId: userId, amount: Number(amount),
          method: "card", status: "paid",
          currency: "ZAR", paidAt: new Date(), paystackReference: reference,
          paystackAuthCode: defaultCard.paystackAuthCode,
        });
        await storage.updateRide(rideId, { paymentStatus: "paid" });
        return res.json({ success: true, reference, card: { last4: defaultCard.last4, cardType: defaultCard.cardType } });
      }

      return res.status(400).json({ message: "Card charge failed", status: txData.status });
    } catch (error: any) {
      console.error("[Paystack Charge Ride]", error.response?.data || error.message);
      return res.status(500).json({ message: "Card charge failed" });
    }
  });

  // POST /api/payments/pay-wallet
  app.post("/api/payments/pay-wallet", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { rideId } = req.body;
      let { amount } = req.body;
      const userId = req.auth!.sub;

      if (!amount) {
        const ride = await storage.getRide(rideId);
        if (!ride) return res.status(404).json({ message: "Ride not found" });
        amount = (ride as any).price || (ride as any).totalPrice || (ride as any).estimatedPrice;
        if (!amount) return res.status(400).json({ message: "Ride has no price set" });
      }

      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      if ((user.walletBalance || 0) < amount) {
        return res.status(400).json({ message: "Insufficient wallet balance" });
      }

      const balanceBefore = user.walletBalance || 0;
      const newBalance = balanceBefore - amount;

      await storage.updateUser(userId, { walletBalance: newBalance });
      await storage.createPayment({
        rideId, payerUserId: userId, amount,
        method: "wallet", status: "paid",
        currency: "ZAR", paidAt: new Date(),
      });
      await storage.updateRide(rideId, { paymentStatus: "paid" });
      await recordWalletTx(userId, "ride_charge", amount, balanceBefore, "Ride payment", undefined, rideId);

      return res.json({ success: true, newBalance });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // GET /api/payments/cards
  app.get("/api/payments/cards", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const cards = await storage.getSavedCardsByUser(req.auth!.sub);
      return res.json(cards);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // DELETE /api/payments/cards/:id
  app.delete("/api/payments/cards/:id", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      await storage.deleteSavedCard(req.params.id);
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // PUT /api/payments/cards/:id/default — set a card as the default
  app.put("/api/payments/cards/:id/default", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const userId = req.auth!.sub;
      const cards = await storage.getSavedCardsByUser(userId);
      for (const card of cards) {
        await storage.updateSavedCard(card.id, { isDefault: card.id === req.params.id });
      }
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // GET /api/wallet/transactions
  app.get("/api/wallet/transactions", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const txs = await storage.getWalletTransactions(req.auth!.sub);
      return res.json(txs);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  // POST /api/wallet/withdraw — Paystack transfer to driver's bank account
  app.post("/api/wallet/withdraw", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { amount, bankCode, bankName: bankNameInput, accountNumber, accountName } = req.body;
      const userId = req.auth!.sub;

      if (!amount || !bankCode || !accountNumber || !accountName) {
        return res.status(400).json({ message: "amount, bankCode, accountNumber and accountName are required" });
      }

      const chauffeur = await storage.getChauffeurByUserId(userId);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      if ((chauffeur.earningsTotal || 0) < amount) {
        return res.status(400).json({ message: `You only have R${(chauffeur.earningsTotal || 0).toFixed(2)} available to withdraw. Please enter a lower amount.` });
      }

      const recipientRes = await paystackAPI.post("/transferrecipient", {
        type: "nuban", name: accountName,
        account_number: accountNumber, bank_code: bankCode, currency: "ZAR",
      });
      const recipientCode = recipientRes.data.data.recipient_code;

      const transferRef = `A2B-WITHDRAW-${Date.now()}`;
      const transferRes = await paystackAPI.post("/transfer", {
        source: "balance", amount: Math.round(amount * 100),
        recipient: recipientCode, reason: "A2B LIFT earnings withdrawal",
        reference: transferRef, currency: "ZAR",
      });

      const transferCode = transferRes.data.data.transfer_code;
      const status = transferRes.data.data.status;

      await storage.createWithdrawal({
        chauffeurId: chauffeur.id, amount,
        status: status === "success" ? "completed" : "pending",
        bankName: bankNameInput || bankCode, accountNumber, accountHolder: accountName,
        paystackTransferCode: transferCode, paystackRecipientCode: recipientCode,
      });

      await storage.updateChauffeur(chauffeur.id, {
        earningsTotal: (chauffeur.earningsTotal || 0) - amount,
      });

      return res.json({
        success: true,
        message: status === "success" ? "Transfer successful" : "Transfer initiated — funds arrive within 24hrs",
        transferCode, status,
      });
    } catch (error: any) {
      console.error("[Paystack Withdraw]", error.response?.data || error.message);
      return res.status(500).json({ message: error.response?.data?.message || error.message });
    }
  });

  // GET /api/wallet/banks
  app.get("/api/wallet/banks", async (_req: Request, res: Response) => {
    try {
      const response = await paystackAPI.get("/bank?currency=ZAR&country=south+africa");
      const banks = response.data.data.map((b: any) => ({ name: b.name, code: b.code, id: b.id }));
      return res.json(banks);
    } catch (error: any) {
      return res.json([
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
      ]);
    }
  });

  // POST /api/payments/webhook
  app.post("/api/payments/webhook", async (req: Request, res: Response) => {
    try {
      const hash = crypto
        .createHmac("sha512", PAYSTACK_SECRET)
        .update(JSON.stringify(req.body))
        .digest("hex");

      if (hash !== req.headers["x-paystack-signature"]) {
        return res.status(401).json({ message: "Invalid signature" });
      }

      const { event, data } = req.body;

      if (event === "charge.success") {
        console.log("[Webhook] Payment successful:", data.reference);
      }

      if (event === "transfer.success") {
        await storage.updateWithdrawalByTransferCode(data.transfer_code, {
          status: "completed", processedAt: new Date(),
        });
      }

      if (event === "transfer.failed") {
        await storage.updateWithdrawalByTransferCode(data.transfer_code, { status: "failed" });
      }

      return res.sendStatus(200);
    } catch (error: any) {
      console.error("[Webhook Error]", error.message);
      return res.sendStatus(200);
    }
  });

  // ── Route Selection (driver picks fastest/shortest/less-traffic after accepting) ──
  app.post("/api/rides/:id/select-route", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { selectedRouteId, distanceKm, fare, currency = "ZAR" } = req.body;

      if (distanceKm == null || fare == null || !selectedRouteId) {
        return res.status(400).json({ error: "selectedRouteId, distanceKm and fare are required" });
      }

      const ride = await storage.getRide(id);
      if (!ride) return res.status(404).json({ error: "Ride not found" });

      // Only the assigned chauffeur or admin may select the route
      const authedReq = req as AuthedRequest;
      const chauffeur = authedReq.auth?.role !== "admin"
        ? await storage.getChauffeur(ride.chauffeurId ?? "")
        : null;
      if (chauffeur && chauffeur.userId !== authedReq.auth!.sub) {
        return res.status(403).json({ error: "Forbidden" });
      }

      await storage.updateRide(id, {
        selectedRouteId,
        selectedRouteDistanceKm: distanceKm,
        actualFare: fare,
        routeCurrency: currency,
        routeSelectedAt: new Date(),
      } as any);

      // Notify ride room so client sees the locked fare
      io.to(`ride:${id}`).emit("route_confirmed", {
        rideId: id,
        selectedRouteId,
        distanceKm,
        fare,
        currency,
        confirmedAt: new Date().toISOString(),
      });

      return res.json({ success: true, rideId: id, lockedFare: fare });
    } catch (err: any) {
      console.error("[select-route]", err.message);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── Upload liveness / cash-selfie photo (base64 → Supabase Storage) ──
  app.post("/api/rides/:id/upload-photo", requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { photoBase64, photoType, sessionId, mimeType } = req.body;
      if (!photoBase64 || !photoType) {
        return res.status(400).json({ error: "photoBase64 and photoType are required" });
      }
      if (!SUPABASE_SERVICE_KEY_CONFIGURED) {
        return res.status(503).json({ error: "Photo storage not configured (SUPABASE_SERVICE_ROLE_KEY missing)" });
      }
      const result = await uploadLivenessPhoto({
        sessionId: sessionId || id,
        userId: (req as AuthedRequest).auth!.sub,
        rideId: id,
        photoBase64,
        mimeType: mimeType || "image/jpeg",
        photoType,
      });
      if (!result.success) {
        return res.status(500).json({ error: result.error || "Upload failed" });
      }
      return res.json({ success: true, storagePath: result.storagePath, publicUrl: result.publicUrl });
    } catch (err: any) {
      console.error("[upload-photo]", err.message);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── Admin: get signed photo URLs for a ride ────────────────────────────────
  app.get("/api/admin/rides/:id/photos", requireAuth, requireRole(["admin"]), async (req: AuthedRequest, res: Response) => {
    try {
      const ride = await storage.getRide(req.params.id);
      if (!ride) return res.status(404).json({ error: "Ride not found" });

      const livSessions = await db
        .select()
        .from(livenessSessions)
        .where(eq(livenessSessions.rideId, req.params.id))
        .orderBy(desc(livenessSessions.createdAt));

      const SUPABASE_URL = process.env.SUPABASE_URL || "https://zzwkieiktbhptvgsqerd.supabase.co";
      const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

      async function makeSignedUrl(bucket: "ride-photos" | "liveness-photos", path: string | null | undefined): Promise<string | null> {
        if (!path || !SERVICE_KEY) return null;
        // Strip full URL to bare path if needed
        const bare = path.replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/(?:public|sign)\/[^/]+\//, "");
        return getAdminSignedUrl(bucket, bare);
      }

      const cashSelfieSignedUrl = await makeSignedUrl("ride-photos", ride.cashSelfieUrl);

      const livPhotos = await Promise.all(
        livSessions.map(async (sess) => ({
          id: sess.id,
          status: sess.status,
          score: sess.score,
          provider: sess.provider,
          verifiedAt: sess.verifiedAt,
          signedUrl: await makeSignedUrl("liveness-photos", sess.verifiedPhotoUrl ?? sess.selfieUrl),
        }))
      );

      return res.json({
        rideId: req.params.id,
        cashSelfie: {
          storagePath: ride.cashSelfieUrl,
          signedUrl: cashSelfieSignedUrl,
        },
        livenessPhotos: livPhotos,
      });
    } catch (err: any) {
      console.error("[admin/rides/photos]", err.message);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── Admin hard-delete routes ─────────────────────────────────────────────────

  app.delete("/api/admin/rides/:id", requireAuth, requireRole(["admin"]), async (req: AuthedRequest, res: Response) => {
    try {
      const deleted = await storage.deleteRide(req.params.id);
      if (!deleted) return res.status(404).json({ message: "Ride not found" });
      return res.json({ message: "Ride deleted" });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/admin/users/:id", requireAuth, requireRole(["admin"]), async (req: AuthedRequest, res: Response) => {
    try {
      // Cascade: remove chauffeur profile + driver application first to avoid FK violations
      const chauffeur = await storage.getChauffeurByUserId(req.params.id);
      if (chauffeur) {
        const app = await storage.getDriverApplicationByUserId(req.params.id);
        if (app) await storage.deleteDriverApplication(app.id);
        await storage.deleteChauffeur(chauffeur.id);
      }
      const deleted = await storage.deleteUser(req.params.id);
      if (!deleted) return res.status(404).json({ message: "User not found" });
      return res.json({ message: "User deleted" });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/admin/users/:id/password", requireAuth, requireRole(["admin"]), async (req: AuthedRequest, res: Response) => {
    try {
      const validation = validateAdminPassword(req.body?.password);
      if (!validation.ok) return res.status(400).json({ message: validation.message });

      const user = await storage.getUser(req.params.id);
      if (!user) return res.status(404).json({ message: "User not found" });

      const password = await bcrypt.hash(String(req.body.password), 10);
      await storage.updateUser(user.id, { password } as any);
      return res.json({ ok: true, message: "Password updated." });
    } catch (error: any) {
      return res.status(500).json({ message: error.message || "Unable to update password." });
    }
  });

  app.delete("/api/admin/withdrawals/:id", requireAuth, requireRole(["admin"]), async (req: AuthedRequest, res: Response) => {
    try {
      const deleted = await storage.deleteWithdrawal(req.params.id);
      if (!deleted) return res.status(404).json({ message: "Withdrawal not found" });
      return res.json({ message: "Withdrawal deleted" });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/admin/safety-reports/:id", requireAuth, requireRole(["admin"]), async (req: AuthedRequest, res: Response) => {
    try {
      const deleted = await storage.deleteSafetyReport(req.params.id);
      if (!deleted) return res.status(404).json({ message: "Safety report not found" });
      return res.json({ message: "Safety report deleted" });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/admin/payments/:id", requireAuth, requireRole(["admin"]), async (req: AuthedRequest, res: Response) => {
    try {
      const deleted = await storage.deletePayment(req.params.id);
      if (!deleted) return res.status(404).json({ message: "Payment not found" });
      return res.json({ message: "Payment deleted" });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/admin/documents/:id", requireAuth, requireRole(["admin"]), async (req: AuthedRequest, res: Response) => {
    try {
      const deleted = await storage.deleteDocument(req.params.id);
      if (!deleted) return res.status(404).json({ message: "Document not found" });
      return res.json({ message: "Document deleted" });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  return httpServer;
}
