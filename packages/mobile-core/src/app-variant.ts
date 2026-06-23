import Constants from "expo-constants";
import { resolveAppVariant } from "./app-variant-resolver";

export type AppVariant = "mixed" | "driver" | "client";

export function getAppVariant(): AppVariant {
  return resolveAppVariant(
    process.env.EXPO_PUBLIC_APP_VARIANT,
    Constants.expoConfig?.extra?.appVariant,
  );
}

export function usesRoleSelect(variant = getAppVariant()): boolean {
  return variant === "mixed";
}

export function getAuthenticatedHomeRoute(variant = getAppVariant()): "/role-select" | "/client" | "/chauffeur" {
  if (variant === "client") return "/client";
  if (variant === "driver") return "/chauffeur";
  return "/role-select";
}
