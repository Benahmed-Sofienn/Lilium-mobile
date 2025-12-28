import React, { useMemo } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../src/auth/AuthContext";

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state, logout } = useAuth();

  const BRAND_GREEN = "#2FA84F";

  const user = state.user;

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

  // Adjust these keys to match your backend payload (safe: shows "—" if missing)
  const rows: Array<{ label: string; value: string }> = [
    { label: "ID", value: String((user as any)?.id ?? "—") },
    { label: "Username", value: String((user as any)?.username ?? "—") },
    { label: "Nom", value: String((user as any)?.full_name ?? (user as any)?.name ?? "—") },
    { label: "Email", value: String((user as any)?.email ?? "—") },
    { label: "Rôle", value: String((user as any)?.role ?? "—") },
    { label: "Téléphone", value: String((user as any)?.phone ?? "—") },
  ];

  return (
    <SafeAreaView edges={["left", "right"]} style={styles.screen}>
      {/* Topbar */}
      <View style={[styles.topbar, { paddingTop: Math.max(insets.top, 8) }]}>
        <Pressable onPress={() => router.back()} style={styles.topbarIcon}>
          <Ionicons name="arrow-back" size={20} color="#0F172A" />
        </Pressable>

        <Text style={styles.topbarTitle}>Profil</Text>

        <Pressable onPress={logout} style={styles.topbarIcon} accessibilityLabel="Déconnexion">
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
              {(user as any)?.full_name || (user as any)?.name || (user as any)?.username || "Utilisateur"}
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
  cardTitle: { fontSize: 14, fontWeight: "900", color: "#0F172A", marginBottom: 10 },

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
