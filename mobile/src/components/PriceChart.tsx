import React, { useState } from "react";
import { GestureResponderEvent, View } from "react-native";
import Svg, { Circle, Line, Polyline, Rect, Text as SvgText } from "react-native-svg";
import { fmtPrice } from "../format";
import { colors, fonts } from "../theme";

type Props = {
  times: number[];
  closes: number[];
  ma?: (number | null)[];
  // Trade days to mark: index into closes. ▲ below the line for BUY, ▼ above it for SELL.
  marks?: { i: number; type: "BUY" | "SELL" }[];
  currency?: string | null;
  width: number;
  height?: number;
};

const GUTTER_BOTTOM = 18;
const PAD_TOP = 8;

// Unsmoothed line: straight segments between real closes, no interpolated prices.
export function PriceChart({ times, closes, ma, marks, currency, width, height = 190 }: Props) {
  // Crosshair: touch (or hover on web) shows that day's date and close; release hides it.
  const [hover, setHover] = useState<number | null>(null);
  if (closes.length < 2) return null;

  // Right gutter fits the longest axis label (KRW prices run to 7+ digits).
  const GUTTER_RIGHT = Math.max(56, fmtPrice(Math.max(...closes), currency).length * 6.4 + 10);
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

  const pick = (px: number) => setHover(Math.max(0, Math.min(closes.length - 1, Math.round((px / plotW) * (closes.length - 1)))));
  const onTouch = (e: GestureResponderEvent) => pick(e.nativeEvent.locationX);
  const web = {
    onMouseMove: (e: { nativeEvent: { offsetX: number } }) => pick(e.nativeEvent.offsetX),
    onMouseLeave: () => setHover(null),
  };

  let tip: React.ReactNode = null;
  if (hover != null) {
    const hx = x(hover);
    const hy = y(closes[hover]);
    const dt = new Date(times[hover]);
    const full = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    const maV = ma?.[hover];
    const text = `${full}  ${fmtPrice(closes[hover], currency)}${maV != null ? `  평균 ${fmtPrice(maV, currency)}` : ""}`;
    const boxW = Math.min(plotW, text.length * 6.2 + 12);
    const bx = Math.max(0, Math.min(plotW - boxW, hx - boxW / 2));
    tip = (
      <>
        <Line x1={hx} y1={PAD_TOP} x2={hx} y2={PAD_TOP + plotH} stroke={colors.textMuted} strokeWidth={1} />
        <Circle cx={hx} cy={hy} r={4} fill={colors.text} stroke={colors.background} strokeWidth={2} />
        <Rect x={bx} y={0} width={boxW} height={18} rx={4} fill={colors.surface} stroke={colors.hairline} />
        <SvgText x={bx + boxW / 2} y={13} fill={colors.text} fontSize={11} fontFamily={fonts.mono} textAnchor="middle">
          {text}
        </SvgText>
      </>
    );
  }

  return (
    <View
      onStartShouldSetResponder={() => true}
      onResponderGrant={onTouch}
      onResponderMove={onTouch}
      onResponderRelease={() => setHover(null)}
      onResponderTerminate={() => setHover(null)}
      {...(web as object)}
    >
    <Svg width={width} height={height} accessibilityLabel="가격 차트">
      <Line x1={0} y1={y(max)} x2={plotW} y2={y(max)} stroke={colors.hairline} strokeWidth={1} />
      <Line x1={0} y1={y(min)} x2={plotW} y2={y(min)} stroke={colors.hairline} strokeWidth={1} />

      {maValues.length > 1 && (
        <Polyline points={pts(maValues, maStart)} fill="none" stroke={colors.accent} strokeWidth={1} />
      )}
      <Polyline points={pts(closes)} fill="none" stroke={colors.text} strokeWidth={1.5} strokeLinejoin="round" />
      <Circle cx={x(closes.length - 1)} cy={y(last)} r={3} fill={colors.text} />

      {(marks ?? []).map((m, k) => (
        <SvgText
          key={`m${k}`}
          x={x(m.i)}
          y={m.type === "BUY" ? y(closes[m.i]) + 14 : y(closes[m.i]) - 6}
          fill={colors.text}
          fontSize={11}
          fontFamily={fonts.monoBold}
          textAnchor="middle"
        >
          {m.type === "BUY" ? "▲" : "▼"}
        </SvgText>
      ))}

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
      {tip}
    </Svg>
    </View>
  );
}
