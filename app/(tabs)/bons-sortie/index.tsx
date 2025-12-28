import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { api } from "../../../src/api/client";
import { useAuth } from "../../../src/auth/AuthContext";

import { COLORS, RADIUS, SPACING, TYPO } from "../../../src/ui/theme";
import { AppHeader } from "../../../src/components/AppHeader";
import { AppCard } from "../../../src/components/AppCard";

type Role = "Commercial" | "Superviseur" | "Countrymanager";

type BonSortieItem = {
  id: number;
  delegue: string;
  dateAjout: string;
  heureAjout: string;
  status: string;
  depot: string | null;
  type: "Brochure" | "Produits";
  produits: string;
  observation: string | null;
  validationDate: string;
  confirmedBy: string;
};

type ScopeUser = { id: number; label: string };
type Option = { label: string; value: string | number };

const b = (fr: string, ar: string) => `${fr} | ${ar}`;

function bsUrl(path: string) {
  const p = path.startsWith("/") ? path : `/${path}`;
  const base = String((api as any)?.defaults?.baseURL || "");

  // If axios baseURL already contains /api, don't add it again.
  const baseHasApi = /\/api\/?$/.test(base) || base.includes("/api/");
  const prefix = baseHasApi ? "" : "/api";

  return `${prefix}/bons-sortie${p}`;
}


function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function toDMY(d: Date) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}
function ymdToDmy(ymd: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || "");
  if (!m) return ymd || "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function stageFromStatus(status: string): "initial" | "confirme" | "traite" {
  const s = (status || "").toLowerCase();
  if (s.includes("trait")) return "traite";
  if (s.includes("conf")) return "confirme";
  return "initial";
}

function arabicStatusLabel(stage: "initial" | "confirme" | "traite") {
  if (stage === "traite") return "تم الإرسال";
  if (stage === "confirme") return "تم تأكيد الطلبية";
  return "تم استلام الطلبية";
}

function stageArShort(stage: "initial" | "confirme" | "traite") {
  if (stage === "traite") return "مُعالج";
  if (stage === "confirme") return "مؤكّد";
  return "أولي";
}

function parseProduits(produits: string): Array<{ name: string; qty: string }> {
  if (!produits) return [];
  return produits
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((chunk) => {
      const m = /^(.*)\((\s*\d+\s*)\)\s*$/.exec(chunk);
      if (!m) return { name: chunk, qty: "" };
      return { name: m[1].trim(), qty: m[2].trim() };
    });
}

function StageTabs({ stage }: { stage: "initial" | "confirme" | "traite" }) {
  const tabs: Array<"initial" | "confirme" | "traite"> = ["initial", "confirme", "traite"];
  return (
    <View style={styles.stageTabs}>
      {tabs.map((t) => {
        const active = t === stage;
        return (
          <View key={t} style={[styles.stageTab, active ? styles.stageTabActive : styles.stageTabInactive]}>
            <Text style={[styles.stageTabText, active ? styles.stageTabTextActive : null]} numberOfLines={1}>
              {t}
            </Text>
            <Text style={[styles.stageTabTextAr, active ? styles.stageTabTextArActive : null]} numberOfLines={1}>
              {stageArShort(t)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function ProductsBlock({ item }: { item: BonSortieItem }) {
  const rows = useMemo(() => parseProduits(item.produits), [item.produits]);
  const canUseCompact =
    rows.length <= 1 && (!!item.observation?.trim() || (item.confirmedBy && item.confirmedBy !== "N/A"));

  if (canUseCompact) {
    const prod = rows[0] || { name: item.type === "Brochure" ? b("Brochure", "مطوية") : b("Produit", "منتج"), qty: "" };
    return (
      <View style={styles.compactGrid}>
        <View style={[styles.compactCell, styles.cellBorderRight, styles.cellBorderBottom]}>
          <Text style={[styles.compactText, styles.compactTextOrange]} numberOfLines={1}>
            {prod.name || "—"}
          </Text>
        </View>
        <View style={[styles.compactCell, styles.cellBorderBottom]}>
          <Text style={styles.compactText} numberOfLines={1}>
            {prod.qty || "—"}
          </Text>
        </View>

        <View style={[styles.compactCell, styles.cellBorderRight]}>
          <Text style={styles.compactText} numberOfLines={1}>
            {(item.observation || "").trim() || "—"}
          </Text>
        </View>
        <View style={styles.compactCell}>
          <Text style={styles.compactText} numberOfLines={1}>
            {item.confirmedBy && item.confirmedBy !== "N/A" ? item.confirmedBy : "—"}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.table}>
      {rows.map((r, idx) => (
        <View key={`${r.name}-${idx}`} style={styles.tableRow}>
          <View style={[styles.tableCellLeft, styles.cellBorderRight]}>
            <Text
              style={[styles.tableText, r.name.toLowerCase().includes("brochure") ? styles.tableTextOrange : null]}
              numberOfLines={1}
            >
              {r.name}
            </Text>
          </View>
          <View style={styles.tableCellRight}>
            <Text style={styles.tableText} numberOfLines={1}>
              {r.qty || ""}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function BonSortieCard({ item }: { item: BonSortieItem }) {
  const stage = stageFromStatus(item.status);

  return (
    <AppCard style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.leftInfo}>
          <Text style={styles.bsLabel} numberOfLines={1}>
  {b("Bon de Sortie", "سند الخروج")}
</Text>


          <Text style={styles.bsNo} numberOfLines={1}>
            {b("N°", "رقم")} {item.id}
          </Text>

          <Text style={styles.bsAuthor} numberOfLines={1}>
            {item.delegue || "—"}
          </Text>

          <Text style={styles.bsDate}>
            {ymdToDmy(item.dateAjout)} {item.heureAjout}
          </Text>

          {(item.validationDate && item.validationDate !== "N/A") || (item.confirmedBy && item.confirmedBy !== "N/A") ? (
            <View style={{ marginTop: 8 }}>
              {item.validationDate && item.validationDate !== "N/A" ? (
                <Text style={styles.smallLine}>
                  {b("Confirmé le", "تم التأكيد في")} : {ymdToDmy(item.validationDate)}
                </Text>
              ) : null}
              {item.confirmedBy && item.confirmedBy !== "N/A" ? (
                <Text style={styles.smallLine} numberOfLines={1}>
                  {b("Confirmé par", "تم التأكيد بواسطة")} : {item.confirmedBy}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>

        <View style={styles.rightStatus}>
          <StageTabs stage={stage} />
          <Text style={styles.arTitle}>{b("Statut actuel", "الوضع الحالي للطلبية")}</Text>
          <View style={[styles.arBadge, stage === "traite" ? styles.arBadgeGreen : styles.arBadgeGray]}>
            <Text style={styles.arBadgeText}>{arabicStatusLabel(stage)}</Text>
          </View>
        </View>
      </View>

      <View style={{ marginTop: SPACING.md }}>
        <ProductsBlock item={item} />
      </View>

      <View style={styles.cardActions}>
        <Pressable onPress={() => {}} style={styles.iconBtn} hitSlop={10}>
          <Ionicons name="print-outline" size={18} color={COLORS.text} />
        </Pressable>
        <Pressable onPress={() => {}} style={styles.iconBtn} hitSlop={10}>
          <Ionicons name="share-social-outline" size={18} color={COLORS.text} />
        </Pressable>
      </View>
    </AppCard>
  );
}

/** ---------- Select Modal (light) ---------- */
function SelectModal({
  visible,
  title,
  options,
  selectedValue,
  onClose,
  onSelect,
}: {
  visible: boolean;
  title: string;
  options: Option[];
  selectedValue: string | number;
  onClose: () => void;
  onSelect: (value: string | number) => void;
}) {
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!visible) setQ("");
  }, [visible]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return options;
    return options.filter((o) => o.label.toLowerCase().includes(query));
  }, [q, options]);

  const maxHeight = Math.min(520, Dimensions.get("window").height * 0.7);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <View style={styles.modalHeaderRow}>
            <Text style={styles.modalTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10} style={styles.modalCloseBtn}>
              <Ionicons name="close" size={22} color={COLORS.text} />
            </Pressable>
          </View>

          <View style={styles.searchWrap}>
            <Ionicons name="search" size={16} color={COLORS.textMuted} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder={b("Rechercher...", "بحث...")}
              placeholderTextColor={COLORS.textMuted}
              style={styles.searchInput}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {q.length > 0 ? (
              <Pressable onPress={() => setQ("")} hitSlop={10}>
                <Ionicons name="close" size={18} color={COLORS.textMuted} />
              </Pressable>
            ) : null}
          </View>

          <View style={{ maxHeight }}>
            <FlatList
              data={filtered}
              keyExtractor={(opt) => `${opt.value}`}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item: opt }) => {
                const active = opt.value === selectedValue;
                return (
                  <Pressable
                    style={[styles.modalOption, active ? styles.modalOptionActive : null]}
                    onPress={() => {
                      onSelect(opt.value);
                      onClose();
                      setQ("");
                    }}
                  >
                    <Text style={[styles.modalOptionText, active ? styles.modalOptionTextActive : null]}>
                      {opt.label}
                    </Text>
                    {active ? <Ionicons name="checkmark" size={18} color={COLORS.brand} /> : null}
                  </Pressable>
                );
              }}
              ItemSeparatorComponent={() => <View style={styles.modalSep} />}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SelectField({
  label,
  valueLabel,
  onPress,
  disabled,
}: {
  label: string;
  valueLabel: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.filterLabel}>{label}</Text>
      <Pressable
        onPress={disabled ? undefined : onPress}
        style={[styles.field, disabled ? { opacity: 0.6 } : null]}
      >
        <Text style={styles.fieldText} numberOfLines={1}>
          {valueLabel}
        </Text>
        <Ionicons name="chevron-down" size={18} color={COLORS.textMuted} />
      </Pressable>
    </View>
  );
}

/** ---------- Dates ---------- */
function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Date;
  onChange: (d: Date) => void;
}) {
  const [iosOpen, setIosOpen] = useState(false);

  const open = () => {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value,
        mode: "date",
        is24Hour: true,
        onChange: (_e, selected) => {
          if (selected) onChange(selected);
        },
      });
    } else {
      setIosOpen(true);
    }
  };

  const onIOSChange = (_e: DateTimePickerEvent, selected?: Date) => {
    if (selected) onChange(selected);
  };

  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.filterLabel}>{label}</Text>
      <Pressable onPress={open} style={styles.field}>
        <Text style={styles.fieldText}>{toDMY(value)}</Text>
        <Ionicons name="calendar-outline" size={18} color={COLORS.textMuted} />
      </Pressable>

      {Platform.OS === "ios" && (
        <Modal visible={iosOpen} transparent animationType="fade" onRequestClose={() => setIosOpen(false)}>
          <Pressable style={styles.modalOverlay} onPress={() => setIosOpen(false)}>
            <Pressable style={styles.modalCard} onPress={() => {}}>
              <View style={styles.modalHeaderRow}>
                <Text style={styles.modalTitle}>{b("Choisir une date", "اختيار تاريخ")}</Text>
                <Pressable onPress={() => setIosOpen(false)} hitSlop={10} style={styles.modalCloseBtn}>
                  <Ionicons name="close" size={22} color={COLORS.text} />
                </Pressable>
              </View>

              <DateTimePicker value={value} mode="date" display="inline" onChange={onIOSChange} />

              <Pressable style={[styles.primaryBtn, { marginTop: 12 }]} onPress={() => setIosOpen(false)}>
                <Text style={styles.primaryBtnText}>{b("OK", "موافق")}</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

export default function BonsSortieIndex() {
  const insets = useSafeAreaInsets();
  const { state } = useAuth();
  const me = (state?.user as any) || null;

  const roleRaw = String(me?.role ?? me?.rolee ?? "").trim();
  const roleNorm = roleRaw.toLowerCase();
  const isAdmin = !!me?.is_superuser;

  const isCountryManager = roleNorm === "countrymanager";
  const isSupervisor = roleNorm === "superviseur";

  const canPickUser = isAdmin || isCountryManager || isSupervisor;

  const now = useMemo(() => new Date(), []);
  const defaultStart = useMemo(() => {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return d;
  }, [now]);

  const [scopeUsers, setScopeUsers] = useState<ScopeUser[]>([]);
  const [items, setItems] = useState<BonSortieItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaultSelectedUserId = useMemo(() => {
    if (!me?.id) return 0;
    if (isCountryManager || isAdmin) return 0; // Tous
    return me.id; // Moi
  }, [me?.id, isCountryManager, isAdmin]);

  const [selectedUserId, setSelectedUserId] = useState<number>(defaultSelectedUserId);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [startDate, setStartDate] = useState<Date>(defaultStart);
  const [endDate, setEndDate] = useState<Date>(now);

  const [userModalOpen, setUserModalOpen] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);

  useEffect(() => {
    setSelectedUserId(defaultSelectedUserId);
  }, [defaultSelectedUserId]);

  useEffect(() => {
    if (startDate > endDate) setEndDate(startDate);
  }, [startDate, endDate]);

  const statusOptions: Option[] = useMemo(
    () => [
      { label: b("Tous", "الكل"), value: "" },
      { label: b("initial", "أولي"), value: "initial" },
      { label: b("confirme", "مؤكّد"), value: "confirme" },
      { label: b("traite", "مُعالج"), value: "traite" },
    ],
    []
  );

  const userOptions: Option[] = useMemo(() => {
    const opts: Option[] = [];
    if (!me?.id) return opts;

    if (canPickUser) opts.push({ label: b("Tous", "الكل"), value: 0 });
    opts.push({ label: b("Moi", "أنا"), value: me.id });

    for (const u of scopeUsers) {
      if (u.id === me.id) continue;
      opts.push({ label: u.label, value: u.id });
    }
    return opts;
  }, [me?.id, canPickUser, scopeUsers]);

  const selectedUserLabel = useMemo(() => {
    const opt = userOptions.find((o) => Number(o.value) === Number(selectedUserId));
    return opt?.label || b("Sélectionner…", "اختر…");
  }, [userOptions, selectedUserId]);

  const selectedStatusLabel = useMemo(() => {
    const opt = statusOptions.find((o) => String(o.value) === String(statusFilter));
    return opt?.label || b("Tous", "الكل");
  }, [statusOptions, statusFilter]);

  const loadScopeUsers = useCallback(async () => {
  if (!canPickUser) return;
  try {
    const res = await api.get(bsUrl("/scope-users"));
    const payload: any = res.data;

    const arr = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.results)
        ? payload.results
        : Array.isArray(payload?.items)
          ? payload.items
          : [];

    setScopeUsers(arr);
  } catch {
    setScopeUsers([]);
  }
}, [canPickUser]);

const loadList = useCallback(async () => {
  if (!me?.id) return;

  setError(null);
  try {
    const params: any = {
      startDate: toISODate(startDate),
      endDate: toISODate(endDate),
    };

    if (statusFilter) params.status = statusFilter;

    if (canPickUser) {
      if (selectedUserId && selectedUserId > 0) params.selectedUserId = selectedUserId;
    }

    const res = await api.get(bsUrl("/list"), { params });
    const payload: any = res.data;

    // If we accidentally hit an HTML fallback (bad baseURL), surface it explicitly
    if (typeof payload === "string" && payload.toLowerCase().includes("<html")) {
      setItems([]);
      setError(b("API mal configurée (baseURL). Vérifie EXPO_PUBLIC_API_URL.", "إعدادات الخادم غير صحيحة. تحقّق من EXPO_PUBLIC_API_URL."));
      return;
    }

    const arr = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.results)
        ? payload.results
        : Array.isArray(payload?.items)
          ? payload.items
          : Array.isArray(payload?.data)
            ? payload.data
            : [];

    setItems(arr);
  } catch {
    setItems([]);
    setError(b("Impossible de charger les bons de sortie.", "تعذّر تحميل سندات الخروج."));
  } finally {
    setLoading(false);
    setRefreshing(false);
  }
}, [me?.id, canPickUser, selectedUserId, statusFilter, startDate, endDate]);


  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadScopeUsers();
      await loadList();
    })();
  }, [loadScopeUsers, loadList]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadList();
  }, [loadList]);

  return (
    <SafeAreaView edges={["bottom"]} style={[styles.screen, { paddingBottom: Math.max(0, insets.bottom) }]}>
      <AppHeader title="BON DE SORTIE" titleAr="سند الخروج" onBack={() => router.back()} />

      <View style={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.md }}>
        <AppCard>
          <View style={{ gap: SPACING.md }}>
            <View style={styles.row2}>
              <SelectField
                label={b("Utilisateur", "مستخدم")}
                valueLabel={canPickUser ? selectedUserLabel : b("Moi", "أنا")}
                disabled={!canPickUser}
                onPress={() => setUserModalOpen(true)}
              />

              <View style={{ width: SPACING.sm }} />

              <SelectField
                label={b("Statut", "الحالة")}
                valueLabel={selectedStatusLabel}
                onPress={() => setStatusModalOpen(true)}
              />
            </View>

            <View style={styles.row2}>
              <DateField label={b("Du", "من")} value={startDate} onChange={setStartDate} />
              <View style={{ width: SPACING.sm }} />
              <DateField label={b("Au", "إلى")} value={endDate} onChange={setEndDate} />
            </View>

            <Pressable onPress={loadList} style={styles.primaryBtn}>
              <Ionicons name="search" size={18} color={COLORS.textOnBrand} />
              <Text style={styles.primaryBtnText}>{b("Rechercher", "بحث")}</Text>
            </Pressable>
          </View>
        </AppCard>
      </View>

      <SelectModal
        visible={userModalOpen}
        title={b("Choisir un utilisateur", "اختيار مستخدم")}
        options={userOptions}
        selectedValue={selectedUserId}
        onClose={() => setUserModalOpen(false)}
        onSelect={(v) => setSelectedUserId(Number(v))}
      />

      <SelectModal
        visible={statusModalOpen}
        title={b("Choisir un statut", "اختيار حالة")}
        options={statusOptions}
        selectedValue={statusFilter}
        onClose={() => setStatusModalOpen(false)}
        onSelect={(v) => setStatusFilter(String(v))}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.brand} />
          <Text style={styles.centerText}>{b("Chargement…", "جارٍ التحميل…")}</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => String(it.id)}
          contentContainerStyle={items.length === 0 ? styles.emptyWrap : styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.centerText}>{b("Aucun bon de sortie.", "لا توجد سندات خروج.")}</Text>
            </View>
          }
          renderItem={({ item }) => <BonSortieCard item={item} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },

  row2: { flexDirection: "row", alignItems: "flex-end" },

  filterLabel: {
    color: COLORS.text,
    fontSize: TYPO.small,
    marginBottom: 8,
    fontWeight: "800",
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

  primaryBtn: {
    height: 52,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.brand,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  primaryBtnText: {
    color: COLORS.textOnBrand,
    fontWeight: "900",
    fontSize: TYPO.h2,
  },

  listContent: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xl },
  emptyWrap: { flexGrow: 1, justifyContent: "center", padding: 24 },

  // Card (Bon Sortie)
  card: {
    marginBottom: SPACING.lg,
  },

  cardTop: {
  flexDirection: "row",
  flexWrap: "wrap",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
},

leftInfo: {
  flexGrow: 1,
  flexBasis: 220,
  minWidth: 200,
},

rightStatus: {
  flexGrow: 1,
  flexBasis: 220,
  minWidth: 200,
  alignItems: "flex-end",
  marginTop: 6,
},


  bsLabel: { color: COLORS.brand, fontWeight: "900", fontSize: 14 },
  bsNo: { color: COLORS.text, fontWeight: "900", fontSize: 16, marginTop: 6 },
  bsAuthor: { color: COLORS.text, fontWeight: "800", fontSize: 15, marginTop: 6 },
  bsDate: { color: COLORS.textMuted, fontWeight: "800", fontSize: 12, marginTop: 8 },
  smallLine: { color: COLORS.textMuted, fontSize: 11, marginTop: 4, fontWeight: "700" },

  stageTabs: {
  flexDirection: "row",
  borderRadius: 10,
  overflow: "hidden",
  borderWidth: 1,
  borderColor: COLORS.border,
  alignSelf: "stretch",
  maxWidth: "100%",
},

stageTab: {
  flex: 1,
  minWidth: 0,
  paddingHorizontal: 8,
  paddingVertical: 8,
  alignItems: "center",
},

  stageTabInactive: { backgroundColor: COLORS.cardAlt },
  stageTabActive: { backgroundColor: COLORS.brandSoft },
stageTabText: { color: COLORS.textMuted, fontWeight: "900", fontSize: 10 },
  stageTabTextActive: { color: COLORS.text, fontWeight: "900" },
stageTabTextAr: { color: COLORS.textMuted, fontWeight: "800", fontSize: 9, writingDirection: "rtl" },
  stageTabTextArActive: { color: COLORS.text, fontWeight: "900" },

  arTitle: { color: COLORS.text, fontWeight: "900", marginTop: 10, textAlign: "right" },
  arBadge: { marginTop: 8, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1 },
  arBadgeGray: { backgroundColor: COLORS.cardAlt, borderColor: COLORS.border },
  arBadgeGreen: { backgroundColor: "rgba(50,161,55,0.16)", borderColor: COLORS.brand },
  arBadgeText: { color: COLORS.text, fontWeight: "900", writingDirection: "rtl" },

  // Products table
  table: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, overflow: "hidden" },
  tableRow: { flexDirection: "row", backgroundColor: COLORS.cardAlt },
  tableCellLeft: { flex: 1, paddingVertical: 10, paddingHorizontal: 10 },
  tableCellRight: { width: 56, paddingVertical: 10, paddingHorizontal: 10, alignItems: "flex-end" },
  cellBorderRight: { borderRightWidth: 1, borderRightColor: COLORS.border },
  tableText: { color: COLORS.text, fontWeight: "800", fontSize: 13 },
  tableTextOrange: { color: "#C57C00" },

  compactGrid: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    overflow: "hidden",
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: COLORS.cardAlt,
  },
  compactCell: { width: "50%", paddingVertical: 12, paddingHorizontal: 10, justifyContent: "center" },
  cellBorderBottom: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  compactText: { color: COLORS.text, fontWeight: "800", fontSize: 13 },
  compactTextOrange: { color: "#C57C00" },

  cardActions: { marginTop: 12, flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.cardAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },

  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  centerText: { marginTop: 10, color: COLORS.textMuted, fontWeight: "800" },
  errorText: { color: "#B42318", fontWeight: "900", textAlign: "center" },

  // Modal (light)
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 18,
  },
  modalCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
  },
  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.sm,
  },
  modalTitle: { color: COLORS.text, fontWeight: "900", fontSize: 14 },
  modalCloseBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },

  searchWrap: {
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
  searchInput: { flex: 1, color: COLORS.text, fontWeight: "700" },

  modalOption: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalOptionActive: { backgroundColor: COLORS.brandSoft },
  modalOptionText: { color: COLORS.text, fontWeight: "800" },
  modalOptionTextActive: { color: COLORS.text, fontWeight: "900" },
  modalSep: { height: 1, backgroundColor: COLORS.border, marginVertical: 4 },
});
