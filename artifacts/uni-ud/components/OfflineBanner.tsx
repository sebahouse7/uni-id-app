import { Feather } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { Animated, Platform, Pressable, StyleSheet, Text } from "react-native";

import { useNetwork } from "@/context/NetworkContext";

export function OfflineBanner() {
  const { isOnline, isChecking, checkConnection } = useNetwork();
  const slideAnim = useRef(new Animated.Value(-60)).current;

  useEffect(() => {
    if (Platform.OS === "web") return;
    Animated.spring(slideAnim, {
      toValue: isOnline ? -60 : 0,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, [isOnline]);

  if (isOnline && !isChecking) return null;

  return (
    <Animated.View
      style={[styles.banner, { transform: [{ translateY: slideAnim }] }]}
    >
      <Feather
        name={isChecking ? "refresh-cw" : "wifi-off"}
        size={14}
        color="#fff"
      />
      <Text style={styles.text}>
        {isChecking ? "Reconectando..." : "Sin conexión al servidor"}
      </Text>
      {!isChecking && (
        <Pressable onPress={checkConnection} style={styles.retry}>
          <Text style={styles.retryText}>Reintentar</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    backgroundColor: "#E53535",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 8,
  },
  text: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  retry: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 8,
  },
  retryText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
});
