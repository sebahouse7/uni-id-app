import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/context/AuthContext";

const LOGO = require("../assets/images/icon.png");
const PIN_LENGTH = 6;
const MAX_FAILS  = 5;

// ── Countdown ─────────────────────────────────────────────────────────────────

function Countdown({ lockedUntil, onExpire }: { lockedUntil: number; onExpire: () => void }) {
  const [seconds, setSeconds] = useState(Math.ceil((lockedUntil - Date.now()) / 1000));
  useEffect(() => {
    if (seconds <= 0) { onExpire(); return; }
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return <Text style={styles.lockoutText}>Bloqueado — esperá {mins > 0 ? `${mins}m ${secs}s` : `${seconds}s`}</Text>;
}

function DelayCountdown({ nextAttemptAt, onExpire }: { nextAttemptAt: number; onExpire: () => void }) {
  const [seconds, setSeconds] = useState(Math.ceil((nextAttemptAt - Date.now()) / 1000));
  useEffect(() => {
    if (seconds <= 0) { onExpire(); return; }
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);
  return <Text style={styles.delayText}>Esperá {seconds}s antes del próximo intento</Text>;
}

// ── Pulsing ring ──────────────────────────────────────────────────────────────

function PulsingRing({ animate }: { animate: boolean }) {
  const scale   = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    if (!animate) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1.22, duration: 950, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0,    duration: 950, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1,   duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.6, duration: 0, useNativeDriver: true }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [animate]);
  return (
    <Animated.View style={[styles.pulseRing, { transform: [{ scale }], opacity }]} />
  );
}

// ── LockScreen ────────────────────────────────────────────────────────────────

export function LockScreen() {
  const insets = useSafeAreaInsets();
  const {
    unlock, hasBiometrics, biometricsEnabled, hasPin,
    verifyPin, setPin, failedAttempts, lockedUntil, nextAttemptAt, successState,
  } = useAuth();

  const canUseBiometrics = hasBiometrics && biometricsEnabled;
  const [mode,      setMode]      = useState<"bio" | "pin" | "setpin">(
    canUseBiometrics ? "bio" : hasPin ? "pin" : "setpin"
  );
  const [pin,       setInputPin]  = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [step,      setStep]      = useState<"enter" | "confirm">("enter");
  const [error,     setError]     = useState("");
  const [isLocked,  setIsLocked]  = useState(lockedUntil != null && lockedUntil > Date.now());
  const [isDelayed, setIsDelayed] = useState(nextAttemptAt != null && nextAttemptAt > Date.now());

  const bioAutoTriggeredRef = useRef(false);

  useEffect(() => {
    if (mode === "bio" && canUseBiometrics && !bioAutoTriggeredRef.current && !isLocked) {
      bioAutoTriggeredRef.current = true;
      unlock();
    }
  }, [mode, canUseBiometrics]);

  useEffect(() => { setIsLocked(lockedUntil != null && lockedUntil > Date.now()); }, [lockedUntil]);
  useEffect(() => { setIsDelayed(nextAttemptAt != null && nextAttemptAt > Date.now()); }, [nextAttemptAt]);

  const shakeAnim = useRef(new Animated.Value(0)).current;
  const fadeIn    = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(logoScale, { toValue: 1, friction: 6, useNativeDriver: true }),
    ]).start();
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
    if (isLocked || isDelayed) return;
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
          const newFails  = failedAttempts + 1;
          const remaining = MAX_FAILS - newFails;
          if (remaining > 0) {
            setError(`PIN incorrecto · ${remaining} intento${remaining !== 1 ? "s" : ""} restante${remaining !== 1 ? "s" : ""}`);
          } else {
            setIsLocked(true);
          }
          setInputPin("");
        }
      }
    }
  };

  const handleDelete = () => { setInputPin((p) => p.slice(0, -1)); setError(""); };

  const handleForgotPin = () => {
    Alert.alert(
      "Restablecer PIN",
      "Vas a crear un PIN nuevo. ¿Continuás?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Crear nuevo PIN",
          onPress: () => {
            setInputPin(""); setConfirmPin(""); setStep("enter"); setError(""); setMode("setpin");
          },
        },
      ]
    );
  };

  const digits = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["",  "0", "del"],
  ];

  const titleText =
    mode === "setpin"
      ? step === "enter" ? "Creá tu PIN de acceso" : "Confirmá tu PIN"
      : isLocked ? "Cuenta bloqueada"
      : "Ingresá tu PIN";

  // ── Success ────────────────────────────────────────────────────────────────

  if (successState) {
    return (
      <View style={styles.successContainer}>
        <LinearGradient colors={["#0a0f1f", "#0d1a35"]} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={["#0066CC", "#00D4FF"]} style={styles.successCircle}>
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
          paddingTop:    insets.top + (Platform.OS === "web" ? 67 : 0) + 20,
          paddingBottom: insets.bottom + 24,
          opacity:       fadeIn,
        },
      ]}
    >
      <LinearGradient colors={["#0a0f1f", "#0d1a35"]} style={StyleSheet.absoluteFill} />

      {/* ── Logo ── */}
      <View style={styles.logoSection}>
        <Animated.View style={{ transform: [{ scale: logoScale }] }}>
          <Image source={LOGO} style={styles.logoImg} resizeMode="contain" />
        </Animated.View>
        <Text style={styles.appName}>UNI ID</Text>
        <Text style={styles.appTagline}>Tu identidad digital unificada</Text>
      </View>

      {/* ── Bio mode ── */}
      {mode === "bio" && (
        <View style={styles.bioSection}>
          <Text style={styles.bioTitle}>Entrá a tu identidad digital</Text>
          <Text style={styles.bioSubtitle}>Usá tu huella o PIN para continuar</Text>

          <Pressable
            onPress={() => unlock()}
            style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, alignItems: "center" })}
          >
            <View style={styles.bioRingOuter}>
              <PulsingRing animate />
              <LinearGradient
                colors={["#0066CC", "#00D4FF", "#6C47FF"]}
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

          <Text style={styles.bioHint}>Tocá para ingresar</Text>

          <View style={styles.divider} />

          <Pressable
            onPress={() => setMode(hasPin ? "pin" : "setpin")}
            style={{ paddingVertical: 8 }}
          >
            <Text style={styles.altLink}>
              {hasPin ? "Ingresar con PIN" : "Crear PIN de respaldo"}
            </Text>
          </Pressable>

          <Pressable style={{ paddingVertical: 4 }}>
            <Text style={styles.createLink}>Crear identidad nueva</Text>
          </Pressable>
        </View>
      )}

      {/* ── PIN / SetPIN ── */}
      {(mode === "pin" || mode === "setpin") && (
        <View style={styles.pinSection}>
          <Text style={styles.bioTitle}>{titleText}</Text>
          <Text style={styles.bioSubtitle}>
            {mode === "setpin" && step === "confirm"
              ? "Repetí el PIN para confirmar"
              : "Ingresá tu código de acceso"}
          </Text>

          <Animated.View style={[styles.dotsRow, { transform: [{ translateX: shakeAnim }] }]}>
            {[...Array(PIN_LENGTH)].map((_, i) => (
              <View
                key={i}
                style={[
                  styles.pinDot,
                  { backgroundColor: i < pin.length ? "#00D4FF" : "rgba(255,255,255,0.15)" },
                ]}
              />
            ))}
          </Animated.View>

          {isLocked && lockedUntil ? (
            <View style={styles.lockoutBadge}>
              <Countdown
                lockedUntil={lockedUntil}
                onExpire={() => { setIsLocked(false); setError(""); setInputPin(""); }}
              />
            </View>
          ) : isDelayed && nextAttemptAt ? (
            <View style={styles.lockoutBadge}>
              <DelayCountdown
                nextAttemptAt={nextAttemptAt}
                onExpire={() => { setIsDelayed(false); setError(""); }}
              />
            </View>
          ) : error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : (
            <View style={{ height: 24 }} />
          )}

          {/* Keypad */}
          <View style={[styles.keypad, { opacity: (isLocked || isDelayed) ? 0.35 : 1 }]}>
            {digits.map((row, ri) => (
              <View key={ri} style={styles.keyRow}>
                {row.map((d, di) => (
                  <Pressable
                    key={di}
                    onPress={() => {
                      if (isLocked || isDelayed) return;
                      if (d === "del") handleDelete();
                      else if (d !== "") handlePinDigit(d);
                    }}
                    style={({ pressed }) => [
                      styles.key,
                      d === "" ? styles.keyEmpty : {
                        backgroundColor: pressed
                          ? "rgba(0,212,255,0.15)"
                          : "rgba(255,255,255,0.06)",
                      },
                    ]}
                  >
                    {d === "del" ? (
                      <Ionicons name="backspace-outline" size={22} color="rgba(255,255,255,0.7)" />
                    ) : d !== "" ? (
                      <Text style={styles.keyText}>{d}</Text>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            ))}
          </View>

          <View style={styles.footerRow}>
            {mode === "pin" && (
              <TouchableOpacity onPress={handleForgotPin} activeOpacity={0.6} style={styles.footerBtn}
                hitSlop={{ top: 16, bottom: 16, left: 20, right: 20 }}>
                <Text style={styles.altLink}>¿Olvidaste tu PIN?</Text>
              </TouchableOpacity>
            )}
            {canUseBiometrics && (
              <TouchableOpacity onPress={() => setMode("bio")} activeOpacity={0.6} style={styles.footerBtn}
                hitSlop={{ top: 16, bottom: 16, left: 20, right: 20 }}>
                <Text style={styles.altLink}>Usar huella</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* ── Security footer ── */}
      <View style={styles.securityFooter}>
        <Ionicons name="shield-checkmark" size={13} color="#4A90D9" />
        <Text style={styles.securityText}>Seguridad activa · Cifrado extremo a extremo</Text>
      </View>
    </Animated.View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 32,
  },
  successContainer: {
    flex: 1,
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
    color: "#FFFFFF",
  },

  logoSection: {
    alignItems: "center",
    gap: 6,
    marginBottom: 24,
  },
  logoImg: {
    width: 120,
    height: 120,
    borderRadius: 26,
  },
  appName: {
    fontSize: 34,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    letterSpacing: 2,
  },
  appTagline: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.45)",
    textAlign: "center",
  },

  bioSection: {
    alignItems: "center",
    gap: 12,
    flex: 1,
    width: "100%",
  },
  bioTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    textAlign: "center",
  },
  bioSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
    marginBottom: 4,
  },
  bioRingOuter: {
    width: 160,
    height: 160,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 8,
  },
  pulseRing: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
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
    color: "rgba(255,255,255,0.45)",
    marginTop: 2,
  },
  divider: {
    width: "60%",
    height: 1,
    backgroundColor: "rgba(255,255,255,0.1)",
    marginVertical: 4,
  },
  altLink: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#00D4FF",
  },
  createLink: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#4A90D9",
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
    backgroundColor: "rgba(239,68,68,0.1)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.3)",
  },
  lockoutText: {
    color: "#F87171",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  delayText: {
    color: "#FBBF24",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  errorText: {
    color: "#F87171",
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
    borderColor: "rgba(255,255,255,0.08)",
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
    color: "#FFFFFF",
  },
  footerRow: {
    flexDirection: "row",
    gap: 24,
    marginTop: 8,
  },
  footerBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },

  securityFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  securityText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.3)",
  },
});
