// app/(tabs)/bons-sortie/new.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { api } from "../../../src/api/client";
import { AppHeader } from "../../../src/components/AppHeader";
import { AppCard } from "../../../src/components/AppCard";
import { AppSelect, AppSelectOption } from "../../../src/components/AppSelect";
import { COLORS, FIELD, RADIUS, SPACING, TYPO } from "../../../src/ui/theme";

// --- Types & Helpers ---

type RefRes = {
  produits: { id: number; label: string }[];
};

type Rect = { x: number; y: number; width: number; height: number };

function clampNonNegativeInt(n: unknown): number {
  const v = Math.trunc(Number(n));
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

function wait(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

// Helper to measure a ref relative to the window
async function measureRef(ref: React.RefObject<unknown>): Promise<Rect | null> {
  return new Promise((resolve) => {
    const node = (ref.current as { measureInWindow?: Function } | null) ?? null;
    if (!node || typeof node.measureInWindow !== "function") return resolve(null);

    (node.measureInWindow as (cb: (x: number, y: number, w: number, h: number) => void) => void)(
      (x: number, y: number, width: number, height: number) => {
        if (!Number.isFinite(x) || !Number.isFinite(y) || width <= 0 || height <= 0) {
          resolve(null);
          return;
        }
        resolve({ x, y, width, height });
      }
    );
  });
}

function padRect(r: Rect, pad: number): Rect {
  return {
    x: r.x - pad,
    y: r.y - pad,
    width: r.width + pad * 2,
    height: r.height + pad * 2,
  };
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

// --- Main Component ---

type TourKey = "intro" | "obs" | "add" | "card" | "remove" | "brochure" | "sample" | "submit";
type TourTarget = "none" | "obs" | "add" | "card" | "remove" | "brochure" | "sample" | "submit";
type TourScroll = "top" | "card" | "bottom";

type TourStep = {
  key: TourKey;
  title: string;
  text: string;
  target: TourTarget;
  scroll: TourScroll;
  required?: boolean;
  highlightRadius?: number;
};

export default function NewBonSortieScreen() {
  const router = useRouter();
  const { width: W, height: H } = useWindowDimensions();

  // Root ref to fix coordinate offsets (Status bar / Safe Area)
  const refRoot = useRef<View | null>(null);
  const [rootOffset, setRootOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const listRef = useRef<FlatList<AppSelectOption>>(null);

  // ---- Tour refs (targets) ----
  const refObs = useRef<TextInput | null>(null);
  const refAddProduit = useRef<View | null>(null);
  const refBadge = useRef<View | null>(null); // Kept for rendering, not used as a tour step

  const refFirstCard = useRef<View | null>(null);
  const refFirstBrochure = useRef<View | null>(null);
  const refFirstSample = useRef<View | null>(null);
  const refFirstRemove = useRef<View | null>(null);

  const refSubmit = useRef<View | null>(null);

  // ---- Tour state ----
  const [tourOpen, setTourOpen] = useState(false);
  const [tourIndex, setTourIndex] = useState(0);
  const [tourRect, setTourRect] = useState<Rect | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Referentiels
  const [produits, setProduits] = useState<AppSelectOption[]>([]);

  // Form
  const depot = "principale"; // forced
  const [observation, setObservation] = useState("");

  // Selection / quantities
  const [selectedProduitIds, setSelectedProduitIds] = useState<number[]>([]);
  const [qttByProduitId, setQttByProduitId] = useState<Record<string, number>>({});

  const [brochureByProduitId, setBrochureByProduitId] = useState<Record<string, number>>({});
  const [sampleByProduitId, setSampleByProduitId] = useState<Record<string, number>>({});

  // (5) Fix initial scroll-jump on first qty interaction
  const scrollOffsetRef = useRef(0);
  const firstQtyFixDoneRef = useRef(false);

  const onListScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
  };

  const preserveScrollOnce = (offsetBefore: number) => {
    if (firstQtyFixDoneRef.current) return;
    firstQtyFixDoneRef.current = true;
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: offsetBefore, animated: false });
    });
  };

  const produitsById = useMemo(() => {
    const m = new Map<number, AppSelectOption>();
    for (const p of produits) m.set(Number(p.id), p);
    return m;
  }, [produits]);

  const selectedProduits = useMemo(() => {
    return selectedProduitIds
      .map((id) => produitsById.get(id))
      .filter(Boolean) as AppSelectOption[];
  }, [selectedProduitIds, produitsById]);

  const availableProduitOptions = useMemo(() => {
    return produits.filter((p) => !selectedProduitIds.some((id) => String(id) === String(p.id)));
  }, [produits, selectedProduitIds]);

  const anySelected = selectedProduitIds.length > 0;
  const hasFirstProduct = selectedProduits.length > 0;

  const allSelectedValid = useMemo(() => {
    for (const idNum of selectedProduitIds) {
      const k = String(idNum);
      const qtt = clampNonNegativeInt(qttByProduitId[k] ?? 0);
      if (qtt > 0) {
        const b = clampNonNegativeInt(brochureByProduitId[k] ?? 0);
        const s = clampNonNegativeInt(sampleByProduitId[k] ?? 0);
        if (b <= 0 && s <= 0) return false;
      }
    }
    return true;
  }, [selectedProduitIds, qttByProduitId, brochureByProduitId, sampleByProduitId]);

  const canSubmit = anySelected && allSelectedValid && !saving;

  const firstSelectedId = selectedProduitIds[0];
  const firstK = firstSelectedId ? String(firstSelectedId) : "";
  const firstBrochure = firstK ? clampNonNegativeInt(brochureByProduitId[firstK] ?? 0) : 0;
  const firstSample = firstK ? clampNonNegativeInt(sampleByProduitId[firstK] ?? 0) : 0;
  const firstQtyOk = firstBrochure > 0 || firstSample > 0;

  const loadRefs = async () => {
    setLoading(true);
    setError(null);
    try {
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
      setSelectedProduitIds((prev) => prev.filter((id) => opts.some((p) => Number(p.id) === Number(id))));
    } catch {
      setError("Impossible de charger les produits. Vérifiez votre connexion.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRefs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addProduit = (produitId: number) => {
    setSelectedProduitIds((prev) => {
      if (prev.includes(produitId)) return prev;
      return [...prev, produitId];
    });
    const k = String(produitId);
    setQttByProduitId((prev) => ({ ...prev, [k]: 1 }));
    setBrochureByProduitId((prev) => ({ ...prev, [k]: clampNonNegativeInt(prev[k] ?? 0) }));
    setSampleByProduitId((prev) => ({ ...prev, [k]: clampNonNegativeInt(prev[k] ?? 0) }));
  };

  const removeProduit = (produitId: number) => {
    setSelectedProduitIds((prev) => prev.filter((id) => id !== produitId));
    const k = String(produitId);
    setQttByProduitId((prev) => ({ ...prev, [k]: 0 }));
    setBrochureByProduitId((prev) => ({ ...prev, [k]: 0 }));
    setSampleByProduitId((prev) => ({ ...prev, [k]: 0 }));
  };

  const bumpBrochure = (produitId: number, delta: number) => {
    const before = scrollOffsetRef.current;
    const k = String(produitId);
    setBrochureByProduitId((prev) => {
      const cur = clampNonNegativeInt(prev[k] ?? 0);
      return { ...prev, [k]: Math.max(0, cur + delta) };
    });
    preserveScrollOnce(before);
  };

  const bumpSample = (produitId: number, delta: number) => {
    const before = scrollOffsetRef.current;
    const k = String(produitId);
    setSampleByProduitId((prev) => {
      const cur = clampNonNegativeInt(prev[k] ?? 0);
      return { ...prev, [k]: Math.max(0, cur + delta) };
    });
    preserveScrollOnce(before);
  };

  const setBrochureDirect = (produitId: number, raw: string) => {
    const before = scrollOffsetRef.current;
    const k = String(produitId);
    const cleaned = (raw ?? "").replace(/[^\d]/g, "");
    const next = cleaned === "" ? 0 : clampNonNegativeInt(cleaned);
    setBrochureByProduitId((prev) => ({ ...prev, [k]: next }));
    preserveScrollOnce(before);
  };

  const setSampleDirect = (produitId: number, raw: string) => {
    const before = scrollOffsetRef.current;
    const k = String(produitId);
    const cleaned = (raw ?? "").replace(/[^\d]/g, "");
    const next = cleaned === "" ? 0 : clampNonNegativeInt(cleaned);
    setSampleByProduitId((prev) => ({ ...prev, [k]: next }));
    preserveScrollOnce(before);
  };

  const submit = async () => {
    // (3) Demo behavior: if tour is open, never send a real bon de sortie
    if (tourOpen) {
      Alert.alert("Démo", "Maintenant vous savez comment créer un bon de sortie !");
      stopTour();
      return;
    }

    if (!canSubmit) return;

    const items = selectedProduitIds
      .map((idNum) => {
        const k = String(idNum);
        return {
          produitId: Number(idNum),
          qtt: clampNonNegativeInt(qttByProduitId[k] ?? 0),
          brochure: clampNonNegativeInt(brochureByProduitId[k] ?? 0),
          sample: clampNonNegativeInt(sampleByProduitId[k] ?? 0),
        };
      })
      .filter((it) => it.qtt > 0);

    if (!items.length) {
      Alert.alert("Erreur", "Sélectionnez au moins un produit.");
      return;
    }
    const bad = items.find((it) => it.brochure <= 0 && it.sample <= 0);
    if (bad) {
      Alert.alert("Erreur", "Chaque produit doit avoir brochure > 0 ou échantillon > 0.");
      return;
    }

    setSaving(true);
    try {
      await api.post("/bons-sortie", {
        depot,
        brochure: false,
        observation: observation?.trim() || "",
        items,
      });
      Alert.alert("Succès", "Bon de sortie créé.");
      router.replace("/bons-sortie");
    } catch {
      Alert.alert("Erreur", "Échec de création du bon de sortie.");
    } finally {
      setSaving(false);
    }
  };

  // -----------------------
  // Guided Tour Logic (updated for requirements)
  // -----------------------
  const tourSteps = useMemo<TourStep[]>(() => {
    const fallbackNote = "Action requise : Ajoutez un produit pour activer cette étape.";

    return [
      {
        key: "intro",
        title: "Démo: Bon de sortie",
        text: "Déclarez vos demandes d’échantillons et de brochures en quelques secondes. Laissez-vous guider pour une saisie sans erreur.",
        target: "none",
        scroll: "top",
      },
      {
        key: "obs",
        title: "Contexte de la visite (optionnel)",
        text: "Une info utile ? Notez-la ici.",
        target: "obs",
        scroll: "top",
        highlightRadius: FIELD.radius,
      },
      {
        key: "add",
        title: "Ajout rapide (obligatoire)",
        text: "Cherchez et sélectionnez votre produit ici. Pour continuer, ajoutez au moins 1 produit.",
        target: "add",
        scroll: "top",
        required: true,
        highlightRadius: FIELD.radius,
      },
      {
        key: "card",
        title: "Votre produit est prêt",
        text: hasFirstProduct
          ? "Voici la fiche produit."
          : fallbackNote,
        target: hasFirstProduct ? "card" : "add",
        scroll: hasFirstProduct ? "card" : "top",
        highlightRadius: RADIUS.lg ?? 16,
      },
      {
        key: "remove",
        title: "Supprimer un produit (optionnel)",
        text: hasFirstProduct
          ? "Si vous vous êtes trompé, vous pouvez supprimer ce produit. Sinon, appuyez sur Suivant."
          : fallbackNote,
        target: hasFirstProduct ? "remove" : "add",
        scroll: hasFirstProduct ? "card" : "top",
        highlightRadius: 999,
      },
      {
        key: "brochure",
        title: "Quantités (obligatoire)",
        text: hasFirstProduct
          ? "Indiquez au moins 1 brochure OU 1 échantillon pour continuer."
          : fallbackNote,
        target: hasFirstProduct ? "brochure" : "add",
        scroll: hasFirstProduct ? "card" : "top",
        required: true,
        highlightRadius: 14, // matches counterBox
      },
      {
        key: "sample",
        title: "Quantité Échantillons",
        text: hasFirstProduct
          ? "On vous a obligé à ajouter une brochure pour cette démo, mais vous auriez pu choisir des échantillons à la place, ou les deux."
          : fallbackNote,
        target: hasFirstProduct ? "sample" : "add",
        scroll: hasFirstProduct ? "card" : "top",
        highlightRadius: 14,
      },
      {
        key: "submit",
        title: "Finalisation (démo)",
        text: "Vous pouvez reprendre les étapes précédentes pour ajouter plusieurs produits. Une fois que votre bon est prêt, appuyez sur ce bouton pour le créer.",
        target: "submit",
        scroll: "bottom",
        highlightRadius: RADIUS.lg ?? 16,
      },
    ];
  }, [hasFirstProduct]);

  // Measure the root view one time to determine offset (status bar, etc.)
  const measureRootOffset = async () => {
    const r = await measureRef(refRoot);
    if (r) setRootOffset({ x: r.x, y: r.y });
  };

  const startTour = async () => {
    Keyboard.dismiss();
    await measureRootOffset();
    setTourIndex(0);
    setTourRect(null);
    setTourOpen(true);
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
  };

  const stopTour = () => {
    setTourOpen(false);
    setTourRect(null);
  };

  const nextTour = () => {
    setTourIndex((i) => Math.min(i + 1, tourSteps.length - 1));
  };

  const prevTour = () => {
    setTourIndex((i) => Math.max(i - 1, 0));
  };

  const currentTourStep = tourSteps[tourIndex] ?? tourSteps[0];

  // (2) Required step gating
  const isStepSatisfied = (step: TourStep): boolean => {
    switch (step.key) {
      case "add":
        return selectedProduitIds.length > 0;
      case "brochure":
        return selectedProduitIds.length > 0 && firstQtyOk;
      default:
        return true;
    }
  };

  const nextDisabled = Boolean(currentTourStep.required && !isStepSatisfied(currentTourStep));

  // Map step keys to actual Refs
  const targetRef = useMemo(() => {
    switch (currentTourStep.target) {
      case "obs":
        return refObs;
      case "add":
        return refAddProduit;
      case "card":
        return refFirstCard;
      case "brochure":
        return refFirstBrochure;
      case "sample":
        return refFirstSample;
      case "remove":
        return refFirstRemove;
      case "submit":
        return refSubmit;
      default:
        return null;
    }
  }, [currentTourStep.target]);

  // (4) Block brochure/sample interactions during "card" step
  const blockQtyInteractions = tourOpen && currentTourStep.key === "card";

  // --- AUTO ADVANCE LOGIC (only for required add step) ---
  useEffect(() => {
    if (tourOpen && currentTourStep.key === "add" && selectedProduitIds.length > 0) {
      const timer = setTimeout(() => {
        nextTour();
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [tourOpen, currentTourStep.key, selectedProduitIds.length]); // intentional

  useEffect(() => {
    if (!tourOpen) return;

    const run = async () => {
      // 1. Handle Scrolling
      setTourRect(null);

      if (currentTourStep.scroll === "top") {
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      } else if (currentTourStep.scroll === "card") {
        if (selectedProduits.length > 0) {
          try {
            listRef.current?.scrollToIndex({ index: 0, animated: true, viewPosition: 0.1 });
          } catch {
            listRef.current?.scrollToOffset({ offset: 240, animated: true });
          }
        } else {
          listRef.current?.scrollToOffset({ offset: 0, animated: true });
        }
      } else if (currentTourStep.scroll === "bottom") {
        listRef.current?.scrollToEnd({ animated: true });
      }

      await wait(350);

      // 2. Measure Target
      if (!targetRef) {
        setTourRect(null);
        return;
      }

      let rect = await measureRef(targetRef);
      if (!rect) {
        await wait(300);
        rect = await measureRef(targetRef);
      }

      // 3. Adjust Coordinate System (Global -> Local)
      if (rect) {
        const adjustedRect: Rect = {
          ...rect,
          x: rect.x - rootOffset.x,
          y: rect.y - rootOffset.y,
        };
        setTourRect(padRect(adjustedRect, 6));
      } else {
        setTourRect(null);
      }
    };

    run();
  }, [tourOpen, tourIndex, currentTourStep, targetRef, W, H, selectedProduits.length, rootOffset]);

  // -----------------------
  // Overlay Component
  // -----------------------
  const TourOverlay = () => {
    if (!tourOpen) return null;

    const rect = tourRect;
    const tooltipWidth = Math.min(W - 40, 320);

    const tooltipX = rect
      ? clamp(rect.x + rect.width / 2 - tooltipWidth / 2, 20, W - 20 - tooltipWidth)
      : (W - tooltipWidth) / 2;

    const preferBelow = rect ? H - (rect.y + rect.height) > 220 : true;
    const tooltipY = rect ? (preferBelow ? rect.y + rect.height + 16 : rect.y - 16) : H * 0.35;
    const finalTooltipY = preferBelow ? tooltipY : Math.max(40, tooltipY - 180);

    const highlightRadius = currentTourStep.highlightRadius ?? (RADIUS.lg ?? 16);

    const topH = rect ? Math.max(0, rect.y) : H;
    const leftW = rect ? Math.max(0, rect.x) : W;
    const rightW = rect ? Math.max(0, W - (rect.x + rect.width)) : 0;
    const bottomH = rect ? Math.max(0, H - (rect.y + rect.height)) : 0;

    return (
      <View style={[StyleSheet.absoluteFill, { zIndex: 9999, elevation: 9999 }]} pointerEvents="box-none">
        {/* Dimming Layers */}
        {rect ? (
          <>
            <View style={[tourStyles.dim, { left: 0, top: 0, width: W, height: topH }]} pointerEvents="auto" />
            <View style={[tourStyles.dim, { left: 0, top: rect.y, width: leftW, height: rect.height }]} pointerEvents="auto" />
            <View
              style={[
                tourStyles.dim,
                { left: rect.x + rect.width, top: rect.y, width: rightW, height: rect.height },
              ]}
              pointerEvents="auto"
            />
            <View
              style={[tourStyles.dim, { left: 0, top: rect.y + rect.height, width: W, height: bottomH }]}
              pointerEvents="auto"
            />

            {/* Highlight Border */}
            <View
              style={[
                tourStyles.highlight,
                {
                  left: rect.x,
                  top: rect.y,
                  width: rect.width,
                  height: rect.height,
                  borderRadius: highlightRadius,
                },
              ]}
              pointerEvents="none"
            />
          </>
        ) : (
          <View style={[tourStyles.dim, StyleSheet.absoluteFill]} pointerEvents="auto" />
        )}

        {/* Tooltip Card */}
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
          pointerEvents="auto"
        >
          <View style={tourStyles.cardHeader}>
            <Text style={tourStyles.cardTitle}>{currentTourStep.title}</Text>
            <Pressable onPress={stopTour} hitSlop={15}>
              <Ionicons name="close" size={20} color={COLORS.textMuted} />
            </Pressable>
          </View>

          <Text style={tourStyles.cardBody}>{currentTourStep.text}</Text>

          {nextDisabled ? (
            <Text style={tourStyles.requiredHint}>Étape obligatoire : complétez l’action pour continuer.</Text>
          ) : null}

          <View style={tourStyles.cardFooter}>
            <Text style={tourStyles.stepIndicator}>
              {tourIndex + 1} / {tourSteps.length}
            </Text>

            <View style={tourStyles.actions}>
              <Pressable
                onPress={prevTour}
                disabled={tourIndex === 0}
                style={({ pressed }) => [
                  tourStyles.btnSecondary,
                  tourIndex === 0 && { opacity: 0.3 },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={tourStyles.btnSecondaryText}>Précédent</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  if (nextDisabled) {
                    Alert.alert("Étape obligatoire", "Veuillez compléter cette étape avant de continuer.");
                    return;
                  }
                  if (tourIndex === tourSteps.length - 1) {
                    stopTour();
                    return;
                  }
                  nextTour();
                }}
                style={({ pressed }) => [
                  tourStyles.btnPrimary,
                  nextDisabled ? { opacity: 0.45 } : null,
                  pressed && !nextDisabled ? { opacity: 0.9 } : null,
                ]}
              >
                <Text style={tourStyles.btnPrimaryText}>
                  {tourIndex === tourSteps.length - 1 ? "Terminer" : "Suivant"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    );
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
        <Text style={styles.label}>Observation (optionnel) | ملاحظة</Text>
        <TextInput
          ref={refObs}
          collapsable={false}
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
          <View ref={refBadge} collapsable={false} style={styles.badge}>
            <Text style={styles.badgeText}>{selectedProduitIds.length}</Text>
          </View>
        </View>

        <View style={{ height: SPACING.md }} />
        <View ref={refAddProduit} collapsable={false}>
          <AppSelect
            title="Ajouter un produit"
            titleAr="إضافة منتج"
            placeholder="Sélectionner... | اختر..."
            searchPlaceholder="Rechercher... | بحث..."
            value={null}
            options={availableProduitOptions}
            showId
            allowClear={false}
            onChange={(id) => {
              if (id === null || id === undefined) return;
              addProduit(Number(id));
            }}
          />
        </View>
        <View style={{ height: SPACING.sm }} />
        <Text style={styles.mutedSmall}>Sélectionnez les produits, puis renseignez brochure/échantillon.</Text>
      </AppCard>

      <View style={{ height: SPACING.md }} />
    </View>
  );

  const renderFooter = () => (
    <View style={{ padding: SPACING.md, paddingTop: 0 }}>
      <View style={{ height: SPACING.md }} />
      <View ref={refSubmit} collapsable={false}>
        <Pressable
          onPress={submit}
          disabled={!canSubmit}
          style={({ pressed }) => [
            styles.submitBtn,
            !canSubmit ? styles.submitBtnDisabled : null,
            pressed && canSubmit ? { opacity: 0.9 } : null,
          ]}
        >
          {saving ? (
            <ActivityIndicator color={COLORS.textOnBrand} />
          ) : (
            <Ionicons name="checkmark" size={18} color={COLORS.textOnBrand} />
          )}
          <Text style={styles.submitText}>{saving ? "Enregistrement…" : "Créer le bon | إنشاء السند"}</Text>
        </Pressable>
      </View>
      <View style={{ height: SPACING.xl }} />
    </View>
  );

  const renderSelectedProduit = ({ item, index }: { item: AppSelectOption; index: number }) => {
    const idNum = Number(item.id);
    const k = String(idNum);
    const qtt = clampNonNegativeInt(qttByProduitId[k] ?? 0);
    const brochure = clampNonNegativeInt(brochureByProduitId[k] ?? 0);
    const sample = clampNonNegativeInt(sampleByProduitId[k] ?? 0);

    const needsFlag = qtt > 0 && brochure <= 0 && sample <= 0;
    const isFirst = index === 0;

    return (
      <View ref={isFirst ? refFirstCard : undefined} collapsable={false}>
        <AppCard style={styles.selCard}>
          <Pressable
            ref={isFirst ? refFirstRemove : undefined}
            collapsable={false}
            onPress={() => removeProduit(idNum)}
            style={({ pressed }) => [styles.removeBtn, pressed ? { opacity: 0.7 } : null]}
            hitSlop={10}
          >
            <Ionicons name="close" size={18} color={COLORS.textMuted} />
          </Pressable>

          <View style={styles.selTopRow}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={styles.prodName}>{item.label}</Text>
              <Text style={styles.prodHint}>ID: {item.id}</Text>
            </View>
          </View>

          <View style={styles.countersRow}>
            <View
              ref={isFirst ? refFirstBrochure : undefined}
              collapsable={false}
              style={[styles.counterBox, { flex: 1 }]}
            >
              <Text style={styles.counterLabel}>Brochure</Text>
              <View style={styles.counterStepper}>
                <Pressable
                  onPress={() => bumpBrochure(idNum, -1)}
                  disabled={blockQtyInteractions}
                  style={[styles.counterBtn, blockQtyInteractions ? styles.counterBtnDisabled : null]}
                  hitSlop={10}
                >
                  <Ionicons name="remove" size={16} color={COLORS.text} />
                </Pressable>

                <TextInput
                  value={String(brochure)}
                  onChangeText={(t) => setBrochureDirect(idNum, t)}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  maxLength={7}
                  selectTextOnFocus
                  returnKeyType="done"
                  blurOnSubmit
                  editable={!blockQtyInteractions}
                  style={[styles.counterInput, blockQtyInteractions ? styles.counterInputDisabled : null]}
                />

                <Pressable
                  onPress={() => bumpBrochure(idNum, +1)}
                  disabled={blockQtyInteractions}
                  style={[styles.counterBtn, blockQtyInteractions ? styles.counterBtnDisabled : null]}
                  hitSlop={10}
                >
                  <Ionicons name="add" size={16} color={COLORS.text} />
                </Pressable>
              </View>
            </View>

            <View
              ref={isFirst ? refFirstSample : undefined}
              collapsable={false}
              style={[styles.counterBox, { flex: 1 }]}
            >
              <Text style={styles.counterLabel}>Échantillon</Text>
              <View style={styles.counterStepper}>
                <Pressable
                  onPress={() => bumpSample(idNum, -1)}
                  disabled={blockQtyInteractions}
                  style={[styles.counterBtn, blockQtyInteractions ? styles.counterBtnDisabled : null]}
                  hitSlop={10}
                >
                  <Ionicons name="remove" size={16} color={COLORS.text} />
                </Pressable>

                <TextInput
                  value={String(sample)}
                  onChangeText={(t) => setSampleDirect(idNum, t)}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  maxLength={7}
                  selectTextOnFocus
                  returnKeyType="done"
                  blurOnSubmit
                  editable={!blockQtyInteractions}
                  style={[styles.counterInput, blockQtyInteractions ? styles.counterInputDisabled : null]}
                />

                <Pressable
                  onPress={() => bumpSample(idNum, +1)}
                  disabled={blockQtyInteractions}
                  style={[styles.counterBtn, blockQtyInteractions ? styles.counterBtnDisabled : null]}
                  hitSlop={10}
                >
                  <Ionicons name="add" size={16} color={COLORS.text} />
                </Pressable>
              </View>
            </View>
          </View>

          {/* (5) reserve space to prevent layout/scroll jumps */}
          <View style={styles.warnSlot}>
            {needsFlag ? (
              <Text style={styles.itemWarnText}>Obligatoire: brochure &gt; 0 ou échantillon &gt; 0.</Text>
            ) : (
              <Text style={[styles.itemWarnText, { opacity: 0 }]}>Obligatoire: brochure &gt; 0 ou échantillon &gt; 0.</Text>
            )}
          </View>
        </AppCard>
      </View>
    );
  };

  return (
    <View ref={refRoot} style={styles.screen}>
      <AppHeader
        title="Nouveau bon de sortie"
        titleAr="سند خروج جديد"
        onBack={() => router.back()}
        rightSlot={
          <Pressable
            onPress={startTour}
            hitSlop={10}
            style={{ width: 44, height: 44, alignItems: "flex-end", justifyContent: "center" }}
          >
            <Ionicons name="help-circle-outline" size={24} color={COLORS.textOnBrand} />
          </Pressable>
        }
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.muted}>Chargement… | جار التحميل…</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={selectedProduits}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderSelectedProduit}
          ListHeaderComponent={renderHeader}
          ListFooterComponent={renderFooter}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
          contentContainerStyle={{ paddingBottom: 10 }}
          onScroll={onListScroll}
          scrollEventThrottle={16}
          onScrollToIndexFailed={(info) => {
            const offset = Math.max(0, info.averageItemLength * info.index);
            listRef.current?.scrollToOffset({ offset, animated: true });
          }}
          ListEmptyComponent={
            <View style={{ paddingHorizontal: SPACING.md }}>
              <AppCard>
                <Text style={styles.muted}>Aucun produit sélectionné. | لا يوجد منتج محدد</Text>
              </AppCard>
            </View>
          }
        />
      )}

      <TourOverlay />
    </View>
  );
}

// --- Professional Tour Styles ---

const tourStyles = StyleSheet.create({
  dim: {
    position: "absolute",
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  highlight: {
    position: "absolute",
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.9)",
    shadowColor: "white",
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 5,
    borderStyle: "solid",
  },
  card: {
    position: "absolute",
    backgroundColor: "white",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1A1A1A",
    flex: 1,
    marginRight: 10,
  },
  cardBody: {
    fontSize: 14,
    color: "#4A4A4A",
    lineHeight: 20,
    fontWeight: "500",
    marginBottom: 10,
  },
  requiredHint: {
    marginTop: 2,
    marginBottom: 12,
    fontSize: 12,
    fontWeight: "800",
    color: COLORS.danger,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stepIndicator: {
    fontSize: 12,
    fontWeight: "700",
    color: "#999",
  },
  actions: {
    flexDirection: "row",
    gap: 12,
  },
  btnSecondary: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  btnSecondaryText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },
  btnPrimary: {
    backgroundColor: COLORS.brand || "#007AFF",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  btnPrimaryText: {
    fontSize: 14,
    fontWeight: "700",
    color: "white",
  },
});

// --- Main UI Styles ---

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
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: COLORS.brandSoft,
    borderWidth: 1,
    borderColor: "rgba(50,161,55,0.25)",
  },
  badgeText: { fontWeight: "900", color: COLORS.brand, fontSize: 12 },
  selCard: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    padding: SPACING.md,
  },
  removeBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.cardAlt,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  selTopRow: { flexDirection: "row", alignItems: "flex-start" },
  prodName: { color: COLORS.text, fontWeight: "900" },
  prodHint: {
    marginTop: 4,
    color: COLORS.textMuted,
    fontWeight: "800",
    fontSize: 12,
  },
  countersRow: {
    marginTop: SPACING.md,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  counterBox: {
    minWidth: 0,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    backgroundColor: COLORS.cardAlt,
  },
  counterLabel: { fontWeight: "900", color: COLORS.textMuted, fontSize: 12 },
  counterStepper: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  counterBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: FIELD.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  counterBtnDisabled: { opacity: 0.35 },
  itemWarnText: {
    color: COLORS.danger,
    fontWeight: "900",
    fontSize: 12,
    lineHeight: 16,
  },
  warnSlot: {
    marginTop: SPACING.sm,
    minHeight: 16, // keeps layout stable
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
  counterInput: {
    fontWeight: "900",
    color: COLORS.text,
    minWidth: 60,
    height: 38,
    textAlign: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: FIELD.bg,
    paddingHorizontal: 8,
  },
  counterInputDisabled: { opacity: 0.6 },
});
