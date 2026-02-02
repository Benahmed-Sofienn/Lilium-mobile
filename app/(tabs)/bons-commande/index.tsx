import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  Dimensions,
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
import { AppSelect, AppSelectOption } from "../../../src/components/AppSelect";
import { ZoomableImage } from "../../../src/components/ZoomableImage";



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
  image?: string | null;
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

function buildOrderImageUrl(imagePath?: string | null) {
  const p = String(imagePath ?? "").trim();
  if (!p) return null;

  if (/^https?:\/\//i.test(p)) return p;

  const base0 = String((api.defaults as any)?.baseURL ?? "").replace(/\/+$/, "");
  const base = base0.replace(/\/api$/i, ""); // important

  if (!base) return p.startsWith("/") ? p : `/${p}`;

  if (p.startsWith("/")) return `${base}${p}`;
  if (p.startsWith("media/")) return `${base}/${p}`;

  return `${base}/media/${p}`;
}


export default function BonsCommandeIndex() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state } = useAuth();

  

  const meId =
  state.status === "signedIn" ? Number((state.user as any)?.id ?? 0) : 0;

const meLabel = useMemo(() => {
  const u: any = state.status === "signedIn" ? state.user : null;
  const raw =
    u?.fullName ??
    u?.full_name ??
    u?.name ??
    u?.username ??
    u?.email ??
    "";
  const s = String(raw || "").trim();
  return s || (meId ? `User #${meId}` : "—");
}, [state.status, state.user, meId]);


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
  const defaultSelectedUserId = useMemo(() => (meId ? meId : 0), [meId]);
const [selectedUserId, setSelectedUserId] = useState<number>(defaultSelectedUserId);

  const [imageModal, setImageModal] = useState<{ visible: boolean; uri: string | null; orderId?: number }>({
    visible: false,
    uri: null,
    orderId: undefined,
  });
  const [imgLoading, setImgLoading] = useState(false);
  const closeImageModal = useCallback(() => {
  setImageModal({ visible: false, uri: null, orderId: undefined });
}, []);



useEffect(() => {
  if (defaultSelectedUserId) setSelectedUserId(defaultSelectedUserId);
}, [defaultSelectedUserId]);

  const [status, setStatus] = useState<string | null>(null); // null = Tous

  // User modal (server-backed search)
  const [userModalVisible, setUserModalVisible] = useState(false);
  const [userQuery, setUserQuery] = useState("");
  const [scopeUsers, setScopeUsers] = useState<ScopeUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);


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

  const statusOptions: AppSelectOption[] = useMemo(
  () => [
    { id: "", label: b("Tous", "الكل"), keywords: "tous الكل all" },
    { id: "initial", label: b("initial", statusAr("initial")) },
    { id: "confirme", label: b("confirme", statusAr("confirme")) },
    { id: "en cours", label: b("en cours", statusAr("en cours")) },
    { id: "traite", label: b("traite", statusAr("traite")) },
  ],
  []
);


  const statusDisplay = useMemo(() => {
    if (!status) return b("Tous", "الكل");
    return b(status, statusAr(status));
  }, [status]);

  const loadScopeUsers = useCallback(async () => {
  if (!showUserFilter) return;
  try {
    const res = await api.get("/bons-commande/scope-users", { params: { q: "", limit: 200 } });
    const arr = Array.isArray(res.data) ? (res.data as ScopeUser[]) : [];
    setScopeUsers(arr);
  } catch {
    setScopeUsers([]);
  }
}, [showUserFilter]);

useEffect(() => {
  if (state.status !== "signedIn") return;
  loadScopeUsers();
}, [state.status, loadScopeUsers]);


  const buildListParams = useCallback(
    (cursor?: number | null) => {
      const params: any = {
        limit: 10,
        startDate: ymdFromDate(dateFrom),
        endDate: ymdFromDate(dateTo),
      };

      if (cursor) params.cursor = cursor;

      if (showUserFilter) {
  params.selectedUserId = selectedUserId || 0; // 0 => Tous
}


      if (status) params.status = status; // null => Tous

      return params;
    },
    [dateFrom, dateTo, selectedUserId, showUserFilter, status]
  );

  const parseListResponse = (data: ListResponse) => {
    if (Array.isArray(data)) {
      return { items: data, nextCursor: data.length ? data[data.length - 1].id : null };
    }
    return { items: data.items || [], nextCursor: data.nextCursor ?? null };
  };

  const canEditStatus = useMemo(() => {
  return roleKey === "countrymanager" || roleKey === "superviseur";
}, [roleKey]);

const onAdvanceStatus = useCallback(
  async (item: BonCommandeItem, targetStatus: string) => {
    // sécurité: avance uniquement d'un cran
    const curIdx = STATUS_STEPS.findIndex((x) => x === item.status);
    const tgtIdx = STATUS_STEPS.findIndex((x) => x === targetStatus);
    if (curIdx < 0 || tgtIdx !== curIdx + 1) return;

    // Optimistic UI
    setItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, status: targetStatus } : it))
    );

    try {
      await api.patch(`/bons-commande/${item.id}/status`, { status: targetStatus });
    } catch (e) {
      // rollback si erreur
      setItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, status: item.status } : it))
      );
    }
  },
  []
);



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
    const imageUrl = buildOrderImageUrl(item.image);



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

                    <View style={styles.cardActions}>
            <Pressable
              hitSlop={10}
              onPress={() => {
                if (!imageUrl) return;
                setImageModal({ visible: true, uri: imageUrl, orderId: item.id });
              }}
              style={[styles.iconBtn, !imageUrl && styles.iconBtnDisabled]}
              disabled={!imageUrl}
            >
              <Ionicons name="eye-outline" size={22} color={imageUrl ? COLORS.textMuted : COLORS.border} />
            </Pressable>

            <Pressable
  hitSlop={10}
  onPress={() => router.push(`/bons-commande/${item.id}`)}
  style={styles.infoBtn}
>
  <Ionicons name="information-circle-outline" size={22} color={COLORS.textMuted} />
</Pressable>

          </View>

        </View>

        <View style={styles.statusRow}>
          {STATUS_STEPS.map((s, idx) => {
            const isActive = idx === activeIdx;
            const isDone = activeIdx >= 0 && idx < activeIdx;

            return (
              <View key={s} style={styles.statusStepWrap}>
                <Pressable
  disabled={!canEditStatus || idx !== activeIdx + 1}
  onPress={() => onAdvanceStatus(item, s)}
  style={[
    styles.statusPill,
    isDone && styles.statusPillDone,      // previous steps
    isActive && styles.statusPillActive,  // current step
    // IMPORTANT: no style for "next clickable"
  ]}
>
  <Text style={[styles.statusFr, (isActive) && styles.statusTextActive]} numberOfLines={1}>
    {s}
  </Text>
  <Text style={[styles.statusAr, (isActive) && styles.statusTextActive]} numberOfLines={1}>
    {statusAr(s)}
  </Text>
</Pressable>

                {idx < STATUS_STEPS.length - 1 && (
                  <Ionicons
  name="arrow-forward"
  size={12}
  color={COLORS.textMuted}
  style={{ marginHorizontal: 4, flexShrink: 0 }}
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

  const userOptions: AppSelectOption[] = useMemo(() => {
  const opts: AppSelectOption[] = [];
  if (!meId) return opts;

  // Garder "Tous" uniquement si le filtre user est visible (superviseur/countrymanager)
  if (showUserFilter) {
    opts.push({ id: 0, label: b("Tous", "الكل"), keywords: "tous الكل all" });
  }

  // IMPORTANT: pas de "Moi | أنا" => on met le NOM réel
  opts.push({ id: meId, label: meLabel, keywords: meLabel.toLowerCase() });

  for (const u of scopeUsers) {
    if (u.id === meId) continue;
    opts.push({ id: u.id, label: u.label, keywords: u.label.toLowerCase() });
  }
  return opts;
}, [meId, meLabel, showUserFilter, scopeUsers]);


  const statusItemsForModal = useMemo(() => {
    return statusOptions.map((x) => ({ key: String(x.id), label: x.label }));
  }, [statusOptions]);

  const FiltersHeader = (
    <View style={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.md }}>
      <AppCard>
        {showUserFilter && (
  <>
    <AppSelect
      title="Utilisateur"
      titleAr="مستخدم"
      value={selectedUserId}
      options={userOptions}
      allowClear={false}
      onChange={(id) => setSelectedUserId(Number(id ?? 0))}
    />
    <View style={{ height: SPACING.md }} />
  </>
)}


   {/* Ligne Statut (seule) */}
<View style={{ marginBottom: SPACING.sm }}>
  <AppSelect
    title="Statut"
    titleAr="الحالة"
    value={status ?? ""}
    options={statusOptions}
    allowClear={false}
    onChange={(id) => setStatus(String(id ?? "") || null)}
  />
</View>

{/* Ligne Du / Au (Pressable comme actuellement) */}
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

            {/* Image Bon de commande (Zoomable) */}
<Modal
  visible={imageModal.visible}
  transparent
  animationType="fade"
  onRequestClose={closeImageModal}
>
  <View style={styles.imageBackdrop}>
    <View style={[styles.imageTopBar, { paddingTop: Math.max(SPACING.lg, insets.top + 8) }]}>
      <Text style={styles.imageTopTitle} numberOfLines={1}>
        {b("Bon de Commande N°", "أمر شراء رقم")} {imageModal.orderId ?? ""}
      </Text>

      <Pressable onPress={closeImageModal} hitSlop={10} style={styles.modalCloseBtn}>
        <Ionicons name="close" size={22} color={COLORS.textOnBrand} />
      </Pressable>
    </View>

    {imageModal.uri ? (
      <View style={styles.imageZoomArea}>
        <ZoomableImage
          uri={imageModal.uri}
          height={Math.max(
            260,
            Dimensions.get("window").height - (insets.top + insets.bottom) - 120
          )}
          borderRadius={0}
        />
      </View>
    ) : (
      <View style={styles.imageEmpty}>
        <Text style={{ color: COLORS.textOnBrand, fontWeight: "800" }}>
          {b("Image indisponible", "الصورة غير متوفرة")}
        </Text>
      </View>
    )}
  </View>
</Modal>


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
  flexWrap: "nowrap",            // IMPORTANT: une seule ligne
},
statusStepWrap: {
  flexDirection: "row",
  alignItems: "center",
  flex: 1,                       // chaque step prend sa part
},


statusPill: {
  flex: 1,
  minWidth: 0,
  paddingVertical: 6,
  paddingHorizontal: 6,
  borderRadius: 999,
  backgroundColor: COLORS.cardAlt,  // this is your light gray “future” default
  borderWidth: 1,
  borderColor: COLORS.border,
  alignItems: "center",
  justifyContent: "center",
},

// PREVIOUS (done): your requested neutral outlined style
statusPillDone: {
  borderWidth: 2,
  borderColor: COLORS.border,          // keep neutral (not green)
  backgroundColor: "rgba(0,0,0,0.02)",
},

// CURRENT (active): keep what you already had (light green + green outline)

statusPillNextClickable: {
  borderWidth: 2,
  backgroundColor: "rgba(0,0,0,0.02)", 
},

statusFr: {
  fontSize: 10,
  fontWeight: "900",
  color: COLORS.textMuted,
},
statusAr: {
  fontSize: 10,
  fontWeight: "900",
  color: COLORS.textMuted,
},
statusTextActive: {
  color: COLORS.text,
},


  statusPillActive: { backgroundColor: COLORS.brandSoft, borderColor: COLORS.brand },
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
    cardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 2,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnDisabled: {
    opacity: 0.5,
  },

  

imageBackdrop: {
  flex: 1,
  backgroundColor: "rgba(0,0,0,0.92)",
},

imageTopBar: {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  paddingHorizontal: SPACING.lg,
  paddingBottom: SPACING.sm,
},

imageTopTitle: {
  flex: 1,
  paddingRight: 10,
  color: COLORS.textOnBrand,
  fontWeight: "900",
  fontSize: 16,
},

imageZoomArea: {
  flex: 1,
  paddingHorizontal: SPACING.lg,
  paddingBottom: SPACING.lg,
},

imageEmpty: {
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
  paddingHorizontal: SPACING.lg,
},



});
