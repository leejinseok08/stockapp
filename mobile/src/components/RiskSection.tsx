import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, fonts, space, type } from "../theme";
import type { RiskGauge } from "../types";

// One line per signal: what it measures. Thresholds live in backend/app/services/risk.py.
const WHAT: Record<string, string> = {
  hy: "고위험 회사채 − 국채 금리 · 신용시장 불안",
  curve: "10년물 − 2년물 금리 · 역전 후 정상화 = 침체 신호",
  trend: "S&P500의 200일선 대비 위치 · 장기 추세",
  vix: "S&P500 옵션 변동성 · 공포(30↑)·안일(12↓)",
  breadth: "동일가중 vs 시총가중 3개월 · 상승 쏠림",
};

function fmtValue(v: number, unit: string) {
  const s = unit === "%p" || unit === "%" ? `${v > 0 && unit === "%p" ? "+" : ""}${v.toFixed(unit === "%" ? 1 : 2)}` : v.toFixed(1);
  return `${s}${unit}`;
}

export function RiskSection({ risk }: { risk: RiskGauge }) {
  return (
    <View>
      {risk.items.map((i) => (
        <View
          key={i.key}
          style={styles.row}
          accessible
          accessibilityLabel={`${i.label} ${fmtValue(i.value, i.unit)}, ${i.lit ? "점등" : "정상"}. ${WHAT[i.key] ?? ""}`}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>{i.label}</Text>
            <Text style={styles.what}>{WHAT[i.key] ?? i.rule}</Text>
          </View>
          <Text style={styles.value}>{fmtValue(i.value, i.unit)}</Text>
          <Text style={[styles.state, i.lit && styles.lit]}>{i.lit ? "● 점등" : "○ 정상"}</Text>
        </View>
      ))}
      {risk.failed.length > 0 && <Text style={styles.what}>불러오지 못함: {risk.failed.join(", ")}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  label: { ...type.body, fontFamily: fonts.sansMedium, fontSize: 13, color: colors.text },
  what: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  value: { ...type.num, fontSize: 13, color: colors.text, width: 70, textAlign: "right" },
  state: { fontFamily: fonts.sansMedium, fontSize: 12, color: colors.textMuted, width: 60, textAlign: "right" },
  lit: { color: colors.text, fontFamily: fonts.sansBold },
});
