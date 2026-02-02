import React, { useMemo } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { AppCard } from "../../../src/components/AppCard";
import { AppSelect, type AppSelectOption } from "../../../src/components/AppSelect";
import { COLORS, FIELD, RADIUS, SPACING, TYPO } from "../../../src/ui/theme";

import type { CommercialVisitDraft, CommercialProductDraft, CommercialClientType } from "../../../src/types/rapportDrafts";

export type CommercialClientOption = AppSelectOption & {
  client_type: CommercialClientType;
  plan_border?: "green" | "yellow";
};

const FILTER_OPTIONS: AppSelectOption[] = [
  { id: "Pharmacie", label: "Pharmacie" },
  { id: "Grossiste", label: "Grossiste" },
  { id: "SuperGros", label: "Super gros" },
];

function productComplete(p: CommercialProductDraft) {
  const note = String((p as any)?.note ?? "").trim();
  return p.produit_id != null && p.prescription != null && p.en_stock != null && note.length > 0;
}

type Props = {
  visits: CommercialVisitDraft[];

  v: CommercialVisitDraft;
  idx: number;
  isOpen: boolean;
  onToggle: () => void;

  loadingRefs: boolean;
  clientsByType: Record<string, CommercialClientOption[]>;
  produits: AppSelectOption[];

  clientLabelById: Map<number, string>;

  openProdIdx: number;
  setOpenProdIdx: (visitKey: string, prodIdx: number) => void;

  updateVisit: (visitIdx: number, patch: Partial<CommercialVisitDraft>) => void;
  updateProduct: (visitIdx: number, prodIdx: number, patch: Partial<CommercialProductDraft>) => void;

  addProduct: (visitIdx: number) => void;
  removeProduct: (visitIdx: number, prodIdx: number) => void;

  canRemoveVisit: boolean;
  removeVisit: (visitIdx: number) => void;

  // Optional: enable dictation exactly like medical product note
  recordingKey?: string | null;
  dictationLang?: "fr-FR" | "ar-DZ";
  setDictationLang?: (v: "fr-FR" | "ar-DZ") => void;
  startDictation?: (visitIdx: number, prodIdx: number, productKey: string, currentNote: string) => void;
  stopDictation?: () => void;
};

export function NewVisiteC(props: Props) {
  const {
    visits,
    v,
    idx,
    isOpen,
    onToggle,
    loadingRefs,
    clientsByType,
    produits,
    clientLabelById,
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

  const clientLabel = useMemo(() => {
    return v.medecin_id != null ? clientLabelById.get(v.medecin_id) : null;
  }, [v.medecin_id, clientLabelById]);

  const prodCount = v.products.length;

  const filterSelected = v.client_filter != null;
  const clientSelected = v.medecin_id != null;

  const isPharmacie = v.client_filter === "Pharmacie";

const prescriptionYesLabel = isPharmacie
  ? "Prescrit | يوصف"
  : "Commandé | هنالك طلبيات";

const prescriptionNoLabel = isPharmacie
  ? "Non prescrit | لا يوصف"
  : "Non commandé | لا يوجد طلبيات";


  // produit_id -> label (name)
  const produitLabelById = useMemo(() => {
    const m = new Map<number, string>();
    (produits || []).forEach((opt: AppSelectOption) => {
      const idNum = opt?.id == null ? NaN : Number(opt.id);
      if (!Number.isFinite(idNum) || idNum <= 0) return;
      const label = String(opt?.label ?? "").trim();
      if (label) m.set(idNum, label);
    });
    return m;
  }, [produits]);

  // Products already selected in THIS visit (prevents duplicates in same visit)
  const usedProduitIds = useMemo(() => {
    const s = new Set<number>();
    (v.products || []).forEach((pp) => {
      const id = pp?.produit_id == null ? null : Number(pp.produit_id);
      if (Number.isFinite(id as any) && (id as number) > 0) s.add(id as number);
    });
    return s;
  }, [v.products]);

  const filteredClients = useMemo(() => {
  if (!v.client_filter) return [];

  const bucket = props.clientsByType?.[v.client_filter] ?? [];
  const currentId = v.medecin_id != null ? Number(v.medecin_id) : null;

  const usedByOtherVisits = new Set<number>(
    (visits || [])
      .filter((vv) => vv?._key !== v?._key)
      .map((vv) => Number(vv?.medecin_id))
      .filter((x) => Number.isFinite(x) && x > 0)
  );

  // IMPORTANT: no sort here. bucket is already sorted once in parent.
  return bucket
    .filter((c) => {
      const idNum = Number(c?.id);
      if (!Number.isFinite(idNum) || idNum <= 0) return true;

      if (currentId != null && idNum === currentId) return true;
      return !usedByOtherVisits.has(idNum);
    })
    .map((c) => ({
      id: c.id,
      label: c.label,
      subtitle: c.subtitle,
      metaLine: c.metaLine,
      keywords: c.keywords,
      plan_border: c.plan_border,
    }));
}, [props.clientsByType, visits, v._key, v.client_filter, v.medecin_id]);


  const canAddProduct = useMemo(() => {
    const lastProd = v.products.length ? v.products[v.products.length - 1] : null;
    return clientSelected && v.bon_commande == null && (!lastProd || productComplete(lastProd));
  }, [clientSelected, v.bon_commande, v.products]);

  const allProductsComplete = useMemo(() => {
    return v.products.length > 0 && v.products.every(productComplete);
  }, [v.products]);

  const dictationEnabled = !!(startDictation && stopDictation);

  return (
    <AppCard style={{ padding: SPACING.lg }}>
      {/* Header */}
      <View style={styles.visitHeader}>
        <Pressable onPress={onToggle} style={{ flex: 1 }}>
          <Text style={styles.visitTitle}>Visite commerciale #{idx + 1}</Text>
          <Text style={styles.visitSubtitle} numberOfLines={1}>
            {clientLabel ? `Client: ${clientLabel}` : "Client: Non sélectionné"}
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
            title="Type client"
            placeholder={loadingRefs ? "Chargement..." : "Pharmacie / Grossiste / Super gros"}
            value={v.client_filter}
            options={FILTER_OPTIONS}
            disabled={loadingRefs}
            onChange={(val) => {
              const next = (val as CommercialClientType | null) ?? null;
              updateVisit(idx, {
                client_filter: next,
                medecin_id: null,
                bon_commande: null,
                products: [],
              });
              setOpenProdIdx(v._key, 0);
            }}
          />

          {!filterSelected ? <Text style={styles.smallMuted}>Choisissez un filtre pour continuer.</Text> : null}

          {filterSelected ? (
            <>
              <AppSelect
                title="Client"
                placeholder={loadingRefs ? "Chargement..." : "Sélectionner un client"}
                value={v.medecin_id}
                options={filteredClients}
                disabled={loadingRefs}
                showId
                onChange={(id) => updateVisit(idx, { medecin_id: id == null ? null : Number(id) })}
              />

              {!clientSelected ? <Text style={styles.smallMuted}>Sélectionnez un client pour continuer.</Text> : null}
            </>
          ) : null}

          {clientSelected ? (
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
                    const done = productComplete(p);

                    const produitIdNum = p.produit_id == null ? null : Number(p.produit_id);

                    // Filter options so duplicates in same visit are not selectable
                    const produitOptionsForThisCard = (produits || []).filter((opt) => {
                      const idNum = Number(opt?.id);
                      if (!Number.isFinite(idNum) || idNum <= 0) return true;

                      // keep current selected product visible in its own dropdown
                      if (produitIdNum != null && idNum === produitIdNum) return true;

                      // exclude products already used by other cards in the same visit
                      return !usedProduitIds.has(idNum);
                    });

                    const prodLabel = produitIdNum != null ? produitLabelById.get(produitIdNum) : null;
                    const prodTitle =
                      produitIdNum != null
                        ? `#${j + 1} ${prodLabel && prodLabel.length ? prodLabel : "Produit"}`
                        : `Produit #${j + 1}`;

                    const noteVal = String((p as any)?.note ?? "");
                    const noteTrim = noteVal.trim();

                    const isRec = recordingKey != null && recordingKey === p._key;

                    return (
                      <View key={p._key} style={styles.subCard}>
                        <Pressable onPress={() => setOpenProdIdx(v._key, j)} style={styles.prodHeader}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.subCardTitle} numberOfLines={1}>
                              {prodTitle}
                            </Text>
                            <Text style={styles.smallMuted} numberOfLines={1}>
                              {done ? "Complet" : "À compléter"}
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
                              placeholder={loadingRefs ? "Chargement..." : "Sélectionner un produit"}
                              value={p.produit_id}
                              options={produitOptionsForThisCard}
                              disabled={loadingRefs}
                              onChange={(id) =>
                                updateProduct(idx, j, { produit_id: id == null ? null : Number(id) })
                              }
                            />

                            {/* Prescription */}
                            {p.produit_id != null ? (
                              <>
                                <Text style={styles.fieldLabel}>{isPharmacie ? "Prescription" : "Commande"}</Text>

                                <RadioRow
  label={prescriptionYesLabel}
  checked={p.prescription === true}
  onPress={() => updateProduct(idx, j, { prescription: true })}
/>
<RadioRow
  label={prescriptionNoLabel}
  checked={p.prescription === false}
  onPress={() => updateProduct(idx, j, { prescription: false })}
/>

                                {p.prescription == null ? (
                                  <Text style={styles.smallMuted}>Sélection obligatoire.</Text>
                                ) : null}
                              </>
                            ) : null}

                            {/* Stock */}
                            {p.produit_id != null && p.prescription != null ? (
                              <>
                                <Text style={styles.fieldLabel}>Stock</Text>
                                <RadioRow
                                  label="En rupture"
                                  checked={p.en_stock === false}
                                  onPress={() => updateProduct(idx, j, { en_stock: false, qtt: 0 })}
                                />
                                <RadioRow
                                  label="En stock"
                                  checked={p.en_stock === true}
                                  onPress={() => updateProduct(idx, j, { en_stock: true })}
                                />
                                {p.en_stock == null ? (
                                  <Text style={styles.smallMuted}>Sélection obligatoire.</Text>
                                ) : null}
                              </>
                            ) : null}

                            {/* Optional qty if en_stock */}
                            {p.en_stock === true ? (
                              <>
                                <Text style={styles.fieldLabel}>Quantité en stock (si fournit)</Text>
                                <TextInput
                                  value={String(p.qtt ?? 0)}
                                  onChangeText={(t) => {
                                    const n = Math.max(
                                      0,
                                      parseInt(String(t || "0").replace(/[^\d]/g, ""), 10) || 0
                                    );
                                    updateProduct(idx, j, { qtt: n });
                                  }}
                                  keyboardType="numeric"
                                  placeholder="0"
                                  placeholderTextColor={COLORS.textMuted}
                                  style={styles.input}
                                />
                              </>
                            ) : null}

                            {/* NEW: Note (final step after stock) */}
                            {p.produit_id != null && p.prescription != null && p.en_stock != null ? (
                              <>
                                <Text style={styles.fieldLabel}>Note produit</Text>

                                <View style={{ gap: 6 }}>
                                  <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                                    <TextInput
                                      value={noteVal}
                                      onChangeText={(t) =>
                                        updateProduct(idx, j, ({ note: t } as any))
                                      }
                                      placeholder="Tapez (ou dictez) la note..."
                                      placeholderTextColor={COLORS.textMuted}
                                      multiline
                                      style={[styles.input, { minHeight: 70, flex: 1, textAlignVertical: "top" }]}
                                    />

                                    {dictationEnabled ? (
                                      <Pressable
                                        onPressIn={() => startDictation!(idx, j, p._key, noteVal)}
                                        onPressOut={() => stopDictation!()}
                                        onPress={() => {
                                          if (recordingKey === p._key) stopDictation!();
                                        }}
                                        onTouchCancel={() => stopDictation!()}
                                        onResponderTerminate={() => stopDictation!()}
                                        style={[styles.micBtn, isRec ? styles.micBtnActive : null]}
                                        hitSlop={10}
                                      >
                                        <Ionicons
                                          name={isRec ? "mic" : "mic-outline"}
                                          size={20}
                                          color={isRec ? "#fff" : COLORS.textMuted}
                                        />
                                      </Pressable>
                                    ) : null}
                                  </View>

                                  {dictationEnabled && dictationLang && setDictationLang ? (
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
                                  ) : null}

                                  {!noteTrim ? (
                                    <Text style={styles.smallMuted}>
                                      Note obligatoire pour continuer | tapez RAS si vous n'avez rien a ajouter.
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

                  {/* Add another product only if last product complete and bon_commande not answered */}
                  <Pressable
                    onPress={() => {
                      if (!clientSelected) return;
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

              {/* Final step: bon de commande (only after all products complete) */}
              {allProductsComplete ? (
                <>
                  <View style={styles.divider} />

                  <Text style={styles.fieldLabel}>Avez-vous décroché un bon de commande ?</Text>

                  <RadioRow
                    label="Oui"
                    checked={v.bon_commande === true}
                    onPress={() => updateVisit(idx, { bon_commande: true })}
                  />
                  <RadioRow
                    label="Non"
                    checked={v.bon_commande === false}
                    onPress={() => updateVisit(idx, { bon_commande: false })}
                  />

                  {v.bon_commande == null ? (
                    <Text style={styles.smallMuted}>Sélection obligatoire (dernière étape).</Text>
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}
        </View>
      ) : null}
    </AppCard>
  );
}

function RadioRow({
  label,
  checked,
  onPress,
}: {
  label: string;
  checked: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.rentRow, checked ? styles.rentRowChecked : null]}>
      <Ionicons
        name={checked ? "checkbox" : "square-outline"}
        size={20}
        color={checked ? COLORS.brand : COLORS.textMuted}
      />
      <Text style={styles.rentText}>{label}</Text>
    </Pressable>
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

export default NewVisiteC;
