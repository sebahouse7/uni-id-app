import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
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

import Colors from "@/constants/colors";
import { Radii } from "@/constants/design";
import { useIdentity } from "@/context/IdentityContext";

const { width } = Dimensions.get("window");

const slides = [
  {
    id: "1",
    icon: "user",
    title: "Tu identidad digital",
    subtitle:
      "Sos un nodo único en la red global. Guardá y gestioná todos tus documentos personales en un solo lugar cifrado.",
    gradient: ["#1A3F8F", "#1A6FE8"] as [string, string],
    accentColor: "#1A6FE8",
  },
  {
    id: "2",
    icon: "file-text",
    title: "Todos tus documentos",
    subtitle:
      "DNI, estudios, salud, licencia, escrituras y mascotas. Todo organizado, siempre disponible y 100% privado.",
    gradient: ["#4C1D95", "#7C3AED"] as [string, string],
    accentColor: "#7C3AED",
  },
  {
    id: "3",
    icon: "share-2",
    title: "Red cognitiva global",
    subtitle:
      "Conectate a la red y verificá tu identidad de forma segura y descentralizada en bancos, hospitales y más.",
    gradient: ["#0A4F6B", "#00A3C4"] as [string, string],
    accentColor: "#00D4FF",
  },
];

function SlideItem({ item, index, currentIndex }: { item: (typeof slides)[0]; index: number; currentIndex: number }) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;

  const scale = useRef(new Animated.Value(index === 0 ? 1 : 0.9)).current;
  const opacity = useRef(new Animated.Value(index === 0 ? 1 : 0.6)).current;

  useEffect(() => {
    const isActive = index === currentIndex;
    Animated.parallel([
      Animated.spring(scale, { toValue: isActive ? 1 : 0.9, useNativeDriver: true, friction: 8 }),
      Animated.timing(opacity, { toValue: isActive ? 1 : 0.6, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [currentIndex]);

  return (
    <Animated.View style={[styles.slide, { width, opacity, transform: [{ scale }] }]}>
      {/* Icon hero */}
      <View style={styles.iconArea}>
        <LinearGradient
          colors={item.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.iconGradient}
        >
          {/* Decorative rings */}
          <View style={[styles.ring1, { borderColor: "rgba(255,255,255,0.12)" }]} />
          <View style={[styles.ring2, { borderColor: "rgba(255,255,255,0.07)" }]} />
          <View style={styles.iconCenter}>
            <Feather name={item.icon as any} size={48} color="#fff" />
          </View>
        </LinearGradient>
      </View>

      <Text style={[styles.slideTitle, { color: colors.text }]}>{item.title}</Text>
      <Text style={[styles.slideSubtitle, { color: colors.textSecondary }]}>{item.subtitle}</Text>
    </Animated.View>
  );
}

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const { createNode } = useIdentity();
  const [current, setCurrent] = useState(0);
  const [regError, setRegError] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const flatRef = useRef<FlatList>(null);
  const btnScale = useRef(new Animated.Value(1)).current;

  const handleGetStarted = async () => {
    setRegError(null);
    setIsRegistering(true);
    try {
      await createNode({ name: "Mi Nodo", networkPlan: "free" });
      router.replace("/(tabs)");
    } catch (e: any) {
      setRegError(e?.message ?? "Error al conectar con el servidor");
    } finally {
      setIsRegistering(false);
    }
  };

  const handleNext = () => {
    if (current < slides.length - 1) {
      flatRef.current?.scrollToIndex({ index: current + 1, animated: true });
      setCurrent(current + 1);
    } else {
      handleGetStarted();
    }
  };

  const handleSkip = () => handleGetStarted();

  const currentSlide = slides[current];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top bar */}
      <View
        style={[
          styles.topBar,
          { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) + 20 },
        ]}
      >
        <View style={styles.logoRow}>
          <View style={[styles.logoDot, { backgroundColor: colors.tint }]} />
          <Text style={[styles.logoText, { color: colors.text }]}>uni.id</Text>
        </View>
        {current < slides.length - 1 && (
          <Pressable
            onPress={handleSkip}
            style={({ pressed }) => [
              styles.skipBtn,
              { backgroundColor: colors.backgroundCard, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.skipText, { color: colors.textSecondary }]}>Omitir</Text>
          </Pressable>
        )}
      </View>

      {/* Slides */}
      <FlatList
        ref={flatRef}
        data={slides}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <SlideItem item={item} index={index} currentIndex={current} />
        )}
        style={{ flex: 1 }}
      />

      {/* Bottom controls */}
      <View
        style={[
          styles.bottom,
          { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 28 },
        ]}
      >
        {/* Progress dots */}
        <View style={styles.dotsRow}>
          {slides.map((s, i) => (
            <Animated.View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor:
                    i === current ? currentSlide.accentColor : colors.border,
                  width: i === current ? 28 : 8,
                },
              ]}
            />
          ))}
        </View>

        {/* Error */}
        {regError && (
          <View style={styles.errorBox}>
            <Feather name="alert-circle" size={15} color="#F87171" />
            <Text style={styles.errorText}>{regError}</Text>
          </View>
        )}

        {/* CTA button */}
        <Animated.View style={[{ width: "100%" }, { transform: [{ scale: btnScale }] }]}>
          <Pressable
            onPress={handleNext}
            disabled={isRegistering}
            onPressIn={() =>
              Animated.spring(btnScale, {
                toValue: 0.97,
                useNativeDriver: true,
                friction: 8,
              }).start()
            }
            onPressOut={() =>
              Animated.spring(btnScale, {
                toValue: 1,
                useNativeDriver: true,
                friction: 6,
              }).start()
            }
          >
            <LinearGradient
              colors={isRegistering ? ["#3A4A6A", "#3A4A6A"] : currentSlide.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.ctaBtn}
            >
              <Text style={styles.ctaText}>
                {isRegistering
                  ? "Conectando..."
                  : current === slides.length - 1
                  ? "Crear mi nodo"
                  : "Continuar"}
              </Text>
              <View style={styles.ctaIconWrap}>
                <Feather
                  name={
                    isRegistering
                      ? "loader"
                      : current === slides.length - 1
                      ? "zap"
                      : "arrow-right"
                  }
                  size={18}
                  color="#fff"
                />
              </View>
            </LinearGradient>
          </Pressable>
        </Animated.View>

        {/* Trust badge */}
        <View style={styles.trustRow}>
          <Feather name="lock" size={12} color={colors.textSecondary} />
          <Text style={[styles.trustText, { color: colors.textSecondary }]}>
            Cifrado AES-256 · Sin acceso a tu contenido
          </Text>
        </View>
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
  skipBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Radii.pill,
    borderWidth: 1,
  },
  skipText: { fontSize: 14, fontFamily: "Inter_500Medium" },

  slide: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 36,
    gap: 28,
  },
  iconArea: { marginBottom: 8 },
  iconGradient: {
    width: 170,
    height: 170,
    borderRadius: 85,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  ring1: {
    position: "absolute",
    width: 145,
    height: 145,
    borderRadius: 72.5,
    borderWidth: 1.5,
  },
  ring2: {
    position: "absolute",
    width: 165,
    height: 165,
    borderRadius: 82.5,
    borderWidth: 1,
  },
  iconCenter: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  slideTitle: {
    fontSize: 30,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    lineHeight: 38,
  },
  slideSubtitle: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 26,
  },

  bottom: {
    paddingHorizontal: 24,
    gap: 20,
    alignItems: "center",
  },
  dotsRow: { flexDirection: "row", gap: 6, alignItems: "center" },
  dot: { height: 8, borderRadius: 4 },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#2D0E0E",
    borderColor: "#7F1D1D",
    borderWidth: 1,
    borderRadius: Radii.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    width: "100%",
  },
  errorText: {
    color: "#F87171",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 17,
    paddingHorizontal: 32,
    borderRadius: Radii.xl,
    width: "100%",
  },
  ctaText: {
    color: "#fff",
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  ctaIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  trustRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  trustText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
});
