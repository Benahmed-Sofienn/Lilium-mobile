// app/(tabs)/rapports/new.tsx
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import DocumentScanner from "react-native-document-scanner-plugin";

import { useAuth } from "../../../src/auth/AuthContext";
import { authFetch } from "../../../src/api/client";

import { AppHeader } from "../../../src/components/AppHeader";
import { AppCard } from "../../../src/components/AppCard";
import { COLORS, SPACING, TYPO, RADIUS } from "../../../src/ui/theme";

type ScanSlot = "medical" | "commercial";

function ensureFileUri(uri: string) {
  if (!uri) return uri;
  if (uri.startsWith("file://")) return uri;
  return `file://${uri}`; // Android: scanner returns raw path sometimes
}

function guessFilename(base: string) {
  return `${base}_${Date.now()}.jpg`;
}

export default function RapportNewStep1() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state } = useAuth();

  const [medicalUri, setMedicalUri] = useState<string | null>(null);
  const [commercialUri, setCommercialUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const canFinalize = useMemo(() => {
    return !uploading && (Boolean(medicalUri) || Boolean(commercialUri));
  }, [uploading, medicalUri, commercialUri]);

  const scanOne = async (slot: ScanSlot) => {
    try {
      const result = await DocumentScanner.scanDocument({
        maxNumDocuments: 1,
        croppedImageQuality: 90,
      });

      const first = result?.scannedImages?.[0];
      if (!first) return;

      const uri = ensureFileUri(first);

      if (slot === "medical") setMedicalUri(uri);
      else setCommercialUri(uri);
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (!msg.toLowerCase().includes("cancel")) {
        Alert.alert("Scan impossible", msg || "Erreur inconnue");
      }
    }
  };

  const uploadScans = async () => {
    if (state.status !== "signedIn") {
      Alert.alert("Non authentifié", "Veuillez vous reconnecter.");
      router.replace("/(auth)/login");
      return;
    }

    if (!medicalUri && !commercialUri) {
      Alert.alert("Images requises", "Scannez au moins un document.");
      return;
    }

    try {
      setUploading(true);

      const form = new FormData();

      // Backend: image (required) + image2 (optional)
      const primaryUri = medicalUri || commercialUri;
      const secondaryUri = medicalUri && commercialUri ? commercialUri : null;

      if (primaryUri) {
        form.append("image", {
          uri: primaryUri,
          name: guessFilename("scan1"),
          type: "image/jpeg",
        } as any);
      }
      if (secondaryUri) {
        form.append("image2", {
          uri: secondaryUri,
          name: guessFilename("scan2"),
          type: "image/jpeg",
        } as any);
      }

      // Fallback token injection (au cas où authFetch ne l’injecte pas sur FormData)
      const token = (state as any)?.token as string | undefined;

      const res = await authFetch("/rapports/today", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }

      const data = await res.json().catch(() => null);
      const rapportId = data?.rapport?.id;

      router.push({
        pathname: "/rapports/new-step2",
        params: { rapportId: String(rapportId ?? "") },
      });
    } catch (e: any) {
      Alert.alert("Upload échoué", e?.message || "Erreur inconnue");
    } finally {
      setUploading(false);
    }
  };

  const ScanCard = ({
    title,
    subtitle,
    uri,
    onScan,
    onClear,
  }: {
    title: string;
    subtitle: string;
    uri: string | null;
    onScan: () => void;
    onClear: () => void;
  }) => {
    const ok = Boolean(uri);

    return (
      <AppCard style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.badge}>
            <MaterialCommunityIcons name="scanner" size={18} color={COLORS.textOnBrand} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{title}</Text>
            <Text style={styles.cardSub}>{subtitle}</Text>
          </View>

          {ok ? (
            <View style={styles.statusOk}>
              <Ionicons name="checkmark-circle" size={18} color={COLORS.brand} />
              <Text style={[styles.statusText, { color: COLORS.brand }]}>Scanné</Text>
            </View>
          ) : (
            <View style={styles.statusPending}>
              <Ionicons name="ellipse-outline" size={16} color={COLORS.textMuted} />
              <Text style={[styles.statusText, { color: COLORS.textMuted }]}>Non scanné</Text>
            </View>
          )}
        </View>

        {uri ? (
          <View style={styles.previewWrap}>
            <Image source={{ uri }} style={styles.previewImg} resizeMode="cover" />

            <View style={styles.previewActions}>
              <Pressable
                onPress={onScan}
                style={({ pressed }) => [
                  styles.smallBtn,
                  styles.smallBtnGreen,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Ionicons name="scan-outline" size={16} color={COLORS.brand} />
                <Text style={[styles.smallBtnText, { color: COLORS.brand }]}>Rescanner</Text>
              </Pressable>

              <Pressable
                onPress={onClear}
                style={({ pressed }) => [styles.smallBtn, styles.smallBtnRed, pressed && { opacity: 0.85 }]}
              >
                <Ionicons name="trash-outline" size={16} color="#EF4444" />
                <Text style={[styles.smallBtnText, { color: "#EF4444" }]}>Supprimer</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            onPress={onScan}
            style={({ pressed }) => [styles.scanBtn, pressed && { opacity: 0.9 }]}
          >
            <Ionicons name="scan-outline" size={18} color={COLORS.textOnBrand} />
            <Text style={styles.scanBtnText}>Scanner | مسح</Text>
          </Pressable>
        )}
      </AppCard>
    );
  };

  return (
    <SafeAreaView edges={["left", "right", "bottom"]} style={styles.screen}>
      <AppHeader
        title="Nouveau rapport"
        titleAr="تقرير جديد"
        onBack={() => router.back()}
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: (insets.bottom || 0) + 20 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.h1}>Étape 1 | الخطوة 1</Text>
        <Text style={styles.p}>
          Scannez 1 ou 2 documents (médical / commercial). Tant que vous êtes le même jour,
          vous pouvez remplacer le rapport d’aujourd’hui.
        </Text>

        <ScanCard
          title="G.P Médical | طبي"
          subtitle="Scan du document médical"
          uri={medicalUri}
          onScan={() => scanOne("medical")}
          onClear={() => setMedicalUri(null)}
        />

        <ScanCard
          title="G.P Commercial | تجاري"
          subtitle="Scan du document commercial"
          uri={commercialUri}
          onScan={() => scanOne("commercial")}
          onClear={() => setCommercialUri(null)}
        />

        <Pressable
          disabled={!canFinalize}
          onPress={uploadScans}
          style={({ pressed }) => [
            styles.finalizeBtn,
            (!canFinalize || uploading) && { opacity: 0.5 },
            pressed && canFinalize && { opacity: 0.9 },
          ]}
        >
          {uploading ? (
            <ActivityIndicator color={COLORS.textOnBrand} />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={18} color={COLORS.textOnBrand} />
              <Text style={styles.finalizeText}>Finaliser | إنهاء</Text>
            </>
          )}
        </Pressable>

        <Text style={styles.note}>
          Conseil: si l’upload échoue avec “token manquant”, c’est que ton client HTTP n’injecte
          pas le Bearer sur FormData.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  content: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },

  h1: {
    fontSize: 16,
    fontWeight: "900",
    color: COLORS.text,
  },
  p: {
    marginTop: -6,
    color: COLORS.textMuted,
    lineHeight: 18,
  },

  card: {
    padding: SPACING.lg,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
  },
  badge: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.brand,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: COLORS.text,
  },
  cardSub: {
    marginTop: 2,
    fontSize: 12,
    color: COLORS.textMuted,
  },

  statusOk: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusPending: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusText: { fontSize: 12, fontWeight: "800" },

  scanBtn: {
    marginTop: SPACING.md,
    borderRadius: RADIUS.lg,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    backgroundColor: COLORS.brand,
  },
  scanBtnText: {
    color: COLORS.textOnBrand,
    fontWeight: "900",
    fontSize: 14,
  },

  previewWrap: { marginTop: SPACING.md },
  previewImg: {
    width: "100%",
    height: 220,
    borderRadius: RADIUS.lg,
    backgroundColor: Platform.OS === "android" ? "#EAECEF" : "#F1F3F5",
  },
  previewActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
    justifyContent: "flex-end",
  },

  smallBtn: {
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.card,
  },
  smallBtnText: {
    fontSize: TYPO.small,
    fontWeight: "900",
  },
  smallBtnGreen: {
    borderColor: COLORS.brand,
  },
  smallBtnRed: {
    borderColor: "#EF4444",
  },

  finalizeBtn: {
    marginTop: 4,
    borderRadius: RADIUS.lg,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    backgroundColor: COLORS.brand,
  },
  finalizeText: {
    color: COLORS.textOnBrand,
    fontWeight: "900",
    fontSize: 15,
  },

  note: {
    marginTop: 4,
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 16,
  },
});
