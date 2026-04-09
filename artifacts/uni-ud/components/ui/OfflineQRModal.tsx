import { Feather } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import * as Sharing from "expo-sharing";
import React, { useState } from "react";
import * as ClipboardLib from "expo-clipboard";
import {
  Alert,
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
  CONTEXT_COLORS,
  CONTEXT_ICONS,
  CONTEXT_LABELS,
  OfflinePackage,
  formatPackageTimestamp,
} from "@/lib/offlineIdentity";

interface OfflineQRModalProps {
  visible: boolean;
  onClose: () => void;
  encoded: string;
  pkg: OfflinePackage;
}

export function OfflineQRModal({ visible, onClose, encoded, pkg }: OfflineQRModalProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const [sharing, setSharing] = useState(false);

  const ctxColor = CONTEXT_COLORS[pkg.ctx] ?? "#1A6FE8";
  const ctxLabel = CONTEXT_LABELS[pkg.ctx] ?? pkg.ctx;
  const ctxIcon = CONTEXT_ICONS[pkg.ctx] ?? "zap";

  const qrValue = `uniid://offline?p=${encoded}`;
  const MAX_QR_LEN = 2000;
  const qrTooLong = qrValue.length > MAX_QR_LEN;

  const shareFile = async () => {
    if (sharing) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSharing(true);
    try {
      const fileName = `identidad-${pkg.uid.slice(-6)}-${pkg.ts}.uniid`;
      const fileUri = FileSystem.cacheDirectory + fileName;
      await FileSystem.writeAsStringAsync(fileUri, encoded, {
        encoding: FileSystem.EncodingType.UTF8,
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
    await ClipboardLib.setStringAsync(encoded);
    Alert.alert("Copiado", "El código de identidad fue copiado al portapapeles.");
  };

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
              Válido sin conexión · {formatPackageTimestamp(pkg.ts)}
            </Text>
          </View>
          <Pressable onPress={onClose} style={s.closeBtn} hitSlop={8}>
            <Feather name="x" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Mode badge */}
          <View style={s.modeBanner}>
            <LinearGradient
              colors={["#0F2040", "#0A1528"]}
              style={s.modeBannerGrad}
            >
              <View style={[s.modeIcon, { backgroundColor: ctxColor + "22" }]}>
                <Feather name={ctxIcon as any} size={16} color={ctxColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.modeLabel}>Modo Offline · {ctxLabel}</Text>
                <Text style={s.modeSub}>Validación local segura — no requiere internet</Text>
              </View>
              <View style={[s.modeDot, { backgroundColor: "#00FF88" }]} />
            </LinearGradient>
          </View>

          {/* QR Code */}
          <View style={[s.qrWrap, { backgroundColor: isDark ? "#0D1525" : "#fff", borderColor: isDark ? "#1A2540" : "#E0E8F8" }]}>
            {qrTooLong ? (
              <View style={s.qrFallback}>
                <Feather name="alert-circle" size={32} color="#F59E0B" />
                <Text style={[s.qrFallbackText, { color: colors.text }]}>
                  Payload demasiado largo para QR
                </Text>
                <Text style={[s.qrFallbackSub, { color: colors.textSecondary }]}>
                  Usá "Compartir archivo" para enviar la identidad
                </Text>
              </View>
            ) : (
              <QRCode
                value={qrValue}
                size={220}
                backgroundColor={isDark ? "#0D1525" : "#ffffff"}
                color={isDark ? "#ffffff" : "#0A1528"}
                ecl="M"
              />
            )}
            <View style={s.qrFooter}>
              <Feather name="lock" size={12} color={ctxColor} />
              <Text style={[s.qrFooterText, { color: ctxColor }]}>
                SHA-256 · Ed25519 · Firmado digitalmente
              </Text>
            </View>
          </View>

          {/* User info */}
          <View style={[s.infoCard, { backgroundColor: isDark ? "#0D1525" : "#fff", borderColor: isDark ? "#1A2540" : "#E0E8F8" }]}>
            <View style={s.infoRow}>
              <Text style={[s.infoKey, { color: colors.textSecondary }]}>Nombre</Text>
              <Text style={[s.infoVal, { color: colors.text }]}>{pkg.name}</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={[s.infoKey, { color: colors.textSecondary }]}>ID</Text>
              <Text style={[s.infoVal, { color: colors.text }]}>
                #{pkg.uid.replace(/-/g, "").slice(0, 9).toUpperCase()}
              </Text>
            </View>
            <View style={s.infoRow}>
              <Text style={[s.infoKey, { color: colors.textSecondary }]}>Firma</Text>
              <Text style={[s.infoVal, { color: "#00FF88", fontSize: 11 }]}>
                {pkg.sig.slice(0, 16).toUpperCase()}…
              </Text>
            </View>
            <View style={[s.infoRow, { borderBottomWidth: 0 }]}>
              <Text style={[s.infoKey, { color: colors.textSecondary }]}>Clave pública</Text>
              <Text style={[s.infoVal, { color: colors.textSecondary, fontSize: 11 }]}>
                {pkg.pub.slice(0, 12).toUpperCase()}…
              </Text>
            </View>
          </View>

          {/* Offline notice */}
          <View style={s.notice}>
            <Feather name="wifi-off" size={14} color="#F59E0B" />
            <Text style={s.noticeText}>
              Podés compartir tu identidad incluso sin conexión. La firma digital garantiza la autenticidad.
            </Text>
          </View>

          {/* Share actions */}
          <View style={s.actions}>
            <Pressable
              onPress={shareFile}
              disabled={sharing}
              style={[s.actionBtn, { opacity: sharing ? 0.6 : 1 }]}
            >
              <LinearGradient
                colors={["#1A6FE8", "#0D4DB5"]}
                style={s.actionGrad}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              >
                <Feather name="share-2" size={18} color="#fff" />
                <Text style={s.actionText}>
                  {sharing ? "Compartiendo…" : "Compartir archivo .uniid"}
                </Text>
              </LinearGradient>
            </Pressable>

            <Pressable onPress={copyCode} style={[s.actionBtn2, { backgroundColor: isDark ? "#0D1525" : "#fff", borderColor: isDark ? "#1A2540" : "#E0E8F8" }]}>
              <Feather name="copy" size={16} color={colors.text} />
              <Text style={[s.actionText2, { color: colors.text }]}>Copiar código</Text>
            </Pressable>
          </View>

          {/* How to use */}
          <View style={[s.howto, { backgroundColor: isDark ? "#080E1E" : "#EEF3FF", borderColor: isDark ? "#1A2540" : "#C7D8F8" }]}>
            <Text style={[s.howtoTitle, { color: colors.text }]}>¿Cómo funciona?</Text>
            {[
              { icon: "smartphone", text: "La otra persona abre uni.id y escanea el QR" },
              { icon: "shield", text: "La app verifica la firma Ed25519 localmente" },
              { icon: "check-circle", text: "Se muestran tus datos con estado ✓ Válido" },
            ].map(({ icon, text }) => (
              <View key={text} style={s.howtoRow}>
                <Feather name={icon as any} size={14} color={ctxColor} />
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
  modeIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  modeLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" },
  modeSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.6)", marginTop: 2 },
  modeDot: { width: 8, height: 8, borderRadius: 4 },
  qrWrap: {
    alignItems: "center", margin: 16, borderRadius: 20,
    borderWidth: 1, padding: 24, gap: 16,
  },
  qrFallback: { alignItems: "center", gap: 10, paddingVertical: 20 },
  qrFallbackText: { fontSize: 14, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  qrFallbackSub: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" },
  qrFooter: { flexDirection: "row", alignItems: "center", gap: 6 },
  qrFooterText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  infoCard: {
    marginHorizontal: 16, borderRadius: 16, borderWidth: 1,
    overflow: "hidden",
  },
  infoRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.06)",
  },
  infoKey: { fontSize: 13, fontFamily: "Inter_400Regular" },
  infoVal: { fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 1, textAlign: "right" },
  notice: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    marginHorizontal: 16, marginTop: 12,
    backgroundColor: "#F59E0B18", borderRadius: 12,
    padding: 14,
  },
  noticeText: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#F59E0B", flex: 1, lineHeight: 18 },
  actions: { margin: 16, gap: 10 },
  actionBtn: { borderRadius: 14, overflow: "hidden" },
  actionGrad: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 16,
  },
  actionText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
  actionBtn2: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 14, borderRadius: 14, borderWidth: 1,
  },
  actionText2: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  howto: {
    marginHorizontal: 16, marginTop: 4, borderRadius: 14, padding: 16,
    borderWidth: 1, gap: 10,
  },
  howtoTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  howtoRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  howtoText: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 18 },
});
