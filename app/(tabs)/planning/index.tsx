// app/(tabs)/planning/index.tsx
// Planning (calendar + day preview + add/update inline)

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Linking,
  ScrollView,
  TextInput,
  Alert,
} from "react-native";

import { Calendar, type DateData } from "react-native-calendars";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { AppHeader } from "../../../src/components/AppHeader";
import { AppCard } from "../../../src/components/AppCard";
import { AppSelect, type AppSelectOption } from "../../../src/components/AppSelect";

import { COLORS, SPACING, TYPO, RADIUS } from "../../../src/ui/theme";
import { api } from "../../../src/api/client";

/** ---------- Helpers ---------- */

type SectorType = "IN" | "SEMI" | "DEP" | null;
type PlanValidationField = "valid_commune" | "valid_clients" | "valid_tasks";

function toYMD(d: Date) {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function parseISODate(s: string) {
  // Supports YYYY-MM-DD or full ISO
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
    return toYMD(d);
  }
}

function formatDateFrShort(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return d.toLocaleDateString();
  }
}

function formatTimeFr(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return d.toLocaleTimeString().slice(0, 5);
  }
}

function sectorColor(st: SectorType) {
  if (st === "DEP") return "#D4AF37"; // gold
  if (st === "SEMI") return "#C0C0C0"; // silver
  return "#16A34A"; // green for IN/null
}

function getNextValidationField(plan: PlanCore): PlanValidationField | null {
  if (!plan.valid_commune) return "valid_commune";
  if (!plan.valid_clients) return "valid_clients";
  if (!plan.valid_tasks) return "valid_tasks";
  return null;
}

function displayUserLabel(u: ScopeUser) {
  const fn = (u.first_name || "").trim();
  const ln = (u.last_name || "").trim();
  const full = `${ln} ${fn}`.trim();
  return full || u.username || `User#${u.id}`;
}

function uniqNums(xs: number[]) {
  return Array.from(new Set(xs.filter((n) => Number.isFinite(n))));
}

function sameSet(a: number[], b: number[]) {
  const aa = uniqNums(a).sort((x, y) => x - y);
  const bb = uniqNums(b).sort((x, y) => x - y);
  if (aa.length !== bb.length) return false;
  for (let i = 0; i < aa.length; i++) if (aa[i] !== bb[i]) return false;
  return true;
}

async function apiGet<T>(path: string, params?: Record<string, any>): Promise<T> {
  const res = await api.get(path, { params });
  return res.data as T;
}

async function apiPost<T>(path: string, body?: any, params?: Record<string, any>): Promise<T> {
  const res = await api.post(path, body ?? {}, params ? { params } : undefined);
  return res.data as T;
}

function monthBoundsFromKey(monthKey: string) {
  const [yyS, mmS] = String(monthKey || "").split("-");
  const yy = Number(yyS);
  const mm = Number(mmS);

  if (!yy || !mm) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const start = `${y}-${String(m).padStart(2, "0")}-01`;
    const endDate = new Date(y, m, 0);
    const end = toYMD(endDate);
    return { start, end };
  }

  const start = `${yy}-${String(mm).padStart(2, "0")}-01`;
  const endDate = new Date(yy, mm, 0); // last day
  const end = toYMD(endDate);
  return { start, end };
}

/** ---------- Types ---------- */

type ScopeUser = {
  id: number;
  username: string;
  first_name?: string;
  last_name?: string;
};

type PlanListItem = {
  id: string | number;
  day: string; // YYYY-MM-DD
  user_id: number;
  sector_type?: string | null; // null | IN | SEMI | DEP
  has_content?: boolean; // only mark if has at least a task or a client
};

type PlanRegion = {
  wilayaId: number;
  wilayaName: string;
  sector_type?: string | null;
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
  lastVisit?: string | null;
  lastBy?: string | null;

  latitude?: number | null;
  longitude?: number | null;
  adresse?: string | null;
};

type PlanTask = {
  id: string | number;
  task: string;
  order?: number | null;
  completed?: boolean;
};

type PlanCore = {
  id: string | number;
  day: string;
  user_id: number;

  valid_commune?: boolean | null;
  valid_clients?: boolean | null;
  valid_tasks?: boolean | null;

  commune_validation_date?: string | null;
  client_validation_date?: string | null;
  tasks_validation_date?: string | null;
};

type PlanDayPayload = {
  day: string;
  user: { id: number; username: string; first_name?: string; last_name?: string };
  permissions?: { canValidatePlan?: boolean };
  plan: PlanCore | null;
  regions: PlanRegion[];
  visites: PlanVisite[];
  tasks: PlanTask[];
};

type CommuneRow = {
  id: number;
  nom: string;
  wilaya_id?: number;
  wilaya?: { id?: number; nom?: string } | null;
  regions_wilaya?: { id?: number; nom?: string } | null;
  sector_type?: string | null;
};

type AvailableClientRow = {
  id: number;
  nom?: string;
  name?: string;
  label?: string;
  specialite?: string;
  subtitle?: string;
};

/** ---------- UI Pieces ---------- */

function PlanCard({ payload }: { payload: PlanDayPayload }) {
  const [expanded, setExpanded] = useState(false);
  const [plan, setPlan] = useState<PlanCore | null>(payload.plan);

  // keep internal plan in sync when changing days
  useEffect(() => setPlan(payload.plan), [payload.plan]);

  const canValidatePlan = Boolean(payload.permissions?.canValidatePlan);
  const nextField = useMemo(() => (plan ? getNextValidationField(plan) : null), [plan]);
  const dayDate = useMemo(() => parseISODate(payload.day), [payload.day]);
  const titleLeft = payload.user?.username || "—";

  const regions = payload.regions || [];
  const cardSectorType = useMemo<SectorType>(() => {
    const types = (regions || [])
      .map((r) => String(r?.sector_type ?? "").toUpperCase())
      .filter(Boolean);

    if (types.includes("DEP")) return "DEP";
    if (types.includes("SEMI")) return "SEMI";
    if (types.includes("IN")) return "IN";
    return null;
  }, [regions]);

  const isDep = cardSectorType === "DEP";
  const isSemi = cardSectorType === "SEMI";

  const visites = payload.visites || [];
  const tasks = payload.tasks || [];

  const onValidateNext = useCallback(async () => {
    if (!canValidatePlan) return;
    if (!plan || !nextField) return;

    try {
      const res = await api.post(`/plans/validate/${plan.id}`, {
        action: "validate",
        field: nextField,
      });
      const updated = res?.data?.plan;
      if (updated) setPlan(updated);
    } catch (e: any) {
      console.log("Validation error:", e?.response?.data || e?.message);
    }
  }, [canValidatePlan, plan, nextField]);

  const openVisiteMap = useCallback(async (v: PlanVisite) => {
    const anyV: any = v;
    const lat = anyV.latitude ?? anyV.lat ?? anyV.gps_lat ?? anyV.location_lat ?? null;
    const lng = anyV.longitude ?? anyV.lng ?? anyV.gps_lng ?? anyV.location_lng ?? null;

    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);

    let url = "";
    if (hasCoords) {
      const label = encodeURIComponent(v.nom || "Client");
      url =
        Platform.OS === "ios"
          ? `maps:0,0?q=${lat},${lng}`
          : `geo:${lat},${lng}?q=${lat},${lng}(${label})`;
    } else {
      const query = encodeURIComponent(`${v.nom} ${v.regionLabel ?? ""}`.trim());
      url = `https://www.google.com/maps/search/?api=1&query=${query}`;
    }

    try {
      await Linking.openURL(url);
    } catch {
      // silent
    }
  }, []);

  const visitesPreview = expanded ? visites : visites.slice(0, 4);
  const tasksPreview = expanded ? tasks : tasks.slice(0, 3);

  return (
    <AppCard
  style={StyleSheet.flatten([
    { marginBottom: SPACING.md },
    isSemi ? styles.cardSemi : null,
    isDep ? styles.cardDep : null,
  ])}
>

      <View
        style={[
          styles.cardHeaderRow,
          isSemi ? styles.cardHeaderSemi : null,
          isDep ? styles.cardHeaderDep : null,
        ]}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.cardUser}>{titleLeft}</Text>
          <Text style={styles.cardDate}>{formatDateFr(dayDate)}</Text>
        </View>

        <View style={styles.validationRow}>
          <View style={styles.validationItems}>
            {plan?.valid_commune ? (
              <View style={styles.validationItem}>
                <Ionicons name="location-outline" size={18} color={stylesVars.brand} />
                <Text style={styles.validationDate}>
                  {formatDateFrShort(plan.commune_validation_date)}
                </Text>
                <Text style={styles.validationTime}>
                  {formatTimeFr(plan.commune_validation_date)}
                </Text>
              </View>
            ) : null}

            {plan?.valid_clients ? (
              <View style={styles.validationItem}>
                <Ionicons name="people-outline" size={18} color={stylesVars.brand} />
                <Text style={styles.validationDate}>
                  {formatDateFrShort(plan.client_validation_date)}
                </Text>
                <Text style={styles.validationTime}>
                  {formatTimeFr(plan.client_validation_date)}
                </Text>
              </View>
            ) : null}

            {plan?.valid_tasks ? (
              <View style={styles.validationItem}>
                <Ionicons name="list-outline" size={18} color={stylesVars.brand} />
                <Text style={styles.validationDate}>
                  {formatDateFrShort(plan.tasks_validation_date)}
                </Text>
                <Text style={styles.validationTime}>
                  {formatTimeFr(plan.tasks_validation_date)}
                </Text>
              </View>
            ) : null}
          </View>

          {canValidatePlan && !plan?.valid_tasks ? (
            <Pressable
              onPress={onValidateNext}
              hitSlop={10}
              style={({ pressed }) => [styles.validateBtn, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.validateBtnText}>Valider</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Visits */}
      <View style={{ marginTop: SPACING.lg }}>
        <Text style={styles.sectionTitle}>Médecins & Pharmacies à visiter</Text>

        {visitesPreview.length === 0 ? (
          <Text style={styles.mutedBody}>Aucune visite planifiée.</Text>
        ) : (
          <View style={{ marginTop: 8 }}>
            <View style={styles.visiteListWrap}>
              {visitesPreview.map((v, idx) => (
                <React.Fragment key={String(v.medecin_id)}>
                  <View style={styles.visiteRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.visiteName}>{v.nom}</Text>

                      <Text style={styles.visiteMeta}>
                        Région:{" "}
                        <Text style={styles.visiteMetaStrong}>{v.regionLabel || "—"}</Text>
                      </Text>

                      <Text style={styles.visiteMeta}>
                        Téléphone:{" "}
                        <Text style={styles.visiteMetaStrong}>{v.telephone || "—"}</Text>
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
                          v.segment === "commercial"
                            ? styles.segmentCommercial
                            : styles.segmentMedical,
                        ]}
                      >
                        <Text style={styles.segmentPillText}>
                          {v.segment === "commercial" ? "Commercial" : "Medical"}
                        </Text>
                      </View>

                      <Pressable
                        onPress={() => openVisiteMap(v)}
                        hitSlop={10}
                        style={({ pressed }) => [
                          styles.mapBtn,
                          pressed && { opacity: 0.7, transform: [{ scale: 0.98 }] },
                        ]}
                        accessibilityLabel={`Localiser ${v.nom}`}
                      >
                        <Ionicons name="location-outline" size={18} color={stylesVars.brand} />
                      </Pressable>
                    </View>
                  </View>

                  {idx < visitesPreview.length - 1 ? (
                    <View style={styles.visiteSeparator} />
                  ) : null}
                </React.Fragment>
              ))}
            </View>
          </View>
        )}

        {!expanded && visites.length > visitesPreview.length ? (
          <Pressable onPress={() => setExpanded(true)} hitSlop={10}>
            <Text style={[styles.mutedBody, { marginTop: 10, textDecorationLine: "underline" }]}>
              +{visites.length - visitesPreview.length} autres…
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* Tasks */}
      <View style={{ marginTop: SPACING.lg }}>
        <Text style={styles.sectionTitle}>Tâches à faire</Text>

        {tasksPreview.length === 0 ? (
          <Text style={styles.mutedBody}>Aucune tâche.</Text>
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
          <Pressable onPress={() => setExpanded(true)} hitSlop={10}>
            <Text style={[styles.mutedBody, { marginTop: 10, textDecorationLine: "underline" }]}>
              +{tasks.length - tasksPreview.length} autres…
            </Text>
          </Pressable>
        ) : null}
      </View>
    </AppCard>
  );
}

/** ---------- Screen ---------- */

export default function PlanningListScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [scopeUsers, setScopeUsers] = useState<ScopeUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>("");

  const todayYMD = useMemo(() => toYMD(new Date()), []);
  const [selectedDate, setSelectedDate] = useState<string>(todayYMD);
  const [visibleMonth, setVisibleMonth] = useState<string>(todayYMD.slice(0, 7)); // YYYY-MM

  const [monthPlans, setMonthPlans] = useState<PlanListItem[]>([]);
  const [markedDates, setMarkedDates] = useState<Record<string, any>>({});
  const [dayPayload, setDayPayload] = useState<PlanDayPayload | null>(null);

  // Edit state
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [draftCommuneIds, setDraftCommuneIds] = useState<number[]>([]);
  const [draftClientIds, setDraftClientIds] = useState<number[]>([]);
  const [draftTasks, setDraftTasks] = useState<string[]>([]);
  const [taskInput, setTaskInput] = useState("");

  // Options / chips
  const [communes, setCommunes] = useState<CommuneRow[]>([]);
  const [availableClients, setAvailableClients] = useState<AppSelectOption[]>([]);
  const [selectedCommunesDisplay, setSelectedCommunesDisplay] = useState<AppSelectOption[]>([]);
  const [selectedClientsDisplay, setSelectedClientsDisplay] = useState<AppSelectOption[]>([]);

  const canEditSelectedDay = useMemo(() => selectedDate >= todayYMD, [selectedDate, todayYMD]);

  const locks = useMemo(() => {
    const p = dayPayload?.plan;
    const communesLocked = Boolean(p?.valid_commune || p?.commune_validation_date);
    const clientsLocked = Boolean(p?.valid_clients || p?.client_validation_date);
    const tasksLocked = Boolean(p?.valid_tasks || p?.tasks_validation_date);
    return { communesLocked, clientsLocked, tasksLocked };
  }, [dayPayload?.plan]);

  const baseline = useMemo(() => {
    const baseCommuneIds = uniqNums(
      (dayPayload?.regions || []).flatMap((r) => (r.communes || []).map((c) => Number(c.id)))
    );

    const baseClientIds = uniqNums((dayPayload?.visites || []).map((v) => Number(v.medecin_id)));

    const baseTasks =
      (dayPayload?.tasks || [])
        .map((t) => String(t?.task ?? "").trim())
        .filter(Boolean) || [];

    return { baseCommuneIds, baseClientIds, baseTasks };
  }, [dayPayload]);

  const isDirty = useMemo(() => {
    const communesDirty =
      !locks.communesLocked && !sameSet(draftCommuneIds, baseline.baseCommuneIds);
    const clientsDirty = !locks.clientsLocked && !sameSet(draftClientIds, baseline.baseClientIds);

    const tasksDirty =
      !locks.tasksLocked &&
      JSON.stringify(draftTasks.map((t) => t.trim()).filter(Boolean)) !==
        JSON.stringify(baseline.baseTasks);

    return communesDirty || clientsDirty || tasksDirty;
  }, [
    locks,
    draftCommuneIds,
    draftClientIds,
    draftTasks,
    baseline.baseCommuneIds,
    baseline.baseClientIds,
    baseline.baseTasks,
  ]);

  const shouldShowUserPicker = scopeUsers.length > 1;

  const userOptions = useMemo<AppSelectOption[]>(
    () =>
      scopeUsers.map((u) => ({
        id: String(u.id),
        label: displayUserLabel(u),
        keywords: `${u.username ?? ""} ${u.first_name ?? ""} ${u.last_name ?? ""}`.trim(),
      })),
    [scopeUsers]
  );

  const communeOptions = useMemo<AppSelectOption[]>(() => {
    return communes.map((c) => {
      const w = c.wilaya?.nom ?? c.regions_wilaya?.nom ?? "—";
      return {
        id: c.id,
        label: c.nom,
        subtitle: w,
        keywords: `${c.nom} ${w}`.toLowerCase(),
      };
    });
  }, [communes]);

  const communeWilayaIdById = useMemo(() => {
    const map: Record<number, number | null> = {};
    for (const c of communes) {
      const cid = Number(c.id);
      const wid = c.wilaya_id ?? c.wilaya?.id ?? c.regions_wilaya?.id ?? null;
      map[cid] = wid != null ? Number(wid) : null;
    }
    return map;
  }, [communes]);

  const wilayaIdForCommune = useCallback(
    (communeId: number) => communeWilayaIdById[Number(communeId)] ?? null,
    [communeWilayaIdById]
  );

  const firstWilayaId = useMemo(() => {
    if (!draftCommuneIds.length) return null;
    return wilayaIdForCommune(Number(draftCommuneIds[0]));
  }, [draftCommuneIds, wilayaIdForCommune]);

  const communeOptionsForDay = useMemo(() => {
    const base = firstWilayaId
      ? communeOptions.filter((o) => wilayaIdForCommune(Number(o.id)) === firstWilayaId)
      : communeOptions;

    // remove already selected
    const selected = new Set(draftCommuneIds.map(Number));
    return base.filter((o) => !selected.has(Number(o.id)));
  }, [communeOptions, firstWilayaId, wilayaIdForCommune, draftCommuneIds]);

  const clientOptionsForDay = useMemo(() => {
    const selected = new Set(draftClientIds.map(Number));
    return (availableClients || []).filter((o) => !selected.has(Number(o.id)));
  }, [availableClients, draftClientIds]);

  /** ---------- Data fetching ---------- */

  const loadScopeUsers = useCallback(async () => {
    const data = await apiGet<{ users: ScopeUser[]; meId?: number }>("/plans/scope-users");
    const users = Array.isArray(data?.users) ? data.users : [];
    setScopeUsers(users);

    const initial =
      data?.meId != null
        ? String(data.meId)
        : users.length >= 1
        ? String(users[0].id)
        : "";

    setSelectedUser(initial);
  }, []);

  const fetchMonthPlans = useCallback(async (monthKey: string, userId: string) => {
    const { start, end } = monthBoundsFromKey(monthKey);
    const list = await apiGet<PlanListItem[]>("/plans/list", { start, end, userId });
    return Array.isArray(list) ? list : [];
  }, []);

  const fetchDayPayload = useCallback(async (dateYMD: string, userId: string) => {
    const data = await apiGet<PlanDayPayload>("/plans/day", { date: dateYMD, userId });
    return data;
  }, []);

  const reloadMonth = useCallback(async () => {
    if (!selectedUser) return;
    const list = await fetchMonthPlans(visibleMonth, selectedUser);
    setMonthPlans(list);
  }, [fetchMonthPlans, selectedUser, visibleMonth]);

  const reloadDay = useCallback(async () => {
    if (!selectedUser) return;
    const payload = await fetchDayPayload(selectedDate, selectedUser);
    setDayPayload(payload);
  }, [fetchDayPayload, selectedDate, selectedUser]);

  const reloadAll = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      await Promise.all([reloadMonth(), reloadDay()]);
    } catch (e: any) {
      setError(e?.message || "Erreur lors du chargement.");
      setMonthPlans([]);
      setDayPayload(null);
    } finally {
      setLoading(false);
    }
  }, [reloadMonth, reloadDay]);

  /** Marked dates */
  const buildMarkedDates = useCallback((plans: PlanListItem[], selectedYMD: string) => {
    const out: Record<string, any> = {};

    for (const p of plans) {
      if (p.has_content === false) continue;

      const ymd = String(p.day || "").slice(0, 10);
      if (!ymd) continue;

      const raw = String(p.sector_type ?? "").toUpperCase().trim();
      const st: SectorType =
        raw === "DEP" ? "DEP" : raw === "SEMI" ? "SEMI" : raw === "IN" ? "IN" : null;

      const bg = sectorColor(st);
      const textColor = st === "DEP" || st === "SEMI" ? "#111" : "#fff";

      out[ymd] = {
        customStyles: {
          container: { backgroundColor: bg, borderRadius: 8 },
          text: { color: textColor, fontWeight: "700" },
        },
      };
    }

    // Selected day border (do not remove background)
    if (selectedYMD) {
      const prevContainer = out[selectedYMD]?.customStyles?.container ?? {};
      const prevText = out[selectedYMD]?.customStyles?.text ?? {};

      out[selectedYMD] = {
        ...(out[selectedYMD] || {}),
        customStyles: {
          container: { ...prevContainer, borderWidth: 2, borderColor: "#111" },
          text: { ...prevText },
        },
      };
    }

    return out;
  }, []);

  useEffect(() => {
    setMarkedDates(buildMarkedDates(monthPlans, selectedDate));
  }, [monthPlans, selectedDate, buildMarkedDates]);

  /** ---------- Edit mode: load communes + clients ---------- */

  const loadCommunesOptions = useCallback(async () => {
    if (!selectedUser) {
      setCommunes([]);
      return;
    }
    try {
      const res = await apiGet<{ communes: CommuneRow[] }>("/plans/communes", {
        userId: String(selectedUser),
        onlyMine: 1,
      });
      setCommunes(Array.isArray(res?.communes) ? res.communes : []);
    } catch {
      setCommunes([]);
    }
  }, [selectedUser]);

  const ensureClientsLoaded = useCallback(async (userId: number, communeIds: number[]) => {
    if (!userId || communeIds.length === 0) {
      setAvailableClients([]);
      return;
    }

    try {
      const res = await apiPost<{ clients: AvailableClientRow[] }>(
  "/plans/available-clients",
  { userId, communeIds }
);


      const raw = Array.isArray(res?.clients) ? res.clients : [];
      const opts: AppSelectOption[] = raw.map((c) => {
        const label = c.label ?? c.nom ?? c.name ?? `Client #${c.id}`;
        const subtitle = c.subtitle ?? c.specialite ?? undefined;
        return { id: c.id, label, subtitle, keywords: `${label} ${subtitle ?? ""}`.toLowerCase() };
      });

      setAvailableClients(opts);
    } catch {
      setAvailableClients([]);
    }
  }, []);

  /** Keep drafts reset when leaving edit mode or day changes */
  useEffect(() => {
    if (editMode) return;

    setDraftCommuneIds(baseline.baseCommuneIds);
    setDraftClientIds(baseline.baseClientIds);
    setDraftTasks(baseline.baseTasks);
    setTaskInput("");
    setEditError(null);

    // chips preview (non-edit)
    setSelectedCommunesDisplay([]);
    setSelectedClientsDisplay([]);
  }, [baseline.baseCommuneIds, baseline.baseClientIds, baseline.baseTasks, editMode]);

  /** Keep chips in sync when editing */
  useEffect(() => {
    if (!editMode) return;

    setSelectedCommunesDisplay(
      draftCommuneIds
        .map((id) => communeOptions.find((o) => Number(o.id) === Number(id)) || null)
        .filter(Boolean) as AppSelectOption[]
    );

    setSelectedClientsDisplay(
      draftClientIds
        .map((id) => availableClients.find((o) => Number(o.id) === Number(id)) || null)
        .filter(Boolean) as AppSelectOption[]
    );
  }, [editMode, draftCommuneIds, draftClientIds, communeOptions, availableClients]);

  const startEdit = useCallback(async () => {
    if (!canEditSelectedDay) return;

    setEditError(null);
    setEditMode(true);

    try {
      await loadCommunesOptions();

      // preload clients if communes exist in baseline
      const communeIds = baseline.baseCommuneIds;
      if (selectedUser && communeIds.length) {
        await ensureClientsLoaded(Number(selectedUser), communeIds);
      } else {
        setAvailableClients([]);
      }

      // initialize drafts from baseline
      setDraftCommuneIds(baseline.baseCommuneIds);
      setDraftClientIds(baseline.baseClientIds);
      setDraftTasks(baseline.baseTasks);
    } catch {
      // keep edit mode but show minimal error
    }
  }, [
    canEditSelectedDay,
    loadCommunesOptions,
    baseline.baseCommuneIds,
    baseline.baseClientIds,
    baseline.baseTasks,
    selectedUser,
    ensureClientsLoaded,
  ]);

  const cancelEdit = useCallback(() => {
    setEditMode(false);
    setEditError(null);
    setDraftCommuneIds(baseline.baseCommuneIds);
    setDraftClientIds(baseline.baseClientIds);
    setDraftTasks(baseline.baseTasks);
    setTaskInput("");
  }, [baseline.baseCommuneIds, baseline.baseClientIds, baseline.baseTasks]);

  const addTask = useCallback(() => {
    const t = taskInput.trim();
    if (!t) return;
    if (locks.tasksLocked) return;
    setDraftTasks((prev) => [...prev, t]);
    setTaskInput("");
  }, [taskInput, locks.tasksLocked]);

  const removeTask = useCallback(
    (idx: number) => {
      if (locks.tasksLocked) return;
      setDraftTasks((prev) => prev.filter((_, i) => i !== idx));
    },
    [locks.tasksLocked]
  );

  const addCommune = useCallback(
    (communeId: number) => {
      if (!canEditSelectedDay) return;
      if (locks.communesLocked) return;

      // same wilaya rule
      if (draftCommuneIds.length > 0) {
        const firstId = Number(draftCommuneIds[0]);
        const firstW = wilayaIdForCommune(firstId);
        const nextW = wilayaIdForCommune(communeId);
        if (firstW != null && nextW != null && firstW !== nextW) {
          Alert.alert(
            "Wilaya différente",
            "Vous ne pouvez sélectionner que des communes de la même wilaya."
          );
          return;
        }
      }

      const nextIds = Array.from(new Set([...draftCommuneIds, communeId]));
      setDraftCommuneIds(nextIds);

      // changing communes resets clients selection
      setDraftClientIds([]);
      setSelectedClientsDisplay([]);
      setAvailableClients([]);

      if (selectedUser) void ensureClientsLoaded(Number(selectedUser), nextIds.map(Number));

    },
    [
      canEditSelectedDay,
      locks.communesLocked,
      draftCommuneIds,
      wilayaIdForCommune,
      selectedUser,
      ensureClientsLoaded,
    ]
  );

  const removeCommune = useCallback(
    (communeId: number) => {
      if (!canEditSelectedDay) return;
      if (locks.communesLocked) return;

      const nextIds = draftCommuneIds.filter((x) => Number(x) !== Number(communeId));
      setDraftCommuneIds(nextIds);

      // removing commune resets clients
      setDraftClientIds([]);
      setSelectedClientsDisplay([]);
      setAvailableClients([]);

      if (selectedUser && nextIds.length) void ensureClientsLoaded(Number(selectedUser), nextIds);
    },
    [canEditSelectedDay, locks.communesLocked, draftCommuneIds, selectedUser, ensureClientsLoaded]
  );

  const addClient = useCallback(
    (clientId: number) => {
      if (!canEditSelectedDay) return;
      if (locks.clientsLocked) return;

      setDraftClientIds((prev) => Array.from(new Set([...prev, clientId])));
    },
    [canEditSelectedDay, locks.clientsLocked]
  );

  const removeClient = useCallback(
    (clientId: number) => {
      if (!canEditSelectedDay) return;
      if (locks.clientsLocked) return;

      setDraftClientIds((prev) => prev.filter((x) => Number(x) !== Number(clientId)));
    },
    [canEditSelectedDay, locks.clientsLocked]
  );

  const savePlan = useCallback(async () => {
    if (!canEditSelectedDay) {
      setEditError("Jour passé: modification interdite.");
      return;
    }
    if (saving) return;

    // effective values (respect locks)
    const effCommunes = locks.communesLocked ? baseline.baseCommuneIds : draftCommuneIds;
    const effClients = locks.clientsLocked ? baseline.baseClientIds : draftClientIds;
    const effTasks = locks.tasksLocked ? baseline.baseTasks : draftTasks;

    // enforce non-empty content (at least 1 client or 1 task)
    if (!effClients.length && !effTasks.length) {
      setEditError("Plan vide: ajoute au moins un client ou une tâche.");
      return;
    }

    // if clients chosen, communes must exist (unless locked and already present)
    if (effClients.length && !effCommunes.length) {
      setEditError("Sélectionne au moins une commune avant de choisir des clients.");
      return;
    }

    setSaving(true);
    setEditError(null);

    try {
      await apiPost("/plans/day-upsert", {
        day: selectedDate,
        userId: Number(selectedUser),
        communeIds: effCommunes,
        clientIds: effClients,
        tasks: effTasks,
      });

      setEditMode(false);
      await reloadAll();
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || "Erreur lors de l'enregistrement.";
      setEditError(String(msg));
    } finally {
      setSaving(false);
    }
  }, [
    canEditSelectedDay,
    saving,
    locks,
    baseline.baseCommuneIds,
    baseline.baseClientIds,
    baseline.baseTasks,
    draftCommuneIds,
    draftClientIds,
    draftTasks,
    selectedDate,
    selectedUser,
    reloadAll,
  ]);

  /** ---------- GP download helpers ---------- */

  const getAuthHeader = () => {
    const h =
      (api as any)?.defaults?.headers?.common?.Authorization ||
      (api as any)?.defaults?.headers?.Authorization ||
      null;
    return typeof h === "string" && h.length > 0 ? h : null;
  };

  const downloadGP = async (kind: "commercial" | "medical") => {
    try {
      const month = visibleMonth; // YYYY-MM

      const envBase = `${process.env.EXPO_PUBLIC_API_URL ?? ""}${process.env.EXPO_PUBLIC_API_PREFIX ?? ""}`;
      const base =
        (envBase && envBase !== "undefinedundefined" ? envBase : (api as any)?.defaults?.baseURL || "")
          .toString()
          .replace(/\/$/, "");

      if (!base) return;

      const auth = getAuthHeader();
      const token = auth ? auth.replace(/^Bearer\s+/i, "") : "";

      const url =
        `${base}/plans/gp-${kind}?month=${encodeURIComponent(month)}` +
        (token ? `&token=${encodeURIComponent(token)}` : "");

      await Linking.openURL(url);
    } catch (e) {
      console.log("GP open error:", e);
    }
  };

  /** ---------- Lifecycle ---------- */

  useEffect(() => {
    loadScopeUsers().catch(() => null);
  }, [loadScopeUsers]);

  useEffect(() => {
    if (!selectedUser) return;
    reloadAll().catch(() => null);
  }, [selectedUser, reloadAll]);

  useEffect(() => {
    if (!selectedUser) return;
    reloadMonth().catch(() => null);
  }, [visibleMonth, selectedUser, reloadMonth]);

  useEffect(() => {
    if (!selectedUser) return;
    reloadDay().catch(() => null);
  }, [selectedDate, selectedUser, reloadDay]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await reloadAll();
    } finally {
      setRefreshing(false);
    }
  }, [reloadAll]);

    const selectDay = useCallback(
    (nextYMD: string) => {
      if (!nextYMD || nextYMD === selectedDate) return;

      // Optionnel: éviter de changer de jour pendant un save
      if (saving) return;

      // Règle demandée: si on était en édition, on annule automatiquement
      if (editMode) cancelEdit();

      setSelectedDate(nextYMD);
    },
    [selectedDate, saving, editMode, cancelEdit]
  );


  /** ---------- Render ---------- */

  return (
    <View style={styles.screen}>
      <AppHeader title="Planning" titleAr="التخطيط" onBack={() => router.back()} />

      <View style={styles.body}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: SPACING.xl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <AppCard style={styles.filtersCard}>
            <Text style={styles.filtersTitle}>Planning</Text>

            {shouldShowUserPicker ? (
              <AppSelect
                title="Utilisateur"
                titleAr="المستخدم"
                value={selectedUser}
                options={userOptions}
                allowClear={false}
                onChange={(id) => setSelectedUser(String(id))}
              />
            ) : null}

            <View style={{ marginTop: SPACING.md }}>
              <Calendar
                markingType="custom"
                markedDates={markedDates}
                onDayPress={(d) => selectDay(d.dateString)}
                onMonthChange={(m: DateData) => {
                  const mk = String(m?.dateString || "").slice(0, 7); // YYYY-MM
                  if (mk && mk.length === 7) setVisibleMonth(mk);
                }}
              />
            </View>

            <View style={styles.gpRow}>
              <Pressable
                onPress={() => downloadGP("commercial")}
                style={({ pressed }) => [styles.gpBtn, pressed && styles.gpBtnPressed]}
              >
                <Text style={styles.gpBtnText}>GP Commercial</Text>
              </Pressable>

              <View style={{ width: SPACING.sm }} />

              <Pressable
                onPress={() => downloadGP("medical")}
                style={({ pressed }) => [styles.gpBtn, pressed && styles.gpBtnPressed]}
              >
                <Text style={styles.gpBtnText}>GP Medical</Text>
              </Pressable>
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </AppCard>

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator />
              <Text style={styles.mutedBody}>Chargement…</Text>
            </View>
          ) : !dayPayload ? (
            <AppCard>
              <Text style={styles.emptyTitle}>Aucun plan</Text>
              <Text style={styles.mutedBody}>Impossible de charger la journée sélectionnée.</Text>
            </AppCard>
          ) : (
            <>
              <AppCard style={{ marginBottom: SPACING.md }}>
                <Text style={styles.sectionTitle}>{formatDateFr(parseISODate(selectedDate))}</Text>

                {!canEditSelectedDay ? (
                  <Text style={[styles.mutedBody, { marginTop: 6 }]}>
                    Journée passée: création/modification interdite.
                  </Text>
                ) : !editMode ? (
                  <Pressable
                    onPress={startEdit}
                    style={({ pressed }) => [
                      styles.primaryBtn,
                      pressed && { opacity: 0.85 },
                      { marginTop: 10 },
                    ]}
                  >
                    <Text style={styles.primaryBtnText}>
                      {dayPayload.plan ? "Modifier" : "Ajouter le planning"}
                    </Text>
                  </Pressable>
                ) : (
                  <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                    <Pressable
                      onPress={cancelEdit}
                      style={({ pressed }) => [
                        styles.secondaryBtn,
                        pressed && { opacity: 0.85 },
                        { flex: 1 },
                      ]}
                    >
                      <Text style={styles.secondaryBtnText}>Annuler</Text>
                    </Pressable>

                    {isDirty ? (
                      <Pressable
                        onPress={savePlan}
                        style={({ pressed }) => [
                          styles.primaryBtn,
                          pressed && { opacity: 0.85 },
                          { flex: 1, opacity: saving ? 0.6 : 1 },
                        ]}
                        disabled={saving}
                      >
                        <Text style={styles.primaryBtnText}>
                          {saving
                            ? "Enregistrement…"
                            : dayPayload.plan
                            ? "Enregistrer"
                            : "Ajouter le planning"}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                )}

                {editError ? <Text style={styles.errorText}>{editError}</Text> : null}
              </AppCard>

              {editMode ? (
                <AppCard style={{ padding: SPACING.md, marginBottom: SPACING.md }}>
                  {/* Communes */}
                  <Text style={styles.blockLabel}>Régions (communes)</Text>

                  <View style={styles.chipsWrap}>
                    {selectedCommunesDisplay.length ? (
                      selectedCommunesDisplay.map((c) => (
                        <View
                          key={String(c.id)}
                          style={[styles.chip, locks.communesLocked ? styles.chipLocked : null]}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              locks.communesLocked ? styles.chipTextLocked : null,
                            ]}
                          >
                            {c.subtitle ? `${c.subtitle} • ${c.label}` : c.label}
                          </Text>

                          {!locks.communesLocked ? (
                            <Pressable onPress={() => removeCommune(Number(c.id))} hitSlop={10}>
                              <Ionicons name="close" size={16} color={COLORS.textMuted} />
                            </Pressable>
                          ) : null}
                        </View>
                      ))
                    ) : (
                      <Text style={styles.mutedBody}>Aucune commune sélectionnée.</Text>
                    )}
                  </View>

                  <View style={{ height: 10 }} />

                  {!locks.communesLocked ? (
                    <AppSelect
                      title="Ajouter une commune"
                      titleAr="إضافة بلدية"
                      value={null}
                      options={communeOptionsForDay}
                      onChange={(id) => {
                        if (!id) return;
                        addCommune(Number(id));
                      }}
                      allowClear={false}
                    />
                  ) : null}

                  <View style={{ height: SPACING.md }} />

                  {/* Clients */}
                  <View style={styles.rowBetween}>
                    <Text style={styles.blockLabel}>Clients à visiter</Text>
                    {locks.clientsLocked ? (
                      <View style={styles.lockPill}>
                        <Ionicons name="checkmark-circle" size={14} color={COLORS.brand} />
                        <Text style={styles.lockText}>Clients validés</Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.chipsWrap}>
                    {selectedClientsDisplay.length ? (
                      selectedClientsDisplay.map((c) => (
                        <View
                          key={String(c.id)}
                          style={[styles.chip, locks.clientsLocked ? styles.chipLocked : null]}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              locks.clientsLocked ? styles.chipTextLocked : null,
                            ]}
                          >
                            {String(c.id)} - {c.label}
                            {c.subtitle ? ` (${c.subtitle})` : ""}
                          </Text>

                          {!locks.clientsLocked ? (
                            <Pressable onPress={() => removeClient(Number(c.id))} hitSlop={10}>
                              <Ionicons name="close" size={16} color={COLORS.textMuted} />
                            </Pressable>
                          ) : null}
                        </View>
                      ))
                    ) : (
                      <Text style={styles.mutedBody}>Sélectionnez des clients pour ce jour.</Text>
                    )}
                  </View>

                  <View style={{ height: 10 }} />

                  {!locks.clientsLocked ? (
                    <>
                      <AppSelect
                        title="Ajouter un client"
                        titleAr="إضافة عميل"
                        value={null}
                        options={clientOptionsForDay}
                        onChange={(id) => {
                          if (!id) return;
                          addClient(Number(id));
                        }}
                        showId
                        allowClear={false}
                        disabled={draftCommuneIds.length === 0}
                      />

                      <Pressable
                        onPress={() => {
                          if (!selectedUser) return;
                          void ensureClientsLoaded(Number(selectedUser), draftCommuneIds.map(Number));
                        }}
                        disabled={draftCommuneIds.length === 0}
                        style={[
                          styles.smallOutlineBtn,
                          draftCommuneIds.length === 0 ? styles.smallOutlineBtnDisabled : null,
                        ]}
                      >
                        <Ionicons name="refresh" size={16} color={COLORS.text} />
                        <Text style={styles.smallOutlineBtnText}>Charger / Actualiser clients</Text>
                      </Pressable>
                    </>
                  ) : null}

                  <View style={{ height: SPACING.md }} />

                  {/* Tasks */}
                  <View style={styles.rowBetween}>
                    <Text style={styles.blockLabel}>Tâches</Text>
                    {locks.tasksLocked ? (
                      <View style={styles.lockPill}>
                        <Ionicons name="checkmark-circle" size={14} color={COLORS.brand} />
                        <Text style={styles.lockText}>Tâches validées</Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={{ marginTop: 6 }}>
                    {draftTasks.length ? (
                      draftTasks.map((t, idx) => (
                        <View key={`${idx}-${t}`} style={styles.taskRowEdit}>
                          <Text style={styles.taskEditText} numberOfLines={3}>
                            {t}
                          </Text>

                          {!locks.tasksLocked ? (
                            <Pressable onPress={() => removeTask(idx)} hitSlop={10} style={styles.trashBtn}>
                              <Ionicons name="trash-outline" size={18} color={COLORS.textMuted} />
                            </Pressable>
                          ) : null}
                        </View>
                      ))
                    ) : (
                      <Text style={styles.mutedBody}>Aucune tâche.</Text>
                    )}
                  </View>

                  {!locks.tasksLocked ? (
                    <View style={{ marginTop: 10 }}>
                      <View style={styles.taskAddRow}>
                        <TextInput
                          value={taskInput}
                          onChangeText={setTaskInput}
                          placeholder="Ajouter une tâche…"
                          placeholderTextColor={COLORS.textMuted}
                          style={styles.taskInput}
                          onSubmitEditing={addTask}
                          returnKeyType="done"
                        />
                        <Pressable
                          onPress={addTask}
                          style={({ pressed }) => [
                            styles.addTaskBtn,
                            pressed && { opacity: 0.85 },
                            { opacity: taskInput.trim() ? 1 : 0.6 },
                          ]}
                          disabled={!taskInput.trim()}
                        >
                          <Ionicons name="add" size={20} color="#fff" />
                        </Pressable>
                      </View>
                    </View>
                  ) : null}
                </AppCard>
              ) : !dayPayload.plan ? (
                <AppCard>
                  <Text style={styles.emptyTitle}>Aucun plan</Text>
                  <Text style={styles.mutedBody}>
                    Aucun plan trouvé pour le {formatDateFr(parseISODate(selectedDate))}.
                  </Text>
                </AppCard>
              ) : (
                <PlanCard payload={dayPayload} />
              )}
            </>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

/** ---------- Styles ---------- */

const stylesVars = {
  brand: ((COLORS as any).brand ?? "rgba(46, 125, 50, 0.95)") as string,
  brandSoft: ((COLORS as any).brandSoft ?? "rgba(46, 125, 50, 0.12)") as string,
  brandLine: "rgba(46, 125, 50, 1)",
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  body: { flex: 1, padding: SPACING.md },

  filtersCard: { padding: SPACING.lg, marginBottom: SPACING.md },
  filtersTitle: {
    fontSize: TYPO.title,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: SPACING.md,
  },

  gpRow: { flexDirection: "row", marginTop: SPACING.sm },
  gpBtn: {
    flex: 1,
    backgroundColor: COLORS.brand,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
  },
  gpBtnPressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  gpBtnText: { color: "#fff", fontWeight: "900", fontSize: 13 },

  loadingWrap: { marginTop: SPACING.xl, alignItems: "center", gap: 10 },
  mutedBody: { color: COLORS.textMuted, fontSize: TYPO.body },

  errorText: { marginTop: SPACING.md, color: "#B00020", fontWeight: "700" },

  emptyTitle: { fontSize: TYPO.title, fontWeight: "800", color: COLORS.text, marginBottom: 6 },

  sectionTitle: { fontSize: TYPO.body, fontWeight: "900", color: COLORS.text },

  primaryBtn: {
    backgroundColor: COLORS.brand,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "900" },

  secondaryBtn: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: { color: COLORS.text, fontWeight: "900" },

  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },

  blockLabel: { color: COLORS.textMuted, fontWeight: "900", fontSize: TYPO.small, marginBottom: 8 },

  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.cardAlt,
  },
  chipText: { color: COLORS.text, fontWeight: "900", fontSize: 12 },
  chipLocked: { backgroundColor: COLORS.brandSoft, borderColor: "rgba(50,161,55,0.35)" },
  chipTextLocked: { color: (COLORS as any).brandDark ?? COLORS.text },

  lockPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.cardAlt,
  },
  lockText: { color: COLORS.text, fontWeight: "900", fontSize: 12 },

  smallOutlineBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  smallOutlineBtnDisabled: { opacity: 0.5 },
  smallOutlineBtnText: { color: COLORS.text, fontWeight: "900", fontSize: 12 },

  taskAddRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  taskInput: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    backgroundColor: COLORS.card,
    color: COLORS.text,
  },
  addTaskBtn: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.brand,
    alignItems: "center",
    justifyContent: "center",
  },

  taskRowEdit: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  taskEditText: { flex: 1, fontWeight: "800", color: COLORS.text },
  trashBtn: { width: 36, height: 36, borderRadius: 999, alignItems: "center", justifyContent: "center" },

  // PlanCard styles
  cardHeaderRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: SPACING.md },
  cardUser: { fontSize: TYPO.title, fontWeight: "900", color: COLORS.text },
  cardDate: {
    marginTop: 2,
    fontSize: TYPO.small,
    fontWeight: "700",
    color: COLORS.textMuted,
    textTransform: "capitalize",
  },

  cardSemi: { borderWidth: 3, borderColor: "#C0C0C0" },
  cardDep: { borderWidth: 3, borderColor: "#D4AF37" },
  cardHeaderSemi: { padding: 8, borderRadius: RADIUS.md, backgroundColor: "rgba(192,192,192,0.15)" },
  cardHeaderDep: { padding: 8, borderRadius: RADIUS.md, backgroundColor: "rgba(212,175,55,0.18)" },

  validationRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  validationItems: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  validationItem: { alignItems: "center", justifyContent: "center", width: 58 },
  validationDate: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "800",
    color: COLORS.textMuted,
    textAlign: "center",
    lineHeight: 11,
  },
  validationTime: {
    marginTop: 1,
    fontSize: 9,
    fontWeight: "800",
    color: COLORS.textMuted,
    textAlign: "center",
    lineHeight: 10,
  },
  validateBtn: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: stylesVars.brand,
    alignSelf: "flex-start",
  },
  validateBtnText: { color: "#fff", fontWeight: "900", fontSize: 12 },

  visiteListWrap: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    overflow: "hidden",
    backgroundColor: COLORS.card,
  },
  visiteRow: { flexDirection: "row", gap: SPACING.md, padding: SPACING.md, backgroundColor: COLORS.card },
  visiteSeparator: {
    height: 2,
    backgroundColor: stylesVars.brandLine,
    marginHorizontal: SPACING.md,
    marginTop: 2,
    marginBottom: 2,
    borderRadius: 999,
  },
  visiteName: { fontSize: TYPO.body, fontWeight: "900", color: COLORS.text, marginBottom: 4 },
  visiteMeta: { fontSize: TYPO.small, color: COLORS.textMuted, marginTop: 2 },
  visiteMetaStrong: { fontWeight: "900", color: COLORS.text },

  segmentPillWrap: { justifyContent: "flex-start", alignItems: "flex-end" },
  segmentPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: COLORS.border },
  segmentMedical: { backgroundColor: "rgba(46, 125, 50, 0.12)" },
  segmentCommercial: { backgroundColor: "rgba(251, 140, 0, 0.14)" },
  segmentPillText: { fontSize: TYPO.small, fontWeight: "900", color: COLORS.text },

  mapBtn: {
    marginTop: 8,
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: stylesVars.brandSoft,
    borderWidth: 1,
    borderColor: "rgba(46, 125, 50, 0.30)",
  },

  taskRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  taskDot: { width: 10, height: 10, borderRadius: 999, marginTop: 6 },
  taskTodo: { backgroundColor: "rgba(251, 140, 0, 0.9)" },
  taskDone: { backgroundColor: "rgba(46, 125, 50, 0.9)" },
  taskText: { flex: 1, fontSize: TYPO.body, fontWeight: "700", color: COLORS.text },
});
