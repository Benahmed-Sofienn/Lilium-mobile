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
import { AppSelect, type AppSelectOption } from "../../../src/components/AppSelect";

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

// --- Stats / segmentation (Medical vs Commercial) ---
const COMMERCIAL_SPECIALITE_KEYWORDS = [
  "pharmacie",
  "grossiste",
  "super gros",
  "supergros",
  "super-gros",
];

const normalizeText = (s: any) => {
  const str = (s ?? "").toString().trim().toLowerCase();
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/\s+/g, " "); // collapse spaces
};

const getSpecialiteLabel = (m: any) => {
  // Keep consistent with your renderItem logic:
  // item.medecins_medecinspecialite?.description || item.specialite || ""
  return (
    m?.medecins_medecinspecialite?.description ||
    m?.specialite ||
    m?.specialité ||
    m?.speciality ||
    ""
  );
};

const isCommercialSpecialite = (specialiteLabel: any) => {
  const spec = normalizeText(specialiteLabel);
  return COMMERCIAL_SPECIALITE_KEYWORDS.some((kw) => spec.includes(normalizeText(kw)));
};

const buildMedecinsStats = (list: any[]) => {
  let medicalTotal = 0;
  let commercialTotal = 0;

  const medicalBySpec = new Map<string, number>();
  const commercialBySpec = new Map<string, number>();

  for (const m of list) {
    const rawSpec = getSpecialiteLabel(m);
    const specLabel = (rawSpec ?? "").toString().trim() || "Non renseignée";

    if (isCommercialSpecialite(specLabel)) {
      commercialTotal += 1;
      commercialBySpec.set(specLabel, (commercialBySpec.get(specLabel) ?? 0) + 1);
    } else {
      medicalTotal += 1;
      medicalBySpec.set(specLabel, (medicalBySpec.get(specLabel) ?? 0) + 1);
    }
  }

  const sortDesc = (a: [string, number], b: [string, number]) => b[1] - a[1];

  return {
    total: list.length,
    medicalTotal,
    commercialTotal,
    medicalList: Array.from(medicalBySpec.entries()).sort(sortDesc),
    commercialList: Array.from(commercialBySpec.entries()).sort(sortDesc),
  };
};

const formatSpecLine = (pairs: [string, number][]) =>
  pairs.map(([name, count]) => `${count} ${name}`).join(" ; ");



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

  const [totalItems, setTotalItems] = useState(0);

type MedecinsStatsApi = {
  total: number;
  medical: { total: number; bySpecialite: { label: string; count: number }[] };
  commercial: { total: number; bySpecialite: { label: string; count: number }[] };
};

const [serverStats, setServerStats] = useState<MedecinsStatsApi | null>(null);
const [loadingServerStats, setLoadingServerStats] = useState(false);

const formatApiLine = (arr?: { label: string; count: number }[]) =>
  arr?.length ? arr.map((x) => `${x.count} ${x.label}`).join(" ; ") : "";


  

  // Filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [wilayaId, setWilayaId] = useState<string>("all");
  const [specialiteId, setSpecialiteId] = useState<string>("all");
  const [classification, setClassification] = useState<string>("all");
  const [visitStatus, setVisitStatus] = useState<"all" | "visited" | "not_visited">("all");

 const pageStats = useMemo(() => buildMedecinsStats(items), [items]);

const medicalLine = useMemo(() => formatSpecLine(pageStats.medicalList), [pageStats.medicalList]);
const commercialLine = useMemo(() => formatSpecLine(pageStats.commercialList), [pageStats.commercialList]);




  // "tous" | "moi" | "<userId>"
  const [userFilter, setUserFilter] = useState<string>("");
const didInitUserFilter = useRef(false);

useEffect(() => {
  if (!signedIn || !(me as any)?.id) return;
  if (didInitUserFilter.current) return;

  // Default = connected user (by id). Label shown will be their name.
  setUserFilter(String((me as any).id));

  didInitUserFilter.current = true;
}, [signedIn, me]);


  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const effectiveDelegueId = useMemo(() => {
    if (!signedIn || !(me as any)?.id) return null;

    if (!showUserFilter) return null;

    if (userFilter === "tous") return null;

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
    if (effectiveDelegueId !== null) params.delegue_id = effectiveDelegueId;

    // NEW: visit status filter
    if (visitStatus !== "all") params.visit_status = visitStatus;

    return params;
  },
  [debouncedSearch, wilayaId, specialiteId, classification, effectiveDelegueId, visitStatus]
);


  const loadReferentiels = useCallback(async () => {
    if (!signedIn) return;
    setLoadingRefs(true);
    try {
      const params: any = {};
      if (effectiveDelegueId !== null) params.delegue_id = effectiveDelegueId;


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
        const ti = meta?.totalItems ? Number(meta.totalItems) : 0;
setTotalItems(Number.isFinite(ti) && ti >= 0 ? ti : 0);


        const tp = meta?.totalPages ? Number(meta.totalPages) : 1;
        setTotalPages(Number.isFinite(tp) && tp > 0 ? tp : 1);

        setItems((prev) => (mode === "append" ? [...prev, ...nextItems] : nextItems));
      } finally {
        setLoadingList(false);
      }
    },
    [signedIn, buildParams]
  );

  const loadServerStats = useCallback(async () => {
  if (!signedIn) return;
  setLoadingServerStats(true);
  try {
    // reuse your filters, but remove pagination
    const params: any = buildParams(1);
    delete params.page;
    delete params.limit;

    const res = await api.get("/medecins/stats", { params });
    setServerStats(res.data as MedecinsStatsApi);
  } finally {
    setLoadingServerStats(false);
  }
}, [signedIn, buildParams]);


  useEffect(() => {
  if (!signedIn) return;
  setPage(1);
  loadList(1, "replace");
loadReferentiels();
loadServerStats();

}, [signedIn, debouncedSearch, wilayaId, specialiteId, classification, effectiveDelegueId, visitStatus, loadList, loadReferentiels]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setPage(1);
      await Promise.all([loadList(1, "replace"), loadReferentiels(), loadServerStats()]);

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

  const userOptions = useMemo(() => {
  if (!signedIn || !(me as any)?.id) return [];

  const meId = String((me as any).id);
  const meLabel = fullName({ id: (me as any).id, first_name: (me as any).first_name, last_name: (me as any).last_name });

  const opts: AppSelectOption[] = [];

  if (role === "Countrymanager") {
    opts.push({ id: "tous", label: b("Tous", "الكل"), keywords: "tous all" });
  }

  // Connected user (by name, not “Moi”)
  opts.push({ id: meId, label: meLabel, keywords: meLabel });

  // Other users (avoid duplicate me)
  opts.push(
    ...refs.users
      .filter((u) => String(u.id) !== meId)
      .map((u) => {
        const label = fullName(u);
        return { id: String(u.id), label, keywords: label };
      })
  );

  return opts;
}, [signedIn, me, role, refs.users, fullName]);


const wilayaOptions = useMemo<AppSelectOption[]>(
  () => [
    { id: "all", label: b("Toutes", "الكل"), keywords: "toutes all" },
    ...refs.wilayas.map((w) => ({ id: String(w.id), label: w.nom })),
  ],
  [refs.wilayas]
);

const visitStatusOptions = useMemo<AppSelectOption[]>(
  () => [
    { id: "all", label: b("Tous", "الكل"), keywords: "tous all" },
    { id: "visited", label: b("Visité", "تمت الزيارة"), keywords: "visite visited month" },
    { id: "not_visited", label: b("Pas visité", "لم تتم الزيارة"), keywords: "pas non not unvisited month" },
  ],
  []
);



const classificationOptions = useMemo<AppSelectOption[]>(() => {
  const base = refs.classifications?.length
    ? refs.classifications
    : ["a", "b", "c", "d", "e", "f", "g", "p"];

  return [
    { id: "all", label: b("Toutes", "الكل"), keywords: "toutes all" },
    ...base.map((c) => ({
      id: String(c),
      label: String(c).toUpperCase(),
      keywords: String(c),
    })),
  ];
}, [refs.classifications]);

const specialiteOptions = useMemo<AppSelectOption[]>(
  () => [
    { id: "all", label: b("Toutes", "الكل"), keywords: "toutes all" },
    ...refs.specialites.map((s) => ({ id: String(s.id), label: s.description })),
  ],
  [refs.specialites]
);


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
           
              <AppSelect
  title="Utilisateur"
  titleAr="مستخدم"
  value={userFilter}
  options={userOptions}
  allowClear={false}
  onChange={(v) => {
    // disallow null; keep a valid id
    setUserFilter(v == null ? String((me as any).id) : String(v));
  }}
/>

           
          </View>
        ) : null}

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
           
              <AppSelect
  title="Wilaya"
  titleAr="ولاية"
  value={wilayaId}
  options={wilayaOptions}
  allowClear={true}
  onChange={(v) => setWilayaId(v == null ? "all" : String(v))}
/>


         
          </View>

          <View style={{ width: SPACING.sm }} />

          <View style={{ flex: 1 }}>
         
              <AppSelect
  title="Classification"
  titleAr="تصنيف"
  value={classification}
  options={classificationOptions}
  allowClear={true}
  onChange={(v) => setClassification(v == null ? "all" : String(v))}
/>


           
          </View>
        </View>

        <View style={{ marginTop: SPACING.md }}>
       
            <AppSelect
  title="Spécialité"
  titleAr="اختصاص"
  value={specialiteId}
  options={specialiteOptions}
  allowClear={true}
  onChange={(v) => setSpecialiteId(v == null ? "all" : String(v))}
/>


                  <View style={{ width: SPACING.sm }} />


        <View style={{ marginBottom: SPACING.md }}>
  <AppSelect
    title="Visites"
    titleAr="الزيارات"
    value={visitStatus}
    options={visitStatusOptions}
    allowClear={false}
    onChange={(v) => setVisitStatus((v == null ? "all" : String(v)) as any)}
  />
</View>


         
        </View>

        {loadingRefs || loadingList ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={COLORS.brand} />
            <Text style={styles.loadingText}>{b("Chargement…", "جارٍ التحميل…")}</Text>
          </View>
        ) : null}


      </AppCard>

      {/* Stats card (under filters, before list) */}
      <AppCard style={styles.statsCard}>
        <Text style={styles.statsHeader}>
  {b("Résultats", "النتائج")} : {totalItems || serverStats?.total || pageStats.total}
</Text>

<Text style={styles.statsTitle}>
  {(serverStats?.medical.total ?? pageStats.medicalTotal)} {b("Médical", "طبي")}
</Text>
<Text style={styles.statsLine}>
  {formatApiLine(serverStats?.medical.bySpecialite) || medicalLine || "—"}
</Text>

<View style={{ height: SPACING.md }} />

<Text style={styles.statsTitle}>
  {(serverStats?.commercial.total ?? pageStats.commercialTotal)} {b("Commercial", "تجاري")}
</Text>
<Text style={styles.statsLine}>
  {formatApiLine(serverStats?.commercial.bySpecialite) || commercialLine || "—"}
</Text>

{loadingServerStats ? (
  <View style={{ marginTop: SPACING.md }}>
    <ActivityIndicator color={COLORS.brand} />
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
  statsCard: {
  marginTop: SPACING.md,
  padding: SPACING.lg,
},

statsHeader: {
  fontSize: TYPO.small,
  fontWeight: "900",
  color: COLORS.text,
  marginBottom: 10,
},

statsTitle: {
  fontSize: TYPO.small,
  fontWeight: "900",
  color: COLORS.text,
  marginBottom: 6,
},

statsLine: {
  fontSize: 12,
  fontWeight: "700",
  color: COLORS.textMuted,
},

});
