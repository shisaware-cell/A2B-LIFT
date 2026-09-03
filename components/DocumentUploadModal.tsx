import React from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { pickImageOrDocument, PickedMedia } from "@/lib/image-picker-helper";
import Colors from "@/constants/colors";

export interface DocumentUploadModalProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  isSelfie?: boolean;
  currentFile?: { uri?: string; name?: string; uploadedUrl?: string } | null;
  onSelect: (media: PickedMedia) => void | Promise<void>;
  onClose: () => void;
}

export default function DocumentUploadModal({
  visible,
  title,
  subtitle,
  isSelfie = false,
  currentFile,
  onSelect,
  onClose,
}: DocumentUploadModalProps) {
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  async function handlePick(camera: boolean) {
    const result = await pickImageOrDocument({
      camera,
      isSelfie,
      fallbackName: isSelfie ? "driver_photo.jpg" : `${title.toLowerCase().replace(/\s+/g, "_")}.jpg`,
    });
    if (result) {
      await onSelect(result);
      onClose();
    }
  }

  const isImage =
    Boolean(currentFile?.uri) &&
    !currentFile?.name?.toLowerCase().endsWith(".pdf") &&
    !currentFile?.uri?.toLowerCase().endsWith(".pdf");

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 24) },
            Platform.OS === "web" && styles.webSheet,
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header indicator */}
          <View style={styles.dragHandle} />

          {/* Title row */}
          <View style={styles.headerRow}>
            <View style={styles.titleWrap}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>
                {subtitle || (isSelfie ? "Take a clear selfie or upload your profile picture" : "Take a photo of your document or upload a file (JPG, PNG, PDF)")}
              </Text>
            </View>
            <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={20} color={Colors.textMuted} />
            </Pressable>
          </View>

          {/* Current file preview if exists */}
          {Boolean(currentFile?.uri) && (
            <View style={styles.previewCard}>
              {isImage ? (
                <Image source={{ uri: currentFile?.uri }} style={styles.previewImage} />
              ) : (
                <View style={styles.previewDocIcon}>
                  <Ionicons name="document-text" size={28} color="#10B981" />
                </View>
              )}
              <View style={styles.previewMeta}>
                <View style={styles.previewBadge}>
                  <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                  <Text style={styles.previewBadgeText}>Attached</Text>
                </View>
                <Text style={styles.previewFileName} numberOfLines={1}>
                  {currentFile?.name || "Uploaded Document"}
                </Text>
              </View>
            </View>
          )}

          {/* Upload Action Options */}
          <View style={styles.optionsList}>
            <Pressable
              style={({ pressed }) => [styles.optionBtn, styles.cameraBtn, pressed && styles.btnPressed]}
              onPress={() => handlePick(true)}
              accessibilityLabel="Take Photo with Camera"
            >
              <View style={[styles.iconCircle, styles.cameraIconCircle]}>
                <Ionicons name="camera" size={22} color="#FFFFFF" />
              </View>
              <View style={styles.optionTexts}>
                <Text style={styles.optionTitle}>Take Photo (Camera)</Text>
                <Text style={styles.optionDesc}>
                  {isSelfie ? "Open front camera to take a clear profile selfie" : "Snap a photo of the document with your device camera"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.optionBtn, pressed && styles.btnPressed]}
              onPress={() => handlePick(false)}
              accessibilityLabel="Choose from Gallery or Files"
            >
              <View style={[styles.iconCircle, styles.galleryIconCircle]}>
                <Ionicons name="images" size={22} color="#FFFFFF" />
              </View>
              <View style={styles.optionTexts}>
                <Text style={styles.optionTitle}>Choose from Gallery / Files</Text>
                <Text style={styles.optionDesc}>
                  Browse photos or select document files from your device
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </Pressable>
          </View>

          {/* Cancel */}
          <Pressable style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  sheet: {
    width: "100%",
    backgroundColor: "#161616",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  webSheet: {
    maxWidth: 520,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    marginBottom: "auto",
    marginTop: "auto",
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    alignSelf: "center",
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  titleWrap: {
    flex: 1,
    paddingRight: 12,
  },
  title: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255, 255, 255, 0.6)",
    lineHeight: 17,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  previewCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
    padding: 10,
    gap: 12,
    marginBottom: 16,
  },
  previewImage: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: "#222",
  },
  previewDocIcon: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  previewMeta: {
    flex: 1,
  },
  previewBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 2,
  },
  previewBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: "#10B981",
  },
  previewFileName: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "#FFFFFF",
  },
  optionsList: {
    gap: 10,
    marginBottom: 16,
  },
  optionBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    padding: 14,
    gap: 14,
  },
  cameraBtn: {
    backgroundColor: "rgba(22, 163, 74, 0.1)",
    borderColor: "rgba(34, 197, 94, 0.25)",
  },
  btnPressed: {
    opacity: 0.8,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cameraIconCircle: {
    backgroundColor: "#16A34A",
  },
  galleryIconCircle: {
    backgroundColor: "#3B82F6",
  },
  optionTexts: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
    marginBottom: 2,
  },
  optionDesc: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "rgba(255, 255, 255, 0.6)",
    lineHeight: 15,
  },
  cancelBtn: {
    width: "100%",
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "rgba(255, 255, 255, 0.8)",
  },
});
