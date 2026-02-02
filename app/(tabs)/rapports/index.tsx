// app/(tabs)/rapports/index.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
  KeyboardAvoidingView,
} from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";

import { api } from "../../../src/api/client";
import { useAuth } from "../../../src/auth/AuthContext";
import { AppHeader } from "../../../src/components/AppHeader";
import { AppCard } from "../../../src/components/AppCard";
import { RapportCard } from "../../../src/components/RapportCard";

import { AppSelect, type AppSelectOption } from "../../../src/components/AppSelect";

import { COLORS, FIELD, SPACING, TYPO } from "../../../src/ui/theme";

type UserRole = "Commercial" | "Superviseur" | "Countrymanager";

type RefUser = { id: number; first_name?: string | null; last_name?: string | null };

type Rapport = {
  id: number;
  added: string;
  note?: number | null;

  user: {
    id: number;
    username?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    displayName?: string | null;
  };

  images?: {
    image?: string | null;
    image1?: string | null;
    image2?: string | null;
  };

  regionsVisited?: string[];
  visites?: {
    total?: number;
    medical?: number;
    commercial?: number;
    commercialByType?: Record<string, number>;
  };

  counts?: { comments?: number; visites?: number };

  lastComment: null | { by: string | null; comment: string; added: string };
  hasMoreComments: boolean;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function toYmd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function prettyName(u: { first_name?: any; last_name?: any; id: number }) {
  const fn = (u.first_name || "").trim();
  const ln = (u.last_name || "").trim();
  const full = `${fn} ${ln}`.trim();
  return full || `User #${u.id}`;
}

export default function RapportsIndex() {
  const router = useRouter();
  const { state } = useAuth();

  const signedIn = state.status === "signedIn";
  const me = signedIn ? state.user : null;
  const role: UserRole = (me?.role as UserRole) || "Commercial";
  const isAdmin = !!me?.is_superuser;

  const [refUsers, setRefUsers] = useState<RefUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  const [fromDate, setFromDate] = useState<Date>(new Date());
  const [toDate, setToDate] = useState<Date>(new Date());
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);

  const [items, setItems] = useState<Rapport[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const didInitSelectedUser = React.useRef(false);

  const canShowUserDropdown = useMemo(() => {
    if (!signedIn) return false;
    if (isAdmin) return true;
    return role === "Countrymanager" || role === "Superviseur";
  }, [signedIn, role, isAdmin]);

  const canEditNote = useMemo(() => {
    if (!signedIn) return false;
    if (isAdmin) return true;
    return role === "Countrymanager" || role === "Superviseur";
  }, [signedIn, role, isAdmin]);

  const canComment = useMemo(() => {
    if (!signedIn) return false;
    // all roles can comment once authenticated
    return true;
  }, [signedIn]);

  const userOptions = useMemo<AppSelectOption[]>(() => {
    if (!signedIn) return [];

    const base = refUsers.map((u) => {
      const label = prettyName({ id: u.id, first_name: u.first_name, last_name: u.last_name });
      return { id: String(u.id), label, keywords: label };
    });

    const myId = me?.id ? String(me.id) : null;
    const myLabel = me?.id
      ? prettyName({
          id: me.id,
          first_name: (me as any).first_name,
          last_name: (me as any).last_name,
        })
      : null;

    // Put me first (if present in list), then the rest
    const meOpt = myId && myLabel ? [{ id: myId, label: myLabel, keywords: myLabel }] : [];

    const rest = myId ? base.filter((x) => x.id !== myId) : base;

    // Countrymanager/Admin can pick “Tous”
    if (isAdmin || role === "Countrymanager") {
      return [{ id: "tous", label: "Tous | الكل", keywords: "tous all" }, ...meOpt, ...rest];
    }

    // Superviseur: me first, then underusers (already scoped by backend referentiels)
    if (role === "Superviseur") {
      return [...meOpt, ...rest];
    }

    return base;
  }, [signedIn, refUsers, me, role, isAdmin]);

  const loadReferentiels = useCallback(async () => {
    if (!signedIn) return;

    // Source unique et "scopée" pour la liste Utilisateur
    const res = await api.get("/plans/scope-users");
    const users = (res.data?.users || res.data || []) as RefUser[];
    setRefUsers(Array.isArray(users) ? users : []);
  }, [signedIn]);

  const loadRapports = useCallback(async () => {
    if (!signedIn) return;

    setLoading(true);
    setErrorMsg(null);

    try {
      const params: any = {
        // New style (future-proof)
        dateStart: toYmd(fromDate),
        dateEnd: toYmd(toDate),

        // Backward compatible with your CURRENT backend (required today)
        year: fromDate.getFullYear(),
        month: fromDate.getMonth() + 1,

        limit: 50,
      };

      // userId optional:
      // - Countrymanager/admin: "" means all
      // - Superviseur: id chosen
      // - Commercial: can omit, backend will scope; but sending my id is fine
      if (canShowUserDropdown) {
        // "tous" => do not send userId
        if (selectedUserId && selectedUserId !== "tous") params.userId = selectedUserId;
      } else if (me?.id) {
        params.userId = String(me.id);
      }

      const res = await api.get("/rapports", { params });

      const results = (res.data?.results || []) as Rapport[];
      setItems(results);
    } catch (e: any) {
      const status = e?.response?.status;
      const data = e?.response?.data;

      setErrorMsg(
        status
          ? `LISTE HTTP ${status} — ${data?.error || data?.message || e?.message || "Erreur"}`
          : `LISTE — ${e?.message || "Erreur lors du chargement."}`
      );
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [signedIn, fromDate, toDate, selectedUserId, canShowUserDropdown, me]);

  // NEW: Refetch when coming back to this screen (focus)
  useFocusEffect(
    useCallback(() => {
      if (!signedIn) return;
      loadRapports();
    }, [signedIn, loadRapports])
  );

  useEffect(() => {
    if (!signedIn || !me?.id) return;
    if (didInitSelectedUser.current) return;

    if (isAdmin || role === "Countrymanager") setSelectedUserId("tous"); // default all
    else setSelectedUserId(String(me.id)); // default = connected user id (name shown)

    didInitSelectedUser.current = true;
  }, [signedIn, me, role, isAdmin]);

  useEffect(() => {
    if (!signedIn) return;
    (async () => {
      try {
        await loadReferentiels();
      } catch (e: any) {
        const status = e?.response?.status;
        const data = e?.response?.data;
        setErrorMsg(
          status
            ? `REFERENTIELS HTTP ${status} — ${data?.error || data?.message || e?.message || "Erreur"}`
            : `REFERENTIELS — ${e?.message || "Erreur"}`
        );
      }
    })();
  }, [signedIn, loadReferentiels]);

  useEffect(() => {
    if (!signedIn) return;
    loadRapports();
  }, [signedIn, loadRapports]);

  const onRefresh = useCallback(async () => {
    if (!signedIn) return;
    setRefreshing(true);
    try {
      await loadRapports();
    } finally {
      setRefreshing(false);
    }
  }, [signedIn, loadRapports]);

  const submitCommentInline = useCallback(async (rapportId: number, text: string) => {
    const clean = text.trim();
    if (!clean) return;

    const res = await api.post(`/rapports/${rapportId}/comments`, { comment: clean });
    const newComment = res.data?.comment;

    setItems((prev) =>
      prev.map((r) => {
        if (r.id !== rapportId) return r;

        const prevCount = Number(r.counts?.comments ?? 0);
        const nextCount = prevCount + 1;

        return {
          ...r,
          counts: { ...(r.counts || {}), comments: nextCount },
          lastComment: newComment
            ? { by: newComment.by ?? null, comment: newComment.comment, added: newComment.added }
            : { by: null, comment: clean, added: new Date().toISOString() },
          hasMoreComments: nextCount > 1,
        };
      })
    );
  }, []);

  const setNote = async (rapportId: number, note: number) => {
    try {
      const res = await api.patch(`/rapports/${rapportId}/note`, { note });

      const newNote = res.data?.note ?? note;
      setItems((prev) => prev.map((r) => (r.id === rapportId ? { ...r, note: newNote } : r)));
    } catch (e: any) {
      setErrorMsg(e?.response?.data?.error || e?.message || "Note échouée.");
    }
  };

  const onChangeFrom = (_ev: DateTimePickerEvent, d?: Date) => {
    if (Platform.OS === "android") setShowFromPicker(false);
    if (d) {
      setFromDate(d);
      // If user picks from > to, clamp to
      if (toYmd(d) > toYmd(toDate)) setToDate(d);
    }
  };

  const onChangeTo = (_ev: DateTimePickerEvent, d?: Date) => {
    if (Platform.OS === "android") setShowToPicker(false);
    if (d) {
      setToDate(d);
      // If user picks to < from, clamp from
      if (toYmd(d) < toYmd(fromDate)) setFromDate(d);
    }
  };

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
      <AppHeader title="Liste des rapports" titleAr="قائمة التقارير" onBack={() => router.back()} />

      <View style={styles.content}>
        <AppCard style={styles.filtersCard}>
          {canShowUserDropdown ? (
            <AppSelect
              title="Utilisateur"
              titleAr="المستخدم"
              value={selectedUserId}
              options={userOptions}
              allowClear={false} // prevents null => broken filtering
              onChange={(v) => {
                if (v == null) return;
                setSelectedUserId(String(v));
              }}
            />
          ) : null}

          <View style={styles.dateRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Du | من</Text>
              <Pressable onPress={() => setShowFromPicker(true)} style={styles.dateField}>
                <Text style={styles.dateText}>{toYmd(fromDate)}</Text>
                <Ionicons name="calendar-outline" size={18} color={COLORS.textMuted} />
              </Pressable>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Au | إلى</Text>
              <Pressable onPress={() => setShowToPicker(true)} style={styles.dateField}>
                <Text style={styles.dateText}>{toYmd(toDate)}</Text>
                <Ionicons name="calendar-outline" size={18} color={COLORS.textMuted} />
              </Pressable>
            </View>
          </View>

          {showFromPicker ? (
            <DateTimePicker value={fromDate} mode="date" display="default" onChange={onChangeFrom} />
          ) : null}
          {showToPicker ? (
            <DateTimePicker value={toDate} mode="date" display="default" onChange={onChangeTo} />
          ) : null}

          <Pressable onPress={loadRapports} style={styles.primaryBtn}>
            <Ionicons name="search-outline" size={18} color={COLORS.textOnBrand} />
            <Text style={styles.primaryBtnText}>Filtrer | تصفية</Text>
          </Pressable>

          {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}
        </AppCard>

        {loading ? (
          <View style={styles.centerPad}>
            <ActivityIndicator />
            <Text style={styles.muted}>Chargement…</Text>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(it) => String(it.id)}
            contentContainerStyle={{ paddingBottom: 24 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            ListEmptyComponent={
              <View style={styles.centerPad}>
                <Text style={styles.muted}>Aucun rapport.</Text>
              </View>
            }
            renderItem={({ item }) => {
              const showOwner = isAdmin || role !== "Commercial";
              const ownerName = prettyName({
                id: item.user.id,
                first_name: item.user.first_name,
                last_name: item.user.last_name,
              });

              return (
                <View style={{ marginTop: SPACING.md }}>
                  <RapportCard
                    item={item}
                    canEditNote={canEditNote}
                    canComment={canComment}
                    onSubmitComment={submitCommentInline}
                    onSetNote={async (rapportId, note) => {
                      if (!canEditNote) return;
                      await setNote(rapportId, note);
                    }}
                    onOpenDetails={() =>
                      router.push({
                        pathname: "/(tabs)/rapports/[id]",
                        params: { id: String(item.id) },
                      })
                    }
                  />
                </View>
              );
            }}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  content: { flex: 1, paddingHorizontal: SPACING.md, paddingTop: SPACING.md },

  center: { alignItems: "center", justifyContent: "center" },
  centerPad: { padding: 24, alignItems: "center", justifyContent: "center" },

  title: { fontSize: TYPO.h2, fontWeight: "800", color: COLORS.text },
  muted: { marginTop: 8, color: COLORS.textMuted },

  filtersCard: { gap: SPACING.md },
  label: {
    fontSize: TYPO.small,
    fontWeight: "800",
    color: COLORS.text,
    marginLeft: 2,
    marginBottom: 6,
  },

  dateRow: { flexDirection: "row", gap: SPACING.md },
  dateField: {
    height: FIELD.height,
    borderRadius: FIELD.radius,
    backgroundColor: FIELD.bg,
    borderWidth: 1,
    borderColor: FIELD.border,
    paddingHorizontal: 12,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  dateText: { color: COLORS.text, fontWeight: "800" },

  primaryBtn: {
    height: 46,
    borderRadius: 14,
    backgroundColor: COLORS.brand,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryBtnText: { color: COLORS.textOnBrand, fontWeight: "900" },

  error: { color: "#B42318", fontWeight: "800" },

  cardTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardDate: { fontSize: TYPO.h2, fontWeight: "900", color: COLORS.text },

  validPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: COLORS.brandSoft,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  validPillText: { fontSize: TYPO.small, fontWeight: "900", color: COLORS.text },

  ownerName: { marginTop: 6, fontWeight: "900", color: COLORS.text },

  metaRow: { marginTop: 10, flexDirection: "row", gap: 14 },
  metaText: { color: COLORS.textMuted, fontWeight: "700" },

  sectionTitle: { fontWeight: "900", color: COLORS.text, marginBottom: 6 },
  lastCommentLine: { color: COLORS.text },
  moreComments: { marginTop: 4, color: COLORS.textMuted, fontWeight: "800" },

  actionsRow: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  secondaryBtn: {
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  secondaryBtnText: { color: COLORS.brand, fontWeight: "900" },

  starsRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  noteLabel: { marginRight: 4, color: COLORS.textMuted, fontWeight: "800" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "center", padding: 18 },
  modalWrap: { width: "100%" },
  modalCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: { fontSize: TYPO.h2, fontWeight: "900", color: COLORS.text, marginBottom: 10 },
  input: {
    minHeight: 90,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: FIELD.border,
    backgroundColor: FIELD.bg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
  },
  modalActions: { marginTop: 12, flexDirection: "row", gap: 10 },
});
