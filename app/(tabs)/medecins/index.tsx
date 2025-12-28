import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
  Alert,
  Linking,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Picker } from "@react-native-picker/picker";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { api } from "../../../src/api/client";
import { useAuth } from "../../../src/auth/AuthContext";

import { COLORS, RADIUS, SPACING, TYPO } from "../../../src/ui/theme";
import { AppHeader } from "../../../src/components/AppHeader";
import { AppCard } from "../../../src/components/AppCard";

type UserRole = "Commercial" | "Superviseur" | "Countrymanager";

type RefWilaya = { id: number; nom: string };
type RefSpecialite = { id: number; description: string };
type RefUser = { id: number; first_name?: string; last_name?: string };

type Referentiels = {
  wilayas: RefWilaya[];
  specialites: RefSpecialite[];
  users: RefUser[];
  classifications: string[];
  scope?: { hasUnderusers?: boolean };
};

type Medecin = {
  id: number;
  nom: string;
  telephone?: string | null;
  contact?: string | null;

  classification?: string | null;
  specialite?: string | null;

  lat?: any;
  lon?: any;
  latitude?: any;
  longitude?: any;
  gps_lat?: any;
  gps_lon?: any;
  gp_lat?: any;
  gp_lon?: any;

  regions_wilaya?: { nom: string } | null;
  regions_commune?: { nom: string; regions_wilaya?: { nom: string } | null } | null;
  medecins_medecinspecialite?: { id: number; description: string } | null;

  ui?: {
    lastVisit?: { date: string; by: string } | null;
    visitsTotal?: number;
  };
};

type MedecinsResponse = {
  data: Medecin[];
  meta?: {
    totalItems: number;
    currentPage: number;
    totalPages: number;
    itemsPerPage: number;
  };
};

const PAGE_SIZE = 15;
const b = (fr: string, ar: string) => `${fr} | ${ar}`;

function formatDateFR(dateOnly?: string | null) {
  if (!dateOnly) return null;
  const d = new Date(`${dateOnly}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateOnly;
  return d.toLocaleDateString("fr-FR");
}

async function openMedecinMap(lat?: any, lon?: any, label?: string) {
  const latitude = Number(lat);
  const longitude = Number(lon);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    Alert.alert(b("Position indisponible", "الموقع غير متاح"), b("Ce client n’a pas de latitude/longitude.", "هذا العميل لا يملك إحداثيات (خط عرض/طول)."));
    return;
  }

  const q = encodeURIComponent(label || b("Client", "عميل"));
  const url =
    Platform.OS === "ios"
      ? `http://maps.apple.com/?ll=${latitude},${longitude}&q=${q}`
      : `geo:${latitude},${longitude}?q=${latitude},${longitude}(${q})`;

  const can = await Linking.canOpenURL(url);
  if (!can) {
    await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`);
    return;
  }
  await Linking.openURL(url);
}

export default function MedecinsIndex() {
  const insets = useSafeAreaInsets();
  const { state } = useAuth();

  const signedIn = state.status === "signedIn";
  const me = signedIn ? state.user : null;

  const role: UserRole = ((me as any)?.role as UserRole) || ((me as any)?.rolee as UserRole) || "Commercial";
  const showUserFilter = role === "Countrymanager" || role === "Superviseur";

  const [refs, setRefs] = useState<Referentiels>({
    wilayas: [],
    specialites: [],
    users: [],
    classifications: [],
  });
  const [loadingRefs, setLoadingRefs] = useState(false);

  const [items, setItems] = useState<Medecin[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [wilayaId, setWilayaId] = useState<string>("all");
  const [specialiteId, setSpecialiteId] = useState<string>("all");
  const [classification, setClassification] = useState<string>("all");

  // "tous" | "moi" | "<userId>"
  const [userFilter, setUserFilter] = useState<string>("moi");
  const didInitUserFilter = useRef(false);

  useEffect(() => {
    if (!signedIn || !(me as any)?.id) return;
    if (didInitUserFilter.current) return;

    if (role === "Countrymanager") setUserFilter("tous");
    else setUserFilter("moi");

    didInitUserFilter.current = true;
  }, [signedIn, me, role]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const effectiveDelegueId = useMemo(() => {
    if (!signedIn || !(me as any)?.id) return null;

    if (!showUserFilter) return null;

    if (userFilter === "tous") return null;
    if (userFilter === "moi") return (me as any).id;

    const n = Number(userFilter);
    return Number.isFinite(n) ? n : null;
  }, [signedIn, me, showUserFilter, userFilter]);

  const buildParams = useCallback(
    (targetPage: number) => {
      const params: any = { page: targetPage, limit: PAGE_SIZE };

      if (debouncedSearch) params.search = debouncedSearch;
      if (wilayaId !== "all") params.wilaya_id = wilayaId;
      if (specialiteId !== "all") params.specialite_id = specialiteId;
      if (classification !== "all") params.classification = classification;

      if (effectiveDelegueId) params.delegue_id = effectiveDelegueId;

      return params;
    },
    [debouncedSearch, wilayaId, specialiteId, classification, effectiveDelegueId]
  );

  const loadReferentiels = useCallback(async () => {
    if (!signedIn) return;
    setLoadingRefs(true);
    try {
      const params: any = {};
      if (effectiveDelegueId) params.delegue_id = effectiveDelegueId;

      const res = await api.get("/medecins/referentiels", { params });
      const data = res.data as Referentiels;

      setRefs({
        wilayas: Array.isArray(data.wilayas) ? data.wilayas : [],
        specialites: Array.isArray(data.specialites) ? data.specialites : [],
        users: Array.isArray(data.users) ? data.users : [],
        classifications: Array.isArray(data.classifications) ? data.classifications : [],
        scope: data.scope,
      });
    } finally {
      setLoadingRefs(false);
    }
  }, [signedIn, effectiveDelegueId]);

  const loadList = useCallback(
    async (targetPage: number, mode: "replace" | "append") => {
      if (!signedIn) return;

      if (mode === "replace") setLoadingList(true);

      try {
        const params = buildParams(targetPage);
        const res = await api.get("/medecins", { params });

        const payload = res.data as MedecinsResponse;
        const nextItems = Array.isArray(payload?.data) ? payload.data : [];
        const meta = payload?.meta;

        const tp = meta?.totalPages ? Number(meta.totalPages) : 1;
        setTotalPages(Number.isFinite(tp) && tp > 0 ? tp : 1);

        setItems((prev) => (mode === "append" ? [...prev, ...nextItems] : nextItems));
      } finally {
        setLoadingList(false);
      }
    },
    [signedIn, buildParams]
  );

  useEffect(() => {
    if (!signedIn) return;
    setPage(1);
    loadList(1, "replace");
    loadReferentiels();
  }, [signedIn, debouncedSearch, wilayaId, specialiteId, classification, effectiveDelegueId, loadList, loadReferentiels]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setPage(1);
      await Promise.all([loadList(1, "replace"), loadReferentiels()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadList, loadReferentiels]);

  const onEndReached = useCallback(() => {
    if (loadingList) return;
    if (page >= totalPages) return;
    const next = page + 1;
    setPage(next);
    loadList(next, "append");
  }, [loadingList, page, totalPages, loadList]);

  const fullName = useCallback((u: RefUser) => {
    const fn = (u.first_name || "").trim();
    const ln = (u.last_name || "").trim();
    const name = `${fn} ${ln}`.trim();
    return name || `User #${u.id}`;
  }, []);

  const renderItem = ({ item }: { item: Medecin }) => {
    const phone = (item.telephone || item.contact || "—") as string;

    const last = item.ui?.lastVisit;
    const lastDate = formatDateFR(last?.date);
    const lastBy = (last?.by || "").trim();

    const lat = item.lat ?? item.latitude ?? item.gps_lat ?? item.gp_lat;
    const lon = item.lon ?? item.longitude ?? item.gps_lon ?? item.gp_lon;

    const wilayaName =
      item.regions_wilaya?.nom ||
      item.regions_commune?.regions_wilaya?.nom ||
      "";
    const communeName = item.regions_commune?.nom || "";
    const region = wilayaName && communeName ? `${wilayaName} / ${communeName}` : wilayaName || communeName;

    const spe = item.medecins_medecinspecialite?.description || item.specialite || "";

    return (
      <AppCard style={styles.itemCard}>
        <View style={styles.leftIcon}>
          <Ionicons name="person" size={22} color={COLORS.textOnBrand} />
        </View>

        <View style={styles.itemBody}>
          <View style={styles.itemTopRow}>
            <Text style={styles.itemTitle} numberOfLines={1}>
              {item.nom}
            </Text>

            {item.classification ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{String(item.classification).toUpperCase()}</Text>
              </View>
            ) : null}
          </View>

          {!!spe ? (
            <Text style={styles.line} numberOfLines={1}>
              {spe}
            </Text>
          ) : null}

          <Text style={styles.line} numberOfLines={1}>
            <Text style={styles.labelInline}>{b("Tél", "هاتف")}: </Text>
            {phone}
          </Text>

          {!!region ? (
            <Text style={styles.meta} numberOfLines={1}>
              {region}
            </Text>
          ) : null}

          <Text style={styles.meta} numberOfLines={1}>
            {b("Dernière visite", "آخر زيارة")} : {lastDate || "—"}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {b("Par", "بواسطة")} : {lastBy || "—"}
          </Text>
        </View>

        <Pressable style={styles.mapBtn} onPress={() => openMedecinMap(lat, lon, item.nom)} hitSlop={10}>
          <Ionicons name="location-outline" size={20} color={COLORS.brand} />
        </Pressable>
      </AppCard>
    );
  };

  if (!signedIn) {
    return (
      <SafeAreaView edges={["top", "bottom"]} style={[styles.safe, { paddingBottom: Math.max(0, insets.bottom) }]}>
        <View style={{ padding: SPACING.lg }}>
          <Text style={styles.empty}>{b("Veuillez vous connecter.", "يرجى تسجيل الدخول.")}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const Filters = (
    <View style={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.md }}>
      <AppCard style={{ padding: SPACING.lg }}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={b("Rechercher par nom...", "بحث بالاسم...")}
          placeholderTextColor={COLORS.textMuted}
          style={styles.search}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />

        {showUserFilter ? (
          <View style={{ marginBottom: SPACING.md }}>
            <Text style={styles.fieldLabel}>{b("Utilisateur", "مستخدم")}</Text>
            <View style={styles.pickerWrap}>
              <Picker
                selectedValue={userFilter}
                onValueChange={(v) => setUserFilter(String(v))}
                dropdownIconColor={COLORS.textMuted}
                style={styles.picker}
              >
                {role === "Countrymanager" ? <Picker.Item label={b("Tous", "الكل")} value="tous" color={COLORS.text} /> : null}
                <Picker.Item label={b("Moi", "أنا")} value="moi" color={COLORS.text} />
                {refs.users.map((u) => (
                  <Picker.Item key={u.id} label={fullName(u)} value={String(u.id)} color={COLORS.text} />
                ))}
              </Picker>
            </View>
          </View>
        ) : null}

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>{b("Wilaya", "ولاية")}</Text>
            <View style={styles.pickerWrap}>
              <Picker
                selectedValue={wilayaId}
                onValueChange={(v) => setWilayaId(String(v))}
                dropdownIconColor={COLORS.textMuted}
                style={styles.picker}
              >
                <Picker.Item label={b("Toutes", "الكل")} value="all" color={COLORS.text} />
                {refs.wilayas.map((w) => (
                  <Picker.Item key={w.id} label={w.nom} value={String(w.id)} color={COLORS.text} />
                ))}
              </Picker>
            </View>
          </View>

          <View style={{ width: SPACING.sm }} />

          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>{b("Classification", "تصنيف")}</Text>
            <View style={styles.pickerWrap}>
              <Picker
                selectedValue={classification}
                onValueChange={(v) => setClassification(String(v))}
                dropdownIconColor={COLORS.textMuted}
                style={styles.picker}
              >
                <Picker.Item label={b("Toutes", "الكل")} value="all" color={COLORS.text} />
                {(refs.classifications?.length ? refs.classifications : ["a", "b", "c", "d", "e", "f", "g", "p"]).map((c) => (
                  <Picker.Item key={c} label={String(c).toUpperCase()} value={c} color={COLORS.text} />
                ))}
              </Picker>
            </View>
          </View>
        </View>

        <View style={{ marginTop: SPACING.md }}>
          <Text style={styles.fieldLabel}>{b("Spécialité", "اختصاص")}</Text>
          <View style={styles.pickerWrap}>
            <Picker
              selectedValue={specialiteId}
              onValueChange={(v) => setSpecialiteId(String(v))}
              dropdownIconColor={COLORS.textMuted}
              style={styles.picker}
            >
              <Picker.Item label={b("Toutes", "الكل")} value="all" color={COLORS.text} />
              {refs.specialites.map((s) => (
                <Picker.Item key={s.id} label={s.description} value={String(s.id)} color={COLORS.text} />
              ))}
            </Picker>
          </View>
        </View>

        {loadingRefs || loadingList ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={COLORS.brand} />
            <Text style={styles.loadingText}>{b("Chargement…", "جارٍ التحميل…")}</Text>
          </View>
        ) : null}
      </AppCard>
    </View>
  );

  return (
    <SafeAreaView edges={["bottom"]} style={[styles.safe, { paddingBottom: Math.max(0, insets.bottom) }]}>
      <AppHeader title="LISTE DES CLIENTS" titleAr="قائمة العملاء" onBack={() => router.back()} />

      <FlatList
        data={items}
        keyExtractor={(it) => String(it.id)}
        renderItem={renderItem}
        ListHeaderComponent={Filters}
        contentContainerStyle={{ paddingBottom: SPACING.xl }}
        ItemSeparatorComponent={() => <View style={{ height: SPACING.md }} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />}
        onEndReachedThreshold={0.35}
        onEndReached={onEndReached}
        ListEmptyComponent={
          loadingList ? null : <Text style={styles.empty}>{b("Aucun client trouvé.", "لا يوجد عملاء.")}</Text>
        }
        ListFooterComponent={
          page < totalPages ? (
            <View style={styles.footer}>
              <ActivityIndicator color={COLORS.brand} />
            </View>
          ) : (
            <View style={styles.footerSpace} />
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },

  // Filters
  search: {
    height: 52,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    paddingHorizontal: 12,
    color: COLORS.text,
    fontWeight: "700",
    marginBottom: SPACING.md,
  },

  fieldLabel: {
    fontSize: TYPO.small,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: 8,
  },

  row: {
    flexDirection: "row",
    alignItems: "flex-end",
  },

  pickerWrap: {
    height: 52,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    overflow: "hidden",
    justifyContent: "center",
    paddingHorizontal: Platform.OS === "android" ? 6 : 0,
  },
  picker: {
    height: 52,
    width: "100%",
    color: COLORS.text, // ensures selected value is readable
  },

  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: SPACING.md,
  },
  loadingText: { color: COLORS.textMuted, fontSize: TYPO.small, fontWeight: "700" },

  // List / item card
  itemCard: {
    marginHorizontal: SPACING.lg,
    padding: SPACING.md,
    flexDirection: "row",
    alignItems: "center",
  },

  leftIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: COLORS.brand,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  itemBody: { flex: 1 },

  itemTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  itemTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "900",
    color: COLORS.text,
  },

  badge: {
    backgroundColor: COLORS.cardAlt,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  badgeText: { fontSize: 12, fontWeight: "900", color: COLORS.text },

  line: { marginTop: 6, fontSize: 13, color: COLORS.text, fontWeight: "700" },
  labelInline: { color: COLORS.textMuted, fontWeight: "800" },

  meta: { marginTop: 6, fontSize: 12, color: COLORS.textMuted, fontWeight: "700" },

  mapBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.cardAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },

  empty: {
    textAlign: "center",
    color: COLORS.textMuted,
    padding: 20,
    fontWeight: "700",
  },

  footer: { paddingVertical: 16 },
  footerSpace: { height: 12 },
});
