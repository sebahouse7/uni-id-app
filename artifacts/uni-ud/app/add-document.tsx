import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActionSheetIOS,
  Alert,
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

import { PaywallGate } from "@/components/ui/PaywallGate";
import Colors from "@/constants/colors";
import { CATEGORIES, DocumentCategory, useIdentity } from "@/context/IdentityContext";

const FREE_DOC_LIMIT = 3;

export default function AddDocumentScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const { addDocument, documents, node } = useIdentity();

  const isFree = !node?.networkPlan || node.networkPlan === "free";
  const isAtLimit = isFree && documents.length >= FREE_DOC_LIMIT;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<DocumentCategory>("identity");
  const [fileName, setFileName] = useState<string | undefined>();
  const [fileUri, setFileUri] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const handleCamera = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permiso requerido", "Necesitamos acceso a la cámara para tomar fotos.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        allowsEditing: true,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const name = `foto_${Date.now()}.jpg`;
        setFileName(name);
        setFileUri(asset.uri);
        if (!title) setTitle(`Foto ${new Date().toLocaleDateString()}`);
      }
    } catch {
      Alert.alert("Error", "No se pudo acceder a la cámara.");
    }
  };

  const handleGallery = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permiso requerido", "Necesitamos acceso a tu galería.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        allowsEditing: false,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const name = asset.fileName ?? `imagen_${Date.now()}.jpg`;
        setFileName(name);
        setFileUri(asset.uri);
        if (!title) setTitle(name.replace(/\.[^/.]+$/, ""));
      }
    } catch {
      Alert.alert("Error", "No se pudo abrir la galería.");
    }
  };

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets[0]) {
        setFileName(result.assets[0].name);
        setFileUri(result.assets[0].uri);
        if (!title) setTitle(result.assets[0].name.replace(/\.[^/.]+$/, ""));
      }
    } catch {
      Alert.alert("Error", "No se pudo seleccionar el archivo.");
    }
  };

  const handleAttach = () => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Cancelar", "Tomar foto", "Elegir de galería", "Seleccionar archivo"],
          cancelButtonIndex: 0,
        },
        (index) => {
          if (index === 1) handleCamera();
          else if (index === 2) handleGallery();
          else if (index === 3) handlePickFile();
        }
      );
    } else {
      Alert.alert("Agregar archivo", "¿De dónde querés adjuntar?", [
        { text: "Cancelar", style: "cancel" },
        { text: "📷 Tomar foto", onPress: handleCamera },
        { text: "🖼 Galería", onPress: handleGallery },
        { text: "📄 Archivo", onPress: handlePickFile },
      ]);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert("Falta el nombre", "Ingresá un nombre para el documento.");
      return;
    }
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setSaving(true);
    try {
      await addDocument({ title: title.trim(), description, category, fileName, fileUri });
      Alert.alert("✅ Guardado", "El documento fue guardado correctamente.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert("Error al guardar", err?.message ?? "No se pudo guardar el documento. Verificá tu conexión.");
    } finally {
      setSaving(false);
    }
  };

  const selectedCat = CATEGORIES.find((c) => c.key === category);

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
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Feather name="x" size={22} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Nuevo documento</Text>
        <Pressable
          onPress={handleSave}
          disabled={saving || !title.trim()}
          style={({ pressed }) => [
            styles.saveBtn,
            {
              backgroundColor: !title.trim() ? colors.border : colors.tint,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text style={styles.saveBtnText}>{saving ? "Guardando..." : "Guardar"}</Text>
        </Pressable>
      </View>

      {isAtLimit ? (
        <PaywallGate
          limitReached
          currentCount={documents.length}
          maxCount={FREE_DOC_LIMIT}
          feature="documentos adicionales"
        />
      ) : (
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 32 },
        ]}
      >
        {/* Title */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Nombre del documento *</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Ej: DNI, Diploma universitario..."
            placeholderTextColor={colors.textSecondary}
            style={[
              styles.input,
              {
                color: colors.text,
                backgroundColor: colors.backgroundCard,
                borderColor: colors.border,
              },
            ]}
          />
        </View>

        {/* Description */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Descripción (opcional)</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Agrega notas o detalles..."
            placeholderTextColor={colors.textSecondary}
            multiline
            numberOfLines={3}
            style={[
              styles.inputMulti,
              {
                color: colors.text,
                backgroundColor: colors.backgroundCard,
                borderColor: colors.border,
              },
            ]}
          />
        </View>

        {/* Category */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Categoría</Text>
          <View style={styles.catGrid}>
            {CATEGORIES.map((cat) => {
              const isSelected = category === cat.key;
              return (
                <Pressable
                  key={cat.key}
                  onPress={() => setCategory(cat.key)}
                  style={({ pressed }) => [
                    styles.catOption,
                    {
                      backgroundColor: isSelected ? cat.color + "20" : colors.backgroundCard,
                      borderColor: isSelected ? cat.color : colors.border,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <Feather
                    name={cat.icon as any}
                    size={18}
                    color={isSelected ? cat.color : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.catOptionText,
                      { color: isSelected ? cat.color : colors.text },
                    ]}
                  >
                    {cat.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* File picker */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Archivo adjunto (opcional)</Text>
          <Pressable
            onPress={handleAttach}
            style={({ pressed }) => [
              styles.filePicker,
              {
                backgroundColor: colors.backgroundCard,
                borderColor: fileName ? (selectedCat?.color ?? colors.tint) : colors.border,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Feather
              name={fileName ? "file-text" : "upload"}
              size={22}
              color={fileName ? (selectedCat?.color ?? colors.tint) : colors.textSecondary}
            />
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.filePickerText,
                  { color: fileName ? colors.text : colors.textSecondary },
                ]}
                numberOfLines={1}
              >
                {fileName ?? "Seleccionar archivo"}
              </Text>
              {!fileName && (
                <Text style={[styles.filePickerSub, { color: colors.textSecondary }]}>
                  PDF, imagen, Word, etc.
                </Text>
              )}
            </View>
            {fileName && (
              <Pressable
                onPress={() => {
                  setFileName(undefined);
                  setFileUri(undefined);
                }}
              >
                <Feather name="x" size={18} color={colors.textSecondary} />
              </Pressable>
            )}
          </Pressable>
        </View>
      </ScrollView>
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
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  saveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  saveBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  scroll: { padding: 20, gap: 24 },
  field: { gap: 10 },
  label: { fontSize: 13, fontFamily: "Inter_500Medium" },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
  },
  inputMulti: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    minHeight: 90,
    textAlignVertical: "top",
  },
  catGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  catOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  catOptionText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  filePicker: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderWidth: 1.5,
    borderRadius: 14,
    borderStyle: "dashed",
    padding: 16,
  },
  filePickerText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  filePickerSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
});
