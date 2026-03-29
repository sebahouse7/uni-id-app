import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  Platform,
  StyleSheet,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { useLanguage } from "@/context/LanguageContext";

function NativeTabLayout() {
  const { t } = useLanguage();
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "house", selected: "house.fill" }} />
        <Label>{t.tabHome}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="documents">
        <Icon sf={{ default: "doc.text", selected: "doc.text.fill" }} />
        <Label>{t.tabDocs}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="security">
        <Icon sf={{ default: "shield", selected: "shield.fill" }} />
        <Label>{t.tabSecurity}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="network">
        <Icon sf={{ default: "network", selected: "network" }} />
        <Label>{t.tabNetwork}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <Icon sf={{ default: "person", selected: "person.fill" }} />
        <Label>{t.tabProfile}</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function TabIcon({
  name,
  color,
  focused,
}: {
  name: string;
  color: string;
  focused: boolean;
}) {
  return (
    <View style={[tabIconStyles.wrap, focused && tabIconStyles.wrapFocused]}>
      <Feather name={name as any} size={21} color={color} />
    </View>
  );
}

const tabIconStyles = StyleSheet.create({
  wrap: {
    width: 40,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  wrapFocused: {},
});

function ClassicTabLayout() {
  const colorScheme = useColorScheme();
  const safeAreaInsets = useSafeAreaInsets();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";
  const colors = isDark ? Colors.dark : Colors.light;
  const { t } = useLanguage();

  const TAB_HEIGHT = isWeb ? 68 : 60;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: isDark ? "#00D4FF" : "#1A6FE8",
        tabBarInactiveTintColor: isDark ? "#3A4A6A" : "#9AA3B2",
        tabBarLabelStyle: {
          fontFamily: "Inter_500Medium",
          fontSize: 11,
          marginTop: 2,
        },
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS
            ? "transparent"
            : isDark
            ? "#080F1E"
            : "#FFFFFF",
          borderTopWidth: 1,
          borderTopColor: isDark ? "#1A2540" : "#E8EEF8",
          elevation: 0,
          paddingBottom: isWeb ? 8 : safeAreaInsets.bottom,
          height: TAB_HEIGHT + (isWeb ? 0 : safeAreaInsets.bottom),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={90}
              tint={isDark ? "dark" : "light"}
              style={[StyleSheet.absoluteFill, { borderTopWidth: 1, borderTopColor: isDark ? "#1A2540" : "#E8EEF8" }]}
            />
          ) : (
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: isDark ? "#080F1E" : "#FFFFFF",
                },
              ]}
            />
          ),
        tabBarIcon: ({ color, focused, name }: any) => (
          <TabIcon name={name} color={color} focused={focused} />
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t.tabHome,
          tabBarIcon: ({ color, focused }) =>
            isIOS ? (
              <SymbolView
                name={focused ? "house.fill" : "house"}
                tintColor={color}
                size={23}
              />
            ) : (
              <TabIcon name="home" color={color} focused={focused} />
            ),
        }}
      />
      <Tabs.Screen
        name="documents"
        options={{
          title: t.tabDocs,
          tabBarIcon: ({ color, focused }) =>
            isIOS ? (
              <SymbolView
                name={focused ? "doc.text.fill" : "doc.text"}
                tintColor={color}
                size={23}
              />
            ) : (
              <TabIcon name="file-text" color={color} focused={focused} />
            ),
        }}
      />
      <Tabs.Screen
        name="security"
        options={{
          title: t.tabSecurity,
          tabBarIcon: ({ color, focused }) =>
            isIOS ? (
              <SymbolView
                name={focused ? "shield.fill" : "shield"}
                tintColor={color}
                size={23}
              />
            ) : (
              <TabIcon name="shield" color={color} focused={focused} />
            ),
        }}
      />
      <Tabs.Screen
        name="network"
        options={{
          title: t.tabNetwork,
          tabBarIcon: ({ color, focused }) =>
            isIOS ? (
              <SymbolView
                name="network"
                tintColor={color}
                size={23}
              />
            ) : (
              <TabIcon name="share-2" color={color} focused={focused} />
            ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t.tabProfile,
          tabBarIcon: ({ color, focused }) =>
            isIOS ? (
              <SymbolView
                name={focused ? "person.fill" : "person"}
                tintColor={color}
                size={23}
              />
            ) : (
              <TabIcon name="user" color={color} focused={focused} />
            ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
