import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "../theme";
import type { TrendAction } from "../types";

export const ACTION_LABEL: Record<TrendAction, string> = { BUY: "BUY", SELL: "SELL", HOLD: "보유", WAIT: "관망" };

// BUY/SELL mean "act at the next session" and get the accent (an action cue). 보유/관망 are states.
// Never red/blue: those colors mean price up/down in this app (DESIGN.md).
export function SignalBadge({ action, large }: { action: TrendAction | null | undefined; large?: boolean }) {
  if (!action) return <Text style={styles.none}>-</Text>;
  const act = action === "BUY" || action === "SELL";
  return (
    <View style={[styles.badge, act && styles.badgeAct, large && styles.large]} accessibilityLabel={`신호 ${ACTION_LABEL[action]}`}>
      <Text style={[styles.text, act && styles.textAct, large && styles.largeText]}>{ACTION_LABEL[action]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.textMuted,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  badgeAct: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  text: { fontFamily: fonts.sansMedium, fontSize: 11, color: colors.text },
  textAct: { color: colors.accent, fontFamily: fonts.monoBold },
  large: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  largeText: { fontSize: 16 },
  none: { fontFamily: fonts.mono, fontSize: 11, color: colors.textMuted },
});
