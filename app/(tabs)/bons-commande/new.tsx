// app/(tabs)/bons-commande/new.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import DocumentScanner from "react-native-document-scanner-plugin";

import { AppHeader } from "../../../src/components/AppHeader";
import { AppCard } from "../../../src/components/AppCard";
import { AppSelect, AppSelectOption } from "../../../src/components/AppSelect";
import { COLORS, SPACING, RADIUS, FIELD, TYPO } from "../../../src/ui/theme";
import { api } from "../../../src/api/client";

// --- Types ---

type Mode = "PHARM_GROS" | "GROS_SUPER" | "SUPER_OFFICE";

type Produit = {
  id: number | string;
  nom?: string;
  name?: string;
  label?: string;
  price?: number;
};

type Rect = { x: number; y: number; width: number; height: number };

type TourKey =
  | "intro"
  | "scan"
  | "mode"
  | "selectA"
  | "selectB"
  | "observation"
  | "productCard"
  | "setQty"
  | "submit";

type TourTarget =
  | "none"
  | "scanCard"
  | "modeRow"
  | "selectA"
  | "selectB"
  | "observation"
  | "firstProductCard"
  | "firstQtyWrap"
  | "submitBtn";

type TourScroll = "header" | "products" | "bottom";

type TourStep = {
  key: TourKey;
  title: string;
  text: string;
  required?: boolean;
  target: TourTarget;
  scroll: TourScroll;
  highlightRadius: number;
};

// --- Helpers ---

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function asLabel(x: unknown): string {
  if (!isRecord(x)) return "#?";
  const label =
    (x.label as string | undefined) ??
    (x.nom as string | undefined) ??
    (x.name as string | undefined) ??
    (x.title as string | undefined);

  const first = (x.first_name as string | undefined) ?? "";
  const last = (x.last_name as string | undefined) ?? "";
  const full = `${first} ${last}`.trim();

  const id = (x.id as string | number | undefined) ?? "?";
  return String(label ?? (full ? full : `#${id}`));
}

function getRegionLabel(x: unknown): string {
  if (!isRecord(x)) return "";

  const wilaya =
    (isRecord(x.wilaya) ? (x.wilaya.nom as string | undefined) : undefined) ??
    (x.wilaya_nom as string | undefined) ??
    (x.wilayaName as string | undefined) ??
    (x.wilaya as string | undefined) ??
    (isRecord(x.regions_wilaya) ? (x.regions_wilaya.nom as string | undefined) : undefined);

  const commune =
    (isRecord(x.commune) ? (x.commune.nom as string | undefined) : undefined) ??
    (x.commune_nom as string | undefined) ??
    (x.communeName as string | undefined) ??
    (x.commune as string | undefined) ??
    (isRecord(x.regions_commune) ? (x.regions_commune.nom as string | undefined) : undefined);

  if (wilaya && commune) return `${wilaya} / ${commune}`;
  return String(wilaya || commune || "");
}

function mapClientOptions(list: unknown[] | undefined | null): AppSelectOption[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((x) => isRecord(x) && x.id !== undefined && x.id !== null)
    .map((x) => {
      const rx = x as Record<string, unknown>;
      const label = String(rx.nom ?? rx.name ?? rx.label ?? `#${rx.id ?? "?"}`);
      const subtitle = getRegionLabel(rx);
      const keywords = `${rx.id ?? ""} ${label} ${subtitle}`.trim();

      return {
        id: rx.id as string | number,
        label,
        subtitle,
        keywords,
        row_border: rx.row_border as any,
        plan_border: rx.plan_border as any,
      };
    });
}

function clampQty(v: string) {
  const n = Number(String(v).replace(/[^\d]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(99999, Math.trunc(n)));
}

async function measureRef(ref: React.RefObject<unknown>): Promise<Rect | null> {
  return new Promise((resolve) => {
    const node = (ref.current as { measureInWindow?: Function } | null) ?? null;
    if (!node || typeof node.measureInWindow !== "function") return resolve(null);
    (node.measureInWindow as (cb: (x: number, y: number, w: number, h: number) => void) => void)(
      (x: number, y: number, width: number, height: number) => {
        if (!Number.isFinite(x) || !Number.isFinite(y) || width <= 0 || height <= 0) return resolve(null);
        resolve({ x, y, width, height });
      }
    );
  });
}

function padRect(r: Rect, pad: number): Rect {
  return { x: r.x - pad, y: r.y - pad, width: r.width + pad * 2, height: r.height + pad * 2 };
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

// --- Components ---

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
    <Pressable onPress={onPress} style={[styles.modePill, active ? styles.modePillActive : null]}>
      <Text style={[styles.modeTitle, active ? { color: COLORS.brandDark } : null]}>{title}</Text>
      <Text style={styles.modeSub}>{subtitle}</Text>
    </Pressable>
  );
});

const ProductCard = React.memo(function ProductCard({
  item,
  qty,
  onChangeQty,
  disabledQty,
  qtyWrapRef,
}: {
  item: Produit;
  qty: number;
  onChangeQty: (next: number) => void;
  disabledQty?: boolean;
  qtyWrapRef?: React.Ref<View>; 
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

      <View
        ref={qtyWrapRef}
        collapsable={false}
        style={[styles.qtyWrap, disabledQty ? { opacity: 0.45 } : null]}
      >
        <Pressable
          onPress={() => onChangeQty(Math.max(0, qty - 1))}
          style={styles.qtyBtn}
          hitSlop={8}
          disabled={!!disabledQty}
        >
          <Ionicons name="remove" size={18} color={COLORS.text} />
        </Pressable>

        <TextInput
          value={String(qty)}
          onChangeText={(t) => onChangeQty(clampQty(t))}
          keyboardType="number-pad"
          style={styles.qtyInput}
          editable={!disabledQty}
        />

        <Pressable
          onPress={() => onChangeQty(qty + 1)}
          style={styles.qtyBtn}
          hitSlop={8}
          disabled={!!disabledQty}
        >
          <Ionicons name="add" size={18} color={COLORS.text} />
        </Pressable>
      </View>
    </View>
  );
});

// --- Main Screen ---

export default function NewBonCommandeScreen() {
  const router = useRouter();
  const { width: W, height: H } = useWindowDimensions();

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

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [observation, setObservation] = useState("");

  const [productQuery] = useState("");
  const [qtyById, setQtyById] = useState<Record<string, number>>({});

  // -----------------------
  // Demo / Tour refs
  // -----------------------
  const refRoot = useRef<View>(null);
  const [rootOffset, setRootOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const listRef = useRef<FlatList<Produit>>(null);
  const scrollOffsetRef = useRef(0);
  const firstQtyFixDoneRef = useRef(false);

  // Tour element refs
  const refScanCard = useRef<View>(null);
  const refModeRow = useRef<View>(null);
  const refSelectA = useRef<View>(null);
  const refSelectB = useRef<View>(null);
  const refObs = useRef<TextInput>(null);

  const refFirstProductCard = useRef<View>(null);
  const refFirstQtyWrap = useRef<View>(null);
  const refSubmitBtn = useRef<View>(null);

  const [tourOpen, setTourOpen] = useState(false);
  const [tourIndex, setTourIndex] = useState(0);
  const [tourRect, setTourRect] = useState<Rect | null>(null);

  const onListScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
  };

  const measureRootOffset = useCallback(async () => {
    const r = await measureRef(refRoot);
    if (r) setRootOffset({ x: r.x, y: r.y });
  }, []);

  // --- load referentiels
  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoadingRefs(true);
      setError(null);
      try {
        const { data } = await api.get("/bons-commande/referentiels");
        if (!mounted) return;

        const pharmaciesRaw = data?.pharmacies || data?.pharmacy || data?.pharmaciesList || [];
        const grossistesRaw = data?.grossistes || data?.gros || data?.grossistesList || [];
        const superGrossistesRaw = data?.superGrossistes || data?.super_gros || data?.clients || [];
        const produitsList = data?.produits || data?.products || data?.items || [];

        setPharmacies(mapClientOptions(pharmaciesRaw));
        setGrossistes(mapClientOptions(grossistesRaw));
        setSuperGrossistes(mapClientOptions(superGrossistesRaw));
        setProduits(produitsList);
      } catch (e: unknown) {
        console.error(e);
        if (!mounted) return;
        setError("Impossible de charger les référentiels.");
      } finally {
        if (mounted) setLoadingRefs(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const applyMode = useCallback((next: Mode) => {
    setMode(next);
    setError(null);
    if (next === "PHARM_GROS") setSuperGrosId(null);
    else if (next === "GROS_SUPER") setPharmacyId(null);
    else {
      setPharmacyId(null);
      setGrosId(null);
    }
  }, []);

  const scanDocument = useCallback(async () => {
    try {
      setError(null);
      const result = await DocumentScanner.scanDocument({
        maxNumDocuments: 1,
        letUserAdjustCrop: true,
      } as any);
      const scanned = (result as any)?.scannedImages as string[] | undefined;
      if (scanned && scanned.length > 0) setImageUri(scanned[0]);
    } catch (e) {
      console.error(e);
      Alert.alert("Scan", "Échec du scan du document.");
    }
  }, []);

  const clearScan = useCallback(() => {
    setImageUri(null);
  }, []);

  const filteredProduits = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return produits;
    return produits.filter((p) => String(asLabel(p)).toLowerCase().includes(q));
  }, [produits, productQuery]);

  const selectedItems = useMemo(() => {
    return Object.entries(qtyById)
      .filter(([, q]) => q > 0)
      .map(([produit_id, qtt]) => ({
        produit_id: /^\d+$/.test(produit_id) ? Number(produit_id) : produit_id,
        qtt,
      }));
  }, [qtyById]);

  const setQty = useCallback((id: number | string, next: number) => {
    setQtyById((prev) => {
      if (prev[String(id)] === next) return prev;
      return { ...prev, [String(id)]: next };
    });
  }, []);

  const validationMessage = useMemo(() => {
    if (!imageUri) return "Image requise (scan du bon).";
    if (mode === "PHARM_GROS") {
      if (!pharmacyId) return "Sélectionnez une pharmacie.";
      if (!grosId) return "Sélectionnez un grossiste.";
    }
    if (mode === "GROS_SUPER") {
      if (!grosId) return "Sélectionnez un grossiste.";
      if (!superGrosId) return "Sélectionnez un super grossiste.";
    }
    if (mode === "SUPER_OFFICE") {
      if (!superGrosId) return "Sélectionnez un super grossiste.";
    }
    if (selectedItems.length < 1) return "Ajoutez au moins 1 produit.";
    return null;
  }, [imageUri, mode, pharmacyId, grosId, superGrosId, selectedItems.length]);

  // -----------------------
  // Demo / Tour Steps
  // -----------------------
  const selectALabel = useMemo(() => {
    if (mode === "PHARM_GROS") return "Pharmacie";
    if (mode === "GROS_SUPER") return "Grossiste";
    return "Super grossiste";
  }, [mode]);

  const selectBLabel = useMemo(() => {
    if (mode === "PHARM_GROS") return "Grossiste";
    return "Super grossiste";
  }, [mode]);

  const steps = useMemo<TourStep[]>(() => {
    const base: TourStep[] = [
      {
        key: "intro",
        title: "Démo : Bon de commande",
        text: "Nous allons apprendre à créer un bon de commande.",
        target: "none",
        scroll: "header",
        highlightRadius: RADIUS.lg,
      },
      {
        key: "scan",
        title: "1) Scanner le bon",
        text: "Commencez par scanner la photo du bon. Obligatoire.",
        required: true,
        target: "scanCard",
        scroll: "header",
        highlightRadius: RADIUS.lg,
      },
      {
        key: "mode",
        title: "2) Circuit de distribution",
        text: "Choisissez le circuit de distribution.",
        required: false,
        target: "modeRow",
        scroll: "header",
        highlightRadius: RADIUS.lg,
      },
      {
        key: "selectA",
        title: `3) ${selectALabel}`,
        text: `Sélectionnez le ${selectALabel.toLowerCase()} pour ce bon.`,
        required: true,
        target: "selectA",
        scroll: "header",
        highlightRadius: FIELD.radius,
      },
    ];

    if (mode !== "SUPER_OFFICE") {
      base.push({
        key: "selectB",
        title: `4) ${selectBLabel}`,
        text: `Sélectionnez le ${selectBLabel.toLowerCase()}.`,
        required: true,
        target: "selectB",
        scroll: "header",
        highlightRadius: FIELD.radius,
      });
    }

    base.push(
      {
        key: "observation",
        title: "5) Observation",
        text: "Ajoutez une remarque si besoin.",
        required: false,
        target: "observation",
        scroll: "header",
        highlightRadius: FIELD.radius,
      },
      {
        key: "productCard",
        title: "6) Liste des produits",
        text: "Ici vous réglez les quantités des produits.",
        required: false,
        target: "firstProductCard",
        scroll: "products",
        highlightRadius: RADIUS.lg,
      },
      {
        key: "setQty",
        title: "7) Ajouter une quantité",
        text: "Mettez une quantité > 0 sur au moins un produit.",
        required: true,
        target: "firstQtyWrap",
        scroll: "products",
        highlightRadius: 999,
      },
      {
        key: "submit",
        title: "8) Finaliser",
        text: "Vous pouvez ajuster les quantités sur plusieurs produits avant de finaliser le bon, puis cliquer sur ce bouton pour créer le bon de commande.",
        required: false,
        target: "submitBtn",
        scroll: "bottom",
        highlightRadius: FIELD.radius,
      }
    );

    return base;
  }, [mode, selectALabel, selectBLabel]);

  useEffect(() => {
    if (!tourOpen) return;
    if (tourIndex > steps.length - 1) setTourIndex(steps.length - 1);
  }, [steps.length, tourIndex, tourOpen]);

  const currentStep = steps[tourIndex] ?? steps[0];

  const stepSatisfied = useCallback((): boolean => {
    switch (currentStep.key) {
      case "scan":
        return !!imageUri;
      case "selectA":
        if (mode === "PHARM_GROS") return !!pharmacyId;
        if (mode === "GROS_SUPER") return !!grosId;
        return !!superGrosId;
      case "selectB":
        if (mode === "PHARM_GROS") return !!grosId;
        return !!superGrosId;
      case "setQty":
        return selectedItems.length > 0;
      default:
        return true;
    }
  }, [currentStep.key, imageUri, mode, pharmacyId, grosId, superGrosId, selectedItems.length]);

  const nextDisabled = !!currentStep.required && !stepSatisfied();

  const startTour = useCallback(async () => {
    setError(null);
    firstQtyFixDoneRef.current = false;
    setTourRect(null);
    setTourIndex(0);
    setTourOpen(true);
    await measureRootOffset();
    requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }));
  }, [measureRootOffset]);

  const stopTour = useCallback(() => {
    setTourOpen(false);
    setTourRect(null);
  }, []);

  const prevTour = useCallback(() => {
    setTourIndex((i) => Math.max(0, i - 1));
  }, []);

  const nextTour = useCallback(() => {
    setTourIndex((i) => Math.min(steps.length - 1, i + 1));
  }, [steps.length]);

  useEffect(() => {
    if (!tourOpen) return;
    if (!currentStep.required) return;
    if (!stepSatisfied()) return;
    if (tourIndex >= steps.length - 1) return;

    const t = setTimeout(() => {
      nextTour();
    }, 650);
    return () => clearTimeout(t);
  }, [tourOpen, currentStep.required, stepSatisfied, tourIndex, steps.length, nextTour]);

  const targetRef = useMemo(() => {
    switch (currentStep.target) {
      case "scanCard": return refScanCard;
      case "modeRow": return refModeRow;
      case "selectA": return refSelectA;
      case "selectB": return refSelectB;
      case "observation": return refObs;
      case "firstProductCard": return refFirstProductCard;
      case "firstQtyWrap": return refFirstQtyWrap;
      case "submitBtn": return refSubmitBtn;
      default: return null;
    }
  }, [currentStep.target]);

  const blockQtyInteractions = tourOpen && currentStep.key === "productCard";

  // ------------------------------------------------------------------
  //  SCROLLING LOGIC
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!tourOpen) return;
    
    let cancelled = false;

    const performStep = async () => {
      setTourRect(null);

      // 1. Primary Direct Scroll
      if (currentStep.scroll === "header") {
         if (tourIndex === 0) listRef.current?.scrollToOffset({ offset: 0, animated: true });
      } 
      else if (currentStep.scroll === "products") {
        if (filteredProduits.length > 0) {
           if (refObs.current) {
             const obsRect = await measureRef(refObs);
             if (obsRect) {
               const currentOffset = scrollOffsetRef.current;
               const headerBottomAbs = currentOffset + obsRect.y + obsRect.height;
               listRef.current?.scrollToOffset({ offset: headerBottomAbs - 20, animated: true });
             } else {
               listRef.current?.scrollToOffset({ offset: 600, animated: true });
             }
           } else {
             listRef.current?.scrollToOffset({ offset: 600, animated: true });
           }
        }
      } 
      else if (currentStep.scroll === "bottom") {
        listRef.current?.scrollToEnd({ animated: true });
      }

      await new Promise(r => setTimeout(r, 600)); 
      if (cancelled) return;

      if (!targetRef?.current) {
        setTourRect(null);
        return;
      }

      // 2. Measure & Ensure Visibility
      let rect = await measureRef(targetRef);
      if (!rect) {
        await new Promise(r => setTimeout(r, 300));
        rect = await measureRef(targetRef);
      }

      if (cancelled || !rect) return;

      const absoluteY = rect.y;
      const elementHeight = rect.height;
      
      const isAbove = absoluteY < 80; 
      const isBelow = (absoluteY + elementHeight) > (H - 80);

      if (isAbove || isBelow) {
         const currentOffset = scrollOffsetRef.current;
         const screenCenterY = H / 2;
         const elementCenterY = absoluteY + elementHeight / 2;
         const delta = elementCenterY - screenCenterY;
         
         const targetOffset = Math.max(0, currentOffset + delta);
         
         listRef.current?.scrollToOffset({ offset: targetOffset, animated: true });
         
         await new Promise(r => setTimeout(r, 450));
         rect = await measureRef(targetRef);
      }

      if (!rect) return;

      const adjusted: Rect = {
        x: rect.x - rootOffset.x,
        y: rect.y - rootOffset.y,
        width: rect.width,
        height: rect.height,
      };

      setTourRect(padRect(adjusted, 6));
    };

    performStep();

    return () => { cancelled = true; };
  }, [tourIndex, currentStep, targetRef, rootOffset, filteredProduits.length, H, tourOpen]);

  // ... TourOverlay ...
  const TourOverlay = () => {
    if (!tourOpen) return null;
    const rect = tourRect;
    const tooltipWidth = Math.min(W - 40, 340);
    const tooltipX = rect
      ? clamp(rect.x + rect.width / 2 - tooltipWidth / 2, 20, W - 20 - tooltipWidth)
      : (W - tooltipWidth) / 2;
    const preferBelow = rect ? H - (rect.y + rect.height) > 240 : true;
    const tooltipY = rect ? (preferBelow ? rect.y + rect.height + 16 : rect.y - 16) : H * 0.35;
    const finalTooltipY = preferBelow ? tooltipY : Math.max(40, tooltipY - 190);
    const hr = currentStep.highlightRadius;

    const topH = rect ? Math.max(0, rect.y) : H;
    const leftW = rect ? Math.max(0, rect.x) : W;
    const rightW = rect ? Math.max(0, W - (rect.x + rect.width)) : 0;
    const bottomH = rect ? Math.max(0, H - (rect.y + rect.height)) : 0;

    return (
      <View style={[StyleSheet.absoluteFill, { zIndex: 9999, elevation: 9999 }]} pointerEvents="box-none">
        {rect ? (
          <>
            <View style={[tourStyles.dim, { left: 0, top: 0, width: W, height: topH }]} />
            <View style={[tourStyles.dim, { left: 0, top: rect.y, width: leftW, height: rect.height }]} />
            <View style={[tourStyles.dim, { left: rect.x + rect.width, top: rect.y, width: rightW, height: rect.height }]} />
            <View style={[tourStyles.dim, { left: 0, top: rect.y + rect.height, width: W, height: bottomH }]} />
            <View style={[tourStyles.highlight, { left: rect.x, top: rect.y, width: rect.width, height: rect.height, borderRadius: hr }]} pointerEvents="none" />
          </>
        ) : (
          <View style={[tourStyles.dim, StyleSheet.absoluteFill]} />
        )}

        <View
          style={[
            tourStyles.card,
            {
              width: tooltipWidth,
              left: tooltipX,
              top: rect && !preferBelow ? undefined : finalTooltipY,
              bottom: rect && !preferBelow ? H - rect.y + 16 : undefined,
            },
          ]}
        >
          <View style={tourStyles.cardHeader}>
            <Text style={tourStyles.cardTitle}>{currentStep.title}</Text>
            <Pressable onPress={stopTour} hitSlop={15}>
              <Ionicons name="close" size={20} color={COLORS.textMuted} />
            </Pressable>
          </View>
          <Text style={tourStyles.cardBody}>{currentStep.text}</Text>
          {nextDisabled ? (
            <Text style={tourStyles.requiredHint}>Action requise pour continuer.</Text>
          ) : null}
          <View style={tourStyles.cardFooter}>
            <Text style={tourStyles.stepIndicator}>{tourIndex + 1} / {steps.length}</Text>
            <View style={tourStyles.actions}>
              <Pressable
                onPress={prevTour}
                disabled={tourIndex === 0}
                style={({ pressed }) => [tourStyles.btnSecondary, tourIndex === 0 && { opacity: 0.35 }, pressed && { opacity: 0.7 }]}
              >
                <Text style={tourStyles.btnSecondaryText}>Précédent</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (nextDisabled) {
                    Alert.alert("Action requise", "Veuillez compléter l'étape.");
                    return;
                  }
                  if (tourIndex === steps.length - 1) {
                    stopTour();
                    return;
                  }
                  nextTour();
                }}
                style={({ pressed }) => [tourStyles.btnPrimary, nextDisabled && { opacity: 0.45 }, pressed && !nextDisabled && { opacity: 0.92 }]}
              >
                <Text style={tourStyles.btnPrimaryText}>{tourIndex === steps.length - 1 ? "Terminer" : "Suivant"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    );
  };

  const onSubmit = useCallback(async () => {
    setError(null);
    if (tourOpen) {
      Alert.alert("Démo", "✅ Bon de commande prêt !");
      stopTour();
      return;
    }
    const msg = validationMessage;
    if (msg) {
      setError(msg);
      return;
    }
    try {
      setSubmitting(true);
      const form = new FormData();
      form.append("image", { uri: imageUri as string, name: `order_${Date.now()}.jpg`, type: "image/jpeg" } as any);
      if (observation.trim()) form.append("observation", observation.trim());
      
      if (mode === "PHARM_GROS") {
        form.append("pharmacy_id", String(pharmacyId));
        form.append("gros_id", String(grosId));
      } else if (mode === "GROS_SUPER") {
        form.append("gros_id", String(grosId));
        form.append("super_gros_id", String(superGrosId));
      } else {
        form.append("super_gros_id", String(superGrosId));
      }
      form.append("items", JSON.stringify(selectedItems));
      await api.post("/bons-commande", form);
      Alert.alert("Succès", "Bon de commande créé.");
      router.back();
    } catch (e: any) {
      console.error(e);
      const apiMsg = e?.response?.data?.error || "Erreur inconnue.";
      setError(String(apiMsg));
    } finally {
      setSubmitting(false);
    }
  }, [tourOpen, stopTour, validationMessage, imageUri, observation, mode, pharmacyId, grosId, superGrosId, selectedItems, router]);

  const header = useMemo(() => {
    return (
      <View style={{ padding: SPACING.md, paddingBottom: SPACING.sm }}>
        <View ref={refScanCard} collapsable={false}>
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
                  <Pressable onPress={scanDocument} style={[styles.btn, styles.btnSecondary, { flex: 1 }]}>
                    <Ionicons name="scan" size={18} color={COLORS.text} />
                    <Text style={[styles.btnText, { color: COLORS.text }]}>Re-scanner</Text>
                  </Pressable>
                  <View style={{ width: SPACING.sm }} />
                  <Pressable onPress={clearScan} style={[styles.btn, styles.btnDanger, { flex: 1 }]}>
                    <Ionicons name="trash" size={18} color="#fff" />
                    <Text style={[styles.btnText, { color: "#fff" }]}>Supprimer</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable onPress={scanDocument} style={[styles.btn, styles.btnPrimary]} disabled={loadingRefs}>
                <Ionicons name="scan" size={18} color={COLORS.textOnBrand} />
                <Text style={[styles.btnText, { color: COLORS.textOnBrand }]}>Scanner le bon</Text>
              </Pressable>
            )}
          </AppCard>
        </View>

        <View style={{ height: SPACING.md }} />

        <AppCard>
          <Text style={styles.sectionTitle}>Type de client</Text>
          <Text style={styles.sectionSub}>نوع العميل</Text>
          <View style={{ height: SPACING.md }} />
          <View ref={refModeRow} collapsable={false} style={styles.modeRow}>
            <ModePill active={mode === "PHARM_GROS"} title={"Pharmacie\n+\nGros"} subtitle={"صيدلية\n+\nموزع"} onPress={() => applyMode("PHARM_GROS")} />
            <ModePill active={mode === "GROS_SUPER"} title={"Gros\n+\nSuper"} subtitle={"موزع\n+\nسوبر"} onPress={() => applyMode("GROS_SUPER")} />
            <ModePill active={mode === "SUPER_OFFICE"} title={"Super\n+\nOffice"} subtitle={"سوبر\n+\nمكتب"} onPress={() => applyMode("SUPER_OFFICE")} />
          </View>
          <View style={{ height: SPACING.md }} />
          
          {mode === "PHARM_GROS" ? (
            <>
              <View ref={refSelectA} collapsable={false}><AppSelect title="Pharmacie" value={pharmacyId} options={pharmacies} onChange={setPharmacyId} placeholder="Sélectionnezr..." showId /></View>
              <View style={{ height: SPACING.md }} />
              <View ref={refSelectB} collapsable={false}><AppSelect title="Grossiste" value={grosId} options={grossistes} onChange={setGrosId} placeholder="Sélectionnezr..." showId /></View>
            </>
          ) : mode === "GROS_SUPER" ? (
            <>
              <View ref={refSelectA} collapsable={false}><AppSelect title="Grossiste" value={grosId} options={grossistes} onChange={setGrosId} placeholder="Sélectionnezr..." showId /></View>
              <View style={{ height: SPACING.md }} />
              <View ref={refSelectB} collapsable={false}><AppSelect title="Super grossiste" value={superGrosId} options={superGrossistes} onChange={setSuperGrosId} placeholder="Sélectionnezr..." showId /></View>
            </>
          ) : (
             <View ref={refSelectA} collapsable={false}><AppSelect title="Super grossiste" value={superGrosId} options={superGrossistes} onChange={setSuperGrosId} placeholder="Sélectionnezr..." showId /></View>
          )}

          <View style={{ height: SPACING.lg }} />
          <Text style={styles.fieldLabel}>Observation (optionnel)</Text>
          <TextInput
            ref={refObs}
            collapsable={false}
            value={observation}
            onChangeText={setObservation}
            placeholder="Détails, remarque..."
            style={[styles.textArea]}
            multiline
          />
        </AppCard>

        <View style={{ height: SPACING.md }} />
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
  }, [imageUri, mode, pharmacyId, grosId, superGrosId, pharmacies, grossistes, superGrossistes, loadingRefs, observation, error, scanDocument, clearScan, applyMode]);

  const footer = useMemo(() => {
    return (
      <View style={{ paddingHorizontal: SPACING.md, paddingBottom: SPACING.lg }}>
        <View ref={refSubmitBtn} collapsable={false}>
          <Pressable
            onPress={onSubmit}
            disabled={submitting || (!!validationMessage && !tourOpen)}
            style={({ pressed }) => [styles.btn, styles.btnPrimary, (submitting || (!!validationMessage && !tourOpen)) && { opacity: 0.55 }, pressed && { opacity: 0.9 }]}
          >
            <Ionicons name="save" size={18} color={COLORS.textOnBrand} />
            <Text style={[styles.btnText, { color: COLORS.textOnBrand }]}>
              {submitting ? "Création..." : "Créer le bon de commande"}
            </Text>
          </Pressable>
        </View>
        {validationMessage ? <Text style={styles.validationHint}>{validationMessage}</Text> : null}
        <View style={{ height: SPACING.lg }} />
      </View>
    );
  }, [onSubmit, submitting, validationMessage, tourOpen]);

  return (
    <View ref={refRoot} collapsable={false} style={styles.root}>
      <AppHeader
        title="Nouveau bon"
        titleAr="طلبية جديدة"
        onBack={() => router.back()}
        rightSlot={
          <Pressable onPress={startTour} hitSlop={10} style={{ width: 44, height: 44, alignItems: "flex-end", justifyContent: "center" }}>
            <Ionicons name="help-circle-outline" size={24} color={COLORS.textOnBrand} />
          </Pressable>
        }
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <FlatList
          ref={listRef}
          data={filteredProduits}
          keyExtractor={(item) => String(item.id)}
          ListHeaderComponent={header}
          ListFooterComponent={footer}
          scrollEnabled={!tourOpen} // <--- BLOCKS USER SCROLL DURING DEMO
          contentContainerStyle={{ paddingBottom: H * 0.4 }}
          keyboardShouldPersistTaps="handled"
          onScroll={onListScroll}
          scrollEventThrottle={16}
          renderItem={({ item, index }) => {
            const id = item.id;
            const qty = qtyById[String(id)] ?? 0;
            return (
              <View
                ref={index === 0 ? refFirstProductCard : undefined}
                collapsable={false}
                style={{ paddingHorizontal: SPACING.md, paddingBottom: SPACING.md, height: 100 }}
              >
                <ProductCard
                  item={item}
                  qty={qty}
                  onChangeQty={(next) => setQty(id, next)}
                  disabledQty={blockQtyInteractions}
                  qtyWrapRef={index === 0 ? refFirstQtyWrap : undefined}
                />
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={{ padding: SPACING.md }}>
              <Text style={{ color: COLORS.textMuted }}>
                {loadingRefs ? "Chargement des produits..." : "Aucun produit trouvé."}
              </Text>
            </View>
          }
        />
      </KeyboardAvoidingView>
      <TourOverlay />
    </View>
  );
}

const tourStyles = StyleSheet.create({
  dim: { position: "absolute", backgroundColor: "rgba(0,0,0,0.7)" },
  highlight: { position: "absolute", borderWidth: 3, borderColor: "rgba(255,255,255,0.92)", borderRadius: 12 },
  card: { position: "absolute", backgroundColor: "white", borderRadius: 16, padding: 18, elevation: 10 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: "900", color: "#1A1A1A" },
  cardBody: { fontSize: 14, color: "#4A4A4A", marginBottom: 8 },
  requiredHint: { fontSize: 12, fontWeight: "900", color: COLORS.danger, marginBottom: 10 },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  stepIndicator: { fontSize: 12, fontWeight: "800", color: "#9AA0A6" },
  actions: { flexDirection: "row", gap: 12 },
  btnSecondary: { paddingVertical: 8, paddingHorizontal: 12 },
  btnSecondaryText: { fontSize: 14, fontWeight: "700", color: "#666" },
  btnPrimary: { backgroundColor: COLORS.brand || "#007AFF", paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10 },
  btnPrimaryText: { fontSize: 14, fontWeight: "900", color: "white" },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  sectionTitle: { fontSize: TYPO.h2, fontWeight: "900", color: COLORS.text },
  sectionSub: { marginTop: 2, color: COLORS.textMuted, fontWeight: "700", writingDirection: "rtl" },
  row: { flexDirection: "row", alignItems: "center" },
  productQtyLabel: { marginTop: 6, color: COLORS.textMuted, fontWeight: "800", fontSize: 12 },
  btn: { height: FIELD.height, borderRadius: FIELD.radius, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 14 },
  btnPrimary: { backgroundColor: COLORS.brand },
  btnSecondary: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
  btnDanger: { backgroundColor: COLORS.danger },
  btnText: { fontSize: 14, fontWeight: "900" },
  imageWrap: { height: 220, borderRadius: RADIUS.lg, overflow: "hidden", borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.cardAlt },
  image: { width: "100%", height: "100%" },
  modeRow: { flexDirection: "row", gap: SPACING.sm },
  modePill: { flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.lg, padding: 10, backgroundColor: COLORS.card },
  modePillActive: { borderColor: "rgba(50,161,55,0.40)", backgroundColor: COLORS.brandSoft },
  modeTitle: { fontWeight: "900", color: COLORS.text, fontSize: 12, textAlign: "center" },
  modeSub: { marginTop: 6, color: COLORS.textMuted, fontWeight: "800", fontSize: 11, textAlign: "center" },
  fieldLabel: { color: COLORS.textMuted, fontWeight: "900", fontSize: 12, marginBottom: 8 },
  textArea: { minHeight: 90, borderWidth: 1, borderColor: FIELD.border, borderRadius: FIELD.radius, backgroundColor: FIELD.bg, padding: 12, color: COLORS.text, fontWeight: "800", textAlignVertical: "top" },
  productCard: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.lg, padding: SPACING.md, flexDirection: "row", alignItems: "center", gap: SPACING.md },
  productName: { fontSize: 14, fontWeight: "900", color: COLORS.text },
  qtyWrap: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: COLORS.border, borderRadius: 999, overflow: "hidden", backgroundColor: COLORS.cardAlt },
  qtyBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  qtyInput: { width: 54, height: 40, textAlign: "center", color: COLORS.text, fontWeight: "900", backgroundColor: COLORS.card, borderLeftWidth: 1, borderRightWidth: 1, borderColor: COLORS.border },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: RADIUS.md, borderWidth: 1, borderColor: "rgba(220,38,38,0.25)", backgroundColor: "rgba(220,38,38,0.06)" },
  errorText: { color: COLORS.danger, fontWeight: "900", flex: 1 },
  validationHint: { marginTop: 8, color: COLORS.textMuted, fontWeight: "800", textAlign: "center" },
});