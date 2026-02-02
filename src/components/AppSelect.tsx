import React, { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, SPACING, TYPO, RADIUS, FIELD } from "../ui/theme";

export type AppSelectOption = {
  id: number | string;
  label: string;
  /** Ligne 2 optionnelle (ex: Wilaya / Commune) */
  subtitle?: string;
  /** Ligne 3 optionnelle (ex: Dernière visite) */
  metaLine?: string;
  /** Optionnel: aide à la recherche */
  keywords?: string;

  /**
   * Optional: per-option border tag (preferred).
   * If set, it overrides the global prop optionRowBorder.
   */
  plan_border?: "none" | "green" | "yellow";
  /**
   * Optional: alternative field name supported (legacy/compat).
   */
  row_border?: "none" | "green" | "yellow";
};

type Props = {
  title: string;
  titleAr?: string;
  placeholder?: string;
  searchPlaceholder?: string;

  value: number | string | null;
  options: AppSelectOption[];

  disabled?: boolean;
  allowClear?: boolean;

  showId?: boolean;
  /** Optional: add colored border on each option row (modal list) */
  optionRowBorder?: "none" | "green" | "yellow";

  onChange: (id: number | string | null) => void;
};

export function AppSelect({
  title,
  titleAr,
  placeholder = "Sélectionner...",
  searchPlaceholder = "Rechercher... | بحث...",
  value,
  options,
  disabled,
  allowClear = true,
  showId = false,
  optionRowBorder = "none",

  onChange,
}: Props) {
  const [open, setOpen] = useState(false);

  // Search query (typed)
  const [q, setQ] = useState("");
  // Debounced query (used for filtering)
  const [debouncedQ, setDebouncedQ] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 120);
    return () => clearTimeout(t);
  }, [q]);

  const selectedOption = useMemo(() => {
    if (value === null || value === undefined) return null;
    return options.find((o) => String(o.id) === String(value)) ?? null;
  }, [options, value]);

  const filtered = useMemo(() => {
    const query = debouncedQ.trim().toLowerCase();
    if (!query) return options;

    return options.filter((o) => {
      const hay =
        `${o.label} ${o.subtitle ?? ""} ${o.metaLine ?? ""} ${o.keywords ?? ""}`.toLowerCase();

      return hay.includes(query);
    });
  }, [options, debouncedQ]);

  const openModal = () => {
    if (disabled) return;
    setQ("");
    setOpen(true);
  };

  const commitChange = (next: number | string | null) => {
    // Close first => Android modal transition stable, then update parent
    setOpen(false);
    requestAnimationFrame(() => onChange(next));
  };

  return (
    <>
      <Pressable
        onPress={openModal}
        style={[styles.select, disabled ? styles.selectDisabled : null]}
        accessibilityRole="button"
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.selectLabel}>
            {titleAr ? `${title} | ${titleAr}` : title}
          </Text>

          <Text
            style={[
              styles.selectValue,
              !selectedOption ? styles.selectPlaceholder : null,
            ]}
            numberOfLines={2}
          >
            {selectedOption ? (
              <>
                {showId ? (
                  <Text style={styles.idText}>{String(selectedOption.id)} </Text>
                ) : null}
                <Text>
                  {showId ? `- ${selectedOption.label}` : selectedOption.label}
                </Text>
                {selectedOption.subtitle ? (
                  <Text
                    style={styles.subtitleText}
                  >{`\n${selectedOption.subtitle}`}</Text>
                ) : null}

                {selectedOption.metaLine ? (
                  <Text
                    style={styles.metaLineText}
                  >{`\n${selectedOption.metaLine}`}</Text>
                ) : null}
              </>
            ) : (
              placeholder
            )}
          </Text>
        </View>

        <Ionicons name="chevron-down" size={18} color={COLORS.textMuted} />
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView style={styles.modalRoot}>
          <View style={styles.modalHeader}>
            <Pressable
              onPress={() => setOpen(false)}
              style={styles.iconBtn}
              hitSlop={10}
            >
              <Ionicons name="close" size={22} color={COLORS.text} />
            </Pressable>

            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={styles.modalTitle}>{title}</Text>
              {titleAr ? <Text style={styles.modalTitleAr}>{titleAr}</Text> : null}
            </View>

            {allowClear ? (
              <Pressable
                onPress={() => commitChange(null)}
                style={styles.modalClear}
                hitSlop={10}
              >
                <Text style={styles.modalClearText}>Effacer | مسح</Text>
              </Pressable>
            ) : (
              <View style={{ width: 80 }} />
            )}
          </View>

          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={COLORS.textMuted} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder={searchPlaceholder}
              placeholderTextColor={COLORS.textMuted}
              style={styles.searchInput}
              autoCorrect={false}
              autoCapitalize="none"
              clearButtonMode="while-editing"
            />
          </View>

          <FlatList
            data={filtered}
            extraData={value}
            keyExtractor={(item) => String(item.id)}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={18}
            maxToRenderPerBatch={24}
            windowSize={8}
            removeClippedSubviews={Platform.OS === "android"}
            contentContainerStyle={{ padding: 14, paddingBottom: 28 }}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            renderItem={({ item }) => {
              const isSelected = String(item.id) === String(value);

              // NEW: per-option border tag, fallback to global prop
              const rowBorder =
                (item as any)?.plan_border ?? (item as any)?.row_border ?? optionRowBorder;

              return (
                <Pressable
                  onPress={() => commitChange(item.id)}
                  style={[
                    styles.optionRow,
                    rowBorder === "green" ? styles.optionRowBorderGreen : null,
                    rowBorder === "yellow" ? styles.optionRowBorderYellow : null,
                    isSelected ? styles.optionRowSelected : null,
                  ]}
                >
                  <View style={styles.optionLeft}>
                    {showId ? (
                      <View style={styles.idPill}>
                        <Text style={styles.idPillText}>{String(item.id)}</Text>
                      </View>
                    ) : null}

                    <View style={{ flex: 1 }}>
                      <Text style={styles.optionLabel} numberOfLines={2}>
                        {item.label}
                      </Text>
                      {item.subtitle ? (
                        <Text style={styles.optionSub} numberOfLines={1}>
                          {item.subtitle}
                        </Text>
                      ) : null}
                      {item.metaLine ? (
                        <Text style={styles.optionMeta} numberOfLines={1}>
                          {item.metaLine}
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  {isSelected ? (
                    <Ionicons name="checkmark" size={20} color={COLORS.brand} />
                  ) : null}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View style={{ paddingTop: 24 }}>
                <Text style={{ color: COLORS.textMuted }}>
                  Aucun résultat. | لا نتائج
                </Text>
              </View>
            }
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // Trigger
  select: {
    borderWidth: 1,
    borderColor: FIELD.border,
    borderRadius: FIELD.radius,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: FIELD.bg,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  selectDisabled: { opacity: 0.6 },
  selectLabel: {
    fontSize: TYPO.small,
    fontWeight: "800",
    color: COLORS.textMuted,
  },
  selectValue: {
    fontSize: 14,
    fontWeight: "900",
    color: COLORS.text,
    marginTop: 2,
  },
  selectPlaceholder: { color: COLORS.textMuted, fontWeight: "800" },

  // Modal
  modalRoot: { flex: 1, backgroundColor: COLORS.bg },
  modalHeader: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: { fontWeight: "900", color: COLORS.text, fontSize: 16 },
  modalTitleAr: {
    marginTop: 2,
    fontWeight: "700",
    color: COLORS.textMuted,
    writingDirection: "rtl",
  },
  modalClear: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalClearText: { color: COLORS.text, fontWeight: "900", fontSize: 12 },

  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  searchBox: {
    margin: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: COLORS.card,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchInput: { flex: 1, color: COLORS.text, fontWeight: "800" },

  optionRow: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  optionRowSelected: {
    borderColor: "rgba(50,161,55,0.35)",
    backgroundColor: COLORS.brandSoft,
  },
  optionText: { flex: 1, color: COLORS.text, fontWeight: "900" },
  sep: { height: SPACING.md },

  idText: { color: COLORS.brand, fontWeight: "900" },
  subtitleText: { color: COLORS.textMuted, fontWeight: "800" },

  optionLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },

  idPill: {
    minWidth: 42,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: COLORS.brandSoft,
    borderWidth: 1,
    borderColor: "rgba(50,161,55,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  idPillText: { color: COLORS.brand, fontWeight: "900" },

  optionLabel: { color: COLORS.text, fontWeight: "900" },
  optionSub: {
    marginTop: 3,
    color: COLORS.textMuted,
    fontWeight: "800",
    fontSize: 12,
  },

  metaLineText: {
    color: COLORS.warning, // or brand / info color
    fontWeight: "800",
    fontSize: 12,
  },

  optionMeta: {
    marginTop: 2,
    color: COLORS.warning,
    fontWeight: "700",
    fontSize: 11,
  },

  optionRowBorderGreen: {
    borderWidth: 2,
    borderColor: "rgba(50,161,55,0.85)",
  },
  optionRowBorderYellow: {
    borderWidth: 2,
    borderColor: "rgba(245, 206, 11, 0.9)",
  },
});
