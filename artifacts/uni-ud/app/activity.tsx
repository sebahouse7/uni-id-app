import { Feather } from "@expo/vector-icons";
import * as ClipboardLib from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Modal,
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
import { Radii, Shadows } from "@/constants/design";
import {
  apiGetActivityDetail,
  apiGetActivityLogs,
  ActivityLogFilter,
} from "@/lib/apiClient";

// ── Config ─────────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  share:   "Identidad compartida",
  verify:  "Verificación",
  receive: "Solicitud recibida",
  sign:    "Documento firmado",
  login:   "Inicio de sesión",
  payment: "Pago / Suscripción",
  offline: "Paquete offline generado",
};

const ACTION_ICONS: Record<string, string> = {
  share:   "share-2",
  verify:  "check-circle",
  receive: "inbox",
  sign:    "pen-tool",
  login:   "log-in",
  payment: "credit-card",
  offline: "wifi-off",
};

const ACTION_COLORS: Record<string, string> = {
  share:   "#1A6FE8",
  verify:  "#10B981",
  receive: "#7C3AED",
  sign:    "#F59E0B",
  login:   "#00D4FF",
  payment: "#EC4899",
  offline: "#F97316",
};

const RESULT_CONFIG: Record<string, { label: string; color: string }> = {
  success:  { label: "Exitoso",  color: "#10B981" },
  rejected: { label: "Rechazado", color: "#E53E3E" },
  pending:  { label: "Pendiente", color: "#F59E0B" },
};

const TRUST_CONFIG: Record<string, { label: string; color: string }> = {
  high:   { label: "Confianza alta",   color: "#10B981" },
  medium: { label: "Confianza media",  color: "#F59E0B" },
  low:    { label: "Confianza baja",   color: "#E53E3E" },
};

const FILTER_TYPES = [
  { id: "", label: "Todo" },
  { id: "share",   label: "Compartido" },
  { id: "offline", label: "Offline" },
  { id: "sign",    label: "Firmas" },
  { id: "verify",  label: "Verificaciones" },
  { id: "login",   label: "Logins" },
  { id: "payment", label: "Pagos" },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(ts: string): string {
  const diffMs = Date.now() - new Date(ts).getTime();
  const mins  = Math.floor(diffMs / 60000);
  if (mins < 1)    return "hace un momento";
  if (mins < 60)   return `hace ${mins} min`;
  if (mins < 1440) return `hace ${Math.floor(mins / 60)}h`;
  return `hace ${Math.floor(mins / 1440)}d`;
}

function exactTime(ts: string): string {
  return new Date(ts).toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

// ── Detail Modal ─────────────────────────────────────────────────────────────

function DetailModal({
  id,
  visible,
  onClose,
  isDark,
  colors,
}: {
  id: string;
  visible: boolean;
  onClose: () => void;
  isDark: boolean;
  colors: any;
}) {
  const [entry, setEntry] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!visible || !id) return;
    setLoading(true);
    setEntry(null);
    apiGetActivityDetail(id)
      .then(setEntry)
      .finally(() => setLoading(false));
  }, [visible, id]);

  const actionColor = entry ? (ACTION_COLORS[entry.action_type] ?? "#1A6FE8") : "#1A6FE8";
  const resultCfg   = entry ? (RESULT_CONFIG[entry.result]   ?? RESULT_CONFIG.success)  : null;
  const trustCfg    = entry?.trust_level ? (TRUST_CONFIG[entry.trust_level] ?? null)      : null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[dm.root, { backgroundColor: isDark ? "#060B18" : "#F0F4FF" }]}>
        <View style={[dm.header, { borderBottomColor: isDark ? "#1A2540" : "#E0E8F8" }]}>
          <Text style={[dm.title, { color: colors.text }]}>Detalle del evento</Text>
          <Pressable onPress={onClose} hitSlop={10} style={dm.closeBtn}>
            <Feather name="x" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        {loading ? (
          <View style={dm.loadingWrap}>
            <ActivityIndicator color="#1A6FE8" size="large" />
          </View>
        ) : !entry ? (
          <View style={dm.loadingWrap}>
            <Text style={{ color: colors.textSecondary }}>Evento no encontrado</Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, gap: 16 }}>

            {/* Action header */}
            <LinearGradient colors={["#0F2040", "#0A1528"]} style={dm.actionHeader}>
              <View style={[dm.actionIcon, { backgroundColor: actionColor + "22" }]}>
                <Feather name={ACTION_ICONS[entry.action_type] as any ?? "activity"} size={20} color={actionColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={dm.actionLabel}>{ACTION_LABELS[entry.action_type] ?? entry.action_type}</Text>
                <Text style={dm.actionTime}>{exactTime(entry.created_at)}</Text>
              </View>
              {resultCfg && (
                <View style={[dm.resultBadge, { backgroundColor: resultCfg.color + "20", borderColor: resultCfg.color + "40" }]}>
                  <Text style={[dm.resultText, { color: resultCfg.color }]}>{resultCfg.label}</Text>
                </View>
              )}
            </LinearGradient>

            {/* Trust level */}
            {trustCfg && (
              <View style={[dm.card, { backgroundColor: trustCfg.color + "14", borderColor: trustCfg.color + "30" }]}>
                <Feather name="shield" size={14} color={trustCfg.color} />
                <Text style={[dm.cardText, { color: trustCfg.color }]}>{trustCfg.label}</Text>
              </View>
            )}

            {/* Data shared */}
            {entry.data_shared?.length > 0 && (
              <View style={[dm.section, { backgroundColor: isDark ? "#0D1525" : "#fff", borderColor: isDark ? "#1A2540" : "#E0E8F8" }]}>
                <Text style={[dm.sectionTitle, { color: colors.text }]}>Datos compartidos</Text>
                <View style={dm.tagsWrap}>
                  {entry.data_shared.map((field: string) => (
                    <View key={field} style={[dm.tag, { backgroundColor: "#1A6FE818", borderColor: "#1A6FE840" }]}>
                      <Text style={dm.tagText}>{field}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Meta info */}
            <View style={[dm.section, { backgroundColor: isDark ? "#0D1525" : "#fff", borderColor: isDark ? "#1A2540" : "#E0E8F8" }]}>
              <Text style={[dm.sectionTitle, { color: colors.text }]}>Información del evento</Text>
              {[
                { k: "Acción",    v: ACTION_LABELS[entry.action_type] ?? entry.action_type },
                { k: "Contexto",  v: entry.context  ?? "—" },
                { k: "Destino",   v: entry.target   ?? "—" },
                { k: "Resultado", v: resultCfg?.label ?? entry.result },
                { k: "IP",        v: entry.ip        ?? "—" },
                { k: "Dispositivo", v: entry.device  ?? "—" },
                { k: "Fecha exacta", v: exactTime(entry.created_at) },
              ].map(({ k, v }, i, arr) => (
                <View
                  key={k}
                  style={[
                    dm.metaRow,
                    i < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: isDark ? "#1A2540" : "#E8EEF8" },
                  ]}
                >
                  <Text style={[dm.metaKey, { color: colors.textSecondary }]}>{k}</Text>
                  <Text style={[dm.metaVal, { color: colors.text }]}>{v}</Text>
                </View>
              ))}
            </View>

            {/* Hash */}
            {entry.hash && (
              <View style={[dm.section, { backgroundColor: isDark ? "#0D1525" : "#fff", borderColor: isDark ? "#1A2540" : "#E0E8F8" }]}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={[dm.sectionTitle, { color: colors.text }]}>Hash</Text>
                  <Pressable
                    onPress={() => {
                      ClipboardLib.setStringAsync(entry.hash);
                      Alert.alert("Copiado", "Hash copiado al portapapeles");
                    }}
                    hitSlop={8}
                  >
                    <Feather name="copy" size={14} color={colors.textSecondary} />
                  </Pressable>
                </View>
                <Text style={[dm.mono, { color: "#00FF88" }]} numberOfLines={3}>{entry.hash}</Text>
              </View>
            )}

            {/* Signature */}
            {entry.signature && (
              <View style={[dm.section, { backgroundColor: isDark ? "#0D1525" : "#fff", borderColor: isDark ? "#1A2540" : "#E0E8F8" }]}>
                <Text style={[dm.sectionTitle, { color: colors.text }]}>Firma</Text>
                <Text style={[dm.mono, { color: "#1A6FE8" }]} numberOfLines={2}>{entry.signature.slice(0, 64)}…</Text>
              </View>
            )}

            {/* Footer note */}
            <View style={[dm.noteCard, { backgroundColor: "#1A6FE814", borderColor: "#1A6FE830" }]}>
              <Feather name="info" size={12} color="#1A6FE8" />
              <Text style={dm.noteText}>
                Este evento está registrado de forma permanente y verificable. Todo lo que pasa con tu identidad queda registrado, firmado y verificable.
              </Text>
            </View>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const dm = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, borderBottomWidth: 1,
  },
  title: { fontSize: 17, fontFamily: "Inter_700Bold" },
  closeBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  actionHeader: {
    flexDirection: "row", alignItems: "center", gap: 14,
    borderRadius: 16, padding: 16,
  },
  actionIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
  actionTime: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.55)", marginTop: 3 },
  resultBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  resultText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  card: {
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: 12, borderRadius: 12, borderWidth: 1,
  },
  cardText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  section: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  sectionTitle: { fontSize: 13, fontFamily: "Inter_700Bold" },
  tagsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  tagText: { fontSize: 12, fontFamily: "Inter_500Medium", color: "#1A6FE8" },
  metaRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    paddingVertical: 8, gap: 12,
  },
  metaKey: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  metaVal: { fontSize: 12, fontFamily: "Inter_600SemiBold", flex: 2, textAlign: "right" },
  mono: { fontSize: 11, fontFamily: "Inter_400Regular", letterSpacing: 0.5, lineHeight: 18 },
  noteCard: {
    flexDirection: "row", gap: 8, alignItems: "flex-start",
    borderRadius: 12, borderWidth: 1, padding: 12,
  },
  noteText: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#1A6FE8", flex: 1, lineHeight: 16 },
});

// ── Main Activity Screen ───────────────────────────────────────────────────

export default function ActivityScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();

  const [entries, setEntries]     = useState<any[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore]     = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [filterType, setFilterType] = useState("");
  const [search, setSearch]         = useState("");
  const [searchApplied, setSearchApplied] = useState("");

  const [detailId, setDetailId]   = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const offsetRef = useRef(0);

  const load = useCallback(async (reset = false) => {
    if (reset) { setLoading(true); offsetRef.current = 0; }
    try {
      const filter: ActivityLogFilter = {
        limit: 25,
        offset: offsetRef.current,
      };
      if (filterType) filter.type = filterType;
      if (searchApplied) filter.context = searchApplied;

      const res = await apiGetActivityLogs(filter);
      if (reset) {
        setEntries(res.data);
      } else {
        setEntries((prev) => [...prev, ...res.data]);
      }
      setTotal(res.total);
      setHasMore(res.hasMore);
      offsetRef.current += res.data.length;
    } catch {
      // silencioso
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [filterType, searchApplied]);

  useEffect(() => { load(true); }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load(true);
  };

  const loadMore = () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    load(false);
  };

  const applySearch = () => {
    setSearchApplied(search.trim());
    load(true);
  };

  const openDetail = (id: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDetailId(id);
    setShowDetail(true);
  };

  // ── Render item ──────────────────────────────────────────────────────────

  const renderItem = ({ item, index }: { item: any; index: number }) => {
    const actionColor  = ACTION_COLORS[item.action_type]  ?? "#1A6FE8";
    const actionLabel  = ACTION_LABELS[item.action_type]  ?? item.action_type;
    const actionIcon   = ACTION_ICONS[item.action_type]   ?? "activity";
    const resultCfg    = RESULT_CONFIG[item.result]       ?? RESULT_CONFIG.success;
    const dataFields   = Array.isArray(item.data_shared) ? item.data_shared : [];

    return (
      <Pressable
        onPress={() => openDetail(item.id)}
        style={({ pressed }) => [
          s.item,
          {
            backgroundColor: isDark ? "#0D1525" : "#fff",
            borderColor: isDark ? "#1A2540" : "#E8EEF8",
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        {/* Icon */}
        <View style={[s.itemIcon, { backgroundColor: actionColor + "18" }]}>
          <Feather name={actionIcon as any} size={18} color={actionColor} />
        </View>

        {/* Content */}
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={[s.itemLabel, { color: colors.text }]} numberOfLines={1}>
              {actionLabel}
            </Text>
            <View style={[s.resultPill, { backgroundColor: resultCfg.color + "18", borderColor: resultCfg.color + "30" }]}>
              <Text style={[s.resultPillText, { color: resultCfg.color }]}>{resultCfg.label}</Text>
            </View>
          </View>

          {(item.context || item.target) && (
            <Text style={[s.itemSub, { color: colors.textSecondary }]} numberOfLines={1}>
              {[item.context, item.target].filter(Boolean).join(" · ")}
            </Text>
          )}

          {dataFields.length > 0 && (
            <View style={s.fieldTags}>
              {dataFields.slice(0, 4).map((f: string) => (
                <View key={f} style={[s.fieldTag, { backgroundColor: actionColor + "15" }]}>
                  <Text style={[s.fieldTagText, { color: actionColor }]}>{f}</Text>
                </View>
              ))}
              {dataFields.length > 4 && (
                <Text style={[s.fieldTagText, { color: colors.textSecondary }]}>+{dataFields.length - 4}</Text>
              )}
            </View>
          )}

          <Text style={[s.itemTime, { color: colors.textSecondary }]}>
            {relativeTime(item.created_at)}
          </Text>
        </View>

        <Feather name="chevron-right" size={14} color={colors.textSecondary} />
      </Pressable>
    );
  };

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <View style={[s.root, { backgroundColor: isDark ? "#060B18" : "#F0F4FF" }]}>

      {/* Header */}
      <LinearGradient
        colors={isDark ? ["#0A1528", "#060B18"] : ["#F0F4FF", "#EEF3FF"]}
        style={[s.header, { paddingTop: insets.top + 12 }]}
      >
        <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={20} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[s.headerTitle, { color: colors.text }]}>Registro de actividad</Text>
          <Text style={[s.headerSub, { color: colors.textSecondary }]}>
            {total} evento{total !== 1 ? "s" : ""} · Todo queda registrado y verificable
          </Text>
        </View>
      </LinearGradient>

      {/* Search bar */}
      <View style={[s.searchRow, { backgroundColor: isDark ? "#080F1E" : "#fff", borderBottomColor: isDark ? "#1A2540" : "#E8EEF8" }]}>
        <View style={[s.searchInput, { backgroundColor: isDark ? "#0D1525" : "#F5F8FF", borderColor: isDark ? "#1A2540" : "#E0E8F8" }]}>
          <Feather name="search" size={14} color={colors.textSecondary} />
          <TextInput
            placeholder="Buscar por contexto…"
            placeholderTextColor={colors.textSecondary}
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={applySearch}
            returnKeyType="search"
            style={[s.searchText, { color: colors.text }]}
          />
          {search.length > 0 && (
            <Pressable onPress={() => { setSearch(""); setSearchApplied(""); }} hitSlop={8}>
              <Feather name="x" size={13} color={colors.textSecondary} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Filter chips */}
      <View style={[s.filterWrap, { backgroundColor: isDark ? "#080F1E" : "#fff", borderBottomColor: isDark ? "#1A2540" : "#E8EEF8" }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterScroll}>
          {FILTER_TYPES.map(({ id, label }) => {
            const active = filterType === id;
            return (
              <Pressable
                key={id}
                onPress={() => {
                  if (Platform.OS !== "web") Haptics.selectionAsync();
                  setFilterType(id);
                }}
                style={[
                  s.chip,
                  active
                    ? { backgroundColor: "#1A6FE8", borderColor: "#1A6FE8" }
                    : { backgroundColor: isDark ? "#0D1525" : "#F5F8FF", borderColor: isDark ? "#1A2540" : "#E0E8F8" },
                ]}
              >
                <Text style={[s.chipText, { color: active ? "#fff" : colors.textSecondary }]}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* List */}
      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator color="#1A6FE8" size="large" />
        </View>
      ) : entries.length === 0 ? (
        <View style={s.centered}>
          <View style={[s.emptyIcon, { backgroundColor: "#1A6FE818" }]}>
            <Feather name="activity" size={28} color="#1A6FE8" />
          </View>
          <Text style={[s.emptyTitle, { color: colors.text }]}>Sin actividad registrada</Text>
          <Text style={[s.emptySub, { color: colors.textSecondary }]}>
            Cada vez que usés tu identidad aparecerá aquí
          </Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 20 }]}
          onRefresh={onRefresh}
          refreshing={refreshing}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            loadingMore ? (
              <View style={{ alignItems: "center", paddingVertical: 20 }}>
                <ActivityIndicator color="#1A6FE8" />
              </View>
            ) : null
          }
        />
      )}

      {/* Detail modal */}
      {detailId && (
        <DetailModal
          id={detailId}
          visible={showDetail}
          onClose={() => setShowDetail(false)}
          isDark={isDark}
          colors={colors}
        />
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingHorizontal: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: "transparent",
  },
  backBtn: {
    width: 38, height: 38,
    alignItems: "center", justifyContent: "center",
    borderRadius: 12,
  },
  headerTitle: { fontSize: 19, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },

  searchRow: {
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1,
  },
  searchInput: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9,
  },
  searchText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },

  filterWrap: { borderBottomWidth: 1 },
  filterScroll: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1,
  },
  chipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyIcon: { width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 40, lineHeight: 20 },

  list: { padding: 16, gap: 10 },

  item: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    borderRadius: 16, borderWidth: 1, padding: 14,
  },
  itemIcon: {
    width: 42, height: 42, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0, marginTop: 2,
  },
  itemLabel: { fontSize: 14, fontFamily: "Inter_700Bold", flex: 1 },
  itemSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  itemTime: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },

  resultPill: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 20, borderWidth: 1,
  },
  resultPillText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },

  fieldTags: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 2 },
  fieldTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  fieldTagText: { fontSize: 10, fontFamily: "Inter_500Medium" },
});
