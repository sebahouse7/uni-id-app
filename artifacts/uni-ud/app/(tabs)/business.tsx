import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
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

import { AnimatedPressable } from "@/components/ui/AnimatedPressable";
import Colors from "@/constants/colors";
import { Radii, Shadows, Spacing } from "@/constants/design";
import { useLanguage } from "@/context/LanguageContext";
import {
  apiAddBusinessDocument,
  apiCreateBusiness,
  apiDeleteBusiness,
  apiDeleteBusinessDocument,
  apiGetBusinessDocuments,
  apiGetBusinesses,
  apiUpdateBusiness,
} from "@/lib/apiClient";

interface Business {
  id: string;
  name: string;
  legal_name?: string;
  tax_id?: string;
  business_type?: string;
  industry?: string;
  founded_date?: string;
  address?: string;
  city?: string;
  country?: string;
  website?: string;
  email?: string;
  phone?: string;
  description?: string;
}

interface BizDoc {
  id: string;
  title: string;
  description?: string;
  doc_type?: string;
  file_name?: string;
  created_at: string;
}

const BUSINESS_TYPES = ["SAS", "SA", "SRL", "Unipersonal", "Monotributista", "Otro"];

export default function BusinessScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const { t } = useLanguage();

  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Business | null>(null);
  const [bizDocs, setBizDocs] = useState<BizDoc[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showDocForm, setShowDocForm] = useState(false);
  const [editMode, setEditMode] = useState(false);

  // Form state
  const [form, setForm] = useState({
    name: "", legalName: "", taxId: "", businessType: "SAS",
    industry: "", foundedDate: "", address: "", city: "",
    country: "Argentina", website: "", email: "", phone: "", description: "",
  });
  const [docForm, setDocForm] = useState({ title: "", description: "", docType: "Estatuto" });

  const load = useCallback(async () => {
    setLoading(true);
    const rows = await apiGetBusinesses();
    setBusinesses(rows);
    if (rows.length > 0 && !selected) setSelected(rows[0]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (selected) {
      apiGetBusinessDocuments(selected.id).then(setBizDocs);
    }
  }, [selected]);

  const openCreate = () => {
    setForm({ name: "", legalName: "", taxId: "", businessType: "SAS",
      industry: "", foundedDate: "", address: "", city: "",
      country: "Argentina", website: "", email: "", phone: "", description: "" });
    setEditMode(false);
    setShowForm(true);
  };

  const openEdit = (biz: Business) => {
    setForm({
      name: biz.name, legalName: biz.legal_name ?? "", taxId: biz.tax_id ?? "",
      businessType: biz.business_type ?? "SAS", industry: biz.industry ?? "",
      foundedDate: biz.founded_date ?? "", address: biz.address ?? "",
      city: biz.city ?? "", country: biz.country ?? "Argentina",
      website: biz.website ?? "", email: biz.email ?? "",
      phone: biz.phone ?? "", description: biz.description ?? "",
    });
    setEditMode(true);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    try {
      const payload = {
        name: form.name.trim(),
        legalName: form.legalName.trim() || undefined,
        taxId: form.taxId.trim() || undefined,
        businessType: form.businessType || undefined,
        industry: form.industry.trim() || undefined,
        foundedDate: form.foundedDate.trim() || undefined,
        address: form.address.trim() || undefined,
        city: form.city.trim() || undefined,
        country: form.country.trim() || undefined,
        website: form.website.trim() || undefined,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        description: form.description.trim() || undefined,
      };
      let updated: Business;
      if (editMode && selected) {
        updated = await apiUpdateBusiness(selected.id, payload);
      } else {
        updated = await apiCreateBusiness(payload);
      }
      setShowForm(false);
      await load();
      setSelected(updated);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  const handleDelete = (biz: Business) => {
    Alert.alert(
      "¿Eliminar empresa?",
      `Eliminás "${biz.name}" y todos sus documentos.`,
      [
        { text: t.cancel, style: "cancel" },
        {
          text: t.delete, style: "destructive",
          onPress: async () => {
            await apiDeleteBusiness(biz.id);
            setSelected(null);
            await load();
          },
        },
      ]
    );
  };

  const handleAddDoc = async () => {
    if (!selected || !docForm.title.trim()) return;
    try {
      const doc = await apiAddBusinessDocument(selected.id, {
        title: docForm.title.trim(),
        description: docForm.description.trim() || undefined,
        docType: docForm.docType,
      });
      setBizDocs((prev) => [doc, ...prev]);
      setDocForm({ title: "", description: "", docType: "Estatuto" });
      setShowDocForm(false);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  const handleDeleteDoc = (doc: BizDoc) => {
    if (!selected) return;
    Alert.alert("¿Eliminar documento?", doc.title, [
      { text: t.cancel, style: "cancel" },
      {
        text: t.delete, style: "destructive",
        onPress: async () => {
          await apiDeleteBusinessDocument(selected.id, doc.id);
          setBizDocs((prev) => prev.filter((d) => d.id !== doc.id));
        },
      },
    ]);
  };

  const c = {
    bg: isDark ? "#060B18" : "#F0F4FF",
    card: isDark ? "#0D1525" : "#FFFFFF",
    border: isDark ? "#1A2540" : "#E0E8F8",
    text: colors.text,
    sub: isDark ? "#5A7090" : "#8A99B5",
    accent: "#1A6FE8",
    cyan: "#00D4FF",
  };

  const BIZ_TYPES_PT = (t.businessDocTypes ?? "Estatuto,Inscripción,Balance,Contrato,Poder,Otro").split(",");

  return (
    <View style={[s.root, { backgroundColor: c.bg, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: c.border }]}>
        <View>
          <Text style={[s.headerTitle, { color: c.text }]}>{t.businessTitle ?? "Mi empresa"}</Text>
          <Text style={[s.headerSub, { color: c.sub }]}>{t.businessSubtitle ?? "Identidad empresarial"}</Text>
        </View>
        <AnimatedPressable onPress={openCreate} style={[s.addBtn, { backgroundColor: c.accent }]}>
          <Feather name="plus" size={18} color="#fff" />
        </AnimatedPressable>
      </View>

      {/* Selector de empresa (si hay varias) */}
      {businesses.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.bizBar} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          {businesses.map((b) => (
            <Pressable
              key={b.id}
              onPress={() => setSelected(b)}
              style={[s.bizChip, { backgroundColor: selected?.id === b.id ? c.accent : c.card, borderColor: c.border }]}
            >
              <Text style={[s.bizChipText, { color: selected?.id === b.id ? "#fff" : c.text }]}>{b.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}>
        {/* Sin empresa */}
        {!loading && businesses.length === 0 && (
          <View style={s.empty}>
            <LinearGradient colors={["#1A2540", "#0D1525"]} style={s.emptyIcon}>
              <Feather name="briefcase" size={32} color="#1A6FE8" />
            </LinearGradient>
            <Text style={[s.emptyTitle, { color: c.text }]}>{t.noBusiness ?? "Sin empresa registrada"}</Text>
            <Text style={[s.emptySub, { color: c.sub }]}>{t.noBusinessSub ?? "Agregá tu empresa para gestionar su identidad digital"}</Text>
            <AnimatedPressable onPress={openCreate} style={[s.emptyBtn, { backgroundColor: c.accent }]}>
              <Feather name="plus" size={16} color="#fff" />
              <Text style={s.emptyBtnText}>{t.addBusiness ?? "Registrar empresa"}</Text>
            </AnimatedPressable>
          </View>
        )}

        {/* Tarjeta empresa seleccionada */}
        {selected && (
          <>
            {/* Hero card */}
            <LinearGradient
              colors={isDark ? ["#0F1E3A", "#0A1528"] : ["#1A6FE8", "#0D4DB5"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={[s.heroCard, { borderColor: isDark ? "#1E3060" : "transparent" }]}
            >
              <View style={s.heroRow}>
                <View style={s.heroIcon}>
                  <Feather name="briefcase" size={26} color={isDark ? "#1A6FE8" : "#fff"} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.heroName, { color: isDark ? "#E8F0FF" : "#fff" }]}>{selected.name}</Text>
                  {selected.legal_name ? (
                    <Text style={[s.heroSub, { color: isDark ? "#5A7090" : "rgba(255,255,255,0.7)" }]}>{selected.legal_name}</Text>
                  ) : null}
                </View>
                <View style={s.heroBadge}>
                  <Text style={s.heroBadgeText}>{selected.business_type ?? "SAS"}</Text>
                </View>
              </View>
              {selected.tax_id ? (
                <View style={s.heroRow2}>
                  <Feather name="hash" size={12} color={isDark ? "#3A5080" : "rgba(255,255,255,0.6)"} />
                  <Text style={[s.heroTaxId, { color: isDark ? "#3A5080" : "rgba(255,255,255,0.7)" }]}>
                    {t.businessTaxId ?? "CUIT"}: {selected.tax_id}
                  </Text>
                </View>
              ) : null}
            </LinearGradient>

            {/* Datos básicos */}
            <View style={[s.section, { backgroundColor: c.card, borderColor: c.border }]}>
              <View style={s.sectionHeader}>
                <Text style={[s.sectionTitle, { color: c.text }]}>{t.businessIdentity ?? "Identidad empresarial"}</Text>
                <Pressable onPress={() => openEdit(selected)} style={[s.editBtn, { borderColor: c.border }]}>
                  <Feather name="edit-2" size={14} color={c.accent} />
                  <Text style={[s.editBtnText, { color: c.accent }]}>{t.editBusiness ?? "Editar"}</Text>
                </Pressable>
              </View>

              {[
                { icon: "map-pin", label: t.businessAddress ?? "Dirección", val: [selected.address, selected.city, selected.country].filter(Boolean).join(", ") },
                { icon: "globe", label: t.businessWebsite ?? "Web", val: selected.website },
                { icon: "mail", label: t.businessEmail ?? "Email", val: selected.email },
                { icon: "phone", label: t.businessPhone ?? "Teléfono", val: selected.phone },
                { icon: "tag", label: t.businessIndustry ?? "Rubro", val: selected.industry },
                { icon: "calendar", label: t.businessFounded ?? "Fundación", val: selected.founded_date },
              ]
                .filter((r) => r.val)
                .map((row) => (
                  <View key={row.label} style={[s.dataRow, { borderTopColor: c.border }]}>
                    <Feather name={row.icon as any} size={14} color={c.sub} style={{ marginTop: 1 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.dataLabel, { color: c.sub }]}>{row.label}</Text>
                      <Text style={[s.dataVal, { color: c.text }]}>{row.val}</Text>
                    </View>
                  </View>
                ))}

              {selected.description ? (
                <View style={[s.descBox, { borderTopColor: c.border, borderColor: c.border, backgroundColor: isDark ? "#070D1C" : "#F5F8FF" }]}>
                  <Text style={[s.descText, { color: c.sub }]}>{selected.description}</Text>
                </View>
              ) : null}

              <AnimatedPressable
                onPress={() => handleDelete(selected)}
                style={[s.deleteBtn, { borderColor: "#E53E3E" }]}
              >
                <Feather name="trash-2" size={14} color="#E53E3E" />
                <Text style={[s.deleteBtnText]}>Eliminar empresa</Text>
              </AnimatedPressable>
            </View>

            {/* Documentos empresariales */}
            <View style={[s.section, { backgroundColor: c.card, borderColor: c.border }]}>
              <View style={s.sectionHeader}>
                <Text style={[s.sectionTitle, { color: c.text }]}>{t.businessDocs ?? "Documentos"}</Text>
                <Pressable onPress={() => setShowDocForm(true)} style={[s.editBtn, { borderColor: c.border }]}>
                  <Feather name="plus" size={14} color={c.accent} />
                  <Text style={[s.editBtnText, { color: c.accent }]}>{t.addBusinessDoc ?? "Agregar"}</Text>
                </Pressable>
              </View>

              {bizDocs.length === 0 ? (
                <Text style={[s.noDocsText, { color: c.sub }]}>Sin documentos aún</Text>
              ) : (
                bizDocs.map((doc) => (
                  <View key={doc.id} style={[s.docRow, { borderTopColor: c.border }]}>
                    <View style={[s.docIcon, { backgroundColor: isDark ? "#0F1E3A" : "#EEF4FF" }]}>
                      <Feather name="file-text" size={14} color={c.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.docTitle, { color: c.text }]}>{doc.title}</Text>
                      <Text style={[s.docSub, { color: c.sub }]}>{doc.doc_type ?? "Documento"}</Text>
                    </View>
                    <Pressable onPress={() => handleDeleteDoc(doc)} hitSlop={8}>
                      <Feather name="trash-2" size={15} color="#E53E3E" />
                    </Pressable>
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* Modal — Crear/Editar empresa */}
      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowForm(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
          <View style={[s.modal, { backgroundColor: c.bg }]}>
            <View style={[s.modalHeader, { borderBottomColor: c.border }]}>
              <Pressable onPress={() => setShowForm(false)} hitSlop={12}>
                <Text style={[s.modalCancel, { color: c.sub }]}>{t.cancel}</Text>
              </Pressable>
              <Text style={[s.modalTitle, { color: c.text }]}>
                {editMode ? (t.editBusiness ?? "Editar empresa") : (t.addBusiness ?? "Registrar empresa")}
              </Text>
              <Pressable onPress={handleSave} hitSlop={12}>
                <Text style={[s.modalSave, { color: c.accent }]}>{t.save}</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
              {/* Nombre */}
              <FormField label={`${t.businessName ?? "Nombre"} *`} value={form.name}
                onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} colors={c} placeholder="Ej: Monteleón Tech" />
              <FormField label={t.businessLegalName ?? "Razón social"} value={form.legalName}
                onChangeText={(v) => setForm((f) => ({ ...f, legalName: v }))} colors={c} placeholder="Ej: Monteleón Tech S.A.S." />
              <FormField label={t.businessTaxId ?? "CUIT"} value={form.taxId}
                onChangeText={(v) => setForm((f) => ({ ...f, taxId: v }))} colors={c} placeholder="20-12345678-9" keyboardType="numeric" />

              {/* Tipo */}
              <View>
                <Text style={[s.formLabel, { color: c.sub }]}>{t.businessType ?? "Tipo"}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                  {BUSINESS_TYPES.map((bt) => (
                    <Pressable key={bt} onPress={() => setForm((f) => ({ ...f, businessType: bt }))}
                      style={[s.typeChip, { borderColor: form.businessType === bt ? c.accent : c.border,
                        backgroundColor: form.businessType === bt ? c.accent + "22" : c.card }]}>
                      <Text style={[s.typeChipText, { color: form.businessType === bt ? c.accent : c.sub }]}>{bt}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              <FormField label={t.businessIndustry ?? "Rubro"} value={form.industry}
                onChangeText={(v) => setForm((f) => ({ ...f, industry: v }))} colors={c} placeholder="Ej: Tecnología, Salud..." />
              <FormField label={t.businessFounded ?? "Fecha fundación"} value={form.foundedDate}
                onChangeText={(v) => setForm((f) => ({ ...f, foundedDate: v }))} colors={c} placeholder="2024-01-15" />
              <FormField label={t.businessAddress ?? "Dirección"} value={form.address}
                onChangeText={(v) => setForm((f) => ({ ...f, address: v }))} colors={c} placeholder="Av. Corrientes 1234" />
              <FormField label={t.businessCity ?? "Ciudad"} value={form.city}
                onChangeText={(v) => setForm((f) => ({ ...f, city: v }))} colors={c} placeholder="Buenos Aires" />
              <FormField label={t.businessCountry ?? "País"} value={form.country}
                onChangeText={(v) => setForm((f) => ({ ...f, country: v }))} colors={c} placeholder="Argentina" />
              <FormField label={t.businessWebsite ?? "Sitio web"} value={form.website}
                onChangeText={(v) => setForm((f) => ({ ...f, website: v }))} colors={c} placeholder="https://miempresa.com" keyboardType="url" />
              <FormField label={t.businessEmail ?? "Email"} value={form.email}
                onChangeText={(v) => setForm((f) => ({ ...f, email: v }))} colors={c} placeholder="contacto@miempresa.com" keyboardType="email-address" />
              <FormField label={t.businessPhone ?? "Teléfono"} value={form.phone}
                onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))} colors={c} placeholder="+54 11 1234-5678" keyboardType="phone-pad" />
              <View>
                <Text style={[s.formLabel, { color: c.sub }]}>{t.businessDescription ?? "Descripción"}</Text>
                <TextInput
                  value={form.description}
                  onChangeText={(v) => setForm((f) => ({ ...f, description: v }))}
                  placeholder="Breve descripción de la empresa..."
                  placeholderTextColor={c.sub}
                  multiline numberOfLines={3}
                  style={[s.formInput, { color: c.text, borderColor: c.border, backgroundColor: c.card, minHeight: 80, textAlignVertical: "top", paddingTop: 10 }]}
                />
              </View>

              {/* Save button at bottom — always reachable */}
              <Pressable
                onPress={handleSave}
                style={[s.bottomSaveBtn, { backgroundColor: c.accent }]}
              >
                <Feather name="check" size={18} color="#fff" />
                <Text style={s.bottomSaveBtnText}>{t.save}</Text>
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal — Agregar documento */}
      <Modal visible={showDocForm} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowDocForm(false)}>
        <View style={[s.modal, { backgroundColor: c.bg }]}>
          <View style={[s.modalHeader, { borderBottomColor: c.border }]}>
            <Pressable onPress={() => setShowDocForm(false)}>
              <Text style={[s.modalCancel, { color: c.sub }]}>{t.cancel}</Text>
            </Pressable>
            <Text style={[s.modalTitle, { color: c.text }]}>{t.addBusinessDoc ?? "Agregar documento"}</Text>
            <Pressable onPress={handleAddDoc}>
              <Text style={[s.modalSave, { color: c.accent }]}>{t.save}</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
            <FormField label={`${t.title ?? "Título"} *`} value={docForm.title}
              onChangeText={(v) => setDocForm((f) => ({ ...f, title: v }))} colors={c} placeholder="Ej: Estatuto social 2024" />
            <View>
              <Text style={[s.formLabel, { color: c.sub }]}>{t.businessDocType ?? "Tipo"}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                {BIZ_TYPES_PT.map((dt) => (
                  <Pressable key={dt} onPress={() => setDocForm((f) => ({ ...f, docType: dt }))}
                    style={[s.typeChip, { borderColor: docForm.docType === dt ? c.accent : c.border,
                      backgroundColor: docForm.docType === dt ? c.accent + "22" : c.card }]}>
                    <Text style={[s.typeChipText, { color: docForm.docType === dt ? c.accent : c.sub }]}>{dt}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
            <FormField label={t.notes ?? "Notas"} value={docForm.description}
              onChangeText={(v) => setDocForm((f) => ({ ...f, description: v }))} colors={c} placeholder="Notas opcionales..." />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function FormField({ label, value, onChangeText, colors: c, placeholder, keyboardType }: {
  label: string; value: string; onChangeText: (v: string) => void;
  colors: any; placeholder?: string; keyboardType?: any;
}) {
  return (
    <View>
      <Text style={[s.formLabel, { color: c.sub }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.sub}
        keyboardType={keyboardType}
        autoCapitalize="none"
        style={[s.formInput, { color: c.text, borderColor: c.border, backgroundColor: c.card }]}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  addBtn: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  bizBar: { maxHeight: 52, paddingVertical: 8 },
  bizChip: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: Radii.pill, borderWidth: 1,
  },
  bizChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },

  empty: { alignItems: "center", paddingTop: 60, paddingBottom: 40 },
  emptyIcon: {
    width: 80, height: 80, borderRadius: 24,
    alignItems: "center", justifyContent: "center", marginBottom: 20,
  },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", marginBottom: 8 },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 32, lineHeight: 20 },
  emptyBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: Radii.pill, marginTop: 24,
  },
  emptyBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },

  heroCard: {
    borderRadius: Radii.xl, padding: 20, marginTop: 16,
    borderWidth: 1,
  },
  heroRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  heroIcon: {
    width: 50, height: 50, borderRadius: 14,
    backgroundColor: "rgba(26,111,232,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  heroName: { fontSize: 18, fontFamily: "Inter_700Bold" },
  heroSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  heroBadge: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: Radii.pill, backgroundColor: "rgba(26,111,232,0.25)",
  },
  heroBadgeText: { color: "#00D4FF", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  heroRow2: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 },
  heroTaxId: { fontSize: 12, fontFamily: "Inter_400Regular" },

  section: {
    borderRadius: Radii.xl, borderWidth: 1,
    marginTop: 12, padding: 16,
  },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  editBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: Radii.pill, borderWidth: 1,
  },
  editBtnText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  dataRow: { flexDirection: "row", gap: 10, paddingVertical: 10, borderTopWidth: 1 },
  dataLabel: { fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 2 },
  dataVal: { fontSize: 14, fontFamily: "Inter_500Medium" },
  descBox: { marginTop: 10, padding: 12, borderRadius: Radii.lg, borderWidth: 1 },
  descText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  deleteBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, marginTop: 16, paddingVertical: 10,
    borderRadius: Radii.pill, borderWidth: 1,
  },
  deleteBtnText: { fontSize: 13, fontFamily: "Inter_500Medium", color: "#E53E3E" },

  docRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderTopWidth: 1 },
  docIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  docTitle: { fontSize: 14, fontFamily: "Inter_500Medium" },
  docSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  noDocsText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", paddingVertical: 16 },

  modal: { flex: 1 },
  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  modalCancel: { fontSize: 15, fontFamily: "Inter_400Regular" },
  modalSave: { fontSize: 15, fontFamily: "Inter_600SemiBold" },

  formLabel: { fontSize: 12, fontFamily: "Inter_500Medium", marginBottom: 6 },
  formInput: {
    borderWidth: 1, borderRadius: Radii.lg,
    paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 14, fontFamily: "Inter_400Regular",
  },
  typeChip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: Radii.pill, borderWidth: 1,
  },
  typeChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  bottomSaveBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 16, borderRadius: Radii.xl, marginTop: 8,
  },
  bottomSaveBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
});
