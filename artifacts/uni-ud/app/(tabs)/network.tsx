import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { Radii, Shadows, Spacing } from "@/constants/design";
import { useLanguage } from "@/context/LanguageContext";

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
  const { t } = useLanguage();

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

          <View style={[styles.connectedBadge, { backgroundColor: colors.tint }]}>
            <View style={styles.connectedDot} />
            <Text style={styles.connectedText}>{t.identityConnected ?? "Identidad conectada"}</Text>
          </View>
        </LinearGradient>
      </View>

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
