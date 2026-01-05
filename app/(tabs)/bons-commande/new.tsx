// app/(tabs)/bons-commande/new.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import DocumentScanner from "react-native-document-scanner-plugin";

import { AppHeader } from "../../../src/components/AppHeader";
import { AppCard } from "../../../src/components/AppCard";
import { AppSelect, AppSelectOption } from "../../../src/components/AppSelect";
import { COLORS, SPACING, RADIUS, FIELD, TYPO } from "../../../src/ui/theme";

// Adjust this import to your existing API client (axios instance with JWT).
// Common: "../../../src/api/client" exporting default axios instance.
import { api } from "../../../src/api/client";

type Mode = "PHARM_GROS" | "GROS_SUPER" | "SUPER_OFFICE";


type Produit = {
  id: number | string;
  nom?: string;
  name?: string;
  label?: string;
  price?: number;
};



function asLabel(x: any) {
  return (
    x?.label ??
    x?.nom ??
    x?.name ??
    x?.title ??
    (x?.first_name || x?.last_name
      ? `${x?.first_name || ""} ${x?.last_name || ""}`.trim()
      : null) ??
    `#${x?.id ?? "?"}`
  );
}

function getRegionLabel(x: any) {
  const wilaya =
    x?.wilaya?.nom ??
    x?.wilaya_nom ??
    x?.wilayaName ??
    x?.wilaya ??
    x?.regions_wilaya?.nom;

  const commune =
    x?.commune?.nom ??
    x?.commune_nom ??
    x?.communeName ??
    x?.commune ??
    x?.regions_commune?.nom;

  if (wilaya && commune) return `${wilaya} / ${commune}`;
  return wilaya || commune || "";
}

function mapClientOptions(list: any[] | undefined | null): AppSelectOption[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((x) => x && x.id !== undefined && x.id !== null)
    .map((x) => {
      const label = String(x?.nom ?? x?.name ?? x?.label ?? `#${x?.id ?? "?"}`);
      const subtitle = getRegionLabel(x);
      const keywords = `${x?.id ?? ""} ${label} ${subtitle}`.trim();
      return { id: x.id, label, subtitle, keywords };
    });
}


function mapOptions(list: any[] | undefined | null, extraKeywords?: (x: any) => string): AppSelectOption[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((x) => x && (x.id !== undefined && x.id !== null))
    .map((x) => ({
      id: x.id,
      label: String(asLabel(x)),
      keywords: extraKeywords ? extraKeywords(x) : undefined,
    }));
}

function clampQty(v: string) {
  const n = Number(String(v).replace(/[^\d]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(99999, Math.trunc(n)));
}



const ModePill = React.memo(function ModePill({
  active,
  title,
  subtitle,
  onPress,
}: {
  active: boolean;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.modePill,
        active ? styles.modePillActive : null,
      ]}
    >
      <Text style={[styles.modeTitle, active ? { color: COLORS.brandDark } : null]}>
  {title}
</Text>
<Text style={styles.modeSub}>
  {subtitle}
</Text>

    </Pressable>
  );
});

const ProductCard = React.memo(function ProductCard({
  item,
  qty,
  onChangeQty,
}: {
  item: Produit;
  qty: number;
  onChangeQty: (next: number) => void;
}) {
  const label = String(asLabel(item));
  return (
    <View style={styles.productCard}>
      <View style={{ flex: 1 }}>
  <Text style={styles.productName} numberOfLines={2}>
    {label}
  </Text>
  <Text style={styles.productQtyLabel}>Quantité | الكمية</Text>
</View>


      <View style={styles.qtyWrap}>
        <Pressable
          onPress={() => onChangeQty(Math.max(0, qty - 1))}
          style={styles.qtyBtn}
          hitSlop={8}
        >
          <Ionicons name="remove" size={18} color={COLORS.text} />
        </Pressable>

        <TextInput
          value={String(qty)}
          onChangeText={(t) => onChangeQty(clampQty(t))}
          keyboardType="number-pad"
          style={styles.qtyInput}
        />

        <Pressable
          onPress={() => onChangeQty(qty + 1)}
          style={styles.qtyBtn}
          hitSlop={8}
        >
          <Ionicons name="add" size={18} color={COLORS.text} />
        </Pressable>
      </View>
    </View>
  );
});

export default function NewBonCommandeScreen() {
  const router = useRouter();

  const [loadingRefs, setLoadingRefs] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("PHARM_GROS");


  const [pharmacies, setPharmacies] = useState<AppSelectOption[]>([]);
  const [grossistes, setGrossistes] = useState<AppSelectOption[]>([]);
  const [superGrossistes, setSuperGrossistes] = useState<AppSelectOption[]>([]);
  const [produits, setProduits] = useState<Produit[]>([]);

  const [pharmacyId, setPharmacyId] = useState<number | string | null>(null);
  const [grosId, setGrosId] = useState<number | string | null>(null);
  const [superGrosId, setSuperGrosId] = useState<number | string | null>(null);

  const [imageUri, setImageUri] = useState<string | null>(null); // local scanned file path (file://...)
  const [observation, setObservation] = useState("");

  const [productQuery, setProductQuery] = useState("");
  const [qtyById, setQtyById] = useState<Record<string, number>>({});

  // --- load referentiels
  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoadingRefs(true);
      setError(null);
      try {
       const { data } = await api.get("/bons-commande/referentiels");

if (!mounted) return;

// --- normalize lists safely (always arrays)
const pharmaciesRaw =
  (Array.isArray(data?.pharmacies) && data.pharmacies) ||
  (Array.isArray(data?.pharmacy) && data.pharmacy) ||
  (Array.isArray(data?.pharmacie) && data.pharmacie) ||
  (Array.isArray(data?.pharmaciesList) && data.pharmaciesList) ||
  [];

const grossistesRaw =
  (Array.isArray(data?.grossistes) && data.grossistes) ||
  (Array.isArray(data?.gros) && data.gros) ||
  (Array.isArray(data?.grossiste) && data.grossiste) ||
  (Array.isArray(data?.grossistesList) && data.grossistesList) ||
  [];

const superGrossistesRaw =
  (Array.isArray(data?.superGrossistes) && data.superGrossistes) ||
  (Array.isArray(data?.super_grossistes) && data.super_grossistes) ||
  (Array.isArray(data?.super_gros) && data.super_gros) ||
  (Array.isArray(data?.clients) && data.clients) ||
  [];

const produitsList =
  (Array.isArray(data?.produits) && data.produits) ||
  (Array.isArray(data?.products) && data.products) ||
  (Array.isArray(data?.produitsList) && data.produitsList) ||
  (Array.isArray(data?.items) && data.items) ||
  [];

// --- set state
setPharmacies(mapClientOptions(pharmaciesRaw));
setGrossistes(mapClientOptions(grossistesRaw));
setSuperGrossistes(mapClientOptions(superGrossistesRaw));


setProduits(produitsList);

      } catch (e: any) {
        console.log("REFERENTIELS FAIL url:", e?.config?.url);
        console.log("REFERENTIELS FAIL status:", e?.response?.status);
        console.log("REFERENTIELS FAIL data:", e?.response?.data);

        console.error(e);
        if (!mounted) return;
        setError("Impossible de charger les référentiels. Vérifie /api/bons-commande/referentiels.");
      } finally {
        if (mounted) setLoadingRefs(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // --- mode change logic: clear irrelevant selections
  const applyMode = useCallback((next: Mode) => {
  setMode(next);
  setError(null);

  if (next === "PHARM_GROS") {
    setSuperGrosId(null);
  } else if (next === "GROS_SUPER") {
    setPharmacyId(null);
  } else {
    // SUPER_OFFICE
    setPharmacyId(null);
    setGrosId(null);
  }
}, []);


  // --- scan document (1 page)
  const scanDocument = useCallback(async () => {
  try {
    setError(null);

    const result = await DocumentScanner.scanDocument({
      maxNumDocuments: 1,
      letUserAdjustCrop: true,
    } as any);

    const scanned = (result as any)?.scannedImages as string[] | undefined;
    if (scanned && scanned.length > 0) {
      setImageUri(scanned[0]);
    }
  } catch (e) {
    console.error(e);
    Alert.alert("Scan", "Échec du scan du document.");
  }
}, []);



  const clearScan = useCallback(() => {
    setImageUri(null);
  }, []);

  // --- products filtering
  const filteredProduits = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return produits;

    return produits.filter((p) => {
      const label = String(asLabel(p)).toLowerCase();
      return label.includes(q);
    });
  }, [produits, productQuery]);

  const selectedCount = useMemo(() => {
    return Object.values(qtyById).filter((n) => n > 0).length;
  }, [qtyById]);

  const selectedItems = useMemo(() => {
    const items = Object.entries(qtyById)
      .filter(([, q]) => q > 0)
      .map(([produit_id, qtt]) => ({
        produit_id: /^\d+$/.test(produit_id) ? Number(produit_id) : produit_id,
        qtt,
      }));
    return items;
  }, [qtyById]);

  const setQty = useCallback((id: number | string, next: number) => {
    const key = String(id);
    setQtyById((prev) => {
      if (prev[key] === next) return prev;
      return { ...prev, [key]: next };
    });
  }, []);

  // --- validation
  const validationMessage = useMemo(() => {
    if (!imageUri) return "Image requise (scan du bon).";

    if (mode === "PHARM_GROS") {
      if (!pharmacyId) return "Sélectionne une pharmacie.";
      if (!grosId) return "Sélectionne un grossiste.";
    }
    if (mode === "GROS_SUPER") {
      if (!grosId) return "Sélectionne un grossiste.";
      if (!superGrosId) return "Sélectionne un super grossiste.";
    }
    if (mode === "SUPER_OFFICE") {
      if (!superGrosId) return "Sélectionne un super grossiste.";
    }

    if (selectedItems.length < 1) return "Ajoute au moins 1 produit avec une quantité > 0.";

    return null;
  }, [imageUri, mode, pharmacyId, grosId, superGrosId, selectedItems.length]);

  // --- submit
  const onSubmit = useCallback(async () => {
    setError(null);

    const msg = validationMessage;
    if (msg) {
      setError(msg);
      return;
    }

    try {
      setSubmitting(true);

      const form = new FormData();

      // image file
      // NOTE: DocumentScanner returns a local file path. Most RN setups accept it in FormData.
      const filename = `order_${Date.now()}.jpg`;
      form.append("image", {
        uri: imageUri as string,
        name: filename,
        type: "image/jpeg",
      } as any);

      const obs = observation.trim();
      if (obs) form.append("observation", obs);

      if (mode === "PHARM_GROS") {
        form.append("pharmacy_id", String(pharmacyId));
        form.append("gros_id", String(grosId));
      } else if (mode === "GROS_SUPER") {
  form.append("gros_id", String(grosId));
  form.append("super_gros_id", String(superGrosId));
} else {
  // SUPER_OFFICE => only super_gros_id (backend will set from_company=true)
  form.append("super_gros_id", String(superGrosId));
}


      // items
      form.append("items", JSON.stringify(selectedItems));

      // Expected backend route:
      // POST /api/bons-commande  (multipart/form-data)
      await api.post("/bons-commande", form);


      Alert.alert("Succès", "Bon de commande créé.");
      router.back();
    } catch (e: any) {
      console.error(e);
      const apiMsg =
        e?.response?.data?.error ||
        e?.response?.data?.erreur ||
        "Échec de création du bon de commande.";
      setError(String(apiMsg));
    } finally {
      setSubmitting(false);
    }
  }, [imageUri, observation, mode, pharmacyId, grosId, superGrosId, selectedItems, validationMessage, router]);

  const header = useMemo(() => {
    return (
      <View style={{ padding: SPACING.md, paddingBottom: SPACING.sm }}>
        {/* Scan */}
        <AppCard>
          <Text style={styles.sectionTitle}>Photo du bon</Text>
          <Text style={styles.sectionSub}>مسح صورة الطلبية</Text>

          <View style={{ height: SPACING.md }} />

          {imageUri ? (
            <View>
              <View style={styles.imageWrap}>
                <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" />
              </View>

              <View style={{ height: SPACING.md }} />

              <View style={styles.row}>
                <Pressable
                  onPress={scanDocument}
                  style={({ pressed }) => [
                    styles.btn,
                    styles.btnSecondary,
                    pressed ? styles.pressed : null,
                    { flex: 1 },
                  ]}
                >
                  <Ionicons name="scan" size={18} color={COLORS.text} />
                  <Text style={[styles.btnText, { color: COLORS.text }]}>
                    Re-scanner | إعادة المسح
                  </Text>
                </Pressable>

                <View style={{ width: SPACING.sm }} />

                <Pressable
                  onPress={clearScan}
                  style={({ pressed }) => [
                    styles.btn,
                    styles.btnDanger,
                    pressed ? styles.pressed : null,
                    { flex: 1 },
                  ]}
                >
                  <Ionicons name="trash" size={18} color="#fff" />
                  <Text style={[styles.btnText, { color: "#fff" }]}>Supprimer | حذف</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              onPress={scanDocument}
              style={({ pressed }) => [
                styles.btn,
                styles.btnPrimary,
                pressed ? styles.pressed : null,
              ]}
              disabled={loadingRefs}
            >
              <Ionicons name="scan" size={18} color={COLORS.textOnBrand} />
              <Text style={[styles.btnText, { color: COLORS.textOnBrand }]}>
                Scanner le bon | مسح الطلبية
              </Text>
            </Pressable>
          )}
        </AppCard>

        <View style={{ height: SPACING.md }} />

        {/* Mode + Client selection */}
        <AppCard>
          <Text style={styles.sectionTitle}>Type de client</Text>
          <Text style={styles.sectionSub}>نوع العميل</Text>

          <View style={{ height: SPACING.md }} />

          <View style={styles.modeRow}>
  <ModePill
    active={mode === "PHARM_GROS"}
    title={"Pharmacie\n+\nGros"}
    subtitle={"صيدلية\n+\nموزع"}
    onPress={() => applyMode("PHARM_GROS")}
  />
  <ModePill
    active={mode === "GROS_SUPER"}
    title={"Gros\n+\nSuper gros"}
    subtitle={"موزع\n+\nسوبر موزع"}
    onPress={() => applyMode("GROS_SUPER")}
  />
  <ModePill
    active={mode === "SUPER_OFFICE"}
    title={"Super gros\n+\nOffice"}
    subtitle={"سوبر موزع\n+\nالمكتب"}
    onPress={() => applyMode("SUPER_OFFICE")}
  />
</View>


          <View style={{ height: SPACING.md }} />

          {mode === "PHARM_GROS" ? (
            <>
              <AppSelect
                title="Pharmacie"
                titleAr="صيدلية"
                value={pharmacyId}
                options={pharmacies}
                onChange={setPharmacyId}
                placeholder={loadingRefs ? "Chargement..." : "Sélectionner..."}
                showId
              />
              <View style={{ height: SPACING.md }} />
              <AppSelect
                title="Grossiste"
                titleAr="موزع"
                value={grosId}
                options={grossistes}
                onChange={setGrosId}
                placeholder={loadingRefs ? "Chargement..." : "Sélectionner..."}
                showId
              />
            </>
          ) : mode === "GROS_SUPER" ? (
            <>
              <AppSelect
                title="Grossiste"
                titleAr="موزع"
                value={grosId}
                options={grossistes}
                onChange={setGrosId}
                placeholder={loadingRefs ? "Chargement..." : "Sélectionner..."}
                showId
              />
              <View style={{ height: SPACING.md }} />
              <AppSelect
                title="Super grossiste"
                titleAr="سوبر موزع"
                value={superGrosId}
                options={superGrossistes}
                onChange={setSuperGrosId}
                placeholder={loadingRefs ? "Chargement..." : "Sélectionner..."}
                showId
              />
            </>
          ) : (
             <AppSelect
    title="Super grossiste"
    titleAr="سوبر موزع"
    value={superGrosId}
    options={superGrossistes}
    onChange={setSuperGrosId}
    placeholder={loadingRefs ? "Chargement..." : "Sélectionner..."}
    showId
  />
          )}

          <View style={{ height: SPACING.lg }} />

          <Text style={styles.fieldLabel}>Observation (optionnel) | ملاحظة (اختياري)</Text>
          <TextInput
            value={observation}
            onChangeText={setObservation}
            placeholder="Détails, remarque..."
            placeholderTextColor={COLORS.textMuted}
            style={[styles.textArea]}
            multiline
          />
        </AppCard>

        <View style={{ height: SPACING.md }} />
        {/* Error */}
        {error ? (
          <View style={{ marginTop: SPACING.md }}>
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={18} color={COLORS.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          </View>
        ) : null}
        <View style={{ height: SPACING.lg }} />
      </View>
    );
  }, [
    imageUri,
    mode,
    pharmacies,
    grossistes,
    superGrossistes,
    pharmacyId,
    grosId,
    superGrosId,
    loadingRefs,
    observation,
    productQuery,
    selectedCount,
    error,
    scanDocument,
    clearScan,
    applyMode,
  ]);

    const footer = useMemo(() => {
    return (
      <View style={{ paddingHorizontal: SPACING.md, paddingBottom: SPACING.lg }}>
        <Pressable
          onPress={onSubmit}
          disabled={submitting || !!validationMessage}
          style={({ pressed }) => [
            styles.btn,
            styles.btnPrimary,
            (submitting || !!validationMessage) ? { opacity: 0.55 } : null,
            pressed ? styles.pressed : null,
          ]}
        >
          <Ionicons name="save" size={18} color={COLORS.textOnBrand} />
          <Text style={[styles.btnText, { color: COLORS.textOnBrand }]}>
            {submitting ? "Création..." : "Créer le bon de commande | إنشاء الطلبية"}
          </Text>
        </Pressable>

        {validationMessage ? (
          <Text style={styles.validationHint}>{validationMessage}</Text>
        ) : null}

        <View style={{ height: SPACING.lg }} />
      </View>
    );
  }, [onSubmit, submitting, validationMessage]);





  return (
    <View style={styles.root}>
      <AppHeader
        title="Nouveau bon de commande"
        titleAr="طلبية جديدة"
        onBack={() => router.back()}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <FlatList
          data={filteredProduits}
          keyExtractor={(item) => String(item.id)}
          ListHeaderComponent={header}
          ListFooterComponent={footer}
          contentContainerStyle={{ paddingBottom: 28 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const id = item.id;
            const qty = qtyById[String(id)] ?? 0;
            return (
              <View style={{ paddingHorizontal: SPACING.md, paddingBottom: SPACING.md }}>
                <ProductCard
                  item={item}
                  qty={qty}
                  onChangeQty={(next) => setQty(id, next)}
                />
              </View>
            );
          }}
          ListEmptyComponent={
            loadingRefs ? (
              <View style={{ padding: SPACING.md }}>
                <Text style={{ color: COLORS.textMuted }}>Chargement des produits...</Text>
              </View>
            ) : (
              <View style={{ padding: SPACING.md }}>
                <Text style={{ color: COLORS.textMuted }}>
                  Aucun produit trouvé. | لا يوجد منتجات
                </Text>
              </View>
            )
          }
        />
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },

  sectionTitle: {
    fontSize: TYPO.h2,
    fontWeight: "900",
    color: COLORS.text,
  },
  sectionSub: {
    marginTop: 2,
    color: COLORS.textMuted,
    fontWeight: "700",
    writingDirection: "rtl",
  },

  row: { flexDirection: "row", alignItems: "center" },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },

  productQtyLabel: {
  marginTop: 6,
  color: COLORS.textMuted,
  fontWeight: "800",
  fontSize: 12,
},


  btn: {
    height: FIELD.height,
    borderRadius: FIELD.radius,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 14,
  },
  btnPrimary: { backgroundColor: COLORS.brand },
  btnSecondary: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btnDanger: { backgroundColor: COLORS.danger },
  btnText: { fontSize: 14, fontWeight: "900" },
  pressed: { opacity: 0.9 },

  imageWrap: {
    height: 220,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.cardAlt,
  },
  image: { width: "100%", height: "100%" },

  modeRow: { flexDirection: "row", gap: SPACING.sm },
  modePill: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: COLORS.card,
  },
  modePillActive: {
    borderColor: "rgba(50,161,55,0.40)",
    backgroundColor: COLORS.brandSoft,
  },
  modeTitle: {
  fontWeight: "900",
  color: COLORS.text,
  fontSize: 12,
  textAlign: "center",
  lineHeight: 16,
},
modeSub: {
  marginTop: 6,
  color: COLORS.textMuted,
  fontWeight: "800",
  fontSize: 11,
  textAlign: "center",
  lineHeight: 16,
},


  fieldLabel: { color: COLORS.textMuted, fontWeight: "900", fontSize: 12, marginBottom: 8 },

  textArea: {
    minHeight: 90,
    borderWidth: 1,
    borderColor: FIELD.border,
    borderRadius: FIELD.radius,
    backgroundColor: FIELD.bg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    fontWeight: "800",
    textAlignVertical: "top",
  },

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

  helper: { color: COLORS.textMuted, fontWeight: "700" },

  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  badgeText: { fontSize: 12, fontWeight: "900", color: COLORS.text },

  productCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
  },
  productName: { fontSize: 14, fontWeight: "900", color: COLORS.text },
  productMeta: { marginTop: 4, color: COLORS.textMuted, fontWeight: "700", fontSize: 12 },

  qtyWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: COLORS.cardAlt,
  },
  qtyBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyInput: {
    width: 54,
    height: 40,
    textAlign: "center",
    color: COLORS.text,
    fontWeight: "900",
    backgroundColor: COLORS.card,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: COLORS.border,
  },

  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: "rgba(220,38,38,0.25)",
    backgroundColor: "rgba(220,38,38,0.06)",
  },
  errorText: { color: COLORS.danger, fontWeight: "900", flex: 1 },

  validationHint: {
    marginTop: 8,
    color: COLORS.textMuted,
    fontWeight: "800",
    textAlign: "center",
  },
});
