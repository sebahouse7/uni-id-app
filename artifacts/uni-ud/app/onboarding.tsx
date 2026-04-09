import { Feather, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useIdentity } from "@/context/IdentityContext";

const { width } = Dimensions.get("window");
const LOGO = require("../assets/images/icon.png");

// ── Slides ──────────────────────────────────────────────────────────────────

const slides = [
  {
    id: "welcome",
    title: "Bienvenido a UNI ID",
    subtitle: "La forma segura de gestionar tu identidad digital",
    features: [
      { icon: "globe", label: "Identidad unificada", desc: "Definí tu ID digital para todo" },
      { icon: "lock", label: "Máxima seguridad", desc: "Protegé tus documentos con cifrado extremo a extremo" },
      { icon: "zap", label: "Acceso instantáneo", desc: "Usá tu huella o PIN para entrar en segundos" },
    ],
  },
  {
    id: "docs",
    title: "Todos tus documentos",
    subtitle: "DNI, estudios, salud, licencia y más — siempre en tu bolsillo",
    features: [
      { icon: "file-text", label: "Organización inteligente", desc: "Todo clasificado y listo cuando lo necesitás" },
      { icon: "shield", label: "Cifrado AES-256", desc: "Nadie accede a tu contenido — ni nosotros" },
      { icon: "share-2", label: "Compartí seguro", desc: "Enlace temporal con caducidad automática" },
    ],
  },
  {
    id: "network",
    title: "Red global de identidad",
    subtitle: "Verificá tu identidad en hospitales, bancos y más",
    features: [
      { icon: "cpu", label: "Nodo propio", desc: "Tu nodo único en la red global descentralizada" },
      { icon: "check-circle", label: "Consenso criptográfico", desc: "Ed25519 + verificación sin intermediarios" },
      { icon: "wifi", label: "Siempre disponible", desc: "Funciona offline — sincroniza cuando tenés señal" },
    ],
  },
];

// ── Feature card ─────────────────────────────────────────────────────────────

function FeatureCard({
  icon,
  label,
  desc,
  index,
  visible,
}: {
  icon: string;
  label: string;
  desc: string;
  index: number;
  visible: boolean;
}) {
  const opacity   = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 350, delay: index * 100, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, friction: 8, delay: index * 100, useNativeDriver: true }),
      ]).start();
    } else {
      opacity.setValue(0);
      translateY.setValue(20);
    }
  }, [visible]);

  return (
    <Animated.View style={[styles.featureCard, { opacity, transform: [{ translateY }] }]}>
      <View style={styles.featureIconWrap}>
        <Feather name={icon as any} size={22} color="#00D4FF" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.featureLabel}>{label}</Text>
        <Text style={styles.featureDesc}>{desc}</Text>
      </View>
    </Animated.View>
  );
}

// ── Slide ────────────────────────────────────────────────────────────────────

function Slide({
  data,
  active,
}: {
  data: (typeof slides)[0];
  active: boolean;
}) {
  return (
    <View style={[styles.slide, { width }]}>
      <Text style={styles.slideTitle}>{data.title}</Text>
      <Text style={styles.slideSubtitle}>{data.subtitle}</Text>
      <View style={styles.cardsWrap}>
        {data.features.map((f, i) => (
          <FeatureCard key={f.icon} {...f} index={i} visible={active} />
        ))}
      </View>
    </View>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const insets  = useSafeAreaInsets();
  const { createNode } = useIdentity();

  const [current,       setCurrent]       = useState(0);
  const [showNameStep,  setShowNameStep]  = useState(false);
  const [name,          setName]          = useState("");
  const [regError,      setRegError]      = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);

  const translateX  = useRef(new Animated.Value(0)).current;
  const btnScale    = useRef(new Animated.Value(1)).current;
  const nameInputRef = useRef<TextInput>(null);

  // Logo entrance
  const logoScale   = useRef(new Animated.Value(0.7)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.spring(logoScale, { toValue: 1, friction: 6, useNativeDriver: true }),
      Animated.timing(logoOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]).start();
  }, []);

  const goToSlide = (idx: number) => {
    Animated.spring(translateX, {
      toValue: -idx * width,
      friction: 9,
      tension: 50,
      useNativeDriver: true,
    }).start();
    setCurrent(idx);
  };

  const handleNext = () => {
    if (current < slides.length - 1) {
      goToSlide(current + 1);
    } else {
      setShowNameStep(true);
      setTimeout(() => nameInputRef.current?.focus(), 400);
    }
  };

  const handleGetStarted = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setRegError("Ingresá tu nombre para continuar."); return; }
    if (trimmed.length < 2) { setRegError("El nombre debe tener al menos 2 caracteres."); return; }
    setRegError(null);
    setIsRegistering(true);
    try {
      await createNode({ name: trimmed, networkPlan: "free" });
      router.replace("/(tabs)");
    } catch (e: any) {
      setRegError(e?.message ?? "Error al conectar con el servidor");
    } finally {
      setIsRegistering(false);
    }
  };

  // ── Name step ─────────────────────────────────────────────────────────────

  if (showNameStep) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <LinearGradient colors={["#0a0f1f", "#0d1a35"]} style={StyleSheet.absoluteFill} />
        <View style={[styles.nameStep, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 }]}>
          <Animated.View style={{ transform: [{ scale: logoScale }], opacity: logoOpacity, alignItems: "center" }}>
            <Image source={LOGO} style={styles.nameLogo} resizeMode="contain" />
          </Animated.View>

          <View style={styles.avatarWrap}>
            <LinearGradient colors={["#1A3F8F", "#1A6FE8"]} style={styles.avatarCircle}>
              {name.trim() ? (
                <Text style={styles.avatarLetter}>{name.trim()[0].toUpperCase()}</Text>
              ) : (
                <Feather name="user" size={36} color="#fff" />
              )}
            </LinearGradient>
          </View>

          <Text style={styles.nameTitle}>¿Cómo te llamás?</Text>
          <Text style={styles.nameSubtitle}>
            Este nombre aparecerá en tu identidad digital.
          </Text>

          <View style={[styles.inputWrap, { borderColor: name.trim().length > 0 ? "#00D4FF" : "rgba(255,255,255,0.15)" }]}>
            <Feather name="user" size={18} color={name.trim().length > 0 ? "#00D4FF" : "#64748B"} />
            <TextInput
              ref={nameInputRef}
              value={name}
              onChangeText={(t) => { setName(t); setRegError(null); }}
              placeholder="Tu nombre completo"
              placeholderTextColor="#4A5568"
              style={styles.nameInput}
              maxLength={100}
              returnKeyType="done"
              onSubmitEditing={handleGetStarted}
              autoCapitalize="words"
              autoCorrect={false}
            />
            {name.trim().length > 0 && <Feather name="check" size={16} color="#00D4FF" />}
          </View>

          {regError && (
            <View style={styles.errorBox}>
              <Feather name="alert-circle" size={15} color="#F87171" />
              <Text style={styles.errorText}>{regError}</Text>
            </View>
          )}

          <Pressable
            onPress={handleGetStarted}
            disabled={isRegistering}
            style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1, width: "100%", marginTop: 8 })}
          >
            <LinearGradient
              colors={
                isRegistering
                  ? ["#2A3A5A", "#2A3A5A"]
                  : name.trim().length >= 2
                  ? ["#0066CC", "#00D4FF"]
                  : ["#1A2A4A", "#1A2A4A"]
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.ctaBtn}
            >
              <Text style={styles.ctaText}>
                {isRegistering ? "Creando tu identidad..." : "Crear mi identidad digital"}
              </Text>
              {!isRegistering && (
                <View style={styles.ctaIconWrap}>
                  <Feather name="zap" size={18} color="#fff" />
                </View>
              )}
            </LinearGradient>
          </Pressable>

          <View style={styles.trustRow}>
            <Ionicons name="shield-checkmark" size={13} color="#4A90D9" />
            <Text style={styles.trustText}>Seguridad activa · Cifrado extremo a extremo</Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ── Slides ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#0a0f1f", "#0d1a35"]} style={StyleSheet.absoluteFill} />

      {/* Top area: Logo */}
      <View style={[styles.topSection, { paddingTop: insets.top + 20 }]}>
        <Animated.View style={{ transform: [{ scale: logoScale }], opacity: logoOpacity }}>
          <Image source={LOGO} style={styles.logo} resizeMode="contain" />
        </Animated.View>
        <Text style={styles.brandName}>UNI ID</Text>
        <Text style={styles.brandTagline}>Tu identidad digital unificada</Text>
      </View>

      {/* Slide reel */}
      <View style={{ flex: 1, overflow: "hidden" }}>
        <Animated.View
          style={{
            flexDirection: "row",
            width: width * slides.length,
            transform: [{ translateX }],
          }}
        >
          {slides.map((s, i) => (
            <Slide key={s.id} data={s} active={i === current} />
          ))}
        </Animated.View>
      </View>

      {/* Bottom */}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 28 }]}>
        {/* Dots */}
        <View style={styles.dotsRow}>
          {slides.map((_, i) => (
            <Pressable key={i} onPress={() => goToSlide(i)}>
              <View
                style={[
                  styles.dot,
                  i === current
                    ? { width: 28, backgroundColor: "#00D4FF" }
                    : { width: 8, backgroundColor: "rgba(255,255,255,0.2)" },
                ]}
              />
            </Pressable>
          ))}
        </View>

        {/* CTA */}
        <Animated.View style={[{ width: "100%" }, { transform: [{ scale: btnScale }] }]}>
          <Pressable
            onPress={handleNext}
            onPressIn={() =>
              Animated.spring(btnScale, { toValue: 0.97, useNativeDriver: true, friction: 8 }).start()
            }
            onPressOut={() =>
              Animated.spring(btnScale, { toValue: 1, useNativeDriver: true, friction: 6 }).start()
            }
          >
            <LinearGradient
              colors={["#0066CC", "#00D4FF"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.ctaBtn}
            >
              <Text style={styles.ctaText}>
                {current === slides.length - 1 ? "Crear nueva identidad" : "Siguiente"}
              </Text>
              <View style={styles.ctaIconWrap}>
                <Feather
                  name={current === slides.length - 1 ? "zap" : "arrow-right"}
                  size={18}
                  color="#fff"
                />
              </View>
            </LinearGradient>
          </Pressable>
        </Animated.View>

        {/* Trust line */}
        <View style={styles.trustRow}>
          <Ionicons name="shield-checkmark" size={13} color="#4A90D9" />
          <Text style={styles.trustText}>Seguridad activa · Cifrado extremo a extremo</Text>
        </View>
      </View>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  topSection: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  logo: {
    width: 100,
    height: 100,
    borderRadius: 22,
  },
  brandName: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    letterSpacing: 2,
    marginTop: 10,
  },
  brandTagline: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.5)",
    marginTop: 4,
  },

  slide: {
    paddingHorizontal: 24,
    justifyContent: "center",
  },
  slideTitle: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 8,
  },
  slideSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.55)",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  cardsWrap: {
    gap: 12,
  },
  featureCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(0,212,255,0.15)",
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  featureIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(0,212,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  featureLabel: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
    marginBottom: 3,
  },
  featureDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.5)",
    lineHeight: 19,
  },

  bottom: {
    paddingHorizontal: 24,
    gap: 18,
    alignItems: "center",
  },
  dotsRow: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },

  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 17,
    paddingHorizontal: 32,
    borderRadius: 50,
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
    color: "rgba(255,255,255,0.35)",
  },

  // Name step
  nameStep: {
    flex: 1,
    paddingHorizontal: 28,
    alignItems: "center",
  },
  nameLogo: {
    width: 80,
    height: 80,
    borderRadius: 18,
    marginBottom: 8,
  },
  avatarWrap: {
    marginTop: 20,
    marginBottom: 20,
  },
  avatarCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: {
    fontSize: 40,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  nameTitle: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 10,
  },
  nameSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 28,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    width: "100%",
    marginBottom: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  nameInput: {
    flex: 1,
    fontSize: 17,
    fontFamily: "Inter_500Medium",
    color: "#FFFFFF",
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(248,113,113,0.1)",
    borderColor: "rgba(248,113,113,0.3)",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    width: "100%",
    marginBottom: 8,
  },
  errorText: {
    color: "#F87171",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
});
