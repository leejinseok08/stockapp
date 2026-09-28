import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { fmtPrice } from "../format";
import { ratingTone } from "../signal";
import { colors, fonts, radius, space, tones, type } from "../theme";
import type { Analysis } from "../types";
import { ACTION_LABEL, SignalBadge } from "./SignalBadge";
import { ToneTag } from "./ui";

export const pct = (v: number | null | undefined, d = 0) => (v == null ? "-" : `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(d)}%`);

// The research note in pieces (redesign R2-R4): three tiles and the target range stay open; the
// basis, thesis, catalysts, risks and model-vs-street each sit in a Collapsible with a one-line preview.

export function ReportTiles({ a }: { a: Analysis }) {
  const sc = a.scenarios;
  return (
    <View style={styles.tiles}>
      <View style={styles.tile} accessible accessibilityLabel={`의견 ${a.rating ?? "판단 보류"}${a.conviction ? `, 확신 ${a.conviction}` : ""}`}>
        <Text style={styles.tileLabel}>의견</Text>
        {a.rating ? <ToneTag tone={ratingTone(a.rating)} label={a.rating} size="md" /> : <Text style={styles.tileValue}>보류</Text>}
        <Text style={styles.tileSub}>{a.conviction ? `확신 ${a.conviction}` : " "}</Text>
      </View>
      <View style={styles.tile} accessible accessibilityLabel={`오늘 신호 ${a.trend?.action ? ACTION_LABEL[a.trend.action] : "없음"}`}>
        <Text style={styles.tileLabel}>오늘 신호</Text>
        <SignalBadge action={a.trend?.action} large />
        <Text style={styles.tileSub}>{a.trend?.since ? `${Number(a.trend.since.slice(5, 7))}/${Number(a.trend.since.slice(8, 10))}부터` : " "}</Text>
      </View>
      <View style={styles.tile} accessible accessibilityLabel={`기본 목표가 ${sc ? fmtPrice(sc.base.price, a.currency) : "없음"}`}>
        <Text style={styles.tileLabel}>기본 목표가</Text>
        <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>
          {sc ? fmtPrice(sc.base.price, a.currency) : "-"}
        </Text>
        <Text style={styles.tileSub}>{sc ? pct(sc.base.upside) : " "}</Text>
      </View>
    </View>
  );
}

// Bear/base/bull on one scale with the current price marked (position, not area).
export function ScenarioBar({ a }: { a: Analysis }) {
  const sc = a.scenarios;
  if (!sc) return null;
  const vals = [sc.bear.price, sc.base.price, sc.bull.price, a.price];
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const at = (v: number) => ((v - lo) / (hi - lo || 1)) * 100;
  return (
    <View style={styles.bar} accessible accessibilityLabel={`현재가 ${fmtPrice(a.price, a.currency)}, 약세 ${pct(sc.bear.upside)}, 기본 ${pct(sc.base.upside)}, 강세 ${pct(sc.bull.upside)}`}>
      <Text style={styles.barTitle}>목표가 범위</Text>
      <View style={styles.track}>
        <View style={[styles.span, { left: `${at(sc.bear.price)}%`, right: `${100 - at(sc.bull.price)}%` }]} />
        <View style={[styles.now, { left: `${at(a.price)}%` }]} />
      </View>
      <View style={styles.labels}>
        {(["bear", "base", "bull"] as const).map((k) => (
          <View key={k} style={{ flex: 1, alignItems: k === "bear" ? "flex-start" : k === "bull" ? "flex-end" : "center" }}>
            <Text style={styles.scLabel}>{k === "bear" ? "약세" : k === "base" ? "기본" : "강세"}</Text>
            <Text style={styles.scNum}>{fmtPrice(sc[k].price, a.currency)}</Text>
            <Text style={styles.scPct}>{pct(sc[k].upside)}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.muted}>│ 흰 선 = 현재가 {fmtPrice(a.price, a.currency)}</Text>
    </View>
  );
}

export function signalBasisPreview(a: Analysis) {
  return a.trend?.vsSma != null ? `200일선 대비 ${pct(a.trend.vsSma / 100, 1)}` : "";
}

export function SignalBasis({ a }: { a: Analysis }) {
  const bt = a.trendBacktest;
  return (
    <View>
      {a.trend && (
        <Text style={styles.item}>
          {a.trend.action === "BUY" || a.trend.action === "SELL"
            ? `${ACTION_LABEL[a.trend.action]}: 다음 거래일에 ${a.trend.action === "BUY" ? "매수" : "매도"}. `
            : ""}
          200일선 대비 {a.trend.vsSma != null ? pct(a.trend.vsSma / 100, 1) : "-"} · 200일선 {a.trend.smaFalling ? "하락 중" : "상승 중"} · MACD{" "}
          {a.trend.macdUp ? "상향" : "하향"}
        </Text>
      )}
      {bt ? (
        <Text style={[styles.item, styles.mutedItem]}>
          이 신호를 따랐다면 ({bt.period}, 매월 적립): 최종 평가액 계속 보유 대비 {pct(bt.vsPlain)} · 원금 대비 최악 손실{" "}
          {pct(bt.plainWorstVsPrincipal)} → {pct(bt.worstVsPrincipal)} · 매매 {bt.trades}회
        </Text>
      ) : (
        <Text style={[styles.item, styles.mutedItem]}>이 종목은 신호 백테스트가 없어요(빅테크 9개만 계산).</Text>
      )}
    </View>
  );
}

export function Thesis({ a }: { a: Analysis }) {
  return (
    <View style={{ gap: 6 }}>
      {a.thesis.map((t, i) => (
        <View key={i} style={styles.numbered}>
          <Text style={styles.n}>{i + 1}</Text>
          <Text style={[styles.item, { flex: 1 }]}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

export function Catalysts({ a }: { a: Analysis }) {
  if (!a.catalysts.length) return <Text style={styles.item}>확인된 일정 없음</Text>;
  return (
    <View style={{ gap: 6 }}>
      {a.catalysts.map((c) => (
        <Text key={c.date} style={styles.item}>
          <Text style={styles.num}>{c.date}</Text> {c.text}
        </Text>
      ))}
    </View>
  );
}

export function Risks({ a }: { a: Analysis }) {
  return (
    <View style={{ gap: 6 }}>
      {a.risks.map((r, i) => (
        <Text key={i} style={styles.item}>
          · {r}
        </Text>
      ))}
    </View>
  );
}

export function modelPreview(a: Analysis) {
  return a.street?.modelVsStreet != null ? `컨센서스 대비 ${pct(a.street.modelVsStreet)}` : a.street?.median != null ? "컨센서스 있음" : "컨센서스 없음";
}

export function ModelVsStreet({ a }: { a: Analysis }) {
  const sc = a.scenarios;
  const cur = a.currency;
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.item}>
        자체: {a.model.epsSource} EPS {fmtPrice(a.model.eps.avg, cur)} × 과거 멀티플
        {sc ? ` (${sc.method}${sc.excludedYears.length ? `, 제외 ${sc.excludedYears.join("·")}` : ""})` : ""}
      </Text>
      {a.street?.median != null ? (
        <Text style={styles.item}>
          증권사 목표가: 최저 {fmtPrice(a.street.low, cur)} · 중앙 {fmtPrice(a.street.median, cur)} · 최고 {fmtPrice(a.street.high, cur)}
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
    </View>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: "row", gap: space.sm },
  tile: { flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 12, gap: 6 },
  tileLabel: { fontFamily: fonts.sansMedium, fontSize: 11, color: colors.textMuted },
  tileValue: { fontFamily: fonts.sansBold, fontSize: 18, color: colors.text, fontVariant: ["tabular-nums"] },
  tileSub: { ...type.caption, fontSize: 11, color: colors.textMuted },
  bar: { marginTop: space.xl },
  barTitle: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.text, marginBottom: space.md },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.hairline },
  span: { position: "absolute", top: 0, bottom: 0, borderRadius: 3, backgroundColor: tones.good.soft },
  now: { position: "absolute", top: -5, width: 3, height: 16, marginLeft: -1.5, borderRadius: 1, backgroundColor: colors.text },
  labels: { flexDirection: "row", marginTop: space.md },
  scLabel: { ...type.caption, color: colors.textMuted },
  scNum: { ...type.numStrong, fontSize: 13, color: colors.text },
  scPct: { ...type.caption, fontSize: 11, color: colors.textMuted },
  muted: { ...type.caption, color: colors.textMuted, marginTop: space.sm },
  item: { ...type.body, fontSize: 13, color: colors.text, lineHeight: 20 },
  mutedItem: { color: colors.textMuted, marginTop: space.sm },
  numbered: { flexDirection: "row", gap: 10 },
  n: { ...type.numStrong, fontSize: 13, color: colors.textMuted, width: 12 },
  num: { ...type.numStrong, fontSize: 12 },
});
