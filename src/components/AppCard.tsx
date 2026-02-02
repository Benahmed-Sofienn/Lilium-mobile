// src/components/AppCard.tsx
import React from "react";
import { View, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { COLORS, RADIUS, SPACING, cardShadow } from "../ui/theme";

export function AppCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...cardShadow(),
  },
});
