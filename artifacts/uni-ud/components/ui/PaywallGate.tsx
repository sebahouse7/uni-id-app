import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import Colors from "@/constants/colors";
import { Radii, Spacing } from "@/constants/design";

interface PaywallGateProps {
  feature?: string;
  limitReached?: boolean;
  currentCount?: number;
  maxCount?: number;
  compact?: boolean;
}

export function PaywallGate({
  feature = "esta función",
  limitReached = false,
  currentCount,
  maxCount,
  compact = false,
}: PaywallGateProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;

  if (compact) {
    return (
      <View style={[styles.compactWrap, { backgroundColor: colors.card, borderColor: "#1A6FE830" }]}>
        <LinearGradient
          colors={["#1A6FE8", "#7C3AED"]}
          style={styles.compactIcon}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Feather name="lock" size={14} color="#fff" />
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={[styles.compactTitle, { color: colors.text }]}>
            {limitReached
              ? `Límite alcanzado (${currentCount}/${maxCount})`
              : `Requiere Conexión Pro`}
          </Text>
          <Text style={[styles.compactSub, { color: colors.textSecondary }]}>
            {limitReached ? "Activá un plan para agregar más" : `Activá un plan para usar ${feature}`}
          </Text>
        </View>
        <Pressable
          onPress={() => router.push("/(tabs)/network")}
          style={[styles.compactBtn, { backgroundColor: "#1A6FE8" }]}
        >
          <Text style={styles.compactBtnText}>Activar</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderColor: "#1A6FE830" }]}>
      <LinearGradient
        colors={["#1A6FE810", "#7C3AED08"]}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={["#1A6FE8", "#7C3AED"]}
        style={styles.iconWrap}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Feather name="lock" size={24} color="#fff" />
      </LinearGradient>

      <Text style={[styles.title, { color: colors.text }]}>
        {limitReached
          ? `Límite del plan gratuito`
          : "Función Pro"}
      </Text>

      {limitReached && currentCount !== undefined && maxCount !== undefined ? (
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Usaste {currentCount} de {maxCount} documentos disponibles en el plan gratuito.
          Activá Conexión Básica para guardar documentos ilimitados con backup cifrado en la nube.
        </Text>
      ) : (
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {feature} está disponible con Conexión Básica o Pro.
          Activá un plan para acceder a todas las funcionalidades.
        </Text>
      )}

      <View style={styles.featureList}>
        {["Documentos ilimitados", "Backup cifrado en la nube", "Acceso desde múltiples dispositivos", "Verificación de identidad"].map((f) => (
          <View key={f} style={styles.featureRow}>
            <Feather name="check" size={14} color="#1A6FE8" />
            <Text style={[styles.featureText, { color: colors.textSecondary }]}>{f}</Text>
          </View>
        ))}
      </View>

      <Pressable
        onPress={() => router.push("/(tabs)/network")}
        style={styles.ctaBtn}
      >
        <LinearGradient
          colors={["#1A6FE8", "#7C3AED"]}
          style={styles.ctaBtnGrad}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <Feather name="zap" size={16} color="#fff" />
          <Text style={styles.ctaBtnText}>Ver planes de conexión</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    margin: Spacing.md,
    borderRadius: Radii.xl,
    borderWidth: 1,
    padding: Spacing.lg,
    alignItems: "center",
    gap: 12,
    overflow: "hidden",
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  featureList: {
    width: "100%",
    gap: 8,
    marginTop: 4,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  featureText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  ctaBtn: {
    width: "100%",
    marginTop: 8,
  },
  ctaBtnGrad: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: Radii.lg,
  },
  ctaBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },

  compactWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: Radii.lg,
    borderWidth: 1,
    padding: 12,
    marginHorizontal: Spacing.md,
    marginVertical: 6,
  },
  compactIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  compactTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
  },
  compactSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  compactBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  compactBtnText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
});
