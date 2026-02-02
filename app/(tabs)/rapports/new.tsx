// app/(tabs)/rapports/new.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Platform,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import DocumentScanner from "react-native-document-scanner-plugin";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { AppHeader } from "../../../src/components/AppHeader";
import { AppCard } from "../../../src/components/AppCard";
import { COLORS, SPACING, RADIUS, TYPO } from "../../../src/ui/theme";

import { useAuth } from "../../../src/auth/AuthContext";
import { authFetch } from "../../../src/api/client";

// -----------------------
// Types
// -----------------------
type Rect = { x: number; y: number; width: number; height: number };

type TourKey = "intro" | "scan1" | "scan2" | "submit";
type TourTarget = "none" | "scanCard1" | "scanCard2" | "submitBtn";
type TourScroll = "header" | "bottom";

type TourStep = {
  key: TourKey;
  title: string;
  text: string;
  required?: boolean;
  target: TourTarget;
  scroll: TourScroll;
  highlightRadius: number;
};

// -----------------------
// Helpers
// -----------------------
function ensureFileUri(uri: string) {
  if (!uri) return uri;
  if (uri.startsWith("file://")) return uri;
  return `file://${uri}`; // Android: scanner returns raw path sometimes
}

function guessFilename(base: string) {
  return `${base}_${Date.now()}.jpg`;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function padRect(r: Rect, pad: number): Rect {
  return { x: r.x - pad, y: r.y - pad, width: r.width + pad * 2, height: r.height + pad * 2 };
}

type MeasureRef<T> = { current: T | null };

function measureRef(ref: MeasureRef<View> | null): Promise<Rect | null> {
  return new Promise((resolve) => {
    const node = (ref?.current as { measureInWindow?: Function } | null) ?? null;
    if (!node || typeof node.measureInWindow !== "function") return resolve(null);
    (node.measureInWindow as (cb: (x: number, y: number, w: number, h: number) => void) => void)(
      (x: number, y: number, width: number, height: number) => {
        if (!Number.isFinite(x) || !Number.isFinite(y) || width <= 0 || height <= 0) return resolve(null);
        resolve({ x, y, width, height });
      }
    );
  });
}

// -----------------------
// Main Screen
// -----------------------
export default function NewRapportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const { state } = useAuth();

  const scrollRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);

  const [scanUri1, setScanUri1] = useState<string | null>(null);
  const [scanUri2, setScanUri2] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // -----------------------
  // Tour / Demo refs
  // -----------------------
  const refRoot = useRef<View>(null);
  const refScanCard1 = useRef<View>(null);
  const refScanCard2 = useRef<View>(null);
  const refSubmitBtn = useRef<View>(null);

  const [rootOffset, setRootOffset] = useState({ x: 0, y: 0 });
  const [tourOpen, setTourOpen] = useState(false);
  const [tourIndex, setTourIndex] = useState(0);
  const [tourRect, setTourRect] = useState<Rect | null>(null);

  const measureRootOffset = useCallback(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        refRoot.current?.measureInWindow((x, y) => {
          setRootOffset({ x: Math.round(x), y: Math.round(y) });
          resolve();
        });
      });
    });
  }, []);

  const steps = useMemo<TourStep[]>(() => {
    return [
      {
        key: "intro",
        title: "Démo : Nouveau rapport",
        text: "Dans cette demo nous allons apprendre à créer un nouveau rapport.",
        target: "none",
        scroll: "header",
        highlightRadius: RADIUS.lg,
      },
      {
        key: "scan1",
        title: "1) Scanner une griffe de passage",
        text: "Appuyez sur le bouton pour scanner la première griffe de passage. Cette étape est obligatoire.",
        required: true,
        target: "scanCard1",
        scroll: "header",
        highlightRadius: RADIUS.lg,
      },
      {
        key: "scan2",
        title: "2) Scanner une deuxième griffe",
        text: "Si vous avez une deuxième griffe de passage, vous pouvez la scanner ici.",
        required: false,
        target: "scanCard2",
        scroll: "header",
        highlightRadius: RADIUS.lg,
      },
      {
        key: "submit",
        title: "3) Finaliser le rapport",
        text: "Cliquez ici pour passer à la deuxième etape (Ajouter des visites)",
        required: false,
        target: "submitBtn",
        scroll: "bottom",
        highlightRadius: RADIUS.lg,
      },
    ];
  }, []);

  useEffect(() => {
    if (!tourOpen) return;
    if (tourIndex > steps.length - 1) setTourIndex(steps.length - 1);
  }, [steps.length, tourIndex, tourOpen]);

  const currentStep = steps[tourIndex] ?? steps[0];

  const stepSatisfied = useCallback((): boolean => {
    switch (currentStep.key) {
      case "scan1":
        return !!scanUri1; // obligatoire : la 1ère griffe doit être scannée
      default:
        return true;
    }
  }, [currentStep.key, scanUri1]);

  const nextDisabled = !!currentStep.required && !stepSatisfied();

  const startTour = useCallback(async () => {
    setTourRect(null);
    setTourIndex(0);
    setTourOpen(true);
    await measureRootOffset();
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: true }));
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

  // Auto-advance quand une étape obligatoire est satisfaite (comme vos autres démos)
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
      case "scanCard1":
        return refScanCard1;
      case "scanCard2":
        return refScanCard2;
      case "submitBtn":
        return refSubmitBtn;
      default:
        return null;
    }
  }, [currentStep.target]);

  // Scrolling + measure/overlay (même logique que bon de commande)
  useEffect(() => {
    if (!tourOpen) return;

    let cancelled = false;

    const performStep = async () => {
      setTourRect(null);

      // 1) Scroll principal
      if (currentStep.scroll === "header") {
        if (tourIndex === 0) scrollRef.current?.scrollTo({ y: 0, animated: true });
        else scrollRef.current?.scrollTo({ y: 0, animated: true });
      } else if (currentStep.scroll === "bottom") {
        scrollRef.current?.scrollToEnd({ animated: true });
      }

      await new Promise((r) => setTimeout(r, 550));
      if (cancelled) return;

      // intro => pas de cible => overlay plein écran
      if (!targetRef) {
        setTourRect(null);
      return; 
      }

      if (!targetRef?.current) {
        setTourRect(null);
        return;
      }

      // 2) Measure + ensure visible
      let rect = await measureRef(targetRef);
      if (!rect) {
        await new Promise((r) => setTimeout(r, 250));
        rect = await measureRef(targetRef);
      }
      if (cancelled || !rect) return;

      const absoluteY = rect.y;
      const elementHeight = rect.height;

      const isAbove = absoluteY < 80;
      const isBelow = absoluteY + elementHeight > H - 80;

      if (isAbove || isBelow) {
        const currentOffset = scrollOffsetRef.current;
        const screenCenterY = H / 2;
        const elementCenterY = absoluteY + elementHeight / 2;
        const delta = elementCenterY - screenCenterY;
        const targetOffset = Math.max(0, currentOffset + delta);

        scrollRef.current?.scrollTo({ y: targetOffset, animated: true });

        await new Promise((r) => setTimeout(r, 420));
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

    return () => {
      cancelled = true;
    };
  }, [tourOpen, tourIndex, currentStep, targetRef, rootOffset, H]);

  // -----------------------
  // Actions (scan réel même en démo)
  // -----------------------
  const scanOne = useCallback(async (slot: 1 | 2) => {
    try {
      const result = await DocumentScanner.scanDocument({
        maxNumDocuments: 1,
        croppedImageQuality: 90,
      });

      const first = result?.scannedImages?.[0];
      if (!first) return;

      const uri = ensureFileUri(first);
      if (slot === 1) setScanUri1(uri);
      else setScanUri2(uri);
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (!msg.toLowerCase().includes("cancel")) {
        Alert.alert("Scan impossible", msg || "Erreur inconnue");
      }
    }
  }, []);

  const canFinalize = useMemo(() => {
    return !uploading && !!scanUri1; // 1ère griffe obligatoire
  }, [uploading, scanUri1]);

  const onFinalize = useCallback(async () => {
    // ✅ Démo : ne rien uploader (comme demandé)
    if (tourOpen) {
  // mode demo: pas d'upload
  stopTour(); // optionnel mais propre
  router.push({
    pathname: "/rapports/demo-step2",
    params: { demo: "1" },
  });
  return;
}


    // Hors démo : logique réelle (si vous souhaitez la garder)
    if (state.status !== "signedIn") {
      Alert.alert("Non authentifié", "Veuillez vous reconnecter.");
      router.replace("/(auth)/login");
      return;
    }

    if (!scanUri1) {
      Alert.alert("Document requis", "Veuillez scanner au moins une griffe de passage.");
      return;
    }

    try {
      setUploading(true);

      const form = new FormData();
      form.append("image", {
        uri: scanUri1,
        name: guessFilename("griffe1"),
        type: "image/jpeg",
      } as any);

      if (scanUri2) {
        form.append("image2", {
          uri: scanUri2,
          name: guessFilename("griffe2"),
          type: "image/jpeg",
        } as any);
      }

      const token = (state as any)?.token as string | undefined;

      const res = await authFetch("/rapports/today", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }

      const data = await res.json().catch(() => null);
      const rapportId = data?.rapport?.id;

      router.push({
        pathname: "/rapports/new-step2",
        params: { rapportId: String(rapportId ?? "") },
      });
    } catch (e: any) {
      Alert.alert("Échec", e?.message || "Erreur inconnue");
    } finally {
      setUploading(false);
    }
  }, [tourOpen, stopTour, state, router, scanUri1, scanUri2]);

  // -----------------------
  // UI Components
  // -----------------------
  const ScanCard = React.memo(function ScanCard({
    title,
    subtitle,
    uri,
    onScan,
    onClear,
  }: {
    title: string;
    subtitle: string;
    uri: string | null;
    onScan: () => void;
    onClear: () => void;
  }) {
    const ok = !!uri;

    return (
      <AppCard style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.badge}>
            <MaterialCommunityIcons name="scanner" size={18} color={COLORS.textOnBrand} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{title}</Text>
            <Text style={styles.cardSub}>{subtitle}</Text>
          </View>

          {ok ? (
            <View style={styles.statusOk}>
              <Ionicons name="checkmark-circle" size={18} color={COLORS.brand} />
              <Text style={[styles.statusText, { color: COLORS.brand }]}>Scanné</Text>
            </View>
          ) : (
            <View style={styles.statusPending}>
              <Ionicons name="ellipse-outline" size={16} color={COLORS.textMuted} />
              <Text style={[styles.statusText, { color: COLORS.textMuted }]}>Non scanné</Text>
            </View>
          )}
        </View>

        {uri ? (
          <View style={styles.previewWrap}>
            <Image source={{ uri }} style={styles.previewImg} resizeMode="cover" />

            <View style={styles.previewActions}>
              <Pressable
                onPress={onScan}
                style={({ pressed }) => [styles.smallBtn, styles.smallBtnGreen, pressed && { opacity: 0.85 }]}
              >
                <Ionicons name="scan-outline" size={16} color={COLORS.brand} />
                <Text style={[styles.smallBtnText, { color: COLORS.brand }]}>Rescanner</Text>
              </Pressable>

              <Pressable
                onPress={onClear}
                style={({ pressed }) => [styles.smallBtn, styles.smallBtnRed, pressed && { opacity: 0.85 }]}
              >
                <Ionicons name="trash-outline" size={16} color="#EF4444" />
                <Text style={[styles.smallBtnText, { color: "#EF4444" }]}>Supprimer</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable onPress={onScan} style={({ pressed }) => [styles.scanBtn, pressed && { opacity: 0.9 }]}>
            <Ionicons name="scan-outline" size={18} color={COLORS.textOnBrand} />
            <Text style={styles.scanBtnText}>Scanner | مسح</Text>
          </Pressable>
        )}
      </AppCard>
    );
  });

  // -----------------------
  // Tour Overlay (identique dans l’esprit à bon de commande)
  // -----------------------
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
            <View
              style={[
                tourStyles.dim,
                { left: rect.x + rect.width, top: rect.y, width: rightW, height: rect.height },
              ]}
            />
            <View style={[tourStyles.dim, { left: 0, top: rect.y + rect.height, width: W, height: bottomH }]} />
            <View
              style={[
                tourStyles.highlight,
                { left: rect.x, top: rect.y, width: rect.width, height: rect.height, borderRadius: hr },
              ]}
              pointerEvents="none"
            />
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

          {nextDisabled ? <Text style={tourStyles.requiredHint}>Action requise pour continuer.</Text> : null}

          <View style={tourStyles.cardFooter}>
            <Text style={tourStyles.stepIndicator}>
              {tourIndex + 1} / {steps.length}
            </Text>

            <View style={tourStyles.actions}>
              <Pressable
                onPress={prevTour}
                disabled={tourIndex === 0}
                style={({ pressed }) => [
                  tourStyles.btnSecondary,
                  tourIndex === 0 && { opacity: 0.35 },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={tourStyles.btnSecondaryText}>Précédent</Text>
              </Pressable>

              {/* Only show Suivant button if NOT the last step */}
              {tourIndex < steps.length - 1 ? (
                <Pressable
                  onPress={() => {
                    if (nextDisabled) {
                      Alert.alert("Action requise", "Veuillez compléter l'étape.");
                      return;
                    }
                    nextTour();
                  }}
                  style={({ pressed }) => [
                    tourStyles.btnPrimary,
                    nextDisabled && { opacity: 0.45 },
                    pressed && !nextDisabled && { opacity: 0.92 },
                  ]}
                >
                  <Text style={tourStyles.btnPrimaryText}>Suivant</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      </View>
    );
  };

  // -----------------------
  // Render
  // -----------------------
  return (
    <SafeAreaView edges={["left", "right", "bottom"]} style={styles.screen}>
      <View ref={refRoot} style={{ flex: 1 }}>
        <AppHeader
          title="Nouveau rapport"
          titleAr="تقرير جديد"
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

        <ScrollView
          ref={scrollRef}
          scrollEnabled={!tourOpen}
          showsVerticalScrollIndicator={false}
          onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
            scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: (insets.bottom || 0) + 20 },
          ]}
        >
          <Text style={styles.h1}>Étape 1 | الخطوة 1</Text>
          <Text style={styles.p}>
            Veuillez scanner au moins une griffe de passage pour pouvoir continuer.
          </Text>

          <View ref={refScanCard1} collapsable={false}>
            <ScanCard
              title="Griffe de passage 1"
              subtitle="Obligatoire"
              uri={scanUri1}
              onScan={() => scanOne(1)}
              onClear={() => setScanUri1(null)}
            />
          </View>

          <View ref={refScanCard2} collapsable={false}>
            <ScanCard
              title="Griffe de passage 2"
              subtitle="Optionnel"
              uri={scanUri2}
              onScan={() => scanOne(2)}
              onClear={() => setScanUri2(null)}
            />
          </View>

          <View ref={refSubmitBtn} collapsable={false}>
            <Pressable
              disabled={!canFinalize}
              onPress={onFinalize}
              style={({ pressed }) => [
                styles.finalizeBtn,
                (!canFinalize || uploading) && { opacity: 0.5 },
                pressed && canFinalize && { opacity: 0.9 },
              ]}
            >
              {uploading ? (
                <ActivityIndicator color={COLORS.textOnBrand} />
              ) : (
                <>
                  <Ionicons name="checkmark-done-outline" size={18} color={COLORS.textOnBrand} />
                  <Text style={styles.finalizeText}>Finaliser le rapport | إنهاء</Text>
                </>
              )}
            </Pressable>
          </View>
        </ScrollView>

        <TourOverlay />
      </View>
    </SafeAreaView>
  );
}

// -----------------------
// Styles
// -----------------------
const OVERLAY = "rgba(0,0,0,0.58)";

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },

  content: { padding: SPACING.lg, gap: SPACING.md },

  h1: { fontSize: 16, fontWeight: "900", color: COLORS.text },
  p: { marginTop: -6, color: COLORS.textMuted, lineHeight: 18 },

  card: { padding: SPACING.lg },

  cardHeader: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  badge: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.brand,
  },
  cardTitle: { fontSize: 14, fontWeight: "900", color: COLORS.text },
  cardSub: { marginTop: 2, fontSize: 12, color: COLORS.textMuted },

  statusOk: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusPending: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusText: { fontSize: 12, fontWeight: "800" },

  scanBtn: {
    marginTop: SPACING.md,
    borderRadius: RADIUS.lg,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    backgroundColor: COLORS.brand,
  },
  scanBtnText: { color: COLORS.textOnBrand, fontWeight: "900", fontSize: 14 },

  previewWrap: { marginTop: SPACING.md },
  previewImg: {
    width: "100%",
    height: 220,
    borderRadius: RADIUS.lg,
    backgroundColor: Platform.OS === "android" ? "#EAECEF" : "#F1F3F5",
  },
  previewActions: { flexDirection: "row", gap: 10, marginTop: 10, justifyContent: "flex-end" },

  smallBtn: {
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.card,
  },
  smallBtnText: { fontSize: TYPO.small, fontWeight: "900" },
  smallBtnGreen: { borderColor: COLORS.brand },
  smallBtnRed: { borderColor: "#EF4444" },

  finalizeBtn: {
    marginTop: 4,
    borderRadius: RADIUS.lg,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    backgroundColor: COLORS.brand,
  },
  finalizeText: { color: COLORS.textOnBrand, fontWeight: "900", fontSize: 15 },
});

const tourStyles = StyleSheet.create({
  dim: { position: "absolute", backgroundColor: OVERLAY },
  highlight: { position: "absolute", borderWidth: 2, borderColor: "rgba(255,255,255,0.90)", backgroundColor: "transparent" },

  card: {
    position: "absolute",
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  cardTitle: { fontSize: 14, fontWeight: "900", color: COLORS.text },
  cardBody: { color: COLORS.text, lineHeight: 18 },
  requiredHint: { marginTop: 8, color: COLORS.textMuted, fontWeight: "900" },

  cardFooter: { marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  stepIndicator: { color: COLORS.textMuted, fontWeight: "900" },

  actions: { flexDirection: "row", gap: 10 },

  btnSecondary: {
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.15)",
    borderRadius: RADIUS.lg,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minWidth: 110,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  btnSecondaryText: { fontWeight: "900", color: COLORS.text },

  btnPrimary: {
    borderRadius: RADIUS.lg,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minWidth: 110,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.brand,
  },
  btnPrimaryText: { fontWeight: "900", color: COLORS.textOnBrand },
});
