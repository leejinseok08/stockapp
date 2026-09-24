import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";
import type { WatchlistEntry } from "../types";

export function StockRow({ item, onPress }: { item: WatchlistEntry; onPress: () => void }) {
  const up = (item.change ?? 0) >= 0;
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.left}>
        <Text style={styles.symbol}>{item.symbol}</Text>
        {!!item.name && <Text style={styles.name}>{item.name}</Text>}
      </View>
      <View style={styles.right}>
        <Text style={styles.price}>{item.price != null ? item.price.toFixed(2) : "-"}</Text>
        <Text style={[styles.change, { color: up ? colors.up : colors.down }]}>
          {item.changePercent != null
            ? `${up ? "+" : ""}${item.changePercent.toFixed(2)}%`
            : "-"}
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
  symbol: { color: colors.text, fontSize: 16, fontWeight: "600" },
  name: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  right: { alignItems: "flex-end" },
  price: { color: colors.text, fontSize: 16, fontWeight: "600" },
  change: { fontSize: 13, marginTop: 2, fontWeight: "500" },
});
