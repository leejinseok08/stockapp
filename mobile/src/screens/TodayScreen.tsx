import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../api";
import { minutesAgo, readCache, writeCache } from "../cache";
import { Collapsible, FadeIn, Flash, Press, refreshMessage, ScreenSkeleton, useToast } from "../components/motion";
import { SignalBadge } from "../components/SignalBadge";
import { SwingSection } from "../components/SwingSection";
import { Avatar, Section, ToneTag } from "../components/ui";
import { fmtMoney } from "../format";
import { outlookTone, riskTone } from "../signal";
import { colors, fonts, radius, space, trendColor, trendGlyph, type } from "../theme";
import type { Outlook, Performance, SwingPaper, SwingScan, SwingSell, Today, TodayItem, WatchlistEntry } from "../types";

const CACHE_KEY = "today";
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

type Held = WatchlistEntry & { buyPrice: number; quantity: number };
// "+324.90%": the ▲/▼ is already on the amount in front of it.
const signedPct = (r: number | null | undefined) => (r == null ? "" : `${r >= 0 ? "+" : "−"}${Math.abs(r * 100).toFixed(2)}%`);

// First screen (redesign T1-T5): my money first, then only what needs attention today, then a
// one-line look at the market. Detail lives on the other tabs and the report.
export default function TodayScreen() {
  // Loosely typed: this screen opens stack screens and switches tabs.
  const navigation = useNavigation<any>();
  const [data, setData] = useState<Today | null>(null);
  const [watch, setWatch] = useState<WatchlistEntry[]>([]);
  const [perf, setPerf] = useState<Performance | null>(null);
  const [outlook, setOutlook] = useState<Outlook | null>(null);
  const [swing, setSwing] = useState<Partial<Record<"KR" | "US", SwingScan>>>({});
  const [swingSells, setSwingSells] = useState<SwingSell[]>([]);
  const [swingPaper, setSwingPaper] = useState<Partial<Record<"KR" | "US", SwingPaper>>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [staleMinutes, setStaleMinutes] = useState<number | null>(null);
  const [toast, toastEl] = useToast();
  const snapshot = useRef<Record<string, unknown> | null>(null);

  // Show the last copy at once; the network result replaces it in place.
  useEffect(() => {
    readCache<Today>(CACHE_KEY).then((c) => {
      if (c) {
        setData((d) => d ?? c.data);
        setLoading(false);
      }
    });
    readCache<Performance>("performance").then((c) => c && setPerf((p) => p ?? c.data));
  }, []);

  const load = useCallback(async () => {
    api.outlook().then(setOutlook).catch(() => {});
    api.swing().then(setSwing).catch(() => {});
    api.swingSells().then(setSwingSells).catch(() => {});
    api.swingPaper().then(setSwingPaper).catch(() => {});
    api
      .watchlist()
      .then((w) => {
        setWatch(w);
        if (w.some((i) => i.buyPrice && i.quantity))
          api.performance().then((p) => {
            setPerf(p);
            writeCache("performance", p);
          }).catch(() => {});
      })
      .catch(() => {});
    try {
      const d = await api.today();
      setData(d);
      setStaleMinutes(null);
      writeCache(CACHE_KEY, d);
      return d;
    } catch (e) {
      console.warn("today failed, falling back to cache", e);
      const cached = await readCache<Today>(CACHE_KEY);
      if (cached) {
        setData(cached.data);
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

  const onRefresh = async () => {
    setRefreshing(true);
    const before = snapshot.current;
    const d = await load();
    setRefreshing(false);
    if (d) {
      const after = keyNumbers(d);
      toast(refreshMessage(before, after));
      snapshot.current = after;
    }
  };
  useEffect(() => {
    if (data && !snapshot.current) snapshot.current = keyNumbers(data);
  }, [data]);

  const open = (symbol: string, name?: string | null, swingInfo?: object) =>
    navigation.navigate("StockDetail", { symbol, name: name ?? undefined, swing: swingInfo });

  if (loading && !data) return <ScreenSkeleton />;

  const held = watch.filter((i): i is Held => !!i.buyPrice && !!i.quantity);
  const upcoming = data ? upcomingEvents(data) : [];

  return (
    <FadeIn>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: space.xxl * 2 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        <View style={styles.header}>
          <Text style={styles.title}>오늘</Text>
          <Text style={styles.stamp}>
            {staleMinutes != null ? `오프라인 · ${staleMinutes}분 전` : data ? `${data.generatedAt.slice(5, 16).replace("T", " ")} 기준` : ""}
          </Text>
        </View>

        {/* T1: my money first */}
        <View style={styles.pad}>
          <MyMoney held={held} perf={perf} onPress={() => navigation.navigate("Account")} />
        </View>

        {!data ? (
          <Text style={[styles.note, styles.pad]}>데이터를 불러오지 못했어요. 아래로 당겨 다시 시도해보세요.</Text>
        ) : (
          <>
            {/* T2: signal changes, one line when there are none */}
            {data.changed.length === 0 ? (
              <View style={[styles.pad, { marginTop: space.md }]}>
                <View style={styles.quiet} accessible accessibilityLabel={`바뀐 신호 없음, 관심 ${watch.length}종목 그대로`}>
                  <ToneTag tone="neutral" label="변경 없음" />
                  <Text style={styles.quietText}>관심 {watch.length || ""}종목 신호 그대로예요</Text>
                </View>
                {data.recent.length > 0 && (
                  <Collapsible title="최근 5거래일 신호" preview={`${data.recent.length}개`}>
                    {data.recent.map((i) => (
                      <SignalItem key={i.symbol} item={i} onPress={() => open(i.symbol, i.name)} />
                    ))}
                  </Collapsible>
                )}
              </View>
            ) : (
              <Section first title="신호 변경" desc="다음 거래일에 실행할 BUY · SELL">
                {data.changed.map((i) => (
                  <SignalItem key={i.symbol} item={i} onPress={() => open(i.symbol, i.name)} />
                ))}
              </Section>
            )}

            {/* T3 */}
            <SwingSection scans={swing} sells={swingSells} paper={swingPaper} onOpen={(s, n, info) => open(s, n, info)} />

            {/* T4: earnings and dividends as one timeline */}
            <Section title="다가오는 일정" desc="관심 종목의 실적과 배당">
              {upcoming.length === 0 ? (
                <Text style={styles.note}>
                  2주 안에 일정이 없어요.
                  {data.nextEarnings ? ` 다음 실적: ${md(data.nextEarnings.date)} ${data.nextEarnings.name ?? data.nextEarnings.symbol}` : ""}
                </Text>
              ) : (
                upcoming.map((e) => (
                  <Press
                    key={e.kind + e.symbol + e.date}
                    style={styles.event}
                    onPress={() => open(e.symbol, e.name)}
                    accessibilityRole="button"
                    accessibilityLabel={`${md(e.date)} ${e.name ?? e.symbol} ${e.label}`}
                  >
                    <View style={styles.dateChip}>
                      <Text style={styles.dateText}>{md(e.date)}</Text>
                    </View>
                    <Avatar name={e.name ?? e.symbol} uri={e.logo} size={28} />
                    <Text style={styles.eventName} numberOfLines={1}>
                      {e.name ?? e.symbol} {e.kind === "earnings" ? "실적 발표" : "배당락"}
                    </Text>
                    <Text style={styles.eventKind}>{e.label}</Text>
                  </Press>
                ))
              )}
            </Section>

            {/* T5: the market in two lines; detail on 시장 */}
            <Section title="시장 한눈에">
              {outlook?.available && (
                <Glance
                  label="시황"
                  tag={<ToneTag tone={outlookTone(outlook.stance)} label={outlook.stance} />}
                  sub={outlook.headline}
                  onPress={() => navigation.navigate("Outlook", { outlook })}
                />
              )}
              {data.risk && (
                <Glance
                  label="위험 경고"
                  tag={<ToneTag tone={riskTone(data.risk.level)} label={`${data.risk.lit}/${data.risk.total} ${data.risk.level}`} />}
                  sub={data.risk.litItems.length ? `${data.risk.litItems.join(", ")} 점등` : "점등 없음"}
                  onPress={() => navigation.navigate("Market")}
                />
              )}
            </Section>
          </>
        )}

        <Text style={styles.footnote}>매매 신호와 의견은 규칙에 따른 참고 정보이며 투자 권유가 아닙니다.</Text>
      </ScrollView>
      {toastEl}
    </FadeIn>
  );
}

// Numbers whose change is worth announcing after a refresh.
function keyNumbers(d: Today): Record<string, unknown> {
  return {
    changed: d.changed.map((i) => `${i.symbol}:${i.action}`),
    risk: d.risk?.lit,
    earnings: d.earnings.length,
  };
}

type Upcoming = { kind: "earnings" | "dividend"; symbol: string; name: string | null; logo?: string | null; date: string; label: string };

function upcomingEvents(d: Today): Upcoming[] {
  const ev: Upcoming[] = [
    ...d.earnings.map((e) => ({ kind: "earnings" as const, symbol: e.symbol, name: e.name, logo: e.logo, date: e.date, label: "실적" })),
    ...(d.dividends ?? []).map((v) => ({
      kind: "dividend" as const,
      symbol: v.symbol,
      name: v.name,
      logo: v.logo,
      date: v.date,
      label: v.estimated ? "예상" : "확정",
    })),
  ];
  return ev.sort((a, b) => a.date.localeCompare(b.date));
}

function MyMoney({ held, perf, onPress }: { held: Held[]; perf: Performance | null; onPress: () => void }) {
  if (!held.length) {
    return (
      <Press style={styles.hero} onPress={onPress} accessibilityRole="button" accessibilityLabel="보유 종목 없음. 계좌로 이동">
        <Text style={styles.heroLabel}>내 투자</Text>
        <Text style={styles.note}>종목 리포트의 "내 포지션"에 매수가·수량을 넣으면 여기에 표시돼요.</Text>
      </Press>
    );
  }
  const total = perf?.totalValueKRW ?? null;
  const pl = perf ? perf.totalValueKRW - perf.totalCostKRW : null;
  const byRow = new Map((perf?.rows ?? []).map((r) => [r.symbol, r]));
  return (
    <Press
      style={styles.hero}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`내 투자 ${total != null ? fmtMoney(total, "KRW") : ""}, 총 수익 ${pl != null ? fmtMoney(pl, "KRW") : ""}. 계좌로 이동`}
    >
      <View style={styles.heroTop}>
        <Text style={styles.heroLabel}>내 투자 · 원화 환산</Text>
        <Feather name="chevron-right" size={18} color={colors.textMuted} />
      </View>
      <Flash value={total} style={{ alignSelf: "flex-start" }}>
        <Text style={styles.heroValue}>{total != null ? `${fmtMoney(total, "KRW")}원` : "…"}</Text>
      </Flash>
      {pl != null && (
        <Text style={[styles.heroPl, { color: trendColor(pl) }]}>
          {trendGlyph(pl)} {fmtMoney(Math.abs(pl), "KRW")}  {signedPct(perf?.totalReturn)}
          <Text style={styles.heroPlLabel}>  총 수익</Text>
        </Text>
      )}
      <View style={styles.minis}>
        {held.slice(0, 2).map((h) => {
          const r = byRow.get(h.symbol);
          const value = (h.price ?? h.buyPrice) * h.quantity;
          const ret = r?.return ?? (h.price != null ? h.price / h.buyPrice - 1 : null);
          return (
            <View key={h.symbol} style={styles.mini}>
              <Text style={styles.miniName} numberOfLines={1}>
                {h.name ?? h.symbol}
              </Text>
              <Text style={[styles.miniValue, { color: trendColor(ret) }]} numberOfLines={1}>
                {fmtMoney(value, h.currency ?? "USD")} {trendGlyph(ret)}
                {ret != null ? `${Math.abs(ret * 100).toFixed(ret * 100 >= 100 ? 0 : 1)}%` : ""}
              </Text>
            </View>
          );
        })}
      </View>
    </Press>
  );
}

function Glance({ label, tag, sub, onPress }: { label: string; tag: React.ReactNode; sub: string; onPress: () => void }) {
  return (
    <Press style={styles.glance} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}. ${sub}. 자세히 보기`}>
      <Text style={styles.glanceLabel}>{label}</Text>
      {tag}
      <Text style={styles.glanceSub} numberOfLines={1}>
        {sub}
      </Text>
      <Feather name="chevron-right" size={18} color={colors.textMuted} />
    </Press>
  );
}

function SignalItem({ item, onPress }: { item: TodayItem; onPress: () => void }) {
  return (
    <Press
      style={styles.line}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.name ?? item.symbol} ${item.action}, ${item.since ?? ""}부터. 리포트 보기`}
    >
      <Avatar name={item.name ?? item.symbol} uri={item.logo} size={36} />
      <View style={{ flex: 1, marginLeft: space.md }}>
        <Text style={styles.name}>{item.name ?? item.symbol}</Text>
        <Text style={styles.sub}>{item.since ? `${md(item.since)}부터` : ""}</Text>
      </View>
      <SignalBadge action={item.action} />
    </Press>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  pad: { paddingHorizontal: space.lg },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.md },
  title: { ...type.title, color: colors.text },
  stamp: { ...type.num, fontSize: 11, color: colors.textMuted },
  hero: { backgroundColor: colors.surface, borderRadius: 20, padding: space.lg, gap: 6 },
  heroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  heroLabel: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.textMuted },
  heroValue: { ...type.hero, color: colors.text },
  heroPl: { fontFamily: fonts.sansBold, fontSize: 15, fontVariant: ["tabular-nums"] },
  heroPlLabel: { fontFamily: fonts.sans, fontSize: 12, color: colors.textMuted },
  minis: { flexDirection: "row", gap: space.sm, marginTop: space.sm },
  mini: { flex: 1, backgroundColor: colors.background, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 2 },
  miniName: { ...type.caption, color: colors.textMuted },
  miniValue: { fontFamily: fonts.sansBold, fontSize: 13, fontVariant: ["tabular-nums"] },
  quiet: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: space.lg, paddingVertical: 14 },
  quietText: { ...type.body, fontSize: 13, color: colors.textMuted, flex: 1 },
  line: { flexDirection: "row", alignItems: "center", paddingVertical: space.md, borderRadius: 12 },
  name: { ...type.body, fontFamily: fonts.sansBold, fontSize: 16, color: colors.text },
  sub: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  event: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.sm, borderRadius: 12 },
  dateChip: { width: 64, alignItems: "center", backgroundColor: colors.surface, borderRadius: 10, paddingVertical: 6 },
  dateText: { ...type.numStrong, fontSize: 13, color: colors.text },
  eventName: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 14, color: colors.text },
  eventKind: { ...type.caption, color: colors.textMuted },
  glance: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: space.lg, paddingVertical: 14, marginBottom: space.sm },
  glanceLabel: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.text },
  glanceSub: { flex: 1, ...type.caption, color: colors.textMuted },
  note: { ...type.caption, color: colors.textMuted, lineHeight: 17, marginTop: space.sm },
  footnote: { ...type.caption, color: colors.textMuted, paddingHorizontal: space.lg, marginTop: space.xl, lineHeight: 17 },
});
