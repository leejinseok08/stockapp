import React from "react";
import Svg, { Circle, Line, Polyline, Text as SvgText } from "react-native-svg";
import { fmtPrice } from "../format";
import { colors, fonts } from "../theme";

type Props = {
  times: number[];
  closes: number[];
  ma?: (number | null)[];
  currency?: string | null;
  width: number;
  height?: number;
};

const GUTTER_RIGHT = 56;
const GUTTER_BOTTOM = 18;
const PAD_TOP = 8;

// Unsmoothed line: straight segments between real closes, no interpolated prices.
export function PriceChart({ times, closes, ma, currency, width, height = 190 }: Props) {
  if (closes.length < 2) return null;

  const plotW = width - GUTTER_RIGHT;
  const plotH = height - GUTTER_BOTTOM - PAD_TOP;
  const values = [...closes, ...((ma ?? []).filter((v) => v != null) as number[])];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const x = (i: number) => (i / (closes.length - 1)) * plotW;
  const y = (v: number) => PAD_TOP + (1 - (v - min) / span) * plotH;
  const pts = (arr: number[], offset = 0) => arr.map((v, i) => `${x(i + offset)},${y(v)}`).join(" ");

  // MA only exists from the first full window onward; draw just that span.
  const maStart = ma ? ma.findIndex((v) => v != null) : -1;
  const maValues = maStart >= 0 ? (ma!.slice(maStart) as number[]) : [];

  const last = closes[closes.length - 1];
  const dateLabel = (t: number) => new Date(t).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
  const mid = Math.floor((closes.length - 1) / 2);

  return (
    <Svg width={width} height={height} accessibilityLabel="가격 차트">
      <Line x1={0} y1={y(max)} x2={plotW} y2={y(max)} stroke={colors.hairline} strokeWidth={1} />
      <Line x1={0} y1={y(min)} x2={plotW} y2={y(min)} stroke={colors.hairline} strokeWidth={1} />

      {maValues.length > 1 && (
        <Polyline points={pts(maValues, maStart)} fill="none" stroke={colors.accent} strokeWidth={1} />
      )}
      <Polyline points={pts(closes)} fill="none" stroke={colors.text} strokeWidth={1.5} strokeLinejoin="round" />
      <Circle cx={x(closes.length - 1)} cy={y(last)} r={3} fill={colors.text} />

      <SvgText x={plotW + 6} y={y(max) + 4} fill={colors.textMuted} fontSize={10} fontFamily={fonts.mono}>
        {fmtPrice(max, currency)}
      </SvgText>
      <SvgText x={plotW + 6} y={y(min) + 4} fill={colors.textMuted} fontSize={10} fontFamily={fonts.mono}>
        {fmtPrice(min, currency)}
      </SvgText>

      {[0, mid, closes.length - 1].map((i, k) => (
        <SvgText
          key={k}
          x={x(i)}
          y={height - 4}
          fill={colors.textMuted}
          fontSize={10}
          fontFamily={fonts.mono}
          textAnchor={k === 0 ? "start" : k === 1 ? "middle" : "end"}
        >
          {dateLabel(times[i])}
        </SvgText>
      ))}
    </Svg>
  );
}
