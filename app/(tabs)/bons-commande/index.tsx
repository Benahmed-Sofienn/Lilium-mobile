import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";

import { api } from "../../../src/api/client";
import { useAuth } from "../../../src/auth/AuthContext";

import { COLORS, RADIUS, SPACING, TYPO } from "../../../src/ui/theme";
import { AppHeader } from "../../../src/components/AppHeader";
import { AppCard } from "../../../src/components/AppCard";

type UserRole = "Commercial" | "Superviseur" | "Countrymanager";
type ScopeUser = { id: number; label: string };

type BonCommandeItem = {
  id: number;
  delegue: string;
  dateAjout: string; // YYYY-MM-DD
  heureAjout: string; // HH:mm
  status: "initial" | "confirme" | "en cours" | "traite" | string;
  clientType: string;
  clientName: string;
  produits: string;
  observation?: string | null;
  flag?: boolean;
};

type ListResponse = BonCommandeItem[] | { items: BonCommandeItem[]; nextCursor: number | null };

const STATUS_STEPS = ["initial", "confirme", "en cours", "traite"] as const;

const b = (fr: string, ar: string) => `${fr} | ${ar}`;

function statusAr(s: string) {
  switch (s) {
    case "initial":
      return "أولي";
    case "confirme":
      return "مؤكّد";
    case "en cours":
      return "جارٍ";
    case "traite":
      return "مُعالج";
    default:
      return "حالة";
  }
}

function ymdFromDate(d: Date) {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatFRDate(d: Date) {
  const dd = `${d.getDate()}`.padStart(2, "0");
  const mm = `${d.getMonth() + 1}`.padStart(2, "0");
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

function renderProduitsWithCounts(text: string) {
  const parts: Array<{ t: string; count?: boolean }> = [];
  let i = 0;
  const re = /\((\d+)\)/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    const start = m.index;
    const end = re.lastIndex;
    if (start > i) parts.push({ t: text.slice(i, start) });
    parts.push({ t: m[0], count: true });
    i = end;
  }
  if (i < text.length) parts.push({ t: text.slice(i) });

  return (
    <Text style={styles.tableValue} numberOfLines={3}>
      {parts.map((p, idx) => (
        <Text key={idx} style={p.count ? styles.countBadge : undefined}>
          {p.t}
        </Text>
      ))}
    </Text>
  );
}

function SelectModal(props: {
  visible: boolean;
  title: string;
  placeholderSearch?: string;
  items: Array<{ key: string; label: string }>;
  onClose: () => void;
  onPick: (key: string) => void;
  searchable?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!props.visible) setQ("");
  }, [props.visible]);

  const filtered = useMemo(() => {
    if (!props.searchable) return props.items;
    const qq = q.trim().toLowerCase();
    if (!qq) return props.items;
    return props.items.filter((x) => x.label.toLowerCase().includes(qq));
  }, [props.items, props.searchable, q]);

  return (
    <Modal visible={props.visible} transparent animationType="slide" onRequestClose={props.onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalSheet, { paddingBottom: Math.max(12, insets.bottom) }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{props.title}</Text>
            <Pressable onPress={props.onClose} hitSlop={10} style={styles.modalCloseBtn}>
              <Ionicons name="close" size={22} color={COLORS.text} />
            </Pressable>
          </View>

          {props.searchable && (
            <View style={styles.modalSearchRow}>
              <Ionicons name="search" size={18} color={COLORS.textMuted} />
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder={props.placeholderSearch || b("Rechercher...", "بحث...")}
                placeholderTextColor={COLORS.textMuted}
                style={styles.modalSearch}
                autoCorrect={false}
                autoCapitalize="none"
              />
            </View>
          )}

          <FlatList
            data={filtered}
            keyExtractor={(it) => it.key}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable style={styles.modalItem} onPress={() => props.onPick(item.key)}>
                <Text style={styles.modalItemText}>{item.label}</Text>
              </Pressable>
            )}
            ItemSeparatorComponent={() => <View style={styles.modalSep} />}
          />
        </View>
      </View>
    </Modal>
  );
}

export default function BonsCommandeIndex() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state } = useAuth();

  const rawRole =
    state.status === "signedIn"
      ? ((state.user as any)?.role ?? (state.user as any)?.rolee ?? (state.user as any)?.userRole)
      : undefined;

  const roleKey = String(rawRole || "").toLowerCase().replace(/\s+/g, "");
  const showUserFilter = roleKey === "countrymanager" || roleKey === "superviseur";

  // Default dates:
  // du = 1st of current month, au = today
  const [dateFrom, setDateFrom] = useState<Date>(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });
  const [dateTo, setDateTo] = useState<Date>(() => new Date());

  // Filters
  const [selectedUser, setSelectedUser] = useState<ScopeUser | null>(null); // null = Tous
  const [status, setStatus] = useState<string | null>(null); // null = Tous

  // User modal (server-backed search)
  const [userModalVisible, setUserModalVisible] = useState(false);
  const [userQuery, setUserQuery] = useState("");
  const [scopeUsers, setScopeUsers] = useState<ScopeUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const userSearchTimer = useRef<any>(null);

  // Status modal
  const [statusModalVisible, setStatusModalVisible] = useState(false);

  // iOS date modal
  const [iosPicker, setIosPicker] = useState<{ visible: boolean; target: "from" | "to" }>({
    visible: false,
    target: "from",
  });

  // List state
  const [items, setItems] = useState<BonCommandeItem[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loadingFirst, setLoadingFirst] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const statusOptions = useMemo(
    () => [
      { key: "all", label: b("Tous", "الكل") },
      { key: "initial", label: b("initial", statusAr("initial")) },
      { key: "confirme", label: b("confirme", statusAr("confirme")) },
      { key: "en cours", label: b("en cours", statusAr("en cours")) },
      { key: "traite", label: b("traite", statusAr("traite")) },
    ],
    []
  );

  const statusDisplay = useMemo(() => {
    if (!status) return b("Tous", "الكل");
    return b(status, statusAr(status));
  }, [status]);

  const fetchScopeUsers = useCallback(
    async (q: string) => {
      if (!showUserFilter) return;
      setLoadingUsers(true);
      try {
        const res = await api.get("/bons-commande/scope-users", {
          params: { q, limit: 100 },
        });
        const arr = Array.isArray(res.data) ? (res.data as ScopeUser[]) : [];
        setScopeUsers(arr);
      } finally {
        setLoadingUsers(false);
      }
    },
    [showUserFilter]
  );

  const buildListParams = useCallback(
    (cursor?: number | null) => {
      const params: any = {
        limit: 10,
        startDate: ymdFromDate(dateFrom),
        endDate: ymdFromDate(dateTo),
      };

      if (cursor) params.cursor = cursor;

      if (showUserFilter) {
        params.selectedUserId = selectedUser?.id ? selectedUser.id : 0; // null => Tous
      }

      if (status) params.status = status; // null => Tous

      return params;
    },
    [dateFrom, dateTo, selectedUser, showUserFilter, status]
  );

  const parseListResponse = (data: ListResponse) => {
    if (Array.isArray(data)) {
      return { items: data, nextCursor: data.length ? data[data.length - 1].id : null };
    }
    return { items: data.items || [], nextCursor: data.nextCursor ?? null };
  };

  const fetchFirstPage = useCallback(async () => {
    setLoadingFirst(true);
    try {
      const res = await api.get("/bons-commande/list", { params: buildListParams(null) });
      const parsed = parseListResponse(res.data);
      setItems(parsed.items);
      setNextCursor(parsed.nextCursor);
    } finally {
      setLoadingFirst(false);
    }
  }, [buildListParams]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await api.get("/bons-commande/list", { params: buildListParams(null) });
      const parsed = parseListResponse(res.data);
      setItems(parsed.items);
      setNextCursor(parsed.nextCursor);
    } finally {
      setRefreshing(false);
    }
  }, [buildListParams]);

  const fetchMore = useCallback(async () => {
    if (loadingMore) return;
    if (!nextCursor) return;

    setLoadingMore(true);
    try {
      const res = await api.get("/bons-commande/list", { params: buildListParams(nextCursor) });
      const parsed = parseListResponse(res.data);

      if (parsed.items.length > 0) {
        setItems((prev) => [...prev, ...parsed.items]);
        setNextCursor(parsed.nextCursor);
      } else {
        setNextCursor(null);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [buildListParams, loadingMore, nextCursor]);

  // Initial load
  useEffect(() => {
    if (state.status !== "signedIn") return;
    fetchFirstPage();
  }, [state.status, fetchFirstPage]);

  // When opening user modal, load users (empty query)
  useEffect(() => {
    if (!userModalVisible) return;
    fetchScopeUsers(userQuery.trim());
  }, [userModalVisible, fetchScopeUsers]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced server search for users
  useEffect(() => {
    if (!userModalVisible) return;
    if (userSearchTimer.current) clearTimeout(userSearchTimer.current);
    userSearchTimer.current = setTimeout(() => {
      fetchScopeUsers(userQuery.trim());
    }, 250);
    return () => {
      if (userSearchTimer.current) clearTimeout(userSearchTimer.current);
    };
  }, [userQuery, userModalVisible, fetchScopeUsers]);

  const openDatePicker = (target: "from" | "to") => {
    if (Platform.OS === "android") {
      const current = target === "from" ? dateFrom : dateTo;
      DateTimePickerAndroid.open({
        value: current,
        mode: "date",
        is24Hour: true,
        onChange: (_e: DateTimePickerEvent, d?: Date) => {
          if (!d) return;
          if (target === "from") {
            setDateFrom(d);
            if (d > dateTo) setDateTo(d);
          } else {
            setDateTo(d);
            if (d < dateFrom) setDateFrom(d);
          }
        },
      });
    } else {
      setIosPicker({ visible: true, target });
    }
  };

  const Card = ({ item }: { item: BonCommandeItem }) => {
    const activeIdx = STATUS_STEPS.findIndex((s) => s === item.status);

    return (
      <AppCard style={{ marginBottom: SPACING.md }}>
        <View style={styles.cardTopRow}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={styles.cardDelegue} numberOfLines={1}>
              {item.delegue}
            </Text>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {b("Bon de Commande N°", "أمر شراء رقم")} {item.id}
            </Text>
            <Text style={styles.cardMeta} numberOfLines={1}>
              {b("Ajouté le", "أضيف في")} : {item.dateAjout} {item.heureAjout}
            </Text>
          </View>

          <Pressable hitSlop={10} onPress={() => {}} style={styles.infoBtn}>
            <Ionicons name="information-circle-outline" size={22} color={COLORS.textMuted} />
          </Pressable>
        </View>

        <View style={styles.statusRow}>
          {STATUS_STEPS.map((s, idx) => {
            const isActive = idx === activeIdx;
            const isDone = activeIdx >= 0 && idx < activeIdx;

            return (
              <View key={s} style={styles.statusStepWrap}>
                <View
                  style={[
                    styles.statusPill,
                    isActive && styles.statusPillActive,
                    isDone && styles.statusPillDone,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusPillText,
                      (isActive || isDone) && styles.statusPillTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {b(s, statusAr(s))}
                  </Text>
                </View>
                {idx < STATUS_STEPS.length - 1 && (
                  <Ionicons
                    name="arrow-forward"
                    size={14}
                    color={COLORS.textMuted}
                    style={{ marginHorizontal: 6 }}
                  />
                )}
              </View>
            );
          })}
        </View>

        <View style={styles.table}>
          <View style={styles.tableRow}>
            <Text style={styles.tableKey} numberOfLines={1}>
              {item.clientType}
            </Text>
            <Text style={styles.tableValue} numberOfLines={1}>
              {item.clientName}
            </Text>
          </View>

          <View style={styles.tableRowAlt}>
            <Text style={styles.tableKey} numberOfLines={1}>
              {b("Produits", "المنتجات")}
            </Text>
            {renderProduitsWithCounts(item.produits || "")}
          </View>
        </View>

        {item.observation && item.observation !== "undefined" ? (
          <Text style={styles.obs} numberOfLines={2}>
            {b("Observation", "ملاحظة")} : {item.observation}
          </Text>
        ) : null}
      </AppCard>
    );
  };

  const userItemsForModal = useMemo(() => {
    const base = scopeUsers.map((u) => ({ key: String(u.id), label: u.label }));
    return [{ key: "0", label: b("Tous", "الكل") }, ...base];
  }, [scopeUsers]);

  const statusItemsForModal = useMemo(() => {
    return statusOptions.map((x) => ({ key: x.key, label: x.label }));
  }, [statusOptions]);

  const FiltersHeader = (
    <View style={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.md }}>
      <AppCard>
        {showUserFilter && (
          <>
            <Text style={styles.filterLabel}>{b("Choisir un utilisateur", "اختيار مستخدم")}</Text>
            <Pressable style={styles.field} onPress={() => setUserModalVisible(true)}>
              <Text style={styles.fieldText} numberOfLines={1}>
                {selectedUser?.label || b("Tous", "الكل")}
              </Text>
              <Ionicons name="chevron-down" size={18} color={COLORS.textMuted} />
            </Pressable>

            <View style={{ height: SPACING.md }} />
          </>
        )}

        <View style={styles.row3}>
          <View style={{ flex: 1 }}>
            <Text style={styles.filterLabelSmall}>{b("Du", "من")}</Text>
            <Pressable style={styles.field} onPress={() => openDatePicker("from")}>
              <Text style={styles.fieldText}>{formatFRDate(dateFrom)}</Text>
              <Ionicons name="calendar-outline" size={18} color={COLORS.textMuted} />
            </Pressable>
          </View>

          <View style={{ width: SPACING.sm }} />

          <View style={{ flex: 1 }}>
            <Text style={styles.filterLabelSmall}>{b("Au", "إلى")}</Text>
            <Pressable style={styles.field} onPress={() => openDatePicker("to")}>
              <Text style={styles.fieldText}>{formatFRDate(dateTo)}</Text>
              <Ionicons name="calendar-outline" size={18} color={COLORS.textMuted} />
            </Pressable>
          </View>

          <View style={{ width: SPACING.sm }} />

          <View style={{ flex: 1 }}>
            <Text style={styles.filterLabelSmall}>{b("Statut", "الحالة")}</Text>
            <Pressable style={styles.field} onPress={() => setStatusModalVisible(true)}>
              <Text style={styles.fieldText} numberOfLines={1}>
                {statusDisplay}
              </Text>
              <Ionicons name="chevron-down" size={18} color={COLORS.textMuted} />
            </Pressable>
          </View>
        </View>

        <Pressable style={styles.searchBtn} onPress={fetchFirstPage}>
          <Ionicons name="search" size={18} color={COLORS.textOnBrand} />
          <Text style={styles.searchBtnText}>{b("Rechercher", "بحث")}</Text>
        </Pressable>
      </AppCard>
    </View>
  );

  return (
    <SafeAreaView edges={["bottom"]} style={[styles.safe, { paddingBottom: Math.max(0, insets.bottom) }]}>
      <AppHeader
        title="BON DE COMMANDES"
        titleAr="أوامر الشراء"
        onBack={() => router.back()}
      />

      <FlatList
        data={items}
        keyExtractor={(it) => String(it.id)}
        renderItem={({ item }) => <Card item={item} />}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={FiltersHeader}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onEndReachedThreshold={0.6}
        onEndReached={fetchMore}
        ListEmptyComponent={
          loadingFirst ? (
            <View style={styles.center}>
              <ActivityIndicator color={COLORS.brand} />
            </View>
          ) : (
            <View style={styles.center}>
              <Text style={{ color: COLORS.textMuted }}>
                {b("Aucun résultat", "لا توجد نتائج")}
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={{ paddingVertical: 14 }}>
              <ActivityIndicator color={COLORS.brand} />
            </View>
          ) : null
        }
      />

      {/* User modal (scroll + search) */}
      <Modal
        visible={userModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setUserModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { paddingBottom: Math.max(12, insets.bottom) }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{b("Utilisateurs", "المستخدمون")}</Text>
              <Pressable onPress={() => setUserModalVisible(false)} hitSlop={10} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={22} color={COLORS.text} />
              </Pressable>
            </View>

            <View style={styles.modalSearchRow}>
              <Ionicons name="search" size={18} color={COLORS.textMuted} />
              <TextInput
                value={userQuery}
                onChangeText={setUserQuery}
                placeholder={b("Rechercher un utilisateur...", "ابحث عن مستخدم...")}
                placeholderTextColor={COLORS.textMuted}
                style={styles.modalSearch}
                autoCorrect={false}
                autoCapitalize="none"
              />
              {loadingUsers ? <ActivityIndicator style={{ marginLeft: 8 }} color={COLORS.brand} /> : null}
            </View>

            <FlatList
              data={userItemsForModal}
              keyExtractor={(it) => it.key}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable
                  style={styles.modalItem}
                  onPress={() => {
                    const id = Number(item.key);
                    if (!id) setSelectedUser(null);
                    else setSelectedUser({ id, label: item.label });
                    setUserModalVisible(false);
                  }}
                >
                  <Text style={styles.modalItemText}>{item.label}</Text>
                </Pressable>
              )}
              ItemSeparatorComponent={() => <View style={styles.modalSep} />}
            />
          </View>
        </View>
      </Modal>

      {/* Status modal */}
      <SelectModal
        visible={statusModalVisible}
        title={b("Statut", "الحالة")}
        items={statusItemsForModal}
        searchable={false}
        onClose={() => setStatusModalVisible(false)}
        onPick={(key) => {
          setStatusModalVisible(false);
          setStatus(key === "all" ? null : key);
        }}
      />

      {/* iOS date modal */}
      {Platform.OS === "ios" && (
        <Modal
          visible={iosPicker.visible}
          transparent
          animationType="slide"
          onRequestClose={() => setIosPicker({ visible: false, target: "from" })}
        >
          <View style={styles.modalBackdrop}>
            <View style={[styles.iosDateSheet, { paddingBottom: Math.max(12, insets.bottom) }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {iosPicker.target === "from"
                    ? b("Date début", "تاريخ البداية")
                    : b("Date fin", "تاريخ النهاية")}
                </Text>
                <Pressable onPress={() => setIosPicker({ visible: false, target: "from" })} hitSlop={10} style={styles.modalCloseBtn}>
                  <Ionicons name="close" size={22} color={COLORS.text} />
                </Pressable>
              </View>

              <DateTimePicker
                value={iosPicker.target === "from" ? dateFrom : dateTo}
                mode="date"
                display="spinner"
                onChange={(_e, d) => {
                  if (!d) return;
                  if (iosPicker.target === "from") {
                    setDateFrom(d);
                    if (d > dateTo) setDateTo(d);
                  } else {
                    setDateTo(d);
                    if (d < dateFrom) setDateFrom(d);
                  }
                }}
              />

              <Pressable style={styles.doneBtn} onPress={() => setIosPicker({ visible: false, target: "from" })}>
                <Text style={styles.doneBtnText}>{b("OK", "موافق")}</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },

  listContent: {
    paddingBottom: SPACING.xl,
  },

  center: {
    paddingVertical: 24,
    alignItems: "center",
    justifyContent: "center",
  },

  filterLabel: {
    fontSize: TYPO.small,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: 8,
  },
  filterLabelSmall: {
    fontSize: TYPO.small,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: 8,
  },

  row3: {
    flexDirection: "row",
    alignItems: "flex-end",
  },

  field: {
    height: 52,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  fieldText: {
    flex: 1,
    color: COLORS.text,
    fontSize: TYPO.body,
    fontWeight: "700",
  },

  searchBtn: {
    marginTop: SPACING.md,
    height: 52,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.brand,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  searchBtnText: {
    color: COLORS.textOnBrand,
    fontWeight: "900",
    fontSize: TYPO.h2,
  },

  // Card content
  cardTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  infoBtn: { paddingTop: 2 },

  cardDelegue: {
    color: COLORS.brand,
    fontWeight: "900",
    fontSize: 16,
  },
  cardTitle: {
    marginTop: 6,
    color: COLORS.text,
    fontWeight: "900",
    fontSize: 14,
  },
  cardMeta: {
    marginTop: 6,
    color: COLORS.textMuted,
    fontWeight: "700",
    fontSize: 12,
  },

  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: SPACING.md,
    flexWrap: "wrap",
  },
  statusStepWrap: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  statusPill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: COLORS.cardAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statusPillActive: { backgroundColor: COLORS.brandSoft, borderColor: COLORS.brand },
  statusPillDone: { backgroundColor: "rgba(50,161,55,0.18)", borderColor: COLORS.brandDark },
  statusPillText: { color: COLORS.textMuted, fontWeight: "800", fontSize: 11 },
  statusPillTextActive: { color: COLORS.text, fontWeight: "900" },

  table: {
    marginTop: SPACING.md,
    borderRadius: RADIUS.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tableRow: { flexDirection: "row", backgroundColor: COLORS.cardAlt },
  tableRowAlt: { flexDirection: "row", backgroundColor: COLORS.card },
  tableKey: {
    width: 120,
    color: COLORS.text,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
    fontWeight: "900",
  },
  tableValue: { flex: 1, color: COLORS.text, paddingVertical: 10, paddingHorizontal: 10, fontWeight: "700" },
  countBadge: { color: "#C57C00", fontWeight: "900" },

  obs: { marginTop: SPACING.md, color: COLORS.textMuted, fontWeight: "700" },

  // Modals (light)
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalSheet: {
    maxHeight: "80%",
    backgroundColor: COLORS.card,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    padding: SPACING.md,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.sm,
  },
  modalTitle: { color: COLORS.text, fontWeight: "900", fontSize: 16 },
  modalCloseBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  modalSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    height: 48,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.bg,
    marginBottom: SPACING.sm,
  },
  modalSearch: { flex: 1, color: COLORS.text, fontWeight: "700" },
  modalItem: { paddingVertical: 12, paddingHorizontal: 8 },
  modalItemText: { color: COLORS.text, fontWeight: "800" },
  modalSep: { height: 1, backgroundColor: COLORS.border },

  iosDateSheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    padding: SPACING.md,
  },
  doneBtn: {
    marginTop: SPACING.md,
    height: 48,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  doneBtnText: { color: COLORS.textOnBrand, fontWeight: "900" },
});
