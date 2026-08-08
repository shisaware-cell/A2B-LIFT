import React from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useSegments } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";

type Props = {
  visible: boolean;
  onClose: () => void;
};

export default function LiftClubMembershipRequiredModal({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const isDriver = segments[0] === "chauffeur";

  function openLiftClubRegistration() {
    onClose();
    router.push((isDriver ? "/chauffeur/lift-club-membership" : "/client/lift-club") as any);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + (Platform.OS === "ios" ? 12 : 20) }]}>
          <View style={styles.iconWrap}>
            <Ionicons name="ribbon-outline" size={28} color="#2A1D00" />
          </View>
          <Text style={styles.title}>Lift Club membership required</Text>
          <Text style={styles.copy}>
            Your cashback and referral earnings will keep growing. Become an approved Lift Club member before you transfer, spend, or withdraw those rewards.
          </Text>
          <View style={styles.detailRow}>
            <Ionicons name="checkmark-circle-outline" size={18} color={Colors.success} />
            <Text style={styles.detailText}>Your current reward balance stays available.</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="time-outline" size={18} color={Colors.warning} />
            <Text style={styles.detailText}>Approval follows payment-proof review.</Text>
          </View>
          <Pressable style={styles.primaryButton} onPress={openLiftClubRegistration}>
            <Text style={styles.primaryButtonText}>Register for Lift Club</Text>
            <Ionicons name="chevron-forward" size={18} color={Colors.primary} />
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={onClose}>
            <Text style={styles.secondaryButtonText}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.58)",
  },
  sheet: {
    backgroundColor: "#121212",
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    paddingHorizontal: 22,
    paddingTop: 24,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#F7C948",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  title: {
    fontSize: 21,
    lineHeight: 27,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
  },
  copy: {
    fontSize: 14,
    lineHeight: 21,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  detailText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  primaryButton: {
    minHeight: 52,
    marginTop: 8,
    borderRadius: 8,
    backgroundColor: Colors.white,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.primary,
  },
  secondaryButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
  },
});
