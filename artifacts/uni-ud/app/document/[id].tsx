import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { CATEGORIES, useIdentity } from "@/context/IdentityContext";

export default function DocumentDetailScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const { id } = useLocalSearchParams<{ id: string }>();
  const { documents, deleteDocument } = useIdentity();
  const [deleting, setDeleting] = useState(false);

  const doc = documents.find((d) => String(d.id) === String(id));
  const cat = doc ? CATEGORIES.find((c) => c.key === doc.category) : null;

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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
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
        <Pressable
          onPress={handleDelete}
          disabled={deleting}
          style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Feather name="trash-2" size={20} color={colors.danger} />
        </Pressable>
      </View>

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 32 },
        ]}
      >
        {/* Hero */}
        <View style={[styles.hero, { backgroundColor: (cat?.color ?? "#1A6FE8") + "18" }]}>
          <View style={[styles.heroIcon, { backgroundColor: cat?.color ?? "#1A6FE8" }]}>
            <Feather name={(cat?.icon as any) ?? "file"} size={36} color="#fff" />
          </View>
          <Text style={[styles.heroTitle, { color: colors.text }]}>{doc.title}</Text>
          {doc.description ? (
            <Text style={[styles.heroDesc, { color: colors.textSecondary }]}>{doc.description}</Text>
          ) : null}
        </View>

        {/* File badge */}
        {doc.fileName && (
          <View style={[styles.fileBadge, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
            <Feather name="paperclip" size={16} color={cat?.color ?? colors.tint} />
            <Text style={[styles.fileNameText, { color: colors.text }]} numberOfLines={1}>
              {doc.fileName}
            </Text>
          </View>
        )}

        {/* Details */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Detalles</Text>
        <View style={[styles.card, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
          {infoRows.map((row, i) => (
            <View key={row.label}>
              <View style={styles.infoRow}>
                <View style={[styles.infoIcon, { backgroundColor: (cat?.color ?? colors.tint) + "18" }]}>
                  <Feather name={row.icon as any} size={15} color={cat?.color ?? colors.tint} />
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

        {/* Security note */}
        <View style={[styles.securityNote, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
          <Feather name="lock" size={16} color={colors.tint} />
          <Text style={[styles.securityText, { color: colors.textSecondary }]}>
            Este documento está almacenado de forma segura en tu nodo de identidad uni.id
          </Text>
        </View>

        {/* Delete button */}
        <Pressable
          onPress={handleDelete}
          disabled={deleting}
          style={({ pressed }) => [
            styles.deleteBtn,
            {
              backgroundColor: colors.danger + "15",
              borderColor: colors.danger + "40",
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <Feather name="trash-2" size={18} color={colors.danger} />
          <Text style={[styles.deleteBtnText, { color: colors.danger }]}>
            {deleting ? "Eliminando..." : "Eliminar documento"}
          </Text>
        </Pressable>
      </ScrollView>
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
  scroll: { padding: 20, gap: 20 },
  hero: {
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
    gap: 14,
  },
  heroIcon: {
    width: 76,
    height: 76,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  heroTitle: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  heroDesc: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  fileBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  fileNameText: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 4,
  },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14 },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  infoLabel: { fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 2 },
  infoValue: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  separator: { height: 1, marginHorizontal: 14 },
  securityNote: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "flex-start",
  },
  securityText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  deleteBtnText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  notFound: { fontSize: 18, fontFamily: "Inter_600SemiBold", marginBottom: 12 },
  back: { fontSize: 15, fontFamily: "Inter_500Medium" },
});
