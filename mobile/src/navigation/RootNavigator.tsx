import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AccountScreen from "../screens/AccountScreen";
import MarketScreen from "../screens/MarketScreen";
import StockDetailScreen from "../screens/StockDetailScreen";
import StocksScreen from "../screens/StocksScreen";
import TodayScreen from "../screens/TodayScreen";
import { colors, fonts } from "../theme";
import type { RootStackParamList, TabParamList } from "../types";

// Tabs per docs/app-design.md: 오늘 · 종목 · 시장 · 계좌. The stock report opens on top of them.
const TAB_ICONS: Record<keyof TabParamList, React.ComponentProps<typeof Feather>["name"]> = {
  Today: "sun",
  Stocks: "list",
  Market: "activity",
  Account: "briefcase",
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.surface,
    border: colors.border,
    primary: colors.accent,
    text: colors.text,
  },
};

function Tabs() {
  // Tab screens draw their own titles (no navigation header), so keep them below the status bar /
  // notch here once instead of in every screen.
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      sceneContainerStyle={{ paddingTop: insets.top, backgroundColor: colors.background }}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.hairline },
        tabBarLabelStyle: { fontFamily: fonts.sansMedium, fontSize: 11 },
        tabBarIcon: ({ color, size }) => <Feather name={TAB_ICONS[route.name]} color={color} size={size - 4} />,
      })}
    >
      <Tab.Screen name="Today" component={TodayScreen} options={{ title: "오늘" }} />
      <Tab.Screen name="Stocks" component={StocksScreen} options={{ title: "종목" }} />
      <Tab.Screen name="Market" component={MarketScreen} options={{ title: "시장" }} />
      <Tab.Screen name="Account" component={AccountScreen} options={{ title: "계좌" }} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
          headerTintColor: colors.text,
          headerTitleStyle: { fontFamily: fonts.sansBold, fontSize: 16 },
          headerBackTitleVisible: false,
        }}
      >
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen
          name="StockDetail"
          component={StockDetailScreen}
          options={({ route }) => ({ title: route.params.symbol })}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
