import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { fmtTrendPct } from "../format";
import { colors, fonts, space, trendColor, type } from "../theme";
import type { DayGuide, Plan } from "../types";

const pct = (v: number, digits = 1) => `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(digits)}%`;

function status(g: DayGuide | null): { text: string; action: boolean } {
  if (!g) return { text: "-", action: false };
  if (g.buyNextSession) return { text: "다음 거래일 매수", action: true };
  if (g.firedThisMonth.length) {
    const d = g.firedThisMonth[g.firedThisMonth.length - 1].slice(5).replace("-", "/");
    return { text: `이번 달 충족 · ${d} 다음날`, action: false };
  }
  return { text: "대기 · 없으면 말일", action: false };
}

// The owner's fixed monthly plan plus the "buy on a down day" guide they asked for.
export function PlanSection({ plan }: { plan: Plan }) {
  const bt = plan.backtest;
  return (
    <View>
      {plan.sleeves.map((s) => {
        const st = status(s.guide);
        const g = s.guide;
        return (
          <View
            key={s.id}
            style={styles.row}
            accessible
            accessibilityLabel={`${s.name} 비중 ${Math.round(s.weight * 100)}%, ${g?.etfName ?? ""}, ${st.text}`}
          >
            <View style={styles.top}>
              <Text style={styles.weight}>{Math.round(s.weight * 100)}%</Text>
              <View style={styles.left}>
                <Text style={styles.name}>{s.name}</Text>
                <Text style={styles.etf}>{s.etfs.map((e) => e.name).join(" · ")}</Text>
              </View>
              <Text style={[styles.status, st.action && styles.statusAction]}>{st.text}</Text>
            </View>
            {g && (
              <Text style={styles.sub}>
                {g.asOf.slice(5).replace("-", "/")} 종가{" "}
                <Text style={{ color: trendColor(g.lastReturn) }}>{fmtTrendPct(g.lastReturn)}</Text>
                {g.threshold != null && ` · 기준 ${fmtTrendPct(g.threshold)} 이하`} ({g.etfName})
              </Text>
            )}
          </View>
        );
      })}
      <Text style={styles.note}>
        매달 같은 금액을 위 비중대로 삽니다. 매수일: {plan.rule.text}.
      </Text>
      {bt && (
        <Text style={styles.note}>
          백테스트 {bt.period} · 원화 환산 · 편도 비용 {(bt.costOneWay * 100).toFixed(3)}%{"\n"}
          첫 거래일 정액 적립: 연 {pct(bt.plainXirr)} (원금 대비 최악 {pct(bt.plainWorstVsPrincipal)}){"\n"}
          하락일 매수 규칙: 정액 대비 최종 평가액 {pct(bt.dipDayVsPlain)} · 매달 최저가를 미리 알아도 {pct(bt.hindsightBestDayVsPlain)}
          {"\n"}점수로 금액 조절(0.5~1.5배): {pct(bt.scaledSignalVsPlain)} · 조절 규칙 {bt.gridSettingsTried}개 중 정액을 이긴 것{" "}
          {bt.gridSettingsBeatingPlain}개
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  top: { flexDirection: "row", alignItems: "center" },
  weight: { ...type.numStrong, fontSize: 15, color: colors.text, width: 44 },
  left: { flex: 1 },
  name: { ...type.body, fontFamily: fonts.sansMedium, color: colors.text },
  etf: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  status: { fontFamily: fonts.sansMedium, fontSize: 12, color: colors.textMuted, textAlign: "right" },
  statusAction: { color: colors.accent },
  sub: { ...type.caption, color: colors.textMuted, marginTop: space.xs, marginLeft: 44 },
  note: { ...type.caption, color: colors.textMuted, marginTop: space.md, lineHeight: 17 },
});
