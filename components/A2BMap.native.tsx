import React, { useRef, useEffect, useMemo, useCallback, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Image } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

const NEARBY_CAR_MARKER = require("../assets/images/nearby-car-marker.png");

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

function calculateBearingDegrees(
  prevLat: number,
  prevLng: number,
  nextLat: number,
  nextLng: number,
): number {
  const pLat = (prevLat * Math.PI) / 180;
  const pLng = (prevLng * Math.PI) / 180;
  const nLat = (nextLat * Math.PI) / 180;
  const nLng = (nextLng * Math.PI) / 180;
  const dLng = nLng - pLng;
  const y = Math.sin(dLng) * Math.cos(nLat);
  const x = Math.cos(pLat) * Math.sin(nLat) - Math.sin(pLat) * Math.cos(nLat) * Math.cos(dLng);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

const DriverMarker = React.memo(
  ({ latitude, longitude, heading }: { latitude: number; longitude: number; heading?: number }) => {
    const prevCoordRef = useRef({ latitude, longitude });
    const [rotation, setRotation] = useState(heading ?? 0);

    useEffect(() => {
      const prev = prevCoordRef.current;
      const dLat = latitude - prev.latitude;
      const dLng = longitude - prev.longitude;
      const dist = Math.sqrt(dLat * dLat + dLng * dLng);

      if (typeof heading === "number" && !isNaN(heading) && heading >= 0) {
        setRotation(heading);
      } else if (dist > 0.00005) {
        const computedBearing = calculateBearingDegrees(prev.latitude, prev.longitude, latitude, longitude);
        setRotation(computedBearing);
      }
      prevCoordRef.current = { latitude, longitude };
    }, [latitude, longitude, heading]);

    return (
      <Marker
        coordinate={{ latitude, longitude }}
        anchor={{ x: 0.5, y: 0.5 }}
        tracksViewChanges={false}
        flat={true}
        rotation={rotation}
      >
        <View style={driverMarkerStyle.wrap}>
          <Image
            source={NEARBY_CAR_MARKER}
            style={driverMarkerStyle.image}
            resizeMode="contain"
          />
        </View>
      </Marker>
    );
  },
);

const driverMarkerStyle = {
  wrap: {
    width: 58,
    height: 42,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  image: {
    width: 56,
    height: 36,
  },
};

function decodePolyline(encoded: string): { latitude: number; longitude: number }[] {
  const points: { latitude: number; longitude: number }[] = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}

function computeRegion(coords: { latitude: number; longitude: number }[]) {
  let minLat = coords[0].latitude;
  let maxLat = coords[0].latitude;
  let minLng = coords[0].longitude;
  let maxLng = coords[0].longitude;

  for (let i = 1; i < coords.length; i++) {
    const c = coords[i];
    if (c.latitude < minLat) minLat = c.latitude;
    if (c.latitude > maxLat) maxLat = c.latitude;
    if (c.longitude < minLng) minLng = c.longitude;
    if (c.longitude > maxLng) maxLng = c.longitude;
  }

  const midLat = (minLat + maxLat) / 2;
  const midLng = (minLng + maxLng) / 2;
  const latDelta = Math.max((maxLat - minLat) * 1.5, 0.008);
  const lngDelta = Math.max((maxLng - minLng) * 1.5, 0.008);

  return {
    latitude: midLat,
    longitude: midLng,
    latitudeDelta: latDelta,
    longitudeDelta: lngDelta,
  };
}

export type NearbyDriver = {
  id: string;
  lat: number;
  lng: number;
  heading?: number;
};

export type A2BMapProps = {
  pickupLocation?: { lat: number; lng: number } | null;
  dropoffLocation?: { lat: number; lng: number } | null;
  stopLocations?: Array<{ id?: string; lat: number; lng: number }>;
  activeStopIndex?: number;
  driverLocation?: { lat: number; lng: number; heading?: number; speed?: number } | null;
  nearbyDrivers?: NearbyDriver[];
  routePolyline?: string | null;
  showDriver?: boolean;
  followDriver?: boolean;
  loading?: boolean;
  etaText?: string | null;
  statusText?: string | null;
  initialZoom?: "city" | "street";
};

export function A2BMap({
  pickupLocation,
  dropoffLocation,
  stopLocations = [],
  activeStopIndex,
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
  const IDLE_DELTA = initialZoom === "city" ? 0.11 : 0.004;
  const mapRef = useRef<MapView>(null);

  const [isDay, setIsDay] = useState(isDaytimeNow);
  useEffect(() => {
    const id = setInterval(() => setIsDay(isDaytimeNow()), 60_000);
    return () => clearInterval(id);
  }, []);

  const customMapStyle = isDay ? LIGHT_MAP_STYLE : DARK_MAP_STYLE;
  const mapBackground = isDay ? "#E9ECEF" : "#0B0B0B";
  const routeColor = isDay ? "#111111" : "#FFFFFF";
  const edgeShade = isDay ? "255,255,255" : "0,0,0";

  const routeCoords = useMemo(() => {
    if (!routePolyline) return [];
    return decodePolyline(routePolyline);
  }, [routePolyline]);

  const fitMap = useCallback(() => {
    if (!mapRef.current) return;
    if (followDriver && driverLocation) {
      mapRef.current.animateToRegion({
        latitude: driverLocation.lat,
        longitude: driverLocation.lng,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }, 500);
    } else if (routeCoords.length > 0) {
      mapRef.current.animateToRegion(computeRegion(routeCoords), 500);
    } else if (pickupLocation) {
      mapRef.current.animateToRegion({
        latitude: pickupLocation.lat,
        longitude: pickupLocation.lng,
        latitudeDelta: IDLE_DELTA,
        longitudeDelta: IDLE_DELTA,
      }, 500);
    }
  }, [followDriver, driverLocation, routeCoords, pickupLocation, IDLE_DELTA]);

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
        showsUserLocation={true}
        showsMyLocationButton={false}
        showsCompass={false}
        showsTraffic={false}
        showsBuildings={false}
        showsPointsOfInterest={false}
        pitchEnabled={false}
        rotateEnabled={false}
        toolbarEnabled={false}
      >
        {pickupLocation && (
          <Marker
            coordinate={{ latitude: pickupLocation.lat, longitude: pickupLocation.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={styles.pickupMarker}>
              <View style={styles.pickupDot} />
            </View>
          </Marker>
        )}

        {dropoffLocation && (
          <Marker
            coordinate={{ latitude: dropoffLocation.lat, longitude: dropoffLocation.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={styles.destinationPinContainer}>
              <View style={styles.destinationCallout}>
                <Text style={styles.destinationCalloutText}>Destination</Text>
              </View>
              <View style={styles.destinationBlackSquare}>
                <View style={styles.destinationWhiteDot} />
              </View>
            </View>
          </Marker>
        )}
        {stopLocations.map((stop, index) => (
          <Marker
            key={stop.id || `stop-${index}`}
            coordinate={{ latitude: stop.lat, longitude: stop.lng }}
            title={`Stop ${index + 1}`}
          >
            <View style={[styles.stopMarker, index === activeStopIndex && styles.activeStopMarker]}>
              <Text style={[styles.stopMarkerText, index === activeStopIndex && styles.activeStopMarkerText]}>
                {index === activeStopIndex ? "NEXT" : index + 1}
              </Text>
            </View>
          </Marker>
        ))}

        {/* Nearby idle drivers shown when not in an active ride */}
        {!showDriver && nearbyDrivers.map((driver, index) => (
          <Marker
            key={`nearby-${driver.id}`}
            coordinate={{ latitude: driver.lat, longitude: driver.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
            flat={true}
            rotation={driver.heading || 0}
          >
            <View style={styles.nearbyDriverMarker}>
              {index === 0 && etaText && (
                <View style={styles.nearbyEtaPill}>
                  <Text style={styles.nearbyEtaPillText}>{etaText}</Text>
                  <View style={styles.nearbyEtaPillArrow} />
                </View>
              )}
              <Image
                source={NEARBY_CAR_MARKER}
                style={styles.nearbyDriverImage}
                resizeMode="contain"
              />
            </View>
          </Marker>
        ))}

        {showDriver && driverLocation && (
          <DriverMarker
            latitude={driverLocation.lat}
            longitude={driverLocation.lng}
            heading={driverLocation.heading}
          />
        )}

        {routeCoords.length > 0 && (
          <Polyline
            coordinates={routeCoords}
            strokeColor={routeColor}
            strokeWidth={4.5}
            lineCap="round"
            lineJoin="round"
          />
        )}
      </MapView>

      <Pressable
        style={styles.recenterBtn}
        onPress={fitMap}
        accessibilityLabel="Recenter Map"
      >
        <Ionicons name="locate" size={22} color={isDay ? "#111111" : Colors.white} />
      </Pressable>

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

function areMapPropsEqual(prev: A2BMapProps, next: A2BMapProps) {
  return (
    sameCoordinate(prev.pickupLocation, next.pickupLocation) &&
    sameCoordinate(prev.dropoffLocation, next.dropoffLocation) &&
    sameCoordinate(prev.driverLocation, next.driverLocation) &&
    prev.driverLocation?.heading === next.driverLocation?.heading &&
    sameCoordinateList(prev.stopLocations, next.stopLocations) &&
    prev.activeStopIndex === next.activeStopIndex &&
    sameCoordinateList(prev.nearbyDrivers, next.nearbyDrivers) &&
    prev.routePolyline === next.routePolyline &&
    prev.showDriver === next.showDriver &&
    prev.followDriver === next.followDriver &&
    prev.loading === next.loading &&
    prev.etaText === next.etaText &&
    prev.statusText === next.statusText &&
    prev.initialZoom === next.initialZoom
  );
}

export const MemoizedA2BMap = React.memo(A2BMap, areMapPropsEqual);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: "hidden",
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  locatingOverlay: {
    position: "absolute",
    top: 20,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.75)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    zIndex: 10,
  },
  locatingText: {
    color: Colors.white,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  pickupMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0, 200, 83, 0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  pickupDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#00C853",
    borderWidth: 2,
    borderColor: Colors.white,
  },
  destinationPinContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  destinationCallout: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 4,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  destinationCalloutText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: "#111827",
  },
  destinationBlackSquare: {
    width: 16,
    height: 16,
    backgroundColor: "#111111",
    borderRadius: 3,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  destinationWhiteDot: {
    width: 4,
    height: 4,
    backgroundColor: "#FFFFFF",
    borderRadius: 1,
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
  activeStopMarker: {
    width: 44,
    borderRadius: 7,
    backgroundColor: Colors.accent,
  },
  activeStopMarkerText: {
    color: Colors.white,
    fontSize: 9,
  },
  nearbyDriverMarker: {
    width: 58,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  nearbyDriverImage: {
    width: 54,
    height: 36,
  },
  nearbyEtaPill: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 2,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
    alignItems: "center",
  },
  nearbyEtaPillText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: "#111827",
  },
  nearbyEtaPillArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderTopWidth: 4,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#FFFFFF",
    alignSelf: "center",
  },
  recenterBtn: {
    position: "absolute",
    right: 18,
    bottom: 220,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(30,30,30,0.92)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
    zIndex: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
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

export default MemoizedA2BMap;
