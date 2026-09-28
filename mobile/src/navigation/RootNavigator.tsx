import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AccountScreen from "../screens/AccountScreen";
import MarketScreen from "../screens/MarketScreen";
import OutlookScreen from "../screens/OutlookScreen";
import StockDetailScreen from "../screens/StockDetailScreen";
import StocksScreen from "../screens/StocksScreen";
import TodayScreen from "../screens/TodayScreen";
import { withSwipeBack, withTabSwipe } from "../components/gestures";
import { colors, fonts } from "../theme";
import type { RootStackParamList, TabParamList } from "../types";

// Tabs per docs/app-design.md: 오늘 · 종목 · 시장 · 계좌. The stock report opens on top of them.
const TAB_ICONS: Record<keyof TabParamList, React.ComponentProps<typeof Feather>["name"]> = {
  Today: "sun",
  Stocks: "list",
  Market: "activity",
  Account: "briefcase",
};

// Swipe between tabs and swipe back from the left edge (components/gestures.tsx).
const TodayTab = withTabSwipe(TodayScreen, "Today");
const StocksTab = withTabSwipe(StocksScreen, "Stocks");
const MarketTab = withTabSwipe(MarketScreen, "Market");
const AccountTab = withTabSwipe(AccountScreen, "Account");
const StockDetail = withSwipeBack(StockDetailScreen);
const OutlookDetail = withSwipeBack(OutlookScreen);

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
  // On Face ID iPhones the home-indicator inset is 34pt; the full amount under the labels reads as an
  // empty band. 20pt still keeps the labels clear of the indicator.
  const tabPad = insets.bottom > 0 ? Math.max(insets.bottom - 14, 12) : 8;
  return (
    <Tab.Navigator
      sceneContainerStyle={{ paddingTop: insets.top, backgroundColor: colors.background }}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.hairline,
          height: 54 + tabPad,
          paddingTop: 6,
          paddingBottom: tabPad,
        },
        tabBarLabelStyle: { fontFamily: fonts.sansMedium, fontSize: 11 },
        tabBarIcon: ({ color, size }) => <Feather name={TAB_ICONS[route.name]} color={color} size={size - 4} />,
      })}
    >
      <Tab.Screen name="Today" component={TodayTab} options={{ title: "오늘" }} />
      <Tab.Screen name="Stocks" component={StocksTab} options={{ title: "종목" }} />
      <Tab.Screen name="Market" component={MarketTab} options={{ title: "시장" }} />
      <Tab.Screen name="Account" component={AccountTab} options={{ title: "계좌" }} />
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
          component={StockDetail as typeof StockDetailScreen}
          options={({ route }) => ({ title: route.params.symbol })}
        />
        <Stack.Screen name="Outlook" component={OutlookDetail as typeof OutlookScreen} options={{ title: "시황" }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
