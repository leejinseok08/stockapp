import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, RefreshControl, SectionList, StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "../api";
import { minutesAgo, readCache, writeCache } from "../cache";
import { SignalBadge } from "../components/SignalBadge";
import { Avatar, Band, ChangePill, Chips, ToneTag } from "../components/ui";
import { fmtMoney, fmtPrice } from "../format";
import { ratingTone } from "../signal";
import { colors, fonts, radius, space, trendColor, trendGlyph, type } from "../theme";
import type { ListRow, RootStackParamList, Ticker, WatchlistEntry } from "../types";
import { FadeIn, Press, refreshMessage, ScreenSkeleton, useToast } from "../components/motion";

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

// 종목 tab (redesign S1-S3): holdings on top with their value and return, then the rest; one line
// each with a single value on the right that follows the sort. Search sits in the header.
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
  const [held, setHeld] = useState<Map<string, WatchlistEntry>>(new Map());
  const [searchFirst, setSearchFirst] = useState(false);
  const [toast, toastEl] = useToast();

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

  useEffect(() => {
    readCache<ListRow[]>(CACHE_KEY).then((c) => {
      if (c) {
        setRows((r) => (r.length ? r : c.data));
        setLoading(false);
      }
    });
  }, []);

  const load = useCallback(async () => {
    api
      .watchlist()
      .then((w) => setHeld(new Map(w.filter((i) => i.buyPrice && i.quantity).map((i) => [i.symbol, i]))))
      .catch(() => {});
    try {
      const d = await api.list();
      setRows(d.rows);
      setStaleMinutes(null);
      writeCache(CACHE_KEY, d.rows);
      return d.rows;
    } catch (e) {
      console.warn("list failed, falling back to cache", e);
      const cached = await readCache<ListRow[]>(CACHE_KEY);
      if (cached) {
        setRows(cached.data);
        setStaleMinutes(minutesAgo(cached.savedAt));
      }
      return null;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false));
    }, [load])
  );

  const openPicker = (search = false) => {
    setSearchFirst(search);
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
  // S1: holdings first (their own section), then everything else in the chosen order.
  const listSections = useMemo(() => {
    const mine = sorted.filter((r) => held.has(r.symbol));
    const rest = sorted.filter((r) => !held.has(r.symbol));
    return [
      ...(mine.length ? [{ key: "held", title: `보유 ${mine.length}`, data: mine }] : []),
      { key: "watch", title: `관심 ${rest.length}`, data: rest },
    ];
  }, [sorted, held]);

  const onRefresh = async () => {
    setRefreshing(true);
    const before = Object.fromEntries(rows.map((r) => [r.symbol, r.trend?.action ?? null]));
    const next = await load();
    setRefreshing(false);
    if (next) toast(refreshMessage(rows.length ? before : null, Object.fromEntries(next.map((r) => [r.symbol, r.trend?.action ?? null]))));
  };

  return (
    <FadeIn>
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>종목</Text>
        <View style={{ flex: 1 }} />
        <Press
          onPress={() => openPicker(true)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="종목 검색"
          style={styles.searchBtn}
        >
          <Feather name="search" size={17} color={colors.text} />
        </Press>
        <Press
          onPress={() => openPicker(false)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="종목 추가"
          pressedBg={false}
          style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.6 }]}
        >
          <Feather name="plus" size={18} color={colors.onAccent} />
        </Press>
      </View>

      <View style={styles.sortRow}>
        <Chips options={SORTS} value={sort} onChange={setSort} labelFor={(l) => `${l} 순으로 정렬`} />
      </View>
      {staleMinutes != null && <Text style={styles.stale}>오프라인 · {staleMinutes}분 전 데이터</Text>}
      {adding > 0 && <Text style={styles.stale}>{adding}개 추가 중 · 신호와 점수를 계산하고 있어요</Text>}
      {loading && rows.length === 0 ? (
        <ScreenSkeleton hero={false} rows={7} />
      ) : (
        <SectionList
          sections={listSections}
          keyExtractor={(r) => r.symbol}
          stickySectionHeadersEnabled={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          renderSectionHeader={({ section }) => (
            <View>
              {section.key === "watch" && listSections.length > 1 && <Band />}
              <Text style={styles.sectionTitle}>{section.title}</Text>
              {section.key === "watch" && (
                <Text style={styles.sectionDesc}>{SORTS.find((x) => x.key === sort)!.label} 순 · 누르면 리포트</Text>
              )}
            </View>
          )}
          ListFooterComponent={
            <Text style={styles.footnote}>
              신호는 200일선·MACD 추세 규칙, 의견은 기본 목표가 상승 여력 ±15% 기준이에요. 재무 점수는 빅테크 9개 안의 순위라
              직접 추가한 종목에는 없어요. 투자 권유가 아닙니다.
            </Text>
          }
          renderItem={({ item }) => (
            <Row
              row={item}
              sort={sort}
              held={held.get(item.symbol)}
              onPress={() => navigation.navigate("StockDetail", { symbol: item.symbol, name: item.name })}
            />
          )}
        />
      )}

      <Modal visible={pickerOpen} animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.title}>종목 추가</Text>
            <Press onPress={() => setPickerOpen(false)} accessibilityRole="button" accessibilityLabel="닫기" hitSlop={12}>
              <Text style={styles.close}>닫기</Text>
            </Press>
          </View>
          <TextInput
            autoFocus={searchFirst}
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
                <Press
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
                </Press>
              );
            }}
          />
        </View>
      </Modal>
      {toastEl}
    </View>
    </FadeIn>
  );
}

const upText = (v: number | null | undefined) => (v == null ? "-" : `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(0)}%`);

// The one value on the right follows the sort: signal, opinion, upside or financial score.
function Metric({ row, sort }: { row: ListRow; sort: SortKey }) {
  if (sort === "signal") return <SignalBadge action={row.trend?.action} large />;
  if (sort === "rating")
    return row.rating?.rating ? <ToneTag tone={ratingTone(row.rating.rating)} label={row.rating.rating} size="md" /> : <Text style={styles.metricWord}>-</Text>;
  if (sort === "upside") return <Text style={styles.metric}>{upText(row.rating?.baseUpside)}</Text>;
  return <Text style={styles.metric}>{row.score != null ? Math.round(row.score) : "-"}</Text>;
}

function Row({ row, sort, held, onPress }: { row: ListRow; sort: SortKey; held?: WatchlistEntry; onPress: () => void }) {
  const cur = row.quoteCurrency ?? held?.currency ?? "USD";
  const value = held && held.quantity ? (row.price ?? held.price ?? held.buyPrice ?? 0) * held.quantity : null;
  const ret = held?.buyPrice && row.price != null ? row.price / held.buyPrice - 1 : null;
  return (
    <Press
      style={styles.row}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${row.name ?? row.symbol}, ${fmtPrice(row.price, row.quoteCurrency)}${
        value != null ? `, 평가 ${fmtMoney(value, cur)}` : `, 신호 ${row.trend?.action ?? "없음"}`
      }. 리포트 보기`}
    >
      <Avatar name={row.name ?? row.symbol} uri={row.logo} />
      <View style={styles.mid}>
        <Text style={styles.name} numberOfLines={1}>
          {row.name ?? row.symbol}
        </Text>
        <View style={styles.priceLine}>
          <Text style={styles.price}>{fmtPrice(row.price, row.quoteCurrency)}</Text>
          <ChangePill value={row.changePercent} />
        </View>
      </View>
      {value != null ? (
        <View style={styles.heldBox}>
          <Text style={styles.heldValue}>{fmtMoney(value, cur)}</Text>
          <Text style={[styles.heldRet, { color: trendColor(ret) }]}>
            {trendGlyph(ret)} {ret != null ? `${Math.abs(ret * 100).toFixed(Math.abs(ret) >= 1 ? 0 : 2)}%` : "-"}
          </Text>
        </View>
      ) : (
        <View style={styles.metricBox}>
          <Metric row={row} sort={sort} />
        </View>
      )}
    </Press>
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
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: space.lg, borderRadius: radius.md },
  mid: { flex: 1, marginLeft: space.md },
  heldBox: { alignItems: "flex-end", gap: 3 },
  heldValue: { ...type.numStrong, fontSize: 15, color: colors.text },
  heldRet: { ...type.numStrong, fontSize: 12 },
  searchBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, marginRight: space.sm },
  sectionTitle: { ...type.section, color: colors.text, paddingHorizontal: space.lg, paddingTop: space.xl, paddingBottom: space.xs },
  sectionDesc: { ...type.caption, color: colors.textMuted, paddingHorizontal: space.lg, paddingBottom: space.sm },
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
  metricBox: { minWidth: 68, alignItems: "flex-end", marginLeft: space.sm },
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
