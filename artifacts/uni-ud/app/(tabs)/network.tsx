import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
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

import Colors from "@/constants/colors";
import { NETWORK_PLANS, useIdentity } from "@/context/IdentityContext";

const ECOSYSTEMS = [
  { icon: "briefcase", label: "Bancos", desc: "Abrí cuentas y operá sin papel" },
  { icon: "book", label: "Escuelas", desc: "Inscripciones y legajos digitales" },
  { icon: "activity", label: "Hospitales", desc: "Historia clínica unificada" },
  { icon: "navigation", label: "Aeropuertos", desc: "Check-in con tu identidad" },
  { icon: "shield", label: "Gobierno", desc: "Trámites 100% digitales" },
  { icon: "home", label: "Inmobiliarias", desc: "Escrituras y contratos digitales" },
];

export default function NetworkScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const { node, updateNode } = useIdentity();
  const [purchasing, setPurchasing] = useState<string | null>(null);

  const handlePurchase = async (planId: string) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setPurchasing(planId);
    await new Promise((r) => setTimeout(r, 1500));
    await updateNode({ networkPlan: planId as "basic" | "pro" });
    setPurchasing(null);
    Alert.alert(
      "¡Listo!",
      `Tu identidad ya está conectada al plan ${planId === "basic" ? "Básico" : "Pro"}.`
    );
  };

  const connectionCount = 147382;

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
      <Text style={[styles.title, { color: colors.text }]}>Conexiones</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Usá tu identidad digital donde más la necesitás
      </Text>

      {/* Connection counter */}
      <View
        style={[
          styles.counterCard,
          {
            backgroundColor: isDark ? "#0D1525" : "#EEF4FF",
            borderColor: colors.border,
          },
        ]}
      >
        <View style={styles.counterDots}>
          {[...Array(7)].map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: i === 3 ? colors.tint : colors.tint + "40",
                  width: i === 3 ? 20 : 10,
                  height: i === 3 ? 20 : 10,
                  borderRadius: i === 3 ? 10 : 5,
                },
              ]}
            />
          ))}
        </View>
        <Text style={[styles.counterNum, { color: colors.text }]}>
          {connectionCount.toLocaleString("es-AR")}
        </Text>
        <Text style={[styles.counterLabel, { color: colors.textSecondary }]}>
          personas conectadas en la red
        </Text>
        {node?.networkPlan !== "free" && (
          <View
            style={[styles.connectedBadge, { backgroundColor: colors.tint }]}
          >
            <View style={styles.connectedDot} />
            <Text style={styles.connectedText}>Tu identidad está conectada</Text>
          </View>
        )}
      </View>

      {/* Active plan */}
      {node?.networkPlan !== "free" && (
        <View
          style={[
            styles.activePlan,
            {
              backgroundColor: colors.backgroundCard,
              borderColor: colors.tint + "60",
            },
          ]}
        >
          <Feather name="check-circle" size={20} color={colors.success} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.activePlanTitle, { color: colors.text }]}>
              {node?.networkPlan === "basic" ? "Conexión Básica activa" : "Conexión Pro activa"}
            </Text>
            <Text style={[styles.activePlanSub, { color: colors.textSecondary }]}>
              Tu identidad está habilitada en el ecosistema
            </Text>
          </View>
        </View>
      )}

      {/* Ecosystem */}
      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Dónde podés usarla
      </Text>
      <View style={styles.ecosystemGrid}>
        {ECOSYSTEMS.map((item) => (
          <View
            key={item.label}
            style={[
              styles.ecoCard,
              { backgroundColor: colors.backgroundCard, borderColor: colors.border },
            ]}
          >
            <View
              style={[
                styles.ecoIcon,
                { backgroundColor: colors.tint + "18" },
              ]}
            >
              <Feather name={item.icon as any} size={20} color={colors.tint} />
            </View>
            <Text style={[styles.ecoLabel, { color: colors.text }]}>
              {item.label}
            </Text>
            <Text style={[styles.ecoDesc, { color: colors.textSecondary }]}>
              {item.desc}
            </Text>
          </View>
        ))}
      </View>

      {/* Plans */}
      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Planes de conexión
      </Text>

      {NETWORK_PLANS.map((plan) => {
        const isActive = node?.networkPlan === plan.id;
        const isPro = plan.id === "pro";
        return (
          <View
            key={plan.id}
            style={[
              styles.planCard,
              {
                backgroundColor: isPro
                  ? isDark
                    ? "#0A1628"
                    : "#EEF4FF"
                  : colors.backgroundCard,
                borderColor: isPro ? colors.tint + "80" : colors.border,
                borderWidth: isPro ? 1.5 : 1,
              },
            ]}
          >
            {isPro && (
              <View style={[styles.proBadge, { backgroundColor: colors.tint }]}>
                <Text style={styles.proBadgeText}>Más popular</Text>
              </View>
            )}
            <View style={styles.planHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.planName, { color: colors.text }]}>
                  {plan.name}
                </Text>
                <Text style={[styles.planDesc, { color: colors.textSecondary }]}>
                  {plan.description}
                </Text>
              </View>
              <View style={styles.priceWrap}>
                <Text style={[styles.price, { color: colors.text }]}>
                  ${plan.price}
                </Text>
                <Text style={[styles.pricePer, { color: colors.textSecondary }]}>
                  /mes
                </Text>
              </View>
            </View>
            <View style={styles.features}>
              {plan.features.map((f, i) => (
                <View key={i} style={styles.featureRow}>
                  <Feather name="check" size={15} color={colors.success} />
                  <Text style={[styles.featureText, { color: colors.text }]}>
                    {f}
                  </Text>
                </View>
              ))}
            </View>
            <Pressable
              onPress={() => !isActive && handlePurchase(plan.id)}
              disabled={isActive || purchasing === plan.id}
              style={({ pressed }) => [
                styles.planBtn,
                {
                  backgroundColor: isActive
                    ? colors.success + "20"
                    : isPro
                    ? colors.tint
                    : colors.backgroundCard,
                  borderColor: isActive
                    ? colors.success
                    : isPro
                    ? colors.tint
                    : colors.border,
                  borderWidth: isActive || !isPro ? 1 : 0,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.planBtnText,
                  {
                    color: isActive
                      ? colors.success
                      : isPro
                      ? "#fff"
                      : colors.text,
                  },
                ]}
              >
                {purchasing === plan.id
                  ? "Procesando..."
                  : isActive
                  ? "Plan activo"
                  : `Activar ${plan.name}`}
              </Text>
            </Pressable>
          </View>
        );
      })}

      <View
        style={[
          styles.infoCard,
          { backgroundColor: colors.backgroundCard, borderColor: colors.border },
        ]}
      >
        <Feather name="shield" size={18} color={colors.tint} />
        <Text style={[styles.infoText, { color: colors.textSecondary }]}>
          Tu identidad está protegida con cifrado de extremo a extremo. Ningún tercero puede acceder a tu información sin tu autorización.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  counterCard: {
    marginHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    marginBottom: 20,
    gap: 8,
  },
  counterDots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  dot: {},
  counterNum: { fontSize: 36, fontFamily: "Inter_700Bold" },
  counterLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  connectedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 8,
  },
  connectedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#00FF9C",
  },
  connectedText: { color: "#fff", fontSize: 12, fontFamily: "Inter_500Medium" },
  activePlan: {
    marginHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 24,
  },
  activePlanTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
  },
  activePlanSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  ecosystemGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 14,
    gap: 10,
    marginBottom: 28,
  },
  ecoCard: {
    width: "30%",
    flex: 1,
    minWidth: 95,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  ecoIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  ecoLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  ecoDesc: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 15 },
  planCard: {
    marginHorizontal: 20,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    overflow: "hidden",
  },
  proBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 12,
  },
  proBadgeText: { color: "#fff", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  planHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
    gap: 12,
  },
  planName: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 4 },
  planDesc: { fontSize: 13, fontFamily: "Inter_400Regular" },
  priceWrap: { alignItems: "flex-end" },
  price: { fontSize: 28, fontFamily: "Inter_700Bold" },
  pricePer: { fontSize: 12, fontFamily: "Inter_400Regular" },
  features: { gap: 10, marginBottom: 20 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  featureText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  planBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  planBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  infoCard: {
    marginHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    marginBottom: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
});
