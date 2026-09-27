import React from "react";
import { Dimensions, StyleSheet, Text, View } from "react-native";
import { colors, fonts, space, trendColor, trendGlyph, type } from "../theme";
import type { RateItem, Rates } from "../types";
import { Sparkline } from "./charts";

const pct = (v: number) => `${v.toFixed(2)}%`;
const pp = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%p`;

// Korean vs US rates, then the KR−US gaps: same row shape as the risk gauge (what it is, a
// one-year line, the value and its one-month change).
export function RatesSection({ rates }: { rates: Rates }) {
  const spark = Math.min(110, Math.round(Dimensions.get("window").width * 0.26));
  return (
    <View>
      {rates.items.map((i) => (
        <RateRow key={i.key} item={i} spark={spark} fmt={pct} />
      ))}
      {rates.gaps.length > 0 && <Text style={styles.group}>한미 금리 차</Text>}
      {rates.gaps.map((i) => (
        <RateRow key={i.key} item={i} spark={spark} fmt={pp} />
      ))}
      <Text style={styles.legend}>선: 최근 1년 · 오른쪽 아래: 1개월 변화</Text>
      {rates.keyMissing && <Text style={styles.what}>한국 금리: ECOS 인증키 설정 필요</Text>}
      {rates.failed.length > 0 && <Text style={styles.what}>불러오지 못함: {rates.failed.join(", ")}</Text>}
    </View>
  );
}

function RateRow({ item, spark, fmt }: { item: RateItem; spark: number; fmt: (v: number) => string }) {
  const c = item.change1m;
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${item.label} ${fmt(item.value)}, 1개월 ${c == null ? "변화 없음" : pp(c)}. ${item.what}`}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{item.label}</Text>
        <Text style={styles.what}>{item.what}</Text>
      </View>
      <Sparkline points={item.history.map((p) => p.v)} zones={[]} width={spark} emphasis />
      <View style={styles.valueBox}>
        <Text style={styles.value}>{fmt(item.value)}</Text>
        <Text style={[styles.change, { color: c ? trendColor(c) : colors.textMuted }]}>
          {c ? `${trendGlyph(c)} ${Math.abs(c).toFixed(2)}%p` : "변화 없음"}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingVertical: space.md, gap: space.md },
  label: { ...type.body, fontFamily: fonts.sansBold, color: colors.text },
  what: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  group: { ...type.caption, fontFamily: fonts.sansMedium, color: colors.textMuted, marginTop: space.md },
  valueBox: { width: 72, alignItems: "flex-end" },
  value: { ...type.numStrong, fontSize: 14, color: colors.text },
  change: { ...type.num, fontSize: 11, marginTop: 2 },
  legend: { ...type.caption, color: colors.textMuted, marginTop: space.xs },
});
