import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { CATEGORIES, useIdentity } from "@/context/IdentityContext";

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const { node, documents, updateNode } = useIdentity();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(node?.name ?? "");
  const [bio, setBio] = useState(node?.bio ?? "");

  const handleSave = async () => {
    await updateNode({ name, bio });
    setEditing(false);
  };

  const docsByCat = CATEGORIES.map((cat) => ({
    ...cat,
    count: documents.filter((d) => d.category === cat.key).length,
  })).filter((c) => c.count > 0);

  const planLabel =
    node?.networkPlan === "free"
      ? "Gratuito"
      : node?.networkPlan === "basic"
      ? "Conexión Básica"
      : "Conexión Pro";

  const infoRows = [
    {
      label: "ID único",
      value: node?.id?.slice(0, 16).toUpperCase() ?? "—",
      icon: "hash",
    },
    {
      label: "Miembro desde",
      value: node?.createdAt
        ? new Date(node.createdAt).toLocaleDateString("es-AR", {
            year: "numeric",
            month: "long",
          })
        : "—",
      icon: "calendar",
    },
    { label: "Plan", value: planLabel, icon: "star" },
  ];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) + 16,
        paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 100,
      }}
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.text }]}>Mi perfil</Text>
        <Pressable
          onPress={() => (editing ? handleSave() : setEditing(true))}
          style={({ pressed }) => [
            styles.editBtn,
            {
              backgroundColor: editing ? colors.tint : colors.backgroundCard,
              borderColor: editing ? colors.tint : colors.border,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Feather
            name={editing ? "check" : "edit-2"}
            size={16}
            color={editing ? "#fff" : colors.text}
          />
          <Text style={[styles.editBtnText, { color: editing ? "#fff" : colors.text }]}>
            {editing ? "Guardar" : "Editar"}
          </Text>
        </Pressable>
      </View>

      {/* Avatar */}
      <View style={styles.avatarSection}>
        <View style={[styles.avatar, { backgroundColor: colors.tint }]}>
          <Text style={styles.avatarLetter}>
            {(node?.name ?? "U")[0].toUpperCase()}
          </Text>
        </View>
        {editing ? (
          <TextInput
            value={name}
            onChangeText={setName}
            style={[
              styles.nameInput,
              { color: colors.text, borderBottomColor: colors.tint },
            ]}
            placeholder="Tu nombre"
            placeholderTextColor={colors.textSecondary}
            textAlign="center"
            autoFocus
          />
        ) : (
          <Text style={[styles.userName, { color: colors.text }]}>
            {node?.name ?? "Mi Identidad"}
          </Text>
        )}
        {editing ? (
          <TextInput
            value={bio}
            onChangeText={setBio}
            style={[
              styles.bioInput,
              {
                color: colors.textSecondary,
                borderColor: colors.border,
                backgroundColor: colors.backgroundCard,
              },
            ]}
            placeholder="Algo sobre vos..."
            placeholderTextColor={colors.textSecondary}
            multiline
            numberOfLines={2}
          />
        ) : node?.bio ? (
          <Text style={[styles.userBio, { color: colors.textSecondary }]}>
            {node.bio}
          </Text>
        ) : null}
      </View>

      {/* Stats */}
      <View
        style={[
          styles.statsRow,
          { backgroundColor: colors.backgroundCard, borderColor: colors.border },
        ]}
      >
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.text }]}>
            {documents.length}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
            Documentos
          </Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.text }]}>
            {docsByCat.length}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
            Categorías
          </Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text
            style={[
              styles.statValue,
              {
                color:
                  node?.networkPlan !== "free"
                    ? colors.success
                    : colors.textSecondary,
              },
            ]}
          >
            {node?.networkPlan !== "free" ? "Activa" : "Básica"}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
            Conexión
          </Text>
        </View>
      </View>

      {/* Info */}
      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Información de cuenta
      </Text>
      <View
        style={[
          styles.card,
          { backgroundColor: colors.backgroundCard, borderColor: colors.border },
        ]}
      >
        {infoRows.map((row, i) => (
          <View key={row.label}>
            <View style={styles.infoRow}>
              <View
                style={[styles.infoIcon, { backgroundColor: colors.background }]}
              >
                <Feather name={row.icon as any} size={15} color={colors.tint} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
                  {row.label}
                </Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>
                  {row.value}
                </Text>
              </View>
            </View>
            {i < infoRows.length - 1 && (
              <View
                style={[styles.separator, { backgroundColor: colors.border }]}
              />
            )}
          </View>
        ))}
      </View>

      {/* Docs by category */}
      {docsByCat.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Mis documentos por tipo
          </Text>
          <View
            style={[
              styles.card,
              { backgroundColor: colors.backgroundCard, borderColor: colors.border },
            ]}
          >
            {docsByCat.map((cat, i) => (
              <View key={cat.key}>
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: "/(tabs)/documents",
                      params: { category: cat.key },
                    })
                  }
                  style={styles.catRow}
                >
                  <View
                    style={[
                      styles.catDot,
                      { backgroundColor: cat.color + "20" },
                    ]}
                  >
                    <Feather
                      name={cat.icon as any}
                      size={15}
                      color={cat.color}
                    />
                  </View>
                  <Text style={[styles.catRowLabel, { color: colors.text }]}>
                    {cat.label}
                  </Text>
                  <Text
                    style={[styles.catRowCount, { color: colors.textSecondary }]}
                  >
                    {cat.count}
                  </Text>
                  <Feather
                    name="chevron-right"
                    size={15}
                    color={colors.textSecondary}
                  />
                </Pressable>
                {i < docsByCat.length - 1 && (
                  <View
                    style={[styles.separator, { backgroundColor: colors.border }]}
                  />
                )}
              </View>
            ))}
          </View>
        </>
      )}

      {/* Upgrade CTA */}
      {node?.networkPlan === "free" && (
        <Pressable
          onPress={() => router.push("/(tabs)/network")}
          style={({ pressed }) => [
            styles.upgradeCTA,
            { borderColor: colors.tint + "60", opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Feather name="share-2" size={20} color="#00D4FF" />
          <View style={{ flex: 1 }}>
            <Text style={styles.upgradeCTATitle}>Ampliar mi cobertura</Text>
            <Text style={styles.upgradeCTASub}>
              Usá tu identidad en bancos, hospitales, aeropuertos y más
            </Text>
          </View>
          <Feather name="arrow-right" size={18} color="#00D4FF" />
        </Pressable>
      )}

      {/* Company footer */}
      <View style={styles.companyFooter}>
        <View style={styles.companyBadge}>
          <Feather name="hexagon" size={14} color="#00D4FF" />
          <Text style={styles.companyName}>human.id labs</Text>
        </View>
        <Text style={[styles.companyTagline, { color: colors.textSecondary }]}>
          Infraestructura de identidad digital
        </Text>
        <Text style={[styles.companyVersion, { color: colors.textSecondary }]}>
          uni.id v1.0 · © 2026 human.id labs
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  editBtnText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  avatarSection: { alignItems: "center", marginBottom: 28, gap: 10 },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: { color: "#fff", fontSize: 36, fontFamily: "Inter_700Bold" },
  userName: { fontSize: 22, fontFamily: "Inter_700Bold" },
  userBio: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    paddingHorizontal: 32,
  },
  nameInput: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    borderBottomWidth: 1.5,
    paddingBottom: 4,
    minWidth: 180,
    textAlign: "center",
  },
  bioInput: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    width: "80%",
    textAlign: "center",
  },
  statsRow: {
    flexDirection: "row",
    marginHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 28,
  },
  statItem: { flex: 1, alignItems: "center", gap: 4 },
  statValue: { fontSize: 20, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  statDivider: { width: 1, marginVertical: 4 },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  card: {
    marginHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    padding: 4,
    marginBottom: 24,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
  },
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
  catRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  catDot: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  catRowLabel: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  catRowCount: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  upgradeCTA: {
    marginHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#0D1525",
  },
  upgradeCTATitle: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
  },
  upgradeCTASub: { color: "#8896B0", fontSize: 12, fontFamily: "Inter_400Regular" },
  companyFooter: {
    alignItems: "center",
    paddingVertical: 28,
    paddingHorizontal: 20,
    gap: 6,
    marginTop: 8,
  },
  companyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 4,
  },
  companyName: {
    color: "#00D4FF",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  companyTagline: { fontSize: 12, fontFamily: "Inter_400Regular" },
  companyVersion: { fontSize: 11, fontFamily: "Inter_400Regular" },
});
