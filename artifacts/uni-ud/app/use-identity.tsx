import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
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

import { OfflineQRModal } from "@/components/ui/OfflineQRModal";
import Colors from "@/constants/colors";
import { Shadows } from "@/constants/design";
import { useIdentity } from "@/context/IdentityContext";
import {
  CONTEXT_COLORS,
  CONTEXT_ICONS,
  CONTEXT_LABELS,
  OfflineContext,
  OfflineDataSelection,
  GeneratedOfflinePackage,
  generateOfflinePackage,
} from "@/lib/offlineIdentity";
import { apiShareCreateQr, apiLogOfflineActivity, apiRegisterSigningKey } from "@/lib/apiClient";
import { hasKeyPair, generateAndStoreKeyPair } from "@/lib/signingKeys";

// ── Context options ────────────────────────────────────────────────────────

const CONTEXTS: Array<{ id: OfflineContext; desc: string }> = [
  { id: "work",   desc: "Compartí tu identidad verificada con empleadores" },
  { id: "rent",   desc: "Mostrá tus datos para alquilar una propiedad" },
  { id: "sale",   desc: "Verificá tu identidad en compra o venta de bienes" },
  { id: "health", desc: "Compartí documentos médicos y datos de salud" },
  { id: "quick",  desc: "Validación rápida de identidad en segundos" },
];

// ── Online QR Modal (reuses existing flow) ─────────────────────────────────

function OnlineQRSection({
  colors,
  isDark,
}: {
  colors: typeof Colors.dark;
  isDark: boolean;
}) {
  const { node } = useIdentity();
  const [loading, setLoading] = useState(false);
  const [qrData, setQrData] = useState<{ token: string; qrContent: string; expiresAt: string } | null>(null);
  const QRCode = require("react-native-qrcode-svg").default;

  const createQR = async () => {
    if (!node) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    try {
      const data = await apiShareCreateQr({
        permissions: { name: true, globalId: true, bio: true, networkPlan: false },
        expiresInMinutes: 3,
      });
      setQrData(data);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "No se pudo crear el QR. Verificá tu conexión.");
    } finally {
      setLoading(false);
    }
  };

  const isExpired = qrData && new Date(qrData.expiresAt) < new Date();

  return (
    <View style={[qs.card, { backgroundColor: isDark ? "#0D1525" : "#fff", borderColor: isDark ? "#1A2540" : "#E0E8F8" }]}>
      <View style={[qs.modeTag, { backgroundColor: "#1A6FE818" }]}>
        <View style={[qs.dot, { backgroundColor: "#1A6FE8" }]} />
        <Text style={[qs.modeText, { color: "#1A6FE8" }]}>Modo Online · Validación en tiempo real</Text>
      </View>

      {qrData && !isExpired ? (
        <View style={{ alignItems: "center", gap: 12 }}>
          <View style={[qs.qrBox, { backgroundColor: "#fff", borderColor: "#E0E8F8" }]}>
            <QRCode
              value={qrData.qrContent}
              size={180}
              backgroundColor="#ffffff"
              color="#0A1528"
              ecl="M"
            />
          </View>
          <Text style={[qs.qrSub, { color: colors.textSecondary }]}>
            Expira: {new Date(qrData.expiresAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
          </Text>
          <Text style={[qs.qrNote, { color: colors.textSecondary }]}>
            La otra persona escanea · Vos aprobás · Datos compartidos
          </Text>
          <Pressable
            onPress={() => setQrData(null)}
            style={[qs.resetBtn, { borderColor: isDark ? "#1A2540" : "#E0E8F8" }]}
          >
            <Text style={{ color: colors.textSecondary, fontSize: 13, fontFamily: "Inter_500Medium" }}>
              Nuevo QR
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ gap: 16 }}>
          <Text style={[qs.desc, { color: colors.textSecondary }]}>
            La otra persona escanea el QR con cualquier cámara. Vos aprobás desde la app. Datos compartidos en tiempo real.
          </Text>
          <Pressable onPress={createQR} disabled={loading} style={{ opacity: loading ? 0.7 : 1 }}>
            <LinearGradient
              colors={["#1A6FE8", "#0D4DB5"]}
              style={qs.primaryBtn}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            >
              <Feather name="grid" size={18} color="#fff" />
              <Text style={qs.primaryBtnText}>
                {loading ? "Generando QR…" : "Generar QR de identidad"}
              </Text>
            </LinearGradient>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const qs = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 14 },
  modeTag: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, alignSelf: "flex-start",
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  modeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  qrBox: {
    padding: 16, borderRadius: 16, borderWidth: 1,
    alignItems: "center", justifyContent: "center",
  },
  qrSub: { fontSize: 12, fontFamily: "Inter_500Medium" },
  qrNote: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center" },
  resetBtn: {
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, borderWidth: 1,
  },
  desc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 15, borderRadius: 14,
  },
  primaryBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
});

// ── Main Screen ────────────────────────────────────────────────────────────

export default function UseIdentityScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const { node, documents, isOnline } = useIdentity();

  const [selectedCtx, setSelectedCtx] = useState<OfflineContext | null>(null);
  const [offlineMode, setOfflineMode] = useState(!isOnline);
  const [generating, setGenerating] = useState(false);

  const [selection, setSelection] = useState<OfflineDataSelection>({
    name: true,
    globalId: true,
    bio: false,
    documentIds: [],
  });

  const [offlineResult, setOfflineResult] = useState<GeneratedOfflinePackage | null>(null);
  const [showQRModal, setShowQRModal] = useState(false);

  const toggleDoc = (id: string) => {
    setSelection((s) => ({
      ...s,
      documentIds: s.documentIds.includes(id)
        ? s.documentIds.filter((x) => x !== id)
        : [...s.documentIds, id],
    }));
  };

  const handleGenerate = async () => {
    if (!node || !selectedCtx) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setGenerating(true);
    try {
      // Auto-generate Ed25519 keys if missing (first time or after reinstall)
      const keysOk = await hasKeyPair();
      if (!keysOk) {
        const pubKey = await generateAndStoreKeyPair();
        apiRegisterSigningKey(pubKey).catch(() => {});
      }

      const result = await generateOfflinePackage({
        uid: node.globalId ?? node.id,
        name: node.name,
        selection,
        context: selectedCtx,
        allDocuments: documents.map((d) => ({
          id: d.id,
          title: d.title,
          category: d.category,
          description: d.description,
          createdAt: d.createdAt,
        })),
        bio: node.bio,
        globalId: node.globalId,
      });
      setOfflineResult(result);
      setShowQRModal(true);
      apiLogOfflineActivity({
        context: selectedCtx ?? undefined,
        dataShared: [
          ...(selection.name ? ["nombre"] : []),
          ...(selection.globalId ? ["globalId"] : []),
          ...(selection.bio ? ["bio"] : []),
          ...(selection.documentIds.length > 0 ? ["documentos"] : []),
        ],
        hash: result.compact.hash,
        trustLevel: "high",
      }).catch(() => {});
    } catch (e: any) {
      Alert.alert(
        "Error al generar identidad",
        e?.message ?? "Verificá que tenés una clave de firma activa."
      );
    } finally {
      setGenerating(false);
    }
  };

  const c = {
    bg: isDark ? "#060B18" : "#F0F4FF",
    card: isDark ? "#0D1525" : "#FFFFFF",
    border: isDark ? "#1A2540" : "#E0E8F8",
    text: colors.text,
    sub: isDark ? "#5A7090" : "#8A99B5",
  };

  return (
    <View style={[s.root, { backgroundColor: c.bg, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: c.border }]}>
        <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={22} color={c.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[s.headerTitle, { color: c.text }]}>Usar mi identidad</Text>
          <Text style={[s.headerSub, { color: c.sub }]}>Elegí contexto y modo de compartir</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 60, gap: 20 }}>

        {/* Online/Offline toggle */}
        <View style={[s.modeCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={[s.modeCardTitle, { color: c.text }]}>
              {offlineMode ? "📴 Modo Offline" : "🌐 Modo Online"}
            </Text>
            <Text style={[s.modeCardSub, { color: c.sub }]}>
              {offlineMode
                ? "Validación local segura · No requiere internet"
                : "Validación en tiempo real · Requiere conexión"}
            </Text>
          </View>
          <Switch
            value={offlineMode}
            onValueChange={(v) => {
              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setOfflineMode(v);
            }}
            trackColor={{ false: "#1A6FE870", true: "#00D4FF70" }}
            thumbColor={offlineMode ? "#00D4FF" : "#1A6FE8"}
          />
        </View>

        {/* Description banner */}
        {!offlineMode && (
          <View style={[s.onlineBanner, { backgroundColor: "#1A6FE814", borderColor: "#1A6FE830" }]}>
            <Feather name="wifi" size={14} color="#1A6FE8" />
            <Text style={s.onlineBannerText}>
              Modo Online · Aprobás vos cada solicitud de acceso
            </Text>
          </View>
        )}
        {offlineMode && (
          <View style={[s.offlineBanner, { backgroundColor: "#00D4FF14", borderColor: "#00D4FF30" }]}>
            <Feather name="wifi-off" size={14} color="#00D4FF" />
            <Text style={s.offlineBannerText}>
              Podés compartir tu identidad incluso sin conexión
            </Text>
          </View>
        )}

        {/* Context selection */}
        <View style={{ gap: 10 }}>
          <Text style={[s.sectionTitle, { color: c.text }]}>¿Para qué situación?</Text>
          <View style={s.ctxGrid}>
            {CONTEXTS.map(({ id, desc }) => {
              const active = selectedCtx === id;
              const color = CONTEXT_COLORS[id];
              const icon = CONTEXT_ICONS[id];
              const label = CONTEXT_LABELS[id];
              return (
                <Pressable
                  key={id}
                  onPress={() => {
                    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedCtx(active ? null : id);
                  }}
                  style={[
                    s.ctxCard,
                    {
                      backgroundColor: active ? color + "18" : c.card,
                      borderColor: active ? color : c.border,
                    },
                    active && Shadows.sm,
                  ]}
                >
                  <LinearGradient
                    colors={active ? [color, color + "CC"] : [c.border, c.border]}
                    style={s.ctxIcon}
                  >
                    <Feather name={icon as any} size={18} color={active ? "#fff" : c.sub} />
                  </LinearGradient>
                  <Text style={[s.ctxLabel, { color: active ? color : c.text }]}>{label}</Text>
                  <Text style={[s.ctxDesc, { color: c.sub }]} numberOfLines={2}>{desc}</Text>
                  {active && (
                    <View style={[s.ctxCheck, { backgroundColor: color }]}>
                      <Feather name="check" size={10} color="#fff" />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Data selection (only for offline) */}
        {offlineMode && selectedCtx && (
          <View style={{ gap: 10 }}>
            <Text style={[s.sectionTitle, { color: c.text }]}>¿Qué datos compartir?</Text>
            <View style={[s.dataCard, { backgroundColor: c.card, borderColor: c.border }]}>
              {[
                { key: "name" as const, label: "Nombre completo", icon: "user", always: true },
                { key: "globalId" as const, label: "ID global (DID)", icon: "hash", always: false },
                { key: "bio" as const, label: "Descripción / Bio", icon: "file-text", always: false },
              ].map(({ key, label, icon, always }, i, arr) => (
                <Pressable
                  key={key}
                  onPress={() => {
                    if (always) return;
                    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelection((s) => ({ ...s, [key]: !s[key] }));
                  }}
                  style={[
                    s.dataRow,
                    i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.border },
                  ]}
                >
                  <View style={[s.dataIcon, { backgroundColor: "#1A6FE818" }]}>
                    <Feather name={icon as any} size={14} color="#1A6FE8" />
                  </View>
                  <Text style={[s.dataLabel, { color: c.text }]}>{label}</Text>
                  {always ? (
                    <View style={[s.alwaysBadge, { backgroundColor: "#1A6FE818" }]}>
                      <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#1A6FE8" }}>siempre</Text>
                    </View>
                  ) : (
                    <Switch
                      value={selection[key]}
                      onValueChange={(v) => setSelection((s) => ({ ...s, [key]: v }))}
                      trackColor={{ false: c.border, true: "#1A6FE870" }}
                      thumbColor={selection[key] ? "#1A6FE8" : c.sub}
                    />
                  )}
                </Pressable>
              ))}

              {/* Documents toggle */}
              {documents.length > 0 && (
                <>
                  <View style={[s.dataRow, { borderTopWidth: 1, borderTopColor: c.border }]}>
                    <View style={[s.dataIcon, { backgroundColor: "#7C3AED18" }]}>
                      <Feather name="folder" size={14} color="#7C3AED" />
                    </View>
                    <Text style={[s.dataLabel, { color: c.text }]}>Documentos ({selection.documentIds.length} sel.)</Text>
                  </View>
                  {documents.slice(0, 6).map((doc) => (
                    <Pressable
                      key={doc.id}
                      onPress={() => {
                        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        toggleDoc(doc.id);
                      }}
                      style={[s.docRow, { backgroundColor: selection.documentIds.includes(doc.id) ? "#7C3AED14" : "transparent" }]}
                    >
                      <Feather
                        name={selection.documentIds.includes(doc.id) ? "check-square" : "square"}
                        size={16}
                        color={selection.documentIds.includes(doc.id) ? "#7C3AED" : c.sub}
                      />
                      <Text style={[s.docLabel, { color: c.text }]} numberOfLines={1}>{doc.title}</Text>
                      <Text style={[s.docCat, { color: c.sub }]}>{doc.category}</Text>
                    </Pressable>
                  ))}
                </>
              )}
            </View>
          </View>
        )}

        {/* CTA section */}
        {selectedCtx && (
          <View style={{ gap: 12 }}>
            {offlineMode ? (
              <>
                {/* Offline CTA */}
                <Pressable
                  onPress={handleGenerate}
                  disabled={generating}
                  style={{ opacity: generating ? 0.7 : 1 }}
                >
                  <LinearGradient
                    colors={["#0A1528", "#1A3F8F"]}
                    style={s.ctaBtn}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  >
                    <View style={[s.ctaIconWrap, { backgroundColor: "#00D4FF22" }]}>
                      <Feather name="wifi-off" size={20} color="#00D4FF" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.ctaBtnTitle}>
                        {generating ? "Generando paquete…" : "Compartir sin conexión"}
                      </Text>
                      <Text style={s.ctaBtnSub}>QR offline · Archivo .uniid · WhatsApp</Text>
                    </View>
                    {!generating && <Feather name="arrow-right" size={18} color="#00D4FF" />}
                  </LinearGradient>
                </Pressable>

                <View style={[s.securityNote, { backgroundColor: c.card, borderColor: c.border }]}>
                  <Feather name="lock" size={13} color="#00FF88" />
                  <Text style={[s.securityNoteText, { color: c.sub }]}>
                    SHA-256 + Ed25519 · Los datos se firman digitalmente en tu dispositivo
                  </Text>
                </View>
              </>
            ) : (
              /* Online CTA — show QR card inline */
              <OnlineQRSection colors={colors} isDark={isDark} />
            )}
          </View>
        )}

        {/* Prompt if no context selected */}
        {!selectedCtx && (
          <View style={[s.promptCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <Feather name="chevrons-up" size={24} color={c.sub} />
            <Text style={[s.promptText, { color: c.sub }]}>
              Elegí una situación arriba para continuar
            </Text>
          </View>
        )}

        {/* Comparison */}
        <View style={[s.compareCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[s.compareTitle, { color: c.text }]}>Modos de compartir</Text>
          <View style={s.compareRow}>
            <View style={[s.compareCol, { borderColor: "#1A6FE840" }]}>
              <View style={[s.compareTag, { backgroundColor: "#1A6FE818" }]}>
                <Feather name="wifi" size={11} color="#1A6FE8" />
                <Text style={[s.compareTagText, { color: "#1A6FE8" }]}>Online</Text>
              </View>
              {["Validación en tiempo real", "Aprobás cada acceso", "Requiere internet"].map((f) => (
                <View key={f} style={s.compareItem}>
                  <Feather name="check" size={12} color="#1A6FE8" />
                  <Text style={[s.compareItemText, { color: c.sub }]}>{f}</Text>
                </View>
              ))}
            </View>
            <View style={[s.compareCol, { borderColor: "#00D4FF40" }]}>
              <View style={[s.compareTag, { backgroundColor: "#00D4FF18" }]}>
                <Feather name="wifi-off" size={11} color="#00D4FF" />
                <Text style={[s.compareTagText, { color: "#00D4FF" }]}>Offline</Text>
              </View>
              {["Funciona sin internet", "QR + archivo .uniid", "Firma criptográfica"].map((f) => (
                <View key={f} style={s.compareItem}>
                  <Feather name="check" size={12} color="#00D4FF" />
                  <Text style={[s.compareItemText, { color: c.sub }]}>{f}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Offline QR modal */}
      {offlineResult && (
        <OfflineQRModal
          visible={showQRModal}
          onClose={() => setShowQRModal(false)}
          result={offlineResult}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1,
    paddingTop: 8,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  modeCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    borderRadius: 16, borderWidth: 1, padding: 16,
  },
  modeCardTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  modeCardSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  onlineBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1,
  },
  onlineBannerText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#1A6FE8" },
  offlineBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1,
  },
  offlineBannerText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#00D4FF" },
  sectionTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  ctxGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  ctxCard: {
    width: "47%", borderRadius: 16, borderWidth: 1.5,
    padding: 14, gap: 8, position: "relative",
  },
  ctxIcon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  ctxLabel: { fontSize: 13, fontFamily: "Inter_700Bold" },
  ctxDesc: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16 },
  ctxCheck: {
    position: "absolute", top: 10, right: 10,
    width: 18, height: 18, borderRadius: 9,
    alignItems: "center", justifyContent: "center",
  },
  dataCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  dataRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 13,
  },
  dataIcon: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  dataLabel: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  alwaysBadge: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  docRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 16, paddingVertical: 10,
    marginHorizontal: 4, borderRadius: 10,
  },
  docLabel: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  docCat: { fontSize: 11, fontFamily: "Inter_400Regular" },
  ctaBtn: {
    flexDirection: "row", alignItems: "center", gap: 14,
    borderRadius: 18, padding: 18,
  },
  ctaIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  ctaBtnTitle: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
  ctaBtnSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.6)", marginTop: 3 },
  securityNote: {
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: 12, borderRadius: 12, borderWidth: 1,
  },
  securityNoteText: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  promptCard: {
    alignItems: "center", gap: 10, padding: 28,
    borderRadius: 16, borderWidth: 1,
  },
  promptText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  compareCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  compareTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  compareRow: { flexDirection: "row", gap: 10 },
  compareCol: {
    flex: 1, borderRadius: 12, borderWidth: 1, padding: 12, gap: 8,
  },
  compareTag: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, alignSelf: "flex-start",
  },
  compareTagText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  compareItem: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  compareItemText: { fontSize: 11, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 16 },
});
