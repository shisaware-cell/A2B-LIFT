import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { apiRequest, getApiUrl } from "./query-client";

const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL || "https://zzwkieiktbhptvgsqerd.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6d2tpZWlrdGJocHR2Z3NxZXJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4ODA1NjEsImV4cCI6MjA4NjQ1NjU2MX0.BgTFknM60JsTl1iHAN1ri3pxFi2rTJfbyZ6rj6Etecc";
const BUCKET = "driver-documents";
const UPLOAD_TIMEOUT_MS = 60_000;
const DEFAULT_DOCUMENT_MIME = "application/octet-stream";

type UploadDocumentOptions = {
  fileName?: string | null;
  mimeType?: string | null;
};

/**
 * Upload a driver document to Supabase Storage.
 *
 * Strategy:
 *   1. Fetch the local file/blob URI to get raw bytes (works on both mobile & web).
 *   2. Upload directly to Supabase Storage via its REST API using the public anon key.
 *      This works regardless of which backend is deployed (Railway / Replit).
 *   3. If the direct upload fails for any reason, fall back to the server proxy
 *      at /api/upload-document (useful when running locally or if Supabase policies change).
 *
 * Returns the public URL of the uploaded file.
 */
export async function uploadDocument(
  localUri: string,
  userId: string,
  docType: string,
  options: UploadDocumentOptions = {}
): Promise<string> {
  if (docType === "profile_selfie") {
    return uploadProfileSelfie(localUri, userId);
  }

  // ── 1. Optimize image if applicable & extract base64 directly ─────────
  let uploadUri = localUri;
  let base64Data = "";
  const isProbableImage = !options.mimeType || options.mimeType.startsWith("image/");
  if (isProbableImage && !localUri.endsWith(".pdf")) {
    try {
      const optimized = await manipulateAsync(
        localUri,
        [{ resize: { width: 1400 } }],
        { compress: 0.8, format: SaveFormat.JPEG, base64: true },
      );
      uploadUri = optimized.uri;
      if (optimized.base64) {
        base64Data = optimized.base64;
      }
    } catch {
      // Use original URI if optimization fails (e.g. on web or pdf)
    }
  }

  // ── 2. Read bytes as blob & base64 if not extracted yet ─────────────────
  let mimeType = options.mimeType || "image/jpeg";
  if (!base64Data) {
    const blob = await readUriAsBlob(uploadUri);
    mimeType = normalizeMimeType(options.mimeType, blob.type);
    base64Data = await blobToBase64(blob);
  }
  const extension = inferFileExtension(mimeType, options.fileName, localUri);

  // ── 3. Upload directly via backend media proxy ──────────────────────────
  const apiUrl = getApiUrl().replace(/\/$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  try {
    const res = await fetch(`${apiUrl}/api/upload-document`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base64Data, userId, docType, mimeType, fileExtension: extension }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Upload failed: ${err}`);
    }
    const data = await res.json();
    const finalUrl = String(data?.url || "");
    return finalUrl.startsWith("/") ? `${apiUrl}${finalUrl}` : finalUrl;
  } finally {
    clearTimeout(timer);
  }
}

async function uploadProfileSelfie(localUri: string, userId: string): Promise<string> {
  let optimizedUri = localUri;
  let base64Data = "";
  try {
    const optimized = await manipulateAsync(
      localUri,
      [{ resize: { width: 720 } }],
      { compress: 0.72, format: SaveFormat.JPEG, base64: true },
    );
    optimizedUri = optimized.uri;
    if (optimized.base64) {
      base64Data = optimized.base64;
    }
  } catch (error: any) {
    console.warn("[selfie-upload] Image optimization failed; using captured image:", error?.message);
  }

  if (!base64Data) {
    const blob = await readUriAsBlob(optimizedUri);
    base64Data = await blobToBase64(blob);
  }
  const response = await apiRequest("POST", `/api/users/${encodeURIComponent(userId)}/selfie-upload`, {
    base64Data,
    mimeType: "image/jpeg",
  });
  const result = await response.json();
  if (!result?.url) throw new Error("Selfie upload did not return an image URL.");
  return result.url;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalizeMimeType(candidate?: string | null, blobType?: string | null): string {
  const value = candidate || blobType;
  if (typeof value === "string" && value.includes("/")) {
    return value;
  }
  return DEFAULT_DOCUMENT_MIME;
}

function inferFileExtension(mimeType: string, fileName?: string | null, localUri?: string): string {
  const namedExtension = extractExtension(fileName) || extractExtension(localUri);
  if (namedExtension) return namedExtension;

  const mimeExtensions: Record<string, string> = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "text/plain": "txt",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  };

  return mimeExtensions[mimeType] || "bin";
}

function extractExtension(value?: string | null): string | null {
  if (!value) return null;
  const cleanValue = safeDecodeURIComponent(value.split("?")[0] || "").trim();
  const match = cleanValue.match(/\.([a-zA-Z0-9]{1,10})$/);
  return match ? match[1].toLowerCase() : null;
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_") || "document";
}

async function readUriAsBlob(uri: string): Promise<Blob> {
  if (uri.startsWith("data:")) {
    // data: URI — decode inline
    const [header, base64] = uri.split(",", 2);
    const mimeMatch = header.match(/data:([^;]+)/);
    const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  // file: or blob: URI — fetch it
  const response = await fetch(uri);
  if (!response.ok) throw new Error(`Cannot read file: ${uri}`);
  return response.blob();
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
