import React, { useRef, useEffect, useMemo } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import Constants from "expo-constants";
import Colors from "@/constants/colors";

const GOOGLE_MAPS_API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY ||
  Constants.expoConfig?.extra?.googleMapsApiKey ||
  "";

const DARK_MAP_STYLES = `&style=element:geometry%7Ccolor:0x1d1d1d&style=element:labels.icon%7Cvisibility:off&style=element:labels.text.fill%7Ccolor:0x757575&style=element:labels.text.stroke%7Ccolor:0x212121&style=feature:road%7Celement:geometry.fill%7Ccolor:0x2c2c2c&style=feature:road.highway%7Celement:geometry%7Ccolor:0x3c3c3c&style=feature:water%7Celement:geometry%7Ccolor:0x0e0e0e`;

// Day = 06:00–17:59 local, Night = 18:00–05:59 local. Keeps the web build's
// map in sync with the native day/night behaviour.
function isDaytimeNow(): boolean {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 18;
}

const LIGHT_MAP_JS_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#f5f5f5" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f5f5f5" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#dadada" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#c9dbe8" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

function decodePolyline(encoded: string): { lat: number; lng: number }[] {
  const points: { lat: number; lng: number }[] = [];
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
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
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
  activeStopIndex?: number;
  driverLocation?: { lat: number; lng: number } | null;
  nearbyDrivers?: NearbyDriver[];
  routePolyline?: string | null;
  showDriver?: boolean;
  followDriver?: boolean;
  loading?: boolean;
  etaText?: string;
  statusText?: string;
  initialZoom?: "street" | "city";
}

export default function A2BMap({
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
}: A2BMapProps & { followDriver?: boolean }) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const driverMarkerRef = useRef<any>(null);
  const polylineRef = useRef<any>(null);
  const scriptLoadedRef = useRef(false);

  const routeCoords = useMemo(() => {
    if (!routePolyline) return [];
    return decodePolyline(routePolyline);
  }, [routePolyline]);

  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY || !pickupLocation) return;
    if (scriptLoadedRef.current) {
      initMap();
      return;
    }
    if ((window as any).google?.maps) {
      scriptLoadedRef.current = true;
      initMap();
      return;
    }
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      existingScript.addEventListener("load", () => {
        scriptLoadedRef.current = true;
        initMap();
      });
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      scriptLoadedRef.current = true;
      initMap();
    };
    document.head.appendChild(script);
  }, [pickupLocation]);

  useEffect(() => {
    if (!mapInstanceRef.current || !pickupLocation) return;
    // Small delay so Google Maps finishes rendering before we fit bounds
    const t = setTimeout(() => updateMarkers(), 200);
    return () => clearTimeout(t);
  }, [pickupLocation, dropoffLocation, stopLocations, activeStopIndex, driverLocation, showDriver, nearbyDrivers]);

  useEffect(() => {
    if (!mapInstanceRef.current) return;
    updatePolyline();
  }, [routeCoords]);

  function initMap() {
    if (!mapContainerRef.current || !pickupLocation) return;
    const google = (window as any).google;
    if (!google?.maps) return;

    const darkStyle = [
      { elementType: "geometry", stylers: [{ color: "#1d1d1d" }] },
      { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
      { elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
      { elementType: "labels.text.stroke", stylers: [{ color: "#212121" }] },
      { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#2c2c2c" }] },
      { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#373737" }] },
      { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3c3c3c" }] },
      { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e0e0e" }] },
      { featureType: "poi", stylers: [{ visibility: "off" }] },
      { featureType: "transit", stylers: [{ visibility: "off" }] },
    ];

    const day = isDaytimeNow();
    const map = new google.maps.Map(mapContainerRef.current, {
      center: { lat: pickupLocation.lat, lng: pickupLocation.lng },
      zoom: initialZoom === "city" ? 12 : 17,
      styles: day ? LIGHT_MAP_JS_STYLE : darkStyle,
      disableDefaultUI: true,
      gestureHandling: "greedy",
      backgroundColor: day ? "#E9ECEF" : "#1d1d1d",
    });

    mapInstanceRef.current = map;
    updateMarkers();
    updatePolyline();
  }

  function updateMarkers() {
    const google = (window as any).google;
    if (!google?.maps || !mapInstanceRef.current) return;

    // Remove all non-driver markers and recreate them (pickup, dropoff, nearby)
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];

    if (pickupLocation) {
      const pickupMarker = new google.maps.Marker({
        position: { lat: pickupLocation.lat, lng: pickupLocation.lng },
        map: mapInstanceRef.current,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: "#000000",
          fillOpacity: 1,
          strokeColor: "#FFFFFF",
          strokeWeight: 3,
        },
      });
      markersRef.current.push(pickupMarker);
    }

    if (dropoffLocation) {
      const dropoffMarker = new google.maps.Marker({
        position: { lat: dropoffLocation.lat, lng: dropoffLocation.lng },
        map: mapInstanceRef.current,
        icon: {
          path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
          scale: 6,
          fillColor: "#FFFFFF",
          fillOpacity: 1,
          strokeColor: "#000000",
          strokeWeight: 2,
        },
      });
      markersRef.current.push(dropoffMarker);
    }

    stopLocations.forEach((stop, index) => {
      const stopMarker = new google.maps.Marker({
        position: { lat: stop.lat, lng: stop.lng },
        map: mapInstanceRef.current,
        label: {
          text: index === activeStopIndex ? "NEXT" : String(index + 1),
          color: index === activeStopIndex ? "#FFFFFF" : "#000000",
          fontWeight: "700",
        },
        title: `Stop ${index + 1}`,
      });
      markersRef.current.push(stopMarker);
    });

    if (!showDriver && nearbyDrivers.length > 0) {
      nearbyDrivers.forEach((driver) => {
        const m = new google.maps.Marker({
          position: { lat: driver.lat, lng: driver.lng },
          map: mapInstanceRef.current,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 7,
            fillColor: "#FFD700",
            fillOpacity: 1,
            strokeColor: "#000000",
            strokeWeight: 1.5,
          },
        });
        markersRef.current.push(m);
      });
    }

    // Driver marker: create once, then just move it — never destroy/recreate to avoid blinking
    if (showDriver && driverLocation) {
      if (!driverMarkerRef.current) {
        driverMarkerRef.current = new google.maps.Marker({
          position: { lat: driverLocation.lat, lng: driverLocation.lng },
          map: mapInstanceRef.current,
          icon: {
            path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: 5,
            fillColor: "#FFFFFF",
            fillOpacity: 1,
            strokeColor: "#000000",
            strokeWeight: 1.5,
            anchor: new google.maps.Point(0, 2.5),
          },
          optimized: true,
        });
      } else {
        driverMarkerRef.current.setPosition({ lat: driverLocation.lat, lng: driverLocation.lng });
        driverMarkerRef.current.setMap(mapInstanceRef.current);
      }
    } else if (!showDriver && driverMarkerRef.current) {
      driverMarkerRef.current.setMap(null);
    }

    if (followDriver && showDriver && driverLocation) {
      mapInstanceRef.current.panTo({ lat: driverLocation.lat, lng: driverLocation.lng });
      if (mapInstanceRef.current.getZoom() < 16) {
        mapInstanceRef.current.setZoom(16);
      }
    } else {
      const bounds = new google.maps.LatLngBounds();
      let hasMultiple = false;
      if (pickupLocation) bounds.extend({ lat: pickupLocation.lat, lng: pickupLocation.lng });
      if (dropoffLocation) { bounds.extend({ lat: dropoffLocation.lat, lng: dropoffLocation.lng }); hasMultiple = true; }
      stopLocations.forEach((stop) => {
        bounds.extend({ lat: stop.lat, lng: stop.lng });
        hasMultiple = true;
      });
      if (showDriver && driverLocation) { bounds.extend({ lat: driverLocation.lat, lng: driverLocation.lng }); hasMultiple = true; }
      if (hasMultiple) {
        mapInstanceRef.current.fitBounds(bounds, { top: 60, right: 40, bottom: 160, left: 40 });
      }
    }
  }

  function updatePolyline() {
    const google = (window as any).google;
    if (!google?.maps || !mapInstanceRef.current) return;
    if (polylineRef.current) polylineRef.current.setMap(null);
    if (routeCoords.length > 0) {
      polylineRef.current = new google.maps.Polyline({
        path: routeCoords,
        strokeColor: isDaytimeNow() ? "#111111" : "#FFFFFF",
        strokeOpacity: 0.95,
        strokeWeight: 4,
        map: mapInstanceRef.current,
      });
      const bounds = new google.maps.LatLngBounds();
      routeCoords.forEach(c => bounds.extend(c));
      mapInstanceRef.current.fitBounds(bounds, { top: 60, right: 40, bottom: 160, left: 40 });
    }
  }

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <View style={styles.fallback}>
        <ActivityIndicator size="large" color={Colors.white} />
        <Text style={styles.fallbackText}>Map Loading...</Text>
      </View>
    );
  }

  if (loading || !pickupLocation) {
    return (
      <View style={styles.fallback}>
        <ActivityIndicator size="large" color={Colors.white} />
        <Text style={styles.fallbackText}>Locating you...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <div
        ref={mapContainerRef as any}
        style={{ width: "100%", height: "100%", backgroundColor: "#1d1d1d" }}
      />
      {statusText && (
        <View style={styles.statusOverlay}>
          <Text style={styles.statusOverlayText}>{statusText}</Text>
          {etaText && <Text style={styles.etaOverlayText}>{etaText}</Text>}
        </View>
      )}
      <View style={styles.gradientTop} />
      <View style={styles.gradientBottom} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: "hidden",
  },
  fallback: {
    flex: 1,
    backgroundColor: "#1a1a2e",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  fallbackText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
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
