import { Feather } from "@expo/vector-icons";
import React, { useState, useRef, useEffect } from "react";
import {
  Animated,
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
import { useAuth } from "@/context/AuthContext";

export function LockScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme !== "light";
  const colors = isDark ? Colors.dark : Colors.light;
  const { unlock, hasBiometrics, hasPin, verifyPin, setPin } = useAuth();
  const [mode, setMode] = useState<"bio" | "pin" | "setpin">(
    hasBiometrics ? "bio" : hasPin ? "pin" : "setpin"
  );
  const [pin, setInputPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [step, setStep] = useState<"enter" | "confirm">("enter");
  const [error, setError] = useState("");
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (mode === "bio") {
      unlock();
    }
  }, []);

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const handlePinDigit = async (digit: string) => {
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
          setError("PIN incorrecto");
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
      : "Ingresá tu PIN";

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top + 40,
          paddingBottom: insets.bottom + 20,
        },
      ]}
    >
      <View style={styles.logoRow}>
        <Feather name="shield" size={32} color={colors.tint} />
        <Text style={[styles.appName, { color: colors.text }]}>uni.id</Text>
      </View>

      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        {mode === "bio" ? "Verificá tu identidad" : titleText}
      </Text>

      {mode === "bio" && (
        <Pressable
          onPress={() => unlock()}
          style={({ pressed }) => [
            styles.bioBtn,
            { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Feather name="unlock" size={28} color="#fff" />
          <Text style={styles.bioBtnText}>
            {Platform.OS === "ios" ? "Face ID / Touch ID" : "Huella digital"}
          </Text>
        </Pressable>
      )}

      {(mode === "pin" || mode === "setpin") && (
        <>
          <Animated.View
            style={[styles.dots, { transform: [{ translateX: shakeAnim }] }]}
          >
            {[...Array(6)].map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  {
                    backgroundColor:
                      i < pin.length ? colors.tint : colors.border,
                    transform: [{ scale: i < pin.length ? 1.2 : 1 }],
                  },
                ]}
              />
            ))}
          </Animated.View>

          {error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : null}

          <View style={styles.keypad}>
            {digits.map((row, ri) => (
              <View key={ri} style={styles.row}>
                {row.map((d, di) => (
                  <Pressable
                    key={di}
                    onPress={() => {
                      if (d === "del") handleDelete();
                      else if (d !== "") handlePinDigit(d);
                    }}
                    style={({ pressed }) => [
                      styles.key,
                      d === ""
                        ? styles.keyEmpty
                        : {
                            backgroundColor: pressed
                              ? colors.tint + "30"
                              : colors.backgroundCard,
                            borderColor: colors.border,
                          },
                    ]}
                  >
                    {d === "del" ? (
                      <Feather name="delete" size={22} color={colors.text} />
                    ) : (
                      <Text style={[styles.keyText, { color: colors.text }]}>
                        {d}
                      </Text>
                    )}
                  </Pressable>
                ))}
              </View>
            ))}
          </View>
        </>
      )}

      {mode === "bio" && hasBiometrics && (
        <Pressable onPress={() => setMode("pin")} style={styles.altBtn}>
          <Text style={[styles.altBtnText, { color: colors.tint }]}>
            Usar PIN en su lugar
          </Text>
        </Pressable>
      )}

      <Text style={[styles.footer, { color: colors.textSecondary }]}>
        Tus datos están cifrados y protegidos en tu dispositivo
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    gap: 20,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  appName: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    marginBottom: 16,
  },
  bioBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 32,
    paddingVertical: 18,
    borderRadius: 20,
  },
  bioBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  dots: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 8,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  errorText: {
    color: "#F56565",
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  keypad: {
    gap: 14,
    width: "80%",
    maxWidth: 320,
  },
  row: {
    flexDirection: "row",
    gap: 14,
    justifyContent: "center",
  },
  key: {
    flex: 1,
    aspectRatio: 1.4,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  keyEmpty: {
    flex: 1,
    aspectRatio: 1.4,
    backgroundColor: "transparent",
  },
  keyText: {
    fontSize: 22,
    fontFamily: "Inter_600SemiBold",
  },
  altBtn: {
    paddingVertical: 10,
  },
  altBtnText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  footer: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    paddingHorizontal: 40,
    position: "absolute",
    bottom: 40,
  },
});
