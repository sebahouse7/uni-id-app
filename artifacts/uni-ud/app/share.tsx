import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { Radii, Shadows, Spacing } from "@/constants/design";
import {
  apiShareApprove,
  apiShareCreateQr,
  apiShareGetPending,
  apiShareReject,
} from "@/lib/apiClient";

const EXPIRY_OPTIONS = [
  { label: "2 min", minutes: 2 },
  { label: "3 min", minutes: 3 },
  { label: "5 min", minutes: 5 },
];

interface PendingRequest {
  id: string;
  share_token_id: string;
  status: string;
  requester_ip: string | null;
  requester_device: string | null;
  permissions: Record<string, boolean>;
  created_at: string;
  updated_at: string;
  expires_at: string;
  label: string | null;
}

export default function ShareScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;

  const [expiry, setExpiry] = useState(3);
  const [generating, setGenerating] = useState(false);
  const [qrResult, setQrResult] = useState<{
    token: string;
    qrContent: string;
    expiresAt: string;
    expiresInMinutes: number;
  } | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<PendingRequest | null>(null);
  const [approving, setApproving] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const qrPulse = useRef(new Animated.Value(1)).current;
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  useEffect(() => {
    if (showQrModal) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(qrPulse, { toValue: 1.04, duration: 1200, useNativeDriver: true }),
          Animated.timing(qrPulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
  }, [showQrModal]);

  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const pending = await apiShareGetPending();
        if (pending && pending.length > 0) {
          setPendingRequest(pending[0] as PendingRequest);
        }
      } catch {}
    }, 3000);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const handleCloseQr = () => {
    stopPolling();
    setShowQrModal(false);
    setQrResult(null);
    setPendingRequest(null);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setPendingRequest(null);
    try {
      const result = await apiShareCreateQr({
        permissions: { name: true, globalId: true },
        expiresInMinutes: expiry,
      });
      setQrResult(result);
      setShowQrModal(true);
      setSecondsLeft(expiry * 60);

      countdownRef.current = setInterval(() => {
        setSecondsLeft((s) => {
          if (s <= 1) {
            stopPolling();
            setShowQrModal(false);
            setQrResult(null);
            return 0;
          }
          return s - 1;
        });
      }, 1000);

      startPolling();
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo generar el QR");
    } finally {
      setGenerating(false);
    }
  };

  const handleApprove = async () => {
    if (!pendingRequest) return;
    setApproving(true);
    try {
      await apiShareApprove(pendingRequest.id);
      stopPolling();
      setShowQrModal(false);
      setQrResult(null);
      setPendingRequest(null);
      Alert.alert("✓ Acceso concedido", "Compartiste tu identidad exitosamente.");
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo aprobar");
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!pendingRequest) return;
    try {
      await apiShareReject(pendingRequest.id);
      setPendingRequest(null);
      stopPolling();
      setShowQrModal(false);
      setQrResult(null);
      Alert.alert("Acceso rechazado", "La solicitud fue denegada y el QR invalidado.");
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo rechazar");
    }
  };

  const formatSecondsLeft = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <Animated.View style={[{ flex: 1, backgroundColor: colors.background }, { opacity: fadeAnim }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) + 12,
          paddingBottom: insets.bottom + 120,
          paddingHorizontal: Spacing.md,
        }}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={[styles.backBtn, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}
          >
            <Feather name="arrow-left" size={18} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.text }]}>Compartir identidad</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              QR seguro con aprobación manual
            </Text>
          </View>
        </View>

        {/* Security info card */}
        <LinearGradient
          colors={isDark ? ["#0A1628", "#0D2040"] : ["#EEF4FF", "#E0ECFF"]}
          style={[styles.infoCard, { borderColor: isDark ? "#1A3060" : "#C8D8F0" }]}
        >
          <View style={[styles.infoIcon, { backgroundColor: "#1A6FE820" }]}>
            <Feather name="shield" size={20} color="#1A6FE8" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.infoTitle, { color: colors.text }]}>Flujo seguro con aprobación</Text>
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              El QR no contiene datos. Cuando alguien lo escanea, vos aprobás o rechazás el acceso desde esta pantalla.
            </Text>
          </View>
        </LinearGradient>

        {/* Flow steps */}
        <View style={[styles.stepsCard, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
          {[
            { icon: "maximize", label: "Generás un QR temporal (2-5 min)" },
            { icon: "smartphone", label: "Alguien escanea el QR con su app" },
            { icon: "bell", label: "Te llega una notificación aquí" },
            { icon: "check-circle", label: "Vos aprobás o rechazás el acceso" },
          ].map((step, i) => (
            <View key={i} style={styles.stepRow}>
              <View style={[styles.stepNum, { backgroundColor: "#1A6FE8" + "18" }]}>
                <Text style={[styles.stepNumText, { color: "#1A6FE8" }]}>{i + 1}</Text>
              </View>
              <Feather name={step.icon as any} size={14} color={colors.textSecondary} style={{ marginHorizontal: 8 }} />
              <Text style={[styles.stepLabel, { color: colors.textSecondary }]}>{step.label}</Text>
            </View>
          ))}
        </View>

        {/* Expiry */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Tiempo de expiración del QR</Text>
          <View style={styles.expiryRow}>
            {EXPIRY_OPTIONS.map((opt) => (
              <Pressable
                key={opt.minutes}
                onPress={() => setExpiry(opt.minutes)}
                style={[
                  styles.expiryChip,
                  {
                    backgroundColor: expiry === opt.minutes ? colors.tint : colors.backgroundCard,
                    borderColor: expiry === opt.minutes ? colors.tint : colors.border,
                  },
                ]}
              >
                <Text style={[styles.expiryText, { color: expiry === opt.minutes ? "#fff" : colors.textSecondary }]}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* What will be shared */}
        <View style={[styles.permissionsCard, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Feather name="eye" size={14} color="#1A6FE8" />
            <Text style={[styles.permTitle, { color: colors.text }]}>Datos que se compartirán</Text>
          </View>
          {[
            { icon: "user", label: "Nombre completo", granted: true },
            { icon: "hash", label: "ID único (did:uniid)", granted: true },
            { icon: "file-text", label: "Documentos personales", granted: false },
            { icon: "mail", label: "Email o datos de contacto", granted: false },
          ].map((item, i) => (
            <View key={i} style={styles.permRow}>
              <Feather name={item.icon as any} size={13} color={item.granted ? "#1A6FE8" : colors.textSecondary} />
              <Text style={[styles.permLabel, { color: item.granted ? colors.text : colors.textSecondary }]}>
                {item.label}
              </Text>
              <Feather
                name={item.granted ? "check" : "x"}
                size={13}
                color={item.granted ? "#22C55E" : "#E53535"}
              />
            </View>
          ))}
        </View>

        {/* Generate button */}
        <Pressable
          onPress={handleGenerate}
          disabled={generating}
          style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, marginTop: 8 })}
        >
          <LinearGradient
            colors={["#1A6FE8", "#0D8AEB"]}
            style={[styles.generateBtn, Shadows.colored("#1A6FE8")]}
          >
            <Feather name="maximize" size={20} color="#fff" />
            <Text style={styles.generateBtnText}>
              {generating ? "Generando QR..." : "Generar QR seguro"}
            </Text>
          </LinearGradient>
        </Pressable>
      </ScrollView>

      {/* QR Modal */}
      <Modal
        visible={showQrModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCloseQr}
      >
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={styles.modalHandle} />

          {/* If pending request — show approval dialog */}
          {pendingRequest ? (
            <View style={{ flex: 1, padding: 24 }}>
              <View style={[styles.alertIconWrap, { backgroundColor: "#F59E0B18" }]}>
                <Feather name="bell" size={28} color="#F59E0B" />
              </View>
              <Text style={[styles.alertTitle, { color: colors.text }]}>
                Solicitud de acceso a tu identidad
              </Text>
              <Text style={[styles.alertSub, { color: colors.textSecondary }]}>
                Alguien escaneó tu QR y solicita acceso a tus datos de identidad.
              </Text>

              <View style={[styles.requesterCard, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
                <View style={styles.requesterRow}>
                  <Feather name="smartphone" size={15} color={colors.textSecondary} />
                  <Text style={[styles.requesterLabel, { color: colors.textSecondary }]}>Dispositivo</Text>
                  <Text style={[styles.requesterValue, { color: colors.text }]} numberOfLines={1}>
                    {pendingRequest.requester_device ?? "Desconocido"}
                  </Text>
                </View>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <View style={styles.requesterRow}>
                  <Feather name="globe" size={15} color={colors.textSecondary} />
                  <Text style={[styles.requesterLabel, { color: colors.textSecondary }]}>IP</Text>
                  <Text style={[styles.requesterValue, { color: colors.text }]}>
                    {pendingRequest.requester_ip ?? "—"}
                  </Text>
                </View>
              </View>

              <View style={[styles.permissionsCard2, { backgroundColor: "#1A6FE808", borderColor: "#1A6FE830" }]}>
                <Text style={[styles.permTitle, { color: colors.text, marginBottom: 8 }]}>Datos solicitados:</Text>
                <Text style={[styles.permItem, { color: colors.textSecondary }]}>• Nombre completo</Text>
                <Text style={[styles.permItem, { color: colors.textSecondary }]}>• ID único (did:uniid)</Text>
              </View>

              <View style={styles.approvalButtons}>
                <Pressable
                  onPress={handleReject}
                  style={[styles.rejectBtn, { borderColor: "#E53535" }]}
                >
                  <Feather name="x" size={18} color="#E53535" />
                  <Text style={[styles.rejectBtnText]}>Rechazar</Text>
                </Pressable>
                <Pressable
                  onPress={handleApprove}
                  disabled={approving}
                  style={{ flex: 1 }}
                >
                  <LinearGradient
                    colors={["#22C55E", "#16A34A"]}
                    style={styles.approveBtn}
                  >
                    <Feather name="check" size={18} color="#fff" />
                    <Text style={styles.approveBtnText}>
                      {approving ? "Aprobando..." : "Aceptar"}
                    </Text>
                  </LinearGradient>
                </Pressable>
              </View>
            </View>
          ) : (
            /* QR view — waiting for scan */
            <>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Tu QR de identidad</Text>
                <Pressable onPress={handleCloseQr}>
                  <View style={[styles.closeBtn, { backgroundColor: colors.backgroundCard }]}>
                    <Feather name="x" size={18} color={colors.text} />
                  </View>
                </Pressable>
              </View>

              {qrResult && (
                <>
                  <Animated.View style={[styles.qrContainer, { backgroundColor: "#fff", transform: [{ scale: qrPulse }] }]}>
                    <QRCode
                      value={qrResult.qrContent}
                      size={220}
                      color="#060B18"
                      backgroundColor="#fff"
                    />
                  </Animated.View>

                  <View style={[styles.timerBadge, {
                    backgroundColor: secondsLeft < 60 ? "#E5353520" : "#1A6FE818",
                    borderColor: secondsLeft < 60 ? "#E53535" : "#1A6FE840",
                  }]}>
                    <Feather name="clock" size={14} color={secondsLeft < 60 ? "#E53535" : "#1A6FE8"} />
                    <Text style={[styles.timerText, { color: secondsLeft < 60 ? "#E53535" : "#1A6FE8" }]}>
                      Expira en {formatSecondsLeft(secondsLeft)}
                    </Text>
                  </View>

                  <View style={[styles.waitingCard, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
                    <View style={styles.pulsingDot} />
                    <Text style={[styles.waitingText, { color: colors.textSecondary }]}>
                      Esperando que alguien escanee...
                    </Text>
                  </View>

                  <View style={[styles.tokenBox, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
                    <Feather name="lock" size={13} color={colors.textSecondary} />
                    <Text style={[styles.tokenText, { color: colors.textSecondary }]} numberOfLines={1}>
                      {qrResult.qrContent}
                    </Text>
                  </View>

                  <Text style={[styles.securityNote, { color: colors.textSecondary }]}>
                    El QR no contiene datos personales. Tu información solo se comparte si vos aprobás la solicitud.
                  </Text>
                </>
              )}
            </>
          )}
        </View>
      </Modal>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },

  infoCard: {
    borderRadius: Radii.card,
    borderWidth: 1,
    padding: 16,
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    marginBottom: 16,
  },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  infoTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  infoText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },

  stepsCard: {
    borderRadius: Radii.card,
    borderWidth: 1,
    padding: 14,
    marginBottom: 20,
    gap: 10,
  },
  stepRow: { flexDirection: "row", alignItems: "center" },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  stepLabel: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },

  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 10 },

  expiryRow: { flexDirection: "row", gap: 8 },
  expiryChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Radii.pill,
    borderWidth: 1,
    alignItems: "center",
  },
  expiryText: { fontSize: 13, fontFamily: "Inter_500Medium" },

  permissionsCard: {
    borderRadius: Radii.card,
    borderWidth: 1,
    padding: 14,
    marginBottom: 20,
  },
  permissionsCard2: {
    borderRadius: Radii.card,
    borderWidth: 1,
    padding: 14,
    marginBottom: 20,
  },
  permTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  permRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 5,
  },
  permLabel: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  permItem: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 4 },

  generateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 15,
    borderRadius: Radii.button,
  },
  generateBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" },

  modal: { flex: 1, paddingHorizontal: 24 },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#CBD5E1",
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },

  qrContainer: {
    alignSelf: "center",
    padding: 16,
    borderRadius: 20,
    marginBottom: 20,
    ...Shadows.md,
  },

  timerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "center",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: Radii.pill,
    borderWidth: 1,
    marginBottom: 16,
  },
  timerText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },

  waitingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: Radii.lg,
    borderWidth: 1,
    marginBottom: 12,
  },
  pulsingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#22C55E",
  },
  waitingText: { fontSize: 13, fontFamily: "Inter_400Regular" },

  tokenBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: Radii.lg,
    borderWidth: 1,
    marginBottom: 14,
  },
  tokenText: { fontSize: 11, fontFamily: "Inter_400Regular", flex: 1 },

  securityNote: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 17,
    paddingHorizontal: 8,
  },

  // Approval dialog
  alertIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 16,
  },
  alertTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center", marginBottom: 8 },
  alertSub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18, marginBottom: 20 },

  requesterCard: {
    borderRadius: Radii.card,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
  },
  requesterRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  requesterLabel: { fontSize: 12, fontFamily: "Inter_400Regular", width: 70 },
  requesterValue: { fontSize: 13, fontFamily: "Inter_500Medium", flex: 1 },
  divider: { height: 1, marginVertical: 10 },

  approvalButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: "auto" as any,
    paddingBottom: 16,
  },
  rejectBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: Radii.button,
    borderWidth: 1.5,
  },
  rejectBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#E53535" },
  approveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: Radii.button,
  },
  approveBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
