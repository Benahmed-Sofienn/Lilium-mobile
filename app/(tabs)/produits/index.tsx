import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { api } from "../../../src/api/client";
import { useAuth } from "../../../src/auth/AuthContext";
import { AppHeader } from "../../../src/components/AppHeader";
import { AppCard } from "../../../src/components/AppCard";
import { AppSelect, AppSelectOption } from "../../../src/components/AppSelect";
import { COLORS, SPACING, TYPO, RADIUS } from "../../../src/ui/theme";

type ProduitOptionApi = {
  id: number;
  nom: string;
  fname?: string | null;
  price: number;
  image?: string | null;
};

type ProduitInfo = {
  product_name?: string | null;
  code_reference?: string | null;
  galenic_form?: string | null;
  product_classification?: string | null;
  presentation?: string | null;
  weight?: string | null;
  serving_size?: string | null;
  description?: string | null;
  dosage_form?: string | null;
  producer?: string | null;
  product_identifier?: string | null;
  suggested_use?: string | null;
  Tablet_size?: string | null;
  Tablet_weight?: string | null;
  price_bba: number;
  with_inactive_ingredient: boolean;
};

type Competitor = {
  name: string;
  price: string;
  concurents_shape?: { name: string } | null;
};

type ProduitDetails = {
  id: number;
  nom: string;
  fname?: string | null;
  price: number;
  image?: string | null;
  produits_productinformations: ProduitInfo[];
  concurents_cproduct: Competitor[];
};

function buildMediaUri(maybePath?: string | null) {
  if (!maybePath) return null;

  // Full URL already
  if (/^https?:\/\//i.test(maybePath)) return maybePath;

  const API_URL = (process.env.EXPO_PUBLIC_API_URL || "").replace(/\/+$/, "");
  if (!API_URL) return null;

  // Generic join: if backend returns "uploads/xxx.jpg" it works.
  const p = maybePath.startsWith("/") ? maybePath : `/${maybePath}`;
  return `${API_URL}${p}`;
}

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{String(value)}</Text>
    </View>
  );
}

export default function ProduitsIndex() {
  const router = useRouter();
  const { state } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [optionsRaw, setOptionsRaw] = useState<ProduitOptionApi[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [details, setDetails] = useState<ProduitDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const options: AppSelectOption[] = useMemo(() => {
    return optionsRaw.map((p) => ({
      id: p.id,
      label: p.nom,
      // Keep subtitle empty => label only in dropdown (showId defaults to false in AppSelect)
      keywords: `${p.nom} ${p.fname ?? ""}`.trim(),
    }));
  }, [optionsRaw]);

  const loadOptions = async () => {
    const res = await api.get<ProduitOptionApi[]>("/produits/options");
    const list = Array.isArray(res.data) ? res.data : [];
    setOptionsRaw(list);

    // initial: first product by alphabetical order (backend already orderBy nom asc)
    if (list.length && selectedId === null) {
      setSelectedId(list[0].id);
    }
  };

  const loadDetails = async (id: number) => {
    setDetailsLoading(true);
    try {
      const res = await api.get<ProduitDetails>(`/produits/${id}`);
      setDetails(res.data);
    } finally {
      setDetailsLoading(false);
    }
  };

  const bootstrap = async () => {
    setErr(null);
    setLoading(true);
    try {
      await loadOptions();
    } catch (e: any) {
      setErr(e?.message ?? "Erreur chargement produits");
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    setErr(null);
    try {
      await loadOptions();
      if (selectedId) await loadDetails(selectedId);
    } catch (e: any) {
      setErr(e?.message ?? "Erreur rafraîchissement");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (state.status !== "signedIn") return;
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  useEffect(() => {
    if (!selectedId) return;
    if (state.status !== "signedIn") return;

    (async () => {
      try {
        setErr(null);
        await loadDetails(selectedId);
      } catch (e: any) {
        setErr(e?.message ?? "Erreur chargement détails produit");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, state.status]);

  const selectedMeta = useMemo(() => {
    if (!selectedId) return null;
    return optionsRaw.find((x) => x.id === selectedId) ?? null;
  }, [optionsRaw, selectedId]);

  const imageUri = useMemo(() => buildMediaUri(details?.image ?? selectedMeta?.image ?? null), [details, selectedMeta]);

  if (state.status === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.muted}>Chargement...</Text>
      </View>
    );
  }

  if (state.status !== "signedIn") {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Produits</Text>
        <Text style={styles.muted}>Veuillez vous connecter.</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <AppHeader title="Produits" titleAr="المنتجات" onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <AppSelect
          title="Produit"
          titleAr="المنتج"
          value={selectedId}
          options={options}
          allowClear={false}
          onChange={(v) => setSelectedId(v === null ? null : Number(v))}
        />

        {loading ? (
          <View style={styles.centerPad}>
            <ActivityIndicator />
            <Text style={styles.muted}>Chargement des produits...</Text>
          </View>
        ) : null}

        {err ? (
          <AppCard style={{ borderColor: COLORS.danger }}>
            <Text style={[styles.title, { color: COLORS.danger }]}>Erreur</Text>
            <Text style={styles.muted}>{err}</Text>
          </AppCard>
        ) : null}

        {!loading && optionsRaw.length === 0 ? (
          <AppCard>
            <Text style={styles.title}>Aucun produit</Text>
            <Text style={styles.muted}>La liste des produits est vide.</Text>
          </AppCard>
        ) : null}

        {/* Image */}
        <AppCard>
          <Text style={styles.sectionTitle}>Image</Text>

          {detailsLoading ? (
            <View style={styles.centerPad}>
              <ActivityIndicator />
              <Text style={styles.muted}>Chargement...</Text>
            </View>
          ) : imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.image} resizeMode="contain" />
          ) : (
            <Text style={styles.muted}>
              Image non disponible (vérifie le chemin/URL renvoyé par le backend).
            </Text>
          )}
        </AppCard>

        {/* Product info */}
        <AppCard>
          <Text style={styles.sectionTitle}>Informations</Text>

          <InfoRow label="Nom" value={details?.nom ?? selectedMeta?.nom} />
          <InfoRow label="DCI / Fname" value={details?.fname ?? selectedMeta?.fname ?? null} />
          <InfoRow label="Prix" value={details?.price ?? selectedMeta?.price ?? null} />

          {details?.produits_productinformations?.length ? (
            <>
              <View style={styles.sep} />
              <Text style={styles.subTitle}>Fiche produit</Text>

              {(() => {
                const info = details.produits_productinformations[0];
                return (
                  <>
                    <InfoRow label="Code référence" value={info.code_reference} />
                    <InfoRow label="Nom fiche" value={info.product_name} />
                    <InfoRow label="Forme galénique" value={info.galenic_form} />
                    <InfoRow label="Classification" value={info.product_classification} />
                    <InfoRow label="Présentation" value={info.presentation} />
                    <InfoRow label="Poids" value={info.weight} />
                    <InfoRow label="Serving size" value={info.serving_size} />
                    <InfoRow label="Producteur" value={info.producer} />
                    <InfoRow label="Prix BBA" value={info.price_bba} />
                    <InfoRow label="Description" value={info.description} />
                    <InfoRow label="Dosage form" value={info.dosage_form} />
                    <InfoRow label="Suggested use" value={info.suggested_use} />
                  </>
                );
              })()}
            </>
          ) : (
            <Text style={styles.muted}>Aucune fiche d’information pour ce produit.</Text>
          )}
        </AppCard>

        {/* Competitors */}
        <AppCard>
          <Text style={styles.sectionTitle}>Concurrents</Text>

          {detailsLoading ? (
            <View style={styles.centerPad}>
              <ActivityIndicator />
              <Text style={styles.muted}>Chargement...</Text>
            </View>
          ) : details?.concurents_cproduct?.length ? (
            <View style={{ gap: 10 }}>
              {details.concurents_cproduct.map((c, idx) => (
                <View key={`${c.name}-${idx}`} style={styles.compCard}>
                  <Text style={styles.compName}>{c.name}</Text>
                  <Text style={styles.compMeta}>
                    Forme: {c.concurents_shape?.name ?? "—"}{"  "}•{"  "}Prix: {c.price || "—"}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.muted}>Aucun concurrent pour ce produit.</Text>
          )}
        </AppCard>

        <View style={{ height: 10 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.md, gap: SPACING.md },

  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: SPACING.lg, gap: 8 },
  centerPad: { paddingVertical: 18, alignItems: "center", justifyContent: "center", gap: 8 },

  title: { fontSize: TYPO.h2, fontWeight: "900", color: COLORS.text },
  muted: { color: COLORS.textMuted, fontWeight: "700" },

  sectionTitle: { fontSize: 15, fontWeight: "900", color: COLORS.text, marginBottom: 10 },
  subTitle: { fontSize: 13, fontWeight: "900", color: COLORS.text, marginBottom: 8 },

  image: {
    width: "100%",
    height: 220,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.cardAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  sep: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 12,
  },

  row: { flexDirection: "row", gap: 12, paddingVertical: 6 },
  rowLabel: { width: 120, color: COLORS.textMuted, fontWeight: "900", fontSize: 12 },
  rowValue: { flex: 1, color: COLORS.text, fontWeight: "800" },

  compCard: {
    padding: 12,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(0,0,0,0.02)",
  },
  compName: { fontWeight: "900", color: COLORS.text, fontSize: 14 },
  compMeta: { marginTop: 4, color: COLORS.textMuted, fontWeight: "800" },
});
