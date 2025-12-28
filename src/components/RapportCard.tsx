// src/components/RapportCard.tsx
import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Image, Pressable, TextInput, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppCard } from "./AppCard";
import { COLORS, SPACING, TYPO, FIELD, RADIUS } from "../ui/theme";

type RapportUser = {
  id: number;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  displayName?: string | null;
};

type RapportItem = {
  id: number;
  added: string; // ISO
  note?: number | null;

  user: RapportUser;

  // backend may return either images.image or images.image1; we support both
  images?: {
    image?: string | null;
    image1?: string | null;
    image2?: string | null;
  };

  // new backend fields (optional-safe)
  regionsVisited?: string[];
  visites?: {
    total?: number;
    medical?: number;
    commercial?: number;
    commercialByType?: Record<string, number>;
  };

  // fallback
  counts?: { visites?: number; comments?: number };

  lastComment?: null | { by: string | null; comment: string; added: string };
  hasMoreComments?: boolean;
};

function prettyPerson(u: RapportUser) {
  const fn = (u.first_name || "").trim();
  const ln = (u.last_name || "").trim();
  const full = `${fn} ${ln}`.trim();
  return u.displayName || full || u.username || "-";
}

function ymd(dt: Date) {
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatHeaderDate(iso: string) {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  // "Jeu, 2025-12-25" style
  const w = dt.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "");
  const cap = w ? w.charAt(0).toUpperCase() + w.slice(1) : "—";
  return `${cap}, ${ymd(dt)}`;
}

function resolveMediaUrl(pathOrUrl?: string | null) {
  if (!pathOrUrl) return null;
  const s = String(pathOrUrl);

  // already absolute
  if (/^https?:\/\//i.test(s)) return s;

  // ensure leading slash
  const rel = s.startsWith("/") ? s : `/${s}`;

  const base = (process.env.EXPO_PUBLIC_API_URL || "").replace(/\/$/, "");
  return base ? `${base}${rel}` : rel;
}

function Stars({
  value,
  disabled,
  onPick,
}: {
  value: number;
  disabled: boolean;
  onPick: (n: number) => void;
}) {
  const v = Math.max(0, Math.min(5, Math.round(value || 0)));
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
      {Array.from({ length: 5 }).map((_, i) => {
        const n = i + 1;
        const active = n <= v;
        return (
          <Pressable key={n} disabled={disabled} onPress={() => onPick(n)} hitSlop={6}>
            <Ionicons
              name={active ? "star" : "star-outline"}
              size={18}
              color={active ? COLORS.brandDark : COLORS.textMuted}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

export function RapportCard({
  item,
  canEditNote,
  canComment,
  onSubmitComment,
  onSetNote,
}: {
  item: RapportItem;
  canEditNote: boolean; // Commercial = false (show only)
  canComment: boolean;  // all roles true (backend enforces scope)
  onSubmitComment: (rapportId: number, text: string) => Promise<void>;
  onSetNote: (rapportId: number, note: number) => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const img1 = useMemo(() => {
    const raw = item.images?.image ?? item.images?.image1 ?? null;
    return resolveMediaUrl(raw);
  }, [item.images?.image, item.images?.image1]);

  const img2 = useMemo(() => resolveMediaUrl(item.images?.image2 ?? null), [item.images?.image2]);

  const regionsText = useMemo(() => {
    const arr = item.regionsVisited || [];
    return arr.length ? arr.join(", ") : "-";
  }, [item.regionsVisited]);

  const visitsTotal = item.visites?.total ?? item.counts?.visites ?? 0;
  const visitsMedical = item.visites?.medical ?? 0;
  const visitsCommercial = item.visites?.commercial ?? (visitsTotal - visitsMedical);

  const commercialTypes = useMemo(() => {
    const m = item.visites?.commercialByType || {};
    const entries = Object.entries(m).filter(([, v]) => Number(v) > 0);
    if (!entries.length) return "";
    return entries.map(([k, v]) => `(${v}) ${k}`).join(" ");
  }, [item.visites?.commercialByType]);

  const submit = async () => {
    const text = draft.trim();
    if (!text || !canComment) return;

    try {
      setSending(true);
      await onSubmitComment(item.id, text);
      setDraft("");
    } finally {
      setSending(false);
    }
  };

  return (
    <AppCard style={styles.card}>
      {/* Green header inside card */}
      <View style={styles.topBar}>
        <Text numberOfLines={1} style={styles.topBarText}>
          ID: {item.id} | Nom: {prettyPerson(item.user)}
        </Text>
         <Text numberOfLines={1} style={styles.topBarText}>
          Date: {formatHeaderDate(item.added)}
        </Text>
      </View>

      <View style={styles.body}>
        {/* Images column */}
        <View style={styles.imagesCol}>
          <View style={styles.thumbWrap}>
            {img1 ? (
              <Image source={{ uri: img1 }} style={styles.thumb} resizeMode="cover" />
            ) : (
              <View style={styles.missing}>
                <Ionicons name="close" size={44} color="#D92D20" />
              </View>
            )}
          </View>
          <Text style={styles.imgLabel}>image</Text>

          <View style={styles.thumbWrap}>
            {img2 ? (
              <Image source={{ uri: img2 }} style={styles.thumb} resizeMode="cover" />
            ) : (
              <View style={styles.missing}>
                <Ionicons name="close" size={44} color="#D92D20" />
              </View>
            )}
          </View>
          <Text style={styles.imgLabel}>image 2</Text>
        </View>

        {/* Content column */}
        <View style={styles.contentCol}>
          <Text style={styles.label}>Régions visitées ce jour :</Text>
          <Text style={styles.value}>{regionsText}</Text>

          <View style={{ height: 10 }} />

          <Text style={styles.label}>Total des visites ce jour : ({visitsTotal}) clients</Text>
          <Text style={styles.value}>
            ({visitsMedical}) Medical: ({visitsCommercial}) Commercial
            {commercialTypes ? `: ${commercialTypes}` : ""}
          </Text>

          <View style={{ height: 12 }} />

          <View style={styles.row}>
            <Text style={styles.label}>Commentaire:</Text>
            <View style={{ width: 10 }} />
            <Text style={styles.label}>Note:</Text>
            <View style={{ width: 6 }} />

            <Stars
              value={Number(item.note ?? 0)}
              disabled={!canEditNote}
              onPick={(n) => onSetNote(item.id, n)}
            />
          </View>

          {item.lastComment ? (
            <Text style={styles.commentLine} numberOfLines={2}>
              <Text style={{ fontWeight: "800" }}>{item.lastComment.by || "—"}: </Text>
              {item.lastComment.comment}
            </Text>
          ) : (
            <Text style={styles.noComment}>Pas de commentaires</Text>
          )}

          {item.hasMoreComments ? <Text style={styles.more}>Plus de commentaire</Text> : null}

          {/* Inline comment input (like WebApp) */}
          <View style={styles.inputRow}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              editable={canComment && !sending}
              placeholder="Ajouter un commentaire..."
              placeholderTextColor={COLORS.textMuted}
              style={styles.input}
            />

            <Pressable
              onPress={submit}
              disabled={!canComment || sending || !draft.trim()}
              style={[styles.sendBtn, (!canComment || sending || !draft.trim()) ? styles.sendBtnDisabled : null]}
            >
              {sending ? (
                <ActivityIndicator color={COLORS.textOnBrand} />
              ) : (
                <Ionicons name="send" size={18} color={COLORS.textOnBrand} />
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: { padding: 0, overflow: "hidden" },

  topBar: {
    backgroundColor: COLORS.brand,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
  },
  topBarText: {
    color: COLORS.textOnBrand,
    fontWeight: "900",
    fontSize: TYPO.body,
  },

  body: {
    flexDirection: "row",
    gap: SPACING.md,
    padding: SPACING.md,
  },

  imagesCol: { width: 96, gap: 8, alignItems: "flex-start" },
  thumbWrap: {
    width: 96,
    height: 96,
    borderRadius: RADIUS.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.cardAlt,
  },
  thumb: { width: "100%", height: "100%" },
  missing: { flex: 1, alignItems: "center", justifyContent: "center" },
  imgLabel: { color: COLORS.textMuted, fontWeight: "700", fontSize: TYPO.small },

  contentCol: { flex: 1, minWidth: 0 },

  label: { color: COLORS.text, fontWeight: "900", fontSize: TYPO.small },
  value: { color: COLORS.text, fontSize: TYPO.body },

  row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },

  noComment: { marginTop: 4, color: "#D92D20", fontWeight: "900" },
  commentLine: { marginTop: 4, color: COLORS.text },
  more: { marginTop: 4, color: COLORS.brandDark, fontWeight: "900" },

  inputRow: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  input: {
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
});
