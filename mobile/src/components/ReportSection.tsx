import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { fmtPrice } from "../format";
import { colors, fonts, space, type } from "../theme";
import type { Analysis } from "../types";
import { ACTION_LABEL, SignalBadge } from "./SignalBadge";

const pct = (v: number | null | undefined, d = 0) => (v == null ? "-" : `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(d)}%`);

// The research note's first page (docs/app-design.md): call, targets, today's trend signal with its
// track record, thesis, catalysts, risks, and the street kept apart from the model.
export function ReportSection({ a }: { a: Analysis }) {
  const sc = a.scenarios;
  const cur = a.currency;
  const bt = a.trendBacktest;
  return (
    <View>
      <View style={styles.top}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>의견</Text>
          <Text style={styles.rating}>
            {a.rating ?? "판단 보류"}
            {a.conviction && <Text style={styles.conviction}>  확신 {a.conviction}</Text>}
          </Text>
          {sc && (
            <Text style={styles.target}>
              기본 목표가 {fmtPrice(sc.base.price, cur)} <Text style={styles.muted}>({pct(sc.base.upside)})</Text>
            </Text>
          )}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.label}>오늘 신호</Text>
          <SignalBadge action={a.trend?.action} large />
          {a.trend && (
            <Text style={styles.muted}>
              {a.trend.position} · {a.trend.since ? `${a.trend.since}~` : "처음부터"}
            </Text>
          )}
        </View>
      </View>

      {sc && <ScenarioBar a={a} />}

      {a.trend && (
        <Text style={styles.note}>
          {a.trend.action === "BUY" || a.trend.action === "SELL"
            ? `${ACTION_LABEL[a.trend.action]}: 다음 거래일에 ${a.trend.action === "BUY" ? "매수" : "매도"}. `
            : ""}
          200일선 대비 {a.trend.vsSma != null ? pct(a.trend.vsSma / 100, 1) : "-"} · 200일선{" "}
          {a.trend.smaFalling ? "하락 중" : "상승 중"} · MACD {a.trend.macdUp ? "상향" : "하향"}
        </Text>
      )}
      {bt ? (
        <View style={styles.track}>
          <Text style={styles.trackTitle}>이 신호를 따랐다면 ({bt.period}, 매월 적립 기준)</Text>
          <Text style={styles.trackLine}>
            최종 평가액 계속 보유 대비 <Text style={styles.trackNum}>{pct(bt.vsPlain)}</Text> · 원금 대비 최악 손실{" "}
            <Text style={styles.trackNum}>
              {pct(bt.plainWorstVsPrincipal)} → {pct(bt.worstVsPrincipal)}
            </Text>{" "}
            · 매매 {bt.trades}회
          </Text>
        </View>
      ) : (
        <Text style={styles.note}>이 종목은 신호 백테스트가 없어요(빅테크 9개만 계산).</Text>
      )}

      {a.thesis.length > 0 && (
        <Block title="핵심 논거">
          {a.thesis.map((t, i) => (
            <Text key={i} style={styles.item}>
              {i + 1}. {t}
            </Text>
          ))}
        </Block>
      )}
      <Block title="촉매">
        {a.catalysts.length ? (
          a.catalysts.map((c) => (
            <Text key={c.date} style={styles.item}>
              <Text style={styles.num}>{c.date}</Text> {c.text}
            </Text>
          ))
        ) : (
          <Text style={styles.item}>확인된 일정 없음</Text>
        )}
      </Block>
      {a.risks.length > 0 && (
        <Block title="리스크 · 논거가 깨지는 조건">
          {a.risks.map((r, i) => (
            <Text key={i} style={styles.item}>
              · {r}
            </Text>
          ))}
        </Block>
      )}
      <Block title="자체 추정 vs 시장 컨센서스">
        <Text style={styles.item}>
          자체: {a.model.epsSource} EPS {fmtPrice(a.model.eps.avg, cur)} × 과거 멀티플
          {sc ? ` (${sc.method}${sc.excludedYears.length ? `, 제외 ${sc.excludedYears.join("·")}` : ""})` : ""}
        </Text>
        {a.street?.median != null ? (
          <Text style={styles.item}>
            증권사 목표가: 최저 {fmtPrice(a.street.low, cur)} · 중앙 {fmtPrice(a.street.median, cur)} · 최고{" "}
            {fmtPrice(a.street.high, cur)}
            {a.street.modelVsStreet != null ? ` · 자체 기본 목표가는 컨센서스 대비 ${pct(a.street.modelVsStreet)}` : ""}
          </Text>
        ) : (
          <Text style={styles.item}>증권사 목표가 데이터 없음</Text>
        )}
        {sc && sc.clampedToStreet.length > 0 && (
          <Text style={styles.muted}>
            {sc.clampedToStreet.map((k) => (k === "bull" ? "강세는 증권사 최고" : "약세는 증권사 최저")).join(", ")} 목표가로 제한함
          </Text>
        )}
      </Block>
      <Text style={styles.disclaimer}>규칙 기반 자동 분석이며 투자 권유가 아닙니다. 경영진 면담·통화 내용은 반영하지 못해요.</Text>
    </View>
  );
}

// Bear/base/bull on one horizontal scale with the current price marked (position, not area).
function ScenarioBar({ a }: { a: Analysis }) {
  const sc = a.scenarios!;
  const vals = [sc.bear.price, sc.base.price, sc.bull.price, a.price];
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pos = (v: number) => `${((v - lo) / (hi - lo || 1)) * 100}%` as const;
  return (
    <View style={styles.bar} accessible accessibilityLabel={`약세 ${pct(sc.bear.upside)}, 기본 ${pct(sc.base.upside)}, 강세 ${pct(sc.bull.upside)}`}>
      <View style={styles.axis} />
      <View style={[styles.span, { left: pos(sc.bear.price), right: `${100 - ((sc.bull.price - lo) / (hi - lo || 1)) * 100}%` }]} />
      <View style={[styles.now, { left: pos(a.price) }]} />
      <View style={styles.labels}>
        {(["bear", "base", "bull"] as const).map((k) => (
          <View key={k} style={{ alignItems: k === "bear" ? "flex-start" : k === "bull" ? "flex-end" : "center", flex: 1 }}>
            <Text style={styles.scLabel}>{k === "bear" ? "약세" : k === "base" ? "기본" : "강세"}</Text>
            <Text style={styles.scNum}>{fmtPrice(sc[k].price, a.currency)}</Text>
            <Text style={styles.muted}>{pct(sc[k].upside)}</Text>
          </View>
        ))}
      </View>
      <Text style={[styles.muted, { marginTop: space.xs }]}>│ 흰 세로선 = 현재가 {fmtPrice(a.price, a.currency)}</Text>
    </View>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "flex-start" },
  label: { ...type.caption, color: colors.textMuted, marginBottom: space.xs },
  rating: { fontFamily: fonts.sansBold, fontSize: 28, color: colors.text },
  conviction: { fontFamily: fonts.sansMedium, fontSize: 12, color: colors.textMuted },
  target: { ...type.numStrong, fontSize: 14, color: colors.text, marginTop: space.xs },
  muted: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  note: { ...type.caption, color: colors.textMuted, marginTop: space.md, lineHeight: 17 },
  track: { marginTop: space.md, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline },
  trackTitle: { ...type.caption, color: colors.textMuted },
  trackLine: { ...type.caption, color: colors.text, marginTop: 2, lineHeight: 17 },
  trackNum: { fontFamily: fonts.monoMedium },
  block: { marginTop: space.lg },
  blockTitle: { fontFamily: fonts.sansBold, fontSize: 15, color: colors.text, marginBottom: space.xs },
  item: { ...type.body, fontSize: 13, color: colors.text, lineHeight: 20, marginTop: 2 },
  num: { ...type.numStrong, fontSize: 12 },
  disclaimer: { ...type.caption, color: colors.textMuted, marginTop: space.lg },
  bar: { marginTop: space.lg },
  axis: { height: 2, backgroundColor: colors.hairline, marginTop: 8 },
  span: { position: "absolute", top: 7, height: 4, backgroundColor: colors.textMuted, borderRadius: 2 },
  now: { position: "absolute", top: 0, width: 2, height: 18, marginLeft: -1, backgroundColor: colors.text },
  labels: { flexDirection: "row", marginTop: space.md },
  scLabel: { ...type.caption, color: colors.textMuted },
  scNum: { ...type.numStrong, fontSize: 13, color: colors.text },
});
