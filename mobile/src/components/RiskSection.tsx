import React from "react";
import { Dimensions, StyleSheet, Text, View } from "react-native";
import { colors, fonts, space, type } from "../theme";
import type { RiskGauge } from "../types";
import { Pips, Sparkline } from "./charts";

// One line per signal: what it measures. Thresholds live in backend/app/services/risk.py.
const WHAT: Record<string, string> = {
  hy: "고위험 회사채 − 국채 금리 · 5%↑ 위험",
  curve: "10년 − 2년 금리 · 0 아래 = 역전",
  trend: "S&P500 200일선 대비 · 0 아래 = 이탈",
  vix: "옵션 변동성 · 30↑ 공포, 12↓ 안일",
  breadth: "동일가중 − 시총가중 3개월 · −3%↓ 쏠림",
};

function fmtValue(v: number, unit: string) {
  const s = unit === "%p" || unit === "%" ? `${v > 0 ? "+" : ""}${v.toFixed(unit === "%" ? 1 : 2)}` : v.toFixed(1);
  return `${s}${unit}`;
}

// Gauge at the top (how many of five are lit), then each signal as a one-year line with its
// danger zone shaded, so "how close to the line, and heading which way" reads without text.
export function RiskSection({ risk }: { risk: RiskGauge }) {
  const spark = Math.min(120, Math.round(Dimensions.get("window").width * 0.28));
  return (
    <View>
      <View style={styles.summary}>
        <Text style={styles.hero}>
          {risk.lit}
          <Text style={styles.heroOf}>/{risk.total}</Text> <Text style={styles.level}>{risk.level}</Text>
        </Text>
        <View style={{ flex: 1, marginLeft: space.lg }}>
          <Pips lit={risk.items.map((i) => i.lit)} total={risk.total} />
          <Text style={styles.scale}>0~1 평상 · 2 관찰 · 3↑ 경계</Text>
        </View>
      </View>

      {risk.items.map((i) => (
        <View
          key={i.key}
          style={styles.row}
          accessible
          accessibilityLabel={`${i.label} ${fmtValue(i.value, i.unit)}, ${i.lit ? "점등" : "정상"}. ${WHAT[i.key] ?? ""}`}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, !i.lit && styles.dim]}>
              {i.lit ? "● " : ""}
              {i.label}
            </Text>
            <Text style={styles.what}>{WHAT[i.key] ?? i.rule}</Text>
          </View>
          <Sparkline points={(i.history ?? []).map((p) => p.v)} zones={i.zones ?? []} width={spark} emphasis={i.lit} />
          <View style={styles.valueBox}>
            <Text style={[styles.value, !i.lit && styles.muted]}>{fmtValue(i.value, i.unit)}</Text>
            <Text style={[styles.state, i.lit && styles.lit]}>{i.lit ? "점등" : "정상"}</Text>
          </View>
        </View>
      ))}
      <Text style={styles.legend}>선: 최근 1년 · 음영: 위험 구간</Text>
      {risk.failed.length > 0 && <Text style={styles.what}>불러오지 못함: {risk.failed.join(", ")}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: "row", alignItems: "center", marginBottom: space.md },
  hero: { fontFamily: fonts.sansBold, fontSize: 40, color: colors.text, letterSpacing: -1 },
  heroOf: { fontSize: 22, color: colors.textMuted },
  level: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.text },
  scale: { ...type.caption, color: colors.textMuted, marginTop: 6 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: space.md, gap: space.md },
  label: { ...type.body, fontFamily: fonts.sansBold, color: colors.text },
  // Signals that aren't lit recede to gray so the lit ones stand out.
  dim: { fontFamily: fonts.sansMedium, color: colors.textMuted },
  muted: { color: colors.textMuted },
  what: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  valueBox: { width: 62, alignItems: "flex-end" },
  value: { ...type.numStrong, fontSize: 14, color: colors.text },
  state: { fontFamily: fonts.sansMedium, fontSize: 11, color: colors.textMuted, marginTop: 2 },
  lit: { color: colors.text, fontFamily: fonts.sansBold },
  legend: { ...type.caption, color: colors.textMuted, marginTop: space.xs },
});
