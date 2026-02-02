import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  InteractionManager,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api } from "../../../src/api/client";
import { AppHeader } from "../../../src/components/AppHeader";
import { AppCard } from "../../../src/components/AppCard";
import { AppSelect, type AppSelectOption } from "../../../src/components/AppSelect";
import { COLORS, RADIUS, SPACING, FIELD, TYPO } from "../../../src/ui/theme";

import type {
  MedicalVisitDraft,
  CommercialVisitDraft,
  MedicalProductDraft,
  CommercialProductDraft,
  CommercialClientType,
} from "../../../src/types/rapportDrafts";

const makeKey = () => `${Date.now()}_${Math.random().toString(16).slice(2)}`;

type CommercialClientOption = AppSelectOption & {
  client_type: CommercialClientType;
  plan_border?: "green" | "yellow";
};

const FILTER_OPTIONS: AppSelectOption[] = [
  { id: "Pharmacie", label: "Pharmacie" },
  { id: "Grossiste", label: "Grossiste" },
  { id: "SuperGros", label: "Super gros" },
];

const RENTABILITE_OPTIONS: AppSelectOption[] = [
  { id: 0, label: "Première visite (connaît) | زيارة أولى للطبيب" },
  { id: 1, label: "Utilise beaucoup (ambassadeur) | يستعمل منتوجاتنا بكثرة" },
  { id: 2, label: "Utilise nos produits + concurrents | يستعمل منتوجاتنا و المنافسة" },
  { id: 3, label: "Premier essai (utilise un peu) | وصف للمرة الاولى و بشكل ضعيف" },
  { id: 4, label: "Évalue | (يقيم) يقول يكتب و لا توجد وصفات" },
  { id: 5, label: "S'intéresse (visite mais pas de prescription) | مهتم ( تمت الزيارة و لا يوجد وصف )" },
];

// ─────────────────────────────────────────────────────────────
// NEW HELPER LOGIC FROM NEWVISITEM / NEWVISITEC
// ─────────────────────────────────────────────────────────────
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

function isMedicalProductComplete(p: MedicalProductDraft) {
  return productStep(p) === 4;
}

// ─────────────────────────────────────────────────────────────
// DATA FACTORIES
// ─────────────────────────────────────────────────────────────

const makeEmptyMedicalProduct = (): MedicalProductDraft => ({
  _key: makeKey(),
  produit_id: null,
  rentabilite: null,
  note: "",
});

const makeEmptyCommercialProduct = (): CommercialProductDraft =>
  ({
    _key: makeKey(),
    produit_id: null,
    prescription: null,
    en_stock: null,
    qtt: 0,
    note: "",
  } as any);

const makeEmptyMedicalVisit = (): MedicalVisitDraft => ({
  _key: makeKey(),
  visite_type: "medical",
  medecin_id: null,
  products: [],
});

const makeEmptyCommercialVisit = (): CommercialVisitDraft => ({
  _key: makeKey(),
  visite_type: "commercial",
  medecin_id: null, // client id
  client_filter: null,
  bon_commande: null,
  products: [],
});

const ymdToDmy = (s: string) => {
  const v = (s || "").trim();
  if (!v) return "";
  const datePart = v.includes("T") ? v.slice(0, 10) : v;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  if (!m) return v;
  return `${m[3]}/${m[2]}/${m[1]}`;
};

// ─────────────────────────────────────────────────────────────
// Tour helpers
// ─────────────────────────────────────────────────────────────

type TourRect = { x: number; y: number; w: number; h: number };

type TourTarget =
  | "none"
  | "med_medecin"
  | "med_add_product"
  | "med_product"
  | "med_rentabilite"
  | "med_note"
  | "med_add_more"
  | "add_visite"
  | "com_type"
  | "com_client"
  | "com_add_product"
  | "com_product"
  | "com_prescription"
  | "com_stock"
  | "com_qty"
  | "com_note"
  | "com_add_more"
  | "com_bon"
  | "submit";

type TourScroll = "top" | "bottom";

type TourStep = {
  key: string;
  title: string;
  text: string;
  target: TourTarget;
  scroll: TourScroll;
  highlightRadius: number;
  required?: boolean;
};

const TOUR_OVERLAY = "rgba(0,0,0,0.58)";


type Measurable = {
  measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => void;
};

type MeasurableRef = React.RefObject<Measurable | null>;


function measureInWindowAsync(ref: MeasurableRef | null) {
  return new Promise<{ x: number; y: number; w: number; h: number } | null>((resolve) => {
    const node = ref?.current;
    if (!node) return resolve(null);
    node.measureInWindow((x, y, w, h) => resolve({ x, y, w, h }));
  });
}


function isCommercialProductComplete(p: CommercialProductDraft) {
  const note = String((p as any)?.note ?? "").trim();
  return p.produit_id != null && p.prescription != null && p.en_stock != null && note.length > 0;
}

function isMedicalVisitComplete(v: MedicalVisitDraft) {
  if (v.medecin_id == null) return false;
  if (!v.products.length) return false;
  return isMedicalProductComplete(v.products[0]);
}

function isCommercialVisitComplete(v: CommercialVisitDraft) {
  if (v.client_filter == null) return false;
  if (v.medecin_id == null) return false;
  if (!v.products.length) return false;
  if (!isCommercialProductComplete(v.products[0])) return false;
  if (v.bon_commande == null) return false;
  return true;
}

function RadioRow({
  label,
  checked,
  onPress,
  disabled,
}: {
  label: string;
  checked: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[visitStyles.rentRow, checked ? visitStyles.rentRowChecked : null, disabled ? visitStyles.disabledBtn : null]}
    >
      <Ionicons
        name={checked ? "checkbox" : "square-outline"}
        size={20}
        color={checked ? COLORS.brand : COLORS.textMuted}
      />
      <Text style={visitStyles.rentText}>{label}</Text>
    </Pressable>
  );
}

export default function DemoRapportPhase2() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ rapportId?: string; demo?: string }>();

  const { width: W } = useWindowDimensions();
  const demoMode = params.demo === "1" || params.demo === "true";

  const [loadingRefs, setLoadingRefs] = useState(true);
  const [reloadTick, setReloadTick] = useState(0);

  const [medecinsMedical, setMedecinsMedical] = useState<AppSelectOption[]>([]);
  const [clientsByType, setClientsByType] = useState<Record<string, CommercialClientOption[]>>({
    Pharmacie: [],
    Grossiste: [],
    SuperGros: [],
  });
  const [produits, setProduits] = useState<AppSelectOption[]>([]);

  // role scoping
  const [mySpecialityRolee, setMySpecialityRolee] = useState<string | null>(null);
  const [underUsersSpecialities, setUnderUsersSpecialities] = useState<string[]>([]);

  // demo state: 1 visite max par type
  const [medicalVisit, setMedicalVisit] = useState<MedicalVisitDraft>(makeEmptyMedicalVisit);
  const [commercialVisit, setCommercialVisit] = useState<CommercialVisitDraft>(makeEmptyCommercialVisit);

  // UI open/close (minimal)
  const [openMedical, setOpenMedical] = useState(true);
  const [openCommercial, setOpenCommercial] = useState(true);
  const [openMedicalProduct, setOpenMedicalProduct] = useState(true);
  const [openCommercialProduct, setOpenCommercialProduct] = useState(true);

  // Show only one visit first (per requirements)
  const [showCommercialVisit, setShowCommercialVisit] = useState(false);
  const didInitCommercialVisRef = useRef(false);
  const userAddedCommercialRef = useRef(false);

  // ─────────────────────────────────────────────────────────────
  // TOUR state + refs
  // ─────────────────────────────────────────────────────────────
  const scrollRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);

  // Scroll viewport (excludes header + footer). Used to compute "ensure visible" scrolling.
  const refScrollFrame = useRef<View | null>(null);
  const scrollFrameRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  // Root offset in window coords (for converting measureInWindow -> local overlay coords)
  const rootOffsetRef = useRef({ x: 0, y: 0 });

  // Layout tick to re-measure on keyboard/size changes (debounced)
  const [layoutTick, setLayoutTick] = useState(0);
  const layoutTickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refRoot = useRef<View | null>(null);

  // Targets
  const refT_medMedecin = useRef<View | null>(null);
  const refT_medAddProduct = useRef<View | null>(null);
  const refT_medProduct = useRef<View | null>(null);
  const refT_medRentabilite = useRef<View | null>(null);
  const refT_medNote = useRef<View | null>(null);
  const refT_medAddMore = useRef<View | null>(null);

  const refT_addVisiteButtons = useRef<View | null>(null);

  const refT_comType = useRef<View | null>(null);
  const refT_comClient = useRef<View | null>(null);
  const refT_comAddProduct = useRef<View | null>(null);
  const refT_comProduct = useRef<View | null>(null);
  const refT_comPrescription = useRef<View | null>(null);
  const refT_comStock = useRef<View | null>(null);
  const refT_comQty = useRef<View | null>(null);
  const refT_comNote = useRef<View | null>(null);
  const refT_comAddMore = useRef<View | null>(null);
  const refT_comBon = useRef<View | null>(null);

  const refT_submit = useRef<View | null>(null);

  const didAutoStart = useRef(false);

  const [tourOpen, setTourOpen] = useState(false);
  const [tourIndex, setTourIndex] = useState(0);
  const [tourRect, setTourRect] = useState<TourRect | null>(null);

  const updateRootOffset = useCallback(async () => {
    const m = await measureInWindowAsync(refRoot);
    if (!m) return;
    rootOffsetRef.current = { x: Math.round(m.x), y: Math.round(m.y) };
  }, []);

  const updateScrollFrameRect = useCallback(async () => {
    const m = await measureInWindowAsync(refScrollFrame);
    if (!m) return;
    scrollFrameRectRef.current = m;
  }, []);

  const bumpLayoutTick = useCallback(() => {
    if (layoutTickTimer.current) clearTimeout(layoutTickTimer.current);
    layoutTickTimer.current = setTimeout(() => {
      setLayoutTick((t) => t + 1);
    }, 80);
  }, []);

  const onRootLayout = useCallback(() => {
    requestAnimationFrame(() => {
      updateRootOffset();
      updateScrollFrameRect();
    });
  }, [updateRootOffset, updateScrollFrameRect]);

  const onScrollFrameLayout = useCallback(() => {
    requestAnimationFrame(() => {
      updateScrollFrameRect();
    });
  }, [updateScrollFrameRect]);

  // Re-measure on keyboard transitions (KeyboardAvoidingView can shift layouts).
  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const s1 = Keyboard.addListener(showEvt, () => {
      if (tourOpen) bumpLayoutTick();
    });
    const s2 = Keyboard.addListener(hideEvt, () => {
      if (tourOpen) bumpLayoutTick();
    });
    return () => {
      s1.remove();
      s2.remove();
    };
  }, [bumpLayoutTick, tourOpen]);

  const allowedVisitTypes = useMemo(() => {
    const spec = String(mySpecialityRolee ?? "").trim();
    const isSupervisor =
      spec === "Superviseur" || spec === "Superviseur Regional" || spec === "Superviseur National";

    // fallback permissif si backend ne renvoie pas encore le role
    if (!spec) return { medical: true, commercial: true };

    if (spec === "Medico Commercial") return { medical: true, commercial: true };
    if (spec === "Commercial") return { medical: false, commercial: true };

    if (isSupervisor) {
      if (!underUsersSpecialities.length) return { medical: true, commercial: true };

      const hasMedicoCommercial = underUsersSpecialities.some((s) => s === "Medico Commercial");
      const allCommercial = underUsersSpecialities.every((s) => s === "Commercial");

      if (allCommercial && !hasMedicoCommercial) return { medical: false, commercial: true };
      if (hasMedicoCommercial) return { medical: true, commercial: true };

      return { medical: true, commercial: true };
    }

    return { medical: true, commercial: true };
  }, [mySpecialityRolee, underUsersSpecialities]);

  // Ensure initial visit visibility per role
  useEffect(() => {
    if (didInitCommercialVisRef.current) return;

    if (allowedVisitTypes.commercial && !allowedVisitTypes.medical) {
      setShowCommercialVisit(true);
      didInitCommercialVisRef.current = true;
      return;
    }

    // both allowed OR medical-only => start with medical only
    setShowCommercialVisit(false);
    didInitCommercialVisRef.current = true;
  }, [allowedVisitTypes.medical, allowedVisitTypes.commercial]);

  const addCommercialVisit = useCallback(() => {
    userAddedCommercialRef.current = true;
    setShowCommercialVisit(true);
    setOpenCommercial(true);
    setOpenCommercialProduct(true);

    // reset visit commerciale (démo)
    setCommercialVisit(makeEmptyCommercialVisit());
  }, []);

  const exitDemoAndReturn = useCallback(() => {
    // RESET ALL STATE TO FRESH
    setMedicalVisit(makeEmptyMedicalVisit());
    setCommercialVisit(makeEmptyCommercialVisit());
    setShowCommercialVisit(false);
    
    // Reset Refs (best effort)
    didInitCommercialVisRef.current = false;
    userAddedCommercialRef.current = false;

    // Reset Tour
    setTourOpen(false);
    setTourRect(null);
    setTourIndex(0);
    
    router.replace("/rapports/new");
  }, [router]);

  const startTour = useCallback(() => {
    setTourIndex(0);
    setTourRect(null);
    setTourOpen(true);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: true }));
  }, []);

  // Auto-start only when opened as demo
  useEffect(() => {
    if (!demoMode) return;
    if (didAutoStart.current) return;
    if (loadingRefs) return;

    didAutoStart.current = true;
    startTour();
  }, [demoMode, loadingRefs, startTour]);

  const nextTour = useCallback((opts?: { force?: boolean }) => {
    setTourIndex((i) => {
      const next = Math.min(i + 1, tourStepsRef.current.length - 1);
      return next;
    });
  }, []);

  const prevTour = useCallback(() => {
    // CLEANUP STATE OF THE STEP WE ARE LEAVING (GOING BACK FROM)
    const currentStep = tourStepsRef.current[tourIndex];
    const key = currentStep?.key;

    if (key === "med_medecin") {
      setMedicalVisit(prev => ({ ...prev, medecin_id: null }));
    }
    else if (key === "med_product") {
       // Leaving product dropdown -> clear product list (undo add product)
       setMedicalVisit(prev => ({ ...prev, products: [] }));
    }
    else if (key === "med_rentabilite") {
       // Leaving rentabilite -> clear it
       setMedicalVisit(prev => {
         const p = [...prev.products];
         if (p[0]) p[0] = { ...p[0], rentabilite: null };
         return { ...prev, products: p };
       });
    }
    else if (key === "med_note") {
       // Leaving note -> clear note
       setMedicalVisit(prev => {
         const p = [...prev.products];
         if (p[0]) p[0] = { ...p[0], note: "" };
         return { ...prev, products: p };
       });
    }
    else if (key === "com_type") {
      // Leaving Type Client -> clear commercial visit (undo add visit)
      setShowCommercialVisit(false);
      setOpenCommercial(false);
      setCommercialVisit(makeEmptyCommercialVisit());
    }
    else if (key === "com_client") {
      setCommercialVisit(prev => ({ ...prev, medecin_id: null }));
    }
    else if (key === "com_product") {
       // Leaving product -> undo add product
       setCommercialVisit(prev => ({ ...prev, products: [] }));
    }
    else if (key === "com_prescription") {
       setCommercialVisit(prev => {
         const p = [...prev.products];
         if (p[0]) p[0] = { ...p[0], prescription: null } as any;
         return { ...prev, products: p };
       });
    }
    else if (key === "com_stock") {
       setCommercialVisit(prev => {
         const p = [...prev.products];
         if (p[0]) p[0] = { ...p[0], en_stock: null } as any;
         return { ...prev, products: p };
       });
    }
    else if (key === "com_qty") {
       setCommercialVisit(prev => {
         const p = [...prev.products];
         if (p[0]) p[0] = { ...p[0], qtt: 0 } as any;
         return { ...prev, products: p };
       });
    }
    else if (key === "com_note") {
       setCommercialVisit(prev => {
         const p = [...prev.products];
         if (p[0]) p[0] = { ...p[0], note: "" } as any;
         return { ...prev, products: p };
       });
    }
    else if (key === "com_bon") {
       setCommercialVisit(prev => ({ ...prev, bon_commande: null }));
    }

    setTourIndex((i) => Math.max(i - 1, 0));
  }, [tourIndex]);

  // ─────────────────────────────────────────────────────────────
  // Load referentials (same endpoint)
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoadingRefs(true);
      try {
        const res = await api.get(`/rapports/referentiels`);
        const data = res?.data || {};

        const me = data.me ?? data.profile ?? data.user ?? data.current_user ?? null;

        const spec = String(me?.speciality_rolee ?? me?.specialityRolee ?? "").trim();
        setMySpecialityRolee(spec || null);

        const under =
          (me?.underusers ??
            me?.usersunder ??
            data.underusers ??
            data.usersunder ??
            []) as any[];

        const underSpecs = Array.isArray(under)
          ? under
              .map((u: any) => String(u?.speciality_rolee ?? u?.specialityRolee ?? "").trim())
              .filter(Boolean)
          : [];

        setUnderUsersSpecialities(underSpecs);

        const rawMedMedical =
          data.medecins_medical_planned_wilayas ?? data.medecins_medical ?? data.medecins ?? [];

        const rawClients = data.clients_commercial_planned_wilayas ?? data.clients_commercial ?? [];

        const rawProduits = data.produits ?? data.products ?? [];

        const mapPerson = (x: any): AppSelectOption | null => {
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

          const lastDate = String(x.last_visit_date ?? "").trim();
          const lastBy = String(x.last_visit_by ?? "").trim();
          const metaLine =
            lastDate && lastBy
              ? `Visité le : ${ymdToDmy(lastDate)} par ${lastBy}`
              : lastDate
              ? `Visité le : ${ymdToDmy(lastDate)}`
              : undefined;

          return {
            id,
            label,
            subtitle: region || undefined,
            metaLine,
            keywords: `${id} ${nom} ${specialite} ${wilaya} ${commune}`.toLowerCase(),
            plan_border: x.plan_border === "green" ? "green" : undefined,
          } as any;
        };

        const med = ((rawMedMedical || []).map(mapPerson).filter(Boolean) as any[])
          .sort((a, b) => {
            const ar = a?.plan_border === "green" ? 0 : 1;
            const br = b?.plan_border === "green" ? 0 : 1;
            if (ar !== br) return ar - br;
            return String(a?.label ?? "").localeCompare(String(b?.label ?? ""), "fr", {
              sensitivity: "base",
            });
          }) as AppSelectOption[];

        setMedecinsMedical(med);

        const builtClients = (rawClients || [])
          .map((x: any) => {
            const opt = mapPerson(x);
            if (!opt) return null;

            const t = String(x.client_type ?? "").trim() as CommercialClientType;
            if (!t) return null;

            return {
              ...(opt as any),
              client_type: t,
              plan_border: x.plan_border === "green" ? "green" : undefined,
            } as CommercialClientOption;
          })
          .filter(Boolean) as CommercialClientOption[];

        builtClients.sort((a, b) => {
          const ar = a?.plan_border === "green" ? 0 : 1;
          const br = b?.plan_border === "green" ? 0 : 1;
          if (ar !== br) return ar - br;
          return String(a?.label ?? "").localeCompare(String(b?.label ?? ""), "fr", {
            sensitivity: "base",
          });
        });

        setClientsByType({
          Pharmacie: builtClients.filter((c) => c.client_type === "Pharmacie"),
          Grossiste: builtClients.filter((c) => c.client_type === "Grossiste"),
          SuperGros: builtClients.filter((c) => c.client_type === "SuperGros"),
        });

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

  const medecinLabelById = useMemo(() => {
    const m = new Map<number, string>();
    medecinsMedical.forEach((x) => {
      const key = Number(x.id);
      const v = x.subtitle ? `${x.label} — ${x.subtitle}` : x.label;
      m.set(key, v);
    });
    return m;
  }, [medecinsMedical]);
  
  // NEW: Map produit_id -> label (name) for Medical Card Header
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

  const clientLabelById = useMemo(() => {
    const m = new Map<number, string>();
    const all = [
      ...(clientsByType.Pharmacie || []),
      ...(clientsByType.Grossiste || []),
      ...(clientsByType.SuperGros || []),
    ];
    all.forEach((x) => {
      const key = Number(x.id);
      const v = x.subtitle ? `${x.label} — ${x.subtitle}` : x.label;
      m.set(key, v);
    });
    return m;
  }, [clientsByType]);

  const validateLocal = (): string | null => {
    if (allowedVisitTypes.medical) {
      const v = medicalVisit;
      if (v.medecin_id == null) return "Visite médicale : médecin requis.";
      if (!v.products.length) return "Visite médicale : ajoutez un produit.";
      const p = v.products[0];
      if (p.produit_id == null) return "Visite médicale : produit requis.";
      if (p.rentabilite == null) return "Visite médicale : rentabilité requise.";
      if (!String(p.note || "").trim()) return "Visite médicale : note requise.";
    }

    if (allowedVisitTypes.commercial) {
      if (!showCommercialVisit) return "Ajoutez la visite commerciale pour continuer (démo).";

      const v = commercialVisit;
      if (v.client_filter == null) return "Visite commerciale : type client requis.";
      if (v.medecin_id == null) return "Visite commerciale : client requis.";
      if (!v.products.length) return "Visite commerciale : ajoutez un produit.";
      const p = v.products[0];
      if (p.produit_id == null) return "Visite commerciale : produit requis.";
      if (p.prescription == null) return "Visite commerciale : prescription/commande requise.";
      if (p.en_stock == null) return "Visite commerciale : stock requis.";
      if (!String((p as any).note || "").trim())
        return "Visite commerciale : note requise (tapez RAS si besoin).";
      if (v.bon_commande == null) return "Visite commerciale : bon de commande requis.";
    }

    return null;
  };

  const submitDemo = () => {
    const err = validateLocal();
    if (err) return Alert.alert("Validation", err);

    Alert.alert("Version démo", "Aucun rapport n’a été envoyé (démo).", [
      {
        text: "OK",
        onPress: () => exitDemoAndReturn(),
      },
    ]);
  };

  // ─────────────────────────────────────────────────────────────
  // Tour step list
  // ─────────────────────────────────────────────────────────────

  const tourSteps: TourStep[] = useMemo(() => {
    const steps: TourStep[] = [
      {
        key: "intro",
        title: "Démo : Étape 2",
        text:
          "Nous allons voir comment ajouter les visites.",
        target: "none",
        scroll: "top",
        highlightRadius: RADIUS.lg,
        required: false,
      },
    ];

    // Commercial-only roles: tour only commercial visit
    if (allowedVisitTypes.commercial && !allowedVisitTypes.medical) {
      steps.push(
        {
          key: "com_type",
          title: "Type client",
          text: "Sélectionnez le type du client (Pharmacie, Grossiste, Super gros).",
          target: "com_type",
          scroll: "top",
          highlightRadius: RADIUS.lg,
          required: true,
        },
        {
          key: "com_client",
          title: "Client",
          text: "Sélectionnez le client.",
          target: "com_client",
          scroll: "top",
          highlightRadius: RADIUS.lg,
          required: true,
        },
        {
          key: "com_add_product",
          title: "Ajouter un produit",
          text: "Cliquez sur « Ajouter un produit ».",
          target: "com_add_product",
          scroll: "top",
          highlightRadius: RADIUS.lg,
          required: true,
        },
        {
          key: "com_product",
          title: "Produit",
          text: "Sélectionnez le produit.",
          target: "com_product",
          scroll: "top",
          highlightRadius: RADIUS.lg,
          required: true,
        },
        {
          key: "com_prescription",
          title: "Prescription / Commande",
          text: "Indiquez si le produit est prescrit/commandé.",
          target: "com_prescription",
          scroll: "top",
          highlightRadius: RADIUS.lg,
          required: true,
        },
        {
          key: "com_stock",
          title: "Stock",
          text: "Indiquez si le produit est en stock ou en rupture.",
          target: "com_stock",
          scroll: "top",
          highlightRadius: RADIUS.lg,
          required: true,
        },
        {
          key: "com_qty",
          title: "Quantité (optionnel)",
          text:
            "Si le client vous communique une quantité en stock, vous pouvez la saisir. Sinon, vous pouvez passer cette étape.",
          target: "com_qty",
          scroll: "top",
          highlightRadius: RADIUS.lg,
          required: false,
        },
        {
          key: "com_note",
          title: "Note produit",
          text:
            "Ajoutez votre note. Vous pouvez taper ou appuyer sur l’icône et maintenir pour dicter — cette fonctionnalité est désactivée dans la démo.",
          target: "com_note",
          scroll: "top",
          highlightRadius: RADIUS.lg,
          required: true,
        },
        {
          key: "com_add_more",
          title: "Ajouter un autre produit",
          text:
            "Vous pouvez ajouter plusieurs produits dans une visite en cliquant ici. Nous avons déjà vu comment remplir une carte produit, donc nous ne le refaisons pas dans cette démo. Cliquez sur Suivant.",
          target: "com_add_more",
          scroll: "top",
          highlightRadius: RADIUS.lg,
          required: false,
        },
        {
          key: "com_bon",
          title: "Bon de commande",
          text: "Avez-vous décroché un bon de commande ?",
          target: "com_bon",
          scroll: "top",
          highlightRadius: RADIUS.lg,
          required: true,
        }
      );

      steps.push({
        key: "submit",
        title: "Valider le rapport",
        text:
          "Vous pouvez valider le rapport. En démo, aucun envoi réel n’est effectué. Cette étape est optionnelle : vous pouvez terminer la démo sans valider.",
        target: "submit",
        scroll: "bottom",
        highlightRadius: RADIUS.lg,
        required: false,
      });

      return steps;
    }

    // Medical + commercial roles: start with medical only
    if (allowedVisitTypes.medical) {
      steps.push(
        {
          key: "med_medecin",
          title: "Médecin",
          text: "Sélectionnez le médecin.",
          target: "med_medecin",
          scroll: "top",
          highlightRadius: RADIUS.lg,
          required: true,
        },
        {
          key: "med_add_product",
          title: "Ajouter un produit",
          text: "Cliquez sur « Ajouter un produit ».",
          target: "med_add_product",
          scroll: "top",
          highlightRadius: RADIUS.lg,
          required: true,
        },
        {
          key: "med_product",
          title: "Produit",
          text: "Sélectionnez le produit.",
          target: "med_product",
          scroll: "top",
          highlightRadius: RADIUS.lg,
          required: true,
        },
        {
          key: "med_rentabilite",
          title: "Rentabilité",
          text: "Sélectionnez la rentabilité.",
          target: "med_rentabilite",
          scroll: "top",
          highlightRadius: RADIUS.lg,
          required: true,
        },
        {
          key: "med_note",
          title: "Note produit",
          text:
            "Ajoutez votre note. Vous pouvez taper ou appuyer sur l’icône et maintenir pour dicter — cette fonctionnalité est désactivée dans la démo.",
          target: "med_note",
          scroll: "top",
          highlightRadius: RADIUS.lg,
          required: true,
        },
        {
          key: "med_add_more",
          title: "Ajouter un autre produit",
          text:
            "Vous pouvez ajouter plusieurs produits dans une visite en cliquant ici. Nous avons déjà vu comment remplir une carte produit, donc nous ne le ferons pas dans cette démo. Cliquez sur Suivant.",
          target: "med_add_more",
          scroll: "top",
          highlightRadius: RADIUS.lg,
          required: false,
        }
      );
    }

    if (allowedVisitTypes.commercial) {
      steps.push({
        key: "add_visite",
        title: "Ajouter une visite",
        text:
          "Vous pouvez ajouter une visite médicale ou commerciale en cliquant sur ces boutons. Nous avons déjà vu la visite médicale dans cette démo : cliquez sur « Visite commercial ».",
        target: "add_visite",
        scroll: "bottom",
        highlightRadius: RADIUS.lg,
        required: true,
      });

      steps.push(
        {
          key: "com_type",
          title: "Type client",
          text: "Sélectionnez le type du client (Pharmacie, Grossiste, Super gros).",
          target: "com_type",
          scroll: "top",
          highlightRadius: RADIUS.lg,
          required: true,
        },
        {
          key: "com_client",
          title: "Client",
          text: "Sélectionnez le client.",
          target: "com_client",
          scroll: "top",
          highlightRadius: RADIUS.lg,
          required: true,
        },
        {
          key: "com_add_product",
          title: "Ajouter un produit",
          text: "Cliquez sur « Ajouter un produit ».",
          target: "com_add_product",
          scroll: "top",
          highlightRadius: RADIUS.lg,
          required: true,
        },
        {
          key: "com_product",
          title: "Produit",
          text: "Sélectionnez le produit.",
          target: "com_product",
          scroll: "top",
          highlightRadius: RADIUS.lg,
          required: true,
        },
        {
          key: "com_prescription",
          title: "Prescription / Commande",
          text: "Indiquez si le produit est prescrit/commandé.",
          target: "com_prescription",
          scroll: "top",
          highlightRadius: RADIUS.lg,
          required: true,
        },
        {
          key: "com_stock",
          title: "Stock",
          text: "Indiquez si le produit est en stock ou en rupture.",
          target: "com_stock",
          scroll: "top",
          highlightRadius: RADIUS.lg,
          required: true,
        },
        {
          key: "com_qty",
          title: "Quantité (optionnel)",
          text:
            "Si le client vous communique la quantité en stock, vous pouvez la saisir. Sinon, vous pouvez passer cette étape.",
          target: "com_qty",
          scroll: "top",
          highlightRadius: RADIUS.lg,
          required: false,
        },
        {
          key: "com_note",
          title: "Note produit",
          text:
            "Ajoutez votre note. Vous pouvez taper ou appuyer sur l’icône et maintenir pour dicter — cette fonctionnalité est désactivée dans la démo.",
          target: "com_note",
          scroll: "top",
          highlightRadius: RADIUS.lg,
          required: true,
        },
        {
          key: "com_add_more",
          title: "Ajouter un autre produit",
          text:
            "Vous pouvez ajouter plusieurs produits dans une visite en cliquant ici. Nous avons déjà vu comment remplir une carte produit, donc nous ne le ferons pas dans cette démo.",
          target: "com_add_more",
          scroll: "top",
          highlightRadius: RADIUS.lg,
          required: false,
        },
        {
          key: "com_bon",
          title: "Bon de commande",
          text: "Avez-vous décroché un bon de commande dans cette visite ?",
          target: "com_bon",
          scroll: "top",
          highlightRadius: RADIUS.lg,
          required: true,
        }
      );
    }

    if (allowedVisitTypes.medical && allowedVisitTypes.commercial) {
      steps.push({
        key: "visite_add_info",
        title: "Ajouter d'autres visites",
        text: "Dans une utilisation réelle, vous pouvez ajouter autant de visites que nécessaire en cliquant ici. Pour cette démo, cliquez simplement sur Suivant.",
        target: "add_visite",
        scroll: "bottom",
        highlightRadius: RADIUS.lg,
        required: false,
      });
    }

    steps.push({
      key: "submit",
      title: "Valider le rapport",
      text:
        "Vous pouvez valider le rapport. En démo, aucun envoi réel n’est effectué. Cette étape est optionnelle : vous pouvez terminer la démo sans valider.",
      target: "submit",
      scroll: "bottom",
      highlightRadius: RADIUS.lg,
      required: false,
    });

    return steps;
  }, [allowedVisitTypes.commercial, allowedVisitTypes.medical, showCommercialVisit]);

  const tourStepsRef = useRef<TourStep[]>(tourSteps);
  useEffect(() => {
    tourStepsRef.current = tourSteps;
    if (!tourOpen) return;
    if (tourIndex > tourSteps.length - 1) setTourIndex(tourSteps.length - 1);
  }, [tourSteps, tourOpen, tourIndex]);

  const currentStep = tourSteps[tourIndex];

  const stepSatisfied = useCallback(
    (key: string) => {
      const mv = medicalVisit;
      const cv = commercialVisit;
      const mp = mv.products[0];
      const cp = cv.products[0] as any;

      switch (key) {
        case "intro":
          return true;

        // Medical
        case "med_medecin":
          return mv.medecin_id != null;
        case "med_add_product":
          return mv.products.length > 0;
        case "med_product":
          return mp?.produit_id != null;
        case "med_rentabilite":
          return mp?.rentabilite != null;
        case "med_note":
          return String(mp?.note || "").trim().length > 0;
        case "med_add_more":
          return true;

        // Add visit
        case "add_visite":
          return showCommercialVisit;

        // Commercial
        case "com_type":
          return cv.client_filter != null;
        case "com_client":
          return cv.medecin_id != null;
        case "com_add_product":
          return cv.products.length > 0;
        case "com_product":
          return cp?.produit_id != null;
        case "com_prescription":
          return cp?.prescription != null;
        case "com_stock":
          return cp?.en_stock != null;
        case "com_qty":
          // optional
          return true;
        case "com_note":
          return String(cp?.note || "").trim().length > 0;
        case "com_add_more":
          return true;
        case "com_bon":
          return cv.bon_commande != null;

        case "visite_add_info":
          return true;
        case "submit":
          return true;

        default:
          return true;
      }
    },
    [medicalVisit, commercialVisit, showCommercialVisit]
  );

  const noteKeys = useMemo(() => new Set(["med_note", "com_note"]), []);

  // Auto-skip com_qty when not applicable
  useEffect(() => {
    if (!tourOpen) return;
    if (!currentStep) return;

    if (currentStep.key === "com_qty") {
      const cp = (commercialVisit.products[0] as any) || null;
      if (cp?.en_stock !== true) {
        const t = setTimeout(() => {
          if (tourIndex < tourStepsRef.current.length - 1) {
            setTourIndex((i) => Math.min(i + 1, tourStepsRef.current.length - 1));
          }
        }, 80);
        return () => clearTimeout(t);
      }
    }
  }, [tourOpen, currentStep?.key, commercialVisit, tourIndex]);

  // Auto-advance: if user performs required action, go next (except note steps)
  const prevSatRef = useRef<boolean>(false);
  const prevKeyRef = useRef<string>("");

  useEffect(() => {
    if (!tourOpen) return;
    if (!currentStep) return;

    const sat = stepSatisfied(currentStep.key);

    // reset baseline when step changes
    if (prevKeyRef.current !== currentStep.key) {
      prevKeyRef.current = currentStep.key;
      prevSatRef.current = sat;
      return;
    }

    const isRequired = currentStep.required === true;
    const shouldAutoAdvance = isRequired && !noteKeys.has(currentStep.key);

    if (
      shouldAutoAdvance &&
      tourIndex < tourStepsRef.current.length - 1 &&
      prevSatRef.current === false &&
      sat === true
    ) {
      const t = setTimeout(() => {
        setTourIndex((i) => Math.min(i + 1, tourStepsRef.current.length - 1));
      }, 120);
      return () => clearTimeout(t);
    }

    prevSatRef.current = sat;
  }, [tourOpen, currentStep?.key, currentStep?.required, noteKeys, stepSatisfied, tourIndex]);

  // Map target to ref
  const targetRef = useMemo<MeasurableRef | null>(() => {
    if (!currentStep) return null;

    switch (currentStep.target) {
      case "med_medecin":
        return refT_medMedecin;
      case "med_add_product":
        return refT_medAddProduct;
      case "med_product":
        return refT_medProduct;
      case "med_rentabilite":
        return refT_medRentabilite;
      case "med_note":
        return refT_medNote;
      case "med_add_more":
        return refT_medAddMore;

      case "add_visite":
        return refT_addVisiteButtons;

      case "com_type":
        return refT_comType;
      case "com_client":
        return refT_comClient;
      case "com_add_product":
        return refT_comAddProduct;
      case "com_product":
        return refT_comProduct;
      case "com_prescription":
        return refT_comPrescription;
      case "com_stock":
        return refT_comStock;
      case "com_qty":
        return refT_comQty;
      case "com_note":
        return refT_comNote;
      case "com_add_more":
        return refT_comAddMore;
      case "com_bon":
        return refT_comBon;

      case "submit":
        return refT_submit;

      case "none":
      default:
        return null;
    }
  }, [currentStep]);

  // ─────────────────────────────────────────────────────────────
  // Tour: stable autoscroll + precise highlight
  // ─────────────────────────────────────────────────────────────

  const pendingScrollResolveRef = useRef<null | (() => void)>(null);

  const scrollToYAsync = useCallback(
    (y: number, animated: boolean = true) => {
      return new Promise<void>((resolve) => {
        const nextY = Math.max(0, Math.floor(y));
        const cur = scrollOffsetRef.current;

        // If we are already there, don't wait for scroll events.
        if (Math.abs(cur - nextY) < 1) {
          return resolve();
        }

        // Cancel any previous pending scroll promise.
        if (pendingScrollResolveRef.current) {
          try {
            pendingScrollResolveRef.current();
          } catch {}
          pendingScrollResolveRef.current = null;
        }

        let done = false;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        const finish = () => {
          if (done) return;
          done = true;
          if (timeoutId) clearTimeout(timeoutId);
          pendingScrollResolveRef.current = null;
          resolve();
        };

        // Safety fallback if onMomentumScrollEnd does not fire.
        timeoutId = setTimeout(finish, animated ? 900 : 0);

        pendingScrollResolveRef.current = finish;

        scrollRef.current?.scrollTo({ y: nextY, animated });
      });
    },
    []
  );

  const waitForLayout = useCallback(() => {
    return new Promise<void>((resolve) => {
      InteractionManager.runAfterInteractions(() => {
        requestAnimationFrame(() => resolve());
      });
    });
  }, []);

  // UPDATED: Scroll logic now attempts to center the element in the *available* viewport
  // (which shrinks when the keyboard is open).
  const ensureTargetVisibleInScroll = useCallback(
    async (tr: MeasurableRef | null) => {
      if (!tr?.current) return;

      // 1. Get Viewport Frame (this frame shrinks when keyboard opens if KeyboardAvoidingView resizes it)
      const frame = (await measureInWindowAsync(refScrollFrame)) || scrollFrameRectRef.current;
      if (frame) scrollFrameRectRef.current = frame;
      
      const viewport = scrollFrameRectRef.current;
      if (!viewport) return;

      // 2. Retry loop for stability
      for (let attempt = 0; attempt < 3; attempt++) {
        const m = await measureInWindowAsync(tr);
        if (!m) return;

        // m.y is window coordinate. viewport.y is window coordinate of scroll frame top.
        // relativeY is the distance from the top of the visible scroll area to the element.
        const relativeY = m.y - viewport.y;
        
        // We want the element to be centered in the viewport.
        // Target relative Y = (Viewport Height - Element Height) / 2
        let idealRelativeY = (viewport.h - m.h) / 2;
        
        // Clamp: Ensure we don't push it too far down if it's huge, 
        // and keep at least a small margin from the very top (e.g. 20px).
        if (idealRelativeY < 20) idealRelativeY = 20;
        
        // Calculate absolute scroll position
        const currentScroll = scrollOffsetRef.current;
        
        // The element's current absolute Y position in the scroll view content is:
        // AbsoluteY = currentScroll + relativeY
        const absoluteTargetY = currentScroll + relativeY;
        
        // We want: NewScroll + idealRelativeY = AbsoluteY
        // So: NewScroll = AbsoluteY - idealRelativeY
        const nextScrollY = Math.max(0, Math.round(absoluteTargetY - idealRelativeY));
        
        // If we are already close enough, stop.
        if (Math.abs(currentScroll - nextScrollY) < 10) return;

        await scrollToYAsync(nextScrollY, true);
        await waitForLayout();
      }
    },
    [scrollToYAsync, waitForLayout]
  );

  const syncDisclosureForStep = useCallback(
    (step: TourStep) => {
      // Force-open any collapsibles needed for a given target so the ref has real dimensions.
      const t = step.target;

      const isMed =
        t === "med_medecin" ||
        t === "med_add_product" ||
        t === "med_product" ||
        t === "med_rentabilite" ||
        t === "med_note" ||
        t === "med_add_more";

      const isCom =
        t === "com_type" ||
        t === "com_client" ||
        t === "com_add_product" ||
        t === "com_product" ||
        t === "com_prescription" ||
        t === "com_stock" ||
        t === "com_qty" ||
        t === "com_note" ||
        t === "com_add_more" ||
        t === "com_bon";

      if (isMed) {
        setOpenMedical(true);
        // If the step is inside product details, keep the product card expanded.
        if (t !== "med_medecin" && t !== "med_add_product") {
          setOpenMedicalProduct(true);
        }
      }

      if (isCom) {
        setOpenCommercial(true);
        setOpenCommercialProduct(true);
      }
    },
    []
  );

  // Measure + position overlay per step
  useEffect(() => {
    if (!tourOpen) return;

    let cancelled = false;

    const run = async () => {
      setTourRect(null);

      const step = tourStepsRef.current[tourIndex];
      if (!step) return;

      // Make sure the right sections are expanded for the current target.
      syncDisclosureForStep(step);
      await waitForLayout();
      if (cancelled) return;

      // Some steps are global (no target) — keep deterministic scroll behavior.
      if (step.target === "none") {
        if (step.scroll === "top") {
          await scrollToYAsync(0, true);
          await waitForLayout();
        }
        return;
      }

      // FIX: Special wait for com_type because the card is newly created
      // and causes a large scroll shift that needs to settle.
      if (step.key === "com_type") {
        await new Promise((r) => setTimeout(r, 400));
      }

      // If the ref isn't ready yet, retry on the next layout tick.
      if (!targetRef?.current) {
        bumpLayoutTick();
        return;
      }

      // Refresh window offsets (status bar / safe area / keyboard can shift it).
      await updateRootOffset();
      await updateScrollFrameRect();

      // If the target is inside the ScrollView, ensure it is visible (CENTERED).
      if (!targetRef) return;

      if (cancelled) return;

      // FIX: STABILIZED MEASUREMENT LOOP
      // Check multiple times if the element position has stabilized.
      // This fixes the issue where scroll momentum or keyboard dismissal animation
      // is still running when measurement happens.
      let finalM: { x: number; y: number; w: number; h: number } | null = null;
      let lastY = -10000;
      let stableCount = 0;

      // Max 10 attempts (~1.5s max wait), looking for 2 consecutive stable frames
      for (let i = 0; i < 10; i++) {
        if (cancelled) return;
        const m = await measureInWindowAsync(targetRef);
        if (!m) break;

        // If Y position hasn't changed by more than 2 pixels, increment stability count
        if (Math.abs(m.y - lastY) < 2) {
          stableCount++;
          if (stableCount >= 2) {
            finalM = m;
            break; // We are stable!
          }
        } else {
          // It moved! Reset stability count.
          stableCount = 0;
          lastY = m.y;
        }

        // Wait a tick before re-measuring
        await new Promise((r) => setTimeout(r, 100));
      }

      // Fallback: if never stabilized, take last measurement
      if (!finalM) {
        finalM = await measureInWindowAsync(targetRef);
      }

      if (!finalM || cancelled) return;

      const m = finalM;
      const rootXY = rootOffsetRef.current;

      // Guard: ignore zero-sized measurements (usually indicates a collapsed or unrendered target).
      if (m.w < 2 || m.h < 2) {
        // One more layout turn can fix transient 0x0 on Android.
        await waitForLayout();
        const m2 = await measureInWindowAsync(targetRef);
        if (!m2 || m2.w < 2 || m2.h < 2 || cancelled) return;

        const PAD = 8;
        const x = Math.round(m2.x - rootXY.x - PAD);
        const y = Math.round(m2.y - rootXY.y - PAD);
        const w = Math.round(m2.w + PAD * 2);
        const h = Math.round(m2.h + PAD * 2);
        setTourRect({ x, y, w, h });
        return;
      }

      const PAD = 8;
      const x = Math.round(m.x - rootXY.x - PAD);
      const y = Math.round(m.y - rootXY.y - PAD);
      const w = Math.round(m.w + PAD * 2);
      const h = Math.round(m.h + PAD * 2);

      setTourRect({ x, y, w, h });
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [tourOpen, tourIndex, targetRef, layoutTick, bumpLayoutTick, ensureTargetVisibleInScroll, scrollToYAsync, syncDisclosureForStep, updateRootOffset, updateScrollFrameRect, waitForLayout]);

  const tooltipW = Math.min(360, W - 32);

  const canAddCommercialFromMedical = useMemo(() => {
    if (!allowedVisitTypes.commercial) return false;
    if (!allowedVisitTypes.medical) return true;
    return isMedicalVisitComplete(medicalVisit);
  }, [allowedVisitTypes.commercial, allowedVisitTypes.medical, medicalVisit]);

  // ─────────────────────────────────────────────────────────────
  // Render helpers (inline, simplified)
  // ─────────────────────────────────────────────────────────────

  const renderMedicalCard = () => {
    if (!allowedVisitTypes.medical) return null;

    const v = medicalVisit;
    const medLabel = v.medecin_id != null ? medecinLabelById.get(v.medecin_id) : null;
    const medSelected = v.medecin_id != null;

    const p = v.products[0] ?? null;
    const prodCount = v.products.length;
    
    // New logic for step label
    const step = p ? productStep(p) : 1;
    const stepLabel = STEP_LABEL_BY_STEP[step] ?? "Complet";

    // “Ajouter un autre produit” must be visible but not clickable (demo)
    const canAddAnotherProduct = false;
    
    // Resolve product title for header
    const produitIdNum = p?.produit_id == null ? null : Number(p.produit_id);
    const prodName = produitIdNum != null ? produitLabelById.get(produitIdNum) : null;
    const prodTitle =
      produitIdNum != null
        ? `#1 ${prodName && prodName.length ? prodName : "Produit"}`
        : `Produit #1`;


    return (
      <AppCard style={{ padding: SPACING.lg }}>
        <View style={visitStyles.visitHeader}>
          <Pressable onPress={() => setOpenMedical((x) => !x)} style={{ flex: 1 }}>
            <Text style={visitStyles.visitTitle}>Visite médicale #1</Text>
            <Text style={visitStyles.visitSubtitle} numberOfLines={1}>
              {medLabel ? `Médecin: ${medLabel}` : "Médecin: Non sélectionné"}
              {prodCount ? `  •  ${prodCount} produit(s)` : ""}
            </Text>
          </Pressable>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Pressable onPress={() => setOpenMedical((x) => !x)} hitSlop={10}>
              <Ionicons
                name={openMedical ? "chevron-up" : "chevron-down"}
                size={18}
                color={COLORS.textMuted}
              />
            </Pressable>
          </View>
        </View>

        {openMedical ? (
          <View style={{ gap: 12, paddingTop: 12 }}>
            <View ref={refT_medMedecin} collapsable={false}>
              <AppSelect
                title="Médecin"
                titleAr="الطبيب"
                placeholder={loadingRefs ? "Chargement..." : "Sélectionner un médecin"}
                value={v.medecin_id}
                options={medecinsMedical}
                disabled={loadingRefs}
                showId
                onChange={(id) =>
                  setMedicalVisit((prev) => ({
                    ...prev,
                    medecin_id: id == null ? null : Number(id),
                  }))
                }
              />
            </View>

            {!medSelected ? (
              <Text style={visitStyles.smallMuted}>Sélectionnez un médecin pour continuer.</Text>
            ) : (
              <>
                <View style={visitStyles.divider} />

                <View ref={refT_medAddProduct} collapsable={false}>
                  {!v.products.length ? (
                    <>
                      <Text style={visitStyles.smallMuted}>Ajoutez un produit pour continuer.</Text>
                      <Pressable
                        onPress={() => {
                          setMedicalVisit((prev) => ({
                            ...prev,
                            products: [makeEmptyMedicalProduct()],
                          }));
                          setOpenMedicalProduct(true);
                        }}
                        style={[visitStyles.smallActionBtn, visitStyles.addProductBottom]}
                      >
                        <Ionicons name="add" size={18} color={COLORS.brand} />
                        <Text style={visitStyles.smallActionText}>Ajouter un produit</Text>
                      </Pressable>
                    </>
                  ) : null}
                </View>

                {v.products.length ? (
                  <>
                    <View style={visitStyles.subCard}>
                      <Pressable
                        onPress={() => setOpenMedicalProduct((x) => !x)}
                        style={visitStyles.prodHeader}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={visitStyles.subCardTitle} numberOfLines={1}>
                            {prodTitle}
                          </Text>
                          <Text style={visitStyles.smallMuted} numberOfLines={1}>
                            {stepLabel}
                          </Text>
                        </View>

                        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                          <Pressable
                            onPress={(e: any) => {
                              e?.stopPropagation?.();
                              setMedicalVisit((prev) => ({ ...prev, products: [] }));
                            }}
                            hitSlop={10}
                          >
                            <Ionicons name="trash" size={18} color="#DC2626" />
                          </Pressable>

                          <Ionicons
                            name={openMedicalProduct ? "chevron-up" : "chevron-down"}
                            size={18}
                            color={COLORS.textMuted}
                          />
                        </View>
                      </Pressable>

                      {openMedicalProduct ? (
                        <View style={{ gap: 10, paddingTop: 10 }}>
                          <View ref={refT_medProduct} collapsable={false}>
                            <AppSelect
                              title="Produit"
                              placeholder={loadingRefs ? "Chargement..." : "Sélectionner un produit"}
                              value={p?.produit_id ?? null}
                              options={produits}
                              disabled={loadingRefs}
                              onChange={(id) =>
                                setMedicalVisit((prev) => ({
                                  ...prev,
                                  products: [
                                    {
                                      ...prev.products[0],
                                      produit_id: id == null ? null : Number(id),
                                    },
                                  ],
                                }))
                              }
                            />
                          </View>

                          {p?.produit_id != null ? (
                            <View ref={refT_medRentabilite} collapsable={false}>
                              <Text style={visitStyles.fieldLabel}>Rentabilité</Text>
                              <View style={{ gap: 8 }}>
                                {RENTABILITE_OPTIONS.map((opt) => {
                                  const optIdNum = Number(opt.id);
                                  const checked =
                                    p.rentabilite != null && Number(p.rentabilite) === optIdNum;

                                  return (
                                    <Pressable
                                      key={String(opt.id)}
                                      onPress={() =>
                                        setMedicalVisit((prev) => ({
                                          ...prev,
                                          products: [
                                            {
                                              ...prev.products[0],
                                              rentabilite: optIdNum,
                                            },
                                          ],
                                        }))
                                      }
                                      style={[
                                        visitStyles.rentRow,
                                        checked ? visitStyles.rentRowChecked : null,
                                      ]}
                                    >
                                      <Ionicons
                                        name={checked ? "checkbox" : "square-outline"}
                                        size={20}
                                        color={checked ? COLORS.brand : COLORS.textMuted}
                                      />
                                      <Text style={visitStyles.rentText}>{opt.label}</Text>
                                    </Pressable>
                                  );
                                })}
                              </View>

                              {p.rentabilite == null ? (
                                <Text style={visitStyles.smallMuted}>Sélection obligatoire.</Text>
                              ) : null}
                            </View>
                          ) : (
                            <Text style={visitStyles.smallMuted}>Sélectionnez d’abord le produit.</Text>
                          )}

                          {p?.produit_id != null && p?.rentabilite != null ? (
                            <View ref={refT_medNote} collapsable={false}>
                              <Text style={visitStyles.fieldLabel}>Note produit</Text>

                              <View style={{ gap: 6 }}>
                                <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                                  <TextInput
                                    value={p.note}
                                    onChangeText={(t) =>
                                      setMedicalVisit((prev) => ({
                                        ...prev,
                                        products: [{ ...prev.products[0], note: t }],
                                      }))
                                    }
                                    placeholder="Tapez la note..."
                                    placeholderTextColor={COLORS.textMuted}
                                    multiline
                                    style={[
                                      visitStyles.input,
                                      { minHeight: 70, flex: 1, textAlignVertical: "top" },
                                    ]}
                                  />

                                  <Pressable disabled style={[visitStyles.micBtn, visitStyles.disabledBtn]} hitSlop={10}>
                                    <Ionicons name="mic-outline" size={20} color={COLORS.textMuted} />
                                  </Pressable>
                                </View>

                                <View style={{ flexDirection: "row", gap: 8 }}>
                                  <Pressable disabled style={[visitStyles.smallActionBtn, visitStyles.disabledBtn]}>
                                    <Text style={visitStyles.smallActionText}>FR</Text>
                                  </Pressable>
                                  <Pressable disabled style={[visitStyles.smallActionBtn, visitStyles.disabledBtn]}>
                                    <Text style={visitStyles.smallActionText}>AR</Text>
                                  </Pressable>
                                </View>

                                {!String(p.note || "").trim() ? (
                                  <Text style={visitStyles.smallMuted}>
                                    Note obligatoire pour continuer | tapez RAS si vous n'avez rien à ajouter.
                                  </Text>
                                ) : null}
                              </View>
                            </View>
                          ) : null}
                        </View>
                      ) : null}
                    </View>

                    <View ref={refT_medAddMore} collapsable={false}>
                      <Pressable
                        disabled={!canAddAnotherProduct}
                        style={[
                          visitStyles.smallActionBtn,
                          visitStyles.addProductBottom,
                          visitStyles.disabledBtn,
                        ]}
                      >
                        <Ionicons name="add" size={18} color={COLORS.brand} />
                        <Text style={visitStyles.smallActionText}>Ajouter un autre produit</Text>
                      </Pressable>
                    </View>
                  </>
                ) : null}
              </>
            )}
          </View>
        ) : null}
      </AppCard>
    );
  };

  const renderCommercialCard = () => {
    if (!allowedVisitTypes.commercial) return null;
    if (!showCommercialVisit) return null;

    const v = commercialVisit;
    const clientLabel = v.medecin_id != null ? clientLabelById.get(v.medecin_id) : null;

    const filterSelected = v.client_filter != null;
    const clientSelected = v.medecin_id != null;

    const bucket = v.client_filter ? clientsByType[v.client_filter] ?? [] : [];
    const filteredClients = bucket.map((c) => ({
      id: c.id,
      label: c.label,
      subtitle: c.subtitle,
      metaLine: c.metaLine,
      keywords: c.keywords,
      plan_border: c.plan_border,
    })) as any[];

    const p = v.products[0] ?? null;
    const prodComplete = p ? isCommercialProductComplete(p) : false;
    const prodCount = v.products.length;

    const isPharmacie = v.client_filter === "Pharmacie";
    const prescriptionYesLabel = isPharmacie ? "Prescrit | يوصف" : "Commandé | هنالك طلبيات";
    const prescriptionNoLabel = isPharmacie ? "Non prescrit | لا يوصف" : "Non commandé | لا يوجد طلبيات";
    
    // Resolve product title for header
    const produitIdNum = p?.produit_id == null ? null : Number(p.produit_id);
    const prodName = produitIdNum != null ? produitLabelById.get(produitIdNum) : null;
    const prodTitle =
      produitIdNum != null
        ? `#1 ${prodName && prodName.length ? prodName : "Produit"}`
        : `Produit #1`;

    const canAddAnotherProduct = false;

    return (
      <AppCard style={{ padding: SPACING.lg }}>
        <View style={visitStyles.visitHeader}>
          <Pressable onPress={() => setOpenCommercial((x) => !x)} style={{ flex: 1 }}>
            <Text style={visitStyles.visitTitle}>Visite commerciale #1</Text>
            <Text style={visitStyles.visitSubtitle} numberOfLines={1}>
              {clientLabel ? `Client: ${clientLabel}` : "Client: Non sélectionné"}
              {prodCount ? `  •  ${prodCount} produit(s)` : ""}
            </Text>
          </Pressable>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Pressable onPress={() => setOpenCommercial((x) => !x)} hitSlop={10}>
              <Ionicons
                name={openCommercial ? "chevron-up" : "chevron-down"}
                size={18}
                color={COLORS.textMuted}
              />
            </Pressable>
          </View>
        </View>

        {openCommercial ? (
          <View style={{ gap: 12, paddingTop: 12 }}>
            <View ref={refT_comType} collapsable={false}>
              <AppSelect
                title="Type client"
                placeholder={loadingRefs ? "Chargement..." : "Pharmacie / Grossiste / Super gros"}
                value={v.client_filter}
                options={FILTER_OPTIONS}
                disabled={loadingRefs}
                onChange={(val) => {
                  const next = (val as CommercialClientType | null) ?? null;
                  setCommercialVisit({
                    ...makeEmptyCommercialVisit(),
                    _key: v._key,
                    client_filter: next,
                  });
                  setOpenCommercialProduct(true);
                }}
              />
            </View>

            {!filterSelected ? (
              <Text style={visitStyles.smallMuted}>Choisissez un filtre pour continuer.</Text>
            ) : (
              <>
                <View ref={refT_comClient} collapsable={false}>
                  <AppSelect
                    title="Client"
                    placeholder={loadingRefs ? "Chargement..." : "Sélectionner un client"}
                    value={v.medecin_id}
                    options={filteredClients}
                    disabled={loadingRefs}
                    showId
                    onChange={(id) =>
                      setCommercialVisit((prev) => ({
                        ...prev,
                        medecin_id: id == null ? null : Number(id),
                      }))
                    }
                  />
                </View>

                {!clientSelected ? (
                  <Text style={visitStyles.smallMuted}>Sélectionnez un client pour continuer.</Text>
                ) : (
                  <>
                    <View style={visitStyles.divider} />
                    
                    <View ref={refT_comAddProduct} collapsable={false}>
                      {!v.products.length ? (
                        <>
                          <Text style={visitStyles.smallMuted}>Ajoutez un produit pour continuer.</Text>
                          <Pressable
                            onPress={() => {
                              setCommercialVisit((prev) => ({
                                ...prev,
                                products: [makeEmptyCommercialProduct()],
                              }));
                              setOpenCommercialProduct(true);
                            }}
                            style={[visitStyles.smallActionBtn, visitStyles.addProductBottom]}
                          >
                            <Ionicons name="add" size={18} color={COLORS.brand} />
                            <Text style={visitStyles.smallActionText}>Ajouter un produit</Text>
                          </Pressable>
                        </>
                      ) : null}
                    </View>

                    {v.products.length ? (
                      <>
                        <View style={visitStyles.subCard}>
                          <Pressable
                            onPress={() => setOpenCommercialProduct((x) => !x)}
                            style={visitStyles.prodHeader}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={visitStyles.subCardTitle} numberOfLines={1}>
                                {prodTitle}
                              </Text>
                              <Text style={visitStyles.smallMuted} numberOfLines={1}>
                                {prodComplete ? "Complet" : "À compléter"}
                              </Text>
                            </View>

                            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                              <Pressable
                                onPress={(e: any) => {
                                  e?.stopPropagation?.();
                                  setCommercialVisit((prev) => ({ ...prev, products: [], bon_commande: null }));
                                }}
                                hitSlop={10}
                              >
                                <Ionicons name="trash" size={18} color="#DC2626" />
                              </Pressable>

                              <Ionicons
                                name={openCommercialProduct ? "chevron-up" : "chevron-down"}
                                size={18}
                                color={COLORS.textMuted}
                              />
                            </View>
                          </Pressable>

                          {openCommercialProduct ? (
                            <View style={{ gap: 10, paddingTop: 10 }}>
                              <View ref={refT_comProduct} collapsable={false}>
                                <AppSelect
                                  title="Produit"
                                  placeholder={loadingRefs ? "Chargement..." : "Sélectionner un produit"}
                                  value={p?.produit_id ?? null}
                                  options={produits}
                                  disabled={loadingRefs}
                                  onChange={(id) =>
                                    setCommercialVisit((prev) => ({
                                      ...prev,
                                      products: [
                                        {
                                          ...prev.products[0],
                                          produit_id: id == null ? null : Number(id),
                                        },
                                      ],
                                    }))
                                  }
                                />
                              </View>

                              {p?.produit_id != null ? (
                                <View ref={refT_comPrescription} collapsable={false}>
                                  <Text style={visitStyles.fieldLabel}>
                                    {isPharmacie ? "Prescription" : "Commande"}
                                  </Text>

                                  <RadioRow
                                    label={prescriptionYesLabel}
                                    checked={p.prescription === true}
                                    onPress={() =>
                                      setCommercialVisit((prev) => ({
                                        ...prev,
                                        products: [{ ...prev.products[0], prescription: true }],
                                      }))
                                    }
                                  />
                                  <RadioRow
                                    label={prescriptionNoLabel}
                                    checked={p.prescription === false}
                                    onPress={() =>
                                      setCommercialVisit((prev) => ({
                                        ...prev,
                                        products: [{ ...prev.products[0], prescription: false }],
                                      }))
                                    }
                                  />

                                  {p.prescription == null ? (
                                    <Text style={visitStyles.smallMuted}>Sélection obligatoire.</Text>
                                  ) : null}
                                </View>
                              ) : null}

                              {p?.produit_id != null && p?.prescription != null ? (
                                <View ref={refT_comStock} collapsable={false}>
                                  <Text style={visitStyles.fieldLabel}>Stock</Text>

                                  <RadioRow
                                    label="En rupture"
                                    checked={p.en_stock === false}
                                    onPress={() =>
                                      setCommercialVisit((prev) => ({
                                        ...prev,
                                        products: [{ ...prev.products[0], en_stock: false, qtt: 0 }],
                                      }))
                                    }
                                  />
                                  <RadioRow
                                    label="En stock"
                                    checked={p.en_stock === true}
                                    onPress={() =>
                                      setCommercialVisit((prev) => ({
                                        ...prev,
                                        products: [{ ...prev.products[0], en_stock: true }],
                                      }))
                                    }
                                  />

                                  {p.en_stock == null ? (
                                    <Text style={visitStyles.smallMuted}>Sélection obligatoire.</Text>
                                  ) : null}
                                </View>
                              ) : null}

                              {p?.en_stock === true ? (
                                <View ref={refT_comQty} collapsable={false}>
                                  <Text style={visitStyles.fieldLabel}>Quantité en stock (optionnel)</Text>
                                  <TextInput
                                    value={String(p.qtt ?? 0)}
                                    onChangeText={(t) => {
                                      const n = Math.max(
                                        0,
                                        parseInt(String(t || "0").replace(/[^\d]/g, ""), 10) || 0
                                      );
                                      setCommercialVisit((prev) => ({
                                        ...prev,
                                        products: [{ ...prev.products[0], qtt: n }],
                                      }));
                                    }}
                                    keyboardType="numeric"
                                    placeholder="0"
                                    placeholderTextColor={COLORS.textMuted}
                                    style={visitStyles.input}
                                  />
                                </View>
                              ) : null}

                              {p?.produit_id != null && p?.prescription != null && p?.en_stock != null ? (
                                <View ref={refT_comNote} collapsable={false}>
                                  <Text style={visitStyles.fieldLabel}>Note produit</Text>

                                  <View style={{ gap: 6 }}>
                                    <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                                      <TextInput
                                        value={String((p as any)?.note ?? "")}
                                        onChangeText={(t) =>
                                          setCommercialVisit((prev) => ({
                                            ...prev,
                                            products: [({ ...prev.products[0], note: t } as any)],
                                          }))
                                        }
                                        placeholder="Tapez la note..."
                                        placeholderTextColor={COLORS.textMuted}
                                        multiline
                                        style={[
                                          visitStyles.input,
                                          { minHeight: 70, flex: 1, textAlignVertical: "top" },
                                        ]}
                                      />

                                      <Pressable disabled style={[visitStyles.micBtn, visitStyles.disabledBtn]}>
                                        <Ionicons name="mic-outline" size={20} color={COLORS.textMuted} />
                                      </Pressable>
                                    </View>

                                    <View style={{ flexDirection: "row", gap: 8 }}>
                                      <Pressable disabled style={[visitStyles.smallActionBtn, visitStyles.disabledBtn]}>
                                        <Text style={visitStyles.smallActionText}>FR</Text>
                                      </Pressable>
                                      <Pressable disabled style={[visitStyles.smallActionBtn, visitStyles.disabledBtn]}>
                                        <Text style={visitStyles.smallActionText}>AR</Text>
                                      </Pressable>
                                    </View>

                                    {!String((p as any)?.note ?? "").trim() ? (
                                      <Text style={visitStyles.smallMuted}>
                                        Note obligatoire pour continuer | tapez RAS si vous n'avez rien a ajouter.
                                      </Text>
                                    ) : null}
                                  </View>
                                </View>
                              ) : null}
                            </View>
                          ) : null}
                        </View>

                        <View ref={refT_comAddMore} collapsable={false}>
                           <Pressable
                            disabled={!canAddAnotherProduct}
                            style={[
                              visitStyles.smallActionBtn,
                              visitStyles.addProductBottom,
                              visitStyles.disabledBtn,
                            ]}
                          >
                            <Ionicons name="add" size={18} color={COLORS.brand} />
                            <Text style={visitStyles.smallActionText}>Ajouter un autre produit</Text>
                          </Pressable>
                        </View>

                        {p?.produit_id != null && p?.prescription != null && p?.en_stock != null && String((p as any)?.note ?? "").trim() ? (
                          <>
                            <View style={visitStyles.divider} />
                            <View ref={refT_comBon} collapsable={false}>
                              <Text style={visitStyles.fieldLabel}>Avez-vous décroché un bon de commande ?</Text>

                              <RadioRow
                                label="Oui"
                                checked={v.bon_commande === true}
                                onPress={() => setCommercialVisit((prev) => ({ ...prev, bon_commande: true }))}
                              />
                              <RadioRow
                                label="Non"
                                checked={v.bon_commande === false}
                                onPress={() => setCommercialVisit((prev) => ({ ...prev, bon_commande: false }))}
                              />

                              {v.bon_commande == null ? (
                                <Text style={visitStyles.smallMuted}>Sélection obligatoire (dernière étape).</Text>
                              ) : null}
                            </View>
                          </>
                        ) : null}
                      </>
                    ) : null}
                  </>
                )}
              </>
            )}
          </View>
        ) : null}
      </AppCard>
    );
  };

  // ─────────────────────────────────────────────────────────────
  // Main render
  // ─────────────────────────────────────────────────────────────

  // Tooltip next button logic
  const isStepRequired = currentStep?.required === true;
  const isCurrentSatisfied = currentStep ? stepSatisfied(currentStep.key) : true;
  const nextDisabled = isStepRequired && !isCurrentSatisfied;

  const onNextPressed = () => {
    if (!currentStep) return;

    // Close keyboard after note steps
    if (currentStep.key === "med_note" || currentStep.key === "com_note") {
      Keyboard.dismiss();
    }

    if (tourIndex >= tourSteps.length - 1) {
      exitDemoAndReturn();
      return;
    }

    setTourIndex((i) => Math.min(i + 1, tourSteps.length - 1));
  };

  const onClosePressed = () => {
    // requirement: redirect even if user closes with X
    exitDemoAndReturn();
  };

  return (
    <SafeAreaView edges={["left", "right", "bottom"]} style={styles.root}>
      <View ref={refRoot} collapsable={false} onLayout={onRootLayout} style={{ flex: 1 }}>
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

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View
            ref={refScrollFrame}
            collapsable={false}
            onLayout={onScrollFrameLayout}
            style={{ flex: 1 }}
          >
            <ScrollView
              ref={scrollRef}
              scrollEnabled={!tourOpen}
              onScroll={(e) => {
                scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
              }}
              onMomentumScrollEnd={() => {
                pendingScrollResolveRef.current?.();
              }}
              onScrollEndDrag={() => {
                pendingScrollResolveRef.current?.();
              }}
              onContentSizeChange={() => {
                if (tourOpen) bumpLayoutTick();
              }}
              scrollEventThrottle={16}
              contentContainerStyle={[styles.content, { paddingBottom: (insets.bottom || 0) + 160 }]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
            <Text style={styles.stepTitle}>Étape 2 (Démo)</Text>

            {loadingRefs ? (
              <AppCard>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <ActivityIndicator />
                  <Text style={{ color: COLORS.textMuted, fontWeight: "800" }}>
                    Chargement des référentiels...
                  </Text>
                </View>
              </AppCard>
            ) : null}

            {!loadingRefs && medecinsMedical.length === 0 ? (
              <View style={[styles.card, { borderColor: COLORS.danger }]}>
                <Text style={styles.sectionTitle}>Aucun médecin médical trouvé</Text>
                <Text style={styles.smallMuted}>Vérifiez /rapports/referentiels (medecins_medical).</Text>

                <Pressable onPress={() => setReloadTick((t) => t + 1)} style={styles.secondaryBtn}>
                  <Ionicons name="refresh" size={18} color={COLORS.brand} />
                  <Text style={styles.secondaryBtnText}>Recharger</Text>
                </Pressable>
              </View>
            ) : null}

            {params.rapportId ? <Text style={styles.smallMuted}>Rapport ID: {params.rapportId}</Text> : null}

            {allowedVisitTypes.medical ? renderMedicalCard() : null}
            {allowedVisitTypes.commercial ? renderCommercialCard() : null}

            {/* Two adjacent buttons (demo) */}
            {allowedVisitTypes.medical && allowedVisitTypes.commercial ? (
              <View ref={refT_addVisiteButtons} collapsable={false} style={{ flexDirection: "row", gap: 10 }}>
                <Pressable disabled style={[styles.addBtnMedical, styles.disabledBtn]}>
                  <Ionicons name="add" size={18} color="#fff" />
                  <Text style={styles.addBtnText}>Visite medical</Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    if (showCommercialVisit) return;
                    addCommercialVisit();
                  }}
                  disabled={showCommercialVisit || !canAddCommercialFromMedical}
                  style={[
                    styles.addBtnCommercial,
                    (showCommercialVisit || !canAddCommercialFromMedical) ? styles.disabledBtn : null,
                  ]}
                >
                  <Ionicons name="add" size={18} color="#fff" />
                  <Text style={styles.addBtnText}>Visite commercial</Text>
                </Pressable>
              </View>
            ) : null}

            {/* MOVED INSIDE SCROLLVIEW */}
            <View style={[styles.footer, { marginTop: 20, borderTopWidth: 0, paddingBottom: 0 }]}>
              <View ref={refT_submit} collapsable={false}>
                <Pressable onPress={submitDemo} style={styles.primaryBtn}>
                  <Ionicons name="cloud-upload-outline" size={18} color={COLORS.textOnBrand} />
                  <Text style={styles.primaryBtnText}>Valider le rapport</Text>
                </Pressable>
              </View>
            </View>

            </ScrollView>
          </View>
          
          {/* Footer View was here, now removed */}
          
        </KeyboardAvoidingView>

        {/* TOUR OVERLAY */}
        {tourOpen && (
          <View style={[StyleSheet.absoluteFill, { zIndex: 9999, elevation: 9999 }]} pointerEvents="box-none">
            {tourRect ? (
              <>
                <Pressable
                  style={[tourUI.dimBlock, { left: 0, top: 0, right: 0, height: Math.max(0, tourRect.y) }]}
                  onPress={() => {}}
                />
                <Pressable
                  style={[
                    tourUI.dimBlock,
                    { left: 0, top: tourRect.y + tourRect.h, right: 0, bottom: 0 },
                  ]}
                  onPress={() => {}}
                />
                <Pressable
                  style={[
                    tourUI.dimBlock,
                    { left: 0, top: tourRect.y, width: Math.max(0, tourRect.x), height: tourRect.h },
                  ]}
                  onPress={() => {}}
                />
                <Pressable
                  style={[
                    tourUI.dimBlock,
                    { left: tourRect.x + tourRect.w, top: tourRect.y, right: 0, height: tourRect.h },
                  ]}
                  onPress={() => {}}
                />

                <View
                  pointerEvents="none"
                  style={[
                    tourUI.hole,
                    {
                      left: tourRect.x,
                      top: tourRect.y,
                      width: tourRect.w,
                      height: tourRect.h,
                      borderRadius: currentStep?.highlightRadius ?? RADIUS.lg,
                    },
                  ]}
                />
              </>
            ) : (
              <View style={[tourUI.dimBlock, StyleSheet.absoluteFill]} pointerEvents="auto" />
            )}

            <View style={[tourUI.tooltip, { width: tooltipW, left: 16, top: 16 }]}>
              <View style={tourUI.tooltipTopRow}>
                <Text style={tourUI.kicker}>
                  {tourIndex + 1}/{tourSteps.length}
                </Text>

                <Pressable onPress={onClosePressed} hitSlop={10} style={tourUI.closeBtn}>
                  <Ionicons name="close" size={18} color={COLORS.text} />
                </Pressable>
              </View>

              <Text style={tourUI.title}>{currentStep?.title}</Text>
              <Text style={tourUI.text}>{currentStep?.text}</Text>

              <View style={tourUI.actions}>
                <Pressable
                  onPress={prevTour}
                  disabled={tourIndex === 0}
                  style={[tourUI.btnGhost, tourIndex === 0 && { opacity: 0.4 }]}
                >
                  <Text style={tourUI.btnGhostText}>Précédent</Text>
                </Pressable>

                {/* Only show button if NOT the last step */}
                {tourIndex < tourSteps.length - 1 ? (
                  <Pressable
                    onPress={onNextPressed}
                    disabled={nextDisabled}
                    style={[tourUI.btnSolid, nextDisabled ? { opacity: 0.55 } : null]}
                  >
                    <Text style={tourUI.btnSolidText}>Suivant</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, gap: SPACING.md },

  stepTitle: { fontSize: 18, fontWeight: "900", color: COLORS.text },
  stepSubtitle: { fontSize: 13, color: COLORS.textMuted, marginTop: -6 },

  smallMuted: { fontSize: 12, color: COLORS.textMuted },
  sectionTitle: { fontWeight: "900", color: COLORS.text, marginBottom: 8 },

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

  addBtnMedical: {
    flex: 1,
    borderRadius: RADIUS.lg,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#16A34A",
  },
  addBtnCommercial: {
    flex: 1,
    borderRadius: RADIUS.lg,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#2563EB",
  },
  addBtnText: { color: "#fff", fontWeight: "900", fontSize: 14 },

  disabledBtn: { opacity: 0.55 },

  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
  },
});

const visitStyles = StyleSheet.create({
  visitHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  visitTitle: { fontWeight: "900", color: COLORS.text, fontSize: 15 },
  visitSubtitle: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },

  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 6 },

  addProductBtn: {
    backgroundColor: COLORS.brand,
    borderRadius: RADIUS.lg,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  addProductText: { color: COLORS.textOnBrand, fontWeight: "900" },

  productHeader: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  // STYLES FROM NEWVISITEM
  subCard: {
    backgroundColor: COLORS.cardAlt ?? COLORS.card,
    borderRadius: RADIUS.md,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
  },
  subCardTitle: { fontWeight: "900", color: COLORS.text },
  prodHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },

  fieldLabel: { fontWeight: "900", color: COLORS.text, marginTop: 6, fontSize: TYPO?.small ?? 13 },

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
  rentRowChecked: { 
    borderColor: "rgba(50,161,55,0.35)", 
    backgroundColor: COLORS.brandSoft ?? "rgba(50,161,55,0.06)" 
  },
  rentText: { flex: 1, color: COLORS.text, fontWeight: "800", fontSize: 12 },

  smallMuted: { fontSize: 12, color: COLORS.textMuted },

  input: {
    borderWidth: 1,
    borderColor: FIELD?.border ?? COLORS.border,
    borderRadius: FIELD?.radius ?? RADIUS.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    backgroundColor: FIELD?.bg ?? COLORS.card,
  },

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

  smallActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: COLORS.brandSoft ?? "rgba(50,161,55,0.18)",
    borderWidth: 1,
    borderColor: "rgba(50,161,55,0.18)",
  },
  smallActionText: { color: COLORS.brand, fontWeight: "900" },

  addProductBottom: {
    marginTop: 10,
    alignSelf: "flex-start",
  },

  disabledBtn: { opacity: 0.55 },
});

const tourUI = StyleSheet.create({
  dimBlock: { position: "absolute", backgroundColor: TOUR_OVERLAY },
  hole: {
    position: "absolute",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.9)",
    backgroundColor: "transparent",
  },
  tooltip: {
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
  tooltipTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  kicker: { fontSize: 12, fontWeight: "800", color: COLORS.textMuted },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 14, fontWeight: "900", color: COLORS.text, marginBottom: 6 },
  text: { color: COLORS.text, lineHeight: 18 },
  actions: { marginTop: 12, flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  btnGhost: {
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.15)",
    borderRadius: RADIUS.lg,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minWidth: 110,
    alignItems: "center",
    justifyContent: "center",
  },
  btnGhostText: { fontWeight: "900", color: COLORS.text },
  btnSolid: {
    backgroundColor: COLORS.brand,
    borderRadius: RADIUS.lg,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minWidth: 110,
    alignItems: "center",
    justifyContent: "center",
  },
  btnSolidText: { fontWeight: "900", color: COLORS.textOnBrand },
});