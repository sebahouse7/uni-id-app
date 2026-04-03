import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
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
import { useAuth } from "@/context/AuthContext";

function Countdown({ lockedUntil, onExpire }: { lockedUntil: number; onExpire: () => void }) {
  const [seconds, setSeconds] = useState(Math.ceil((lockedUntil - Date.now()) / 1000));
  useEffect(() => {
    if (seconds <= 0) { onExpire(); return; }
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);
  return (
    <Text style={styles.lockoutText}>
      Bloqueado por {seconds}s
    </Text>
  );
}

export function LockScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme !== "light";
  const colors = isDark ? Colors.dark : Colors.light;
  const { unlock, hasBiometrics, hasPin, verifyPin, setPin, failedAttempts, lockedUntil, successState } = useAuth();

  const [mode, setMode] = useState<"bio" | "pin" | "setpin">(
    hasBiometrics ? "bio" : hasPin ? "pin" : "setpin"
  );
  const [pin, setInputPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [step, setStep] = useState<"enter" | "confirm">("enter");
  const [error, setError] = useState("");
  const [isLocked, setIsLocked] = useState(lockedUntil != null && lockedUntil > Date.now());
  const bioAutoTriggeredRef = useRef(false);

  useEffect(() => {
    if (mode === "bio" && !bioAutoTriggeredRef.current && !isLocked) {
      bioAutoTriggeredRef.current = true;
      unlock();
    }
  }, [mode]);

  const shakeAnim = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;
  const successScale = useRef(new Animated.Value(1)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 600, useNativeDriver: true }).start();
  }, []);

  useEffect(() => {
    if (successState) {
      Animated.parallel([
        Animated.spring(successScale, { toValue: 1.15, useNativeDriver: true }),
        Animated.timing(successOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      successScale.setValue(1);
      successOpacity.setValue(0);
    }
  }, [successState]);

  useEffect(() => {
    setIsLocked(lockedUntil != null && lockedUntil > Date.now());
  }, [lockedUntil]);

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 12, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -12, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const handlePinDigit = async (digit: string) => {
    if (isLocked) return;
    const next = pin + digit;
    setInputPin(next);
    setError("");

    if (next.length === 6) {
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
            setError("Los PINs no coinciden. Intentá de nuevo.");
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
          if (remaining > 0) {
            setError(`PIN incorrecto · ${remaining} intento${remaining !== 1 ? "s" : ""} restante${remaining !== 1 ? "s" : ""}`);
          } else {
            setError("Cuenta bloqueada temporalmente");
            setIsLocked(true);
          }
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
      ? step === "enter"
        ? "Creá tu PIN de 6 dígitos"
        : "Confirmá tu PIN"
      : isLocked
      ? "Cuenta bloqueada"
      : "Ingresá tu PIN";

  if (successState) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Animated.View style={[styles.successContainer, { opacity: successOpacity, transform: [{ scale: successScale }] }]}>
          <LinearGradient colors={["#22C55E", "#16A34A"]} style={styles.successCircle}>
            <Feather name="check" size={40} color="#fff" />
          </LinearGradient>
          <Text style={[styles.successText, { color: colors.text }]}>¡Acceso concedido!</Text>
        </Animated.View>
      </View>
    );
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) + 32,
          paddingBottom: insets.bottom + 24,
          opacity: fadeIn,
        },
      ]}
    >
      {/* Logo & branding */}
      <View style={styles.logoSection}>
        <LinearGradient
          colors={successState ? ["#22C55E", "#16A34A"] : ["#1A6FE8", "#0D8AEB"]}
          style={styles.logoIcon}
        >
          <Feather name="shield" size={28} color="#fff" />
        </LinearGradient>
        <Text style={[styles.appName, { color: colors.text }]}>uni.id</Text>
        <Text style={[styles.appTagline, { color: colors.textSecondary }]}>
          {mode === "bio" ? "Verificá tu identidad" : titleText}
        </Text>
      </View>

      {/* Biometric unlock */}
      {mode === "bio" && (
        <View style={styles.bioSection}>
          <Pressable
            onPress={() => unlock()}
            style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
          >
            <LinearGradient
              colors={["#1A6FE8", "#0D8AEB"]}
              style={styles.bioBtn}
            >
              <Feather name="unlock" size={26} color="#fff" />
              <Text style={styles.bioBtnText}>
                {Platform.OS === "ios" ? "Face ID / Touch ID" : "Huella digital"}
              </Text>
            </LinearGradient>
          </Pressable>

          <Pressable
            onPress={() => setMode(hasPin ? "pin" : "setpin")}
            style={styles.altBtn}
          >
            <Text style={[styles.altBtnText, { color: colors.tint }]}>
              {hasPin ? "Usar PIN en su lugar" : "Crear PIN de respaldo"}
            </Text>
          </Pressable>
        </View>
      )}

      {/* PIN input */}
      {(mode === "pin" || mode === "setpin") && (
        <View style={styles.pinSection}>
          {/* PIN dots */}
          <Animated.View
            style={[styles.dotsRow, { transform: [{ translateX: shakeAnim }] }]}
          >
            {[...Array(6)].map((_, i) => (
              <View
                key={i}
                style={[
                  styles.pinDot,
                  {
                    backgroundColor:
                      i < pin.length
                        ? colors.tint
                        : isDark
                        ? "#1E2D4A"
                        : "#E2E8F0",
                    transform: [{ scale: i < pin.length ? 1.15 : 1 }],
                  },
                ]}
              />
            ))}
          </Animated.View>

          {/* Lockout countdown */}
          {isLocked && lockedUntil ? (
            <View style={[styles.lockoutBadge, { backgroundColor: "#E5353518", borderColor: "#E5353540" }]}>
              <Feather name="lock" size={14} color="#E53535" />
              <Countdown
                lockedUntil={lockedUntil}
                onExpire={() => {
                  setIsLocked(false);
                  setError("");
                  setInputPin("");
                }}
              />
            </View>
          ) : error ? (
            <View style={styles.errorRow}>
              <Feather name="alert-circle" size={14} color="#F56565" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : (
            <View style={{ height: 30 }} />
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
                      d === ""
                        ? styles.keyEmpty
                        : {
                            backgroundColor: pressed
                              ? colors.tint + "25"
                              : colors.backgroundCard,
                            borderColor: colors.border,
                          },
                    ]}
                  >
                    {d === "del" ? (
                      <Feather name="delete" size={20} color={colors.text} />
                    ) : d !== "" ? (
                      <Text style={[styles.keyText, { color: colors.text }]}>{d}</Text>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Footer */}
      <Text style={[styles.footer, { color: colors.textSecondary }]}>
        🔒 Cifrado AES-256 · Datos protegidos en tu dispositivo
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "space-between",
  },
  successContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
  },
  successCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  successText: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
  },
  logoSection: {
    alignItems: "center",
    gap: 12,
  },
  logoIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  appName: {
    fontSize: 32,
    fontFamily: "Inter_700Bold",
  },
  appTagline: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
  },

  bioSection: {
    alignItems: "center",
    gap: 16,
    flex: 1,
    justifyContent: "center",
  },
  bioBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 36,
    paddingVertical: 18,
    borderRadius: Radii.xl,
  },
  bioBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  altBtn: { paddingVertical: 10 },
  altBtnText: { fontSize: 14, fontFamily: "Inter_500Medium" },

  pinSection: {
    alignItems: "center",
    gap: 8,
    flex: 1,
    justifyContent: "center",
    width: "100%",
  },
  dotsRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 4,
  },
  pinDot: {
    width: 15,
    height: 15,
    borderRadius: 7.5,
  },
  lockoutBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: Radii.pill,
    borderWidth: 1,
  },
  lockoutText: {
    color: "#E53535",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 30,
  },
  errorText: {
    color: "#F56565",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  keypad: {
    gap: 12,
    width: "78%",
    maxWidth: 310,
    marginTop: 16,
  },
  keyRow: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "center",
  },
  key: {
    flex: 1,
    aspectRatio: 1.5,
    borderRadius: Radii.lg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  keyEmpty: {
    flex: 1,
    aspectRatio: 1.5,
    backgroundColor: "transparent",
  },
  keyText: {
    fontSize: 22,
    fontFamily: "Inter_600SemiBold",
  },

  footer: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    paddingHorizontal: 40,
  },
});
