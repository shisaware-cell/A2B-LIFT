import React, { forwardRef, useImperativeHandle, useRef } from "react";
import { View, StyleSheet, Platform, Image, Text } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";

const NEARBY_CAR_MARKER = require("../assets/images/nearby-car-marker.png");

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
      customMapStyle={DARK_MAP_STYLE}
      userInterfaceStyle="dark"
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
                <View style={styles.vehicleMarkerContainer}>
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
                    fadeDuration={0}
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
                <View style={styles.driverMarkerContainer}>
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
                    fadeDuration={0}
                  />
                </View>
              </Marker>
            );
          })}
    </MapView>
  );
});

const styles = StyleSheet.create({
  driverMarkerContainer: {
    alignItems: "center",
    justifyContent: "center",
    width: 76,
    height: 76,
    overflow: "visible",
  },
  vehicleMarkerContainer: {
    alignItems: "center",
    justifyContent: "center",
    width: 90,
    height: 90,
    overflow: "visible",
  },
  carMarkerImage: {
    width: 28,
    height: 56,
  },
  selectedMarkerGlow: {
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
  },
  onlinePulseDot: {
    position: "absolute",
    top: 6,
    right: 18,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#10B981",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
    zIndex: 10,
  },
  inTripBadge: {
    position: "absolute",
    top: 4,
    right: 16,
    backgroundColor: "#2563EB",
    borderRadius: 8,
    padding: 3,
    borderWidth: 1,
    borderColor: "#FFFFFF",
    zIndex: 10,
  },
  plateTag: {
    backgroundColor: "#111827",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#374151",
    marginBottom: 4,
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
