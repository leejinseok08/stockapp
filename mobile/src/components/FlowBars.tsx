import React from "react";
import Svg, { Line, Rect } from "react-native-svg";
import { colors } from "../theme";

// Daily net buying as bars from a zero baseline: above = net buy, below = net sell.
export function FlowBars({ values, width, height = 56 }: { values: number[]; width: number; height?: number }) {
  if (!values.length) return null;
  const maxAbs = Math.max(...values.map((v) => Math.abs(v))) || 1;
  const mid = height / 2;
  const slot = width / values.length;
  const barW = Math.max(2, slot * 0.6);

  return (
    <Svg width={width} height={height} accessibilityLabel="최근 일별 순매수 막대 차트">
      {values.map((v, i) => {
        const h = (Math.abs(v) / maxAbs) * (mid - 2);
        return (
          <Rect
            key={i}
            x={i * slot + (slot - barW) / 2}
            y={v >= 0 ? mid - h : mid}
            width={barW}
            height={Math.max(h, 1)}
            fill={v >= 0 ? colors.up : colors.down}
          />
        );
      })}
      <Line x1={0} y1={mid} x2={width} y2={mid} stroke={colors.textMuted} strokeWidth={0.75} />
    </Svg>
  );
}
