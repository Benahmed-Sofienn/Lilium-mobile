// app/(tabs)/rapports/new-step2.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
} from "react-native";

import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { AppSelect, type AppSelectOption } from "../../../src/components/AppSelect";

import { api } from "../../../src/api/client";
import { AppHeader } from "../../../src/components/AppHeader";
import { AppCard } from "../../../src/components/AppCard";
import { COLORS, SPACING, TYPO, RADIUS, FIELD } from "../../../src/ui/theme";



type ProductDraft = {
  _key: string;              // stable React key
  produit_id: number | null;
  rentabilite: number;       // 0..5
  note: string;
};

type VisitDraft = {
  _key: string;              // stable React key
  medecin_id: number | null;
  products: ProductDraft[];
};

const RENTABILITE_OPTIONS: AppSelectOption[] = [
  { id: 0, label: "Première visite (connaît) | زيارة أولى للطبيب" },
  { id: 1, label: "Utilise beaucoup (ambassadeur) | يستعمل منتوجاتنا بكثرة" },
  { id: 2, label: "Utilise nos produits + concurrents | يستعمل منتوجاتنا و المنافسة" },
  { id: 3, label: "Premier essai (utilise un peu) | وصف للمرة الاولى و بشكل ضعيف" },
  { id: 4, label: "Évalue | (يقيم) يقول يكتب و لا توجد وصفات" },
  { id: 5, label: "S'intéresse (visite mais pas de prescription) | مهتم ( تمت الزيارة و لا يوجد وصف )" },
];





const makeKey = () => `${Date.now()}_${Math.random().toString(16).slice(2)}`;

const makeEmptyProduct = (): ProductDraft => ({
  _key: makeKey(),
  produit_id: null,
  rentabilite: 0,
  note: "",
});

const makeEmptyVisit = (): VisitDraft => ({
  _key: makeKey(),
  medecin_id: null,
  products: [],
});



function toInt(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}



export default function RapportPhase2() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ rapportId?: string }>();


  const [loadingRefs, setLoadingRefs] = useState(true);
  const [medecins, setMedecins] = useState<AppSelectOption[]>([]);
  const [produits, setProduits] = useState<AppSelectOption[]>([]);
  const [reloadTick, setReloadTick] = useState(0);

  const [visits, setVisits] = useState<VisitDraft[]>([makeEmptyVisit()]);
  const [openVisitIdx, setOpenVisitIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const medecinLabelById = useMemo(() => {
    const m = new Map<number, string>();
    medecins.forEach((x) => {
  const key = Number(x.id);
  const v = x.subtitle ? `${x.label} — ${x.subtitle}` : x.label;
  m.set(key, v);
});
 
    return m;
  }, [medecins]);

  useEffect(() => {
  const load = async () => {
    setLoadingRefs(true);
    try {
      const res = await api.get(`/rapports/referentiels`);
      const data = res?.data || {};

      const rawMedecins =
        data.medecins ??
        data.doctors ??
        data.refs?.medecins ??
        data.references?.medecins ??
        [];

      const rawProduits =
        data.produits ??
        data.products ??
        data.refs?.produits ??
        data.refs?.products ??
        data.references?.produits ??
        data.references?.products ??
        [];

      const buildMedLabel = (x: any) => {
        const nom = String(x.label ?? x.name ?? x.nom ?? "").trim();
        const w = String(x.wilaya ?? x.wilayaNom ?? "").trim();
        const c = String(x.commune ?? x.communeNom ?? "").trim();
        const region = [w, c].filter(Boolean).join(" / ");
        return region ? `${nom} — ${region}` : nom;
      };

      setMedecins(
  (rawMedecins || [])
    .map((x: any): AppSelectOption | null => {
      const id = Number(x.id);
      if (!Number.isFinite(id)) return null;

      const nom = String(x.nom ?? x.name ?? "").trim();
      const specialite = String(
        x.specialite ??
          x.specialiteLabel ??
          x.specialiteNom ??
          x.specialite_description ??
          x.specialiteDescription ??
          ""
      ).trim();

      const wilaya = String(x.wilaya ?? x.wilayaNom ?? x.wilayaLabel ?? "").trim();
      const commune = String(x.commune ?? x.communeNom ?? x.communeLabel ?? "").trim();
      const region = [wilaya, commune].filter(Boolean).join(" / ");

      const label = [nom, specialite].filter(Boolean).join(" - ").trim() || nom || String(id);

      return {
        id,
        label,                         // "Nom - Spécialité"
        subtitle: region || undefined, // "Wilaya / Commune"
        keywords: `${id} ${nom} ${specialite} ${wilaya} ${commune}`.toLowerCase(),
      };
    })
    .filter(Boolean) as AppSelectOption[]
);



      setProduits(
        (rawProduits || [])
          .map((x: any) => ({
            id: Number(x.id),
            label: String(x.label ?? x.name ?? x.nom ?? "").trim(),
          }))
          .filter((o: any) => Number.isFinite(o.id) && o.label)
      );
    } catch (err: any) {
      const status = err?.response?.status;
      const body = err?.response?.data;
      Alert.alert(
        "Référentiels échoués",
        status ? `HTTP ${status}\n${JSON.stringify(body)}` : err?.message ?? "Erreur inconnue"
      );
    } finally {
      setLoadingRefs(false);
    }
  };

  load();
}, [reloadTick]);



  const updateVisit = (idx: number, patch: Partial<VisitDraft>) => {
    setVisits((prev) => prev.map((v, i) => (i === idx ? { ...v, ...patch } : v)));
  };

  const addVisit = () => {
    setVisits((prev) => {
      const next = [...prev, makeEmptyVisit()];
      // Open newly added visit
      setOpenVisitIdx(next.length - 1);
      return next;
    });
  };

  const removeVisit = (idx: number) => {
    setVisits((prev) => {
      if (prev.length <= 1) return prev;

      const next = prev.filter((_, i) => i !== idx);

      // Fix open index deterministically (no stale closure)
      setOpenVisitIdx((curr) => {
        if (next.length <= 1) return 0;
        if (curr === idx) return Math.max(0, idx - 1);
        if (curr > idx) return curr - 1;
        return curr;
      });

      return next;
    });
  };

  const addProduct = (visitIdx: number) => {
    setVisits((prev) =>
      prev.map((v, i) => (i === visitIdx ? { ...v, products: [...v.products, makeEmptyProduct()] } : v))
    );
  };

  const removeProduct = (visitIdx: number, prodIdx: number) => {
    setVisits((prev) =>
      prev.map((v, i) =>
        i === visitIdx ? { ...v, products: v.products.filter((_, j) => j !== prodIdx) } : v
      )
    );
  };

  const updateProduct = (visitIdx: number, prodIdx: number, patch: Partial<ProductDraft>) => {
    setVisits((prev) =>
      prev.map((v, i) => {
        if (i !== visitIdx) return v;
        const products = v.products.map((p, j) => (j === prodIdx ? { ...p, ...patch } : p));
        return { ...v, products };
      })
    );
  };

  const validate = (): string | null => {
    if (!visits.length) return "Au moins une visite est requise. | زيارة واحدة على الأقل مطلوبة";

    const seenMed = new Set<number>();

    for (const [i, v] of visits.entries()) {
      if (v.medecin_id == null) return `Visite #${i + 1}: médecin requis. | الطبيب مطلوب`;
      if (seenMed.has(v.medecin_id)) return `Visite #${i + 1}: médecin dupliqué. | طبيب مكرر`;
      seenMed.add(v.medecin_id);

 

      // Require at least one product per visit (otherwise backend insert often fails)
      if (!v.products.length) {
        return `Visite #${i + 1}: ajoutez au moins un produit. | أضف منتجًا واحدًا على الأقل`;
      }

      for (const [j, p] of v.products.entries()) {
        if (p.produit_id == null) {
          return `Visite #${i + 1} — Produit #${j + 1}: produit requis. | المنتج مطلوب`;
        }
        if (p.rentabilite < 0 || p.rentabilite > 5) {
          return `Visite #${i + 1} — Produit #${j + 1}: rentabilité doit être 0..5. | الربحية بين 0 و5`;
        }
      }
    }

    return null;
  };

  const buildVisitesFlat = () => {
  const rows: any[] = [];

  for (const v of visits) {
    for (const p of v.products) {
      rows.push({
        medecin_id: v.medecin_id,
        medecinId: v.medecin_id,
        produit_id: p.produit_id,
        produitId: p.produit_id,

        // optional payload fields (backend can store them in observation or ignore)
        rentabilite: p.rentabilite,
        note: p.note?.trim() || null,
      });
    }
  }

  return rows;
};


  const submit = async () => {
    const err = validate();
    if (err) return Alert.alert("Validation | تحقق", err);

    try {
      setSubmitting(true);

      const visites = buildVisitesFlat();

      const payload = { visites };


      await api.put("/rapports/today", payload);

// redirect to rapports list (index)
router.replace("/rapports");

    } catch (err: any) {
      const status = err?.response?.status;
      const body = err?.response?.data;
      Alert.alert(
        "Submit échoué | فشل الإرسال",
        status ? `HTTP ${status}\n${JSON.stringify(body)}` : err?.message ?? "Unknown error"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView edges={["left", "right", "bottom"]} style={styles.root}>
      <AppHeader title="Nouveau rapport" titleAr="تقرير جديد" onBack={() => router.back()} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: (insets.bottom || 0) + 140 }, // space for footer
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.stepTitle}>Étape 2 | الخطوة 2</Text>
          <Text style={styles.stepSubtitle}>
            Renseignez les visites et les produits. | أدخل الزيارات والمنتجات
          </Text>
          {!loadingRefs && medecins.length === 0 ? (
  <View style={[styles.card, { borderColor: COLORS.danger }]}>
    <Text style={styles.sectionTitle}>Aucun médecin trouvé</Text>
    <Text style={styles.smallMuted}>
      L’API /rapports/referentiels renvoie medecins: []. Soit aucun médecin n’est affecté à ce user,
      soit la requête backend scope trop strict.
    </Text>

    <Pressable onPress={() => setReloadTick((t) => t + 1)} style={styles.secondaryBtn}>
      <Ionicons name="refresh" size={18} color={COLORS.brand} />
      <Text style={styles.secondaryBtnText}>Recharger</Text>
    </Pressable>
  </View>
) : null}



          {params.rapportId ? (
            <Text style={styles.smallMuted}>Rapport ID: {params.rapportId}</Text>
          ) : null}


          {loadingRefs ? (
            <AppCard>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <ActivityIndicator />
                <Text style={{ color: COLORS.textMuted, fontWeight: "800" }}>
                  Chargement des référentiels... | تحميل البيانات...
                </Text>
              </View>
            </AppCard>
          ) : null}

          {/* Visites (accordion) */}
          {visits.map((v, idx) => {
            const isOpen = idx === openVisitIdx;
            const medLabel = v.medecin_id ? medecinLabelById.get(v.medecin_id) : null;
            const prodCount = v.products.length;

            return (
              <AppCard key={v._key} style={{ padding: SPACING.lg }}>

                <Pressable onPress={() => setOpenVisitIdx(idx)} style={styles.visitHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.visitTitle}>Visite #{idx + 1} | زيارة</Text>
                    <Text style={styles.visitSubtitle} numberOfLines={1}>
                      {medLabel ? `Médecin: ${medLabel}` : "Médecin: Non sélectionné"}
                      {prodCount ? `  •  ${prodCount} produit(s)` : ""}
                    </Text>
                
                  </View>
                  <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={18} color={COLORS.textMuted} />
                </Pressable>

                {isOpen ? (
                  <View style={{ gap: 12, paddingTop: 12 }}>
                    <AppSelect
  title="Médecin"
  titleAr="الطبيب"
  placeholder={loadingRefs ? "Chargement..." : "Sélectionner un médecin"}
  value={v.medecin_id}
  options={medecins}
  disabled={loadingRefs}
  showId
  onChange={(id) => updateVisit(idx, { medecin_id: id == null ? null : Number(id) })}
/>



                    <View style={styles.divider} />

                    <View style={styles.productsHeader}>
                      <Text style={styles.sectionTitle}>Produits | منتجات</Text>
                      
                    </View>

                    {v.products.length === 0 ? (
                      <Text style={styles.smallMuted}>
                        Aucun produit ajouté. | لم يتم إضافة منتج
                      </Text>
                    ) : null}

                    {v.products.map((p, j) => (
                      
                      <View key={p._key} style={styles.subCard}>
                        <View style={styles.subCardHeader}>
                          <Text style={styles.subCardTitle}>Produit #{j + 1} | منتج</Text>
                          <Pressable onPress={() => removeProduct(idx, j)} hitSlop={10}>
                            <Ionicons name="trash" size={18} color="#DC2626" />
                          </Pressable>
                        </View>

                        <AppSelect
  title="Produit"
  titleAr="المنتج"
  placeholder={loadingRefs ? "Chargement..." : "Sélectionner un produit"}
  value={p.produit_id}
  options={produits}
  disabled={loadingRefs}
  onChange={(id) => updateProduct(idx, j, { produit_id: id == null ? null : Number(id) })}
/>



                        <View style={{ gap: 6 }}>
                          <Text style={styles.fieldLabel}>Rentabilité (0..5) | الربحية</Text>
                          <AppSelect
  title="Rentabilité (0..5)"
  titleAr="الربحية"
  placeholder="Sélectionner..."
  value={p.rentabilite}
  options={RENTABILITE_OPTIONS}
  onChange={(id) => updateProduct(idx, j, { rentabilite: Number(id ?? 0) })}
/>


                        </View>

                        <Text style={styles.fieldLabel}>Note produit | ملاحظة المنتج</Text>
                        <TextInput
                          value={p.note}
                          onChangeText={(t) => updateProduct(idx, j, { note: t })}
                          placeholder="Note... | ملاحظة..."
                          placeholderTextColor={COLORS.textMuted}
                          multiline
                          style={[styles.input, { minHeight: 70, textAlignVertical: "top" }]}
                        />
                      </View>
                    ))}
                    <Pressable onPress={() => addProduct(idx)} style={[styles.smallActionBtn, styles.addProductBottom]}>
  <Ionicons name="add" size={18} color={COLORS.brand} />
  <Text style={styles.smallActionText}>Ajouter | إضافة</Text>
</Pressable>


                    <Pressable
                      onPress={() => removeVisit(idx)}
                      style={[styles.dangerBtn, visits.length <= 1 ? styles.disabledBtn : null]}
                      disabled={visits.length <= 1}
                    >
                      <Ionicons name="trash" size={18} color="#fff" />
                      <Text style={styles.primaryBtnText}>Supprimer cette visite | حذف الزيارة</Text>
                    </Pressable>
                  </View>
                ) : null}
              </AppCard>
            );
          })}

          <Pressable onPress={addVisit} style={styles.secondaryBtn}>
            <Ionicons name="add-circle-outline" size={20} color={COLORS.brand} />
            <Text style={styles.secondaryBtnText}>Ajouter une visite | إضافة زيارة</Text>
          </Pressable>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: (insets.bottom || 0) + 10 }]}>
          <Pressable
            onPress={submit}
            disabled={submitting}
            style={[styles.primaryBtn, submitting ? styles.disabledBtn : null]}
          >
            {submitting ? (
              <ActivityIndicator color={COLORS.textOnBrand} />
            ) : (
              <>
                <Ionicons name="cloud-upload-outline" size={18} color={COLORS.textOnBrand} />
                <Text style={styles.primaryBtnText}>Valider le rapport | اعتماد التقرير</Text>
              </>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },

  content: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },

  stepTitle: { fontSize: 18, fontWeight: "900", color: COLORS.text },
  stepSubtitle: { fontSize: 13, color: COLORS.textMuted, marginTop: -6 },
  smallMuted: { fontSize: 12, color: COLORS.textMuted },

  sectionTitle: { fontWeight: "900", color: COLORS.text, marginBottom: 8 },
  fieldLabel: { fontWeight: "800", color: COLORS.text, marginBottom: 6, fontSize: TYPO.small },

  input: {
    borderWidth: 1,
    borderColor: FIELD.border,
    borderRadius: FIELD.radius,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    backgroundColor: FIELD.bg,
  },
  

  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 6 },

  visitHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  visitTitle: { fontSize: 15, fontWeight: "900", color: COLORS.text },
  visitSubtitle: { fontSize: 12, color: COLORS.textMuted, marginTop: 3 },
  visitMeta: { fontSize: 12, color: COLORS.textMuted, marginTop: 4 },

  pickerWrap: {
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

  productsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  smallActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: COLORS.brandSoft,
    borderWidth: 1,
    borderColor: "rgba(50,161,55,0.18)",
  },
  smallActionText: { color: COLORS.brand, fontWeight: "900" },

  subCard: {
    backgroundColor: COLORS.cardAlt,
    borderRadius: RADIUS.md,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
  },
  subCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  subCardTitle: { fontWeight: "900", color: COLORS.text },

  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },

  footer: {
    padding: SPACING.md,
    backgroundColor: COLORS.bg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  primaryBtn: {
    backgroundColor: COLORS.brand,
    borderRadius: RADIUS.lg,
    paddingVertical: 14,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  primaryBtnText: { color: COLORS.textOnBrand, fontWeight: "900", fontSize: 15 },

  secondaryBtn: {
    borderRadius: RADIUS.lg,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  secondaryBtnText: { color: COLORS.brand, fontWeight: "900", fontSize: 15 },

  card: {
  backgroundColor: COLORS.card,
  borderRadius: RADIUS.lg,
  padding: SPACING.md,
  borderWidth: 1,
  borderColor: COLORS.border, 
  gap: 10,
},
addProductBottom: {
  marginTop: 10,
  alignSelf: "flex-start",
},

  dangerBtn: {
    marginTop: 6,
    backgroundColor: "#DC2626",
    borderRadius: RADIUS.lg,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },

  disabledBtn: { opacity: 0.55 },

  // SearchSelect
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
  selectLabel: { fontSize: TYPO.small, fontWeight: "800", color: COLORS.textMuted },
  selectValue: { fontSize: 14, fontWeight: "900", color: COLORS.text, marginTop: 2 },
  selectPlaceholder: { color: COLORS.textMuted, fontWeight: "800" },

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
  modalTitleAr: { marginTop: 2, fontWeight: "700", color: COLORS.textMuted, writingDirection: "rtl" },
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
  optionRowSelected: { borderColor: "rgba(50,161,55,0.35)", backgroundColor: COLORS.brandSoft },
  optionText: { flex: 1, color: COLORS.text, fontWeight: "900" },
  sep: { height: 10 },
});
