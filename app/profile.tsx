import React, { useMemo, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../src/auth/AuthContext";
import { api } from "../src/api/client"; // adjust if your axios client lives elsewhere

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state, logout } = useAuth();

  const BRAND_GREEN = "#2FA84F";

  // Fetch fresh profile from /users/me (so we don't rely only on state.user)
  const [me, setMe] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    if (state.status !== "signedIn") return;

    setLoading(true);
    api
      .get("/users/me")
      .then((r) => {
        if (!alive) return;
        setMe(r.data);
      })
      .catch(() => {
        if (!alive) return;
        setMe(null);
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [state.status]);

  const user = me ?? state.user;

  const initials = useMemo(() => {
    const base =
      (user as any)?.full_name ||
      (user as any)?.name ||
      (user as any)?.username ||
      "U";
    const parts = String(base).trim().split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]?.toUpperCase()).join("") || "U";
  }, [user]);

  // If not signed in, show a minimal state (prevents crash)
  if (state.status !== "signedIn" || !user) {
    return (
      <SafeAreaView edges={["left", "right"]} style={styles.screen}>
        <View style={[styles.topbar, { paddingTop: Math.max(insets.top, 8) }]}>
          <Pressable onPress={() => router.back()} style={styles.topbarIcon}>
            <Ionicons name="arrow-back" size={20} color="#0F172A" />
          </Pressable>
          <Text style={styles.topbarTitle}>Profil</Text>
          <View style={{ width: 34 }} />
        </View>

        <View style={styles.center}>
          <Text style={styles.muted}>Vous n’êtes pas connecté.</Text>
          <Pressable
            onPress={() => router.replace("/(auth)/login")}
            style={[styles.primaryBtn, { backgroundColor: BRAND_GREEN }]}
          >
            <Text style={styles.primaryBtnText}>Aller au login</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // Optionally show loading (inside signedIn block, before computing u)
  if (loading && !user) {
    return (
      <SafeAreaView edges={["left", "right"]} style={styles.screen}>
        <View style={[styles.topbar, { paddingTop: Math.max(insets.top, 8) }]}>
          <Pressable onPress={() => router.back()} style={styles.topbarIcon}>
            <Ionicons name="arrow-back" size={20} color="#0F172A" />
          </Pressable>
          <Text style={styles.topbarTitle}>Profil</Text>
          <View style={{ width: 34 }} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={[styles.muted, { marginTop: 10 }]}>
            Chargement du profil…
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const u: any = user;

  // Helpers
  const fmt = (v: any) => {
    if (v === null || v === undefined || v === "") return "—";
    return String(v);
  };
  const fmtBool = (v: any) => (v === true ? "Oui" : v === false ? "Non" : "—");
  const fmtDate = (v: any) => {
    if (!v) return "—";
    const d = new Date(v);
    return isNaN(d.getTime()) ? fmt(v) : d.toLocaleDateString();
  };
  const mask = (v: any, keepLast = 4) => {
    const s = String(v || "");
    if (!s) return "—";
    if (s.length <= keepLast) return "••••";
    return "•••• " + s.slice(-keepLast);
  };

  // Remarque: selon votre backend, ces champs peuvent être au root (u.telephone)
  // ou sous un objet profile (u.profile.telephone). On essaye les deux.
  const p = u?.profile ?? u;

  const rows: Array<{ label: string; value: string }> = [
    { label: "ID", value: fmt(u?.id) },
    { label: "Username", value: fmt(u?.username) },
    { label: "Nom", value: fmt(u?.full_name ?? u?.name) },
    { label: "Date de naissance", value: fmtDate(p?.date_of_birth) },
    { label: "Genre", value: fmt(p?.gender) },
    { label: "Situation", value: fmt(p?.situation) },
    { label: "Email", value: fmt(u?.email) },
    { label: "Téléphone", value: fmt(p?.telephone ?? u?.phone) },
    { label: "Adresse", value: fmt(p?.adresse) },
    { label: "Poste", value: fmt(p?.job_name) },
    { label: "Rôle", value: fmt(u?.role ?? p?.rolee) },
    { label: "Congé", value: p?.conge != null ? `${p.conge}` : "—" },

    // Champs accounts_userprofile
    { label: "Entreprise", value: fmt(p?.company) },
    { label: "Famille", value: fmt(p?.family) },
    { label: "Spécialité (rôle)", value: fmt(p?.speciality_rolee) },
    { label: "Région", value: fmt(p?.region) },
    { label: "Contrat", value: fmt(p?.contract) },
    { label: "Code contrat", value: fmt(p?.code_contrat) },
    { label: "Code section", value: fmt(p?.code_section) },
    { label: "Date d’entrée", value: fmtDate(p?.entry_date) },
    { label: "CNAS", value: fmt(p?.CNAS) },

    
    // Informations sensibles: masquées
    { label: "Salaire", value: p?.salary != null ? `${p.salary}` : "—" },
    { label: "Banque", value: fmt(p?.bank_name) },
    { label: "Compte bancaire", value: mask(p?.bank_account) },
  ];

  return (
    <SafeAreaView edges={["left", "right"]} style={styles.screen}>
      {/* Topbar */}
      <View style={[styles.topbar, { paddingTop: Math.max(insets.top, 8) }]}>
        <Pressable onPress={() => router.back()} style={styles.topbarIcon}>
          <Ionicons name="arrow-back" size={20} color="#0F172A" />
        </Pressable>

        <Text style={styles.topbarTitle}>Profil</Text>

        <Pressable
          onPress={logout}
          style={styles.topbarIcon}
          accessibilityLabel="Déconnexion"
        >
          <Ionicons name="log-out-outline" size={20} color={BRAND_GREEN} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 10) + 18 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header card */}
        <View style={styles.headerCard}>
          <View style={[styles.avatar, { backgroundColor: BRAND_GREEN }]}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.nameText}>
              {(user as any)?.full_name ||
                (user as any)?.name ||
                (user as any)?.username ||
                "Utilisateur"}
            </Text>
            <Text style={styles.subText}>
              {(user as any)?.email || (user as any)?.role || "Compte connecté"}
            </Text>
          </View>
        </View>

        {/* Info card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Informations</Text>

          {rows.map((r) => (
            <View key={r.label} style={styles.row}>
              <Text style={styles.rowLabel}>{r.label}</Text>
              <Text style={styles.rowValue} numberOfLines={1}>
                {r.value}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F4F6F8" },

  topbar: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  topbarTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0F172A",
  },
  topbarIcon: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },

  content: { paddingHorizontal: 12, paddingTop: 6 },

  headerCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 12,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#FFF", fontSize: 18, fontWeight: "900" },
  nameText: { fontSize: 16, fontWeight: "900", color: "#0F172A" },
  subText: { fontSize: 13, color: "#64748B", marginTop: 2 },

  card: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#0F172A",
    marginBottom: 10,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  rowLabel: { flex: 1, fontSize: 13, fontWeight: "700", color: "#334155" },
  rowValue: { flex: 1, fontSize: 13, color: "#0F172A", textAlign: "right" },

  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: "#F8FAFC",
  },
  actionText: { fontSize: 14, fontWeight: "800" },

  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  muted: { color: "#64748B", marginBottom: 12 },
  primaryBtn: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14 },
  primaryBtnText: { color: "#FFF", fontWeight: "900" },
});
