import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/context/AuthContext";

const LOGO = require("../assets/images/logo-uniid.png");
const PIN_LENGTH = 4;

function Countdown({ lockedUntil, onExpire }: { lockedUntil: number; onExpire: () => void }) {
  const [seconds, setSeconds] = useState(Math.ceil((lockedUntil - Date.now()) / 1000));
  useEffect(() => {
    if (seconds <= 0) { onExpire(); return; }
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);
  return <Text style={styles.lockoutText}>Bloqueado por {seconds}s</Text>;
}

function PulsingRing({ animate }: { animate: boolean }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    if (!animate) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, { toValue: 1.18, duration: 900, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 900, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.5, duration: 0, useNativeDriver: true }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [animate]);
  return (
    <Animated.View
      style={[
        styles.pulseRing,
        { transform: [{ scale }], opacity },
      ]}
    />
  );
}

export function LockScreen() {
  const insets = useSafeAreaInsets();
  const {
    unlock, hasBiometrics, biometricsEnabled, hasPin,
    verifyPin, setPin, failedAttempts, lockedUntil, successState,
  } = useAuth();

  const canUseBiometrics = hasBiometrics && biometricsEnabled;
  const [mode, setMode] = useState<"bio" | "pin" | "setpin">(
    canUseBiometrics ? "bio" : hasPin ? "pin" : "setpin"
  );
  const [pin, setInputPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [step, setStep] = useState<"enter" | "confirm">("enter");
  const [error, setError] = useState("");
  const [isLocked, setIsLocked] = useState(lockedUntil != null && lockedUntil > Date.now());
  const bioAutoTriggeredRef = useRef(false);

  useEffect(() => {
    if (mode === "bio" && canUseBiometrics && !bioAutoTriggeredRef.current && !isLocked) {
      bioAutoTriggeredRef.current = true;
      unlock();
    }
  }, [mode, canUseBiometrics]);

  useEffect(() => {
    setIsLocked(lockedUntil != null && lockedUntil > Date.now());
  }, [lockedUntil]);

  const shakeAnim = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, []);

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 14, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -14, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 55, useNativeDriver: true }),
    ]).start();
  };

  const handlePinDigit = async (digit: string) => {
    if (isLocked) return;
    const next = pin + digit;
    setInputPin(next);
    setError("");

    if (next.length === PIN_LENGTH) {
      if (mode === "setpin") {
        if (step === "enter") {
          setStep("confirm");
          setInputPin("");
          setConfirmPin(next);
        } else {
          if (next === confirmPin) {
            await setPin(next);
            await unlock();
          } else {
            shake();
            setError("Los PINs no coinciden.");
            setInputPin("");
            setStep("enter");
            setConfirmPin("");
          }
        }
      } else {
        const ok = await verifyPin(next);
        if (!ok) {
          shake();
          const remaining = 5 - (failedAttempts + 1);
          setError(remaining > 0
            ? `PIN incorrecto · ${remaining} intento${remaining !== 1 ? "s" : ""} restante${remaining !== 1 ? "s" : ""}`
            : "Cuenta bloqueada temporalmente");
          if (remaining <= 0) setIsLocked(true);
          setInputPin("");
        }
      }
    }
  };

  const handleDelete = () => {
    setInputPin((p) => p.slice(0, -1));
    setError("");
  };

  const digits = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["", "0", "del"],
  ];

  const titleText =
    mode === "setpin"
      ? step === "enter" ? "Creá tu PIN de acceso" : "Confirmá tu PIN"
      : isLocked ? "Cuenta bloqueada"
      : "Ingresá tu PIN";

  if (successState) {
    return (
      <View style={styles.successContainer}>
        <LinearGradient colors={["#00D4FF", "#1A6FE8"]} style={styles.successCircle}>
          <Ionicons name="checkmark" size={44} color="#fff" />
        </LinearGradient>
        <Text style={styles.successText}>¡Acceso concedido!</Text>
      </View>
    );
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) + 20,
          paddingBottom: insets.bottom + 24,
          opacity: fadeIn,
        },
      ]}
    >
      {/* ── Logo + Branding ── */}
      <View style={styles.logoSection}>
        <Image source={LOGO} style={styles.logoImg} resizeMode="contain" />
        <Text style={styles.appName}>UNI ID</Text>
        <Text style={styles.appTagline}>Sistema de identidad digital segura</Text>
      </View>

      {/* ── Bio mode ── */}
      {mode === "bio" && (
        <View style={styles.bioSection}>
          <Text style={styles.bioTitle}>Desbloqueá tu identidad</Text>
          <Text style={styles.bioSubtitle}>Usá tu huella digital para continuar</Text>

          {/* Fingerprint button */}
          <Pressable
            onPress={() => unlock()}
            style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, alignItems: "center" })}
          >
            <View style={styles.bioRingOuter}>
              <PulsingRing animate={true} />
              <LinearGradient
                colors={["#00D4FF", "#1A6FE8", "#6C47FF"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.bioRingGradient}
              >
                <View style={styles.bioInner}>
                  <Ionicons name="finger-print" size={56} color="#1A6FE8" />
                </View>
              </LinearGradient>
            </View>
          </Pressable>
          <Text style={styles.bioHint}>Tocá para usar tu huella</Text>

          <View style={styles.divider} />

          <Text style={styles.orText}>O usá tu PIN</Text>
          <Pressable onPress={() => setMode(hasPin ? "pin" : "setpin")} style={{ paddingVertical: 4 }}>
            <Text style={styles.altLink}>
              {hasPin ? "Ingresar con PIN" : "Crear PIN de respaldo"}
            </Text>
          </Pressable>
        </View>
      )}

      {/* ── PIN / SetPIN mode ── */}
      {(mode === "pin" || mode === "setpin") && (
        <View style={styles.pinSection}>
          <Text style={styles.bioTitle}>{titleText}</Text>
          <Text style={styles.bioSubtitle}>
            {mode === "setpin" && step === "confirm"
              ? "Repetí el PIN para confirmar"
              : "Ingresá tu código de acceso"}
          </Text>

          {/* PIN dots */}
          <Animated.View style={[styles.dotsRow, { transform: [{ translateX: shakeAnim }] }]}>
            {[...Array(PIN_LENGTH)].map((_, i) => (
              <View
                key={i}
                style={[
                  styles.pinDot,
                  { backgroundColor: i < pin.length ? "#1A6FE8" : "#E2E8F0" },
                ]}
              />
            ))}
          </Animated.View>

          {/* Error / lockout */}
          {isLocked && lockedUntil ? (
            <View style={styles.lockoutBadge}>
              <Countdown
                lockedUntil={lockedUntil}
                onExpire={() => { setIsLocked(false); setError(""); setInputPin(""); }}
              />
            </View>
          ) : error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : (
            <View style={{ height: 24 }} />
          )}

          {/* Keypad */}
          <View style={[styles.keypad, { opacity: isLocked ? 0.4 : 1 }]}>
            {digits.map((row, ri) => (
              <View key={ri} style={styles.keyRow}>
                {row.map((d, di) => (
                  <Pressable
                    key={di}
                    onPress={() => {
                      if (isLocked) return;
                      if (d === "del") handleDelete();
                      else if (d !== "") handlePinDigit(d);
                    }}
                    style={({ pressed }) => [
                      styles.key,
                      d === "" ? styles.keyEmpty : { backgroundColor: pressed ? "#E8F0FF" : "#F7F9FC" },
                    ]}
                  >
                    {d === "del" ? (
                      <Ionicons name="backspace-outline" size={22} color="#334155" />
                    ) : d !== "" ? (
                      <Text style={styles.keyText}>{d}</Text>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            ))}
          </View>

          {/* Forgot PIN / switch to bio */}
          <View style={styles.footerRow}>
            <Pressable onPress={() => setMode("setpin")} style={{ paddingVertical: 6 }}>
              <Text style={styles.altLink}>¿Olvidaste tu PIN?</Text>
            </Pressable>
            {canUseBiometrics && (
              <Pressable onPress={() => setMode("bio")} style={{ paddingVertical: 6 }}>
                <Text style={styles.altLink}>Usar huella</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  successContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
  },
  successCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: "center",
    justifyContent: "center",
  },
  successText: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: "#0A1628",
  },

  logoSection: {
    alignItems: "center",
    gap: 8,
    marginBottom: 28,
  },
  logoImg: {
    width: 160,
    height: 160,
  },
  appName: {
    fontSize: 36,
    fontFamily: "Inter_700Bold",
    color: "#0A1628",
    letterSpacing: 1,
  },
  appTagline: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#64748B",
    textAlign: "center",
  },

  bioSection: {
    alignItems: "center",
    gap: 14,
    flex: 1,
    width: "100%",
  },
  bioTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#0A1628",
    textAlign: "center",
  },
  bioSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#64748B",
    textAlign: "center",
    marginBottom: 8,
  },
  bioRingOuter: {
    width: 156,
    height: 156,
    alignItems: "center",
    justifyContent: "center",
  },
  pulseRing: {
    position: "absolute",
    width: 156,
    height: 156,
    borderRadius: 78,
    borderWidth: 2,
    borderColor: "#00D4FF",
  },
  bioRingGradient: {
    width: 148,
    height: 148,
    borderRadius: 74,
    alignItems: "center",
    justifyContent: "center",
    padding: 4,
  },
  bioInner: {
    width: "100%",
    height: "100%",
    borderRadius: 70,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  bioHint: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#64748B",
    marginTop: 4,
  },
  divider: {
    width: "100%",
    height: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 8,
  },
  orText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#64748B",
  },
  altLink: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#1A6FE8",
  },

  pinSection: {
    alignItems: "center",
    gap: 8,
    flex: 1,
    width: "100%",
  },
  dotsRow: {
    flexDirection: "row",
    gap: 18,
    marginTop: 8,
    marginBottom: 4,
  },
  pinDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  lockoutBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#FEF2F2",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  lockoutText: {
    color: "#EF4444",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  errorText: {
    color: "#EF4444",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    height: 24,
  },
  keypad: {
    gap: 10,
    width: "90%",
    maxWidth: 300,
    marginTop: 12,
  },
  keyRow: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
  },
  key: {
    flex: 1,
    height: 58,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  keyEmpty: {
    flex: 1,
    height: 58,
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  keyText: {
    fontSize: 22,
    fontFamily: "Inter_600SemiBold",
    color: "#0A1628",
  },
  footerRow: {
    flexDirection: "row",
    gap: 24,
    marginTop: 8,
  },
});
