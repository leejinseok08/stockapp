import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Polygon, Text as SvgText } from "react-native-svg";
import { colors } from "../theme";

export type RadarAxis = {
  label: string;
  value: number | null; // 0-100
};

const RINGS = [0.25, 0.5, 0.75, 1];

export function RadarChart({ axes, size = 220 }: { axes: RadarAxis[]; size?: number }) {
  const center = size / 2;
  const radius = size / 2 - 36;
  const n = axes.length;
  const angleFor = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;

  const pointAt = (i: number, fraction: number) => {
    const angle = angleFor(i);
    return {
      x: center + radius * fraction * Math.cos(angle),
      y: center + radius * fraction * Math.sin(angle),
    };
  };

  const dataPoints = axes.map((a, i) => pointAt(i, Math.max(0, Math.min(100, a.value ?? 0)) / 100));
  const dataPolygon = dataPoints.map((p) => `${p.x},${p.y}`).join(" ");
  const hasAnyValue = axes.some((a) => a.value != null);
  const avg = hasAnyValue
    ? Math.round(
        axes.reduce((sum, a) => sum + (a.value ?? 0), 0) / axes.filter((a) => a.value != null).length
      )
    : null;

  return (
    <View style={styles.container}>
      <Svg width={size} height={size}>
        {RINGS.map((r) => {
          const ringPoints = axes.map((_, i) => pointAt(i, r)).map((p) => `${p.x},${p.y}`).join(" ");
          return <Polygon key={r} points={ringPoints} fill="none" stroke={colors.border} strokeWidth={1} />;
        })}

        {axes.map((_, i) => {
          const outer = pointAt(i, 1);
          return <Line key={i} x1={center} y1={center} x2={outer.x} y2={outer.y} stroke={colors.border} strokeWidth={1} />;
        })}

        {hasAnyValue && (
          <Polygon points={dataPolygon} fill={colors.accent} fillOpacity={0.25} stroke={colors.accent} strokeWidth={2} />
        )}

        {hasAnyValue &&
          dataPoints.map((p, i) =>
            axes[i].value != null ? <Circle key={i} cx={p.x} cy={p.y} r={3} fill={colors.accent} /> : null
          )}

        {axes.map((a, i) => {
          const label = pointAt(i, 1.28);
          const anchor = Math.cos(angleFor(i)) > 0.3 ? "start" : Math.cos(angleFor(i)) < -0.3 ? "end" : "middle";
          return (
            <SvgText
              key={a.label}
              x={label.x}
              y={label.y}
              fill={colors.textMuted}
              fontSize={11}
              textAnchor={anchor}
              alignmentBaseline="middle"
            >
              {a.label}
            </SvgText>
          );
        })}
      </Svg>
      {avg != null && (
        <View style={styles.scoreBadge}>
          <Text style={styles.scoreValue}>{avg}</Text>
          <Text style={styles.scoreLabel}>종합점수</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", justifyContent: "center" },
  scoreBadge: { position: "absolute", alignItems: "center" },
  scoreValue: { color: colors.text, fontSize: 22, fontWeight: "800" },
  scoreLabel: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
});
