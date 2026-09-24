import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import React from "react";
import { Text } from "react-native";
import CompareScreen from "../screens/CompareScreen";
import NewsScreen from "../screens/NewsScreen";
import PortfolioScreen from "../screens/PortfolioScreen";
import StockDetailScreen from "../screens/StockDetailScreen";
import WatchlistScreen from "../screens/WatchlistScreen";
import { colors } from "../theme";
import type { RootStackParamList, TabParamList } from "../types";

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
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarIcon: () => (
          <Text>{route.name === "Watchlist" ? "📈" : "📰"}</Text>
        ),
      })}
    >
      <Tab.Screen name="Watchlist" component={WatchlistScreen} options={{ title: "관심종목" }} />
      <Tab.Screen name="News" component={NewsScreen} options={{ title: "뉴스" }} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text }}>
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
