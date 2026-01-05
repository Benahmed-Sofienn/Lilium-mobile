// app/(tabs)/bons-sortie/new.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { api } from "../../../src/api/client";
import { AppHeader } from "../../../src/components/AppHeader";
import { AppCard } from "../../../src/components/AppCard";
import { AppSelect, AppSelectOption } from "../../../src/components/AppSelect";
import { COLORS, FIELD, RADIUS, SPACING, TYPO } from "../../../src/ui/theme";

type RefRes = {
  produits: { id: number; label: string }[];
  depots?: { id: string; label: string }[];
};

function digitsOnly(s: string) {
  // no negatives, no decimals
  return (s || "").replace(/[^\d]/g, "");
}

function toNonNegativeInt(s: string) {
  const n = parseInt(digitsOnly(s || "0"), 10);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export default function NewBonSortieScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Referentiels
  const [produits, setProduits] = useState<AppSelectOption[]>([]);
  const [depots, setDepots] = useState<AppSelectOption[]>([
    { id: "principale", label: "Principale | الرئيسية" },
    { id: "delegue", label: "Délégué | مندوب" },
  ]);

  // Form
  const [depot, setDepot] = useState<string>("principale");
  const [brochure, setBrochure] = useState(false);
  const [observation, setObservation] = useState("");

  // Qtt state (keyed by product id)
  const [qttByProduitId, setQttByProduitId] = useState<Record<string, string>>(
    {}
  );

  // Optional search for long product lists
  const [search, setSearch] = useState("");

  const filteredProduits = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return produits;
    return produits.filter((p) => p.label.toLowerCase().includes(q));
  }, [produits, search]);

  const canSubmit = useMemo(() => {
    if (!depot) return false;
    const anyPositive = produits.some((p) => {
      const v = toNonNegativeInt(qttByProduitId[String(p.id)] || "0");
      return v > 0;
    });
    return anyPositive;
  }, [depot, produits, qttByProduitId]);

  const loadRefs = async () => {
    setLoading(true);
    setError(null);
    try {
      // IMPORTANT: bons-sortie (no typo)
      const res = await api.get<RefRes>("/bons-sortie/referentiels");

      const arr = Array.isArray(res.data?.produits) ? res.data.produits : [];
      const opts: AppSelectOption[] = arr
        .map((p) => ({
          id: Number(p.id),
          label: String(p.label || "").trim(),
          keywords: String(p.label || "").toLowerCase(),
        }))
        .filter((p) => Number.isFinite(p.id) && p.id > 0 && p.label);

      setProduits(opts);

      // Depots from backend if provided, else keep defaults
      const depArr = Array.isArray(res.data?.depots) ? res.data.depots : [];
      if (depArr.length) {
        const depOpts = depArr.map((d) => ({
          id: d.id,
          label: d.label,
          keywords: d.label?.toLowerCase(),
        }));
        setDepots(depOpts);
        setDepot(String(depOpts[0]?.id ?? "principale"));
      }

      // Initialize quantities to 0 (preserve existing typed values if reloading)
      setQttByProduitId((prev) => {
        const next: Record<string, string> = { ...prev };
        for (const p of opts) {
          const k = String(p.id);
          if (next[k] === undefined) next[k] = "0";
        }
        // Remove keys for products no longer visible (optional strictness)
        for (const k of Object.keys(next)) {
          if (!opts.some((p) => String(p.id) === k)) delete next[k];
        }
        return next;
      });
    } catch (e) {
      setError(
        "Impossible de charger les produits. Vérifie /api/bons-sortie/referentiels."
      );
      setProduits([]);
      setQttByProduitId({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRefs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setQtt = (produitId: number | string, value: string) => {
    const k = String(produitId);
    const clean = digitsOnly(value);
    setQttByProduitId((prev) => ({ ...prev, [k]: clean === "" ? "" : clean }));
  };

  const bumpQtt = (produitId: number | string, delta: number) => {
    const k = String(produitId);
    setQttByProduitId((prev) => {
      const cur = toNonNegativeInt(prev[k] ?? "0");
      const nextVal = Math.max(0, cur + delta);
      return { ...prev, [k]: String(nextVal) };
    });
  };

  const normalizeOnBlur = (produitId: number | string) => {
    const k = String(produitId);
    setQttByProduitId((prev) => {
      const cur = prev[k];
      if (cur === "" || cur === undefined) return { ...prev, [k]: "0" };
      const n = toNonNegativeInt(cur);
      return { ...prev, [k]: String(n) };
    });
  };

  const submit = async () => {
    if (!canSubmit || saving) return;

    const items = produits
      .map((p) => {
        const qtt = toNonNegativeInt(qttByProduitId[String(p.id)] || "0");
        return { produitId: Number(p.id), qtt };
      })
      .filter((x) => x.qtt > 0);

    if (!items.length) {
      Alert.alert("Erreur", "Au moins un produit avec qtt > 0 est requis.");
      return;
    }

    setSaving(true);
    try {
      await api.post("/bons-sortie", {
        depot,
        brochure,
        observation: observation?.trim() || "",
        items,
      });

      Alert.alert("Succès", "Bon de sortie créé.");
      router.replace("/bons-sortie");
    } catch (e: any) {
      const msg =
        e?.response?.data?.error ||
        e?.response?.data?.erreur ||
        e?.message ||
        "Échec de création du bon de sortie.";
      Alert.alert("Erreur", String(msg));
    } finally {
      setSaving(false);
    }
  };

  const renderHeader = () => (
    <View style={{ padding: SPACING.md, paddingBottom: 0 }}>
      {error ? (
        <AppCard style={{ borderColor: COLORS.danger }}>
          <Text style={styles.errTitle}>Erreur</Text>
          <Text style={styles.errText}>{error}</Text>
          <Pressable onPress={loadRefs} style={styles.retryBtn}>
            <Text style={styles.retryText}>Réessayer | إعادة المحاولة</Text>
          </Pressable>
        </AppCard>
      ) : null}

      <AppCard style={{ marginTop: error ? SPACING.md : 0 }}>
        <Text style={styles.h2}>Paramètres | الإعدادات</Text>

        <View style={{ height: SPACING.md }} />

        <AppSelect
          title="Dépôt"
          titleAr="المخزن"
          value={depot}
          options={depots}
          allowClear={false}
          onChange={(v) => setDepot(String(v || "principale"))}
        />

        <View style={{ height: SPACING.md }} />

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Brochure | كتيّب</Text>
            <Text style={styles.mutedSmall}>
              Par défaut: Non | افتراضيًا: لا
            </Text>
          </View>
          <Switch value={brochure} onValueChange={setBrochure} />
        </View>

        <View style={{ height: SPACING.md }} />

        <Text style={styles.label}>Observation (optionnel) | ملاحظة</Text>
        <TextInput
          value={observation}
          onChangeText={setObservation}
          placeholder="Écrire une observation… | اكتب ملاحظة…"
          placeholderTextColor={COLORS.textMuted}
          style={[styles.input, styles.textArea]}
          multiline
        />
      </AppCard>

      <AppCard style={{ marginTop: SPACING.lg }}>
        <View style={styles.headerRow}>
          <Text style={styles.h2}>Produits | المنتجات</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {produits.length} produit{produits.length > 1 ? "s" : ""}
            </Text>
          </View>
        </View>

      </AppCard>

      <View style={{ height: SPACING.md }} />
    </View>
  );

  const renderFooter = () => (
    <View style={{ padding: SPACING.md, paddingTop: SPACING.md }}>



        <Text style={styles.ruleText}>
          Saisis au moins un produit avec une quantité supperieur à 0 .
          {"\n"}
          أدخل منتجًا واحدًا على الأقل بكمية أكبر من 0.
        </Text>

       <View style={{ height: SPACING.md }} />


      <Pressable
        onPress={submit}
        disabled={!canSubmit || saving}
        style={({ pressed }) => [
          styles.submitBtn,
          (!canSubmit || saving) ? styles.submitBtnDisabled : null,
          pressed && canSubmit && !saving ? { opacity: 0.9 } : null,
        ]}
      >
        {saving ? (
          <ActivityIndicator color={COLORS.textOnBrand} />
        ) : (
          <Ionicons name="checkmark" size={18} color={COLORS.textOnBrand} />
        )}
        <Text style={styles.submitText}>
          {saving ? "Enregistrement…" : "Créer le bon | إنشاء السند"}
        </Text>
      </Pressable>

      <View style={{ height: SPACING.xl }} />
    </View>
  );

  return (
    <View style={styles.screen}>
      <AppHeader
        title="Nouveau bon de sortie"
        titleAr="سند خروج جديد"
        onBack={() => router.back()}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.muted}>Chargement… | جار التحميل…</Text>
        </View>
      ) : (
        <FlatList
          data={filteredProduits}
          keyExtractor={(item) => String(item.id)}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={renderHeader}
          ListFooterComponent={renderFooter}
          contentContainerStyle={{ paddingBottom: 10 }}
          renderItem={({ item }) => {
            const id = String(item.id);
            const qttVal = qttByProduitId[id] ?? "0";

            return (
              <AppCard style={styles.prodCard}>
                <View style={styles.prodRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.prodName} numberOfLines={2}>
                      {item.label}
                    </Text>
                    <Text style={styles.prodHint}>Quantité | الكمية</Text>
                  </View>

                  <View style={styles.stepper}>
                    <Pressable
                      onPress={() => bumpQtt(item.id, -1)}
                      style={styles.stepBtn}
                      hitSlop={8}
                    >
                      <Ionicons name="remove" size={18} color={COLORS.text} />
                    </Pressable>

                    <TextInput
                      value={qttVal}
                      onChangeText={(t) => setQtt(item.id, t)}
                      onBlur={() => normalizeOnBlur(item.id)}
                      keyboardType="number-pad"
                      placeholder="0"
                      placeholderTextColor={COLORS.textMuted}
                      style={styles.qttInput}
                    />

                    <Pressable
                      onPress={() => bumpQtt(item.id, +1)}
                      style={styles.stepBtn}
                      hitSlop={8}
                    >
                      <Ionicons name="add" size={18} color={COLORS.text} />
                    </Pressable>
                  </View>
                </View>
              </AppCard>
            );
          }}
          ListEmptyComponent={
            <View style={{ padding: SPACING.md }}>
              <AppCard>
                <Text style={styles.muted}>
                  Aucun produit disponible. | لا توجد منتجات
                </Text>
              </AppCard>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },

  h2: { fontSize: TYPO.h2, fontWeight: "900", color: COLORS.text },
  label: { fontSize: TYPO.small, fontWeight: "800", color: COLORS.textMuted },
  muted: { color: COLORS.textMuted, fontWeight: "700" },
  mutedSmall: { color: COLORS.textMuted, fontSize: 12, fontWeight: "700" },

  input: {
    borderWidth: 1,
    borderColor: FIELD.border,
    backgroundColor: FIELD.bg,
    borderRadius: FIELD.radius,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontWeight: "800",
    color: COLORS.text,
    marginTop: 6,
  },
  textArea: { minHeight: 90, textAlignVertical: "top" },

  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },

  errTitle: { fontWeight: "900", color: COLORS.danger, marginBottom: 6 },
  errText: { color: COLORS.textMuted, fontWeight: "700" },
  retryBtn: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: "center",
  },
  retryText: { fontWeight: "900", color: COLORS.text },

  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: COLORS.brandSoft,
    borderWidth: 1,
    borderColor: "rgba(50,161,55,0.25)",
  },
  badgeText: { fontWeight: "900", color: COLORS.brand, fontSize: 12 },

  searchBox: {
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

  ruleText: { color: COLORS.textMuted, fontWeight: "700", lineHeight: 18 },

  prodCard: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    padding: SPACING.md, // override AppCard padding for denser lists
  },
  prodRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  prodName: { color: COLORS.text, fontWeight: "900" },
  prodHint: { marginTop: 4, color: COLORS.textMuted, fontWeight: "800", fontSize: 12 },

  stepper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    backgroundColor: COLORS.cardAlt,
    overflow: "hidden",
  },
  stepBtn: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  qttInput: {
    width: 64,
    height: 42,
    textAlign: "center",
    color: COLORS.text,
    fontWeight: "900",
    backgroundColor: FIELD.bg,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
  },

  submitBtn: {
    backgroundColor: COLORS.brand,
    borderRadius: RADIUS.lg,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  submitBtnDisabled: { opacity: 0.55 },
  submitText: { color: COLORS.textOnBrand, fontWeight: "900" },
});
