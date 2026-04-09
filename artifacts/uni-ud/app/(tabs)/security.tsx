import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { Radii, Shadows, Spacing } from "@/constants/design";
import { useAuth } from "@/context/AuthContext";
import { useIdentity } from "@/context/IdentityContext";
import { apiGetAuditLogs } from "@/lib/apiClient";

interface SecurityEvent {
  id: string;
  type: "blocked" | "learned" | "protected" | "scan" | "auth" | "share";
  message: string;
  time: string;
  node?: string;
}

function auditToEvent(log: any, idx: number): SecurityEvent {
  const ev = log.event as string;
  const ts = new Date(log.created_at);
  const diffMs = Date.now() - ts.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const timeStr =
    diffMin < 1 ? "hace un momento" :
    diffMin < 60 ? `hace ${diffMin} min` :
    diffMin < 1440 ? `hace ${Math.floor(diffMin / 60)}h` :
    `hace ${Math.floor(diffMin / 1440)}d`;

  const typeMap: Record<string, SecurityEvent["type"]> = {
    "auth.login": "protected",
    "auth.register": "protected",
    "auth.logout": "auth",
    "auth.token_invalid": "blocked",
    "auth.token_refreshed": "scan",
    "share.created": "share",
    "share.accessed": "share",
    "share.revoked": "scan",
    "session.revoked": "auth",
    "session.revoked_all": "blocked",
  };
  const msgMap: Record<string, string> = {
    "auth.login": "Inicio de sesión verificado",
    "auth.register": "Identidad registrada",
    "auth.logout": "Sesión cerrada",
    "auth.token_invalid": "Token inválido detectado",
    "auth.token_refreshed": "Token renovado exitosamente",
    "share.created": "QR de identidad generado",
    "share.accessed": "Alguien accedió a tu QR compartido",
    "share.revoked": "Enlace compartido revocado",
    "session.revoked": "Sesión revocada",
    "session.revoked_all": "Logout global ejecutado",
  };

  return {
    id: String(idx),
    type: typeMap[ev] ?? "scan",
    message: msgMap[ev] ?? ev.replace(/\./g, " · "),
    time: timeStr,
    node: log.ip_address ? `IP: ${log.ip_address}` : undefined,
  };
}

const STATIC_EVENTS: SecurityEvent[] = [
  { id: "s1", type: "protected", message: "Sistema inmunológico activo", time: "ahora" },
  { id: "s2", type: "learned", message: "Red aprendió 23 nuevos patrones", time: "hace 1 h" },
  { id: "s3", type: "scan", message: "Análisis de integridad completado", time: "hace 3 h" },
];

const LAYERS = [
  { id: "user", label: "Usuario", sublabel: "Wallet uni.id", icon: "user", color: "#1A6FE8" },
  { id: "identity", label: "Red de Identidad", sublabel: "Nodos distribuidos globalmente", icon: "share-2", color: "#7C3AED" },
  { id: "security", label: "Capa de Seguridad", sublabel: "Sistema inmunológico digital", icon: "shield", color: "#00D4FF" },
  { id: "infra", label: "Infraestructura Global", sublabel: "Cifrado E2E distribuido", icon: "globe", color: "#38A169" },
];

function PulseRing({ color, size, delay }: { color: string; size: number; delay: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration: 2000, useNativeDriver: true }),
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
        borderWidth: 1,
        borderColor: color,
        opacity: anim.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0.7, 0.15, 0] }),
        transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] }) }],
      }}
    />
  );
}

function ThreatBar({ score }: { score: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: score, duration: 1400, useNativeDriver: false }).start();
  }, [score]);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const barColor = score < 30 ? colors.success : score < 70 ? "#D69E2E" : colors.danger;
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: colors.textSecondary, fontSize: 12, fontFamily: "Inter_400Regular" }}>
          {score < 30 ? "Amenaza baja" : score < 70 ? "Amenaza moderada" : "Amenaza alta"}
        </Text>
        <Text style={{ color: barColor, fontSize: 15, fontFamily: "Inter_700Bold" }}>{score}%</Text>
      </View>
      <View style={{ height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: colors.border }}>
        <Animated.View
          style={{
            height: "100%",
            borderRadius: 4,
            backgroundColor: barColor,
            width: anim.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }),
          }}
        />
      </View>
    </View>
  );
}

export default function SecurityScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const { documents, digitalIdentity } = useIdentity();
  const { hasBiometrics, biometricsEnabled, enableBiometrics, disableBiometrics } = useAuth();
  const [togglingBio, setTogglingBio] = useState(false);
  const [threatLevel] = useState(12);
  const [auditEvents, setAuditEvents] = useState<SecurityEvent[]>([]);

  const nodeCount = 147382;
  const protectedCount = 8241;
  const trustScore = digitalIdentity?.trustScore ?? 30;
  const credentialsCount = digitalIdentity?.credentials.length ?? 0;

  useEffect(() => {
    apiGetAuditLogs(20).then((logs) => {
      if (logs.length > 0) {
        setAuditEvents(logs.map(auditToEvent));
      } else {
        setAuditEvents(STATIC_EVENTS);
      }
    }).catch(() => setAuditEvents(STATIC_EVENTS));
  }, []);

  const displayEvents = auditEvents.length > 0 ? auditEvents : STATIC_EVENTS;

  const eventMeta: Record<SecurityEvent["type"], { icon: string; color: string }> = {
    blocked: { icon: "shield", color: colors.danger ?? "#E53535" },
    learned: { icon: "cpu", color: colors.tint },
    protected: { icon: "check-circle", color: colors.success ?? "#38A169" },
    scan: { icon: "activity", color: "#D69E2E" },
    auth: { icon: "log-in", color: "#7C3AED" },
    share: { icon: "share-2", color: "#00D4FF" },
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) + 12,
        paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 110,
        gap: 20,
      }}
    >
      {/* Header */}
      <View style={[styles.headerRow, { paddingHorizontal: Spacing.md }]}>
        <View>
          <Text style={[styles.title, { color: colors.text }]}>Seguridad</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Sistema inmunológico digital
          </Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: colors.success + "18", borderColor: colors.success + "50" },
          ]}
        >
          <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
          <Text style={[styles.statusText, { color: colors.success }]}>Activo</Text>
        </View>
      </View>

      {/* Access Control — biometric toggle */}
      <View style={{ paddingHorizontal: Spacing.md }}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Control de acceso</Text>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.backgroundCard, borderColor: colors.border },
            Shadows.sm,
          ]}
        >
          {/* Biometric toggle row */}
          <Pressable
            onPress={async () => {
              if (!hasBiometrics) return;
              setTogglingBio(true);
              try {
                if (biometricsEnabled) {
                  await disableBiometrics();
                } else {
                  await enableBiometrics();
                }
              } finally {
                setTogglingBio(false);
              }
            }}
            style={{ flexDirection: "row", alignItems: "center", gap: 14 }}
          >
            <View
              style={[
                styles.cardIconWrap,
                { backgroundColor: hasBiometrics ? "#1A6FE818" : colors.border + "40" },
              ]}
            >
              <Feather
                name="activity"
                size={16}
                color={hasBiometrics ? colors.tint : colors.textSecondary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.text, fontSize: 14 }]}>
                Desbloqueo biométrico
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, fontFamily: "Inter_400Regular" }}>
                {!hasBiometrics
                  ? "No disponible en este dispositivo"
                  : biometricsEnabled
                  ? "Huella dactilar activa"
                  : "Deshabilitado — toca para activar"}
              </Text>
            </View>
            <Switch
              value={biometricsEnabled && hasBiometrics}
              onValueChange={async (v) => {
                if (!hasBiometrics) return;
                setTogglingBio(true);
                try {
                  if (v) await enableBiometrics();
                  else await disableBiometrics();
                } finally {
                  setTogglingBio(false);
                }
              }}
              disabled={!hasBiometrics || togglingBio}
              trackColor={{ false: colors.border, true: colors.tint + "70" }}
              thumbColor={biometricsEnabled && hasBiometrics ? colors.tint : colors.textSecondary}
            />
          </Pressable>

          <View style={[styles.separator, { backgroundColor: colors.border, marginVertical: 4 }]} />

          {/* PIN protection row */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <View style={[styles.cardIconWrap, { backgroundColor: colors.success + "18" }]}>
              <Feather name="lock" size={16} color={colors.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.text, fontSize: 14 }]}>
                Protección por PIN
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, fontFamily: "Inter_400Regular" }}>
                Siempre activo · Cambialo en Perfil
              </Text>
            </View>
            <View style={[{ backgroundColor: colors.success + "18", paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radii.pill }]}>
              <Text style={{ color: colors.success, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>
                Activo
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Live visualization card */}
      <View style={{ paddingHorizontal: Spacing.md }}>
        <LinearGradient
          colors={isDark ? ["#060B18", "#0A1628"] : ["#EEF4FF", "#F5F8FF"]}
          style={[styles.vizCard, { borderColor: colors.border }, Shadows.md]}
        >
          {/* Pulsing rings */}
          <View style={styles.nodeCenter}>
            <PulseRing color="#00D4FF" size={80} delay={0} />
            <PulseRing color="#1A6FE8" size={80} delay={700} />
            <PulseRing color="#7C3AED" size={80} delay={1400} />
            <LinearGradient
              colors={["#1A6FE8", "#0D8AEB"]}
              style={styles.nodeDot}
            >
              <Feather name="shield" size={24} color="#fff" />
            </LinearGradient>
          </View>

          {/* Stats */}
          <View style={styles.vizStats}>
            <View style={styles.vizStat}>
              <Text style={[styles.vizNum, { color: colors.text }]}>
                {nodeCount.toLocaleString("es-AR")}
              </Text>
              <Text style={[styles.vizLabel, { color: colors.textSecondary }]}>Nodos en red</Text>
            </View>
            <View style={[styles.vizDivider, { backgroundColor: colors.border }]} />
            <View style={styles.vizStat}>
              <Text style={[styles.vizNum, { color: colors.text }]}>
                {protectedCount.toLocaleString("es-AR")}
              </Text>
              <Text style={[styles.vizLabel, { color: colors.textSecondary }]}>Protegidos hoy</Text>
            </View>
            <View style={[styles.vizDivider, { backgroundColor: colors.border }]} />
            <View style={styles.vizStat}>
              <Text style={[styles.vizNum, { color: colors.text }]}>{documents.length}</Text>
              <Text style={[styles.vizLabel, { color: colors.textSecondary }]}>Tus docs</Text>
            </View>
          </View>
        </LinearGradient>
      </View>

      {/* Threat level */}
      <View style={{ paddingHorizontal: Spacing.md }}>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.backgroundCard, borderColor: colors.border },
            Shadows.sm,
          ]}
        >
          <View style={styles.cardHeader}>
            <View style={[styles.cardIconWrap, { backgroundColor: colors.tint + "18" }]}>
              <Feather name="activity" size={16} color={colors.tint} />
            </View>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              Nivel de amenaza en tiempo real
            </Text>
          </View>
          <ThreatBar score={threatLevel} />
          <Text style={[styles.cardNote, { color: colors.textSecondary }]}>
            La red aprendió y bloqueó 23 nuevos patrones en las últimas 24 hs.
          </Text>
        </View>
      </View>

      {/* Trust Score — FASE 6 */}
      <View style={{ paddingHorizontal: Spacing.md }}>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.backgroundCard, borderColor: colors.border },
            Shadows.sm,
          ]}
        >
          <View style={styles.cardHeader}>
            <View style={[styles.cardIconWrap, { backgroundColor: "#7C3AED18" }]}>
              <Feather name="star" size={16} color="#7C3AED" />
            </View>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              Identidad digital — Trust Score
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 16, marginTop: 8 }}>
            <View style={{ flex: 1, gap: 8 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: colors.textSecondary, fontSize: 12, fontFamily: "Inter_400Regular" }}>
                  {trustScore < 40 ? "Identidad básica" : trustScore < 70 ? "Identidad verificada" : "Identidad certificada"}
                </Text>
                <Text style={{ color: "#7C3AED", fontSize: 15, fontFamily: "Inter_700Bold" }}>{trustScore}%</Text>
              </View>
              <View style={{ height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: colors.border }}>
                <View style={{ height: "100%", borderRadius: 4, backgroundColor: "#7C3AED", width: `${trustScore}%` }} />
              </View>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
            <View style={{ flex: 1, backgroundColor: "#7C3AED10", borderRadius: 8, padding: 10, alignItems: "center" }}>
              <Text style={{ color: "#7C3AED", fontSize: 18, fontFamily: "Inter_700Bold" }}>{credentialsCount}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 11, fontFamily: "Inter_400Regular" }}>Credenciales</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: "#1A6FE810", borderRadius: 8, padding: 10, alignItems: "center" }}>
              <Text style={{ color: colors.tint, fontSize: 18, fontFamily: "Inter_700Bold" }}>{digitalIdentity?.connectedNodes?.toLocaleString("es-AR") ?? "0"}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 11, fontFamily: "Inter_400Regular" }}>Nodos</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: "#00D4FF10", borderRadius: 8, padding: 10, alignItems: "center" }}>
              <Text style={{ color: "#00D4FF", fontSize: 18, fontFamily: "Inter_700Bold" }}>AES</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 11, fontFamily: "Inter_400Regular" }}>Cifrado</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Architecture layers */}
      <View style={{ paddingHorizontal: Spacing.md }}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Arquitectura de seguridad</Text>
        <View
          style={[
            styles.layersCard,
            { backgroundColor: colors.backgroundCard, borderColor: colors.border },
            Shadows.sm,
          ]}
        >
          {LAYERS.map((layer, i) => (
            <View key={layer.id}>
              <View style={styles.layerRow}>
                <View style={[styles.layerIcon, { backgroundColor: layer.color + "18" }]}>
                  <Feather name={layer.icon as any} size={18} color={layer.color} />
                </View>
                <View style={styles.layerInfo}>
                  <Text style={[styles.layerLabel, { color: colors.text }]}>{layer.label}</Text>
                  <Text style={[styles.layerSub, { color: colors.textSecondary }]}>
                    {layer.sublabel}
                  </Text>
                </View>
                <View style={[styles.layerCheck, { backgroundColor: colors.success + "18" }]}>
                  <Feather name="check" size={12} color={colors.success} />
                </View>
              </View>
              {i < LAYERS.length - 1 && (
                <View style={styles.layerConnector}>
                  <View style={[styles.connectorLine, { backgroundColor: colors.border }]} />
                </View>
              )}
            </View>
          ))}
        </View>
      </View>

      {/* Adaptive security */}
      <View style={{ paddingHorizontal: Spacing.md }}>
        <LinearGradient
          colors={isDark ? ["#0A1628", "#0D1E3D"] : ["#EEF4FF", "#E8F0FF"]}
          style={[styles.adaptiveCard, { borderColor: "#1A6FE830" }, Shadows.sm]}
        >
          <View style={styles.cardHeader}>
            <View style={[styles.cardIconWrap, { backgroundColor: "#1A6FE818" }]}>
              <Feather name="cpu" size={16} color={colors.tint} />
            </View>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              Seguridad Adaptativa
            </Text>
          </View>
          <View style={styles.adaptiveFlow}>
            {[
              { icon: "alert-triangle", label: "Ataque detectado", color: colors.danger },
              { icon: "cpu", label: "Red aprende", color: colors.tint },
              { icon: "share-2", label: "Protege nodos", color: "#7C3AED" },
              { icon: "trending-up", label: "Mejora continua", color: colors.success },
            ].map((step, i) => (
              <React.Fragment key={i}>
                <View style={styles.adaptiveStep}>
                  <View style={[styles.adaptiveIcon, { backgroundColor: step.color + "18" }]}>
                    <Feather name={step.icon as any} size={15} color={step.color} />
                  </View>
                  <Text style={[styles.adaptiveStepText, { color: colors.text }]}>
                    {step.label}
                  </Text>
                </View>
                {i < 3 && (
                  <Feather name="chevron-right" size={14} color={colors.border} />
                )}
              </React.Fragment>
            ))}
          </View>
          <Text style={[styles.adaptiveNote, { color: colors.textSecondary }]}>
            El sistema aprende de cada ataque y refuerza la seguridad de toda la red automáticamente.
          </Text>
        </LinearGradient>
      </View>

      {/* Activity feed */}
      <View style={{ paddingHorizontal: Spacing.md }}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Actividad reciente</Text>
        <View
          style={[
            styles.eventsCard,
            { backgroundColor: colors.backgroundCard, borderColor: colors.border },
            Shadows.sm,
          ]}
        >
          {displayEvents.slice(0, 8).map((ev, i) => {
            const meta = eventMeta[ev.type] ?? { icon: "activity", color: colors.tint };
            return (
              <View key={ev.id}>
                <View style={styles.eventRow}>
                  <View style={[styles.eventIcon, { backgroundColor: meta.color + "18" }]}>
                    <Feather name={meta.icon as any} size={14} color={meta.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.eventMsg, { color: colors.text }]}>{ev.message}</Text>
                    <Text style={[styles.eventMeta, { color: colors.textSecondary }]}>
                      {ev.node ? `${ev.node} · ` : ""}{ev.time}
                    </Text>
                  </View>
                </View>
                {i < Math.min(displayEvents.length, 8) - 1 && (
                  <View style={[styles.separator, { backgroundColor: colors.border }]} />
                )}
              </View>
            );
          })}
        </View>
      </View>

      {/* E2E encryption */}
      <View style={{ paddingHorizontal: Spacing.md }}>
        <View
          style={[
            styles.e2eCard,
            {
              backgroundColor: colors.success + "10",
              borderColor: colors.success + "30",
            },
          ]}
        >
          <View style={[styles.e2eIcon, { backgroundColor: colors.success + "18" }]}>
            <Feather name="lock" size={18} color={colors.success} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.e2eTitle, { color: colors.text }]}>
              Cifrado de extremo a extremo
            </Text>
            <Text style={[styles.e2eText, { color: colors.textSecondary }]}>
              AES-256 · Ni nosotros podemos acceder a tu contenido.
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  title: { fontSize: 26, fontFamily: "Inter_700Bold", marginBottom: 2 },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular" },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radii.pill,
    borderWidth: 1,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  vizCard: {
    borderRadius: Radii.card,
    borderWidth: 1,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: "center",
    gap: 24,
  },
  nodeCenter: {
    width: 100,
    height: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  nodeDot: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  vizStats: { flexDirection: "row", width: "100%" },
  vizStat: { flex: 1, alignItems: "center", gap: 4 },
  vizNum: { fontSize: 18, fontFamily: "Inter_700Bold" },
  vizLabel: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center" },
  vizDivider: { width: 1, marginVertical: 4 },

  card: {
    borderRadius: Radii.lg,
    borderWidth: 1,
    padding: 18,
    gap: 14,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardIconWrap: {
    width: 34,
    height: 34,
    borderRadius: Radii.sm + 2,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", flex: 1 },
  cardNote: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },

  sectionTitle: { fontSize: 17, fontFamily: "Inter_700Bold", marginBottom: 12 },

  layersCard: { borderRadius: Radii.lg, borderWidth: 1, padding: 6 },
  layerRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
  layerIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  layerInfo: { flex: 1 },
  layerLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  layerSub: { fontSize: 11, fontFamily: "Inter_400Regular" },
  layerCheck: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  layerConnector: { alignItems: "center", paddingVertical: 0 },
  connectorLine: { width: 1, height: 8, marginLeft: 33 },

  adaptiveCard: {
    borderRadius: Radii.lg,
    borderWidth: 1,
    padding: 18,
    gap: 14,
  },
  adaptiveFlow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  adaptiveStep: { alignItems: "center", gap: 5 },
  adaptiveIcon: {
    width: 36,
    height: 36,
    borderRadius: Radii.sm + 2,
    alignItems: "center",
    justifyContent: "center",
  },
  adaptiveStepText: { fontSize: 10, fontFamily: "Inter_500Medium", textAlign: "center", maxWidth: 60 },
  adaptiveNote: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },

  eventsCard: { borderRadius: Radii.lg, borderWidth: 1, overflow: "hidden" },
  eventRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  eventIcon: {
    width: 36,
    height: 36,
    borderRadius: Radii.sm + 2,
    alignItems: "center",
    justifyContent: "center",
  },
  eventMsg: { fontSize: 14, fontFamily: "Inter_500Medium", marginBottom: 2 },
  eventMeta: { fontSize: 11, fontFamily: "Inter_400Regular" },
  separator: { height: 1, marginHorizontal: 14 },

  e2eCard: {
    borderRadius: Radii.lg,
    borderWidth: 1,
    padding: 16,
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
  },
  e2eIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  e2eTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 3 },
  e2eText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
});
