import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../api";
import { readCache, writeCache } from "../cache";
import { IsaSection } from "../components/IsaSection";
import { fmtMoney, fmtNum, fmtPrice, fmtTrendPct } from "../format";
import { colors, space, trendColor, trendGlyph, type } from "../theme";
import type { Plan, RootStackParamList, WatchlistEntry } from "../types";

export default function PortfolioScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [items, setItems] = useState<WatchlistEntry[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    api
      .plan()
      .then((p) => {
        setPlan(p);
        writeCache("market-plan", p);
      })
      .catch(async () => {
        const cached = await readCache<Plan>("market-plan");
        if (cached) setPlan(cached.data);
      });
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

  // Never add KRW and USD together: one total per listing currency.
  const totals = new Map<string, { cost: number; value: number }>();
  for (const i of items) {
    const cur = i.currency ?? "USD";
    const t = totals.get(cur) ?? { cost: 0, value: 0 };
    t.cost += i.buyPrice! * i.quantity!;
    t.value += (i.price ?? i.buyPrice!) * i.quantity!;
    totals.set(cur, t);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: space.xxl * 2 }}>
      {Array.from(totals.entries()).map(([cur, t], idx) => {
        const pl = t.value - t.cost;
        const plPct = t.cost > 0 ? (pl / t.cost) * 100 : null;
        return (
          <View
            key={cur}
            style={[styles.summary, idx > 0 && styles.summaryStacked]}
            accessible
            accessibilityLabel={`${cur} 평가 손익 ${fmtMoney(pl, cur)}, ${fmtTrendPct(plPct)}`}
          >
            <Text style={styles.summaryLabel}>평가 손익 · {cur}</Text>
            <Text style={[styles.summaryValue, { color: trendColor(pl) }]}>
              {trendGlyph(pl)} {fmtMoney(Math.abs(pl), cur)}
            </Text>
            <Text style={[styles.summaryPct, { color: trendColor(pl) }]}>{fmtTrendPct(plPct)}</Text>
            <View style={styles.summaryRow}>
              <View>
                <Text style={styles.summarySubLabel}>매입금액</Text>
                <Text style={styles.summarySubValue}>{fmtMoney(t.cost, cur)}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.summarySubLabel}>평가금액</Text>
                <Text style={styles.summarySubValue}>{fmtMoney(t.value, cur)}</Text>
              </View>
            </View>
          </View>
        );
      })}

      {items.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.empty}>
            보유 종목이 없어요.{"\n"}종목 상세 화면에서 매수가·수량을 입력하면{"\n"}여기에 표시됩니다.
          </Text>
        </View>
      ) : (
        <>
          <Text style={styles.listHeader}>보유 종목</Text>
          {items.map((item) => {
            const cost = item.buyPrice! * item.quantity!;
            const value = (item.price ?? item.buyPrice!) * item.quantity!;
            const pl = value - cost;
            const plPct = cost > 0 ? (pl / cost) * 100 : null;
            return (
              <Pressable
                key={item.symbol}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface }]}
                onPress={() => navigation.navigate("StockDetail", { symbol: item.symbol, name: item.name })}
                accessibilityRole="button"
                accessibilityLabel={`${item.name ?? item.symbol}, 평가금액 ${fmtMoney(value, item.currency)}, ${fmtTrendPct(plPct)}`}
              >
                <View>
                  <Text style={styles.symbol}>{item.symbol}</Text>
                  <Text style={styles.meta}>
                    {fmtNum(item.quantity, 0)}주 · 평단 {fmtPrice(item.buyPrice, item.currency)}
                  </Text>
                </View>
                <View style={styles.right}>
                  <Text style={styles.value}>{fmtMoney(value, item.currency)}</Text>
                  <Text style={[styles.pl, { color: trendColor(pl) }]}>{fmtTrendPct(plPct)}</Text>
                </View>
              </Pressable>
            );
          })}
        </>
      )}

      <View style={styles.isa}>
        <IsaSection holdings={items} plan={plan} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl },
  emptyBox: { alignItems: "center", paddingVertical: space.xxl, paddingHorizontal: space.xl },
  isa: { paddingHorizontal: space.lg, marginTop: space.xxl },
  empty: { ...type.body, color: colors.textMuted, textAlign: "center", lineHeight: 22 },
  summary: {
    marginHorizontal: space.lg,
    marginTop: space.sm,
    padding: space.lg,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  summaryStacked: { marginTop: space.md },
  summaryLabel: { ...type.section },
  summaryValue: { ...type.display, marginTop: space.sm },
  summaryPct: { ...type.numStrong, fontSize: 14, marginTop: 2 },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  summarySubLabel: { ...type.caption, color: colors.textMuted },
  summarySubValue: { ...type.numStrong, color: colors.text, fontSize: 14, marginTop: 2 },
  listHeader: { ...type.section, paddingHorizontal: space.lg, paddingTop: space.xl, paddingBottom: space.sm },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  symbol: { ...type.numStrong, color: colors.text, fontSize: 15 },
  meta: { ...type.num, fontSize: 11, color: colors.textMuted, marginTop: 2 },
  right: { alignItems: "flex-end" },
  value: { ...type.numStrong, color: colors.text, fontSize: 14 },
  pl: { ...type.num, fontSize: 12, marginTop: 2 },
});
