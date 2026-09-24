import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { fmtPct } from "../format";
import { colors } from "../theme";
import type { WatchlistEntry } from "../types";

export function StockRow({ item, onPress }: { item: WatchlistEntry; onPress: () => void }) {
  const up = (item.change ?? 0) >= 0;
  const hasPosition = item.buyPrice != null && item.quantity != null && item.buyPrice > 0;
  const plPercent = hasPosition && item.price != null ? ((item.price - item.buyPrice!) / item.buyPrice!) * 100 : null;
  const plUp = (plPercent ?? 0) >= 0;

  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.left}>
        <View style={styles.titleLine}>
          <Text style={styles.symbol}>{item.symbol}</Text>
          {!!item.category && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{item.category}</Text>
            </View>
          )}
        </View>
        {!!item.name && <Text style={styles.name}>{item.name}</Text>}
        {hasPosition && (
          <Text style={[styles.pl, { color: plUp ? colors.up : colors.down }]}>
            보유수익 {fmtPct(plPercent)}
          </Text>
        )}
      </View>
      <View style={styles.right}>
        <Text style={styles.price}>{item.price != null ? item.price.toFixed(2) : "-"}</Text>
        <Text style={[styles.change, { color: up ? colors.up : colors.down }]}>
          {fmtPct(item.changePercent)}
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
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  left: { flexShrink: 1 },
  titleLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  symbol: { color: colors.text, fontSize: 16, fontWeight: "600" },
  badge: {
    backgroundColor: "#1B2733",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: { color: colors.accent, fontSize: 10, fontWeight: "700" },
  name: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  pl: { fontSize: 11, marginTop: 3, fontWeight: "600" },
  right: { alignItems: "flex-end" },
  price: { color: colors.text, fontSize: 16, fontWeight: "600" },
  change: { fontSize: 13, marginTop: 2, fontWeight: "500" },
});
