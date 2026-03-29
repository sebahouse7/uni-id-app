import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
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

import { AnimatedPressable } from "@/components/ui/AnimatedPressable";
import Colors from "@/constants/colors";
import { Radii, Shadows, Spacing } from "@/constants/design";
import { CATEGORIES, useIdentity } from "@/context/IdentityContext";
import { LANGUAGES, useLanguage } from "@/context/LanguageContext";

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const { node, documents, updateNode } = useIdentity();
  const { t, lang, setLang } = useLanguage();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(node?.name ?? "");
  const [bio, setBio] = useState(node?.bio ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await updateNode({ name, bio });
    setSaving(false);
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

  const planColor =
    node?.networkPlan === "free"
      ? colors.textSecondary
      : node?.networkPlan === "basic"
      ? "#1A6FE8"
      : "#7C3AED";

  const infoRows = [
    {
      label: "ID único",
      value: node?.id?.slice(0, 16).toUpperCase() ?? "—",
      icon: "hash",
      color: "#1A6FE8",
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
      color: "#00D4FF",
    },
    {
      label: "Plan activo",
      value: planLabel,
      icon: "star",
      color: planColor,
    },
  ];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) + 12,
        paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 110,
      }}
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.text }]}>Mi perfil</Text>
        <AnimatedPressable
          onPress={() => (editing ? handleSave() : setEditing(true))}
          scale={0.92}
        >
          <View
            style={[
              styles.editBtn,
              {
                backgroundColor: editing ? colors.tint : colors.backgroundCard,
                borderColor: editing ? colors.tint : colors.border,
              },
              editing ? Shadows.colored(colors.tint) : Shadows.sm,
            ]}
          >
            <Feather
              name={editing ? (saving ? "loader" : "check") : "edit-2"}
              size={15}
              color={editing ? "#fff" : colors.text}
            />
            <Text style={[styles.editBtnText, { color: editing ? "#fff" : colors.text }]}>
              {editing ? (saving ? "Guardando..." : "Guardar") : "Editar"}
            </Text>
          </View>
        </AnimatedPressable>
      </View>

      {/* Profile Hero */}
      <View style={[styles.profileHero, { marginHorizontal: Spacing.md, marginBottom: 20 }]}>
        <LinearGradient
          colors={isDark ? ["#0D1525", "#111827"] : ["#F0F6FF", "#FFFFFF"]}
          style={[
            styles.profileHeroInner,
            { borderColor: colors.border },
            Shadows.md,
          ]}
        >
          {/* Avatar */}
          <LinearGradient
            colors={["#1A6FE8", "#0D8AEB"]}
            style={styles.avatar}
          >
            <Text style={styles.avatarLetter}>
              {(node?.name ?? "U")[0].toUpperCase()}
            </Text>
          </LinearGradient>

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
                  backgroundColor: colors.background,
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

          {/* Plan badge */}
          <View
            style={[
              styles.planBadge,
              { backgroundColor: planColor + "18", borderColor: planColor + "40" },
            ]}
          >
            <Feather
              name={
                node?.networkPlan === "pro"
                  ? "zap"
                  : node?.networkPlan === "basic"
                  ? "star"
                  : "user"
              }
              size={12}
              color={planColor}
            />
            <Text style={[styles.planBadgeText, { color: planColor }]}>{planLabel}</Text>
          </View>
        </LinearGradient>
      </View>

      {/* Stats row */}
      <View
        style={[
          styles.statsRow,
          {
            backgroundColor: colors.backgroundCard,
            borderColor: colors.border,
            marginHorizontal: Spacing.md,
            marginBottom: 24,
          },
          Shadows.sm,
        ]}
      >
        {[
          { value: String(documents.length), label: "Documentos", color: "#1A6FE8" },
          { value: String(docsByCat.length), label: "Categorías", color: "#7C3AED" },
          {
            value: node?.networkPlan !== "free" ? "Activa" : "Local",
            label: "Cobertura",
            color: node?.networkPlan !== "free" ? colors.success : colors.textSecondary,
          },
        ].map((s, i, arr) => (
          <React.Fragment key={s.label}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{s.label}</Text>
            </View>
            {i < arr.length - 1 && (
              <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            )}
          </React.Fragment>
        ))}
      </View>

      {/* Account info */}
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Información de cuenta</Text>
      <View
        style={[
          styles.card,
          { backgroundColor: colors.backgroundCard, borderColor: colors.border, marginBottom: 24 },
          Shadows.sm,
        ]}
      >
        {infoRows.map((row, i) => (
          <View key={row.label}>
            <View style={styles.infoRow}>
              <View style={[styles.infoIcon, { backgroundColor: row.color + "15" }]}>
                <Feather name={row.icon as any} size={15} color={row.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
                  {row.label}
                </Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>{row.value}</Text>
              </View>
            </View>
            {i < infoRows.length - 1 && (
              <View style={[styles.separator, { backgroundColor: colors.border }]} />
            )}
          </View>
        ))}
      </View>

      {/* Docs by category */}
      {docsByCat.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Por categoría</Text>
          <View
            style={[
              styles.card,
              { backgroundColor: colors.backgroundCard, borderColor: colors.border, marginBottom: 24 },
              Shadows.sm,
            ]}
          >
            {docsByCat.map((cat, i) => (
              <View key={cat.key}>
                <AnimatedPressable
                  onPress={() =>
                    router.push({
                      pathname: "/(tabs)/documents",
                      params: { category: cat.key },
                    })
                  }
                  scale={0.98}
                >
                  <View style={styles.catRow}>
                    <View
                      style={[styles.catDot, { backgroundColor: cat.color + "18" }]}
                    >
                      <Feather name={cat.icon as any} size={15} color={cat.color} />
                    </View>
                    <Text style={[styles.catRowLabel, { color: colors.text }]}>
                      {cat.label}
                    </Text>
                    <View style={[styles.catCountBadge, { backgroundColor: cat.color + "18" }]}>
                      <Text style={[styles.catCountBadgeText, { color: cat.color }]}>
                        {cat.count}
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={15} color={colors.textSecondary} />
                  </View>
                </AnimatedPressable>
                {i < docsByCat.length - 1 && (
                  <View style={[styles.separator, { backgroundColor: colors.border }]} />
                )}
              </View>
            ))}
          </View>
        </>
      )}

      {/* Upgrade CTA */}
      {node?.networkPlan === "free" && (
        <>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Expandir cobertura</Text>
          <AnimatedPressable
            onPress={() => router.push("/(tabs)/network")}
            style={{ marginHorizontal: Spacing.md, marginBottom: 24 }}
            scale={0.97}
          >
            <LinearGradient
              colors={isDark ? ["#0A1628", "#0D1E3D"] : ["#EEF4FF", "#E0ECFF"]}
              style={[styles.upgradeCTA, { borderColor: "#1A6FE840" }]}
            >
              <View style={[styles.upgradeIcon, { backgroundColor: "#1A6FE820" }]}>
                <Feather name="share-2" size={20} color="#00D4FF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.upgradeCTATitle, { color: colors.text }]}>
                  Ampliar mi cobertura
                </Text>
                <Text style={[styles.upgradeCTASub, { color: colors.textSecondary }]}>
                  Bancos, hospitales, aeropuertos y más
                </Text>
              </View>
              <Feather name="arrow-right" size={18} color="#00D4FF" />
            </LinearGradient>
          </AnimatedPressable>
        </>
      )}

      {/* Language selector */}
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{t.language}</Text>
      <View
        style={[
          styles.card,
          { backgroundColor: colors.backgroundCard, borderColor: colors.border, marginBottom: 24 },
          Shadows.sm,
        ]}
      >
        {LANGUAGES.map((l, i) => (
          <View key={l.code}>
            <AnimatedPressable onPress={() => setLang(l.code)} scale={0.98}>
              <View style={styles.langRow}>
                <Text style={styles.langFlag}>{l.flag}</Text>
                <Text style={[styles.langLabel, { color: colors.text, flex: 1 }]}>{l.label}</Text>
                {lang === l.code && (
                  <View style={[styles.langCheck, { backgroundColor: colors.tint + "18" }]}>
                    <Feather name="check" size={14} color={colors.tint} />
                  </View>
                )}
              </View>
            </AnimatedPressable>
            {i < LANGUAGES.length - 1 && (
              <View style={[styles.separator, { backgroundColor: colors.border }]} />
            )}
          </View>
        ))}
      </View>

      {/* Footer */}
      <View style={styles.companyFooter}>
        <View style={styles.companyBadge}>
          <Feather name="hexagon" size={14} color="#00D4FF" />
          <Text style={styles.companyName}>human.id labs</Text>
        </View>
        <Text style={[styles.companyTagline, { color: colors.textSecondary }]}>
          Infraestructura de identidad digital
        </Text>
        <Text style={[styles.companyVersion, { color: colors.textSecondary }]}>
          uni.id v1.0 · © 2026
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
    paddingHorizontal: Spacing.md,
    marginBottom: 20,
  },
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: Radii.pill,
    borderWidth: 1,
  },
  editBtnText: { fontSize: 14, fontFamily: "Inter_500Medium" },

  profileHeroInner: {
    borderRadius: Radii.card,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    gap: 10,
  },
  profileHero: {},
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  avatarLetter: { color: "#fff", fontSize: 36, fontFamily: "Inter_700Bold" },
  userName: { fontSize: 22, fontFamily: "Inter_700Bold" },
  userBio: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    paddingHorizontal: 24,
    lineHeight: 20,
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
    borderRadius: Radii.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    width: "85%",
    textAlign: "center",
  },
  planBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: Radii.pill,
    borderWidth: 1,
    marginTop: 4,
  },
  planBadgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  statsRow: {
    flexDirection: "row",
    borderRadius: Radii.lg,
    borderWidth: 1,
    padding: 16,
  },
  statItem: { flex: 1, alignItems: "center", gap: 4 },
  statValue: { fontSize: 20, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  statDivider: { width: 1, marginVertical: 4 },

  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    paddingHorizontal: Spacing.md,
    marginBottom: 10,
  },
  card: {
    marginHorizontal: Spacing.md,
    borderRadius: Radii.lg,
    borderWidth: 1,
    overflow: "hidden",
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
    borderRadius: Radii.sm + 2,
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
    width: 36,
    height: 36,
    borderRadius: Radii.sm + 2,
    alignItems: "center",
    justifyContent: "center",
  },
  catRowLabel: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  catCountBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: Radii.pill,
  },
  catCountBadgeText: { fontSize: 12, fontFamily: "Inter_700Bold" },

  upgradeCTA: {
    borderRadius: Radii.xl,
    borderWidth: 1,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  upgradeIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  upgradeCTATitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  upgradeCTASub: { fontSize: 12, fontFamily: "Inter_400Regular" },

  langRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  langFlag: { fontSize: 22 },
  langLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  langCheck: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },

  companyFooter: {
    alignItems: "center",
    paddingVertical: 28,
    paddingHorizontal: Spacing.md,
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
