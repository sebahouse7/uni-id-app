import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Image,
  Modal,
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

function AvatarCircle({ name, photo, size = 52 }: { name: string; photo?: string; size?: number }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  if (photo) {
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden", borderWidth: 2, borderColor: "rgba(255,255,255,0.3)" }}>
        <Image source={{ uri: photo }} style={{ width: size, height: size }} resizeMode="cover" />
      </View>
    );
  }
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
    <AnimatedPressable onPress={onPress} style={styles.catCardWrap} scale={0.96}>
      <View style={[styles.catCard, { backgroundColor: colors.backgroundCard, borderColor: count > 0 ? cat.color + "50" : colors.border }, Shadows.sm]}>
        {/* Icon + badge row */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
          <View style={[styles.catIcon, { backgroundColor: cat.color + "18" }]}>
            <Feather name={cat.icon as any} size={20} color={cat.color} />
          </View>
          {count > 0 && (
            <View style={[styles.catBadge, { backgroundColor: cat.color }]}>
              <Text style={styles.catBadgeText}>{count}</Text>
            </View>
          )}
        </View>
        {/* Full category name — no truncation */}
        <Text style={[styles.catLabel, { color: colors.text }]}>{cat.label}</Text>
        <Text style={[styles.catSub, { color: colors.textSecondary }]} numberOfLines={1}>
          {lastDoc ? lastDoc.title : t.emptyDocCategory ?? "Sin documentos"}
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
  const { node, documents, avatarUri } = useIdentity();
  const { t } = useLanguage();

  const [empresaExpanded, setEmpresaExpanded] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showSOS, setShowSOS] = useState(false);

  const a1 = useFadeIn(0);
  const a2 = useFadeIn(100);
  const a3 = useFadeIn(200);
  const a4 = useFadeIn(300);

  const totalDocs = documents.length;
  const recentDocs = documents.slice(0, 3);
  const personalDocs = documents.filter((d) =>
    ["identity", "passport", "education", "health", "driving", "property"].includes(d.category)
  );

  const planLabel =
    node?.networkPlan === "free"
      ? "Free"
      : node?.networkPlan === "basic"
      ? "Basic"
      : "Pro";

  const identityGlobalId = node?.globalId ?? `did:uniid:${node?.id ?? "unknown"}`;
  const identityQRData = `https://expressjs-production-8bfc.up.railway.app/api/identity/${identityGlobalId}`;

  const callEmergency = () => {
    setShowSOS(false);
    setTimeout(() => {
      if (Platform.OS !== "web") {
        Linking.openURL("tel:911").catch(() => {
          Alert.alert("Error", "No se pudo abrir la marcación.");
        });
      } else {
        Alert.alert("911", "Llamá al 911 desde tu celular.");
      }
    }, 300);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) + 12,
          paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 120,
        }}
      >
        {/* ── Header Row ── */}
        <Animated.View style={[styles.headerRow, a1]}>
          <View>
            <Text style={[styles.greeting, { color: colors.textSecondary }]}>
              {t.homeSubtitle ?? "Centro de Identidad Digital"}
            </Text>
            <Text style={[styles.userName, { color: colors.text }]}>
              {node?.name ?? "Mi Identidad"}
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
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={styles.idPlanBadge}>
                  <Feather name={node?.networkPlan !== "free" ? "star" : "user"} size={10} color="#fff" />
                  <Text style={styles.idPlanText}>{planLabel}</Text>
                </View>
                {/* QR Button */}
                <Pressable
                  onPress={() => {
                    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowQR(true);
                  }}
                  style={styles.qrBtn}
                  hitSlop={8}
                >
                  <Feather name="grid" size={14} color="rgba(255,255,255,0.9)" />
                </Pressable>
              </View>
            </View>

            {/* Profile row */}
            <Pressable
              onPress={() => router.push("/(tabs)/profile")}
              style={styles.idProfile}
            >
              <AvatarCircle name={node?.name ?? "U"} photo={avatarUri ?? undefined} size={56} />
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={styles.idName} numberOfLines={1}>{node?.name ?? "Mi Identidad"}</Text>
                <Text style={styles.idMeta} numberOfLines={1}>
                  {node?.globalId
                    ? `#${node.globalId.replace("did:uniid:", "").replace(/-/g, "").slice(0, 9).toUpperCase()}`
                    : node?.id
                    ? `#${node.id.replace(/-/g, "").slice(0, 9).toUpperCase()}`
                    : "#·········"}
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
            </Pressable>
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
            {CATEGORIES.slice(0, 6).map((cat) => {
              const catDocs = personalDocs.filter((d) => d.category === cat.key);
              return (
                <DocCategoryCard
                  key={cat.key}
                  cat={cat}
                  docs={catDocs}
                  onPress={() =>
                    router.push({
                      pathname: "/(tabs)/documents",
                      params: { category: cat.key },
                    })
                  }
                />
              );
            })}
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
                    onPress={() => router.push({ pathname: "/document/[id]", params: { id: String(doc.id) } })}
                    style={{ marginBottom: idx < recentDocs.length - 1 ? 8 : 0 }}
                    scale={0.97}
                  >
                    <View style={[styles.recentDocRow, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
                      <View style={[styles.recentDocIcon, { backgroundColor: (cat?.color ?? "#1A6FE8") + "18" }]}>
                        <Feather name={(cat?.icon as any) ?? "file"} size={16} color={cat?.color ?? "#1A6FE8"} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.recentDocTitle, { color: colors.text }]} numberOfLines={1}>{doc.title}</Text>
                        <Text style={[styles.recentDocCat, { color: colors.textSecondary }]} numberOfLines={1}>{cat?.label ?? "Documento"}</Text>
                      </View>
                      <Feather name="chevron-right" size={16} color={colors.textSecondary} />
                    </View>
                  </AnimatedPressable>
                );
              })}
            </View>
          )}

          {/* Empty state */}
          {personalDocs.length === 0 && (
            <AnimatedPressable
              onPress={() => router.push("/add-document")}
              style={{ paddingHorizontal: Spacing.md, marginTop: 8 }}
              scale={0.98}
            >
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
        <Animated.View style={[{ marginTop: 24 }, a4]}>
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
            <AnimatedPressable
              onPress={() => router.push("/(tabs)/business")}
              style={{ paddingHorizontal: Spacing.md }}
              scale={0.97}
            >
              <LinearGradient
                colors={isDark ? ["#0A1628", "#0F1E3A"] : ["#EEF4FF", "#E0ECFF"]}
                style={[styles.empresaCard, { borderColor: isDark ? "#1A3060" : "#C8D8F0" }]}
              >
                <View style={[styles.empresaIcon, { backgroundColor: "#1A6FE820" }]}>
                  <Feather name="briefcase" size={22} color="#1A6FE8" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.empresaTitle, { color: colors.text }]}>
                    {t.noBusiness ?? "Sin empresa registrada"}
                  </Text>
                  <Text style={[styles.empresaSub, { color: colors.textSecondary }]}>
                    {t.noBusinessSub ?? "Registrá tu empresa para gestionar su identidad digital"}
                  </Text>
                </View>
                <Feather name="arrow-right" size={18} color={colors.tint} />
              </LinearGradient>
            </AnimatedPressable>
          )}
        </Animated.View>

        {/* ── Security Bar ── */}
        <Animated.View style={[{ paddingHorizontal: Spacing.md, marginTop: 24 }, a4]}>
          <AnimatedPressable onPress={() => router.push("/(tabs)/security")} scale={0.98}>
            <View style={[styles.secBar, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
              <View style={[styles.secIconWrap, { backgroundColor: "#00D4FF18" }]}>
                <Feather name="shield" size={16} color="#00D4FF" />
              </View>
              <View>
                <Text style={[styles.secTitle, { color: colors.text }]}>{t.activeProtection}</Text>
                <Text style={styles.secSub}>{t.encryptedBio ?? "Cifrado AES-256 · Biometría"}</Text>
              </View>
              <View style={[styles.secChevron, { backgroundColor: "#00D4FF18" }]}>
                <Feather name="chevron-right" size={14} color="#00D4FF" />
              </View>
            </View>
          </AnimatedPressable>
        </Animated.View>

        {/* ── Network CTA ── */}
        {node?.networkPlan === "free" && (
          <Animated.View style={[{ paddingHorizontal: Spacing.md, marginTop: 16 }, a4]}>
            <AnimatedPressable onPress={() => router.push("/(tabs)/network")} scale={0.97}>
              <LinearGradient
                colors={isDark ? ["#0A1628", "#0D1E3D"] : ["#EEF4FF", "#E0ECFF"]}
                style={[styles.networkCTA, { borderColor: isDark ? "#1A3060" : "#C8D8F0" }]}
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

      {/* ── SOS Emergency Floating Button ── */}
      <Pressable
        onPress={() => {
          if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          setShowSOS(true);
        }}
        style={[styles.sosBtn, { bottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 90 }]}
      >
        <Text style={styles.sosBtnText}>SOS</Text>
      </Pressable>

      {/* ── QR Modal ── */}
      <Modal visible={showQR} transparent animationType="fade" onRequestClose={() => setShowQR(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowQR(false)}>
          <Pressable style={[styles.qrModal, { backgroundColor: isDark ? "#0D1525" : "#fff" }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.qrModalHeader}>
              <Text style={[styles.qrModalTitle, { color: colors.text }]}>Mi Identidad QR</Text>
              <Pressable onPress={() => setShowQR(false)} hitSlop={12}>
                <Feather name="x" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
            <View style={[styles.qrContainer, { backgroundColor: "#fff" }]}>
              <QRCode
                value={identityQRData}
                size={220}
                color="#060B18"
                backgroundColor="#fff"
              />
            </View>
            <Text style={[styles.qrName, { color: colors.text }]}>{node?.name ?? "Mi Identidad"}</Text>
            <Text style={[styles.qrId, { color: colors.textSecondary }]} numberOfLines={2}>
              {node?.globalId ?? (node?.id ? `did:uniid:${node.id}` : "—")}
            </Text>
            <Text style={[styles.qrHint, { color: colors.textSecondary }]}>
              Mostrá este QR para compartir tu identidad digital, documentos o recibir pagos
            </Text>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── SOS Emergency Modal ── */}
      <Modal visible={showSOS} transparent animationType="slide" onRequestClose={() => setShowSOS(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowSOS(false)}>
          <Pressable style={[styles.sosModal, { backgroundColor: isDark ? "#0D1525" : "#fff" }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sosModalHeader}>
              <View style={styles.sosIconBig}>
                <Text style={styles.sosIconText}>🆘</Text>
              </View>
              <Text style={[styles.sosTitle, { color: colors.text }]}>Emergencia</Text>
              <Text style={[styles.sosSub, { color: colors.textSecondary }]}>
                Acceso rápido a servicios de emergencia y tus datos de salud
              </Text>
            </View>

            {/* Health summary */}
            <View style={[styles.healthCard, { backgroundColor: isDark ? "#1A1A2E" : "#FFF0F0", borderColor: "#E53E3E30" }]}>
              <Feather name="activity" size={16} color="#E53E3E" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.healthTitle, { color: colors.text }]}>Mis datos de salud</Text>
                <Text style={[styles.healthSub, { color: colors.textSecondary }]}>
                  Registrá tus datos en la sección Salud de Documentos
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  setShowSOS(false);
                  setTimeout(() => router.push({ pathname: "/(tabs)/documents", params: { category: "health" } }), 300);
                }}
              >
                <Feather name="chevron-right" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>

            {/* Call 911 */}
            <Pressable onPress={callEmergency} style={styles.call911Btn}>
              <Feather name="phone" size={24} color="#fff" />
              <View>
                <Text style={styles.call911Text}>Llamar al 911</Text>
                <Text style={styles.call911Sub}>Emergencias · Policía · Bomberos</Text>
              </View>
            </Pressable>

            {/* Other emergency numbers */}
            {[
              { num: "107", label: "SAME — Emergencias médicas" },
              { num: "100", label: "Bomberos" },
              { num: "101", label: "Policía" },
            ].map((item) => (
              <Pressable
                key={item.num}
                onPress={() => {
                  setShowSOS(false);
                  setTimeout(() => Linking.openURL(`tel:${item.num}`).catch(() => {}), 300);
                }}
                style={[styles.emergencyRow, { borderColor: colors.border }]}
              >
                <View style={[styles.emergencyNumBadge, { backgroundColor: "#E53E3E15" }]}>
                  <Text style={styles.emergencyNum}>{item.num}</Text>
                </View>
                <Text style={[styles.emergencyLabel, { color: colors.text }]}>{item.label}</Text>
                <Feather name="phone" size={16} color="#E53E3E" />
              </Pressable>
            ))}

            <Pressable onPress={() => setShowSOS(false)} style={styles.cancelSOSBtn}>
              <Text style={[styles.cancelSOSText, { color: colors.textSecondary }]}>Cancelar</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    marginBottom: 20,
  },
  greeting: { fontSize: 13, fontFamily: "Inter_400Regular" },
  userName: { fontSize: 24, fontFamily: "Inter_700Bold", marginTop: 2 },
  addBtn: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },

  idCard: {
    borderRadius: 20,
    padding: 20,
    overflow: "hidden",
    position: "relative",
  },
  idCardCircle1: {
    position: "absolute", right: -40, top: -40,
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  idCardCircle2: {
    position: "absolute", right: 20, bottom: -30,
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  idCardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  idLogo: { flexDirection: "row", alignItems: "center", gap: 6 },
  idLogoText: { color: "rgba(255,255,255,0.9)", fontSize: 13, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  idPlanBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
  },
  idPlanText: { color: "#fff", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  qrBtn: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  idProfile: { flexDirection: "row", alignItems: "center" },
  idName: { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold" },
  idMeta: { color: "rgba(255,255,255,0.65)", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  idVerifiedRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 },
  idPulse: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#00FF9C" },
  idVerifiedText: { color: "rgba(255,255,255,0.85)", fontSize: 11, fontFamily: "Inter_500Medium" },
  idDocCount: { alignItems: "center", minWidth: 48 },
  idDocNum: { color: "#fff", fontSize: 24, fontFamily: "Inter_700Bold" },
  idDocLabel: { color: "rgba(255,255,255,0.6)", fontSize: 10, fontFamily: "Inter_400Regular" },

  statsRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.md,
    gap: 10,
    marginBottom: 24,
  },
  statItem: { flex: 1 },
  statCard: {
    borderRadius: 16, padding: 14, alignItems: "center", gap: 4,
  },
  statNum: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  statLabel: { color: "rgba(255,255,255,0.8)", fontSize: 10, fontFamily: "Inter_500Medium", textAlign: "center" },

  sectionRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: Spacing.md, marginBottom: 14,
  },
  sectionTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  seeAll: { fontSize: 13, fontFamily: "Inter_500Medium" },

  catGrid: {
    flexDirection: "row", flexWrap: "wrap",
    paddingHorizontal: Spacing.md, gap: 12, marginBottom: 16,
  },
  catCardWrap: { width: "47%", flexGrow: 1 },
  catCard: { borderRadius: 16, borderWidth: 1, padding: 14, minHeight: 100 },
  catIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  catBadge: {
    position: "absolute", top: -5, right: -5,
    minWidth: 20, height: 20, borderRadius: 10,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 5,
  },
  catBadgeText: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" },
  catLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 3 },
  catSub: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 15 },

  subSectionTitle: { fontSize: 12, fontFamily: "Inter_500Medium", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 },
  recentDocRow: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 12,
    borderRadius: 12, borderWidth: 1, marginBottom: 0,
  },
  recentDocIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  recentDocTitle: { fontSize: 14, fontFamily: "Inter_500Medium" },
  recentDocCat: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },

  emptyCard: {
    borderRadius: 16, borderWidth: 1, borderStyle: "dashed",
    padding: 28, alignItems: "center", gap: 10,
  },
  emptyIconWrap: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18 },

  empresaCard: {
    borderRadius: 16, borderWidth: 1, padding: 16,
    flexDirection: "row", alignItems: "center", gap: 14,
  },
  empresaIcon: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  empresaTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  empresaSub: { fontSize: 12, fontFamily: "Inter_400Regular" },

  secBar: {
    flexDirection: "row", alignItems: "center", gap: 14, padding: 14,
    borderRadius: 14, borderWidth: 1,
  },
  secIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  secTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  secSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#00D4FF", marginTop: 1 },
  secChevron: { marginLeft: "auto", width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },

  networkCTA: {
    borderRadius: 16, borderWidth: 1, padding: 16,
    flexDirection: "row", alignItems: "center", gap: 14,
  },
  networkIcon: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  networkTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  networkSub: { fontSize: 12, fontFamily: "Inter_400Regular" },

  // SOS Button
  sosBtn: {
    position: "absolute", right: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: "#E53E3E",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#E53E3E", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 12, elevation: 10,
  },
  sosBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold" },

  // Modal shared
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center", alignItems: "center", padding: 24,
  },

  // QR Modal
  qrModal: {
    borderRadius: 24, padding: 24, width: "100%",
    alignItems: "center", gap: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3, shadowRadius: 20, elevation: 20,
  },
  qrModalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", width: "100%" },
  qrModalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  qrContainer: { padding: 16, borderRadius: 16 },
  qrName: { fontSize: 18, fontFamily: "Inter_700Bold", marginTop: 4 },
  qrId: { fontSize: 12, fontFamily: "Inter_400Regular", letterSpacing: 1 },
  qrHint: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18, paddingHorizontal: 8 },

  // SOS Modal
  sosModal: {
    borderRadius: 24, padding: 24, width: "100%",
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3, shadowRadius: 20, elevation: 20,
    gap: 12,
  },
  sosModalHeader: { alignItems: "center", gap: 8, marginBottom: 4 },
  sosIconBig: { width: 64, height: 64, alignItems: "center", justifyContent: "center" },
  sosIconText: { fontSize: 48 },
  sosTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  sosSub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  healthCard: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 14,
    borderRadius: 14, borderWidth: 1,
  },
  healthTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  healthSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  call911Btn: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: "#E53E3E", borderRadius: 14, padding: 16,
  },
  call911Text: { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold" },
  call911Sub: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontFamily: "Inter_400Regular" },
  emergencyRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 12, borderRadius: 12, borderWidth: 1,
  },
  emergencyNumBadge: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  emergencyNum: { color: "#E53E3E", fontSize: 16, fontFamily: "Inter_700Bold" },
  emergencyLabel: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  cancelSOSBtn: { alignItems: "center", paddingVertical: 12 },
  cancelSOSText: { fontSize: 15, fontFamily: "Inter_500Medium" },
});
