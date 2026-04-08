import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useState } from "react";
import {
  Alert,
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
import { NETWORK_PLANS, useIdentity } from "@/context/IdentityContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  PlanId,
  createMercadoPagoCheckout,
  openPaymentBrowser,
} from "@/lib/payments";
import { apiGetSubscriptionStatus } from "@/lib/apiClient";

const ECOSYSTEMS = [
  { icon: "briefcase", labelKey: "banks", descKey: "banksDesc", color: "#1A6FE8" },
  { icon: "book", labelKey: "schools", descKey: "schoolsDesc", color: "#7C3AED" },
  { icon: "activity", labelKey: "hospitals", descKey: "hospitalsDesc", color: "#E53E3E" },
  { icon: "navigation", labelKey: "airports", descKey: "airportsDesc", color: "#00D4FF" },
  { icon: "shield", labelKey: "government", descKey: "governmentDesc", color: "#38A169" },
  { icon: "home", labelKey: "realestate", descKey: "realestateDesc", color: "#D69E2E" },
];

export default function NetworkScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const { node, updateNode } = useIdentity();
  const { t } = useLanguage();
  const [purchasing, setPurchasing] = useState<string | null>(null);

  const handlePurchase = async (planId: PlanId) => {
    if (!node) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setPurchasing(planId);
    try {
      const result = await createMercadoPagoCheckout(planId, node.id);

      if (!result.url) {
        Alert.alert(
          "Sin link de pago",
          "El servidor no devolvió un link de pago. Verificá tu conexión e intentá de nuevo."
        );
        return;
      }

      const status = await openPaymentBrowser(result.url);

      if (status === "cancelled") {
        // User closed the browser — don't show an alert, just reset
        return;
      }

      // Poll backend for real subscription status — never trust client-side
      let attempts = 0;
      let activated = false;
      while (attempts < 8 && !activated) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const sub = await apiGetSubscriptionStatus();
          const activePlan = sub?.current?.plan;
          if (activePlan && activePlan !== "free" && sub?.current?.isActive) {
            await updateNode({ networkPlan: activePlan as "basic" | "pro" });
            Alert.alert(
              "✅ Plan activado",
              `Tu plan ${activePlan === "basic" ? "Conexión Básica" : "Conexión Pro"} está activo.`
            );
            activated = true;
          }
        } catch {}
        attempts++;
      }
      if (!activated) {
        Alert.alert(
          "Pago en verificación",
          "Tu pago está siendo procesado. El plan se activará automáticamente. Cerrá y abrí la app en unos minutos."
        );
      }
    } catch (e: any) {
      const msg = e?.message ?? "Error desconocido";
      Alert.alert(
        "Error al procesar pago",
        msg.includes("Tiempo de espera") || msg.includes("conexión")
          ? "Sin conexión al servidor. Verificá tu internet e intentá de nuevo."
          : msg
      );
    } finally {
      setPurchasing(null);
    }
  };

  const connectionCount = 147382;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) + 12,
        paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 110,
      }}
    >
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: Spacing.md }]}>
        <Text style={[styles.title, { color: colors.text }]}>{t.networkTitle}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t.networkSubtitle}</Text>
      </View>

      {/* Connection hero */}
      <View style={{ paddingHorizontal: Spacing.md, marginBottom: 20 }}>
        <LinearGradient
          colors={isDark ? ["#0A1628", "#0D2040"] : ["#EEF4FF", "#E0ECFF"]}
          style={[styles.counterCard, { borderColor: isDark ? "#1A3060" : "#C8D8F0" }, Shadows.md]}
        >
          {/* Network dots visualization */}
          <View style={styles.networkViz}>
            {[...Array(9)].map((_, i) => {
              const isCenter = i === 4;
              return (
                <View
                  key={i}
                  style={[
                    styles.vizDot,
                    {
                      width: isCenter ? 22 : i % 3 === 1 ? 14 : 10,
                      height: isCenter ? 22 : i % 3 === 1 ? 14 : 10,
                      borderRadius: isCenter ? 11 : i % 3 === 1 ? 7 : 5,
                      backgroundColor: isCenter
                        ? colors.tint
                        : i % 2 === 0
                        ? colors.tint + "60"
                        : colors.tint + "30",
                    },
                  ]}
                />
              );
            })}
          </View>

          <Text style={[styles.counterNum, { color: colors.text }]}>
            {connectionCount.toLocaleString("es-AR")}
          </Text>
          <Text style={[styles.counterLabel, { color: colors.textSecondary }]}>
            {t.connectedCount}
          </Text>

          {node?.networkPlan !== "free" ? (
            <View style={[styles.connectedBadge, { backgroundColor: colors.tint }]}>
              <View style={styles.connectedDot} />
              <Text style={styles.connectedText}>{t.identityConnected}</Text>
            </View>
          ) : (
            <View
              style={[
                styles.freeBadge,
                { backgroundColor: colors.textSecondary + "18", borderColor: colors.border },
              ]}
            >
              <Feather name="lock" size={12} color={colors.textSecondary} />
              <Text style={[styles.freeBadgeText, { color: colors.textSecondary }]}>
                Conectate con un plan para acceder a la red
              </Text>
            </View>
          )}
        </LinearGradient>
      </View>

      {/* Active plan badge */}
      {node?.networkPlan !== "free" && (
        <View style={{ paddingHorizontal: Spacing.md, marginBottom: 20 }}>
          <View
            style={[
              styles.activePlan,
              {
                backgroundColor: colors.success + "10",
                borderColor: colors.success + "40",
              },
            ]}
          >
            <View style={[styles.activePlanIcon, { backgroundColor: colors.success + "18" }]}>
              <Feather name="check-circle" size={18} color={colors.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.activePlanTitle, { color: colors.text }]}>
                {node?.networkPlan === "basic" ? t.basicActive : t.proActive}
              </Text>
              <Text style={[styles.activePlanSub, { color: colors.textSecondary }]}>
                {t.identityEnabledEco}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Ecosystem */}
      <Text style={[styles.sectionTitle, { color: colors.text, paddingHorizontal: Spacing.md }]}>
        {t.whereToUse}
      </Text>
      <View style={styles.ecosystemGrid}>
        {ECOSYSTEMS.map((item) => (
          <View
            key={item.labelKey}
            style={[
              styles.ecoCard,
              { backgroundColor: colors.backgroundCard, borderColor: colors.border },
              Shadows.sm,
            ]}
          >
            <View style={[styles.ecoIcon, { backgroundColor: item.color + "18" }]}>
              <Feather name={item.icon as any} size={20} color={item.color} />
            </View>
            <Text style={[styles.ecoLabel, { color: colors.text }]}>{t[item.labelKey]}</Text>
            <Text style={[styles.ecoDesc, { color: colors.textSecondary }]} numberOfLines={2}>
              {t[item.descKey]}
            </Text>
          </View>
        ))}
      </View>

      {/* Plans */}
      <Text style={[styles.sectionTitle, { color: colors.text, paddingHorizontal: Spacing.md }]}>
        {t.connectionPlans}
      </Text>

      {/* Payment provider */}
      <View style={{ paddingHorizontal: Spacing.md, marginBottom: 16 }}>
        <View
          style={[
            styles.providerBadge,
            { backgroundColor: colors.backgroundCard, borderColor: colors.border },
          ]}
        >
          <View style={[styles.providerIcon, { backgroundColor: colors.success + "18" }]}>
            <Feather name="lock" size={13} color={colors.success} />
          </View>
          <Text style={[styles.providerText, { color: colors.textSecondary }]}>
            Pagos procesados por{" "}
            <Text style={{ color: colors.text, fontFamily: "Inter_600SemiBold" }}>
              Mercado Pago
            </Text>{" "}
            — 100% seguro
          </Text>
        </View>
      </View>

      {NETWORK_PLANS.map((plan) => {
        const isActive = node?.networkPlan === plan.id;
        const isPro = plan.id === "pro";

        return (
          <View key={plan.id} style={{ paddingHorizontal: Spacing.md, marginBottom: 16 }}>
            <LinearGradient
              colors={
                isPro
                  ? isDark
                    ? ["#0A1628", "#0F1E3A"]
                    : ["#EEF4FF", "#E0ECFF"]
                  : isDark
                  ? ["#0D1525", "#0D1525"]
                  : ["#fff", "#fff"]
              }
              style={[
                styles.planCard,
                {
                  borderColor: isPro
                    ? isDark
                      ? "#1A6FE860"
                      : "#1A6FE840"
                    : colors.border,
                  borderWidth: isPro ? 1.5 : 1,
                },
                Shadows.md,
              ]}
            >
              {isPro && (
                <View style={[styles.proBadge, { backgroundColor: colors.tint }]}>
                  <Feather name="zap" size={11} color="#fff" />
                  <Text style={styles.proBadgeText}>{t.mostPopular}</Text>
                </View>
              )}

              <View style={styles.planHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.planName, { color: colors.text }]}>{plan.name}</Text>
                  <Text style={[styles.planDesc, { color: colors.textSecondary }]}>
                    {plan.description}
                  </Text>
                </View>
                <View style={styles.priceWrap}>
                  <Text style={[styles.price, { color: colors.text }]}>${plan.price}</Text>
                  <Text style={[styles.pricePer, { color: colors.textSecondary }]}>
                    {t.perMonth}
                  </Text>
                </View>
              </View>

              <View style={styles.features}>
                {plan.features.map((f, i) => (
                  <View key={i} style={styles.featureRow}>
                    <View
                      style={[styles.featureCheck, { backgroundColor: colors.success + "18" }]}
                    >
                      <Feather name="check" size={12} color={colors.success} />
                    </View>
                    <Text style={[styles.featureText, { color: colors.text }]}>{f}</Text>
                  </View>
                ))}
              </View>

              <AnimatedPressable
                onPress={() => !isActive && handlePurchase(plan.id as PlanId)}
                disabled={isActive || !!purchasing}
                scale={0.97}
              >
                {isActive ? (
                  <View
                    style={[
                      styles.planBtn,
                      {
                        backgroundColor: colors.success + "15",
                        borderColor: colors.success + "50",
                        borderWidth: 1,
                      },
                    ]}
                  >
                    <Feather name="check-circle" size={16} color={colors.success} />
                    <Text style={[styles.planBtnText, { color: colors.success }]}>
                      {t.planActive}
                    </Text>
                  </View>
                ) : isPro ? (
                  <LinearGradient
                    colors={["#1A6FE8", "#0D8AEB"]}
                    style={[styles.planBtn, Shadows.colored("#1A6FE8")]}
                  >
                    <Text style={[styles.planBtnText, { color: "#fff" }]}>
                      {purchasing === plan.id ? t.processing : `${t.activate} ${plan.name}`}
                    </Text>
                  </LinearGradient>
                ) : (
                  <View
                    style={[
                      styles.planBtn,
                      {
                        backgroundColor: colors.backgroundCard,
                        borderColor: colors.border,
                        borderWidth: 1,
                      },
                    ]}
                  >
                    <Text style={[styles.planBtnText, { color: colors.text }]}>
                      {purchasing === plan.id ? t.processing : `${t.activate} ${plan.name}`}
                    </Text>
                  </View>
                )}
              </AnimatedPressable>
            </LinearGradient>
          </View>
        );
      })}

      {/* Security note */}
      <View style={{ paddingHorizontal: Spacing.md }}>
        <View
          style={[
            styles.infoCard,
            { backgroundColor: colors.backgroundCard, borderColor: colors.border },
          ]}
        >
          <View style={[styles.infoIcon, { backgroundColor: colors.tint + "18" }]}>
            <Feather name="shield" size={16} color={colors.tint} />
          </View>
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>{t.e2eNote}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { marginBottom: 20 },
  title: { fontSize: 26, fontFamily: "Inter_700Bold", marginBottom: 4 },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular" },

  counterCard: {
    borderRadius: Radii.card,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    gap: 10,
  },
  networkViz: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: 72,
    gap: 6,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  vizDot: {},
  counterNum: { fontSize: 40, fontFamily: "Inter_700Bold", lineHeight: 44 },
  counterLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  connectedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Radii.pill,
    marginTop: 4,
  },
  connectedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#00FF9C" },
  connectedText: { color: "#fff", fontSize: 12, fontFamily: "Inter_500Medium" },
  freeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radii.pill,
    borderWidth: 1,
    marginTop: 4,
  },
  freeBadgeText: { fontSize: 12, fontFamily: "Inter_400Regular" },

  activePlan: {
    borderRadius: Radii.lg,
    borderWidth: 1,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  activePlanIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  activePlanTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  activePlanSub: { fontSize: 12, fontFamily: "Inter_400Regular" },

  sectionTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 14 },

  ecosystemGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: Spacing.sm + 4,
    gap: 10,
    marginBottom: 28,
  },
  ecoCard: {
    width: "30%",
    flex: 1,
    minWidth: 95,
    borderRadius: Radii.lg,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  ecoIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  ecoLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  ecoDesc: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16 },

  providerBadge: {
    borderRadius: Radii.md,
    borderWidth: 1,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  providerIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  providerText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular" },

  planCard: {
    borderRadius: Radii.card,
    padding: 20,
    overflow: "hidden",
  },
  proBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radii.pill,
    marginBottom: 14,
  },
  proBadgeText: { color: "#fff", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  planHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 18,
    gap: 12,
  },
  planName: { fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 4 },
  planDesc: { fontSize: 13, fontFamily: "Inter_400Regular" },
  priceWrap: { alignItems: "flex-end" },
  price: { fontSize: 32, fontFamily: "Inter_700Bold", lineHeight: 34 },
  pricePer: { fontSize: 12, fontFamily: "Inter_400Regular" },
  features: { gap: 10, marginBottom: 20 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  featureCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: { fontSize: 14, fontFamily: "Inter_400Regular", flex: 1 },
  planBtn: {
    paddingVertical: 14,
    borderRadius: Radii.lg,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  planBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },

  infoCard: {
    borderRadius: Radii.lg,
    borderWidth: 1,
    padding: 14,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  infoText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
});
