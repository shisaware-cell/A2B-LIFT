import React, { useRef, useEffect, useMemo, useCallback, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

// Fallback region — Johannesburg CBD. Used when GPS not yet acquired so map
// never renders at world zoom level.
const DEFAULT_REGION = { lat: -26.2041, lng: 28.0473 };

const DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#1d1d1d" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#212121" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#757575" }] },
  { featureType: "administrative.country", elementType: "labels.text.fill", stylers: [{ color: "#9e9e9e" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#bdbdbd" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#181818" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#2c2c2c" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#8a8a8a" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#373737" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3c3c3c" }] },
  { featureType: "road.highway.controlled_access", elementType: "geometry", stylers: [{ color: "#4e4e4e" }] },
  { featureType: "road.local", elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
  { featureType: "transit", elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e0e0e" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#3d3d3d" }] },
];

// Clean, Uber-like light style used during the day. Muted greys on near-white,
// POIs hidden to keep the map calm, subtle blue water.
const LIGHT_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#f5f5f5" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f5f5f5" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.land_parcel", elementType: "labels.text.fill", stylers: [{ color: "#bdbdbd" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#e5e5e5" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#9e9e9e" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.arterial", elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#dadada" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
  { featureType: "road.local", elementType: "labels.text.fill", stylers: [{ color: "#9e9e9e" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "transit.line", elementType: "geometry", stylers: [{ color: "#e5e5e5" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#c9dbe8" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#9e9e9e" }] },
];

// Day = 06:00–17:59 local, Night = 18:00–05:59 local.
function isDaytimeNow() {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 18;
}

// Isolated memoized component so the driver marker never unmounts/remounts
// when the parent map re-renders (e.g. from location polling). Only re-renders
// when latitude or longitude actually changes, which is the correct behaviour.
const DriverMarker = React.memo(
  ({ latitude, longitude }: { latitude: number; longitude: number }) => (
    <Marker
      coordinate={{ latitude, longitude }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={false}
      flat={true}
    >
      <View style={driverMarkerStyle.wrap}>
        <Ionicons name="car-sport" size={20} color="#000" />
      </View>
    </Marker>
  ),
  (prev, next) => prev.latitude === next.latitude && prev.longitude === next.longitude,
);
const driverMarkerStyle = { wrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#FFFFFF", borderWidth: 1.5, borderColor: "rgba(0,0,0,0.15)", alignItems: "center" as const, justifyContent: "center" as const, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 6 } };

function decodePolyline(encoded: string): { latitude: number; longitude: number }[] {
  const points: { latitude: number; longitude: number }[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}

// Compute a MapView region from an array of coordinates with padding.
function computeRegion(
  coords: { latitude: number; longitude: number }[],
  extraPadFactor = 0.35
) {
  const lats = coords.map(c => c.latitude);
  const lngs = coords.map(c => c.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latDelta = Math.max((maxLat - minLat) * (1 + extraPadFactor), 0.01);
  const lngDelta = Math.max((maxLng - minLng) * (1 + extraPadFactor), 0.01);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: latDelta,
    longitudeDelta: lngDelta,
  };
}

function distanceInMeters(
  first: { lat: number; lng: number },
  second: { lat: number; lng: number },
) {
  const earthRadiusM = 6371000;
  const dLat = ((second.lat - first.lat) * Math.PI) / 180;
  const dLng = ((second.lng - first.lng) * Math.PI) / 180;
  const lat1 = (first.lat * Math.PI) / 180;
  const lat2 = (second.lat * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthRadiusM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface NearbyDriver {
  id: string | number;
  lat: number;
  lng: number;
}

interface A2BMapProps {
  pickupLocation: { lat: number; lng: number } | null;
  dropoffLocation?: { lat: number; lng: number } | null;
  stopLocations?: { id?: string; lat: number; lng: number }[];
  driverLocation?: { lat: number; lng: number } | null;
  nearbyDrivers?: NearbyDriver[];
  routePolyline?: string | null;
  showDriver?: boolean;
  followDriver?: boolean;
  loading?: boolean;
  etaText?: string;
  statusText?: string;
  /** Initial/idle zoom level. "city" shows the surrounding city; "street" is close-up. */
  initialZoom?: "street" | "city";
}

function A2BMap({
  pickupLocation,
  dropoffLocation,
  stopLocations = [],
  driverLocation,
  nearbyDrivers = [],
  routePolyline,
  showDriver = false,
  followDriver = false,
  loading = false,
  etaText,
  statusText,
  initialZoom = "street",
}: A2BMapProps) {
  // Idle/initial map span: city-wide view when requested, otherwise close-up.
  const IDLE_DELTA = initialZoom === "city" ? 0.11 : 0.004;
  const mapRef = useRef<MapView>(null);
  const mapReadyRef = useRef(false);
  const lastCenteredPickupRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastFollowedDriverRef = useRef<{ lat: number; lng: number } | null>(null);

  // Auto day/night map. Re-checks every minute so it flips at the 6am / 6pm
  // boundary without needing the screen to remount.
  const [isDay, setIsDay] = useState(isDaytimeNow);
  useEffect(() => {
    const id = setInterval(() => setIsDay(isDaytimeNow()), 60_000);
    return () => clearInterval(id);
  }, []);

  const customMapStyle = isDay ? LIGHT_MAP_STYLE : DARK_MAP_STYLE;
  const mapBackground = isDay ? "#E9ECEF" : "#0B0B0B";
  const routeColor = isDay ? "#111111" : "#FFFFFF";
  const dropoffIconColor = isDay ? "#111111" : Colors.white;
  const edgeShade = isDay ? "255,255,255" : "0,0,0";

  // Use user's location for initialRegion if available, else Johannesburg
  const center = pickupLocation || DEFAULT_REGION;
  const initialRegionRef = useRef({
    latitude: center.lat,
    longitude: center.lng,
    latitudeDelta: IDLE_DELTA,
    longitudeDelta: IDLE_DELTA,
  });

  const routeCoords = useMemo(() => {
    if (!routePolyline) return [];
    return decodePolyline(routePolyline);
  }, [routePolyline]);

  // Fly the camera to a computed region — more reliable than fitToCoordinates on iOS
  const zoomToCoords = useCallback((
    coords: { latitude: number; longitude: number }[],
    duration = 700
  ) => {
    if (!mapRef.current || coords.length === 0) return;
    const region = computeRegion(coords);
    mapRef.current.animateToRegion(region, duration);
  }, []);

  const fitMap = useCallback(() => {
    if (!mapRef.current) return;

    if (followDriver && driverLocation) {
      mapRef.current.animateToRegion({
        latitude: driverLocation.lat,
        longitude: driverLocation.lng,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }, 800);
    } else if (routeCoords.length > 0) {
      zoomToCoords(routeCoords);
    } else if (pickupLocation && dropoffLocation) {
      zoomToCoords([
        { latitude: pickupLocation.lat, longitude: pickupLocation.lng },
        { latitude: dropoffLocation.lat, longitude: dropoffLocation.lng },
      ]);
    } else {
      const center = pickupLocation || DEFAULT_REGION;
      mapRef.current.animateToRegion({
        latitude: center.lat,
        longitude: center.lng,
        latitudeDelta: IDLE_DELTA,
        longitudeDelta: IDLE_DELTA,
      }, 600);
    }
  }, [pickupLocation, dropoffLocation, driverLocation, routeCoords, followDriver, zoomToCoords, IDLE_DELTA]);

  function handleMapReady() {
    mapReadyRef.current = true;
    fitMap();
    setTimeout(fitMap, 400);
  }

  // Zoom to user location when GPS first arrives (no route/dropoff set yet)
  useEffect(() => {
    if (!pickupLocation || !mapRef.current) return;
    if (routeCoords.length > 0 || dropoffLocation || followDriver) return;
    if (
      lastCenteredPickupRef.current &&
      distanceInMeters(lastCenteredPickupRef.current, pickupLocation) < 30
    ) {
      return;
    }

    lastCenteredPickupRef.current = {
      lat: pickupLocation.lat,
      lng: pickupLocation.lng,
    };

    mapRef.current.animateToRegion({
      latitude: pickupLocation.lat,
      longitude: pickupLocation.lng,
      latitudeDelta: IDLE_DELTA,
      longitudeDelta: IDLE_DELTA,
    }, 400);
  }, [pickupLocation?.lat, pickupLocation?.lng, dropoffLocation?.lat, dropoffLocation?.lng, routeCoords.length, followDriver, IDLE_DELTA]);

  useEffect(() => {
    if (!followDriver || !driverLocation || !mapRef.current) return;
    if (
      lastFollowedDriverRef.current &&
      distanceInMeters(lastFollowedDriverRef.current, driverLocation) < 20
    ) {
      return;
    }

    lastFollowedDriverRef.current = {
      lat: driverLocation.lat,
      lng: driverLocation.lng,
    };

    mapRef.current.animateToRegion({
      latitude: driverLocation.lat,
      longitude: driverLocation.lng,
      latitudeDelta: 0.005,
      longitudeDelta: 0.005,
    }, 500);
  }, [followDriver, driverLocation?.lat, driverLocation?.lng]);

  // Zoom to show pickup + dropoff when dropoff is set (before route loads)
  useEffect(() => {
    if (!pickupLocation || !dropoffLocation) return;
    if (routeCoords.length > 0) return;
    const coords = [
      { latitude: pickupLocation.lat, longitude: pickupLocation.lng },
      { latitude: dropoffLocation.lat, longitude: dropoffLocation.lng },
    ];
    const t1 = setTimeout(() => zoomToCoords(coords, 700), 200);
    const t2 = setTimeout(() => zoomToCoords(coords, 700), 800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [pickupLocation?.lat, pickupLocation?.lng, dropoffLocation?.lat, dropoffLocation?.lng, zoomToCoords]);

  // Zoom to route when polyline arrives — fires with retries, no mapReady gate needed
  useEffect(() => {
    if (routeCoords.length === 0) return;
    const t1 = setTimeout(() => zoomToCoords(routeCoords, 700), 200);
    const t2 = setTimeout(() => zoomToCoords(routeCoords, 700), 900);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [routeCoords, zoomToCoords]);

  return (
    <View style={[styles.container, { backgroundColor: mapBackground }]}>
      {loading && (
        <View style={styles.locatingOverlay}>
          <ActivityIndicator size="small" color={Colors.white} />
          <Text style={styles.locatingText}>Locating you...</Text>
        </View>
      )}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        customMapStyle={customMapStyle}
        initialRegion={initialRegionRef.current}
        onMapReady={handleMapReady}
        mapType="standard"
        loadingEnabled={true}
        loadingBackgroundColor={mapBackground}
        loadingIndicatorColor={isDay ? "#111111" : "#FFFFFF"}
        userInterfaceStyle={isDay ? "light" : "dark"}
        showsUserLocation={true}
        showsMyLocationButton={false}
        showsCompass={false}
        showsTraffic={false}
        showsBuildings={false}
        showsIndoors={false}
        toolbarEnabled={false}
        mapPadding={{ top: 0, right: 0, bottom: 0, left: 0 }}
      >
        {pickupLocation && (
          <Marker
            coordinate={{ latitude: pickupLocation.lat, longitude: pickupLocation.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.pickupMarker}>
              <View style={styles.pickupDot} />
            </View>
          </Marker>
        )}

        {dropoffLocation && (
          <Marker
            coordinate={{ latitude: dropoffLocation.lat, longitude: dropoffLocation.lng }}
            anchor={{ x: 0.5, y: 1 }}
          >
            <View style={styles.dropoffMarker}>
              <Ionicons name="location" size={28} color={dropoffIconColor} />
            </View>
          </Marker>
        )}
        {stopLocations.map((stop, index) => (
          <Marker
            key={stop.id || `stop-${index}`}
            coordinate={{ latitude: stop.lat, longitude: stop.lng }}
            title={`Stop ${index + 1}`}
          >
            <View style={styles.stopMarker}>
              <Text style={styles.stopMarkerText}>{index + 1}</Text>
            </View>
          </Marker>
        ))}

        {/* Nearby idle drivers shown when not in an active ride */}
        {!showDriver && nearbyDrivers.map((driver) => (
          <Marker
            key={`nearby-${driver.id}`}
            coordinate={{ latitude: driver.lat, longitude: driver.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={styles.nearbyDriverMarker}>
              <Ionicons name="car-sport" size={16} color="#000" />
            </View>
          </Marker>
        ))}

        {showDriver && driverLocation && (
          <DriverMarker
            latitude={driverLocation.lat}
            longitude={driverLocation.lng}
          />
        )}

        {routeCoords.length > 0 && (
          <Polyline
            coordinates={routeCoords}
            strokeColor={routeColor}
            strokeWidth={5}
            zIndex={10}
            geodesic={true}
            lineCap="round"
            lineJoin="round"
          />
        )}
      </MapView>

      {statusText && (
        <View style={styles.statusOverlay}>
          <Text style={styles.statusOverlayText}>{statusText}</Text>
          {etaText && <Text style={styles.etaOverlayText}>{etaText}</Text>}
        </View>
      )}

      <View style={[styles.gradientTop, { backgroundColor: `rgba(${edgeShade},0.3)` }]} />
      <View style={[styles.gradientBottom, { backgroundColor: `rgba(${edgeShade},0.5)` }]} />
    </View>
  );
}

function sameCoordinate(
  left?: { lat: number; lng: number } | null,
  right?: { lat: number; lng: number } | null,
) {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.lat === right.lat && left.lng === right.lng;
}

function sameCoordinateList(
  left: Array<{ id?: string | number; lat: number; lng: number }> = [],
  right: Array<{ id?: string | number; lat: number; lng: number }> = [],
) {
  return left.length === right.length && left.every((point, index) => {
    const other = right[index];
    return point.id === other?.id && point.lat === other?.lat && point.lng === other?.lng;
  });
}

function areMapPropsEqual(previous: A2BMapProps, next: A2BMapProps) {
  return (
    sameCoordinate(previous.pickupLocation, next.pickupLocation) &&
    sameCoordinate(previous.dropoffLocation, next.dropoffLocation) &&
    sameCoordinate(previous.driverLocation, next.driverLocation) &&
    sameCoordinateList(previous.stopLocations, next.stopLocations) &&
    sameCoordinateList(previous.nearbyDrivers, next.nearbyDrivers) &&
    previous.routePolyline === next.routePolyline &&
    previous.showDriver === next.showDriver &&
    previous.followDriver === next.followDriver &&
    previous.loading === next.loading &&
    previous.etaText === next.etaText &&
    previous.statusText === next.statusText &&
    previous.initialZoom === next.initialZoom
  );
}

export default React.memo(A2BMap, areMapPropsEqual);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: "#0B0B0B",
  },
  map: {
    flex: 1,
  },
  locatingOverlay: {
    position: "absolute",
    top: 12,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    zIndex: 10,
  },
  locatingText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.white,
  },
  pickupMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.7)",
    borderWidth: 2,
    borderColor: Colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  pickupDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.white,
  },
  dropoffMarker: {
    alignItems: "center",
  },
  stopMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.accent,
    borderWidth: 2,
    borderColor: Colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  stopMarkerText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: Colors.primary,
  },
  nearbyDriverMarker: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#FFD700",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#000",
  },
  statusOverlay: {
    position: "absolute",
    top: 16,
    left: 20,
    right: 20,
    backgroundColor: "rgba(0,0,0,0.85)",
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    gap: 4,
  },
  statusOverlayText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.white,
    letterSpacing: 0.5,
  },
  etaOverlayText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  gradientTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 40,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  gradientBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
});
