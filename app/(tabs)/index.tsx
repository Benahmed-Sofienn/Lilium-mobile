import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, Href } from "expo-router";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/auth/AuthContext";

type ModuleItem = {
  key: string;
  title: string;
  leftIcon: keyof typeof MaterialCommunityIcons.glyphMap;
   listRoute: Href;
  newRoute: Href;
};

export default function HomeDashboard() {
   const insets = useSafeAreaInsets(); 
  const router = useRouter();
  const { logout } = useAuth();

  // Adjust once to match your logo green precisely
  const BRAND_GREEN = "#2FA84F";

  const todayLabel = useMemo(() => {
    // Example output close to: "Ven. 19 Déc"
    const d = new Date();
    const weekday = new Intl.DateTimeFormat("fr-FR", { weekday: "short" }).format(d);
    const day = new Intl.DateTimeFormat("fr-FR", { day: "2-digit" }).format(d);
    const month = new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(d);
    // Capitalize first letter (some devices output lowercase)
    const cap = (s: string) => (s.length ? s[0].toUpperCase() + s.slice(1) : s);
    return `${cap(weekday)} ${day} ${cap(month)}`.replace(".", "."); // keep dot style
  }, []);

  const modules: ModuleItem[] = useMemo(
    () => [
      {
        key: "planning",
        title: "Planning",
        leftIcon: "calendar-text",
        listRoute: "/planning" as const,
        newRoute: "/planning/new" as const,
      },
      {
        key: "medecins",
        title: "Liste Médecins",
        leftIcon: "clipboard-text",
        listRoute: "/medecins" as const,
        newRoute: "/medecins/new" as const,
      },
      {
        key: "rapports",
        title: "Liste des rapports",
        leftIcon: "file-document-outline",
        listRoute: "/rapports" as const,
        newRoute: "/rapports/new" as const,
      },
      {
        key: "produits",
        title: "Produits",
        leftIcon: "pill",
        listRoute: "/produits" as const,
        newRoute: "/produits/new" as const,
      },
      {
        key: "bon-commande",
        title: "Bon de Commande",
        leftIcon: "file-sign",
        listRoute: "/bons-commande" as const,
        newRoute: "/bons-commande/new" as const,
      },
      {
        key: "bon-sortie",
        title: "Bon de Sortie",
        leftIcon: "file-export-outline",
        listRoute: "/bons-sortie" as const,
        newRoute: "/bons-sortie/new" as const,
      },
      {
        key: "conges",
        title: "Congés & Absences",
        leftIcon: "calendar-check-outline",
         listRoute: "/conges" as const, 
        newRoute: "/conges/new" as const,
      },
    ],
    []
  );

  const Card = ({ item }: { item: ModuleItem }) => {
    return (
      <View style={styles.card}>
        <View style={[styles.leftIconWrap, { backgroundColor: BRAND_GREEN }]}>
          <MaterialCommunityIcons name={item.leftIcon} size={22} color="#FFFFFF" />
        </View>

        <Text style={styles.cardTitle} numberOfLines={1}>
          {item.title}
        </Text>

        <View style={styles.actions}>
          <Pressable
            onPress={() => router.push(item.newRoute)}
            style={({ pressed }) => [
              styles.actionBtn,
              { backgroundColor: BRAND_GREEN },
              pressed && styles.pressed,
            ]}
            accessibilityLabel={`Ajouter - ${item.title}`}
          >
            <Ionicons name="add" size={18} color="#FFFFFF" />
          </Pressable>

          <Pressable
            onPress={() => router.push(item.listRoute)}
            style={({ pressed }) => [
              styles.actionBtn,
              styles.actionBtnSecondary,
              pressed && styles.pressed,
            ]}
            accessibilityLabel={`Voir la liste - ${item.title}`}
          >
            <MaterialCommunityIcons name="format-list-bulleted" size={18} color={BRAND_GREEN} />
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView edges={["left", "right"]} style={styles.screen}>
  {/* Topbar */}
  <View style={[styles.topbar, { paddingTop: Math.max(insets.top, 8) }]}>
    <Text style={styles.dateText} numberOfLines={1}>
      {todayLabel}
    </Text>

    <View style={styles.topbarRight}>
      <Pressable onPress={() => router.push("/profile")} style={styles.topbarIcon}>
        <Ionicons name="person" size={20} color={stylesVars.textDark} />
      </Pressable>

      <Pressable onPress={logout} style={styles.topbarIcon}>
  <Ionicons name="log-out-outline" size={20} color={BRAND_GREEN} />
</Pressable>
    </View>
  </View>

  {/* List */}
  <FlatList
    contentContainerStyle={[
      styles.listContent,
      { paddingBottom: insets.bottom + 24 },
    ]}
    data={modules}
    keyExtractor={(i) => i.key}
    renderItem={({ item }) => <Card item={item} />}
    showsVerticalScrollIndicator={false}
    scrollIndicatorInsets={{ bottom: insets.bottom }}
  />
</SafeAreaView>

  );
}

const stylesVars = {
  bg: "#F4F6F8",
  cardBg: "#FFFFFF",
  border: "#E5E7EB",
  textDark: "#0F172A",
  textMuted: "#64748B",
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  topbar: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dateText: {
    fontSize: 14,
    fontWeight: "700",
    color: stylesVars.textDark,
  },
  topbarRight: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  topbarIcon: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: stylesVars.border,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 18,
    paddingTop: 6,
  },
  card: {
    backgroundColor: stylesVars.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: stylesVars.border,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.06,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 2 },
    }),
  },
  leftIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  cardTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
    color: stylesVars.textDark,
  },
  actions: {
    flexDirection: "column",
    gap: 8,
    alignItems: "center",
  },
  actionBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnSecondary: {
    backgroundColor: "#EEF2F6",
  },
  pressed: {
    opacity: 0.85,
  },
});
