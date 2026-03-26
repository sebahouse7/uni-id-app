import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Platform,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { CATEGORIES, useIdentity } from "@/context/IdentityContext";

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const { node, documents, isLoading } = useIdentity();

  if (!isLoading && !node) {
    router.replace("/onboarding");
    return null;
  }

  const totalDocs = documents.length;
  const recentDocs = [...documents].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  ).slice(0, 3);

  const catCounts = CATEGORIES.map((cat) => ({
    ...cat,
    count: documents.filter((d) => d.category === cat.key).length,
  }));

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) + 16,
        paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 100,
      }}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.greeting, { color: colors.textSecondary }]}>Bienvenido a</Text>
          <Text style={[styles.appName, { color: colors.text }]}>uni.id</Text>
        </View>
        <Pressable
          onPress={() => router.push("/add-document")}
          style={({ pressed }) => [
            styles.addBtn,
            { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Feather name="plus" size={22} color="#fff" />
        </Pressable>
      </View>

      {/* Node Card */}
      <View style={[styles.nodeCard, { backgroundColor: colors.tint }]}>
        <View style={styles.nodeCardInner}>
          <View>
            <Text style={styles.nodeLabel}>Mi Nodo de Identidad</Text>
            <Text style={styles.nodeName}>{node?.name ?? "—"}</Text>
            <View style={styles.planBadge}>
              <View style={styles.planDot} />
              <Text style={styles.planText}>
                {node?.networkPlan === "free"
                  ? "Plan Gratuito"
                  : node?.networkPlan === "basic"
                  ? "Red Básica"
                  : "Red Pro"}
              </Text>
            </View>
          </View>
          <View style={styles.nodeStats}>
            <Text style={styles.nodeCount}>{totalDocs}</Text>
            <Text style={styles.nodeCountLabel}>documentos</Text>
          </View>
        </View>
        {/* Decorative circles */}
        <View style={styles.circle1} />
        <View style={styles.circle2} />
      </View>

      {/* Categories */}
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Categorías</Text>
      <View style={styles.categoriesGrid}>
        {catCounts.map((cat) => (
          <Pressable
            key={cat.key}
            onPress={() => router.push({ pathname: "/(tabs)/documents", params: { category: cat.key } })}
            style={({ pressed }) => [
              styles.categoryCard,
              {
                backgroundColor: colors.backgroundCard,
                borderColor: colors.border,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <View style={[styles.catIconWrap, { backgroundColor: cat.color + "18" }]}>
              <Feather name={cat.icon as any} size={22} color={cat.color} />
            </View>
            <Text style={[styles.catLabel, { color: colors.text }]}>{cat.label}</Text>
            <Text style={[styles.catCount, { color: colors.textSecondary }]}>
              {cat.count} {cat.count === 1 ? "doc" : "docs"}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Recent */}
      <View style={styles.recentHeader}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Recientes</Text>
        {documents.length > 0 && (
          <Pressable onPress={() => router.push("/(tabs)/documents")}>
            <Text style={[styles.seeAll, { color: colors.tint }]}>Ver todos</Text>
          </Pressable>
        )}
      </View>

      {recentDocs.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
          <Feather name="inbox" size={32} color={colors.textSecondary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Sin documentos aún</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            Tocá el + para agregar tu primer documento
          </Text>
        </View>
      ) : (
        <View style={styles.recentList}>
          {recentDocs.map((doc) => {
            const cat = CATEGORIES.find((c) => c.key === doc.category);
            return (
              <Pressable
                key={doc.id}
                onPress={() => router.push({ pathname: "/document/[id]", params: { id: doc.id } })}
                style={({ pressed }) => [
                  styles.recentItem,
                  {
                    backgroundColor: colors.backgroundCard,
                    borderColor: colors.border,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                <View style={[styles.recentIcon, { backgroundColor: (cat?.color ?? "#1A6FE8") + "18" }]}>
                  <Feather name={(cat?.icon as any) ?? "file"} size={20} color={cat?.color ?? "#1A6FE8"} />
                </View>
                <View style={styles.recentInfo}>
                  <Text style={[styles.recentTitle, { color: colors.text }]} numberOfLines={1}>
                    {doc.title}
                  </Text>
                  <Text style={[styles.recentCat, { color: colors.textSecondary }]}>
                    {cat?.label} · {new Date(doc.updatedAt).toLocaleDateString("es-AR")}
                  </Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.textSecondary} />
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Network CTA if free */}
      {node?.networkPlan === "free" && (
        <Pressable
          onPress={() => router.push("/network")}
          style={({ pressed }) => [
            styles.networkCTA,
            { opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <View style={styles.networkCTAInner}>
            <Feather name="share-2" size={20} color="#00D4FF" />
            <View style={{ flex: 1 }}>
              <Text style={styles.networkCTATitle}>Activá la Red Cognitiva</Text>
              <Text style={styles.networkCTASub}>Verificá tu identidad en todo el mundo</Text>
            </View>
            <Feather name="arrow-right" size={18} color="#00D4FF" />
          </View>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  greeting: { fontSize: 13, fontFamily: "Inter_400Regular" },
  appName: { fontSize: 28, fontFamily: "Inter_700Bold" },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  nodeCard: {
    marginHorizontal: 20,
    borderRadius: 20,
    padding: 24,
    marginBottom: 28,
    overflow: "hidden",
  },
  nodeCardInner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    zIndex: 1,
  },
  nodeLabel: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginBottom: 4,
  },
  nodeName: {
    color: "#fff",
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    marginBottom: 8,
  },
  planBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    alignSelf: "flex-start",
  },
  planDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#00FF9C" },
  planText: { color: "#fff", fontSize: 12, fontFamily: "Inter_500Medium" },
  nodeStats: { alignItems: "center" },
  nodeCount: { color: "#fff", fontSize: 40, fontFamily: "Inter_700Bold" },
  nodeCountLabel: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontFamily: "Inter_400Regular" },
  circle1: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.08)",
    right: -20,
    bottom: -30,
  },
  circle2: {
    position: "absolute",
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.06)",
    right: 60,
    top: -20,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  categoriesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 14,
    gap: 10,
    marginBottom: 28,
  },
  categoryCard: {
    width: "30%",
    minWidth: 95,
    flex: 1,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    gap: 8,
    alignItems: "flex-start",
  },
  catIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  catLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  catCount: { fontSize: 11, fontFamily: "Inter_400Regular" },
  recentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  seeAll: { fontSize: 14, fontFamily: "Inter_500Medium" },
  emptyCard: {
    marginHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    padding: 32,
    alignItems: "center",
    gap: 10,
    marginBottom: 20,
  },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  emptySubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  recentList: { marginHorizontal: 20, gap: 10, marginBottom: 20 },
  recentItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  recentIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  recentInfo: { flex: 1 },
  recentTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 3 },
  recentCat: { fontSize: 12, fontFamily: "Inter_400Regular" },
  networkCTA: {
    marginHorizontal: 20,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 8,
    backgroundColor: "#0D1525",
    borderWidth: 1,
    borderColor: "#00D4FF40",
  },
  networkCTAInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
  },
  networkCTATitle: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
  },
  networkCTASub: {
    color: "#8896B0",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
});
