import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Dimensions, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../api";
import { minutesAgo, readCache, writeCache } from "../cache";
import { FlowBars } from "../components/FlowBars";
import { Heatmap } from "../components/Heatmap";
import { RiskSection } from "../components/RiskSection";
import { SignalRow } from "../components/SignalRow";
import { fmtMoney, fmtNum, fmtTrendPct } from "../format";
import { colors, fonts, space, trendColor, trendGlyph, type } from "../theme";
import type { HeatmapData, InvestorFlows, MarketFlows, MarketOverview, RiskGauge, RootStackParamList, Signals } from "../types";

const CACHE_KEY = "market-overview";
const SIGNALS_CACHE_KEY = "market-signals";
const RISK_CACHE_KEY = "market-risk";
const HEATMAP_CACHE_KEY = "market-heatmap";

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

export default function MarketScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [heatmap, setHeatmap] = useState<HeatmapData | null>(null);
  const [mapId, setMapId] = useState<"US" | "KR">("US");
  const [data, setData] = useState<MarketOverview | null>(null);
  const [signals, setSignals] = useState<Signals | null>(null);
  const [risk, setRisk] = useState<RiskGauge | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [staleMinutes, setStaleMinutes] = useState<number | null>(null);

  const loadSections = useCallback(() => {
    fetchOrCache(api.marketSignals, SIGNALS_CACHE_KEY, setSignals);
    fetchOrCache(api.risk, RISK_CACHE_KEY, setRisk);
    fetchOrCache(api.heatmap, HEATMAP_CACHE_KEY, setHeatmap);
  }, []);

  const load = useCallback(async () => {
    loadSections();
    try {
      const ov = await api.marketOverview();
      setData(ov);
      setStaleMinutes(null);
      writeCache(CACHE_KEY, ov);
    } catch (e) {
      console.warn("market overview failed, falling back to cache", e);
      const cached = await readCache<MarketOverview>(CACHE_KEY);
      if (cached) {
        setData(cached.data);
        setStaleMinutes(minutesAgo(cached.savedAt));
      }
    }
  }, [loadSections]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.loadingNote}>서버가 잠들어 있으면 첫 로딩에 30초 정도 걸려요</Text>
      </View>
    );
  }

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

  return (
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

      <Section title="스탁 히트맵" desc="대형주를 업종별로 · 크기 = 시가총액, 색 = 오늘 등락률">
        <View style={styles.toggle} accessibilityRole="tablist">
          {(["US", "KR"] as const).map((id) => (
            <Pressable
              key={id}
              onPress={() => setMapId(id)}
              hitSlop={8}
              accessibilityRole="tab"
              accessibilityState={{ selected: mapId === id }}
              accessibilityLabel={id === "US" ? "미국 히트맵" : "한국 히트맵"}
            >
              <Text style={[styles.toggleText, mapId === id && styles.toggleActive]}>{id === "US" ? "미국" : "한국"}</Text>
              {mapId === id && <View style={styles.underline} />}
            </Pressable>
          ))}
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

      <Section
        title={risk ? `위험 경고 · ${risk.lit}/${risk.total} 점등 · ${risk.level}` : "위험 경고"}
        desc="시장 스트레스 지표 5개 중 켜진 개수 · 3개 이상이면 경계"
      >
        {risk ? <RiskSection risk={risk} /> : <Text style={styles.note}>지표를 불러오는 중이에요…</Text>}
      </Section>

      <Section title="시장 온도" desc="0~100 · 70↑ 조정·공포, 40↓ 과열 · 눌러서 구성요소 보기">
        {signals ? (
          <>
            {signals.targets.map((t) => (
              <SignalRow key={t.id} target={t} />
            ))}
          </>
        ) : (
          <Text style={styles.note}>점수를 계산하는 중이에요…</Text>
        )}
      </Section>

      <Section title="지수" desc="주요 지수 · 아래 줄은 200일선 대비와 52주 범위 위치">
        <View style={styles.headRow}>
          <Text style={[styles.headCell, styles.nameCol]} />
          <Text style={styles.headCell}>현재</Text>
          <Text style={styles.headCell}>1일</Text>
          <Text style={styles.headCell}>1개월</Text>
        </View>
        {data.indices.map((idx) => (
          <View
            key={idx.symbol}
            style={styles.row}
            accessible
            accessibilityLabel={`${idx.name} ${fmtNum(idx.last)}, 1일 ${fmtTrendPct(idx.change1d)}, 1개월 ${fmtTrendPct(idx.change1m)}`}
          >
            <View style={styles.rowTop}>
              <Text style={[styles.name, styles.nameCol]}>{idx.name}</Text>
              <Text style={styles.cell}>{idx.last != null ? idx.last.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "-"}</Text>
              <Text style={[styles.cell, { color: trendColor(idx.change1d) }]}>{fmtTrendPct(idx.change1d, 1)}</Text>
              <Text style={[styles.cell, { color: trendColor(idx.change1m) }]}>{fmtTrendPct(idx.change1m, 1)}</Text>
            </View>
            <Text style={styles.sub}>
              200일선 대비 {fmtTrendPct(idx.vsMa200, 1)} · 52주 범위 {idx.range52w != null ? `${Math.round(idx.range52w)}%` : "-"} 지점
            </Text>
          </View>
        ))}
      </Section>

      <Section title="수급" desc="투자자별 순매수 금액 · 5일·20일 합계">
        {data.flows.available ? (
          data.flows.markets.map((m) => <FlowBlock key={m.market} flows={m} chartWidth={chartWidth} />)
        ) : (
          <Text style={styles.note}>
            {data.flows.reason === "krx_login_required" ? "KRX 로그인 설정 필요" : "불러오지 못함"}
          </Text>
        )}
      </Section>

      <Section title="통화 강세" desc="달러 대비 1개월 강세 순위 · ▲ = 해당 통화 강세">
        <View style={styles.row}>
          <View style={styles.rowTop}>
            <Text style={[styles.name, styles.nameCol]}>{dxy.name}</Text>
            <Text style={styles.cell}>{fmtNum(dxy.last)}</Text>
            <Text style={[styles.cell, { color: colors.textMuted }]}>{fmtTrendPct(dxy.change1d, 1)}</Text>
            <Text style={[styles.cell, { color: colors.textMuted }]}>{fmtTrendPct(dxy.change1m, 1)}</Text>
          </View>
        </View>
        {data.fx.currencies.map((c, rank) => (
          <View
            key={c.code}
            style={styles.row}
            accessible
            accessibilityLabel={`${c.name} 1개월 ${fmtTrendPct(c.strength1m)}, ${rank + 1}위`}
          >
            <View style={styles.rowTop}>
              <Text style={[styles.name, styles.nameCol, c.code === "KRW" && styles.emphasis]}>
                {rank + 1}. {c.name}
              </Text>
              <Text style={styles.cell}>
                {c.quote != null
                  ? c.quote.toLocaleString("en-US", {
                      minimumFractionDigits: c.quote > 100 ? 1 : 3,
                      maximumFractionDigits: c.quote > 100 ? 1 : 3,
                    })
                  : "-"}
              </Text>
              <Text style={[styles.cell, { color: trendColor(c.strength1d) }]}>{fmtTrendPct(c.strength1d, 1)}</Text>
              <Text style={[styles.cell, { color: trendColor(c.strength1m) }]}>{fmtTrendPct(c.strength1m, 1)}</Text>
            </View>
            <Text style={styles.sub}>{c.quoteLabel}</Text>
          </View>
        ))}
      </Section>

      <Text style={styles.footnote}>
        출처 Yahoo · FRED · Naver · KRX · 투자 권유 아님
      </Text>
    </ScrollView>
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

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, !!desc && { marginBottom: 2 }]}>{title}</Text>
      {!!desc && <Text style={styles.desc}>{desc}</Text>}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl, backgroundColor: colors.background },
  loadingNote: { ...type.caption, color: colors.textMuted, marginTop: space.md },
  empty: { ...type.body, color: colors.textMuted, textAlign: "center", lineHeight: 22 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
  },
  title: { ...type.title, color: colors.text },
  stamp: { ...type.num, fontSize: 11, color: colors.textMuted },
  section: { paddingHorizontal: space.lg, marginTop: space.xl },
  sectionTitle: { ...type.section, marginBottom: space.sm },
  headRow: { flexDirection: "row", paddingBottom: space.xs },
  headCell: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 10, color: colors.textMuted, textAlign: "right" },
  nameCol: { flex: 1.5, textAlign: "left" },
  row: {
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  rowTop: { flexDirection: "row", alignItems: "baseline" },
  name: { ...type.body, fontFamily: fonts.sansMedium, fontSize: 13, color: colors.text },
  emphasis: { color: colors.accent },
  cell: { flex: 1, ...type.num, fontSize: 13, color: colors.text, textAlign: "right" },
  sub: { ...type.caption, color: colors.textMuted, marginTop: space.xs },
  note: { ...type.body, fontSize: 13, color: colors.textMuted, lineHeight: 20 },
  flowBlock: { marginBottom: space.xl },
  marketName: { fontFamily: fonts.monoMedium, fontSize: 14, color: colors.text, marginBottom: space.sm },
  flowRow: {
    flexDirection: "row",
    alignItems: "baseline",
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  desc: { ...type.caption, color: colors.textMuted, marginBottom: space.sm },
  toggle: { flexDirection: "row", gap: space.lg, marginBottom: space.sm },
  toggleText: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.textMuted },
  toggleActive: { color: colors.text },
  underline: { height: 2, backgroundColor: colors.accent, marginTop: 4 },
  footnote: { ...type.caption, color: colors.textMuted, paddingHorizontal: space.lg, marginTop: space.xl, lineHeight: 17 },
});
