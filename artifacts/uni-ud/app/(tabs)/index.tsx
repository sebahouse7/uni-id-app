import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
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

function useFadeIn(delay = 0) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 500, delay, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, delay, useNativeDriver: true, friction: 8, tension: 55 }),
    ]).start();
  }, []);
  return { opacity, transform: [{ translateY }] };
}

function AvatarCircle({ name, size = 52 }: { name: string; size?: number }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <LinearGradient
      colors={["#00D4FF", "#1A6FE8"]}
      style={{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "rgba(255,255,255,0.3)" }}
    >
      <Text style={{ color: "#fff", fontSize: size * 0.35, fontFamily: "Inter_700Bold" }}>{initials}</Text>
    </LinearGradient>
  );
}

function DocCategoryCard({
  cat,
  docs,
  onPress,
}: {
  cat: { key: string; label: string; icon: string; color: string };
  docs: any[];
  onPress: () => void;
}) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const count = docs.length;
  const lastDoc = docs[0];
  const { t } = useLanguage();

  return (
    <AnimatedPressable onPress={onPress} style={styles.catCardWrap} scale={0.95}>
      <View style={[styles.catCard, { backgroundColor: colors.backgroundCard, borderColor: count > 0 ? cat.color + "40" : colors.border }, Shadows.sm]}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
          <View style={[styles.catIcon, { backgroundColor: cat.color + "1A" }]}>
            <Feather name={cat.icon as any} size={18} color={cat.color} />
          </View>
          {count > 0 && (
            <View style={[styles.catBadge, { backgroundColor: cat.color }]}>
              <Text style={styles.catBadgeText}>{count}</Text>
            </View>
          )}
        </View>
        <Text style={[styles.catLabel, { color: colors.text }]} numberOfLines={1}>{cat.label}</Text>
        <Text style={[styles.catSub, { color: colors.textSecondary }]} numberOfLines={2}>
          {lastDoc
            ? lastDoc.title
            : t.emptyDocCategory ?? "Sin documentos"}
        </Text>
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
  const [empresaExpanded, setEmpresaExpanded] = useState(false);

  const a0 = useFadeIn(0);
  const a1 = useFadeIn(80);
  const a2 = useFadeIn(160);
  const a3 = useFadeIn(240);
  const a4 = useFadeIn(320);

  useEffect(() => {
    if (!isLoading && !node) router.replace("/onboarding");
  }, [isLoading, node]);

  if (!isLoading && !node) return null;

  const totalDocs = documents.length;

  const planLabel =
    node?.networkPlan === "pro" ? "Premium Pro" :
    node?.networkPlan === "basic" ? "Premium" : "Gratuito";

  const catMap = CATEGORIES.reduce<Record<string, typeof documents>>((acc, cat) => {
    acc[cat.key] = documents.filter((d) => d.category === cat.key)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return acc;
  }, {});

  const recentDocs = [...documents]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0),
        paddingBottom: insets.bottom + 110,
      }}
    >
      {/* ── Header ── */}
      <Animated.View style={[styles.header, a0]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.greeting, { color: colors.text }]}>
            {node?.name?.split(" ")[0] ?? "uni.id"} 👋
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {t.homeSubtitle ?? "Centro de Identidad Digital"}
          </Text>
        </View>
        <AnimatedPressable
          onPress={() => {
            if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/add-document");
          }}
          scale={0.9}
        >
          <LinearGradient colors={["#1A6FE8", "#0D8AEB"]} style={styles.addBtn}>
            <Feather name="plus" size={22} color="#fff" />
          </LinearGradient>
        </AnimatedPressable>
      </Animated.View>

      {/* ── Identity Card ── */}
      <Animated.View style={[{ paddingHorizontal: Spacing.md, marginBottom: 16 }, a1]}>
        <LinearGradient
          colors={["#1A3F8F", "#1A6FE8", "#0D88D0"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.idCard, Shadows.colored("#1A6FE8")]}
        >
          <View style={styles.idCardCircle1} />
          <View style={styles.idCardCircle2} />

          {/* Top row */}
          <View style={styles.idCardTop}>
            <View style={styles.idLogo}>
              <Feather name="hexagon" size={12} color="rgba(255,255,255,0.8)" />
              <Text style={styles.idLogoText}>uni.id</Text>
            </View>
            <View style={styles.idPlanBadge}>
              <Feather name={node?.networkPlan !== "free" ? "star" : "user"} size={10} color="#fff" />
              <Text style={styles.idPlanText}>{planLabel}</Text>
            </View>
          </View>

          {/* Profile row */}
          <View style={styles.idProfile}>
            <AvatarCircle name={node?.name ?? "U"} size={56} />
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.idName} numberOfLines={1}>{node?.name ?? "Mi Identidad"}</Text>
              <Text style={styles.idMeta}>
                {node?.id ? `ID · ${node.id.slice(0, 8).toUpperCase()}` : "ID · ········"}
              </Text>
              <View style={styles.idVerifiedRow}>
                <View style={styles.idPulse} />
                <Text style={styles.idVerifiedText}>
                  {node?.networkPlan === "free" ? t.identityActive :
                   node?.networkPlan === "basic" ? t.identityVerified :
                   t.identityCertified}
                </Text>
              </View>
            </View>
            <View style={styles.idDocCount}>
              <Text style={styles.idDocNum}>{totalDocs}</Text>
              <Text style={styles.idDocLabel}>docs</Text>
            </View>
          </View>
        </LinearGradient>
      </Animated.View>

      {/* ── Stats Row ── */}
      <Animated.View style={[styles.statsRow, a2]}>
        <AnimatedPressable onPress={() => router.push("/(tabs)/documents")} style={styles.statItem} scale={0.95}>
          <View style={[styles.statCard, { backgroundColor: "#1A6FE8" }]}>
            <Feather name="file-text" size={20} color="#fff" />
            <Text style={styles.statNum}>{totalDocs}</Text>
            <Text style={styles.statLabel}>{t.tabDocs}</Text>
          </View>
        </AnimatedPressable>
        <AnimatedPressable onPress={() => router.push("/(tabs)/security")} style={styles.statItem} scale={0.95}>
          <View style={[styles.statCard, { backgroundColor: "#00D4FF" }]}>
            <Feather name="shield" size={20} color="#fff" />
            <Text style={styles.statNum}>100%</Text>
            <Text style={styles.statLabel}>{t.protected ?? "Protegido"}</Text>
          </View>
        </AnimatedPressable>
        <AnimatedPressable onPress={() => router.push("/(tabs)/network")} style={styles.statItem} scale={0.95}>
          <View style={[styles.statCard, { backgroundColor: "#7C3AED" }]}>
            <Feather name="globe" size={20} color="#fff" />
            <Text style={styles.statNum} numberOfLines={1}>
              {node?.networkPlan !== "free" ? (t.networkGlobal ?? "Red") : (t.networkLocal ?? "Local")}
            </Text>
            <Text style={styles.statLabel}>{t.coverage ?? "Cobertura"}</Text>
          </View>
        </AnimatedPressable>
      </Animated.View>

      {/* ── Personal Docs Section ── */}
      <Animated.View style={a3}>
        <View style={styles.sectionRow}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t.myPersonalDocs ?? t.myDocuments}</Text>
          <Pressable onPress={() => router.push("/(tabs)/documents")}>
            <Text style={[styles.seeAll, { color: colors.tint }]}>
              {totalDocs > 0 ? `${t.seeAll} (${totalDocs})` : t.seeAll}
            </Text>
          </Pressable>
        </View>

        {/* 2-col category grid */}
        <View style={styles.catGrid}>
          {CATEGORIES.map((cat) => (
            <DocCategoryCard
              key={cat.key}
              cat={cat}
              docs={catMap[cat.key] ?? []}
              onPress={() => {
                if (Platform.OS !== "web") Haptics.selectionAsync();
                router.push({ pathname: "/(tabs)/documents", params: { category: cat.key } });
              }}
            />
          ))}
        </View>

        {/* Recent docs list */}
        {recentDocs.length > 0 && (
          <View style={{ paddingHorizontal: Spacing.md, marginTop: 4 }}>
            <Text style={[styles.subSectionTitle, { color: colors.textSecondary }]}>
              {t.recent}
            </Text>
            {recentDocs.map((doc, idx) => {
              const cat = CATEGORIES.find((c) => c.key === doc.category);
              return (
                <AnimatedPressable
                  key={doc.id}
                  onPress={() => router.push({ pathname: "/document/[id]", params: { id: doc.id } })}
                  style={{ marginBottom: idx < recentDocs.length - 1 ? 8 : 0 }}
                  scale={0.97}
                >
                  <View style={[styles.recentItem, { backgroundColor: colors.backgroundCard, borderColor: colors.border }, Shadows.sm]}>
                    <View style={[styles.recentIcon, { backgroundColor: (cat?.color ?? "#1A6FE8") + "18" }]}>
                      <Feather name={(cat?.icon as any) ?? "file"} size={18} color={cat?.color ?? "#1A6FE8"} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.recentTitle, { color: colors.text }]} numberOfLines={1}>{doc.title}</Text>
                      <Text style={[styles.recentMeta, { color: colors.textSecondary }]}>
                        {cat?.label} · {new Date(doc.updatedAt).toLocaleDateString("es-AR")}
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={15} color={colors.textSecondary} />
                  </View>
                </AnimatedPressable>
              );
            })}
          </View>
        )}

        {/* Empty state */}
        {totalDocs === 0 && (
          <AnimatedPressable onPress={() => router.push("/add-document")} style={{ marginHorizontal: Spacing.md }}>
            <View style={[styles.emptyCard, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
              <View style={[styles.emptyIconWrap, { backgroundColor: colors.tint + "15" }]}>
                <Feather name="plus" size={28} color={colors.tint} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>{t.addFirst}</Text>
              <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                {t.addFirstDesc ?? "DNI, pasaporte, licencia, salud — todo en un lugar cifrado"}
              </Text>
            </View>
          </AnimatedPressable>
        )}
      </Animated.View>

      {/* ── Empresa Section ── */}
      <Animated.View style={[{ marginTop: 8 }, a4]}>
        <Pressable
          style={styles.sectionRow}
          onPress={() => setEmpresaExpanded((v) => !v)}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t.empresa ?? t.tabBusiness}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={[styles.seeAll, { color: colors.tint }]}>{t.seeAll}</Text>
            <Feather name={empresaExpanded ? "chevron-up" : "chevron-down"} size={14} color={colors.tint} />
          </View>
        </Pressable>

        {empresaExpanded && (
          <View style={{ paddingHorizontal: Spacing.md }}>
            {[
              { icon: "briefcase", label: "Registro Mercantil", color: "#1A6FE8" },
              { icon: "percent", label: "Declaración IVA", color: "#7C3AED" },
              { icon: "users", label: "Nómina", color: "#00D4FF" },
            ].map((item) => (
              <AnimatedPressable
                key={item.label}
                onPress={() => router.push("/add-document")}
                style={{ marginBottom: 8 }}
                scale={0.97}
              >
                <View style={[styles.recentItem, { backgroundColor: colors.backgroundCard, borderColor: colors.border }, Shadows.sm]}>
                  <View style={[styles.recentIcon, { backgroundColor: item.color + "18" }]}>
                    <Feather name={item.icon as any} size={18} color={item.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.recentTitle, { color: colors.text }]}>{item.label}</Text>
                    <Text style={[styles.recentMeta, { color: colors.textSecondary }]}>Tocá para agregar</Text>
                  </View>
                  <Feather name="plus" size={15} color={colors.textSecondary} />
                </View>
              </AnimatedPressable>
            ))}
          </View>
        )}
      </Animated.View>

      {/* ── Security Bar ── */}
      <Animated.View style={[{ marginHorizontal: Spacing.md, marginTop: 16 }, a4]}>
        <AnimatedPressable onPress={() => router.push("/(tabs)/security")} scale={0.98}>
          <View style={[styles.secBar, { backgroundColor: isDark ? "#060B18" : "#F0F6FF", borderColor: "#00D4FF30" }, Shadows.sm]}>
            <View style={styles.secLeft}>
              <View style={styles.secPulseWrap}>
                <View style={[styles.secPulse, { backgroundColor: "#00FF9C" }]} />
              </View>
              <View style={[styles.secIconWrap, { backgroundColor: "#00D4FF18" }]}>
                <Feather name="shield" size={16} color="#00D4FF" />
              </View>
              <View>
                <Text style={[styles.secTitle, { color: colors.text }]}>{t.activeProtection}</Text>
                <Text style={styles.secSub}>{t.encryptedBio ?? "Cifrado AES-256 · Biometría"}</Text>
              </View>
            </View>
            <View style={[styles.secChevron, { backgroundColor: "#00D4FF18" }]}>
              <Feather name="chevron-right" size={14} color="#00D4FF" />
            </View>
          </View>
        </AnimatedPressable>
      </Animated.View>

      {/* ── Network CTA ── */}
      {node?.networkPlan === "free" && (
        <Animated.View style={[{ marginHorizontal: Spacing.md, marginTop: 10 }, a4]}>
          <AnimatedPressable onPress={() => router.push("/(tabs)/network")} scale={0.98}>
            <LinearGradient
              colors={isDark ? ["#0A1628", "#0D1E3D"] : ["#EEF4FF", "#E0ECFF"]}
              style={[styles.networkCTA, { borderColor: "#1A6FE840" }]}
            >
              <View style={[styles.networkIcon, { backgroundColor: "#1A6FE820" }]}>
                <Feather name="share-2" size={20} color="#00D4FF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.networkTitle, { color: colors.text }]}>{t.connectToNetwork}</Text>
                <Text style={[styles.networkSub, { color: colors.textSecondary }]}>{t.connectDesc}</Text>
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
    paddingTop: 8,
    paddingBottom: 14,
  },
  greeting: { fontSize: 22, fontFamily: "Inter_700Bold", marginBottom: 2 },
  subtitle: { fontSize: 12, fontFamily: "Inter_400Regular" },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },

  idCard: {
    borderRadius: Radii.card,
    padding: 20,
    overflow: "hidden",
    minHeight: 160,
  },
  idCardCircle1: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(255,255,255,0.05)",
    right: -50,
    top: -50,
  },
  idCardCircle2: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.05)",
    right: 50,
    bottom: -20,
  },
  idCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  idLogo: { flexDirection: "row", alignItems: "center", gap: 5 },
  idLogoText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 13 },
  idPlanBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  idPlanText: { color: "#fff", fontSize: 11, fontFamily: "Inter_600SemiBold" },

  idProfile: { flexDirection: "row", alignItems: "center" },
  idName: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 17, marginBottom: 2 },
  idMeta: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 4 },
  idVerifiedRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  idPulse: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#00FF9C" },
  idVerifiedText: { color: "rgba(255,255,255,0.85)", fontSize: 11, fontFamily: "Inter_400Regular" },
  idDocCount: { alignItems: "center", marginLeft: 8 },
  idDocNum: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 28 },
  idDocLabel: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontFamily: "Inter_400Regular" },

  statsRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.md,
    gap: 10,
    marginBottom: 20,
  },
  statItem: { flex: 1 },
  statCard: {
    borderRadius: Radii.card,
    paddingVertical: 14,
    alignItems: "center",
    gap: 4,
  },
  statNum: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 16 },
  statLabel: { color: "rgba(255,255,255,0.85)", fontSize: 10, fontFamily: "Inter_400Regular" },

  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  seeAll: { fontSize: 13, fontFamily: "Inter_500Medium" },
  subSectionTitle: { fontSize: 12, fontFamily: "Inter_500Medium", marginBottom: 8, marginTop: 4 },

  catGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: Spacing.md,
    gap: 10,
    marginBottom: 14,
  },
  catCardWrap: { width: "47.5%" },
  catCard: {
    borderRadius: Radii.card,
    padding: 14,
    borderWidth: 1,
    minHeight: 110,
    justifyContent: "space-between",
  },
  catIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  catBadge: {
    marginLeft: 8,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  catBadgeText: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" },
  catLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  catSub: { fontSize: 11, fontFamily: "Inter_400Regular" },

  recentItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: Radii.card,
    borderWidth: 1,
  },
  recentIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  recentTitle: { fontSize: 14, fontFamily: "Inter_500Medium" },
  recentMeta: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },

  emptyCard: {
    borderRadius: Radii.card,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    paddingVertical: 36,
    paddingHorizontal: 24,
    gap: 10,
  },
  emptyIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },

  secBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: Radii.card,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  secLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  secPulseWrap: { position: "relative", width: 10, height: 10 },
  secPulse: { width: 10, height: 10, borderRadius: 5 },
  secIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  secTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  secSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#00D4FF", marginTop: 1 },
  secChevron: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },

  networkCTA: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: Radii.card,
    borderWidth: 1,
    padding: 16,
    marginBottom: 4,
  },
  networkIcon: {
    width: 42,
    height: 42,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  networkTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  networkSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
});
