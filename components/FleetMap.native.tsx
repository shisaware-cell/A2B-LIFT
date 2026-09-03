import React, { forwardRef, useImperativeHandle, useRef } from "react";
import { View, StyleSheet, Platform, Image, Text } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";

const NEARBY_CAR_MARKER = require("../assets/images/nearby-car-marker.png");

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

export const FleetMap = forwardRef<FleetMapRef, FleetMapProps>(function FleetMap(
  { mode = "Driver", drivers, vehicles = [], selectedItem, onSelectDriver, onSelectVehicle, initialRegion },
  ref
) {
  const mapRef = useRef<MapView>(null);

  useImperativeHandle(ref, () => ({
    zoomIn: () => {
      if (!mapRef.current) return;
      mapRef.current.getCamera().then((camera) => {
        if (!camera) return;
        camera.zoom = (camera.zoom || 14) + 1;
        mapRef.current?.animateCamera(camera, { duration: 300 });
      }).catch(() => {});
    },
    zoomOut: () => {
      if (!mapRef.current) return;
      mapRef.current.getCamera().then((camera) => {
        if (!camera) return;
        camera.zoom = Math.max(1, (camera.zoom || 14) - 1);
        mapRef.current?.animateCamera(camera, { duration: 300 });
      }).catch(() => {});
    },
    animateToRegion: (region: any, duration = 600) => {
      if (!mapRef.current) return;
      mapRef.current.animateToRegion(region, duration);
    },
  }));

  const isVehicleMode = mode === "Vehicle";

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
      initialRegion={initialRegion}
      showsUserLocation={false}
      showsCompass={false}
      toolbarEnabled={false}
    >
      {isVehicleMode
        ? vehicles.map((v: any) => {
            const lat = Number(v.lat || v.assignedDriver?.lat);
            const lng = Number(v.lng || v.assignedDriver?.lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0) return null;
            const isSelected = selectedItem?.id === v.id;
            return (
              <Marker
                key={`vehicle-${v.id}`}
                coordinate={{ latitude: lat, longitude: lng }}
                anchor={{ x: 0.5, y: 0.5 }}
                flat={true}
                onPress={() => (onSelectVehicle ? onSelectVehicle(v) : onSelectDriver(v))}
              >
                <View style={styles.markerContainer}>
                  {v.plateNumber ? (
                    <View style={[styles.plateTag, isSelected && styles.plateTagSelected]}>
                      <Text style={styles.plateTagText}>{v.plateNumber}</Text>
                    </View>
                  ) : null}
                  <Image
                    source={NEARBY_CAR_MARKER}
                    style={[
                      styles.carMarkerImage,
                      !v.assignedDriver && { opacity: 0.6 },
                      isSelected && styles.selectedMarkerGlow,
                    ]}
                    resizeMode="contain"
                  />
                </View>
              </Marker>
            );
          })
        : drivers.map((driver: any) => {
            if (!Number.isFinite(driver.lat) || !Number.isFinite(driver.lng) || driver.lat === 0) return null;
            const isSelected = selectedItem?.id === driver.id;
            return (
              <Marker
                key={`driver-${driver.id}`}
                coordinate={{ latitude: driver.lat, longitude: driver.lng }}
                anchor={{ x: 0.5, y: 0.5 }}
                flat={true}
                rotation={driver.heading || 0}
                onPress={() => onSelectDriver(driver)}
              >
                <View style={styles.markerContainer}>
                  {driver.status === "in_trip" ? (
                    <View style={styles.inTripBadge}>
                      <Ionicons name="navigate" size={10} color="#FFFFFF" />
                    </View>
                  ) : driver.status === "online" ? (
                    <View style={styles.onlinePulseDot} />
                  ) : null}
                  <Image
                    source={NEARBY_CAR_MARKER}
                    style={[
                      styles.carMarkerImage,
                      driver.status === "offline" && { opacity: 0.5 },
                      isSelected && styles.selectedMarkerGlow,
                    ]}
                    resizeMode="contain"
                  />
                </View>
              </Marker>
            );
          })}
    </MapView>
  );
});

const styles = StyleSheet.create({
  markerContainer: {
    alignItems: "center",
    justifyContent: "center",
    width: 40,
    height: 60,
  },
  carMarkerImage: {
    width: 26,
    height: 52,
  },
  selectedMarkerGlow: {
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
  },
  onlinePulseDot: {
    position: "absolute",
    top: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#10B981",
  },
  inTripBadge: {
    position: "absolute",
    top: -2,
    backgroundColor: "#2563EB",
    borderRadius: 8,
    padding: 3,
  },
  plateTag: {
    backgroundColor: "#111827",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#374151",
    marginBottom: 2,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 3,
  },
  plateTagSelected: {
    backgroundColor: "#10B981",
    borderColor: "#059669",
  },
  plateTagText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
  },
});
