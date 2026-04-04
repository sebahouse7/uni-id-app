import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import * as Sharing from "expo-sharing";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
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
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { CATEGORIES, useIdentity } from "@/context/IdentityContext";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

const IMAGE_EXTS = /\.(jpg|jpeg|png|gif|webp|bmp|heic|avif)$/i;

function isImageUri(uri?: string, fileName?: string): boolean {
  if (!uri) return false;
  if (IMAGE_EXTS.test(uri)) return true;
  if (uri.startsWith("data:image/")) return true;
  // content:// or file:// URIs without extension — check fileName
  if (fileName && IMAGE_EXTS.test(fileName)) return true;
  // Android content:// URIs from gallery are almost always images
  if (uri.startsWith("content://media/")) return true;
  return false;
}

export default function DocumentDetailScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const { id } = useLocalSearchParams<{ id: string }>();
  const { documents, deleteDocument } = useIdentity();
  const [deleting, setDeleting] = useState(false);
  const [imgModalVisible, setImgModalVisible] = useState(false);
  const [imgZoom, setImgZoom] = useState(1);

  const doc = documents.find((d) => String(d.id) === String(id));
  const cat = doc ? CATEGORIES.find((c) => c.key === doc.category) : null;
  const hasImage = isImageUri(doc?.fileUri, doc?.fileName);

  if (!doc) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }]}>
        <Text style={[styles.notFound, { color: colors.text }]}>Documento no encontrado</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.back, { color: colors.tint }]}>Volver</Text>
        </Pressable>
      </View>
    );
  }

  const handleDelete = () => {
    Alert.alert(
      "Eliminar documento",
      `¿Estás seguro de que querés eliminar "${doc.title}"?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            if (Platform.OS !== "web") {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            }
            setDeleting(true);
            await deleteDocument(doc.id);
            router.back();
          },
        },
      ]
    );
  };

  const handleShare = async () => {
    if (!doc.fileUri) return;
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(doc.fileUri, { dialogTitle: doc.title });
      } else {
        Alert.alert("Compartir no disponible", "Tu dispositivo no soporta compartir archivos.");
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "No se pudo compartir el archivo");
    }
  };

  const infoRows = [
    { label: "Categoría", value: cat?.label ?? "—", icon: cat?.icon ?? "folder" },
    {
      label: "Fecha de creación",
      value: new Date(doc.createdAt).toLocaleDateString("es-AR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
      icon: "calendar",
    },
    {
      label: "Última actualización",
      value: new Date(doc.updatedAt).toLocaleDateString("es-AR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
      icon: "clock",
    },
  ];

  const accentColor = cat?.color ?? colors.tint;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) + 16,
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {doc.title}
        </Text>
        <View style={{ flexDirection: "row", gap: 4 }}>
          {doc.fileUri && (
            <Pressable
              onPress={handleShare}
              style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Feather name="share-2" size={20} color={colors.tint} />
            </Pressable>
          )}
          <Pressable
            onPress={handleDelete}
            disabled={deleting}
            style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Feather name="trash-2" size={20} color={colors.danger} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 32 },
        ]}
      >
        {/* ── Hero ── */}
        <View style={[styles.hero, { backgroundColor: accentColor + "18" }]}>
          <View style={[styles.heroIcon, { backgroundColor: accentColor }]}>
            <Feather name={(cat?.icon as any) ?? "file"} size={36} color="#fff" />
          </View>
          <Text style={[styles.heroTitle, { color: colors.text }]}>{doc.title}</Text>
          {doc.description ? (
            <Text style={[styles.heroDesc, { color: colors.textSecondary }]}>{doc.description}</Text>
          ) : null}
        </View>

        {/* ── Image Preview ── */}
        {hasImage && doc.fileUri && (
          <Pressable
            onPress={() => setImgModalVisible(true)}
            style={({ pressed }) => ({ opacity: pressed ? 0.95 : 1 })}
          >
            <View style={[styles.imageCard, { borderColor: colors.border, backgroundColor: colors.backgroundCard }]}>
              <Image
                source={{ uri: doc.fileUri }}
                style={styles.previewImage}
                contentFit="cover"
                transition={200}
              />
              <View style={styles.imageOverlay}>
                <View style={styles.zoomBadge}>
                  <Feather name="zoom-in" size={14} color="#fff" />
                  <Text style={styles.zoomText}>Tocá para ampliar</Text>
                </View>
              </View>
            </View>
          </Pressable>
        )}

        {/* ── File badge + open button (for non-image files) ── */}
        {doc.fileUri && !hasImage && (
          <Pressable
            onPress={handleShare}
            style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
          >
            <View style={[styles.fileBadge, { backgroundColor: colors.backgroundCard, borderColor: accentColor + "50" }]}>
              <View style={[styles.fileIconCircle, { backgroundColor: accentColor + "18" }]}>
                <Feather name="file-text" size={22} color={accentColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fileNameText, { color: colors.text }]} numberOfLines={1}>
                  {doc.fileName ?? "Archivo adjunto"}
                </Text>
                <Text style={[styles.fileOpenHint, { color: accentColor }]}>
                  Tocá para abrir o compartir
                </Text>
              </View>
              <Feather name="external-link" size={18} color={accentColor} />
            </View>
          </Pressable>
        )}

        {/* ── Details ── */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Detalles</Text>
        <View style={[styles.card, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
          {infoRows.map((row, i) => (
            <View key={row.label}>
              <View style={styles.infoRow}>
                <View style={[styles.infoIcon, { backgroundColor: accentColor + "18" }]}>
                  <Feather name={row.icon as any} size={15} color={accentColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{row.label}</Text>
                  <Text style={[styles.infoValue, { color: colors.text }]}>{row.value}</Text>
                </View>
              </View>
              {i < infoRows.length - 1 && (
                <View style={[styles.separator, { backgroundColor: colors.border }]} />
              )}
            </View>
          ))}
        </View>

        {/* ── Security note ── */}
        <View style={[styles.securityNote, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
          <Feather name="lock" size={16} color={colors.tint} />
          <Text style={[styles.securityText, { color: colors.textSecondary }]}>
            Almacenado en tu nodo de identidad · Cifrado AES-256
          </Text>
        </View>

        {/* ── Actions ── */}
        {doc.fileUri && (
          <Pressable
            onPress={handleShare}
            style={({ pressed }) => [
              styles.actionBtn,
              { backgroundColor: colors.tint + "12", borderColor: colors.tint + "40", opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Feather name="share-2" size={18} color={colors.tint} />
            <Text style={[styles.actionBtnText, { color: colors.tint }]}>Compartir documento</Text>
          </Pressable>
        )}

        <Pressable
          onPress={handleDelete}
          disabled={deleting}
          style={({ pressed }) => [
            styles.actionBtn,
            { backgroundColor: colors.danger + "12", borderColor: colors.danger + "40", opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Feather name="trash-2" size={18} color={colors.danger} />
          <Text style={[styles.actionBtnText, { color: colors.danger }]}>
            {deleting ? "Eliminando..." : "Eliminar documento"}
          </Text>
        </Pressable>
      </ScrollView>

      {/* ── Image Modal (zoom viewer) ── */}
      {hasImage && doc.fileUri && (
        <Modal
          visible={imgModalVisible}
          animationType="fade"
          transparent
          onRequestClose={() => setImgModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <Pressable
              style={styles.modalClose}
              onPress={() => setImgModalVisible(false)}
            >
              <View style={styles.modalCloseBtn}>
                <Feather name="x" size={22} color="#fff" />
              </View>
            </Pressable>
            <ScrollView
              maximumZoomScale={5}
              minimumZoomScale={1}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              centerContent
              style={{ flex: 1 }}
            >
              <Image
                source={{ uri: doc.fileUri }}
                style={{ width: SCREEN_W, height: SCREEN_H * 0.85 }}
                contentFit="contain"
              />
            </ScrollView>
            <Text style={styles.zoomHint}>Usá dos dedos para ampliar · Tocá ✕ para cerrar</Text>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontSize: 17, fontFamily: "Inter_600SemiBold", textAlign: "center", marginHorizontal: 8 },
  scroll: { padding: 20, gap: 16 },
  hero: {
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
    gap: 12,
  },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  heroDesc: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },

  imageCard: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    height: 240,
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  imageOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.35)",
    paddingVertical: 10,
    alignItems: "center",
  },
  zoomBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  zoomText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },

  fileBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  fileIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  fileNameText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  fileOpenHint: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },

  sectionTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, textTransform: "uppercase" },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  infoLabel: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 1 },
  infoValue: { fontSize: 14, fontFamily: "Inter_500Medium" },
  separator: { height: 1, marginLeft: 62 },

  securityNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  securityText: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },

  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  actionBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
  },
  modalClose: {
    position: "absolute",
    top: 56,
    right: 20,
    zIndex: 100,
  },
  modalCloseBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  zoomHint: {
    textAlign: "center",
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    paddingBottom: 24,
    paddingTop: 8,
  },
  notFound: { fontSize: 16, fontFamily: "Inter_500Medium", marginBottom: 12 },
  back: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  deleteBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
