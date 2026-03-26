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
    // Simulate purchase flow
    await new Promise((r) => setTimeout(r, 1500));
    await updateNode({ networkPlan: planId as "basic" | "pro" });
    setPurchasing(null);
    Alert.alert("¡Activado!", `Tu ${planId === "basic" ? "Red Básica" : "Red Pro"} ya está activa.`);
  };

  const nodeCount = 147382;

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
      <Text style={[styles.title, { color: colors.text }]}>Red Cognitiva</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Una red descentralizada de identidad digital
      </Text>

      {/* Live Node visualization */}
      <View style={[styles.networkViz, { backgroundColor: isDark ? "#0D1525" : "#EEF4FF", borderColor: colors.border }]}>
        <View style={styles.networkNodes}>
          {[...Array(7)].map((_, i) => (
            <View
              key={i}
              style={[
                styles.vizNode,
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
        <View style={styles.networkLine} />
        <Text style={[styles.vizStat, { color: colors.text }]}>
          {nodeCount.toLocaleString("es-AR")}
        </Text>
        <Text style={[styles.vizLabel, { color: colors.textSecondary }]}>nodos activos en la red</Text>

        {node?.networkPlan !== "free" && (
          <View style={[styles.activeBadge, { backgroundColor: colors.tint }]}>
            <View style={styles.activeDot} />
            <Text style={styles.activeText}>Tu nodo está conectado</Text>
          </View>
        )}
      </View>

      {/* Current plan */}
      {node?.networkPlan !== "free" && (
        <View style={[styles.currentPlan, { backgroundColor: colors.backgroundCard, borderColor: colors.tint + "60" }]}>
          <Feather name="check-circle" size={20} color={colors.success} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.currentPlanTitle, { color: colors.text }]}>
              Plan activo: {node?.networkPlan === "basic" ? "Red Básica" : "Red Pro"}
            </Text>
            <Text style={[styles.currentPlanSub, { color: colors.textSecondary }]}>
              Tu identidad está verificada y conectada
            </Text>
          </View>
        </View>
      )}

      {/* Plans */}
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Planes disponibles</Text>

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
                  ? isDark ? "#0A1628" : "#EEF4FF"
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
              <View>
                <Text style={[styles.planName, { color: colors.text }]}>{plan.name}</Text>
                <Text style={[styles.planDesc, { color: colors.textSecondary }]}>{plan.description}</Text>
              </View>
              <View style={styles.priceWrap}>
                <Text style={[styles.price, { color: colors.text }]}>${plan.price}</Text>
                <Text style={[styles.pricePer, { color: colors.textSecondary }]}>/mes</Text>
              </View>
            </View>

            <View style={styles.features}>
              {plan.features.map((f, i) => (
                <View key={i} style={styles.featureRow}>
                  <Feather name="check" size={15} color={colors.success} />
                  <Text style={[styles.featureText, { color: colors.text }]}>{f}</Text>
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
                  borderColor: isActive ? colors.success : isPro ? colors.tint : colors.border,
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

      {/* Info */}
      <View style={[styles.infoCard, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
        <Feather name="shield" size={18} color={colors.tint} />
        <Text style={[styles.infoText, { color: colors.textSecondary }]}>
          Todos los planes incluyen cifrado de extremo a extremo y cumplen con las normativas internacionales de protección de datos.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 26, fontFamily: "Inter_700Bold", paddingHorizontal: 20, marginBottom: 4 },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", paddingHorizontal: 20, marginBottom: 24 },
  networkViz: {
    marginHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    marginBottom: 20,
    gap: 8,
  },
  networkNodes: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  vizNode: {},
  networkLine: {
    position: "absolute",
    top: "40%",
    left: 24,
    right: 24,
    height: 1,
    backgroundColor: "#1A6FE830",
  },
  vizStat: { fontSize: 36, fontFamily: "Inter_700Bold" },
  vizLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  activeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 8,
  },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#00FF9C" },
  activeText: { color: "#fff", fontSize: 12, fontFamily: "Inter_500Medium" },
  currentPlan: {
    marginHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 24,
  },
  currentPlanTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  currentPlanSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  sectionTitle: { fontSize: 18, fontFamily: "Inter_700Bold", paddingHorizontal: 20, marginBottom: 14 },
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
  planDesc: { fontSize: 13, fontFamily: "Inter_400Regular", maxWidth: 180 },
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
  infoText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
});
