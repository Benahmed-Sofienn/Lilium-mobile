// src/components/PickerField.tsx
import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { COLORS, FIELD, SPACING, TYPO } from "../ui/theme";

type Item = { label: string; value: string };

export function PickerField({
  label,
  value,
  items,
  onChange,
}: {
  label?: string;
  value: string;
  items: Item[];
  onChange: (v: string) => void;
}) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <View style={styles.wrap}>
        <Picker
          selectedValue={value}
          onValueChange={(v) => onChange(String(v))}
          style={styles.picker}
          dropdownIconColor={COLORS.textMuted}
          mode="dropdown"
        >
          {items.map((it) => (
            <Picker.Item
              key={it.value}
              label={it.label}
              value={it.value}
              color={COLORS.text} // important: readable selected text
            />
          ))}
        </Picker>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: TYPO.small,
    fontWeight: "700",
    color: COLORS.text,
    marginLeft: 2,
  },
  wrap: {
    height: FIELD.height,
    borderRadius: FIELD.radius,
    backgroundColor: FIELD.bg,
    borderWidth: 1,
    borderColor: FIELD.border,
    overflow: "hidden",
    justifyContent: "center",
    paddingHorizontal: Platform.OS === "android" ? 6 : 0,
  },
  picker: {
    color: COLORS.text,
    width: "100%",
    height: FIELD.height,
  },
});
