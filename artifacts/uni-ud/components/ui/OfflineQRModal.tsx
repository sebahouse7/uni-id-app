import { Feather } from "@expo/vector-icons";
import * as ClipboardLib from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import * as Sharing from "expo-sharing";
import React, { useEffect, useRef, useState } from "react";
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

import Colors from "@/constants/colors";
import {
  CompactPackage,
  CONTEXT_COLORS,
  CONTEXT_ICONS,
  CONTEXT_LABELS,
  GeneratedOfflinePackage,
  PACKAGE_TTL_MS,
  formatPackageTimestamp,
  getTimeUntilExpiry,
  qrFitsLimit,
} from "@/lib/offlineIdentity";

interface OfflineQRModalProps {
  visible: boolean;
  onClose: () => void;
  result: GeneratedOfflinePackage;
}

export function OfflineQRModal({ visible, onClose, result }: OfflineQRModalProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const [sharing, setSharing] = useState(false);
  const [timeLeft, setTimeLeft] = useState("");
  const timerRef = useRef<any>(null);

  const { compact, full, qrEncoded, fullEncoded } = result;

  const ctxColor = CONTEXT_COLORS[compact.ctx] ?? "#1A6FE8";
  const ctxLabel = CONTEXT_LABELS[compact.ctx] ?? compact.ctx;
  const ctxIcon  = CONTEXT_ICONS[compact.ctx] ?? "zap";

  // QR usa el payload compacto (solo cabecera, sin datos cifrados)
  const qrValue   = `uniid://offline?p=${qrEncoded}`;
  const qrOk      = qrFitsLimit(qrEncoded);

  // Countdown timer
  useEffect(() => {
    if (!visible) return;
    const update = () => setTimeLeft(getTimeUntilExpiry(compact.ts));
    update();
    timerRef.current = setInterval(update, 1000);
    return () => clearInterval(timerRef.current);
  }, [visible, compact.ts]);

  const shareFile = async () => {
    if (sharing) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSharing(true);
    try {
      const fileName = `identidad-${compact.uid.replace(/-/g, "").slice(0, 8)}-${compact.ts}.uniid`;
      const fileUri = FileSystem.cacheDirectory + fileName;
      // Escribe el paquete COMPLETO (con sessionKey + IV + ciphertext)
      await FileSystem.writeAsStringAsync(fileUri, fullEncoded, {
        encoding: "utf8" as any,
      });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: "application/octet-stream",
          dialogTitle: "Compartir identidad uni.id",
          UTI: "public.data",
        });
      } else {
        Alert.alert("Compartir", "La función de compartir no está disponible en este dispositivo.");
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "No se pudo compartir el archivo.");
    } finally {
      setSharing(false);
    }
  };

  const copyCode = async () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await ClipboardLib.setStringAsync(qrEncoded);
    Alert.alert("Copiado", "El código compacto de identidad fue copiado al portapapeles.");
  };

  const isExpired = timeLeft === "Expirado";

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[s.root, { backgroundColor: isDark ? "#060B18" : "#F0F4FF" }]}>

        {/* Header */}
        <View style={[s.header, { borderBottomColor: isDark ? "#1A2540" : "#E0E8F8" }]}>
          <View style={{ flex: 1 }}>
            <Text style={[s.headerTitle, { color: colors.text }]}>Identidad offline</Text>
            <Text style={[s.headerSub, { color: colors.textSecondary }]}>
              {formatPackageTimestamp(compact.ts)}
            </Text>
          </View>
          <Pressable onPress={onClose} style={s.closeBtn} hitSlop={8}>
            <Feather name="x" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

          {/* Mode badge */}
          <View style={s.modeBanner}>
            <LinearGradient colors={["#0F2040", "#0A1528"]} style={s.modeBannerGrad}>
              <View style={[s.modeIcon, { backgroundColor: ctxColor + "22" }]}>
                <Feather name={ctxIcon as any} size={16} color={ctxColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.modeLabel}>Modo Offline · {ctxLabel}</Text>
                <Text style={s.modeSub}>Validación local segura · AES-256-GCM + Ed25519</Text>
              </View>
              <View style={[s.timer, { borderColor: isExpired ? "#E53E3E40" : "#00FF8840" }]}>
                <Text style={[s.timerText, { color: isExpired ? "#E53E3E" : "#00FF88" }]}>
                  {timeLeft}
                </Text>
              </View>
            </LinearGradient>
          </View>

          {/* Security badges */}
          <View style={s.badgeRow}>
            {[
              { icon: "lock", label: "AES-256-GCM", color: "#1A6FE8" },
              { icon: "feather", label: "Ed25519", color: "#7C3AED" },
              { icon: "hash", label: "SHA-256", color: "#10B981" },
              { icon: "shield", label: "Anti-replay", color: "#F59E0B" },
            ].map(({ icon, label, color }) => (
              <View key={label} style={[s.badge, { backgroundColor: color + "18", borderColor: color + "40" }]}>
                <Feather name={icon as any} size={10} color={color} />
                <Text style={[s.badgeText, { color }]}>{label}</Text>
              </View>
            ))}
          </View>

          {/* QR */}
          <View style={[s.qrWrap, { backgroundColor: isDark ? "#0D1525" : "#fff", borderColor: isDark ? "#1A2540" : "#E0E8F8" }]}>
            {!qrOk ? (
              <View style={s.qrFallback}>
                <Feather name="file-text" size={28} color="#F59E0B" />
                <Text style={[s.qrFallbackTitle, { color: colors.text }]}>Payload demasiado grande para QR</Text>
                <Text style={[s.qrFallbackSub, { color: colors.textSecondary }]}>
                  Usá "Compartir archivo .uniid" — contiene los datos cifrados completos
                </Text>
              </View>
            ) : isExpired ? (
              <View style={s.qrFallback}>
                <Feather name="clock" size={28} color="#E53E3E" />
                <Text style={[s.qrFallbackTitle, { color: "#E53E3E" }]}>QR expirado</Text>
                <Text style={[s.qrFallbackSub, { color: colors.textSecondary }]}>Cerrá y generá uno nuevo</Text>
              </View>
            ) : (
              <>
                <QRCode
                  value={qrValue}
                  size={200}
                  backgroundColor={isDark ? "#0D1525" : "#ffffff"}
                  color={isDark ? "#ffffff" : "#0A1528"}
                  ecl="M"
                />
                <View style={[s.qrNote, { backgroundColor: "#00FF8814", borderColor: "#00FF8830" }]}>
                  <Feather name="info" size={11} color="#00FF88" />
                  <Text style={s.qrNoteText}>QR compacto — prueba de identidad sin datos cifrados</Text>
                </View>
              </>
            )}
          </View>

          {/* Identity info */}
          <View style={[s.infoCard, { backgroundColor: isDark ? "#0D1525" : "#fff", borderColor: isDark ? "#1A2540" : "#E0E8F8" }]}>
            {[
              { key: "Nombre",     val: compact.name },
              { key: "ID",         val: `#${compact.uid.replace(/-/g, "").slice(0, 9).toUpperCase()}` },
              { key: "Nonce",      val: compact.nonce.slice(0, 12).toUpperCase() + "…", mono: true, color: "#00D4FF" },
              { key: "Firma",      val: compact.sig.slice(0, 16).toUpperCase() + "…", mono: true, color: "#00FF88" },
              { key: "Clave pública", val: compact.pub.slice(0, 12).toUpperCase() + "…", mono: true },
            ].map(({ key, val, mono, color }, i, arr) => (
              <View
                key={key}
                style={[
                  s.infoRow,
                  i < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: isDark ? "#1A2540" : "#E0E8F8" },
                ]}
              >
                <Text style={[s.infoKey, { color: colors.textSecondary }]}>{key}</Text>
                <Text style={[
                  s.infoVal,
                  { color: color ?? colors.text },
                  mono && { fontFamily: "Inter_400Regular", fontSize: 11, letterSpacing: 0.5 },
                ]}>
                  {val}
                </Text>
              </View>
            ))}
          </View>

          {/* Dual format explanation */}
          <View style={[s.dualCard, { backgroundColor: isDark ? "#080E1E" : "#EEF3FF", borderColor: isDark ? "#1A2540" : "#C7D8F8" }]}>
            <Text style={[s.dualTitle, { color: colors.text }]}>Dos formatos, un paquete</Text>
            <View style={s.dualRow}>
              <View style={s.dualItem}>
                <View style={[s.dualIcon, { backgroundColor: "#1A6FE818" }]}>
                  <Feather name="grid" size={14} color="#1A6FE8" />
                </View>
                <Text style={[s.dualLabel, { color: colors.text }]}>QR</Text>
                <Text style={[s.dualSub, { color: colors.textSecondary }]}>
                  Cabecera firmada compacta{"\n"}Prueba de identidad{"\n"}Sin datos cifrados
                </Text>
              </View>
              <View style={[s.dualDivider, { backgroundColor: isDark ? "#1A2540" : "#C7D8F8" }]} />
              <View style={s.dualItem}>
                <View style={[s.dualIcon, { backgroundColor: "#7C3AED18" }]}>
                  <Feather name="file" size={14} color="#7C3AED" />
                </View>
                <Text style={[s.dualLabel, { color: colors.text }]}>Archivo .uniid</Text>
                <Text style={[s.dualSub, { color: colors.textSecondary }]}>
                  Paquete completo{"\n"}Datos AES-256-GCM{"\n"}SessionKey + IV + cipher
                </Text>
              </View>
            </View>
          </View>

          {/* Notice */}
          <View style={[s.notice, { backgroundColor: "#F59E0B14", borderColor: "#F59E0B30" }]}>
            <Feather name="wifi-off" size={13} color="#F59E0B" />
            <Text style={[s.noticeText, { color: "#F59E0B" }]}>
              Podés compartir tu identidad incluso sin conexión. La firma digital garantiza la autenticidad.
            </Text>
          </View>

          {/* Actions */}
          <View style={s.actions}>
            <Pressable
              onPress={shareFile}
              disabled={sharing}
              style={{ opacity: sharing ? 0.65 : 1 }}
            >
              <LinearGradient
                colors={["#1A6FE8", "#0D4DB5"]}
                style={s.actionPrimary}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              >
                <Feather name="share-2" size={18} color="#fff" />
                <View>
                  <Text style={s.actionPrimaryText}>
                    {sharing ? "Compartiendo…" : "Compartir archivo .uniid"}
                  </Text>
                  <Text style={s.actionPrimarySub}>WhatsApp · AirDrop · Email · Bluetooth</Text>
                </View>
              </LinearGradient>
            </Pressable>

            <Pressable
              onPress={copyCode}
              style={[s.actionSecondary, { backgroundColor: isDark ? "#0D1525" : "#fff", borderColor: isDark ? "#1A2540" : "#E0E8F8" }]}
            >
              <Feather name="copy" size={16} color={colors.text} />
              <Text style={[s.actionSecondaryText, { color: colors.text }]}>Copiar código QR compacto</Text>
            </Pressable>
          </View>

          {/* How to verify */}
          <View style={[s.howto, { backgroundColor: isDark ? "#080E1E" : "#EEF3FF", borderColor: isDark ? "#1A2540" : "#C7D8F8" }]}>
            <Text style={[s.howtoTitle, { color: colors.text }]}>¿Cómo lo verifica el receptor?</Text>
            {[
              { icon: "smartphone", text: "Abre uni.id y escanea el QR → verifica la firma Ed25519" },
              { icon: "file",       text: "Recibe el archivo .uniid → descifra con sessionKey AES-256" },
              { icon: "check-circle", text: "Ve estado ✔ Válido / ⚠ No verificado / ✗ Inválido" },
            ].map(({ icon, text }) => (
              <View key={text} style={s.howtoRow}>
                <Feather name={icon as any} size={13} color={ctxColor} />
                <Text style={[s.howtoText, { color: colors.textSecondary }]}>{text}</Text>
              </View>
            ))}
          </View>

        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  closeBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },

  modeBanner: { marginHorizontal: 16, marginTop: 16, borderRadius: 14, overflow: "hidden" },
  modeBannerGrad: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  modeIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  modeLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" },
  modeSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.6)", marginTop: 2 },
  timer: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1,
  },
  timerText: { fontSize: 12, fontFamily: "Inter_700Bold" },

  badgeRow: {
    flexDirection: "row", flexWrap: "wrap", gap: 7,
    marginHorizontal: 16, marginTop: 12,
  },
  badge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 9, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1,
  },
  badgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },

  qrWrap: {
    alignItems: "center", margin: 16, borderRadius: 20,
    borderWidth: 1, padding: 24, gap: 14,
  },
  qrFallback: { alignItems: "center", gap: 10, paddingVertical: 20 },
  qrFallbackTitle: { fontSize: 14, fontFamily: "Inter_700Bold", textAlign: "center" },
  qrFallbackSub: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18 },
  qrNote: {
    flexDirection: "row", alignItems: "flex-start", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1,
  },
  qrNoteText: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#00FF88", flex: 1, lineHeight: 16 },

  infoCard: { marginHorizontal: 16, borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  infoRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 11,
  },
  infoKey: { fontSize: 12, fontFamily: "Inter_400Regular" },
  infoVal: { fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 1, textAlign: "right" },

  dualCard: {
    marginHorizontal: 16, marginTop: 12, borderRadius: 14,
    padding: 16, borderWidth: 1, gap: 12,
  },
  dualTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  dualRow: { flexDirection: "row", gap: 0 },
  dualItem: { flex: 1, alignItems: "center", gap: 6 },
  dualDivider: { width: 1, marginVertical: 4 },
  dualIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  dualLabel: { fontSize: 13, fontFamily: "Inter_700Bold" },
  dualSub: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 16 },

  notice: {
    flexDirection: "row", alignItems: "flex-start", gap: 9,
    marginHorizontal: 16, marginTop: 12,
    padding: 12, borderRadius: 12, borderWidth: 1,
  },
  noticeText: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 18 },

  actions: { margin: 16, gap: 10 },
  actionPrimary: {
    flexDirection: "row", alignItems: "center", gap: 14,
    borderRadius: 14, paddingVertical: 15, paddingHorizontal: 20,
  },
  actionPrimaryText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
  actionPrimarySub: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.7)", marginTop: 2 },
  actionSecondary: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 13, borderRadius: 14, borderWidth: 1,
  },
  actionSecondaryText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },

  howto: {
    marginHorizontal: 16, marginTop: 4, borderRadius: 14,
    padding: 16, borderWidth: 1, gap: 10,
  },
  howtoTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  howtoRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  howtoText: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 17 },
});
