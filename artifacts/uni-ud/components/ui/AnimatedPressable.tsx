import React, { useRef } from "react";
import { Animated, Pressable, StyleProp, ViewStyle } from "react-native";

interface Props {
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  scale?: number;
  disabled?: boolean;
  hitSlop?: number;
}

export function AnimatedPressable({
  onPress,
  onLongPress,
  style,
  children,
  scale = 0.96,
  disabled,
  hitSlop,
}: Props) {
  const anim = useRef(new Animated.Value(1)).current;

  const pressIn = () => {
    Animated.spring(anim, {
      toValue: scale,
      useNativeDriver: true,
      friction: 8,
      tension: 200,
    }).start();
  };

  const pressOut = () => {
    Animated.spring(anim, {
      toValue: 1,
      useNativeDriver: true,
      friction: 6,
      tension: 200,
    }).start();
  };

  return (
    <Animated.View style={[{ transform: [{ scale: anim }] }, style]}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        disabled={disabled}
        hitSlop={hitSlop}
        style={{ flex: 1 }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
