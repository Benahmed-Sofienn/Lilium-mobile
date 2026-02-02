import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";

import { api } from "../../../src/api/client";
import { useAuth } from "../../../src/auth/AuthContext";
import { COLORS, RADIUS, SPACING, TYPO } from "../../../src/ui/theme";
import { AppHeader } from "../../../src/components/AppHeader";
import { AppCard } from "../../../src/components/AppCard";
import { ZoomableImage } from "../../../src/components/ZoomableImage";



function buildOrderImageUrl(imagePath?: string | null) {
  const p = String(imagePath ?? "").trim();
  if (!p) return null;

  // Already absolute URL
  if (/^https?:\/\//i.test(p)) return p;

  // Use the same base as your API client
  const base0 = String((api.defaults as any)?.baseURL ?? "").replace(/\/+$/, "");
  const base = base0.replace(/\/api$/i, ""); // media is typically NOT under /api

  // If we can't detect a base, at least return a usable relative path
  if (!base) return p.startsWith("/") ? p : `/${p}`;

  // If backend stored a leading slash (ex: "/media/..")
  if (p.startsWith("/")) return `${base}${p}`;

  // If already contains "media/.."
  if (p.startsWith("media/")) return `${base}/${p}`;

  // Standard: store "uploads/orders/xx.jpg" -> serve from "/media/uploads/orders/xx.jpg"
  return `${base}/media/${p}`;
}


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

function safeNumber(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmtMoney(v: number) {
  // Keep it simple & consistent (you can add "DA" if you want)
  return v.toLocaleString("fr-DZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDateTime(isoLike: any) {
  const d = new Date(isoLike);
  if (Number.isNaN(d.getTime())) return String(isoLike ?? "");
  const dd = `${d.getDate()}`.padStart(2, "0");
  const mm = `${d.getMonth() + 1}`.padStart(2, "0");
  const yy = d.getFullYear();
  const hh = `${d.getHours()}`.padStart(2, "0");
  const mi = `${d.getMinutes()}`.padStart(2, "0");
  return `${dd}/${mm}/${yy} ${hh}:${mi}`;
}

function buildMediaUrl(path: string) {
  // api client baseURL is usually ".../api"
  const apiUrl = process.env.EXPO_PUBLIC_API_URL || "";
  const base = apiUrl.replace(/\/api\/?$/i, ""); // remove trailing /api
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;

  const clean = String(path).replace(/^\/+/, "");
  return `${base}/${clean}`;
}

type BonDetails = {
  id: number;
  added: string;
  status: string;
  observation?: string | null;
  image?: string | null;

  clients_client?: { name?: string | null; supergro?: boolean | null } | null;

  medecins_medecin_orders_order_pharmacy_idTomedecins_medecin?: {
    nom?: string | null;
    adresse?: string | null;
  } | null;

  medecins_medecin_orders_order_gros_idTomedecins_medecin?: {
    nom?: string | null;
    adresse?: string | null;
  } | null;

  auth_user_orders_order_user_idToauth_user?: {
    first_name?: string | null;
    last_name?: string | null;
  } | null;

  orders_orderitem?: Array<{
    qtt: number;
    produits_produit?: { nom?: string | null; price?: number | string | null } | null;
  }>;
};

export default function BonCommandeDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();

  const { state } = useAuth();

  const bonId = useMemo(() => {
    const raw = params?.id;
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
  }, [params?.id]);

  const rawRole =
    state.status === "signedIn"
      ? ((state.user as any)?.role ?? (state.user as any)?.rolee ?? (state.user as any)?.userRole)
      : undefined;

  const roleKey = String(rawRole || "").toLowerCase().replace(/\s+/g, "");
  const canEditStatus = roleKey === "countrymanager" || roleKey === "superviseur";

  const [data, setData] = useState<BonDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [imgInlineLoading, setImgInlineLoading] = useState(false);
  const [imgModalLoading, setImgModalLoading] = useState(false);

  const [imgError, setImgError] = useState<string | null>(null);

  const fetchDetails = useCallback(async () => {
    if (!bonId) {
      setErrorMsg("ID invalide");
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.get(`/bons-commande/${bonId}`);
      setData(res.data as BonDetails);
    } catch (e: any) {
      setData(null);
      setErrorMsg(e?.response?.data?.error ?? "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [bonId]);

  useEffect(() => {
    if (state.status !== "signedIn") return;
    fetchDetails();
  }, [state.status, fetchDetails]);

  const delegueName = useMemo(() => {
    const u = data?.auth_user_orders_order_user_idToauth_user;
    const full = `${u?.first_name ?? ""} ${u?.last_name ?? ""}`.trim();
    return full || "—";
  }, [data]);

  const clientInfo = useMemo(() => {
    const ph = data?.medecins_medecin_orders_order_pharmacy_idTomedecins_medecin;
    const gr = data?.medecins_medecin_orders_order_gros_idTomedecins_medecin;
    const cl = data?.clients_client;

    const clientName =
      ph?.nom || gr?.nom || cl?.name || "Client Inconnu";

    const clientType = ph
      ? "Pharmacie"
      : gr
        ? "Grossiste"
        : cl
          ? (cl?.supergro ? "Super Grossiste" : "Client")
          : "Inconnu";

    const address = ph?.adresse || gr?.adresse || null;

    return { clientName, clientType, address };
  }, [data]);

  const lines = useMemo(() => {
    const arr = Array.isArray(data?.orders_orderitem) ? data!.orders_orderitem! : [];
    return arr.map((it, idx) => {
      const qtt = safeNumber(it.qtt);
      const name = it?.produits_produit?.nom ?? `Produit #${idx + 1}`;
      const pu = safeNumber(it?.produits_produit?.price);
      const total = qtt * pu;
      return { idx, name, qtt, pu, total };
    });
  }, [data]);

  const totalGlobal = useMemo(() => lines.reduce((s, x) => s + x.total, 0), [lines]);

  const activeIdx = useMemo(() => {
    const s = String(data?.status ?? "");
    return STATUS_STEPS.findIndex((x) => x === s);
  }, [data?.status]);

  const onAdvanceStatus = useCallback(
    async (targetStatus: string) => {
      if (!data || !bonId) return;

      const curIdx = STATUS_STEPS.findIndex((x) => x === data.status);
      const tgtIdx = STATUS_STEPS.findIndex((x) => x === targetStatus);
      if (curIdx < 0 || tgtIdx !== curIdx + 1) return;

      // optimistic
      setData((prev) => (prev ? { ...prev, status: targetStatus } : prev));

      try {
        await api.patch(`/bons-commande/${bonId}/status`, { status: targetStatus });
      } catch {
        // rollback
        setData((prev) => (prev ? { ...prev, status: data.status } : prev));
      }
    },
    [data, bonId]
  );

  const imageUrl = useMemo(() => buildOrderImageUrl(data?.image) ?? "", [data?.image]);


  const rightSlot = useMemo(() => {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
               <Pressable onPress={fetchDetails} hitSlop={10} style={styles.headerIconBtn}>
          <Ionicons name="refresh" size={20} color={COLORS.textOnBrand} />
        </Pressable>
      </View>
    );
  }, [imageUrl, fetchDetails]);
  const observationText = useMemo(
  () => String(data?.observation ?? "").trim(),
  [data?.observation]
);



  return (
    <SafeAreaView edges={["bottom"]} style={[styles.safe, { paddingBottom: Math.max(0, insets.bottom) }]}>
      <AppHeader
        title={b("BON N°", "أمر شراء رقم") + (bonId ? ` ${bonId}` : "")}
        titleAr={b("Détails", "التفاصيل")}
        onBack={() => router.back()}
        rightSlot={rightSlot}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.brand} />
        </View>
      ) : errorMsg ? (
        <View style={styles.center}>
          <Text style={{ color: COLORS.textMuted, fontWeight: "800" }}>{errorMsg}</Text>
          <View style={{ height: SPACING.md }} />
          <Pressable style={styles.retryBtn} onPress={fetchDetails}>
            <Ionicons name="refresh" size={18} color={COLORS.textOnBrand} />
            <Text style={styles.retryBtnText}>{b("Réessayer", "إعادة المحاولة")}</Text>
          </Pressable>
        </View>
      ) : !data ? (
        <View style={styles.center}>
          <Text style={{ color: COLORS.textMuted }}>{b("Aucun détail", "لا توجد تفاصيل")}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {/* Image FIRST */}
{imageUrl ? (
  <View style={styles.heroImage}>
    <ZoomableImage uri={imageUrl} height={320} />
  </View>
) : null}


          {/* Meta */}
          <AppCard style={{ marginBottom: SPACING.md }}>
            <Text style={styles.h1}>{b("Informations", "معلومات")}</Text>

            <View style={styles.kvRow}>
              <Text style={styles.k}>{b("Délégué", "المندوب")}</Text>
              <Text style={styles.v} numberOfLines={1}>{delegueName}</Text>
            </View>

            <View style={styles.kvRow}>
              <Text style={styles.k}>{b("Ajouté le", "أضيف في")}</Text>
              <Text style={styles.v}>{fmtDateTime(data.added)}</Text>
            </View>

            <View style={styles.kvRow}>
              <Text style={styles.k}>{b("Statut", "الحالة")}</Text>
              <Text style={styles.v}>
                {String(data.status)}{" "}
                <Text style={{ color: COLORS.textMuted }}>({statusAr(String(data.status))})</Text>
              </Text>
            </View>

            {/* Status progression (same UX as list) */}
            <View style={styles.statusRow}>
              {STATUS_STEPS.map((s, idx) => {
                const isActive = idx === activeIdx;
                const isDone = activeIdx >= 0 && idx < activeIdx;

                return (
                  <View key={s} style={styles.statusStepWrap}>
                    <Pressable
                      disabled={!canEditStatus || idx !== activeIdx + 1}
                      onPress={() => onAdvanceStatus(s)}
                      style={[
                        styles.statusPill,
                        isDone && styles.statusPillDone,
                        isActive && styles.statusPillActive,
                      ]}
                    >
                      <Text style={[styles.statusFr, isActive && styles.statusTextActive]} numberOfLines={1}>
                        {s}
                      </Text>
                      <Text style={[styles.statusAr, isActive && styles.statusTextActive]} numberOfLines={1}>
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
          </AppCard>

          {/* Client */}
          <AppCard style={{ marginBottom: SPACING.md }}>
            <Text style={styles.h1}>{b("Client", "العميل")}</Text>

            <View style={styles.kvRow}>
              <Text style={styles.k}>{b("Type", "النوع")}</Text>
              <Text style={styles.v}>{clientInfo.clientType}</Text>
            </View>

            <View style={styles.kvRow}>
              <Text style={styles.k}>{b("Nom", "الاسم")}</Text>
              <Text style={styles.v}>{clientInfo.clientName}</Text>
            </View>

            {clientInfo.address ? (
              <View style={styles.kvRow}>
                <Text style={styles.k}>{b("Adresse", "العنوان")}</Text>
                <Text style={styles.v}>{clientInfo.address}</Text>
              </View>
            ) : null}
          </AppCard>

          {/* Produits */}
          <AppCard style={{ marginBottom: SPACING.md }}>
            <View style={styles.rowBetween}>
              <Text style={styles.h1}>{b("Produits", "المنتجات")}</Text>
              <Text style={styles.totalSmall}>{b("Total", "المجموع")} : {fmtMoney(totalGlobal)}</Text>
            </View>

            <View style={[styles.tableRow, styles.tableHead]}>
              <Text style={[styles.th, { flex: 1 }]}>{b("Produit", "المنتج")}</Text>
              <Text style={[styles.th, { width: 52, textAlign: "center" }]}>{b("Qtt", "كمية")}</Text>
              <Text style={[styles.th, { width: 80, textAlign: "right" }]}>{b("PU", "سعر")}</Text>
              <Text style={[styles.th, { width: 90, textAlign: "right" }]}>{b("Total", "المجموع")}</Text>
            </View>

            {lines.map((ln) => (
              <View key={ln.idx} style={styles.tableRow}>
                <Text style={[styles.td, { flex: 1 }]} numberOfLines={2}>{ln.name}</Text>
                <Text style={[styles.td, { width: 52, textAlign: "center" }]}>{ln.qtt}</Text>
                <Text style={[styles.td, { width: 80, textAlign: "right" }]}>{fmtMoney(ln.pu)}</Text>
                <Text style={[styles.td, { width: 90, textAlign: "right", fontWeight: "900" }]}>{fmtMoney(ln.total)}</Text>
              </View>
            ))}

            {lines.length === 0 ? (
              <View style={{ paddingTop: 10 }}>
                <Text style={{ color: COLORS.textMuted }}>{b("Aucun produit", "لا توجد منتجات")}</Text>
              </View>
            ) : null}
          </AppCard>

          {/* Observation only if exists */}
{observationText ? (
  <AppCard style={{ marginBottom: SPACING.xl }}>
    <Text style={styles.h1}>Observation | ملاحظة</Text>
    <Text style={styles.obs}>{observationText}</Text>
  </AppCard>
) : null}


        </ScrollView>
      )}

      {/* Image modal */}
      <Modal
        visible={imageModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setImageModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.imageSheet, { paddingBottom: Math.max(12, insets.bottom) }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{b("Image du bon", "صورة أمر الشراء")}</Text>
              <Pressable
                onPress={() => setImageModalVisible(false)}
                hitSlop={10}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={22} color={COLORS.text} />
              </Pressable>
            </View>

            {!imageUrl ? (
              <View style={styles.center}>
                <Text style={{ color: COLORS.textMuted }}>{b("Aucune image", "لا توجد صورة")}</Text>
              </View>
            ) : (
              <View style={styles.imageWrap}>
                {imgModalLoading ? (
  <View style={styles.imgLoader}>
    <ActivityIndicator color={COLORS.brand} />
  </View>
) : null}


                <Image
                  source={{ uri: imageUrl }}
                  style={styles.image}
                  resizeMode="contain"
                  onLoadStart={() => {
  setImgError(null);
  setImgModalLoading(true);
}}
onLoadEnd={() => setImgModalLoading(false)}
onError={() => {
  setImgModalLoading(false);
  setImgError(b("Impossible de charger l'image", "تعذر تحميل الصورة"));
}}

                />

                {imgError ? (
                  <View style={{ paddingTop: 10 }}>
                    <Text style={{ color: COLORS.danger, fontWeight: "800" }}>{imgError}</Text>
                  </View>
                ) : null}
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },

  content: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xl,
  },

  center: {
    flex: 1,
    paddingVertical: 24,
    alignItems: "center",
    justifyContent: "center",
  },

  headerIconBtn: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },

  retryBtn: {
    height: 46,
    paddingHorizontal: 14,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.brand,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  retryBtnText: {
    color: COLORS.textOnBrand,
    fontWeight: "900",
    fontSize: TYPO.body,
  },

  h1: {
    fontSize: TYPO.h2,
    fontWeight: "900",
    color: COLORS.text,
    marginBottom: 10,
  },

  kvRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 8,
  },
  k: {
    width: 140,
    color: COLORS.textMuted,
    fontWeight: "800",
    fontSize: 12,
  },
  v: {
    flex: 1,
    textAlign: "right",
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 13,
  },

  rowBetween: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 6,
  },
  totalSmall: {
    color: COLORS.brand,
    fontWeight: "900",
  },

  // Status progression (same idea as index.tsx)
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: SPACING.md,
    flexWrap: "nowrap",
  },
  statusStepWrap: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  statusPill: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 999,
    backgroundColor: COLORS.cardAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  statusPillDone: {
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  statusPillActive: {
    backgroundColor: COLORS.brand,
    borderColor: COLORS.brand,
  },
  statusFr: {
    fontSize: 11,
    fontWeight: "900",
    color: COLORS.text,
  },
  statusAr: {
    fontSize: 11,
    fontWeight: "900",
    color: COLORS.text,
    writingDirection: "rtl",
  },
  statusTextActive: {
    color: COLORS.textOnBrand,
  },

  // Table
  tableRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 10,
  },
  tableHead: {
    borderTopWidth: 0,
    paddingBottom: 10,
  },
  th: {
    color: COLORS.textMuted,
    fontWeight: "900",
    fontSize: 11,
  },
  td: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 12,
  },

  obs: {
    color: COLORS.text,
    fontSize: TYPO.body,
    fontWeight: "700",
    lineHeight: 20,
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: SPACING.lg,
  },
  imageSheet: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: TYPO.h2,
    fontWeight: "900",
    color: COLORS.text,
  },
  modalCloseBtn: {
    width: 44,
    height: 44,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  imageWrap: {
    minHeight: 280,
    alignItems: "center",
    justifyContent: "center",
  },
  imgLoader: {
    position: "absolute",
    zIndex: 2,
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 12,
    alignItems: "center",
  },
  image: {
    width: "100%",
    height: 420,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.cardAlt,
  },
  imageTopPress: {
  width: "100%",
  borderRadius: RADIUS.md,
  overflow: "hidden",
  backgroundColor: COLORS.cardAlt,
  borderWidth: 1,
  borderColor: COLORS.border,
},
imageTop: {
  width: "100%",
  height: 260,
  backgroundColor: COLORS.cardAlt,
},
imgLoaderInline: {
  position: "absolute",
  zIndex: 2,
  left: 0,
  right: 0,
  top: 0,
  height: 260,
  alignItems: "center",
  justifyContent: "center",
},
heroImage: {
  marginBottom: SPACING.md,
},


});
