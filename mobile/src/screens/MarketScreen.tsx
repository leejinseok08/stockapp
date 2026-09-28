import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useState } from "react";
import { Dimensions, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../api";
import { minutesAgo, readCache, writeCache } from "../cache";
import { FlowBars } from "../components/FlowBars";
import { Heatmap } from "../components/Heatmap";
import { Collapsible, FadeIn, Press, refreshMessage, ScreenSkeleton, useToast } from "../components/motion";
import { OutlookSection } from "../components/OutlookSection";
import { RatesSection } from "../components/RatesSection";
import { RiskSection } from "../components/RiskSection";
import { SignalRow } from "../components/SignalRow";
import { DivergingBar, Pips, RangeBar } from "../components/charts";
import { ChangePill, Chips, Section, ToneTag } from "../components/ui";
import { fmtMoney, fmtNum, fmtPrice, fmtTrendPct } from "../format";
import { riskTone } from "../signal";
import { colors, fonts, space, trendColor, trendGlyph, type } from "../theme";
import type { HeatmapData, IndexStat, InvestorFlows, MarketFlows, MarketOverview, Outlook, Rates, RiskGauge, RootStackParamList, Signals } from "../types";

const CACHE_KEY = "market-overview";
const SIGNALS_CACHE_KEY = "market-signals";
const HEATMAP_CACHE_KEY = "market-heatmap";
const RATES_CACHE_KEY = "market-rates";
const OUTLOOK_CACHE_KEY = "market-outlook";
const RISK_CACHE_KEY = "market-risk";
// The three rates that move USD/KRW; the rest are one tap away.
const KEY_RATES = ["bok", "ust10", "gap10"];

// Fetch one section; on failure fall back to the last copy saved on the device.
async function fetchOrCache<T>(fetcher: () => Promise<T>, key: string, set: (v: T) => void) {
  try {
    const v = await fetcher();
    set(v);
    writeCache(key, v);
  } catch (e) {
    console.warn(`${key} failed, falling back to cache`, e);
    const cached = await readCache<T>(key);
    if (cached) set(cached.data);
  }
}
const INVESTORS: { key: keyof InvestorFlows; label: string }[] = [
  { key: "foreign", label: "외국인" },
  { key: "institution", label: "기관" },
  { key: "individual", label: "개인" },
];

// 시장 tab (redesign M1-M5): 시황 → 지수 → 시장 상태 → 히트맵 → 금리 → 환율, each showing the key
// numbers first and the rest behind a tap. 수급 appears only when KRX data came through.
export default function MarketScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [heatmap, setHeatmap] = useState<HeatmapData | null>(null);
  const [mapId, setMapId] = useState<"US" | "KR">("US");
  const [data, setData] = useState<MarketOverview | null>(null);
  const [signals, setSignals] = useState<Signals | null>(null);
  const [rates, setRates] = useState<Rates | null>(null);
  const [outlook, setOutlook] = useState<Outlook | null>(null);
  const [risk, setRisk] = useState<RiskGauge | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [allRates, setAllRates] = useState(false);
  const [allFx, setAllFx] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [staleMinutes, setStaleMinutes] = useState<number | null>(null);
  const [toast, toastEl] = useToast();

  useEffect(() => {
    readCache<MarketOverview>(CACHE_KEY).then((c) => {
      if (c) {
        setData((d) => d ?? c.data);
        setLoading(false);
      }
    });
    readCache<Outlook>(OUTLOOK_CACHE_KEY).then((c) => c && setOutlook((o) => o ?? c.data));
  }, []);

  const loadSections = useCallback(() => {
    fetchOrCache(api.marketSignals, SIGNALS_CACHE_KEY, setSignals);
    fetchOrCache(api.heatmap, HEATMAP_CACHE_KEY, setHeatmap);
    fetchOrCache(api.rates, RATES_CACHE_KEY, setRates);
    fetchOrCache(api.outlook, OUTLOOK_CACHE_KEY, setOutlook);
    fetchOrCache(api.risk, RISK_CACHE_KEY, setRisk);
  }, []);

  const load = useCallback(async () => {
    loadSections();
    try {
      const ov = await api.marketOverview();
      setData(ov);
      setStaleMinutes(null);
      writeCache(CACHE_KEY, ov);
      return ov;
    } catch (e) {
      console.warn("market overview failed, falling back to cache", e);
      const cached = await readCache<MarketOverview>(CACHE_KEY);
      if (cached) {
        setData(cached.data);
        setStaleMinutes(minutesAgo(cached.savedAt));
      }
      return null;
    }
  }, [loadSections]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    const before = data ? Object.fromEntries(data.indices.map((i) => [i.symbol, i.last])) : null;
    const ov = await load();
    setRefreshing(false);
    if (ov) toast(refreshMessage(before, Object.fromEntries(ov.indices.map((i) => [i.symbol, i.last]))));
  };

  if (loading && !data) return <ScreenSkeleton rows={4} />;

  if (!data) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>시장 데이터를 불러오지 못했어요.{"\n"}아래로 당겨 다시 시도해보세요.</Text>
      </View>
    );
  }

  const chartWidth = Dimensions.get("window").width - space.lg * 2;
  const dxy = data.fx.dollarIndex;
  const map = heatmap?.markets.find((m) => m.id === mapId);
  const krw = data.fx.currencies.find((c) => c.code === "KRW");
  const pickedIdx = data.indices.find((i) => i.symbol === picked);

  return (
    <FadeIn>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: space.xxl * 2 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        <View style={styles.header}>
          <Text style={styles.title}>시장</Text>
          <Text style={styles.stamp}>
            {staleMinutes != null ? `오프라인 · ${staleMinutes}분 전 데이터` : `${data.generatedAt.slice(5, 16).replace("T", " ")} 기준`}
          </Text>
        </View>

        <Section first title="시황" desc="6개 기관 종합 · 매일 오전 9시·밤 10시 30분 · 눌러서 기관별 보기">
          {outlook ? <OutlookSection outlook={outlook} /> : <Text style={styles.note}>불러오는 중…</Text>}
        </Section>

        {/* M2: indices as a 2-column grid; a tap shows the 52-week position and trend */}
        <Section title="지수" desc="카드를 누르면 52주 위치와 추세">
          <View style={styles.grid}>
            {data.indices.map((idx) => (
              <IndexCard key={idx.symbol} idx={idx} on={idx.symbol === picked} onPress={() => setPicked(idx.symbol === picked ? null : idx.symbol)} />
            ))}
          </View>
          {pickedIdx && (
            <View style={styles.idxDetail} accessible accessibilityLabel={`${pickedIdx.name} 52주 범위 ${pickedIdx.range52w != null ? Math.round(pickedIdx.range52w) : "-"}% 지점`}>
              <Text style={styles.idxDetailTitle}>{pickedIdx.name}</Text>
              <RangeBar position={pickedIdx.range52w} width={chartWidth - space.lg * 2} />
              <Text style={styles.sub}>
                1개월 {fmtTrendPct(pickedIdx.change1m, 1)} · 200일선 대비 {fmtTrendPct(pickedIdx.vsMa200, 1)}
              </Text>
            </View>
          )}
        </Section>

        {/* M3: risk gauge (moved from 오늘) and market temperature together */}
        <Section title="시장 상태" desc="위험 경고와 시장 온도 · 참고용">
          {risk && (
            <View style={styles.riskCard}>
              <View style={styles.riskTop} accessible accessibilityLabel={`위험 경고 ${risk.lit}/${risk.total} ${risk.level}`}>
                <View>
                  <Text style={styles.riskLabel}>위험 경고</Text>
                  <View style={styles.riskRow}>
                    <Text style={styles.riskNum}>
                      {risk.lit}/{risk.total}
                    </Text>
                    <ToneTag tone={riskTone(risk.level)} label={risk.level} />
                  </View>
                </View>
                <View style={styles.pipsBox}>
                  <Pips lit={risk.items.map((i) => i.lit)} total={risk.total} />
                </View>
              </View>
              <Collapsible title="지표 5개" preview={risk.items.filter((i) => i.lit).map((i) => i.label).join(", ") || "점등 없음"}>
                <RiskSection risk={risk} rowsOnly />
              </Collapsible>
            </View>
          )}
          {signals ? (
            signals.targets.map((t) => <SignalRow key={t.id} target={t} />)
          ) : (
            <Text style={styles.note}>점수를 계산하는 중이에요…</Text>
          )}
        </Section>

        <Section title="스탁 히트맵" desc="크기 = 시가총액, 색 = 오늘 등락률">
          <View style={styles.toggle}>
            <Chips
              options={[
                { key: "US" as const, label: "미국" },
                { key: "KR" as const, label: "한국" },
              ]}
              value={mapId}
              onChange={setMapId}
              labelFor={(l) => `${l} 히트맵`}
            />
          </View>
          {map ? (
            <Heatmap
              market={map}
              width={chartWidth}
              height={Math.round(chartWidth * 1.05)}
              onPress={(symbol, name) => navigation.navigate("StockDetail", { symbol, name })}
            />
          ) : (
            <Text style={styles.note}>불러오는 중…</Text>
          )}
        </Section>

        {/* M4: key rates first */}
        <Section title="금리" desc="원/달러에 영향을 주는 것부터">
          {rates ? (
            <>
              <RatesSection rates={rates} only={allRates ? undefined : KEY_RATES} />
              <MoreButton label={allRates ? "접기" : `금리 전체 보기 (${rates.items.length + rates.gaps.length})`} onPress={() => setAllRates(!allRates)} />
            </>
          ) : (
            <Text style={styles.note}>불러오는 중…</Text>
          )}
        </Section>

        <Section title="환율" desc="원/달러와 통화 강세">
          {krw && (
            <View style={styles.fxTop} accessible accessibilityLabel={`원/달러 ${fmtNum(krw.quote)}, 1개월 원화 ${fmtTrendPct(krw.strength1m, 1)}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fxTitle}>원/달러</Text>
                <Text style={styles.sub}>
                  1개월 원화{" "}
                  <Text style={{ color: trendColor(krw.strength1m) }}>{fmtTrendPct(krw.strength1m, 1)}</Text>{" "}
                  {krw.strength1m != null && krw.strength1m >= 0 ? "강세" : "약세"}
                </Text>
              </View>
              <Text style={styles.fxValue}>{krw.quote != null ? fmtPrice(krw.quote, "KRW") : "-"}</Text>
            </View>
          )}
          {allFx && (
            <View style={{ marginTop: space.md }}>
              {(() => {
                const max = Math.max(...data.fx.currencies.map((c) => Math.abs(c.strength1m ?? 0)), 0.1);
                return data.fx.currencies.map((c) => (
                  <View key={c.code} style={styles.fxRow} accessible accessibilityLabel={`${c.name} 1개월 ${fmtTrendPct(c.strength1m)}`}>
                    <Text style={[styles.name, styles.fxName, c.code === "KRW" && styles.emphasis]}>{c.name}</Text>
                    <DivergingBar value={c.strength1m} max={max} width={chartWidth - 72 - 70} />
                    <Text style={[styles.fxPct, { color: trendColor(c.strength1m) }]}>{fmtTrendPct(c.strength1m, 1)}</Text>
                  </View>
                ));
              })()}
              <Text style={styles.sub}>
                {dxy.name} {fmtNum(dxy.last)} · 1개월 {fmtTrendPct(dxy.change1m, 1)} (오르면 달러 강세)
              </Text>
            </View>
          )}
          <MoreButton label={allFx ? "접기" : "통화 강세 전체 보기"} onPress={() => setAllFx(!allFx)} />
        </Section>

        {/* M5: 수급 only when the data is there */}
        {data.flows.available && (
          <Section title="수급" desc="투자자별 순매수 금액 · 5일·20일 합계">
            {data.flows.markets.map((m) => (
              <FlowBlock key={m.market} flows={m} chartWidth={chartWidth} />
            ))}
          </Section>
        )}

        <Text style={styles.footnote}>출처 Yahoo · FRED · 한국은행 ECOS · Naver · KRX · 투자 권유 아님</Text>
      </ScrollView>
      {toastEl}
    </FadeIn>
  );
}

function IndexCard({ idx, on, onPress }: { idx: IndexStat; on: boolean; onPress: () => void }) {
  return (
    <Press
      style={[styles.card, on && styles.cardOn]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ expanded: on }}
      accessibilityLabel={`${idx.name} ${fmtNum(idx.last)}, 오늘 ${fmtTrendPct(idx.change1d)}`}
    >
      <Text style={styles.cardName} numberOfLines={1}>
        {idx.name}
      </Text>
      <Text style={styles.cardValue}>
        {idx.last != null
          ? idx.last.toLocaleString("en-US", { minimumFractionDigits: idx.last < 1000 ? 2 : 0, maximumFractionDigits: idx.last < 1000 ? 2 : 0 })
          : "-"}
      </Text>
      <View style={{ alignSelf: "flex-start" }}>
        <ChangePill value={idx.change1d} />
      </View>
    </Press>
  );
}

function MoreButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Press style={styles.more} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <Text style={styles.moreText}>{label}</Text>
    </Press>
  );
}

function FlowBlock({ flows, chartWidth }: { flows: MarketFlows; chartWidth: number }) {
  return (
    <View style={styles.flowBlock}>
      <Text style={styles.marketName}>
        {flows.market} <Text style={styles.stamp}>{flows.asOf}</Text>
      </Text>
      <View style={styles.headRow}>
        <Text style={[styles.headCell, styles.nameCol]} />
        <Text style={styles.headCell}>5일</Text>
        <Text style={styles.headCell}>20일</Text>
      </View>
      {INVESTORS.map(({ key, label }) => (
        <View key={key} style={styles.flowRow}>
          <Text style={[styles.name, styles.nameCol]}>{label}</Text>
          <FlowCell value={flows.sum5d[key]} />
          <FlowCell value={flows.sum20d[key]} />
        </View>
      ))}
      <Text style={[styles.sub, { marginTop: space.md }]}>외국인 일별 순매수 (최근 {flows.daily.length}거래일)</Text>
      <FlowBars values={flows.daily.map((d) => d.foreign)} width={chartWidth} />
    </View>
  );
}

function FlowCell({ value }: { value: number }) {
  return (
    <Text style={[styles.cell, { color: trendColor(value) }]}>
      {trendGlyph(value)} {fmtMoney(Math.abs(value), "KRW")}
    </Text>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl, backgroundColor: colors.background },
  empty: { ...type.body, color: colors.textMuted, textAlign: "center", lineHeight: 22 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingHorizontal: space.lg, paddingTop: space.sm },
  title: { ...type.title, color: colors.text },
  stamp: { ...type.num, fontSize: 11, color: colors.textMuted },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  card: { width: "48.5%", backgroundColor: colors.surface, borderRadius: 14, padding: 12, gap: 4, borderWidth: 1, borderColor: "transparent" },
  cardOn: { borderColor: colors.textMuted },
  cardName: { fontFamily: fonts.sansMedium, fontSize: 12, color: colors.textMuted },
  cardValue: { ...type.numStrong, fontSize: 17, color: colors.text },
  idxDetail: { marginTop: space.sm, backgroundColor: colors.surface, borderRadius: 14, padding: space.lg, gap: space.sm },
  idxDetailTitle: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.text },
  riskCard: { backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: space.lg, paddingTop: space.md, marginBottom: space.sm },
  riskTop: { flexDirection: "row", alignItems: "center" },
  pipsBox: { flex: 1, marginLeft: space.xl },
  riskLabel: { fontFamily: fonts.sansMedium, fontSize: 12, color: colors.textMuted },
  riskRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: 2 },
  riskNum: { fontFamily: fonts.sansBold, fontSize: 22, color: colors.text },
  toggle: { flexDirection: "row", marginBottom: space.sm },
  more: { backgroundColor: colors.surface, borderRadius: 12, paddingVertical: space.md, alignItems: "center", marginTop: space.md },
  moreText: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.text },
  fxTop: { flexDirection: "row", alignItems: "center" },
  fxTitle: { fontFamily: fonts.sansBold, fontSize: 15, color: colors.text },
  fxValue: { ...type.numStrong, fontSize: 17, color: colors.text },
  fxRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  fxName: { width: 72, fontSize: 14 },
  fxPct: { ...type.numStrong, fontSize: 13, width: 70, textAlign: "right" },
  name: { ...type.body, fontFamily: fonts.sansMedium, fontSize: 13, color: colors.text },
  emphasis: { color: colors.accent },
  sub: { ...type.caption, color: colors.textMuted, marginTop: space.xs },
  note: { ...type.body, fontSize: 13, color: colors.textMuted, lineHeight: 20 },
  flowBlock: { marginBottom: space.xl },
  marketName: { fontFamily: fonts.monoMedium, fontSize: 14, color: colors.text, marginBottom: space.sm },
  headRow: { flexDirection: "row", paddingBottom: space.xs },
  headCell: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 10, color: colors.textMuted, textAlign: "right" },
  nameCol: { flex: 1.5, textAlign: "left" },
  flowRow: {
    flexDirection: "row",
    alignItems: "baseline",
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  cell: { flex: 1, ...type.num, fontSize: 13, color: colors.text, textAlign: "right" },
  footnote: { ...type.caption, color: colors.textMuted, paddingHorizontal: space.lg, marginTop: space.xl, lineHeight: 17 },
});
