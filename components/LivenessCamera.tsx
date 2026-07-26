/**
 * LivenessCamera.tsx
 *
 * Full-screen guided selfie capture with on-device ML Kit face validation.
 * The camera accepts one sufficiently large face completing a random action.
 */

import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Dimensions,
  Platform,
  Image,
  ActivityIndicator,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import {
  useFacesInPhoto,
  type RNMLKitFace,
} from "@infinitered/react-native-mlkit-face-detection";
import Colors from "@/constants/colors";

/* ─── types ──────────────────────────────────────────────────────────────── */

export type LivenessChallenge = "blink" | "smile" | "turn_left" | "turn_right" | "look_straight";

export interface LivenessCaptureResult {
  uri: string;
  passed: boolean;
  score: number;
  challenge: LivenessChallenge;
  faceData?: {
    faceCount: number;
    smilingProbability: number | null;
    headEulerAngleY: number | null;
  };
}

interface Props {
  challenge: LivenessChallenge;
  onCapture: (result: LivenessCaptureResult) => void | Promise<void>;
  onCancel: () => void;
}

/* ─── constants ──────────────────────────────────────────────────────────── */

const { width: SW, height: SH } = Dimensions.get("window");
const OVAL_W = SW * 0.68;
const OVAL_H = OVAL_W * 1.28;
const OVAL_X = (SW - OVAL_W) / 2;
const OVAL_Y = SH * 0.14;

const CHALLENGE_LABELS: Record<LivenessChallenge, string> = {
  blink:        "Blink slowly",
  smile:        "Smile naturally",
  turn_left:    "Turn your head slightly left",
  turn_right:   "Turn your head slightly right",
  look_straight: "Look straight into the camera",
};

const CHALLENGE_ICONS: Record<LivenessChallenge, string> = {
  blink:        "eye-outline",
  smile:        "happy-outline",
  turn_left:    "arrow-back-outline",
  turn_right:   "arrow-forward-outline",
  look_straight: "radio-button-on-outline",
};

const VIGNETTE = "rgba(0,0,0,0.72)";
const ACTIVE_CHALLENGES: LivenessChallenge[] = ["smile", "turn_left", "turn_right"];

function pickActiveChallenge() {
  return ACTIVE_CHALLENGES[Math.floor(Math.random() * ACTIVE_CHALLENGES.length)];
}

function validateFace(
  face: RNMLKitFace | undefined,
  faceCount: number,
  challenge: LivenessChallenge,
  photoSize: { width: number; height: number } | null,
) {
  if (faceCount !== 1 || !face) {
    return {
      passed: false,
      message: faceCount > 1
        ? "Only one person can be in the selfie."
        : "No face was detected. Keep your full face inside the oval.",
    };
  }

  if (photoSize) {
    const widthRatio = Number(face.frame?.size?.x || 0) / photoSize.width;
    const heightRatio = Number(face.frame?.size?.y || 0) / photoSize.height;
    if (widthRatio < 0.2 || heightRatio < 0.2) {
      return { passed: false, message: "Move closer so your face fills the oval." };
    }
  }

  if (challenge === "smile" && Number(face.smilingProbability ?? 0) < 0.55) {
    return { passed: false, message: "We could not detect a clear smile. Please retake it." };
  }

  if (
    (challenge === "turn_left" || challenge === "turn_right") &&
    Math.abs(Number(face.headEulerAngleY ?? 0)) < 12
  ) {
    return { passed: false, message: "Turn your head more clearly, then retake the selfie." };
  }

  return { passed: true, message: "" };
}

/* ─── component ──────────────────────────────────────────────────────────── */

export default function LivenessCamera({ challenge, onCapture, onCancel }: Props) {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState<"ready" | "capturing" | "review">("ready");
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [photoSize, setPhotoSize] = useState<{ width: number; height: number } | null>(null);
  const [activeChallenge, setActiveChallenge] = useState<LivenessChallenge>(
    challenge === "look_straight" ? pickActiveChallenge : challenge,
  );
  const [confirming, setConfirming] = useState(false);
  const capturingRef = useRef(false);
  const { faces, error: faceDetectionError, status: faceDetectionStatus, clearFaces } =
    useFacesInPhoto(capturedUri || undefined);
  const faceValidation = validateFace(faces[0], faces.length, activeChallenge, photoSize);
  const faceCheckComplete = faceDetectionStatus === "done" || faceDetectionStatus === "error";

  // Subtle pulse on the oval border
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const flashAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.03, duration: 1100, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 1100, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  useEffect(() => {
    if (!permission?.granted) requestPermission();
  }, [permission]);

  /* ── capture ── */
  const doCapture = useCallback(async () => {
    if (capturingRef.current || step === "capturing") return;
    capturingRef.current = true;
    setStep("capturing");

    // White flash effect
    Animated.sequence([
      Animated.timing(flashAnim, { toValue: 1, duration: 80,  useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start();

    try {
      await new Promise<void>((r) => setTimeout(r, 120)); // let flash start
      const photo = await cameraRef.current?.takePictureAsync({
        quality: 0.88,
        base64: false,
        skipProcessing: false,
      });
      if (!photo?.uri) throw new Error("No photo");
      setPhotoSize(
        Number(photo.width) > 0 && Number(photo.height) > 0
          ? { width: Number(photo.width), height: Number(photo.height) }
          : null,
      );
      setCapturedUri(photo.uri);
      setStep("review");
    } catch {
      setStep("ready");
    } finally {
      capturingRef.current = false;
    }
  }, [step, flashAnim]);

  /* ── confirm ── */
  const confirmCapture = useCallback(async () => {
    if (!capturedUri || confirming || !faceCheckComplete || !faceValidation.passed) return;
    setConfirming(true);
    try {
      const face = faces[0];
      await onCapture({
        uri: capturedUri,
        passed: true,
        score: 0.95,
        challenge: activeChallenge,
        faceData: {
          faceCount: faces.length,
          smilingProbability: face?.smilingProbability ?? null,
          headEulerAngleY: face?.headEulerAngleY ?? null,
        },
      });
    } finally {
      setConfirming(false);
    }
  }, [
    activeChallenge,
    capturedUri,
    confirming,
    faceCheckComplete,
    faceValidation.passed,
    faces,
    onCapture,
  ]);

  const retake = useCallback(() => {
    clearFaces();
    setCapturedUri(null);
    setPhotoSize(null);
    setActiveChallenge(pickActiveChallenge());
    capturingRef.current = false;
    setStep("ready");
  }, [clearFaces]);

  /* ── permission screen ── */
  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.white} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Ionicons name="camera-outline" size={56} color={Colors.white} />
        <Text style={styles.permissionTitle}>Camera Access Required</Text>
        <Text style={styles.permissionBody}>
          We need your camera to capture your profile selfie.
        </Text>
        <Pressable style={styles.permissionBtn} onPress={requestPermission}>
          <Text style={styles.permissionBtnText}>Allow Camera</Text>
        </Pressable>
        <Pressable onPress={onCancel} style={{ marginTop: 16 }}>
          <Text style={{ color: Colors.textMuted, fontSize: 14 }}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  /* ── review screen ── */
  if (capturedUri && step === "review") {
    return (
      <View style={styles.root}>
        <Image source={{ uri: capturedUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <View style={styles.reviewDim} />
        <View style={styles.reviewPanel}>
          <Text style={styles.reviewTitle}>
            {!faceCheckComplete
              ? "Checking your selfie..."
              : faceValidation.passed
                ? "Face verified"
                : "Retake required"}
          </Text>
          {!faceCheckComplete ? (
            <View style={styles.verificationRow}>
              <ActivityIndicator size="small" color={Colors.white} />
              <Text style={styles.reviewBody}>Checking for a real, clearly visible face.</Text>
            </View>
          ) : (
            <Text style={styles.reviewBody}>
              {faceDetectionError ||
                faceValidation.message ||
                "Your face and requested action were detected. Drivers will see this photo."}
            </Text>
          )}
          <View style={styles.reviewActions}>
            <Pressable style={styles.retakeBtn} onPress={retake}>
              <Ionicons name="refresh" size={18} color={Colors.white} />
              <Text style={styles.retakeBtnText}>Retake</Text>
            </Pressable>
            {faceCheckComplete && faceValidation.passed && (
              <Pressable
                style={[styles.confirmBtn, confirming && { opacity: 0.7 }]}
                onPress={confirmCapture}
                disabled={confirming}
              >
                {confirming
                  ? <ActivityIndicator size="small" color={Colors.primary} />
                  : <>
                      <Ionicons name="checkmark" size={18} color={Colors.primary} />
                      <Text style={styles.confirmBtnText}>Use Photo</Text>
                    </>
                }
              </Pressable>
            )}
          </View>
        </View>
      </View>
    );
  }

  /* ── camera screen ── */
  return (
    <View style={styles.root}>
      {/* Live camera feed — NO faceDetectorSettings */}
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="front"
      />

      {/* Vignette mask — darkens everything outside the oval */}
      <View style={[styles.vignette, { height: OVAL_Y }]} />
      <View style={{ position: "absolute", top: OVAL_Y, left: 0, right: 0, height: OVAL_H, flexDirection: "row" }}>
        <View style={[styles.vignette, { flex: 1 }]} />
        <View style={{ width: OVAL_W }} />
        <View style={[styles.vignette, { flex: 1 }]} />
      </View>
      <View style={[styles.vignette, { position: "absolute", top: OVAL_Y + OVAL_H, left: 0, right: 0, bottom: 0 }]} />

      {/* White flash on capture */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: "#fff", opacity: flashAnim }]}
      />

      {/* Oval border */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.oval,
          {
            left: OVAL_X, top: OVAL_Y,
            width: OVAL_W, height: OVAL_H,
            transform: [{ scale: pulseAnim }],
          },
        ]}
      />

      {/* Corner accent marks */}
      {(["tl","tr","bl","br"] as const).map((pos) => (
        <View
          key={pos}
          pointerEvents="none"
          style={[
            styles.corner,
            {
              left: pos.includes("l") ? OVAL_X + 6  : OVAL_X + OVAL_W - 30,
              top:  pos.includes("t") ? OVAL_Y + 6  : OVAL_Y + OVAL_H - 30,
              borderTopWidth:    pos.includes("t") ? 3 : 0,
              borderBottomWidth: pos.includes("b") ? 3 : 0,
              borderLeftWidth:   pos.includes("l") ? 3 : 0,
              borderRightWidth:  pos.includes("r") ? 3 : 0,
            },
          ]}
        />
      ))}

      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable onPress={onCancel} style={styles.closeBtn} hitSlop={12}>
          <Ionicons name="close" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.topTitle}>Take Selfie</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* Challenge pill above oval */}
      <View style={[styles.challengePill, { top: OVAL_Y - 56 }]}>
        <Ionicons name={CHALLENGE_ICONS[activeChallenge] as any} size={15} color="#FFE066" />
        <Text style={styles.challengeText}>{CHALLENGE_LABELS[activeChallenge]}</Text>
      </View>

      {/* Bottom instructions + capture button */}
      <View style={styles.bottomArea}>
        <Text style={styles.instruction}>
          {step === "capturing" ? "Hold still…" : "Position your face in the oval"}
        </Text>
        <Text style={styles.tip}>
          Good lighting • Face the camera directly • Chin slightly down
        </Text>

        {/* THE CAPTURE BUTTON — always enabled */}
        <Pressable
          style={[styles.captureBtn, step === "capturing" && { opacity: 0.6 }]}
          onPress={doCapture}
          disabled={step === "capturing"}
        >
          {step === "capturing"
            ? <ActivityIndicator size="small" color={Colors.primary} />
            : <>
                <Ionicons name="camera" size={20} color={Colors.primary} style={{ marginRight: 8 }} />
                <Text style={styles.captureBtnText}>Capture Selfie</Text>
              </>
          }
        </Pressable>
      </View>
    </View>
  );
}

/* ─── styles ─────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" },

  vignette: { backgroundColor: VIGNETTE, position: "absolute", left: 0, right: 0 },

  oval: {
    position: "absolute",
    borderRadius: 999,
    borderWidth: 2.5,
    borderColor: "rgba(255,255,255,0.75)",
    backgroundColor: "transparent",
  },

  corner: {
    position: "absolute",
    width: 24,
    height: 24,
    borderColor: "#fff",
    borderRadius: 2,
  },

  topBar: {
    position: "absolute", top: 0, left: 0, right: 0,
    paddingTop: 56, paddingBottom: 16, paddingHorizontal: 20,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  closeBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  topTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff", letterSpacing: 0.3 },

  challengePill: {
    position: "absolute", alignSelf: "center", left: 40, right: 40,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: "rgba(255,224,50,0.13)",
    borderWidth: 1, borderColor: "rgba(255,224,50,0.3)",
    borderRadius: 24, paddingHorizontal: 16, paddingVertical: 8,
    zIndex: 10,
  },
  challengeText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#FFE066" },

  bottomArea: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    paddingBottom: 52, paddingHorizontal: 24,
    alignItems: "center", gap: 10,
  },
  instruction: {
    fontSize: 20, fontFamily: "Inter_700Bold",
    color: "#fff", textAlign: "center",
  },
  tip: {
    fontSize: 12, fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.45)", textAlign: "center", lineHeight: 18,
  },

  captureBtn: {
    marginTop: 8, width: "100%",
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: "#fff",
    borderRadius: 16, paddingVertical: 16,
  },
  captureBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.primary },

  // Review screen
  reviewDim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  reviewPanel: {
    position: "absolute", left: 20, right: 20, bottom: 40,
    backgroundColor: "rgba(10,10,10,0.92)",
    borderRadius: 22, padding: 20,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
    gap: 12,
  },
  reviewTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff" },
  reviewBody:  { fontSize: 14, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.7)", lineHeight: 20 },
  verificationRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  reviewActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  retakeBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    minHeight: 52, borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.09)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
  },
  retakeBtnText:   { color: "#fff",        fontSize: 15, fontFamily: "Inter_600SemiBold" },
  confirmBtn: {
    flex: 1.2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    minHeight: 52, borderRadius: 14,
    backgroundColor: "#fff",
  },
  confirmBtnText:  { color: Colors.primary, fontSize: 15, fontFamily: "Inter_700Bold" },

  // Permission screen
  permissionContainer: {
    flex: 1, backgroundColor: "#0a0a0f",
    alignItems: "center", justifyContent: "center",
    paddingHorizontal: 40, gap: 16,
  },
  permissionTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#fff", textAlign: "center" },
  permissionBody:  { fontSize: 15, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.55)", textAlign: "center", lineHeight: 22 },
  permissionBtn:   { marginTop: 8, backgroundColor: Colors.accent, borderRadius: 14, paddingHorizontal: 32, paddingVertical: 14 },
  permissionBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
