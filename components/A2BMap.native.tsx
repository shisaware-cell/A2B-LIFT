import React, { useRef, useEffect, useMemo, useCallback, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Image, Pressable } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";

const NEARBY_CAR_MARKER = require("../assets/images/nearby-car-marker.png");

// Fallback region — Johannesburg CBD. Used when GPS not yet acquired so map
// never renders at world zoom level.
const DEFAULT_REGION = { lat: -26.2041, lng: 28.0473 };
const STREET_DELTA = 0.005;
const CITY_DELTA = 0.075;

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
        flat={true}
        rotation={rotation}
      >
        <Image
          source={NEARBY_CAR_MARKER}
          style={driverMarkerStyle.image}
          resizeMode="contain"
          fadeDuration={0}
        />
      </Marker>
    );
  },
);

const NearbyDriverMarker = React.memo(
  ({
    latitude,
    longitude,
    heading,
  }: {
    id?: string | number;
    latitude: number;
    longitude: number;
    heading?: number;
    etaText?: string;
  }) => {
    return (
      <Marker
        coordinate={{ latitude, longitude }}
        anchor={{ x: 0.5, y: 0.5 }}
        tracksViewChanges={false}
        flat={true}
        rotation={heading || 0}
      >
        <Image
          source={NEARBY_CAR_MARKER}
          style={driverMarkerStyle.image}
          resizeMode="contain"
          fadeDuration={0}
        />
      </Marker>
    );
  },
);

const driverMarkerStyle = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    width: 28,
    height: 58,
  },
});

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
  if (!coords || coords.length === 0) {
    return {
      latitude: DEFAULT_REGION.lat,
      longitude: DEFAULT_REGION.lng,
      latitudeDelta: STREET_DELTA,
      longitudeDelta: STREET_DELTA,
    };
  }
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
  if (Math.abs(maxLat - minLat) < 0.002 && Math.abs(maxLng - minLng) < 0.002) {
    return {
      latitude: midLat,
      longitude: midLng,
      latitudeDelta: STREET_DELTA,
      longitudeDelta: STREET_DELTA,
    };
  }

  const latDelta = Math.max((maxLat - minLat) * 1.35, STREET_DELTA);
  const lngDelta = Math.max((maxLng - minLng) * 1.35, STREET_DELTA);

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
  mapMode?: "auto" | "dark" | "light";
  recenterBottom?: number;
  onRecenter?: () => void;
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
  initialZoom = "city",
  mapMode = "auto",
  recenterBottom,
  onRecenter,
}: A2BMapProps) {
  const IDLE_DELTA = initialZoom === "street" ? STREET_DELTA : CITY_DELTA;
  const mapRef = useRef<MapView>(null);

  const [isDay, setIsDay] = useState(isDaytimeNow);
  useEffect(() => {
    const id = setInterval(() => setIsDay(isDaytimeNow()), 60_000);
    return () => clearInterval(id);
  }, []);

  const isEffectiveDay = mapMode === "dark" ? false : mapMode === "light" ? true : isDay;
  const customMapStyle = isEffectiveDay ? LIGHT_MAP_STYLE : DARK_MAP_STYLE;
  const mapBackground = isEffectiveDay ? "#E9ECEF" : "#0B0B0B";
  const routeColor = isEffectiveDay ? "#111111" : "#FFFFFF";
  const edgeShade = isEffectiveDay ? "255,255,255" : "0,0,0";

  // Use user's or driver's location for initialRegion if available, else Johannesburg
  const center = driverLocation || pickupLocation || DEFAULT_REGION;
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

  const zoomToCoords = useCallback((
    coords: { latitude: number; longitude: number }[],
    duration = 700
  ) => {
    if (!mapRef.current || coords.length === 0) return;
    const region = computeRegion(coords);
    mapRef.current.animateToRegion(region, duration);
  }, []);

  const [isMapMoved, setIsMapMoved] = useState(false);
  const centeredRegionRef = useRef<{ lat: number; lng: number; delta: number }>({
    lat: DEFAULT_REGION.lat,
    lng: DEFAULT_REGION.lng,
    delta: IDLE_DELTA,
  });

  const fitMap = useCallback(() => {
    if (!mapRef.current) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } catch {}

    setIsMapMoved(false);

    const hasRoute = routeCoords.length > 0;
    const hasTripPins = !!(pickupLocation && dropoffLocation);

    if (hasRoute || hasTripPins) {
      const allCoords = [
        ...(driverLocation && isFinite(driverLocation.lat) && isFinite(driverLocation.lng) && driverLocation.lat !== 0
          ? [{ latitude: driverLocation.lat, longitude: driverLocation.lng }]
          : []),
        ...(pickupLocation && isFinite(pickupLocation.lat) && isFinite(pickupLocation.lng) && pickupLocation.lat !== 0
          ? [{ latitude: pickupLocation.lat, longitude: pickupLocation.lng }]
          : []),
        ...stopLocations
          .filter((s) => isFinite(s.lat) && isFinite(s.lng) && s.lat !== 0)
          .map((s) => ({ latitude: s.lat, longitude: s.lng })),
        ...(dropoffLocation && isFinite(dropoffLocation.lat) && isFinite(dropoffLocation.lng) && dropoffLocation.lat !== 0
          ? [{ latitude: dropoffLocation.lat, longitude: dropoffLocation.lng }]
          : []),
        ...routeCoords,
      ];
      if (allCoords.length > 0) {
        zoomToCoords(allCoords, 500);
        return;
      }
    }

    if (driverLocation && isFinite(driverLocation.lat) && isFinite(driverLocation.lng) && driverLocation.lat !== 0) {
      centeredRegionRef.current = { lat: driverLocation.lat, lng: driverLocation.lng, delta: IDLE_DELTA };
      mapRef.current.animateToRegion({
        latitude: driverLocation.lat,
        longitude: driverLocation.lng,
        latitudeDelta: IDLE_DELTA,
        longitudeDelta: IDLE_DELTA,
      }, 500);
    } else if (pickupLocation && isFinite(pickupLocation.lat) && isFinite(pickupLocation.lng) && pickupLocation.lat !== 0) {
      centeredRegionRef.current = { lat: pickupLocation.lat, lng: pickupLocation.lng, delta: IDLE_DELTA };
      mapRef.current.animateToRegion({
        latitude: pickupLocation.lat,
        longitude: pickupLocation.lng,
        latitudeDelta: IDLE_DELTA,
        longitudeDelta: IDLE_DELTA,
      }, 500);
    } else {
      centeredRegionRef.current = { lat: DEFAULT_REGION.lat, lng: DEFAULT_REGION.lng, delta: CITY_DELTA };
      mapRef.current.animateToRegion({
        latitude: DEFAULT_REGION.lat,
        longitude: DEFAULT_REGION.lng,
        latitudeDelta: CITY_DELTA,
        longitudeDelta: CITY_DELTA,
      }, 500);
    }
  }, [driverLocation, routeCoords, pickupLocation, dropoffLocation, stopLocations, zoomToCoords, IDLE_DELTA]);

  function handleMapReady() {
    fitMap();
  }

  // Auto center once live driver or pickup location first becomes available
  const hasCenteredInitialRef = useRef(false);
  useEffect(() => {
    if (hasCenteredInitialRef.current) return;
    const loc = driverLocation || pickupLocation;
    if (loc && (Math.abs(loc.lat - DEFAULT_REGION.lat) > 0.0001 || Math.abs(loc.lng - DEFAULT_REGION.lng) > 0.0001)) {
      hasCenteredInitialRef.current = true;
      const t = setTimeout(() => {
        fitMap();
      }, 300);
      return () => clearTimeout(t);
    }
  }, [driverLocation?.lat, driverLocation?.lng, pickupLocation?.lat, pickupLocation?.lng, fitMap]);

  // Zoom to route when polyline arrives
  useEffect(() => {
    if (routeCoords.length === 0) return;
    const t = setTimeout(() => zoomToCoords(routeCoords, 700), 200);
    return () => clearTimeout(t);
  }, [routeCoords, zoomToCoords]);

  // Zoom to show pickup + dropoff when dropoff is set (before route loads)
  useEffect(() => {
    if (!pickupLocation || !dropoffLocation) return;
    if (routeCoords.length > 0) return;
    const coords = [
      { latitude: pickupLocation.lat, longitude: pickupLocation.lng },
      ...stopLocations.map((s) => ({ latitude: s.lat, longitude: s.lng })),
      { latitude: dropoffLocation.lat, longitude: dropoffLocation.lng },
    ];
    const t = setTimeout(() => zoomToCoords(coords, 700), 200);
    return () => clearTimeout(t);
  }, [pickupLocation?.lat, pickupLocation?.lng, dropoffLocation?.lat, dropoffLocation?.lng, stopLocations, routeCoords.length, zoomToCoords]);

  return (
    <View style={[styles.container, { backgroundColor: mapBackground }]}>
      {loading && !pickupLocation && !driverLocation && (
        <View style={styles.locatingOverlay} pointerEvents="none">
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
        userInterfaceStyle={isEffectiveDay ? "light" : "dark"}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        showsTraffic={false}
        showsBuildings={false}
        showsPointsOfInterest={false}
        pitchEnabled={false}
        rotateEnabled={false}
        toolbarEnabled={false}
        onRegionChangeComplete={(region, details) => {
          if (details?.isGesture) {
            setIsMapMoved(true);
            return;
          }
          const target = centeredRegionRef.current;
          const latDiff = Math.abs(region.latitude - target.lat);
          const lngDiff = Math.abs(region.longitude - target.lng);
          const deltaDiff = Math.abs(region.latitudeDelta - target.delta);
          if (latDiff > 0.008 || lngDiff > 0.008 || deltaDiff > 0.02) {
            setIsMapMoved(true);
          }
        }}
      >
        {pickupLocation && !(showDriver && driverLocation && Math.abs(pickupLocation.lat - driverLocation.lat) < 0.0003 && Math.abs(pickupLocation.lng - driverLocation.lng) < 0.0003) && (
          <Marker
            coordinate={{ latitude: pickupLocation.lat, longitude: pickupLocation.lng }}
            anchor={etaText ? { x: 0.18, y: 0.82 } : { x: 0.5, y: 0.5 }}
          >
            <View style={styles.pickupMarkerContainer}>
              {etaText ? (
                <View style={styles.pickupEtaCallout}>
                  <Text style={styles.pickupEtaCalloutText}>{etaText}</Text>
                  <View style={styles.pickupEtaCalloutArrow} />
                </View>
              ) : null}
              <View style={styles.pickupMarker}>
                <View style={styles.pickupBeam} />
                <View style={styles.pickupOuterRing}>
                  <View style={styles.pickupDot} />
                </View>
              </View>
            </View>
          </Marker>
        )}

        {dropoffLocation && (
          <Marker
            coordinate={{ latitude: dropoffLocation.lat, longitude: dropoffLocation.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.destinationPinContainer}>
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
        {!showDriver && nearbyDrivers.map((driver) => (
          <NearbyDriverMarker
            key={`nearby-${driver.id}`}
            id={driver.id}
            latitude={driver.lat}
            longitude={driver.lng}
            heading={driver.heading}
          />
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

      {isMapMoved && (
        <Pressable
          style={[
            styles.recenterBtn,
            recenterBottom != null && { bottom: recenterBottom },
          ]}
          onPress={() => {
            fitMap();
            onRecenter?.();
          }}
          accessibilityLabel="Recenter Map"
          accessibilityRole="button"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="locate" size={24} color="#000000" />
        </Pressable>
      )}

      <View pointerEvents="none" style={[styles.gradientTop, { backgroundColor: `rgba(${edgeShade},0.3)` }]} />
      <View pointerEvents="none" style={[styles.gradientBottom, { backgroundColor: `rgba(${edgeShade},0.5)` }]} />
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
    prev.initialZoom === next.initialZoom &&
    prev.mapMode === next.mapMode &&
    prev.recenterBottom === next.recenterBottom
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
  pickupMarkerContainer: {
    alignItems: "flex-start",
    justifyContent: "center",
  },
  pickupEtaCallout: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 4,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  pickupEtaCalloutText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: "#000000",
  },
  pickupEtaCalloutArrow: {
    position: "absolute",
    bottom: -4,
    left: 12,
    width: 0,
    height: 0,
    backgroundColor: "transparent",
    borderStyle: "solid",
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderTopWidth: 4,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#FFFFFF",
  },
  pickupMarker: {
    alignItems: "center",
    justifyContent: "center",
    width: 44,
    height: 44,
  },
  pickupBeam: {
    position: "absolute",
    bottom: 2,
    left: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(59, 130, 246, 0.3)",
    transform: [{ rotate: "45deg" }],
  },
  pickupOuterRing: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2.5,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  pickupDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FFFFFF",
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
    width: 52,
    height: 88,
    alignItems: "center",
    justifyContent: "center",
  },
  nearbyDriverImage: {
    width: 40,
    height: 80,
  },
  nearbyEtaPill: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 2,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
    alignItems: "center",
    borderWidth: 0.5,
    borderColor: "rgba(0,0,0,0.08)",
  },
  nearbyEtaPillText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: "#000000",
  },
  nearbyEtaPillArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 5,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#FFFFFF",
    alignSelf: "center",
  },
  recenterBtn: {
    position: "absolute",
    right: 18,
    bottom: 220,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
    zIndex: 20,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
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
