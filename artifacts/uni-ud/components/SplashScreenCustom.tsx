import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Circle, Line } from "react-native-svg";

interface Props {
  onFinish: () => void;
}

function NodeLogo({ size = 80 }: { size?: number }) {
  const s = size;
  const cx = s / 2;
  const cy = s / 2;
  const r = s * 0.08;
  const blue = "#1A6FE8";
  const cyan = "#00D4FF";

  const nodes = [
    { x: cx,          y: cy * 0.28,   r: r * 1.4, fill: blue },
    { x: cx * 0.28,   y: cy * 1.55,   r: r * 1.1, fill: cyan },
    { x: cx * 1.72,   y: cy * 1.55,   r: r * 1.1, fill: blue },
    { x: cx * 1.6,    y: cy * 0.5,    r: r * 0.8, fill: cyan },
    { x: cx * 0.4,    y: cy * 0.5,    r: r * 0.8, fill: blue },
    { x: cx,          y: cy * 1.72,   r: r * 0.8, fill: cyan },
  ];

  const edges = [
    [0, 3], [0, 4], [0, 2], [0, 1],
    [3, 2], [4, 1], [1, 5], [2, 5], [3, 4],
  ];

  return (
    <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      {edges.map(([a, b], i) => (
        <Line
          key={i}
          x1={nodes[a].x} y1={nodes[a].y}
          x2={nodes[b].x} y2={nodes[b].y}
          stroke={blue}
          strokeWidth={s * 0.018}
          strokeOpacity={0.35}
        />
      ))}
      {nodes.map((n, i) => (
        <Circle key={i} cx={n.x} cy={n.y} r={n.r} fill={n.fill} />
      ))}
    </Svg>
  );
}

export function SplashScreenCustom({ onFinish }: Props) {
  const opacity  = useRef(new Animated.Value(0)).current;
  const scale    = useRef(new Animated.Value(0.82)).current;
  const fadeOut  = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          friction: 7,
          tension: 60,
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(900),
      Animated.timing(fadeOut, {
        toValue: 0,
        duration: 380,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => onFinish());
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity: fadeOut }]}>
      <Animated.View
        style={[
          styles.content,
          { opacity, transform: [{ scale }] },
        ]}
      >
        <View style={styles.logoWrap}>
          <NodeLogo size={96} />
        </View>

        <Text style={styles.title}>UNI ID</Text>
        <Text style={styles.sub}>human.id labs</Text>
      </Animated.View>

      <Animated.View style={[styles.footer, { opacity }]}>
        <Text style={styles.footerText}>Identidad digital segura</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },
  content: {
    alignItems: "center",
    justifyContent: "center",
  },
  logoWrap: {
    marginBottom: 24,
    shadowColor: "#1A6FE8",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 8,
  },
  title: {
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: 6,
    color: "#0A0F1E",
    fontFamily: "Inter_700Bold",
  },
  sub: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "400",
    letterSpacing: 2.5,
    color: "#1A6FE8",
    textTransform: "lowercase",
    fontFamily: "Inter_400Regular",
  },
  footer: {
    position: "absolute",
    bottom: 52,
  },
  footerText: {
    fontSize: 11,
    color: "#9BA3B2",
    letterSpacing: 1.5,
    fontFamily: "Inter_400Regular",
  },
});
