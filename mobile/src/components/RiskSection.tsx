import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts, space, type } from "../theme";
import type { RiskGauge } from "../types";

function fmtValue(v: number, unit: string) {
  const s = unit === "%p" || unit === "%" ? `${v > 0 && unit === "%p" ? "+" : ""}${v.toFixed(unit === "%" ? 1 : 2)}` : v.toFixed(1);
  return `${s}${unit}`;
}

// Display only: the plan does not change with this gauge (docs/signal-research.md section 4).
export function RiskSection({ risk }: { risk: RiskGauge }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <View>
      {risk.items.map((i) => {
        const expanded = open === i.key;
        return (
          <Pressable
            key={i.key}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
            onPress={() => setOpen(expanded ? null : i.key)}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            accessibilityLabel={`${i.label} ${fmtValue(i.value, i.unit)}, ${i.lit ? "점등" : "정상"}. 기준 ${i.rule}`}
          >
            <View style={styles.top}>
              <Text style={styles.label}>{i.label}</Text>
              <Text style={styles.value}>{fmtValue(i.value, i.unit)}</Text>
              <Text style={[styles.state, i.lit && styles.lit]}>{i.lit ? "● 점등" : "○ 정상"}</Text>
            </View>
            {expanded && (
              <Text style={styles.sub}>
                {i.reason}
                {"\n"}점등 기준: {i.rule} · {i.asOf} · {i.source}
              </Text>
            )}
          </Pressable>
        );
      })}
      {risk.failed.length > 0 && <Text style={styles.note}>불러오지 못한 항목: {risk.failed.join(", ")}</Text>}
      <Text style={styles.note}>
        0~1개 평상 · 2개 관찰 · 3개 이상 경계. 경고는 시점을 알려주지 못하고 거짓 경보도 많아요. 매매 신호를 바꾸지 않고, 비중과
        현금 여력을 점검하는 용도로만 봅니다.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  top: { flexDirection: "row", alignItems: "baseline" },
  label: { flex: 1, ...type.body, fontFamily: fonts.sansMedium, fontSize: 13, color: colors.text },
  value: { ...type.num, fontSize: 13, color: colors.text, width: 76, textAlign: "right" },
  state: { fontFamily: fonts.sansMedium, fontSize: 12, color: colors.textMuted, width: 64, textAlign: "right" },
  lit: { color: colors.text, fontFamily: fonts.sansBold },
  sub: { ...type.caption, color: colors.textMuted, marginTop: space.xs, lineHeight: 16 },
  note: { ...type.caption, color: colors.textMuted, marginTop: space.md, lineHeight: 17 },
});
