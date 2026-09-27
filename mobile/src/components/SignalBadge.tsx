import React from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { actionTone } from "../signal";
import { colors, fonts } from "../theme";
import type { TrendAction } from "../types";
import { ToneTag } from "./ui";

export const ACTION_LABEL: Record<TrendAction, string> = { BUY: "BUY", SELL: "SELL", HOLD: "보유", WAIT: "관망" };

// Trend/swing signal on the app-wide tone scale (signal.ts): BUY green, SELL red, 보유/관망 gray.
export function SignalBadge({
  action,
  large,
  style,
}: {
  action: TrendAction | null | undefined;
  large?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  if (!action) return <Text style={styles.none}>-</Text>;
  return (
    <View style={style} accessibilityLabel={`신호 ${ACTION_LABEL[action]}`}>
      <ToneTag tone={actionTone(action)} label={ACTION_LABEL[action]} size={large ? "md" : "sm"} />
    </View>
  );
}

const styles = StyleSheet.create({
  none: { fontFamily: fonts.mono, fontSize: 11, color: colors.textMuted },
});
