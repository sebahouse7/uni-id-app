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

import Colors from "@/constants/colors";
import { CATEGORIES, Document, DocumentCategory, useIdentity } from "@/context/IdentityContext";

export default function DocumentsScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const { documents } = useIdentity();
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

  const renderDoc = ({ item }: { item: Document }) => {
    const cat = CATEGORIES.find((c) => c.key === item.category);
    return (
      <Pressable
        onPress={() => router.push({ pathname: "/document/[id]", params: { id: item.id } })}
        style={({ pressed }) => [
          styles.docCard,
          {
            backgroundColor: colors.backgroundCard,
            borderColor: colors.border,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <View style={[styles.docIcon, { backgroundColor: (cat?.color ?? "#1A6FE8") + "18" }]}>
          <Feather name={(cat?.icon as any) ?? "file"} size={22} color={cat?.color ?? "#1A6FE8"} />
        </View>
        <View style={styles.docInfo}>
          <Text style={[styles.docTitle, { color: colors.text }]} numberOfLines={1}>
            {item.title}
          </Text>
          {item.description ? (
            <Text style={[styles.docDesc, { color: colors.textSecondary }]} numberOfLines={1}>
              {item.description}
            </Text>
          ) : null}
          <Text style={[styles.docMeta, { color: colors.textSecondary }]}>
            {cat?.label} · {new Date(item.updatedAt).toLocaleDateString("es-AR")}
          </Text>
        </View>
        <Feather name="chevron-right" size={18} color={colors.textSecondary} />
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) + 16,
            backgroundColor: colors.background,
          },
        ]}
      >
        <Text style={[styles.title, { color: colors.text }]}>Documentos</Text>
        <Pressable
          onPress={() => router.push("/add-document")}
          style={({ pressed }) => [
            styles.addBtn,
            { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Feather name="plus" size={20} color="#fff" />
        </Pressable>
      </View>

      {/* Search */}
      <View style={[styles.searchWrap, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
        <Feather name="search" size={16} color={colors.textSecondary} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar documentos..."
          placeholderTextColor={colors.textSecondary}
          style={[styles.searchInput, { color: colors.text }]}
        />
        {!!search && (
          <Pressable onPress={() => setSearch("")}>
            <Feather name="x" size={16} color={colors.textSecondary} />
          </Pressable>
        )}
      </View>

      {/* Category filter */}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={[{ key: "all", label: "Todos", icon: "grid", sfIcon: "square.grid.2x2", color: "#718096" }, ...CATEGORIES]}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.catList}
        renderItem={({ item }) => {
          const isActive = selectedCat === item.key;
          return (
            <Pressable
              onPress={() => setSelectedCat(item.key as DocumentCategory | "all")}
              style={[
                styles.catChip,
                isActive
                  ? { backgroundColor: item.color, borderColor: item.color }
                  : { backgroundColor: colors.backgroundCard, borderColor: colors.border },
              ]}
            >
              <Feather
                name={item.icon as any}
                size={13}
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
            </Pressable>
          );
        }}
      />

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderDoc}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 100 },
        ]}
        scrollEnabled={!!filtered.length}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="folder" size={40} color={colors.textSecondary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Sin documentos</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {search ? "Ningún resultado para tu búsqueda" : "Tocá + para agregar un documento"}
            </Text>
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
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    padding: 0,
  },
  catList: { paddingHorizontal: 20, gap: 8, marginBottom: 16 },
  catChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  catChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  listContent: { paddingHorizontal: 20, gap: 10 },
  docCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  docIcon: {
    width: 46,
    height: 46,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  docInfo: { flex: 1 },
  docTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  docDesc: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 2 },
  docMeta: { fontSize: 11, fontFamily: "Inter_400Regular" },
  empty: { paddingTop: 60, alignItems: "center", gap: 10 },
  emptyTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
});
