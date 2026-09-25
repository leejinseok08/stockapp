// Sections of the stock report that come from filings and the payment record:
// the 5-axis snowflake (DART / SEC 10-K only), recent DART disclosures and the dividend schedule.
import React, { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { fmtMoney, fmtPrice } from "../format";
import { colors, fonts, space, type } from "../theme";
import type { Disclosure, Dividends, Snowflake } from "../types";
import { Pips } from "./charts";
import { RadarChart } from "./RadarChart";
import { Section } from "./ui";

const AXES = ["value", "growth", "past", "health", "dividend"] as const;
const SHORT: Record<(typeof AXES)[number], string> = { value: "가치", growth: "성장", past: "실적", health: "건전성", dividend: "배당" };

const pct = (v: number | null | undefined) => (v != null ? `${(v * 100).toFixed(1)}%` : "-");
const times = (v: number | null | undefined) => (v != null ? `${v.toFixed(1)}배` : "-");

export function SnowflakeSection({ data }: { data: Snowflake | null }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!data) {
    return (
      <Section title="펀더멘털 스노우플레이크" desc="사업보고서·10-K 공시 기준 5개 축 × 6개 체크">
        <Text style={styles.muted}>공시를 불러오는 중이에요…</Text>
      </Section>
    );
  }
  if (!data.available) {
    return (
      <Section title="펀더멘털 스노우플레이크" desc="사업보고서·10-K 공시 기준 5개 축 × 6개 체크">
        <Text style={styles.muted}>공시 데이터 없음 · {data.reason}</Text>
      </Section>
    );
  }
  const m = data.metrics;
  const cur = data.currency;
  const years = data.years.slice(-6);
  // Newest first, so the latest filing is visible without scrolling sideways.
  const cols = [...years].reverse();
  return (
    <Section title="펀더멘털 스노우플레이크" desc={`${data.source} · ${years[0]?.year}~${years[years.length - 1]?.year}년 · 축별 0~6점`}>
      <View style={styles.hero}>
        <Text style={styles.heroNum}>
          {data.total}
          <Text style={styles.heroOf}>/30</Text>
        </Text>
        <RadarChart
          size={210}
          axes={AXES.map((k) => ({ label: `${SHORT[k]} ${data.axes[k].score}`, value: (data.axes[k].score / 6) * 100 }))}
        />
      </View>

      {AXES.map((k) => {
        const a = data.axes[k];
        const isOpen = open === k;
        return (
          <View key={k}>
            <Pressable
              style={styles.axisRow}
              onPress={() => setOpen(isOpen ? null : k)}
              accessibilityRole="button"
              accessibilityLabel={`${a.label} ${a.score}점, 체크 항목 ${isOpen ? "접기" : "펼치기"}`}
            >
              <Text style={styles.axisLabel}>{a.label}</Text>
              <View style={{ flex: 1 }}>
                <Pips lit={a.checks.map((c) => c.pass)} total={6} />
              </View>
              <Text style={styles.axisScore}>{a.score}/6</Text>
              <Text style={styles.chev}>{isOpen ? "▴" : "▾"}</Text>
            </Pressable>
            {isOpen &&
              a.checks.map((c) => (
                <View key={c.label} style={styles.check}>
                  <Text style={[styles.checkMark, !c.pass && styles.dim]}>{c.pass ? "●" : "○"}</Text>
                  <Text style={[styles.checkLabel, !c.pass && styles.dim]}>{c.label}</Text>
                  <Text style={styles.checkDetail}>{c.detail}</Text>
                </View>
              ))}
          </View>
        );
      })}

      <Text style={styles.sub}>주요 지표 · 최근 공시 + 현재가</Text>
      <View style={styles.grid}>
        {(
          [
            ["PER", times(m.per)],
            ["PBR", times(m.pbr)],
            ["PSR", times(m.psr)],
            ["ROE", pct(m.roe)],
            ["영업이익률", pct(m.opMargin)],
            ["순이익률", pct(m.netMargin)],
            ["부채비율", pct(m.debtToEquity)],
            ["유동비율", times(m.currentRatio)],
            ["배당수익률", pct(m.dividendYield)],
            ["배당성향", pct(m.payout)],
            ["시가총액", fmtMoney(m.marketCap, cur)],
            ["현재가", fmtPrice(data.price, cur)],
          ] as [string, string][]
        ).map(([l, v]) => (
          <View key={l} style={styles.cell}>
            <Text style={styles.cellLabel}>{l}</Text>
            <Text style={styles.cellValue}>{v}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sub}>연간 공시 · {cur}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={styles.tr}>
            <Text style={[styles.td, styles.tdItem]} />
            {cols.map((y) => (
              <Text key={y.year} style={[styles.td, styles.th]}>
                {y.periodEnd ? y.periodEnd.slice(0, 7) : y.year}
              </Text>
            ))}
          </View>
          {(
            [
              ["매출", "revenue"],
              ["영업이익", "operatingIncome"],
              ["순이익", "netIncome"],
              ["영업현금흐름", "ocf"],
              ["자본", "equity"],
              ["차입금", "debt"],
            ] as const
          ).map(([label, key]) => (
            <View key={key} style={styles.tr}>
              <Text style={[styles.td, styles.tdItem]}>{label}</Text>
              {cols.map((y) => (
                <Text key={y.year} style={styles.td}>
                  {fmtMoney(y[key] ?? null, cur)}
                </Text>
              ))}
            </View>
          ))}
          {(
            [
              ["EPS", "eps"],
              ["주당배당", "dps"],
            ] as const
          ).map(([label, key]) => (
            <View key={key} style={styles.tr}>
              <Text style={[styles.td, styles.tdItem]}>{label}</Text>
              {cols.map((y) => (
                <Text key={y.year} style={styles.td}>
                  {y[key] != null ? fmtPrice(y[key], cur) : "-"}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
      <Pressable onPress={() => Linking.openURL(data.sourceUrl)} accessibilityRole="link">
        <Text style={styles.source}>출처: {data.source} ↗ · 가격: {data.priceSource} · 최근 성장 = 최근 공시 기준(예측 아님)</Text>
      </Pressable>
    </Section>
  );
}

export function DisclosureSection({ items }: { items: Disclosure[] }) {
  if (!items.length) return null;
  return (
    <Section title="공시" desc="DART 최근 90일">
      {items.slice(0, 8).map((d) => (
        <Pressable key={d.url} style={styles.row} onPress={() => Linking.openURL(d.url)} accessibilityRole="link" accessibilityLabel={d.title}>
          <Text style={styles.rowTitle} numberOfLines={2}>
            {d.title}
          </Text>
          <Text style={styles.rowMeta}>
            {d.date} · {d.filer}
          </Text>
        </Pressable>
      ))}
    </Section>
  );
}

export function DividendSection({ d }: { d: Dividends | null }) {
  if (!d || !d.pays) return null;
  return (
    <Section title="배당 · 분배금" desc="지급 기록 기준 · 다음 배당락일">
      <Text style={styles.cellLabel}>다음 배당락{d.nextEstimated ? " · 예상" : ""}</Text>
      <Text style={styles.nextDate}>{d.nextExDate ?? "-"}</Text>
      <View style={styles.grid}>
        {(
          [
            ["주기", d.frequency ?? "-"],
            ["최근 1회", fmtPrice(d.lastAmount, d.currency)],
            ["최근 1년 합계", fmtPrice(d.ttm, d.currency)],
            ["배당수익률", pct(d.yieldTTM)],
            ["최근 배당락", d.lastExDate ?? "-"],
          ] as [string, string][]
        ).map(([l, v]) => (
          <View key={l} style={styles.cell}>
            <Text style={styles.cellLabel}>{l}</Text>
            <Text style={styles.cellValue}>{v}</Text>
          </View>
        ))}
      </View>
      {d.nextEstimated && <Text style={styles.source}>예상: 회사 발표 전이라 지난 지급 간격으로 계산했어요</Text>}
    </Section>
  );
}

const styles = StyleSheet.create({
  muted: { ...type.caption, color: colors.textMuted },
  dim: { color: colors.textMuted, fontFamily: fonts.sans },
  hero: { alignItems: "center" },
  heroNum: { fontFamily: fonts.sansBold, fontSize: 34, color: colors.text, letterSpacing: -0.8 },
  heroOf: { fontSize: 18, color: colors.textMuted },
  axisRow: { flexDirection: "row", alignItems: "center", paddingVertical: space.md, gap: space.md },
  axisLabel: { ...type.body, fontFamily: fonts.sansMedium, color: colors.text, width: 84 },
  axisScore: { ...type.numStrong, fontSize: 13, color: colors.text },
  chev: { color: colors.textMuted, fontSize: 12, width: 12 },
  check: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 6, paddingLeft: space.sm, gap: space.sm },
  checkMark: { color: colors.text, fontSize: 10, marginTop: 3, width: 12 },
  checkLabel: { ...type.body, fontSize: 13, color: colors.text, flex: 1 },
  checkDetail: { ...type.num, fontSize: 12, color: colors.textMuted, maxWidth: "45%", textAlign: "right" },
  sub: { ...type.caption, fontFamily: fonts.sansMedium, color: colors.textMuted, marginTop: space.xl, marginBottom: space.sm },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: "33.33%", paddingVertical: space.sm },
  cellLabel: { ...type.caption, color: colors.textMuted },
  nextDate: { ...type.numStrong, fontSize: 20, color: colors.text, marginTop: 2, marginBottom: space.sm },
  cellValue: { ...type.numStrong, fontSize: 14, color: colors.text, marginTop: 2 },
  tr: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  td: { ...type.num, width: 84, fontSize: 12, color: colors.text, paddingVertical: 8, paddingRight: space.sm, textAlign: "right" },
  tdItem: { width: 92, fontFamily: fonts.sans, color: colors.textMuted, textAlign: "left" },
  th: { fontFamily: fonts.monoMedium, color: colors.textMuted, fontSize: 11 },
  source: { ...type.caption, color: colors.textMuted, marginTop: space.md },
  row: { paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  rowTitle: { ...type.body, fontSize: 13, color: colors.text, lineHeight: 19 },
  rowMeta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
});
