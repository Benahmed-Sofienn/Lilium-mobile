// app/(tabs)/rapports/[id].tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  TextInput,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api } from "../../../src/api/client";
import { useAuth } from "../../../src/auth/AuthContext";
import { AppHeader } from "../../../src/components/AppHeader";
import { AppCard } from "../../../src/components/AppCard";
import { ZoomableImage } from "../../../src/components/ZoomableImage";
import { COLORS, FIELD, SPACING, TYPO } from "../../../src/ui/theme";

type DetailUser = {
  id: number;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
};

type DetailComment = {
  id: number;
  comment: string;
  added: string;
  user: DetailUser;
};

type DetailProduit = {
  id: number;
  produit: { id: number; nom: string | null; price: number | null };
  qtt: number;
  prescription: boolean;
  rentabilite: number | null;
  rentabilite_note: string | null;
  rentabilite_updated_at: string | null;
};

type DetailVisite = {
  id: number;
  priority: number;
  observation: string | null;
  client: {
    id: number;
    nom: string | null;
    telephone: string | null;
    adresse: string | null;
    classification: string | null;
    specialite: string | null;
    wilaya: string | null;
    commune: string | null;
  };
  produits: DetailProduit[];
};

type RapportDetails = {
  id: number;
  added: string;
  date: string; // YYYY-MM-DD
  note: number | null;
  can_update: boolean;
  observation: string | null;

  user: DetailUser;

  images: {
    image1: string | null; // often "/media/..."
    image2: string | null;
  };

  visites: DetailVisite[];
  comments: DetailComment[];
};

const API_URL = (process.env.EXPO_PUBLIC_API_URL || "").replace(/\/+$/, "");

function toAbsUrl(u?: string | null) {
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  if (!API_URL) return u; // fallback (dev)
  if (u.startsWith("/")) return `${API_URL}${u}`;
  return `${API_URL}/${u.replace(/^\/+/, "")}`;
}

function formatYmd(ymd?: string | null) {
  if (!ymd) return "";
  // YYYY-MM-DD => DD/MM/YYYY
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    const [y, m, d] = ymd.split("-");
    return `${d}/${m}/${y}`;
  }
  return ymd;
}

function formatDateTime(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

function prettyName(u?: DetailUser | null) {
  const s = [u?.first_name, u?.last_name].filter(Boolean).join(" ").trim();
  return s || u?.full_name || u?.username || "";
}

export default function RapportDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { state } = useAuth();
  const signedIn = state.status === "signedIn";

  const me = signedIn ? (state as any).user : null;
  const canComment = signedIn;

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  const rapportId = useMemo(() => {
    const n = parseInt(String(id || ""), 10);
    return Number.isFinite(n) ? n : null;
  }, [id]);

  const [data, setData] = useState<RapportDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const submitComment = useCallback(async () => {
    if (!signedIn || !rapportId) return;

    const clean = draft.trim();
    if (!clean) return;

    setSending(true);
    setCommentError(null);

    try {
      await api.post(`/rapports/${rapportId}/comments`, { comment: clean });

      // optimistic UI update
      const optimistic = {
        id: -Date.now(), // temp id
        comment: clean,
        added: new Date().toISOString(),
        user: {
          id: Number(me?.id ?? 0),
          username: me?.username ?? null,
          first_name: me?.first_name ?? null,
          last_name: me?.last_name ?? null,
          full_name: me?.full_name ?? null,
        },
      };

      setDraft("");
      setData((prev) =>
        prev ? { ...prev, comments: [optimistic as any, ...(prev.comments || [])] } : prev
      );

      // silent refresh to sync with backend (no global loading spinner)
      try {
        const r = await api.get<RapportDetails>(`/rapports/${rapportId}`, {
          params: { commentsLimit: 100 },
        });
        setData(r.data);
      } catch {
        // ignore refresh errors (optimistic comment stays visible)
      }
    } catch (e: any) {
      setCommentError(e?.response?.data?.error || e?.message || "Erreur envoi commentaire.");
    } finally {
      setSending(false);
    }
  }, [signedIn, rapportId, draft, me]);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!signedIn || !rapportId) return;

      setErrorMsg(null);
      if (!opts?.silent) setLoading(true);

      try {
        const res = await api.get<RapportDetails>(`/rapports/${rapportId}`, {
          params: { commentsLimit: 100 },
        });
        setData(res.data);
      } catch (e: any) {
        setErrorMsg(e?.response?.data?.error || e?.message || "Erreur chargement.");
        setData(null);
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [signedIn, rapportId]
  );

  // Initial load (shows the main loading spinner)
  useEffect(() => {
    load();
  }, [load]);

  // Refetch whenever the screen becomes active (e.g., coming from index.tsx)
  useFocusEffect(
    useCallback(() => {
      load({ silent: true });
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    if (!signedIn) return;
    setRefreshing(true);
    try {
      await load({ silent: true }); // RefreshControl shows its own spinner
    } finally {
      setRefreshing(false);
    }
  }, [signedIn, load]);

  if (state.status === "loading") {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator />
        <Text style={styles.muted}>Chargement…</Text>
      </View>
    );
  }

  if (state.status === "signedOut") {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.title}>Non connecté</Text>
        <Text style={styles.muted}>Veuillez vous reconnecter.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <AppHeader title="Détail rapport" titleAr="تفاصيل التقرير" onBack={() => router.back()} />

      {loading ? (
        <View style={styles.centerPad}>
          <ActivityIndicator />
          <Text style={styles.muted}>Chargement…</Text>
        </View>
      ) : errorMsg ? (
        <View style={styles.centerPad}>
          <Text style={styles.error}>{errorMsg}</Text>
        </View>
      ) : !data ? (
        <View style={styles.centerPad}>
          <Text style={styles.muted}>Rapport introuvable.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* TOP: date + user */}
          <AppCard style={{ gap: 8 }}>
            <Text style={styles.h1}>{formatYmd(data.date)}</Text>
            <Text style={styles.sub}>{prettyName(data.user) || `User #${data.user?.id ?? ""}`}</Text>

            {data.note != null ? <Text style={styles.meta}>Note rapport : {data.note}</Text> : null}

            {data.observation ? (
              <Text style={styles.meta}>Observation : {data.observation}</Text>
            ) : null}
          </AppCard>

          {/* IMAGES */}
          <View style={{ marginTop: SPACING.md, gap: SPACING.md }}>
            {toAbsUrl(data.images?.image1) ? (
              <AppCard style={{ padding: SPACING.md }}>
                <Text style={styles.sectionTitle}>Image</Text>
                <View style={{ marginTop: 10 }}>
                  <ZoomableImage uri={toAbsUrl(data.images.image1)!} />
                </View>
              </AppCard>
            ) : null}

            {toAbsUrl(data.images?.image2) ? (
              <AppCard style={{ padding: SPACING.md }}>
                <Text style={styles.sectionTitle}>Image 2</Text>
                <View style={{ marginTop: 10 }}>
                  <ZoomableImage uri={toAbsUrl(data.images.image2)!} />
                </View>
              </AppCard>
            ) : null}
          </View>

          {/* VISITES */}
          <View style={{ marginTop: SPACING.xl }}>
            <Text style={[styles.sectionTitle, { marginBottom: SPACING.md }]}>
              Visites ({data.visites?.length ?? 0})
            </Text>

            {(data.visites || []).map((v) => {
              const c = v.client || ({} as any);
              return (
                <AppCard key={String(v.id)} style={{ marginBottom: SPACING.md, gap: 10 }}>
                  <View style={styles.visitTop}>
                    <Text style={styles.visitTitle}>
                      #{v.priority} — {c.nom || `Client #${c.id}`}
                    </Text>
                    {c.classification ? <Text style={styles.pill}>{c.classification}</Text> : null}
                  </View>

                  <Text style={styles.meta}>
                    {[
                      c.specialite ? `Spécialité: ${c.specialite}` : null,
                      c.wilaya ? `Wilaya: ${c.wilaya}` : null,
                      c.commune ? `Commune: ${c.commune}` : null,
                    ]
                      .filter(Boolean)
                      .join(" • ")}
                  </Text>

                  {c.telephone ? <Text style={styles.meta}>Tél: {c.telephone}</Text> : null}
                  {c.adresse ? <Text style={styles.meta}>Adresse: {c.adresse}</Text> : null}
                  {v.observation ? <Text style={styles.meta}>Obs visite: {v.observation}</Text> : null}

                  <View style={{ marginTop: 6, gap: 8 }}>
                    <Text style={styles.sectionSubTitle}>Produits</Text>

                    {(v.produits || []).length ? (
                      (v.produits || []).map((p) => (
                        <View key={String(p.id)} style={styles.prodRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.prodName}>
                              {p.produit?.nom || `Produit #${p.produit?.id ?? ""}`}
                            </Text>
                            <Text style={styles.meta}>
                              {p.rentabilite_note ? `Note: ${p.rentabilite_note}` : "Note: —"}
                            </Text>
                          </View>

                          <View style={styles.rentBox}>
                            <Text style={styles.rentText}>
                              Rent: {p.rentabilite != null ? p.rentabilite : "—"}
                            </Text>
                            {p.rentabilite_note ? (
                              <Text style={styles.rentNote} numberOfLines={2}>
                                {p.rentabilite_note}
                              </Text>
                            ) : null}
                            {p.rentabilite_updated_at ? (
                              <Text style={styles.rentDate}>
                                {formatDateTime(p.rentabilite_updated_at)}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.muted}>Aucun produit.</Text>
                    )}
                  </View>
                </AppCard>
              );
            })}
          </View>

          {/* COMMENTS */}
          <View style={{ marginTop: SPACING.xl }}>
            <Text style={[styles.sectionTitle, { marginBottom: SPACING.md }]}>
              Commentaires ({data.comments?.length ?? 0})
            </Text>

            <AppCard style={{ gap: 12 }}>
              {canComment ? (
                <>
                  <View style={styles.commentInputRow}>
                    <TextInput
                      value={draft}
                      onChangeText={setDraft}
                      editable={!sending}
                      placeholder="Ajouter un commentaire..."
                      placeholderTextColor={COLORS.textMuted}
                      style={styles.commentInput}
                    />
                    <Pressable
                      onPress={submitComment}
                      disabled={sending || !draft.trim()}
                      style={[
                        styles.sendBtn,
                        sending || !draft.trim() ? styles.sendBtnDisabled : null,
                      ]}
                    >
                      {sending ? (
                        <ActivityIndicator color={COLORS.textOnBrand} />
                      ) : (
                        <Ionicons name="send" size={18} color={COLORS.textOnBrand} />
                      )}
                    </Pressable>
                  </View>

                  {commentError ? <Text style={styles.commentError}>{commentError}</Text> : null}
                </>
              ) : null}

              {(data.comments || []).length ? (
                data.comments.map((c) => (
                  <View key={String(c.id)} style={styles.commentRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.commentBy}>
                        {prettyName(c.user) || `User #${c.user?.id ?? ""}`}
                      </Text>
                      <Text style={styles.commentDate}>{formatDateTime(c.added)}</Text>
                      <Text style={styles.commentText}>{c.comment}</Text>
                    </View>
                  </View>
                ))
              ) : (
                <Text style={styles.muted}>Aucun commentaire.</Text>
              )}
            </AppCard>
          </View>

          <View style={{ height: 24 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  content: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: 24,
  },

  center: { alignItems: "center", justifyContent: "center" },
  centerPad: { padding: 24, alignItems: "center", justifyContent: "center" },

  title: { fontSize: TYPO.h2, fontWeight: "800", color: COLORS.text },
  muted: { color: COLORS.textMuted, fontWeight: "700", marginTop: 6 },
  error: { color: COLORS.danger, fontWeight: "900" },

  h1: { fontSize: 20, fontWeight: "900", color: COLORS.text },
  sub: { fontSize: TYPO.body, fontWeight: "800", color: COLORS.textMuted },
  meta: { color: COLORS.textMuted, fontWeight: "700" },

  sectionTitle: { fontSize: TYPO.h2, fontWeight: "900", color: COLORS.text },
  sectionSubTitle: { fontWeight: "900", color: COLORS.text },

  visitTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  visitTitle: { flex: 1, fontSize: TYPO.h2, fontWeight: "900", color: COLORS.text },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: COLORS.brandSoft,
    borderWidth: 1,
    borderColor: COLORS.border,
    fontWeight: "900",
    color: COLORS.text,
    fontSize: TYPO.small,
  },

  prodRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    backgroundColor: COLORS.cardAlt,
  },
  prodName: { fontWeight: "900", color: COLORS.text },

  rentBox: {
    width: 120,
    alignItems: "flex-end",
  },
  rentText: { fontWeight: "900", color: COLORS.text },
  rentNote: {
    marginTop: 2,
    fontSize: TYPO.small,
    fontWeight: "700",
    color: COLORS.textMuted,
    textAlign: "right",
  },
  rentDate: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.textMuted,
    textAlign: "right",
  },

  commentInputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  commentInput: {
    flex: 1,
    height: FIELD.height,
    borderRadius: FIELD.radius,
    backgroundColor: FIELD.bg,
    borderWidth: 1,
    borderColor: FIELD.border,
    paddingHorizontal: 12,
    color: COLORS.text,
  },
  sendBtn: {
    width: FIELD.height,
    height: FIELD.height,
    borderRadius: FIELD.radius,
    backgroundColor: COLORS.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.6 },
  commentError: { color: "#D92D20", fontWeight: "800" },

  commentRow: {
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  commentBy: { fontWeight: "900", color: COLORS.text },
  commentDate: {
    marginTop: 2,
    fontSize: TYPO.small,
    fontWeight: "700",
    color: COLORS.textMuted,
  },
  commentText: { marginTop: 6, fontWeight: "700", color: COLORS.text },
});
