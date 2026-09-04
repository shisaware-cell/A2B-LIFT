import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Linking,
  Animated,
  Dimensions,
  ScrollView,
  RefreshControl,
  TextInput,
  KeyboardAvoidingView,
  AppState,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Constants from "expo-constants";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/lib/auth-context";
import {
  HIGH_ACCURACY,
  RIDE_MATCH_RADIUS_KM,
  getBestAvailablePosition,
  toLatLng,
  watchBestPosition,
} from "@/lib/location-utils";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { useSocket } from "@/lib/socket-context";
import {
  buildGoogleMapsNavigationUrl,
  buildGoogleMapsWebNavigationUrl,
  buildWazeNavigationUrl,
  buildAppleMapsNavigationUrl,
} from "@/lib/google-navigation";
import Colors from "@/constants/colors";
import A2BMap from "@/components/A2BMap";
import { VEHICLE_CATEGORY_PRICING, getDriverDisplayFare, getDriverNetFare } from "@shared/fare-policy";
import { normalizeRideStops } from "@shared/ride-stops";
import {
  DRIVER_OVERLAY_ENABLED_KEY,
  hasDriverOverlayPermission,
  isDriverOverlayAvailable,
  startDriverOverlay,
  setDriverOverlayEventCount,
  updateDriverOverlayState,
} from "@/lib/driver-overlay";
import {
  getNavigationVoiceEnabled,
  setNavigationVoiceEnabled as persistNavigationVoiceEnabled,
  subscribeNavigationVoiceEnabled,
} from "@/lib/navigation-voice";
import {
  getNavigationPreferences,
  subscribeNavigationPreferences,
} from "@/lib/navigation-preferences";
import {
  dismissArrivalPrompt,
  EMPTY_ARRIVAL_GEOFENCE_STATE,
  evaluateArrivalGeofence,
  type ArrivalGeofenceState,
  type ArrivalLocationSample,
} from "@/lib/arrival-geofence";
import { getVehicleCategoryTitle } from "@shared/fare-policy";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const ROUTE_REFRESH_MIN_DISTANCE_KM = 0.2;
const ROUTE_REFRESH_MAX_AGE_MS = 5 * 60 * 1000;
const RIDE_ALERT_SUPPRESSION_MS = 30 * 60 * 1000;
const DRIVER_LOCATION_TASK_NAME = "a2b-driver-location-task";
const DRIVER_LOCATION_TASK_STATE_KEY = "a2b_driver_location_task_state";
const DRIVER_LOCATION_REST_MIN_INTERVAL_MS = 10000;

function getRequestedVehicleLabel(vehicleType: unknown) {
  return getVehicleCategoryTitle(vehicleType as any);
}

type DriverLocationTaskState = {
  chauffeurId?: string;
  isOnline?: boolean;
};

type TripAlertSound = {
  setIsLoopingAsync: (isLooping: boolean) => Promise<void>;
  replayAsync: () => Promise<void>;
  playAsync: () => Promise<void>;
  stopAsync: () => Promise<void>;
  unloadAsync: () => Promise<void>;
};

type ExpoAudioModule = typeof import("expo-av");

async function getExpoAudioModule(): Promise<ExpoAudioModule["Audio"]> {
  const { Audio } = await import("expo-av");
  return Audio;
}

async function postChauffeurLocation(chauffeurId: string, lat: number, lng: number) {
  const token = await AsyncStorage.getItem("a2b_token");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  await fetch(new URL(`/api/chauffeurs/${chauffeurId}/location`, getApiUrl()).toString(), {
    method: "PUT",
    headers,
    body: JSON.stringify({ lat, lng }),
  });
}

if (Platform.OS !== "web") {
  TaskManager.defineTask(DRIVER_LOCATION_TASK_NAME, async ({ data, error }) => {
    if (error) {
      console.log("[driver-location-task]", error.message);
      return;
    }

    try {
      const rawState = await AsyncStorage.getItem(DRIVER_LOCATION_TASK_STATE_KEY);
      const state = rawState ? (JSON.parse(rawState) as DriverLocationTaskState) : {};
      if (!state.isOnline || !state.chauffeurId) return;

      const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations || [];
      const latest = locations[locations.length - 1];
      if (!latest?.coords) return;

      await postChauffeurLocation(state.chauffeurId, latest.coords.latitude, latest.coords.longitude);
    } catch (taskError: any) {
      console.log("[driver-location-task] update failed:", taskError?.message || taskError);
    }
  });
}

interface ClientReview {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  reviewerName: string;
}

interface ClientProfile {
  id: string;
  clientName: string;
  clientPhone: string | null;
  clientRating: number | null;
  totalRatings: number;
  completedTrips: number;
  memberSince: string;
  profilePhoto: string | null;
  distribution: Record<number, number>;
  ratings: ClientReview[];
}

interface ClientSummary {
  id: string;
  fullName: string;
  firstName: string;
  phone: string | null;
  rating: number | null;
  createdAt: string | null;
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getCompletedStopCount(ride: any) {
  const stops = normalizeRideStops(ride?.stops);
  return Math.max(0, Math.min(stops.length, Number(ride?.completedStopCount || 0)));
}

function getActiveTripTarget(ride: any) {
  const stops = normalizeRideStops(ride?.stops);
  const completedStopCount = getCompletedStopCount(ride);
  const nextStop = stops[completedStopCount];
  if (nextStop) {
    return {
      type: "stop" as const,
      index: completedStopCount,
      totalStops: stops.length,
      address: nextStop.address || `Stop ${completedStopCount + 1}`,
      lat: Number(nextStop.lat),
      lng: Number(nextStop.lng),
    };
  }
  return {
    type: "dropoff" as const,
    index: completedStopCount,
    totalStops: stops.length,
    address: ride?.dropoffAddress || "Final destination",
    lat: Number(ride?.dropoffLat),
    lng: Number(ride?.dropoffLng),
  };
}

export default function ChauffeurDashboard() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { on, off, emit } = useSocket();

  const [chauffeur, setChauffeur] = useState<any>(null);
  const [operatorProfile, setOperatorProfile] = useState<any>(null);
  const [driverVehicles, setDriverVehicles] = useState<any[]>([]);
  const [fleetOverview, setFleetOverview] = useState({
    vehicles: 0,
    assignedDrivers: 0,
    activeTrips: 0,
    pendingApprovals: 0,
  });
  const [partnerDashboardMode, setPartnerDashboardMode] = useState<"partner" | "driver">("partner");
  const [partnerRefreshing, setPartnerRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(false);
  const [incomingRide, setIncomingRide] = useState<any>(null);
  const [incomingOfferSeconds, setIncomingOfferSeconds] = useState<number>(45);
  const [currentRide, setCurrentRide] = useState<any>(null);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number; heading?: number; speed?: number } | null>(null);
  const [routePolyline, setRoutePolyline] = useState<string | null>(null);
  const [showNavModal, setShowNavModal] = useState(false);
  const [navSteps, setNavSteps] = useState<Array<{ instruction: string; distance: string; maneuver: string; endLat: number; endLng: number }>>([]);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [rideEta, setRideEta] = useState<{ distanceText: string; durationText: string; distanceKm: number; durationMin: number } | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [availableTrips, setAvailableTrips] = useState<any[]>([]);
  const [acceptingTripId, setAcceptingTripId] = useState<string | null>(null);
  const [completedTrip, setCompletedTrip] = useState<any>(null);
  const [clientRatingRide, setClientRatingRide] = useState<any>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [routeAlternatives, setRouteAlternatives] = useState<any[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [showClientProfile, setShowClientProfile] = useState(false);
  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);
  const [clientProfileLoading, setClientProfileLoading] = useState(false);
  const [showClientRating, setShowClientRating] = useState(false);
  const [clientRating, setClientRating] = useState(0);
  const [clientRatingComment, setClientRatingComment] = useState("");
  const [submittingClientRating, setSubmittingClientRating] = useState(false);
  const [stopProgressLoading, setStopProgressLoading] = useState(false);
  const [rideStatusUpdating, setRideStatusUpdating] = useState<string | null>(null);
  const [navigationVoiceEnabled, setNavigationVoiceEnabledState] = useState<boolean | null>(null);
  const [waitingElapsedSec, setWaitingElapsedSec] = useState(0);
  const [cashReceivedInput, setCashReceivedInput] = useState("");
  const [cashSettling, setCashSettling] = useState(false);
  const [driverLocationSample, setDriverLocationSample] = useState<ArrivalLocationSample | null>(null);

  const soundRef = useRef<TripAlertSound | null>(null);
  const tripAlertTokenRef = useRef(0);
  const tripAlertEnabledRef = useRef(false);
  const seenRideIdRef = useRef<string | null>(null);
  const destinationArrivalGeofenceRef = useRef<ArrivalGeofenceState>({ ...EMPTY_ARRIVAL_GEOFENCE_STATE });
  const pickupArrivalGeofenceRef = useRef<ArrivalGeofenceState>({ ...EMPTY_ARRIVAL_GEOFENCE_STATE });
  const suppressedRideAlertIdRef = useRef<string | null>(null);
  const suppressedRideIdsRef = useRef<Record<string, number>>({});
  const clientSummaryCacheRef = useRef<Record<string, ClientSummary>>({});
  const lastSpokenNavKeyRef = useRef<string | null>(null);
  const routeContextRef = useRef<string | null>(null);
  const lastRouteFetchRef = useRef<{
    routeKey: string;
    origin: { lat: number; lng: number };
    fetchedAt: number;
  } | null>(null);
  const menuAnim = useRef(new Animated.Value(0)).current;
  const incomingSlide = useRef(new Animated.Value(300)).current;
  const notificationsRef = useRef<any>(null);
  const locationWatchRef = useRef<Location.LocationSubscription | null>(null);
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationStartInFlightRef = useRef<number | null>(null);
  const locationSessionRef = useRef(0);
  const lastForegroundLocationAtRef = useRef(0);
  const lastLocationRestPostRef = useRef(0);
  const currentRideRef = useRef<any>(null);
  const incomingRideRef = useRef<any>(null);
  const availableTripsRef = useRef<any[]>([]);
  const incomingRideHydrationTokenRef = useRef(0);
  const driverCancellationRideIdRef = useRef<string | null>(null);
  const stopConfirmationInFlightRef = useRef(false);
  const handledCancellationRideIdsRef = useRef(new Set<string>());
  const isOnlineRef = useRef(false);
  const chauffeurRef = useRef<any>(null);
  const isExpoGoAndroid = Platform.OS === "android" && Constants.appOwnership === "expo";
  const hasPendingStop =
    currentRide?.status === "trip_started" && getActiveTripTarget(currentRide).type === "stop";

  useEffect(() => {
    let mounted = true;
    getNavigationVoiceEnabled().then((enabled) => {
      if (mounted) setNavigationVoiceEnabledState(enabled);
    }).catch(() => {});
    const unsubscribe = subscribeNavigationVoiceEnabled((enabled) => {
      if (mounted) setNavigationVoiceEnabledState(enabled);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  async function toggleNavigationVoiceFromMap() {
    const next = navigationVoiceEnabled === false;
    setNavigationVoiceEnabledState(next);
    try {
      await persistNavigationVoiceEnabled(next);
    } catch {
      setNavigationVoiceEnabledState(!next);
      Alert.alert("Setting not saved", "Please try changing navigation voice again.");
    }
  }

  function clearIncomingRide() {
    incomingRideHydrationTokenRef.current += 1;
    incomingRideRef.current = null;
    setIncomingRide(null);
  }

  async function presentIncomingRide(ride: any, allowSuppressed = false) {
    if (!ride?.id) return null;
    if (
      currentRideRef.current ||
      (!allowSuppressed && isRideAlertSuppressed(ride.id))
    ) {
      return null;
    }
    const token = ++incomingRideHydrationTokenRef.current;
    // Immediately present the incoming ride card synchronously so the driver sees Accept/Decline instantly
    incomingRideRef.current = ride;
    setIncomingRide(ride);

    // Enrich client details asynchronously in the background
    void enrichRideClientDetails(ride, "Client").then((enrichedRide) => {
      if (
        token !== incomingRideHydrationTokenRef.current ||
        currentRideRef.current ||
        (!allowSuppressed && isRideAlertSuppressed(ride.id))
      ) {
        return;
      }
      incomingRideRef.current = enrichedRide;
      setIncomingRide(enrichedRide);
    }).catch(() => {});

    return ride;
  }

  async function openAcceptedRideNavigation() {
    if (!currentRide) return;

    const activeTripTarget = getActiveTripTarget(currentRide);
    const coordinate = currentRide.status === "trip_started"
      ? { lat: activeTripTarget.lat, lng: activeTripTarget.lng }
      : { lat: Number(currentRide.pickupLat), lng: Number(currentRide.pickupLng) };
    const activeAddress = currentRide.status === "trip_started"
      ? (activeTripTarget.address || currentRide.dropoffAddress || "Destination")
      : (currentRide.pickupAddress || "Pickup");
    const platform = Platform.OS === "android" ? "android" : Platform.OS === "ios" ? "ios" : "web";
    const waypoints: { lat: number; lng: number }[] = [];

    const prefs = await getNavigationPreferences();

    if (prefs.navigationApp === "a2b") {
      setShowNavModal(true);
      return;
    }

    if (prefs.navigationApp === "waze") {
      const nativeWazeUrl = buildWazeNavigationUrl(coordinate, activeAddress, true);
      const webWazeUrl = buildWazeNavigationUrl(coordinate, activeAddress, false);

      if (nativeWazeUrl) {
        try {
          if (await Linking.canOpenURL(nativeWazeUrl)) {
            await Linking.openURL(nativeWazeUrl);
            return;
          }
        } catch {}
      }

      if (webWazeUrl) {
        try {
          await Linking.openURL(webWazeUrl);
          return;
        } catch {}
      }
    }

    if (prefs.navigationApp === "apple" && platform === "ios") {
      const appleUrl = buildAppleMapsNavigationUrl(coordinate, activeAddress);
      if (appleUrl) {
        try {
          if (await Linking.canOpenURL(appleUrl)) {
            await Linking.openURL(appleUrl);
            return;
          }
        } catch {}
      }
    }

    const appUrl = buildGoogleMapsNavigationUrl(coordinate, platform, waypoints);
    const webUrl = buildGoogleMapsWebNavigationUrl(coordinate, waypoints);

    if (!appUrl || !webUrl) {
      Alert.alert("Navigation unavailable", "This trip does not have a valid destination yet.");
      return;
    }

    try {
      if (platform !== "web" && (await Linking.canOpenURL(appUrl))) {
        await Linking.openURL(appUrl);
        return;
      }

      await Linking.openURL(webUrl);
    } catch {
      Alert.alert("Could not open Maps", "Please check that Google Maps or Waze is installed and try again.");
    }
  }

  const autoNavigatedRideRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentRide) {
      autoNavigatedRideRef.current = null;
      return;
    }
    const navKey = `${currentRide.id}-${currentRide.status}`;
    if (autoNavigatedRideRef.current === navKey) return;

    if (currentRide.status === "chauffeur_assigned" || currentRide.status === "chauffeur_arriving" || currentRide.status === "trip_started") {
      getNavigationPreferences().then((prefs) => {
        if (prefs.autoNavigate) {
          autoNavigatedRideRef.current = navKey;
          const timer = setTimeout(() => {
            openAcceptedRideNavigation();
          }, 1800);
          return () => clearTimeout(timer);
        }
      });
    }
  }, [currentRide?.id, currentRide?.status]);

  function getClientFirstName(name?: string | null, fallback = "Client") {
    const cleaned = String(name || "").trim();
    if (!cleaned) return fallback;
    return cleaned.split(/\s+/)[0] || fallback;
  }

  function isPlaceholderClientName(name?: string | null) {
    const normalized = String(name || "").trim().toLowerCase();
    return !normalized || ["client", "rider", "a2b", "a2b client"].includes(normalized);
  }

  function getRouteOptionTitle(index: number, summary?: string | null) {
    const cleanedSummary = String(summary || "").trim();
    if (currentRide?.status === "trip_started" && index === 0) {
      return getRideRouteLabel(currentRide?.selectedRouteId);
    }
    if (cleanedSummary) return cleanedSummary;
    if (index === 0) return "Suggested Route";
    if (index === 1) return "Backup Route";
    return `Route ${index + 1}`;
  }

  function getRouteOptionIcon(index: number): keyof typeof Ionicons.glyphMap {
    if (currentRide?.status === "trip_started" && index === 0) {
      return getRideRouteIcon(currentRide?.selectedRouteId);
    }
    if (index === 0) return "speedometer-outline";
    if (index === 1) return "navigate-outline";
    return "analytics-outline";
  }

  function calculateRouteSafetyScore(route: any): number {
    const stepsCount = Array.isArray(route?.steps) ? route.steps.length : 0;
    const averageSpeed = route?.durationMin > 0 ? Number(route.distanceKm || 0) / (Number(route.durationMin || 0) / 60) : Number(route.distanceKm || 0);
    const highwayPenalty = /\b(M|N)\d+\b|highway|freeway|motorway/i.test(String(route?.summary || "")) ? 5 : 0;
    return stepsCount + averageSpeed * 1.4 + highwayPenalty;
  }

  function getClientSelectedRouteIndex(routes: any[], ride: any) {
    if (!Array.isArray(routes) || routes.length === 0 || !ride || ride.status !== "trip_started") return 0;

    if (ride.selectedRouteId === "faster_route") {
      return routes.reduce((bestIdx, route, index) => {
        const bestRoute = routes[bestIdx];
        return Number(route.durationMin || 0) < Number(bestRoute.durationMin || 0) ? index : bestIdx;
      }, 0);
    }

    if (ride.selectedRouteId === "safest_route") {
      return routes.reduce((bestIdx, route, index) => {
        const bestRoute = routes[bestIdx];
        return calculateRouteSafetyScore(route) < calculateRouteSafetyScore(bestRoute) ? index : bestIdx;
      }, 0);
    }

    const selectedDistanceKm = Number(ride.selectedRouteDistanceKm || 0);
    if (selectedDistanceKm > 0) {
      return routes.reduce((bestIdx, route, index) => {
        const bestRoute = routes[bestIdx];
        const currentGap = Math.abs(Number(route.distanceKm || 0) - selectedDistanceKm);
        const bestGap = Math.abs(Number(bestRoute.distanceKm || 0) - selectedDistanceKm);
        return currentGap < bestGap ? index : bestIdx;
      }, 0);
    }

    return 0;
  }

  function reorderRoutesForClientSelection(routes: any[], ride: any) {
    if (!Array.isArray(routes) || routes.length === 0 || !ride || ride.status !== "trip_started") return routes;
    const selectedIndex = getClientSelectedRouteIndex(routes, ride);
    if (selectedIndex === 0) return routes;
    const selectedRoute = routes[selectedIndex];
    return [selectedRoute, ...routes.filter((_, index) => index !== selectedIndex)];
  }

  function getRouteAlternatives(routes: any[], fallbackRoute?: any) {
    const sourceRoutes = Array.isArray(routes) && routes.length > 0
      ? routes
      : fallbackRoute?.polyline
        ? [fallbackRoute]
        : [];

    const seen = new Set<string>();
    const uniqueRoutes: any[] = [];

    for (const route of sourceRoutes) {
      if (!route?.polyline || seen.has(route.polyline)) continue;
      seen.add(route.polyline);
      uniqueRoutes.push(route);
      if (uniqueRoutes.length === 3) break;
    }

    return reorderRoutesForClientSelection(uniqueRoutes, currentRide);
  }

  /** Estimate the driver's net earnings for a route distance. */
  function calcRoutePrice(distanceKm: number | undefined): string {
    if (!distanceKm || !currentRide) return "";
    if (currentRide?.status === "trip_started" && getRideClientFare(currentRide) > 0 && Math.abs(Number(currentRide.selectedRouteDistanceKm || 0) - Number(distanceKm || 0)) < 0.35) {
      return `R ${getRideFare(currentRide).toFixed(0)}`;
    }
    const rates: Record<string, { pricePerKm: number; baseFare: number }> = {
      ...VEHICLE_CATEGORY_PRICING,
    };
    const cat = rates[currentRide.vehicleType || "budget"] || rates.budget;
    const grossFare = Math.round(cat.baseFare + distanceKm * cat.pricePerKm);
    return `R ${getDriverDisplayFare(grossFare, currentRide?.paymentMethod, currentRide?.commissionRate).toFixed(0)}`;
  }

  function getRideRouteLabel(routeId?: string | null) {
    if (routeId === "safest_route") return "Safest (Highway)";
    return "Fastest";
  }

  function getRideRouteIcon(routeId?: string | null): keyof typeof Ionicons.glyphMap {
    if (routeId === "safest_route") return "shield-checkmark-outline";
    return "flash-outline";
  }

  function getRidePaymentLabel(method?: string | null) {
    if (method === "card") return "Card";
    if (method === "wallet") return "Wallet";
    return "Cash";
  }

  function getRidePaymentIcon(method?: string | null): keyof typeof Ionicons.glyphMap {
    if (method === "card") return "card-outline";
    if (method === "wallet") return "wallet-outline";
    return "cash-outline";
  }

  function getRideClientFare(ride: any) {
    return Number(ride?.finalFare || ride?.price || ride?.actualFare || ride?.quotedFare || 0);
  }

  function getRideFare(ride: any) {
    return getDriverDisplayFare(
      getRideClientFare(ride),
      ride?.paymentMethod,
      ride?.commissionRate,
    );
  }

  function getIncomingRideFare(ride: any) {
    return getDriverNetFare(getRideClientFare(ride), ride?.commissionRate);
  }

  async function getClientSummary(clientId?: string): Promise<ClientSummary | null> {
    if (!clientId) return null;
    const cached = clientSummaryCacheRef.current[clientId];
    if (cached) return cached;
    try {
      const res = await apiRequest("GET", `/api/users/${clientId}`);
      const user = await res.json();
      const summary: ClientSummary = {
        id: user.id,
        fullName: user.name || user.username || "Client",
        firstName: getClientFirstName(user.name || user.username, "Client"),
        phone: user.phone || null,
        rating: user.rating != null ? Number(user.rating) : null,
        createdAt: user.createdAt ? String(user.createdAt) : null,
      };
      clientSummaryCacheRef.current[clientId] = summary;
      return summary;
    } catch {
      return null;
    }
  }

  async function enrichRideClientDetails<T extends Record<string, any> | null>(ride: T, fallback = "Client"): Promise<T> {
    if (!ride) return ride;

    const seededFirstName = getClientFirstName(ride.clientFirstName || ride.clientName, fallback);
    if (!ride.clientId) {
      return {
        ...ride,
        clientFirstName: seededFirstName,
      } as T;
    }

    const summary = await getClientSummary(ride.clientId);
    if (!summary) {
      return {
        ...ride,
        clientFirstName: seededFirstName,
      } as T;
    }

    return {
      ...ride,
      clientFirstName: isPlaceholderClientName(ride.clientFirstName) ? summary.firstName : seededFirstName,
      clientName: ride.clientName || summary.fullName,
      clientPhone: ride.clientPhone || summary.phone,
    } as T;
  }

  async function buildFallbackClientProfile(clientId: string): Promise<ClientProfile | null> {
    try {
      const [userRes, ridesRes] = await Promise.all([
        apiRequest("GET", `/api/users/${clientId}`),
        apiRequest("GET", `/api/rides/client/${clientId}`),
      ]);
      const user = await userRes.json();
      const rides = await ridesRes.json();
      const completedTrips = Array.isArray(rides)
        ? rides.filter((ride: any) => ride.status === "trip_completed").length
        : 0;

      const fallbackProfile: ClientProfile = {
        id: user.id,
        clientName: user.name || user.username || "Client",
        clientPhone: user.phone || null,
        clientRating: user.rating != null ? Number(user.rating) : null,
        totalRatings: 0,
        completedTrips,
        memberSince: user.createdAt ? String(user.createdAt) : new Date().toISOString(),
        profilePhoto: user.profilePhoto || null,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        ratings: [],
      };

      clientSummaryCacheRef.current[clientId] = {
        id: fallbackProfile.id,
        fullName: fallbackProfile.clientName,
        firstName: getClientFirstName(fallbackProfile.clientName, "Client"),
        phone: fallbackProfile.clientPhone,
        rating: fallbackProfile.clientRating,
        createdAt: fallbackProfile.memberSince,
      };

      return fallbackProfile;
    } catch {
      return null;
    }
  }

  // ─── Sound ───────────────────────────────────────────────────────────────
  async function playTripAlert() {
    const alertToken = tripAlertTokenRef.current + 1;
    tripAlertTokenRef.current = alertToken;
    tripAlertEnabledRef.current = true;
    try {
      if (Platform.OS === "web") return;
      const Audio = await getExpoAudioModule();
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
      } catch {}
      if (tripAlertTokenRef.current !== alertToken || !tripAlertEnabledRef.current) {
        return;
      }
      if (soundRef.current) {
        try {
          await soundRef.current.setIsLoopingAsync(true);
          if (tripAlertTokenRef.current !== alertToken || !tripAlertEnabledRef.current) {
            return;
          }
          await soundRef.current.replayAsync();
        } catch {}
      } else {
        try {
          const { sound } = await Audio.Sound.createAsync(
            require("../../assets/trip_alert.mp3"),
            { shouldPlay: false, volume: 1.0, isLooping: true }
          );
          if (tripAlertTokenRef.current !== alertToken || !tripAlertEnabledRef.current) {
            await sound.unloadAsync().catch(() => {});
            return;
          }
          soundRef.current = sound;
          await sound.playAsync();
        } catch {}
      }
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
    } catch {}
  }

  async function stopTripAlert() {
    tripAlertEnabledRef.current = false;
    tripAlertTokenRef.current += 1;
    try {
      if (soundRef.current) {
        const sound = soundRef.current;
        soundRef.current = null;
        await sound.stopAsync().catch(() => {});
        await sound.unloadAsync().catch(() => {});
      }
    } catch {}
  }

  useEffect(() => { return () => { void stopTripAlert(); }; }, []);

  function suppressRideAlert(rideId?: string | null) {
    const normalizedId = String(rideId || "").trim();
    if (!normalizedId) return;
    suppressedRideAlertIdRef.current = normalizedId;
    suppressedRideIdsRef.current[normalizedId] = Date.now();
  }

  function isRideAlertSuppressed(rideId?: string | null) {
    const normalizedId = String(rideId || "").trim();
    if (!normalizedId) return false;

    const now = Date.now();
    for (const [id, stampedAt] of Object.entries(suppressedRideIdsRef.current)) {
      if (now - stampedAt > RIDE_ALERT_SUPPRESSION_MS) {
        delete suppressedRideIdsRef.current[id];
      }
    }

    return Boolean(suppressedRideIdsRef.current[normalizedId]);
  }

  useEffect(() => {
    return () => {
      try {
        Speech.stop();
      } catch {}
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

  // ─── Menu animation ───────────────────────────────────────────────────────
  function toggleMenu() {
    const toValue = menuOpen ? 0 : 1;
    Animated.spring(menuAnim, { toValue, useNativeDriver: true, tension: 80, friction: 10 }).start();
    setMenuOpen(!menuOpen);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function closeMenu() {
    Animated.timing(menuAnim, { toValue: 0, useNativeDriver: true, duration: 200 }).start();
    setMenuOpen(false);
  }

  // ─── Incoming ride slide-in ───────────────────────────────────────────────
  useEffect(() => {
    if (incomingRide) {
      Animated.spring(incomingSlide, { toValue: 0, useNativeDriver: true, tension: 70, friction: 10 }).start();
    } else {
      Animated.timing(incomingSlide, { toValue: 300, useNativeDriver: true, duration: 250 }).start();
    }
  }, [incomingRide]);

  useEffect(() => {
    if (!incomingRide?.currentOfferExpiresAt) {
      setIncomingOfferSeconds(45);
      return;
    }

    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((new Date(incomingRide.currentOfferExpiresAt).getTime() - Date.now()) / 1000));
      setIncomingOfferSeconds(remaining);
      if (remaining <= 0) {
        suppressRideAlert(incomingRide.id);
        stopTripAlert();
        clearIncomingRide();
      }
    };
    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [incomingRide?.id, incomingRide?.currentOfferExpiresAt]);

  // ─── Unread notifications ────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    async function fetchUnread() {
      try {
        const res = await apiRequest("GET", `/api/notifications/user/${user!.id}`);
        const data = await res.json();
        if (Array.isArray(data)) setUnreadCount(data.filter((n: any) => !n.isRead).length);
      } catch {}
    }
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    if (!isDriverOverlayAvailable()) return;
    const isTripActive = Boolean(currentRide?.id && ["chauffeur_assigned", "chauffeur_arriving", "chauffeur_arrived", "trip_started"].includes(currentRide.status));
    const eventCount = unreadCount + (incomingRide?.id ? 1 : 0);
    const tripLabel = isTripActive
      ? (currentRide?.status === "trip_started" ? "ON TRIP" : "PICKUP")
      : (incomingRide?.id ? "NEW" : "");

    void (async () => {
      const enabled = await AsyncStorage.getItem(DRIVER_OVERLAY_ENABLED_KEY) === "true";
      if (enabled && await hasDriverOverlayPermission()) {
        await updateDriverOverlayState({
          eventCount,
          tripActive: isTripActive,
          tripLabel,
        });
      }
    })();
  }, [currentRide?.id, currentRide?.status, incomingRide?.id, unreadCount]);

  // ─── Socket: incoming ride ────────────────────────────────────────────────
  useEffect(() => {
    const handleNewRide = (ride: any) => {
      try {
        if (isOnline && chauffeur?.isApproved && !currentRide) {
          if (isRideAlertSuppressed(ride?.id)) return;
          if (ride?.currentOfferedChauffeurId && ride.currentOfferedChauffeurId !== chauffeur.id) return;
          if (ride?.currentOfferExpiresAt && new Date(ride.currentOfferExpiresAt).getTime() <= Date.now()) return;
          seenRideIdRef.current = ride.id || null;
          setAvailableTrips((prev) => prev.filter((trip) => trip.id !== ride.id));
          try {
            if (notificationsRef.current && AppState.currentState !== "active") {
              notificationsRef.current.scheduleNotificationAsync?.({
                content: {
                  title: "🚗 Incoming Trip Request!",
                  body: `New ride offer: ${ride.pickupAddress || "Nearby pickup"} · Tap to accept`,
                  data: { type: "ride:new", rideId: ride.id },
                  sound: "trip_alert.wav",
                  priority: "max",
                },
                trigger: null,
              })?.catch?.(() => {});
            }
          } catch {}
          void presentIncomingRide(ride).then((presentedRide) => {
            if (presentedRide && ride.id !== suppressedRideAlertIdRef.current) playTripAlert();
          }).catch(() => {});
        }
      } catch (err) {
        console.warn("[chauffeur/handleNewRide] Error handling incoming ride:", err);
      }
    };
    on("ride:new", handleNewRide);
    return () => { off("ride:new", handleNewRide); };
  }, [isOnline, chauffeur, currentRide]);

  // ─── Socket: ride cancellation ────────────────────────────────────────────
  function handleRideCancellation(ride: any, wasVisibleOffer = false) {
    const activeRide = currentRideRef.current;
    if (!ride?.id || ride.status !== "cancelled") {
      return;
    }
    const rideIdStr = String(ride.id);

    if (!activeRide || String(activeRide.id) !== rideIdStr) {
      if (wasVisibleOffer && !handledCancellationRideIdsRef.current.has(rideIdStr)) {
        handledCancellationRideIdsRef.current.add(rideIdStr);
        Alert.alert("Ride Request Cancelled", "The rider cancelled this request.");
      }
      return;
    }

    if (handledCancellationRideIdsRef.current.has(rideIdStr)) {
      return;
    }

    handledCancellationRideIdsRef.current.add(rideIdStr);
    suppressRideAlert(ride.id);
    currentRideRef.current = null;
    setCurrentRide(null);
    setRoutePolyline(null);
    setRouteAlternatives([]);
    setSelectedRouteIndex(0);
    setRideEta(null);
    setShowNavModal(false);
    setNavSteps([]);
    setCurrentStepIdx(0);
    routeContextRef.current = null;
    AsyncStorage.removeItem("a2b_current_ride").catch(() => {});
    if (chauffeur?.id) void refreshChauffeur(chauffeur.id);

    const wasCancelledHere = driverCancellationRideIdRef.current === ride.id;
    if (wasCancelledHere) driverCancellationRideIdRef.current = null;
    if (wasCancelledHere) return;

    const serverAmount = Number(ride.driverCancellationEarnings);
    const cancellationFee = Math.max(0, Number(ride.cancellationFee || 0));
    const amountDue = Number.isFinite(serverAmount) && serverAmount >= 0
      ? serverAmount
      : getDriverNetFare(cancellationFee, ride.commissionRate);
    if (ride.cancelledBy === "client") {
      Alert.alert(
        "Ride Cancelled",
        amountDue > 0
          ? `The rider cancelled this trip. R ${amountDue.toFixed(2)} has been added to your earnings.`
          : "The rider cancelled this trip. No cancellation earnings are due.",
      );
    } else {
      Alert.alert("Ride Cancelled", "This trip was cancelled.");
    }
  }

  useEffect(() => {
    const clearRideFromDiscovery = (ride: any) => {
      if (!ride?.id) return false;
      const rideIdStr = String(ride.id);
      suppressRideAlert(ride.id);
      const clearedIncomingRide = Boolean(incomingRideRef.current?.id && String(incomingRideRef.current.id) === rideIdStr);
      const clearedAvailableRide = availableTripsRef.current.some((trip) => String(trip.id) === rideIdStr);
      setAvailableTrips((prev) => prev.filter((trip) => String(trip.id) !== rideIdStr));
      if (
        clearedIncomingRide &&
        (ride.status === "cancelled" || (ride.chauffeurId && String(ride.chauffeurId) !== String(chauffeur?.id)))
      ) {
        clearIncomingRide();
        void stopTripAlert();
      }
      return clearedIncomingRide || clearedAvailableRide;
    };

    const handleRideUpdate = (ride: any) => {
      const wasVisibleOffer = clearRideFromDiscovery(ride);
      handleRideCancellation(ride, wasVisibleOffer);
    };

    const handleRideAccepted = (ride: any) => {
      clearRideFromDiscovery(ride);
      if (ride?.chauffeurId === chauffeur?.id) {
        void stopTripAlert();
      }
    };

    const handleStopsUpdated = (ride: any) => {
      if (!ride?.id) return;
      setAvailableTrips((prev) =>
        prev.map((trip) => (trip.id === ride.id ? { ...trip, ...ride } : trip)),
      );
      setIncomingRide((prev: any) =>
        prev?.id === ride.id ? { ...prev, ...ride } : prev,
      );

      const activeRide = currentRideRef.current;
      if (!activeRide || activeRide.id !== ride.id) return;
      const updatedRide = {
        ...activeRide,
        ...ride,
        clientFirstName: ride.clientFirstName || activeRide.clientFirstName,
        clientName: ride.clientName || activeRide.clientName,
        clientPhone: ride.clientPhone || activeRide.clientPhone,
      };
      routeContextRef.current = null;
      lastRouteFetchRef.current = null;
      setCurrentRide(updatedRide);
      Alert.alert(
        "Trip Stops Updated",
        `The rider changed this trip. Review the ${normalizeRideStops(updatedRide.stops).length} stop${normalizeRideStops(updatedRide.stops).length === 1 ? "" : "s"} before continuing.`,
      );
    };

    const handleDestinationUpdated = (data: any) => {
      if (!data?.id) return;
      const activeRide = currentRideRef.current;
      if (!activeRide || activeRide.id !== data.id) return;
      const updatedRide = {
        ...activeRide,
        ...data,
        clientFirstName: data.clientFirstName || activeRide.clientFirstName,
        clientName: data.clientName || activeRide.clientName,
        clientPhone: data.clientPhone || activeRide.clientPhone,
      };
      routeContextRef.current = null;
      lastRouteFetchRef.current = null;
      setCurrentRide(updatedRide);
      destinationArrivalGeofenceRef.current = { ...EMPTY_ARRIVAL_GEOFENCE_STATE };
      Alert.alert(
        "Destination Changed",
        `The rider changed the destination to:\n${data.dropoffAddress || "New location"}\n\nThe route and fare have been updated.`,
      );
      if (Platform.OS !== "web") {
        try {
          Speech.speak(`The destination has been changed to ${data.dropoffAddress || "a new address"}.`, { language: "en-ZA" });
        } catch {}
      }
    };

    const handleForceLogout = async (data?: any) => {
      const myDeviceId = await AsyncStorage.getItem("a2b_device_id");
      if (data?.newDeviceId && data.newDeviceId === myDeviceId) return;
      Alert.alert(
        "Signed Out",
        data?.reason || "You have been logged out because your account was signed in on another device.",
      );
      if (logout) {
        await logout();
      }
    };

    on("ride:statusUpdate", handleRideUpdate);
    on("ride:cancelled", handleRideUpdate);
    on("ride:accepted", handleRideAccepted);
    on("ride:stopsUpdated", handleStopsUpdated);
    on("ride:destinationUpdated", handleDestinationUpdated);
    on("auth:forceLogout", handleForceLogout);
    if (chauffeur?.id) {
      on(`chauffeur:${chauffeur.id}:forceLogout`, handleForceLogout);
    }
    return () => {
      off("ride:statusUpdate", handleRideUpdate);
      off("ride:cancelled", handleRideUpdate);
      off("ride:accepted", handleRideAccepted);
      off("ride:stopsUpdated", handleStopsUpdated);
      off("ride:destinationUpdated", handleDestinationUpdated);
      off("auth:forceLogout", handleForceLogout);
      if (chauffeur?.id) {
        off(`chauffeur:${chauffeur.id}:forceLogout`, handleForceLogout);
      }
    };
  }, [chauffeur?.id]);

  // Socket delivery is normally immediate. Polling catches cancellations when
  // a mobile network silently suspends or reconnects the foreground socket.
  useEffect(() => {
    if (!currentRide?.id) return;
    let active = true;
    const checkRideStatus = async () => {
      try {
        const response = await apiRequest("GET", `/api/rides/${currentRide.id}`);
        const ride = await response.json();
        if (active && ride?.status === "cancelled") handleRideCancellation(ride);
      } catch {}
    };
    const interval = setInterval(checkRideStatus, 4000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [currentRide?.id]);

  // ─── Persist current ride + keep ref in sync (for notification closures) ──
  useEffect(() => {
    currentRideRef.current = currentRide;
    if (currentRide) {
      AsyncStorage.setItem("a2b_current_ride", JSON.stringify(currentRide)).catch(() => {});
    } else {
      AsyncStorage.removeItem("a2b_current_ride").catch(() => {});
    }
  }, [currentRide]);

  useEffect(() => {
    incomingRideRef.current = incomingRide;
  }, [incomingRide]);

  useEffect(() => {
    availableTripsRef.current = availableTrips;
  }, [availableTrips]);

  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  useEffect(() => {
    chauffeurRef.current = chauffeur;
  }, [chauffeur]);

  // ─── Location tracking ────────────────────────────────────────────────────
  useEffect(() => {
    if (isOnline && chauffeur) {
      startLocationUpdates(chauffeur.id);
    } else {
      stopLocationUpdates();
    }
    return () => {
      stopForegroundLocationUpdates();
    };
  }, [isOnline, chauffeur?.id]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        if (chauffeurRef.current?.id) {
          refreshChauffeur(chauffeurRef.current.id);
        } else if (user?.id) {
          fetchChauffeurForUser(user.id);
        }
        restoreActiveRide();
        if (isOnlineRef.current && chauffeurRef.current?.id) {
          startLocationUpdates(chauffeurRef.current.id);
        }
      }
    });
    return () => subscription.remove();
  }, [user?.id]);

  const locationSeededRef = useRef(false);
  useEffect(() => {
    if (!chauffeur || myLocation || locationSeededRef.current) return;
    locationSeededRef.current = true;

    let cancelled = false;

    async function seedInitialLocation() {
      // Instantly centre the map on the driver's last known position (their
      // city) with a pin, instead of a blank Johannesburg default. Live GPS
      // replaces this as soon as a fix arrives.
      const lastKnown = Number.isFinite(Number(chauffeur?.lat)) && Number.isFinite(Number(chauffeur?.lng)) && Number(chauffeur?.lat) !== 0
        ? { lat: Number(chauffeur.lat), lng: Number(chauffeur.lng) }
        : null;
      if (lastKnown && !cancelled) {
        setMyLocation(lastKnown);
      }
      const fallback = lastKnown || JHB_FALLBACK;

      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;

        if (status !== "granted") {
          setMyLocation(fallback);
          return;
        }

        try {
          const loc = await getBestAvailablePosition();
          if (!cancelled) {
            setMyLocation(toLatLng(loc));
          }
        } catch {
          if (!cancelled) {
            setMyLocation(fallback);
          }
        }
      } catch {
        if (!cancelled) {
          setMyLocation(fallback);
        }
      }
    }

    seedInitialLocation();

    return () => {
      cancelled = true;
    };
  }, [chauffeur?.id]);

  // ─── Poll approval status ─────────────────────────────────────────────────
  useEffect(() => {
    if (!chauffeur?.id) return;
    const interval = setInterval(() => refreshChauffeur(chauffeur.id), 10000);
    return () => clearInterval(interval);
  }, [chauffeur?.id]);

  // ─── Register chauffeur on socket ─────────────────────────────────────────
  useEffect(() => {
    if (!chauffeur?.id) return;
    emit("chauffeur:register", { chauffeurId: chauffeur.id });
  }, [chauffeur?.id]);

  // ─── Push notifications ───────────────────────────────────────────────────
  useEffect(() => {
    if ((!chauffeur?.id && !user?.id) || Platform.OS === "web" || isExpoGoAndroid) return;
    (async () => {
      try {
        const Notifications = notificationsRef.current;
        if (!Notifications) return;
        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("ride-alerts-v3", {
            name: "Ride Alerts",
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            sound: "trip_alert.wav",
            bypassDnd: true,
            lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          });
          await Notifications.setNotificationChannelAsync("default", {
            name: "General Alerts",
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          });
        }
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== "granted") return;
        const projectId =
          Constants.easConfig?.projectId ||
          Constants.expoConfig?.extra?.eas?.projectId ||
          process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
          "eb3b8747-40b2-4aad-b118-e64339bfeea0";
        const tokenData = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined,
        );
        if (tokenData?.data) {
          if (chauffeur?.id) {
            await apiRequest("PUT", `/api/chauffeurs/${chauffeur.id}/push-token`, { pushToken: tokenData.data }).catch(() => {});
          }
          if (user?.id) {
            await apiRequest("PUT", `/api/users/${user.id}/push-token`, { pushToken: tokenData.data }).catch(() => {});
          }
        }
      } catch (e: any) {
        console.log("[push] Chauffeur/Partner registration:", e?.message || e);
      }
    })();
  }, [chauffeur?.id, isExpoGoAndroid, user?.id]);

  useEffect(() => {
    if (Platform.OS === "web" || isExpoGoAndroid) return;
    const Notifications = notificationsRef.current;
    if (!Notifications) return;

    // NOTE: setNotificationHandler is intentionally NOT called here.
    // It is set once at app startup in _layout.tsx to avoid race conditions.

    async function hydrateIncomingRideFromNotification() {
      // Use ref so we always have the latest currentRide value
      if (!chauffeur?.id || currentRideRef.current) return;
      try {
        const res = await apiRequest("GET", `/api/rides/chauffeur-pending/${chauffeur.id}`);
        if (!res.ok) return;
        const ride = await res.json();
        if (!ride?.id) return;
        if (isRideAlertSuppressed(ride.id)) return;
        seenRideIdRef.current = ride.id;
        const presentedRide = await presentIncomingRide(ride);
        if (presentedRide && ride.id !== suppressedRideAlertIdRef.current) playTripAlert();
      } catch {}
    }

    // Response listener: fires when driver TAPS the notification
    const sub = Notifications.addNotificationResponseReceivedListener((response: any) => {
      const data = response.notification.request.content.data as any;
      if (data?.type === "ride:new") {
        setIsOnline(true);
        void hydrateIncomingRideFromNotification();
      }
    });

    // Received listener: fires when notification arrives while app is in foreground or background-resumed
    const subReceived = Notifications.addNotificationReceivedListener((notification: any) => {
      const data = notification.request.content.data as any;
      if (data?.type === "ride:new") {
        void hydrateIncomingRideFromNotification();
      }
    });

    return () => {
      sub.remove();
      subReceived.remove();
    };
  }, [chauffeur?.id, isExpoGoAndroid]);

  // ─── Polling fallback ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOnline || !chauffeur?.isApproved || !chauffeur?.id) return;
    const poll = setInterval(async () => {
      if (currentRide || incomingRide) return;
      try {
        const res = await apiRequest("GET", `/api/rides/chauffeur-pending/${chauffeur.id}`);
        if (!res.ok) return;
        const ride = await res.json();
        if (ride?.id && ride.id !== seenRideIdRef.current) {
          if (isRideAlertSuppressed(ride.id)) return;
          seenRideIdRef.current = ride.id;
          const presentedRide = await presentIncomingRide(ride);
          if (presentedRide && ride.id !== suppressedRideAlertIdRef.current) playTripAlert();
        }
      } catch {}
    }, 6000);
    return () => clearInterval(poll);
  }, [isOnline, chauffeur?.isApproved, chauffeur?.id, currentRide, incomingRide]);

  // ─── Available trips list polling ─────────────────────────────────────────
  useEffect(() => {
    if (!isOnline || !chauffeur?.isApproved || !chauffeur?.id) {
      setAvailableTrips([]);
      return;
    }
    async function fetchAvailable() {
      if (currentRide || incomingRide) { setAvailableTrips([]); return; }
      try {
        const res = await apiRequest("GET", `/api/rides/available/${chauffeur!.id}`);
        if (!res.ok) return;
        const trips = await res.json();
        if (Array.isArray(trips)) {
          const visibleTrips = trips.filter((trip: any) => !isRideAlertSuppressed(trip?.id));
          const enrichedTrips = await Promise.all(visibleTrips.map((trip: any) => enrichRideClientDetails(trip, "Client")));
          setAvailableTrips(enrichedTrips);
        }
      } catch {}
    }
    fetchAvailable();
    const poll = setInterval(fetchAvailable, 8000);
    return () => clearInterval(poll);
  }, [isOnline, chauffeur?.isApproved, chauffeur?.id, currentRide, incomingRide]);

  // ─── Auto-advance nav step ────────────────────────────────────────────────
  useEffect(() => {
    if (!myLocation || navSteps.length === 0) return;
    const step = navSteps[currentStepIdx];
    if (!step?.endLat || !step?.endLng) return;
    const R = 6371000;
    const dLat = (step.endLat - myLocation.lat) * Math.PI / 180;
    const dLng = (step.endLng - myLocation.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(myLocation.lat * Math.PI / 180) * Math.cos(step.endLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    if (dist < 30 && currentStepIdx < navSteps.length - 1) setCurrentStepIdx(i => i + 1);
  }, [myLocation?.lat, myLocation?.lng]);

  useEffect(() => {
    if (currentRide || !incomingRide) {
      stopTripAlert();
    }
  }, [currentRide?.id, incomingRide?.id]);

  useEffect(() => {
    if (navigationVoiceEnabled !== true) {
      lastSpokenNavKeyRef.current = null;
      try {
        Speech.stop();
      } catch {}
      return;
    }
    if (!currentRide || navSteps.length === 0) return;
    const step = navSteps[currentStepIdx];
    const instruction = step?.instruction?.trim();
    if (!instruction) return;

    const navKey = `${currentRide.id}:${currentRide.status}:${currentStepIdx}:${instruction}`;
    if (lastSpokenNavKeyRef.current === navKey) return;
    lastSpokenNavKeyRef.current = navKey;

    if (Platform.OS !== "web") {
      Haptics.selectionAsync().catch(() => {});
      try {
        Speech.stop();
      } catch {}
      try {
        Speech.speak(instruction, {
          language: "en-ZA",
          rate: 0.95,
          pitch: 1,
        });
      } catch {}
    }
  }, [currentRide?.id, currentRide?.status, currentStepIdx, navSteps, navigationVoiceEnabled]);

  useEffect(() => {
    if (!currentRide) {
      lastSpokenNavKeyRef.current = null;
      routeContextRef.current = null;
      lastRouteFetchRef.current = null;
      try {
        Speech.stop();
      } catch {}
    }
  }, [currentRide?.id]);

  useEffect(() => {
    if (!currentRide || !myLocation) return;
    const activeTripTarget = getActiveTripTarget(currentRide);
    const destination = currentRide.status === "trip_started"
      ? { lat: activeTripTarget.lat, lng: activeTripTarget.lng }
      : { lat: currentRide.pickupLat, lng: currentRide.pickupLng };

    if (!destination.lat || !destination.lng) return;

    const parsedDestLat = parseFloat(destination.lat);
    const parsedDestLng = parseFloat(destination.lng);
    const routeKey = [
      currentRide.id || "route",
      currentRide.status || "pickup",
      currentRide.status === "trip_started" ? activeTripTarget.type : "pickup",
      currentRide.status === "trip_started" ? activeTripTarget.index : 0,
      parsedDestLat.toFixed(5),
      parsedDestLng.toFixed(5),
    ].join(":");
    const lastFetch = lastRouteFetchRef.current;
    const movedDistanceKm = lastFetch
      ? haversineDistance(lastFetch.origin.lat, lastFetch.origin.lng, myLocation.lat, myLocation.lng)
      : Infinity;
    const elapsedMs = lastFetch ? Date.now() - lastFetch.fetchedAt : Infinity;
    const shouldRefresh =
      !lastFetch ||
      lastFetch.routeKey !== routeKey ||
      movedDistanceKm >= ROUTE_REFRESH_MIN_DISTANCE_KM ||
      elapsedMs >= ROUTE_REFRESH_MAX_AGE_MS;

    if (!shouldRefresh) return;

    fetchDriverRoute(parsedDestLat, parsedDestLng, { routeKey });
  }, [
    currentRide?.id,
    currentRide?.status,
    currentRide?.completedStopCount,
    currentRide?.stops,
    myLocation?.lat,
    myLocation?.lng,
  ]);

  // ─── Destination Arrival Geofence Detection & End Trip Prompt ────────────
  useEffect(() => {
    if (
      !currentRide ||
      currentRide.status !== "trip_started" ||
      hasPendingStop ||
      !driverLocationSample ||
      !currentRide.dropoffLat ||
      !currentRide.dropoffLng
    ) {
      return;
    }
    const dropoffLat = parseFloat(currentRide.dropoffLat);
    const dropoffLng = parseFloat(currentRide.dropoffLng);
    if (!Number.isFinite(dropoffLat) || !Number.isFinite(dropoffLng)) return;

    const result = evaluateArrivalGeofence(
      destinationArrivalGeofenceRef.current,
      `${currentRide.id}:dropoff:${dropoffLat}:${dropoffLng}`,
      driverLocationSample,
      { lat: dropoffLat, lng: dropoffLng },
    );
    destinationArrivalGeofenceRef.current = result.state;
    if (result.shouldPrompt) {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        try {
          Speech.speak("You have arrived at your destination.", { language: "en-ZA", rate: 0.95 });
        } catch {}
      }
      Alert.alert(
        "Arrived at Destination",
        "You have reached the final destination. Would you like to end the trip now?",
        [
          {
            text: "Not Yet",
            style: "cancel",
            onPress: () => {
              destinationArrivalGeofenceRef.current = dismissArrivalPrompt(
                destinationArrivalGeofenceRef.current,
              );
            },
          },
          {
            text: "End Trip",
            style: "default",
            onPress: () => {
              updateRideStatus("trip_completed");
            },
          },
        ],
      );
    }
  }, [
    currentRide?.id,
    currentRide?.status,
    hasPendingStop,
    driverLocationSample,
    currentRide?.dropoffLat,
    currentRide?.dropoffLng,
  ]);

  // ─── Pickup Arrival Geofence Detection ────────────────────────────────────
  useEffect(() => {
    if (
      !currentRide ||
      (currentRide.status !== "chauffeur_assigned" && currentRide.status !== "chauffeur_arriving") ||
      !driverLocationSample ||
      !currentRide.pickupLat ||
      !currentRide.pickupLng
    ) {
      return;
    }
    const pLat = parseFloat(currentRide.pickupLat);
    const pLng = parseFloat(currentRide.pickupLng);
    if (!Number.isFinite(pLat) || !Number.isFinite(pLng)) return;

    const result = evaluateArrivalGeofence(
      pickupArrivalGeofenceRef.current,
      `${currentRide.id}:pickup:${pLat}:${pLng}`,
      driverLocationSample,
      { lat: pLat, lng: pLng },
    );
    pickupArrivalGeofenceRef.current = result.state;
    if (result.shouldPrompt) {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        try {
          Speech.speak("You have arrived at the pickup location.", { language: "en-ZA", rate: 0.95 });
        } catch {}
      }
      Alert.alert(
        "Arrived at Pickup",
        "You have reached the pickup location. Tap I've Arrived to notify the rider.",
        [
          {
            text: "Not Yet",
            style: "cancel",
            onPress: () => {
              pickupArrivalGeofenceRef.current = dismissArrivalPrompt(
                pickupArrivalGeofenceRef.current,
              );
            },
          },
          {
            text: "I've Arrived",
            style: "default",
            onPress: () => {
              updateRideStatus("chauffeur_arrived");
            },
          },
        ],
      );
    }
  }, [
    currentRide?.id,
    currentRide?.status,
    driverLocationSample,
    currentRide?.pickupLat,
    currentRide?.pickupLng,
  ]);

  // ─── 5-Minute Waiting Timer (when arrived at pickup) ───────────────────────
  useEffect(() => {
    if (currentRide?.status !== "chauffeur_arrived") {
      setWaitingElapsedSec(0);
      return;
    }
    const arrivedAt = currentRide.arrivedAt ? new Date(currentRide.arrivedAt).getTime() : Date.now();
    const updateWaiting = () => {
      const elapsed = Math.max(0, Math.floor((Date.now() - arrivedAt) / 1000));
      setWaitingElapsedSec(elapsed);
    };
    updateWaiting();
    const interval = setInterval(updateWaiting, 1000);
    return () => clearInterval(interval);
  }, [currentRide?.id, currentRide?.status, currentRide?.arrivedAt]);

  // ─── Data ─────────────────────────────────────────────────────────────────
  async function restoreActiveRide(chauffeurId?: string) {
    const targetChauffeurId = chauffeurId || chauffeur?.id || chauffeurRef.current?.id;
    try {
      const saved = await AsyncStorage.getItem("a2b_current_ride");
      if (saved) {
        const ride = JSON.parse(saved);
        if (ride?.id) {
          const rideRes = await apiRequest("GET", `/api/rides/${ride.id}`);
          if (rideRes.ok) {
            const fetchedRide = await rideRes.json();
            const freshRide = await enrichRideClientDetails({
              ...fetchedRide,
              clientFirstName: fetchedRide.clientFirstName || ride.clientFirstName,
              clientName: fetchedRide.clientName || ride.clientName,
            }, "Client");
            if (freshRide.status === "cancelled") {
              currentRideRef.current = ride;
              handleRideCancellation(freshRide);
              return;
            } else if (freshRide.status === "trip_completed") {
              await AsyncStorage.removeItem("a2b_current_ride");
            } else {
              setCurrentRide(freshRide);
              return;
            }
          }
        }
      }

      // If no local active ride or local ride was completed, query server for ongoing active ride
      if (targetChauffeurId) {
        const activeRes = await apiRequest("GET", `/api/rides/chauffeur-active/${targetChauffeurId}`);
        if (activeRes.status === 200) {
          const activeRide = await activeRes.json();
          if (activeRide?.id && !["trip_completed", "cancelled"].includes(activeRide.status)) {
            const freshRide = await enrichRideClientDetails(activeRide, "Client");
            setCurrentRide(freshRide);
            await AsyncStorage.setItem("a2b_current_ride", JSON.stringify(freshRide));
            return;
          }
        }
      } else if (user?.id) {
        const activeRes = await apiRequest("GET", `/api/rides/driver-active-by-user/${user.id}`);
        if (activeRes.status === 200) {
          const activeRide = await activeRes.json();
          if (activeRide?.id && !["trip_completed", "cancelled"].includes(activeRide.status)) {
            const freshRide = await enrichRideClientDetails(activeRide, "Client");
            setCurrentRide(freshRide);
            await AsyncStorage.setItem("a2b_current_ride", JSON.stringify(freshRide));
            return;
          }
        }
      }
    } catch {}
  }

  async function loadChauffeur() {
    if (!user) return;
    try {
      // Ask the server for the operator profile. Only a definitive 404
      // ("you have never applied") may route to onboarding — transient
      // network/server errors must NEVER bounce an active driver there.
      let definitelyNoProfile = false;
      let profileData: any = null;
      try {
        const profileRes = await apiRequest("GET", "/api/operator-profile/me");
        profileData = await profileRes.json();
      } catch (e: any) {
        if (/^404\b/.test(e?.message || "")) definitelyNoProfile = true;
      }
      if (profileData?.profile) {
        setOperatorProfile(profileData.profile);
        if (profileData.profile.type === "partner") {
          await loadFleetOverview();
          const savedMode = await AsyncStorage.getItem("a2b_partner_dashboard_mode");
          if (savedMode === "driver") {
            setPartnerDashboardMode("driver");
          } else {
            setPartnerDashboardMode("partner");
          }
          if (profileData?.chauffeur) {
            setChauffeur(profileData.chauffeur);
            setIsOnline(profileData.chauffeur.isOnline || false);
            if (typeof profileData.chauffeur.todayEarnings === "number") {
              setTodayEarnings(profileData.chauffeur.todayEarnings);
            }
          }
        }
      }
      const stored = await AsyncStorage.getItem("a2b_chauffeur");
      if (stored) {
        const cached = JSON.parse(stored);
        const refreshed = cached?.id ? await refreshChauffeur(cached.id) : null;
        if (refreshed) {
          await loadDriverVehicles();
          await loadFleetOverview();
          restoreActiveRide(refreshed.id);
          return;
        }
        // Refresh failed (may be offline) — keep showing cached profile instead of bouncing.
        if (cached?.id && !definitelyNoProfile) {
          setChauffeur(cached);
          setIsOnline(cached.isOnline || false);
          restoreActiveRide(cached.id);
          return;
        }
        await AsyncStorage.removeItem("a2b_chauffeur");
      }
      const c = await fetchChauffeurForUser(user.id);
      if (c?.id) {
        await loadDriverVehicles();
        await loadFleetOverview();
        restoreActiveRide(c.id);
        return;
      }
      // Route to onboarding ONLY when the server definitively said 404 —
      // never on network errors or transient failures.
      if (definitelyNoProfile) {
        router.replace("/chauffeur-onboarding");
      }
    } catch {
      // Unexpected error — do not bounce active users to onboarding.
    } finally {
      setLoading(false);
    }
  }

  async function fetchChauffeurForUser(userId: string) {
    try {
      const res = await apiRequest("GET", `/api/chauffeurs/user/${userId}`);
      const c = await res.json();
      setChauffeur(c);
      setIsOnline(c.isOnline || false);
      if (typeof c.todayEarnings === "number") setTodayEarnings(c.todayEarnings);
      await AsyncStorage.setItem("a2b_chauffeur", JSON.stringify(c));
      return c;
    } catch {
      return null;
    }
  }

  async function loadDriverVehicles() {
    try {
      const res = await apiRequest("GET", "/api/vehicles");
      const data = await res.json();
      setDriverVehicles(Array.isArray(data.vehicles) ? data.vehicles : []);
    } catch {
      setDriverVehicles([]);
    }
  }

  async function loadFleetOverview() {
    try {
      const res = await apiRequest("GET", "/api/fleet/overview");
      const data = await res.json();
      setFleetOverview({
        vehicles: data?.overview?.vehicles || 0,
        assignedDrivers: data?.overview?.assignedDrivers || 0,
        activeTrips: data?.overview?.activeTrips || 0,
        pendingApprovals: data?.overview?.pendingApprovals || 0,
      });
    } catch {}
  }

  async function refreshChauffeur(id: string) {
    try {
      const res = await apiRequest("GET", `/api/chauffeurs/${id}`);
      const c = await res.json();
      setChauffeur(c);
      setIsOnline(c.isOnline || false);
      if (typeof c.todayEarnings === "number") setTodayEarnings(c.todayEarnings);
      await AsyncStorage.setItem("a2b_chauffeur", JSON.stringify(c));
      return c;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    loadChauffeur();
    // Persist mode so app reopens to the correct screen
    AsyncStorage.setItem("a2b_last_mode", "chauffeur").catch(() => {});
  }, []);

  // ─── Actions ──────────────────────────────────────────────────────────────
  async function toggleOnline() {
    let activeChauffeur = chauffeur;
    if (!activeChauffeur?.id && user?.id) {
      activeChauffeur = await fetchChauffeurForUser(user.id);
    }
    if (!activeChauffeur?.id) {
      Alert.alert("Error", "Unable to load driver profile");
      closeMenu();
      return;
    }
    if (!activeChauffeur.isOnline && !activeChauffeur.activeVehicleId) {
      Alert.alert("Select vehicle", "Choose an approved assigned vehicle before going online.");
      router.push("/chauffeur/vehicles" as never);
      closeMenu();
      return;
    }
    try {
      const res = await apiRequest("PUT", `/api/chauffeurs/${activeChauffeur.id}/toggle-online`);
      const updated = await res.json();
      setChauffeur(updated);
      setIsOnline(updated.isOnline);
      await AsyncStorage.setItem("a2b_chauffeur", JSON.stringify(updated));
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e: any) {
      const recovered = user?.id ? await fetchChauffeurForUser(user.id) : null;
      if (recovered?.id) {
        try {
          const retryRes = await apiRequest("PUT", `/api/chauffeurs/${recovered.id}/toggle-online`);
          const updated = await retryRes.json();
          setChauffeur(updated);
          setIsOnline(updated.isOnline);
          await AsyncStorage.setItem("a2b_chauffeur", JSON.stringify(updated));
          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          closeMenu();
          return;
        } catch (retryError: any) {
          Alert.alert("Error", retryError.message || e.message || "Failed to update status");
          closeMenu();
          return;
        }
      }
      Alert.alert("Error", e.message || "Failed to update status");
    }
    closeMenu();
  }

  const JHB_FALLBACK = { lat: -26.2041, lng: 28.0473 };

  function publishChauffeurLocation(location: Location.LocationObject) {
    const next = toLatLng(location);
    const heading = next.heading;
    const speed = next.speed;
    lastForegroundLocationAtRef.current = Date.now();
    setDriverLocationSample({
      lat: next.lat,
      lng: next.lng,
      accuracyM: typeof location.coords?.accuracy === "number" && Number.isFinite(location.coords.accuracy)
        ? location.coords.accuracy
        : null,
      timestamp: typeof location.timestamp === "number" && Number.isFinite(location.timestamp)
        ? location.timestamp
        : Date.now(),
    });
    setMyLocation((current) => {
      if (
        current &&
        haversineDistance(current.lat, current.lng, next.lat, next.lng) < 0.001 &&
        (heading === undefined || Math.abs((current.heading || 0) - (heading || 0)) < 2)
      ) {
        return current;
      }
      return next;
    });
    const activeChauffeurId = chauffeurRef.current?.id || chauffeur?.id;
    if (activeChauffeurId) {
      emit("chauffeur:location", {
        chauffeurId: activeChauffeurId,
        lat: next.lat,
        lng: next.lng,
        heading: typeof heading === "number" && !isNaN(heading) && heading >= 0 ? heading : undefined,
        speed: typeof speed === "number" && !isNaN(speed) && speed >= 0 ? speed : undefined,
      });
      const now = Date.now();
      if (now - lastLocationRestPostRef.current >= DRIVER_LOCATION_REST_MIN_INTERVAL_MS) {
        lastLocationRestPostRef.current = now;
        postChauffeurLocation(activeChauffeurId, next.lat, next.lng).catch(() => {});
      }
    }
  }

  async function startBackgroundLocationTask(activeChauffeurId: string, session: number) {
    if (Platform.OS === "web" || isExpoGoAndroid) return;
    try {
      const foreground = await Location.requestForegroundPermissionsAsync();
      if (session !== locationSessionRef.current || !isOnlineRef.current) return;
      if (foreground.status !== "granted") return;

      if (Platform.OS === "android") {
        let background = await Location.getBackgroundPermissionsAsync();
        if (session !== locationSessionRef.current || !isOnlineRef.current) return;
        if (background.status !== "granted" && AppState.currentState === "active") {
          background = await Location.requestBackgroundPermissionsAsync();
        }
        if (session !== locationSessionRef.current || !isOnlineRef.current) return;
        if (background.status !== "granted") return;
      }

      const alreadyRunning = await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK_NAME);
      if (session !== locationSessionRef.current || !isOnlineRef.current) return;
      if (alreadyRunning) return;

      await AsyncStorage.setItem(
        DRIVER_LOCATION_TASK_STATE_KEY,
        JSON.stringify({ chauffeurId: activeChauffeurId, isOnline: true }),
      );
      if (session !== locationSessionRef.current || !isOnlineRef.current) return;
      await Location.startLocationUpdatesAsync(DRIVER_LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.High,
        timeInterval: 10_000,
        distanceInterval: 10,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: "A2B Chauffeur Active",
          notificationBody: "Sharing location for ride dispatch",
          notificationColor: "#0a0a0a",
        },
      });
    } catch (e: any) {
      console.log("[driver-location-task] start:", e?.message || e);
    }
  }

  async function stopBackgroundLocationTask() {
    if (Platform.OS === "web" || isExpoGoAndroid) return;
    try {
      await AsyncStorage.setItem(DRIVER_LOCATION_TASK_STATE_KEY, JSON.stringify({ isOnline: false }));
      const running = await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK_NAME);
      if (running) {
        await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK_NAME);
      }
    } catch (e: any) {
      console.log("[driver-location-task] stop:", e?.message || e);
    }
  }

  async function startLocationUpdates(activeChauffeurId: string) {
    if (
      locationStartInFlightRef.current !== null ||
      locationWatchRef.current ||
      locationIntervalRef.current
    ) {
      return;
    }

    const session = ++locationSessionRef.current;
    locationStartInFlightRef.current = session;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (session !== locationSessionRef.current) return;
      if (status !== "granted") { setMyLocation(JHB_FALLBACK); return; }
      void startBackgroundLocationTask(activeChauffeurId, session);

      try {
        const loc = await getBestAvailablePosition();
        if (session !== locationSessionRef.current) return;
        publishChauffeurLocation(loc);
      } catch {
        setMyLocation(JHB_FALLBACK);
      }

      try {
        const watch = await watchBestPosition((loc) => {
          if (session === locationSessionRef.current) publishChauffeurLocation(loc);
        });
        if (session !== locationSessionRef.current) {
          watch.remove();
          return;
        }
        locationWatchRef.current = watch;
      } catch {}

      if (session !== locationSessionRef.current) return;
      const interval = setInterval(async () => {
        if (session !== locationSessionRef.current) return;
        if (Date.now() - lastForegroundLocationAtRef.current < 20_000) return;
        try {
          const loc = await getBestAvailablePosition();
          if (session === locationSessionRef.current) publishChauffeurLocation(loc);
        } catch {}
      }, 15000);
      locationIntervalRef.current = interval;
    } catch {
      if (session === locationSessionRef.current) setMyLocation(JHB_FALLBACK);
    } finally {
      if (locationStartInFlightRef.current === session) {
        locationStartInFlightRef.current = null;
      }
    }
  }

  function stopForegroundLocationUpdates() {
    locationSessionRef.current += 1;
    locationStartInFlightRef.current = null;
    try {
      locationWatchRef.current?.remove();
    } catch {}
    locationWatchRef.current = null;
    if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
      locationIntervalRef.current = null;
    }
  }

  function stopLocationUpdates() {
    stopForegroundLocationUpdates();
    void stopBackgroundLocationTask();
  }

  async function fetchDriverRoute(
    destLat: number,
    destLng: number,
    options?: { routeKey?: string; stops?: { lat: number; lng: number }[] },
  ): Promise<boolean> {
    if (!myLocation) return false;
    try {
      const stopQuery = options?.stops?.length
        ? `&stops=${encodeURIComponent(options.stops.map((stop) => `${stop.lat},${stop.lng}`).join("|"))}`
        : "";
      const res = await apiRequest("GET",
        `/api/directions?originLat=${myLocation.lat}&originLng=${myLocation.lng}&destLat=${destLat}&destLng=${destLng}${stopQuery}`
      );
      const data = await res.json();
      const fallbackRoute = data?.polyline
        ? {
            polyline: data.polyline,
            distanceText: data.distanceText,
            durationText: data.durationText,
            distanceKm: data.distanceKm,
            durationMin: data.durationMin,
            summary: data.summary,
            steps: Array.isArray(data.steps) ? data.steps : [],
          }
        : null;
      const alternatives = getRouteAlternatives(data.alternatives, fallbackRoute);
      const routeContextKey = [
        currentRide?.id || "route",
        currentRide?.status || "pickup",
        Number(destLat).toFixed(5),
        Number(destLng).toFixed(5),
      ].join(":");
      const hasContextChanged = routeContextRef.current !== routeContextKey;
      routeContextRef.current = routeContextKey;

      const nextSelectedIndex = hasContextChanged
        ? 0
        : Math.min(selectedRouteIndex, Math.max(alternatives.length - 1, 0));
      const activeRoute = alternatives[nextSelectedIndex] || alternatives[0] || fallbackRoute;

      setRouteAlternatives(alternatives);
      setSelectedRouteIndex(nextSelectedIndex);

      if (activeRoute?.polyline) {
        setRoutePolyline(activeRoute.polyline);
      }

      if (activeRoute?.distanceText && activeRoute?.durationText) {
        setRideEta({
          distanceText: activeRoute.distanceText,
          durationText: activeRoute.durationText,
          distanceKm: activeRoute.distanceKm,
          durationMin: activeRoute.durationMin,
        });
      }

      if (Array.isArray(activeRoute?.steps) && activeRoute.steps.length > 0) {
        setNavSteps(activeRoute.steps);
        setCurrentStepIdx((prev) => (hasContextChanged ? 0 : Math.min(prev, activeRoute.steps.length - 1)));
      } else if (hasContextChanged) {
        setNavSteps([]);
        setCurrentStepIdx(0);
      }
      lastRouteFetchRef.current = {
        routeKey: options?.routeKey || routeContextKey,
        origin: { lat: myLocation.lat, lng: myLocation.lng },
        fetchedAt: Date.now(),
      };
      return true;
    } catch { return false; }
  }

  function selectRoute(alt: any, index: number) {
    setSelectedRouteIndex(index);
    setRoutePolyline(alt.polyline);
    setRideEta({ distanceText: alt.distanceText, durationText: alt.durationText, distanceKm: alt.distanceKm, durationMin: alt.durationMin });
    if (Array.isArray(alt.steps) && alt.steps.length > 0) {
      setNavSteps(alt.steps);
      setCurrentStepIdx(0);
    }
    setShowNavModal(true);
  }

  async function startTripToDestination() {
    if (!currentRide) return;
    await updateRideStatus("trip_started");
    // Route to dropoff is fetched inside updateRideStatus after trip_started
  }

  async function openClientProfile(clientId?: string) {
    const resolvedClientId = clientId || currentRide?.clientId || incomingRide?.clientId;
    if (!resolvedClientId) return;
    setClientProfile(null);
    setClientProfileLoading(true);
    setShowClientProfile(true);
    try {
      const res = await apiRequest("GET", `/api/clients/${resolvedClientId}/profile`);
      const data = await res.json();
      setClientProfile(data);
    } catch {
      const fallbackProfile = await buildFallbackClientProfile(resolvedClientId);
      if (fallbackProfile) {
        setClientProfile(fallbackProfile);
      } else {
        Alert.alert("Error", "Could not load client profile.");
        setShowClientProfile(false);
      }
    } finally {
      setClientProfileLoading(false);
    }
  }

  async function submitCashSettlementAndContinue() {
    if (!completedTrip || cashSettling) return;
    const received = parseFloat(cashReceivedInput);
    if (isNaN(received) || received < 0) {
      Alert.alert("Invalid Amount", "Please enter a valid cash amount received from the rider.");
      return;
    }

    try {
      setCashSettling(true);
      await apiRequest("POST", `/api/rides/${completedTrip.id}/cash-settlement`, {
        amountReceived: received,
      });
    } catch (error: any) {
      console.log("Cash settlement error (non-fatal):", error?.message || error);
    } finally {
      setCashSettling(false);
      beginClientRating();
    }
  }

  function beginClientRating() {
    if (!completedTrip?.clientId) {
      setCompletedTrip(null);
      return;
    }
    setClientRatingRide(completedTrip);
    setClientRating(0);
    setClientRatingComment("");
    setCompletedTrip(null);
    setShowClientRating(true);
  }

  function closeClientRating() {
    setShowClientRating(false);
    setClientRating(0);
    setClientRatingComment("");
    setClientRatingRide(null);
  }

  async function submitClientRating() {
    if (!clientRatingRide || clientRating === 0) {
      Alert.alert("Rating Required", "Please select a rating for this client.");
      return;
    }
    try {
      setSubmittingClientRating(true);
      await apiRequest("POST", `/api/rides/${clientRatingRide.id}/rate-client`, {
        rating: clientRating,
        comment: clientRatingComment.trim() || null,
      });
      closeClientRating();
      Alert.alert("Rating Saved", "The client rating has been submitted.");
    } catch (error: any) {
      const message = String(error?.message || "");
      if (message.includes("Cannot POST") || message.includes("404:")) {
        Alert.alert("Backend Update Needed", "Client rating is not live on the server yet. The app changes are ready, but Railway still needs the updated backend route.");
      } else {
        Alert.alert("Error", error.message || "Failed to submit client rating.");
      }
    } finally {
      setSubmittingClientRating(false);
    }
  }

  async function acceptRide() {
    if (!incomingRide || !chauffeur) return;
    const pendingRide = incomingRide;
    suppressRideAlert(pendingRide.id);
    clearIncomingRide();
    stopTripAlert();
    try {
      const res = await apiRequest("PUT", `/api/rides/${pendingRide.id}/accept`, { chauffeurId: chauffeur.id });
      if (res.status === 409) {
        Alert.alert("Too Late", "This ride was already taken by another driver.");
        clearIncomingRide();
        return;
      }
      const ride = await res.json();
      const enrichedRide = await enrichRideClientDetails({
        ...ride,
        clientFirstName: ride.clientFirstName || pendingRide.clientFirstName,
        clientName: ride.clientName || pendingRide.clientName,
        clientPhone: ride.clientPhone || pendingRide.clientPhone,
      }, "Client");
      setCurrentRide(enrichedRide);
      clearIncomingRide();
      if (enrichedRide.pickupLat && enrichedRide.pickupLng) {
        await fetchDriverRoute(parseFloat(enrichedRide.pickupLat), parseFloat(enrichedRide.pickupLng), {
          routeKey: [
            enrichedRide.id || "route",
            enrichedRide.status || "pickup",
            Number(enrichedRide.pickupLat).toFixed(5),
            Number(enrichedRide.pickupLng).toFixed(5),
          ].join(":"),
        });
      }
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowNavModal(true);
    } catch {
      Alert.alert("Error", "Ride may have been taken by another chauffeur");
      const restoredRide = await enrichRideClientDetails(pendingRide, "Client");
      await presentIncomingRide(restoredRide, true);
    }
  }

  function declineRide() {
    suppressRideAlert(incomingRide?.id);
    stopTripAlert();
    clearIncomingRide();
    setRideEta(null);
  }

  async function acceptTripFromList(trip: any) {
    if (!chauffeur || acceptingTripId) return;
    suppressRideAlert(trip.id);
    stopTripAlert();
    setAcceptingTripId(trip.id);
    try {
      const res = await apiRequest("PUT", `/api/rides/${trip.id}/accept`, { chauffeurId: chauffeur.id });
      if (res.status === 409) {
        Alert.alert("Too Late", "This ride was already taken by another driver.");
        setAvailableTrips((prev) => prev.filter((t) => t.id !== trip.id));
        return;
      }
      const ride = await res.json();
      const enrichedRide = await enrichRideClientDetails({
        ...ride,
        clientFirstName: ride.clientFirstName || trip.clientFirstName,
        clientName: ride.clientName || trip.clientName,
        clientPhone: ride.clientPhone || trip.clientPhone,
      }, "Client");
      setCurrentRide(enrichedRide);
      setAvailableTrips([]);
      clearIncomingRide();
      if (enrichedRide.pickupLat && enrichedRide.pickupLng) {
        await fetchDriverRoute(parseFloat(enrichedRide.pickupLat), parseFloat(enrichedRide.pickupLng), {
          routeKey: [
            enrichedRide.id || "route",
            enrichedRide.status || "pickup",
            Number(enrichedRide.pickupLat).toFixed(5),
            Number(enrichedRide.pickupLng).toFixed(5),
          ].join(":"),
        });
      }
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowNavModal(true);
    } catch {
      Alert.alert("Error", "Could not accept this ride. It may have been taken.");
    } finally {
      setAcceptingTripId(null);
    }
  }

  async function updateRideStatus(status: string) {
    if (!currentRide || rideStatusUpdating) return;
    if (status === "cancelled") driverCancellationRideIdRef.current = currentRide.id;
    setRideStatusUpdating(status);
    try {
      const actualDurationMin = status === "trip_completed" && currentRide.tripStartedAt
        ? Math.max(0, (Date.now() - new Date(currentRide.tripStartedAt).getTime()) / 60000)
        : undefined;
      const res = await apiRequest("PUT", `/api/rides/${currentRide.id}/status`, {
        status,
        ...(actualDurationMin ? { actualDurationMin } : {}),
        ...(myLocation ? { driverLat: myLocation.lat, driverLng: myLocation.lng } : {}),
      });
      const ride = await res.json();
      const rideWithFallbackName = {
        ...ride,
        clientFirstName:
          ride?.clientFirstName ||
          currentRide?.clientFirstName ||
          (currentRide?.clientName ? String(currentRide.clientName).split(" ")[0] : null) ||
          "Client",
        clientName: ride?.clientName || currentRide?.clientName,
        clientPhone: ride?.clientPhone || currentRide?.clientPhone,
      };
      const rideWithName =
        status === "trip_completed" || status === "cancelled"
          ? rideWithFallbackName
          : await enrichRideClientDetails(rideWithFallbackName, "Client");
      if (status === "trip_completed" || status === "cancelled") {
        suppressRideAlert(currentRide.id);
        if (status === "trip_completed") {
          setCompletedTrip(rideWithName);
          setCashReceivedInput(getRideFare(rideWithName).toFixed(0));
        }
        currentRideRef.current = null;
        setCurrentRide(null);
        AsyncStorage.removeItem("a2b_current_ride").catch(() => {});
        setRoutePolyline(null);
        setRouteAlternatives([]);
        setSelectedRouteIndex(0);
        setRideEta(null);
        setShowNavModal(false);
        setNavSteps([]);
        setCurrentStepIdx(0);
        routeContextRef.current = null;
        if (chauffeur) refreshChauffeur(chauffeur.id);
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (status === "cancelled") Alert.alert("Trip cancelled", "The rider has been notified.");
      } else {
        setCurrentRide(rideWithName);
        if (status === "trip_started") {
          const activeTripTarget = getActiveTripTarget(rideWithName);
          await fetchDriverRoute(activeTripTarget.lat, activeTripTarget.lng, {
            routeKey: [
              rideWithName.id || "route",
              rideWithName.status || status,
              activeTripTarget.type,
              activeTripTarget.index,
              activeTripTarget.lat.toFixed(5),
              activeTripTarget.lng.toFixed(5),
            ].join(":"),
          });
          setShowNavModal(true);
        }
      }
    } catch (error: any) {
      if (status === "cancelled") driverCancellationRideIdRef.current = null;
      Alert.alert("Could not update trip", error?.message || "Failed to update ride status");
    } finally {
      setRideStatusUpdating(null);
    }
  }

  function handleDriverArrivedAtPickup() {
    if (!currentRide) return;
    if (myLocation && currentRide.pickupLat && currentRide.pickupLng) {
      const pLat = parseFloat(currentRide.pickupLat);
      const pLng = parseFloat(currentRide.pickupLng);
      if (Number.isFinite(pLat) && Number.isFinite(pLng)) {
        const distKm = haversineDistance(myLocation.lat, myLocation.lng, pLat, pLng);
        if (distKm > 0.35) {
          Alert.alert(
            "Pickup Proximity Check",
            `You appear to be ${Math.round(distKm * 1000)}m away from the pickup point. Confirm that you have arrived?`,
            [
              { text: "Not Yet", style: "cancel" },
              { text: "Confirm Arrival", onPress: () => updateRideStatus("chauffeur_arrived") },
            ],
          );
          return;
        }
      }
    }
    updateRideStatus("chauffeur_arrived");
  }

  function confirmCurrentStop() {
    const activeRide = currentRideRef.current || currentRide;
    if (!activeRide || stopProgressLoading || stopConfirmationInFlightRef.current) return;
    const activeTripTarget = getActiveTripTarget(activeRide);
    if (activeTripTarget.type !== "stop") return;

    Alert.alert(
      `Confirm Stop ${activeTripTarget.index + 1} of ${activeTripTarget.totalStops}`,
      `Confirm that you have reached ${activeTripTarget.address}. Navigation will continue to the next destination.`,
      [
        { text: "Not Yet", style: "cancel" },
        {
          text: "Confirm Stop",
          onPress: async () => {
            if (stopConfirmationInFlightRef.current) return;
            stopConfirmationInFlightRef.current = true;
            const previousRide = currentRideRef.current || activeRide;
            const optimisticRide = {
              ...previousRide,
              completedStopCount: getCompletedStopCount(previousRide) + 1,
            };
            currentRideRef.current = optimisticRide;
            setCurrentRide(optimisticRide);
            setStopProgressLoading(true);
            try {
              const res = await apiRequest(
                "PUT",
                `/api/rides/${previousRide.id}/stops/complete`,
              );
              const updatedRide = await res.json();
              const rideWithName = {
                ...optimisticRide,
                ...updatedRide,
                clientFirstName: updatedRide.clientFirstName || previousRide.clientFirstName,
                clientName: updatedRide.clientName || previousRide.clientName,
                clientPhone: updatedRide.clientPhone || previousRide.clientPhone,
              };
              currentRideRef.current = rideWithName;
              AsyncStorage.setItem("a2b_current_ride", JSON.stringify(rideWithName)).catch(() => {});
              if (Platform.OS !== "web") {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              }
            } catch (error: any) {
              currentRideRef.current = previousRide;
              setCurrentRide(previousRide);
              Alert.alert("Could not confirm stop", error?.message || "Please try again.");
            } finally {
              stopConfirmationInFlightRef.current = false;
              setStopProgressLoading(false);
            }
          },
        },
      ],
    );
  }

  function confirmCancelRide() {
    Alert.alert("Cancel Trip", "Are you sure? This may affect your rating.", [
      { text: "Keep Trip", style: "cancel" },
      { text: "Cancel Trip", style: "destructive", onPress: () => updateRideStatus("cancelled") },
    ]);
  }

  // ─── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.white} />
      </View>
    );
  }

  const isApprovedPartnerOrChauffeur =
    Boolean(
      (operatorProfile?.type === "partner" || operatorProfile?.type === "driver" || user?.role === "chauffeur") &&
      (operatorProfile?.status === "approved" || chauffeur?.isApproved)
    );

  if (isApprovedPartnerOrChauffeur && partnerDashboardMode === "partner") {
    const isChauffeurRole = operatorProfile?.type === "driver" || user?.role === "chauffeur";
    const partnerTitle = isChauffeurRole ? "Driver partner dashboard" : "Partner Dashboard";

    return (
      <View style={[styles.partnerMainContainer, { paddingTop: insets.top + (Platform.OS === "web" ? 64 : 12) }]}>
        <ScrollView
          style={styles.partnerScroll}
          contentContainerStyle={[styles.partnerScrollContent, { paddingBottom: insets.bottom + 48 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={partnerRefreshing}
              onRefresh={async () => {
                setPartnerRefreshing(true);
                try {
                  await Promise.all([loadFleetOverview(), loadDriverVehicles()]);
                } finally {
                  setPartnerRefreshing(false);
                }
              }}
              tintColor={Colors.white}
            />
          }
        >
          {/* ─── Top Executive Header ─── */}
          <View style={styles.partnerHeaderBar}>
            <View style={styles.partnerBrandCol}>
              <View style={styles.partnerBadgeRow}>
                <View style={styles.partnerLogoIcon}>
                  <Ionicons name="business" size={16} color="#10B981" />
                </View>
                <Text style={styles.partnerBrandTag}>A2B LIFT FLEET</Text>
              </View>
              <Text
                style={styles.partnerWelcomeTitle}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {partnerTitle}
              </Text>
              <Text style={styles.partnerSubtitle}>
                {isChauffeurRole
                  ? "Manage assigned vehicles, fleet connections, and live operations."
                  : "Manage vehicles, assign drivers, track live operations and revenue."}
              </Text>
            </View>
          </View>

          {/* ─── Hero Driver Quick-Switch Card ─── */}
          <View style={styles.driverModeHeroCard}>
            <View style={styles.driverModeHeroLeft}>
              <View style={styles.driverModeIconCircle}>
                <Ionicons name="car-sport" size={24} color="#10B981" />
              </View>
              <View style={styles.driverModeHeroTexts}>
                <Text style={styles.driverModeHeroTitle}>Drive & Take Rides</Text>
                <Text style={styles.driverModeHeroDesc}>
                  Drive one of your fleet vehicles? Switch to the Driver Dashboard to go online, accept ride requests, and navigate trips.
                </Text>
              </View>
            </View>
            <Pressable
              style={({ pressed }) => [styles.driverModeHeroBtn, pressed && { opacity: 0.85 }]}
              onPress={async () => {
                setPartnerDashboardMode("driver");
                await AsyncStorage.setItem("a2b_partner_dashboard_mode", "driver");
              }}
            >
              <Text style={styles.driverModeHeroBtnText}>Go to Driver Dashboard</Text>
              <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
            </Pressable>
          </View>

          {/* ─── Fleet Key Metrics Grid (2x2) ─── */}
          <Text style={styles.partnerSectionHeader}>FLEET OVERVIEW</Text>
          <View style={styles.partnerMetricsGrid}>
            <Pressable
              style={styles.partnerMetricCard}
              onPress={() => router.push("/chauffeur/vehicles" as never)}
            >
              <View style={styles.metricTopRow}>
                <View style={[styles.metricIconWrap, { backgroundColor: "rgba(16, 185, 129, 0.15)" }]}>
                  <Ionicons name="car-sport" size={18} color="#10B981" />
                </View>
                <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.3)" />
              </View>
              <Text style={styles.metricBigNumber}>{fleetOverview.vehicles}</Text>
              <Text style={styles.metricLabel}>Fleet Vehicles</Text>
              <Text style={styles.metricSubtext}>Registered & approved</Text>
            </Pressable>

            <Pressable
              style={styles.partnerMetricCard}
              onPress={() => router.push("/chauffeur/fleet" as never)}
            >
              <View style={styles.metricTopRow}>
                <View style={[styles.metricIconWrap, { backgroundColor: "rgba(56, 189, 248, 0.15)" }]}>
                  <Ionicons name="people" size={18} color="#38BDF8" />
                </View>
                <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.3)" />
              </View>
              <Text style={styles.metricBigNumber}>{fleetOverview.assignedDrivers}</Text>
              <Text style={styles.metricLabel}>Chauffeur Team</Text>
              <Text style={styles.metricSubtext}>Assigned drivers</Text>
            </Pressable>

            <Pressable
              style={styles.partnerMetricCard}
              onPress={() => router.push("/chauffeur/live-map" as never)}
            >
              <View style={styles.metricTopRow}>
                <View style={[styles.metricIconWrap, { backgroundColor: "rgba(168, 85, 247, 0.15)" }]}>
                  <Ionicons name="navigate" size={18} color="#A855F7" />
                </View>
                <View style={styles.liveIndicatorPulse}>
                  <View style={styles.livePulseDot} />
                  <Text style={styles.livePulseText}>LIVE</Text>
                </View>
              </View>
              <Text style={styles.metricBigNumber}>{fleetOverview.activeTrips}</Text>
              <Text style={styles.metricLabel}>Active Trips</Text>
              <Text style={styles.metricSubtext}>On the road now</Text>
            </Pressable>

            <Pressable
              style={styles.partnerMetricCard}
              onPress={() => router.push(isApprovedPartner ? "/chauffeur/earnings" : "/chauffeur/vehicles" as never)}
            >
              <View style={styles.metricTopRow}>
                <View style={[styles.metricIconWrap, { backgroundColor: "rgba(245, 158, 11, 0.15)" }]}>
                  <Ionicons name={isApprovedPartner ? "wallet" : "time"} size={18} color="#F59E0B" />
                </View>
                <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.3)" />
              </View>
              <Text style={styles.metricBigNumber}>{isApprovedPartner ? `R ${todayEarnings}` : fleetOverview.pendingApprovals}</Text>
              <Text style={styles.metricLabel}>{isApprovedPartner ? "Today's Earnings" : "Pending Items"}</Text>
              <Text style={styles.metricSubtext}>{isApprovedPartner ? "Net fleet revenue" : "Review queue"}</Text>
            </Pressable>
          </View>

          {/* ─── Fleet Operations Action Menu ─── */}
          <Text style={styles.partnerSectionHeader}>FLEET OPERATIONS & TOOLS</Text>
          <View style={styles.operationsList}>
            {/* Live GPS Fleet Map */}
            <Pressable
              style={({ pressed }) => [styles.operationItem, pressed && styles.operationItemPressed]}
              onPress={() => router.push("/chauffeur/live-map" as never)}
            >
              <View style={[styles.operationIconCircle, { backgroundColor: "rgba(16, 185, 129, 0.15)" }]}>
                <Ionicons name="map" size={20} color="#10B981" />
              </View>
              <View style={styles.operationContent}>
                <View style={styles.operationTitleRow}>
                  <Text style={styles.operationTitle}>Fleet Live Map</Text>
                  <View style={styles.liveGpsBadge}>
                    <Text style={styles.liveGpsBadgeText}>GPS TRACKING</Text>
                  </View>
                </View>
                <Text style={styles.operationSubtitle}>View real-time location of all vehicles and drivers</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />
            </Pressable>

            {/* Earnings & Payouts */}
            <Pressable
              style={({ pressed }) => [styles.operationItem, pressed && styles.operationItemPressed]}
              onPress={() => router.push("/chauffeur/earnings")}
            >
              <View style={[styles.operationIconCircle, { backgroundColor: "rgba(34, 197, 94, 0.15)" }]}>
                <Ionicons name="cash" size={20} color="#22C55E" />
              </View>
              <View style={styles.operationContent}>
                <Text style={styles.operationTitle}>Earnings & Payouts</Text>
                <Text style={styles.operationSubtitle}>Weekly cycle balances, statements & bank withdrawals</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />
            </Pressable>

            {/* Vehicles */}
            <Pressable
              style={({ pressed }) => [styles.operationItem, pressed && styles.operationItemPressed]}
              onPress={() => router.push("/chauffeur/vehicles" as never)}
            >
              <View style={[styles.operationIconCircle, { backgroundColor: "rgba(14, 165, 233, 0.15)" }]}>
                <Ionicons name="car-sport" size={20} color="#0EA5E9" />
              </View>
              <View style={styles.operationContent}>
                <Text style={styles.operationTitle}>Vehicle Fleet</Text>
                <Text style={styles.operationSubtitle}>Add vehicles, upload Dekra/photos & assign drivers</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />
            </Pressable>

            {/* Drivers */}
            <Pressable
              style={({ pressed }) => [styles.operationItem, pressed && styles.operationItemPressed]}
              onPress={() => router.push("/chauffeur/fleet" as never)}
            >
              <View style={[styles.operationIconCircle, { backgroundColor: "rgba(139, 92, 246, 0.15)" }]}>
                <Ionicons name="people" size={20} color="#8B5CF6" />
              </View>
              <View style={styles.operationContent}>
                <Text style={styles.operationTitle}>Driver Management</Text>
                <Text style={styles.operationSubtitle}>Invite, review and assign approved chauffeurs</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />
            </Pressable>

            {/* Trips */}
            <Pressable
              style={({ pressed }) => [styles.operationItem, pressed && styles.operationItemPressed]}
              onPress={() => router.push("/chauffeur/rides" as never)}
            >
              <View style={[styles.operationIconCircle, { backgroundColor: "rgba(217, 119, 6, 0.15)" }]}>
                <Ionicons name="receipt" size={20} color="#D97706" />
              </View>
              <View style={styles.operationContent}>
                <Text style={styles.operationTitle}>Trip History</Text>
                <Text style={styles.operationSubtitle}>All completed rides, passenger routes & invoices</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />
            </Pressable>

            {/* Settings */}
            <Pressable
              style={({ pressed }) => [styles.operationItem, pressed && styles.operationItemPressed]}
              onPress={() => router.push("/chauffeur/settings" as never)}
            >
              <View style={[styles.operationIconCircle, { backgroundColor: "rgba(148, 163, 184, 0.15)" }]}>
                <Ionicons name="settings" size={20} color="#94A3B8" />
              </View>
              <View style={styles.operationContent}>
                <Text style={styles.operationTitle}>Settings & Profile</Text>
                <Text style={styles.operationSubtitle}>Company profile, preferences & banking information</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />
            </Pressable>

            {/* Notifications */}
            <Pressable
              style={({ pressed }) => [styles.operationItem, pressed && styles.operationItemPressed]}
              onPress={() => router.push("/chauffeur/notifications")}
            >
              <View style={[styles.operationIconCircle, { backgroundColor: "rgba(239, 68, 68, 0.15)" }]}>
                <Ionicons name="notifications" size={20} color="#EF4444" />
              </View>
              <View style={styles.operationContent}>
                <View style={styles.operationTitleRow}>
                  <Text style={styles.operationTitle}>Notifications</Text>
                  {unreadCount > 0 && (
                    <View style={styles.unreadCountBadge}>
                      <Text style={styles.unreadCountBadgeText}>{unreadCount} new</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.operationSubtitle}>System alerts, document reviews & ride notices</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />
            </Pressable>
          </View>
        </ScrollView>
      </View>
    );
  }

  if (!chauffeur) {
    if (operatorProfile?.type === "partner") {
      return (
        <View style={[styles.loadingContainer, { paddingHorizontal: 24 }]}>
          <ActivityIndicator size="large" color={Colors.white} />
          <Text style={{ color: Colors.white, marginTop: 16, fontSize: 16, fontFamily: "Inter_600SemiBold" }}>
            Preparing Driver Dashboard...
          </Text>
          <Pressable
            style={[styles.headerDriverModeBtn, { marginTop: 24, backgroundColor: Colors.card }]}
            onPress={() => setPartnerDashboardMode("partner")}
          >
            <Ionicons name="business" size={16} color={Colors.white} />
            <Text style={styles.headerDriverModeBtnText}>Return to Partner Dashboard</Text>
          </Pressable>
        </View>
      );
    }
    return null;
  }
  const activeVehicle = driverVehicles.find((vehicle) => vehicle.id === chauffeur.activeVehicleId);

  // ─── Pending approval ─────────────────────────────────────────────────────
  if (!chauffeur.isApproved && operatorProfile?.type !== "partner") {
    const isWaitlisted = chauffeur.applicationStatus === "waitlisted";
    return (
      <View style={[styles.pendingContainer, { paddingTop: insets.top + 20 }]}>
        <View style={[styles.floatEarnings, { top: insets.top + 16 }]}>
          <Text style={styles.earningsLabel}>Today</Text>
          <Text style={styles.earningsAmount}>R {todayEarnings}</Text>
        </View>
        <View style={styles.pendingInner}>
          <Ionicons name={isWaitlisted ? "pause-circle" : "hourglass"} size={60} color={isWaitlisted ? Colors.warning : Colors.warning} />
          <Text style={styles.pendingTitle}>{isWaitlisted ? "Profile Waitlisted" : "Pending Approval"}</Text>
          <Text style={styles.pendingDesc}>
            {isWaitlisted
              ? "Your driver profile has been temporarily waitlisted. You cannot receive trip requests until A2B reactivates your profile."
              : "Your registration is under review. You'll be notified once approved and can start accepting rides."}
          </Text>
          {isWaitlisted && chauffeur.waitlistReason ? (
            <View style={styles.waitlistReasonCard}>
              <Text style={styles.waitlistReasonLabel}>Reason</Text>
              <Text style={styles.waitlistReasonText}>{chauffeur.waitlistReason}</Text>
            </View>
          ) : null}
          <Pressable style={styles.pendingBtn} onPress={() => refreshChauffeur(chauffeur.id)}>
            <Ionicons name="refresh" size={16} color={Colors.white} />
            <Text style={styles.pendingBtnText}>Check Status</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const isApprovedPartner = operatorProfile?.type === "partner" && operatorProfile?.status === "approved";

  const isApprovedPartnerOrChauffeurMenu =
    Boolean(
      (operatorProfile?.type === "partner" || operatorProfile?.type === "driver" || user?.role === "chauffeur") &&
      (operatorProfile?.status === "approved" || chauffeur?.isApproved)
    );

  // ─── Menu items ───────────────────────────────────────────────────────────
  const menuItems = [
    ...(isApprovedPartnerOrChauffeurMenu
      ? [
          {
            icon: "business-outline",
            label: operatorProfile?.type === "driver" || user?.role === "chauffeur" ? "Driver Partner Dashboard" : "Partner Dashboard",
            onPress: async () => {
              setPartnerDashboardMode("partner");
              await AsyncStorage.setItem("a2b_partner_dashboard_mode", "partner");
              closeMenu();
            },
            color: "#10B981",
          },
          {
            icon: "map-outline",
            label: "Fleet Live Map",
            onPress: () => {
              router.push("/chauffeur/live-map" as never);
              closeMenu();
            },
            color: "#10B981",
          },
          {
            icon: "people-outline",
            label: "Fleet & Drivers",
            onPress: () => {
              router.push("/chauffeur/fleet" as never);
              closeMenu();
            },
            color: Colors.white,
          },
        ]
      : []),
    { icon: isOnline ? "stop-circle-outline" : "play-circle-outline", label: isOnline ? "Go Offline" : "Go Online", onPress: toggleOnline, color: isOnline ? "#ff6b6b" : Colors.success },
    { icon: "car-outline", label: "Vehicles", onPress: () => { router.push("/chauffeur/vehicles" as never); closeMenu(); }, color: Colors.white },
    { icon: "car-sport-outline", label: "My Rides", onPress: () => { router.push("/chauffeur/rides"); closeMenu(); }, color: Colors.white },
    { icon: "map-outline", label: "Long Distance", onPress: () => { router.push("/chauffeur/long-distance" as never); closeMenu(); }, color: Colors.white },
    { icon: "calendar-outline", label: "Daily Lift Club", onPress: () => { router.push("/chauffeur/lift-club" as never); closeMenu(); }, color: "#F7C948" },
    { icon: "bar-chart-outline", label: "Earnings", onPress: () => { router.push("/chauffeur/earnings"); closeMenu(); }, color: Colors.white },
    { icon: "wallet-outline", label: "Wallet", onPress: () => { router.push("/chauffeur/wallet"); closeMenu(); }, color: Colors.white },
    { icon: "settings-outline", label: "Settings", onPress: () => { router.push("/chauffeur/settings"); closeMenu(); }, color: Colors.white },
    { icon: "notifications-outline", label: unreadCount > 0 ? `Notifications (${unreadCount})` : "Notifications", onPress: () => { router.push("/chauffeur/notifications"); closeMenu(); }, color: unreadCount > 0 ? Colors.warning : Colors.white },
  ];

  const clientDisplayName =
    currentRide?.clientFirstName ||
    (currentRide?.clientName ? String(currentRide.clientName).split(" ")[0] : null) ||
    "Client";
  const currentRideStops = normalizeRideStops(currentRide?.stops);
  const completedStopCount = getCompletedStopCount(currentRide);
  const activeTripTarget = currentRide ? getActiveTripTarget(currentRide) : null;
  const tripProgressLoading =
    stopProgressLoading || rideStatusUpdating === "trip_completed";
  const rideStatusLabel =
    currentRide?.status === "chauffeur_assigned" ? `On the way to pick up ${clientDisplayName}` :
    currentRide?.status === "chauffeur_arriving" ? `Arriving at ${clientDisplayName}'s pickup` :
    hasPendingStop ? `Driving to stop ${completedStopCount + 1} of ${currentRideStops.length}` :
    currentRide?.status === "trip_started" ? `Driving to final destination` : "Active Ride";
  const clientRouteLabel = getRideRouteLabel(currentRide?.selectedRouteId);
  const clientPaymentLabel = getRidePaymentLabel(currentRide?.paymentMethod);

  return (
    <>
      {/* ─── Turn-by-turn navigation modal ─── */}
      <Modal visible={showNavModal} animationType="slide" onRequestClose={() => setShowNavModal(false)}>
        <View style={styles.navModal}>
          <View style={[styles.navModalHeader, { paddingTop: insets.top + 16 }]}>
            <View>
              <Text style={styles.navModalTitle}>
                {hasPendingStop
                  ? `Stop ${completedStopCount + 1} of ${currentRideStops.length}`
                  : currentRide?.status === "trip_started"
                    ? `Final destination`
                    : `Picking up ${clientDisplayName}`}
              </Text>
              {currentRide?.status === "trip_started" && activeTripTarget ? (
                <Text style={styles.navModalDestination} numberOfLines={1}>
                  {activeTripTarget.address}
                </Text>
              ) : null}
              {rideEta && <Text style={styles.navModalEta}>{rideEta.durationText} · {rideEta.distanceText}</Text>}
              {currentRide && (
                <Text style={styles.navModalRouteHint}>{clientRouteLabel} · {clientPaymentLabel}</Text>
              )}
            </View>
            <View style={styles.navModalActions}>
              <Pressable style={styles.navModalClose} onPress={toggleNavigationVoiceFromMap} accessibilityLabel={navigationVoiceEnabled === false ? "Unmute navigation voice" : "Mute navigation voice"}>
                <Ionicons name={navigationVoiceEnabled === false ? "volume-mute-outline" : "volume-high-outline"} size={21} color={Colors.white} />
              </Pressable>
              <Pressable style={styles.navModalClose} onPress={() => setShowNavModal(false)} accessibilityLabel="Close navigation">
                <Ionicons name="chevron-down" size={22} color={Colors.white} />
              </Pressable>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <A2BMap
              pickupLocation={currentRide ? { lat: parseFloat(currentRide.pickupLat), lng: parseFloat(currentRide.pickupLng) } : null}
              dropoffLocation={currentRide ? { lat: parseFloat(currentRide.dropoffLat), lng: parseFloat(currentRide.dropoffLng) } : undefined}
              stopLocations={normalizeRideStops(currentRide?.stops)}
              activeStopIndex={hasPendingStop ? completedStopCount : undefined}
              driverLocation={myLocation}
              routePolyline={routePolyline}
              showDriver={true}
              followDriver={true}
              loading={!myLocation}
            />
          </View>
          {navSteps.length > 0 && (
            <View style={styles.navStepBox}>
              <View style={styles.navStepRow}>
                <View style={styles.navArrowCircle}>
                  <Ionicons
                    name={
                      navSteps[currentStepIdx]?.maneuver?.includes("left") ? "arrow-back" :
                      navSteps[currentStepIdx]?.maneuver?.includes("right") ? "arrow-forward" :
                      navSteps[currentStepIdx]?.maneuver?.includes("uturn") ? "return-down-back" :
                      navSteps[currentStepIdx]?.maneuver?.includes("roundabout") ? "sync" : "arrow-up"
                    }
                    size={28} color={Colors.white}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.navStepInstruction} numberOfLines={2}>
                    {navSteps[currentStepIdx]?.instruction || "Follow the route"}
                  </Text>
                  <Text style={styles.navStepStreet}>
                    {navSteps[currentStepIdx]?.distance} {navSteps[currentStepIdx + 1]?.instruction ? `· then ${navSteps[currentStepIdx + 1]?.instruction.split(' ').slice(0, 4).join(' ')}` : ""}
                  </Text>
                </View>
              </View>
              <View style={styles.navStepMeta}>
                <Text style={styles.navStepDist}>{rideEta?.durationText || ""} · {rideEta?.distanceText || ""}</Text>
                <Text style={styles.navStepCount}>Step {currentStepIdx + 1} of {navSteps.length}</Text>
              </View>
            </View>
          )}
          <View style={[styles.navModalFooter, { paddingBottom: insets.bottom + 16 }]}>
            {currentRide?.status === "chauffeur_arrived" && (
              <View style={[styles.waitingTimerBadge, waitingElapsedSec >= 300 && styles.waitingTimerBadgeCharged, { alignSelf: "center", marginBottom: 8 }]}>
                <Ionicons name="time" size={14} color={waitingElapsedSec >= 300 ? "#F59E0B" : "#10B981"} />
                <Text style={[styles.waitingTimerText, waitingElapsedSec >= 300 && styles.waitingTimerTextCharged]}>
                  {waitingElapsedSec < 300
                    ? `Free waiting: ${Math.floor((300 - waitingElapsedSec) / 60)}:${String((300 - waitingElapsedSec) % 60).padStart(2, "0")} remaining`
                    : `Waiting fee: +R ${(Math.ceil((waitingElapsedSec - 300) / 60) * 1).toFixed(2)} (${Math.floor(waitingElapsedSec / 60)}m)`}
                </Text>
              </View>
            )}
            {(currentRide?.status === "chauffeur_assigned" || currentRide?.status === "chauffeur_arriving") && (
              <Pressable style={[styles.actionBtn, styles.completeBtnStyle]} onPress={handleDriverArrivedAtPickup}>
                <Text style={styles.actionBtnText}>I've Arrived</Text>
              </Pressable>
            )}
            {currentRide?.status === "chauffeur_arrived" && (
              <Pressable style={[styles.actionBtn, styles.completeBtnStyle]} onPress={startTripToDestination}>
                <Text style={styles.actionBtnText}>Start Trip — Rider On Board</Text>
              </Pressable>
            )}
            {currentRide?.status === "trip_started" && (
              <Pressable
                style={[
                  styles.actionBtn,
                  styles.completeBtnStyle,
                  tripProgressLoading && { opacity: 0.65 },
                ]}
                onPress={hasPendingStop ? confirmCurrentStop : () => updateRideStatus("trip_completed")}
                disabled={tripProgressLoading}
              >
                {tripProgressLoading ? <ActivityIndicator size="small" color={Colors.primary} /> : null}
                <Text style={styles.actionBtnText}>
                  {hasPendingStop
                    ? `Confirm Arrival at Stop ${completedStopCount + 1}`
                    : "End Trip"}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>

      {/* ─── Full-screen map ─── */}
      <View style={StyleSheet.absoluteFill}>
        <A2BMap
          pickupLocation={currentRide ? { lat: parseFloat(currentRide.pickupLat), lng: parseFloat(currentRide.pickupLng) } : null}
          dropoffLocation={currentRide ? { lat: parseFloat(currentRide.dropoffLat), lng: parseFloat(currentRide.dropoffLng) } : undefined}
          stopLocations={normalizeRideStops(currentRide?.stops)}
          activeStopIndex={hasPendingStop ? completedStopCount : undefined}
          driverLocation={myLocation}
          routePolyline={routePolyline}
          showDriver={true}
          followDriver={!!currentRide}
          loading={!myLocation && isOnline}
          initialZoom="city"
          recenterBottom={isOnline && !currentRide ? (availableTrips.length > 0 ? 215 : 165) : currentRide ? 260 : 120}
        />
      </View>

      {/* ─── Online pill (top-left) ─── */}

      {/* ─── Floating turn-by-turn nav bar ─── */}
      {currentRide && navSteps.length > 0 && !showNavModal && (
        <Pressable style={[styles.floatNavBar, { top: insets.top + 60 }]} onPress={() => setShowNavModal(true)}>
          <View style={styles.floatNavArrow}>
            <Ionicons
              name={
                navSteps[currentStepIdx]?.maneuver?.includes("left") ? "arrow-back" :
                navSteps[currentStepIdx]?.maneuver?.includes("right") ? "arrow-forward" :
                navSteps[currentStepIdx]?.maneuver?.includes("uturn") ? "return-down-back" :
                navSteps[currentStepIdx]?.maneuver?.includes("roundabout") ? "sync" : "arrow-up"
              }
              size={24} color={Colors.white}
            />
          </View>
          <View style={styles.floatNavContent}>
            <Text style={styles.floatNavInstruction} numberOfLines={1}>
              {navSteps[currentStepIdx]?.instruction || "Follow the route"}
            </Text>
            <View style={styles.floatNavMeta}>
              <Text style={styles.floatNavDist}>{navSteps[currentStepIdx]?.distance}</Text>
              <Text style={styles.floatNavStep}>{currentStepIdx + 1}/{navSteps.length}</Text>
              {rideEta && <Text style={styles.floatNavEta}>{rideEta.durationText}</Text>}
            </View>
          </View>
          <Ionicons name="expand-outline" size={18} color={Colors.textMuted} />
        </Pressable>
      )}
      <Pressable
        style={[styles.onlinePill, { top: insets.top + 16 }, isOnline ? styles.onlinePillOn : styles.onlinePillOff]}
        onPress={toggleOnline}
      >
        <View style={[styles.pillDot, { backgroundColor: isOnline ? Colors.success : "#555" }]} />
        <Text style={styles.pillText}>{isOnline ? "Online" : "Offline"}</Text>
      </Pressable>

      {/* ─── Partner Fleet Dashboard Button (Top-Center for partner/chauffeur in driver mode) ─── */}
      {isApprovedPartnerOrChauffeurMenu && (
        <Pressable
          style={[styles.partnerFleetPill, { top: insets.top + 16 }]}
          onPress={async () => {
            setPartnerDashboardMode("partner");
            await AsyncStorage.setItem("a2b_partner_dashboard_mode", "partner");
          }}
          accessibilityLabel="Switch to Partner Fleet Dashboard"
        >
          <Ionicons name="business" size={14} color="#10B981" />
          <Text style={styles.partnerFleetPillText} numberOfLines={1}>
            {operatorProfile?.type === "driver" || user?.role === "chauffeur" ? "Partner Mode" : "Fleet Dashboard"}
          </Text>
        </Pressable>
      )}

      {/* ─── Bottom-Left Green Vehicle Button ─── */}
      {!currentRide && (
        <Pressable
          style={[
            styles.greenVehicleBtn,
            { bottom: insets.bottom + (isOnline ? 100 : 24) },
            !chauffeur.activeVehicleId && styles.greenVehicleBtnWarning,
          ]}
          onPress={() => router.push("/chauffeur/vehicles" as never)}
          accessibilityLabel="Vehicle selection"
          accessibilityRole="button"
          hitSlop={8}
        >
          <Ionicons name="car-sport" size={26} color="#FFFFFF" />
          {chauffeur.activeVehicleId ? (
            <View style={styles.greenVehicleCheckBadge}>
              <Ionicons name="checkmark" size={10} color="#FFFFFF" />
            </View>
          ) : (
            <View style={styles.greenVehicleWarningBadge}>
              <Ionicons name="alert" size={10} color="#FFFFFF" />
            </View>
          )}
        </Pressable>
      )}

      {/* ─── Today's earnings (top-right, taps to wallet) ─── */}
      <Pressable style={[styles.floatEarnings, { top: insets.top + 16 }]} onPress={() => router.push("/chauffeur/wallet")}>
        <Text style={styles.earningsLabel}>Today</Text>
        <Text style={styles.earningsAmount}>R {todayEarnings}</Text>
      </Pressable>

      {/* ─── Available trips panel ─── */}
      {isOnline && !currentRide && !incomingRide && (
        <View style={[styles.tripsPanel, { bottom: insets.bottom + 80 }]}>
          <View style={styles.tripsPanelHeader}>
            <Ionicons name="search" size={14} color={Colors.accent} />
            <Text style={styles.tripsPanelTitle}>
              {availableTrips.length > 0
                ? `${availableTrips.length} trip${availableTrips.length > 1 ? "s" : ""} available`
                  : "Searching for trips nearby"}
            </Text>
            {availableTrips.length === 0 && <ActivityIndicator size="small" color={Colors.accent} style={{ marginLeft: 4 }} />}
          </View>
          {availableTrips.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tripsScroll} contentContainerStyle={styles.tripsScrollContent}>
              {availableTrips.map((trip) => (
                <View key={trip.id} style={styles.tripCard}>
                  <View style={styles.tripCardTop}>
                    <Pressable style={styles.tripClientRow} onPress={() => openClientProfile(trip.clientId)}>
                      <Ionicons name="person-circle-outline" size={16} color={Colors.accent} />
                      <Text style={styles.tripClientName}>{trip.clientFirstName || (trip.clientName ? String(trip.clientName).split(" ")[0] : "Client")}</Text>
                      <Ionicons name="chevron-forward" size={12} color={Colors.textMuted} />
                    </Pressable>
                    {getRideFare(trip) ? <Text style={styles.tripPrice}>R {getRideFare(trip).toFixed(0)}</Text> : null}
                  </View>
                  <View style={styles.tripAddrRow}>
                    <View style={styles.dotGreen} />
                    <Text style={styles.tripAddrText} numberOfLines={1}>{trip.pickupAddress || "Pickup"}</Text>
                  </View>
                  {normalizeRideStops(trip.stops).map((stop, index) => (
                    <View key={stop.id} style={styles.tripAddrRow}>
                      <Text style={styles.stopIndexText}>{index + 1}</Text>
                      <Text style={styles.tripAddrText} numberOfLines={1}>{stop.address}</Text>
                    </View>
                  ))}
                  <View style={styles.tripAddrRow}>
                    <View style={styles.dotRed} />
                    <Text style={styles.tripAddrText} numberOfLines={1}>{trip.dropoffAddress || "Dropoff"}</Text>
                  </View>
                  <View style={styles.rideInfoPills}>
                    <View style={styles.rideInfoPill}>
                      <Ionicons name="car-sport-outline" size={12} color={Colors.white} />
                      <Text style={styles.rideInfoPillText}>{getRequestedVehicleLabel(trip.vehicleType)}</Text>
                    </View>
                    {normalizeRideStops(trip.stops).length > 0 ? (
                      <View style={styles.rideInfoPill}>
                        <Ionicons name="git-branch-outline" size={12} color={Colors.white} />
                        <Text style={styles.rideInfoPillText}>
                          {normalizeRideStops(trip.stops).length} stop{normalizeRideStops(trip.stops).length === 1 ? "" : "s"}
                        </Text>
                      </View>
                    ) : null}
                    <View style={styles.rideInfoPill}>
                      <Ionicons name={getRidePaymentIcon(trip.paymentMethod)} size={12} color={Colors.white} />
                      <Text style={styles.rideInfoPillText}>{getRidePaymentLabel(trip.paymentMethod)}</Text>
                    </View>
                    <View style={styles.rideInfoPill}>
                      <Ionicons name={getRideRouteIcon(trip.selectedRouteId)} size={12} color={Colors.white} />
                      <Text style={styles.rideInfoPillText}>{getRideRouteLabel(trip.selectedRouteId)}</Text>
                    </View>
                  </View>
                  {trip.distKm != null && (
                    <Text style={styles.tripDist}>{trip.distKm.toFixed(1)} km away</Text>
                  )}
                  <Pressable
                    style={[styles.tripAcceptBtn, acceptingTripId === trip.id && { opacity: 0.6 }]}
                    onPress={() => acceptTripFromList(trip)}
                    disabled={!!acceptingTripId}
                  >
                    {acceptingTripId === trip.id
                      ? <ActivityIndicator size="small" color={Colors.primary} />
                      : <Text style={styles.tripAcceptBtnText}>Accept</Text>
                    }
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {/* ─── Active ride card ─── */}
      {currentRide && (
        <View style={[styles.bottomCard, { bottom: insets.bottom + 80 }]}>
          <View style={styles.rideCardHeader}>
            <View style={[styles.statusDot, { backgroundColor: Colors.success }]} />
            <Text style={styles.rideCardTitle}>{rideStatusLabel}</Text>
            {rideEta && <Text style={styles.etaText}>{rideEta.durationText} · {rideEta.distanceText}</Text>}
          </View>
          <Pressable style={styles.clientInfoButton} onPress={() => openClientProfile(currentRide.clientId)}>
            <View style={styles.addrRow}>
              {currentRide.clientPhoto ? (
                <Image source={{ uri: currentRide.clientPhoto }} style={styles.ridePartyAvatar} />
              ) : (
                <View style={styles.ridePartyAvatarFallback}>
                  <Ionicons name="person" size={13} color={Colors.textMuted} />
                </View>
              )}
              <Text style={[styles.addrText, { color: Colors.white }]}>{clientDisplayName}</Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
          </Pressable>
          <View style={styles.addrRow}>
            <View style={styles.dotGreen} />
            <Text style={styles.addrText} numberOfLines={1}>{currentRide.pickupAddress || "Pickup"}</Text>
          </View>
          {currentRideStops.map((stop, index) => {
            const isComplete = index < completedStopCount;
            const isCurrent = currentRide.status === "trip_started" && index === completedStopCount;
            return (
              <View
                key={stop.id}
                style={[styles.addrRow, isCurrent && styles.activeStopRow]}
              >
                <View
                  style={[
                    styles.stopProgressIndex,
                    isComplete && styles.stopProgressIndexComplete,
                    isCurrent && styles.stopProgressIndexCurrent,
                  ]}
                >
                  {isComplete ? (
                    <Ionicons name="checkmark" size={12} color={Colors.primary} />
                  ) : (
                    <Text
                      style={[
                        styles.stopProgressIndexText,
                        isCurrent && styles.stopProgressIndexTextCurrent,
                      ]}
                    >
                      {index + 1}
                    </Text>
                  )}
                </View>
                <Text
                  style={[
                    styles.addrText,
                    isComplete && styles.completedStopText,
                    isCurrent && styles.currentStopText,
                  ]}
                  numberOfLines={1}
                >
                  {stop.address || `Stop ${index + 1}`}
                </Text>
                {isCurrent ? <Text style={styles.nextStopBadge}>NEXT</Text> : null}
              </View>
            );
          })}
          <View style={styles.addrRow}>
            <View style={styles.dotRed} />
            <Text style={styles.addrText} numberOfLines={1}>{currentRide.dropoffAddress || "Dropoff"}</Text>
          </View>
          <View style={styles.rideInfoPills}>
            <View style={styles.rideInfoPill}>
              <Ionicons name="car-sport-outline" size={12} color={Colors.white} />
              <Text style={styles.rideInfoPillText}>{getRequestedVehicleLabel(currentRide.vehicleType)}</Text>
            </View>
            <View style={styles.rideInfoPill}>
              <Ionicons name={getRidePaymentIcon(currentRide.paymentMethod)} size={12} color={Colors.white} />
              <Text style={styles.rideInfoPillText}>{getRidePaymentLabel(currentRide.paymentMethod)}</Text>
            </View>
            <View style={styles.rideInfoPill}>
              <Ionicons name={getRideRouteIcon(currentRide.selectedRouteId)} size={12} color={Colors.white} />
              <Text style={styles.rideInfoPillText}>{getRideRouteLabel(currentRide.selectedRouteId)}</Text>
            </View>
            {currentRide.durationMin ? (
              <View style={styles.rideInfoPill}>
                <Ionicons name="time-outline" size={12} color={Colors.white} />
                <Text style={styles.rideInfoPillText}>{Math.round(Number(currentRide.durationMin))} min</Text>
              </View>
            ) : null}
          </View>
          {currentRide.status === "chauffeur_arrived" && (
            <View style={[styles.waitingTimerBadge, waitingElapsedSec >= 300 && styles.waitingTimerBadgeCharged, { marginBottom: 10 }]}>
              <Ionicons name="time" size={14} color={waitingElapsedSec >= 300 ? "#F59E0B" : "#10B981"} />
              <Text style={[styles.waitingTimerText, waitingElapsedSec >= 300 && styles.waitingTimerTextCharged]}>
                {waitingElapsedSec < 300
                  ? `Free waiting: ${Math.floor((300 - waitingElapsedSec) / 60)}:${String((300 - waitingElapsedSec) % 60).padStart(2, "0")} remaining`
                  : `Waiting fee: +R ${(Math.ceil((waitingElapsedSec - 300) / 60) * 1).toFixed(2)} (${Math.floor(waitingElapsedSec / 60)}m)`}
              </Text>
            </View>
          )}
          {getRideFare(currentRide) ? <Text style={styles.priceText}>R {getRideFare(currentRide).toFixed(0)}</Text> : null}
          <View style={styles.rideActions}>
            <Pressable style={styles.rideSecBtn} onPress={() => router.push({ pathname: "/chauffeur/chat", params: { rideId: currentRide.id, riderName: currentRide.clientFirstName || currentRide.clientName || "Client" } })}>
              <Ionicons name="chatbubble-outline" size={15} color={Colors.white} />
              <Text style={styles.rideSecBtnText}>Message</Text>
            </Pressable>
            <Pressable style={[styles.rideSecBtn, { backgroundColor: Colors.accent }]} onPress={openAcceptedRideNavigation}>
              <Ionicons name="navigate" size={15} color={Colors.white} />
              <Text style={styles.rideSecBtnText}>Navigate</Text>
            </Pressable>
            <Pressable style={[styles.rideSecBtn, styles.cancelStyle]} onPress={confirmCancelRide}>
              <Ionicons name="close-circle-outline" size={15} color={Colors.error} />
              <Text style={[styles.rideSecBtnText, { color: Colors.error }]}>Cancel</Text>
            </Pressable>
          </View>
          {(currentRide.status === "chauffeur_assigned" || currentRide.status === "chauffeur_arriving") && (
            <Pressable style={[styles.actionBtn, styles.completeBtnStyle]} onPress={handleDriverArrivedAtPickup}>
              <Text style={styles.actionBtnText}>I've Arrived</Text>
            </Pressable>
          )}
          {currentRide.status === "chauffeur_arrived" && (
            <Pressable style={[styles.actionBtn, styles.completeBtnStyle]} onPress={startTripToDestination}>
              <Text style={styles.actionBtnText}>Start Trip — Rider On Board</Text>
            </Pressable>
          )}
          {currentRide.status === "trip_started" && (
            <Pressable
              style={[
                styles.actionBtn,
                styles.completeBtnStyle,
                tripProgressLoading && { opacity: 0.65 },
              ]}
              onPress={hasPendingStop ? confirmCurrentStop : () => updateRideStatus("trip_completed")}
              disabled={tripProgressLoading}
            >
              {tripProgressLoading ? <ActivityIndicator size="small" color={Colors.primary} /> : null}
              <Text style={styles.actionBtnText}>
                {hasPendingStop
                  ? `Confirm Arrival at Stop ${completedStopCount + 1}`
                  : "End Trip"}
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {/* ─── Incoming ride card ─── */}
      <Animated.View style={[styles.incomingCard, { bottom: insets.bottom + 80, transform: [{ translateY: incomingSlide }] }]}>
        {incomingRide && (
          <>
            <View style={styles.incomingHeader}>
              <Ionicons name="flash" size={18} color={Colors.warning} />
              <Pressable style={styles.incomingClientButton} onPress={() => openClientProfile(incomingRide.clientId)}>
                {incomingRide.clientPhoto ? (
                  <Image source={{ uri: incomingRide.clientPhoto }} style={styles.ridePartyAvatar} />
                ) : (
                  <View style={styles.ridePartyAvatarFallback}>
                    <Ionicons name="person" size={13} color={Colors.textMuted} />
                  </View>
                )}
                <Text style={styles.incomingTitle}>
                  {incomingRide.clientFirstName ? `Pickup: ${incomingRide.clientFirstName}` : "New Ride Request"}
                </Text>
                <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
              </Pressable>
              <View style={styles.offerTimerPill}>
                <Text style={styles.offerTimerText}>{incomingOfferSeconds}s</Text>
              </View>
              {getIncomingRideFare(incomingRide) ? (
                <View style={styles.incomingEarnBox}>
                  <Text style={styles.incomingEarnLabel}>
                    You earn
                  </Text>
                  <Text style={styles.incomingPrice}>R {getIncomingRideFare(incomingRide).toFixed(0)}</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.addrRow}>
              <View style={styles.dotGreen} />
              <Text style={styles.addrText} numberOfLines={1}>{incomingRide.pickupAddress || "Pickup"}</Text>
            </View>
            {normalizeRideStops(incomingRide.stops).map((stop, index) => (
              <View key={stop.id} style={styles.addrRow}>
                <Text style={styles.stopIndexText}>{index + 1}</Text>
                <Text style={styles.addrText} numberOfLines={1}>{stop.address}</Text>
              </View>
            ))}
            <View style={styles.addrRow}>
              <View style={styles.dotRed} />
              <Text style={styles.addrText} numberOfLines={1}>{incomingRide.dropoffAddress || "Dropoff"}</Text>
            </View>
            <View style={styles.rideInfoPills}>
              <View style={styles.rideInfoPill}>
                <Ionicons name="car-sport-outline" size={12} color={Colors.white} />
                <Text style={styles.rideInfoPillText}>{getRequestedVehicleLabel(incomingRide.vehicleType)}</Text>
              </View>
              {normalizeRideStops(incomingRide.stops).length > 0 ? (
                <View style={styles.rideInfoPill}>
                  <Ionicons name="git-branch-outline" size={12} color={Colors.white} />
                  <Text style={styles.rideInfoPillText}>
                    {normalizeRideStops(incomingRide.stops).length} stop{normalizeRideStops(incomingRide.stops).length === 1 ? "" : "s"}
                  </Text>
                </View>
              ) : null}
              <View style={styles.rideInfoPill}>
                <Ionicons name={getRidePaymentIcon(incomingRide.paymentMethod)} size={12} color={Colors.white} />
                <Text style={styles.rideInfoPillText}>{getRidePaymentLabel(incomingRide.paymentMethod)}</Text>
              </View>
              <View style={styles.rideInfoPill}>
                <Ionicons name={getRideRouteIcon(incomingRide.selectedRouteId)} size={12} color={Colors.white} />
                <Text style={styles.rideInfoPillText}>{getRideRouteLabel(incomingRide.selectedRouteId)}</Text>
              </View>
            </View>
            <View style={styles.incomingActions}>
              <Pressable style={styles.declineBtn} onPress={declineRide}>
                <Ionicons name="close" size={24} color={Colors.error} />
              </Pressable>
              <Pressable style={styles.acceptBtn} onPress={acceptRide}>
                <Ionicons name="checkmark" size={22} color={Colors.primary} />
                <Text style={styles.acceptBtnText}>Accept Ride</Text>
              </Pressable>
            </View>
          </>
        )}
      </Animated.View>

      {/* ─── Menu backdrop ─── */}
      {menuOpen && <Pressable style={StyleSheet.absoluteFill} onPress={closeMenu} />}

      {/* ─── Client profile modal ─── */}
      <Modal visible={showClientProfile} transparent animationType="slide" onRequestClose={() => setShowClientProfile(false)}>
        <View style={styles.profileModalOverlay}>
          <View style={styles.profileModalCard}>
            <View style={styles.profileHeader}>
              <Text style={styles.profileTitle}>Client Profile</Text>
              <Pressable onPress={() => setShowClientProfile(false)} style={styles.profileCloseBtn}>
                <Ionicons name="close" size={22} color={Colors.white} />
              </Pressable>
            </View>

            {clientProfileLoading ? (
              <View style={styles.profileLoadingWrap}>
                <ActivityIndicator size="large" color={Colors.accent} />
              </View>
            ) : clientProfile ? (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.profileScrollContent}>
                <View style={styles.profileHero}>
                  {clientProfile.profilePhoto ? (
                    <Image source={{ uri: clientProfile.profilePhoto }} style={styles.profileAvatarImg} />
                  ) : (
                    <View style={styles.profileAvatar}>
                      <Text style={styles.profileAvatarText}>{clientProfile.clientName.charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  <Text style={styles.profilePersonName}>{clientProfile.clientName}</Text>
                  <Text style={styles.profileSubtext}>{clientProfile.clientPhone || "Phone not available"}</Text>
                  <Text style={styles.profileSubtext}>
                    Member since {new Date(clientProfile.memberSince).toLocaleDateString("en-ZA", { year: "numeric", month: "short" })}
                  </Text>
                </View>

                <View style={styles.profileStatsRow}>
                  <View style={styles.profileStatBox}>
                    <Text style={styles.profileStatValue}>
                      {clientProfile.clientRating !== null ? clientProfile.clientRating.toFixed(1) : "—"}
                    </Text>
                    <View style={styles.profileStarsRow}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Ionicons
                          key={star}
                          name={star <= Math.round(clientProfile.clientRating ?? 0) ? "star" : "star-outline"}
                          size={11}
                          color={Colors.warning}
                        />
                      ))}
                    </View>
                    <Text style={styles.profileStatLabel}>{clientProfile.totalRatings} ratings</Text>
                  </View>
                  <View style={styles.profileStatDivider} />
                  <View style={styles.profileStatBox}>
                    <Text style={styles.profileStatValue}>{clientProfile.completedTrips}</Text>
                    <Text style={styles.profileStatLabel}>Trips Completed</Text>
                  </View>
                </View>

                {clientProfile.totalRatings > 0 && (
                  <View style={styles.profileDistribution}>
                    <Text style={styles.profileSectionTitle}>Rating Breakdown</Text>
                    {[5, 4, 3, 2, 1].map((star) => {
                      const count = clientProfile.distribution[star] || 0;
                      const pct = clientProfile.totalRatings > 0 ? count / clientProfile.totalRatings : 0;
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

                {clientProfile.ratings.length > 0 ? (
                  <View style={styles.profileReviews}>
                    <Text style={styles.profileSectionTitle}>Recent Reviews</Text>
                    {clientProfile.ratings.map((review) => (
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
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Ionicons key={star} name={star <= review.rating ? "star" : "star-outline"} size={12} color={Colors.warning} />
                            ))}
                          </View>
                        </View>
                        {review.comment ? <Text style={styles.reviewComment}>{review.comment}</Text> : null}
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

      {/* ─── Post-trip payment popup ─── */}
      <Modal visible={!!completedTrip} transparent animationType="fade" onRequestClose={() => setCompletedTrip(null)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.payPopupOverlay}
        >
          <View style={styles.payPopupCard}>
            {completedTrip?.paymentMethod === "cash" ? (
              <>
                <View style={styles.payPopupIconWrap}>
                  <Ionicons name="cash-outline" size={38} color={Colors.success} />
                </View>
                <Text style={styles.payPopupTitle}>Cash Fare Settlement</Text>
                <Text style={styles.payPopupSubtitle}>
                  The full cash fare is R {getRideFare(completedTrip).toFixed(2)}.
                </Text>

                <View style={styles.cashInputCard}>
                  <Text style={styles.cashInputLabel}>Cash amount received from rider (R):</Text>
                  <TextInput
                    style={styles.cashAmountTextInput}
                    value={cashReceivedInput}
                    onChangeText={setCashReceivedInput}
                    keyboardType="numeric"
                    placeholder={getRideFare(completedTrip).toFixed(0)}
                    placeholderTextColor="#666"
                    selectTextOnFocus
                  />
                </View>

                {(() => {
                  const fare = getRideFare(completedTrip);
                  const received = parseFloat(cashReceivedInput) || 0;
                  const difference = Math.round((received - fare) * 100) / 100;

                  if (difference > 0) {
                    return (
                      <View style={[styles.cashDiffBox, styles.cashDiffPositive]}>
                        <Ionicons name="add-circle" size={20} color="#22C55E" />
                        <Text style={styles.cashDiffTextPositive}>
                          Overpayment of +R {difference.toFixed(2)}. This change will be credited to the rider's A2B wallet.
                        </Text>
                      </View>
                    );
                  } else if (difference < 0) {
                    return (
                      <View style={[styles.cashDiffBox, styles.cashDiffNegative]}>
                        <Ionicons name="alert-circle" size={20} color="#EF4444" />
                        <Text style={styles.cashDiffTextNegative}>
                          Underpayment of -R {Math.abs(difference).toFixed(2)}. This shortage will be debited from the rider's wallet.
                        </Text>
                      </View>
                    );
                  } else {
                    return (
                      <View style={[styles.cashDiffBox, styles.cashDiffNeutral]}>
                        <Ionicons name="checkmark-circle" size={20} color="#3B82F6" />
                        <Text style={styles.cashDiffTextNeutral}>
                          Exact cash fare received (R {fare.toFixed(2)}).
                        </Text>
                      </View>
                    );
                  }
                })()}

                <Pressable
                  style={[styles.payPopupBtn, cashSettling && { opacity: 0.6 }]}
                  disabled={cashSettling}
                  onPress={submitCashSettlementAndContinue}
                >
                  {cashSettling ? (
                    <ActivityIndicator size="small" color={Colors.primary} />
                  ) : (
                    <Text style={styles.payPopupBtnText}>Confirm Settlement & Continue</Text>
                  )}
                </Pressable>
              </>
            ) : (
              <>
                <View style={styles.payPopupIconWrap}>
                  <Text style={{ fontSize: 40 }}>💳</Text>
                </View>
                <Text style={styles.payPopupTitle}>Trip Total</Text>
                <Text style={styles.payPopupAmount}>R {getRideClientFare(completedTrip).toFixed(0)}</Text>
                <Text style={styles.payPopupBody}>
                  The rider paid R {getRideClientFare(completedTrip).toFixed(0)} for this trip. Your category commission is reflected in your earnings and wallet.
                </Text>
                <Pressable style={styles.payPopupBtn} onPress={beginClientRating}>
                  <Text style={styles.payPopupBtnText}>Continue</Text>
                </Pressable>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Post-trip client rating modal ─── */}
      <Modal visible={showClientRating} transparent animationType="fade" onRequestClose={closeClientRating}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 16 : 0}
          style={styles.ratingModalOverlay}
        >
          <ScrollView
            bounces={false}
            contentContainerStyle={styles.ratingModalScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.ratingModalCard}>
              <Text style={styles.ratingModalTitle}>
                Rate {clientRatingRide?.clientFirstName || (clientRatingRide?.clientName ? String(clientRatingRide.clientName).split(" ")[0] : "Client")}
              </Text>
              <Text style={styles.ratingModalSubtitle}>This rating updates the client's profile and overall score.</Text>

              <View style={styles.ratingStarsRow}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Pressable key={star} onPress={() => setClientRating(star)} hitSlop={8}>
                    <Ionicons name={star <= clientRating ? "star" : "star-outline"} size={34} color={Colors.warning} />
                  </Pressable>
                ))}
              </View>

              <TextInput
                value={clientRatingComment}
                onChangeText={setClientRatingComment}
                placeholder="Optional feedback"
                placeholderTextColor={Colors.textMuted}
                multiline
                style={styles.ratingCommentInput}
              />

              <View style={styles.ratingActionsRow}>
                <Pressable style={styles.ratingSecondaryBtn} onPress={closeClientRating} disabled={submittingClientRating}>
                  <Text style={styles.ratingSecondaryBtnText}>Skip</Text>
                </Pressable>
                <Pressable
                  style={[styles.ratingPrimaryBtn, (clientRating === 0 || submittingClientRating) && { opacity: 0.6 }]}
                  onPress={submitClientRating}
                  disabled={clientRating === 0 || submittingClientRating}
                >
                  {submittingClientRating ? (
                    <ActivityIndicator size="small" color={Colors.primary} />
                  ) : (
                    <Text style={styles.ratingPrimaryBtnText}>Submit</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Animated menu items ─── */}
      {menuItems.map((item, i) => {
        const translateY = menuAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -(i + 1) * 62] });
        const opacity = menuAnim.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 0, 1] });
        return (
          <Animated.View key={item.label} style={[styles.menuItem, { bottom: insets.bottom + 16, opacity, transform: [{ translateY }] }]}>
            <Pressable style={styles.menuItemInner} onPress={item.onPress}>
              <Text style={[styles.menuLabel, { color: item.color }]}>{item.label}</Text>
              <View style={[styles.menuIcon, {
                backgroundColor: item.color === Colors.success ? "rgba(76,175,80,0.15)" :
                  item.color === "#ff6b6b" ? "rgba(255,107,107,0.15)" :
                  item.color === Colors.warning ? "rgba(255,183,77,0.15)" : "rgba(255,255,255,0.1)"
              }]}>
                <Ionicons name={item.icon as any} size={22} color={item.color} />
              </View>
            </Pressable>
          </Animated.View>
        );
      })}

      {/* ─── FAB ─── */}
      <Pressable style={[styles.fab, { bottom: insets.bottom + 16 }]} onPress={toggleMenu}>
        <Animated.View style={{ transform: [{ rotate: menuAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "45deg"] }) }] }}>
          <Ionicons name="menu" size={26} color={Colors.white} />
        </Animated.View>
      </Pressable>
    </>
  );
}

const GLASS = "rgba(15,15,15,0.85)";
const GLASS_BORDER = "rgba(255,255,255,0.09)";

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" },

  // Partner Fleet Dashboard (Executive Theme)
  partnerMainContainer: {
    flex: 1,
    backgroundColor: "#0A0A0A",
  },
  partnerScroll: {
    flex: 1,
  },
  partnerScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  partnerHeaderBar: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
  },
  partnerBrandCol: {
    flex: 1,
  },
  partnerBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
    flexWrap: "wrap",
  },
  partnerLogoIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
  },
  partnerBrandTag: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: "#10B981",
    letterSpacing: 1.2,
  },
  partnerWelcomeTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    marginTop: 4,
  },
  partnerSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "rgba(255, 255, 255, 0.6)",
    marginTop: 4,
    lineHeight: 18,
  },
  headerDriverModeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#16A34A",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 24,
    shadowColor: "#16A34A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  headerDriverModeBtnText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },

  // Driver Mode Hero Switcher Card
  driverModeHeroCard: {
    backgroundColor: "rgba(22, 163, 74, 0.08)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.25)",
    padding: 16,
    marginBottom: 24,
    gap: 14,
  },
  driverModeHeroLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  driverModeIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(16, 185, 129, 0.18)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
  },
  driverModeHeroTexts: {
    flex: 1,
  },
  driverModeHeroTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    marginBottom: 3,
  },
  driverModeHeroDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255, 255, 255, 0.7)",
    lineHeight: 17,
  },
  driverModeHeroBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#16A34A",
    paddingVertical: 12,
    borderRadius: 12,
  },
  driverModeHeroBtnText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },

  // Section Header
  partnerSectionHeader: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: "rgba(255, 255, 255, 0.4)",
    letterSpacing: 1.2,
    marginBottom: 12,
  },

  // Metrics Grid
  partnerMetricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 28,
  },
  partnerMetricCard: {
    width: "48%",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    padding: 14,
  },
  metricTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  metricIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  liveIndicatorPulse: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(168, 85, 247, 0.2)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#A855F7",
  },
  livePulseText: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: "#A855F7",
  },
  metricBigNumber: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    marginBottom: 2,
  },
  metricLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "rgba(255, 255, 255, 0.9)",
  },
  metricSubtext: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "rgba(255, 255, 255, 0.4)",
    marginTop: 2,
  },

  // Operations List
  operationsList: {
    gap: 10,
    marginBottom: 20,
  },
  operationItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    padding: 14,
    gap: 14,
  },
  operationItemPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  operationIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  operationContent: {
    flex: 1,
  },
  operationTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  operationTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
    marginBottom: 2,
  },
  operationSubtitle: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "rgba(255, 255, 255, 0.5)",
    lineHeight: 15,
  },
  liveGpsBadge: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
  },
  liveGpsBadgeText: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: "#10B981",
    letterSpacing: 0.5,
  },
  unreadCountBadge: {
    backgroundColor: "#EF4444",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  unreadCountBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },

  // Partner Fleet Pill on Driver Dashboard Map
  partnerFleetPill: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(10, 10, 10, 0.9)",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.4)",
    zIndex: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 6,
  },
  partnerFleetPillText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: "#10B981",
    letterSpacing: 0.3,
  },

  // Pending
  pendingContainer: { flex: 1, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  pendingInner: { alignItems: "center", gap: 16 },
  pendingTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: Colors.white, marginTop: 8 },
  pendingDesc: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textMuted, textAlign: "center", lineHeight: 22 },
  waitlistReasonCard: { width: "100%", borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(255,255,255,0.07)", padding: 14 },
  waitlistReasonLabel: { fontSize: 11, fontFamily: "Inter_700Bold", color: Colors.warning, textTransform: "uppercase", marginBottom: 6 },
  waitlistReasonText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.white, lineHeight: 19 },
  partnerActions: { width: "100%", gap: 10, alignItems: "center" },
  pendingBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.accent, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12, marginTop: 8 },
  pendingBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.white },
  overviewGrid: { width: "100%", flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  overviewCard: { width: "47%", minHeight: 72, borderRadius: 14, borderWidth: 1, borderColor: GLASS_BORDER, backgroundColor: GLASS, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  overviewValue: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.white },
  overviewLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.textMuted, marginTop: 2, textTransform: "uppercase" },

  // Floating overlays
  onlinePill: { position: "absolute", left: 16, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 24, borderWidth: 1, zIndex: 5 },
  onlinePillOn: { backgroundColor: "rgba(76,175,80,0.18)", borderColor: "rgba(76,175,80,0.4)" },
  onlinePillOff: { backgroundColor: GLASS, borderColor: GLASS_BORDER },
  pillDot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.white },
  greenVehicleBtn: {
    position: "absolute",
    left: 16,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#16A34A",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 8,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.2)",
    zIndex: 20,
  },
  greenVehicleBtnWarning: {
    backgroundColor: "#EAB308",
  },
  greenVehicleCheckBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#22C55E",
    borderWidth: 1.5,
    borderColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
  },
  greenVehicleWarningBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#EF4444",
    borderWidth: 1.5,
    borderColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
  },

  floatBell: { position: "absolute", right: 76, width: 44, height: 44, borderRadius: 22, backgroundColor: GLASS, borderWidth: 1, borderColor: GLASS_BORDER, alignItems: "center", justifyContent: "center", zIndex: 5 },
  bellBadge: { position: "absolute", top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: Colors.error, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  bellBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold", color: Colors.white },

  floatEarnings: { position: "absolute", right: 16, minWidth: 86, borderRadius: 16, backgroundColor: GLASS, borderWidth: 1, borderColor: GLASS_BORDER, alignItems: "center", justifyContent: "center", paddingHorizontal: 12, paddingVertical: 8, zIndex: 5 },
  earningsLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: Colors.white, textTransform: "uppercase", letterSpacing: 0.5 },
  earningsAmount: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.white },

  findingPill: { position: "absolute", alignSelf: "center", backgroundColor: GLASS, borderRadius: 24, paddingHorizontal: 20, paddingVertical: 10, borderWidth: 1, borderColor: GLASS_BORDER, zIndex: 5 },
  findingPillText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.white },

  // Available trips panel
  tripsPanel: { position: "absolute", left: 16, right: 16, backgroundColor: GLASS, borderRadius: 20, borderWidth: 1, borderColor: GLASS_BORDER, overflow: "hidden", zIndex: 5 },
  tripsPanelHeader: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: GLASS_BORDER },
  tripsPanelTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.white, flex: 1 },
  tripsScroll: { maxHeight: 170 },
  tripsScrollContent: { flexDirection: "row", gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  tripCard: { width: 176, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 14, padding: 12, gap: 8, borderWidth: 1, borderColor: GLASS_BORDER },
  tripCardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tripClientRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  tripClientName: { fontSize: 14, fontFamily: "Inter_700Bold", color: Colors.white },
  tripPrice: { fontSize: 13, fontFamily: "Inter_700Bold", color: Colors.accent },
  tripAddrRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  tripAddrText: { flex: 1, fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  rideInfoPills: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  rideInfoPill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  rideInfoPillText: { color: Colors.white, fontFamily: "Inter_600SemiBold", fontSize: 11 },
  tripDist: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  tripAcceptBtn: { marginTop: 4, backgroundColor: Colors.white, borderRadius: 10, paddingVertical: 9, alignItems: "center" },
  tripAcceptBtnText: { fontSize: 13, fontFamily: "Inter_700Bold", color: Colors.primary },

  // Bottom cards
  bottomCard: { position: "absolute", left: 16, right: 16, backgroundColor: GLASS, borderRadius: 20, padding: 16, gap: 10, borderWidth: 1, borderColor: GLASS_BORDER, zIndex: 5 },
  rideCardHeader: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  rideCardTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.white, flex: 1 },
  etaText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  priceText: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.white },
  clientInfoButton: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  ridePartyAvatar: { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.surface },
  ridePartyAvatarFallback: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.surface,
    alignItems: "center", justifyContent: "center",
  },

  rideActions: { flexDirection: "row", gap: 8 },
  rideSecBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.09)", borderRadius: 10, paddingVertical: 9, borderWidth: 1, borderColor: GLASS_BORDER },
  rideSecBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.white },
  cancelStyle: { backgroundColor: "rgba(255,77,77,0.08)", borderColor: "rgba(255,77,77,0.2)" },

  // Incoming
  incomingCard: { position: "absolute", left: 16, right: 16, backgroundColor: GLASS, borderRadius: 20, padding: 16, gap: 10, borderWidth: 1.5, borderColor: Colors.warning, zIndex: 99, elevation: 20 },
  incomingHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  incomingClientButton: { flex: 1, flexDirection: "row", alignItems: "center", gap: 4 },
  incomingTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.warning, flex: 1 },
  incomingPrice: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.white },
  incomingEarnBox: { alignItems: "flex-end" },
  incomingEarnLabel: { fontSize: 8, fontFamily: "Inter_500Medium", color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  offerTimerPill: { minWidth: 38, alignItems: "center", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: "rgba(255,183,77,0.16)", borderWidth: 1, borderColor: "rgba(255,183,77,0.32)" },
  offerTimerText: { fontSize: 11, fontFamily: "Inter_700Bold", color: Colors.warning },
  incomingActions: { flexDirection: "row", gap: 10, marginTop: 2 },
  declineBtn: { width: 52, height: 52, borderRadius: 14, backgroundColor: "rgba(255,77,77,0.1)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,77,77,0.25)" },
  acceptBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: Colors.white, borderRadius: 14, paddingVertical: 14 },
  acceptBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.primary },

  // Shared
  addrRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  addrText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  stopIndexText: { width: 14, fontSize: 11, fontFamily: "Inter_700Bold", color: Colors.accent, textAlign: "center" },
  activeStopRow: { marginHorizontal: -6, paddingHorizontal: 6, paddingVertical: 6, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.08)" },
  stopProgressIndex: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  stopProgressIndexComplete: { backgroundColor: Colors.success, borderColor: Colors.success },
  stopProgressIndexCurrent: { backgroundColor: Colors.white, borderColor: Colors.white },
  stopProgressIndexText: { fontSize: 10, fontFamily: "Inter_700Bold", color: Colors.textMuted },
  stopProgressIndexTextCurrent: { color: Colors.primary },
  completedStopText: { color: Colors.textMuted, textDecorationLine: "line-through" },
  currentStopText: { color: Colors.white, fontFamily: "Inter_600SemiBold" },
  nextStopBadge: { fontSize: 9, fontFamily: "Inter_700Bold", color: Colors.white, backgroundColor: Colors.accent, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  dotGreen: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success },
  dotRed: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.error },
  actionBtn: { minHeight: 48, backgroundColor: Colors.white, paddingVertical: 14, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  completeBtnStyle: { backgroundColor: Colors.success },
  actionBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.primary },

  // FAB & menu
  fab: { position: "absolute", right: 16, width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center", zIndex: 20, elevation: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 6 },
  menuItem: { position: "absolute", right: 16, zIndex: 15, alignItems: "flex-end" },
  menuItemInner: { flexDirection: "row", alignItems: "center", gap: 10 },
  menuLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", backgroundColor: GLASS, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, overflow: "hidden", borderWidth: 1, borderColor: GLASS_BORDER },
  menuIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: GLASS_BORDER },

  // Nav modal
  navModal: { flex: 1, backgroundColor: Colors.primary },
  navModalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  navModalActions: { flexDirection: "row", gap: 8 },
  navModalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.white },
  navModalDestination: { maxWidth: SCREEN_WIDTH - 100, fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.textSecondary, marginTop: 3 },
  navModalEta: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textMuted, marginTop: 2 },
  navModalRouteHint: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.accent, marginTop: 4 },
  navModalClose: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center" },
  navModalFooter: { paddingHorizontal: 20, paddingTop: 12, gap: 10 },
  navStepBox: { backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: Colors.border },
  navStepRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  navArrowCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center" },
  navStepInstruction: { fontSize: 17, fontFamily: "Inter_600SemiBold", color: Colors.white, lineHeight: 22 },
  navStepStreet: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted, marginTop: 2 },
  navStepMeta: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  navStepDist: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.success },
  navStepCount: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },

  // Floating nav bar (main map overlay)
  floatNavBar: { position: "absolute", left: 16, right: 16, backgroundColor: GLASS, borderRadius: 16, borderWidth: 1, borderColor: GLASS_BORDER, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, gap: 10, zIndex: 10 },
  floatNavArrow: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center" },
  floatNavContent: { flex: 1 },
  floatNavInstruction: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.white },
  floatNavMeta: { flexDirection: "row", gap: 8, marginTop: 2 },
  floatNavDist: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.success },
  floatNavStep: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  floatNavEta: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.accent },

  // Profile modal
  profileModalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  profileModalCard: { backgroundColor: Colors.primary, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 28, minHeight: "76%", maxHeight: "88%" },
  profileHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  profileTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.white },
  profileCloseBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center" },
  profileLoadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 32 },
  profileScrollContent: { paddingBottom: 24 },
  profileHero: { alignItems: "center", paddingVertical: 10 },
  profileAvatar: { width: 82, height: 82, borderRadius: 41, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  profileAvatarImg: { width: 82, height: 82, borderRadius: 41, marginBottom: 12 },
  profileAvatarText: { fontSize: 30, fontFamily: "Inter_700Bold", color: Colors.white },
  profilePersonName: { fontSize: 22, fontFamily: "Inter_700Bold", color: Colors.white, textAlign: "center" },
  profileSubtext: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textMuted, textAlign: "center", marginTop: 4 },
  profileStatsRow: { flexDirection: "row", alignItems: "stretch", backgroundColor: Colors.surface, borderRadius: 18, paddingVertical: 18, paddingHorizontal: 12, marginTop: 18 },
  profileStatBox: { flex: 1, alignItems: "center", justifyContent: "center" },
  profileStatValue: { fontSize: 22, fontFamily: "Inter_700Bold", color: Colors.white },
  profileStatLabel: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted, marginTop: 4, textAlign: "center" },
  profileStatDivider: { width: 1, backgroundColor: Colors.border, marginHorizontal: 12 },
  profileStarsRow: { flexDirection: "row", gap: 2, justifyContent: "center", marginTop: 4 },
  profileDistribution: { marginTop: 24, gap: 10 },
  profileSectionTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.white, marginBottom: 4 },
  distRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  distLabel: { width: 10, fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.textMuted },
  distBarBg: { flex: 1, height: 8, borderRadius: 999, backgroundColor: Colors.surface, overflow: "hidden", flexDirection: "row" },
  distBarFill: { backgroundColor: Colors.warning, borderRadius: 999 },
  distCount: { width: 22, fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.textMuted, textAlign: "right" },
  profileReviews: { marginTop: 24, gap: 12 },
  reviewCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 14, gap: 10 },
  reviewHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  reviewAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center" },
  reviewAvatarText: { fontSize: 14, fontFamily: "Inter_700Bold", color: Colors.white },
  reviewerName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.white },
  reviewDate: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted, marginTop: 2 },
  reviewStars: { flexDirection: "row", gap: 2 },
  reviewComment: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, lineHeight: 20, paddingLeft: 44 },
  noReviewsContainer: { paddingVertical: 32, alignItems: "center", gap: 8 },
  noReviewsText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textMuted },

  // Post-trip payment popup
  payPopupOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  payPopupCard: { width: "100%", backgroundColor: "#1a1a2e", borderRadius: 24, padding: 24, alignItems: "center", gap: 12, borderWidth: 1, borderColor: GLASS_BORDER },
  payPopupIconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(255,255,255,0.07)", alignItems: "center", justifyContent: "center", marginBottom: 2 },
  payPopupTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.white, textAlign: "center" },
  payPopupSubtitle: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.textMuted, textAlign: "center" },
  payPopupAmount: { fontSize: 36, fontFamily: "Inter_700Bold", color: Colors.white, textAlign: "center" },
  payPopupBody: { fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.textMuted, textAlign: "center", lineHeight: 22 },
  payPopupBtn: { marginTop: 8, backgroundColor: Colors.white, borderRadius: 14, paddingHorizontal: 40, paddingVertical: 14, width: "100%", alignItems: "center" },
  payPopupBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.primary },
  cashInputCard: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    gap: 8,
  },
  cashInputLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textMuted,
  },
  cashAmountTextInput: {
    backgroundColor: "#111122",
    borderRadius: 12,
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.accent,
    textAlign: "center",
  },
  cashDiffBox: {
    width: "100%",
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
  },
  cashDiffPositive: {
    backgroundColor: "rgba(34, 197, 94, 0.12)",
    borderColor: "rgba(34, 197, 94, 0.4)",
  },
  cashDiffNegative: {
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderColor: "rgba(239, 68, 68, 0.4)",
  },
  cashDiffNeutral: {
    backgroundColor: "rgba(59, 130, 246, 0.12)",
    borderColor: "rgba(59, 130, 246, 0.4)",
  },
  cashDiffTextPositive: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#22C55E",
    lineHeight: 18,
  },
  cashDiffTextNegative: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#EF4444",
    lineHeight: 18,
  },
  cashDiffTextNeutral: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#93C5FD",
    lineHeight: 18,
  },

  // Rating modal
  ratingModalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)" },
  ratingModalScrollContent: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 20, paddingVertical: 24 },
  ratingModalCard: { width: "100%", backgroundColor: "#1a1a2e", borderRadius: 24, padding: 24, borderWidth: 1, borderColor: GLASS_BORDER, gap: 16 },
  ratingModalTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.white, textAlign: "center" },
  ratingModalSubtitle: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textMuted, textAlign: "center", lineHeight: 19 },
  ratingStarsRow: { flexDirection: "row", justifyContent: "center", gap: 10 },
  ratingCommentInput: { minHeight: 96, borderRadius: 16, backgroundColor: Colors.surface, color: Colors.white, fontFamily: "Inter_400Regular", paddingHorizontal: 14, paddingVertical: 12, textAlignVertical: "top", borderWidth: 1, borderColor: Colors.border },
  ratingActionsRow: { flexDirection: "row", gap: 10 },
  ratingSecondaryBtn: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: "center", backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: GLASS_BORDER },
  ratingSecondaryBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.white },
  ratingPrimaryBtn: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: "center", backgroundColor: Colors.white },
  ratingPrimaryBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.primary },

  waitingTimerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.35)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: "flex-start",
  },
  waitingTimerBadgeCharged: {
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    borderColor: "rgba(245, 158, 11, 0.4)",
  },
  waitingTimerText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#10B981",
  },
  waitingTimerTextCharged: {
    color: "#F59E0B",
  },
});
