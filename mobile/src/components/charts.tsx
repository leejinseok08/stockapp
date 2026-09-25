// Small at-a-glance charts (dataviz skill: pick the form by the data's job).
// - Sparkline: a value against its danger line over a year (stat tile with trend)
// - Pips: "n of 5 lit" as a segmented meter
// - BandMeter: a 0-100 score against its three reading bands
// - RangeBar: where today sits in the 52-week low-high range
// - DivergingBar: gain vs loss around zero
// Red/blue stay reserved for up/down (DESIGN.md); danger zones are neutral shading + a label.
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Polyline, Rect } from "react-native-svg";
import { colors, fonts, radius } from "../theme";

export type Zone = { from: number | null; to: number | null };

export function Sparkline({
  points,
  zones,
  width,
  height = 36,
  emphasis,
}: {
  points: number[];
  zones: Zone[];
  width: number;
  height?: number;
  emphasis?: boolean;
}) {
  if (points.length < 2) return <View style={{ width, height }} />;
  const edges = zones.flatMap((z) => [z.from, z.to]).filter((v): v is number => v != null);
  let lo = Math.min(...points, ...edges);
  let hi = Math.max(...points, ...edges);
  const pad = (hi - lo || 1) * 0.12;
  lo -= pad;
  hi += pad;
  const y = (v: number) => ((hi - v) / (hi - lo)) * height;
  const x = (i: number) => (i / (points.length - 1)) * (width - 4);
  const last = points[points.length - 1];
  const line = emphasis ? colors.text : colors.textMuted;
  return (
    <Svg width={width} height={height}>
      {zones.map((z, k) => {
        const top = y(z.to ?? hi);
        const bottom = y(z.from ?? lo);
        return <Rect key={k} x={0} y={top} width={width} height={Math.max(bottom - top, 0)} fill={colors.hairline} />;
      })}
      {edges.map((v, k) => (
        <Line key={`e${k}`} x1={0} x2={width} y1={y(v)} y2={y(v)} stroke={colors.textMuted} strokeWidth={0.5} />
      ))}
      <Polyline
        points={points.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
        fill="none"
        stroke={line}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <Circle cx={x(points.length - 1)} cy={y(last)} r={3} fill={line} />
    </Svg>
  );
}

export function Pips({ lit, total }: { lit: boolean[]; total: number }) {
  return (
    <View style={styles.pips} accessibilityLabel={`${total}개 중 ${lit.filter(Boolean).length}개 점등`}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[styles.pip, lit[i] && styles.pipOn]} />
      ))}
    </View>
  );
}

// Bands are ordered readings of one scale, so they step in lightness of one neutral, not hues.
export function BandMeter({
  value,
  bands,
  width,
}: {
  value: number | null;
  bands: { from: number; to: number; label: string }[];
  width: number;
}) {
  const shades = [colors.hairline, "#2E333B", "#3A4049"];
  return (
    <View style={{ width }}>
      <View style={styles.bandTrack}>
        {bands.map((b, i) => (
          <View key={b.label} style={{ flex: b.to - b.from, backgroundColor: shades[i % shades.length], marginRight: i < bands.length - 1 ? 2 : 0 }} />
        ))}
        {value != null && <View style={[styles.marker, { left: `${Math.max(0, Math.min(100, value))}%` }]} />}
      </View>
      <View style={{ flexDirection: "row" }}>
        {bands.map((b) => (
          <Text key={b.label} style={[styles.bandLabel, { flex: b.to - b.from }]} numberOfLines={1}>
            {b.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function RangeBar({ position, width }: { position: number | null | undefined; width: number }) {
  const p = position == null ? null : Math.max(0, Math.min(100, position));
  return (
    <View style={{ width }}>
      <View style={styles.rangeTrack}>{p != null && <View style={[styles.marker, { left: `${p}%` }]} />}</View>
      <View style={styles.rangeLabels}>
        <Text style={styles.bandLabel}>52주 최저</Text>
        <Text style={styles.bandLabel}>최고</Text>
      </View>
    </View>
  );
}

export function DivergingBar({ value, max, width }: { value: number | null | undefined; max: number; width: number }) {
  const half = width / 2;
  const len = value == null || !max ? 0 : Math.min(Math.abs(value) / max, 1) * (half - 2);
  const up = (value ?? 0) >= 0;
  return (
    <View style={{ width, height: 10, justifyContent: "center" }}>
      <View style={[styles.axis, { left: half }]} />
      {len > 0 && (
        <View
          style={{
            position: "absolute",
            height: 8,
            width: len,
            left: up ? half + 1 : half - 1 - len,
            backgroundColor: up ? colors.up : colors.down,
            borderRadius: 2,
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pips: { flexDirection: "row", gap: 4 },
  pip: { flex: 1, height: 10, borderRadius: 3, backgroundColor: colors.hairline },
  pipOn: { backgroundColor: colors.text },
  bandTrack: { flexDirection: "row", height: 8, borderRadius: radius.sm, overflow: "hidden" },
  marker: { position: "absolute", top: -4, width: 3, height: 16, marginLeft: -1.5, borderRadius: 2, backgroundColor: colors.text },
  bandLabel: { fontFamily: fonts.sans, fontSize: 10, color: colors.textMuted, marginTop: 3 },
  rangeTrack: { height: 6, borderRadius: 3, backgroundColor: colors.hairline },
  rangeLabels: { flexDirection: "row", justifyContent: "space-between" },
  axis: { position: "absolute", width: 1, height: 14, backgroundColor: colors.textMuted },
});
