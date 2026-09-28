import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { outlookTone } from "../signal";
import { colors, fonts, radius, space, tones, type } from "../theme";
import type { Outlook, RootStackParamList } from "../types";
import { ToneTag } from "./ui";

export const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
// "2026-09-28-am" → "9/28 오전", "-pm" → "9/28 밤" (the 09:00 and 22:30 updates).
export const slotLabel = (slot: string) => `${md(slot)} ${slot.endsWith("-am") ? "오전" : "밤"}`;

// 시장 tab: the latest view (updated 09:00 and 22:30 KST) as one color and one line. Everything else (why, each house,
// sources, next week) is one tap away on OutlookScreen.
export function OutlookSection({ outlook }: { outlook: Outlook }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  if (!outlook.available) {
    return <Text style={styles.note}>첫 시황은 오전 9시나 밤 10시 30분에 올라와요.</Text>;
  }
  const t = tones[outlookTone(outlook.stance)];
  return (
    <Pressable
      onPress={() => navigation.navigate("Outlook", { outlook })}
      accessibilityRole="button"
      accessibilityLabel={`시황 ${outlook.stance}. ${outlook.headline}. 눌러서 기관별 자세히 보기`}
      style={({ pressed }) => [styles.card, { backgroundColor: t.soft, borderColor: t.fg }, pressed && { opacity: 0.8 }]}
    >
      <View style={styles.top}>
        <ToneTag tone={outlookTone(outlook.stance)} label={outlook.stance} size="lg" />
        <Feather name="chevron-right" size={22} color={t.fg} />
      </View>
      <Text style={styles.headline}>{outlook.headline}</Text>
      <Text style={styles.stamp}>
        {slotLabel(outlook.slot)} 업데이트 · 기관별 자세히 보기
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  note: { ...type.body, fontSize: 13, color: colors.textMuted },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: space.lg },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headline: { fontFamily: fonts.sansBold, fontSize: 17, lineHeight: 24, color: colors.text, marginTop: space.md },
  stamp: { ...type.caption, color: colors.textMuted, marginTop: space.sm },
});
