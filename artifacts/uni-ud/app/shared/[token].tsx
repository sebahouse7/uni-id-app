import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { Radii, Shadows, Spacing } from "@/constants/design";
import { CATEGORIES } from "@/context/IdentityContext";
import { apiShareView } from "@/lib/apiClient";

interface SharedData {
  label: string | null;
  owner: { name: string };
  documents: {
    id: string;
    title: string;
    category: string;
    description: string | null;
    tags: string[] | null;
    created_at: string;
  }[];
  expiresAt: string;
  accessCount: number;
}

export default function SharedView() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;

  const [data, setData] = useState<SharedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setError("Token inválido"); setLoading(false); return; }
    apiShareView(token as string)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const timeRemaining = () => {
    if (!data) return "";
    const diff = new Date(data.expiresAt).getTime() - Date.now();
    if (diff <= 0) return "Expirado";
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins} min restantes`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h restantes`;
    return `${Math.floor(hours / 24)}d restantes`;
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color="#1A6FE8" />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          Verificando identidad...
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <LinearGradient colors={["#E5353520", "#E5353510"]} style={styles.errorIcon}>
          <Feather name="shield-off" size={36} color="#E53535" />
        </LinearGradient>
        <Text style={[styles.errorTitle, { color: colors.text }]}>Enlace no disponible</Text>
        <Text style={[styles.errorText, { color: colors.textSecondary }]}>{error}</Text>
        <View style={[styles.errorNote, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
          <Feather name="info" size={14} color={colors.textSecondary} />
          <Text style={[styles.errorNoteText, { color: colors.textSecondary }]}>
            Este enlace puede haber expirado o sido revocado por su propietario.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={[{ flex: 1, backgroundColor: colors.background }]}
      contentContainerStyle={{
        paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) + 20,
        paddingBottom: insets.bottom + 40,
        paddingHorizontal: Spacing.md,
      }}
    >
      {/* Brand header */}
      <View style={styles.brand}>
        <LinearGradient colors={["#1A6FE8", "#0D8AEB"]} style={styles.brandIcon}>
          <Feather name="shield" size={20} color="#fff" />
        </LinearGradient>
        <View>
          <Text style={[styles.brandName, { color: colors.text }]}>uni.id</Text>
          <Text style={[styles.brandTagline, { color: colors.textSecondary }]}>
            Identidad digital verificada
          </Text>
        </View>
      </View>

      {/* Owner card */}
      <LinearGradient
        colors={isDark ? ["#0A1628", "#0D2040"] : ["#EEF4FF", "#E0ECFF"]}
        style={[styles.ownerCard, { borderColor: isDark ? "#1A3060" : "#C8D8F0" }]}
      >
        <View style={[styles.ownerAvatar, { backgroundColor: "#1A6FE8" }]}>
          <Text style={styles.ownerAvatarText}>
            {data?.owner.name.charAt(0).toUpperCase() ?? "?"}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.ownerName, { color: colors.text }]}>{data?.owner.name}</Text>
          {data?.label && (
            <Text style={[styles.ownerLabel, { color: colors.textSecondary }]}>
              {data.label}
            </Text>
          )}
        </View>
        <View style={[styles.verifiedBadge, { backgroundColor: "#38A16918" }]}>
          <Feather name="check-circle" size={13} color="#38A169" />
          <Text style={[styles.verifiedText, { color: "#38A169" }]}>Verificado</Text>
        </View>
      </LinearGradient>

      {/* Expiry info */}
      <View style={[styles.expiryRow, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
        <Feather name="clock" size={14} color={colors.textSecondary} />
        <Text style={[styles.expiryText, { color: colors.textSecondary }]}>
          {timeRemaining()} · {data?.accessCount} acceso{data?.accessCount !== 1 ? "s" : ""}
        </Text>
      </View>

      {/* Documents */}
      <Text style={[styles.docsTitle, { color: colors.text }]}>
        Documentos compartidos ({data?.documents.length ?? 0})
      </Text>

      {data?.documents.map((doc) => {
        const cat = CATEGORIES.find((c) => c.key === doc.category);
        return (
          <View
            key={doc.id}
            style={[
              styles.docCard,
              { backgroundColor: colors.backgroundCard, borderColor: colors.border },
              Shadows.sm,
            ]}
          >
            <View style={[styles.docIcon, { backgroundColor: (cat?.color ?? "#1A6FE8") + "18" }]}>
              <Feather name={(cat?.icon as any) ?? "file"} size={20} color={cat?.color ?? "#1A6FE8"} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.docTitle, { color: colors.text }]}>{doc.title}</Text>
              <View
                style={[styles.catChip, { backgroundColor: (cat?.color ?? "#1A6FE8") + "18" }]}
              >
                <Text style={[styles.catChipText, { color: cat?.color ?? "#1A6FE8" }]}>
                  {cat?.label ?? doc.category}
                </Text>
              </View>
              {doc.description && (
                <Text style={[styles.docDesc, { color: colors.textSecondary }]} numberOfLines={2}>
                  {doc.description}
                </Text>
              )}
              {doc.tags && doc.tags.length > 0 && (
                <View style={styles.tagsRow}>
                  {doc.tags.map((tag, i) => (
                    <View
                      key={i}
                      style={[styles.tag, { backgroundColor: colors.background, borderColor: colors.border }]}
                    >
                      <Text style={[styles.tagText, { color: colors.textSecondary }]}>{tag}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        );
      })}

      {/* Security footer */}
      <View style={[styles.footer, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
        <Feather name="lock" size={14} color={colors.textSecondary} />
        <Text style={[styles.footerText, { color: colors.textSecondary }]}>
          Datos compartidos con consentimiento del titular. Cifrado AES-256 · uni.id by human.id labs
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 16,
  },
  loadingText: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 8 },
  errorIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  errorTitle: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  errorText: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center" },
  errorNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 14,
    borderRadius: Radii.lg,
    borderWidth: 1,
    marginTop: 8,
  },
  errorNoteText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },

  brand: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 24 },
  brandIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  brandName: { fontSize: 18, fontFamily: "Inter_700Bold" },
  brandTagline: { fontSize: 12, fontFamily: "Inter_400Regular" },

  ownerCard: {
    borderRadius: Radii.card,
    borderWidth: 1,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 14,
  },
  ownerAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  ownerAvatarText: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold" },
  ownerName: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 2 },
  ownerLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radii.pill,
  },
  verifiedText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  expiryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radii.lg,
    borderWidth: 1,
    marginBottom: 24,
  },
  expiryText: { fontSize: 13, fontFamily: "Inter_400Regular" },

  docsTitle: { fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 12 },

  docCard: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    borderRadius: Radii.lg,
    borderWidth: 1,
    marginBottom: 10,
  },
  docIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  docTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 6 },
  catChip: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radii.pill,
    marginBottom: 6,
  },
  catChipText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  docDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radii.pill,
    borderWidth: 1,
  },
  tagText: { fontSize: 11, fontFamily: "Inter_400Regular" },

  footer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 14,
    borderRadius: Radii.lg,
    borderWidth: 1,
    marginTop: 20,
  },
  footerText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
});
