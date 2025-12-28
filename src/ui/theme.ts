// src/ui/theme.ts
import { Platform } from "react-native";

export const COLORS = {
  // Brand
  brand: "#32A137",
  brandDark: "#2A8A2F",
  brandSoft: "rgba(50,161,55,0.12)",

  // Light app surfaces (matches your landing screen feel)
  bg: "#F6F6F6",
  card: "#FFFFFF",
  cardAlt: "#F0F2F2", // subtle section bg inside cards
  border: "#E6E8EC",

  // Text
  text: "#101828",
  textMuted: "#667085",
  textOnBrand: "#FFFFFF",

  // Controls
  inputBg: "#FFFFFF",
  inputBorder: "#D0D5DD",
  
   // ✅ Semantic (ajoute ceci)
  success: "#16A34A",
  warning: "#F59E0B",
  danger: "#DC2626",
};

export const RADIUS = {
  sm: 10,
  md: 14,
  lg: 18,
};

export const SPACING = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
};

export const TYPO = {
  title: 18,
  h2: 16,
  body: 14,
  small: 12,
};

export function cardShadow() {
  // soft, consistent shadow across the app
  return Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOpacity: 0.10,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
    },
    android: { elevation: 3 },
    default: {},
  });
}

export const FIELD = {
  height: 52,
  radius: 14,
  bg: "#FFFFFF",
  border: "#D0D5DD",
  text: "#101828",
  placeholder: "#98A2B3",
};

