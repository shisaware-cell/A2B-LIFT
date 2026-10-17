/**
 * Chauffeur-by-the-hour booking (V-Class only).
 *
 * The rider picks a pickup point and a block of hours rather than a
 * destination. Each hour includes a distance allowance; anything beyond it is
 * billed afterwards at the V-Class per-km rate.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
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
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/query-client";
import Colors from "@/constants/colors";
import {
  HOURLY_HIRE_CONFIG,
  getHourlyDurationOptions,
  getHourlyQuote,
} from "@shared/hourly-hire";

const CATEGORY_VAN_ART = require("../../assets/images/category-van.png");

type PlaceSuggestion = { placeId: string; description: string };
type PickupPoint = { lat: number; lng: number; address: string };

const DURATION_OPTIONS = getHourlyDurationOptions();
/** Reservations need at least 30 minutes of lead time (server-enforced). */
const MIN_LEAD_MINUTES = 35;

function formatMoney(amount: number) {
  return `R ${amount.toFixed(2)}`;
}

function formatWhen(date: Date) {
  return date.toLocaleString("en-ZA", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function HourlyHireScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [pickup, setPickup] = useState<PickupPoint | null>(null);
  const [hours, setHours] = useState<number>(HOURLY_HIRE_CONFIG.minHours);
  const [startMode, setStartMode] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "wallet">("card");
  const [submitting, setSubmitting] = useState(false);

  // Pickup search
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [durationOpen, setDurationOpen] = useState(false);
  const sessionTokenRef = useRef(`${Date.now()}`);

  const quote = useMemo(() => getHourlyQuote(hours), [hours]);

  /* ── Prefill pickup with the rider's current location ── */
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
        const label = place
          ? [place.name, place.street, place.city].filter(Boolean).join(", ")
          : "Current location";
        setPickup({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          address: label || "Current location",
        });
      } catch {
        /* rider can still search for a pickup manually */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* ── Pickup autocomplete ── */
  useEffect(() => {
    if (!pickerOpen) return;
    const text = query.trim();
    if (text.length < 3) {
      setSuggestions([]);
      return;
    }
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
        setSuggestions(
          (data?.predictions || []).map((p: any) => ({
            placeId: p.place_id,
            description: p.description,
          })),
        );
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
      Alert.alert("Could not use that address", "Please pick another pickup location.");
    }
  }, []);

  /* ── Scheduling ── */
  function buildSlots(): Date[] {
    const slots: Date[] = [];
    const now = new Date();
    const first = new Date(now.getTime() + MIN_LEAD_MINUTES * 60 * 1000);
    first.setMinutes(first.getMinutes() > 30 ? 60 : 30, 0, 0);
    for (let i = 0; i < 48; i += 1) {
      slots.push(new Date(first.getTime() + i * 30 * 60 * 1000));
    }
    return slots;
  }
  const slots = useMemo(buildSlots, [startMode]);

  /* ── Submit ── */
  async function handleBook() {
    if (!pickup) {
      Alert.alert("Pickup needed", "Choose where your chauffeur should meet you.");
      return;
    }
    if (startMode === "later" && !scheduledAt) {
      Alert.alert("Choose a time", "Select when your chauffeur should arrive.");
      return;
    }
    if (startMode === "later" && paymentMethod !== "card") {
      Alert.alert("Card required", "Scheduled bookings must be paid by card.");
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
        paymentMethod,
        ...(startMode === "later" && scheduledAt
          ? { scheduledFor: scheduledAt.toISOString() }
          : {}),
      });
      const data = await res.json();
      if (!res.ok || data?.success === false) {
        throw new Error(data?.message || "Could not create your booking.");
      }
      Alert.alert(
        startMode === "later" ? "Chauffeur reserved" : "Finding your chauffeur",
        startMode === "later"
          ? `Your V-Class is booked for ${quote.hours} hours on ${scheduledAt ? formatWhen(scheduledAt) : ""}.`
          : `We're matching you with a V-Class chauffeur for ${quote.hours} hours.`,
        [{ text: "OK", onPress: () => router.replace("/client") }],
      );
    } catch (error: any) {
      Alert.alert("Booking failed", error?.message || "Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const canBook =
    !!pickup && !submitting && (startMode === "now" || !!scheduledAt);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 10 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.white} />
        </Pressable>
        <Text style={styles.headerTitle}>Hourly hire</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 140 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Vehicle */}
        <View style={styles.vehicleCard}>
          <Image source={CATEGORY_VAN_ART} style={styles.vehicleArt} resizeMode="contain" />
          <View style={{ flex: 1 }}>
            <Text style={styles.vehicleName}>V-Class</Text>
            <Text style={styles.vehicleDesc}>Mercedes-Benz V-Class with a professional chauffeur</Text>
            <View style={styles.capacityRow}>
              <Ionicons name="people-outline" size={13} color={Colors.textMuted} />
              <Text style={styles.capacityText}>Up to 6 guests</Text>
            </View>
          </View>
        </View>

        {/* Pickup */}
        <Text style={styles.sectionLabel}>Pickup location</Text>
        <Pressable style={styles.field} onPress={() => setPickerOpen(true)}>
          <Ionicons name="location-outline" size={18} color={Colors.textMuted} />
          <Text style={[styles.fieldText, !pickup && styles.fieldPlaceholder]} numberOfLines={1}>
            {pickup?.address || "Where should we meet you?"}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
        </Pressable>

        {/* Duration */}
        <Text style={styles.sectionLabel}>Duration</Text>
        <Pressable style={styles.field} onPress={() => setDurationOpen((open) => !open)}>
          <Ionicons name="time-outline" size={18} color={Colors.textMuted} />
          <Text style={styles.fieldText}>
            {quote.hours} hours ({quote.includedKm} km)
          </Text>
          <Ionicons name={durationOpen ? "chevron-up" : "chevron-down"} size={16} color={Colors.textMuted} />
        </Pressable>

        {durationOpen && (
          <View style={styles.durationList}>
            {DURATION_OPTIONS.map((option) => {
              const selected = option.hours === quote.hours;
              return (
                <Pressable
                  key={option.hours}
                  style={[styles.durationRow, selected && styles.durationRowSelected]}
                  onPress={() => { setHours(option.hours); setDurationOpen(false); }}
                >
                  <Text style={[styles.durationText, selected && styles.durationTextSelected]}>
                    {option.hours} hours ({option.includedKm} km)
                  </Text>
                  <Text style={[styles.durationPrice, selected && styles.durationTextSelected]}>
                    {formatMoney(option.price)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <View style={styles.noteRow}>
          <Ionicons name="time-outline" size={16} color={Colors.textMuted} />
          <View style={{ flex: 1 }}>
            <Text style={styles.noteTitle}>
              Min. {HOURLY_HIRE_CONFIG.minHours} hours and max. {HOURLY_HIRE_CONFIG.maxHours} hours
            </Text>
            <Text style={styles.noteBody}>
              On long bookings your chauffeur may need to stop to refuel and take breaks.
            </Text>
          </View>
        </View>
        <View style={styles.noteRow}>
          <Ionicons name="swap-horizontal-outline" size={16} color={Colors.textMuted} />
          <View style={{ flex: 1 }}>
            <Text style={styles.noteTitle}>
              {HOURLY_HIRE_CONFIG.includedKmPerHour} km per hour included
            </Text>
            <Text style={styles.noteBody}>
              Extra distance is charged at {formatMoney(quote.overageRatePerKm)} per km after your trip.
            </Text>
          </View>
        </View>

        {/* When */}
        <Text style={styles.sectionLabel}>When</Text>
        <View style={styles.segment}>
          {(["now", "later"] as const).map((mode) => (
            <Pressable
              key={mode}
              style={[styles.segmentBtn, startMode === mode && styles.segmentBtnActive]}
              onPress={() => {
                setStartMode(mode);
                if (mode === "later") setPaymentMethod("card");
              }}
            >
              <Text style={[styles.segmentText, startMode === mode && styles.segmentTextActive]}>
                {mode === "now" ? "Start now" : "Schedule"}
              </Text>
            </Pressable>
          ))}
        </View>

        {startMode === "later" && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.slotStrip}>
            {slots.map((slot) => {
              const selected = scheduledAt?.getTime() === slot.getTime();
              return (
                <Pressable
                  key={slot.toISOString()}
                  style={[styles.slotChip, selected && styles.slotChipSelected]}
                  onPress={() => setScheduledAt(slot)}
                >
                  <Text style={[styles.slotText, selected && styles.slotTextSelected]}>
                    {formatWhen(slot)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {/* Payment */}
        <Text style={styles.sectionLabel}>Payment</Text>
        <View style={styles.segment}>
          {(["card", "wallet", "cash"] as const).map((method) => {
            const disabled = startMode === "later" && method !== "card";
            return (
              <Pressable
                key={method}
                style={[
                  styles.segmentBtn,
                  paymentMethod === method && styles.segmentBtnActive,
                  disabled && styles.segmentBtnDisabled,
                ]}
                disabled={disabled}
                onPress={() => setPaymentMethod(method)}
              >
                <Text
                  style={[
                    styles.segmentText,
                    paymentMethod === method && styles.segmentTextActive,
                    disabled && styles.segmentTextDisabled,
                  ]}
                >
                  {method === "card" ? "Card" : method === "wallet" ? "Wallet" : "Cash"}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {startMode === "later" && (
          <Text style={styles.noteBody}>Scheduled bookings are paid by card.</Text>
        )}
      </ScrollView>

      {/* Price bar */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
        <View style={styles.priceRow}>
          <View>
            <Text style={styles.priceLabel}>
              {quote.hours} hours · {quote.includedKm} km included
            </Text>
            <Text style={styles.priceValue}>{formatMoney(quote.price)}</Text>
          </View>
          <Ionicons name="car-sport" size={26} color={Colors.textMuted} />
        </View>
        <Pressable
          style={[styles.bookBtn, !canBook && styles.bookBtnDisabled]}
          onPress={handleBook}
          disabled={!canBook}
        >
          {submitting ? (
            <ActivityIndicator color={Colors.primary} />
          ) : (
            <Text style={styles.bookBtnText}>
              {startMode === "later" ? "Reserve V-Class" : `Book ${quote.hours}-hour journey`}
            </Text>
          )}
        </Pressable>
      </View>

      {/* Pickup picker */}
      <Modal visible={pickerOpen} animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={[styles.container, { paddingTop: insets.top + 10 }]}>
          <View style={styles.header}>
            <Pressable onPress={() => setPickerOpen(false)} hitSlop={12} style={styles.backBtn}>
              <Ionicons name="close" size={22} color={Colors.white} />
            </Pressable>
            <Text style={styles.headerTitle}>Pickup location</Text>
            <View style={{ width: 38 }} />
          </View>
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color={Colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search for an address"
              placeholderTextColor={Colors.textMuted}
              autoFocus
            />
            {searching && <ActivityIndicator size="small" color={Colors.textMuted} />}
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20 }}>
            {suggestions.map((suggestion) => (
              <Pressable
                key={suggestion.placeId}
                style={styles.suggestionRow}
                onPress={() => choosePickup(suggestion)}
              >
                <Ionicons name="location-outline" size={18} color={Colors.textMuted} />
                <Text style={styles.suggestionText} numberOfLines={2}>{suggestion.description}</Text>
              </Pressable>
            ))}
            {!searching && query.trim().length >= 3 && suggestions.length === 0 && (
              <Text style={styles.emptyText}>No matching places found.</Text>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 14,
  },
  backBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.white },

  content: { paddingHorizontal: 20, gap: 10 },

  vehicleCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: Colors.card, borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 6,
  },
  vehicleArt: { width: 84, height: 54 },
  vehicleName: { fontSize: 17, fontFamily: "Inter_700Bold", color: Colors.white },
  vehicleDesc: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 2, lineHeight: 17 },
  capacityRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 },
  capacityText: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.textMuted },

  sectionLabel: {
    fontSize: 11, fontFamily: "Inter_600SemiBold", color: Colors.textMuted,
    textTransform: "uppercase", letterSpacing: 0.6, marginTop: 10,
  },
  field: {
    flexDirection: "row", alignItems: "center", gap: 10,
    minHeight: 52, paddingHorizontal: 14, borderRadius: 14,
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
  },
  fieldText: { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.white },
  fieldPlaceholder: { color: Colors.textMuted, fontFamily: "Inter_400Regular" },

  durationList: {
    borderRadius: 14, backgroundColor: Colors.card,
    borderWidth: 1, borderColor: Colors.border, overflow: "hidden",
  },
  durationRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  durationRowSelected: { backgroundColor: Colors.surface },
  durationText: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  durationPrice: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.textMuted },
  durationTextSelected: { color: Colors.white, fontFamily: "Inter_700Bold" },

  noteRow: { flexDirection: "row", gap: 10, alignItems: "flex-start", marginTop: 10 },
  noteTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.white },
  noteBody: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted, lineHeight: 17, marginTop: 2 },

  segment: {
    flexDirection: "row", gap: 8, backgroundColor: Colors.card,
    borderRadius: 14, padding: 5, borderWidth: 1, borderColor: Colors.border,
  },
  segmentBtn: { flex: 1, minHeight: 42, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  segmentBtnActive: { backgroundColor: Colors.white },
  segmentBtnDisabled: { opacity: 0.4 },
  segmentText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary },
  segmentTextActive: { color: Colors.primary, fontFamily: "Inter_700Bold" },
  segmentTextDisabled: { color: Colors.textMuted },

  slotStrip: { marginTop: 4 },
  slotChip: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, marginRight: 8,
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
  },
  slotChipSelected: { backgroundColor: Colors.white, borderColor: Colors.white },
  slotText: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  slotTextSelected: { color: Colors.primary, fontFamily: "Inter_700Bold" },

  footer: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    paddingHorizontal: 20, paddingTop: 14, gap: 12,
    backgroundColor: Colors.card,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  priceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  priceLabel: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  priceValue: { fontSize: 24, fontFamily: "Inter_700Bold", color: Colors.white, marginTop: 2 },
  bookBtn: {
    minHeight: 54, borderRadius: 14, alignItems: "center", justifyContent: "center",
    backgroundColor: Colors.white,
  },
  bookBtnDisabled: { opacity: 0.45 },
  bookBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.primary },

  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginHorizontal: 20, marginBottom: 12, paddingHorizontal: 14,
    minHeight: 50, borderRadius: 14,
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.white },
  suggestionRow: {
    flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  suggestionText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.white },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textMuted, paddingVertical: 20, textAlign: "center" },
});
