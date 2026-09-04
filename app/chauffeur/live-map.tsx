import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  TextInput,
  Image,
  ScrollView,
  Modal,
  Linking,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { apiRequest } from "@/lib/query-client";
import Colors from "@/constants/colors";
import { FleetMap, FleetMapRef } from "@/components/FleetMap";

// Johannesburg default center
const DEFAULT_MAP_CENTER = {
  latitude: -26.2041,
  longitude: 28.0473,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
};

export default function FleetLiveMapScreen() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<FleetMapRef>(null);

  const [filterType, setFilterType] = useState<"Driver" | "Vehicle">("Driver");
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDemandBadge, setShowDemandBadge] = useState(true);
  const [showListDrawer, setShowListDrawer] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);

  const [fleetData, setFleetData] = useState<{
    drivers: any[];
    vehicles: any[];
    totalDrivers: number;
    onlineDrivers: number;
    inTripDrivers: number;
    totalVehicles: number;
  }>({
    drivers: [],
    vehicles: [],
    totalDrivers: 0,
    onlineDrivers: 0,
    inTripDrivers: 0,
    totalVehicles: 0,
  });
  const [loading, setLoading] = useState(true);
  const [operatorProfile, setOperatorProfile] = useState<any>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    apiRequest("GET", "/api/operator-profile/me")
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setOperatorProfile(data.profile || null);
        }
      })
      .catch(() => {})
      .finally(() => setProfileLoading(false));
  }, []);

  async function fetchLiveFleet() {
    try {
      const res = await apiRequest("GET", "/api/fleet/live-locations");
      if (res.ok) {
        const data = await res.json();
        setFleetData(data);
      }
    } catch {
      // transient network failure
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchLiveFleet();
    const interval = setInterval(fetchLiveFleet, 5000);
    return () => clearInterval(interval);
  }, []);

  const filteredDrivers = useMemo(() => {
    const list = fleetData.drivers || [];
    if (!searchQuery.trim()) return list;
    const q = searchQuery.trim().toLowerCase();
    return list.filter((d: any) => {
      const haystack = [d.name, d.phone, d.vehicle?.make, d.vehicle?.model, d.vehicle?.plateNumber]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [fleetData.drivers, searchQuery]);

  const filteredVehicles = useMemo(() => {
    const list = fleetData.vehicles || [];
    if (!searchQuery.trim()) return list;
    const q = searchQuery.trim().toLowerCase();
    return list.filter((v: any) => {
      const haystack = [v.make, v.model, v.plateNumber, v.assignedDriver?.name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [fleetData.vehicles, searchQuery]);

  function zoomIn() {
    mapRef.current?.zoomIn();
  }

  function zoomOut() {
    mapRef.current?.zoomOut();
  }

  function focusOnLocation(lat: number, lng: number) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    mapRef.current?.animateToRegion(
      {
        latitude: lat,
        longitude: lng,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      },
      600
    );
  }

  function callDriver(phone?: string | null) {
    if (!phone) {
      Alert.alert("No phone number", "This driver has no phone number on file.");
      return;
    }
    Linking.openURL(`tel:${phone}`).catch(() => Alert.alert("Could not start call", phone));
  }

  const isApprovedPartner = operatorProfile?.type === "partner" && operatorProfile?.status === "approved";

  if (!profileLoading && !isApprovedPartner) {
    return (
      <View style={[styles.container, styles.restrictedCenter, { paddingTop: insets.top + 40 }]}>
        <View style={styles.restrictedIconWrap}>
          <Ionicons name="business-outline" size={44} color="#111827" />
        </View>
        <Text style={styles.restrictedTitle}>Partner Access Required</Text>
        <Text style={styles.restrictedDesc}>
          Live GPS Fleet Tracking is exclusively available to approved A2B fleet partners.
        </Text>
        <Pressable
          style={styles.restrictedBackBtn}
          onPress={() => router.replace("/chauffeur" as never)}
        >
          <Text style={styles.restrictedBackBtnText}>Back to Dashboard</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ─── Full-Screen Interactive Map ─── */}
      <FleetMap
        ref={mapRef}
        mode={filterType}
        drivers={filteredDrivers}
        vehicles={filteredVehicles}
        selectedItem={selectedItem}
        onSelectDriver={(driver) => setSelectedItem(driver)}
        onSelectVehicle={(vehicle) => setSelectedItem(vehicle)}
        initialRegion={DEFAULT_MAP_CENTER}
      />

      {/* ─── Header & Top Control Bar (Image 2 reference) ─── */}
      <View style={[styles.topOverlay, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 10) }]}>
        {/* Top Header */}
        <View style={styles.headerRow}>
          <Pressable
            style={styles.menuBtn}
            onPress={() => router.back()}
            accessibilityLabel="Back"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.headerTitle}>Live Map</Text>
          
          {/* Live Demand Badge (Top Right next to title) */}
          <View style={styles.headerDemandBadge}>
            <View style={styles.headerDemandIconWrap}>
              <Ionicons name="flame" size={14} color="#FFFFFF" />
            </View>
            <Text style={styles.headerDemandText}>Live Demand</Text>
          </View>
        </View>

        {/* Search & Filter Bar */}
        <View style={styles.controlsRow}>
          {/* Dropdown Filter Pill */}
          <Pressable
            style={styles.filterDropdownBtn}
            onPress={() => setShowFilterDropdown((v) => !v)}
            accessibilityLabel="Select Filter"
          >
            <Text style={styles.filterDropdownText}>{filterType}</Text>
            <Ionicons name="chevron-down" size={16} color="#FFFFFF" />
          </Pressable>

          {/* Search Input */}
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color="#9CA3AF" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder={filterType === "Driver" ? "Search driver name or phone..." : "Search plate, make, model..."}
              placeholderTextColor="#6B7280"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCorrect={false}
            />
            <Ionicons name="options-outline" size={18} color="#9CA3AF" />
          </View>
        </View>

        {/* Dropdown Menu Modal */}
        {showFilterDropdown && (
          <View style={styles.dropdownMenu}>
            <Pressable
              style={[styles.dropdownMenuItem, filterType === "Driver" && styles.dropdownMenuItemActive]}
              onPress={() => {
                setFilterType("Driver");
                setSelectedItem(null);
                setSearchQuery("");
                setShowFilterDropdown(false);
              }}
            >
              <Text style={[styles.dropdownItemText, filterType === "Driver" && styles.dropdownItemTextActive]}>
                Driver
              </Text>
            </Pressable>
            <Pressable
              style={[styles.dropdownMenuItem, filterType === "Vehicle" && styles.dropdownMenuItemActive]}
              onPress={() => {
                setFilterType("Vehicle");
                setSelectedItem(null);
                setSearchQuery("");
                setShowFilterDropdown(false);
              }}
            >
              <Text style={[styles.dropdownItemText, filterType === "Vehicle" && styles.dropdownItemTextActive]}>
                Vehicle
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* ─── Zoom Controls (Bottom Right) ─── */}
      <View style={[styles.zoomControlsContainer, { bottom: insets.bottom + 90 }]}>
        <Pressable style={styles.zoomBtn} onPress={zoomIn} accessibilityLabel="Zoom In">
          <Ionicons name="add" size={24} color="#FFFFFF" />
        </Pressable>
        <View style={styles.zoomDivider} />
        <Pressable style={styles.zoomBtn} onPress={zoomOut} accessibilityLabel="Zoom Out">
          <Ionicons name="remove" size={24} color="#FFFFFF" />
        </Pressable>
      </View>

      {/* ─── Bottom Floating Action Pill (Image 2 reference) ─── */}
      <View style={[styles.bottomPillContainer, { bottom: insets.bottom + 20 }]}>
        <Pressable
          style={styles.floatingPillBtn}
          onPress={() => setShowListDrawer(true)}
          accessibilityLabel={`View ${filterType}s`}
        >
          <Ionicons name={filterType === "Driver" ? "person" : "car"} size={18} color="#FFFFFF" />
          <Text style={styles.floatingPillText}>
            {filterType === "Driver"
              ? `Drivers (${fleetData.onlineDrivers}/${fleetData.totalDrivers})`
              : `Vehicles (${fleetData.totalVehicles})`}
          </Text>
        </Pressable>
      </View>

      {/* ─── Selected Driver / Vehicle Bottom Card ─── */}
      {selectedItem && (() => {
        const isVehicle = filterType === "Vehicle" || (!selectedItem.phone && selectedItem.plateNumber);
        if (isVehicle) {
          const vehicleMake = selectedItem.make || selectedItem.carMake || "";
          const vehicleModel = selectedItem.model || selectedItem.vehicleModel || "";
          const vehiclePlate = selectedItem.plateNumber || "";
          const vehicleLabel = [vehicleMake, vehicleModel].filter(Boolean).join(" ").trim() || (vehiclePlate ? "Vehicle" : "Fleet Vehicle");
          const assignedDriverName = selectedItem.assignedDriver?.name;
          const assignedDriverPhone = selectedItem.assignedDriver?.phone;
          const lat = selectedItem.lat || selectedItem.assignedDriver?.lat;
          const lng = selectedItem.lng || selectedItem.assignedDriver?.lng;

          return (
            <View style={[styles.selectedCard, { bottom: insets.bottom + 80 }]}>
              <View style={styles.selectedCardHeader}>
                <View style={styles.selectedAvatarPlaceholder}>
                  <Ionicons name="car" size={22} color="#111827" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.selectedName}>{vehicleLabel}</Text>
                  <Text style={styles.selectedSub}>
                    {vehiclePlate ? `Plate: ${vehiclePlate}` : "Registered Vehicle"}
                    {selectedItem.color ? ` · ${selectedItem.color}` : ""}
                    {selectedItem.category ? ` · ${selectedItem.category}` : ""}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    selectedItem.assignedDriver
                      ? { backgroundColor: "#D1FAE5" }
                      : { backgroundColor: "#F3F4F6" },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusBadgeText,
                      selectedItem.assignedDriver
                        ? { color: "#047857" }
                        : { color: "#6B7280" },
                    ]}
                  >
                    {selectedItem.assignedDriver ? "Assigned" : "Unassigned"}
                  </Text>
                </View>
                <Pressable onPress={() => setSelectedItem(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={20} color="#9CA3AF" />
                </Pressable>
              </View>

              {assignedDriverName ? (
                <View style={styles.activeRideBox}>
                  <Ionicons name="person" size={14} color="#1D4ED8" />
                  <Text style={styles.activeRideText} numberOfLines={1}>
                    Driver: {assignedDriverName} ({selectedItem.assignedDriver.status === "in_trip" ? "In Trip" : selectedItem.assignedDriver.status === "online" ? "Online" : "Offline"})
                  </Text>
                </View>
              ) : null}

              <View style={styles.selectedActionsRow}>
                {assignedDriverPhone ? (
                  <Pressable style={styles.actionCallBtn} onPress={() => callDriver(assignedDriverPhone)}>
                    <Ionicons name="call" size={16} color="#FFFFFF" />
                    <Text style={styles.actionCallText}>Call Driver</Text>
                  </Pressable>
                ) : null}
                {lat && lng ? (
                  <Pressable style={styles.actionLocateBtn} onPress={() => focusOnLocation(lat, lng)}>
                    <Ionicons name="locate" size={16} color="#000000" />
                    <Text style={styles.actionLocateText}>Center Map</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        }

        // Driver card
        const vehicleMake = selectedItem.vehicle?.make || selectedItem.vehicle?.carMake || selectedItem.carMake || "";
        const vehicleModel = selectedItem.vehicle?.model || selectedItem.vehicle?.vehicleModel || selectedItem.vehicleModel || "";
        const vehiclePlate = selectedItem.vehicle?.plateNumber || selectedItem.plateNumber || "";
        const vehicleLabel = [vehicleMake, vehicleModel].filter(Boolean).join(" ").trim() || (vehiclePlate ? "Vehicle" : "No vehicle assigned");
        const vehicleDisplay = vehiclePlate ? `${vehicleLabel} (${vehiclePlate})` : vehicleLabel;

        return (
          <View style={[styles.selectedCard, { bottom: insets.bottom + 80 }]}>
            <View style={styles.selectedCardHeader}>
              {selectedItem.profilePhoto ? (
                <Image source={{ uri: selectedItem.profilePhoto }} style={styles.selectedAvatar} />
              ) : (
                <View style={styles.selectedAvatarPlaceholder}>
                  <Ionicons name="person" size={20} color="#6B7280" />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.selectedName}>{selectedItem.name}</Text>
                <Text style={styles.selectedSub}>{vehicleDisplay}</Text>
              </View>
              <View
                style={[
                  styles.statusBadge,
                  selectedItem.status === "in_trip"
                    ? { backgroundColor: "#DBEAFE" }
                    : selectedItem.status === "online"
                    ? { backgroundColor: "#D1FAE5" }
                    : { backgroundColor: "#F3F4F6" },
                ]}
              >
                <Text
                  style={[
                    styles.statusBadgeText,
                    selectedItem.status === "in_trip"
                      ? { color: "#1D4ED8" }
                      : selectedItem.status === "online"
                      ? { color: "#047857" }
                      : { color: "#6B7280" },
                  ]}
                >
                  {selectedItem.status === "in_trip"
                    ? "In Trip"
                    : selectedItem.status === "online"
                    ? "Online"
                    : "Offline"}
                </Text>
              </View>
              <Pressable onPress={() => setSelectedItem(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={20} color="#9CA3AF" />
              </Pressable>
            </View>

            {selectedItem.activeRide && (
              <View style={styles.activeRideBox}>
                <Ionicons name="navigate" size={14} color="#1D4ED8" />
                <Text style={styles.activeRideText} numberOfLines={1}>
                  {selectedItem.activeRide.dropoffAddress || "Active trip in progress"}
                </Text>
              </View>
            )}

            <View style={styles.selectedActionsRow}>
              {selectedItem.phone ? (
                <Pressable style={styles.actionCallBtn} onPress={() => callDriver(selectedItem.phone)}>
                  <Ionicons name="call" size={16} color="#FFFFFF" />
                  <Text style={styles.actionCallText}>Call Driver</Text>
                </Pressable>
              ) : null}
              {selectedItem.lat && selectedItem.lng ? (
                <Pressable
                  style={styles.actionLocateBtn}
                  onPress={() => focusOnLocation(selectedItem.lat, selectedItem.lng)}
                >
                  <Ionicons name="locate" size={16} color="#FFFFFF" />
                  <Text style={styles.actionLocateText}>Center Map</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        );
      })()}

      {/* ─── Full List Drawer Modal ─── */}
      <Modal visible={showListDrawer} animationType="slide" transparent onRequestClose={() => setShowListDrawer(false)}>
        <View style={styles.drawerOverlay}>
          <View style={[styles.drawerSheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.drawerHeader}>
              <Text style={styles.drawerTitle}>{filterType === "Driver" ? "Fleet Drivers" : "Fleet Vehicles"}</Text>
              <Pressable onPress={() => setShowListDrawer(false)}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </Pressable>
            </View>

            <ScrollView style={styles.drawerList}>
              {filterType === "Driver"
                ? filteredDrivers.map((driver: any) => {
                    const vehicleMake = driver.vehicle?.make || driver.vehicle?.carMake || "";
                    const vehicleModel = driver.vehicle?.model || driver.vehicle?.vehicleModel || "";
                    const vehiclePlate = driver.vehicle?.plateNumber || "";
                    const vehicleLabel = [vehicleMake, vehicleModel].filter(Boolean).join(" ").trim() || (vehiclePlate ? "Vehicle" : "No vehicle linked");
                    const vehicleDisplay = vehiclePlate ? `${vehicleLabel} · ${vehiclePlate}` : vehicleLabel;

                    return (
                      <Pressable
                        key={driver.id}
                        style={styles.drawerItem}
                        onPress={() => {
                          setShowListDrawer(false);
                          setSelectedItem(driver);
                          if (driver.lat && driver.lng) focusOnLocation(driver.lat, driver.lng);
                        }}
                      >
                        {driver.profilePhoto ? (
                          <Image source={{ uri: driver.profilePhoto }} style={styles.drawerAvatar} />
                        ) : (
                          <View style={styles.drawerAvatarPlaceholder}>
                            <Ionicons name="person" size={18} color="#6B7280" />
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={styles.drawerItemName}>{driver.name}</Text>
                          <Text style={styles.drawerItemSub}>{vehicleDisplay}</Text>
                        </View>
                        <View
                          style={[
                            styles.statusBadge,
                            driver.status === "in_trip"
                              ? { backgroundColor: "#DBEAFE" }
                              : driver.status === "online"
                              ? { backgroundColor: "#D1FAE5" }
                              : { backgroundColor: "#F3F4F6" },
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusBadgeText,
                              driver.status === "in_trip"
                                ? { color: "#1D4ED8" }
                                : driver.status === "online"
                                ? { color: "#047857" }
                                : { color: "#6B7280" },
                            ]}
                          >
                            {driver.status === "in_trip"
                              ? "In Trip"
                              : driver.status === "online"
                              ? "Online"
                              : "Offline"}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })
                : filteredVehicles.map((vehicle: any) => {
                    const vehicleMake = vehicle.make || vehicle.carMake || "";
                    const vehicleModel = vehicle.model || vehicle.vehicleModel || "";
                    const vehicleLabel = [vehicleMake, vehicleModel].filter(Boolean).join(" ").trim() || "Vehicle";
                    const lat = vehicle.lat || vehicle.assignedDriver?.lat;
                    const lng = vehicle.lng || vehicle.assignedDriver?.lng;

                    return (
                      <Pressable
                        key={vehicle.id}
                        style={styles.drawerItem}
                        onPress={() => {
                          setShowListDrawer(false);
                          setSelectedItem(vehicle);
                          if (lat && lng) {
                            focusOnLocation(lat, lng);
                          }
                        }}
                      >
                        <View style={styles.vehicleIconWrap}>
                          <Ionicons name="car" size={20} color="#FFFFFF" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.drawerItemName}>{vehicleLabel}</Text>
                          <Text style={styles.drawerItemSub}>
                            {vehicle.plateNumber} · {vehicle.color || ""} · {vehicle.category || ""}
                          </Text>
                          <Text style={[styles.drawerItemSub, { color: "#059669", marginTop: 2 }]}>
                            Driver: {vehicle.assignedDriver?.name || "Unassigned"}
                            {vehicle.assignedDriver ? ` · ${vehicle.assignedDriver.status === "in_trip" ? "In Trip" : vehicle.assignedDriver.status === "online" ? "Online" : "Offline"}` : ""}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B0C10" },

  // Top Overlay & Header (Image 2 reference)
  topOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    zIndex: 20,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  menuBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(20, 22, 29, 0.9)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    letterSpacing: -0.3,
  },

  // Search & Filter Row
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  filterDropdownBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#14161D",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  filterDropdownText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#14161D",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 24,
    paddingHorizontal: 16,
    height: 48,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: "#FFFFFF",
  },

  // Dropdown Menu
  dropdownMenu: {
    position: "absolute",
    top: 120,
    left: 16,
    backgroundColor: "#14161D",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: 16,
    paddingVertical: 8,
    width: 140,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 30,
  },
  dropdownMenuItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  dropdownMenuItemActive: {
    backgroundColor: "#1B1E28",
  },
  dropdownItemText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: "#9CA3AF",
  },
  dropdownItemTextActive: {
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },

  // Live Demand Header Badge
  headerDemandBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(20, 22, 29, 0.9)",
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 10,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.35)",
  },
  headerDemandIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
  },
  headerDemandText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },

  // Access Restricted View
  restrictedCenter: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    backgroundColor: "#0B0C10",
  },
  restrictedIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#14161D",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  restrictedTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    marginBottom: 8,
  },
  restrictedDesc: {
    color: "#9CA3AF",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  restrictedBackBtn: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: "center",
  },
  restrictedBackBtnText: {
    color: "#0B0C10",
    fontFamily: "Inter_700Bold",
    fontSize: 14,
  },

  // Zoom Controls (Image 2 reference)
  zoomControlsContainer: {
    position: "absolute",
    right: 16,
    backgroundColor: "#14161D",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 10,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
    overflow: "hidden",
  },
  zoomBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  zoomDivider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },

  // Bottom Floating Pill (Image 2 reference)
  bottomPillContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  floatingPillBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#14161D",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: 28,
    paddingVertical: 14,
    paddingHorizontal: 24,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  floatingPillText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },

  // Selected Item Card
  selectedCard: {
    position: "absolute",
    left: 16,
    right: 16,
    backgroundColor: "#14161D",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 18,
    padding: 16,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
    gap: 12,
  },
  selectedCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  selectedAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  selectedAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#1B1E28",
    alignItems: "center",
    justifyContent: "center",
  },
  selectedName: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },
  selectedSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#9CA3AF",
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  activeRideBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(30, 58, 138, 0.3)",
    borderWidth: 1,
    borderColor: "rgba(59, 130, 246, 0.35)",
    borderRadius: 10,
    padding: 10,
  },
  activeRideText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#60A5FA",
  },
  selectedActionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  actionCallBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#10B981",
    borderRadius: 12,
    paddingVertical: 12,
  },
  actionCallText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },
  actionLocateBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#1B1E28",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 12,
    paddingVertical: 12,
  },
  actionLocateText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },

  // Drawer
  drawerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  drawerSheet: {
    backgroundColor: "#14161D",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    maxHeight: "75%",
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  drawerTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },
  drawerList: {
    marginBottom: 10,
  },
  drawerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
  },
  drawerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  drawerAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#1B1E28",
    alignItems: "center",
    justifyContent: "center",
  },
  drawerItemName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },
  drawerItemSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#9CA3AF",
    marginTop: 2,
  },
  vehicleIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#1B1E28",
    alignItems: "center",
    justifyContent: "center",
  },
});
