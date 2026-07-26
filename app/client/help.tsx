import React from "react";
import { View, Text, StyleSheet, Pressable, Platform, ScrollView, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";

const FAQ_ITEMS = [
  { q: "How do I request a ride?", a: "Go to the Home tab, enter your destination, select your preferred vehicle type, and tap 'Get Estimated Fare'. Confirm your booking to request a chauffeur." },
  { q: "What payment methods are accepted?", a: "We accept Visa, PayPal, EFT bank transfers, and cash payments. You can manage your payment methods in the Wallet tab." },
  { q: "How is pricing calculated?", a: "Pricing is based on distance, duration, vehicle type, and time of day. Airport transfers and late-night rides may have surcharges. All prices are shown upfront before you confirm." },
  { q: "How do I become a chauffeur?", a: "Switch to Chauffeur mode from your Profile, then complete the registration form with your vehicle details and phone number. Your application will be reviewed by our team." },
  { q: "What is the commission rate?", a: "A2B LIFT deducts 30% from qualifying rides. Drivers receive 70% immediately, while 25% is the platform fee and 5% accumulates toward the annual driver share paid in December if qualification rules are met." },
  { q: "How do withdrawals work?", a: "Chauffeurs can request withdrawals from their earnings balance. Withdrawals are processed and reviewed by the admin team, typically within 24-48 hours." },
];

export default function HelpScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16) }]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.navigate("/client/profile")}>
          <Ionicons name="chevron-back" size={24} color={Colors.white} />
        </Pressable>
        <Text style={styles.title}>Help & Support</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.contactCard}>
        <Ionicons name="headset" size={28} color={Colors.white} />
        <View style={styles.contactInfo}>
          <Text style={styles.contactTitle}>Need immediate help?</Text>
          <Text style={styles.contactDesc}>Our support team is available 24/7</Text>
        </View>
      </View>

      <View style={styles.contactRow}>
        <Pressable style={styles.contactBtn} onPress={() => Linking.openURL("mailto:support@a2blift.co.za")}>
          <Ionicons name="mail" size={20} color={Colors.white} />
          <Text style={styles.contactBtnText}>Email Support</Text>
        </Pressable>
        <Pressable style={styles.contactBtn} onPress={() => Linking.openURL("tel:+27800000000")}>
          <Ionicons name="call" size={20} color={Colors.white} />
          <Text style={styles.contactBtnText}>Call Us</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>

      {FAQ_ITEMS.map((item, index) => (
        <View key={index} style={styles.faqCard}>
          <Text style={styles.faqQuestion}>{item.q}</Text>
          <Text style={styles.faqAnswer}>{item.a}</Text>
        </View>
      ))}

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary, paddingHorizontal: 20 },
  scrollContent: { paddingBottom: 40 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.white },
  contactCard: { flexDirection: "row", alignItems: "center", gap: 16, backgroundColor: Colors.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: Colors.border, marginBottom: 12 },
  contactInfo: { flex: 1, gap: 4 },
  contactTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.white },
  contactDesc: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  contactRow: { flexDirection: "row", gap: 10, marginBottom: 28 },
  contactBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: Colors.surface, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.border },
  contactBtnText: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.white },
  sectionTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 },
  faqCard: { backgroundColor: Colors.card, borderRadius: 14, padding: 16, gap: 8, borderWidth: 1, borderColor: Colors.border, marginBottom: 10 },
  faqQuestion: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.white },
  faqAnswer: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, lineHeight: 20 },
});
