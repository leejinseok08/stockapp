import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, RefreshControl, SectionList, StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "../api";
import { minutesAgo, readCache, writeCache } from "../cache";
import { SignalBadge } from "../components/SignalBadge";
import { Avatar, ChangePill, Chips } from "../components/ui";
import { fmtPrice } from "../format";
import { colors, fonts, radius, space, type } from "../theme";
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
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Ticker[] | null>(null);

  // Any KOSPI/KOSDAQ/NYSE/NASDAQ listing, searched as you type (short pause first).
  useEffect(() => {
    const q = query.trim();
    if (!q) return setResults(null);
    const id = setTimeout(() => {
      api
        .search(q)
        .then((r) => setResults(r.map((x) => ({ symbol: x.symbol, name: x.name, category: x.market }) as Ticker)))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(id);
  }, [query]);

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
  const shown = results ? [{ title: results.length ? "검색 결과" : "검색 결과 없음", data: results }] : sections;

  // The list takes up to a minute to recompute for a new stock, so the picker reflects the change
  // right away and the list catches up in the background.
  const [override, setOverride] = useState<Record<string, boolean>>({});
  const [failed, setFailed] = useState<string | null>(null);
  const isOn = (symbol: string) => override[symbol] ?? watched.has(symbol);
  const toggle = async (symbol: string) => {
    const next = !isOn(symbol);
    setOverride((o) => ({ ...o, [symbol]: next }));
    setFailed(null);
    try {
      if (next) await api.addToWatchlist(symbol);
      else await api.removeFromWatchlist(symbol);
    } catch (e) {
      console.warn("watchlist toggle failed", e);
      setOverride((o) => ({ ...o, [symbol]: !next }));
      setFailed(symbol);
      return;
    }
    load().then(() => setOverride((o) => {
      const { [symbol]: _, ...rest } = o;
      return rest;
    }));
  };
  const adding = Object.entries(override).filter(([s, on]) => on && !watched.has(s)).length;

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

      <View style={styles.sortRow}>
        <Chips options={SORTS} value={sort} onChange={setSort} labelFor={(l) => `${l} 순으로 정렬`} />
      </View>
      {staleMinutes != null && <Text style={styles.stale}>오프라인 · {staleMinutes}분 전 데이터</Text>}
      {adding > 0 && <Text style={styles.stale}>{adding}개 추가 중 · 신호와 점수를 계산하고 있어요</Text>}
      <View style={styles.colHead}>
        <Text style={[styles.colText, { flex: 1 }]}>종목</Text>
        <Text style={[styles.colText, { width: 100, textAlign: "right" }]}>그 밖의 값</Text>
        <Text style={[styles.colText, styles.colActive]}>{SORTS.find((x) => x.key === sort)!.label}</Text>
      </View>

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
            <Row row={item} sort={sort} onPress={() => navigation.navigate("StockDetail", { symbol: item.symbol, name: item.name })} />
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
          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder="종목명 또는 코드 (국내·미국 전체)"
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel="종목 검색"
          />
          <Text style={[styles.note, { paddingHorizontal: space.lg }]}>
            {failed ? `${failed} 저장 실패 · 다시 눌러 주세요` : "빅테크 9개는 항상 목록에 있어요. 새 종목은 목록에 뜨기까지 1분쯤 걸려요."}
          </Text>
          <SectionList
            sections={shown}
            keyboardShouldPersistTaps="handled"
            keyExtractor={(t) => t.symbol}
            renderSectionHeader={({ section }) => <Text style={styles.pickerSection}>{section.title}</Text>}
            renderItem={({ item }) => {
              const on = isOn(item.symbol);
              const fixed = groupSymbols.has(item.symbol); // big-tech 9 are always listed
              return (
                <Pressable
                  style={styles.pickerRow}
                  onPress={() => !fixed && toggle(item.symbol)}
                  disabled={fixed}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name} ${fixed ? "기본 포함" : on ? "목록에서 빼기" : "목록에 추가"}`}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickerName}>{item.name || item.symbol}</Text>
                    <Text style={styles.sub}>
                      {item.symbol}
                      {results && item.category ? ` · ${item.category}` : ""}
                    </Text>
                  </View>
                  {fixed ? (
                    <Text style={styles.sub}>기본 포함</Text>
                  ) : (
                    <Feather name={on ? "check-circle" : "plus-circle"} size={20} color={on ? colors.accent : colors.textMuted} />
                  )}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

const upText = (v: number | null | undefined) => (v == null ? "-" : `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(0)}%`);

// The big number on the right is always the value the list is sorted by.
function Metric({ row, sort }: { row: ListRow; sort: SortKey }) {
  if (sort === "signal") return <SignalBadge action={row.trend?.action} large />;
  if (sort === "rating") return <Text style={styles.metricWord}>{row.rating?.rating ?? "-"}</Text>;
  if (sort === "upside") return <Text style={styles.metric}>{upText(row.rating?.baseUpside)}</Text>;
  return <Text style={styles.metric}>{row.score != null ? Math.round(row.score) : "-"}</Text>;
}

// Everything except the sorted-by value, which is shown big on the right.
function Secondary({ row, sort }: { row: ListRow; sort: SortKey }) {
  const rating = row.rating?.rating ?? "-";
  const up = upText(row.rating?.baseUpside);
  const score = `재무 ${row.score != null ? Math.round(row.score) : "-"}`;
  if (sort === "signal")
    return (
      <>
        <Text style={styles.rating}>{rating} <Text style={styles.upside}>{up}</Text></Text>
        <Text style={styles.upside}>{score}</Text>
      </>
    );
  return (
    <>
      <SignalBadge action={row.trend?.action} />
      <Text style={styles.upside}>
        {sort === "rating" ? `${up} · ${score}` : sort === "upside" ? `${rating} · ${score}` : `${rating} ${up}`}
      </Text>
    </>
  );
}

function Row({ row, sort, onPress }: { row: ListRow; sort: SortKey; onPress: () => void }) {
  const r = row.rating;
  const up = r?.baseUpside;
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${row.name ?? row.symbol}, 신호 ${row.trend?.action ?? "없음"}, 의견 ${r?.rating ?? "없음"}. 리포트 보기`}
    >
      <View style={styles.rowTop}>
        <Avatar name={row.name ?? row.symbol} uri={row.logo} />
        <View style={{ flex: 1, marginLeft: space.md }}>
          <Text style={styles.name} numberOfLines={1}>
            {row.name ?? row.symbol}
          </Text>
          <View style={styles.priceLine}>
            <Text style={styles.price}>{fmtPrice(row.price, row.quoteCurrency)}</Text>
            <ChangePill value={row.changePercent} />
          </View>
        </View>
        <View style={styles.right}>
          <Secondary row={row} sort={sort} />
        </View>
        <View style={styles.metricBox}>
          <Metric row={row} sort={sort} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: space.lg, paddingTop: space.sm },
  title: { ...type.title, color: colors.text },
  addBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.accent },
  sortRow: { paddingHorizontal: space.lg - 12, paddingTop: space.md, paddingBottom: space.xs },
  stale: { ...type.caption, color: colors.accent, paddingHorizontal: space.lg },
  row: { paddingVertical: 14, paddingHorizontal: space.lg },
  rowPressed: { backgroundColor: colors.surface, borderRadius: radius.md },
  priceLine: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: 3 },
  price: { ...type.num, fontSize: 13, color: colors.textMuted },
  rowTop: { flexDirection: "row", alignItems: "center" },
  name: { ...type.body, fontFamily: fonts.sansBold, fontSize: 16, color: colors.text },
  symbolSmall: { ...type.num, fontSize: 11, color: colors.textMuted },
  symbol: { ...type.numStrong, fontSize: 15, color: colors.text },
  pickerName: { ...type.body, fontFamily: fonts.sansMedium, fontSize: 15, color: colors.text },
  sub: { ...type.num, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  right: { alignItems: "flex-end", marginLeft: space.sm, width: 100, gap: 4 },
  rating: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.text },
  upside: { ...type.num, fontSize: 12, color: colors.textMuted },
  metricBox: { width: 68, alignItems: "flex-end", marginLeft: space.sm },
  metric: { ...type.display, fontSize: 20, color: colors.text, textAlign: "right" },
  metricWord: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.text },
  colHead: { flexDirection: "row", paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.xs },
  colText: { fontFamily: fonts.sansMedium, fontSize: 11, color: colors.textMuted },
  colActive: { width: 76, textAlign: "right", color: colors.accent },
  note: { ...type.caption, color: colors.textMuted, marginTop: space.md, textAlign: "center" },
  footnote: { ...type.caption, color: colors.textMuted, padding: space.lg, lineHeight: 17 },
  modal: { flex: 1, backgroundColor: colors.background, paddingTop: 60 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: space.lg, marginBottom: space.sm },
  close: { fontFamily: fonts.sansMedium, color: colors.accent, fontSize: 15 },
  search: {
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    fontFamily: fonts.sans,
    fontSize: 15,
  },
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
