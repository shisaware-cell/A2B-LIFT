import React, { forwardRef, useImperativeHandle } from "react";
import { View, StyleSheet, Text } from "react-native";
import Constants from "expo-constants";

export interface FleetMapRef {
  zoomIn: () => void;
  zoomOut: () => void;
  animateToRegion: (region: any, duration?: number) => void;
}

interface FleetMapProps {
  mode?: "Driver" | "Vehicle";
  drivers: any[];
  vehicles?: any[];
  selectedItem: any;
  onSelectDriver: (driver: any) => void;
  onSelectVehicle?: (vehicle: any) => void;
  initialRegion: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
}

const GOOGLE_MAPS_API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY ||
  Constants.expoConfig?.extra?.googleMapsApiKey ||
  "";

export const FleetMap = forwardRef<FleetMapRef, FleetMapProps>(function FleetMap(
  { mode = "Driver", drivers, vehicles = [], selectedItem, onSelectDriver, onSelectVehicle, initialRegion },
  ref
) {
  useImperativeHandle(ref, () => ({
    zoomIn: () => {},
    zoomOut: () => {},
    animateToRegion: () => {},
  }));

  const centerLat = selectedItem?.lat || initialRegion.latitude;
  const centerLng = selectedItem?.lng || initialRegion.longitude;

  const embedUrl = `https://www.google.com/maps/embed/v1/view?key=${GOOGLE_MAPS_API_KEY}&center=${centerLat},${centerLng}&zoom=12&maptype=roadmap`;

  return (
    <View style={[StyleSheet.absoluteFill, styles.container]}>
      {GOOGLE_MAPS_API_KEY ? (
        <iframe
          src={embedUrl}
          style={{ width: "100%", height: "100%", border: 0 }}
          title="Fleet Live Map Web"
          loading="lazy"
        />
      ) : (
        <View style={styles.fallback}>
          <Text style={styles.fallbackText}>Interactive fleet map (active on mobile app)</Text>
          <Text style={styles.fallbackSub}>{drivers.length} drivers monitored</Text>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#E5E7EB",
  },
  fallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  fallbackText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 4,
  },
  fallbackSub: {
    fontSize: 13,
    color: "#6B7280",
  },
});
