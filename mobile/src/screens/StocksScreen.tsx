import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from "react-native";
import { api } from "../api";
import { minutesAgo, readCache, writeCache } from "../cache";
import { SignalBadge } from "../components/SignalBadge";
import { fmtPrice, fmtTrendPct } from "../format";
import { colors, fonts, space, trendColor, type } from "../theme";
import type { ListRow, RootStackParamList, Ticker } from "../types";

const CACHE_KEY = "stock-list";

type SortKey = "signal" | "rating" | "upside" | "score";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "signal", label: "신호" },
  { key: "rating", label: "의견" },
  { key: "upside", label: "상승 여력" },
  { key: "score", label: "재무 점수" },
];
const SIGNAL_ORDER = { BUY: 0, SELL: 1, HOLD: 2, WAIT: 3 } as const;
const RATING_ORDER = { 매수: 0, 중립: 1, 매도: 2 } as const;

function sortRows(rows: ListRow[], key: SortKey): ListRow[] {
  const up = (r: ListRow) => r.rating?.baseUpside ?? -Infinity;
  const cmp: Record<SortKey, (a: ListRow, b: ListRow) => number> = {
    signal: (a, b) => (SIGNAL_ORDER[a.trend?.action ?? "WAIT"] ?? 9) - (SIGNAL_ORDER[b.trend?.action ?? "WAIT"] ?? 9) || up(b) - up(a),
    rating: (a, b) =>
      (a.rating?.rating ? RATING_ORDER[a.rating.rating] : 9) - (b.rating?.rating ? RATING_ORDER[b.rating.rating] : 9) || up(b) - up(a),
    upside: (a, b) => up(b) - up(a),
    score: (a, b) => (b.score ?? -1) - (a.score ?? -1),
  };
  return [...rows].sort(cmp[key]);
}

// 종목 tab: big-tech group + the watchlist, one line each (docs/app-design.md).
export default function StocksScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [rows, setRows] = useState<ListRow[]>([]);
  const [sort, setSort] = useState<SortKey>("signal");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [staleMinutes, setStaleMinutes] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [universe, setUniverse] = useState<Ticker[]>([]);

  const load = useCallback(async () => {
    try {
      const d = await api.list();
      setRows(d.rows);
      setStaleMinutes(null);
      writeCache(CACHE_KEY, d.rows);
    } catch (e) {
      console.warn("list failed, falling back to cache", e);
      const cached = await readCache<ListRow[]>(CACHE_KEY);
      if (cached) {
        setRows(cached.data);
        setStaleMinutes(minutesAgo(cached.savedAt));
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false));
    }, [load])
  );

  const openPicker = () => {
    setPickerOpen(true);
    if (!universe.length) api.universe().then(setUniverse).catch(() => {});
  };

  const watched = useMemo(() => new Set(rows.filter((r) => r.watched).map((r) => r.symbol)), [rows]);
  const groupSymbols = useMemo(() => new Set(rows.filter((r) => r.group).map((r) => r.symbol)), [rows]);
  const sections = useMemo(() => {
    const by = new Map<string, Ticker[]>();
    for (const t of universe) {
      if (groupSymbols.has(t.symbol)) continue; // always in the list already
      const k = t.category || "기타";
      if (!by.has(k)) by.set(k, []);
      by.get(k)!.push(t);
    }
    return Array.from(by.entries()).map(([title, data]) => ({ title, data }));
  }, [universe, groupSymbols]);

  const toggle = async (symbol: string) => {
    if (watched.has(symbol)) await api.removeFromWatchlist(symbol);
    else await api.addToWatchlist(symbol);
    await load();
  };

  const sorted = useMemo(() => sortRows(rows, sort), [rows, sort]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>종목</Text>
        <Pressable
          onPress={openPicker}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="종목 추가"
          style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.6 }]}
        >
          <Feather name="plus" size={18} color={colors.onAccent} />
        </Pressable>
      </View>

      <View style={styles.sortRow} accessibilityRole="tablist">
        {SORTS.map((s) => {
          const active = s.key === sort;
          return (
            <Pressable
              key={s.key}
              onPress={() => setSort(s.key)}
              hitSlop={8}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${s.label} 순으로 정렬`}
            >
              <Text style={[styles.sortText, active && styles.sortActive]}>{s.label}</Text>
              {active && <View style={styles.underline} />}
            </Pressable>
          );
        })}
      </View>
      {staleMinutes != null && <Text style={styles.stale}>오프라인 · {staleMinutes}분 전 데이터</Text>}

      {loading && rows.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.note}>9개 기업의 재무제표와 리포트를 만드는 중이에요 (처음엔 1분 정도)</Text>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(r) => r.symbol}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
              tintColor={colors.accent}
            />
          }
          ListFooterComponent={
            <Text style={styles.footnote}>
              신호는 200일선·MACD 추세 규칙, 의견은 기본 목표가 상승 여력 ±15% 기준이에요. 재무 점수는 빅테크 9개 안의 순위라
              직접 추가한 종목에는 없어요. 투자 권유가 아닙니다.
            </Text>
          }
          renderItem={({ item }) => (
            <Row row={item} onPress={() => navigation.navigate("StockDetail", { symbol: item.symbol, name: item.name })} />
          )}
        />
      )}

      <Modal visible={pickerOpen} animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.title}>종목 추가</Text>
            <Pressable onPress={() => setPickerOpen(false)} accessibilityRole="button" accessibilityLabel="닫기" hitSlop={12}>
              <Text style={styles.close}>닫기</Text>
            </Pressable>
          </View>
          <Text style={[styles.note, { paddingHorizontal: space.lg }]}>빅테크 9개는 항상 목록에 있어요.</Text>
          <SectionList
            sections={sections}
            keyExtractor={(t) => t.symbol}
            renderSectionHeader={({ section }) => <Text style={styles.pickerSection}>{section.title}</Text>}
            renderItem={({ item }) => {
              const on = watched.has(item.symbol);
              return (
                <Pressable
                  style={styles.pickerRow}
                  onPress={() => toggle(item.symbol)}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name} ${on ? "목록에서 빼기" : "목록에 추가"}`}
                >
                  <View>
                    <Text style={styles.symbol}>{item.symbol}</Text>
                    <Text style={styles.sub}>{item.name}</Text>
                  </View>
                  <Feather name={on ? "check-circle" : "plus-circle"} size={20} color={on ? colors.accent : colors.textMuted} />
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

function Row({ row, onPress }: { row: ListRow; onPress: () => void }) {
  const r = row.rating;
  const up = r?.baseUpside;
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${row.name ?? row.symbol}, 신호 ${row.trend?.action ?? "없음"}, 의견 ${r?.rating ?? "없음"}. 리포트 보기`}
    >
      <View style={styles.rowTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>
            {row.name ?? row.symbol} <Text style={styles.symbolSmall}>{row.symbol}</Text>
          </Text>
          <Text style={styles.sub}>
            {fmtPrice(row.price, row.quoteCurrency)}{" "}
            <Text style={{ color: trendColor(row.changePercent) }}>{fmtTrendPct(row.changePercent)}</Text>
          </Text>
        </View>
        <View style={styles.right}>
          <SignalBadge action={row.trend?.action} />
          <Text style={styles.rating}>
            {r?.rating ?? "-"}
            {up != null && <Text style={styles.upside}> {`${up >= 0 ? "+" : "−"}${Math.abs(up * 100).toFixed(0)}%`}</Text>}
          </Text>
        </View>
        <Text style={styles.score}>{row.score != null ? Math.round(row.score) : "-"}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: space.lg, paddingTop: space.sm },
  title: { ...type.title, color: colors.text },
  addBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: colors.accent },
  sortRow: { flexDirection: "row", gap: space.lg, paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm },
  sortText: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.textMuted },
  sortActive: { color: colors.text },
  underline: { height: 2, backgroundColor: colors.accent, marginTop: 4 },
  stale: { ...type.caption, color: colors.accent, paddingHorizontal: space.lg },
  row: { paddingVertical: space.md, paddingHorizontal: space.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  rowTop: { flexDirection: "row", alignItems: "center" },
  name: { ...type.body, fontFamily: fonts.sansMedium, color: colors.text },
  symbolSmall: { ...type.num, fontSize: 11, color: colors.textMuted },
  symbol: { ...type.numStrong, fontSize: 15, color: colors.text },
  sub: { ...type.num, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  right: { alignItems: "flex-end", marginLeft: space.sm, width: 88 },
  rating: { fontFamily: fonts.sansMedium, fontSize: 12, color: colors.text, marginTop: 4 },
  upside: { ...type.num, fontSize: 12, color: colors.textMuted },
  score: { ...type.display, fontSize: 18, color: colors.text, width: 40, textAlign: "right" },
  note: { ...type.caption, color: colors.textMuted, marginTop: space.md, textAlign: "center" },
  footnote: { ...type.caption, color: colors.textMuted, padding: space.lg, lineHeight: 17 },
  modal: { flex: 1, backgroundColor: colors.background, paddingTop: 60 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: space.lg, marginBottom: space.sm },
  close: { fontFamily: fonts.sansMedium, color: colors.accent, fontSize: 15 },
  pickerSection: { ...type.section, paddingHorizontal: space.lg, paddingTop: space.xl, paddingBottom: space.xs, backgroundColor: colors.background },
  pickerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
});
