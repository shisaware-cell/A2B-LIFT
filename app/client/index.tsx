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
  AppState,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
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
import LiftClubMembershipRequiredModal from "@/components/LiftClubMembershipRequiredModal";
import { VEHICLE_CATEGORY_PRICING, getBillableDistanceKm, normalizeVehicleType } from "@shared/fare-policy";
import { encodeStopsQuery, normalizeRideStops, type RideStop } from "@shared/ride-stops";

const CATEGORY_SEDAN_ART = require("../../assets/images/category-sedan.png");
const CATEGORY_LUXURY_ART = require("../../assets/images/category-luxury.png");
const CATEGORY_VIP_ART = require("../../assets/images/category-vip.png");
const CATEGORY_VAN_ART = require("../../assets/images/category-van.png");
const CATEGORY_A2B_LITE_ART = require("../../assets/images/category-a2b-lite.png");
const CATEGORY_V_CLASS_ART = require("../../assets/images/category-v-class.png");

const VEHICLE_TYPES = [
  { id: "a2b_lite", name: "A2B Lite", desc: "Hyundai i10 and similar compact cars", artwork: CATEGORY_A2B_LITE_ART, ...VEHICLE_CATEGORY_PRICING.a2b_lite, badge: "cheapest" },
  { id: "budget", name: "Budget", desc: "Toyota Corolla, Toyota Quest", artwork: CATEGORY_SEDAN_ART, ...VEHICLE_CATEGORY_PRICING.budget, badge: "recommended" },
  { id: "luxury_van", name: "V-Class", desc: "Mercedes-Benz V-Class", artwork: CATEGORY_V_CLASS_ART, ...VEHICLE_CATEGORY_PRICING.luxury_van, badge: "premium" },
  { id: "luxury", name: "Luxury", desc: "BMW 3 Series, Mercedes C-Class", artwork: CATEGORY_LUXURY_ART, ...VEHICLE_CATEGORY_PRICING.luxury },
  { id: "business", name: "VIP", desc: "BMW 5/7 Series, Mercedes E/S-Class", artwork: CATEGORY_VIP_ART, ...VEHICLE_CATEGORY_PRICING.business },
  { id: "van", name: "Van", desc: "Hyundai H1, Mercedes Vito, Staria", artwork: CATEGORY_VAN_ART, ...VEHICLE_CATEGORY_PRICING.van },
];

function getRideVehicle(vehicleType: unknown) {
  const normalizedId = normalizeVehicleType(vehicleType as any);
  return VEHICLE_TYPES.find((vehicle) => vehicle.id === normalizedId) || null;
}

type RideStatus = "idle" | "selecting" | "confirming" | "requested" | "assigned" | "arriving" | "in_trip" | "completed" | "no_drivers";

type NearbyDriverState = { id: string; lat: number; lng: number; heading?: number };
type LocationPickerTarget = "pickup" | "dropoff" | number;

function getActiveRideTarget(ride: any) {
  const rideStops = normalizeRideStops(ride?.stops);
  const completedStopCount = Math.max(
    0,
    Math.min(rideStops.length, Number(ride?.completedStopCount || 0)),
  );
  const nextStop = rideStops[completedStopCount];
  return nextStop
    ? {
        type: "stop" as const,
        index: completedStopCount,
        totalStops: rideStops.length,
        address: nextStop.address || `Stop ${completedStopCount + 1}`,
        lat: nextStop.lat,
        lng: nextStop.lng,
      }
    : {
        type: "dropoff" as const,
        index: completedStopCount,
        totalStops: rideStops.length,
        address: ride?.dropoffAddress || "Final destination",
        lat: Number(ride?.dropoffLat),
        lng: Number(ride?.dropoffLng),
      };
}

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
  currency: string;
  surgeMultiplier?: number;
  surgeReason?: string | null;
  highDemand?: boolean;
  surgeAmount?: number;
  perMinuteRate?: number;
  includedKm?: number;
}

interface CategoryPriceEstimate {
  totalPrice: number;
  baseFare: number;
  pricePerKm: number;
  lateNightPremium: number;
  currency: string;
  surgeMultiplier?: number;
  surgeReason?: string | null;
  highDemand?: boolean;
  surgeAmount?: number;
  perMinuteRate?: number;
  includedKm?: number;
}

type CategoryPricingMatrix = Record<string, Record<string, CategoryPriceEstimate>>;

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
  if (routeId === "safest_route") return "Safest (Highway)";
  return "Fastest";
}

function getPaymentMethodLabel(method?: string | null): string {
  if (method === "card") return "Card";
  if (method === "wallet") return "Wallet";
  if (method === "pay_later") return "Pay Later";
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
      title: "Fastest",
      subtitle: "Quickest arrival time",
      badge: "Fastest",
      icon: "flash-outline",
    },
  ];

  // Safest is the Highway route / main arterials with highway preference
  const safestCandidate = [...uniqueRoutes]
    .filter((route) => route.polyline !== fastestRoute.polyline)
    .sort((a, b) => calculateRouteSafetyScore(a) - calculateRouteSafetyScore(b) || b.distanceKm - a.distanceKm)[0];

  const safestRoute = safestCandidate || {
    ...fastestRoute,
    summary: fastestRoute.summary ? `${fastestRoute.summary} (Highway)` : "Highway / Main Arterials",
  };

  selected.push({
    id: "safest_route",
    route: safestRoute,
    title: "Safest",
    subtitle: "Highway & main arterials",
    badge: "Highway",
    icon: "shield-checkmark-outline",
  });

  return selected;
}

function calculateFallbackEstimate(distanceKm: number, vehicle: { baseFare: number; pricePerKm: number; includedKm?: number }, isLateNight: boolean) {
  const baseFare = Math.round(vehicle.baseFare);
  const distanceFare = Math.round(getBillableDistanceKm(distanceKm, vehicle.includedKm) * vehicle.pricePerKm);
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

function formatVehicleRate(vehicle: { baseFare: number; pricePerKm: number; includedKm?: number }) {
  return vehicle.includedKm
    ? `R${vehicle.baseFare} for the first ${vehicle.includedKm} km, then R${vehicle.pricePerKm}/km`
    : `R${vehicle.baseFare} base + R${vehicle.pricePerKm}/km`;
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
const JHB_FALLBACK = { lat: -26.2041, lng: 28.0473 };
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


function generateNearbyFleetCars(center: { lat: number; lng: number }): NearbyDriverState[] {
  const offsets = [
    { dLat: 0.0052, dLng: 0.0045, heading: 42 },
    { dLat: -0.0061, dLng: 0.0039, heading: 138 },
    { dLat: 0.0046, dLng: -0.0058, heading: 224 },
    { dLat: -0.0038, dLng: -0.0042, heading: 312 },
  ];

  return offsets.map((off, index) => ({
    id: `fleet-car-${index + 1}`,
    lat: Number((center.lat + off.dLat).toFixed(6)),
    lng: Number((center.lng + off.dLng).toFixed(6)),
    heading: off.heading,
  }));
}

function mergeNearbyDrivers(current: NearbyDriverState[], incoming: NearbyDriverState[]) {
  const sortedIncoming = [...incoming].sort((left, right) => left.id.localeCompare(right.id));
  const currentById = new Map(current.map((driver) => [driver.id, driver]));

  const next = sortedIncoming.map((driver) => {
    const existing = currentById.get(driver.id);
    if (
      existing &&
      !hasLocationShift(existing, driver, DRIVER_MARKER_SHIFT_KM) &&
      existing.heading === driver.heading
    ) {
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
  const contextTabBarHeight = React.useContext(BottomTabBarHeightContext);
  const tabBarHeight = typeof contextTabBarHeight === "number" ? contextTabBarHeight : 60;
  const { user, refreshUser, clearSession } = useAuth();
  const isLiftClubMember = user?.liftClubMembership?.status === "approved" || user?.liftClubMembership?.isApproved;
  const { on, off } = useSocket();
  const bottomPanelOffset = Math.max(12, tabBarHeight - insets.bottom + 12);
  const bottomPanelPadding = insets.bottom + 20;
  const idleBottomSheetPadding = Math.max(insets.bottom + (Platform.OS === "ios" ? 10 : 6), 16);

  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [pickupAddress, setPickupAddress] = useState("Current Location");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [dropoffCoords, setDropoffCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [stops, setStops] = useState<RideStop[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState(VEHICLE_TYPES[0]);
  const [rideStatus, setRideStatus] = useState<RideStatus>("idle");
  const [estimatedPrice, setEstimatedPrice] = useState<number | null>(null);
  const [estimatedDistance, setEstimatedDistance] = useState<number | null>(null);
  const [lateNightPremium, setLateNightPremium] = useState<number>(0);
  const [routeChoices, setRouteChoices] = useState<RouteChoice[]>([]);
  const [categoryPricing, setCategoryPricing] = useState<CategoryPricingMatrix>({});
  const [selectedRouteId, setSelectedRouteId] = useState<RouteChoiceId | null>(null);
  const [currentRide, setCurrentRide] = useState<any>(null);
  const [showVehicleSheet, setShowVehicleSheet] = useState(false);
  const [chauffeurDetails, setChauffeurDetails] = useState<ChauffeurDetails | null>(null);
  const [routePolyline, setRoutePolyline] = useState<string | null>(null);
  const [tripDurationText, setTripDurationText] = useState<string | null>(null);
  const [tripDurationMin, setTripDurationMin] = useState<number | null>(null);
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number; heading?: number; speed?: number } | null>(null);
  const lastLiveRouteRefreshRef = useRef<{ lat: number; lng: number; time: number } | null>(null);
  const [etaText, setEtaText] = useState<string | null>(null);
  const [showRating, setShowRating] = useState(false);
  const [rating, setRating] = useState<number>(0);
  const [ratingComment, setRatingComment] = useState<string>("");
  const [submittingRating, setSubmittingRating] = useState(false);
  const [onlineDrivers, setOnlineDrivers] = useState<NearbyDriverState[]>([]);
  const [showPaymentPicker, setShowPaymentPicker] = useState(false);
  const [showLiftClubGate, setShowLiftClubGate] = useState(false);
  const [paymentMethodsLoading, setPaymentMethodsLoading] = useState(false);
  const [estimatingFare, setEstimatingFare] = useState(false);
  const [rideRequestLoading, setRideRequestLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "wallet" | "pay_later">("cash");
  const [payLaterApplication, setPayLaterApplication] = useState<any>(null);
  const [showCashSelfiePrompt, setShowCashSelfiePrompt] = useState(false);
  const [showCashSelfieCamera, setShowCashSelfieCamera] = useState(false);
  const [cashSelfieSaving, setCashSelfieSaving] = useState(false);
  const [showActiveStopsEditor, setShowActiveStopsEditor] = useState(false);
  const [savingActiveStops, setSavingActiveStops] = useState(false);
  const [savedCards, setSavedCards] = useState<{ id: string; last4: string; cardType: string; isDefault: boolean }[]>([]);
  // Reserve-a-ride (advance booking)
  const [showReservePicker, setShowReservePicker] = useState(false);
  const [reserveDayOffset, setReserveDayOffset] = useState(0);
  const [reserveSlot, setReserveSlot] = useState<string | null>(null);
  const [reserveSubmitting, setReserveSubmitting] = useState(false);

  // Driver profile modal
  const [showDriverProfile, setShowDriverProfile] = useState(false);
  const [driverProfile, setDriverProfile] = useState<DriverProfile | null>(null);
  const [driverProfileLoading, setDriverProfileLoading] = useState(false);

  // Notification badge
  const [unreadCount, setUnreadCount] = useState(0);
  const [isTripSheetMinimized, setIsTripSheetMinimized] = useState(false);
  const [showTripOptionsMenu, setShowTripOptionsMenu] = useState(false);

  // Live driver ETA notification state
  const [liveEtaMin, setLiveEtaMin] = useState<number | null>(null);
  const [initialEtaMin, setInitialEtaMin] = useState<number | null>(null);
  const [clientWaitingElapsedSec, setClientWaitingElapsedSec] = useState(0);

  // ETA to nearest available driver (shown on map in idle/selecting state)
  const [nearestDriverEta, setNearestDriverEta] = useState<string | null>(null);
  const [showDebugLogModal, setShowDebugLogModal] = useState(false);
  const [debugLogEntries, setDebugLogEntries] = useState<AutocompleteDebugEntry[]>([]);

  // Location picker modal
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);
  const [locationPickerTarget, setLocationPickerTarget] = useState<LocationPickerTarget>("dropoff");
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
  const clientCancellationRideIdRef = useRef<string | null>(null);
  const selectedRouteChoice = routeChoices.find((choice) => choice.id === selectedRouteId) || routeChoices[0] || null;

  useEffect(() => {
    if (!__DEV__) return;

    return subscribeAutocompleteDebugEntries(setDebugLogEntries);
  }, []);

  useEffect(() => {
    currentRideRef.current = currentRide;
  }, [currentRide]);

  // ─── 5-Minute Waiting Countdown Timer ─────────────────────────────────────
  useEffect(() => {
    const isArrived = currentRide?.status === "chauffeur_arrived" || rideStatus === "arriving";
    if (!isArrived) {
      setClientWaitingElapsedSec(0);
      return;
    }
    const arrivedAt = currentRide?.arrivedAt ? new Date(currentRide.arrivedAt).getTime() : Date.now();
    const updateWaiting = () => {
      const elapsed = Math.max(0, Math.floor((Date.now() - arrivedAt) / 1000));
      setClientWaitingElapsedSec(elapsed);
    };
    updateWaiting();
    const interval = setInterval(updateWaiting, 1000);
    return () => clearInterval(interval);
  }, [currentRide?.id, currentRide?.status, currentRide?.arrivedAt, rideStatus]);

  useEffect(() => {
    requestLocation();
    // Persist mode so app reopens to the correct screen
    AsyncStorage.getItem("a2b_last_mode")
      .then((mode) => {
        if (mode !== "lift_club") {
          return AsyncStorage.setItem("a2b_last_mode", "client");
        }
      })
      .catch(() => {});
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
      const center = location || mapPickupLocation || JHB_FALLBACK;
      try {
        const res = await apiRequest("GET", "/api/chauffeurs");
        const all = await res.json();
        const realOnline = (all as any[])
          .filter(
            (c: any) =>
              c.isOnline &&
              c.isApproved &&
              c.lat != null &&
              c.lng != null &&
              !isNaN(Number(c.lat)) &&
              !isNaN(Number(c.lng)),
          )
          .map((c: any) => ({
            id: String(c.id),
            lat: Number(c.lat),
            lng: Number(c.lng),
            heading: typeof c.heading === "number" ? c.heading : (typeof c.bearing === "number" ? c.bearing : 0),
          }));

        const nearbyReal = center
          ? realOnline.filter((d) => haversineDistance(center.lat, center.lng, d.lat, d.lng) <= 4)
          : realOnline;

        if (nearbyReal.length > 0) {
          setOnlineDrivers((prev) => mergeNearbyDrivers(prev, nearbyReal));
        } else if (center) {
          const fleetCars = generateNearbyFleetCars(center);
          setOnlineDrivers((prev) => mergeNearbyDrivers(prev, fleetCars));
        }
      } catch {
        if (center) {
          const fleetCars = generateNearbyFleetCars(center);
          setOnlineDrivers((prev) => mergeNearbyDrivers(prev, fleetCars));
        }
      }
    }
    fetchOnlineDrivers();
    const interval = setInterval(fetchOnlineDrivers, 15000);
    return () => clearInterval(interval);
  }, [location?.lat, location?.lng, mapPickupLocation?.lat, mapPickupLocation?.lng]);

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
    } else if (!dropoffCoords) {
      setRoutePolyline(null);
    }
  }, [location?.lat, location?.lng, dropoffCoords?.lat, dropoffCoords?.lng]);

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

  function openLocationPicker(target: LocationPickerTarget) {
    const current = target === "pickup"
      ? pickupAddress
      : target === "dropoff"
        ? dropoffAddress
        : stops[target]?.address || "";
    setLocationPickerTarget(target);
    setLocationPickerQuery(current === CURRENT_LOCATION_LABEL ? "" : current);
    setLocationSuggestions([]);
    placesSessionTokenRef.current = null;
    latestAutocompleteQueryRef.current = "";
    autocompleteRequestIdRef.current += 1;
    setLocationPickerVisible(true);
  }

  function addStop() {
    const index = stops.length;
    setStops((current) => [
      ...current,
      { id: `stop-${Date.now()}-${index}`, address: "", lat: Number.NaN, lng: Number.NaN },
    ]);
    setTimeout(() => openLocationPicker(index), 0);
  }

  function removeStop(index: number) {
    setStops((current) => current.filter((_, stopIndex) => stopIndex !== index));
  }

  function openActiveStopsEditor() {
    if (!currentRide) return;
    setStops(normalizeRideStops(currentRide.stops));
    setShowActiveStopsEditor(true);
  }

  async function saveActiveStops() {
    if (!currentRide || savingActiveStops) return;
    const normalizedStops = normalizeRideStops(stops);
    if (normalizedStops.length !== stops.length) {
      Alert.alert("Complete every stop", "Choose an address for each stop or remove the empty stop.");
      return;
    }

    try {
      setSavingActiveStops(true);
      const res = await apiRequest("PUT", `/api/rides/${currentRide.id}/stops`, {
        stops: normalizedStops,
      });
      const updatedRide = await res.json();
      setCurrentRide((previous: any) => ({ ...previous, ...updatedRide }));
      setEstimatedPrice(Number(updatedRide.price || estimatedPrice || 0));
      setEstimatedDistance(Number(updatedRide.distanceKm || estimatedDistance || 0));
      setShowActiveStopsEditor(false);
      Alert.alert(
        "Stops Updated",
        `Your driver has been notified. The updated fare is R ${Number(updatedRide.price || 0).toFixed(0)}.`,
      );
    } catch (error: any) {
      Alert.alert("Could not update stops", error?.message || "Please try again.");
    } finally {
      setSavingActiveStops(false);
    }
  }

  function isActiveAutocompleteRequest(requestId: number, query: string) {
    return autocompleteRequestIdRef.current === requestId && latestAutocompleteQueryRef.current === query;
  }

  function applyLocationSuggestions(
    requestId: number,
    query: string,
    target: LocationPickerTarget,
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
    if (typeof locationPickerTarget === "number") {
      setStops((current) => current.map((stop, index) =>
        index === locationPickerTarget ? { ...stop, lat: Number.NaN, lng: Number.NaN } : stop
      ));
    }
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
        if (dropoffCoords) {
          void fetchRouteChoices(coords, dropoffCoords).then((choices) => {
            if (choices && choices.length > 0) {
              setRideStatus("confirming");
            }
          }).catch(() => {});
        }
      } else if (locationPickerTarget === "dropoff") {
        setDropoffCoords(coords);
        setDropoffAddress(address);
        if (location) {
          void fetchRouteChoices(location, coords).then((choices) => {
            if (choices && choices.length > 0) {
              setRideStatus("confirming");
            }
          }).catch(() => {});
        }
      } else {
        const stopIndex = locationPickerTarget;
        setStops((current) => current.map((stop, index) =>
          index === stopIndex ? { ...stop, address, ...coords } : stop
        ));
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
      const wasCancelledHere = clientCancellationRideIdRef.current === ride.id;
      if (wasCancelledHere) clientCancellationRideIdRef.current = null;
      AsyncStorage.removeItem("a2b_client_active_ride").catch(() => {});
      setCurrentRide(null);
      setRideStatus("idle");
      setRoutePolyline(null);
      setDriverLocation(null);
      setEtaText(null);
      setLiveEtaMin(null);
      setInitialEtaMin(null);
      setChauffeurDetails(null);
      if (!wasCancelledHere) {
        const cancelledBy = String(ride.cancelledBy || "driver");
        Alert.alert(
          "Ride Cancelled",
          cancelledBy === "driver"
            ? "Your driver cancelled the ride. You can request another vehicle now."
            : "Your ride was cancelled. You can request another vehicle now.",
          [{ text: "OK" }],
        );
      }
      return;
    }
    const rideVehicle = getRideVehicle(ride.vehicleType);
    if (rideVehicle) setSelectedVehicle(rideVehicle);
    setCurrentRide(ride);
    if (ride.chauffeurDetails) {
      setChauffeurDetails(ride.chauffeurDetails);
      if (ride.chauffeurDetails.lat && ride.chauffeurDetails.lng) {
        setDriverLocation({
          lat: Number(ride.chauffeurDetails.lat),
          lng: Number(ride.chauffeurDetails.lng),
          heading: ride.chauffeurDetails.heading,
        });
      }
    }
    if (!["trip_completed", "cancelled"].includes(ride.status)) {
      AsyncStorage.setItem("a2b_client_active_ride", JSON.stringify(ride)).catch(() => {});
    }
    if (ride.status === "chauffeur_assigned") {
      setRideStatus("assigned");
      setLiveEtaMin(null);
      setInitialEtaMin(null);
      if (ride.chauffeurId) {
        fetchChauffeurDetails(ride.chauffeurId);
        // Fetch driver's current location to show route from driver → pickup
        apiRequest("GET", `/api/chauffeurs/${ride.chauffeurId}`).then(r => r.json()).then((c: any) => {
          if (c.lat && c.lng && ride.pickupLat && ride.pickupLng) {
            const driverLoc = { lat: c.lat, lng: c.lng, heading: c.heading };
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
    } else if (ride.status === "chauffeur_arriving") {
      setRideStatus("arriving");
    } else if (ride.status === "trip_started") {
      setRideStatus("in_trip");
      const activeTarget = getActiveRideTarget(ride);
      // Keep both rider and driver focused on the same next stop or destination.
      if (activeTarget.lat && activeTarget.lng) {
        setDriverLocation((prev) => {
          if (prev) fetchRoute(prev, { lat: activeTarget.lat, lng: activeTarget.lng });
          return prev;
        });
      }
    } else if (ride.status === "trip_completed") {
      setRideStatus("completed");
      setDriverLocation(null);
      setEtaText(null);
      setLiveEtaMin(null);
      setInitialEtaMin(null);
      AsyncStorage.removeItem("a2b_client_active_ride").catch(() => {});
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/rides/client"] });
    }
  }, []);

  const restoreClientActiveRide = useCallback(async () => {
    if (!user?.id) return;
    try {
      // 1. Try local storage first for instant restore
      const localRideJson = await AsyncStorage.getItem("a2b_client_active_ride");
      if (localRideJson) {
        try {
          const localRide = JSON.parse(localRideJson);
          if (localRide?.id && !["trip_completed", "cancelled"].includes(localRide.status)) {
            setCurrentRide(localRide);
            currentRideRef.current = localRide;
            applyRideUpdate(localRide);
          }
        } catch {}
      }

      // 2. Query server for active ride
      const activeRes = await apiRequest("GET", `/api/rides/client-active/${user.id}`);
      if (activeRes.status === 200) {
        const activeRide = await activeRes.json();
        if (activeRide?.id && !["trip_completed", "cancelled"].includes(activeRide.status)) {
          setCurrentRide(activeRide);
          currentRideRef.current = activeRide;
          await AsyncStorage.setItem("a2b_client_active_ride", JSON.stringify(activeRide));
          applyRideUpdate(activeRide);
          if (activeRide.pickupLat && activeRide.pickupLng) {
            setPickupLocation({
              lat: Number(activeRide.pickupLat),
              lng: Number(activeRide.pickupLng),
              address: activeRide.pickupAddress || "Pickup",
            });
          }
          if (activeRide.dropoffLat && activeRide.dropoffLng) {
            setDropoffLocation({
              lat: Number(activeRide.dropoffLat),
              lng: Number(activeRide.dropoffLng),
              address: activeRide.dropoffAddress || "Destination",
            });
          }
          if (activeRide.status === "requested" || activeRide.status === "searching") {
            setRideStatus("requested");
          }
          return;
        }
      } else if (activeRes.status === 204) {
        await AsyncStorage.removeItem("a2b_client_active_ride");
      }
    } catch (e: any) {
      console.log("[client-restore] active ride check:", e?.message || e);
    }
  }, [user?.id, applyRideUpdate]);

  useEffect(() => {
    restoreClientActiveRide();
  }, [user?.id, restoreClientActiveRide]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        restoreClientActiveRide();
      }
    });
    return () => subscription.remove();
  }, [restoreClientActiveRide]);

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
      if (currentRide && String(data.chauffeurId) === String(currentRide.chauffeurId)) {
        const driverLoc = {
          lat: Number(data.lat),
          lng: Number(data.lng),
          heading: typeof data.heading === "number" && !isNaN(data.heading) ? data.heading : undefined,
          speed: typeof data.speed === "number" && !isNaN(data.speed) ? data.speed : undefined,
        };
        setDriverLocation(driverLoc);

        // Recompute live ETA from driver to client (assigned/arriving) or to dropoff (in_trip)
        const isTripInProgress = rideStatus === "in_trip";
        const destLat = isTripInProgress
          ? parseFloat(currentRide.dropoffLat)
          : location?.lat ?? parseFloat(currentRide.pickupLat);
        const destLng = isTripInProgress
          ? parseFloat(currentRide.dropoffLng)
          : location?.lng ?? parseFloat(currentRide.pickupLng);

        const distKm = haversineDistance(driverLoc.lat, driverLoc.lng, destLat, destLng);
        const etaMin = Math.max(1, Math.round((distKm / 30) * 60));
        setEtaText(etaMin <= 1 ? "Arriving now" : `${etaMin} min away`);
        // Update live ETA for notification banner
        setLiveEtaMin(etaMin);
        setInitialEtaMin(prev => prev ?? etaMin);

        // Live route polyline refresh as driver moves
        const now = Date.now();
        const lastRefresh = lastLiveRouteRefreshRef.current;
        const movedKm = lastRefresh ? haversineDistance(driverLoc.lat, driverLoc.lng, lastRefresh.lat, lastRefresh.lng) : 1;
        if (!lastRefresh || (now - lastRefresh.time > 15000 && movedKm > 0.08)) {
          lastLiveRouteRefreshRef.current = { lat: driverLoc.lat, lng: driverLoc.lng, time: now };
          fetchRoute(driverLoc, { lat: destLat, lng: destLng });
        }
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
      const stopsQuery = encodeStopsQuery(normalizeRideStops(stops));
      const res = await apiRequest("GET",
        `/api/directions?originLat=${origin.lat}&originLng=${origin.lng}&destLat=${dest.lat}&destLng=${dest.lng}${stopsQuery ? `&stops=${encodeURIComponent(stopsQuery)}` : ""}`
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

  async function fetchCategoryPricing(
    routes: Array<{ id: string; distanceKm: number; durationMin: number }>,
    origin: { lat: number; lng: number },
  ): Promise<CategoryPricingMatrix> {
    try {
      const response = await apiRequest("POST", "/api/pricing/options", {
        routes,
        pickupLat: origin.lat,
        pickupLng: origin.lng,
      });
      const data = await response.json();
      return data?.estimates && typeof data.estimates === "object" ? data.estimates : {};
    } catch {
      return {};
    }
  }

  function mergeRoutePrice(choice: RouteChoice, estimate?: CategoryPriceEstimate): RouteChoice {
    if (!estimate) return choice;
    return {
      ...choice,
      fare: Number(estimate.totalPrice ?? choice.fare),
      baseFare: Number(estimate.baseFare ?? choice.baseFare),
      pricePerKm: Number(estimate.pricePerKm ?? choice.pricePerKm),
      includedKm: Number(estimate.includedKm ?? choice.includedKm ?? 0),
      lateNightPremium: Number(estimate.lateNightPremium ?? choice.lateNightPremium),
      currency: estimate.currency || choice.currency,
      surgeMultiplier: Number(estimate.surgeMultiplier || 1),
      surgeReason: estimate.surgeReason || null,
      highDemand: !!estimate.highDemand,
      surgeAmount: Number(estimate.surgeAmount || 0),
      perMinuteRate: Number(estimate.perMinuteRate || 1),
    };
  }

  function selectEstimatedVehicle(vehicle: (typeof VEHICLE_TYPES)[number]) {
    setSelectedVehicle(vehicle);
    const pricesForVehicle = categoryPricing[vehicle.id];
    if (!pricesForVehicle || routeChoices.length === 0) return;

    const pricedChoices = routeChoices.map((choice) =>
      mergeRoutePrice(choice, pricesForVehicle[choice.id]),
    );
    setRouteChoices(pricedChoices);
    const activeChoice = pricedChoices.find((choice) => choice.id === selectedRouteId) || pricedChoices[0];
    if (activeChoice) applyRouteChoice(activeChoice);
  }

  async function fetchRouteChoices(origin: { lat: number; lng: number }, dest: { lat: number; lng: number }) {
    let data: any = null;

    try {
      const stopsQuery = encodeStopsQuery(normalizeRideStops(stops));
      const res = await apiRequest(
        "GET",
        `/api/directions?originLat=${origin.lat}&originLng=${origin.lng}&destLat=${dest.lat}&destLng=${dest.lng}${stopsQuery ? `&stops=${encodeURIComponent(stopsQuery)}` : ""}`
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
      if (data?.polyline) {
        approximateChoice.polyline = data.polyline;
      }
      if (data?.distanceKm) {
        approximateChoice.distanceKm = Number(data.distanceKm);
        approximateChoice.distanceText = data.distanceText || `${Math.round(data.distanceKm)} km`;
      }
      if (data?.durationMin) {
        approximateChoice.durationMin = Number(data.durationMin);
        approximateChoice.durationText = data.durationText || `${Math.round(data.durationMin)} min`;
      }
      const pricing = await fetchCategoryPricing([{
        id: approximateChoice.id,
        distanceKm: approximateChoice.distanceKm,
        durationMin: approximateChoice.durationMin,
      }], origin);
      setCategoryPricing(pricing);
      const pricedApproximateChoice = mergeRoutePrice(
        approximateChoice,
        pricing[selectedVehicle.id]?.[approximateChoice.id],
      );
      setRouteChoices([pricedApproximateChoice]);
      applyRouteChoice(pricedApproximateChoice);
      return [pricedApproximateChoice];
    }

    const lateNightRide = isLateNightWindow();
    const pricing = await fetchCategoryPricing(
      choiceDescriptors.map(({ id, route }) => ({
        id,
        distanceKm: route.distanceKm,
        durationMin: route.durationMin,
      })),
      origin,
    );
    setCategoryPricing(pricing);

    const fallbackChoices = choiceDescriptors.map(({ id, route, title, subtitle, badge, icon }) => {
      const fallbackEstimate = calculateFallbackEstimate(route.distanceKm, selectedVehicle, lateNightRide);
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
        currency: fallbackEstimate.currency,
      } as RouteChoice;
    });

    let choices = fallbackChoices.map((choice) =>
      mergeRoutePrice(choice, pricing[selectedVehicle.id]?.[choice.id]),
    );

    if (Object.keys(pricing).length === 0) {
      choices = await Promise.all(choiceDescriptors.map(async ({ id, route, title, subtitle, badge, icon }) => {
        const fallbackEstimate = calculateFallbackEstimate(route.distanceKm, selectedVehicle, lateNightRide);

        try {
          const estimateRes = await apiRequest("POST", "/api/pricing/estimate", {
            distanceKm: route.distanceKm,
            categoryId: selectedVehicle.id,
            isLateNight: lateNightRide,
            pickupLat: origin.lat,
            pickupLng: origin.lng,
            durationMin: route.durationMin,
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
            currency: estimate.currency || fallbackEstimate.currency,
            surgeMultiplier: Number(estimate.surgeMultiplier || 1),
            surgeReason: estimate.surgeReason || null,
            highDemand: !!estimate.highDemand,
            surgeAmount: Number(estimate.surgeAmount || 0),
            perMinuteRate: Number(estimate.perMinuteRate || 1),
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
            currency: fallbackEstimate.currency,
          } as RouteChoice;
        }
      }));
    }

    setRouteChoices(choices);
    const existingChoice = choices.find((c) => c.id === selectedRouteId);
    const chosen = existingChoice || choices[0];
    if (chosen) {
      applyRouteChoice(chosen);
    }
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
    if (estimatingFare) return;
    if (!dropoffAddress.trim()) {
      Alert.alert("Enter Destination", "Please enter your dropoff location");
      return;
    }
    if (!location) {
      Alert.alert("Location Error", "Unable to determine your location");
      return;
    }
    if (normalizeRideStops(stops).length !== stops.length) {
      Alert.alert("Complete every stop", "Choose an address for each stop or remove the empty stop.");
      return;
    }
    setEstimatingFare(true);
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
    } finally {
      setEstimatingFare(false);
    }
  }

  async function requestRide() {
    if (!user || !location || !dropoffCoords) return;
    if (!selectedRouteChoice) {
      Alert.alert("Choose a Route", "Select a route option before requesting your ride.");
      return;
    }
    setShowPaymentPicker(true);
    setPaymentMethodsLoading(true);
    try {
      const [res, payLaterRes] = await Promise.all([
        apiRequest("GET", "/api/payments/cards"),
        apiRequest("GET", "/api/pay-later/me").catch(() => null),
      ]);
      const cards = await res.json();
      setSavedCards(Array.isArray(cards) ? cards : []);
      if (payLaterRes?.ok) {
        const payLater = await payLaterRes.json();
        setPayLaterApplication(payLater?.application || null);
      }
    } catch (error) {
      if (isUnauthorizedError(error)) {
        await handleUnauthorizedRideRequest();
        return;
      }
      setSavedCards([]);
    } finally {
      setPaymentMethodsLoading(false);
    }
  }

  async function createRideRecord(
    method: "cash" | "card" | "wallet" | "pay_later",
    extras: Record<string, unknown> = {},
  ) {
    if (!user || !location || !dropoffCoords) return null;
    const activeRouteChoice = selectedRouteChoice;
    const distanceKm = activeRouteChoice?.distanceKm || estimatedDistance || 10;
    const requestedVehicleType = selectedVehicle.id;
    const res = await apiRequest("POST", "/api/rides", {
      clientId: user.id,
      pickupLat: location.lat,
      pickupLng: location.lng,
      pickupAddress,
      dropoffLat: dropoffCoords.lat,
      dropoffLng: dropoffCoords.lng,
      dropoffAddress,
      vehicleType: requestedVehicleType,
      distanceKm,
      paymentMethod: method,
      paymentStatus: method === "cash" ? "unpaid" : "pending",
      durationMin: activeRouteChoice?.durationMin || tripDurationMin || undefined,
      selectedRouteId: activeRouteChoice?.id || undefined,
      selectedRouteDistanceKm: activeRouteChoice?.distanceKm || undefined,
      actualFare: activeRouteChoice?.fare || estimatedPrice || undefined,
      routeCurrency: activeRouteChoice?.currency || "ZAR",
      stops: normalizeRideStops(stops),
      isLateNight: new Date().getHours() >= 22 || new Date().getHours() < 5,
      ...extras,
    });
    const payload = await res.json();
    const ride = payload.ride ?? payload;
    const confirmedVehicle = getRideVehicle(ride?.vehicleType);
    if (confirmedVehicle) setSelectedVehicle(confirmedVehicle);
    return ride;
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
  async function proceedWithRide(method: "cash" | "card" | "wallet" | "pay_later") {
    if (rideRequestLoading) return;
    setRideRequestLoading(true);
    setChauffeurDetails(null);
    setDriverLocation(null);
    setLiveEtaMin(null);
    setInitialEtaMin(null);
    setEtaText(null);
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
        refreshUser().catch(() => {});
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        return;
      }

      if (method === "pay_later") {
        setCurrentRide(ride);
        setRideStatus("requested");
        queryClient.invalidateQueries({ queryKey: ["/api/rides/client", user!.id] });
        setPayLaterApplication((current: any) => current ? {
          ...current,
          availableCredit: Math.max(0, Number(current.availableCredit || 0) - Number(ride.price || estimatedPrice || 0)),
        } : current);
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
    } finally {
      setRideRequestLoading(false);
    }
  }

  async function handlePayAndRide(method: "cash" | "card" | "wallet" | "pay_later") {
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

  // ─── Reserve a ride (advance booking, card only, 50% cancellation fee) ────
  function getReserveSlots(dayOffset: number): string[] {
    const slots: string[] = [];
    const minTime = Date.now() + 45 * 60 * 1000;
    const day = new Date();
    day.setDate(day.getDate() + dayOffset);
    for (let h = 0; h < 24; h++) {
      for (const m of [0, 30]) {
        const slot = new Date(day);
        slot.setHours(h, m, 0, 0);
        if (slot.getTime() < minTime) continue;
        slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
      }
    }
    return slots;
  }

  function getReserveDate(): Date | null {
    if (!reserveSlot) return null;
    const [h, m] = reserveSlot.split(":").map(Number);
    const d = new Date();
    d.setDate(d.getDate() + reserveDayOffset);
    d.setHours(h, m, 0, 0);
    return d;
  }

  async function handleReserveRide() {
    const when = getReserveDate();
    const fare = selectedRouteChoice?.fare ?? estimatedPrice ?? 0;
    if (!when || !user || !location || !dropoffCoords) return;
    const defaultCard = savedCards.find((c) => c.isDefault) || savedCards[0];
    if (!defaultCard) {
      Alert.alert("Card required", "Reservations are paid by card. Add a card in your wallet first.", [
        { text: "Go to Wallet", onPress: () => { setShowReservePicker(false); router.push("/client/wallet"); } },
        { text: "Cancel", style: "cancel" },
      ]);
      return;
    }
    setReserveSubmitting(true);
    try {
      const ride = await createRideRecord("card", { scheduledFor: when.toISOString() });
      if (!ride?.id) throw new Error("Could not create reservation");
      const chargeRes = await apiRequest("POST", "/api/payments/charge-ride", { rideId: ride.id });
      const chargeData = await chargeRes.json().catch(() => ({}));
      if (!chargeData.success) {
        await apiRequest("PUT", `/api/rides/${ride.id}/status`, { status: "cancelled" }).catch(() => {});
        Alert.alert("Payment failed", chargeData.message || "Your card could not be charged.");
        return;
      }
      setShowReservePicker(false);
      setReserveSlot(null);
      setRideStatus("idle");
      setDropoffAddress("");
      setDropoffCoords(null);
      setStops([]);
      setRouteChoices([]);
      setSelectedRouteId(null);
      setRoutePolyline(null);
      queryClient.invalidateQueries({ queryKey: ["/api/rides/client", user.id] });
      Alert.alert(
        "Ride reserved ✓",
        `Your ride is booked for ${when.toLocaleString("en-ZA", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })} and R${Number(fare).toFixed(2)} was charged to your card.\n\nIf you cancel, 50% (R${(Number(fare) / 2).toFixed(2)}) is kept as a cancellation fee and 50% is refunded. You can manage it under Trips.`,
      );
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (err: any) {
      if (isUnauthorizedError(err)) {
        await handleUnauthorizedRideRequest();
        return;
      }
      Alert.alert("Error", (err?.message || "Could not reserve your ride.").replace(/^\d+:\s*/, ""));
    } finally {
      setReserveSubmitting(false);
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

  async function cancelRide() {
    let appliedFee = 0;
    if (currentRide) {
      clientCancellationRideIdRef.current = currentRide.id;
      try {
        const response = await apiRequest("PUT", `/api/rides/${currentRide.id}/status`, { status: "cancelled" });
        const cancelledRide = await response.json();
        appliedFee = Math.max(0, Number(cancelledRide?.cancellationFee || 0));
      } catch (error: any) {
        clientCancellationRideIdRef.current = null;
        Alert.alert("Cancellation failed", error?.message || "The trip could not be cancelled. Please try again.");
        return;
      }
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
    setStops([]);
    setRoutePolyline(null);
    setTripDurationText(null);
    setTripDurationMin(null);
    setDriverLocation(null);
    setChauffeurDetails(null);
    setEtaText(null);
    setLiveEtaMin(null);
    setInitialEtaMin(null);
    Alert.alert(
      "Ride cancelled",
      appliedFee > 0
        ? `A smart-pricing cancellation fee of R${appliedFee.toFixed(2)} was charged.`
        : "Your ride has been cancelled.",
    );
  }

  function getCancellationWarningText() {
    const acceptedAt = currentRide?.acceptedAt ? new Date(currentRide.acceptedAt).getTime() : null;
    const elapsedMin = acceptedAt ? (Date.now() - acceptedAt) / 60000 : 0;
    const baseFare = Number(currentRide?.baseFare || selectedRouteChoice?.baseFare || selectedVehicle.baseFare || 0);
    if (acceptedAt && elapsedMin >= 3 && baseFare > 0) {
      const unadjustedFare =
        baseFare +
        getBillableDistanceKm(
          currentRide?.distanceKm,
          selectedVehicle.includedKm,
        ) * Number(currentRide?.pricePerKm || selectedVehicle.pricePerKm || 0);
      const lockedFare = Number(currentRide?.quotedFare || currentRide?.price || 0);
      const pricingMultiplier = unadjustedFare > 0 ? Math.max(1, lockedFare / unadjustedFare) : 1;
      const estimatedFee = baseFare * pricingMultiplier;
      return `The driver has been assigned for more than 3 minutes. Cancelling now will charge approximately R${estimatedFee.toFixed(2)} using this ride's locked smart pricing. Waiting fees may also apply after arrival.`;
    }
    return "Are you sure you want to cancel this ride?";
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
    setStops([]);
    setChauffeurDetails(null);
    setRoutePolyline(null);
    setDriverLocation(null);
    setEtaText(null);
    setShowRating(false);
    setRating(0);
    setRatingComment("");
  }

  const ridePickupLocation = currentRide
    ? {
        lat: Number(currentRide.pickupLat),
        lng: Number(currentRide.pickupLng),
      }
    : null;
  const rideDropoffLocation = currentRide
    ? {
        lat: Number(currentRide.dropoffLat),
        lng: Number(currentRide.dropoffLng),
      }
    : null;
  const validRidePickup =
    ridePickupLocation &&
    Number.isFinite(ridePickupLocation.lat) &&
    Number.isFinite(ridePickupLocation.lng)
      ? ridePickupLocation
      : null;
  const validRideDropoff =
    rideDropoffLocation &&
    Number.isFinite(rideDropoffLocation.lat) &&
    Number.isFinite(rideDropoffLocation.lng)
      ? rideDropoffLocation
      : null;
  const mapPickupLocation = location || validRidePickup || JHB_FALLBACK;
  const mapDropoffLocation = dropoffCoords || validRideDropoff;
  const mapStops = normalizeRideStops(currentRide?.stops || stops);
  const mapHasLiveRideFocus =
    rideStatus === "assigned" ||
    rideStatus === "arriving" ||
    rideStatus === "in_trip";

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) }]}>
      {/* Top Header / Active Ride Floating Controls (Image 4) */}
      {(rideStatus === "assigned" || rideStatus === "arriving" || rideStatus === "in_trip") ? (
        <View style={styles.guideTopBar}>
          <Pressable
            style={styles.guideCollapseBtn}
            onPress={() => setIsTripSheetMinimized(!isTripSheetMinimized)}
            hitSlop={8}
            accessibilityLabel="Toggle Trip Details"
          >
            <Ionicons name={isTripSheetMinimized ? "chevron-up" : "chevron-down"} size={22} color={Colors.white} />
          </Pressable>
          <Pressable
            style={styles.guideSafetyPill}
            onPress={() => router.push("/client/safety")}
            hitSlop={8}
          >
            <Ionicons name="shield-checkmark" size={16} color="#3B82F6" />
            <Text style={styles.guideSafetyText}>Safety</Text>
          </Pressable>
        </View>
      ) : (
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
      )}

      <View style={styles.mapArea}>
        <A2BMap
          pickupLocation={mapPickupLocation}
          dropoffLocation={mapDropoffLocation}
          stopLocations={mapStops}
          activeStopIndex={
            rideStatus === "in_trip"
              ? Number(currentRide?.completedStopCount || 0)
              : undefined
          }
          driverLocation={driverLocation}
          nearbyDrivers={onlineDrivers}
          routePolyline={routePolyline}
          showDriver={rideStatus === "assigned" || rideStatus === "arriving" || rideStatus === "in_trip"}
          followDriver={rideStatus === "arriving" || rideStatus === "in_trip"}
          loading={locationLoading && !location}
          initialZoom={mapHasLiveRideFocus ? "street" : "city"}
          mapMode="dark"
          etaText={etaText || undefined}
          statusText={
            rideStatus === "in_trip" ? "Trip In Progress" : undefined
          }
        />

        {isLiftClubMember && (
          <View style={styles.liftClubMapBadge}>
            <Ionicons name="ribbon" size={14} color="#2A1D00" />
            <Text style={styles.liftClubMapBadgeText}>Lift Club Member</Text>
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
                  {[chauffeurDetails?.carMake, chauffeurDetails?.vehicleModel].filter(Boolean).join(" ")
                    || (currentRide?.vehicleType ? (getRideVehicle(currentRide.vehicleType)?.name || currentRide.vehicleType) : null)
                    || selectedVehicle.name}
                  {chauffeurDetails?.carColor ? ` (${chauffeurDetails.carColor})` : ""}
                  {chauffeurDetails?.plateNumber ? `  ·  ${chauffeurDetails.plateNumber}` : ""}
                </Text>
              </View>
              <View style={styles.liveEtaBox}>
                <Text style={styles.liveEtaNum}>
                  {liveEtaMin !== null ? (liveEtaMin <= 1 ? "<1" : String(liveEtaMin)) : "—"}
                </Text>
                <Text style={styles.liveEtaUnit}>min</Text>
              </View>
            </View>
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

              {stops.map((stop, index) => (
                <React.Fragment key={stop.id}>
                  <View style={styles.stopInputRow}>
                    <Pressable style={styles.stopInputMain} onPress={() => openLocationPicker(index)}>
                      <View style={styles.stopNumber}>
                        <Text style={styles.stopNumberText}>{index + 1}</Text>
                      </View>
                      <View style={styles.locationInputInner}>
                        <Text style={styles.locationInputLabel}>Stop {index + 1}</Text>
                        <Text style={[styles.locationInputValue, !stop.address && { color: Colors.textMuted }]} numberOfLines={1}>
                          {stop.address || "Choose stop location"}
                        </Text>
                      </View>
                    </Pressable>
                    <Pressable style={styles.removeStopBtn} onPress={() => removeStop(index)} hitSlop={8}>
                      <Ionicons name="close-circle" size={20} color={Colors.textMuted} />
                    </Pressable>
                  </View>
                  <View style={styles.locationDivider} />
                </React.Fragment>
              ))}

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

            <Pressable style={styles.addStopBtn} onPress={addStop}>
              <Ionicons name="add-circle-outline" size={18} color={Colors.white} />
              <Text style={styles.addStopText}>Add stop</Text>
            </Pressable>

            <Pressable
              style={styles.vehicleSelector}
              onPress={() => setShowVehicleSheet(true)}
            >
              <Image
                source={selectedVehicle.artwork}
                style={styles.selectedVehicleArtwork}
                resizeMode="contain"
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.vehicleName}>{selectedVehicle.name}</Text>
                <View style={styles.vehicleMetaRow}>
                  <Text style={styles.vehiclePrice}>{formatVehicleRate(selectedVehicle)}</Text>
                  <View style={styles.passengerCapacity}>
                    <Ionicons name="people-outline" size={13} color={Colors.textMuted} />
                    <Text style={styles.passengerCapacityText}>{selectedVehicle.maxPassengers}</Text>
                  </View>
                </View>
              </View>
              <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.confirmBtn,
                estimatingFare && { opacity: 0.7 },
                pressed && !estimatingFare && { opacity: 0.9, transform: [{ scale: 0.98 }] },
              ]}
              onPress={getEstimate}
              disabled={estimatingFare}
            >
              {estimatingFare ? (
                <>
                  <ActivityIndicator size="small" color={Colors.primary} />
                  <Text style={styles.confirmBtnText}>Calculating route...</Text>
                </>
              ) : (
                <Text style={styles.confirmBtnText}>Get Estimated Fare</Text>
              )}
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
            <View style={styles.categoryFareSection}>
              <View style={styles.categoryFareHeader}>
                <Text style={styles.categoryFareTitle}>Choose your ride</Text>
                <Text style={styles.categoryFareSubtitle}>
                  {tripDurationText || "Estimated arrival"} · {estimatedDistance || 0} km
                </Text>
              </View>
              {VEHICLE_TYPES.map((vehicle) => {
                const routeId = selectedRouteChoice?.id || routeChoices[0]?.id;
                const liveEstimate = routeId ? categoryPricing[vehicle.id]?.[routeId] : null;
                const fallbackEstimate = calculateFallbackEstimate(
                  estimatedDistance || 0,
                  vehicle,
                  isLateNightWindow(),
                );
                const fare = Number(liveEstimate?.totalPrice ?? fallbackEstimate.totalPrice);
                const isSelected = vehicle.id === selectedVehicle.id;
                return (
                  <Pressable
                    key={vehicle.id}
                    style={({ pressed }) => [
                      styles.categoryFareRow,
                      isSelected && styles.categoryFareRowSelected,
                      pressed && { opacity: 0.86 },
                    ]}
                    onPress={() => selectEstimatedVehicle(vehicle)}
                  >
                    <View style={styles.categoryFareIcon}>
                      <Image
                        source={vehicle.artwork}
                        style={styles.categoryFareArtwork}
                        resizeMode="contain"
                      />
                    </View>
                    <View style={styles.categoryFareInfo}>
                      <View style={styles.categoryFareNameRow}>
                        <Text style={styles.categoryFareName}>{vehicle.name}</Text>
                        {"badge" in vehicle && vehicle.badge ? (
                          <Text style={styles.categoryFareBadge}>{vehicle.badge}</Text>
                        ) : null}
                      </View>
                      <Text style={styles.categoryFareMeta} numberOfLines={1}>{vehicle.desc}</Text>
                      <View style={styles.categoryFareDetails}>
                        <View style={styles.passengerCapacity}>
                          <Ionicons name="people-outline" size={13} color={Colors.textMuted} />
                          <Text style={styles.passengerCapacityText}>{vehicle.maxPassengers}</Text>
                        </View>
                        <Text style={styles.categoryFareRate} numberOfLines={1}>{formatVehicleRate(vehicle)}</Text>
                      </View>
                    </View>
                    <View style={styles.categoryFarePriceWrap}>
                      <Text style={styles.categoryFarePrice}>R {fare.toFixed(0)}</Text>
                      {isSelected ? <Ionicons name="checkmark-circle" size={18} color={Colors.success} /> : null}
                    </View>
                  </Pressable>
                );
              })}
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
                <Text style={styles.fareLabel}>Chargeable distance ({getBillableDistanceKm(estimatedDistance, selectedRouteChoice?.includedKm ?? selectedVehicle.includedKm).toFixed(1)} km × R{selectedRouteChoice?.pricePerKm ?? selectedVehicle.pricePerKm})</Text>
                <Text style={styles.fareValue}>R {Math.round(getBillableDistanceKm(estimatedDistance, selectedRouteChoice?.includedKm ?? selectedVehicle.includedKm) * (selectedRouteChoice?.pricePerKm ?? selectedVehicle.pricePerKm))}</Text>
              </View>
              {lateNightPremium > 0 && (
                <View style={styles.fareRow}>
                  <Text style={styles.fareLabel}>Late night surcharge (30%)</Text>
                  <Text style={styles.fareValue}>R {lateNightPremium}</Text>
                </View>
              )}
              {selectedRouteChoice?.highDemand && (
                <View style={styles.fareRow}>
                  <Text style={styles.fareLabel}>{selectedRouteChoice.surgeReason || "High demand surcharge"}</Text>
                  <Text style={styles.fareValue}>R {Math.round(selectedRouteChoice.surgeAmount || 0)}</Text>
                </View>
              )}
              <View style={styles.fareRow}>
                <Text style={styles.fareLabel}>Traffic adjustment after estimate</Text>
                <Text style={styles.fareValue}>R {selectedRouteChoice?.perMinuteRate || 1}/min extra</Text>
              </View>
            </View>

            <View style={styles.routeSummary}>
              <View style={styles.routeRow}>
                <View style={styles.dotGreen} />
                <Text style={styles.routeText} numberOfLines={2}>{pickupAddress}</Text>
              </View>
              <View style={styles.routeLine} />
              {normalizeRideStops(stops).map((stop, index) => (
                <React.Fragment key={stop.id}>
                  <View style={styles.routeRow}>
                    <View style={styles.stopNumber}>
                      <Text style={styles.stopNumberText}>{index + 1}</Text>
                    </View>
                    <Text style={styles.routeText} numberOfLines={2}>{stop.address}</Text>
                  </View>
                  <View style={styles.routeLine} />
                </React.Fragment>
              ))}
              <View style={styles.routeRow}>
                <View style={styles.dotRed} />
                <Text style={styles.routeText} numberOfLines={2}>{dropoffAddress}</Text>
              </View>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.requestBtn,
                rideRequestLoading && { opacity: 0.7 },
                pressed && !rideRequestLoading && { opacity: 0.9 },
              ]}
              onPress={requestRide}
              disabled={rideRequestLoading}
            >
              {rideRequestLoading ? (
                <>
                  <ActivityIndicator size="small" color={Colors.primary} />
                  <Text style={styles.requestBtnText}>Requesting...</Text>
                </>
              ) : (
                <Text style={styles.requestBtnText}>Request Ride</Text>
              )}
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

      {(rideStatus === "assigned" || rideStatus === "arriving" || rideStatus === "in_trip") && (() => {
        const activeVehicleName = [chauffeurDetails?.carMake, chauffeurDetails?.vehicleModel].filter(Boolean).join(" ")
          || (currentRide?.vehicleType ? (getRideVehicle(currentRide.vehicleType)?.name || currentRide.vehicleType) : null)
          || selectedVehicle.name;

        if (isTripSheetMinimized) {
          return (
            <Animated.View entering={FadeInDown.duration(250)} style={[styles.minimizedTripSheet, { marginBottom: bottomPanelOffset, paddingBottom: Math.max(insets.bottom, 14) }]}>
              <Pressable style={styles.minimizedTripPressable} onPress={() => setIsTripSheetMinimized(false)}>
                <View style={styles.minimizedHandle} />
                <View style={styles.minimizedRow}>
                  <View style={styles.minimizedAvatarWrap}>
                    {chauffeurDetails?.profilePhoto ? (
                      <Image source={{ uri: chauffeurDetails.profilePhoto }} style={styles.minimizedAvatar} resizeMode="cover" />
                    ) : (
                      <Ionicons name="person" size={18} color={Colors.white} />
                    )}
                  </View>
                  <View style={styles.minimizedInfo}>
                    <Text style={styles.minimizedTitle} numberOfLines={1}>
                      {rideStatus === "assigned"
                        ? (liveEtaMin && liveEtaMin > 1 ? `Arriving in ${liveEtaMin} min` : "Driver Arriving now")
                        : rideStatus === "arriving"
                          ? "Driver has arrived"
                          : (() => {
                              const min = tripDurationMin && tripDurationMin > 0 ? tripDurationMin : 12;
                              const dropoffDate = new Date(Date.now() + min * 60 * 1000);
                              let hours = dropoffDate.getHours();
                              const minutes = dropoffDate.getMinutes();
                              const ampm = hours >= 12 ? "PM" : "AM";
                              hours = hours % 12 || 12;
                              const strMinutes = minutes < 10 ? "0" + minutes : String(minutes);
                              return `Dropoff at ${hours}:${strMinutes} ${ampm}`;
                            })()}
                    </Text>
                    <Text style={styles.minimizedSub} numberOfLines={1}>
                      {[chauffeurDetails?.driverName, activeVehicleName, chauffeurDetails?.plateNumber].filter(Boolean).join(" · ")}
                    </Text>
                  </View>
                  <View style={styles.minimizedActionGroup}>
                    <Pressable
                      style={styles.minimizedChatBtn}
                      onPress={(e) => {
                        e.stopPropagation?.();
                        if (currentRide?.id) {
                          router.push({ pathname: "/client/chat", params: { rideId: currentRide.id, driverName: chauffeurDetails?.driverName || "Driver" } });
                        }
                      }}
                    >
                      <Ionicons name="chatbubble" size={16} color={Colors.white} />
                    </Pressable>
                    <Pressable
                      style={styles.minimizedExpandBtn}
                      onPress={() => setIsTripSheetMinimized(false)}
                    >
                      <Ionicons name="chevron-up" size={20} color={Colors.white} />
                    </Pressable>
                  </View>
                </View>
              </Pressable>
            </Animated.View>
          );
        }

        return (
          <Animated.View entering={FadeInDown.duration(300)} style={[styles.bottomSheet, { marginBottom: bottomPanelOffset, paddingBottom: bottomPanelPadding }]}>
            <Pressable style={styles.sheetHandleWrap} onPress={() => setIsTripSheetMinimized(true)}>
              <View style={styles.sheetHandle} />
            </Pressable>

            {/* Header Time / ETA with Minimize button */}
            <Pressable style={styles.guideHeaderRow} onPress={() => setIsTripSheetMinimized(true)}>
              <Text style={styles.guideHeaderTitle}>
                {rideStatus === "assigned"
                  ? (liveEtaMin && liveEtaMin > 1 ? `Arriving in ${liveEtaMin} min` : "Driver Arriving now")
                  : rideStatus === "arriving"
                    ? "Driver has arrived"
                    : (() => {
                        const min = tripDurationMin && tripDurationMin > 0 ? tripDurationMin : 12;
                        const dropoffDate = new Date(Date.now() + min * 60 * 1000);
                        let hours = dropoffDate.getHours();
                        const minutes = dropoffDate.getMinutes();
                        const ampm = hours >= 12 ? "PM" : "AM";
                        hours = hours % 12 || 12;
                        const strMinutes = minutes < 10 ? "0" + minutes : String(minutes);
                        return `Dropoff at ${hours}:${strMinutes} ${ampm}`;
                      })()}
              </Text>
              <Pressable
                style={styles.guideHeaderMinimizeBtn}
                onPress={() => setIsTripSheetMinimized(true)}
                hitSlop={12}
              >
                <Ionicons name="chevron-down" size={22} color={Colors.white} />
              </Pressable>
            </Pressable>

            {/* Nested Details Card (Image 4) */}
            <View style={styles.guideCard}>
              <View style={styles.guideCardHeader}>
                <Text style={styles.guideCardSub}>
                  {activeVehicleName} details
                </Text>
                <Pressable
                  style={styles.guideDotsBtn}
                  onPress={() => setShowTripOptionsMenu(true)}
                  hitSlop={8}
                >
                  <Ionicons name="ellipsis-horizontal" size={18} color="#9CA3AF" />
                </Pressable>
              </View>

              <Text style={styles.guideCardHeading} numberOfLines={2}>
                Heading to {getActiveRideTarget(currentRide).address}
              </Text>

              <View style={styles.guideTagRow}>
                <View style={styles.guideTag}>
                  <Ionicons name="person" size={11} color="#9CA3AF" />
                  <Text style={styles.guideTagText}>Personal ride</Text>
                </View>
                <View style={styles.guideTag}>
                  <Ionicons
                    name={currentRide?.paymentMethod === "card" ? "card-outline" : currentRide?.paymentMethod === "wallet" ? "wallet-outline" : currentRide?.paymentMethod === "pay_later" ? "time-outline" : "cash-outline"}
                    size={11}
                    color="#9CA3AF"
                  />
                  <Text style={styles.guideTagText}>{getPaymentMethodLabel(currentRide?.paymentMethod)}</Text>
                </View>
              </View>

              {/* Driver Profile Row */}
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
                  {/* Show exact driver vehicle make + model */}
                  <Text style={styles.chauffeurVehicle}>
                    {activeVehicleName}
                  </Text>
                  {chauffeurDetails && (
                    <View style={styles.driverMeta}>
                      <View style={styles.ratingChip}>
                        <Ionicons name="star" size={11} color={Colors.warning} />
                        <Text style={styles.ratingChipText}>
                          {chauffeurDetails.driverRating !== null && chauffeurDetails.driverRating !== undefined
                            ? chauffeurDetails.driverRating.toFixed(1)
                            : "5.0"}
                        </Text>
                      </View>
                      {/* Plate number chip */}
                      <View style={styles.plateChip}>
                        <Text style={styles.plateText}>{chauffeurDetails.plateNumber || "A2B LIFT"}</Text>
                      </View>
                    </View>
                  )}
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
            </View>

            {(currentRide?.status === "chauffeur_arrived" || (rideStatus === "arriving" && currentRide?.arrivedAt)) && (
              <View style={[styles.clientWaitingBadge, clientWaitingElapsedSec >= 300 && styles.clientWaitingBadgeCharged]}>
                <Ionicons name="time" size={14} color={clientWaitingElapsedSec >= 300 ? "#F59E0B" : "#10B981"} />
                <Text style={[styles.clientWaitingText, clientWaitingElapsedSec >= 300 && styles.clientWaitingTextCharged]}>
                  {clientWaitingElapsedSec < 300
                    ? `Free waiting time: ${Math.floor((300 - clientWaitingElapsedSec) / 60)}:${String((300 - clientWaitingElapsedSec) % 60).padStart(2, "0")} remaining`
                    : `Waiting fee: +R ${(Math.ceil((clientWaitingElapsedSec - 300) / 60) * 1).toFixed(2)} (${Math.floor(clientWaitingElapsedSec / 60)}m)`}
                </Text>
              </View>
            )}

            {currentRide?.price && (
              <View style={styles.tripPriceRow}>
                <Text style={styles.tripPriceLabel}>Ride Price</Text>
                <Text style={styles.tripPriceValue}>R {currentRide.price}</Text>
              </View>
            )}

            {normalizeRideStops(currentRide?.stops).length > 0 && (
              <View style={styles.activeStopsCard}>
                <View style={styles.activeStopsHeader}>
                  <Text style={styles.activeStopsTitle}>
                    {normalizeRideStops(currentRide?.stops).length} trip stop{normalizeRideStops(currentRide?.stops).length === 1 ? "" : "s"}
                  </Text>
                  <Pressable style={styles.editStopsBtn} onPress={openActiveStopsEditor}>
                    <Ionicons name="create-outline" size={14} color={Colors.white} />
                    <Text style={styles.editStopsBtnText}>Edit stops</Text>
                  </Pressable>
                </View>
              </View>
            )}

            <Pressable
              style={styles.cancelRideActiveBtn}
              onPress={() => {
                if (Platform.OS === "web") {
                  if ((global as any).confirm?.("Are you sure you want to cancel this ride?") !== false) {
                    cancelRide();
                  }
                } else {
                  Alert.alert("Cancel Ride", getCancellationWarningText(), [
                    { text: "Keep Ride", style: "cancel" },
                    { text: "Cancel Ride", style: "destructive", onPress: cancelRide },
                  ]);
                }
              }}
            >
              <Text style={styles.cancelRideActiveBtnText}>Cancel Ride</Text>
            </Pressable>
          </Animated.View>
        );
      })()}

      {rideStatus === "completed" && !showRating && (
        <Animated.View entering={FadeInDown.duration(400)} style={[styles.bottomSheet, { marginBottom: bottomPanelOffset, paddingBottom: bottomPanelPadding }]}>
          <View style={styles.sheetHandle} />
          {currentRide?.paymentMethod === "cash" ? (
            <View style={styles.completedContainer}>
              <View style={[styles.checkCircle, { backgroundColor: "#10B981" }]}>
                <Ionicons name="cash" size={32} color={Colors.white} />
              </View>
              <Text style={styles.completedTitle}>Please Pay Cash</Text>
              <Text style={[styles.completedPrice, { color: "#10B981" }]}>R {currentRide?.price || estimatedPrice}</Text>
              <Text style={styles.cashPaymentInstruction}>
                Please hand R {currentRide?.price || estimatedPrice} in cash to {chauffeurDetails?.driverName || "your driver"} before exiting.
              </Text>
              {Number(currentRide?.perMinuteAdjustment || 0) > 0 && (
                <Text style={styles.completedLabel}>
                  Includes R {Math.round(Number(currentRide.perMinuteAdjustment))} traffic time adjustment.
                </Text>
              )}
            </View>
          ) : (
            <View style={styles.completedContainer}>
              <View style={styles.checkCircle}>
                <Ionicons name="checkmark" size={32} color={Colors.white} />
              </View>
              <Text style={styles.completedTitle}>Trip Completed</Text>
              <Text style={styles.completedPrice}>R {currentRide?.price || estimatedPrice}</Text>
              <View style={styles.digitalPaidBadge}>
                <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                <Text style={styles.digitalPaidBadgeText}>
                  Paid via {getPaymentMethodLabel(currentRide?.paymentMethod)}
                </Text>
              </View>
              {Number(currentRide?.perMinuteAdjustment || 0) > 0 && (
                <Text style={styles.completedLabel}>
                  Includes R {Math.round(Number(currentRide.perMinuteAdjustment))} traffic time adjustment.
                </Text>
              )}
              <Text style={styles.completedLabel}>Thank you for riding with A2B LIFT</Text>
            </View>
          )}
          <Pressable
            style={({ pressed }) => [styles.confirmBtn, pressed && { opacity: 0.9 }]}
            onPress={() => setShowRating(true)}
          >
            <Text style={styles.confirmBtnText}>
              {currentRide?.paymentMethod === "cash" ? "I Have Paid Driver Cash" : "Rate Your Driver"}
            </Text>
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

      {/* Trip Options Menu Modal (Image 4 3-dots action) */}
      <Modal visible={showTripOptionsMenu} transparent animationType="fade" onRequestClose={() => setShowTripOptionsMenu(false)}>
        <Pressable style={styles.menuModalOverlay} onPress={() => setShowTripOptionsMenu(false)}>
          <View style={[styles.menuModalCard, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.menuModalTitle}>Trip Options</Text>

            <Pressable
              style={styles.menuModalItem}
              onPress={() => {
                setShowTripOptionsMenu(false);
                openActiveStopsEditor();
              }}
            >
              <Ionicons name="create-outline" size={20} color={Colors.white} />
              <View style={styles.menuModalItemInfo}>
                <Text style={styles.menuModalItemTitle}>Add or Edit Stops</Text>
                <Text style={styles.menuModalItemSub}>Change your route destinations</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#6B7280" />
            </Pressable>

            <Pressable
              style={styles.menuModalItem}
              onPress={() => {
                setShowTripOptionsMenu(false);
                router.push("/client/safety");
              }}
            >
              <Ionicons name="shield-checkmark-outline" size={20} color="#3B82F6" />
              <View style={styles.menuModalItemInfo}>
                <Text style={styles.menuModalItemTitle}>Safety Toolkit</Text>
                <Text style={styles.menuModalItemSub}>Emergency assistance and trusted contacts</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#6B7280" />
            </Pressable>

            <Pressable
              style={styles.menuModalItem}
              onPress={() => {
                setShowTripOptionsMenu(false);
                if (currentRide?.id) {
                  router.push({ pathname: "/client/chat", params: { rideId: currentRide.id, driverName: chauffeurDetails?.driverName || "Driver" } });
                }
              }}
            >
              <Ionicons name="chatbubble-outline" size={20} color={Colors.white} />
              <View style={styles.menuModalItemInfo}>
                <Text style={styles.menuModalItemTitle}>Contact Driver</Text>
                <Text style={styles.menuModalItemSub}>Send a message or call your driver</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#6B7280" />
            </Pressable>

            <Pressable
              style={[styles.menuModalItem, { borderBottomWidth: 0 }]}
              onPress={() => {
                setShowTripOptionsMenu(false);
                cancelRide();
              }}
            >
              <Ionicons name="close-circle-outline" size={20} color={Colors.error} />
              <View style={styles.menuModalItemInfo}>
                <Text style={[styles.menuModalItemTitle, { color: Colors.error }]}>Cancel Ride</Text>
                <Text style={styles.menuModalItemSub}>End this trip request</Text>
              </View>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

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
                  style={[styles.payMethodRow, paymentMethodsLoading && { opacity: 0.65 }]}
                  disabled={paymentMethodsLoading}
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
                  {paymentMethodsLoading ? (
                    <ActivityIndicator size="small" color={Colors.textMuted} />
                  ) : (
                    <Ionicons name={defaultCard ? "chevron-forward" : "add-circle-outline"} size={16} color={Colors.textMuted} />
                  )}
                </Pressable>
              );
            })()}
            <Pressable
                style={[
                  styles.payMethodRow,
                  paymentMethodsLoading && { opacity: 0.65 },
                  payLaterApplication?.status === "approved" && Number(payLaterApplication.availableCredit || 0) < Number(selectedRouteChoice?.fare ?? estimatedPrice ?? 0) && { opacity: 0.45 },
                ]}
                disabled={paymentMethodsLoading}
                onPress={() => {
                  const fare = Number(selectedRouteChoice?.fare ?? estimatedPrice ?? 0);
                  if (payLaterApplication?.status !== "approved") {
                    setShowPaymentPicker(false);
                    router.push("/client/pay-later" as any);
                    return;
                  }
                  if (Number(payLaterApplication.availableCredit || 0) < fare) {
                    Alert.alert("Not enough Pay Later credit", `R ${Number(payLaterApplication.availableCredit || 0).toFixed(2)} is available.`);
                    return;
                  }
                  handlePayAndRide("pay_later");
                }}
              >
                <View style={[styles.payMethodIcon, { backgroundColor: "#DBB42C" }]}>
                  <Ionicons name="time" size={20} color="#000" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.payMethodName}>Pay Later</Text>
                  <Text style={styles.payMethodSub}>
                    {payLaterApplication?.status === "approved"
                      ? `R ${Number(payLaterApplication.availableCredit || 0).toFixed(2)} credit available`
                      : payLaterApplication?.status === "pending_review"
                        ? "Application awaiting admin review"
                        : "Apply and upload supporting documents"}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
              </Pressable>
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
            {(() => {
              const walletBalance = Number(user?.walletBalance || 0);
              const rewardsBalance = Number(user?.rewardsBalance || 0);
              const spendable = walletBalance + (isLiftClubMember ? rewardsBalance : 0);
              const balanceIncludingLockedRewards = walletBalance + rewardsBalance;
              const fare = estimatedPrice || 0;
              const canAfford = fare > 0 && spendable >= fare;
              const lockedRewardsWouldCoverFare =
                !isLiftClubMember && fare > 0 && balanceIncludingLockedRewards >= fare;
              return (
                <Pressable
                  style={[styles.payMethodRow, !canAfford && !lockedRewardsWouldCoverFare && { opacity: 0.45 }]}
                  disabled={!canAfford && !lockedRewardsWouldCoverFare}
                  onPress={() => {
                    if (lockedRewardsWouldCoverFare) {
                      setShowPaymentPicker(false);
                      setShowLiftClubGate(true);
                      return;
                    }
                    handlePayAndRide("wallet");
                  }}
                >
                  <View style={[styles.payMethodIcon, { backgroundColor: Colors.success }]}>
                    <Ionicons name="wallet" size={20} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.payMethodName}>Wallet</Text>
                    <Text style={styles.payMethodSub}>
                      {canAfford
                        ? `R ${spendable.toFixed(2)} available${isLiftClubMember ? " including rewards" : ""}`
                        : lockedRewardsWouldCoverFare
                          ? `R ${rewardsBalance.toFixed(2)} rewards locked until Lift Club approval`
                        : `R ${spendable.toFixed(2)} available — not enough for this trip`}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                </Pressable>
              );
            })()}
            <Pressable
              style={[styles.payMethodRow, { borderTopWidth: 1, borderTopColor: Colors.border, marginTop: 6, paddingTop: 14 }]}
              onPress={() => {
                setShowPaymentPicker(false);
                setReserveDayOffset(0);
                setReserveSlot(null);
                setShowReservePicker(true);
              }}
            >
              <View style={[styles.payMethodIcon, { backgroundColor: "#7B5CD6" }]}>
                <Ionicons name="calendar" size={20} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.payMethodName}>Reserve for later</Text>
                <Text style={styles.payMethodSub}>Book this trip in advance — card payment</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={showReservePicker} transparent animationType="slide" onRequestClose={() => setShowReservePicker(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowReservePicker(false)}>
          <View
            style={[styles.modalSheet, { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 16) }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Reserve your ride</Text>
            <Text style={{ fontSize: 13, color: Colors.textMuted, fontFamily: "Inter_400Regular", marginBottom: 10 }}>
              Fare: R {selectedRouteChoice?.fare ?? estimatedPrice} · charged to your card now
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
              {Array.from({ length: 8 }).map((_, offset) => {
                const d = new Date();
                d.setDate(d.getDate() + offset);
                const label = offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : d.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" });
                const active = reserveDayOffset === offset;
                return (
                  <Pressable
                    key={offset}
                    onPress={() => { setReserveDayOffset(offset); setReserveSlot(null); }}
                    style={{
                      paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, marginRight: 8,
                      backgroundColor: active ? Colors.white : Colors.card,
                      borderWidth: 1, borderColor: active ? Colors.white : Colors.border,
                    }}
                  >
                    <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: active ? Colors.primary : Colors.textSecondary }}>{label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <ScrollView style={{ maxHeight: 190, marginBottom: 12 }} showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {getReserveSlots(reserveDayOffset).map((slot) => {
                  const active = reserveSlot === slot;
                  return (
                    <Pressable
                      key={slot}
                      onPress={() => setReserveSlot(slot)}
                      style={{
                        paddingHorizontal: 13, paddingVertical: 8, borderRadius: 10,
                        backgroundColor: active ? Colors.white : Colors.card,
                        borderWidth: 1, borderColor: active ? Colors.white : Colors.border,
                      }}
                    >
                      <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: active ? Colors.primary : Colors.textSecondary }}>{slot}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {getReserveSlots(reserveDayOffset).length === 0 && (
                <Text style={{ fontSize: 13, color: Colors.textMuted, fontFamily: "Inter_400Regular" }}>
                  No more times available today — pick another day.
                </Text>
              )}
            </ScrollView>
            <View style={{ flexDirection: "row", gap: 8, backgroundColor: "rgba(255,193,7,0.08)", borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: "rgba(255,193,7,0.25)" }}>
              <Ionicons name="alert-circle" size={18} color="#FFC107" />
              <Text style={{ flex: 1, fontSize: 12, lineHeight: 17, color: Colors.textSecondary, fontFamily: "Inter_400Regular" }}>
                Cancellation policy: if you cancel this reservation, 50% of the fare
                (R {(Number(selectedRouteChoice?.fare ?? estimatedPrice ?? 0) / 2).toFixed(2)}) is charged as a
                cancellation fee and the other 50% is refunded to your card.
              </Text>
            </View>
            <Pressable
              disabled={!reserveSlot || reserveSubmitting}
              onPress={handleReserveRide}
              style={{
                backgroundColor: reserveSlot ? Colors.white : Colors.card,
                opacity: reserveSubmitting ? 0.6 : 1,
                paddingVertical: 15, borderRadius: 14, alignItems: "center",
              }}
            >
              {reserveSubmitting ? (
                <ActivityIndicator color={Colors.primary} />
              ) : (
                <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: reserveSlot ? Colors.primary : Colors.textMuted }}>
                  {reserveSlot ? `Reserve for ${reserveSlot}` : "Pick a time"}
                </Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={showCashSelfiePrompt}
        transparent
        animationType="fade"
        navigationBarTranslucent={false}
        onRequestClose={() => setShowCashSelfiePrompt(false)}
      >
        <ScrollView
          style={styles.cashSelfiePromptScroll}
          contentContainerStyle={[
            styles.cashSelfiePromptOverlay,
            {
              paddingTop: Math.max(insets.top, 16) + 12,
              paddingBottom: Math.max(
                insets.bottom,
                Platform.OS === "android" ? 24 : 16,
              ) + 16,
            },
          ]}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
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
        </ScrollView>
      </Modal>

      <Modal
        visible={showCashSelfieCamera}
        animationType="slide"
        navigationBarTranslucent={false}
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
              {locationPickerTarget === "pickup"
                ? "Set Pickup"
                : locationPickerTarget === "dropoff"
                  ? "Set Destination"
                  : `Set Stop ${locationPickerTarget + 1}`}
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
            <View style={locationPickerTarget === "pickup" ? styles.dotGreen : locationPickerTarget === "dropoff" ? styles.dotRed : styles.dotStop} />
            <TextInput
              style={styles.locationPickerInput}
              placeholder={locationPickerTarget === "pickup" ? "Search pickup location..." : locationPickerTarget === "dropoff" ? "Search destination..." : "Search stop location..."}
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

      <Modal
        visible={showActiveStopsEditor}
        transparent
        animationType="slide"
        onRequestClose={() => setShowActiveStopsEditor(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 18 }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.stopEditorHeader}>
              <View>
                <Text style={styles.sheetTitle}>Update Trip Stops</Text>
                <Text style={styles.stopEditorSubtitle}>
                  The fare and both apps update after you save.
                </Text>
              </View>
              <Pressable
                style={styles.dismissBtn}
                onPress={() => setShowActiveStopsEditor(false)}
                hitSlop={10}
              >
                <Ionicons name="close" size={20} color={Colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.stopEditorList}
              contentContainerStyle={{ gap: 8 }}
              keyboardShouldPersistTaps="handled"
            >
              {stops.map((stop, index) => {
                const isComplete = index < Number(currentRide?.completedStopCount || 0);
                return (
                  <View key={stop.id} style={[styles.stopEditorRow, isComplete && { opacity: 0.6 }]}>
                    <Pressable
                      style={styles.stopInputMain}
                      onPress={() => openLocationPicker(index)}
                      disabled={isComplete}
                    >
                      <View style={[styles.stopNumber, isComplete && { backgroundColor: Colors.success }]}>
                        {isComplete ? (
                          <Ionicons name="checkmark" size={12} color={Colors.primary} />
                        ) : (
                          <Text style={styles.stopNumberText}>{index + 1}</Text>
                        )}
                      </View>
                      <View style={styles.locationInputInner}>
                        <Text style={styles.locationInputLabel}>
                          {isComplete ? `Stop ${index + 1} completed` : `Stop ${index + 1}`}
                        </Text>
                        <Text style={styles.locationInputValue} numberOfLines={1}>
                          {stop.address || "Choose stop location"}
                        </Text>
                      </View>
                    </Pressable>
                    {!isComplete ? (
                      <Pressable style={styles.removeStopBtn} onPress={() => removeStop(index)} hitSlop={8}>
                        <Ionicons name="close-circle" size={20} color={Colors.textMuted} />
                      </Pressable>
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>

            <Pressable style={styles.addStopBtn} onPress={addStop}>
              <Ionicons name="add-circle-outline" size={18} color={Colors.white} />
              <Text style={styles.addStopText}>Add another stop</Text>
            </Pressable>
            <Pressable
              style={[styles.confirmBtn, savingActiveStops && { opacity: 0.65 }]}
              onPress={saveActiveStops}
              disabled={savingActiveStops}
            >
              {savingActiveStops ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <Text style={styles.confirmBtnText}>Save Stops and Update Fare</Text>
              )}
            </Pressable>
          </View>
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
                  selectEstimatedVehicle(vt);
                  setShowVehicleSheet(false);
                }}
              >
                <Image
                  source={vt.artwork}
                  style={styles.vehicleOptionArtwork}
                  resizeMode="contain"
                />
                <View style={styles.vehicleOptionInfo}>
                  <View style={styles.vehicleOptionNameRow}>
                    <Text style={styles.vehicleOptionName}>{vt.name}</Text>
                    {"badge" in vt && vt.badge ? <Text style={styles.vehicleOptionBadge}>{vt.badge}</Text> : null}
                  </View>
                  <Text style={styles.vehicleOptionDesc}>{vt.desc}</Text>
                  <View style={styles.vehicleOptionMetaRow}>
                    <View style={styles.passengerCapacity}>
                      <Ionicons name="people-outline" size={13} color={Colors.textMuted} />
                      <Text style={styles.passengerCapacityText}>{vt.maxPassengers}</Text>
                    </View>
                    <Text style={styles.vehicleOptionPrice}>{formatVehicleRate(vt)}</Text>
                  </View>
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
      <LiftClubMembershipRequiredModal
        visible={showLiftClubGate}
        onClose={() => setShowLiftClubGate(false)}
      />
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
  liftClubMapBadge: {
    position: "absolute",
    top: 14,
    left: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F7C948",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  liftClubMapBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: "#2A1D00",
    textTransform: "uppercase",
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
  dotStop: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.accent,
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
  stopInputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 12,
  },
  stopInputMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingLeft: 14,
  },
  stopNumber: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  stopNumberText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: Colors.primary,
  },
  removeStopBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  stopEditorHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  stopEditorSubtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginTop: 3,
  },
  stopEditorList: {
    maxHeight: 300,
  },
  stopEditorRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 8,
    paddingRight: 10,
  },
  addStopBtn: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  addStopText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
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
  selectedVehicleArtwork: {
    width: 66,
    height: 44,
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
  },
  vehicleMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },
  passengerCapacity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  passengerCapacityText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.textMuted,
  },
  confirmBtn: {
    backgroundColor: Colors.white,
    paddingVertical: 13,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
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
  categoryFareSection: {
    gap: 8,
  },
  categoryFareHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 2,
  },
  categoryFareTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
  },
  categoryFareSubtitle: {
    flexShrink: 1,
    textAlign: "right",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  categoryFareRow: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  categoryFareRowSelected: {
    borderColor: Colors.white,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  categoryFareIcon: {
    width: 68,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryFareArtwork: {
    width: 66,
    height: 46,
  },
  categoryFareInfo: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  categoryFareNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  categoryFareName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  categoryFareBadge: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
    textTransform: "uppercase",
  },
  categoryFareMeta: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  categoryFareDetails: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  categoryFareRate: {
    flex: 1,
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  categoryFarePriceWrap: {
    minWidth: 62,
    alignItems: "flex-end",
    gap: 5,
  },
  categoryFarePrice: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
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
  guideTopBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    zIndex: 30,
  },
  guideCollapseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(30,30,30,0.85)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  guideSafetyPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(30,30,30,0.85)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  guideSafetyText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  guideHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  guideHeaderMinimizeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  guideHeaderTitle: {
    flex: 1,
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
    letterSpacing: -0.3,
  },
  guideCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    gap: 8,
    marginBottom: 12,
  },
  guideCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  guideCardSub: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textMuted,
  },
  guideDotsBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  guideCardHeading: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
    lineHeight: 22,
  },
  guideTagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 2,
    marginBottom: 6,
  },
  guideTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  guideTagText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.textMuted,
  },
  menuModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  menuModalCard: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  menuModalTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
    marginBottom: 16,
    textAlign: "center",
  },
  menuModalItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
    gap: 14,
  },
  menuModalItemInfo: {
    flex: 1,
  },
  menuModalItemTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  menuModalItemSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginTop: 2,
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
  minimizedTripSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -3 },
    elevation: 10,
  },
  minimizedTripPressable: {
    gap: 8,
  },
  minimizedHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignSelf: "center",
  },
  minimizedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  minimizedAvatarWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  minimizedAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  minimizedInfo: {
    flex: 1,
    gap: 2,
  },
  minimizedTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
  },
  minimizedSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  minimizedActionGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  minimizedChatBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  minimizedExpandBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetHandleWrap: {
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelFullBtn: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cashPaymentInstruction: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: Colors.white,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 4,
    paddingHorizontal: 16,
    lineHeight: 22,
  },
  digitalPaidBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(16,185,129,0.15)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 6,
    marginBottom: 4,
  },
  digitalPaidBadgeText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#10B981",
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
  activeStopsCard: {
    gap: 8,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  activeStopsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  activeStopsTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  activeStopsNext: {
    maxWidth: 210,
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 2,
  },
  editStopsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: Colors.accent,
  },
  editStopsBtnText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
  },
  activeStopItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  activeStopNumber: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  activeStopNumberComplete: {
    backgroundColor: Colors.success,
    borderColor: Colors.success,
  },
  activeStopNumberText: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
  },
  activeStopAddress: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  activeStopAddressComplete: {
    color: Colors.textMuted,
    textDecorationLine: "line-through",
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
  vehicleOptionArtwork: {
    width: 72,
    height: 50,
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
    color: Colors.white,
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
    flex: 1,
  },
  vehicleOptionMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
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
  cashSelfiePromptScroll: {
    flex: 1,
    backgroundColor: "rgba(4,10,18,0.76)",
  },
  cashSelfiePromptOverlay: {
    flexGrow: 1,
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
  clientWaitingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.35)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
    alignSelf: "flex-start",
  },
  clientWaitingBadgeCharged: {
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    borderColor: "rgba(245, 158, 11, 0.4)",
  },
  clientWaitingText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#10B981",
  },
  clientWaitingTextCharged: {
    color: "#F59E0B",
  },
});
