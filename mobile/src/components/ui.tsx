// Shared building blocks for the Toss-style layout (DESIGN.md): bold section titles, thick bands
// between sections, change pills, letter avatars and pill chips. Colors are the app's own.
import React, { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { colors, fonts, radius, space, tones, type, type Tone } from "../theme";
import { Press } from "./motion";

export function Section({
  title,
  desc,
  right,
  first,
  eyebrow,
  children,
}: {
  title: string;
  desc?: string;
  // Group label above the first section of a zone (e.g. 오늘: "개별 종목", "ISA · 시장").
  eyebrow?: string;
  right?: React.ReactNode;
  first?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
    {!first && <Band />}
    <View style={styles.section}>
      {!!eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}
      <View style={styles.titleRow}>
        <Text style={styles.title}>{title}</Text>
        {right}
      </View>
      {!!desc && <Text style={styles.desc}>{desc}</Text>}
      <View style={{ marginTop: space.md }}>{children}</View>
    </View>
    </>
  );
}

// A signal: colored dot + word on its tone's tint (theme.tones, mapped in signal.ts). The word is
// always there, so the meaning never rests on color alone.
export function ToneTag({ tone, label, size = "sm" }: { tone: Tone; label: string; size?: "sm" | "md" | "lg" }) {
  const t = tones[tone];
  const s = TAG_SIZES[size];
  return (
    <View style={[styles.tag, { backgroundColor: t.soft, paddingHorizontal: s.px, paddingVertical: s.py }]} accessibilityLabel={label}>
      <View style={{ width: s.dot, height: s.dot, borderRadius: s.dot / 2, backgroundColor: t.fg }} />
      <Text style={{ fontFamily: fonts.sansBold, fontSize: s.font, color: t.fg }}>{label}</Text>
    </View>
  );
}
const TAG_SIZES = {
  sm: { px: 7, py: 2, dot: 6, font: 11 },
  md: { px: 10, py: 4, dot: 8, font: 14 },
  lg: { px: 14, py: 6, dot: 10, font: 20 },
};

export function Band() {
  return <View style={styles.band} />;
}

// "▲ 1.25%" on a tinted pill; direction is carried by the glyph as well as the color.
export function ChangePill({ value, digits = 2 }: { value: number | null | undefined; digits?: number }) {
  if (value == null) return <Text style={styles.pillNone}>-</Text>;
  const up = value > 0;
  const flat = value === 0;
  return (
    <View style={[styles.pill, { backgroundColor: flat ? colors.surface : up ? colors.upSoft : colors.downSoft }]}>
      <Text style={[styles.pillText, { color: flat ? colors.flat : up ? colors.up : colors.down }]}>
        {flat ? "" : up ? "▲ " : "▼ "}
        {Math.abs(value).toFixed(digits)}%
      </Text>
    </View>
  );
}

// Company logo in a circle (Naver Securities image); the name's first letters when there's no logo
// or it fails to load.
export function Avatar({ name, uri, size = 40 }: { name: string; uri?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        onError={() => setFailed(true)}
        resizeMode="cover"
        style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}
        accessibilityLabel={`${name} 로고`}
      />
    );
  }
  // "SK하이닉스" -> "SK", "삼성전자" -> "삼", "NVIDIA" -> "NV"
  const latin = name.match(/^[A-Za-z0-9]+/);
  const label = latin ? latin[0].slice(0, 2).toUpperCase() : name.slice(0, 1);
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.36 }]}>{label}</Text>
    </View>
  );
}

export function Chips<T extends string>({
  options,
  value,
  onChange,
  labelFor,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (k: T) => void;
  labelFor?: (label: string) => string;
}) {
  return (
    <View style={styles.chips} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Press
            key={o.key}
            onPress={() => onChange(o.key)}
            hitSlop={6}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={labelFor ? labelFor(o.label) : o.label}
            style={[styles.chip, on && styles.chipOn]}
          >
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{o.label}</Text>
          </Press>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tag: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.pill, alignSelf: "flex-start" },
  section: { paddingHorizontal: space.lg, paddingVertical: space.xl },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { ...type.section },
  desc: { ...type.caption, color: colors.textMuted, marginTop: space.xs },
  eyebrow: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.accent, letterSpacing: 0.5, marginBottom: space.xs },
  band: { height: 10, backgroundColor: colors.band },
  pill: { borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4, alignSelf: "flex-end" },
  pillText: { fontFamily: fonts.sansBold, fontSize: 13, fontVariant: ["tabular-nums"] },
  pillNone: { ...type.caption, color: colors.textMuted },
  avatar: { backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: fonts.sansBold, color: colors.text },
  chips: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill },
  chipOn: { backgroundColor: colors.surface },
  chipText: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.textMuted },
  chipTextOn: { color: colors.text, fontFamily: fonts.sansBold },
});
