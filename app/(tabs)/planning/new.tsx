// app/(tabs)/planning/new.tsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { AppHeader } from "../../../src/components/AppHeader";
import { AppCard } from "../../../src/components/AppCard";
import { AppSelect, AppSelectOption } from "../../../src/components/AppSelect";
import { COLORS, SPACING, TYPO, RADIUS, FIELD } from "../../../src/ui/theme";
import { useAuth } from "../../../src/auth/AuthContext";
import { apiGet, apiPost } from "../../../src/api/http";

type ScopedUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
};

type CommuneRow = {
  id: number;
  nom: string;
  wilaya_id?: number;
  wilaya?: { id?: number; nom?: string } | null;
  regions_wilaya?: { id?: number; nom?: string } | null; // fallback
};

type AvailableClientRow = {
  id: number;
  nom?: string;
  name?: string;
  label?: string;
  specialite?: string;
  subtitle?: string;
};

type PlanDayResponse = {
  day: string;
  user?: any;
  plan: null | {
    id: string | number;
    valid_commune?: boolean;
    valid_clients?: boolean;
    valid_tasks?: boolean;
    commune_validation_date?: string | null;
    client_validation_date?: string | null;
    tasks_validation_date?: string | null;
  };
  regions: Array<{
    wilayaId: number;
    wilayaName: string;
    communes: Array<{ id: number; nom: string; label?: string }>;
  }>;
  visites: Array<{
    medecin_id: number;
    nom?: string;
    segment?: string | null;
    classification?: string | null;
  }>;
  tasks: Array<{ task?: string }>;
};

type DayDraft = {
  key: string; // YYYY-MM-DD
  date: Date;

  communeIds: number[];
  clientIds: number[];
  tasks: string[];
  taskInput: string;

  communesLocked?: boolean;
  clientsLocked?: boolean;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function toYMD(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function fmtDateFR(d: Date) {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}
function fmtWeekdayFR(d: Date) {
  const names = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
  return names[d.getDay()] ?? "—";
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function inRangeDaysInclusive(a: Date, b: Date) {
  const s = startOfDay(a);
  const e = startOfDay(b);
  const out: Date[] = [];
  const step = s.getTime() <= e.getTime() ? 1 : -1;
  let cur = s;
  while (true) {
    out.push(new Date(cur));
    if (toYMD(cur) === toYMD(e)) break;
    cur = addDays(cur, step);
    if (out.length > 400) break;
  }
  return step === 1 ? out : out.reverse();
}

export default function PlanningNewScreen() {
  const router = useRouter();
  const { state } = useAuth();
  const didFocusHydrateRef = useRef(false);


  const me = state.status === "signedIn" ? state.user : null;
  const role = (me?.role ?? "Commercial") as "Commercial" | "Superviseur" | "Countrymanager";
  const canPickUser = role === "Countrymanager" || role === "Superviseur";

  // users (scoped)
  const [users, setUsers] = useState<ScopedUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(me?.id ?? null);

  // date range
  const [startDate, setStartDate] = useState<Date>(() => startOfDay(new Date()));
  const [endDate, setEndDate] = useState<Date>(() => startOfDay(new Date()));
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  // communes list (for selection)
  const [communes, setCommunes] = useState<CommuneRow[]>([]);
  const communeOptions: AppSelectOption[] = useMemo(() => {
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

  // per-day drafts
  const [daysByKey, setDaysByKey] = useState<Record<string, DayDraft>>({});
  const [selectedCommunesDisplay, setSelectedCommunesDisplay] = useState<Record<string, AppSelectOption[]>>({});
  const [selectedClientsDisplay, setSelectedClientsDisplay] = useState<Record<string, AppSelectOption[]>>({});

  // available clients cache/options
  const clientsCacheRef = useRef<Record<string, AppSelectOption[]>>({});
  const [availableClientsByDayKey, setAvailableClientsByDayKey] = useState<Record<string, AppSelectOption[]>>({});

  const dayList = useMemo(() => {
    const list = inRangeDaysInclusive(startDate, endDate);
    return list.map((d) => ({ key: toYMD(d), date: d }));
  }, [startDate, endDate]);

  const dayKeysSig = useMemo(() => dayList.map((d) => d.key).join("|"), [dayList]);

  const resetDraftForCurrentRange = useCallback(() => {
  // reset caches
  clientsCacheRef.current = {};
  setAvailableClientsByDayKey({});

  // reset per-day draft + chips
  setDaysByKey(() => {
    const next: Record<string, DayDraft> = {};
    for (const d of dayList) {
      next[d.key] = {
        key: d.key,
        date: d.date,
        communeIds: [],
        clientIds: [],
        tasks: [],
        taskInput: "",
        communesLocked: false,
        clientsLocked: false,
      };
    }
    return next;
  });

  setSelectedCommunesDisplay(() => {
    const next: Record<string, AppSelectOption[]> = {};
    for (const d of dayList) next[d.key] = [];
    return next;
  });

  setSelectedClientsDisplay(() => {
    const next: Record<string, AppSelectOption[]> = {};
    for (const d of dayList) next[d.key] = [];
    return next;
  });
}, [dayList]);


const refreshFromServer = useCallback(async () => {
  if (state.status !== "signedIn") return;
  if (!selectedUserId) return;
  if (!dayList.length) return;

  const userId = selectedUserId;

  // Reset client options cache to avoid stale options after validation changes
  clientsCacheRef.current = {};
  setAvailableClientsByDayKey({});

  const settled = await Promise.allSettled(
    dayList.map((d) => apiGet<PlanDayResponse>(`/plans/day?date=${encodeURIComponent(d.key)}&userId=${userId}`))
  );

  // Build patches
  const dayPatch: Record<string, Partial<DayDraft>> = {};
  const communesDisplayByDay: Record<string, AppSelectOption[]> = {};
  const clientsDisplayByDay: Record<string, AppSelectOption[]> = {};
  const clientFetchNeeded: Array<{ dayKey: string; communeIds: number[]; clientsLocked: boolean }> = [];

  for (let i = 0; i < dayList.length; i++) {
    const dayKey = dayList[i].key;
    const r = settled[i];
    if (r.status !== "fulfilled") continue;

    const payload = r.value;
    const plan = payload?.plan;

    // If no plan exists: keep user's draft, just ensure locks are false
    if (!plan) {
      dayPatch[dayKey] = { communesLocked: false, clientsLocked: false };
      continue;
    }

    const communesLocked = !!(plan.commune_validation_date || plan.valid_commune);
    const clientsLocked = !!(plan.client_validation_date || plan.valid_clients);

    // Communes (from payload.regions)
    const communeIds: number[] = [];
    const communesDisplay: AppSelectOption[] = [];
    for (const g of payload.regions ?? []) {
      for (const c of g.communes ?? []) {
        const id = Number(c.id);
        if (!Number.isFinite(id)) continue;
        communeIds.push(id);
        communesDisplay.push({
          id,
          label: c.nom ?? `Commune #${id}`,
          subtitle: g.wilayaName ?? "—",
          keywords: `${c.nom ?? ""} ${g.wilayaName ?? ""}`.toLowerCase(),
        });
      }
    }

    // Clients (from payload.visites)
    const clientIds: number[] = [];
    const clientsDisplay: AppSelectOption[] = [];
    for (const v of payload.visites ?? []) {
      const id = Number(v.medecin_id);
      if (!Number.isFinite(id)) continue;
      clientIds.push(id);
      clientsDisplay.push({
        id,
        label: v.nom ?? `Client #${id}`,
        subtitle: (v.classification ?? v.segment ?? undefined) || undefined,
        keywords: `${v.nom ?? ""} ${(v.classification ?? v.segment ?? "")}`.toLowerCase(),
      });
    }

    // Tasks
    const tasks = Array.isArray(payload.tasks)
      ? payload.tasks.map((t) => String(t?.task ?? "").trim()).filter(Boolean)
      : [];

    dayPatch[dayKey] = {
      communeIds,
      clientIds,
      tasks,
      taskInput: "",
      communesLocked,
      clientsLocked,
    };

    communesDisplayByDay[dayKey] = communesDisplay;
    clientsDisplayByDay[dayKey] = clientsDisplay;

    if (communeIds.length) {
      clientFetchNeeded.push({ dayKey, communeIds, clientsLocked });
    }
  }

  // Apply patches
  setDaysByKey((prev) => {
    const next = { ...prev };
    for (const [dayKey, patch] of Object.entries(dayPatch)) {
      if (!next[dayKey]) continue;
      next[dayKey] = { ...next[dayKey], ...patch };
    }
    return next;
  });

  setSelectedCommunesDisplay((prev) => {
    const next = { ...prev };
    for (const [dayKey, chips] of Object.entries(communesDisplayByDay)) next[dayKey] = chips;
    return next;
  });

  setSelectedClientsDisplay((prev) => {
    const next = { ...prev };
    for (const [dayKey, chips] of Object.entries(clientsDisplayByDay)) next[dayKey] = chips;
    return next;
  });

  // Load available clients options (needed for adding clients on unlocked days)
  // (also OK to load even when locked; harmless)
  for (const item of clientFetchNeeded) {
    // If clients are locked, dropdown is hidden anyway; still fine to skip to save calls:
    if (item.clientsLocked) continue;
    await ensureClientsLoaded(item.dayKey, userId, item.communeIds);
  }
}, [state.status, selectedUserId, dayList]);


useFocusEffect(
  useCallback(() => {
    refreshFromServer().finally(() => {
      didFocusHydrateRef.current = true;
    });
  }, [refreshFromServer])
);

useEffect(() => {
  // Avoid double call on initial mount (focus already hydrated)
  if (!didFocusHydrateRef.current) return;
  refreshFromServer();
}, [dayKeysSig, selectedUserId, refreshFromServer]);




  // load scoped users
  useEffect(() => {
    if (state.status !== "signedIn") return;
    (async () => {
      try {
        if (!canPickUser) return;
        const res = await apiGet<{ meId: number; users: ScopedUser[] }>("/plans/scope-users");
        setUsers(Array.isArray(res?.users) ? res.users : []);
      } catch {
        setUsers([]);
      }
    })();
  }, [state.status, canPickUser]);

  // load communes
  useEffect(() => {
  if (state.status !== "signedIn") return;
  if (!selectedUserId) return;

  (async () => {
    try {
      const res = await apiGet<{ communes: CommuneRow[] }>(
        `/plans/communes?userId=${encodeURIComponent(String(selectedUserId))}&onlyMine=1`
      );
      setCommunes(Array.isArray(res?.communes) ? res.communes : []);
    } catch {
      setCommunes([]);
    }
  })();
}, [state.status, selectedUserId]);


  // ensure selected user defaults to me
  useEffect(() => {
    if (me?.id && selectedUserId === null) setSelectedUserId(me.id);
  }, [me?.id, selectedUserId]);

  const selectedUserLabel = useMemo(() => {
    if (!selectedUserId) return "—";
    if (me?.id === selectedUserId) {
      return `${me?.first_name ?? ""} ${me?.last_name ?? ""}`.trim() || me?.username || "Moi";
    }
    const u = users.find((x) => x.id === selectedUserId);
    if (!u) return `User #${selectedUserId}`;
    const full = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim();
    return full || u.username || `User #${u.id}`;
  }, [selectedUserId, users, me]);

  const userOptions: AppSelectOption[] = useMemo(() => {
  const opts = users.map((u) => {
    const full = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim();
    return {
      id: u.id,
      label: full || u.username || `User #${u.id}`,
      // ✅ no subtitle
      keywords: `${full} ${u.username ?? ""}`.toLowerCase(),
    };
  });

  if (me?.id && !opts.some((x) => Number(x.id) === me.id)) {
    const full = `${me.first_name ?? ""} ${me.last_name ?? ""}`.trim();
    opts.unshift({
      id: me.id,
      label: full || me.username || `User #${me.id}`,
      // ✅ no subtitle
      keywords: `${full} ${me.username ?? ""}`.toLowerCase(),
    });
  }

  return opts;
}, [users, me]);


  // initialize day drafts when range changes
  useEffect(() => {
    setDaysByKey((prev) => {
      const next: Record<string, DayDraft> = {};
      for (const d of dayList) {
        const existing = prev[d.key];
        next[d.key] =
          existing ??
          ({
            key: d.key,
            date: d.date,
            communeIds: [],
            clientIds: [],
            tasks: [],
            taskInput: "",
            communesLocked: false,
            clientsLocked: false,
          } as DayDraft);

        next[d.key].date = d.date;
      }
      return next;
    });

    // reset displays for new range keys (keep if already exists)
    setSelectedCommunesDisplay((prev) => {
      const next: Record<string, AppSelectOption[]> = {};
      for (const d of dayList) next[d.key] = prev[d.key] ?? [];
      return next;
    });
    setSelectedClientsDisplay((prev) => {
      const next: Record<string, AppSelectOption[]> = {};
      for (const d of dayList) next[d.key] = prev[d.key] ?? [];
      return next;
    });
  }, [dayKeysSig]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateDay = (dayKey: string, patch: Partial<DayDraft>) => {
    setDaysByKey((prev) => {
      const cur = prev[dayKey];
      if (!cur) return prev;
      return { ...prev, [dayKey]: { ...cur, ...patch } };
    });
  };

  const cacheKeyForClients = (userId: number, communeIds: number[]) => {
    const sorted = [...communeIds].sort((a, b) => a - b);
    return `${userId}|${sorted.join(",")}`;
  };

  const ensureClientsLoaded = async (dayKey: string, userId: number, communeIds: number[]) => {
    if (!userId || communeIds.length === 0) {
      setAvailableClientsByDayKey((prev) => ({ ...prev, [dayKey]: [] }));
      return;
    }

    const ck = cacheKeyForClients(userId, communeIds);
    const cached = clientsCacheRef.current[ck];

    if (cached) {
      setAvailableClientsByDayKey((prev) => ({ ...prev, [dayKey]: cached }));
      return;
    }

    try {
      const res = await apiPost<{ clients: AvailableClientRow[] }>(
        "/plans/available-clients",
        undefined,
        { userId, communeIds }
      );

      const raw = Array.isArray(res?.clients) ? res.clients : [];
      const opts: AppSelectOption[] = raw.map((c) => {
        const label = c.label ?? c.nom ?? c.name ?? `Client #${c.id}`;
        const subtitle = c.subtitle ?? c.specialite ?? undefined;
        return {
          id: c.id,
          label,
          subtitle,
          keywords: `${label} ${subtitle ?? ""}`.toLowerCase(),
        };
      });

      clientsCacheRef.current[ck] = opts;
      setAvailableClientsByDayKey((prev) => ({ ...prev, [dayKey]: opts }));
    } catch {
      setAvailableClientsByDayKey((prev) => ({ ...prev, [dayKey]: [] }));
    }
  };

 

  // region selection handlers
  const addCommune = (dayKey: string, communeId: number) => {
    const day = daysByKey[dayKey];
    if (!day || day.communesLocked) return;

    const ids = Array.from(new Set([...(day.communeIds ?? []), communeId]));
    updateDay(dayKey, { communeIds: ids, clientIds: [] });

    const picked = communeOptions.find((o) => String(o.id) === String(communeId));
    setSelectedCommunesDisplay((prev) => {
      const cur = prev[dayKey] ?? [];
      const next = picked ? [...cur.filter((x) => String(x.id) !== String(communeId)), picked] : cur;
      return { ...prev, [dayKey]: next };
    });

    // reset clients chips on region change
    setSelectedClientsDisplay((prev) => ({ ...prev, [dayKey]: [] }));
    setAvailableClientsByDayKey((prev) => ({ ...prev, [dayKey]: [] }));

    if (selectedUserId) {
      void ensureClientsLoaded(dayKey, selectedUserId, ids);
    }
  };

  const removeCommune = (dayKey: string, communeId: number) => {
    const day = daysByKey[dayKey];
    if (!day || day.communesLocked) return;

    const ids = (day.communeIds ?? []).filter((x) => x !== communeId);
    updateDay(dayKey, { communeIds: ids, clientIds: [] });

    setSelectedCommunesDisplay((prev) => {
      const cur = prev[dayKey] ?? [];
      return { ...prev, [dayKey]: cur.filter((x) => String(x.id) !== String(communeId)) };
    });

    setSelectedClientsDisplay((prev) => ({ ...prev, [dayKey]: [] }));
    setAvailableClientsByDayKey((prev) => ({ ...prev, [dayKey]: [] }));

    if (selectedUserId && ids.length) {
      void ensureClientsLoaded(dayKey, selectedUserId, ids);
    }
  };

  // client selection handlers (locked-aware)
  const addClient = (dayKey: string, clientId: number) => {
    const day = daysByKey[dayKey];
    if (!day || day.clientsLocked) return;

    const ids = Array.from(new Set([...(day.clientIds ?? []), clientId]));
    updateDay(dayKey, { clientIds: ids });

    const opts = availableClientsByDayKey[dayKey] ?? [];
    const picked = opts.find((o) => String(o.id) === String(clientId));
    setSelectedClientsDisplay((prev) => {
      const cur = prev[dayKey] ?? [];
      const next = picked ? [...cur.filter((x) => String(x.id) !== String(clientId)), picked] : cur;
      return { ...prev, [dayKey]: next };
    });
  };

  const removeClient = (dayKey: string, clientId: number) => {
    const day = daysByKey[dayKey];
    if (!day || day.clientsLocked) return;

    const ids = (day.clientIds ?? []).filter((x) => x !== clientId);
    updateDay(dayKey, { clientIds: ids });

    setSelectedClientsDisplay((prev) => {
      const cur = prev[dayKey] ?? [];
      return { ...prev, [dayKey]: cur.filter((x) => String(x.id) !== String(clientId)) };
    });
  };

  // tasks
  const addTask = (dayKey: string) => {
    const day = daysByKey[dayKey];
    if (!day) return;
    const t = (day.taskInput ?? "").trim();
    if (!t) return;
    updateDay(dayKey, { tasks: [...(day.tasks ?? []), t], taskInput: "" });
  };

  const removeTask = (dayKey: string, index: number) => {
    const day = daysByKey[dayKey];
    if (!day) return;
    const next = [...(day.tasks ?? [])];
    next.splice(index, 1);
    updateDay(dayKey, { tasks: next });
  };

  const onChangeStart = (e: DateTimePickerEvent, d?: Date) => {
    setShowStartPicker(false);
    if (e.type !== "set" || !d) return;
    const next = startOfDay(d);
    setStartDate(next);
    if (startOfDay(endDate).getTime() < next.getTime()) setEndDate(next);
  };

  const onChangeEnd = (e: DateTimePickerEvent, d?: Date) => {
    setShowEndPicker(false);
    if (e.type !== "set" || !d) return;
    const next = startOfDay(d);
    setEndDate(next);
    if (startOfDay(startDate).getTime() > next.getTime()) setStartDate(next);
  };

  const submit = async () => {
    if (!selectedUserId) {
      Alert.alert("Erreur", "Veuillez sélectionner un utilisateur.");
      return;
    }

    const daysPayload = dayList.map(({ key }) => {
      const d = daysByKey[key];
      return {
        day: key,
        communeIds: d?.communeIds ?? [],
        clientIds: d?.clientIds ?? [],
        tasks: d?.tasks ?? [],
      };
    });

    const missingRegions = daysPayload.filter((x) => (x.communeIds?.length ?? 0) === 0);
    if (missingRegions.length) {
      Alert.alert(
        "Régions manquantes",
        `Veuillez sélectionner au moins une commune pour chaque jour (${missingRegions.length} jour(s) incomplet(s)).`
      );
      return;
    }

    try {
      await apiPost(
        "/plans/bulk-create",
        undefined,
        {
          userId: selectedUserId,
          startDate: toYMD(startDate),
          endDate: toYMD(endDate),
          days: daysPayload,
        }
      );

      Alert.alert("OK", "Planning créé avec succès.", [
        { text: "Fermer", onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert("Erreur", e?.message ?? "Impossible de créer le planning.");
    }
  };

  if (state.status !== "signedIn") {
    return (
      <View style={styles.center}>
        <Text style={{ color: COLORS.textMuted, fontWeight: "800" }}>Non authentifié.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: COLORS.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <AppHeader title="Nouveau planning" titleAr="تخطيط جديد" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.container}>
        <AppCard>
          {canPickUser ? (
            <View style={{ gap: 10 }}>
              <AppSelect
                title="Utilisateur"
                titleAr="المستخدم"
                value={selectedUserId}
                options={userOptions}
                onChange={(id) => {
  const nextId = id ? Number(id) : null;
  if (!nextId) return;
  if (nextId === selectedUserId) return;

  // wipe previous user's draft before switching
  resetDraftForCurrentRange();

  setSelectedUserId(nextId);
}}              
                allowClear={false}
              />
            </View>
          ) : (
            <View style={styles.rowBetween}>
              <Text style={styles.label}>Utilisateur</Text>
              <Text style={styles.valueStrong}>{selectedUserLabel}</Text>
            </View>
          )}

          <View style={{ height: SPACING.md }} />

          <View style={styles.twoCols}>
            <Pressable onPress={() => setShowStartPicker(true)} style={styles.dateField}>
              <Text style={styles.dateLabel}>Début</Text>
              <Text style={styles.dateValue}>{fmtDateFR(startDate)}</Text>
            </Pressable>

            <Pressable onPress={() => setShowEndPicker(true)} style={styles.dateField}>
              <Text style={styles.dateLabel}>Fin</Text>
              <Text style={styles.dateValue}>{fmtDateFR(endDate)}</Text>
            </Pressable>
          </View>

          {showStartPicker ? (
            <DateTimePicker value={startDate} mode="date" display="default" onChange={onChangeStart} />
          ) : null}

          {showEndPicker ? (
            <DateTimePicker value={endDate} mode="date" display="default" onChange={onChangeEnd} />
          ) : null}
        </AppCard>

        <View style={{ height: SPACING.lg }} />
        <Text style={styles.sectionTitle}>Jours ({dayList.length})</Text>

        <View style={{ gap: SPACING.md }}>
          {dayList.map(({ key, date }) => {
            const d = daysByKey[key];

            const communesChips = selectedCommunesDisplay[key] ?? [];
            const clientsChips = selectedClientsDisplay[key] ?? [];

            const availableClients = availableClientsByDayKey[key] ?? [];

            return (
              <AppCard key={key} style={{ padding: SPACING.md }}>
                <View style={styles.rowBetween}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dayTitle}>{selectedUserLabel}</Text>
                    <Text style={styles.daySub}>
                      {fmtWeekdayFR(date)} • {fmtDateFR(date)}
                    </Text>
                  </View>

                  {d?.communesLocked ? (
                    <View style={styles.lockPill}>
                      <Ionicons name="checkmark-circle" size={14} color={COLORS.brand} />
                      <Text style={styles.lockText}>Régions validées</Text>
                    </View>
                  ) : null}
                </View>

                <View style={{ height: SPACING.md }} />

                {/* Communes */}
                <Text style={styles.blockLabel}>Régions (communes)</Text>

                <View style={styles.chipsWrap}>
                  {communesChips.length ? (
                    communesChips.map((c) => (
                      <View
                        key={String(c.id)}
                        style={[
                          styles.chip,
                          d?.communesLocked ? styles.chipLocked : null,
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            d?.communesLocked ? styles.chipTextLocked : null,
                          ]}
                        >
                          {c.subtitle ? `${c.subtitle} • ${c.label}` : c.label}
                        </Text>

                        {!d?.communesLocked ? (
                          <Pressable onPress={() => removeCommune(key, Number(c.id))} hitSlop={10}>
                            <Ionicons name="close" size={16} color={COLORS.textMuted} />
                          </Pressable>
                        ) : null}
                      </View>
                    ))
                  ) : (
                    <Text style={styles.muted}>Aucune commune sélectionnée.</Text>
                  )}
                </View>

                <View style={{ height: 10 }} />

                {/* ✅ If locked: remove dropdown */}
                {!d?.communesLocked ? (
                  <AppSelect
                    title="Ajouter une commune"
                    titleAr="إضافة بلدية"
                    value={null}
                    options={communeOptions}
                    onChange={(id) => {
                      if (!id) return;
                      addCommune(key, Number(id));
                    }}
                    allowClear={false}
                  />
                ) : null}

                <View style={{ height: SPACING.md }} />

                {/* Clients */}
                <View style={styles.rowBetween}>
                  <Text style={styles.blockLabel}>Clients à visiter</Text>
                  {d?.clientsLocked ? (
                    <View style={styles.lockPill}>
                      <Ionicons name="checkmark-circle" size={14} color={COLORS.brand} />
                      <Text style={styles.lockText}>Clients validés</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.chipsWrap}>
                  {clientsChips.length ? (
                    clientsChips.map((c) => (
                      <View
                        key={String(c.id)}
                        style={[
                          styles.chip,
                          d?.clientsLocked ? styles.chipLocked : null,
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            d?.clientsLocked ? styles.chipTextLocked : null,
                          ]}
                        >
                          {String(c.id)} - {c.label}
                          {c.subtitle ? ` (${c.subtitle})` : ""}
                        </Text>

                        {!d?.clientsLocked ? (
                          <Pressable onPress={() => removeClient(key, Number(c.id))} hitSlop={10}>
                            <Ionicons name="close" size={16} color={COLORS.textMuted} />
                          </Pressable>
                        ) : null}
                      </View>
                    ))
                  ) : (
                    <Text style={styles.muted}>Sélectionnez des clients pour ce jour.</Text>
                  )}
                </View>

                <View style={{ height: 10 }} />

                {/* ✅ If locked: remove dropdown + refresh */}
                {!d?.clientsLocked ? (
                  <>
                    <AppSelect
                      title="Ajouter un client"
                      titleAr="إضافة عميل"
                      value={null}
                      options={availableClients}
                      onChange={(id) => {
                        if (!id) return;
                        addClient(key, Number(id));
                      }}
                      showId
                      allowClear={false}
                      disabled={(d?.communeIds?.length ?? 0) === 0}
                    />

                    <Pressable
                      onPress={() => {
                        if (!selectedUserId) return;
                        const communeIds = d?.communeIds ?? [];
                        void ensureClientsLoaded(key, selectedUserId, communeIds);
                      }}
                      disabled={(d?.communeIds?.length ?? 0) === 0}
                      style={[
                        styles.smallBtn,
                        (d?.communeIds?.length ?? 0) === 0 ? styles.smallBtnDisabled : null,
                      ]}
                    >
                      <Ionicons name="refresh" size={16} color={COLORS.text} />
                      <Text style={styles.smallBtnText}>Charger / Actualiser clients</Text>
                    </Pressable>
                  </>
                ) : null}

                <View style={{ height: SPACING.md }} />

                {/* Tasks */}
                <Text style={styles.blockLabel}>Tâches (optionnel)</Text>

                <View style={styles.taskRow}>
                  <TextInput
                    value={d?.taskInput ?? ""}
                    onChangeText={(t) => updateDay(key, { taskInput: t })}
                    placeholder="Ex: récupérer des documents, relancer un dossier…"
                    placeholderTextColor={COLORS.textMuted}
                    style={styles.taskInput}
                  />
                  <Pressable onPress={() => addTask(key)} style={styles.addBtn}>
                    <Ionicons name="add" size={18} color={COLORS.textOnBrand} />
                  </Pressable>
                </View>

                {(d?.tasks ?? []).length ? (
                  <View style={{ marginTop: 10, gap: 8 }}>
                    {d!.tasks.map((t, idx) => (
                      <View key={`${key}-task-${idx}`} style={styles.taskItem}>
                        <Text style={styles.taskText}>{t}</Text>
                        <Pressable onPress={() => removeTask(key, idx)} hitSlop={10}>
                          <Ionicons name="trash" size={18} color={COLORS.danger} />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={[styles.muted, { marginTop: 8 }]}>Aucune tâche.</Text>
                )}
              </AppCard>
            );
          })}
        </View>

        <View style={{ height: SPACING.xl }} />

        <Pressable onPress={submit} style={styles.primaryBtn}>
          <Ionicons name="checkmark-circle" size={20} color={COLORS.textOnBrand} />
          <Text style={styles.primaryBtnText}>Créer planning</Text>
        </Pressable>

        <View style={{ height: 24 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg },
  container: { padding: SPACING.md, paddingBottom: 40, gap: SPACING.md },

  sectionTitle: { fontSize: TYPO.h2, fontWeight: "900", color: COLORS.text },

  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },

  label: { color: COLORS.textMuted, fontWeight: "800", fontSize: TYPO.small },
  valueStrong: { color: COLORS.text, fontWeight: "900" },

  twoCols: { flexDirection: "row", gap: SPACING.md },

  dateField: {
    flex: 1,
    borderWidth: 1,
    borderColor: FIELD.border,
    borderRadius: FIELD.radius,
    backgroundColor: FIELD.bg,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dateLabel: { color: COLORS.textMuted, fontWeight: "800", fontSize: TYPO.small },
  dateValue: { color: COLORS.text, fontWeight: "900", marginTop: 4 },

  dayTitle: { color: COLORS.text, fontWeight: "900", fontSize: 15 },
  daySub: { color: COLORS.textMuted, fontWeight: "800", marginTop: 4, fontSize: TYPO.small },

  blockLabel: { color: COLORS.textMuted, fontWeight: "900", fontSize: TYPO.small, marginBottom: 8 },

  muted: { color: COLORS.textMuted, fontWeight: "800", fontSize: TYPO.small },

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

  // ✅ locked chips (green background)
  chipLocked: {
    backgroundColor: COLORS.brandSoft,
    borderColor: "rgba(50,161,55,0.35)",
  },
  chipTextLocked: {
    color: COLORS.brandDark,
  },

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

  smallBtn: {
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
  smallBtnDisabled: { opacity: 0.5 },
  smallBtnText: { color: COLORS.text, fontWeight: "900", fontSize: 12 },

  taskRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  taskInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: FIELD.border,
    borderRadius: FIELD.radius,
    backgroundColor: FIELD.bg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    fontWeight: "800",
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 999,
    backgroundColor: COLORS.brand,
    alignItems: "center",
    justifyContent: "center",
  },

  taskItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  taskText: { flex: 1, color: COLORS.text, fontWeight: "800" },

  primaryBtn: {
    backgroundColor: COLORS.brand,
    borderRadius: RADIUS.lg,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  primaryBtnText: { color: COLORS.textOnBrand, fontWeight: "900", fontSize: 15 },
});
