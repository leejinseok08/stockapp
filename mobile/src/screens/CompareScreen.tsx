import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../api";
import { fmtMoney, fmtNum, fmtTrendPct } from "../format";
import { colors, fonts, space, trendColor, type } from "../theme";
import type { CompareRow, RootStackParamList } from "../types";

type SortKey = "changePercent" | "trailingPE" | "marketCapUsd";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "changePercent", label: "등락률" },
  { key: "trailingPE", label: "PER" },
  { key: "marketCapUsd", label: "시가총액" },
];

export default function CompareScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [rows, setRows] = useState<CompareRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("changePercent");
  const [descending, setDescending] = useState(true);

  useEffect(() => {
    api
      .watchlist()
      .then((watchlist) => {
        const symbols = watchlist.map((w) => w.symbol);
        if (!symbols.length) return [];
        return api.compare(symbols);
      })
      .then((data) => setRows(data ?? []))
      .catch((e) => console.warn("compare load failed", e))
      .finally(() => setLoading(false));
  }, []);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return descending ? bv - av : av - bv;
    });
    return copy;
  }, [rows, sortKey, descending]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setDescending((d) => !d);
    } else {
      setSortKey(key);
      setDescending(true);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (rows.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>관심종목을 추가하면{"\n"}여기서 비교할 수 있어요.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headRow}>
        <Text style={[styles.headCell, styles.nameCol, { textAlign: "left" }]}>종목</Text>
        {COLUMNS.map((col) => {
          const active = sortKey === col.key;
          return (
            <Pressable
              key={col.key}
              style={styles.valueCol}
              onPress={() => toggleSort(col.key)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`${col.label} 기준 정렬`}
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.headCell, active && styles.headCellActive]}>
                {col.label}
                {active ? (descending ? " ↓" : " ↑") : ""}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={sorted}
        ListFooterComponent={
          <Text style={styles.footnote}>시가총액은 각 상장 통화로 표시하고, 정렬은 달러 환산 기준입니다.</Text>
        }
        keyExtractor={(r) => r.symbol}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface }]}
            onPress={() => navigation.navigate("StockDetail", { symbol: item.symbol, name: item.name })}
            accessibilityRole="button"
            accessibilityLabel={`${item.name ?? item.symbol}, 등락률 ${fmtTrendPct(item.changePercent)}, PER ${fmtNum(item.trailingPE)}, 시가총액 ${fmtMoney(item.marketCap, item.currency)}`}
          >
            <View style={styles.nameCol}>
              <Text style={styles.symbol}>{item.symbol}</Text>
              {!!item.category && <Text style={styles.category}>{item.category}</Text>}
            </View>
            <Text style={[styles.cell, styles.valueCol, { color: trendColor(item.changePercent) }]}>
              {fmtTrendPct(item.changePercent)}
            </Text>
            <Text style={[styles.cell, styles.valueCol]}>{fmtNum(item.trailingPE, 1)}</Text>
            <Text style={[styles.cell, styles.valueCol]}>{fmtMoney(item.marketCap, item.currency)}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl, backgroundColor: colors.background },
  empty: { ...type.body, color: colors.textMuted, textAlign: "center", lineHeight: 22 },
  headRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  headCell: { fontFamily: fonts.sansMedium, fontSize: 11, color: colors.textMuted, textAlign: "right" },
  headCellActive: { color: colors.accent },
  nameCol: { width: 96 },
  valueCol: { flex: 1, alignItems: "flex-end" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  symbol: { ...type.numStrong, color: colors.text, fontSize: 14 },
  category: { fontFamily: fonts.sans, color: colors.textMuted, fontSize: 10, marginTop: 2 },
  cell: { ...type.num, color: colors.text, fontSize: 13, textAlign: "right" },
  footnote: { ...type.caption, color: colors.textMuted, padding: space.lg },
});
