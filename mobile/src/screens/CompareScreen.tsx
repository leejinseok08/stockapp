import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../api";
import { fmtBig, fmtNum, fmtPct } from "../format";
import { colors } from "../theme";
import type { CompareRow, RootStackParamList } from "../types";

type SortKey = "changePercent" | "trailingPE" | "marketCap";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "changePercent", label: "등락률" },
  { key: "trailingPE", label: "PER" },
  { key: "marketCap", label: "시가총액" },
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

  return (
    <View style={styles.container}>
      <View style={styles.sortRow}>
        {SORT_OPTIONS.map((opt) => {
          const active = sortKey === opt.key;
          return (
            <Pressable key={opt.key} style={[styles.sortBtn, active && styles.sortBtnActive]} onPress={() => toggleSort(opt.key)}>
              <Text style={[styles.sortBtnText, active && styles.sortBtnTextActive]}>
                {opt.label} {active ? (descending ? "▼" : "▲") : ""}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {rows.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.empty}>관심종목을 추가하면{"\n"}여기서 비교할 수 있어요.</Text>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(r) => r.symbol}
          renderItem={({ item }) => {
            const up = (item.change ?? 0) >= 0;
            return (
              <Pressable
                style={styles.row}
                onPress={() => navigation.navigate("StockDetail", { symbol: item.symbol, name: item.name })}
              >
                <View style={styles.left}>
                  <Text style={styles.symbol}>{item.symbol}</Text>
                  {!!item.category && <Text style={styles.category}>{item.category}</Text>}
                </View>
                <View style={styles.col}>
                  <Text style={styles.colLabel}>등락률</Text>
                  <Text style={[styles.colValue, { color: up ? colors.up : colors.down }]}>
                    {fmtPct(item.changePercent)}
                  </Text>
                </View>
                <View style={styles.col}>
                  <Text style={styles.colLabel}>PER</Text>
                  <Text style={styles.colValue}>{fmtNum(item.trailingPE)}</Text>
                </View>
                <View style={styles.col}>
                  <Text style={styles.colLabel}>시총</Text>
                  <Text style={styles.colValue}>{fmtBig(item.marketCap)}</Text>
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
  sortRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  sortBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  sortBtnActive: { backgroundColor: colors.accent },
  sortBtnText: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  sortBtnTextActive: { color: "#fff" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  left: { width: 90 },
  symbol: { color: colors.text, fontSize: 14, fontWeight: "700" },
  category: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
  col: { flex: 1, alignItems: "flex-end" },
  colLabel: { color: colors.textMuted, fontSize: 9 },
  colValue: { color: colors.text, fontSize: 13, fontWeight: "600", marginTop: 2 },
});
