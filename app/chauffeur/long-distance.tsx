import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRef } from "react";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { whiteButtonHiddenStyle } from "@/lib/maintenance-config";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/query-client";

interface ChauffeurProfile {
  id: string;
  isApproved: boolean;
  lat?: number | null;
  lng?: number | null;
  vehicleType?: string | null;
  vehicleModel?: string | null;
  availableForLongDistance?: boolean | null;
  longDistanceFrom?: string | null;
  longDistanceTo?: string | null;
  longDistanceDate?: string | null;
  longDistancePricePerSeat?: number | null;
  longDistanceSeatsAvailable?: number | null;
}

interface LongDistanceAvailability {
  available: boolean;
  from: string;
  to: string;
  date: string;
  pricePerSeat: string;
  seatsAvailable: string;
}

interface CitySuggestion {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

type RouteField = "from" | "to";

const defaultAvailability: LongDistanceAvailability = {
  available: false,
  from: "",
  to: "",
  date: "",
  pricePerSeat: "",
  seatsAvailable: "3",
};

const AUTOCOMPLETE_DEBOUNCE_MS = 350;


function isMissingLongDistanceRouteError(error: any) {
  const message = String(error?.message || "");
  return (
    message.includes("Cannot GET /api/long-distance") ||
    message.includes("Cannot POST /api/long-distance") ||
    (message.includes("404") && message.includes("long-distance"))
  );
}

function normalizeCityLabel(value: string) {
  return value
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(south africa|sa)\b/gi, " ")
    .split(",")[0]
    .replace(/[^a-zA-Z\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


function formatDateValue(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLabel(date: Date) {
  return date.toLocaleDateString("en-ZA", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function ChauffeurLongDistanceScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [chauffeur, setChauffeur] = useState<ChauffeurProfile | null>(null);
  const [form, setForm] = useState<LongDistanceAvailability>(defaultAvailability);
  const [lastUpdatedLabel, setLastUpdatedLabel] = useState<string>("");
  const [suggestionField, setSuggestionField] = useState<RouteField | null>(null);
  const [suggestions, setSuggestions] = useState<CitySuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const autocompleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dateOptions = useMemo(() => {
    const upcomingDates: Array<{ value: string; label: string }> = [];
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    for (let offset = 1; offset <= 120; offset += 1) {
      const nextDate = new Date(start);
      nextDate.setDate(start.getDate() + offset);
      upcomingDates.push({
        value: formatDateValue(nextDate),
        label: formatDateLabel(nextDate),
      });
    }

    return upcomingDates;
  }, []);

  const loadData = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [profileRes, availabilityRes] = await Promise.all([
        apiRequest("GET", `/api/chauffeurs/user/${user.id}`).catch(() => null),
        apiRequest("GET", "/api/long-distance/my-availability").catch(() => null),
      ]);

      if (profileRes) {
        const profile = await profileRes.json();
        setChauffeur(profile);
        if (!availabilityRes) {
          setForm({
            available: Boolean(profile?.availableForLongDistance),
            from: profile?.longDistanceFrom || "",
            to: profile?.longDistanceTo || "",
            date: profile?.longDistanceDate || "",
            pricePerSeat: profile?.longDistancePricePerSeat ? String(profile.longDistancePricePerSeat) : "",
            seatsAvailable: profile?.longDistanceSeatsAvailable ? String(profile.longDistanceSeatsAvailable) : "3",
          });
        }
      } else {
        setChauffeur(null);
      }

      if (availabilityRes) {
        const availability = await availabilityRes.json();
        setForm({
          available: Boolean(availability?.available),
          from: availability?.from || "",
          to: availability?.to || "",
          date: availability?.date || "",
          pricePerSeat: availability?.pricePerSeat ? String(availability.pricePerSeat) : "",
          seatsAvailable: availability?.seatsAvailable ? String(availability.seatsAvailable) : "3",
        });
      } else {
        setForm(defaultAvailability);
      }
    } catch (error) {
      console.error("Failed to load long-distance availability", error);
      Alert.alert("Unable to load long-distance settings", "Please try again.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    return () => {
      if (autocompleteTimerRef.current) clearTimeout(autocompleteTimerRef.current);
    };
  }, []);

  const canSave = useMemo(() => {
    if (!chauffeur?.isApproved || saving) return false;
    if (!form.available) return true;

    return (
      form.from.trim().length > 1 &&
      form.to.trim().length > 1 &&
      form.date.trim().length >= 10 &&
      Number(form.pricePerSeat) > 0 &&
      Number(form.seatsAvailable) >= 1
    );
  }, [chauffeur?.isApproved, form, saving]);

  function setField<K extends keyof LongDistanceAvailability>(key: K, value: LongDistanceAvailability[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function loadCitySuggestions(query: string) {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2) {
      setSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }

    setSuggestionsLoading(true);
    try {
      const biasCoords =
        typeof chauffeur?.lat === "number" && typeof chauffeur?.lng === "number"
          ? { lat: chauffeur.lat, lng: chauffeur.lng }
          : null;

      let predictions: any[] = [];

      // Use the Railway backend lookup so Android-restricted native keys are not used for Places REST calls.
      if (predictions.length === 0) {
        const biasQuery = biasCoords
          ? `&lat=${encodeURIComponent(String(biasCoords.lat))}&lng=${encodeURIComponent(String(biasCoords.lng))}`
          : "";
        const res = await apiRequest("GET", `/api/places/autocomplete?cityOnly=1&input=${encodeURIComponent(trimmedQuery)}${biasQuery}`);
        const payload = await res.json();
        predictions = Array.isArray(payload?.predictions) ? payload.predictions : [];
      }

      const seen = new Set<string>();
      const citySuggestions: CitySuggestion[] = [];

      for (const prediction of predictions) {
        const label = normalizeCityLabel(prediction?.mainText || prediction?.description || "");
        const dedupeKey = label.toLowerCase();
        if (!label || seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        citySuggestions.push({
          placeId: String(prediction?.placeId || dedupeKey),
          description: String(prediction?.description || label),
          mainText: label,
          secondaryText: String(prediction?.secondaryText || ""),
        });
        if (citySuggestions.length >= 6) break;
      }

      setSuggestions(citySuggestions);
    } catch {
      setSuggestions([]);
    } finally {
      setSuggestionsLoading(false);
    }
  }

  function onRouteFieldChange(field: RouteField, value: string) {
    setField(field, value);
    setSuggestionField(field);
    if (autocompleteTimerRef.current) clearTimeout(autocompleteTimerRef.current);
    autocompleteTimerRef.current = setTimeout(() => {
      void loadCitySuggestions(value);
    }, AUTOCOMPLETE_DEBOUNCE_MS);
  }

  function applySuggestion(suggestion: CitySuggestion) {
    if (!suggestionField) return;
    setField(suggestionField, suggestion.mainText);
    setSuggestionField(null);
    setSuggestions([]);
  }

  function selectTravelDate(value: string) {
    setField("date", value);
    setDatePickerVisible(false);
  }

  async function saveAvailability() {
    if (!chauffeur?.isApproved) {
      Alert.alert("Approval pending", "Your chauffeur profile must be approved before you can publish long-distance availability.");
      return;
    }

    if (!canSave) {
      Alert.alert("Complete your route", "Add the departure city, destination, date, seat price, and number of seats before going live.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        available: form.available,
        from: form.available ? form.from.trim() : undefined,
        to: form.available ? form.to.trim() : undefined,
        date: form.available ? form.date.trim() : undefined,
        pricePerSeat: form.available ? Number(form.pricePerSeat) : undefined,
        seatsAvailable: form.available ? Number(form.seatsAvailable) : undefined,
      };

      try {
        await apiRequest("POST", "/api/long-distance/availability", payload);
      } catch (error) {
        if (!isMissingLongDistanceRouteError(error) || !chauffeur?.id) {
          throw error;
        }

        // Fallback for deployments that don't yet expose /api/long-distance routes.
        await apiRequest("PUT", `/api/chauffeurs/${chauffeur.id}`, {
          availableForLongDistance: payload.available,
          longDistanceFrom: payload.available ? payload.from : null,
          longDistanceTo: payload.available ? payload.to : null,
          longDistanceDate: payload.available ? payload.date : null,
          longDistancePricePerSeat: payload.available ? payload.pricePerSeat : null,
          longDistanceSeatsAvailable: payload.available ? payload.seatsAvailable : 0,
        });
      }

      setLastUpdatedLabel(new Date().toLocaleString());
      Alert.alert(
        form.available ? "Long-distance route is live" : "Long-distance availability turned off",
        form.available ? "Riders can now find your long-distance route in search." : "Your route has been removed from public search results.",
      );
      await loadData();
    } catch (error: any) {
      Alert.alert("Could not save availability", error?.message || "Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={Colors.white} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}> 
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Pressable style={styles.backButton} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={18} color={Colors.white} />
              <Text style={styles.backText}>Back</Text>
            </Pressable>
            <Pressable style={styles.refreshButton} onPress={loadData}>
              <Ionicons name="refresh-outline" size={16} color={Colors.white} />
            </Pressable>
          </View>

          <Text style={styles.eyebrow}>Driver tools</Text>
          <Text style={styles.title}>Long-distance availability</Text>
          <Text style={styles.subtitle}>Publish your next intercity route so riders can discover and book seats from the website.</Text>

          <View style={styles.statusCard}>
            <View style={styles.statusHeader}>
              <View>
                <Text style={styles.statusLabel}>Chauffeur status</Text>
                <Text style={styles.statusValue}>{chauffeur?.isApproved ? "Approved and ready" : "Approval required"}</Text>
              </View>
              <View style={[styles.statusBadge, chauffeur?.isApproved ? styles.statusBadgeLive : styles.statusBadgePending]}>
                <Text style={styles.statusBadgeText}>{chauffeur?.isApproved ? "LIVE" : "PENDING"}</Text>
              </View>
            </View>
            <Text style={styles.statusCopy}>
              {chauffeur
                ? chauffeur.isApproved
                  ? "You can publish a route, change your trip details, or turn availability off at any time."
                  : "Finish approval first. Once approved, this screen will let you publish route details to long-distance search."
                : "Create and complete your chauffeur profile first. Long-distance availability is only available to active chauffeurs."}
            </Text>
            {chauffeur?.vehicleType || chauffeur?.vehicleModel ? (
              <Text style={styles.vehicleCopy}>Vehicle: {[chauffeur?.vehicleType, chauffeur?.vehicleModel].filter(Boolean).join(" • ")}</Text>
            ) : null}
          </View>

          <View style={styles.toggleRow}>
            <Pressable
              style={[styles.toggleCard, form.available && styles.toggleCardActive]}
              onPress={() => setField("available", true)}
            >
              <Ionicons name="radio-button-on-outline" size={18} color={form.available ? Colors.white : Colors.textSecondary} />
              <View style={styles.toggleTextWrap}>
                <Text style={[styles.toggleTitle, form.available && styles.toggleTitleActive]}>Available for long distance</Text>
                <Text style={styles.toggleCopy}>Show this route to riders searching on your date.</Text>
              </View>
            </Pressable>
            <Pressable
              style={[styles.toggleCard, !form.available && styles.toggleCardActive]}
              onPress={() => setField("available", false)}
            >
              <Ionicons name="remove-circle-outline" size={18} color={!form.available ? Colors.white : Colors.textSecondary} />
              <View style={styles.toggleTextWrap}>
                <Text style={[styles.toggleTitle, !form.available && styles.toggleTitleActive]}>Not available</Text>
                <Text style={styles.toggleCopy}>Hide your route until you are ready to accept seats.</Text>
              </View>
            </Pressable>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>Route details</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Departure city</Text>
              <TextInput
                value={form.from}
                onChangeText={(value) => onRouteFieldChange("from", value)}
                onFocus={() => {
                  setSuggestionField("from");
                  void loadCitySuggestions(form.from);
                }}
                placeholder="Johannesburg"
                placeholderTextColor={Colors.textMuted}
                style={styles.input}
                editable={chauffeur?.isApproved}
              />
              {suggestionField === "from" ? (
                <View style={styles.suggestionCard}>
                  {suggestionsLoading ? (
                    <View style={styles.suggestionLoadingRow}>
                      <ActivityIndicator size="small" color={Colors.white} />
                      <Text style={styles.suggestionHint}>Finding matching cities…</Text>
                    </View>
                  ) : suggestions.length > 0 ? (
                    <FlatList
                      data={suggestions}
                      keyExtractor={(item) => item.placeId}
                      keyboardShouldPersistTaps="handled"
                      renderItem={({ item }) => (
                        <Pressable style={styles.suggestionRow} onPress={() => applySuggestion(item)}>
                          <Ionicons name="location-outline" size={16} color={Colors.textSecondary} />
                          <View style={styles.suggestionTextWrap}>
                            <Text style={styles.suggestionTitle}>{item.mainText}</Text>
                            {!!item.secondaryText && <Text style={styles.suggestionSubtitle}>{item.secondaryText}</Text>}
                          </View>
                        </Pressable>
                      )}
                    />
                  ) : form.from.trim().length >= 2 ? (
                    <Text style={styles.suggestionHint}>No matching cities found yet.</Text>
                  ) : (
                    <Text style={styles.suggestionHint}>Start typing to pick a city suggestion.</Text>
                  )}
                </View>
              ) : null}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Destination</Text>
              <TextInput
                value={form.to}
                onChangeText={(value) => onRouteFieldChange("to", value)}
                onFocus={() => {
                  setSuggestionField("to");
                  void loadCitySuggestions(form.to);
                }}
                placeholder="Durban"
                placeholderTextColor={Colors.textMuted}
                style={styles.input}
                editable={chauffeur?.isApproved}
              />
              {suggestionField === "to" ? (
                <View style={styles.suggestionCard}>
                  {suggestionsLoading ? (
                    <View style={styles.suggestionLoadingRow}>
                      <ActivityIndicator size="small" color={Colors.white} />
                      <Text style={styles.suggestionHint}>Finding matching cities…</Text>
                    </View>
                  ) : suggestions.length > 0 ? (
                    <FlatList
                      data={suggestions}
                      keyExtractor={(item) => item.placeId}
                      keyboardShouldPersistTaps="handled"
                      renderItem={({ item }) => (
                        <Pressable style={styles.suggestionRow} onPress={() => applySuggestion(item)}>
                          <Ionicons name="location-outline" size={16} color={Colors.textSecondary} />
                          <View style={styles.suggestionTextWrap}>
                            <Text style={styles.suggestionTitle}>{item.mainText}</Text>
                            {!!item.secondaryText && <Text style={styles.suggestionSubtitle}>{item.secondaryText}</Text>}
                          </View>
                        </Pressable>
                      )}
                    />
                  ) : form.to.trim().length >= 2 ? (
                    <Text style={styles.suggestionHint}>No matching cities found yet.</Text>
                  ) : (
                    <Text style={styles.suggestionHint}>Start typing to pick a city suggestion.</Text>
                  )}
                </View>
              ) : null}
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, styles.halfWidth]}>
                <Text style={styles.label}>Travel date</Text>
                <Pressable
                  style={[styles.input, styles.datePickerButton]}
                  onPress={() => chauffeur?.isApproved && setDatePickerVisible(true)}
                  disabled={!chauffeur?.isApproved}
                >
                  <Text style={form.date ? styles.datePickerValue : styles.datePickerPlaceholder}>
                    {form.date ? dateOptions.find((option) => option.value === form.date)?.label || form.date : "Choose a future travel date"}
                  </Text>
                  <Ionicons name="calendar-outline" size={18} color={Colors.textSecondary} />
                </Pressable>
              </View>
              <View style={[styles.inputGroup, styles.halfWidth]}>
                <Text style={styles.label}>Price per seat</Text>
                <TextInput
                  value={form.pricePerSeat}
                  onChangeText={(value) => setField("pricePerSeat", value.replace(/[^0-9.]/g, ""))}
                  placeholder="850"
                  placeholderTextColor={Colors.textMuted}
                  style={styles.input}
                  keyboardType="numeric"
                  editable={chauffeur?.isApproved}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Seats available</Text>
              <TextInput
                value={form.seatsAvailable}
                onChangeText={(value) => setField("seatsAvailable", value.replace(/[^0-9]/g, ""))}
                placeholder="3"
                placeholderTextColor={Colors.textMuted}
                style={styles.input}
                keyboardType="number-pad"
                editable={chauffeur?.isApproved}
              />
            </View>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.sectionTitle}>Current summary</Text>
            <Text style={styles.summaryLine}>Status: {form.available ? "Visible in search" : "Hidden from search"}</Text>
            <Text style={styles.summaryLine}>Route: {form.from || "Departure"} to {form.to || "Destination"}</Text>
            <Text style={styles.summaryLine}>Travel date: {form.date || "Not set"}</Text>
            <Text style={styles.summaryLine}>Seats: {form.seatsAvailable || "0"}</Text>
            <Text style={styles.summaryLine}>Price per seat: {form.pricePerSeat ? `R${form.pricePerSeat}` : "Not set"}</Text>
            {lastUpdatedLabel ? <Text style={styles.updatedLine}>Last saved: {lastUpdatedLabel}</Text> : null}
          </View>

          <Pressable
            style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
            onPress={saveAvailability}
            disabled={!canSave}
          >
            {saving ? (
              <ActivityIndicator color={Colors.primary} />
            ) : (
              <>
                <Ionicons name={form.available ? "rocket-outline" : "pause-circle-outline"} size={18} color={Colors.primary} />
                <Text style={styles.saveButtonText}>{form.available ? "Publish long-distance route" : "Save as unavailable"}</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={datePickerVisible} transparent animationType="slide" onRequestClose={() => setDatePickerVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 20 }] }>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choose travel date</Text>
              <Pressable onPress={() => setDatePickerVisible(false)} style={styles.modalCloseButton}>
                <Ionicons name="close" size={18} color={Colors.white} />
              </Pressable>
            </View>
            <Text style={styles.modalSubtitle}>Only future dates are available for long-distance routes.</Text>
            <FlatList
              data={dateOptions}
              keyExtractor={(item) => item.value}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const selected = item.value === form.date;
                return (
                  <Pressable
                    style={[styles.dateOptionRow, selected && styles.dateOptionRowActive]}
                    onPress={() => selectTravelDate(item.value)}
                  >
                    <View style={styles.dateOptionTextWrap}>
                      <Text style={[styles.dateOptionTitle, selected && styles.dateOptionTitleActive]}>{item.label}</Text>
                      <Text style={styles.dateOptionValue}>{item.value}</Text>
                    </View>
                    {selected ? <Ionicons name="checkmark-circle" size={18} color={Colors.white} /> : null}
                  </Pressable>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
  },
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    gap: 18,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  backText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: "600",
  },
  refreshButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  eyebrow: {
    color: Colors.warning,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  title: {
    color: Colors.white,
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 15,
    lineHeight: 23,
  },
  statusCard: {
    borderRadius: 22,
    padding: 18,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  statusHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusLabel: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  statusValue: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: "700",
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusBadgeLive: {
    backgroundColor: "rgba(76, 175, 80, 0.18)",
  },
  statusBadgePending: {
    backgroundColor: "rgba(255, 183, 77, 0.18)",
  },
  statusBadgeText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
  },
  statusCopy: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  vehicleCopy: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: "600",
  },
  toggleRow: {
    gap: 12,
  },
  toggleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 18,
    padding: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  toggleCardActive: {
    borderColor: Colors.white,
    backgroundColor: Colors.accent,
  },
  toggleTextWrap: {
    flex: 1,
    gap: 3,
  },
  toggleTitle: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontWeight: "700",
  },
  toggleTitleActive: {
    color: Colors.white,
  },
  toggleCopy: {
    color: Colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  formCard: {
    borderRadius: 22,
    padding: 18,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 14,
  },
  sectionTitle: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: "700",
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  input: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.white,
    fontSize: 15,
  },
  datePickerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  datePickerValue: {
    color: Colors.white,
    fontSize: 15,
    flex: 1,
    paddingRight: 12,
  },
  datePickerPlaceholder: {
    color: Colors.textMuted,
    fontSize: 15,
    flex: 1,
    paddingRight: 12,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  halfWidth: {
    flex: 1,
  },
  suggestionCard: {
    borderRadius: 16,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  suggestionLoadingRow: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    alignItems: "center",
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  suggestionTextWrap: {
    flex: 1,
    gap: 2,
  },
  suggestionTitle: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: "600",
  },
  suggestionSubtitle: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
  suggestionHint: {
    color: Colors.textSecondary,
    fontSize: 13,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  summaryCard: {
    borderRadius: 22,
    padding: 18,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  summaryLine: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  updatedLine: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  saveButton: {
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: Colors.white,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    ...whiteButtonHiddenStyle,
  },
  saveButtonDisabled: {
    opacity: 0.45,
  },
  saveButtonText: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: "800",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  modalSheet: {
    maxHeight: "72%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitle: {
    color: Colors.white,
    fontSize: 20,
    fontWeight: "800",
  },
  modalSubtitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 6,
  },
  modalCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dateOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  dateOptionRowActive: {
    backgroundColor: Colors.accent,
    marginHorizontal: -8,
    paddingHorizontal: 8,
    borderRadius: 14,
    borderTopColor: "transparent",
  },
  dateOptionTextWrap: {
    flex: 1,
    gap: 2,
  },
  dateOptionTitle: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: "700",
  },
  dateOptionTitleActive: {
    color: Colors.white,
  },
  dateOptionValue: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
});