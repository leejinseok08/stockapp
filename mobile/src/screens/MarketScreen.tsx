import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Dimensions, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../api";
import { minutesAgo, readCache, writeCache } from "../cache";
import { FlowBars } from "../components/FlowBars";
import { SignalRow } from "../components/SignalRow";
import { fmtMoney, fmtNum, fmtTrendPct } from "../format";
import { colors, fonts, space, trendColor, trendGlyph, type } from "../theme";
import type { InvestorFlows, MarketFlows, MarketOverview, Signals } from "../types";

const CACHE_KEY = "market-overview";
const SIGNALS_CACHE_KEY = "market-signals";
const INVESTORS: { key: keyof InvestorFlows; label: string }[] = [
  { key: "foreign", label: "외국인" },
  { key: "institution", label: "기관" },
  { key: "individual", label: "개인" },
];

export default function MarketScreen() {
  const [data, setData] = useState<MarketOverview | null>(null);
  const [signals, setSignals] = useState<Signals | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [staleMinutes, setStaleMinutes] = useState<number | null>(null);

  const loadSignals = useCallback(async () => {
    try {
      const sg = await api.marketSignals();
      setSignals(sg);
      writeCache(SIGNALS_CACHE_KEY, sg);
    } catch (e) {
      console.warn("signals failed, falling back to cache", e);
      const cached = await readCache<Signals>(SIGNALS_CACHE_KEY);
      if (cached) setSignals(cached.data);
    }
  }, []);

  const load = useCallback(async () => {
    loadSignals();
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
  }, [loadSignals]);

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

      <Section title="이번 달 매수 신호">
        {signals ? (
          <>
            {signals.targets.map((t) => (
              <SignalRow key={t.id} target={t} />
            ))}
            <Text style={styles.signalNote}>
              {signals.bands
                .map((b, i, all) => {
                  const range =
                    i === 0 ? `${b.min}점 이상` : b.min === 0 ? `${all[i - 1].min}점 미만` : `${b.min}~${all[i - 1].min - 1}점`;
                  return `${range} ${b.action} ×${b.multiplier.toFixed(1)}`;
                })
                .join(" · ")}
              {"\n"}기본 적립액에 배수를 곱하는 방식이에요.{" "}
              {signals.backtested ? "" : "아직 백테스트 전이라 참고용 점수입니다."}
            </Text>
          </>
        ) : (
          <Text style={styles.note}>신호를 계산하는 중이에요…</Text>
        )}
      </Section>

      <Section title="지수">
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

      <Section title="수급 · 투자자별 순매수">
        {data.flows.available ? (
          data.flows.markets.map((m) => <FlowBlock key={m.market} flows={m} chartWidth={chartWidth} />)
        ) : (
          <Text style={styles.note}>
            {data.flows.reason === "krx_login_required"
              ? "한국거래소(KRX)가 로그인을 요구해요. 서버에 KRX 계정(KRX_ID, KRX_PW)을 설정하면 표시됩니다."
              : "수급 데이터를 가져오지 못했어요. 잠시 후 다시 시도해보세요."}
          </Text>
        )}
      </Section>

      <Section title="통화 강세 · 달러 대비 1개월">
        <View style={styles.row}>
          <View style={styles.rowTop}>
            <Text style={[styles.name, styles.nameCol]}>{dxy.name}</Text>
            <Text style={styles.cell}>{fmtNum(dxy.last)}</Text>
            <Text style={[styles.cell, { color: colors.textMuted }]}>{fmtTrendPct(dxy.change1d, 1)}</Text>
            <Text style={[styles.cell, { color: colors.textMuted }]}>{fmtTrendPct(dxy.change1m, 1)}</Text>
          </View>
          <Text style={styles.sub}>오르면 달러 강세 · 원화 약세 압력</Text>
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
            <Text style={styles.sub}>{c.quoteLabel} 환율 · ▲는 해당 통화 강세</Text>
          </View>
        ))}
      </Section>

      <Text style={styles.footnote}>
        출처: Yahoo Finance(지수·환율), 한국거래소(수급). 일봉 종가 기준이며 투자 권유가 아닙니다.
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
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
  signalNote: { ...type.caption, color: colors.textMuted, marginTop: space.md, lineHeight: 17 },
  footnote: { ...type.caption, color: colors.textMuted, paddingHorizontal: space.lg, marginTop: space.xl, lineHeight: 17 },
});
