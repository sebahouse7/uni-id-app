import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
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
  Share,
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
import { CATEGORIES, useIdentity } from "@/context/IdentityContext";
import {
  apiShareCreate,
  apiShareHistory,
  apiShareRevoke,
} from "@/lib/apiClient";

const EXPIRY_OPTIONS = [
  { label: "5 min", minutes: 5 },
  { label: "1 hora", minutes: 60 },
  { label: "24 horas", minutes: 1440 },
  { label: "7 días", minutes: 10080 },
];

interface ShareToken {
  id: string;
  document_ids: string[];
  label: string | null;
  expires_at: string;
  revoked: boolean;
  access_count: number;
  created_at: string;
}

export default function ShareScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const { documents } = useIdentity();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expiry, setExpiry] = useState(60);
  const [label, setLabel] = useState("");
  const [generating, setGenerating] = useState(false);
  const [qrResult, setQrResult] = useState<{
    token: string;
    url: string;
    expiresAt: string;
  } | null>(null);
  const [history, setHistory] = useState<ShareToken[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [allowFileView, setAllowFileView] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const qrPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    loadHistory();
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

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const h = await apiShareHistory();
      setHistory(h);
    } catch {}
    setLoadingHistory(false);
  };

  const toggleDoc = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === documents.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(documents.map((d) => d.id)));
    }
  };

  const handleGenerate = async () => {
    if (selected.size === 0) {
      Alert.alert("Seleccioná al menos un documento");
      return;
    }
    setGenerating(true);
    try {
      const result = await apiShareCreate({
        documentIds: Array.from(selected),
        label: label.trim() || undefined,
        expiresInMinutes: expiry,
        allowFileView,
      });
      setQrResult(result);
      setShowQrModal(true);
      loadHistory();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!qrResult) return;
    await Clipboard.setStringAsync(qrResult.url);
    Alert.alert("¡Copiado!", "El link fue copiado al portapapeles.");
  };

  const handleShare = async () => {
    if (!qrResult) return;
    try {
      await Share.share({
        message: `Mirá mi identidad digital en uni.id:\n${qrResult.url}`,
        url: qrResult.url,
      });
    } catch {}
  };

  const handleRevoke = (token: string) => {
    Alert.alert(
      "Revocar enlace",
      "¿Estás seguro? Quienes tengan el link ya no podrán acceder.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Revocar",
          style: "destructive",
          onPress: async () => {
            try {
              await apiShareRevoke(token);
              loadHistory();
            } catch (e: any) {
              Alert.alert("Error", e.message);
            }
          },
        },
      ]
    );
  };

  const formatExpiry = (isoDate: string) => {
    const d = new Date(isoDate);
    const now = new Date();
    if (d < now) return "Expirado";
    const diffMs = d.getTime() - now.getTime();
    const diffMins = Math.ceil(diffMs / 60000);
    if (diffMins < 60) return `${diffMins} min`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h`;
    return `${Math.floor(diffHours / 24)}d`;
  };

  const activeHistory = history.filter((h) => !h.revoked && new Date(h.expires_at) > new Date());
  const expiredHistory = history.filter((h) => h.revoked || new Date(h.expires_at) <= new Date());

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
              Generá un QR o link temporal
            </Text>
          </View>
        </View>

        {/* Info card */}
        <LinearGradient
          colors={isDark ? ["#0A1628", "#0D2040"] : ["#EEF4FF", "#E0ECFF"]}
          style={[styles.infoCard, { borderColor: isDark ? "#1A3060" : "#C8D8F0" }]}
        >
          <View style={[styles.infoIcon, { backgroundColor: "#1A6FE820" }]}>
            <Feather name="shield" size={20} color="#1A6FE8" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.infoTitle, { color: colors.text }]}>Compartido seguro y temporal</Text>
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              El QR expira automáticamente. Solo se comparten título, categoría y descripción — nunca archivos.
            </Text>
          </View>
        </LinearGradient>

        {/* Document selector */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Documentos a compartir</Text>
            {documents.length > 0 && (
              <Pressable onPress={toggleAll}>
                <Text style={[styles.selectAll, { color: colors.tint }]}>
                  {selected.size === documents.length ? "Deseleccionar todo" : "Seleccionar todo"}
                </Text>
              </Pressable>
            )}
          </View>

          {documents.length === 0 ? (
            <View style={[styles.emptyDocs, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
              <Feather name="folder" size={24} color={colors.textSecondary} />
              <Text style={[styles.emptyDocsText, { color: colors.textSecondary }]}>
                No tenés documentos. Agregá uno primero.
              </Text>
            </View>
          ) : (
            documents.map((doc) => {
              const cat = CATEGORIES.find((c) => c.key === doc.category);
              const isSelected = selected.has(doc.id);
              return (
                <Pressable
                  key={doc.id}
                  onPress={() => toggleDoc(doc.id)}
                  style={[
                    styles.docRow,
                    {
                      backgroundColor: isSelected
                        ? (cat?.color ?? colors.tint) + "12"
                        : colors.backgroundCard,
                      borderColor: isSelected
                        ? (cat?.color ?? colors.tint) + "50"
                        : colors.border,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.docIcon,
                      { backgroundColor: (cat?.color ?? "#1A6FE8") + "18" },
                    ]}
                  >
                    <Feather
                      name={(cat?.icon as any) ?? "file"}
                      size={18}
                      color={cat?.color ?? "#1A6FE8"}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.docTitle, { color: colors.text }]} numberOfLines={1}>
                      {doc.title}
                    </Text>
                    <Text style={[styles.docCat, { color: colors.textSecondary }]}>
                      {cat?.label ?? "Documento"}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.checkbox,
                      {
                        backgroundColor: isSelected ? (cat?.color ?? colors.tint) : "transparent",
                        borderColor: isSelected ? (cat?.color ?? colors.tint) : colors.border,
                      },
                    ]}
                  >
                    {isSelected && <Feather name="check" size={12} color="#fff" />}
                  </View>
                </Pressable>
              );
            })
          )}
        </View>

        {/* Expiry selector */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Tiempo de expiración</Text>
          <View style={styles.expiryRow}>
            {EXPIRY_OPTIONS.map((opt) => (
              <Pressable
                key={opt.minutes}
                onPress={() => setExpiry(opt.minutes)}
                style={[
                  styles.expiryChip,
                  {
                    backgroundColor:
                      expiry === opt.minutes ? colors.tint : colors.backgroundCard,
                    borderColor:
                      expiry === opt.minutes ? colors.tint : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.expiryText,
                    { color: expiry === opt.minutes ? "#fff" : colors.textSecondary },
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Allow file view */}
        <View style={[styles.section, { marginBottom: 16 }]}>
          <Pressable
            onPress={() => setAllowFileView((v) => !v)}
            style={[
              styles.toggleRow,
              {
                backgroundColor: allowFileView ? "#1A6FE812" : colors.backgroundCard,
                borderColor: allowFileView ? "#1A6FE840" : colors.border,
              },
            ]}
          >
            <View style={[styles.infoIcon2, { backgroundColor: allowFileView ? "#1A6FE818" : colors.border + "40" }]}>
              <Feather name="eye" size={16} color={allowFileView ? "#1A6FE8" : colors.textSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.toggleTitle, { color: colors.text }]}>Vista completa de documentos</Text>
              <Text style={[styles.toggleSub, { color: colors.textSecondary }]}>
                {allowFileView ? "El receptor verá detalles completos" : "Solo se muestra título y categoría"}
              </Text>
            </View>
            <View style={[
              styles.toggleSwitch,
              { backgroundColor: allowFileView ? "#1A6FE8" : colors.border }
            ]}>
              <View style={[styles.toggleThumb, { transform: [{ translateX: allowFileView ? 16 : 0 }] }]} />
            </View>
          </Pressable>
        </View>

        {/* Label */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Etiqueta <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13 }}>(opcional)</Text>
          </Text>
          <View
            style={[
              styles.labelInput,
              { backgroundColor: colors.backgroundCard, borderColor: colors.border },
            ]}
          >
            <Feather name="tag" size={16} color={colors.textSecondary} />
            <TextInput
              value={label}
              onChangeText={setLabel}
              placeholder="Ej: Entrevista de trabajo"
              placeholderTextColor={colors.textSecondary}
              style={[styles.labelInputText, { color: colors.text }]}
              maxLength={100}
            />
          </View>
        </View>

        {/* Generate button */}
        <Pressable
          onPress={handleGenerate}
          disabled={generating || selected.size === 0}
          style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
        >
          <LinearGradient
            colors={
              selected.size === 0
                ? [colors.textSecondary + "60", colors.textSecondary + "40"]
                : ["#1A6FE8", "#0D8AEB"]
            }
            style={[styles.generateBtn, Shadows.colored("#1A6FE8")]}
          >
            <Feather name="maximize" size={20} color="#fff" />
            <Text style={styles.generateBtnText}>
              {generating
                ? "Generando..."
                : `Generar QR (${selected.size} doc${selected.size !== 1 ? "s" : ""})`}
            </Text>
          </LinearGradient>
        </Pressable>

        {/* History */}
        {history.length > 0 && (
          <View style={[styles.section, { marginTop: 28 }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Historial de compartidos
            </Text>

            {activeHistory.map((item) => (
              <View
                key={item.id}
                style={[
                  styles.historyCard,
                  { backgroundColor: colors.backgroundCard, borderColor: colors.border },
                  Shadows.sm,
                ]}
              >
                <View style={[styles.historyIcon, { backgroundColor: "#1A6FE818" }]}>
                  <Feather name="link" size={16} color="#1A6FE8" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.historyLabel, { color: colors.text }]} numberOfLines={1}>
                    {item.label ?? `${item.document_ids.length} documento${item.document_ids.length !== 1 ? "s" : ""}`}
                  </Text>
                  <Text style={[styles.historyMeta, { color: colors.textSecondary }]}>
                    Expira en {formatExpiry(item.expires_at)} · {item.access_count} acceso
                    {item.access_count !== 1 ? "s" : ""}
                  </Text>
                </View>
                <Pressable
                  onPress={() => handleRevoke(item.id)}
                  style={[styles.revokeBtn, { backgroundColor: "#E5353518" }]}
                >
                  <Feather name="x" size={14} color="#E53535" />
                </Pressable>
              </View>
            ))}

            {expiredHistory.length > 0 && (
              <Text style={[styles.expiredLabel, { color: colors.textSecondary }]}>
                {expiredHistory.length} enlace{expiredHistory.length !== 1 ? "s" : ""} expirado
                {expiredHistory.length !== 1 ? "s" : ""} / revocado
                {expiredHistory.length !== 1 ? "s" : ""}
              </Text>
            )}
          </View>
        )}
      </ScrollView>

      {/* QR Modal */}
      <Modal
        visible={showQrModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowQrModal(false)}
      >
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={styles.modalHandle} />

          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Tu QR de identidad</Text>
            <Pressable onPress={() => setShowQrModal(false)}>
              <View style={[styles.closeBtn, { backgroundColor: colors.backgroundCard }]}>
                <Feather name="x" size={18} color={colors.text} />
              </View>
            </Pressable>
          </View>

          {qrResult && (
            <>
              <Animated.View style={[styles.qrContainer, { backgroundColor: "#fff", transform: [{ scale: qrPulse }] }]}>
                <QRCode
                  value={qrResult.url}
                  size={220}
                  color="#060B18"
                  backgroundColor="#fff"
                />
              </Animated.View>

              <View style={[styles.expiryBadge, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
                <Feather name="clock" size={14} color={colors.textSecondary} />
                <Text style={[styles.expiryBadgeText, { color: colors.textSecondary }]}>
                  Expira: {new Date(qrResult.expiresAt).toLocaleString("es-AR", {
                    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                  })}
                </Text>
              </View>

              <View style={[styles.urlBox, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
                <Text style={[styles.urlText, { color: colors.textSecondary }]} numberOfLines={1} selectable>
                  {qrResult.url}
                </Text>
              </View>

              <View style={styles.modalActions}>
                <Pressable
                  onPress={handleCopy}
                  style={[styles.modalBtn, { backgroundColor: colors.backgroundCard, borderColor: colors.border, borderWidth: 1 }]}
                >
                  <Feather name="copy" size={16} color={colors.text} />
                  <Text style={[styles.modalBtnText, { color: colors.text }]}>Copiar link</Text>
                </Pressable>
                <Pressable
                  onPress={handleShare}
                  style={{ flex: 1 }}
                >
                  <LinearGradient
                    colors={["#1A6FE8", "#0D8AEB"]}
                    style={styles.modalBtn}
                  >
                    <Feather name="share-2" size={16} color="#fff" />
                    <Text style={[styles.modalBtnText, { color: "#fff" }]}>Compartir</Text>
                  </LinearGradient>
                </Pressable>
              </View>
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
    marginBottom: 24,
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

  section: { marginBottom: 20 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 10 },
  selectAll: { fontSize: 13, fontFamily: "Inter_500Medium" },

  emptyDocs: {
    borderRadius: Radii.lg,
    borderWidth: 1,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  emptyDocsText: { fontSize: 14, fontFamily: "Inter_400Regular", flex: 1 },

  docRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: Radii.lg,
    borderWidth: 1,
    marginBottom: 8,
  },
  docIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  docTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  docCat: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },

  expiryRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  expiryChip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: Radii.pill,
    borderWidth: 1,
  },
  expiryText: { fontSize: 13, fontFamily: "Inter_500Medium" },

  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: Radii.lg,
    borderWidth: 1,
  },
  infoIcon2: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  toggleSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  toggleSwitch: {
    width: 36,
    height: 20,
    borderRadius: 10,
    padding: 2,
  },
  toggleThumb: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#fff",
  },

  labelInput: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: Radii.lg,
    borderWidth: 1,
  },
  labelInputText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    padding: 0,
  },

  generateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: Radii.xl,
  },
  generateBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },

  historyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: Radii.lg,
    borderWidth: 1,
    marginBottom: 8,
  },
  historyIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  historyLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  historyMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  revokeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  expiredLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    paddingTop: 8,
  },

  modal: {
    flex: 1,
    padding: Spacing.md,
    paddingTop: 12,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#8899BB40",
    alignSelf: "center",
    marginBottom: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 28,
  },
  modalTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  qrContainer: {
    alignSelf: "center",
    padding: 20,
    borderRadius: Radii.card,
    marginBottom: 20,
  },
  expiryBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radii.pill,
    borderWidth: 1,
    marginBottom: 14,
  },
  expiryBadgeText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  urlBox: {
    borderRadius: Radii.lg,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 20,
  },
  urlText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  modalActions: {
    flexDirection: "row",
    gap: 10,
  },
  modalBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: Radii.lg,
  },
  modalBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
