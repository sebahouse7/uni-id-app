import * as LocalAuthentication from "expo-local-authentication";
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
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { Radii, Shadows, Spacing } from "@/constants/design";
import { useAuth } from "@/context/AuthContext";
import {
  apiShareAccessLog,
  apiShareApprove,
  apiShareCreateQr,
  apiShareGetPending,
  apiShareReject,
  apiShareRevokeAccess,
} from "@/lib/apiClient";
import { validatePin } from "@/lib/authService";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PermissionSet {
  name: boolean;
  globalId: boolean;
  bio: boolean;
  networkPlan: boolean;
}

interface PendingRequest {
  id: string;
  share_token_id: string;
  status: string;
  requester_ip: string | null;
  requester_device: string | null;
  permissions: PermissionSet;
  expires_at: string;
}

interface AccessLogEntry {
  id: string;
  status: "approved" | "rejected" | "revoked";
  requester_ip: string | null;
  requester_device: string | null;
  permissions: PermissionSet;
  shared_data: Record<string, any> | null;
  consented_at: string | null;
  revoked_at: string | null;
  updated_at: string;
}

// ─── Step types ────────────────────────────────────────────────────────────────
type ApproveStep = "request" | "consent" | "auth" | "pin";

const EXPIRY_OPTIONS = [
  { label: "2 min", minutes: 2 },
  { label: "3 min", minutes: 3 },
  { label: "5 min", minutes: 5 },
];

const PERM_LABELS: Record<keyof PermissionSet, string> = {
  name: "Nombre completo",
  globalId: "ID único (did:uniid)",
  bio: "Biografía",
  networkPlan: "Plan de red",
};

function permissionsToList(perms: PermissionSet): string[] {
  return (Object.keys(perms) as (keyof PermissionSet)[])
    .filter((k) => perms[k])
    .map((k) => PERM_LABELS[k]);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ShareScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const { hasPin, hasBiometrics, biometricsEnabled } = useAuth();

  // QR generation
  const [expiry, setExpiry] = useState(3);
  const [permissions, setPermissions] = useState<PermissionSet>({
    name: true, globalId: true, bio: false, networkPlan: false,
  });
  const [generating, setGenerating] = useState(false);
  const [qrResult, setQrResult] = useState<{
    token: string; qrContent: string; expiresAt: string;
  } | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  // Approval flow
  const [pendingRequest, setPendingRequest] = useState<PendingRequest | null>(null);
  const [approveStep, setApproveStep] = useState<ApproveStep>("request");
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [approving, setApproving] = useState(false);

  // Access log
  const [accessLog, setAccessLog] = useState<AccessLogEntry[]>([]);
  const [loadingLog, setLoadingLog] = useState(false);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const qrPulse = useRef(new Animated.Value(1)).current;
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    loadAccessLog();
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

  const loadAccessLog = async () => {
    setLoadingLog(true);
    try {
      const log = await apiShareAccessLog();
      setAccessLog(log as AccessLogEntry[]);
    } catch {}
    setLoadingLog(false);
  };

  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const pending = await apiShareGetPending();
        if (pending && pending.length > 0) {
          setPendingRequest(pending[0] as PendingRequest);
          setApproveStep("request");
        }
      } catch {}
    }, 3000);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
  }, []);

  useEffect(() => { return () => stopPolling(); }, [stopPolling]);

  const handleCloseQr = () => {
    stopPolling();
    setShowQrModal(false);
    setQrResult(null);
    setPendingRequest(null);
    setApproveStep("request");
    setPinInput("");
    setPinError("");
  };

  const togglePerm = (key: keyof PermissionSet) => {
    if (key === "name" || key === "globalId") return; // always on
    setPermissions((p) => ({ ...p, [key]: !p[key] }));
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setPendingRequest(null);
    setPinInput("");
    setPinError("");
    setApproveStep("request");
    try {
      const result = await apiShareCreateQr({ permissions, expiresInMinutes: expiry });
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

  // ─── Approval steps ──────────────────────────────────────────────────────────

  const handlePressAccept = () => {
    setApproveStep("consent");
  };

  const handleConsentConfirm = async () => {
    if (Platform.OS === "web") {
      await doApprove();
      return;
    }
    if (hasBiometrics && biometricsEnabled) {
      setApproveStep("auth");
      setTimeout(tryBiometric, 200);
    } else if (hasPin) {
      setApproveStep("pin");
      setPinInput("");
      setPinError("");
    } else {
      Alert.alert(
        "PIN requerido",
        "Debés configurar un PIN para poder aprobar accesos a tu identidad.",
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Ir a Seguridad",
            onPress: () => {
              handleCloseQr();
              router.push("/(tabs)/security" as any);
            },
          },
        ]
      );
    }
  };

  const tryBiometric = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Autenticá para compartir tu identidad",
        fallbackLabel: "Usar PIN",
        cancelLabel: "Cancelar",
        disableDeviceFallback: true,
      });
      if (result.success) {
        await doApprove();
      } else {
        if (hasPin) {
          setApproveStep("pin");
          setPinInput("");
          setPinError("");
        } else {
          setApproveStep("request");
          Alert.alert("Cancelado", "Autenticación cancelada.");
        }
      }
    } catch {
      setApproveStep("request");
    }
  };

  const handlePinInput = (digit: string) => {
    const next = pinInput + digit;
    setPinInput(next);
    setPinError("");
    if (next.length === 6) {
      setTimeout(() => verifyPinAndApprove(next), 100);
    }
  };

  const verifyPinAndApprove = async (pin: string) => {
    const ok = await validatePin(pin);
    if (ok) {
      await doApprove();
    } else {
      setPinInput("");
      setPinError("PIN incorrecto. Intentá de nuevo.");
    }
  };

  const doApprove = async () => {
    if (!pendingRequest) return;
    setApproving(true);
    try {
      await apiShareApprove(pendingRequest.id, { consentConfirmed: true });
      stopPolling();
      setShowQrModal(false);
      setQrResult(null);
      setPendingRequest(null);
      setApproveStep("request");
      setPinInput("");
      await loadAccessLog();
      Alert.alert("✓ Acceso concedido", "Tu identidad fue compartida exitosamente.");
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo aprobar");
      setApproveStep("request");
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
      setApproveStep("request");
      Alert.alert("Rechazado", "La solicitud fue denegada y el QR invalidado.");
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo rechazar");
    }
  };

  const handleRevokeAccess = (entry: AccessLogEntry) => {
    Alert.alert(
      "Revocar acceso",
      `¿Querés revocar el acceso concedido a "${entry.requester_device ?? "este dispositivo"}"? Esta acción no se puede deshacer.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Revocar",
          style: "destructive",
          onPress: async () => {
            try {
              await apiShareRevokeAccess(entry.id);
              await loadAccessLog();
            } catch (e: any) {
              Alert.alert("Error", e.message ?? "No se pudo revocar");
            }
          },
        },
      ]
    );
  };

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  const formatSecondsLeft = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("es-AR", {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
      });
    } catch { return iso; }
  };

  const statusColor = (s: string) => {
    if (s === "approved") return "#22C55E";
    if (s === "rejected") return "#E53535";
    if (s === "revoked") return "#F59E0B";
    return colors.textSecondary;
  };

  const statusLabel = (s: string) => {
    if (s === "approved") return "Aprobado";
    if (s === "rejected") return "Rechazado";
    if (s === "revoked") return "Revocado";
    return s;
  };

  const permissionsFromRequest = (p: any): PermissionSet => {
    if (!p) return { name: true, globalId: true, bio: false, networkPlan: false };
    if (typeof p === "string") {
      try { return JSON.parse(p); } catch { return { name: true, globalId: true, bio: false, networkPlan: false }; }
    }
    return p;
  };

  // ─── Modal content ────────────────────────────────────────────────────────────

  const renderModalContent = () => {
    // Step 1: Initial request notification
    if (pendingRequest && approveStep === "request") {
      const perms = permissionsFromRequest(pendingRequest.permissions);
      const dataList = permissionsToList(perms);
      return (
        <View style={{ flex: 1, padding: 24 }}>
          <View style={[styles.alertIconWrap, { backgroundColor: "#F59E0B18" }]}>
            <Feather name="bell" size={28} color="#F59E0B" />
          </View>
          <Text style={[styles.alertTitle, { color: colors.text }]}>
            Solicitud de acceso a tu identidad
          </Text>
          <Text style={[styles.alertSub, { color: colors.textSecondary }]}>
            Alguien escaneó tu QR y solicita acceso.
          </Text>

          <View style={[styles.requesterCard, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
            <View style={styles.requesterRow}>
              <Feather name="smartphone" size={14} color={colors.textSecondary} />
              <Text style={[styles.requesterLabel, { color: colors.textSecondary }]}>Dispositivo</Text>
              <Text style={[styles.requesterValue, { color: colors.text }]} numberOfLines={1}>
                {pendingRequest.requester_device ?? "Desconocido"}
              </Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.requesterRow}>
              <Feather name="globe" size={14} color={colors.textSecondary} />
              <Text style={[styles.requesterLabel, { color: colors.textSecondary }]}>IP</Text>
              <Text style={[styles.requesterValue, { color: colors.text }]}>
                {pendingRequest.requester_ip ?? "—"}
              </Text>
            </View>
          </View>

          <View style={[styles.dataPreviewCard, { backgroundColor: "#1A6FE808", borderColor: "#1A6FE830" }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <Feather name="eye" size={13} color="#1A6FE8" />
              <Text style={[styles.permTitle, { color: colors.text }]}>Datos solicitados:</Text>
            </View>
            {dataList.map((d, i) => (
              <View key={i} style={styles.dataItem}>
                <Feather name="check-circle" size={13} color="#22C55E" />
                <Text style={[styles.dataItemText, { color: colors.textSecondary }]}>{d}</Text>
              </View>
            ))}
          </View>

          <View style={styles.approvalButtons}>
            <Pressable onPress={handleReject} style={[styles.rejectBtn, { borderColor: "#E53535" }]}>
              <Feather name="x" size={18} color="#E53535" />
              <Text style={styles.rejectBtnText}>Rechazar</Text>
            </Pressable>
            <Pressable onPress={handlePressAccept} style={{ flex: 1 }}>
              <LinearGradient colors={["#1A6FE8", "#0D8AEB"]} style={styles.approveBtn}>
                <Feather name="shield" size={18} color="#fff" />
                <Text style={styles.approveBtnText}>Revisar y aprobar</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      );
    }

    // Step 2: Consent confirmation
    if (pendingRequest && approveStep === "consent") {
      const perms = permissionsFromRequest(pendingRequest.permissions);
      const dataList = permissionsToList(perms);
      return (
        <View style={{ flex: 1, padding: 24 }}>
          <View style={[styles.alertIconWrap, { backgroundColor: "#22C55E18" }]}>
            <Feather name="check-circle" size={28} color="#22C55E" />
          </View>
          <Text style={[styles.alertTitle, { color: colors.text }]}>Consentimiento explícito</Text>
          <Text style={[styles.alertSub, { color: colors.textSecondary }]}>
            Estás a punto de compartir los siguientes datos. Esta acción será registrada y auditada.
          </Text>

          <View style={[styles.consentBox, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
            <Text style={[styles.consentTitle, { color: colors.text }]}>Vas a compartir:</Text>
            {dataList.map((d, i) => (
              <View key={i} style={styles.dataItem}>
                <Feather name="arrow-right" size={13} color="#1A6FE8" />
                <Text style={[styles.dataItemText, { color: colors.text, fontFamily: "Inter_500Medium" }]}>{d}</Text>
              </View>
            ))}
            <View style={[styles.divider, { backgroundColor: colors.border, marginTop: 10 }]} />
            <View style={styles.dataItem}>
              <Feather name="x-circle" size={13} color="#E53535" />
              <Text style={[styles.dataItemText, { color: colors.textSecondary }]}>Documentos — NO incluidos</Text>
            </View>
            <View style={styles.dataItem}>
              <Feather name="x-circle" size={13} color="#E53535" />
              <Text style={[styles.dataItemText, { color: colors.textSecondary }]}>Email o contacto — NO incluido</Text>
            </View>
          </View>

          <Text style={[styles.consentNote, { color: colors.textSecondary }]}>
            Al confirmar, tu consentimiento quedará registrado con fecha y hora.
          </Text>

          {Platform.OS !== "web" && !hasPin && !(hasBiometrics && biometricsEnabled) && (
            <View style={[styles.noAuthWarning, { backgroundColor: "#E5353510", borderColor: "#E5353540" }]}>
              <Feather name="alert-triangle" size={14} color="#E53535" />
              <Text style={styles.noAuthWarningText}>
                No tenés PIN ni biometría configurados. Configurá un PIN para poder aprobar accesos.
              </Text>
            </View>
          )}

          <View style={styles.approvalButtons}>
            <Pressable
              onPress={() => setApproveStep("request")}
              style={[styles.rejectBtn, { borderColor: colors.border }]}
            >
              <Feather name="arrow-left" size={18} color={colors.text} />
              <Text style={[styles.rejectBtnText, { color: colors.text }]}>Volver</Text>
            </Pressable>
            {Platform.OS !== "web" && !hasPin && !(hasBiometrics && biometricsEnabled) ? (
              <Pressable onPress={handleConsentConfirm} style={{ flex: 1 }}>
                <LinearGradient colors={["#E53535", "#C42B2B"]} style={styles.approveBtn}>
                  <Feather name="alert-triangle" size={18} color="#fff" />
                  <Text style={styles.approveBtnText}>Configurar PIN</Text>
                </LinearGradient>
              </Pressable>
            ) : (
              <Pressable onPress={handleConsentConfirm} disabled={approving} style={{ flex: 1 }}>
                <LinearGradient colors={["#22C55E", "#16A34A"]} style={styles.approveBtn}>
                  <Feather name="lock" size={18} color="#fff" />
                  <Text style={styles.approveBtnText}>
                    {hasBiometrics && biometricsEnabled ? "Confirmar con biometría" : "Confirmar con PIN"}
                  </Text>
                </LinearGradient>
              </Pressable>
            )}
          </View>
        </View>
      );
    }

    // Step 3: Biometric waiting
    if (pendingRequest && approveStep === "auth") {
      return (
        <View style={{ flex: 1, padding: 24, alignItems: "center", justifyContent: "center" }}>
          <View style={[styles.alertIconWrap, { backgroundColor: "#1A6FE818" }]}>
            <Feather name="activity" size={28} color="#1A6FE8" />
          </View>
          <Text style={[styles.alertTitle, { color: colors.text }]}>Verificando identidad</Text>
          <Text style={[styles.alertSub, { color: colors.textSecondary }]}>
            Usá tu huella digital o Face ID para continuar.
          </Text>
          <Pressable onPress={() => tryBiometric()} style={[styles.bioRetryBtn, { borderColor: colors.tint }]}>
            <Text style={[styles.bioRetryText, { color: colors.tint }]}>Reintentar</Text>
          </Pressable>
          {hasPin && (
            <Pressable onPress={() => { setApproveStep("pin"); setPinInput(""); setPinError(""); }}>
              <Text style={[styles.switchMethod, { color: colors.textSecondary }]}>Usar PIN en su lugar</Text>
            </Pressable>
          )}
        </View>
      );
    }

    // Step 4: PIN entry
    if (pendingRequest && approveStep === "pin") {
      const digits = ["1","2","3","4","5","6","7","8","9","","0","⌫"];
      return (
        <View style={{ flex: 1, padding: 24, alignItems: "center" }}>
          <View style={[styles.alertIconWrap, { backgroundColor: "#1A6FE818" }]}>
            <Feather name="lock" size={28} color="#1A6FE8" />
          </View>
          <Text style={[styles.alertTitle, { color: colors.text }]}>Ingresá tu PIN</Text>
          <Text style={[styles.alertSub, { color: colors.textSecondary }]}>
            Confirmá tu identidad para compartir los datos.
          </Text>

          <View style={styles.pinDots}>
            {[0,1,2,3,4,5].map((i) => (
              <View
                key={i}
                style={[
                  styles.pinDot,
                  {
                    backgroundColor: i < pinInput.length ? "#1A6FE8" : "transparent",
                    borderColor: i < pinInput.length ? "#1A6FE8" : colors.border,
                  },
                ]}
              />
            ))}
          </View>

          {pinError ? (
            <Text style={styles.pinError}>{pinError}</Text>
          ) : null}

          <View style={styles.pinGrid}>
            {digits.map((d, i) => (
              <Pressable
                key={i}
                onPress={() => {
                  if (!d) return;
                  if (d === "⌫") {
                    setPinInput((p) => p.slice(0, -1));
                    setPinError("");
                  } else {
                    if (pinInput.length < 6) handlePinInput(d);
                  }
                }}
                style={({ pressed }) => [
                  styles.pinKey,
                  {
                    backgroundColor: d
                      ? pressed ? colors.tint + "20" : colors.backgroundCard
                      : "transparent",
                    borderColor: d ? colors.border : "transparent",
                  },
                ]}
              >
                <Text style={[styles.pinKeyText, { color: d === "⌫" ? "#E53535" : colors.text }]}>{d}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable onPress={() => setApproveStep("consent")}>
            <Text style={[styles.switchMethod, { color: colors.textSecondary }]}>Volver</Text>
          </Pressable>
        </View>
      );
    }

    // Default: QR view
    return (
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
              <QRCode value={qrResult.qrContent} size={220} color="#060B18" backgroundColor="#fff" />
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
              El QR no contiene datos personales. Solo vos podés aprobar el acceso.
            </Text>
          </>
        )}
      </>
    );
  };

  // ─── Main render ──────────────────────────────────────────────────────────────

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
              QR seguro · aprobación manual · auditable
            </Text>
          </View>
        </View>

        {/* Security info */}
        <LinearGradient
          colors={isDark ? ["#0A1628", "#0D2040"] : ["#EEF4FF", "#E0ECFF"]}
          style={[styles.infoCard, { borderColor: isDark ? "#1A3060" : "#C8D8F0" }]}
        >
          <View style={[styles.infoIcon, { backgroundColor: "#1A6FE820" }]}>
            <Feather name="shield" size={20} color="#1A6FE8" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.infoTitle, { color: colors.text }]}>Flujo con consentimiento y auditoría</Text>
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              El QR no tiene datos. Aprobás con PIN/biometría. Cada acceso queda registrado y podés revocarlo.
            </Text>
          </View>
        </LinearGradient>

        {/* Permissions selector */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Datos a compartir si aprobás</Text>
          {(Object.keys(permissions) as (keyof PermissionSet)[]).map((key) => {
            const locked = key === "name" || key === "globalId";
            const enabled = permissions[key];
            return (
              <Pressable
                key={key}
                onPress={() => togglePerm(key)}
                style={[
                  styles.permToggleRow,
                  {
                    backgroundColor: enabled ? "#1A6FE808" : colors.backgroundCard,
                    borderColor: enabled ? "#1A6FE840" : colors.border,
                  },
                ]}
              >
                <Feather
                  name={key === "name" ? "user" : key === "globalId" ? "hash" : key === "bio" ? "file-text" : "star"}
                  size={15}
                  color={enabled ? "#1A6FE8" : colors.textSecondary}
                />
                <Text style={[styles.permToggleLabel, { color: enabled ? colors.text : colors.textSecondary, flex: 1 }]}>
                  {PERM_LABELS[key]}
                </Text>
                {locked ? (
                  <View style={[styles.lockedBadge, { backgroundColor: "#1A6FE820" }]}>
                    <Feather name="lock" size={10} color="#1A6FE8" />
                    <Text style={[styles.lockedText, { color: "#1A6FE8" }]}>Requerido</Text>
                  </View>
                ) : (
                  <View style={[styles.toggleSwitch, { backgroundColor: enabled ? "#1A6FE8" : colors.border }]}>
                    <View style={[styles.toggleThumb, { transform: [{ translateX: enabled ? 16 : 0 }] }]} />
                  </View>
                )}
              </Pressable>
            );
          })}
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

        {/* Auth method indicator */}
        <View style={[styles.authMethodCard, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
          <Feather
            name={hasBiometrics && biometricsEnabled ? "activity" : hasPin ? "lock" : "alert-circle"}
            size={15}
            color={hasPin || (hasBiometrics && biometricsEnabled) ? "#22C55E" : "#F59E0B"}
          />
          <Text style={[styles.authMethodText, { color: colors.textSecondary }]}>
            {hasBiometrics && biometricsEnabled
              ? "La aprobación requerirá biometría"
              : hasPin
              ? "La aprobación requerirá tu PIN de 6 dígitos"
              : "Configurá un PIN en Seguridad para mayor protección"}
          </Text>
        </View>

        {/* Generate button */}
        <Pressable
          onPress={handleGenerate}
          disabled={generating}
          style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, marginTop: 8 })}
        >
          <LinearGradient colors={["#1A6FE8", "#0D8AEB"]} style={[styles.generateBtn, Shadows.colored("#1A6FE8")]}>
            <Feather name="maximize" size={20} color="#fff" />
            <Text style={styles.generateBtnText}>
              {generating ? "Generando QR..." : "Generar QR seguro"}
            </Text>
          </LinearGradient>
        </Pressable>

        {/* Access log */}
        {(accessLog.length > 0 || loadingLog) && (
          <View style={[styles.section, { marginTop: 28 }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Accesos recientes</Text>

            {loadingLog && (
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Cargando...</Text>
            )}

            {accessLog.map((entry) => (
              <View
                key={entry.id}
                style={[
                  styles.logCard,
                  { backgroundColor: colors.backgroundCard, borderColor: colors.border },
                  Shadows.sm,
                ]}
              >
                <View style={styles.logCardHeader}>
                  <View style={[styles.logStatusDot, { backgroundColor: statusColor(entry.status) }]} />
                  <Text style={[styles.logStatus, { color: statusColor(entry.status) }]}>
                    {statusLabel(entry.status)}
                  </Text>
                  <Text style={[styles.logDate, { color: colors.textSecondary }]}>
                    {formatDate(entry.updated_at)}
                  </Text>
                </View>

                <View style={styles.logRow}>
                  <Feather name="smartphone" size={12} color={colors.textSecondary} />
                  <Text style={[styles.logMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                    {entry.requester_device ?? "Dispositivo desconocido"}
                  </Text>
                </View>

                {entry.shared_data && entry.status === "approved" && (
                  <View style={styles.logRow}>
                    <Feather name="eye" size={12} color={colors.textSecondary} />
                    <Text style={[styles.logMeta, { color: colors.textSecondary }]}>
                      Datos: {Object.keys(entry.shared_data).filter((k) => !["verified","issuer"].includes(k)).join(", ")}
                    </Text>
                  </View>
                )}

                {entry.status === "approved" && (
                  <Pressable
                    onPress={() => handleRevokeAccess(entry)}
                    style={[styles.revokeBtn, { backgroundColor: "#E5353510", borderColor: "#E5353530" }]}
                  >
                    <Feather name="shield-off" size={12} color="#E53535" />
                    <Text style={styles.revokeBtnText}>Revocar acceso</Text>
                  </Pressable>
                )}

                {entry.status === "revoked" && entry.revoked_at && (
                  <View style={styles.logRow}>
                    <Feather name="shield-off" size={12} color="#F59E0B" />
                    <Text style={[styles.logMeta, { color: "#F59E0B" }]}>
                      Revocado el {formatDate(entry.revoked_at)}
                    </Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Modal */}
      <Modal
        visible={showQrModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCloseQr}
      >
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={styles.modalHandle} />
          {renderModalContent()}
        </View>
      </Modal>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20 },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },

  infoCard: {
    borderRadius: Radii.card, borderWidth: 1, padding: 16,
    flexDirection: "row", gap: 12, alignItems: "flex-start", marginBottom: 20,
  },
  infoIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  infoTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  infoText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },

  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 10 },

  permToggleRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 12, borderRadius: Radii.lg, borderWidth: 1, marginBottom: 8,
  },
  permToggleLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  lockedBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radii.pill },
  lockedText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  toggleSwitch: { width: 36, height: 20, borderRadius: 10 },
  toggleThumb: { width: 16, height: 16, borderRadius: 8, backgroundColor: "#fff", margin: 2 },

  expiryRow: { flexDirection: "row", gap: 8 },
  expiryChip: { flex: 1, paddingVertical: 10, borderRadius: Radii.pill, borderWidth: 1, alignItems: "center" },
  expiryText: { fontSize: 13, fontFamily: "Inter_500Medium" },

  authMethodCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 12, borderRadius: Radii.lg, borderWidth: 1, marginBottom: 20,
  },
  authMethodText: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },

  generateBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 15, borderRadius: Radii.button,
  },
  generateBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" },

  loadingText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", padding: 12 },

  logCard: { borderRadius: Radii.card, borderWidth: 1, padding: 14, marginBottom: 10 },
  logCardHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  logStatusDot: { width: 8, height: 8, borderRadius: 4 },
  logStatus: { fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 1 },
  logDate: { fontSize: 11, fontFamily: "Inter_400Regular" },
  logRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  logMeta: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  revokeBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginTop: 8, paddingVertical: 7, paddingHorizontal: 12,
    borderRadius: Radii.pill, borderWidth: 1, alignSelf: "flex-start",
  },
  revokeBtnText: { fontSize: 12, fontFamily: "Inter_500Medium", color: "#E53535" },

  // Modal
  modal: { flex: 1, paddingHorizontal: 24 },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: "#CBD5E1",
    alignSelf: "center", marginTop: 12, marginBottom: 20,
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  closeBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },

  qrContainer: { alignSelf: "center", padding: 16, borderRadius: 20, marginBottom: 20, ...Shadows.md },
  timerBadge: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "center",
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: Radii.pill, borderWidth: 1, marginBottom: 16,
  },
  timerText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  waitingCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 12, borderRadius: Radii.lg, borderWidth: 1, marginBottom: 12,
  },
  pulsingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#22C55E" },
  waitingText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  tokenBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: 10, borderRadius: Radii.lg, borderWidth: 1, marginBottom: 14,
  },
  tokenText: { fontSize: 11, fontFamily: "Inter_400Regular", flex: 1 },
  securityNote: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 17, paddingHorizontal: 8 },

  // Approval UI
  alertIconWrap: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 16 },
  alertTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center", marginBottom: 8 },
  alertSub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18, marginBottom: 20 },
  requesterCard: { borderRadius: Radii.card, borderWidth: 1, padding: 14, marginBottom: 16 },
  requesterRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  requesterLabel: { fontSize: 12, fontFamily: "Inter_400Regular", width: 70 },
  requesterValue: { fontSize: 13, fontFamily: "Inter_500Medium", flex: 1 },
  divider: { height: 1, marginVertical: 10 },
  dataPreviewCard: { borderRadius: Radii.card, borderWidth: 1, padding: 14, marginBottom: 20 },
  permTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  dataItem: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  dataItemText: { fontSize: 13, fontFamily: "Inter_400Regular" },

  consentBox: { borderRadius: Radii.card, borderWidth: 1, padding: 16, marginBottom: 12 },
  consentTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 10 },
  consentNote: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 17, marginBottom: 16 },

  approvalButtons: { flexDirection: "row", gap: 12, marginTop: "auto" as any, paddingBottom: 16 },
  rejectBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 14, borderRadius: Radii.button, borderWidth: 1.5,
  },
  rejectBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#E53535" },
  approveBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 14, borderRadius: Radii.button,
  },
  approveBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },

  noAuthWarning: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    padding: 12, borderRadius: Radii.lg, borderWidth: 1, marginBottom: 12,
  },
  noAuthWarningText: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#E53535", flex: 1, lineHeight: 17 },
  bioRetryBtn: { paddingVertical: 12, paddingHorizontal: 32, borderRadius: Radii.pill, borderWidth: 1.5, marginBottom: 16 },
  bioRetryText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  switchMethod: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 8 },

  // PIN
  pinDots: { flexDirection: "row", gap: 12, marginBottom: 12 },
  pinDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  pinError: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#E53535", marginBottom: 12 },
  pinGrid: { flexDirection: "row", flexWrap: "wrap", width: 240, gap: 10, justifyContent: "center", marginBottom: 16 },
  pinKey: {
    width: 70, height: 56, borderRadius: 12, borderWidth: 1,
    alignItems: "center", justifyContent: "center",
  },
  pinKeyText: { fontSize: 22, fontFamily: "Inter_600SemiBold" },
});
