import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  View,
} from "react-native";

interface Props {
  onFinish: () => void;
}

const LOGO = require("../assets/images/icon.png");

export function SplashScreenCustom({ onFinish }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale   = useRef(new Animated.Value(0.82)).current;
  const fadeOut = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const fallback = setTimeout(() => onFinish(), 2800);

    Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 500,
          easing: Easing.out(Easing.back(1.2)),
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(800),
      Animated.timing(fadeOut, {
        toValue: 0,
        duration: 350,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => {
      clearTimeout(fallback);
      onFinish();
    });

    return () => clearTimeout(fallback);
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity: fadeOut }]}>
      <Animated.View style={[styles.content, { opacity, transform: [{ scale }] }]}>
        <View style={styles.logoContainer}>
          <Image source={LOGO} style={styles.logo} resizeMode="cover" />
        </View>
        <Text style={styles.title}>UNI ID</Text>
        <Text style={styles.sub}>human.id labs</Text>
      </Animated.View>

      <Animated.Text style={[styles.footerText, { opacity }]}>
        Identidad digital segura
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0a0f1f",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },
  content: {
    alignItems: "center",
    justifyContent: "center",
  },
  logoContainer: {
    width: 110,
    height: 110,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "#0a0f1f",
    marginBottom: 24,
  },
  logo: {
    width: 140,
    height: 140,
    marginLeft: -15,
    marginTop: -15,
  },
  title: {
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: 6,
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
  },
  sub: {
    marginTop: 6,
    fontSize: 13,
    letterSpacing: 2.5,
    color: "#00D4FF",
    textTransform: "lowercase",
    fontFamily: "Inter_400Regular",
  },
  footerText: {
    position: "absolute",
    bottom: 52,
    fontSize: 11,
    color: "rgba(255,255,255,0.3)",
    letterSpacing: 1.5,
    fontFamily: "Inter_400Regular",
  },
});
