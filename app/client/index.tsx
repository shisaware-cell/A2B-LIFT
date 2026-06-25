import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  Platform,
  Modal,
  FlatList,
  Alert,
  Linking,
  ScrollView,
  Image,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Constants from "expo-constants";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/lib/auth-context";
import { ensureGoogleMapsWebPlaces } from "@/lib/google-maps-web";
import { apiRequest, isUnauthorizedError, queryClient } from "@/lib/query-client";
import {
  getBestAvailablePosition,
  isRecentLocation,
  toLatLng,
  watchBestPosition,
} from "@/lib/location-utils";
import { useSocket } from "@/lib/socket-context";
import { uploadDocument } from "@/lib/supabase-storage";
import Colors from "@/constants/colors";
import A2BMap from "@/components/A2BMap";
import LivenessCamera, { type LivenessChallenge, type LivenessCaptureResult } from "@/components/LivenessCamera";

const VEHICLE_TYPES = [
  { id: "luxury_van", name: "V-Class", desc: "Mercedes-Benz V-Class", icon: "car" as const, pricePerKm: 35, baseFare: 200, badge: "most popular" },
  { id: "luxury", name: "Luxury", desc: "BMW 3 Series, Mercedes C Class", icon: "car-sport" as const, pricePerKm: 13, baseFare: 100 },
  { id: "business", name: "Business Class", desc: "BMW 5 Series, Mercedes E Class", icon: "briefcase" as const, pricePerKm: 35, baseFare: 150 },
  { id: "van", name: "Van", desc: "Hyundai H1, Mercedes Vito, Staria", icon: "bus" as const, pricePerKm: 13, baseFare: 120 },
  { id: "budget", name: "Budget", desc: "Toyota Corolla, Toyota Quest", icon: "car-outline" as const, pricePerKm: 7, baseFare: 50 },
];

type RideStatus = "idle" | "selecting" | "confirming" | "requested" | "assigned" | "arriving" | "in_trip" | "completed" | "no_drivers";

type NearbyDriverState = { id: string; lat: number; lng: number };

interface ChauffeurDetails {
  id?: string;
  driverName: string;
  driverPhone: string | null;
  driverRating: number | null;
  totalRatings?: number;
  vehicleModel: string;
  plateNumber: string;
  carColor: string;
  carMake: string | null;
  vehicleType: string;
  profilePhoto: string | null;
}

interface DriverReview {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  reviewerName: string;
}

interface DriverProfile {
  id: string;
  driverName: string;
  driverRating: number | null;
  totalRatings: number;
  completedTrips: number;
  distribution: Record<number, number>;
  profilePhoto: string | null;
  carMake: string | null;
  vehicleModel: string;
  carColor: string;
  plateNumber: string;
  vehicleCategory: string;
  ratings: DriverReview[];
}

interface DirectionStep {
  instruction: string;
  distance: string;
  duration?: string;
  endLat?: number;
  endLng?: number;
  maneuver?: string;
}

interface DirectionRoute {
  polyline: string;
  distanceKm: number;
  distanceText: string;
  durationMin: number;
  durationText: string;
  summary?: string;
  steps?: DirectionStep[];
}

type RouteChoiceId = "gps_preferred" | "faster_route" | "safest_route";

interface RouteChoice extends DirectionRoute {
  id: RouteChoiceId;
  title: string;
  subtitle: string;
  badge: string;
  icon: keyof typeof Ionicons.glyphMap;
  fare: number;
  baseFare: number;
  pricePerKm: number;
  lateNightPremium: number;
  demandMultiplier: number;
  currency: string;
}

interface AutocompleteDebugEntry {
  id: string;
  createdAt: string;
  stage: string;
  payload: Record<string, unknown>;
}

const MAX_AUTOCOMPLETE_DEBUG_ENTRIES = 80;
let autocompleteDebugEntries: AutocompleteDebugEntry[] = [];
const autocompleteDebugSubscribers = new Set<(entries: AutocompleteDebugEntry[]) => void>();

function getRoutePreferenceLabel(routeId?: string | null): string {
  if (routeId === "faster_route") return "Faster Route";
  if (routeId === "safest_route") return "Safer Route";
  return "Balanced Route";
}

function getPaymentMethodLabel(method?: string | null): string {
  if (method === "card") return "Card";
  if (method === "wallet") return "Wallet";
  return "Cash";
}

function calculateRouteSafetyScore(route: DirectionRoute): number {
  const stepsCount = Array.isArray(route.steps) ? route.steps.length : 0;
  const averageSpeed = route.durationMin > 0 ? route.distanceKm / (route.durationMin / 60) : route.distanceKm;
  const highwayPenalty = /\b(M|N)\d+\b|highway|freeway|motorway/i.test(route.summary || "") ? 5 : 0;
  return stepsCount + averageSpeed * 1.4 + highwayPenalty;
}

function dedupeDirectionRoutes(routes: DirectionRoute[]): DirectionRoute[] {
  const seen = new Set<string>();
  const unique: DirectionRoute[] = [];
  for (const route of routes) {
    if (!route?.polyline || seen.has(route.polyline)) continue;
    seen.add(route.polyline);
    unique.push(route);
  }
  return unique;
}

function buildRouteChoiceDescriptors(routes: DirectionRoute[]) {
  const uniqueRoutes = dedupeDirectionRoutes(routes);
  const fastestRoute = [...uniqueRoutes].sort((a, b) => a.durationMin - b.durationMin || a.distanceKm - b.distanceKm)[0];
  if (!fastestRoute) return [];

  const selected: Array<{ id: RouteChoiceId; route: DirectionRoute; title: string; subtitle: string; badge: string; icon: keyof typeof Ionicons.glyphMap }> = [
    {
      id: "faster_route",
      route: fastestRoute,
      title: "Faster Route",
      subtitle: "Quickest arrival time",
      badge: "Recommended",
      icon: "flash-outline",
    },
  ];

  const balancedRoute = uniqueRoutes.find((route) => route.polyline !== fastestRoute.polyline);

  if (balancedRoute) {
    selected.push({
      id: "gps_preferred",
      route: balancedRoute,
      title: "Balanced Route",
      subtitle: "A well-rounded option from maps",
      badge: "Balanced",
      icon: "navigate-circle-outline",
    });
  }

  const usedPolylines = new Set(selected.map((item) => item.route.polyline));
  const safestRoute = [...uniqueRoutes]
    .filter((route) => !usedPolylines.has(route.polyline))
    .sort((a, b) => calculateRouteSafetyScore(a) - calculateRouteSafetyScore(b) || a.durationMin - b.durationMin)[0];

  if (safestRoute) {
    selected.push({
      id: "safest_route",
      route: safestRoute,
      title: "Safer Route",
      subtitle: "Simpler drive with fewer turns",
      badge: "Calmer",
      icon: "shield-checkmark-outline",
    });
  }

  return selected;
}

function calculateFallbackEstimate(distanceKm: number, vehicle: { baseFare: number; pricePerKm: number }, isLateNight: boolean) {
  const baseFare = Math.round(vehicle.baseFare);
  const distanceFare = Math.round(distanceKm * vehicle.pricePerKm);
  let totalPrice = baseFare + distanceFare;
  let lateNightPremium = 0;
  if (isLateNight) {
    lateNightPremium = Math.round(totalPrice * 0.3);
    totalPrice += lateNightPremium;
  }
  return {
    totalPrice,
    baseFare,
    pricePerKm: vehicle.pricePerKm,
    lateNightPremium,
    currency: "ZAR",
  };
}

function isLateNightWindow() {
  const hour = new Date().getHours();
  return hour >= 22 || hour < 5;
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function encodePolyline(points: Array<{ lat: number; lng: number }>): string {
  let previousLat = 0;
  let previousLng = 0;

  function encodeValue(value: number): string {
    let current = value < 0 ? ~(value << 1) : value << 1;
    let encoded = "";

    while (current >= 0x20) {
      encoded += String.fromCharCode((0x20 | (current & 0x1f)) + 63);
      current >>= 5;
    }

    encoded += String.fromCharCode(current + 63);
    return encoded;
  }

  return points.map((point) => {
    const latitude = Math.round(point.lat * 1e5);
    const longitude = Math.round(point.lng * 1e5);
    const encoded = `${encodeValue(latitude - previousLat)}${encodeValue(longitude - previousLng)}`;
    previousLat = latitude;
    previousLng = longitude;
    return encoded;
  }).join("");
}

function buildApproximateRouteChoice(
  origin: { lat: number; lng: number },
  dest: { lat: number; lng: number },
  vehicle: { baseFare: number; pricePerKm: number },
  isLateNight: boolean,
): RouteChoice {
  const straightLineDistanceKm = haversineDistance(origin.lat, origin.lng, dest.lat, dest.lng);
  const estimatedRoadDistanceKm = Math.max(Number((straightLineDistanceKm * 1.22).toFixed(1)), 2);
  const estimatedDurationMin = Math.max(5, Math.round((estimatedRoadDistanceKm / 48) * 60));
  const estimate = calculateFallbackEstimate(estimatedRoadDistanceKm, vehicle, isLateNight);

  return {
    id: "gps_preferred",
    title: "Estimated Route",
    subtitle: "Approximate fare based on destination distance",
    badge: "Approximate",
    icon: "navigate-circle-outline",
    polyline: encodePolyline([origin, dest]),
    distanceKm: estimatedRoadDistanceKm,
    distanceText: `${estimatedRoadDistanceKm.toFixed(1)} km`,
    durationMin: estimatedDurationMin,
    durationText: `${estimatedDurationMin} min`,
    summary: "Approximate route",
    steps: [],
    fare: estimate.totalPrice,
    baseFare: estimate.baseFare,
    pricePerKm: estimate.pricePerKm,
    lateNightPremium: estimate.lateNightPremium,
    currency: estimate.currency,
  };
}

const CURRENT_LOCATION_LABEL = "Current Location";
const SIGNIFICANT_LOCATION_SHIFT_KM = 0.03;
const DRIVER_MARKER_SHIFT_KM = 0.01;
const AUTOCOMPLETE_DEBOUNCE_MS = 220;
const ADDRESS_TERM_NORMALIZATIONS: Array<[RegExp, string]> = [
  [/\bpretoriou+s\b/gi, "Pretorius"],
  [/\bpretorious\b/gi, "Pretorius"],
  [/\bpretoriaus\b/gi, "Pretorius"],
  [/\bst\.?\b/gi, "Street"],
  [/\bave\.?\b/gi, "Avenue"],
  [/\brd\.?\b/gi, "Road"],
  [/\bdr\.?\b/gi, "Drive"],
  [/\bln\.?\b/gi, "Lane"],
  [/\bcl\.?\b/gi, "Close"],
  [/\bblvd\.?\b/gi, "Boulevard"],
  [/\bcres\.?\b/gi, "Crescent"],
];
const NON_DISTINCT_ADDRESS_TOKENS = new Set([
  "south",
  "africa",
  "street",
  "avenue",
  "road",
  "drive",
  "lane",
  "close",
  "boulevard",
  "crescent",
  "city",
  "town",
]);

const SOUTH_AFRICA_BOUNDS = {
  minLat: -35,
  maxLat: -22,
  minLng: 16,
  maxLng: 33,
};

function isWithinSouthAfricaBounds(lat: number, lng: number) {
  return (
    lat >= SOUTH_AFRICA_BOUNDS.minLat &&
    lat <= SOUTH_AFRICA_BOUNDS.maxLat &&
    lng >= SOUTH_AFRICA_BOUNDS.minLng &&
    lng <= SOUTH_AFRICA_BOUNDS.maxLng
  );
}

function createPlacesSessionToken() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function summarizeAutocompletePredictions(
  predictions: { mainText: string; secondaryText: string; lat: number | null; lng: number | null }[],
) {
  return predictions.slice(0, 3).map((prediction) => ({
    mainText: prediction.mainText,
    secondaryText: prediction.secondaryText,
    hasCoords: prediction.lat != null && prediction.lng != null,
  }));
}

function publishAutocompleteDebugEntries() {
  for (const subscriber of autocompleteDebugSubscribers) {
    subscriber(autocompleteDebugEntries);
  }
}

function clearAutocompleteDebugEntries() {
  autocompleteDebugEntries = [];
  publishAutocompleteDebugEntries();
}

function subscribeAutocompleteDebugEntries(subscriber: (entries: AutocompleteDebugEntry[]) => void) {
  autocompleteDebugSubscribers.add(subscriber);
  subscriber(autocompleteDebugEntries);

  return () => {
    autocompleteDebugSubscribers.delete(subscriber);
  };
}

function logAutocompleteDebug(stage: string, payload: Record<string, unknown>) {
  if (!__DEV__) return;

  autocompleteDebugEntries = [
    {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      stage,
      payload,
    },
    ...autocompleteDebugEntries,
  ].slice(0, MAX_AUTOCOMPLETE_DEBUG_ENTRIES);
  publishAutocompleteDebugEntries();

  try {
    console.log(`[client-autocomplete:${stage}] ${JSON.stringify(payload)}`);
  } catch {
    console.log(`[client-autocomplete:${stage}]`, payload);
  }
}

function hasLocationShift(
  previous: { lat: number; lng: number } | null | undefined,
  next: { lat: number; lng: number } | null | undefined,
  minimumDistanceKm = SIGNIFICANT_LOCATION_SHIFT_KM,
) {
  if (!previous || !next) return true;
  return haversineDistance(previous.lat, previous.lng, next.lat, next.lng) >= minimumDistanceKm;
}

function formatNativeReverseGeocode(address?: Location.LocationGeocodedAddress | null) {
  if (!address) return null;

  const streetLine = [address.streetNumber, address.street].filter(Boolean).join(" ").trim();
  const localityLine = [
    address.district,
    address.subregion,
    address.city,
    address.region,
  ]
    .filter(Boolean)
    .join(", ")
    .trim();

  return [streetLine, localityLine].filter(Boolean).join(", ") || null;
}

async function buildNativeLocationSuggestions(query: string) {
  try {
    const results = await Location.geocodeAsync(`${query}, South Africa`);
    const uniqueResults = results.filter((result, index, all) => {
      return all.findIndex((candidate) =>
        Math.abs(candidate.latitude - result.latitude) < 0.0001 &&
        Math.abs(candidate.longitude - result.longitude) < 0.0001,
      ) === index;
    }).filter((result) => isWithinSouthAfricaBounds(result.latitude, result.longitude)).slice(0, 5);

    const suggestions = await Promise.all(
      uniqueResults.map(async (result, index) => {
        let description = query.trim();
        let secondaryText = "Current area";

        try {
          const reverseResults = await Location.reverseGeocodeAsync({
            latitude: result.latitude,
            longitude: result.longitude,
          });
          const formatted = formatNativeReverseGeocode(reverseResults[0]);
          if (formatted) {
            description = formatted;
            secondaryText = formatted.split(",").slice(1).join(", ").trim() || secondaryText;
          }
        } catch {}

        return {
          placeId: `native:${result.latitude}:${result.longitude}:${index}`,
          description,
          mainText: description.split(",")[0] || query.trim(),
          secondaryText,
          lat: result.latitude,
          lng: result.longitude,
        };
      }),
    );

    return suggestions.filter((suggestion, index, all) => {
      return all.findIndex((candidate) => candidate.description === suggestion.description) === index;
    });
  } catch {
    return [];
  }
}

async function fetchWebGoogleAutocompletePredictions(
  query: string,
  biasCoords?: { lat: number; lng: number } | null,
) {
  const google = await ensureGoogleMapsWebPlaces();
  if (!google?.maps?.places) return [];

  const service = new google.maps.places.AutocompleteService();
  const request: any = {
    input: query,
    componentRestrictions: { country: "za" },
    language: "en",
    offset: Array.from(query).length,
    region: "za",
  };

  if (biasCoords) {
    request.location = new google.maps.LatLng(biasCoords.lat, biasCoords.lng);
    request.radius = /^\d/.test(query.trim()) ? 120000 : 90000;
  }

  return await new Promise<{ placeId: string; description: string; mainText: string; secondaryText: string; lat: number | null; lng: number | null }[]>((resolve, reject) => {
    service.getPlacePredictions(request, (predictions: any[] | null, status: any) => {
      if (
        status &&
        status !== google.maps.places.PlacesServiceStatus.OK &&
        status !== google.maps.places.PlacesServiceStatus.ZERO_RESULTS
      ) {
        reject(new Error(String(status)));
        return;
      }

      resolve((predictions || []).map((prediction: any) => ({
        placeId: prediction.place_id,
        description: prediction.description,
        mainText: prediction.structured_formatting?.main_text || prediction.description?.split(",")[0] || query.trim(),
        secondaryText: prediction.structured_formatting?.secondary_text || "",
        lat: null,
        lng: null,
      })));
    });
  });
}

async function fetchWebGooglePlaceDetails(placeId: string) {
  const google = await ensureGoogleMapsWebPlaces();
  if (!google?.maps?.places) return null;

  const service = new google.maps.places.PlacesService(document.createElement("div"));
  return await new Promise<{
    lat: number;
    lng: number;
    description: string | null;
    mainText: string | null;
    secondaryText: string | null;
  } | null>((resolve, reject) => {
    service.getDetails(
      {
        placeId,
        fields: ["formatted_address", "geometry", "name"],
      },
      (result: any, status: any) => {
        if (status !== google.maps.places.PlacesServiceStatus.OK || !result?.geometry?.location) {
          if (
            status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS ||
            status === google.maps.places.PlacesServiceStatus.NOT_FOUND
          ) {
            resolve(null);
            return;
          }

          reject(new Error(String(status)));
          return;
        }

        const lat = result.geometry.location.lat();
        const lng = result.geometry.location.lng();
        const description = typeof result.formatted_address === "string" ? result.formatted_address : null;
        resolve({
          lat,
          lng,
          description,
          mainText: result.name || description?.split(",")[0] || null,
          secondaryText: description?.split(",").slice(1).join(", ").trim() || null,
        });
      },
    );
  });
}

function normalizeAddressSearchQuery(value: string) {
  return ADDRESS_TERM_NORMALIZATIONS.reduce(
    (normalized, [pattern, replacement]) => normalized.replace(pattern, replacement),
    value.trim(),
  ).replace(/\s+/g, " ");
}

function extractMeaningfulAddressTokens(value: string) {
  const normalized = normalizeAddressSearchQuery(value).toLowerCase();
  const minimumLength = /^\d+\s+/.test(normalized) ? 2 : 3;
  return normalizeAddressSearchQuery(value)
    .toLowerCase()
    .match(new RegExp(`[a-z]{${minimumLength},}`, "g"))?.filter((token) => !NON_DISTINCT_ADDRESS_TOKENS.has(token)) || [];
}

function getLeadingAddressNumber(value: string) {
  return normalizeAddressSearchQuery(value).match(/^\d+\b/)?.[0] || "";
}

function getSuggestionPrimaryLine(prediction: { description: string; mainText: string }) {
  const mainText = normalizeAddressSearchQuery(prediction.mainText || "");
  const descriptionPrimary = normalizeAddressSearchQuery(prediction.description.split(",")[0] || "");
  return getLeadingAddressNumber(mainText) ? mainText : descriptionPrimary || mainText;
}

function hasBadPrimaryAddressNumber(
  query: string,
  prediction: { description: string; mainText: string },
) {
  const expectedNumber = getLeadingAddressNumber(query);
  if (!expectedNumber) return false;

  const primaryLine = getSuggestionPrimaryLine(prediction);
  const primaryNumber = getLeadingAddressNumber(primaryLine);
  return /^\d+\s+\d+\b/.test(primaryLine) || Boolean(primaryNumber && primaryNumber !== expectedNumber);
}

function scoreAddressPrediction(
  query: string,
  prediction: { description: string; mainText: string; secondaryText: string; lat: number | null; lng: number | null },
) {
  const normalizedQuery = normalizeAddressSearchQuery(query).toLowerCase();
  const normalizedHaystack = normalizeAddressSearchQuery(
    `${prediction.description} ${prediction.mainText} ${prediction.secondaryText}`,
  ).toLowerCase();
  const leadingNumber = normalizedQuery.match(/^\d+/)?.[0] || "";
  const significantTokens = extractMeaningfulAddressTokens(normalizedQuery);
  let score = 0;

  if (normalizedHaystack.startsWith(normalizedQuery)) score += 80;
  if (normalizedHaystack.includes(normalizedQuery)) score += 40;
  if (leadingNumber && new RegExp(`(^|\\D)${leadingNumber}(\\D|$)`).test(normalizedHaystack)) score += 25;
  if (/\b(ward|municipality|district municipality|administrative area)\b/.test(normalizedHaystack)) score -= 45;

  for (const token of significantTokens) {
    if (new RegExp(`\\b${token}\\b`).test(normalizedHaystack)) {
      score += 12;
    } else if (normalizedHaystack.includes(token)) {
      score += 5;
    } else {
      score -= 10;
    }
  }

  return score;
}

function scoreResolvedAddress(description?: string | null) {
  if (!description) return -1;

  const normalized = normalizeAddressSearchQuery(description).toLowerCase();
  let score = Math.min(normalized.length, 120) / 4;

  if (/^\d+\s+/.test(normalized)) score += 40;
  if (/\b(street|avenue|road|drive|lane|close|boulevard|crescent)\b/.test(normalized)) score += 20;
  if (normalized.split(",")[0]?.trim().split(/\s+/).length >= 2) score += 10;

  return score;
}

function buildResolvedAddressLabel(result?: {
  description?: string | null;
  mainText?: string | null;
  secondaryText?: string | null;
}) {
  if (!result) return null;

  const rawDescription = result.description?.trim() || null;
  const composedDescription = [result.mainText?.trim(), result.secondaryText?.trim()]
    .filter(Boolean)
    .join(", ") || null;

  if (!rawDescription) return composedDescription;
  if (!composedDescription) return rawDescription;

  const rawLooksAdministrative = /\b(ward|municipality|district municipality|administrative area)\b/i.test(rawDescription);
  if (rawLooksAdministrative && scoreResolvedAddress(composedDescription) >= 0) {
    return composedDescription;
  }

  return scoreResolvedAddress(composedDescription) > scoreResolvedAddress(rawDescription)
    ? composedDescription
    : rawDescription;
}

function shouldDeferAddressAutocomplete(query: string) {
  void query;
  return false;
}

function shouldOfferTypedAddressSuggestion(query: string) {
  const normalized = normalizeAddressSearchQuery(query).toLowerCase();
  const significantTokens = extractMeaningfulAddressTokens(normalized);
  const startsWithNumber = /^\d+\s+/.test(normalized);
  const longestTokenLength = significantTokens.reduce((longest, token) => Math.max(longest, token.length), 0);

  if (startsWithNumber && longestTokenLength >= 3) return true;
  return significantTokens.length >= 2 && normalized.length >= 8;
}

function buildTypedAddressSuggestion(query: string) {
  const trimmed = query.trim();
  return {
    placeId: `manual:${encodeURIComponent(trimmed)}`,
    description: trimmed,
    mainText: trimmed,
    secondaryText: "Use typed address",
    lat: null,
    lng: null,
  };
}

function prependTypedAddressSuggestion(
  query: string,
  predictions: { placeId: string; description: string; mainText: string; secondaryText: string; lat: number | null; lng: number | null }[],
) {
  if (!shouldOfferTypedAddressSuggestion(query)) return predictions;

  const typedSuggestion = buildTypedAddressSuggestion(query);
  const alreadyIncluded = predictions.some((prediction) =>
    normalizeAddressSearchQuery(prediction.description).toLowerCase() ===
    normalizeAddressSearchQuery(typedSuggestion.description).toLowerCase(),
  );

  if (alreadyIncluded) return predictions;
  return predictions.length > 0 ? [...predictions, typedSuggestion] : [typedSuggestion];
}

function dedupeLocationSuggestions(
  predictions: { placeId: string; description: string; mainText: string; secondaryText: string; lat: number | null; lng: number | null }[],
) {
  const seen = new Set<string>();

  return predictions.filter((prediction) => {
    const normalizedDescription = normalizeAddressSearchQuery(prediction.description).toLowerCase();
    const normalizedMain = normalizeAddressSearchQuery(prediction.mainText).toLowerCase();
    const normalizedSecondary = normalizeAddressSearchQuery(prediction.secondaryText).toLowerCase();
    const keys = [
      normalizedDescription,
      `${normalizedMain}|${normalizedSecondary}`,
      prediction.placeId,
    ].filter(Boolean);

    if (keys.some((key) => seen.has(key))) {
      return false;
    }

    keys.forEach((key) => seen.add(key));
    return true;
  });
}

function buildRenderedLocationSuggestions(
  query: string,
  predictions: { placeId: string; description: string; mainText: string; secondaryText: string; lat: number | null; lng: number | null }[],
) {
  const dedupedPredictions = dedupeLocationSuggestions(predictions);
  if (dedupedPredictions.length > 0) return dedupedPredictions;
  return dedupeLocationSuggestions(prependTypedAddressSuggestion(query, []));
}

function filterAddressPredictions(
  query: string,
  predictions: { description: string; mainText: string; secondaryText: string; lat: number | null; lng: number | null }[],
) {
  const normalized = normalizeAddressSearchQuery(query).toLowerCase();
  const leadingNumber = normalized.match(/^\d+/)?.[0] || "";
  const significantTokens = extractMeaningfulAddressTokens(normalized);
  const startsWithNumber = /^\d+\s+/.test(normalized);

  const rankedPredictions = dedupeLocationSuggestions([...predictions].sort(
    (left, right) => scoreAddressPrediction(query, right) - scoreAddressPrediction(query, left),
  ));

  if (significantTokens.length === 0 && !leadingNumber) return rankedPredictions;

  const minimumTokenMatches = significantTokens.length > 1 ? Math.min(significantTokens.length, 2) : significantTokens.length;

  const filteredPredictions = rankedPredictions.filter((prediction) => {
    const haystack = normalizeAddressSearchQuery(
      `${prediction.description} ${prediction.mainText} ${prediction.secondaryText}`,
    ).toLowerCase();

    if (/\b(ward|municipality|district municipality|administrative area)\b/.test(haystack)) {
      return false;
    }

    if (hasBadPrimaryAddressNumber(query, prediction)) {
      return false;
    }

    if (leadingNumber && !new RegExp(`(^|\\D)${leadingNumber}(\\D|$)`).test(haystack)) {
      return false;
    }

    if (significantTokens.length === 0) {
      return true;
    }

    if (haystack.includes(normalized)) {
      return true;
    }

    const tokenMatches = significantTokens.filter((token) => haystack.includes(token)).length;
    if (startsWithNumber) {
      return tokenMatches === significantTokens.length;
    }

    return tokenMatches >= minimumTokenMatches;
  });

  return filteredPredictions.length > 0
    ? dedupeLocationSuggestions(filteredPredictions)
    : leadingNumber
      ? []
      : rankedPredictions;
}


function mergeNearbyDrivers(current: NearbyDriverState[], incoming: NearbyDriverState[]) {
  const sortedIncoming = [...incoming].sort((left, right) => left.id.localeCompare(right.id));
  const currentById = new Map(current.map((driver) => [driver.id, driver]));

  const next = sortedIncoming.map((driver) => {
    const existing = currentById.get(driver.id);
    if (existing && !hasLocationShift(existing, driver, DRIVER_MARKER_SHIFT_KM)) {
      return existing;
    }
    return driver;
  });

  if (
    current.length === next.length &&
    current.every((driver, index) => driver === next[index])
  ) {
    return current;
  }

  return next;
}

function carColorToHex(color: string): string {
  const map: Record<string, string> = {
    Black: "#000000", White: "#FFFFFF", Silver: "#C0C0C0", Grey: "#808080",
    Gray: "#808080", Navy: "#1B2A4A", Burgundy: "#6B1C2A",
    "Midnight Blue": "#191970", Champagne: "#F7E7CE", Red: "#CC0000",
    Blue: "#1A56A0", Green: "#1A6B3C", Gold: "#C5A028",
  };
  return map[color] || "#888888";
}

export default function ClientHomeScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { user, refreshUser, clearSession } = useAuth();
  const { on, off } = useSocket();
  const bottomPanelOffset = Math.max(12, tabBarHeight - insets.bottom + 12);
  const bottomPanelPadding = insets.bottom + 20;
  const idleBottomSheetPadding = Math.max(insets.bottom + (Platform.OS === "ios" ? 10 : 6), 16);

  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [pickupAddress, setPickupAddress] = useState("Current Location");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [dropoffCoords, setDropoffCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState(VEHICLE_TYPES[0]);
  const [rideStatus, setRideStatus] = useState<RideStatus>("idle");
  const [estimatedPrice, setEstimatedPrice] = useState<number | null>(null);
  const [estimatedDistance, setEstimatedDistance] = useState<number | null>(null);
  const [lateNightPremium, setLateNightPremium] = useState<number>(0);
  const [routeChoices, setRouteChoices] = useState<RouteChoice[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<RouteChoiceId | null>(null);
  const [currentRide, setCurrentRide] = useState<any>(null);
  const [showVehicleSheet, setShowVehicleSheet] = useState(false);
  const [chauffeurDetails, setChauffeurDetails] = useState<ChauffeurDetails | null>(null);
  const [routePolyline, setRoutePolyline] = useState<string | null>(null);
  const [tripDurationText, setTripDurationText] = useState<string | null>(null);
  const [tripDurationMin, setTripDurationMin] = useState<number | null>(null);
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [etaText, setEtaText] = useState<string | null>(null);
  const [showRating, setShowRating] = useState(false);
  const [rating, setRating] = useState<number>(0);
  const [ratingComment, setRatingComment] = useState<string>("");
  const [submittingRating, setSubmittingRating] = useState(false);
  const [onlineDrivers, setOnlineDrivers] = useState<NearbyDriverState[]>([]);
  const [showPaymentPicker, setShowPaymentPicker] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "wallet">("cash");
  const [showCashSelfiePrompt, setShowCashSelfiePrompt] = useState(false);
  const [showCashSelfieCamera, setShowCashSelfieCamera] = useState(false);
  const [cashSelfieSaving, setCashSelfieSaving] = useState(false);
  const [savedCards, setSavedCards] = useState<{ id: string; last4: string; cardType: string; isDefault: boolean }[]>([]);

  // Driver profile modal
  const [showDriverProfile, setShowDriverProfile] = useState(false);
  const [driverProfile, setDriverProfile] = useState<DriverProfile | null>(null);
  const [driverProfileLoading, setDriverProfileLoading] = useState(false);

  // Notification badge
  const [unreadCount, setUnreadCount] = useState(0);

  // Live driver ETA notification state
  const [liveEtaMin, setLiveEtaMin] = useState<number | null>(null);
  const [initialEtaMin, setInitialEtaMin] = useState<number | null>(null);

  // ETA to nearest available driver (shown on map in idle/selecting state)
  const [nearestDriverEta, setNearestDriverEta] = useState<string | null>(null);
  const [showDebugLogModal, setShowDebugLogModal] = useState(false);
  const [debugLogEntries, setDebugLogEntries] = useState<AutocompleteDebugEntry[]>([]);

  // Location picker modal
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);
  const [locationPickerTarget, setLocationPickerTarget] = useState<"pickup" | "dropoff">("dropoff");
  const [locationPickerQuery, setLocationPickerQuery] = useState("");
  const [locationSuggestions, setLocationSuggestions] = useState<{ placeId: string; description: string; mainText: string; secondaryText: string; lat: number | null; lng: number | null }[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const autocompleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autocompleteRequestIdRef = useRef(0);
  const latestAutocompleteQueryRef = useRef("");
  const locationWatchRef = useRef<Location.LocationSubscription | null>(null);
  const pickupFollowsDeviceRef = useRef(true);
  const lastResolvedPickupRef = useRef<{ lat: number; lng: number } | null>(null);
  const placesSessionTokenRef = useRef<string | null>(null);
  const notificationsRef = useRef<any>(null);
  const isExpoGoAndroid = Platform.OS === "android" && Constants.appOwnership === "expo";

  // Keep a ref so socket callbacks always see the latest ride without stale closure
  const currentRideRef = useRef<any>(null);
  const selectedRouteChoice = routeChoices.find((choice) => choice.id === selectedRouteId) || routeChoices[0] || null;

  useEffect(() => {
    if (!__DEV__) return;

    return subscribeAutocompleteDebugEntries(setDebugLogEntries);
  }, []);

  useEffect(() => {
    currentRideRef.current = currentRide;
  }, [currentRide]);

  useEffect(() => {
    requestLocation();
    // Persist mode so app reopens to the correct screen
    AsyncStorage.setItem("a2b_last_mode", "client").catch(() => {});
    return () => {
      locationWatchRef.current?.remove();
      locationWatchRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === "web" || isExpoGoAndroid) return;
    try {
      // Load notifications only where supported to avoid Expo Go Android runtime errors.
      notificationsRef.current = require("expo-notifications");
    } catch {
      notificationsRef.current = null;
    }
  }, [isExpoGoAndroid]);

  useEffect(() => {
    if (!user?.id || Platform.OS === "web" || isExpoGoAndroid) return;
    (async () => {
      try {
        const Notifications = notificationsRef.current;
        if (!Notifications) return;
        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("client-alerts", {
            name: "Client Alerts",
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 200, 200, 200],
            sound: "default",
            lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          });
        }
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== "granted") return;
        const projectId =
          Constants.easConfig?.projectId ||
          Constants.expoConfig?.extra?.eas?.projectId;
        const tokenData = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined,
        );
        if (tokenData?.data) {
          await apiRequest("PUT", `/api/users/${user.id}/push-token`, { pushToken: tokenData.data });
        }
      } catch (error: any) {
        console.log("[push] Client registration:", error?.message || error);
      }
    })();
  }, [user?.id, isExpoGoAndroid]);

  useEffect(() => {
    if (Platform.OS === "web" || isExpoGoAndroid) return;
    const Notifications = notificationsRef.current;
    if (!Notifications) return;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });

    const sub = Notifications.addNotificationResponseReceivedListener((response: any) => {
      const data = response?.notification?.request?.content?.data as any;
      if (data?.type?.startsWith("ride:")) {
        setRideStatus((prev) => (prev === "idle" ? "requested" : prev));
      }
    });

    const receivedSub = Notifications.addNotificationReceivedListener(() => {
      // Bump the badge immediately when a push arrives (foreground)
      setUnreadCount((prev) => prev + 1);
    });

    return () => {
      sub.remove();
      receivedSub.remove();
    };
  }, [isExpoGoAndroid]);

  // Poll unread notification count for badge
  useEffect(() => {
    if (!user?.id) return;
    async function fetchUnread() {
      try {
        const res = await apiRequest("GET", `/api/notifications/user/${user!.id}`);
        const data = await res.json();
        const count = Array.isArray(data) ? data.filter((n: any) => !n.isRead).length : 0;
        setUnreadCount(count);
      } catch {}
    }
    fetchUnread();
    const interval = setInterval(fetchUnread, 20000);
    return () => clearInterval(interval);
  }, [user?.id]);

  // Fetch online drivers periodically to show on map and compute nearest ETA
  useEffect(() => {
    async function fetchOnlineDrivers() {
      try {
        const res = await apiRequest("GET", "/api/chauffeurs");
        const all = await res.json();
        const online = (all as any[])
          .filter(
            (c: any) =>
              c.isOnline &&
              c.isApproved &&
              c.lat &&
              c.lng &&
              isRecentLocation(c.locationUpdatedAt),
          )
          .map((c: any) => ({ id: String(c.id), lat: Number(c.lat), lng: Number(c.lng) }));
        setOnlineDrivers((prev) => mergeNearbyDrivers(prev, online));

      } catch {}
    }
    fetchOnlineDrivers();
    const interval = setInterval(fetchOnlineDrivers, 20000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!location || onlineDrivers.length === 0) {
      setNearestDriverEta(null);
      return;
    }

    let minDist = Infinity;
    for (const driver of onlineDrivers) {
      const dist = haversineDistance(location.lat, location.lng, driver.lat, driver.lng);
      if (dist < minDist) minDist = dist;
    }

    const etaMin = Math.max(1, Math.round((minDist / 30) * 60));
    setNearestDriverEta(etaMin <= 1 ? "< 1 min away" : `~${etaMin} min away`);
  }, [location?.lat, location?.lng, onlineDrivers]);

  useEffect(() => {
    const handleNearbyDriverLocation = (data: any) => {
      if (!data?.chauffeurId || data.lat == null || data.lng == null) return;
      const nextDriver = {
        id: String(data.chauffeurId),
        lat: Number(data.lat),
        lng: Number(data.lng),
      };

      setOnlineDrivers((prev) => {
        const withoutDriver = prev.filter((driver) => driver.id !== nextDriver.id);
        return mergeNearbyDrivers(prev, [...withoutDriver, nextDriver]);
      });
    };

    on("location:update", handleNearbyDriverLocation);
    return () => off("location:update", handleNearbyDriverLocation);
  }, [on, off]);

  // Draw route line as soon as pickup + dropoff are both known
  useEffect(() => {
    if (location && dropoffCoords) {
      fetchRoute(location, dropoffCoords);
    } else {
      setRoutePolyline(null);
    }
  }, [dropoffCoords?.lat, dropoffCoords?.lng]);

  // Cancel ride and show "no drivers" if no driver accepts within 45 seconds
  useEffect(() => {
    if (rideStatus !== "requested") return;
    const timeout = setTimeout(async () => {
      if (currentRideRef.current) {
        try {
          await apiRequest("PUT", `/api/rides/${currentRideRef.current.id}/status`, { status: "cancelled" });
        } catch {}
      }
      setCurrentRide(null);
      setRoutePolyline(null);
      setDriverLocation(null);
      setRideStatus("no_drivers");
      queryClient.invalidateQueries({ queryKey: ["/api/rides/client"] });
    }, 120000);
    return () => clearTimeout(timeout);
  }, [rideStatus]);

  async function fetchChauffeurDetails(chauffeurId: string) {
    try {
      const res = await apiRequest("GET", `/api/chauffeurs/${chauffeurId}/details`);
      const details = await res.json();
      setChauffeurDetails(details);
    } catch {}
  }

  async function openDriverProfile() {
    const chauffeurId = chauffeurDetails?.id;
    if (!chauffeurId) return;
    setDriverProfileLoading(true);
    setShowDriverProfile(true);
    try {
      const res = await apiRequest("GET", `/api/chauffeurs/${chauffeurId}/profile`);
      const data = await res.json();
      setDriverProfile(data);
    } catch {
      Alert.alert("Error", "Could not load driver profile.");
      setShowDriverProfile(false);
    } finally {
      setDriverProfileLoading(false);
    }
  }

  function openLocationPicker(target: "pickup" | "dropoff") {
    const current = target === "pickup" ? pickupAddress : dropoffAddress;
    setLocationPickerTarget(target);
    setLocationPickerQuery(current === CURRENT_LOCATION_LABEL ? "" : current);
    setLocationSuggestions([]);
    placesSessionTokenRef.current = null;
    latestAutocompleteQueryRef.current = "";
    autocompleteRequestIdRef.current += 1;
    setLocationPickerVisible(true);
  }

  function isActiveAutocompleteRequest(requestId: number, query: string) {
    return autocompleteRequestIdRef.current === requestId && latestAutocompleteQueryRef.current === query;
  }

  function applyLocationSuggestions(
    requestId: number,
    query: string,
    target: "pickup" | "dropoff",
    source: string,
    suggestions: { placeId: string; description: string; mainText: string; secondaryText: string; lat: number | null; lng: number | null }[],
  ) {
    if (!isActiveAutocompleteRequest(requestId, query)) {
      logAutocompleteDebug("stale-drop", {
        query,
        target,
        source,
        count: suggestions.length,
        top: summarizeAutocompletePredictions(suggestions),
      });
      return false;
    }

    setLocationSuggestions(suggestions);
    logAutocompleteDebug("render", {
      query,
      target,
      source,
      count: suggestions.length,
      top: summarizeAutocompletePredictions(suggestions),
    });
    return true;
  }

  function onLocationQueryChange(text: string) {
    setLocationPickerQuery(text);
    // Clear previously resolved coords when user edits the query
    if (locationPickerTarget === "dropoff") setDropoffCoords(null);
    if (autocompleteTimerRef.current) clearTimeout(autocompleteTimerRef.current);
    const query = text.trim();
    latestAutocompleteQueryRef.current = query;
    const requestId = ++autocompleteRequestIdRef.current;
    const target = locationPickerTarget;
    if (query.length < 2) {
      if (query.length === 0) {
        placesSessionTokenRef.current = null;
      }
      setLocationSuggestions([]);
      return;
    }
    const sessionToken = placesSessionTokenRef.current || createPlacesSessionToken();
    placesSessionTokenRef.current = sessionToken;
    autocompleteTimerRef.current = setTimeout(async () => {
      if (!isActiveAutocompleteRequest(requestId, query)) return;
      setSuggestionsLoading(true);
      try {
        if (shouldDeferAddressAutocomplete(query)) {
          const deferredSuggestions = buildRenderedLocationSuggestions(query, []);
          logAutocompleteDebug("defer", {
            query,
            target,
            reason: "short-number-fragment",
            suggestionCount: deferredSuggestions.length,
          });
          applyLocationSuggestions(requestId, query, target, "defer", deferredSuggestions);
          return;
        }

        const biasCoords = target === "pickup"
          ? location
          : dropoffCoords || location;

        // Use the Railway backend lookup so Android-restricted native keys are not used for Places REST calls.
        // Fallback: server-side lookup (Google on Railway, then Nominatim).
        const biasQuery = biasCoords
          ? `&lat=${encodeURIComponent(String(biasCoords.lat))}&lng=${encodeURIComponent(String(biasCoords.lng))}`
          : "";
        const res = await apiRequest("GET", `/api/places/autocomplete?input=${encodeURIComponent(query)}&sessionToken=${encodeURIComponent(sessionToken)}${biasQuery}`);
        const data = await res.json();
        const predictions = Array.isArray(data.predictions) ? data.predictions : [];
        const filteredPredictions = filterAddressPredictions(query, predictions);
        const renderedFilteredPredictions = buildRenderedLocationSuggestions(query, filteredPredictions);
        const renderedRawPredictions = buildRenderedLocationSuggestions(query, predictions);
        logAutocompleteDebug("backend", {
          query,
          target,
          rawCount: predictions.length,
          filteredCount: filteredPredictions.length,
          renderedFilteredCount: renderedFilteredPredictions.length,
          renderedRawCount: renderedRawPredictions.length,
          rawTop: summarizeAutocompletePredictions(predictions),
          filteredTop: summarizeAutocompletePredictions(filteredPredictions),
          renderedFilteredTop: summarizeAutocompletePredictions(renderedFilteredPredictions),
          renderedRawTop: summarizeAutocompletePredictions(renderedRawPredictions),
          provider: data.debug || null,
        });
        if (filteredPredictions.length > 0) {
          applyLocationSuggestions(requestId, query, target, "backend-filtered", renderedFilteredPredictions);
          return;
        }

        if (predictions.length > 0) {
          logAutocompleteDebug("backend-no-token-match", {
            query,
            target,
            rawCount: predictions.length,
            rawTop: summarizeAutocompletePredictions(predictions),
          });
        }

        if (Platform.OS === "web") {
          try {
            const webPredictions = await fetchWebGoogleAutocompletePredictions(query, biasCoords);
            const filteredWebPredictions = filterAddressPredictions(query, webPredictions);
            const renderedFilteredWebPredictions = buildRenderedLocationSuggestions(query, filteredWebPredictions);
            const renderedRawWebPredictions = buildRenderedLocationSuggestions(query, webPredictions);
            logAutocompleteDebug("web-google-fallback", {
              query,
              target,
              rawCount: webPredictions.length,
              filteredCount: filteredWebPredictions.length,
              renderedFilteredCount: renderedFilteredWebPredictions.length,
              renderedRawCount: renderedRawWebPredictions.length,
              rawTop: summarizeAutocompletePredictions(webPredictions),
              filteredTop: summarizeAutocompletePredictions(filteredWebPredictions),
              renderedFilteredTop: summarizeAutocompletePredictions(renderedFilteredWebPredictions),
              renderedRawTop: summarizeAutocompletePredictions(renderedRawWebPredictions),
            });

            if (filteredWebPredictions.length > 0) {
              applyLocationSuggestions(requestId, query, target, "web-google-fallback-filtered", renderedFilteredWebPredictions);
              return;
            }

            if (webPredictions.length > 0) {
              logAutocompleteDebug("web-google-fallback-no-token-match", {
                query,
                target,
                rawCount: webPredictions.length,
                rawTop: summarizeAutocompletePredictions(webPredictions),
              });
            }
          } catch (error) {
            logAutocompleteDebug("web-google-fallback-error", {
              query,
              target,
              message: error instanceof Error ? error.message : String(error),
            });
          }
        } else {
          try {
            const nativePredictions = await buildNativeLocationSuggestions(query);
            const filteredNativePredictions = filterAddressPredictions(query, nativePredictions);
            const renderedFilteredNativePredictions = buildRenderedLocationSuggestions(query, filteredNativePredictions);
            const renderedRawNativePredictions = buildRenderedLocationSuggestions(query, nativePredictions);
            logAutocompleteDebug("native-fallback", {
              query,
              target,
              rawCount: nativePredictions.length,
              filteredCount: filteredNativePredictions.length,
              renderedFilteredCount: renderedFilteredNativePredictions.length,
              renderedRawCount: renderedRawNativePredictions.length,
              rawTop: summarizeAutocompletePredictions(nativePredictions),
              filteredTop: summarizeAutocompletePredictions(filteredNativePredictions),
              renderedFilteredTop: summarizeAutocompletePredictions(renderedFilteredNativePredictions),
              renderedRawTop: summarizeAutocompletePredictions(renderedRawNativePredictions),
            });

            if (filteredNativePredictions.length > 0) {
              applyLocationSuggestions(requestId, query, target, "native-fallback-filtered", renderedFilteredNativePredictions);
              return;
            }

            if (nativePredictions.length > 0) {
              logAutocompleteDebug("native-fallback-no-token-match", {
                query,
                target,
                rawCount: nativePredictions.length,
                rawTop: summarizeAutocompletePredictions(nativePredictions),
              });
            }
          } catch (error) {
            logAutocompleteDebug("native-fallback-error", {
              query,
              target,
              message: error instanceof Error ? error.message : String(error),
            });
          }
        }

        logAutocompleteDebug("empty", {
          query,
          target,
        });
        applyLocationSuggestions(requestId, query, target, "empty", buildRenderedLocationSuggestions(query, []));
      } catch (error) {
        logAutocompleteDebug("error", {
          query,
          target,
          message: error instanceof Error ? error.message : String(error),
        });
        applyLocationSuggestions(requestId, query, target, "error", buildRenderedLocationSuggestions(query, []));
      } finally {
        if (isActiveAutocompleteRequest(requestId, query)) {
          setSuggestionsLoading(false);
        }
      }
    }, AUTOCOMPLETE_DEBOUNCE_MS);
  }

  async function selectSuggestion(suggestion: { placeId: string; description: string; mainText: string; secondaryText: string; lat: number | null; lng: number | null }) {
    try {
      setSuggestionsLoading(true);
      const sessionToken = placesSessionTokenRef.current;
      const isManualSuggestion = suggestion.placeId.startsWith("manual:") || suggestion.placeId.startsWith("synthetic:") || suggestion.placeId.startsWith("query:");
      let coords = (suggestion.lat != null && suggestion.lng != null) ? { lat: suggestion.lat, lng: suggestion.lng } : null;
      let resolutionSource = coords ? "suggestion" : "unresolved";
      let resolvedAddress = buildResolvedAddressLabel(suggestion) || suggestion.description;

      if (!coords && !isManualSuggestion) {
        // Resolve Google place ids through the Railway backend instead of direct mobile REST.
        // Fallback: server-side details endpoint
        try {
          const tokenQuery = sessionToken ? `&sessionToken=${encodeURIComponent(sessionToken)}` : "";
          const descriptionQuery = suggestion.description
            ? `&description=${encodeURIComponent(suggestion.description)}`
            : "";
          const res = await apiRequest("GET", `/api/places/details?placeId=${encodeURIComponent(suggestion.placeId)}${tokenQuery}${descriptionQuery}`);
          const data = await res.json();
          if (data.lat && data.lng) {
            coords = { lat: data.lat, lng: data.lng };
            resolutionSource = "details";
            if (data.address) {
              resolvedAddress = data.address;
            }
          }
        } catch {}
      }

      if (!coords && !isManualSuggestion && Platform.OS === "web") {
        try {
          const webPlaceDetails = await fetchWebGooglePlaceDetails(suggestion.placeId);
          if (webPlaceDetails?.lat != null && webPlaceDetails?.lng != null) {
            coords = { lat: webPlaceDetails.lat, lng: webPlaceDetails.lng };
            resolutionSource = "web-details";
            resolvedAddress = buildResolvedAddressLabel({
              description: webPlaceDetails.description,
              mainText: webPlaceDetails.mainText,
              secondaryText: webPlaceDetails.secondaryText,
            }) || resolvedAddress;
          }
        } catch {}
      }

      // Fallback: geocode the description text directly
      if (!coords) {
        try {
          const res = await apiRequest("GET", `/api/geocode?address=${encodeURIComponent(`${suggestion.description}, South Africa`)}`);
          const data = await res.json();
          if (data.lat && data.lng) {
            coords = { lat: data.lat, lng: data.lng };
            resolutionSource = "geocode";
          }
        } catch {}
      }

      // Last resort: expo-location geocoder (native only)
      if (!coords && Platform.OS !== "web") {
        try {
          const results = await Location.geocodeAsync(`${suggestion.description}, South Africa`);
          if (results.length > 0) {
            const best = results.find((result) =>
              isWithinSouthAfricaBounds(result.latitude, result.longitude),
            );
            if (best) {
              coords = { lat: best.latitude, lng: best.longitude };
              resolutionSource = "native-geocode";
            }
          }
        } catch {}
      }

      logAutocompleteDebug("select", {
        placeId: suggestion.placeId,
        description: suggestion.description,
        isManualSuggestion,
        resolutionSource,
        hasCoords: Boolean(coords),
      });

      if (!coords) {
        Alert.alert("Location not found", "Could not resolve this address. Please try a different search.");
        return;
      }

      const address = resolvedAddress;
      if (locationPickerTarget === "pickup") {
        pickupFollowsDeviceRef.current = false;
        locationWatchRef.current?.remove();
        locationWatchRef.current = null;
        setLocation(coords);
        setPickupAddress(address);
      } else {
        setDropoffCoords(coords);
        setDropoffAddress(address);
      }
      setLocationPickerVisible(false);
      setLocationSuggestions([]);
      placesSessionTokenRef.current = null;
    } catch {
      Alert.alert("Error", "Could not load location details. Try again.");
    } finally {
      setSuggestionsLoading(false);
    }
  }

  async function useCurrentLocationForPickup() {
    setLocationPickerVisible(false);
    setLocationLoading(true);
    pickupFollowsDeviceRef.current = true;
    placesSessionTokenRef.current = null;
    await requestLocation();
  }

  async function resolvePickupAddress(coords: { lat: number; lng: number }, force = false) {
    if (!force && !pickupFollowsDeviceRef.current) return;
    if (!force && !hasLocationShift(lastResolvedPickupRef.current, coords, 0.08)) return;

    let description: string | null = null;
    let nativeDescription: string | null = null;

    try {
      const res = await apiRequest("GET", `/api/places/reverse?lat=${coords.lat}&lng=${coords.lng}`);
      const data = await res.json();
      const resolvedDescription = buildResolvedAddressLabel(data);
      if (resolvedDescription) {
        description = resolvedDescription;
      }
    } catch {}

    if (!description && Platform.OS !== "web") {
      try {
        const results = await Location.reverseGeocodeAsync({
          latitude: coords.lat,
          longitude: coords.lng,
        });
        nativeDescription = formatNativeReverseGeocode(results[0]);
      } catch {}
    }

    if (scoreResolvedAddress(nativeDescription) > scoreResolvedAddress(description)) {
      description = nativeDescription;
    }

    if (!force && !pickupFollowsDeviceRef.current) return;

    if (description) {
      lastResolvedPickupRef.current = coords;
      setPickupAddress(description);
      return;
    }

    if (force || pickupAddress === CURRENT_LOCATION_LABEL) {
      setPickupAddress(CURRENT_LOCATION_LABEL);
    }
  }

  async function startLocationWatch() {
    if (Platform.OS === "web" || locationWatchRef.current) return;
    try {
      locationWatchRef.current = await watchBestPosition((position) => {
        if (!pickupFollowsDeviceRef.current) return;
        const nextLocation = toLatLng(position);
        setLocation((current) => {
          if (!hasLocationShift(current, nextLocation)) {
            return current;
          }
          return nextLocation;
        });
      });
    } catch {}
  }

  // Apply a ride status update received from socket or polling
  const applyRideUpdate = useCallback((ride: any) => {
    if (ride.status === "cancelled") {
      // Driver or server cancelled — reset client UI and notify
      setCurrentRide(null);
      setRideStatus("idle");
      setRoutePolyline(null);
      setDriverLocation(null);
      setEtaText(null);
      setLiveEtaMin(null);
      setInitialEtaMin(null);
      setChauffeurDetails(null);
      Alert.alert(
        "Ride Cancelled",
        "Your ride has been cancelled by the driver. Please request a new ride.",
        [{ text: "OK" }]
      );
      return;
    }
    setCurrentRide(ride);
    if (ride.status === "chauffeur_assigned") {
      setRideStatus("assigned");
      setLiveEtaMin(null);
      setInitialEtaMin(null);
      if (ride.chauffeurId) {
        fetchChauffeurDetails(ride.chauffeurId);
        // Fetch driver's current location to show route from driver → pickup
        apiRequest("GET", `/api/chauffeurs/${ride.chauffeurId}`).then(r => r.json()).then((c: any) => {
          if (c.lat && c.lng && ride.pickupLat && ride.pickupLng) {
            const driverLoc = { lat: c.lat, lng: c.lng };
            setDriverLocation(driverLoc);
            fetchRoute(driverLoc, { lat: ride.pickupLat, lng: ride.pickupLng });
            // Set initial ETA from haversine distance (will be refined by route API)
            const dist = haversineDistance(c.lat, c.lng, parseFloat(ride.pickupLat), parseFloat(ride.pickupLng));
            const eta = Math.max(1, Math.round((dist / 30) * 60));
            setInitialEtaMin(eta);
            setLiveEtaMin(eta);
          }
        }).catch(() => {});
      }
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (ride.status === "chauffeur_arriving" || ride.status === "chauffeur_arrived") {
      setRideStatus("arriving");
    } else if (ride.status === "trip_started") {
      setRideStatus("in_trip");
      // Switch route to driver → dropoff
      if (ride.dropoffLat && ride.dropoffLng) {
        setDriverLocation((prev) => {
          if (prev) fetchRoute(prev, { lat: ride.dropoffLat, lng: ride.dropoffLng });
          return prev;
        });
      }
    } else if (ride.status === "trip_completed") {
      setRideStatus("completed");
      setTimeout(() => setShowRating(true), 1000);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/rides/client"] });
    }
  }, []);

  useEffect(() => {
    // Use ref so the callback always sees the latest ride id without re-registering
    const handleStatusUpdate = (ride: any) => {
      const active = currentRideRef.current;
      if (active && ride.id === active.id) {
        applyRideUpdate(ride);
      }
    };

    on("ride:statusUpdate", handleStatusUpdate);
    on("ride:accepted", handleStatusUpdate);

    return () => {
      off("ride:statusUpdate", handleStatusUpdate);
      off("ride:accepted", handleStatusUpdate);
    };
  }, []); // register once — uses ref internally

  // Polling fallback: while searching, poll every 2s in case socket event is missed
  useEffect(() => {
    if (rideStatus !== "requested" || !currentRide?.id) return;

    const pollId = setInterval(async () => {
      try {
        const res = await apiRequest("GET", `/api/rides/${currentRideRef.current?.id}`);
        const ride = await res.json();
        if (ride.status && ride.status !== "searching" && ride.status !== "requested") {
          applyRideUpdate(ride);
        }
      } catch {}
    }, 2000);

    return () => clearInterval(pollId);
  }, [rideStatus, currentRide?.id]);

  // Polling fallback: while ride is active, poll every 5s to catch driver cancellations
  // that may have been missed by the socket (network blip, reconnect, etc.)
  useEffect(() => {
    const activeStatuses = ["assigned", "arriving", "in_trip"];
    if (!activeStatuses.includes(rideStatus) || !currentRide?.id) return;

    const pollId = setInterval(async () => {
      try {
        const res = await apiRequest("GET", `/api/rides/${currentRideRef.current?.id}`);
        if (!res.ok) return;
        const ride = await res.json();
        // Only act on terminal or unexpected status changes
        if (ride.status === "cancelled" || ride.status === "trip_completed") {
          applyRideUpdate(ride);
        }
      } catch {}
    }, 5000);

    return () => clearInterval(pollId);
  }, [rideStatus, currentRide?.id]);

  useEffect(() => {
    const handleDriverLocation = (data: any) => {
      if (currentRide && data.chauffeurId === currentRide.chauffeurId) {
        const driverLoc = { lat: data.lat, lng: data.lng };
        setDriverLocation(driverLoc);

        // Recompute live ETA from driver to client (assigned/arriving) or to dropoff (in_trip)
        const destLat = rideStatus === "in_trip"
          ? parseFloat(currentRide.dropoffLat)
          : location?.lat ?? parseFloat(currentRide.pickupLat);
        const destLng = rideStatus === "in_trip"
          ? parseFloat(currentRide.dropoffLng)
          : location?.lng ?? parseFloat(currentRide.pickupLng);

        const distKm = haversineDistance(driverLoc.lat, driverLoc.lng, destLat, destLng);
        const etaMin = Math.max(1, Math.round((distKm / 30) * 60));
        setEtaText(etaMin <= 1 ? "Arriving now" : `${etaMin} min away`);
        // Update live ETA for notification banner
        setLiveEtaMin(etaMin);
        setInitialEtaMin(prev => prev ?? etaMin);
      }
    };
    on("location:update", handleDriverLocation);
    return () => { off("location:update", handleDriverLocation); };
  }, [currentRide, rideStatus, location]);

  // Fallback: decrease ETA by 1 every 60s when no location updates come in
  useEffect(() => {
    if (rideStatus !== "assigned" && rideStatus !== "arriving") return;
    const timer = setInterval(() => {
      setLiveEtaMin(prev => prev !== null && prev > 0 ? prev - 1 : prev);
    }, 60000);
    return () => clearInterval(timer);
  }, [rideStatus]);

  // Reset ETA state when trip starts or ends
  useEffect(() => {
    if (rideStatus === "in_trip" || rideStatus === "completed" || rideStatus === "idle") {
      setLiveEtaMin(null);
      setInitialEtaMin(null);
    }
  }, [rideStatus]);

  async function fetchRoute(origin: { lat: number; lng: number }, dest: { lat: number; lng: number }) {
    try {
      const res = await apiRequest("GET",
        `/api/directions?originLat=${origin.lat}&originLng=${origin.lng}&destLat=${dest.lat}&destLng=${dest.lng}`
      );
      const data = await res.json();
      if (data.polyline) {
        setRoutePolyline(data.polyline);
        if (data.durationText) setTripDurationText(data.durationText);
        if (data.durationMin) {
          setTripDurationMin(data.durationMin);
          // Refine live ETA from accurate route calculation
          setLiveEtaMin(data.durationMin);
          setInitialEtaMin(prev => prev ?? data.durationMin);
        }
        if (data.distanceKm) setEstimatedDistance(Math.round(data.distanceKm * 10) / 10);
        setEtaText(`ETA: ${data.durationText}`);
      }
    } catch {}
  }

  function applyRouteChoice(choice: RouteChoice) {
    setSelectedRouteId(choice.id);
    setEstimatedPrice(choice.fare);
    setEstimatedDistance(Math.round(choice.distanceKm * 10) / 10);
    setLateNightPremium(choice.lateNightPremium);
    setRoutePolyline(choice.polyline);
    setTripDurationText(choice.durationText);
    setTripDurationMin(choice.durationMin);
    setEtaText(`ETA: ${choice.durationText}`);
  }

  async function fetchRouteChoices(origin: { lat: number; lng: number }, dest: { lat: number; lng: number }) {
    let data: any = null;

    try {
      const res = await apiRequest(
        "GET",
        `/api/directions?originLat=${origin.lat}&originLng=${origin.lng}&destLat=${dest.lat}&destLng=${dest.lng}`
      );
      data = await res.json();
    } catch {
      data = null;
    }

    const fallbackRoute = data?.polyline
      ? [{
          polyline: data.polyline,
          distanceKm: Number(data.distanceKm || 0),
          distanceText: data.distanceText || "",
          durationMin: Number(data.durationMin || 0),
          durationText: data.durationText || "",
          summary: data.summary || "",
          steps: Array.isArray(data.steps) ? data.steps : [],
        }]
      : [];

    const sourceRoutes = Array.isArray(data?.alternatives) && data.alternatives.length > 0
      ? data.alternatives
      : fallbackRoute;
    const choiceDescriptors = buildRouteChoiceDescriptors(sourceRoutes);
    if (choiceDescriptors.length === 0) {
      const approximateChoice = buildApproximateRouteChoice(origin, dest, selectedVehicle, isLateNightWindow());
      setRouteChoices([approximateChoice]);
      applyRouteChoice(approximateChoice);
      return [approximateChoice];
    }

    const lateNightRide = isLateNightWindow();
    const choices = await Promise.all(
      choiceDescriptors.map(async ({ id, route, title, subtitle, badge, icon }) => {
        const fallbackEstimate = calculateFallbackEstimate(route.distanceKm, selectedVehicle, lateNightRide);

        try {
          const estimateRes = await apiRequest("POST", "/api/pricing/estimate", {
            distanceKm: route.distanceKm,
            categoryId: selectedVehicle.id,
            isLateNight: lateNightRide,
          });
          const estimate = await estimateRes.json();
          return {
            ...route,
            id,
            title,
            subtitle,
            badge,
            icon,
            fare: Number(estimate.totalPrice ?? fallbackEstimate.totalPrice),
            baseFare: Number(estimate.baseFare ?? fallbackEstimate.baseFare),
            pricePerKm: Number(estimate.pricePerKm ?? fallbackEstimate.pricePerKm),
            lateNightPremium: Number(estimate.lateNightPremium ?? fallbackEstimate.lateNightPremium),
            demandMultiplier: Number(estimate.demandMultiplier ?? 1),
            currency: estimate.currency || fallbackEstimate.currency,
          } as RouteChoice;
        } catch {
          return {
            ...route,
            id,
            title,
            subtitle,
            badge,
            icon,
            fare: fallbackEstimate.totalPrice,
            baseFare: fallbackEstimate.baseFare,
            pricePerKm: fallbackEstimate.pricePerKm,
            lateNightPremium: fallbackEstimate.lateNightPremium,
            demandMultiplier: 1,
            currency: fallbackEstimate.currency,
          } as RouteChoice;
        }
      })
    );

    setRouteChoices(choices);
    applyRouteChoice(choices[0]);
    return choices;
  }

  async function requestLocation() {
    try {
      if (Platform.OS === "web") {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
          });
          const nextLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
          setLocation(nextLocation);
          await resolvePickupAddress(nextLocation, true);
        } catch {
          setLocation((current) => current ?? { lat: -26.2041, lng: 28.0473 });
          setPickupAddress(CURRENT_LOCATION_LABEL);
        }
        setLocationLoading(false);
        return;
      }
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const loc = await getBestAvailablePosition();
        const nextLocation = toLatLng(loc);
        setLocation((current) => {
          if (pickupFollowsDeviceRef.current || !current) {
            return nextLocation;
          }
          return current;
        });
        void startLocationWatch();
        await resolvePickupAddress(nextLocation, true);
      } else {
        locationWatchRef.current?.remove();
        locationWatchRef.current = null;
        setLocation((current) => current ?? { lat: -26.2041, lng: 28.0473 });
        setPickupAddress(CURRENT_LOCATION_LABEL);
      }
    } catch (e) {
      locationWatchRef.current?.remove();
      locationWatchRef.current = null;
      setLocation((current) => current ?? { lat: -26.2041, lng: 28.0473 });
      setPickupAddress(CURRENT_LOCATION_LABEL);
    } finally {
      setLocationLoading(false);
    }
  }

  async function geocodeDestination(): Promise<{ lat: number; lng: number } | null> {
    if (!dropoffAddress.trim()) return null;
    try {
      const res = await apiRequest("GET", `/api/geocode?address=${encodeURIComponent(`${dropoffAddress}, South Africa`)}`);
      const data = await res.json();
      if (data.lat && data.lng && isWithinSouthAfricaBounds(data.lat, data.lng)) {
        return { lat: data.lat, lng: data.lng };
      }
    } catch {}

    if (Platform.OS !== "web") {
      try {
        const results = await Location.geocodeAsync(`${dropoffAddress}, South Africa`);
        const best = results.find((result) =>
          isWithinSouthAfricaBounds(result.latitude, result.longitude),
        );
        if (best) {
          return { lat: best.latitude, lng: best.longitude };
        }
      } catch {}
    }

    return null;
  }

  async function getEstimate() {
    if (!dropoffAddress.trim()) {
      Alert.alert("Enter Destination", "Please enter your dropoff location");
      return;
    }
    if (!location) {
      Alert.alert("Location Error", "Unable to determine your location");
      return;
    }
    try {
      // Use already-resolved coords from autocomplete selection, or geocode the typed address
      const dest = dropoffCoords ?? await geocodeDestination();
      if (!dest) {
        Alert.alert("Error", "Could not determine destination. Please select from the suggestions.");
        return;
      }
      setDropoffCoords(dest);
      const choices = await fetchRouteChoices(location, dest);
      if (choices.length === 0) {
        throw new Error("No route choices available");
      }
      setRideStatus("confirming");
    } catch (e) {
      Alert.alert("Error", "Failed to get estimate");
    }
  }

  async function requestRide() {
    if (!user || !location || !dropoffCoords) return;
    if (!selectedRouteChoice) {
      Alert.alert("Choose a Route", "Select a route option before requesting your ride.");
      return;
    }
    try {
      const res = await apiRequest("GET", "/api/payments/cards");
      const cards = await res.json();
      setSavedCards(Array.isArray(cards) ? cards : []);
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await handleUnauthorizedRideRequest();
        return;
      }
      setSavedCards([]);
    }
    setShowPaymentPicker(true);
  }

  async function createRideRecord(
    method: "cash" | "card" | "wallet",
    extras: Record<string, unknown> = {},
  ) {
    if (!user || !location || !dropoffCoords) return null;
    const activeRouteChoice = selectedRouteChoice;
    const distanceKm = activeRouteChoice?.distanceKm || estimatedDistance || 10;
    const res = await apiRequest("POST", "/api/rides", {
      clientId: user.id,
      pickupLat: location.lat,
      pickupLng: location.lng,
      pickupAddress,
      dropoffLat: dropoffCoords.lat,
      dropoffLng: dropoffCoords.lng,
      dropoffAddress,
      vehicleType: selectedVehicle.id,
      distanceKm,
      paymentMethod: method,
      paymentStatus: method === "cash" ? "unpaid" : "pending",
      durationMin: activeRouteChoice?.durationMin || tripDurationMin || undefined,
      selectedRouteId: activeRouteChoice?.id || undefined,
      selectedRouteDistanceKm: activeRouteChoice?.distanceKm || undefined,
      actualFare: activeRouteChoice?.fare || estimatedPrice || undefined,
      routeCurrency: activeRouteChoice?.currency || "ZAR",
      isLateNight: new Date().getHours() >= 22 || new Date().getHours() < 5,
      ...extras,
    });
    const payload = await res.json();
    return payload.ride ?? payload;
  }

  async function handleUnauthorizedRideRequest() {
    await clearSession();
    setShowPaymentPicker(false);
    Alert.alert(
      "Session expired",
      "Please log in again before requesting a ride.",
      [{ text: "Log in", onPress: () => router.replace("/login") }],
    );
  }

  /** Creates and dispatches a ride for any payment method */
  async function proceedWithRide(method: "cash" | "card" | "wallet") {
    try {
      const ride = await createRideRecord(method);
      if (!ride) return;

      if (method === "cash") {
        setCurrentRide(ride);
        setRideStatus("requested");
        queryClient.invalidateQueries({ queryKey: ["/api/rides/client", user!.id] });
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        return;
      }

      if (method === "wallet") {
        const payRes = await apiRequest("POST", "/api/payments/pay-wallet", { rideId: ride.id });
        const payData = await payRes.json();
        if (!payData.success) {
          await apiRequest("PUT", `/api/rides/${ride.id}/status`, { status: "cancelled" }).catch(() => {});
          Alert.alert("Payment Failed", payData.message || "Insufficient wallet balance.");
          return;
        }
        setCurrentRide(ride);
        setRideStatus("requested");
        queryClient.invalidateQueries({ queryKey: ["/api/rides/client", user!.id] });
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        return;
      }

      if (method === "card") {
        try {
          const chargeRes = await apiRequest("POST", "/api/payments/charge-ride", { rideId: ride.id });
          const chargeData = await chargeRes.json();
          if (!chargeData.success) {
            await apiRequest("PUT", `/api/rides/${ride.id}/status`, { status: "cancelled" }).catch(() => {});
            if (chargeData.needsCard) {
              Alert.alert("No Card Saved", "Please add a card in your wallet to pay by card.", [
                { text: "Go to Wallet", onPress: () => router.push("/client/wallet") },
                { text: "Pay Cash Instead", onPress: () => handlePayAndRide("cash") },
                { text: "Cancel", style: "cancel" },
              ]);
            } else {
              Alert.alert("Payment Failed", chargeData.message || "Card could not be charged.", [
                { text: "Pay Cash", onPress: () => handlePayAndRide("cash") },
                { text: "Cancel", style: "cancel" },
              ]);
            }
            return;
          }
          setCurrentRide(ride);
          setRideStatus("requested");
          queryClient.invalidateQueries({ queryKey: ["/api/rides/client", user!.id] });
          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } catch {
          await apiRequest("PUT", `/api/rides/${ride.id}/status`, { status: "cancelled" }).catch(() => {});
          Alert.alert("Payment Error", "Could not process card. Please try again or pay cash.", [
            { text: "Pay Cash", onPress: () => handlePayAndRide("cash") },
            { text: "Cancel", style: "cancel" },
          ]);
        }
      }
    } catch (err: any) {
      if (isUnauthorizedError(err)) {
        await handleUnauthorizedRideRequest();
        return;
      }
      Alert.alert("Error", err?.message || "Failed to request ride. Please try again.");
    }
  }

  async function handlePayAndRide(method: "cash" | "card" | "wallet") {
    if (!user || !location || !dropoffCoords) return;
    setPaymentMethod(method);
    setShowPaymentPicker(false);

    if (method === "cash") {
      setPaymentMethod("cash");
      if (!user?.profilePhoto) {
        setShowCashSelfiePrompt(true);
        return;
      }
      await proceedWithRide("cash");
      return;
    }

    try {
      await proceedWithRide(method);
    } catch (err: any) {
      if (isUnauthorizedError(err)) {
        await handleUnauthorizedRideRequest();
        return;
      }
      Alert.alert("Error", err?.message || "Failed to request ride. Please try again.");
    }
  }

  async function handleCashSelfieCapture(result: LivenessCaptureResult) {
    if (!user?.id || !result.uri) {
      setShowCashSelfieCamera(false);
      setShowCashSelfiePrompt(true);
      return;
    }

    setCashSelfieSaving(true);
    try {
      const uploadedUrl = await uploadDocument(result.uri, user.id, "profile_selfie");
      await apiRequest("PUT", `/api/users/${user.id}/selfie`, { profilePhoto: uploadedUrl });
      await refreshUser();
      setShowCashSelfieCamera(false);
      setShowCashSelfiePrompt(false);
      await proceedWithRide("cash");
    } catch (error: any) {
      const message = typeof error?.message === "string"
        ? error.message.replace(/^\d+:\s*/, "")
        : "Could not save your selfie. Please try again.";
      Alert.alert("Error", message);
      setShowCashSelfieCamera(false);
      setShowCashSelfiePrompt(true);
    } finally {
      setCashSelfieSaving(false);
    }
  }

  function cancelRide() {
    if (currentRide) {
      apiRequest("PUT", `/api/rides/${currentRide.id}/status`, { status: "cancelled" }).catch(() => {});
    }
    if (user?.id) queryClient.invalidateQueries({ queryKey: ["/api/rides/client", user.id] });
    setRideStatus("idle");
    setCurrentRide(null);
    setEstimatedPrice(null);
    setEstimatedDistance(null);
    setRouteChoices([]);
    setSelectedRouteId(null);
    setPaymentMethod("cash");
    setDropoffAddress("");
    setDropoffCoords(null);
    setRoutePolyline(null);
    setTripDurationText(null);
    setTripDurationMin(null);
    setDriverLocation(null);
    setEtaText(null);
  }

  async function submitRating() {
    if (!currentRide || rating === 0) {
      Alert.alert("Rating Required", "Please select a rating");
      return;
    }
    try {
      setSubmittingRating(true);
      await apiRequest("POST", `/api/rides/${currentRide.id}/rate`, {
        rating,
        comment: ratingComment.trim() || null,
      });
      setShowRating(false);
      resetAfterComplete();
      Alert.alert("Thank You", "Your rating has been submitted!");
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to submit rating");
    } finally {
      setSubmittingRating(false);
    }
  }

  function resetAfterComplete() {
    setRideStatus("idle");
    setCurrentRide(null);
    setEstimatedPrice(null);
    setEstimatedDistance(null);
    setRouteChoices([]);
    setSelectedRouteId(null);
    setPaymentMethod("cash");
    setDropoffAddress("");
    setDropoffCoords(null);
    setChauffeurDetails(null);
    setRoutePolyline(null);
    setDriverLocation(null);
    setEtaText(null);
    setShowRating(false);
    setRating(0);
    setRatingComment("");
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) }]}>
      <View style={styles.header}>
        <View style={styles.headerBrand}>
          <Text style={styles.brandName} numberOfLines={1}>A2B LIFT</Text>
          <Text style={styles.brandSlogan} numberOfLines={1}>Premium Ride Experience</Text>
        </View>
        <View style={styles.headerRight}>
          {__DEV__ && (
            <Pressable style={styles.debugBtn} onPress={() => setShowDebugLogModal(true)} hitSlop={8}>
              <Ionicons name="bug-outline" size={18} color={Colors.white} />
            </Pressable>
          )}
          {/* Notification bell */}
          <Pressable style={styles.bellBtn} onPress={() => router.push("/client/notifications")} hitSlop={8}>
            <Ionicons name="notifications-outline" size={22} color={Colors.white} />
            {unreadCount > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
              </View>
            )}
          </Pressable>
          {/* Profile icon */}
          <Pressable style={styles.avatarCircle} onPress={() => router.push("/client/profile")} hitSlop={8}>
            <Ionicons name="person" size={18} color={Colors.white} />
          </Pressable>
        </View>
      </View>

      <View style={styles.mapArea}>
        <A2BMap
          pickupLocation={location}
          dropoffLocation={dropoffCoords}
          driverLocation={driverLocation}
          nearbyDrivers={onlineDrivers}
          routePolyline={routePolyline}
          showDriver={rideStatus === "assigned" || rideStatus === "arriving" || rideStatus === "in_trip"}
          followDriver={rideStatus === "arriving" || rideStatus === "in_trip"}
          loading={locationLoading}
          etaText={etaText || undefined}
          statusText={
            rideStatus === "in_trip" ? "Trip In Progress" : undefined
          }
        />

        {/* Nearest driver ETA pill — shown when idle and drivers are nearby */}
        {(rideStatus === "idle" || rideStatus === "selecting") && nearestDriverEta && onlineDrivers.length > 0 && (
          <View style={styles.nearbyEtaPill}>
            <View style={styles.nearbyEtaDot} />
            <Text style={styles.nearbyEtaText}>
              {onlineDrivers.length} driver{onlineDrivers.length > 1 ? "s" : ""} nearby · {nearestDriverEta}
            </Text>
          </View>
        )}

        {/* Route info overlay — shows arrival time and distance on map when route is drawn */}
        {routePolyline && (rideStatus === "selecting" || rideStatus === "confirming") && (estimatedDistance || tripDurationText) && (() => {
          const arrivalTime = tripDurationMin
            ? new Date(Date.now() + tripDurationMin * 60 * 1000)
            : null;
          const arrivalStr = arrivalTime
            ? arrivalTime.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false })
            : null;
          return (
            <View style={styles.routeInfoOverlay}>
              {arrivalStr && (
                <View style={styles.arrivalPill}>
                  <Ionicons name="time-outline" size={13} color="#fff" />
                  <Text style={styles.arrivalPillText}>Arrive by {arrivalStr}</Text>
                </View>
              )}
              {(estimatedDistance || tripDurationText) && (
                <View style={styles.routeMetaPill}>
                  {estimatedDistance && <Text style={styles.routeMetaText}>{estimatedDistance} km</Text>}
                  {estimatedDistance && tripDurationText && <Text style={styles.routeMetaSep}> · </Text>}
                  {tripDurationText && <Text style={styles.routeMetaText}>{tripDurationText}</Text>}
                </View>
              )}
            </View>
          );
        })()}

        {/* Searching for driver overlay — shows on map like Uber/Taxify */}
        {rideStatus === "requested" && (
          <View style={styles.searchingMapOverlay}>
            <View style={styles.searchingPulseRing} />
            <View style={styles.searchingPulseRing2} />
            <View style={styles.searchingMapCard}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <View>
                <Text style={styles.searchingMapTitle}>Finding your chauffeur</Text>
                <Text style={styles.searchingMapSub}>{selectedVehicle.name} · {selectedVehicle.desc?.split(",")[0]}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Live driver notification banner — floats above map when driver is on the way */}
        {(rideStatus === "assigned" || rideStatus === "arriving") && chauffeurDetails && (
          <Animated.View entering={FadeInDown.duration(500)} style={styles.liveNotifBanner}>
            <View style={styles.liveNotifRow}>
              <View style={styles.liveCarIconWrap}>
                <Ionicons name="car" size={20} color={Colors.white} />
              </View>
              <View style={styles.liveNotifInfo}>
                <Text style={styles.liveNotifTitle} numberOfLines={1}>
                  {rideStatus === "arriving"
                    ? `${chauffeurDetails.driverName || "Driver"} is arriving now`
                    : `${chauffeurDetails.driverName || "Driver"} is on the way`}
                </Text>
                <Text style={styles.liveNotifVehicle} numberOfLines={1}>
                  {[chauffeurDetails.carMake, chauffeurDetails.vehicleModel].filter(Boolean).join(" ") || "Your Vehicle"}
                  {"  ·  "}
                  <Text style={styles.liveNotifPlate}>{chauffeurDetails.plateNumber}</Text>
                </Text>
              </View>
              <View style={styles.liveEtaBox}>
                <Text style={styles.liveEtaNum}>
                  {liveEtaMin !== null ? (liveEtaMin <= 1 ? "<1" : String(liveEtaMin)) : "—"}
                </Text>
                <Text style={styles.liveEtaUnit}>min</Text>
              </View>
            </View>
            {currentRide?.status === "chauffeur_arrived" && (
              <Text style={styles.waitingNotice}>Your driver has arrived. Waiting is free for 5 minutes, then R1 per minute up to R30.</Text>
            )}
            {/* Progress bar track */}
            <View style={styles.liveProgressTrack}>
              <View style={[
                styles.liveProgressFill,
                {
                  width: `${initialEtaMin && liveEtaMin !== null
                    ? Math.max(4, Math.round((liveEtaMin / initialEtaMin) * 100))
                    : 100}%` as any,
                  backgroundColor: (liveEtaMin !== null && liveEtaMin <= 2)
                    ? Colors.warning
                    : Colors.success,
                }
              ]} />
            </View>
          </Animated.View>
        )}
      </View>

      {rideStatus === "idle" && (
        <Animated.View entering={FadeInDown.duration(400)} style={[styles.bottomSheet, { marginBottom: bottomPanelOffset, paddingBottom: idleBottomSheetPadding }]}>
          <View style={styles.sheetHandle} />
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 8 }}
          >
            <Text style={styles.sheetTitle}>Where to?</Text>

            {/* Selfie nudge banner */}
            {!user?.profilePhoto && (
              <Pressable style={styles.selfieNudgeBanner} onPress={() => router.push("/client/profile")}>
                <Ionicons name="person-circle-outline" size={22} color="#FFE066" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.selfieNudgeTitle}>Add your profile selfie</Text>
                  <Text style={styles.selfieNudgeBody}>Drivers see your photo before accepting. Tap to add.</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#FFE066" />
              </Pressable>
            )}

            {/* Location inputs */}
            <View style={styles.locationInputsCard}>
              <Pressable style={styles.locationInputRow} onPress={() => openLocationPicker("pickup")}>
                <View style={styles.dotGreen} />
                <View style={styles.locationInputInner}>
                  <Text style={styles.locationInputLabel}>Pickup</Text>
                  <Text style={styles.locationInputValue} numberOfLines={1}>
                    {pickupAddress || "Set pickup location"}
                  </Text>
                </View>
                <Ionicons name="pencil-outline" size={15} color={Colors.textMuted} />
              </Pressable>

              <View style={styles.locationDivider} />

              <Pressable style={styles.locationInputRow} onPress={() => openLocationPicker("dropoff")}>
                <View style={styles.dotRed} />
                <View style={styles.locationInputInner}>
                  <Text style={styles.locationInputLabel}>Dropoff</Text>
                  <Text
                    style={[styles.locationInputValue, !dropoffAddress && { color: Colors.textMuted }]}
                    numberOfLines={1}
                  >
                    {dropoffAddress || "Where are you going?"}
                  </Text>
                </View>
                <Ionicons name="pencil-outline" size={15} color={Colors.textMuted} />
              </Pressable>
            </View>

            <Pressable
              style={styles.vehicleSelector}
              onPress={() => setShowVehicleSheet(true)}
            >
              <Ionicons name={selectedVehicle.icon} size={20} color={Colors.white} />
              <View style={{ flex: 1 }}>
                <Text style={styles.vehicleName}>{selectedVehicle.name}</Text>
                <Text style={styles.vehiclePrice}>R{selectedVehicle.baseFare} base + R{selectedVehicle.pricePerKm}/km</Text>
              </View>
              <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.confirmBtn, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
              onPress={getEstimate}
            >
              <Text style={styles.confirmBtnText}>Get Estimated Fare</Text>
            </Pressable>
          </ScrollView>
        </Animated.View>
      )}

      {rideStatus === "confirming" && (
        <Animated.View entering={FadeInDown.duration(400)} style={[styles.confirmingSheet, { marginBottom: bottomPanelOffset }]}>
          <View style={styles.sheetHandle} />

          {/* Header row with dismiss button */}
          <View style={styles.confirmingHeader}>
            <Text style={styles.sheetTitle}>Fare Estimate</Text>
            <Pressable style={styles.dismissBtn} onPress={cancelRide} hitSlop={12}>
              <Ionicons name="close" size={20} color={Colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.confirmingScroll,
              { paddingBottom: bottomPanelOffset + bottomPanelPadding + 8 },
            ]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.priceCard}>
              <Text style={styles.priceLabel}>{selectedVehicle.name}</Text>
              <Text style={styles.priceValue}>R {selectedRouteChoice?.fare ?? estimatedPrice}</Text>
              <Text style={styles.priceCurrency}>{selectedRouteChoice?.currency || "ZAR"}</Text>
              {(estimatedDistance || tripDurationText) && (
                <View style={styles.tripInfoPill}>
                  {estimatedDistance && (
                    <Text style={styles.tripInfoText}>{estimatedDistance} km</Text>
                  )}
                  {estimatedDistance && tripDurationText && (
                    <Text style={styles.tripInfoSep}>·</Text>
                  )}
                  {tripDurationText && (
                    <Text style={styles.tripInfoText}>{tripDurationText}</Text>
                  )}
                </View>
              )}
              {selectedRouteChoice ? (
                <View style={styles.estimateBadgeRow}>
                  <View style={styles.estimateBadge}>
                    <Ionicons name={selectedRouteChoice.icon} size={14} color={Colors.primary} />
                    <Text style={styles.estimateBadgeText}>{selectedRouteChoice.badge}</Text>
                  </View>
                  <View style={styles.estimateBadgeMuted}>
                    <Text style={styles.estimateBadgeMutedText}>{selectedRouteChoice.title}</Text>
                  </View>
                </View>
              ) : null}
              {Number(selectedRouteChoice?.demandMultiplier || 1) > 1 && (
                <View style={styles.highDemandBadge}>
                  <Ionicons name="trending-up" size={14} color={Colors.warning} />
                  <Text style={styles.highDemandBadgeText}>High demand pricing</Text>
                </View>
              )}
            </View>

            {routeChoices.length > 0 && (
              <View style={styles.routeChoiceSection}>
                <View style={styles.routeChoiceHeader}>
                  <Text style={styles.routeChoiceTitle}>Choose your route</Text>
                  <Text style={styles.routeChoiceHeaderText}>Price updates with each option</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.routeChoiceScroller}>
                  {routeChoices.map((choice) => {
                    const isSelected = choice.id === selectedRouteChoice?.id;
                    return (
                      <Pressable
                        key={choice.id}
                        style={[styles.routeChoiceCard, isSelected && styles.routeChoiceCardSelected]}
                        onPress={() => applyRouteChoice(choice)}
                      >
                        <View style={styles.routeChoiceTopRow}>
                          <View style={[styles.routeChoiceIconWrap, isSelected && styles.routeChoiceIconWrapSelected]}>
                            <Ionicons name={choice.icon} size={16} color={isSelected ? Colors.primary : Colors.white} />
                          </View>
                          <View style={[styles.routeChoiceBadge, isSelected && styles.routeChoiceBadgeSelected]}>
                            <Text style={[styles.routeChoiceBadgeText, isSelected && styles.routeChoiceBadgeTextSelected]}>{choice.badge}</Text>
                          </View>
                        </View>
                        <Text style={[styles.routeChoiceCardTitle, isSelected && styles.routeChoiceCardTitleSelected]}>{choice.title}</Text>
                        <Text style={[styles.routeChoiceCardSubtitle, isSelected && styles.routeChoiceCardSubtitleSelected]}>{choice.subtitle}</Text>
                        <Text style={[styles.routeChoiceMeta, isSelected && styles.routeChoiceMetaSelected]}>{choice.durationText} · {choice.distanceText}</Text>
                        <Text style={[styles.routeChoiceFare, isSelected && styles.routeChoiceFareSelected]}>R {choice.fare}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            <View style={styles.fareBreakdown}>
              <View style={styles.fareRow}>
                <Text style={styles.fareLabel}>Base fare</Text>
                <Text style={styles.fareValue}>R {selectedRouteChoice?.baseFare ?? selectedVehicle.baseFare}</Text>
              </View>
              <View style={styles.fareRow}>
                <Text style={styles.fareLabel}>Distance ({estimatedDistance} km × R{selectedRouteChoice?.pricePerKm ?? selectedVehicle.pricePerKm})</Text>
                <Text style={styles.fareValue}>R {Math.round((estimatedDistance || 0) * (selectedRouteChoice?.pricePerKm ?? selectedVehicle.pricePerKm))}</Text>
              </View>
              {lateNightPremium > 0 && (
                <View style={styles.fareRow}>
                  <Text style={styles.fareLabel}>Late night surcharge (30%)</Text>
                  <Text style={styles.fareValue}>R {lateNightPremium}</Text>
                </View>
              )}
              {Number(selectedRouteChoice?.demandMultiplier || 1) > 1 && (
                <View style={styles.fareRow}>
                  <Text style={styles.fareLabel}>High demand multiplier</Text>
                  <Text style={styles.fareValue}>× {selectedRouteChoice?.demandMultiplier.toFixed(2)}</Text>
                </View>
              )}
            </View>

            <View style={styles.routeSummary}>
              <View style={styles.routeRow}>
                <View style={styles.dotGreen} />
                <Text style={styles.routeText} numberOfLines={2}>{pickupAddress}</Text>
              </View>
              <View style={styles.routeLine} />
              <View style={styles.routeRow}>
                <View style={styles.dotRed} />
                <Text style={styles.routeText} numberOfLines={2}>{dropoffAddress}</Text>
              </View>
            </View>

            <Pressable
              style={({ pressed }) => [styles.requestBtn, pressed && { opacity: 0.9 }]}
              onPress={requestRide}
            >
              <Text style={styles.requestBtnText}>Request Ride</Text>
            </Pressable>

            <Pressable style={styles.cancelFullBtn} onPress={cancelRide}>
              <Text style={styles.cancelFullBtnText}>Cancel</Text>
            </Pressable>
          </ScrollView>
        </Animated.View>
      )}

      {rideStatus === "requested" && (
        <Animated.View entering={FadeInDown.duration(400)} style={[styles.searchingBottomSheet, { marginBottom: bottomPanelOffset, paddingBottom: bottomPanelPadding }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.searchingContainer}>
            <ActivityIndicator size="small" color={Colors.white} />
            <View style={{ flex: 1 }}>
              <Text style={styles.searchingText}>Searching for {selectedVehicle.name}...</Text>
              <Text style={styles.searchingSubtext}>
                {getRoutePreferenceLabel(currentRide?.selectedRouteId || selectedRouteChoice?.id)} · {getPaymentMethodLabel(currentRide?.paymentMethod || paymentMethod)}
              </Text>
            </View>
          </View>
          <Pressable style={styles.cancelFullBtn} onPress={cancelRide}>
            <Text style={styles.cancelFullBtnText}>Cancel Request</Text>
          </Pressable>
        </Animated.View>
      )}

      {rideStatus === "no_drivers" && (
        <Animated.View entering={FadeInDown.duration(400)} style={[styles.bottomSheet, { marginBottom: bottomPanelOffset, paddingBottom: bottomPanelPadding }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.noDriversContainer}>
            <Ionicons name="car-outline" size={48} color={Colors.textSecondary} />
            <Text style={styles.noDriversTitle}>No Cars Available</Text>
            <Text style={styles.noDriversSubtext}>
              There are no {selectedVehicle.name} drivers available in your area right now. Please try again shortly.
            </Text>
          </View>
          <Pressable style={styles.retryBtn} onPress={() => { setRideStatus("idle"); setDropoffCoords(null); setDropoffAddress(""); setRoutePolyline(null); }}>
            <Text style={styles.retryBtnText}>Back to Home</Text>
          </Pressable>
        </Animated.View>
      )}

      {(rideStatus === "assigned" || rideStatus === "arriving" || rideStatus === "in_trip") && (
        <Animated.View entering={FadeInDown.duration(400)} style={[styles.bottomSheet, { marginBottom: bottomPanelOffset, paddingBottom: bottomPanelPadding }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.statusBadge}>
            <View style={[styles.statusDot, { backgroundColor: Colors.success }]} />
            <Text style={styles.statusText}>
              {rideStatus === "assigned"
                ? `${chauffeurDetails?.driverName || "Driver"} is on the way`
                : rideStatus === "arriving"
                  ? `${chauffeurDetails?.driverName || "Driver"} is arriving`
                  : "Trip In Progress"}
            </Text>
          </View>

          <View style={styles.chauffeurCard}>
            <Pressable style={styles.chauffeurAvatarBtn} onPress={openDriverProfile}>
              <View style={styles.chauffeurAvatar}>
                {chauffeurDetails?.profilePhoto ? (
                  <Image
                    source={{ uri: chauffeurDetails.profilePhoto }}
                    style={{ width: 48, height: 48, borderRadius: 24 }}
                    resizeMode="cover"
                  />
                ) : (
                  <Ionicons name="person" size={24} color={Colors.white} />
                )}
              </View>
              <View style={styles.viewProfileBadge}>
                <Ionicons name="eye" size={9} color={Colors.white} />
              </View>
            </Pressable>
            <Pressable style={styles.chauffeurInfo} onPress={openDriverProfile}>
              <Text style={styles.chauffeurName}>{chauffeurDetails?.driverName || "Your Driver"}</Text>
              {/* Show exact vehicle — make + model */}
              <Text style={styles.chauffeurVehicle}>
                {[chauffeurDetails?.carMake, chauffeurDetails?.vehicleModel].filter(Boolean).join(" ") || selectedVehicle.name}
              </Text>
              {chauffeurDetails && (
                <View style={styles.driverMeta}>
                  <View style={styles.ratingChip}>
                    <Ionicons name="star" size={11} color={Colors.warning} />
                    <Text style={styles.ratingChipText}>
                      {chauffeurDetails.driverRating !== null && chauffeurDetails.driverRating !== undefined
                        ? chauffeurDetails.driverRating.toFixed(1)
                        : "New"}
                    </Text>
                  </View>
                  {/* Plate number chip */}
                  <View style={styles.plateChip}>
                    <Text style={styles.plateText}>{chauffeurDetails.plateNumber}</Text>
                  </View>
                  {/* Car color dot */}
                  {chauffeurDetails.carColor ? (
                    <View style={styles.colorBadge}>
                      <View style={[styles.colorDotCircle, { backgroundColor: carColorToHex(chauffeurDetails.carColor) }]} />
                      <Text style={styles.colorDot}>{chauffeurDetails.carColor}</Text>
                    </View>
                  ) : null}
                </View>
              )}
              <Text style={styles.chauffeurTapHint}>Tap to view full profile and rating</Text>
            </Pressable>
            <View style={styles.chauffeurActions}>
              <Pressable
                style={styles.actionBtn}
                onPress={() => {
                  if (currentRide?.id) {
                    router.push({ pathname: "/client/chat", params: { rideId: currentRide.id, driverName: chauffeurDetails?.driverName || "Driver" } });
                  }
                }}
              >
                <Ionicons name="chatbubble" size={18} color={Colors.white} />
              </Pressable>
              <Pressable
                style={styles.actionBtn}
                onPress={() => {
                  if (chauffeurDetails?.driverPhone) {
                    Linking.openURL(`tel:${chauffeurDetails.driverPhone}`);
                  } else {
                    Alert.alert("Call", "Phone number not available. Use chat instead.");
                  }
                }}
              >
                <Ionicons name="call" size={18} color={Colors.white} />
              </Pressable>
            </View>
          </View>

          {currentRide?.price && (
            <View style={styles.tripPriceRow}>
              <Text style={styles.tripPriceLabel}>Ride Price</Text>
              <Text style={styles.tripPriceValue}>R {currentRide.price}</Text>
            </View>
          )}
          <View style={styles.selectionMetaRow}>
            <View style={styles.selectionMetaChip}>
              <Ionicons name="navigate-circle-outline" size={14} color={Colors.white} />
              <Text style={styles.selectionMetaText}>{getRoutePreferenceLabel(currentRide?.selectedRouteId)}</Text>
            </View>
            <View style={styles.selectionMetaChip}>
              <Ionicons
                name={currentRide?.paymentMethod === "card" ? "card-outline" : currentRide?.paymentMethod === "wallet" ? "wallet-outline" : "cash-outline"}
                size={14}
                color={Colors.white}
              />
              <Text style={styles.selectionMetaText}>{getPaymentMethodLabel(currentRide?.paymentMethod)}</Text>
            </View>
          </View>
          {(rideStatus === "assigned" || rideStatus === "arriving" || rideStatus === "in_trip") && (
            <Pressable
              style={styles.cancelRideActiveBtn}
              onPress={() => {
                if (Platform.OS === "web") {
                  if ((global as any).confirm?.("Are you sure you want to cancel this ride?") !== false) {
                    cancelRide();
                  }
                } else {
                  Alert.alert("Cancel Ride", "Are you sure you want to cancel?", [
                    { text: "Keep Ride", style: "cancel" },
                    { text: "Cancel Ride", style: "destructive", onPress: cancelRide },
                  ]);
                }
              }}
            >
              <Text style={styles.cancelRideActiveBtnText}>Cancel Ride</Text>
            </Pressable>
          )}
        </Animated.View>
      )}

      {rideStatus === "completed" && !showRating && (
        <Animated.View entering={FadeInDown.duration(400)} style={[styles.bottomSheet, { marginBottom: bottomPanelOffset, paddingBottom: bottomPanelPadding }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.completedContainer}>
            <View style={styles.checkCircle}>
              <Ionicons name="checkmark" size={32} color={Colors.white} />
            </View>
            <Text style={styles.completedTitle}>Trip Completed</Text>
            <Text style={styles.completedPrice}>R {currentRide?.finalFare ?? currentRide?.price ?? estimatedPrice}</Text>
            {currentRide?.quotedFare != null && currentRide?.finalFare != null && Number(currentRide.quotedFare) !== Number(currentRide.finalFare) && (
              <View style={styles.settlementCard}>
                <View style={styles.settlementRow}><Text style={styles.settlementLabel}>Quoted fare</Text><Text style={styles.settlementValue}>R {Number(currentRide.quotedFare).toFixed(2)}</Text></View>
                {Number(currentRide.waitingFee || 0) > 0 && <View style={styles.settlementRow}><Text style={styles.settlementLabel}>Waiting time</Text><Text style={styles.settlementValue}>R {Number(currentRide.waitingFee).toFixed(2)}</Text></View>}
                <View style={styles.settlementRow}><Text style={styles.settlementLabel}>Final fare</Text><Text style={styles.settlementValue}>R {Number(currentRide.finalFare).toFixed(2)}</Text></View>
                <Text style={styles.settlementNote}>{Number(currentRide.finalFare) > Number(currentRide.quotedFare) ? "Your saved card was charged only for the difference." : "The lower final fare has been refunded to your original payment method."}</Text>
              </View>
            )}
            <Text style={styles.completedLabel}>Thank you for riding with A2B LIFT</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.confirmBtn, pressed && { opacity: 0.9 }]}
            onPress={() => setShowRating(true)}
          >
            <Text style={styles.confirmBtnText}>Rate Your Driver</Text>
          </Pressable>
        </Animated.View>
      )}

      {showRating && (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
          style={styles.ratingSheetKeyboard}
        >
          <View style={styles.ratingSheetOverlay}>
            <ScrollView
              bounces={false}
              contentContainerStyle={[styles.ratingSheetScrollContent, { paddingBottom: bottomPanelOffset }]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Animated.View entering={FadeInDown.duration(400)} style={[styles.bottomSheet, styles.ratingSheetCard, { paddingBottom: bottomPanelPadding }]}> 
                <View style={styles.sheetHandle} />
                <Text style={styles.sheetTitle}>Rate Your Driver</Text>

                <View style={styles.ratingContainer}>
                  <Text style={styles.ratingLabel}>How was your ride?</Text>
                  <View style={styles.starsContainer}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Pressable
                        key={star}
                        onPress={() => setRating(star)}
                        style={({ pressed }) => [styles.starButton, pressed && { opacity: 0.7 }]}
                      >
                        <Ionicons
                          name={star <= rating ? "star" : "star-outline"}
                          size={40}
                          color={star <= rating ? Colors.warning : Colors.textMuted}
                        />
                      </Pressable>
                    ))}
                  </View>
                </View>

                <View style={styles.commentContainer}>
                  <Text style={styles.commentLabel}>Optional: Add a comment</Text>
                  <TextInput
                    style={styles.commentInput}
                    placeholder="Share your experience..."
                    placeholderTextColor={Colors.textMuted}
                    value={ratingComment}
                    onChangeText={setRatingComment}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                    scrollEnabled={false}
                  />
                </View>

                <View style={[styles.ratingActions, { paddingBottom: insets.bottom + 8 }]}> 
                  <Pressable
                    style={({ pressed }) => [styles.skipButton, pressed && { opacity: 0.8 }]}
                    onPress={() => {
                      setShowRating(false);
                      resetAfterComplete();
                    }}
                  >
                    <Text style={styles.skipButtonText}>Skip</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.submitRatingButton,
                      rating === 0 && styles.submitRatingButtonDisabled,
                      pressed && { opacity: 0.9 },
                    ]}
                    onPress={submitRating}
                    disabled={rating === 0 || submittingRating}
                  >
                    {submittingRating ? (
                      <ActivityIndicator size="small" color={Colors.white} />
                    ) : (
                      <Text style={styles.submitRatingButtonText}>Submit</Text>
                    )}
                  </Pressable>
                </View>
              </Animated.View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* Driver Profile Modal */}
      <Modal visible={showDriverProfile} transparent animationType="slide" onRequestClose={() => setShowDriverProfile(false)}>
        <View style={styles.profileModalOverlay}>
          <View style={[styles.profileModalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.profileModalHeader}>
              <Text style={styles.profileModalTitle}>Driver Profile</Text>
              <Pressable onPress={() => setShowDriverProfile(false)} style={styles.profileCloseBtn}>
                <Ionicons name="close" size={20} color={Colors.textMuted} />
              </Pressable>
            </View>

            {driverProfileLoading ? (
              <View style={styles.profileLoadingContainer}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.profileLoadingText}>Loading profile...</Text>
              </View>
            ) : driverProfile ? (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
                {/* Profile Header */}
                <View style={styles.profileHero}>
                  <View style={styles.profileAvatarLarge}>
                    {driverProfile.profilePhoto ? (
                      <Image source={{ uri: driverProfile.profilePhoto }} style={styles.profileAvatarImg} resizeMode="cover" />
                    ) : (
                      <Ionicons name="person" size={44} color={Colors.white} />
                    )}
                  </View>
                  <Text style={styles.profileDriverName}>{driverProfile.driverName}</Text>
                  <Text style={styles.profileVehicle}>
                    {[driverProfile.carMake, driverProfile.vehicleModel].filter(Boolean).join(" ")}
                  </Text>
                  {driverProfile.plateNumber ? (
                    <View style={styles.profilePlateChip}>
                      <Text style={styles.profilePlateText}>{driverProfile.plateNumber}</Text>
                    </View>
                  ) : null}
                  <View style={styles.profileHighlights}>
                    {driverProfile.vehicleCategory ? (
                      <View style={styles.profileHighlightChip}>
                        <Ionicons name="car-sport-outline" size={14} color={Colors.accent} />
                        <Text style={styles.profileHighlightText}>{driverProfile.vehicleCategory}</Text>
                      </View>
                    ) : null}
                    {driverProfile.carColor ? (
                      <View style={styles.profileHighlightChip}>
                        <Ionicons name="color-palette-outline" size={14} color={Colors.accent} />
                        <Text style={styles.profileHighlightText}>{driverProfile.carColor}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                {/* Stats Row */}
                <View style={styles.profileStatsRow}>
                  <View style={styles.profileStatBox}>
                    <Text style={styles.profileStatValue}>
                      {driverProfile.driverRating !== null ? driverProfile.driverRating.toFixed(1) : "—"}
                    </Text>
                    <View style={{ flexDirection: "row", gap: 2, justifyContent: "center", marginBottom: 2 }}>
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Ionicons
                          key={s}
                          name={s <= Math.round(driverProfile.driverRating ?? 0) ? "star" : "star-outline"}
                          size={11}
                          color={Colors.warning}
                        />
                      ))}
                    </View>
                    <Text style={styles.profileStatLabel}>{driverProfile.totalRatings} ratings</Text>
                  </View>
                  <View style={styles.profileStatDivider} />
                  <View style={styles.profileStatBox}>
                    <Text style={styles.profileStatValue}>{driverProfile.completedTrips}</Text>
                    <Text style={styles.profileStatLabel}>Trips Completed</Text>
                  </View>
                </View>

                {driverProfile.totalRatings > 0 && (
                  <View style={styles.profileDistribution}>
                    <Text style={styles.profileSectionTitle}>Rating Breakdown</Text>
                    {[5, 4, 3, 2, 1].map((star) => {
                      const count = driverProfile.distribution[star] || 0;
                      const pct = driverProfile.totalRatings > 0 ? count / driverProfile.totalRatings : 0;
                      return (
                        <View key={star} style={styles.distRow}>
                          <Text style={styles.distLabel}>{star}</Text>
                          <Ionicons name="star" size={10} color={Colors.warning} />
                          <View style={styles.distBarBg}>
                            <View style={[styles.distBarFill, { flex: pct }]} />
                            <View style={{ flex: 1 - pct }} />
                          </View>
                          <Text style={styles.distCount}>{count}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}

                {driverProfile.ratings.length > 0 ? (
                  <View style={styles.profileReviews}>
                    <Text style={styles.profileSectionTitle}>Recent Reviews</Text>
                    {driverProfile.ratings.map((review) => (
                      <View key={review.id} style={styles.reviewCard}>
                        <View style={styles.reviewHeader}>
                          <View style={styles.reviewAvatar}>
                            <Text style={styles.reviewAvatarText}>{review.reviewerName.charAt(0).toUpperCase()}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.reviewerName}>{review.reviewerName}</Text>
                            <Text style={styles.reviewDate}>
                              {new Date(review.createdAt).toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "numeric" })}
                            </Text>
                          </View>
                          <View style={styles.reviewStars}>
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Ionicons key={s} name={s <= review.rating ? "star" : "star-outline"} size={12} color={Colors.warning} />
                            ))}
                          </View>
                        </View>
                        {review.comment ? (
                          <Text style={styles.reviewComment}>{review.comment}</Text>
                        ) : null}
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.noReviewsContainer}>
                    <Ionicons name="chatbubble-outline" size={32} color={Colors.textMuted} />
                    <Text style={styles.noReviewsText}>No reviews yet</Text>
                  </View>
                )}
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Payment Method Picker */}
      <Modal visible={showPaymentPicker} transparent animationType="slide" onRequestClose={() => setShowPaymentPicker(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowPaymentPicker(false)}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 16) }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>How would you like to pay?</Text>
            <Text style={{ fontSize: 13, color: Colors.textMuted, fontFamily: "Inter_400Regular", marginBottom: 8 }}>
              Fare: R {selectedRouteChoice?.fare ?? estimatedPrice}
            </Text>
            {selectedRouteChoice ? (
              <View style={styles.paymentContextRow}>
                <View style={styles.paymentContextChip}>
                  <Ionicons name={selectedRouteChoice.icon} size={14} color={Colors.primary} />
                  <Text style={styles.paymentContextText}>{selectedRouteChoice.title}</Text>
                </View>
                <View style={styles.paymentContextChip}>
                  <Ionicons name="time-outline" size={14} color={Colors.primary} />
                  <Text style={styles.paymentContextText}>{selectedRouteChoice.durationText}</Text>
                </View>
              </View>
            ) : null}
            {(() => {
              const defaultCard = savedCards.find(c => c.isDefault) || savedCards[0];
              return (
                <Pressable
                  style={styles.payMethodRow}
                  onPress={() => {
                    if (!defaultCard) {
                      setShowPaymentPicker(false);
                      router.push("/client/wallet");
                    } else {
                      handlePayAndRide("card");
                    }
                  }}
                >
                  <View style={[styles.payMethodIcon, { backgroundColor: "#1434CB" }]}>
                    <Ionicons name="card" size={20} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.payMethodName}>
                      {defaultCard ? `${defaultCard.cardType?.toUpperCase()} •••• ${defaultCard.last4}` : "Pay by Card"}
                    </Text>
                    <Text style={styles.payMethodSub}>
                      {defaultCard ? "Charged immediately to saved card" : "No card saved — tap to add one in wallet"}
                    </Text>
                  </View>
                  <Ionicons name={defaultCard ? "chevron-forward" : "add-circle-outline"} size={16} color={Colors.textMuted} />
                </Pressable>
              );
            })()}
            {(user?.walletBalance || 0) >= (estimatedPrice || 0) && (estimatedPrice || 0) > 0 && (
              <Pressable style={styles.payMethodRow} onPress={() => handlePayAndRide("wallet")}>
                <View style={[styles.payMethodIcon, { backgroundColor: Colors.success }]}>
                  <Ionicons name="wallet" size={20} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.payMethodName}>Wallet Balance</Text>
                  <Text style={styles.payMethodSub}>R {(user?.walletBalance || 0).toFixed(2)} available</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
              </Pressable>
            )}
            <Pressable style={styles.payMethodRow} onPress={() => handlePayAndRide("cash")}>
              <View style={[styles.payMethodIcon, { backgroundColor: Colors.accent }]}> 
                <Ionicons name="cash" size={20} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.payMethodName}>Cash</Text>
                <Text style={styles.payMethodSub}>Pay driver directly after ride</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={showCashSelfiePrompt}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCashSelfiePrompt(false)}
      >
        <View style={styles.cashSelfiePromptOverlay}>
          <View style={styles.cashSelfiePromptCard}>
            <Pressable
              style={styles.cashSelfiePromptClose}
              hitSlop={12}
              onPress={() => setShowCashSelfiePrompt(false)}
            >
              <Ionicons name="close" size={20} color="rgba(255,255,255,0.72)" />
            </Pressable>

            <View style={styles.cashSelfieHero}>
              <View style={styles.cashSelfieGlowPrimary} />
              <View style={styles.cashSelfieGlowAccent} />

              <View style={styles.cashSelfieIllustrationRow}>
                <View style={styles.cashSelfieCharacter}>
                  <View style={styles.cashSelfieCharacterArm} />
                  <View style={styles.cashSelfieCharacterBody} />
                  <View style={styles.cashSelfieCharacterHead}>
                    <View style={styles.cashSelfieCharacterEye} />
                    <View style={styles.cashSelfieCharacterEyeRight} />
                    <View style={styles.cashSelfieCharacterSmile} />
                  </View>
                </View>

                <View style={styles.cashSelfiePhone}>
                  <View style={styles.cashSelfiePhoneNotch} />
                  <View style={styles.cashSelfiePhoneScreen}>
                    <View style={styles.cashSelfiePhoneAvatarHead} />
                    <View style={styles.cashSelfiePhoneAvatarBody} />
                    <View style={styles.cashSelfiePhoneSparkle}>
                      <Ionicons name="sparkles" size={14} color="#E7F6FF" />
                    </View>
                  </View>
                </View>
              </View>
            </View>

            <Text style={styles.cashSelfiePromptEyebrow}>Cash ride tip</Text>
            <Text style={styles.cashSelfiePromptTitle}>Add a selfie drivers can trust</Text>
            <Text style={styles.cashSelfiePromptBody}>
              Drivers see your profile photo before deciding on a cash trip. A clear selfie helps them confirm it is you and accept faster.
            </Text>

            <View style={styles.cashSelfieBenefitList}>
              <View style={styles.cashSelfieBenefitRow}>
                <View style={styles.cashSelfieBenefitIconWrap}>
                  <Ionicons name="person-circle-outline" size={16} color="#0A1B2A" />
                </View>
                <Text style={styles.cashSelfieBenefitText}>Visible to drivers before they accept</Text>
              </View>
              <View style={styles.cashSelfieBenefitRow}>
                <View style={styles.cashSelfieBenefitIconWrap}>
                  <Ionicons name="shield-checkmark-outline" size={16} color="#0A1B2A" />
                </View>
                <Text style={styles.cashSelfieBenefitText}>Builds trust for cash pickups</Text>
              </View>
              <View style={styles.cashSelfieBenefitRow}>
                <View style={styles.cashSelfieBenefitIconWrap}>
                  <Ionicons name="camera-outline" size={16} color="#0A1B2A" />
                </View>
                <Text style={styles.cashSelfieBenefitText}>Takes a few seconds in your profile</Text>
              </View>
            </View>

            <View style={styles.cashSelfieActionRow}>
              <Pressable
                style={[styles.cashSelfiePrimaryButton, { flex: 1 }]}
                onPress={() => {
                  setShowCashSelfiePrompt(false);
                  setShowCashSelfieCamera(true);
                }}
              >
                <Ionicons name="camera" size={16} color="#07111B" />
                <Text style={styles.cashSelfiePrimaryButtonText}>Add selfie now</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showCashSelfieCamera}
        animationType="slide"
        onRequestClose={() => {
          if (cashSelfieSaving) return;
          setShowCashSelfieCamera(false);
          setShowCashSelfiePrompt(true);
        }}
      >
        <LivenessCamera
          challenge={"look_straight" as LivenessChallenge}
          onCapture={handleCashSelfieCapture}
          onCancel={() => {
            if (cashSelfieSaving) return;
            setShowCashSelfieCamera(false);
            setShowCashSelfiePrompt(true);
          }}
        />
        {cashSelfieSaving && (
          <View style={styles.cashSelfieSavingOverlay}>
            <ActivityIndicator size="large" color="#FFFFFF" />
            <Text style={styles.cashSelfieSavingText}>Saving your selfie...</Text>
          </View>
        )}
      </Modal>

      {/* Location Picker Modal */}
      <Modal
        visible={locationPickerVisible}
        animationType="slide"
        onRequestClose={() => setLocationPickerVisible(false)}
      >
        <View style={[styles.locationPickerContainer, { paddingTop: insets.top }]}>
          {/* Header */}
          <View style={styles.locationPickerHeader}>
            <Pressable onPress={() => setLocationPickerVisible(false)} hitSlop={12}>
              <Ionicons name="arrow-back" size={24} color={Colors.white} />
            </Pressable>
            <Text style={styles.locationPickerTitle}>
              {locationPickerTarget === "pickup" ? "Set Pickup" : "Set Destination"}
            </Text>
            {__DEV__ ? (
              <Pressable onPress={() => setShowDebugLogModal(true)} hitSlop={12}>
                <Ionicons name="bug-outline" size={20} color={Colors.white} />
              </Pressable>
            ) : (
              <View style={{ width: 24 }} />
            )}
          </View>

          {/* Search input */}
          <View style={styles.locationPickerInputRow}>
            <View style={locationPickerTarget === "pickup" ? styles.dotGreen : styles.dotRed} />
            <TextInput
              style={styles.locationPickerInput}
              placeholder={locationPickerTarget === "pickup" ? "Search pickup location..." : "Search destination..."}
              placeholderTextColor={Colors.textMuted}
              value={locationPickerQuery}
              onChangeText={onLocationQueryChange}
              autoFocus
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            {suggestionsLoading && <ActivityIndicator size="small" color={Colors.textMuted} />}
          </View>

          {/* Use current location (pickup only) */}
          {locationPickerTarget === "pickup" && (
            <Pressable style={styles.currentLocationBtn} onPress={useCurrentLocationForPickup}>
              <Ionicons name="locate" size={18} color={Colors.white} />
              <Text style={styles.currentLocationText}>Use my current location</Text>
            </Pressable>
          )}

          {/* Suggestions list */}
          <FlatList
            data={locationSuggestions}
            keyExtractor={(item) => item.placeId}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            initialNumToRender={10}
            contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
            ItemSeparatorComponent={() => <View style={styles.suggestionDivider} />}
            ListEmptyComponent={
              locationPickerQuery.length >= 2 && !suggestionsLoading ? (
                <View style={styles.noSuggestionsContainer}>
                  <Text style={styles.noSuggestionsText}>No results found</Text>
                </View>
              ) : null
            }
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [styles.suggestionRow, pressed && { backgroundColor: Colors.surface }]}
                onPress={() => {
                  console.log("🔍 [AUTOCOMPLETE] Selected suggestion:", JSON.stringify(item, null, 2));
                  selectSuggestion(item);                }}
              >
                <View style={styles.suggestionIcon}>
                  <Ionicons name="location-outline" size={18} color={Colors.textSecondary} />
                </View>
                <View style={styles.suggestionText}>
                  <Text style={styles.suggestionMain} numberOfLines={1}>{item.mainText}</Text>
                  {item.secondaryText ? (
                    <Text style={styles.suggestionSecondary} numberOfLines={1}>{item.secondaryText}</Text>
                  ) : null}
                </View>
              </Pressable>
            )}
          />
        </View>
      </Modal>

      <Modal visible={showVehicleSheet} transparent animationType="slide" onRequestClose={() => setShowVehicleSheet(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowVehicleSheet(false)}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 16) }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Select Vehicle Category</Text>
            {VEHICLE_TYPES.map((vt) => (
              <Pressable
                key={vt.id}
                style={({ pressed }) => [
                  styles.vehicleOption,
                  selectedVehicle.id === vt.id && styles.vehicleOptionSelected,
                  pressed && { opacity: 0.8 },
                ]}
                onPress={() => {
                  setSelectedVehicle(vt);
                  setShowVehicleSheet(false);
                }}
              >
                <Ionicons name={vt.icon} size={22} color={Colors.white} />
                <View style={styles.vehicleOptionInfo}>
                  <View style={styles.vehicleOptionNameRow}>
                    <Text style={styles.vehicleOptionName}>{vt.name}</Text>
                    {"badge" in vt && vt.badge ? <Text style={styles.vehicleOptionBadge}>{vt.badge}</Text> : null}
                  </View>
                  <Text style={styles.vehicleOptionDesc}>{vt.desc}</Text>
                  <Text style={styles.vehicleOptionPrice}>R{vt.baseFare} + R{vt.pricePerKm}/km</Text>
                </View>
                {selectedVehicle.id === vt.id && (
                  <Ionicons name="checkmark-circle" size={22} color={Colors.white} />
                )}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Modal visible={showDebugLogModal} transparent animationType="slide" onRequestClose={() => setShowDebugLogModal(false)}>
        <View style={styles.profileModalOverlay}>
          <View style={[styles.debugLogModalSheet, { paddingBottom: insets.bottom + 16 }]}> 
            <View style={styles.sheetHandle} />
            <View style={styles.debugLogHeader}>
              <View style={styles.debugLogHeaderTextWrap}>
                <Text style={styles.debugLogTitle}>Autocomplete Debug Log</Text>
                <Text style={styles.debugLogSubtitle}>Tap the bug icon anytime to reopen this viewer while testing search.</Text>
              </View>
              <View style={styles.debugLogHeaderActions}>
                <Pressable style={styles.debugLogActionBtn} onPress={clearAutocompleteDebugEntries}>
                  <Text style={styles.debugLogActionText}>Clear</Text>
                </Pressable>
                <Pressable style={styles.debugLogCloseBtn} onPress={() => setShowDebugLogModal(false)}>
                  <Ionicons name="close" size={18} color={Colors.textMuted} />
                </Pressable>
              </View>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.debugLogScrollContent}
              keyboardShouldPersistTaps="handled"
            >
              {debugLogEntries.length === 0 ? (
                <View style={styles.debugLogEmptyState}>
                  <Ionicons name="pulse-outline" size={24} color={Colors.textMuted} />
                  <Text style={styles.debugLogEmptyTitle}>No events yet</Text>
                  <Text style={styles.debugLogEmptyText}>Type into the destination search and the app will record backend results, filtered suggestions, and selection resolution here.</Text>
                </View>
              ) : (
                debugLogEntries.map((entry) => (
                  <View key={entry.id} style={styles.debugLogCard}>
                    <View style={styles.debugLogCardHeader}>
                      <Text style={styles.debugLogStage}>{entry.stage}</Text>
                      <Text style={styles.debugLogTimestamp}>
                        {new Date(entry.createdAt).toLocaleTimeString("en-ZA", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                          hour12: false,
                        })}
                      </Text>
                    </View>
                    <Text selectable style={styles.debugLogPayload}>{JSON.stringify(entry.payload, null, 2)}</Text>
                  </View>
                ))
              )}
            </ScrollView>
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    zIndex: 10,
  },
  headerBrand: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  brandName: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
    letterSpacing: 2,
  },
  brandSlogan: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
    paddingLeft: 8,
  },
  bellBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  debugBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  notifBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#FF3B30",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  notifBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    lineHeight: 12,
  },
  mapArea: {
    flex: 1,
    overflow: "hidden",
  },
  bottomSheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 90,
    gap: 12,
  },
  searchingBottomSheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 90,
    gap: 10,
  },
  confirmingSheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    // Cap height so map stays visible, but allow scroll for all content
    maxHeight: "75%",
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  confirmingHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  dismissBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmingScroll: {
    rowGap: 16,
    paddingTop: 12,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: Colors.accent,
    borderRadius: 2,
    alignSelf: "center",
  selfieNudgeBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,224,102,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,224,102,0.3)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 4,
  },
  selfieNudgeTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#FFE066",
  },
  selfieNudgeBody: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,224,102,0.7)",
    marginTop: 1,
  },
    marginBottom: 4,
  },
  sheetTitle: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 4,
  },
  dotGreen: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.success,
  },
  dotRed: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.error,
  },
  locationText: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.white,
  },
  locationInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.white,
    backgroundColor: Colors.surface,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  // Tappable location card on idle sheet
  locationInputsCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    overflow: "hidden",
  },
  locationInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  locationInputInner: {
    flex: 1,
  },
  locationInputLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.textMuted,
    marginBottom: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  locationInputValue: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.white,
  },
  locationDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginLeft: 38,
  },
  // Full-screen location picker modal
  locationPickerContainer: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
  locationPickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  locationPickerTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  locationPickerInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    margin: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
    borderRadius: 14,
  },
  locationPickerInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.white,
  },
  currentLocationBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  currentLocationText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.white,
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 14,
  },
  suggestionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  suggestionText: {
    flex: 1,
  },
  suggestionMain: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.white,
  },
  suggestionSecondary: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginTop: 2,
  },
  suggestionDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginLeft: 70,
  },
  noSuggestionsContainer: {
    paddingVertical: 40,
    alignItems: "center",
  },
  noSuggestionsText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  vehicleSelector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.surface,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  vehicleName: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: Colors.white,
  },
  vehiclePrice: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginTop: 1,
  },
  confirmBtn: {
    backgroundColor: Colors.white,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center",
  },
  confirmBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.primary,
  },
  priceCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    gap: 4,
  },
  priceLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  priceValue: {
    fontSize: 36,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
  },
  priceCurrency: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  distanceInfo: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 4,
  },
  tripInfoPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(39,110,241,0.15)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginTop: 8,
    gap: 6,
  },
  tripInfoText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#276EF1",
  },
  tripInfoSep: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#276EF1",
    opacity: 0.6,
  },
  estimateBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  estimateBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(39,110,241,0.12)",
  },
  estimateBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.primary,
  },
  estimateBadgeMuted: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  estimateBadgeMutedText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.white,
  },
  routeChoiceSection: {
    gap: 10,
  },
  routeChoiceHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
  },
  routeChoiceTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  routeChoiceHeaderText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  routeChoiceScroller: {
    gap: 10,
    paddingRight: 8,
  },
  routeChoiceCard: {
    width: 188,
    borderRadius: 16,
    padding: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    gap: 8,
  },
  routeChoiceCardSelected: {
    backgroundColor: "rgba(39,110,241,0.14)",
    borderColor: "rgba(39,110,241,0.5)",
  },
  routeChoiceTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  routeChoiceIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  routeChoiceIconWrapSelected: {
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  routeChoiceBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  routeChoiceBadgeSelected: {
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  routeChoiceBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textMuted,
  },
  routeChoiceBadgeTextSelected: {
    color: Colors.primary,
  },
  routeChoiceCardTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  routeChoiceCardTitleSelected: {
    color: Colors.white,
  },
  routeChoiceCardSubtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    minHeight: 32,
  },
  routeChoiceCardSubtitleSelected: {
    color: "rgba(255,255,255,0.72)",
  },
  routeChoiceMeta: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.white,
  },
  routeChoiceMetaSelected: {
    color: Colors.white,
  },
  routeChoiceFare: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
  },
  routeChoiceFareSelected: {
    color: Colors.white,
  },
  highDemandBadge: {
    marginTop: 10,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(255,193,7,0.14)",
  },
  highDemandBadgeText: {
    color: Colors.warning,
    fontFamily: "Inter_700Bold",
    fontSize: 12,
  },
  fareBreakdown: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  fareRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  fareLabel: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  fareValue: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  routeSummary: {
    gap: 4,
    paddingLeft: 4,
  },
  routeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  routeLine: {
    width: 2,
    height: 16,
    backgroundColor: Colors.accent,
    marginLeft: 4,
  },
  routeText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  selectionMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  selectionMetaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  selectionMetaText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  btnRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  cancelBtn: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  requestBtn: {
    backgroundColor: Colors.white,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center",
  },
  requestBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.primary,
  },
  searchingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 4,
  },
  searchingText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  searchingSubtext: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginTop: 1,
  },
  nearbyEtaPill: {
    position: "absolute",
    bottom: 16,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0,0,0,0.82)",
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  nearbyEtaDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#22c55e",
  },
  nearbyEtaText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  routeInfoOverlay: {
    position: "absolute",
    top: 16,
    right: 16,
    alignItems: "flex-end",
    gap: 6,
    pointerEvents: "none",
  },
  arrivalPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#1a1a1a",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  arrivalPillText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },
  routeMetaPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.75)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  routeMetaText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "rgba(255,255,255,0.85)",
  },
  routeMetaSep: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.5)",
  },
  // Map overlay while searching — like Uber's pulsing animation
  searchingMapOverlay: {
    position: "absolute",
    top: "30%",
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  searchingPulseRing: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  searchingPulseRing2: {
    position: "absolute",
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  searchingMapCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.white,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  searchingMapTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.primary,
  },
  searchingMapSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 1,
  },
  // Live driver notification banner
  liveNotifBanner: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    backgroundColor: "rgba(0,0,0,0.92)",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    zIndex: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 12,
    gap: 10,
  },
  liveNotifRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  liveCarIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.success,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  liveNotifInfo: {
    flex: 1,
    gap: 2,
  },
  liveNotifTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  liveNotifVehicle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  liveNotifPlate: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
    letterSpacing: 0.5,
  },
  liveEtaBox: {
    alignItems: "center",
    minWidth: 44,
    flexShrink: 0,
  },
  liveEtaNum: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
    lineHeight: 28,
  },
  liveEtaUnit: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginTop: -2,
  },
  liveProgressTrack: {
    height: 4,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 2,
    overflow: "hidden",
  },
  liveProgressFill: {
    height: 4,
    borderRadius: 2,
  },
  // Vehicle color badge
  plateChip: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  colorBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  colorDotCircle: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  cancelRideActiveBtn: {
    marginTop: 12,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.error,
    alignItems: "center",
  },
  cancelRideActiveBtnText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.error,
  },
  cancelFullBtn: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cancelFullBtnText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  noDriversContainer: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 12,
  },
  noDriversTitle: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  noDriversSubtext: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  retryBtn: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: Colors.white,
    marginTop: 8,
  },
  retryBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.primary,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  chauffeurCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  chauffeurAvatarBtn: {
    position: "relative",
  },
  chauffeurAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  viewProfileBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: Colors.surface,
  },
  profileModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  profileModalSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: "90%",
  },
  debugLogModalSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: "88%",
  },
  debugLogHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 16,
  },
  debugLogHeaderTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  debugLogHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  debugLogTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  debugLogSubtitle: {
    marginTop: 4,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    lineHeight: 17,
  },
  debugLogActionBtn: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  debugLogActionText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  debugLogCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
  },
  debugLogScrollContent: {
    gap: 12,
    paddingBottom: 12,
  },
  debugLogEmptyState: {
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 36,
    paddingHorizontal: 16,
    backgroundColor: Colors.background,
    borderRadius: 16,
  },
  debugLogEmptyTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  debugLogEmptyText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 18,
  },
  debugLogCard: {
    backgroundColor: Colors.background,
    borderRadius: 16,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  debugLogCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  debugLogStage: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  debugLogTimestamp: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  debugLogPayload: {
    fontSize: 11,
    lineHeight: 16,
    color: Colors.textSecondary,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
  profileModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  profileModalTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  profileCloseBtn: {
    padding: 4,
  },
  profileLoadingContainer: {
    paddingVertical: 40,
    alignItems: "center",
    gap: 12,
  },
  profileLoadingText: {
    color: Colors.textMuted,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  profileHero: {
    alignItems: "center",
    paddingVertical: 16,
    gap: 8,
  },
  profileAvatarLarge: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  profileAvatarImg: {
    width: 90,
    height: 90,
    borderRadius: 45,
  },
  profileDriverName: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
  },
  profileVehicle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  profilePlateChip: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 4,
  },
  profilePlateText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
    letterSpacing: 1,
  },
  profileHighlights: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
  },
  profileHighlightChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  profileHighlightText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  profileStatsRow: {
    flexDirection: "row",
    backgroundColor: Colors.background,
    borderRadius: 16,
    marginBottom: 20,
    overflow: "hidden",
  },
  profileStatBox: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 16,
    gap: 4,
  },
  profileStatDivider: {
    width: 1,
    backgroundColor: Colors.surface,
    marginVertical: 12,
  },
  profileStatValue: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
  },
  profileStatLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  profileDistribution: {
    marginBottom: 24,
    gap: 8,
  },
  profileSectionTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
    marginBottom: 8,
  },
  distRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  distLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textMuted,
    width: 12,
    textAlign: "right",
  },
  distBarBg: {
    flex: 1,
    height: 8,
    backgroundColor: Colors.background,
    borderRadius: 4,
    flexDirection: "row",
    overflow: "hidden",
  },
  distBarFill: {
    backgroundColor: Colors.warning,
    borderRadius: 4,
  },
  distCount: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    width: 20,
    textAlign: "right",
  },
  profileReviews: {
    gap: 12,
  },
  reviewCard: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  reviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  reviewAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  reviewAvatarText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  reviewerName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  reviewDate: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginTop: 1,
  },
  reviewStars: {
    flexDirection: "row",
    gap: 2,
  },
  reviewComment: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 20,
    paddingLeft: 44,
  },
  noReviewsContainer: {
    paddingVertical: 32,
    alignItems: "center",
    gap: 8,
  },
  noReviewsText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  chauffeurInfo: {
    flex: 1,
    gap: 2,
  },
  chauffeurTapHint: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginTop: 4,
  },
  chauffeurName: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  chauffeurVehicle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  driverMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  ratingChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(255,183,77,0.15)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  ratingChipText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: Colors.warning,
  },
  plateText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.textMuted,
  },
  colorDot: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  chauffeurActions: {
    flexDirection: "row",
    gap: 8,
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  tripPriceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  tripPriceLabel: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  tripPriceValue: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
  },
  completedContainer: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 16,
  },
  checkCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.success,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  completedTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
  },
  completedPrice: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
  },
  settlementCard: {
    width: "100%",
    gap: 8,
    marginTop: 8,
    borderRadius: 12,
    padding: 12,
    backgroundColor: Colors.surface,
  },
  settlementRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  settlementLabel: { color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 13 },
  settlementValue: { color: Colors.white, fontFamily: "Inter_700Bold", fontSize: 13 },
  settlementNote: { color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17, marginTop: 2 },
  waitingNotice: { color: Colors.warning, fontFamily: "Inter_600SemiBold", fontSize: 12, lineHeight: 17, textAlign: "center", marginTop: 4 },
  completedLabel: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    gap: 12,
  },
  vehicleOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "transparent",
  },
  vehicleOptionSelected: {
    borderColor: Colors.white,
  },
  vehicleOptionInfo: {
    flex: 1,
    gap: 2,
  },
  vehicleOptionNameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  vehicleOptionName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  vehicleOptionBadge: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: Colors.accent,
    textTransform: "uppercase",
  },
  vehicleOptionDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  vehicleOptionPrice: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
    marginTop: 2,
  },
  ratingContainer: {
    alignItems: "center",
    gap: 16,
    paddingVertical: 8,
  },
  ratingLabel: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  starsContainer: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  starButton: {
    padding: 4,
  },
  commentContainer: {
    gap: 8,
  },
  commentLabel: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  commentInput: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.white,
    minHeight: 80,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  ratingSheetKeyboard: {
    ...StyleSheet.absoluteFillObject,
  },
  ratingSheetOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  ratingSheetScrollContent: {
    flexGrow: 1,
    justifyContent: "flex-end",
  },
  ratingSheetCard: {
    marginTop: 24,
  },
  ratingActions: {
    flexDirection: "row",
    gap: 12,
  },
  skipButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  skipButtonText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  submitRatingButton: {
    flex: 1,
    backgroundColor: Colors.white,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  submitRatingButtonDisabled: {
    opacity: 0.5,
  },
  submitRatingButtonText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.primary,
  },
  payMethodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 8,
  },
  payMethodIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  payMethodName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  payMethodSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginTop: 2,
  },
  paymentContextRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  paymentContextChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  paymentContextText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.white,
  },
  cashSelfiePromptOverlay: {
    flex: 1,
    backgroundColor: "rgba(4,10,18,0.76)",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  cashSelfiePromptCard: {
    backgroundColor: "#07111B",
    borderRadius: 28,
    padding: 22,
    borderWidth: 1,
    borderColor: "rgba(127,214,255,0.18)",
    shadowColor: "#000",
    shadowOpacity: 0.32,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 18,
  },
  cashSelfiePromptClose: {
    alignSelf: "flex-end",
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    marginBottom: 8,
  },
  cashSelfieHero: {
    height: 220,
    borderRadius: 24,
    backgroundColor: "#0E2233",
    overflow: "hidden",
    marginBottom: 18,
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  cashSelfieGlowPrimary: {
    position: "absolute",
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: "rgba(255,184,77,0.22)",
    top: -22,
    left: -28,
  },
  cashSelfieGlowAccent: {
    position: "absolute",
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: "rgba(84,201,255,0.18)",
    bottom: -80,
    right: -40,
  },
  cashSelfieIllustrationRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  cashSelfieCharacter: {
    width: 120,
    height: 146,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  cashSelfieCharacterHead: {
    position: "absolute",
    top: 16,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#FFCF99",
    alignItems: "center",
    justifyContent: "center",
  },
  cashSelfieCharacterEye: {
    position: "absolute",
    top: 23,
    left: 18,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#2B211A",
  },
  cashSelfieCharacterEyeRight: {
    position: "absolute",
    top: 23,
    right: 18,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#2B211A",
  },
  cashSelfieCharacterSmile: {
    position: "absolute",
    bottom: 16,
    width: 18,
    height: 8,
    borderBottomWidth: 2,
    borderColor: "#2B211A",
    borderRadius: 8,
  },
  cashSelfieCharacterBody: {
    width: 86,
    height: 74,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    backgroundColor: "#F2A93B",
  },
  cashSelfieCharacterArm: {
    position: "absolute",
    right: 4,
    top: 72,
    width: 36,
    height: 14,
    borderRadius: 10,
    backgroundColor: "#FFCF99",
    transform: [{ rotate: "-20deg" }],
  },
  cashSelfiePhone: {
    width: 128,
    height: 166,
    borderRadius: 26,
    backgroundColor: "#04101A",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 10,
    justifyContent: "center",
  },
  cashSelfiePhoneNotch: {
    alignSelf: "center",
    width: 46,
    height: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginBottom: 10,
  },
  cashSelfiePhoneScreen: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: "#17344D",
    alignItems: "center",
    justifyContent: "center",
  },
  cashSelfiePhoneAvatarHead: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#FFE0B8",
    marginBottom: 8,
  },
  cashSelfiePhoneAvatarBody: {
    width: 62,
    height: 58,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    backgroundColor: "#7FD6FF",
  },
  cashSelfiePhoneSparkle: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  cashSelfiePromptEyebrow: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    color: "#7FD6FF",
    marginBottom: 8,
  },
  cashSelfiePromptTitle: {
    fontSize: 25,
    lineHeight: 31,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    marginBottom: 10,
  },
  cashSelfiePromptBody: {
    fontSize: 14,
    lineHeight: 22,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.76)",
  },
  cashSelfieBenefitList: {
    gap: 10,
    marginTop: 18,
  },
  cashSelfieBenefitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  cashSelfieBenefitIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFE066",
  },
  cashSelfieBenefitText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: "Inter_500Medium",
    color: "#F4F8FB",
  },
  cashSelfieActionRow: {
    gap: 12,
    marginTop: 18,
  },
  cashSelfieSecondaryButton: {
    minHeight: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  cashSelfieSecondaryButtonText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "rgba(255,255,255,0.84)",
  },
  cashSelfiePrimaryButton: {
    minHeight: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#FFE066",
  },
  cashSelfiePrimaryButtonText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#07111B",
  },
  cashSelfieSavingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(4,10,18,0.78)",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  cashSelfieSavingText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },
  livenessContainer: {
    flex: 1,
    backgroundColor: Colors.primary,
    paddingHorizontal: 18,
  },
  livenessHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
  },
  livenessTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  livenessCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  livenessHeadline: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
  },
  livenessBodyText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  livenessFareNote: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.warning,
  },
  livenessMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  livenessMetaText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.textMuted,
  },
  challengeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  challengeText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  livenessPreviewWrap: {
    marginTop: 14,
    backgroundColor: Colors.surface,
    borderRadius: 18,
    overflow: "hidden",
    height: 220,
    alignItems: "center",
    justifyContent: "center",
  },
  livenessPreviewImg: {
    width: "100%",
    height: 220,
  },
  livenessPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  livenessPlaceholderText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textMuted,
  },
  livenessPassedBadge: {
    position: "absolute",
    bottom: 10,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(110,232,110,0.15)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(110,232,110,0.4)",
  },
  livenessPassedText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#6EE86E",
  },
  livenessStatusText: {
    marginTop: 12,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  livenessActions: {
    marginTop: 16,
    gap: 10,
    paddingBottom: 24,
    paddingTop: 4,
  },
  livenessBtnSecondary: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  livenessBtnSecondaryText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  livenessBtnPrimary: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
  },
  livenessBtnDisabled: {
    opacity: 0.5,
  },
  livenessBtnPrimaryText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: Colors.primary,
  },
});
