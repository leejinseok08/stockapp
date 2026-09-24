import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts, space, type } from "../theme";
import type { SignalTarget } from "../types";

const MISSING_LABELS: Record<string, string> = {
  flows: "외국인 수급 (KRX 로그인 필요)",
  fear: "VIX",
  fx: "환율",
  position: "52주 위치",
  overheat: "200일선",
  pullback: "1개월 수익률",
};

export function SignalRow({ target }: { target: SignalTarget }) {
  const [open, setOpen] = useState(false);
  const score = target.score != null ? Math.round(target.score) : null;

  return (
    <View style={styles.wrap}>
      <Pressable
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${target.name} 시장 온도 ${score ?? "정보 없음"}점, ${target.action ?? ""}. 눌러서 근거 보기`}
      >
        <View style={styles.left}>
          <Text style={[styles.name, target.reference && styles.muted]}>{target.name}</Text>
          <Text style={styles.etf}>{target.etfExample}</Text>
        </View>
        <View style={styles.right}>
          <Text style={[styles.score, target.reference && styles.muted]}>{score ?? "-"}</Text>
          <Text style={styles.action}>{target.action ?? "-"}</Text>
        </View>
        <Feather name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.textMuted} style={styles.chevron} />
      </Pressable>

      {open && (
        <View style={styles.detail}>
          {target.components.map((c) => (
            <View key={c.key} style={styles.comp}>
              <View style={styles.compTop}>
                <Text style={styles.compLabel}>
                  {c.label} <Text style={styles.weight}>{Math.round(c.weight * 100)}%</Text>
                </Text>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${Math.max(0, Math.min(100, c.score))}%` }]} />
                </View>
                <Text style={styles.compScore}>{Math.round(c.score)}</Text>
              </View>
              <Text style={styles.reason}>{c.reason}</Text>
            </View>
          ))}
          {!!target.fxHint && <Text style={styles.hint}>{target.fxHint}</Text>}
          {target.missing.length > 0 && (
            <Text style={styles.reason}>
              빠진 입력: {target.missing.map((m) => MISSING_LABELS[m] ?? m).join(", ")} · 나머지로 비중을 다시 계산했어요
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: space.md },
  left: { flex: 1 },
  name: { ...type.body, fontFamily: fonts.sansMedium, color: colors.text },
  etf: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  right: { alignItems: "flex-end" },
  score: { ...type.display, fontSize: 24, color: colors.text },
  action: { fontFamily: fonts.sansMedium, fontSize: 12, color: colors.textMuted },
  muted: { color: colors.textMuted },
  chevron: { marginLeft: space.sm },
  detail: { paddingBottom: space.md },
  comp: { paddingVertical: space.xs + 2 },
  compTop: { flexDirection: "row", alignItems: "center" },
  compLabel: { ...type.caption, color: colors.text, width: 128 },
  weight: { fontFamily: fonts.mono, color: colors.textMuted, fontSize: 10 },
  track: { flex: 1, height: 4, backgroundColor: colors.hairline, borderRadius: 2, overflow: "hidden" },
  fill: { height: 4, backgroundColor: colors.text },
  compScore: { ...type.numStrong, fontSize: 12, color: colors.text, width: 32, textAlign: "right" },
  reason: { ...type.caption, color: colors.textMuted, marginTop: 2, lineHeight: 16 },
  hint: { ...type.caption, color: colors.accent, marginTop: space.sm },
});
