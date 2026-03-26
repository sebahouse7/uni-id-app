import { Feather } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { useIdentity } from "@/context/IdentityContext";
import { useLanguage } from "@/context/LanguageContext";

interface SecurityEvent {
  id: string;
  type: "blocked" | "learned" | "protected" | "scan";
  message: string;
  time: string;
  node?: string;
}

const MOCK_EVENTS: SecurityEvent[] = [
  { id: "1", type: "blocked", message: "Acceso no autorizado bloqueado", time: "hace 2 min", node: "Nodo #4821" },
  { id: "2", type: "learned", message: "Nuevo patrón de amenaza aprendido", time: "hace 15 min" },
  { id: "3", type: "protected", message: "8 nodos protegidos automáticamente", time: "hace 1 h" },
  { id: "4", type: "scan", message: "Análisis de integridad completado", time: "hace 3 h" },
  { id: "5", type: "blocked", message: "Intento de suplantación detectado", time: "hace 5 h", node: "Nodo #2047" },
  { id: "6", type: "learned", message: "Algoritmo de detección actualizado", time: "hace 1 d" },
];

const LAYERS = [
  {
    id: "user",
    label: "Usuario",
    sublabel: "Wallet uni.id / Humanidad",
    icon: "user",
    color: "#1A6FE8",
    description: "Tu identidad digital única en la red",
  },
  {
    id: "identity",
    label: "Red de Identidad",
    sublabel: "Nodos distribuidos globalmente",
    icon: "share-2",
    color: "#7C3AED",
    description: "Red descentralizada de verificación de identidad",
  },
  {
    id: "security",
    label: "Capa de Seguridad",
    sublabel: "Sistema inmunológico digital",
    icon: "shield",
    color: "#00D4FF",
    description: "Aprende y se protege sola detectando anomalías",
  },
  {
    id: "infra",
    label: "Infraestructura Global",
    sublabel: "Servidores distribuidos y cifrado E2E",
    icon: "globe",
    color: "#38A169",
    description: "Capa base de infraestructura distribuida y encriptada",
  },
];

function PulseCircle({ color, size, delay }: { color: string; size: number; delay: number }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <Animated.View
      style={{
        position: "absolute",
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1.5,
        borderColor: color,
        opacity: anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.8, 0.2, 0] }),
        transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 2] }) }],
      }}
    />
  );
}

function ThreatScore({ score }: { score: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: score, duration: 1200, useNativeDriver: false }).start();
  }, [score]);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;

  return (
    <View style={threatStyles.wrap}>
      <View style={[threatStyles.bar, { backgroundColor: colors.border }]}>
        <Animated.View
          style={[
            threatStyles.fill,
            {
              width: anim.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }),
              backgroundColor: score < 30 ? colors.success : score < 70 ? "#D69E2E" : colors.danger,
            },
          ]}
        />
      </View>
      <Text style={[threatStyles.label, { color: colors.textSecondary }]}>
        {score < 30 ? "Amenaza baja" : score < 70 ? "Amenaza moderada" : "Amenaza alta"}
      </Text>
    </View>
  );
}

const threatStyles = StyleSheet.create({
  wrap: { gap: 6 },
  bar: { height: 6, borderRadius: 3, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 3 },
  label: { fontSize: 11, fontFamily: "Inter_400Regular" },
});

export default function SecurityScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const { node, documents } = useIdentity();
  const { t } = useLanguage();
  const [threatLevel] = useState(12);
  const nodeCount = 147382;
  const protectedCount = 8241;

  const eventIcon: Record<SecurityEvent["type"], { name: string; color: string }> = {
    blocked: { name: "shield", color: colors.danger },
    learned: { name: "cpu", color: colors.tint },
    protected: { name: "check-circle", color: colors.success },
    scan: { name: "activity", color: "#D69E2E" },
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) + 16,
        paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 100,
        gap: 24,
      }}
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.title, { color: colors.text }]}>Seguridad</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Sistema inmunológico digital
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: colors.success + "20", borderColor: colors.success + "60" }]}>
          <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
          <Text style={[styles.statusText, { color: colors.success }]}>Activo</Text>
        </View>
      </View>

      {/* Live node visualization */}
      <View style={[styles.vizCard, { backgroundColor: isDark ? "#060B18" : "#EEF4FF", borderColor: colors.border }]}>
        <View style={styles.nodeCenter}>
          <PulseCircle color="#00D4FF" size={60} delay={0} />
          <PulseCircle color="#1A6FE8" size={60} delay={600} />
          <PulseCircle color="#7C3AED" size={60} delay={1200} />
          <View style={[styles.nodeDot, { backgroundColor: colors.tint }]}>
            <Feather name="shield" size={22} color="#fff" />
          </View>
        </View>
        <View style={styles.vizStats}>
          <View style={styles.vizStat}>
            <Text style={[styles.vizNum, { color: colors.text }]}>{nodeCount.toLocaleString("es-AR")}</Text>
            <Text style={[styles.vizLabel, { color: colors.textSecondary }]}>Nodos en red</Text>
          </View>
          <View style={[styles.vizDivider, { backgroundColor: colors.border }]} />
          <View style={styles.vizStat}>
            <Text style={[styles.vizNum, { color: colors.text }]}>{protectedCount.toLocaleString("es-AR")}</Text>
            <Text style={[styles.vizLabel, { color: colors.textSecondary }]}>Protegidos hoy</Text>
          </View>
          <View style={[styles.vizDivider, { backgroundColor: colors.border }]} />
          <View style={styles.vizStat}>
            <Text style={[styles.vizNum, { color: colors.text }]}>{documents.length}</Text>
            <Text style={[styles.vizLabel, { color: colors.textSecondary }]}>Tus docs</Text>
          </View>
        </View>
      </View>

      {/* Threat level */}
      <View style={[styles.card, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
        <View style={styles.cardHeader}>
          <Feather name="activity" size={18} color={colors.tint} />
          <Text style={[styles.cardTitle, { color: colors.text }]}>Nivel de amenaza en tiempo real</Text>
        </View>
        <ThreatScore score={threatLevel} />
        <Text style={[styles.cardNote, { color: colors.textSecondary }]}>
          La red aprendió y bloqueó 23 patrones nuevos en las últimas 24 hs.
        </Text>
      </View>

      {/* Architecture layers */}
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Arquitectura de seguridad</Text>
        <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>Capa adaptativa inteligente</Text>
      </View>

      <View style={[styles.layersCard, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
        {LAYERS.map((layer, i) => (
          <View key={layer.id}>
            <View style={styles.layerRow}>
              <View style={[styles.layerIcon, { backgroundColor: layer.color + "20" }]}>
                <Feather name={layer.icon as any} size={18} color={layer.color} />
              </View>
              <View style={styles.layerInfo}>
                <Text style={[styles.layerLabel, { color: colors.text }]}>{layer.label}</Text>
                <Text style={[styles.layerSub, { color: colors.textSecondary }]}>{layer.sublabel}</Text>
              </View>
              <View style={[styles.layerCheck, { backgroundColor: colors.success + "20" }]}>
                <Feather name="check" size={12} color={colors.success} />
              </View>
            </View>
            {i < LAYERS.length - 1 && (
              <View style={styles.layerArrow}>
                <View style={[styles.arrowLine, { backgroundColor: colors.border }]} />
                <Feather name="chevron-down" size={14} color={colors.border} />
              </View>
            )}
          </View>
        ))}
      </View>

      {/* Adaptive security explanation */}
      <View style={[styles.adaptiveCard, { backgroundColor: isDark ? "#0A1628" : "#EEF4FF", borderColor: "#1A6FE840" }]}>
        <View style={styles.adaptiveHeader}>
          <Feather name="cpu" size={18} color={colors.tint} />
          <Text style={[styles.adaptiveTitle, { color: colors.text }]}>Capa de Seguridad Adaptativa</Text>
        </View>
        <View style={styles.adaptiveSteps}>
          {[
            { icon: "alert-triangle", label: "Ataque detectado" },
            { icon: "cpu", label: "Red aprende el patrón" },
            { icon: "share-2", label: "Red protege otros nodos" },
            { icon: "trending-up", label: "La seguridad mejora" },
          ].map((step, i) => (
            <View key={i} style={styles.adaptiveStep}>
              <View style={[styles.adaptiveStepIcon, { backgroundColor: colors.tint + "20" }]}>
                <Feather name={step.icon as any} size={14} color={colors.tint} />
              </View>
              <Text style={[styles.adaptiveStepText, { color: colors.text }]}>{step.label}</Text>
              {i < 3 && <Feather name="arrow-right" size={12} color={colors.border} style={{ flex: 0 }} />}
            </View>
          ))}
        </View>
        <Text style={[styles.adaptiveNote, { color: colors.textSecondary }]}>
          El sistema se comporta como un organismo vivo — detecta anomalías y refuerza su propia seguridad continuamente.
        </Text>
      </View>

      {/* Security events */}
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Actividad reciente</Text>
      </View>
      <View style={[styles.eventsCard, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
        {MOCK_EVENTS.map((ev, i) => {
          const ico = eventIcon[ev.type];
          return (
            <View key={ev.id}>
              <View style={styles.eventRow}>
                <View style={[styles.eventIcon, { backgroundColor: ico.color + "18" }]}>
                  <Feather name={ico.name as any} size={15} color={ico.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.eventMsg, { color: colors.text }]}>{ev.message}</Text>
                  <Text style={[styles.eventMeta, { color: colors.textSecondary }]}>
                    {ev.node ? `${ev.node} · ` : ""}{ev.time}
                  </Text>
                </View>
              </View>
              {i < MOCK_EVENTS.length - 1 && (
                <View style={[styles.separator, { backgroundColor: colors.border }]} />
              )}
            </View>
          );
        })}
      </View>

      {/* E2E Encryption note */}
      <View style={[styles.e2eCard, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
        <Feather name="lock" size={18} color={colors.success} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.e2eTitle, { color: colors.text }]}>Cifrado de extremo a extremo</Text>
          <Text style={[styles.e2eText, { color: colors.textSecondary }]}>
            Todos tus documentos están cifrados con AES-256. Ni siquiera nosotros podemos acceder a tu contenido.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 20,
  },
  title: { fontSize: 26, fontFamily: "Inter_700Bold", marginBottom: 2 },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular" },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  vizCard: {
    marginHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 28,
    alignItems: "center",
    gap: 24,
  },
  nodeCenter: {
    width: 80,
    height: 80,
    alignItems: "center",
    justifyContent: "center",
  },
  nodeDot: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  vizStats: {
    flexDirection: "row",
    gap: 0,
    width: "100%",
    paddingHorizontal: 20,
  },
  vizStat: { flex: 1, alignItems: "center", gap: 4 },
  vizNum: { fontSize: 18, fontFamily: "Inter_700Bold" },
  vizLabel: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center" },
  vizDivider: { width: 1, marginVertical: 4 },
  card: {
    marginHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    gap: 14,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  cardNote: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  sectionHeader: { paddingHorizontal: 20, gap: 2 },
  sectionTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  sectionSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  layersCard: {
    marginHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    padding: 8,
  },
  layerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 12,
  },
  layerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  layerInfo: { flex: 1 },
  layerLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  layerSub: { fontSize: 11, fontFamily: "Inter_400Regular" },
  layerCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  layerArrow: { alignItems: "center", paddingVertical: 2 },
  arrowLine: { width: 1, height: 6, marginBottom: 0 },
  adaptiveCard: {
    marginHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    gap: 14,
  },
  adaptiveHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  adaptiveTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  adaptiveSteps: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  adaptiveStep: { flexDirection: "row", alignItems: "center", gap: 6 },
  adaptiveStepIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  adaptiveStepText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  adaptiveNote: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  eventsCard: {
    marginHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    padding: 4,
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
  },
  eventIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  eventMsg: { fontSize: 14, fontFamily: "Inter_500Medium", marginBottom: 2 },
  eventMeta: { fontSize: 11, fontFamily: "Inter_400Regular" },
  separator: { height: 1, marginHorizontal: 14 },
  e2eCard: {
    marginHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    flexDirection: "row",
    gap: 14,
    alignItems: "flex-start",
  },
  e2eTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  e2eText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
});
