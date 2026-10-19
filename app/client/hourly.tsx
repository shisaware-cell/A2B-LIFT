/**
 * Chauffeur-by-the-hour (V-Class only).
 *
 * Pick a pickup point and a block of hours instead of a destination.
 * Supporting detail lives behind a single info row rather than on the surface,
 * so the booking flow stays short and readable.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { apiRequest } from "@/lib/query-client";
import Colors from "@/constants/colors";
import {
  HOURLY_HIRE_CONFIG,
  HOURLY_BIDDING_CONFIG,
  getHourlyDurationOptions,
  getHourlyQuote,
  getMaxEscalatedPrice,
} from "@shared/hourly-hire";

const CATEGORY_VAN_ART = require("../../assets/images/category-van.png");

type PlaceSuggestion = { placeId: string; description: string };
type PickupPoint = { lat: number; lng: number; address: string };

const DURATION_OPTIONS = getHourlyDurationOptions();
const MIN_LEAD_MINUTES = 35;

const money = (amount: number) =>
  `R ${amount.toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const timeLabel = (date: Date) =>
  date.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false });

const dayLabel = (date: Date) => {
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86400000);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return date.toLocaleDateString("en-ZA", { weekday: "short", day: "2-digit", month: "short" });
};

export default function HourlyHireScreen() {
  const insets = useSafeAreaInsets();

  const [pickup, setPickup] = useState<PickupPoint | null>(null);
  const [hours, setHours] = useState<number>(HOURLY_HIRE_CONFIG.minHours);
  const [startMode, setStartMode] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [durationOpen, setDurationOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const sessionTokenRef = useRef(`${Date.now()}`);

  const quote = useMemo(() => getHourlyQuote(hours), [hours]);
  const maxPrice = useMemo(() => getMaxEscalatedPrice(quote.price), [quote.price]);

  /* Prefill pickup from the rider's location */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;
        const position = await Location.getCurrentPositionAsync({});
        if (cancelled) return;
        const [place] = await Location.reverseGeocodeAsync({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }).catch(() => [] as any[]);
        setPickup({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          address: place
            ? [place.name, place.street, place.city].filter(Boolean).join(", ") || "Current location"
            : "Current location",
        });
      } catch { /* rider can search instead */ }
    })();
    return () => { cancelled = true; };
  }, []);

  /* Pickup autocomplete */
  useEffect(() => {
    if (!pickerOpen) return;
    const text = query.trim();
    if (text.length < 3) { setSuggestions([]); return; }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await apiRequest(
          "GET",
          `/api/places/autocomplete?input=${encodeURIComponent(text)}&sessionToken=${encodeURIComponent(sessionTokenRef.current)}`,
        );
        const data = await res.json();
        if (cancelled) return;
        setSuggestions((data?.predictions || []).map((p: any) => ({
          placeId: p.place_id,
          description: p.description,
        })));
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 280);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, pickerOpen]);

  const choosePickup = useCallback(async (suggestion: PlaceSuggestion) => {
    try {
      const res = await apiRequest(
        "GET",
        `/api/places/details?placeId=${encodeURIComponent(suggestion.placeId)}&sessionToken=${encodeURIComponent(sessionTokenRef.current)}`,
      );
      const data = await res.json();
      const lat = Number(data?.location?.lat ?? data?.lat);
      const lng = Number(data?.location?.lng ?? data?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error("No coordinates");
      setPickup({ lat, lng, address: data?.address || suggestion.description });
      setPickerOpen(false);
      setQuery("");
      setSuggestions([]);
      sessionTokenRef.current = `${Date.now()}`;
    } catch {
      Alert.alert("Could not use that address", "Please choose another pickup point.");
    }
  }, []);

  const slots = useMemo(() => {
    const out: Date[] = [];
    const first = new Date(Date.now() + MIN_LEAD_MINUTES * 60 * 1000);
    first.setMinutes(first.getMinutes() > 30 ? 60 : 30, 0, 0);
    for (let i = 0; i < 48; i += 1) out.push(new Date(first.getTime() + i * 30 * 60 * 1000));
    return out;
  }, []);

  async function handleBook() {
    if (!pickup) {
      Alert.alert("Pickup needed", "Choose where your chauffeur should meet you.");
      return;
    }
    if (startMode === "later" && !scheduledAt) {
      Alert.alert("Choose a time", "Select when your chauffeur should arrive.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiRequest("POST", "/api/rides", {
        bookingType: "hourly",
        hourlyDurationHours: quote.hours,
        vehicleType: quote.vehicleType,
        pickupLat: pickup.lat,
        pickupLng: pickup.lng,
        pickupAddress: pickup.address,
        paymentMethod: "card",
        ...(startMode === "later" && scheduledAt ? { scheduledFor: scheduledAt.toISOString() } : {}),
      });
      const data = await res.json();
      if (!res.ok || data?.success === false) throw new Error(data?.message || "Could not create your booking.");

      const ride = data?.ride || data;
      // Hourly hire is card-only, so the card has to be charged before we hand
      // the rider back to the map — otherwise the job dispatches unpaid.
      const chargeRes = await apiRequest("POST", "/api/payments/charge-ride", { rideId: ride.id });
      const charge = await chargeRes.json();
      if (!charge?.success) {
        await apiRequest("PUT", `/api/rides/${ride.id}/status`, { status: "cancelled" }).catch(() => {});
        if (charge?.needsCard) {
          Alert.alert("Add a card", "Hourly hire is paid by card. Add one in your wallet to continue.", [
            { text: "Go to wallet", onPress: () => router.push("/client/wallet" as any) },
            { text: "Not now", style: "cancel" },
          ]);
        } else {
          Alert.alert("Payment failed", charge?.message || "Your card could not be charged.");
        }
        return;
      }
      router.replace("/client");
    } catch (error: any) {
      Alert.alert("Booking failed", error?.message || "Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const canBook = !!pickup && !submitting && (startMode === "now" || !!scheduledAt);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={14} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.white} />
        </Pressable>
        <Text style={styles.headerTitle}>Hourly hire</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 150 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Image source={CATEGORY_VAN_ART} style={styles.heroArt} resizeMode="contain" />
          <Text style={styles.heroTitle}>V-Class</Text>
          <Text style={styles.heroMeta}>Up to 6 guests · professional chauffeur</Text>
        </View>

        <View style={styles.group}>
          <Pressable style={styles.row} onPress={() => setPickerOpen(true)}>
            <Ionicons name="location" size={18} color={Colors.textSecondary} />
            <View style={styles.rowBody}>
              <Text style={styles.rowLabel}>Pickup</Text>
              <Text style={[styles.rowValue, !pickup && styles.rowValueEmpty]} numberOfLines={1}>
                {pickup?.address || "Choose a location"}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
          </Pressable>

          <View style={styles.divider} />

          <Pressable style={styles.row} onPress={() => setDurationOpen(true)}>
            <Ionicons name="time" size={18} color={Colors.textSecondary} />
            <View style={styles.rowBody}>
              <Text style={styles.rowLabel}>Duration</Text>
              <Text style={styles.rowValue}>
                {quote.hours} hours · {quote.includedKm} km
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.segment}>
          {(["now", "later"] as const).map((mode) => (
            <Pressable
              key={mode}
              style={[styles.segmentBtn, startMode === mode && styles.segmentBtnActive]}
              onPress={() => setStartMode(mode)}
            >
              <Text style={[styles.segmentText, startMode === mode && styles.segmentTextActive]}>
                {mode === "now" ? "Now" : "Schedule"}
              </Text>
            </Pressable>
          ))}
        </View>

        {startMode === "later" && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.slots}>
            {slots.map((slot) => {
              const active = scheduledAt?.getTime() === slot.getTime();
              return (
                <Pressable
                  key={slot.toISOString()}
                  style={[styles.slot, active && styles.slotActive]}
                  onPress={() => setScheduledAt(slot)}
                >
                  <Text style={[styles.slotDay, active && styles.slotTextActive]}>{dayLabel(slot)}</Text>
                  <Text style={[styles.slotTime, active && styles.slotTextActive]}>{timeLabel(slot)}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        <Pressable style={styles.infoRow} onPress={() => setDetailsOpen(true)}>
          <Ionicons name="information-circle-outline" size={16} color={Colors.textSecondary} />
          <Text style={styles.infoText}>
            {HOURLY_HIRE_CONFIG.includedKmPerHour} km per hour included · Card payment
          </Text>
          <Ionicons name="chevron-forward" size={15} color={Colors.textSecondary} />
        </Pressable>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.priceLine}>
          <Text style={styles.priceCaption}>{quote.hours} hours · {quote.includedKm} km</Text>
          <Text style={styles.price}>{money(quote.price)}</Text>
        </View>
        <Pressable
          style={[styles.cta, !canBook && styles.ctaDisabled]}
          onPress={handleBook}
          disabled={!canBook}
        >
          {submitting
            ? <ActivityIndicator color={Colors.primary} />
            : <Text style={styles.ctaText}>{startMode === "later" ? "Reserve V-Class" : "Book V-Class"}</Text>}
        </Pressable>
      </View>

      {/* Duration picker */}
      <Modal visible={durationOpen} transparent animationType="slide" onRequestClose={() => setDurationOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setDurationOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.grabber} />
            <Text style={styles.sheetTitle}>Duration</Text>
            <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
              {DURATION_OPTIONS.map((option) => {
                const active = option.hours === quote.hours;
                return (
                  <Pressable
                    key={option.hours}
                    style={styles.optionRow}
                    onPress={() => { setHours(option.hours); setDurationOpen(false); }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.optionTitle, active && styles.optionTitleActive]}>
                        {option.hours} hours
                      </Text>
                      <Text style={styles.optionMeta}>{option.includedKm} km included</Text>
                    </View>
                    <Text style={[styles.optionPrice, active && styles.optionTitleActive]}>
                      {money(option.price)}
                    </Text>
                    {active && <Ionicons name="checkmark" size={18} color={Colors.white} style={{ marginLeft: 10 }} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* How it works */}
      <Modal visible={detailsOpen} transparent animationType="slide" onRequestClose={() => setDetailsOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setDetailsOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.grabber} />
            <Text style={styles.sheetTitle}>How hourly hire works</Text>

            {[
              {
                icon: "speedometer-outline" as const,
                title: `${HOURLY_HIRE_CONFIG.includedKmPerHour} km per hour included`,
                body: `Extra distance is billed after your trip at ${money(quote.overageRatePerKm)} per km.`,
              },
              {
                icon: "time-outline" as const,
                title: `${HOURLY_HIRE_CONFIG.minHours}–${HOURLY_HIRE_CONFIG.maxHours} hours`,
                body: "On longer bookings your chauffeur may stop to refuel and take breaks.",
              },
              {
                icon: "trending-up-outline" as const,
                title: `Price may rise to ${money(maxPrice)}`,
                body: `If no chauffeur accepts, the fare rises ${Math.round(HOURLY_BIDDING_CONFIG.stepPercent * 100)}% a minute, up to ${money(maxPrice)}. You're told every time, and never charged more.`,
              },
              {
                icon: "card-outline" as const,
                title: "Card payment",
                body: "Hourly bookings are charged to your card.",
              },
            ].map((item) => (
              <View key={item.title} style={styles.detailRow}>
                <Ionicons name={item.icon} size={19} color={Colors.white} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.detailTitle}>{item.title}</Text>
                  <Text style={styles.detailBody}>{item.body}</Text>
                </View>
              </View>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Pickup search */}
      <Modal visible={pickerOpen} animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
          <View style={styles.header}>
            <Pressable onPress={() => setPickerOpen(false)} hitSlop={14} style={styles.iconBtn}>
              <Ionicons name="close" size={24} color={Colors.white} />
            </Pressable>
            <Text style={styles.headerTitle}>Pickup</Text>
            <View style={styles.iconBtn} />
          </View>
          <View style={styles.search}>
            <Ionicons name="search" size={18} color={Colors.textSecondary} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search address"
              placeholderTextColor={Colors.textMuted}
              autoFocus
            />
            {searching && <ActivityIndicator size="small" color={Colors.textSecondary} />}
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20 }}>
            {suggestions.map((s) => (
              <Pressable key={s.placeId} style={styles.suggestion} onPress={() => choosePickup(s)}>
                <Ionicons name="location-outline" size={18} color={Colors.textSecondary} />
                <Text style={styles.suggestionText} numberOfLines={2}>{s.description}</Text>
              </Pressable>
            ))}
            {!searching && query.trim().length >= 3 && suggestions.length === 0 && (
              <Text style={styles.empty}>No places found</Text>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.primary },

  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 12, paddingBottom: 8,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", color: Colors.white },

  body: { paddingHorizontal: 20, gap: 16 },

  hero: { alignItems: "center", paddingVertical: 18 },
  heroArt: { width: 190, height: 108 },
  heroTitle: { fontSize: 24, fontFamily: "Inter_700Bold", color: Colors.white, marginTop: 10 },
  heroMeta: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 4 },

  group: {
    backgroundColor: Colors.card, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border, overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 15 },
  rowBody: { flex: 1 },
  rowLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.textSecondary, letterSpacing: 0.3 },
  rowValue: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.white, marginTop: 2 },
  rowValueEmpty: { color: Colors.textSecondary, fontFamily: "Inter_400Regular" },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border, marginLeft: 48 },

  segment: {
    flexDirection: "row", backgroundColor: Colors.card, borderRadius: 14,
    padding: 4, borderWidth: 1, borderColor: Colors.border,
  },
  segmentBtn: { flex: 1, height: 42, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  segmentBtnActive: { backgroundColor: Colors.white },
  segmentText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary },
  segmentTextActive: { color: Colors.primary, fontFamily: "Inter_700Bold" },

  slots: { marginTop: -4 },
  slot: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, marginRight: 8,
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, alignItems: "center",
  },
  slotActive: { backgroundColor: Colors.white, borderColor: Colors.white },
  slotDay: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  slotTime: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.white, marginTop: 2 },
  slotTextActive: { color: Colors.primary },

  infoRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 14, paddingHorizontal: 2,
  },
  infoText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },

  footer: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    paddingHorizontal: 20, paddingTop: 16, gap: 14,
    backgroundColor: Colors.card,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border,
  },
  priceLine: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  priceCaption: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  price: { fontSize: 26, fontFamily: "Inter_700Bold", color: Colors.white },
  cta: { height: 54, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: Colors.white },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.primary },

  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: Colors.secondary,
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: 20, paddingTop: 10,
  },
  grabber: { width: 38, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: "center", marginBottom: 14 },
  sheetTitle: { fontSize: 19, fontFamily: "Inter_700Bold", color: Colors.white, marginBottom: 12 },

  optionRow: {
    flexDirection: "row", alignItems: "center", paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  optionTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary },
  optionTitleActive: { color: Colors.white, fontFamily: "Inter_700Bold" },
  optionMeta: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 2, opacity: 0.8 },
  optionPrice: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary },

  detailRow: { flexDirection: "row", gap: 14, alignItems: "flex-start", paddingVertical: 12 },
  detailTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.white },
  detailBody: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, lineHeight: 19, marginTop: 3 },

  search: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginHorizontal: 20, marginBottom: 10, paddingHorizontal: 14, height: 50,
    borderRadius: 14, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.white },
  suggestion: {
    flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  suggestionText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.white },
  empty: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, textAlign: "center", paddingVertical: 24 },
});
