import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { apiRequest } from "@/lib/query-client";
import Colors from "@/constants/colors";
import ClientReferralsScreen from "../client/referrals";

export default function ChauffeurReferralsScreen() {
  const [operatorType, setOperatorType] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest("GET", "/api/operator-profile/me")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => setOperatorType(data?.profile?.type || "driver"))
      .catch(() => setOperatorType("driver"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <View style={[styles.container, styles.center]}><ActivityIndicator color={Colors.white} /></View>;
  }

  if (operatorType === "partner") {
    return (
      <View style={[styles.container, styles.center]}>
        <Ionicons name="lock-closed-outline" size={46} color={Colors.textMuted} />
        <Text style={styles.title}>Rewards are for drivers</Text>
        <Text style={styles.body}>Partner accounts manage fleet operations and do not have reward programme links.</Text>
        <Pressable style={styles.button} onPress={() => router.back()}>
          <Text style={styles.buttonText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  return <ClientReferralsScreen appTarget="driver" />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary, paddingHorizontal: 24 },
  center: { alignItems: "center", justifyContent: "center", gap: 14 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold", color: Colors.white },
  body: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary, lineHeight: 21, textAlign: "center" },
  button: { marginTop: 8, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.accent },
  buttonText: { color: Colors.white, fontFamily: "Inter_700Bold" },
});
