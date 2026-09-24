import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import React from "react";
import CompareScreen from "../screens/CompareScreen";
import MarketScreen from "../screens/MarketScreen";
import NewsScreen from "../screens/NewsScreen";
import PortfolioScreen from "../screens/PortfolioScreen";
import StockDetailScreen from "../screens/StockDetailScreen";
import WatchlistScreen from "../screens/WatchlistScreen";
import { colors, fonts } from "../theme";
import type { RootStackParamList, TabParamList } from "../types";

const TAB_ICONS: Record<keyof TabParamList, React.ComponentProps<typeof Feather>["name"]> = {
  Watchlist: "list",
  Market: "activity",
  News: "file-text",
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
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.hairline },
        tabBarLabelStyle: { fontFamily: fonts.sansMedium, fontSize: 11 },
        tabBarIcon: ({ color, size }) => (
          <Feather name={TAB_ICONS[route.name]} color={color} size={size - 4} />
        ),
      })}
    >
      <Tab.Screen name="Watchlist" component={WatchlistScreen} options={{ title: "관심종목" }} />
      <Tab.Screen name="Market" component={MarketScreen} options={{ title: "시장" }} />
      <Tab.Screen name="News" component={NewsScreen} options={{ title: "뉴스" }} />
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
        <Stack.Screen name="Portfolio" component={PortfolioScreen} options={{ title: "포트폴리오" }} />
        <Stack.Screen name="Compare" component={CompareScreen} options={{ title: "종목 비교" }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
