import React, { useMemo } from "react";
import { View, Text, StyleSheet, Pressable, FlatList } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, Href } from "expo-router";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";

import { useAuth } from "../../src/auth/AuthContext";
import { AppCard } from "../../src/components/AppCard";
import { COLORS, SPACING, RADIUS, TYPO } from "../../src/ui/theme";

type ModuleItem = {
  key: string;
  titleFr: string;
  titleAr: string;
  leftIcon: keyof typeof MaterialCommunityIcons.glyphMap;
  listRoute: Href;
  newRoute?: Href; 
};

export default function HomeDashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { state, logout } = useAuth(); // ✅ correct based on your AuthContext :contentReference[oaicite:4]{index=4}

  const authUser = state.status === "signedIn" ? state.user : null;

  const displayName = useMemo(() => {
    if (!authUser) return "—";
    const fn = (authUser.first_name ?? "").trim();
    const ln = (authUser.last_name ?? "").trim();
    const full = `${fn} ${ln}`.trim();
    return full || authUser.username || "—";
  }, [authUser]);

  const todayLabel = useMemo(() => {
    const d = new Date();
    const weekday = new Intl.DateTimeFormat("fr-FR", { weekday: "short" }).format(d);
    const day = new Intl.DateTimeFormat("fr-FR", { day: "2-digit" }).format(d);
    const month = new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(d);
    const cap = (s: string) => (s.length ? s[0].toUpperCase() + s.slice(1) : s);
    return `${cap(weekday)} ${day} ${cap(month)}`;
  }, []);

  const modules = useMemo<ModuleItem[]>(
    () => [
      {
        key: "planning",
        titleFr: "Planning",
        titleAr: "التخطيط",
        leftIcon: "calendar-text",
        listRoute: "/planning" as const,
      },
      {
        key: "medecins",
        titleFr: "Liste Médecins",
        titleAr: "قائمة الأطباء",
        leftIcon: "clipboard-text",
        listRoute: "/medecins" as const,
      },
      {
        key: "rapports",
        titleFr: "Liste des rapports",
        titleAr: "قائمة التقارير",
        leftIcon: "file-document-outline",
        listRoute: "/rapports" as const,
        newRoute: "/rapports/new" as const,
      },
      {
        key: "produits",
        titleFr: "Produits",
        titleAr: "المنتجات",
        leftIcon: "pill",
        listRoute: "/produits" as const,
      },
      {
        key: "bon-commande",
        titleFr: "Bon de Commande",
        titleAr: "أمر شراء",
        leftIcon: "file-sign",
        listRoute: "/bons-commande" as const,
        newRoute: "/bons-commande/new" as const,
      },
      {
        key: "bon-sortie",
        titleFr: "Bon de Sortie",
        titleAr: "سند خروج",
        leftIcon: "file-export-outline",
        listRoute: "/bons-sortie" as const,
        newRoute: "/bons-sortie/new" as const,
      },
      {
        key: "conges",
        titleFr: "Congés & Absences",
        titleAr: "عطل وغيابات",
        leftIcon: "calendar-check-outline",
        listRoute: "/conges" as const,
        newRoute: "/conges/new" as const,
      },
    ],
    []
  );

  const Card = ({ item }: { item: ModuleItem }) => {
    return (
      <Pressable
        onPress={() => router.push(item.listRoute)}
        style={({ pressed }) => [styles.cardPressable, pressed && styles.cardPressed]}
        accessibilityLabel={`Ouvrir - ${item.titleFr}`}
      >
        <AppCard style={styles.card}>
          <View style={styles.leftIconWrap}>
            <MaterialCommunityIcons name={item.leftIcon} size={22} color={COLORS.textOnBrand} />
          </View>

          <View style={styles.titleWrap}>
            <Text style={styles.titleFr} numberOfLines={1}>
              {item.titleFr}
            </Text>
            <Text style={styles.titleAr} numberOfLines={1}>
              {item.titleAr}
            </Text>
          </View>

          <View style={styles.actions}>
            {/* ✅ list icon back */}
            <Pressable
              onPress={(e) => {
                (e as any)?.stopPropagation?.();
                router.push(item.listRoute);
              }}
              style={({ pressed }) => [styles.iconBtn, styles.iconBtnSecondary, pressed && styles.pressed]}
              accessibilityLabel={`Voir la liste - ${item.titleFr}`}
            >
              <MaterialCommunityIcons name="format-list-bulleted" size={18} color={COLORS.brand} />
            </Pressable>

            {/* ✅ + icon only if newRoute exists */}
            {item.newRoute ? (
              <Pressable
                onPress={(e) => {
                  (e as any)?.stopPropagation?.();
                  router.push(item.newRoute!);
                }}
                style={({ pressed }) => [styles.iconBtn, styles.iconBtnPrimary, pressed && styles.pressed]}
                accessibilityLabel={`Ajouter - ${item.titleFr}`}
              >
                <Ionicons name="add" size={18} color={COLORS.textOnBrand} />
              </Pressable>
            ) : null}
          </View>
        </AppCard>
      </Pressable>
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
          {/* ✅ connected user name BEFORE profile icon */}
          <Text style={styles.userName} numberOfLines={1}>
            {displayName}
          </Text>

          <Pressable onPress={() => router.push("/profile")} style={styles.topbarIcon}>
            <Ionicons name="person" size={20} color={COLORS.text} />
          </Pressable>

          <Pressable onPress={logout} style={styles.topbarIcon}>
            <Ionicons name="log-out-outline" size={20} color={COLORS.brand} />
          </Pressable>
        </View>
      </View>

      <FlatList
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + SPACING.xl }]}
        data={modules}
        keyExtractor={(i) => i.key}
        renderItem={({ item }) => <Card item={item} />}
        showsVerticalScrollIndicator={false}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  topbar: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dateText: {
    fontSize: TYPO.body,
    fontWeight: "800",
    color: COLORS.text,
  },
  topbarRight: {
    flexDirection: "row",
    gap: SPACING.sm,
    alignItems: "center",
    maxWidth: "72%",
  },
  userName: {
    fontSize: TYPO.small,
    fontWeight: "800",
    color: COLORS.textMuted,
    maxWidth: 170,
  },
  topbarIcon: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },

  listContent: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    gap: SPACING.sm,
  },

  cardPressable: {},
  cardPressed: { opacity: 0.92 },

  card: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.lg,
  },

  leftIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginRight: SPACING.md,
    backgroundColor: COLORS.brand,
  },

  titleWrap: {
    flex: 1,
    paddingRight: SPACING.sm,
  },
  titleFr: {
    fontSize: TYPO.body,
    fontWeight: "900",
    color: COLORS.text,
  },
  titleAr: {
    marginTop: 2,
    fontSize: TYPO.small,
    fontWeight: "800",
    color: COLORS.textMuted,
    textAlign: "left",
  },

  actions: {
    flexDirection: "column",
    gap: SPACING.sm,
    alignItems: "center",
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnPrimary: {
    backgroundColor: COLORS.brand,
  },
  iconBtnSecondary: {
    backgroundColor: COLORS.cardAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pressed: {
    opacity: 0.85,
  },
});
