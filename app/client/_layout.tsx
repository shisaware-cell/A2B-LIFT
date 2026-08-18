// expo-glass-effect requires a custom native build — disabled for Expo Go
const isLiquidGlassAvailable = () => false;
import { Tabs } from "expo-router";
import { NativeTabs, Icon, Label } from "expo-router/unstable-native-tabs";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Colors } from "@mobile-ui/colors";

function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "car", selected: "car.fill" }} />
        <Label>Ride</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="trips">
        <Icon sf={{ default: "clock", selected: "clock.fill" }} />
        <Label>Trips</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="wallet">
        <Icon sf={{ default: "wallet.pass", selected: "wallet.pass.fill" }} />
        <Label>Wallet</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="pay-later">
        <Icon sf={{ default: "creditcard", selected: "creditcard.fill" }} />
        <Label>Pay Later</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <Icon sf={{ default: "person", selected: "person.fill" }} />
        <Label>Profile</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const isWeb = Platform.OS === "web";
  const isIOS = Platform.OS === "ios";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.white,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          position: "absolute" as const,
          backgroundColor: isIOS ? "transparent" : Colors.card,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: Colors.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.card }]} />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Ride",
          tabBarIcon: ({ color, size }) => <Ionicons name="car-sport" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="trips"
        options={{
          title: "Trips",
          tabBarIcon: ({ color, size }) => <Ionicons name="time" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: "Wallet",
          tabBarIcon: ({ color, size }) => <Ionicons name="wallet" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="pay-later"
        options={{
          title: "Pay Later",
          tabBarIcon: ({ color, size }) => <Ionicons name="card" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
        }}
      />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="referrals" options={{ href: null }} />
      <Tabs.Screen name="safety" options={{ href: null }} />
      <Tabs.Screen name="help" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="lift-club" options={{ href: null }} />
      <Tabs.Screen name="chat" options={{ href: null, tabBarStyle: { display: "none" } }} />
    </Tabs>
  );
}

export default function ClientLayout() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
