import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import { api } from "../../../src/api/client";
import { AppHeader } from "../../../src/components/AppHeader";
import { AppCard } from "../../../src/components/AppCard";
import { COLORS, RADIUS, SPACING } from "../../../src/ui/theme";
import { type AppSelectOption } from "../../../src/components/AppSelect";

import { NewVisiteM } from "./NewVisiteM";
import { NewVisiteC, type CommercialClientOption } from "./NewVisiteC";
import type {
  VisitDraft,
  MedicalVisitDraft,
  CommercialVisitDraft,
  MedicalProductDraft,
  CommercialProductDraft,
  CommercialClientType,
  VisitType,
} from "../../../src/types/rapportDrafts";

const makeKey = () => `${Date.now()}_${Math.random().toString(16).slice(2)}`;

const makeEmptyMedicalProduct = (): MedicalProductDraft => ({
  _key: makeKey(),
  produit_id: null,
  rentabilite: null,
  note: "",
});

// 1) Add note to the empty commercial product
const makeEmptyCommercialProduct = (): CommercialProductDraft =>
  ({
    _key: makeKey(),
    produit_id: null,
    prescription: null,
    en_stock: null,
    qtt: 0,
    note: "", // NEW
  } as any);

const makeEmptyVisit = (type: VisitType): VisitDraft => {
  if (type === "medical") {
    const v: MedicalVisitDraft = {
      _key: makeKey(),
      visite_type: "medical",
      medecin_id: null,
      products: [],
    };
    return v;
  }

  const v: CommercialVisitDraft = {
    _key: makeKey(),
    visite_type: "commercial",
    medecin_id: null,
    client_filter: null,
    bon_commande: null,
    products: [],
  };
  return v;
};

const ymdToDmy = (s: string) => {
  const v = (s || "").trim();
  if (!v) return "";
  const datePart = v.includes("T") ? v.slice(0, 10) : v;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  if (!m) return v;
  return `${m[3]}/${m[2]}/${m[1]}`;
};

// Gating helpers
const isMedicalVisitComplete = (v: MedicalVisitDraft) => {
  return (
    v.medecin_id != null &&
    v.products.length > 0 &&
    v.products.every(
      (p) =>
        p.produit_id != null &&
        p.rentabilite != null &&
        String(p.note || "").trim().length > 0
    )
  );
};

// 2) Make commercial visit completeness require note (same as medical)
const isCommercialVisitComplete = (v: CommercialVisitDraft) => {
  return (
    v.client_filter != null &&
    v.medecin_id != null &&
    v.products.length > 0 &&
    v.products.every(
      (p) =>
        p.produit_id != null &&
        p.prescription != null &&
        p.en_stock != null &&
        String((p as any).note || "").trim().length > 0 // NEW
    ) &&
    v.bon_commande != null
  );
};

const isVisitComplete = (v: VisitDraft) => {
  return v.visite_type === "medical"
    ? isMedicalVisitComplete(v)
    : isCommercialVisitComplete(v);
};

const firstIncompleteVisitIndex = (visits: VisitDraft[]) => {
  for (let i = 0; i < visits.length; i++) {
    if (!isVisitComplete(visits[i])) return i;
  }
  return -1;
};

export default function RapportPhase2() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ rapportId?: string }>();

  const [loadingRefs, setLoadingRefs] = useState(true);

  const [medecinsMedical, setMedecinsMedical] = useState<AppSelectOption[]>([]);
  const [clientsCommercial, setClientsCommercial] = useState<CommercialClientOption[]>([]);
  const [produits, setProduits] = useState<AppSelectOption[]>([]);
  const [reloadTick, setReloadTick] = useState(0);
  const [clientsByType, setClientsByType] = useState<Record<string, CommercialClientOption[]>>({
  Pharmacie: [],
  Grossiste: [],
  SuperGros: [],
});


  // --- Role scoping (wired later to backend/AuthContext) ---
  const [mySpecialityRolee, setMySpecialityRolee] = useState<string | null>(null);
  const [underUsersSpecialities, setUnderUsersSpecialities] = useState<string[]>([]);

  // first visit is medical
  const [visits, setVisits] = useState<VisitDraft[]>([makeEmptyVisit("medical")]);
  const [openVisitIdx, setOpenVisitIdx] = useState(0);

  // Open product per visit
  const [openProductIdxByVisit, setOpenProductIdxByVisit] = useState<Record<string, number>>({});
  const getOpenProdIdx = (visitKey: string) => openProductIdxByVisit[visitKey] ?? 0;
  const setOpenProdIdx = (visitKey: string, prodIdx: number) => {
    setOpenProductIdxByVisit((prev) => ({ ...prev, [visitKey]: prodIdx }));
  };

  // Dictation (medical + commercial)
  const [recordingKey, setRecordingKey] = useState<string | null>(null);
  const [dictationLang, setDictationLang] = useState<"fr-FR" | "ar-DZ">("fr-FR");

  const recCtxRef = useRef<{ visitIdx: number; prodIdx: number; productKey: string } | null>(null);
  const dictationBaseByKeyRef = useRef<Record<string, string>>({});
  const lastTranscriptByKeyRef = useRef<Record<string, string>>({});

  // Speech recognition events
  useEffect(() => {
    const mod: any = ExpoSpeechRecognitionModule as any;
    if (typeof mod?.addListener !== "function") return;

    const subResult = mod.addListener("result", (event: any) => {
      const ctx = recCtxRef.current;
      if (!ctx) return;

      const transcript = event?.results?.[0]?.transcript ?? event?.transcript ?? "";
      const t = String(transcript).trim();
      if (!t) return;

      const base = (dictationBaseByKeyRef.current[ctx.productKey] ?? "").trim();
      const combined = base ? `${base}${base.endsWith(" ") ? "" : " "}${t}` : t;

      // product note (medical OR commercial)
      updateProduct(ctx.visitIdx, ctx.prodIdx, { note: combined } as any);
    });

    const subEnd = mod.addListener("end", () => {
      const ctx = recCtxRef.current;

      if (ctx?.productKey) {
        delete dictationBaseByKeyRef.current[ctx.productKey];
        delete lastTranscriptByKeyRef.current[ctx.productKey];
      }

      recCtxRef.current = null;
      setRecordingKey(null);
    });

    const subError = mod.addListener("error", (e: any) => {
      const msg = String(e?.message ?? "").toLowerCase();
      const code = e?.code ?? e?.error ?? e?.nativeErrorCode;

      if (msg.includes("client") || msg.includes("disconnected") || code === 5 || code === 11) return;

      Alert.alert("Erreur dictée", e?.message ?? "Échec de la dictée");
    });

    return () => {
      try {
        subResult?.remove?.();
        subEnd?.remove?.();
        subError?.remove?.();
      } catch {}
    };
  }, []);

  const [submitting, setSubmitting] = useState(false);

  const medecinLabelById = useMemo(() => {
    const m = new Map<number, string>();
    medecinsMedical.forEach((x) => {
      const key = Number(x.id);
      const v = x.subtitle ? `${x.label} — ${x.subtitle}` : x.label;
      m.set(key, v);
    });
    return m;
  }, [medecinsMedical]);

  const clientLabelById = useMemo(() => {
    const m = new Map<number, string>();
    clientsCommercial.forEach((x) => {
      const key = Number(x.id);
      const v = x.subtitle ? `${x.label} — ${x.subtitle}` : x.label;
      m.set(key, v);
    });
    return m;
  }, [clientsCommercial]);

  const incompleteIdx = useMemo(() => firstIncompleteVisitIndex(visits), [visits]);
  const canAddVisit = incompleteIdx === -1;

  const allowedVisitTypes = useMemo(() => {
    const spec = String(mySpecialityRolee ?? "").trim();

    const isSupervisor =
      spec === "Superviseur" ||
      spec === "Superviseur Regional" ||
      spec === "Superviseur National";

    // Fallback while backend isn't ready: don't block the UI
    if (!spec) return { medical: true, commercial: true };

    if (spec === "Medico Commercial") return { medical: true, commercial: true };
    if (spec === "Commercial") return { medical: false, commercial: true };

    if (isSupervisor) {
      // If we can't read underusers yet, fallback to permissive
      if (!underUsersSpecialities.length) return { medical: true, commercial: true };

      const hasMedicoCommercial = underUsersSpecialities.some((s) => s === "Medico Commercial");
      const allCommercial = underUsersSpecialities.every((s) => s === "Commercial");

      // Requirement:
      // - If ALL underusers are Commercial => supervisor commercial => only commercial
      // - If at least one underuser is Medico Commercial => show both
      if (allCommercial && !hasMedicoCommercial) return { medical: false, commercial: true };
      if (hasMedicoCommercial) return { medical: true, commercial: true };

      // Unknown/other combinations: permissive
      return { medical: true, commercial: true };
    }

    // Default: permissive
    return { medical: true, commercial: true };
  }, [mySpecialityRolee, underUsersSpecialities]);

  useEffect(() => {
    // If user is commercial-only, flip the initial empty medical visit to commercial.
    if (allowedVisitTypes.commercial && !allowedVisitTypes.medical) {
      setVisits((prev) => {
        if (prev.length !== 1) return prev;
        const v = prev[0];
        if (v.visite_type !== "medical") return prev;

        const mv = v as MedicalVisitDraft;
        const isEmpty = mv.medecin_id == null && (mv.products?.length ?? 0) === 0;
        if (!isEmpty) return prev;

        // reset open product state for safety
        setOpenProductIdxByVisit({});
        setOpenVisitIdx(0);

        return [makeEmptyVisit("commercial")];
      });
    }
  }, [allowedVisitTypes.medical, allowedVisitTypes.commercial]);

  // Load referentials
  useEffect(() => {
    const load = async () => {
      setLoadingRefs(true);
      try {
        const res = await api.get(`/rapports/referentiels`);
        const data = res?.data || {};

        // Try to read profile/role data if backend provides it (optional)
        // Supports multiple naming conventions to avoid breaking changes.
        const me =
          data.me ??
          data.profile ??
          data.user ??
          data.current_user ??
          null;

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
              .map((u: any) =>
                String(u?.speciality_rolee ?? u?.specialityRolee ?? "").trim()
              )
              .filter(Boolean)
          : [];

        setUnderUsersSpecialities(underSpecs);

        const rawMedMedical =
          data.medecins_medical_planned_wilayas ??
          data.medecins_medical ??
          data.medecins ??
          [];

        const rawClients =
          data.clients_commercial_planned_wilayas ??
          data.clients_commercial ??
          [];

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
          };
        };

        setMedecinsMedical(
          ((rawMedMedical || []).map(mapPerson).filter(Boolean) as any[])
            .sort((a, b) => {
              const ar = a?.plan_border === "green" ? 0 : 1;
              const br = b?.plan_border === "green" ? 0 : 1;
              if (ar !== br) return ar - br;

              // secondary sort: keep alphabetical within each group
              return String(a?.label ?? "").localeCompare(String(b?.label ?? ""), "fr", { sensitivity: "base" });
            }) as AppSelectOption[]
        );

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

// Sort ONCE globally (plan_border then label)
builtClients.sort((a, b) => {
  const ar = a?.plan_border === "green" ? 0 : 1;
  const br = b?.plan_border === "green" ? 0 : 1;
  if (ar !== br) return ar - br;
  return String(a?.label ?? "").localeCompare(String(b?.label ?? ""), "fr", { sensitivity: "base" });
});

// Keep old array if you still use it elsewhere
setClientsCommercial(builtClients);

// Bucket ONCE
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

  // Mutators
  const updateVisit = (idx: number, patch: any) => {
    setVisits((prev) => prev.map((v, i) => (i === idx ? { ...v, ...patch } : v)) as any);
  };

  const updateProduct = (visitIdx: number, prodIdx: number, patch: any) => {
    setVisits((prev) =>
      prev.map((v: any, i) => {
        if (i !== visitIdx) return v;
        const products = (v.products || []).map((p: any, j: number) => (j === prodIdx ? { ...p, ...patch } : p));
        return { ...v, products };
      }) as any
    );
  };

  const addVisit = (type: VisitType) => {
    setVisits((prev) => {
      const next = [...prev, makeEmptyVisit(type)];
      setOpenVisitIdx(next.length - 1);
      return next;
    });
  };

  const removeVisit = (idx: number) => {
    setVisits((prev) => {
      if (prev.length <= 1) return prev;

      const removedKey = prev[idx]?._key;
      const next = prev.filter((_, i) => i !== idx);

      if (removedKey) {
        setOpenProductIdxByVisit((curr) => {
          const { [removedKey]: _, ...rest } = curr;
          return rest;
        });
      }

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
    setVisits((prev) => {
      const next = prev.map((v, i) => {
        if (i !== visitIdx) return v;

        if (v.visite_type === "medical") {
          return { ...v, products: [...v.products, makeEmptyMedicalProduct()] };
        } else {
          return { ...v, products: [...v.products, makeEmptyCommercialProduct()] };
        }
      });

      const visitKey = next[visitIdx]._key;
      const newProdIdx = next[visitIdx].products.length - 1;
      setOpenProdIdx(visitKey, newProdIdx);

      return next;
    });
  };

  const removeProduct = (visitIdx: number, prodIdx: number) => {
    setVisits((prev) => {
      const next = prev.map((v, i) => {
        if (i !== visitIdx) return v;
        return { ...v, products: v.products.filter((_, j) => j !== prodIdx) } as any;
      });

      const visitKey = next[visitIdx]?._key;
      if (visitKey) {
        setOpenProductIdxByVisit((curr) => {
          const currentOpen = curr[visitKey] ?? 0;
          const productCount = next[visitIdx].products.length;

          let newOpen = currentOpen;
          if (productCount <= 0) newOpen = 0;
          else if (currentOpen === prodIdx) newOpen = Math.max(0, prodIdx - 1);
          else if (currentOpen > prodIdx) newOpen = currentOpen - 1;

          return { ...curr, [visitKey]: newOpen };
        });
      }

      return next;
    });
  };

  // Dictation controls (medical + commercial)
  const startDictation = async (visitIdx: number, prodIdx: number, productKey: string, currentNote: string) => {
    if (recordingKey && recordingKey !== productKey) return;
    if (recordingKey === productKey) return;

    try {
      const mod: any = ExpoSpeechRecognitionModule as any;

      const perm =
        (typeof mod?.requestPermissionsAsync === "function" && (await mod.requestPermissionsAsync())) ||
        (typeof mod?.requestPermissions === "function" && (await mod.requestPermissions())) ||
        null;

      if (!perm || perm?.granted !== true) {
        Alert.alert("Permission refusée", "Microphone requis pour la dictée vocale");
        return;
      }

      dictationBaseByKeyRef.current[productKey] = currentNote ?? "";
      lastTranscriptByKeyRef.current[productKey] = "";

      recCtxRef.current = { visitIdx, prodIdx, productKey };
      setRecordingKey(productKey);

      const preferred = dictationLang;
      const langFallbacks =
        preferred === "ar-DZ"
          ? ["ar-DZ", "ar-SA", "ar-MA", "ar-TN", "ar", "fr-FR"]
          : ["fr-FR", "fr", "ar-DZ", "ar", "ar-SA"];

      let started = false;
      let lastErr: any = null;

      for (const lang of langFallbacks) {
        try {
          mod.start({ lang, interimResults: true, continuous: false });
          started = true;
          break;
        } catch (e: any) {
          lastErr = e;
        }
      }

      if (!started) {
        delete dictationBaseByKeyRef.current[productKey];
        delete lastTranscriptByKeyRef.current[productKey];
        recCtxRef.current = null;
        setRecordingKey(null);

        Alert.alert("Erreur", lastErr?.message ?? "Impossible de démarrer la dictée");
      }
    } catch (e: any) {
      delete dictationBaseByKeyRef.current[productKey];
      delete lastTranscriptByKeyRef.current[productKey];
      recCtxRef.current = null;
      setRecordingKey(null);

      Alert.alert("Erreur", e?.message ?? "Impossible de démarrer la dictée");
    }
  };

  const stopDictation = () => {
    try {
      const mod: any = ExpoSpeechRecognitionModule as any;
      mod?.stop?.();
    } catch {}
  };

  const validate = (): string | null => {
    if (!visits.length) return "Au moins une visite est requise.";

    if (!allowedVisitTypes.medical && visits.some((v) => v.visite_type === "medical")) {
      return "Votre profil n'autorise pas les visites médicales. Supprimez-les pour continuer.";
    }
    if (!allowedVisitTypes.commercial && visits.some((v) => v.visite_type === "commercial")) {
      return "Votre profil n'autorise pas les visites commerciales. Supprimez-les pour continuer.";
    }

    const seen = new Set<number>();

    for (const [i, v] of visits.entries()) {
      if (v.visite_type === "medical") {
        const mv = v as MedicalVisitDraft;
        if (mv.medecin_id == null) return `Visite médicale #${i + 1}: médecin requis.`;
        if (seen.has(mv.medecin_id)) return `Visite #${i + 1}: médecin/client dupliqué.`;
        seen.add(mv.medecin_id);

        if (!mv.products.length) return `Visite médicale #${i + 1}: ajoutez au moins un produit.`;

        for (const [j, p] of mv.products.entries()) {
          if (p.produit_id == null) return `Visite médicale #${i + 1} — Produit #${j + 1}: produit requis.`;
          if (p.rentabilite == null || p.rentabilite < 0 || p.rentabilite > 5)
            return `Visite médicale #${i + 1} — Produit #${j + 1}: rentabilité requise.`;
          if (!String(p.note || "").trim()) return `Visite médicale #${i + 1} — Produit #${j + 1}: note requise.`;
        }
      } else {
        const cv = v as CommercialVisitDraft;

        if (cv.client_filter == null) return `Visite commerciale #${i + 1}: filtre requis.`;
        if (cv.medecin_id == null) return `Visite commerciale #${i + 1}: client requis.`;
        if (seen.has(cv.medecin_id)) return `Visite #${i + 1}: médecin/client dupliqué.`;
        seen.add(cv.medecin_id);

        if (!cv.products.length) return `Visite commerciale #${i + 1}: ajoutez au moins un produit.`;

        // 3) Update validate() to enforce note for commercial products
        for (const [j, p] of cv.products.entries()) {
          if (p.produit_id == null) return `Visite commerciale #${i + 1} — Produit #${j + 1}: produit requis.`;
          if (p.prescription == null) return `Visite commerciale #${i + 1} — Produit #${j + 1}: prescription requise.`;
          if (p.en_stock == null) return `Visite commerciale #${i + 1} — Produit #${j + 1}: stock requis.`;
          if (!Number.isFinite(p.qtt) || p.qtt < 0) return `Visite commerciale #${i + 1} — Produit #${j + 1}: qtt invalide.`;

          // NEW: note required
          if (!String((p as any).note || "").trim())
            return `Visite commerciale #${i + 1} — Produit #${j + 1}: note requise.`;
        }

        if (cv.bon_commande == null) return `Visite commerciale #${i + 1}: bon de commande requis.`;
      }
    }

    return null;
  };

  const buildVisitesPayload = () => {
    return visits.map((v) => {
      if (v.visite_type === "medical") {
        const mv = v as MedicalVisitDraft;
        return {
          visite_type: "medical",
          medecin_id: mv.medecin_id,
          products: mv.products.map((p) => ({
            produit_id: p.produit_id,
            rentabilite: p.rentabilite,
            note: (p.note || "").trim(),
          })),
        };
      } else {
        const cv = v as CommercialVisitDraft;
        return {
          visite_type: "commercial",
          medecin_id: cv.medecin_id, // client id
          bon_commande: cv.bon_commande,
          // 4) Include note in the commercial payload
          products: cv.products.map((p) => ({
            produit_id: p.produit_id,
            prescription: p.prescription,
            en_stock: p.en_stock,
            qtt: p.en_stock === false ? 0 : (p.qtt ?? 0),
            note: String((p as any).note || "").trim(), // NEW
          })),
        };
      }
    });
  };

  const submit = async () => {
    const err = validate();
    if (err) return Alert.alert("Validation", err);

    try {
      setSubmitting(true);
      const visites = buildVisitesPayload();
      await api.put("/rapports/today", { visites });
      router.replace("/rapports");
    } catch (err: any) {
      const status = err?.response?.status;
      const body = err?.response?.data;
      Alert.alert(
        "Submit échoué",
        status ? `HTTP ${status}\n${JSON.stringify(body)}` : err?.message ?? "Unknown error"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const onAddVisitPressed = (type: VisitType) => {
    // Permission gate
    if (type === "medical" && !allowedVisitTypes.medical) {
      Alert.alert("Accès refusé", "Vous n'êtes pas autorisé à ajouter une visite médicale.");
      return;
    }
    if (type === "commercial" && !allowedVisitTypes.commercial) {
      Alert.alert("Accès refusé", "Vous n'êtes pas autorisé à ajouter une visite commerciale.");
      return;
    }

    if (!canAddVisit) {
      Alert.alert(
        "Validation",
        `Terminez la visite #${incompleteIdx + 1} avant d’ajouter une nouvelle visite.`
      );
      setOpenVisitIdx(incompleteIdx);
      return;
    }
    addVisit(type);
  };

  return (
    <SafeAreaView edges={["left", "right", "bottom"]} style={styles.root}>
      <AppHeader title="Nouveau rapport" titleAr="تقرير جديد" onBack={() => router.back()} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: (insets.bottom || 0) + 160 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.stepTitle}>Étape 2</Text>
          <Text style={styles.stepSubtitle}>Renseignez les visites et les produits.</Text>

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

          {visits.map((v, idx) => {
            if (v.visite_type === "medical") {
              return (
                <NewVisiteM
                  key={v._key}
                  visits={visits.filter((x) => x.visite_type === "medical") as MedicalVisitDraft[]}
                  v={v as MedicalVisitDraft}
                  idx={idx}
                  isOpen={idx === openVisitIdx}
                  onToggle={() => setOpenVisitIdx(idx)}
                  loadingRefs={loadingRefs}
                  medecins={medecinsMedical}
                  produits={produits}
                  medecinLabelById={medecinLabelById}
                  openProdIdx={getOpenProdIdx(v._key)}
                  setOpenProdIdx={setOpenProdIdx}
                  updateVisit={updateVisit}
                  updateProduct={updateProduct}
                  addProduct={addProduct}
                  removeProduct={removeProduct}
                  canRemoveVisit={visits.length > 1}
                  removeVisit={removeVisit}
                  recordingKey={recordingKey}
                  dictationLang={dictationLang}
                  setDictationLang={setDictationLang}
                  startDictation={startDictation}
                  stopDictation={stopDictation}
                />
              );
            }

            return (
              <NewVisiteC
                key={v._key}
                visits={visits.filter((x) => x.visite_type === "commercial") as CommercialVisitDraft[]}
                v={v as CommercialVisitDraft}
                idx={idx}
                isOpen={idx === openVisitIdx}
                onToggle={() => setOpenVisitIdx(idx)}
                loadingRefs={loadingRefs}
                clientsByType={clientsByType}
                produits={produits}
                clientLabelById={clientLabelById}
                openProdIdx={getOpenProdIdx(v._key)}
                setOpenProdIdx={setOpenProdIdx}
                updateVisit={updateVisit}
                updateProduct={updateProduct}
                addProduct={addProduct}
                removeProduct={removeProduct}
                canRemoveVisit={visits.length > 1}
                removeVisit={removeVisit}
                // 5) Pass dictation props to NewVisiteC (same as NewVisiteM)
                recordingKey={recordingKey}
                dictationLang={dictationLang}
                setDictationLang={setDictationLang}
                startDictation={startDictation}
                stopDictation={stopDictation}
              />
            );
          })}

          {/* Two adjacent buttons */}
          <View style={{ flexDirection: "row", gap: 10 }}>
            {allowedVisitTypes.medical ? (
              <Pressable
                onPress={() => onAddVisitPressed("medical")}
                disabled={!canAddVisit}
                style={[styles.addBtnMedical, !canAddVisit ? styles.disabledBtn : null]}
              >
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.addBtnText}>Visite medical</Text>
              </Pressable>
            ) : null}

            {allowedVisitTypes.commercial ? (
              <Pressable
                onPress={() => onAddVisitPressed("commercial")}
                disabled={!canAddVisit}
                style={[styles.addBtnCommercial, !canAddVisit ? styles.disabledBtn : null]}
              >
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.addBtnText}>Visite commercial</Text>
              </Pressable>
            ) : null}
          </View>
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
                <Text style={styles.primaryBtnText}>Valider le rapport</Text>
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
