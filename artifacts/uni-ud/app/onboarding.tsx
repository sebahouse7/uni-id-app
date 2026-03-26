import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useIdentity } from "@/context/IdentityContext";
import Colors from "@/constants/colors";

const { width } = Dimensions.get("window");

const slides = [
  {
    id: "1",
    icon: "user",
    title: "Tu identidad digital",
    subtitle: "Sos un nodo único en la red. Guardá y gestioná todos tus documentos personales en un solo lugar seguro.",
    color: "#1A6FE8",
  },
  {
    id: "2",
    icon: "file-text",
    title: "Todos tus documentos",
    subtitle: "DNI, estudios, salud, licencia, escrituras y mascotas. Todo organizado y siempre disponible desde tu celular.",
    color: "#7C3AED",
  },
  {
    id: "3",
    icon: "share-2",
    title: "Red cognitiva de identidad",
    subtitle: "Conectate a la red y verificá tu identidad de forma segura y descentralizada en todo el mundo.",
    color: "#00D4FF",
  },
];

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const { createNode } = useIdentity();
  const [current, setCurrent] = useState(0);
  const flatRef = useRef<FlatList>(null);

  const handleNext = () => {
    if (current < slides.length - 1) {
      flatRef.current?.scrollToIndex({ index: current + 1 });
      setCurrent(current + 1);
    } else {
      handleGetStarted();
    }
  };

  const handleGetStarted = async () => {
    await createNode({ name: "Mi Nodo", networkPlan: "free" });
    router.replace("/(tabs)");
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) + 16 }]}>
        <View style={[styles.logoRow]}>
          <View style={[styles.logoDot, { backgroundColor: colors.tint }]} />
          <Text style={[styles.logoText, { color: colors.text }]}>uni.id</Text>
        </View>
        {current < slides.length - 1 && (
          <Pressable onPress={handleGetStarted}>
            <Text style={[styles.skipText, { color: colors.textSecondary }]}>Omitir</Text>
          </Pressable>
        )}
      </View>

      <FlatList
        ref={flatRef}
        data={slides}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <View style={[styles.iconContainer, { backgroundColor: item.color + "20", borderColor: item.color + "40" }]}>
              <View style={[styles.iconInner, { backgroundColor: item.color + "30" }]}>
                <Feather name={item.icon as any} size={52} color={item.color} />
              </View>
            </View>
            <Text style={[styles.title, { color: colors.text }]}>{item.title}</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{item.subtitle}</Text>
          </View>
        )}
      />

      <View style={[styles.bottom, { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 24 }]}>
        <View style={styles.dots}>
          {slides.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: i === current ? colors.tint : colors.border,
                  width: i === current ? 24 : 8,
                },
              ]}
            />
          ))}
        </View>

        <Pressable
          onPress={handleNext}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={styles.buttonText}>
            {current === slides.length - 1 ? "Crear mi nodo" : "Continuar"}
          </Text>
          <Feather name={current === slides.length - 1 ? "zap" : "arrow-right"} size={20} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  logoDot: { width: 10, height: 10, borderRadius: 5 },
  logoText: { fontSize: 20, fontFamily: "Inter_700Bold" },
  skipText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  slide: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 24,
  },
  iconContainer: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  iconInner: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    lineHeight: 36,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 24,
  },
  bottom: {
    paddingHorizontal: 24,
    gap: 24,
    alignItems: "center",
  },
  dots: { flexDirection: "row", gap: 6, alignItems: "center" },
  dot: { height: 8, borderRadius: 4 },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 16,
    width: "100%",
  },
  buttonText: {
    color: "#fff",
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
});
