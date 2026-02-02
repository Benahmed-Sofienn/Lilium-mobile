import React, { useMemo } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { AppCard } from "../../../src/components/AppCard";
import { AppSelect, type AppSelectOption } from "../../../src/components/AppSelect";
import { COLORS, FIELD, RADIUS, SPACING, TYPO } from "../../../src/ui/theme";

import type { MedicalVisitDraft, MedicalProductDraft } from "../../../src/types/rapportDrafts";

const RENTABILITE_OPTIONS: AppSelectOption[] = [
  { id: 0, label: "Première visite (connaît) | زيارة أولى للطبيب" },
  { id: 1, label: "Utilise beaucoup (ambassadeur) | يستعمل منتوجاتنا بكثرة" },
  { id: 2, label: "Utilise nos produits + concurrents | يستعمل منتوجاتنا و المنافسة" },
  { id: 3, label: "Premier essai (utilise un peu) | وصف للمرة الاولى و بشكل ضعيف" },
  { id: 4, label: "Évalue | (يقيم) يقول يكتب و لا توجد وصفات" },
  { id: 5, label: "S'intéresse (visite mais pas de prescription) | مهتم ( تمت الزيارة و لا يوجد وصف )" },
];

const STEP_LABEL_BY_STEP: Record<number, string> = {
  1: "Choisir le produit",
  2: "Choisir la rentabilité",
  3: "Saisir la note",
  4: "Complet",
};

function productStep(p: MedicalProductDraft) {
  if (p.produit_id == null) return 1;
  if (p.rentabilite == null) return 2;
  if (!String(p.note || "").trim()) return 3;
  return 4;
}

function isProductComplete(p: MedicalProductDraft) {
  return productStep(p) === 4;
}

type Props = {
  // needed to compute usedMedecinIds across all visits
  visits: MedicalVisitDraft[];

  v: MedicalVisitDraft;
  idx: number;
  isOpen: boolean;
  onToggle: () => void;

  loadingRefs: boolean;
  medecins: AppSelectOption[];
  produits: AppSelectOption[];
  medecinLabelById: Map<number, string>;

  openProdIdx: number;
  setOpenProdIdx: (visitKey: string, prodIdx: number) => void;

  updateVisit: (visitIdx: number, patch: Partial<MedicalVisitDraft>) => void;
  updateProduct: (visitIdx: number, prodIdx: number, patch: Partial<MedicalProductDraft>) => void;

  addProduct: (visitIdx: number) => void;
  removeProduct: (visitIdx: number, prodIdx: number) => void;

  canRemoveVisit: boolean;
  removeVisit: (visitIdx: number) => void;

  recordingKey: string | null;
  dictationLang: "fr-FR" | "ar-DZ";
  setDictationLang: (v: "fr-FR" | "ar-DZ") => void;
  startDictation: (visitIdx: number, prodIdx: number, productKey: string, currentNote: string) => void;
  stopDictation: () => void;
};

export function NewVisiteM(props: Props) {
  const {
    visits,
    v,
    idx,
    isOpen,
    onToggle,
    loadingRefs,
    medecins,
    produits,
    medecinLabelById,
    openProdIdx,
    setOpenProdIdx,
    updateVisit,
    updateProduct,
    addProduct,
    removeProduct,
    canRemoveVisit,
    removeVisit,
    recordingKey,
    dictationLang,
    setDictationLang,
    startDictation,
    stopDictation,
  } = props;

  // Map produit_id -> label (name)
  const produitLabelById = useMemo(() => {
    const m = new Map<number, string>();
    (produits || []).forEach((x: AppSelectOption) => {
      const id = x?.id == null ? NaN : Number(x.id);
      if (!Number.isFinite(id) || id <= 0) return;

      const label = String(x?.label ?? "").trim();
      if (label) m.set(id, label);
    });
    return m;
  }, [produits]);

    // Products already selected in THIS visit (to prevent duplicates)
  const usedProduitIds = useMemo(() => {
    const s = new Set<number>();
    (v.products || []).forEach((pp) => {
      const id = pp?.produit_id == null ? null : Number(pp.produit_id);
      if (Number.isFinite(id as any) && (id as number) > 0) s.add(id as number);
    });
    return s;
  }, [v.products]);


  const prodCount = v.products.length;
  const medSelected = v.medecin_id != null;
  const currentId = v.medecin_id == null ? null : Number(v.medecin_id);

  const medLabel = useMemo(() => {
    return v.medecin_id != null ? medecinLabelById.get(v.medecin_id) : null;
  }, [v.medecin_id, medecinLabelById]);

  const canAddProduct = useMemo(() => {
    const lastProd = v.products.length ? v.products[v.products.length - 1] : null;
    return medSelected && (!lastProd || isProductComplete(lastProd));
  }, [medSelected, v.products]);

  // Memoized: compute options for this visit once per dependency change
  const medecinOptionsForThisVisit = useMemo(() => {
    const usedByOtherVisits = new Set<number>(
      (visits || [])
        .filter((vv) => vv?._key !== v?._key) // exclude current visit
        .map((vv) => Number(vv?.medecin_id))
        .filter((x) => Number.isFinite(x) && x > 0)
    );

    return (medecins || []).filter((opt) => {
      const idNum = Number(opt?.id);
      if (!Number.isFinite(idNum) || idNum <= 0) return true;

      // Keep the currently selected medecin visible in its own dropdown
      if (currentId != null && idNum === currentId) return true;

      // Hide medecins selected in other visits
      return !usedByOtherVisits.has(idNum);
    });
  }, [medecins, visits, v?._key, currentId]);

  return (
    <AppCard style={{ padding: SPACING.lg }}>
      {/* Header */}
      <View style={styles.visitHeader}>
        <Pressable onPress={onToggle} style={{ flex: 1 }}>
          <Text style={styles.visitTitle}>Visite médicale #{idx + 1}</Text>
          <Text style={styles.visitSubtitle} numberOfLines={1}>
            {medLabel ? `Médecin: ${medLabel}` : "Médecin: Non sélectionné"}
            {prodCount ? `  •  ${prodCount} produit(s)` : ""}
          </Text>
        </Pressable>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          {canRemoveVisit ? (
            <Pressable onPress={() => removeVisit(idx)} hitSlop={10}>
              <Ionicons name="trash" size={18} color="#DC2626" />
            </Pressable>
          ) : null}

          <Pressable onPress={onToggle} hitSlop={10}>
            <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={18} color={COLORS.textMuted} />
          </Pressable>
        </View>
      </View>

      {isOpen ? (
        <View style={{ gap: 12, paddingTop: 12 }}>
          <AppSelect
            title="Médecin"
            titleAr="الطبيب"
            placeholder={loadingRefs ? "Chargement..." : "Sélectionner un médecin"}
            value={v.medecin_id}
            options={medecinOptionsForThisVisit}
            disabled={loadingRefs}
            showId
            onChange={(id) => updateVisit(idx, { medecin_id: id == null ? null : Number(id) })}
          />

          {!medSelected ? <Text style={styles.smallMuted}>Sélectionnez un médecin pour continuer.</Text> : null}

          {medSelected ? (
            <>
              <View style={styles.divider} />

              {v.products.length === 0 ? (
                <>
                  <Text style={styles.smallMuted}>Ajoutez un produit pour continuer.</Text>

                  <Pressable onPress={() => addProduct(idx)} style={[styles.smallActionBtn, styles.addProductBottom]}>
                    <Ionicons name="add" size={18} color={COLORS.brand} />
                    <Text style={styles.smallActionText}>Ajouter un produit</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  {v.products.map((p, j) => {
                    const isProdOpen = j === openProdIdx;
                    const step = productStep(p);
                    const isRec = recordingKey === p._key;

                    const produitIdNum = p.produit_id == null ? null : Number(p.produit_id);
                    const produitOptionsForThisCard = (produits || []).filter((opt) => {
  const idNum = Number(opt?.id);
  if (!Number.isFinite(idNum) || idNum <= 0) return true;

  // Keep the currently selected product visible in its own dropdown
  if (produitIdNum != null && idNum === produitIdNum) return true;

  // Exclude products already used by other product cards in the same visit
  return !usedProduitIds.has(idNum);
});

                    const name = produitIdNum != null ? produitLabelById.get(produitIdNum) : null;

                    const prodTitle =
                      produitIdNum != null
                        ? `#${j + 1} ${name && name.length ? name : "Produit"}`
                        : `Produit #${j + 1}`;

                    const stepLabel = STEP_LABEL_BY_STEP[step] ?? "Complet";

                    const rentabiliteNum = p.rentabilite == null ? null : Number(p.rentabilite);
                    const canEditNote = produitIdNum != null && rentabiliteNum != null;
                    const noteTrim = String(p.note || "").trim();

                    return (
                      <View key={p._key} style={styles.subCard}>
                        <Pressable onPress={() => setOpenProdIdx(v._key, j)} style={styles.prodHeader}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.subCardTitle} numberOfLines={1}>
                              {prodTitle}
                            </Text>
                            <Text style={styles.smallMuted} numberOfLines={1}>
                              {stepLabel}
                            </Text>
                          </View>

                          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                            <Pressable
                              onPress={(e: any) => {
                                if (e?.stopPropagation) e.stopPropagation();
                                removeProduct(idx, j);
                              }}
                              hitSlop={10}
                            >
                              <Ionicons name="trash" size={18} color="#DC2626" />
                            </Pressable>

                            <Ionicons
                              name={isProdOpen ? "chevron-up" : "chevron-down"}
                              size={18}
                              color={COLORS.textMuted}
                            />
                          </View>
                        </Pressable>

                        {isProdOpen ? (
                          <View style={{ gap: 10, paddingTop: 10 }}>
                            <AppSelect
                              title="Produit"
                              titleAr="المنتج"
                              placeholder={loadingRefs ? "Chargement..." : "Sélectionner un produit"}
                              value={p.produit_id}
                              options={produitOptionsForThisCard}
                              disabled={loadingRefs}
                              onChange={(id) => updateProduct(idx, j, { produit_id: id == null ? null : Number(id) })}
                            />

                            {p.produit_id != null ? (
                              <>
                                <Text style={styles.fieldLabel}>Rentabilité</Text>
                                <View style={{ gap: 8 }}>
                                  {RENTABILITE_OPTIONS.map((opt) => {
                                    const optIdNum = Number(opt.id);
                                    const checked = rentabiliteNum != null && rentabiliteNum === optIdNum;

                                    return (
                                      <Pressable
                                        key={String(opt.id)}
                                        onPress={() => updateProduct(idx, j, { rentabilite: optIdNum })}
                                        style={[styles.rentRow, checked ? styles.rentRowChecked : null]}
                                      >
                                        <Ionicons
                                          name={checked ? "checkbox" : "square-outline"}
                                          size={20}
                                          color={checked ? COLORS.brand : COLORS.textMuted}
                                        />
                                        <Text style={styles.rentText}>{opt.label}</Text>
                                      </Pressable>
                                    );
                                  })}
                                </View>

                                {p.rentabilite == null ? (
                                  <Text style={styles.smallMuted}>Sélection obligatoire.</Text>
                                ) : null}
                              </>
                            ) : (
                              <Text style={styles.smallMuted}>Sélectionnez d’abord le produit.</Text>
                            )}

                            {canEditNote ? (
                              <>
                                <Text style={styles.fieldLabel}>Note produit</Text>

                                <View style={{ gap: 6 }}>
                                  <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                                    <TextInput
                                      value={p.note}
                                      onChangeText={(t) => updateProduct(idx, j, { note: t })}
                                      placeholder="Tapez ou maintenez le micro pour dicter..."
                                      placeholderTextColor={COLORS.textMuted}
                                      multiline
                                      style={[styles.input, { minHeight: 70, flex: 1, textAlignVertical: "top" }]}
                                    />

                                    <Pressable
                                      onPressIn={() => void startDictation(idx, j, p._key, p.note)}
                                      onPressOut={() => stopDictation()}
                                      onPress={() => {
                                        if (recordingKey === p._key) stopDictation();
                                      }}
                                      onTouchCancel={() => stopDictation()}
                                      onResponderTerminate={() => stopDictation()}
                                      style={[styles.micBtn, isRec ? styles.micBtnActive : null]}
                                      hitSlop={10}
                                    >
                                      <Ionicons
                                        name={isRec ? "mic" : "mic-outline"}
                                        size={20}
                                        color={isRec ? "#fff" : COLORS.textMuted}
                                      />
                                    </Pressable>
                                  </View>

                                  <View style={{ flexDirection: "row", gap: 8 }}>
                                    <Pressable
                                      onPress={() => setDictationLang("fr-FR")}
                                      style={[
                                        styles.smallActionBtn,
                                        dictationLang === "fr-FR" ? { opacity: 1 } : { opacity: 0.6 },
                                      ]}
                                    >
                                      <Text style={styles.smallActionText}>FR</Text>
                                    </Pressable>

                                    <Pressable
                                      onPress={() => setDictationLang("ar-DZ")}
                                      style={[
                                        styles.smallActionBtn,
                                        dictationLang === "ar-DZ" ? { opacity: 1 } : { opacity: 0.6 },
                                      ]}
                                    >
                                      <Text style={styles.smallActionText}>AR</Text>
                                    </Pressable>
                                  </View>

                                  {!noteTrim ? (
                                    <Text style={styles.smallMuted}>
                                      Note obligatoire pour continuer | tapez RAS si vous n'avez rien a jouter.
                                    </Text>
                                  ) : null}
                                </View>
                              </>
                            ) : null}
                          </View>
                        ) : null}
                      </View>
                    );
                  })}

                  <Pressable
                    onPress={() => {
                      if (!medSelected) {
                        Alert.alert("Validation", "Médecin requis.");
                        return;
                      }
                      if (!canAddProduct) {
                        Alert.alert("Validation", "Terminez le dernier produit avant d’en ajouter un autre.");
                        return;
                      }
                      addProduct(idx);
                    }}
                    style={[styles.smallActionBtn, styles.addProductBottom, !canAddProduct ? styles.disabledBtn : null]}
                    disabled={!canAddProduct}
                  >
                    <Ionicons name="add" size={18} color={COLORS.brand} />
                    <Text style={styles.smallActionText}>Ajouter un autre produit</Text>
                  </Pressable>
                </>
              )}
            </>
          ) : null}
        </View>
      ) : null}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  visitHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  visitTitle: { fontSize: 15, fontWeight: "900", color: COLORS.text },
  visitSubtitle: { fontSize: 12, color: COLORS.textMuted, marginTop: 3 },

  smallMuted: { fontSize: 12, color: COLORS.textMuted },

  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 6 },

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

  subCard: {
    backgroundColor: COLORS.cardAlt,
    borderRadius: RADIUS.md,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
  },
  subCardTitle: { fontWeight: "900", color: COLORS.text },

  prodHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },

  rentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  rentRowChecked: { borderColor: "rgba(50,161,55,0.35)", backgroundColor: COLORS.brandSoft },
  rentText: { flex: 1, color: COLORS.text, fontWeight: "800", fontSize: 12 },

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
  addProductBottom: { marginTop: 10, alignSelf: "flex-start" },

  disabledBtn: { opacity: 0.55 },

  micBtn: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  micBtnActive: { backgroundColor: "#16A34A", borderColor: "#16A34A" },
});

export default NewVisiteM;
