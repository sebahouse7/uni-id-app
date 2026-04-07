import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AnimatedPressable } from "@/components/ui/AnimatedPressable";
import { PaywallGate } from "@/components/ui/PaywallGate";
import Colors from "@/constants/colors";
import { Radii, Shadows, Spacing } from "@/constants/design";
import { CATEGORIES, Document, DocumentCategory, useIdentity } from "@/context/IdentityContext";

const FREE_DOC_LIMIT = 3;

export default function DocumentsScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const { documents, node } = useIdentity();

  const isFree = !node?.networkPlan || node.networkPlan === "free";
  const isAtLimit = isFree && documents.length >= FREE_DOC_LIMIT;
  const params = useLocalSearchParams<{ category?: string }>();
  const [selectedCat, setSelectedCat] = useState<DocumentCategory | "all">(
    (params.category as DocumentCategory) ?? "all"
  );
  const [search, setSearch] = useState("");

  const filtered = documents.filter((d) => {
    const matchCat = selectedCat === "all" || d.category === selectedCat;
    const matchSearch =
      !search ||
      d.title.toLowerCase().includes(search.toLowerCase()) ||
      (d.description ?? "").toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const allCategories = [
    {
      key: "all",
      label: "Todos",
      icon: "grid",
      sfIcon: "square.grid.2x2",
      color: "#718096",
      count: documents.length,
    },
    ...CATEGORIES.map((c) => ({
      ...c,
      count: documents.filter((d) => d.category === c.key).length,
    })),
  ];

  const renderDoc = ({ item, index }: { item: Document; index: number }) => {
    const cat = CATEGORIES.find((c) => c.key === item.category);
    return (
      <AnimatedPressable
        onPress={() => router.push({ pathname: "/document/[id]", params: { id: item.id } })}
        style={{ marginBottom: index < filtered.length - 1 ? 10 : 0 }}
        scale={0.97}
      >
        <View
          style={[
            styles.docCard,
            {
              backgroundColor: colors.backgroundCard,
              borderColor: colors.border,
            },
            Shadows.sm,
          ]}
        >
          <View
            style={[
              styles.docIcon,
              { backgroundColor: (cat?.color ?? "#1A6FE8") + (isDark ? "25" : "18") },
            ]}
          >
            <Feather
              name={(cat?.icon as any) ?? "file"}
              size={22}
              color={cat?.color ?? "#1A6FE8"}
            />
          </View>
          <View style={styles.docInfo}>
            <Text style={[styles.docTitle, { color: colors.text }]} numberOfLines={1}>
              {item.title}
            </Text>
            {item.description ? (
              <Text
                style={[styles.docDesc, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                {item.description}
              </Text>
            ) : null}
            <View style={styles.docMeta}>
              <View
                style={[styles.catChipSmall, { backgroundColor: (cat?.color ?? "#1A6FE8") + "18" }]}
              >
                <Text style={[styles.catChipSmallText, { color: cat?.color ?? "#1A6FE8" }]}>
                  {cat?.label ?? "Documento"}
                </Text>
              </View>
              <Text style={[styles.docDate, { color: colors.textSecondary }]}>
                {new Date(item.updatedAt).toLocaleDateString("es-AR", {
                  day: "numeric",
                  month: "short",
                })}
              </Text>
            </View>
          </View>
          <View style={[styles.docChevron, { backgroundColor: colors.background }]}>
            <Feather name="chevron-right" size={15} color={colors.textSecondary} />
          </View>
        </View>
      </AnimatedPressable>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) + 12,
            backgroundColor: colors.background,
          },
        ]}
      >
        <View>
          <Text style={[styles.title, { color: colors.text }]}>Documentos</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {documents.length} documento{documents.length !== 1 ? "s" : ""} guardado
            {documents.length !== 1 ? "s" : ""}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <AnimatedPressable onPress={() => router.push("/share" as any)} scale={0.9}>
            <View style={[styles.addBtn, { backgroundColor: colors.backgroundCard, borderColor: colors.border, borderWidth: 1 }]}>
              <Feather name="share-2" size={18} color={colors.text} />
            </View>
          </AnimatedPressable>
          <AnimatedPressable
            onPress={() => isAtLimit ? router.push("/(tabs)/network") : router.push("/add-document")}
            scale={0.9}
          >
            <View style={[styles.addBtn, { backgroundColor: isAtLimit ? colors.backgroundCard : colors.tint, borderColor: isAtLimit ? "#F59E0B" : undefined, borderWidth: isAtLimit ? 1.5 : 0 }, !isAtLimit && Shadows.colored(colors.tint)]}>
              <Feather name={isAtLimit ? "lock" : "plus"} size={20} color={isAtLimit ? "#F59E0B" : "#fff"} />
            </View>
          </AnimatedPressable>
        </View>
      </View>

      {/* Search bar */}
      <View
        style={[
          styles.searchWrap,
          {
            backgroundColor: colors.backgroundCard,
            borderColor: colors.border,
          },
        ]}
      >
        <Feather name="search" size={17} color={colors.textSecondary} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar documentos..."
          placeholderTextColor={colors.textSecondary}
          style={[styles.searchInput, { color: colors.text }]}
          returnKeyType="search"
        />
        {!!search && (
          <Pressable
            onPress={() => setSearch("")}
            style={[styles.clearBtn, { backgroundColor: colors.background }]}
          >
            <Feather name="x" size={13} color={colors.textSecondary} />
          </Pressable>
        )}
      </View>

      {/* Category filter */}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={allCategories}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.catList}
        renderItem={({ item }) => {
          const isActive = selectedCat === item.key;
          return (
            <AnimatedPressable
              onPress={() => setSelectedCat(item.key as DocumentCategory | "all")}
              scale={0.93}
            >
              <View
                style={[
                  styles.catChip,
                  isActive
                    ? { backgroundColor: item.color, borderColor: item.color }
                    : { backgroundColor: colors.backgroundCard, borderColor: colors.border },
                ]}
              >
                <Feather
                  name={item.icon as any}
                  size={14}
                  color={isActive ? "#fff" : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.catChipText,
                    { color: isActive ? "#fff" : colors.textSecondary },
                  ]}
                >
                  {item.label}
                </Text>
                {item.count > 0 && (
                  <View
                    style={[
                      styles.chipCount,
                      {
                        backgroundColor: isActive
                          ? "rgba(255,255,255,0.25)"
                          : colors.background,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipCountText,
                        { color: isActive ? "#fff" : colors.textSecondary },
                      ]}
                    >
                      {item.count}
                    </Text>
                  </View>
                )}
              </View>
            </AnimatedPressable>
          );
        }}
      />

      {/* Free plan banner */}
      {isFree && documents.length > 0 && (
        <PaywallGate
          compact
          limitReached={isAtLimit}
          currentCount={documents.length}
          maxCount={FREE_DOC_LIMIT}
          feature="backup en la nube"
        />
      )}

      {/* Document list */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderDoc}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 110 },
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View
              style={[styles.emptyIconWrap, { backgroundColor: colors.backgroundCard }]}
            >
              <Feather name="folder" size={32} color={colors.textSecondary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {search ? "Sin resultados" : "Sin documentos"}
            </Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {search
                ? `No encontramos nada para "${search}"`
                : "Tocá + para agregar tu primer documento"}
            </Text>
            {!search && (
              <AnimatedPressable
                onPress={() => router.push("/add-document")}
                scale={0.95}
                style={{ marginTop: 8 }}
              >
                <View style={[styles.emptyBtn, { backgroundColor: colors.tint }]}>
                  <Feather name="plus" size={16} color="#fff" />
                  <Text style={styles.emptyBtnText}>Agregar documento</Text>
                </View>
              </AnimatedPressable>
            )}
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: Radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: Spacing.md,
    marginBottom: 12,
    borderRadius: Radii.lg,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    padding: 0,
  },
  clearBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  catList: { paddingHorizontal: Spacing.md, gap: 10, marginBottom: 14, paddingRight: Spacing.md },
  catChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: Radii.pill,
    borderWidth: 1,
  },
  catChipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  chipCount: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  chipCountText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  listContent: { paddingHorizontal: Spacing.md },
  docCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderRadius: Radii.lg,
    borderWidth: 1,
  },
  docIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  docInfo: { flex: 1, gap: 3 },
  docTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  docDesc: { fontSize: 13, fontFamily: "Inter_400Regular" },
  docMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 3 },
  catChipSmall: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radii.pill,
  },
  catChipSmallText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  docDate: { fontSize: 11, fontFamily: "Inter_400Regular" },
  docChevron: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: { paddingTop: 60, alignItems: "center", gap: 12, paddingHorizontal: 32 },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: Radii.pill,
  },
  emptyBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
