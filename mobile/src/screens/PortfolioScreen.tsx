import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../api";
import { fmtBig, fmtNum, fmtPct } from "../format";
import { colors } from "../theme";
import type { RootStackParamList, WatchlistEntry } from "../types";

export default function PortfolioScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [items, setItems] = useState<WatchlistEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api.watchlist();
      setItems(data.filter((i) => i.buyPrice != null && i.quantity != null && i.buyPrice > 0 && i.quantity > 0));
    } catch (e) {
      console.warn("portfolio load failed", e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false));
    }, [load])
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const totalCost = items.reduce((sum, i) => sum + i.buyPrice! * i.quantity!, 0);
  const totalValue = items.reduce((sum, i) => sum + (i.price ?? i.buyPrice!) * i.quantity!, 0);
  const totalPl = totalValue - totalCost;
  const totalPlPercent = totalCost > 0 ? (totalPl / totalCost) * 100 : null;
  const plUp = totalPl >= 0;

  return (
    <View style={styles.container}>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>평가 손익</Text>
        <Text style={[styles.summaryValue, { color: plUp ? colors.up : colors.down }]}>
          {plUp ? "+" : ""}
          {fmtBig(totalPl)} ({fmtPct(totalPlPercent)})
        </Text>
        <View style={styles.summaryRow}>
          <View>
            <Text style={styles.summarySubLabel}>매입금액</Text>
            <Text style={styles.summarySubValue}>{fmtBig(totalCost)}</Text>
          </View>
          <View>
            <Text style={styles.summarySubLabel}>평가금액</Text>
            <Text style={styles.summarySubValue}>{fmtBig(totalValue)}</Text>
          </View>
        </View>
      </View>

      {items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.empty}>
            보유 종목이 없어요.{"\n"}종목 상세 화면에서 매수가·수량을 입력하면{"\n"}여기에 표시됩니다.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.symbol}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item }) => {
            const cost = item.buyPrice! * item.quantity!;
            const value = (item.price ?? item.buyPrice!) * item.quantity!;
            const pl = value - cost;
            const plPct = cost > 0 ? (pl / cost) * 100 : null;
            const up = pl >= 0;
            return (
              <Pressable
                style={styles.row}
                onPress={() => navigation.navigate("StockDetail", { symbol: item.symbol, name: item.name })}
              >
                <View style={styles.left}>
                  <Text style={styles.symbol}>{item.symbol}</Text>
                  <Text style={styles.meta}>
                    {fmtNum(item.quantity, 0)}주 · 평단 {fmtNum(item.buyPrice)}
                  </Text>
                </View>
                <View style={styles.right}>
                  <Text style={styles.value}>{fmtBig(value)}</Text>
                  <Text style={[styles.pl, { color: up ? colors.up : colors.down }]}>
                    {up ? "+" : ""}
                    {fmtBig(pl)} ({fmtPct(plPct)})
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  empty: { color: colors.textMuted, textAlign: "center", lineHeight: 22 },
  summaryCard: {
    margin: 16,
    padding: 16,
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  summaryLabel: { color: colors.textMuted, fontSize: 12 },
  summaryValue: { fontSize: 24, fontWeight: "800", marginTop: 4 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 16 },
  summarySubLabel: { color: colors.textMuted, fontSize: 11 },
  summarySubValue: { color: colors.text, fontSize: 14, fontWeight: "600", marginTop: 2 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  left: {},
  symbol: { color: colors.text, fontSize: 16, fontWeight: "600" },
  meta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  right: { alignItems: "flex-end" },
  value: { color: colors.text, fontSize: 15, fontWeight: "600" },
  pl: { fontSize: 12, marginTop: 2, fontWeight: "600" },
});
