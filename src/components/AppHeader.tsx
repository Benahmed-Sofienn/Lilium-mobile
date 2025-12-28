// src/components/AppHeader.tsx
import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, SPACING, TYPO } from "../ui/theme";

type Props = {
  title: string;
  titleAr?: string;          // ✅ NEW
  onBack?: () => void;
  rightSlot?: React.ReactNode;
};

export function AppHeader({ title, titleAr, onBack, rightSlot }: Props) {
  return (
    <SafeAreaView edges={["top"]} style={styles.safe}>
      <View style={styles.row}>
        <View style={styles.side}>
          {onBack ? (
            <Pressable onPress={onBack} hitSlop={10} style={styles.iconBtn}>
              <Ionicons name="arrow-back" size={22} color={COLORS.textOnBrand} />
            </Pressable>
          ) : null}
        </View>

        {/* ✅ Title block (2 lines) */}
        <View style={styles.titleWrap}>
          <Text numberOfLines={1} style={styles.title}>
            {title}
          </Text>

          {titleAr ? (
            <Text numberOfLines={1} style={styles.titleAr}>
              {titleAr}
            </Text>
          ) : null}
        </View>

        <View style={styles.side}>{rightSlot}</View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: COLORS.brand,
  },
  row: {
    minHeight: 62,                 // slightly taller for 2 lines
    backgroundColor: COLORS.brand,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
  },
  side: {
    width: 44, // keeps title centered
    alignItems: "flex-start",
    justifyContent: "center",
  },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: "flex-start",
    justifyContent: "center",
  },

  titleWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  title: {
    textAlign: "center",
    fontSize: TYPO.title,
    fontWeight: "800",
    letterSpacing: 1,
    color: COLORS.textOnBrand,
  },
  titleAr: {
    textAlign: "center",
    fontSize: 13,
    fontWeight: "700",
    color: "rgba(255,255,255,0.92)",
    writingDirection: "rtl",
  },
});
