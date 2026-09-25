import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "../theme";
import type { HeatmapMarket } from "../types";

type Rect = { x: number; y: number; w: number; h: number };

// Squarified treemap (Bruls et al.): lays values out as rectangles close to square, so areas stay
// comparable by eye. Values must be sorted descending.
function squarify(values: number[], r: Rect): Rect[] {
  const total = values.reduce((a, b) => a + b, 0);
  if (!total || r.w <= 0 || r.h <= 0) return values.map(() => ({ x: r.x, y: r.y, w: 0, h: 0 }));
  const scale = (r.w * r.h) / total;
  const areas = values.map((v) => v * scale);
  const out: Rect[] = [];
  let rect = { ...r };
  let i = 0;
  while (i < areas.length) {
    const side = Math.min(rect.w, rect.h);
    const row: number[] = [areas[i]];
    let j = i + 1;
    const worst = (rw: number[]) => {
      const s = rw.reduce((a, b) => a + b, 0);
      return Math.max((side * side * Math.max(...rw)) / (s * s), (s * s) / (side * side * Math.min(...rw)));
    };
    while (j < areas.length && worst([...row, areas[j]]) <= worst(row)) row.push(areas[j++]);
    const s = row.reduce((a, b) => a + b, 0);
    if (rect.w >= rect.h) {
      const colW = s / rect.h;
      let y = rect.y;
      for (const a of row) {
        out.push({ x: rect.x, y, w: colW, h: a / colW });
        y += a / colW;
      }
      rect = { x: rect.x + colW, y: rect.y, w: rect.w - colW, h: rect.h };
    } else {
      const rowH = s / rect.w;
      let x = rect.x;
      for (const a of row) {
        out.push({ x, y: rect.y, w: a / rowH, h: rowH });
        x += a / rowH;
      }
      rect = { x: rect.x, y: rect.y + rowH, w: rect.w, h: rect.h - rowH };
    }
    i = j;
  }
  return out;
}

function hex(c: string) {
  return [1, 3, 5].map((k) => parseInt(c.slice(k, k + 2), 16));
}
function mix(a: string, b: string, t: number) {
  const [x, y] = [hex(a), hex(b)];
  return `rgb(${x.map((v, k) => Math.round(v + (y[k] - v) * t)).join(",")})`;
}

// Red up / blue down (Korean convention, DESIGN.md), deeper with a bigger move; ±3% is full color.
function cellColor(change: number | null) {
  if (change == null) return colors.hairline;
  const t = Math.min(Math.abs(change) / 3, 1);
  return mix(colors.hairline, change >= 0 ? colors.up : colors.down, 0.2 + 0.8 * t);
}

const LABEL_H = 14;

export function Heatmap({
  market,
  width,
  height,
  onPress,
}: {
  market: HeatmapMarket;
  width: number;
  height: number;
  onPress: (symbol: string, name: string) => void;
}) {
  const layout = useMemo(() => {
    const sectorRects = squarify(
      market.sectors.map((s) => s.stocks.reduce((a, c) => a + c.cap, 0)),
      { x: 0, y: 0, w: width, h: height }
    );
    return market.sectors.map((sec, k) => {
      const r = sectorRects[k];
      const labeled = r.h > LABEL_H * 2.5 && r.w > 44;
      const inner = labeled ? { x: r.x, y: r.y + LABEL_H, w: r.w, h: r.h - LABEL_H } : r;
      return { sec, r, labeled, cells: squarify(sec.stocks.map((c) => c.cap), inner) };
    });
  }, [market, width, height]);

  return (
    <View style={{ width, height }} accessibilityLabel={`${market.name} 히트맵`}>
      {layout.map(({ sec, r, labeled, cells }) => (
        <React.Fragment key={sec.name}>
          {labeled && (
            <Text numberOfLines={1} style={[styles.sector, { left: r.x + 3, top: r.y, width: r.w - 6 }]}>
              {sec.name}
            </Text>
          )}
          {sec.stocks.map((c, i) => {
            const cell = cells[i];
            const big = cell.w > 46 && cell.h > 30;
            const label = market.id === "KR" ? c.name : c.symbol;
            const pct = c.change == null ? "-" : `${c.change > 0 ? "▲" : c.change < 0 ? "▼" : ""}${Math.abs(c.change).toFixed(1)}%`;
            return (
              <Pressable
                key={c.symbol}
                onPress={() => onPress(c.symbol, c.name)}
                accessibilityRole="button"
                accessibilityLabel={`${c.name} ${pct}`}
                style={[
                  styles.cell,
                  { left: cell.x, top: cell.y, width: cell.w, height: cell.h, backgroundColor: cellColor(c.change) },
                ]}
              >
                {cell.w > 26 && cell.h > 16 && (
                  <Text numberOfLines={1} style={[styles.label, big && styles.labelBig]}>
                    {label}
                  </Text>
                )}
                {big && <Text style={styles.pct}>{pct}</Text>}
              </Pressable>
            );
          })}
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  sector: { position: "absolute", height: LABEL_H, fontFamily: fonts.sansMedium, fontSize: 10, color: colors.textMuted },
  cell: {
    position: "absolute",
    borderWidth: 1,
    borderColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    paddingHorizontal: 2,
  },
  label: { fontFamily: fonts.sansMedium, fontSize: 9, color: colors.text },
  labelBig: { fontFamily: fonts.sansBold, fontSize: 12 },
  pct: { fontFamily: fonts.mono, fontSize: 10, color: colors.text, marginTop: 1 },
});
