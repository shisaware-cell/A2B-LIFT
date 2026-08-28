/**
 * livenessPhotoService.ts
 *
 * Handles uploading liveness selfie frames and cash payment selfies to
 * Supabase Storage, then updates the relevant DB record.
 *
 * Uses direct fetch (same pattern as /api/upload-document) — no SDK needed.
 */

import { db } from "./db";
import { livenessSessions, rides } from "../shared/schema";
import { eq } from "drizzle-orm";
import { storeMediaObject } from "./media-object-store";

export type PhotoType = "liveness" | "cash_selfie";

interface UploadPhotoParams {
  sessionId: string;        // liveness_sessions.id  OR  ride id for cash selfies
  userId: string;
  rideId?: string;
  photoBase64: string;      // base64 data URI or raw base64 string
  mimeType?: "image/jpeg" | "image/png" | "image/webp";
  photoType: PhotoType;
}

interface UploadResult {
  success: boolean;
  storagePath?: string;
  publicUrl?: string;
  error?: string;
}

const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://zzwkieiktbhptvgsqerd.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

/**
 * Upload a photo to the appropriate bucket / media store and update the DB record.
 */
export async function uploadLivenessPhoto(
  params: UploadPhotoParams
): Promise<UploadResult> {
  const {
    sessionId,
    userId,
    rideId,
    photoBase64,
    mimeType = "image/jpeg",
    photoType,
  } = params;

  // Strip data URI prefix if present
  const base64Data = photoBase64.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64Data, "base64");

  const bucket =
    photoType === "cash_selfie" ? "ride-photos" : "liveness-photos";
  const ext = mimeType.split("/")[1];
  const timestamp = Date.now();
  const safeSession = sessionId.replace(/[^a-zA-Z0-9_-]/g, "");
  const safeUser = userId.replace(/[^a-zA-Z0-9_-]/g, "");

  const storagePath =
    photoType === "cash_selfie"
      ? `rides/${rideId ?? safeSession}/${safeUser}_cash_selfie_${timestamp}.${ext}`
      : `sessions/${safeSession}/${safeUser}_liveness_${timestamp}.${ext}`;

  let publicUrl = "";

  // ── 1. Attempt upload to Supabase Storage ──────────────────────────────────
  try {
    const uploadRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${bucket}/${storagePath}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          apikey: SUPABASE_SERVICE_KEY,
          "Content-Type": mimeType,
          "x-upsert": "false",
        },
        body: buffer,
      }
    );

    if (uploadRes.ok) {
      publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${storagePath}`;
    } else {
      const errText = await uploadRes.text().catch(() => uploadRes.statusText);
      console.warn("[livenessPhotoService] Supabase upload failed, falling back to local media store:", errText);
    }
  } catch (e: any) {
    console.warn("[livenessPhotoService] Supabase upload error, falling back to local media store:", e.message);
  }

  // ── 2. Fallback to PostgreSQL Media Object Store ───────────────────────────
  let finalStorageRef = storagePath;
  if (!publicUrl) {
    try {
      const mediaId = await storeMediaObject({
        ownerUserId: safeUser,
        purpose: photoType,
        mimeType,
        data: buffer,
      });
      publicUrl = `https://a2blift.com/api/media/${mediaId}`;
      finalStorageRef = publicUrl;
    } catch (fallbackErr: any) {
      console.error("[livenessPhotoService] Media store fallback error:", fallbackErr.message);
      return { success: false, error: fallbackErr.message };
    }
  }

  // ── 3. Update DB record ───────────────────────────────────────────────────
  try {
    if (photoType === "liveness") {
      await db
        .update(livenessSessions)
        .set({
          verifiedPhotoUrl: finalStorageRef,
          rideId: rideId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(livenessSessions.id, sessionId));
    } else {
      await db
        .update(rides)
        .set({ cashSelfieUrl: finalStorageRef })
        .where(eq(rides.id, rideId ?? sessionId));
    }
  } catch (dbErr: any) {
    console.warn("[livenessPhotoService] DB update error:", dbErr.message);
  }

  return { success: true, storagePath: finalStorageRef, publicUrl };
}

/**
 * Generate a signed URL for admin viewing (1 hour expiry).
 * Uses direct Supabase REST API (no SDK required).
 */
export async function getAdminSignedUrl(
  bucket: "liveness-photos" | "ride-photos",
  storagePath: string,
  expiresInSeconds = 3600
): Promise<string | null> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/storage/v1/object/sign/${bucket}/${storagePath}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          apikey: SUPABASE_SERVICE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expiresIn: expiresInSeconds }),
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    return data.signedURL
      ? `${SUPABASE_URL}/storage/v1${data.signedURL}`
      : null;
  } catch {
    return null;
  }
}
