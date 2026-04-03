import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AnimatedPressable } from "@/components/ui/AnimatedPressable";
import Colors from "@/constants/colors";
import { Radii, Shadows, Spacing } from "@/constants/design";
import { CATEGORIES, useIdentity } from "@/context/IdentityContext";
import { useLanguage } from "@/context/LanguageContext";

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

function useFadeIn(delay = 0) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(18)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 480,
        delay,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        delay,
        useNativeDriver: true,
        friction: 8,
        tension: 60,
      }),
    ]).start();
  }, []);
  return { opacity, transform: [{ translateY }] };
}

function QuickStat({
  icon,
  value,
  label,
  color,
  onPress,
}: {
  icon: string;
  value: string;
  label: string;
  color: string;
  onPress?: () => void;
}) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  return (
    <AnimatedPressable onPress={onPress} style={styles.quickStatWrap} scale={0.95}>
      <View
        style={[
          styles.quickStat,
          {
            backgroundColor: colors.backgroundCard,
            borderColor: colors.border,
          },
          Shadows.sm,
        ]}
      >
        <View style={[styles.quickStatIcon, { backgroundColor: color + "18" }]}>
          <Feather name={icon as any} size={16} color={color} />
        </View>
        <Text style={[styles.quickStatValue, { color: colors.text }]}>{value}</Text>
        <Text style={[styles.quickStatLabel, { color: colors.textSecondary }]}>{label}</Text>
      </View>
    </AnimatedPressable>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const { node, documents, isLoading } = useIdentity();
  const { t } = useLanguage();

  const headerAnim = useFadeIn(0);
  const cardAnim = useFadeIn(80);
  const statsAnim = useFadeIn(160);
  const docsAnim = useFadeIn(240);
  const recentAnim = useFadeIn(320);

  useEffect(() => {
    if (!isLoading && !node) {
      router.replace("/onboarding");
    }
  }, [isLoading, node]);

  if (!isLoading && !node) return null;

  const totalDocs = documents.length;
  const recentDocs = [...documents]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 6);

  const catCounts = CATEGORIES.map((cat) => ({
    ...cat,
    count: documents.filter((d) => d.category === cat.key).length,
  }));

  const planLabel =
    node?.networkPlan === "pro"
      ? "Pro"
      : node?.networkPlan === "basic"
      ? "Básico"
      : "Gratuito";

  const planIcon =
    node?.networkPlan === "pro"
      ? "zap"
      : node?.networkPlan === "basic"
      ? "star"
      : "user";

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) + 8,
        paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 110,
      }}
    >
      {/* Header */}
      <Animated.View style={[styles.header, headerAnim]}>
        <View>
          <Text style={[styles.greeting, { color: colors.textSecondary }]}>
            {getGreeting()} 👋
          </Text>
          <Text style={[styles.userName, { color: colors.text }]} numberOfLines={1}>
            {node?.name?.split(" ")[0] ?? "uni.id"}
          </Text>
        </View>
        <AnimatedPressable
          onPress={() => {
            if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/add-document");
          }}
          scale={0.9}
        >
          <LinearGradient
            colors={["#1A6FE8", "#0056CC"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.addBtn}
          >
            <Feather name="plus" size={22} color="#fff" />
          </LinearGradient>
        </AnimatedPressable>
      </Animated.View>

      {/* Identity Hero Card */}
      <Animated.View style={[{ paddingHorizontal: Spacing.md, marginBottom: 16 }, cardAnim]}>
        <LinearGradient
          colors={
            isDark
              ? ["#1A3F8F", "#1A6FE8", "#0D88D0"]
              : ["#1A56C4", "#1A6FE8", "#0099E0"]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.heroCard, Shadows.colored("#1A6FE8")]}
        >
          {/* Decorative circles */}
          <View style={styles.heroCircle1} />
          <View style={styles.heroCircle2} />
          <View style={styles.heroCircle3} />

          <View style={styles.heroTop}>
            <View style={styles.heroLogo}>
              <Feather name="hexagon" size={14} color="rgba(255,255,255,0.7)" />
              <Text style={styles.heroLogoText}>uni.id</Text>
            </View>
            <View style={styles.heroPlanBadge}>
              <Feather name={planIcon as any} size={11} color="#fff" />
              <Text style={styles.heroPlanText}>{planLabel}</Text>
            </View>
          </View>

          <View style={styles.heroMid}>
            <Text style={styles.heroName} numberOfLines={1}>
              {node?.name ?? "Mi Identidad"}
            </Text>
            <Text style={styles.heroId}>
              {node?.id ? `ID · ${node.id.slice(0, 8).toUpperCase()}` : "ID · ········"}
            </Text>
          </View>

          <View style={styles.heroBottom}>
            <View style={styles.heroVerified}>
              <View style={styles.heroPulse} />
              <Text style={styles.heroVerifiedText}>
                {node?.networkPlan === "free"
                  ? "Identidad activa"
                  : node?.networkPlan === "basic"
                  ? "Identidad verificada"
                  : "Identidad certificada"}
              </Text>
            </View>
            <View style={styles.heroCount}>
              <Text style={styles.heroCountNum}>{totalDocs}</Text>
              <Text style={styles.heroCountLabel}>docs</Text>
            </View>
          </View>
        </LinearGradient>
      </Animated.View>

      {/* Quick Stats */}
      <Animated.View style={[styles.quickStats, statsAnim]}>
        <QuickStat
          icon="file-text"
          value={`${totalDocs}`}
          label="Documentos"
          color="#1A6FE8"
          onPress={() => router.push("/(tabs)/documents")}
        />
        <QuickStat
          icon="shield"
          value="100%"
          label="Protegido"
          color="#00D4FF"
          onPress={() => router.push("/(tabs)/security")}
        />
        <QuickStat
          icon="share-2"
          value={node?.networkPlan !== "free" ? "Red" : "Local"}
          label="Cobertura"
          color="#7C3AED"
          onPress={() => router.push("/(tabs)/network")}
        />
      </Animated.View>

      {/* Categories Grid */}
      <Animated.View style={docsAnim}>
        <View style={styles.sectionRow}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Mis documentos</Text>
          <Pressable onPress={() => router.push("/(tabs)/documents")}>
            <Text style={[styles.seeAll, { color: colors.tint }]}>Ver todos</Text>
          </Pressable>
        </View>

        <View style={styles.catGrid}>
          {catCounts.map((cat) => (
            <AnimatedPressable
              key={cat.key}
              onPress={() => {
                if (Platform.OS !== "web") Haptics.selectionAsync();
                router.push({ pathname: "/(tabs)/documents", params: { category: cat.key } });
              }}
              style={styles.catCardWrap}
              scale={0.95}
            >
              <View
                style={[
                  styles.catCard,
                  {
                    backgroundColor: colors.backgroundCard,
                    borderColor: cat.count > 0 ? cat.color + "30" : colors.border,
                  },
                  Shadows.md,
                ]}
              >
                <View
                  style={[
                    styles.catIconCircle,
                    { backgroundColor: cat.color + (isDark ? "25" : "15") },
                  ]}
                >
                  <Feather name={cat.icon as any} size={22} color={cat.color} />
                </View>
                {cat.count > 0 && (
                  <View style={[styles.catBadge, { backgroundColor: cat.color }]}>
                    <Text style={styles.catBadgeText}>{cat.count}</Text>
                  </View>
                )}
                <Text style={[styles.catLabel, { color: colors.text }]} numberOfLines={1}>
                  {cat.label}
                </Text>
                <Text style={[styles.catCount, { color: colors.textSecondary }]}>
                  {cat.count === 0 ? "Vacío" : `${cat.count} doc${cat.count > 1 ? "s" : ""}`}
                </Text>
              </View>
            </AnimatedPressable>
          ))}
        </View>
      </Animated.View>

      {/* Recent documents */}
      <Animated.View style={recentAnim}>
        <View style={styles.sectionRow}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Documentos recientes</Text>
          {documents.length > 6 && (
            <Pressable onPress={() => router.push("/(tabs)/documents")}>
              <Text style={[styles.seeAll, { color: colors.tint }]}>Ver todos ({documents.length})</Text>
            </Pressable>
          )}
        </View>

        {recentDocs.length === 0 ? (
          <AnimatedPressable
            onPress={() => router.push("/add-document")}
            style={{ marginHorizontal: Spacing.md, marginBottom: 16 }}
          >
            <View
              style={[
                styles.emptyCard,
                {
                  backgroundColor: colors.backgroundCard,
                  borderColor: colors.border,
                },
              ]}
            >
              <View
                style={[
                  styles.emptyIconWrap,
                  { backgroundColor: colors.tint + "15" },
                ]}
              >
                <Feather name="plus" size={28} color={colors.tint} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                Agregá tu primer documento
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                DNI, carnet, título, todo en un lugar seguro
              </Text>
            </View>
          </AnimatedPressable>
        ) : (
          <View style={styles.recentList}>
            {recentDocs.map((doc, idx) => {
              const cat = CATEGORIES.find((c) => c.key === doc.category);
              return (
                <AnimatedPressable
                  key={doc.id}
                  onPress={() =>
                    router.push({ pathname: "/document/[id]", params: { id: doc.id } })
                  }
                  style={{ marginBottom: idx < recentDocs.length - 1 ? 10 : 0 }}
                  scale={0.97}
                >
                  <View
                    style={[
                      styles.recentItem,
                      {
                        backgroundColor: colors.backgroundCard,
                        borderColor: colors.border,
                      },
                      Shadows.sm,
                    ]}
                  >
                    <View
                      style={[
                        styles.recentIcon,
                        { backgroundColor: (cat?.color ?? "#1A6FE8") + "18" },
                      ]}
                    >
                      <Feather
                        name={(cat?.icon as any) ?? "file"}
                        size={20}
                        color={cat?.color ?? "#1A6FE8"}
                      />
                    </View>
                    <View style={styles.recentInfo}>
                      <Text
                        style={[styles.recentTitle, { color: colors.text }]}
                        numberOfLines={1}
                      >
                        {doc.title}
                      </Text>
                      <Text style={[styles.recentMeta, { color: colors.textSecondary }]}>
                        {cat?.label} · {new Date(doc.updatedAt).toLocaleDateString("es-AR")}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.recentChevron,
                        { backgroundColor: colors.background },
                      ]}
                    >
                      <Feather name="chevron-right" size={15} color={colors.textSecondary} />
                    </View>
                  </View>
                </AnimatedPressable>
              );
            })}
          </View>
        )}
      </Animated.View>

      {/* Security bar */}
      <Animated.View style={[{ marginHorizontal: Spacing.md, marginBottom: 12 }, recentAnim]}>
        <AnimatedPressable onPress={() => router.push("/(tabs)/security")} scale={0.98}>
          <View
            style={[
              styles.secBar,
              {
                backgroundColor: isDark ? "#060B18" : "#F0F6FF",
                borderColor: "#00D4FF30",
              },
              Shadows.sm,
            ]}
          >
            <View style={styles.secBarLeft}>
              <View style={styles.secPulseWrap}>
                <View style={[styles.secPulse, { backgroundColor: "#00FF9C" }]} />
              </View>
              <View style={[styles.secIconWrap, { backgroundColor: "#00D4FF18" }]}>
                <Feather name="shield" size={16} color="#00D4FF" />
              </View>
              <View>
                <Text style={[styles.secTitle, { color: colors.text }]}>Protección activa</Text>
                <Text style={styles.secSub}>Cifrado AES-256 · Biometría</Text>
              </View>
            </View>
            <View style={[styles.secChevron, { backgroundColor: "#00D4FF18" }]}>
              <Feather name="chevron-right" size={14} color="#00D4FF" />
            </View>
          </View>
        </AnimatedPressable>
      </Animated.View>

      {/* Network CTA for free users */}
      {node?.networkPlan === "free" && (
        <Animated.View style={[{ marginHorizontal: Spacing.md }, recentAnim]}>
          <AnimatedPressable
            onPress={() => router.push("/(tabs)/network")}
            scale={0.98}
          >
            <LinearGradient
              colors={isDark ? ["#0A1628", "#0D1E3D"] : ["#EEF4FF", "#E0ECFF"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.networkCTA, { borderColor: "#1A6FE840" }]}
            >
              <View style={[styles.networkIcon, { backgroundColor: "#1A6FE820" }]}>
                <Feather name="share-2" size={20} color="#00D4FF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.networkTitle, { color: colors.text }]}>
                  Conectate a la red global
                </Text>
                <Text style={[styles.networkSub, { color: colors.textSecondary }]}>
                  Bancos, hospitales, aeropuertos y más
                </Text>
              </View>
              <Feather name="arrow-right" size={18} color="#00D4FF" />
            </LinearGradient>
          </AnimatedPressable>
        </Animated.View>
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
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  greeting: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginBottom: 2,
  },
  userName: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
  },
  addBtn: {
    width: 46,
    height: 46,
    borderRadius: Radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },

  heroCard: {
    borderRadius: Radii.card,
    padding: 22,
    overflow: "hidden",
    minHeight: 170,
    justifyContent: "space-between",
  },
  heroCircle1: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(255,255,255,0.06)",
    right: -40,
    top: -40,
  },
  heroCircle2: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(255,255,255,0.06)",
    right: 60,
    bottom: -20,
  },
  heroCircle3: {
    position: "absolute",
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.05)",
    left: -10,
    bottom: 30,
  },
  heroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  heroLogo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  heroLogoText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
  },
  heroPlanBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radii.pill,
  },
  heroPlanText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  heroMid: { gap: 4 },
  heroName: {
    color: "#fff",
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  heroId: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    letterSpacing: 1.5,
  },
  heroBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  heroVerified: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  heroPulse: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#00FF9C",
  },
  heroVerifiedText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  heroCount: { alignItems: "flex-end" },
  heroCountNum: {
    color: "#fff",
    fontSize: 32,
    fontFamily: "Inter_700Bold",
    lineHeight: 34,
  },
  heroCountLabel: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },

  quickStats: {
    flexDirection: "row",
    paddingHorizontal: Spacing.md,
    gap: 10,
    marginBottom: 24,
  },
  quickStatWrap: { flex: 1 },
  quickStat: {
    borderRadius: Radii.lg,
    borderWidth: 1,
    padding: 14,
    alignItems: "center",
    gap: 6,
  },
  quickStatIcon: {
    width: 36,
    height: 36,
    borderRadius: Radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  quickStatValue: { fontSize: 17, fontFamily: "Inter_700Bold" },
  quickStatLabel: { fontSize: 10, fontFamily: "Inter_400Regular" },

  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  seeAll: { fontSize: 14, fontFamily: "Inter_500Medium" },

  catGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: Spacing.sm + 4,
    gap: 10,
    marginBottom: 24,
  },
  catCardWrap: { width: "47%", flex: 1, minWidth: 130 },
  catCard: {
    borderRadius: Radii.xl,
    borderWidth: 1,
    padding: 16,
    gap: 10,
    overflow: "visible",
  },
  catIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  catBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  catBadgeText: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" },
  catLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  catCount: { fontSize: 12, fontFamily: "Inter_400Regular" },

  emptyCard: {
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderStyle: "dashed",
    padding: 32,
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
  },
  emptyIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  emptySubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },

  recentList: { paddingHorizontal: Spacing.md, marginBottom: 16 },
  recentItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: Radii.lg,
    borderWidth: 1,
  },
  recentIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  recentInfo: { flex: 1 },
  recentTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 3 },
  recentMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  recentChevron: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  secBar: {
    borderRadius: Radii.lg,
    borderWidth: 1,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  secBarLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  secPulseWrap: { alignItems: "center", justifyContent: "center" },
  secPulse: { width: 7, height: 7, borderRadius: 4 },
  secIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  secTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 1 },
  secSub: { color: "#8896B0", fontSize: 11, fontFamily: "Inter_400Regular" },
  secChevron: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  networkCTA: {
    borderRadius: Radii.xl,
    borderWidth: 1,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  networkIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  networkTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  networkSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
});
