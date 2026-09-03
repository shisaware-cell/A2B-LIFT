import { Platform, Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";

function safeAlert(title: string, message: string) {
  try {
    if (typeof Alert !== "undefined" && Alert && typeof Alert.alert === "function") {
      Alert.alert(title, message);
    } else {
      console.warn(`[ImagePicker] ${title}: ${message}`);
    }
  } catch {}
}

export type PickedMedia = {
  uri: string;
  name: string;
  base64?: string;
  mimeType?: string;
  size?: number;
};

export type PickOptions = {
  camera?: boolean;
  isSelfie?: boolean;
  quality?: number;
  allowsEditing?: boolean;
  aspect?: [number, number];
  acceptPdf?: boolean;
  fallbackName?: string;
};

/**
 * Compresses an image File using an offscreen HTML5 canvas on Web.
 * Returns a data URL (for instant local preview) and raw base64 string.
 */
async function compressImageOnWeb(
  file: File,
  maxDimension = 1400,
  quality = 0.82
): Promise<{ uri: string; base64: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read selected image file."));
    reader.onload = () => {
      const srcUrl = reader.result as string;
      const img = new Image();
      img.onerror = () => {
        // If canvas image decoding fails, fallback to raw base64 from FileReader
        const comma = srcUrl.indexOf(",");
        resolve({ uri: srcUrl, base64: comma >= 0 ? srcUrl.slice(comma + 1) : srcUrl });
      };
      img.onload = () => {
        let width = img.width || 1200;
        let height = img.height || 1200;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          const comma = srcUrl.indexOf(",");
          resolve({ uri: srcUrl, base64: comma >= 0 ? srcUrl.slice(comma + 1) : srcUrl });
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        const comma = dataUrl.indexOf(",");
        const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
        resolve({ uri: dataUrl, base64 });
      };
      img.src = srcUrl;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Universal photo and document picker that works identically on the website and native apps.
 */
export async function pickImageOrDocument(options: PickOptions = {}): Promise<PickedMedia | null> {
  const {
    camera = false,
    isSelfie = false,
    quality = 0.8,
    allowsEditing = false,
    aspect = isSelfie ? [1, 1] : undefined,
    acceptPdf = true,
    fallbackName = isSelfie ? "driver_photo.jpg" : "document.jpg",
  } = options;

  // ── Web Implementation ──────────────────────────────────────────────────
  if (Platform.OS === "web") {
    return new Promise((resolve) => {
      if (typeof document === "undefined") {
        resolve(null);
        return;
      }

      const input = document.createElement("input");
      input.type = "file";
      input.style.display = "none";
      input.accept = acceptPdf ? "image/*,application/pdf" : "image/*";

      if (camera) {
        input.setAttribute("capture", isSelfie ? "user" : "environment");
      }

      let settled = false;
      const cleanup = () => {
        if (!settled) {
          settled = true;
          try {
            document.body.removeChild(input);
          } catch {}
        }
      };

      input.onchange = async () => {
        try {
          const file = input.files?.[0];
          if (!file) {
            cleanup();
            resolve(null);
            return;
          }

          const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
          if (isPdf) {
            const reader = new FileReader();
            reader.onload = () => {
              const dataUrl = reader.result as string;
              const comma = dataUrl.indexOf(",");
              cleanup();
              resolve({
                uri: dataUrl,
                name: file.name || fallbackName,
                base64: comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl,
                mimeType: "application/pdf",
                size: file.size,
              });
            };
            reader.onerror = () => {
              cleanup();
              resolve(null);
            };
            reader.readAsDataURL(file);
            return;
          }

          // Image: compress on client canvas
          const { uri, base64 } = await compressImageOnWeb(file, isSelfie ? 900 : 1400, quality);
          cleanup();
          resolve({
            uri,
            name: file.name || fallbackName,
            base64,
            mimeType: "image/jpeg",
            size: file.size,
          });
        } catch (e) {
          cleanup();
          resolve(null);
        }
      };

      input.oncancel = () => {
        cleanup();
        resolve(null);
      };

      document.body.appendChild(input);
      input.click();
    });
  }

  // ── Native Mobile Implementation ────────────────────────────────────────
  try {
    if (camera) {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (permission.status !== "granted") {
        safeAlert("Permission Needed", "Please allow camera access to take photos.");
        return null;
      }

      const result = await ImagePicker.launchCameraAsync({
        quality,
        cameraType: isSelfie ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
        allowsEditing: isSelfie ? true : allowsEditing,
        aspect: isSelfie ? [1, 1] : aspect,
        base64: true,
      });

      if (result.canceled || !result.assets?.[0]) return null;
      const asset = result.assets[0];
      return {
        uri: asset.uri,
        name: asset.fileName || fallbackName,
        base64: asset.base64 || undefined,
        mimeType: asset.mimeType || "image/jpeg",
        size: asset.fileSize,
      };
    } else {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== "granted") {
        safeAlert("Permission Needed", "Please allow photo library access.");
        return null;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality,
        allowsEditing: isSelfie ? true : allowsEditing,
        aspect: isSelfie ? [1, 1] : aspect,
        base64: true,
      });

      if (result.canceled || !result.assets?.[0]) return null;
      const asset = result.assets[0];
      return {
        uri: asset.uri,
        name: asset.fileName || fallbackName,
        base64: asset.base64 || undefined,
        mimeType: asset.mimeType || "image/jpeg",
        size: asset.fileSize,
      };
    }
  } catch (err: any) {
    safeAlert("Upload Error", err?.message || "Could not open camera or image picker.");
    return null;
  }
}
