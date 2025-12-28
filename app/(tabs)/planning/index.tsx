// app/(tabs)/planning/index.tsx
// Adjust import paths if your folder structure differs.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";

import { AppHeader } from "../../../src/components/AppHeader";
import { AppCard } from "../../../src/components/AppCard";
import { PickerField } from "../../../src/components/PickerField";
import { COLORS, SPACING, TYPO, RADIUS } from "../../../src/ui/theme";

// IMPORTANT: adapt to your API client.
// If you already have a centralized axios/fetch client, import it here.
import { api } from "../../../src/api/client";

type ScopeUser = {
  id: number;
  username: string;
  first_name?: string;
  last_name?: string;
};

type PlanListItem = {
  id: string | number; // backend might serialize BigInt as string
  day: string; // ISO string or date-only
  user_id: number;
};

type PlanRegion = {
  wilayaId: number;
  wilayaName: string;
  communes: { id: number; nom: string; label: string }[];
  medecinsVisitedYTD: number;
  medecinsTotal: number;
  commerciauxVisitedYTD: number;
  commerciauxTotal: number;
};

type PlanVisite = {
  medecin_id: number;
  nom: string;
  segment: "medical" | "commercial";
  telephone?: string | null;
  classification?: string | null;
  regionLabel?: string | null;
  lastVisit?: string | null; // YYYY-MM-DD
  lastBy?: string | null;
};

type PlanTask = {
  id: string | number;
  task: string;
  order?: number | null;
  completed?: boolean;
  added?: string;
};

type PlanDayPayload = {
  day: string; // YYYY-MM-DD
  user: { id: number; username: string; first_name?: string; last_name?: string };
  plan: { id: string | number; day: string; user_id: number } | null;
  regions: PlanRegion[];
  visites: PlanVisite[];
  tasks: PlanTask[];
};

const ALL_USERS = "__ALL__";

function toDateOnly(d: Date) {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function parseISODate(s: string) {
  // Supports ISO or YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? new Date() : dt;
}

function formatDateFr(d: Date) {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      weekday: "long",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return toDateOnly(d);
  }
}

function displayUserLabel(u: ScopeUser) {
  const fn = (u.first_name || "").trim();
  const ln = (u.last_name || "").trim();
  const full = `${ln} ${fn}`.trim();
  return full || u.username || `User#${u.id}`;
}

async function apiGet<T>(path: string, params?: Record<string, any>): Promise<T> {
  // Axios-like client expected:
  const res = await api.get(path, { params });
  return res.data as T;
}

// simple concurrency limiter (prevents hammering /day endpoint on large ranges)
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let idx = 0;

  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (idx < items.length) {
      const current = items[idx++];
      const r = await fn(current);
      results.push(r);
    }
  });

  await Promise.all(workers);
  return results;
}

function PlanCard({ payload }: { payload: PlanDayPayload }) {
  const [expanded, setExpanded] = useState(false);

  const dayDate = useMemo(() => parseISODate(payload.day), [payload.day]);
  const titleLeft = payload.user?.username || "—";

  const regions = payload.regions || [];
  const visites = payload.visites || [];
  const tasks = payload.tasks || [];

  const visitesPreview = expanded ? visites : visites.slice(0, 4);
  const tasksPreview = expanded ? tasks : tasks.slice(0, 3);

  return (
    <AppCard style={{ marginBottom: SPACING.md }}>
      <View style={styles.cardHeaderRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardUser}>{titleLeft}</Text>
          <Text style={styles.cardDate}>{formatDateFr(dayDate)}</Text>
        </View>

        <Pressable onPress={() => setExpanded((v) => !v)} hitSlop={10} style={styles.expandBtn}>
          <Text style={styles.expandText}>{expanded ? "Réduire" : "Détails"}</Text>
        </Pressable>
      </View>

      {/* Regions summary */}
      <View style={{ marginTop: SPACING.md, gap: 10 }}>
        {regions.map((r) => (
          <View key={String(r.wilayaId)} style={styles.regionBlock}>
            <Text style={styles.regionTitle}>{r.wilayaName}</Text>

            <View style={styles.regionLine}>
              <Text style={styles.regionLabel}>Médecins</Text>
              <Text style={styles.regionValue}>
                {r.medecinsVisitedYTD} / {r.medecinsTotal}
              </Text>
            </View>

            <View style={styles.regionLine}>
              <Text style={styles.regionLabel}>Commerciaux</Text>
              <Text style={styles.regionValue}>
                {r.commerciauxVisitedYTD} / {r.commerciauxTotal}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {/* Planned visits */}
      <View style={{ marginTop: SPACING.lg }}>
        <Text style={styles.sectionTitle}>Médecins & Pharmacies à visiter</Text>

        {visitesPreview.length === 0 ? (
          <Text style={styles.muted}>Aucune visite planifiée.</Text>
        ) : (
          <View style={{ marginTop: 8, gap: 10 }}>
            {visitesPreview.map((v) => (
              <View key={String(v.medecin_id)} style={styles.visiteRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.visiteName}>{v.nom}</Text>

                  <Text style={styles.visiteMeta}>
                    Région: <Text style={styles.visiteMetaStrong}>{v.regionLabel || "—"}</Text>
                  </Text>

                  <Text style={styles.visiteMeta}>
                    Téléphone: <Text style={styles.visiteMetaStrong}>{v.telephone || "—"}</Text>
                  </Text>

                  <Text style={styles.visiteMeta}>
                    Classification:{" "}
                    <Text style={styles.visiteMetaStrong}>{v.classification || "—"}</Text>
                  </Text>

                  <Text style={styles.visiteMeta}>
                    Dernière visite:{" "}
                    <Text style={styles.visiteMetaStrong}>{v.lastVisit || "—"}</Text>
                    {v.lastBy ? (
                      <Text style={styles.visiteMetaStrong}> (Par: {v.lastBy})</Text>
                    ) : null}
                  </Text>
                </View>

                <View style={styles.segmentPillWrap}>
                  <View
                    style={[
                      styles.segmentPill,
                      v.segment === "commercial" ? styles.segmentCommercial : styles.segmentMedical,
                    ]}
                  >
                    <Text style={styles.segmentPillText}>
                      {v.segment === "commercial" ? "Commercial" : "Medical"}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {!expanded && visites.length > visitesPreview.length ? (
  <Pressable onPress={() => setExpanded(true)} hitSlop={10}>
    <Text style={[styles.muted, { marginTop: 10, textDecorationLine: "underline" }]}>
      +{visites.length - visitesPreview.length} autres…
    </Text>
  </Pressable>
) : null}
      </View>

      {/* Tasks */}
      <View style={{ marginTop: SPACING.lg }}>
        <Text style={styles.sectionTitle}>Tâches à faire</Text>

        {tasksPreview.length === 0 ? (
          <Text style={styles.muted}>Aucune tâche.</Text>
        ) : (
          <View style={{ marginTop: 8, gap: 8 }}>
            {tasksPreview.map((t) => (
              <View key={String(t.id)} style={styles.taskRow}>
                <View style={[styles.taskDot, t.completed ? styles.taskDone : styles.taskTodo]} />
                <Text style={styles.taskText} numberOfLines={expanded ? 4 : 2}>
                  {t.task}
                </Text>
              </View>
            ))}
          </View>
        )}

        {!expanded && tasks.length > tasksPreview.length ? (
          <Text style={[styles.muted, { marginTop: 10 }]}>
            +{tasks.length - tasksPreview.length} autres…
          </Text>
        ) : null}
      </View>
    </AppCard>
  );
}

export default function PlanningListScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [scopeUsers, setScopeUsers] = useState<ScopeUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>(ALL_USERS);

  const [startDate, setStartDate] = useState<Date>(() => new Date());
  const [endDate, setEndDate] = useState<Date>(() => new Date());

  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const [cards, setCards] = useState<PlanDayPayload[]>([]);

  const userItems = useMemo(() => {
    const items = scopeUsers.map((u) => ({ label: displayUserLabel(u), value: String(u.id) }));

    // Show "Tous" only if there is a real scope list (Countrymanager or Superviseur typically)
    if (scopeUsers.length > 1) {
      return [{ label: "Tous", value: ALL_USERS }, ...items];
    }
    return items;
  }, [scopeUsers]);

  const shouldShowUserPicker = scopeUsers.length > 1;

  const clampDates = useCallback((nextStart: Date, nextEnd: Date) => {
    // Ensure start <= end
    if (nextStart.getTime() > nextEnd.getTime()) {
      return { start: nextStart, end: nextStart };
    }
    return { start: nextStart, end: nextEnd };
  }, []);

  const onPickStart = useCallback(
    (_: DateTimePickerEvent, date?: Date) => {
      setShowStartPicker(false);
      if (!date) return;
      const fixed = clampDates(date, endDate);
      setStartDate(fixed.start);
      setEndDate(fixed.end);
    },
    [endDate, clampDates]
  );

  const onPickEnd = useCallback(
    (_: DateTimePickerEvent, date?: Date) => {
      setShowEndPicker(false);
      if (!date) return;
      const fixed = clampDates(startDate, date);
      setStartDate(fixed.start);
      setEndDate(fixed.end);
    },
    [startDate, clampDates]
  );

  const loadScopeUsers = useCallback(async () => {
    const data = await apiGet<{ users: ScopeUser[] }>("/plans/scope-users");
    const users = Array.isArray(data?.users) ? data.users : [];
    setScopeUsers(users);

    // Default selection:
    // - if only one user => select him
    // - else keep ALL
    if (users.length === 1) setSelectedUser(String(users[0].id));
    else setSelectedUser(ALL_USERS);
  }, []);

  const fetchPlansForUser = useCallback(
    async (userId: string | null) => {
      const params: any = {
        start: toDateOnly(startDate),
        end: toDateOnly(endDate),
      };
      if (userId) params.userId = userId;

      const list = await apiGet<PlanListItem[]>("/plans/list", params);
      return Array.isArray(list) ? list : [];
    },
    [startDate, endDate]
  );

  const buildCardsFromList = useCallback(async (list: PlanListItem[]) => {
    if (!list.length) return [];

    // For each plan (day + user), call /plans/day to get full card payload
    // Keep concurrency limited
    const normalized = list
      .map((p) => ({
        day: toDateOnly(parseISODate(p.day)),
        userId: String(p.user_id),
      }))
      .filter((x) => x.day && x.userId);

    const uniqueKey = new Set<string>();
    const dedup = normalized.filter((x) => {
      const k = `${x.day}::${x.userId}`;
      if (uniqueKey.has(k)) return false;
      uniqueKey.add(k);
      return true;
    });

    const payloads = await mapLimit(dedup, 6, async (x) => {
      const data = await apiGet<PlanDayPayload>("/plans/day", {
        date: x.day,
        userId: x.userId,
      });
      return data;
    });

    // Sort desc by day, then username
    payloads.sort((a, b) => {
      const da = parseISODate(a.day).getTime();
      const db = parseISODate(b.day).getTime();
      if (da !== db) return db - da;
      return (a.user?.username || "").localeCompare(b.user?.username || "");
    });

    // Keep only entries that actually have a plan
    return payloads.filter((p) => p?.plan);
  }, []);

  const loadAll = useCallback(async () => {
    setError(null);
    setLoading(true);

    try {
      await loadScopeUsers();

      // If ALL selected, fetch per-user and merge
      let allPlans: PlanListItem[] = [];

      if (selectedUser === ALL_USERS && scopeUsers.length > 0) {
        const perUser = await mapLimit(scopeUsers, 4, async (u) => fetchPlansForUser(String(u.id)));
        allPlans = perUser.flat();
      } else {
        const uid = selectedUser === ALL_USERS ? null : selectedUser;
        allPlans = await fetchPlansForUser(uid);
      }

      const payloads = await buildCardsFromList(allPlans);
      setCards(payloads);
    } catch (e: any) {
      setError(e?.message || "Erreur lors du chargement.");
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, [loadScopeUsers, fetchPlansForUser, buildCardsFromList, selectedUser, scopeUsers.length]);

  useEffect(() => {
    // initial load
    loadScopeUsers()
      .catch(() => null)
      .finally(() => {
        // After scope users load, trigger load
        // (Delay to ensure selectedUser gets set)
        setTimeout(() => {
          loadAll().catch(() => null);
        }, 0);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // reload when filters change
  useEffect(() => {
    if (!loading) {
      loadAll().catch(() => null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUser, startDate, endDate]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadAll();
    } finally {
      setRefreshing(false);
    }
  }, [loadAll]);

  return (
    <View style={styles.screen}>
      <AppHeader
        title="Planning"
        titleAr="التخطيط"
        onBack={() => router.back()}
      />

      {/* Filters */}
      <View style={styles.body}>
        <AppCard style={styles.filtersCard}>
          <Text style={styles.filtersTitle}>Filtres</Text>

          {shouldShowUserPicker ? (
            <PickerField
              label="Utilisateur"
              value={selectedUser}
              items={userItems}
              onChange={(v) => setSelectedUser(v)}
            />
          ) : null}

          <View style={styles.dateRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Du</Text>
              <Pressable onPress={() => setShowStartPicker(true)} style={styles.dateBtn}>
                <Text style={styles.dateBtnText}>{toDateOnly(startDate)}</Text>
              </Pressable>
            </View>

            <View style={{ width: SPACING.md }} />

            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Au</Text>
              <Pressable onPress={() => setShowEndPicker(true)} style={styles.dateBtn}>
                <Text style={styles.dateBtnText}>{toDateOnly(endDate)}</Text>
              </Pressable>
            </View>
          </View>

          {/* Pickers */}
          {showStartPicker ? (
            <DateTimePicker
              value={startDate}
              mode="date"
              display={Platform.OS === "ios" ? "inline" : "default"}
              onChange={onPickStart}
            />
          ) : null}

          {showEndPicker ? (
            <DateTimePicker
              value={endDate}
              mode="date"
              display={Platform.OS === "ios" ? "inline" : "default"}
              onChange={onPickEnd}
            />
          ) : null}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </AppCard>

        {/* List */}
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator />
            <Text style={styles.muted}>Chargement…</Text>
          </View>
        ) : (
          <FlatList
            data={cards}
            keyExtractor={(item) => `${item.day}-${item.user?.id ?? "x"}`}
            renderItem={({ item }) => <PlanCard payload={item} />}
            contentContainerStyle={{ paddingBottom: SPACING.xl }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            ListEmptyComponent={
              <AppCard>
                <Text style={styles.emptyTitle}>Aucun plan</Text>
                <Text style={styles.muted}>
                  Aucun plan trouvé pour la période sélectionnée.
                </Text>
              </AppCard>
            }
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  body: {
    flex: 1,
    padding: SPACING.md,
    gap: SPACING.md,
  },

  filtersCard: {
    padding: SPACING.lg,
  },
  filtersTitle: {
    fontSize: TYPO.title,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: SPACING.md,
  },

  fieldLabel: {
    fontSize: TYPO.small,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 6,
    marginLeft: 2,
  },

  dateRow: {
    marginTop: SPACING.md,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  dateBtn: {
    height: 46,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    paddingHorizontal: SPACING.md,
    alignItems: "center",
    justifyContent: "center",
  },
  dateBtnText: {
    fontSize: TYPO.body,
    fontWeight: "700",
    color: COLORS.text,
  },

  loadingWrap: {
    marginTop: SPACING.xl,
    alignItems: "center",
    gap: 10,
  },

  muted: {
    color: COLORS.textMuted,
    fontSize: TYPO.body,
  },
  errorText: {
    marginTop: SPACING.md,
    color: "#B00020",
    fontWeight: "700",
  },

  emptyTitle: {
    fontSize: TYPO.title,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: 6,
  },

  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
  },
  cardUser: {
    fontSize: TYPO.title,
    fontWeight: "900",
    color: COLORS.text,
  },
  cardDate: {
    marginTop: 2,
    fontSize: TYPO.small,
    fontWeight: "700",
    color: COLORS.textMuted,
    textTransform: "capitalize",
  },
  expandBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  expandText: {
    fontSize: TYPO.small,
    fontWeight: "800",
    color: COLORS.text,
  },

  sectionTitle: {
    fontSize: TYPO.body,
    fontWeight: "900",
    color: COLORS.text,
  },

  regionBlock: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    backgroundColor: COLORS.card,
  },
  regionTitle: {
    fontSize: TYPO.body,
    fontWeight: "900",
    color: COLORS.text,
    marginBottom: 6,
  },
  regionLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  regionLabel: {
    fontSize: TYPO.body,
    fontWeight: "700",
    color: COLORS.textMuted,
  },
  regionValue: {
    fontSize: TYPO.body,
    fontWeight: "900",
    color: COLORS.text,
  },

  visiteRow: {
    flexDirection: "row",
    gap: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    backgroundColor: COLORS.bg,
  },
  visiteName: {
    fontSize: TYPO.body,
    fontWeight: "900",
    color: COLORS.text,
    marginBottom: 4,
  },
  visiteMeta: {
    fontSize: TYPO.small,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  visiteMetaStrong: {
    fontWeight: "900",
    color: COLORS.text,
  },

  segmentPillWrap: {
    justifyContent: "flex-start",
    alignItems: "flex-end",
  },
  segmentPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  segmentMedical: {
    backgroundColor: "rgba(46, 125, 50, 0.12)",
  },
  segmentCommercial: {
    backgroundColor: "rgba(251, 140, 0, 0.14)",
  },
  segmentPillText: {
    fontSize: TYPO.small,
    fontWeight: "900",
    color: COLORS.text,
  },

  taskRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  taskDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    marginTop: 6,
  },
  taskTodo: {
    backgroundColor: "rgba(251, 140, 0, 0.9)",
  },
  taskDone: {
    backgroundColor: "rgba(46, 125, 50, 0.9)",
  },
  taskText: {
    flex: 1,
    fontSize: TYPO.body,
    fontWeight: "700",
    color: COLORS.text,
  },
});
