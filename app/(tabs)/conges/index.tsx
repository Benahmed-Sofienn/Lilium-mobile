// app/(tabs)/conges/index.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets, SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Calendar, DateData } from "react-native-calendars";

import { useAuth } from "../../../src/auth/AuthContext";
import { api } from "../../../src/api/client";

import { AppHeader } from "../../../src/components/AppHeader";
import { AppCard } from "../../../src/components/AppCard";
import { PickerField } from "../../../src/components/PickerField";
import { COLORS, SPACING, TYPO } from "../../../src/ui/theme";

type UserRole = "Commercial" | "Superviseur" | "Countrymanager";

type RefUser = {
  id: number;
  first_name: string;
  last_name: string;
  role?: UserRole | string;
};

type CaItem = {
  id: number | string;

  // backend variants (robust)
  user_id?: number | null;
  userId?: number | null;
  user?: { id?: number | null; first_name?: string; last_name?: string } | null;

  first_name?: string;
  last_name?: string;

  type?: string; // "Absence", "Congé"...
  status?: "WAITING" | "ACCEPTED" | "REFUSED" | string;

  date: string; // ISO
  endDate?: string | null;

  description?: string | null;
};

type ReferentielsResponse = {
  users: RefUser[];
  scope?: { hasUnderusers?: boolean; canSeeAll?: boolean; role?: string };
};

function norm(s?: string) {
  return String(s || "").trim().toLowerCase();
}

function isSupervisor(role?: string) {
  return norm(role) === "superviseur";
}
function isCountryManager(role?: string) {
  return norm(role) === "countrymanager";
}

function toYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}
function isoToYMD(iso: string) {
  const d = new Date(iso);
  return toYMD(d);
}
function isSameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function isAbsenceType(type?: string) {
  const t = norm(type);
  return t.includes("absence") || t.startsWith("abs");
}

function statusKey(status?: string): "green" | "yellow" | "red" {
  const s = String(status || "").toUpperCase();
  if (s === "ACCEPTED" || s === "APPROVED") return "green";
  if (s === "REFUSED" || s === "REJECTED") return "red";
  return "yellow";
}
function statusLabel(status?: string) {
  const s = String(status || "").toUpperCase();
  if (s === "ACCEPTED" || s === "APPROVED") return "Accepté";
  if (s === "REFUSED" || s === "REJECTED") return "Refusé";
  return "En attente";
}

function caUrl(path: string) {
  return `/conges-absences${path}`;
}

function getItemUserId(it: CaItem): number | null {
  const a = typeof it.user_id === "number" ? it.user_id : null;
  if (a) return a;

  const b = typeof it.userId === "number" ? it.userId : null;
  if (b) return b;

  const c = typeof it.user?.id === "number" ? it.user?.id : null;
  if (c) return c;

  return null;
}

export default function CongesIndex() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state } = useAuth();

  const me = state.status === "signedIn" ? (state.user as any) : null;
  const role = me?.role as string | undefined;

  const today = new Date();

  const [viewMonth, setViewMonth] = useState<Date>(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState<string>(toYMD(today));

  const [users, setUsers] = useState<RefUser[]>([]);
  const [items, setItems] = useState<CaItem[]>([]);

  // IMPORTANT: PickerField is string-only
  const [selectedUserKey, setSelectedUserKey] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canSeeAll = !!me && isCountryManager(role);
  const canPickUser = !!me && (isSupervisor(role) || isCountryManager(role));

  const meLabel = useMemo(() => {
    const fn = (me as any)?.first_name;
    const ln = (me as any)?.last_name;
    const full = `${fn || ""} ${ln || ""}`.trim();
    return full || (me as any)?.username || "Moi";
  }, [me]);

  // Default dropdown = connected user (by name, like others)
  useEffect(() => {
    if (!me?.id) return;
    if (!selectedUserKey) setSelectedUserKey(String(me.id));
  }, [me?.id, selectedUserKey]);

  // effectiveUserId is ALWAYS a number (we removed "Tous")
  const effectiveUserId = useMemo(() => {
    if (!me?.id) return null;
    const n = Number(selectedUserKey);
    if (Number.isFinite(n) && n > 0) return n;
    return Number(me.id);
  }, [me?.id, selectedUserKey]);

  // Build a quick map for user names
  const nameById = useMemo(() => {
    const map = new Map<number, string>();
    if (me?.id) map.set(Number(me.id), meLabel);
    users.forEach((u) => {
      const full = `${u.first_name || ""} ${u.last_name || ""}`.trim();
      if (u?.id && full) map.set(u.id, full);
    });
    return map;
  }, [users, me?.id, meLabel]);

  const selectedUserLabel = useMemo(() => {
    if (!me?.id || effectiveUserId === null) return "";
    return nameById.get(effectiveUserId) || `User #${effectiveUserId}`;
  }, [me?.id, effectiveUserId, nameById]);

  const userPickerItems = useMemo(() => {
    if (!me?.id) return [];

    // NOTE: we removed "Tous"
    const base: { label: string; value: string }[] = [{ label: meLabel, value: String(me.id) }];

    const others = users
      .filter((u) => u.id !== Number(me.id))
      .map((u) => ({
        label: `${u.first_name} ${u.last_name}`.trim(),
        value: String(u.id),
      }));

    // Countrymanager gets all users from referentiels; superviseur should already be scoped by backend.
    return [...base, ...others];
  }, [users, me?.id, meLabel]);

  const canGoNext = useMemo(() => !isSameMonth(viewMonth, today), [viewMonth, today]);

  const onPrevMonth = () => setViewMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const onNextMonth = () => {
    if (!canGoNext) return;
    setViewMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  };

  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    if (!me?.id) return;
    if (effectiveUserId === null) return;

    const seq = ++loadSeq.current;
    setLoading(true);
    setErrorMsg(null);

    try {
      const refs = await api.get(caUrl("/referentiels"));
      if (seq !== loadSeq.current) return;

      const refsData = refs.data as ReferentielsResponse;
      setUsers(Array.isArray(refsData?.users) ? refsData.users : []);

      const month = viewMonth.getMonth() + 1;
      const year = viewMonth.getFullYear();

      // Always query by userId (since we removed "Tous")
      const listRes = await api.get(
        caUrl(`/list?month=${month}&year=${year}&userId=${encodeURIComponent(String(effectiveUserId))}`)
      );
      if (seq !== loadSeq.current) return;

      const list = Array.isArray(listRes.data) ? (listRes.data as CaItem[]) : [];
      setItems(list);

      // Keep selected day inside the current month
      const startOfMonth = new Date(year, month - 1, 1);
      const endOfMonth = new Date(year, month, 0);
      const d = new Date(`${selectedDay}T00:00:00`);
      if (d < startOfMonth || d > endOfMonth) setSelectedDay(toYMD(startOfMonth));
    } catch (e: any) {
      setErrorMsg(e?.message || "Erreur de chargement");
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [me?.id, effectiveUserId, viewMonth, selectedDay]);

  useEffect(() => {
    load();
  }, [load]);

  const monthLabel = useMemo(() => {
    const m = viewMonth.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    return m.charAt(0).toUpperCase() + m.slice(1);
  }, [viewMonth]);

  const onDayPress = (day: DateData) => setSelectedDay(day.dateString);

  // Details list: items overlapping selectedDay
  const dayItems = useMemo(() => {
    const target = new Date(`${selectedDay}T00:00:00`);

    return items
      .filter((it) => {
        const start = new Date(`${isoToYMD(it.date)}T00:00:00`);
        const end = new Date(`${isoToYMD(it.endDate || it.date)}T00:00:00`);
        return target >= start && target <= end;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [items, selectedDay]);

  // Calendar marking with linked consecutive days (period)
  const markedDates = useMemo(() => {
    const monthStart = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const monthEnd = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0);

    const HEX = {
      green: COLORS.brand,     // congé accepté
      yellow: "#F59E0B",       // congé en attente
      red: "#DC2626",          // absence (et refus)
    } as const;

    const priority = (k: "green" | "yellow" | "red") => (k === "red" ? 3 : k === "yellow" ? 2 : 1);

    // 1) best color per day (red > yellow > green)
    const dayMap: Record<string, { key: "green" | "yellow" | "red"; p: number }> = {};

    for (const it of items) {
      const start = isoToYMD(it.date);
      const end = it.endDate ? isoToYMD(it.endDate) : start;

      const s = new Date(`${start}T00:00:00`);
      const e = new Date(`${end}T00:00:00`);

      const isAbs = isAbsenceType(it.type);
      const key: "green" | "yellow" | "red" = isAbs ? "red" : statusKey(it.status);

      for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
        if (d < monthStart || d > monthEnd) continue;

        const ymd = toYMD(d);
        const p = priority(key);

        const cur = dayMap[ymd];
        if (!cur || p > cur.p) dayMap[ymd] = { key, p };
      }
    }

    const addDays = (ymd: string, delta: number) => {
      const dt = new Date(`${ymd}T00:00:00`);
      dt.setDate(dt.getDate() + delta);
      return toYMD(dt);
    };

    // 2) build linked "period" segments
    const out: Record<string, any> = {};
    const cur = new Date(monthStart);

    while (cur <= monthEnd) {
      const ymd = toYMD(cur);
      const info = dayMap[ymd];

      if (info) {
        const prev = addDays(ymd, -1);
        const next = addDays(ymd, +1);

        const prevSame = dayMap[prev]?.key === info.key;
        const nextSame = dayMap[next]?.key === info.key;

        out[ymd] = {
          startingDay: !prevSame,
          endingDay: !nextSame,
          color: HEX[info.key],
          textColor: "#FFFFFF",
        };
      }

      cur.setDate(cur.getDate() + 1);
    }

    // 3) selected day highlight only if not already colored
    if (!out[selectedDay]) {
      out[selectedDay] = {
        selected: true,
        selectedColor: "rgba(16,24,40,0.12)",
        selectedTextColor: COLORS.text,
      };
    }

    return out;
  }, [items, viewMonth, selectedDay]);

  const legend = (
    <View style={styles.legendRow}>
      <View style={styles.legendItem}>
        <View style={[styles.legendDot, { backgroundColor: "#DC2626" }]} />
        <Text style={styles.legendText}>Absence</Text>
      </View>

      <View style={styles.legendItem}>
        <View style={[styles.legendDot, { backgroundColor: COLORS.brand }]} />
        <Text style={styles.legendText}>Congé accepté</Text>
      </View>

      <View style={styles.legendItem}>
        <View style={[styles.legendDot, { backgroundColor: "#F59E0B" }]} />
        <Text style={styles.legendText}>Congé en attente</Text>
      </View>
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: "Congés / Absences", headerShown: false }} />

      <View style={styles.root}>
        <AppHeader
          title="Congés / Absences"
          titleAr="الإجازات / الغيابات"
          onBack={() => router.back()}
        />

        {/* bottom safe area + scroll */}
        <SafeAreaView edges={["bottom"]} style={styles.safeBody}>
          <FlatList
            data={dayItems}
            keyExtractor={(it) => String(it.id)}
            contentContainerStyle={{
              padding: SPACING.md,
              paddingBottom: (insets.bottom || 0) + SPACING.xl,
            }}
            ListHeaderComponent={
              <View style={{ gap: SPACING.md }}>
                {/* Filters */}
                <AppCard>
                  <Text style={styles.sectionTitle}>Filtres</Text>

                  {canPickUser ? (
                    <PickerField
                      label="Afficher pour"
                      value={selectedUserKey || (me?.id ? String(me.id) : "")}
                      items={userPickerItems}
                      onChange={(v) => setSelectedUserKey(String(v))}
                    />
                  ) : (
                    <View style={styles.readonlyRow}>
                      <Text style={styles.readonlyLabel}>Afficher pour</Text>
                      <Text style={styles.readonlyValue}>{meLabel}</Text>
                    </View>
                  )}
                </AppCard>

                {/* Month nav */}
                <AppCard style={styles.monthCard}>
                  <Pressable onPress={onPrevMonth} style={styles.monthBtn}>
                    <Ionicons name="chevron-back" size={18} color={COLORS.text} />
                  </Pressable>

                  <View style={{ flex: 1, alignItems: "center" }}>
                    <Text style={styles.monthLabel}>{monthLabel}</Text>
                    <Text style={styles.monthSub}>{selectedUserLabel}</Text>
                  </View>

                  <Pressable
                    onPress={onNextMonth}
                    style={[styles.monthBtn, !canGoNext && { opacity: 0.35 }]}
                    disabled={!canGoNext}
                  >
                    <Ionicons name="chevron-forward" size={18} color={COLORS.text} />
                  </Pressable>
                </AppCard>

                {/* Calendar */}
                <AppCard style={{ padding: 0, overflow: "hidden" }}>
                  <Calendar
                    current={toYMD(viewMonth)}
                    onDayPress={onDayPress}
                    onMonthChange={(m) => setViewMonth(new Date(m.year, m.month - 1, 1))}
                    markingType="period"
                    markedDates={markedDates}
                    theme={{
                      calendarBackground: COLORS.card,
                      backgroundColor: COLORS.card,
                      textSectionTitleColor: COLORS.textMuted,
                      dayTextColor: COLORS.text,
                      todayTextColor: COLORS.text,
                      monthTextColor: COLORS.text,
                      arrowColor: COLORS.text,
                      selectedDayBackgroundColor: COLORS.text,
                      selectedDayTextColor: "#FFFFFF",
                      textDayFontWeight: "700",
                      textMonthFontWeight: "900",
                      textDayHeaderFontWeight: "800",
                    }}
                  />
                </AppCard>

                {legend}

                {loading ? (
                  <AppCard style={styles.centerBox}>
                    <ActivityIndicator />
                    <Text style={styles.mutedText}>Chargement…</Text>
                  </AppCard>
                ) : errorMsg ? (
                  <AppCard style={styles.errorBox}>
                    <Text style={styles.errorText}>{errorMsg}</Text>
                    <Pressable onPress={load} style={styles.retryBtn}>
                      <Text style={styles.retryText}>Réessayer</Text>
                    </Pressable>
                  </AppCard>
                ) : null}

                {/* Details header */}
                <AppCard>
                  <View style={styles.detailsHeader}>
                    <Text style={styles.sectionTitle}>Détails</Text>
                    <Text style={styles.detailsMeta}>
                      {selectedDay} • {selectedUserLabel}
                    </Text>
                  </View>
                </AppCard>
              </View>
            }
            ListEmptyComponent={
              <AppCard style={{ marginTop: SPACING.md }}>
                <Text style={styles.mutedText}>Aucune demande ce jour.</Text>
              </AppCard>
            }
            renderItem={({ item }) => {
              const isAbs = isAbsenceType(item.type);
              const key = isAbs ? "red" : statusKey(item.status);

              const color =
                key === "green" ? COLORS.brand : key === "yellow" ? "#F59E0B" : "#DC2626";

              const uid = getItemUserId(item);
              const userName =
                (item.first_name || item.last_name)
                  ? `${item.first_name || ""} ${item.last_name || ""}`.trim()
                  : (item.user?.first_name || item.user?.last_name)
                    ? `${item.user?.first_name || ""} ${item.user?.last_name || ""}`.trim()
                    : uid
                      ? (nameById.get(uid) || `User #${uid}`)
                      : "User #?";

              const start = isoToYMD(item.date);
              const end = item.endDate ? isoToYMD(item.endDate) : start;

              return (
                <AppCard style={styles.itemCard}>
                  <View style={styles.itemRow}>
                    <View style={[styles.badge, { backgroundColor: color }]} />

                    <View style={{ flex: 1, gap: 8 }}>
                      <View style={styles.itemTop}>
                        <Text style={styles.itemTitle}>
                          {item.type || (isAbs ? "Absence" : "Congé")}
                        </Text>

                        <View style={[styles.statusPill, { borderColor: color }]}>
                          <Text style={[styles.statusPillText, { color }]}>
                            {isAbs ? "Absence" : statusLabel(item.status)}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.metaGrid}>
                        <Text style={styles.metaLine}>
                          <Text style={styles.metaKey}>Pour : </Text>
                          <Text style={styles.metaVal}>{userName}</Text>
                        </Text>

                        <Text style={styles.metaLine}>
                          <Text style={styles.metaKey}>Du : </Text>
                          <Text style={styles.metaVal}>{start}</Text>
                        </Text>

                        <Text style={styles.metaLine}>
                          <Text style={styles.metaKey}>Au : </Text>
                          <Text style={styles.metaVal}>{end}</Text>
                        </Text>

                        {!isAbs ? (
                          <Text style={styles.metaLine}>
                            <Text style={styles.metaKey}>Statut : </Text>
                            <Text style={styles.metaVal}>{statusLabel(item.status)}</Text>
                          </Text>
                        ) : null}
                      </View>

                      {item.description ? (
                        <Text style={styles.desc} numberOfLines={4}>
                          {item.description}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </AppCard>
              );
            }}
          />
        </SafeAreaView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  safeBody: { flex: 1, backgroundColor: COLORS.bg },

  sectionTitle: {
    fontSize: TYPO.h2,
    fontWeight: "900",
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },

  monthCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
  },
  monthBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  monthLabel: {
    fontSize: 16,
    fontWeight: "900",
    color: COLORS.text,
  },
  monthSub: {
    marginTop: 2,
    fontSize: TYPO.small,
    fontWeight: "800",
    color: COLORS.textMuted,
  },

  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.md,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  legendDot: { width: 10, height: 10, borderRadius: 999 },
  legendText: { fontSize: TYPO.small, fontWeight: "800", color: COLORS.textMuted },

  centerBox: { alignItems: "center", gap: 8 },
  mutedText: { color: COLORS.textMuted, fontWeight: "800" },

  errorBox: { borderWidth: 1, borderColor: "rgba(220,38,38,0.35)" },
  errorText: { color: "#B91C1C", fontWeight: "900", marginBottom: 10 },
  retryBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: COLORS.text,
  },
  retryText: { color: "#FFF", fontWeight: "900" },

  detailsHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  detailsMeta: { fontSize: TYPO.small, fontWeight: "800", color: COLORS.textMuted },

  readonlyRow: {
    height: 52,
    borderRadius: 14,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  readonlyLabel: { fontSize: TYPO.small, fontWeight: "800", color: COLORS.textMuted },
  readonlyValue: { fontSize: TYPO.body, fontWeight: "900", color: COLORS.text },

  itemCard: { marginTop: SPACING.md },
  itemRow: { flexDirection: "row", gap: SPACING.md },
  badge: { width: 10, borderRadius: 10 },

  itemTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  itemTitle: { flex: 1, fontWeight: "900", color: COLORS.text, fontSize: TYPO.body },

  statusPill: {
    borderWidth: 2,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: COLORS.card,
  },
  statusPillText: { fontWeight: "900", fontSize: 12 },

  metaGrid: { gap: 4 },
  metaLine: { color: COLORS.textMuted, fontWeight: "800" },
  metaKey: { color: COLORS.textMuted, fontWeight: "900" },
  metaVal: { color: COLORS.text, fontWeight: "900" },

  desc: { marginTop: 4, color: COLORS.textMuted, fontWeight: "800" },
});
