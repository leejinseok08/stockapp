import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { fmtPrice, fmtTrendPct } from "../format";
import { colors, fonts, space, trendColor, type } from "../theme";
import type { WatchlistEntry } from "../types";

export function StockRow({ item, onPress }: { item: WatchlistEntry; onPress: () => void }) {
  const hasPosition = item.buyPrice != null && item.quantity != null && item.buyPrice > 0;
  const plPercent = hasPosition && item.price != null ? ((item.price - item.buyPrice!) / item.buyPrice!) * 100 : null;

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.name ?? item.symbol}, ${fmtTrendPct(item.changePercent)}`}
    >
      <View style={styles.left}>
        <View style={styles.titleLine}>
          <Text style={styles.symbol}>{item.symbol}</Text>
          {!!item.category && <Text style={styles.sector}>{item.category}</Text>}
        </View>
        {!!item.name && <Text style={styles.name}>{item.name}</Text>}
        {plPercent != null && (
          <Text style={[styles.pl, { color: trendColor(plPercent) }]}>보유 {fmtTrendPct(plPercent)}</Text>
        )}
      </View>
      <View style={styles.right}>
        <Text style={styles.price}>{fmtPrice(item.price, item.currency)}</Text>
        <Text style={[styles.change, { color: trendColor(item.changePercent) }]}>
          {fmtTrendPct(item.changePercent)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: space.md + 2,
    paddingHorizontal: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  pressed: { backgroundColor: colors.surface },
  left: { flexShrink: 1 },
  titleLine: { flexDirection: "row", alignItems: "baseline", gap: space.sm },
  symbol: { ...type.numStrong, color: colors.text, fontSize: 15 },
  sector: { fontFamily: fonts.sansMedium, color: colors.accent, fontSize: 10 },
  name: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  pl: { ...type.num, fontSize: 11, marginTop: 3 },
  right: { alignItems: "flex-end" },
  price: { ...type.numStrong, color: colors.text, fontSize: 15 },
  change: { ...type.num, fontSize: 12, marginTop: 2 },
});
