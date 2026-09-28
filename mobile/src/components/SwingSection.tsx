// 스윙 on 오늘: only the conclusion. BUY = stocks where a technique that passed the backtest fired at
// the last close (backend screener.scan, calmest first; KR paused in an index uptrend); SELL = holdings bought on such a signal whose exit rule is
// due (screener.sells). Counts first, the top three ranked, the rest one tap away; the techniques behind a
// signal are shown on the stock's report (passed along when the row is opened).
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { fmtMoney, fmtPrice } from "../format";
import { colors, fonts, space, trendColor, trendGlyph, type } from "../theme";
import type { SwingPaper, SwingScan, SwingSell } from "../types";
import { SignalBadge } from "./SignalBadge";
import { Avatar, Chips, Section, ToneTag } from "./ui";
import { Press } from "./motion";

const SHOW = 3;
const md = (d: string) => d.slice(5).replace("-", "/");

export type SwingInfo = { action: "BUY" | "SELL"; techniques: string[]; order: string; note?: string };

type Row = {
  symbol: string;
  name: string | null;
  action: "BUY" | "SELL";
  tags: string[];
  order: string; // "다음 날 시가" or "지정가 12,300"
  note?: string;
};

export function SwingSection({
  scans,
  sells,
  paper,
  onOpen,
}: {
  scans: Partial<Record<"KR" | "US", SwingScan>>;
  sells: SwingSell[];
  paper: Partial<Record<"KR" | "US", SwingPaper>>;
  onOpen: (symbol: string, name: string | null, swing: SwingInfo) => void;
}) {
  const markets = (["KR", "US"] as const).filter((m) => scans[m] || sells.some((s) => s.market === m));
  const [market, setMarket] = useState<"KR" | "US">(markets[0] ?? "KR");
  const [all, setAll] = useState(false);
  if (!markets.length) return null;
  const scan = scans[market];
  const cur = market === "KR" ? "KRW" : "USD";
  const order = (limit: number | null) => (limit != null ? `지정가 ${fmtPrice(limit, cur)}` : "다음 날 시가");

  // One BUY per stock, however many techniques fired on it (merged and ordered on the server; older
  // scans are merged here from the per-technique groups).
  let buys: Row[];
  if (scan?.buys) {
    buys = scan.buys.map((c) => ({ symbol: c.symbol, name: c.name, action: "BUY", tags: c.techniques, order: order(c.limit) }));
  } else {
    const bySymbol = new Map<string, Row>();
    for (const g of scan?.groups ?? []) {
      for (const c of g.candidates) {
        const r = bySymbol.get(c.symbol);
        if (r) r.tags.push(g.short ?? g.name);
        else bySymbol.set(c.symbol, { symbol: c.symbol, name: c.name, action: "BUY", tags: [g.short ?? g.name], order: order(c.limit) });
      }
    }
    buys = [...bySymbol.values()].sort((a, b) => b.tags.length - a.tags.length);
  }
  const buyCount = scan?.buyCount ?? buys.length;
  const sellRows: Row[] = sells
    .filter((s) => s.market === market)
    .map((s) => ({
      symbol: s.symbol,
      name: s.name,
      action: "SELL",
      tags: s.techniques,
      order: order(s.limit),
      note: s.since ? `${md(s.since)} 매도 조건` : undefined,
    }));
  const shownBuys = all ? buys : buys.slice(0, SHOW);
  const acct = paper[market]?.account;
  const asOf = scan?.asOf ?? sells.find((s) => s.market === market)?.date;

  return (
    <Section
      title="스윙"
      desc={`${asOf ? `${md(asOf)} 마감 · ` : ""}다음 거래일 주문`}
      right={
        markets.length > 1 ? (
          <Chips
            options={markets.map((m) => ({ key: m, label: m === "KR" ? "국내" : "미국" }))}
            value={market}
            onChange={(m) => {
              setMarket(m as "KR" | "US");
              setAll(false);
            }}
          />
        ) : undefined
      }
    >
      <View style={styles.summary} accessible accessibilityLabel={`BUY ${buyCount}개, SELL ${sellRows.length}개`}>
        <ToneTag tone={buyCount > 0 ? "good" : "neutral"} label={`BUY ${buyCount}`} size="md" />
        <ToneTag tone={sellRows.length > 0 ? "caution" : "neutral"} label={`SELL ${sellRows.length}`} size="md" />
      </View>
      {acct && acct.trades > 0 && (
        <Text style={styles.paper} accessibilityLabel={`모의 매매 ${md(paper[market]!.since)}부터 손익 ${fmtMoney(acct.pnl, cur)}`}>
          모의 매매 {md(paper[market]!.since)}~ · {acct.slots ?? 10}칸{" "}
          <Text style={{ color: trendColor(acct.pnl) }}>
            {trendGlyph(acct.pnl)} {fmtMoney(Math.abs(acct.pnl), cur)} ({Math.abs(acct.ret * 100).toFixed(2)}%)
          </Text>
          {acct.win != null ? ` · 승률 ${Math.round(acct.win * 100)}%` : ""}
        </Text>
      )}

      {sellRows.map((r) => (
        <SwingRow key={`s-${r.symbol}`} row={r} onPress={() => onOpen(r.symbol, r.name, info(r))} />
      ))}
      {shownBuys.map((r, i) => (
        <SwingRow key={`b-${r.symbol}`} row={r} rank={i + 1} onPress={() => onOpen(r.symbol, r.name, info(r))} />
      ))}
      {buys.length > SHOW && (
        <Press
          onPress={() => setAll(!all)}
          style={styles.moreBtn}
          accessibilityRole="button"
          accessibilityLabel={all ? "BUY 접기" : `BUY ${buys.length}개 전체 보기`}
        >
          <Text style={styles.more}>{all ? "접기" : `BUY ${buys.length}개 전체 보기`}</Text>
        </Press>
      )}
      {all && buyCount > buys.length && <Text style={styles.empty}>상위 {buys.length}개</Text>}
      {scan?.paused && <Text style={styles.empty}>지수 상승 추세라 BUY는 쉬어요</Text>}
      {!scan?.paused && buys.length === 0 && sellRows.length === 0 && <Text style={styles.empty}>오늘은 신호가 없어요</Text>}
    </Section>
  );
}

const info = (r: Row): SwingInfo => ({ action: r.action, techniques: r.tags, order: r.order, note: r.note });

function SwingRow({ row, rank, onPress }: { row: Row; rank?: number; onPress: () => void }) {
  return (
    <Press
      style={styles.row}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${rank ? `${rank}위 ` : ""}${row.name ?? row.symbol} ${row.action}, ${row.order}. 눌러서 근거 보기`}
    >
      <Text style={styles.rank}>{rank ?? ""}</Text>
      <Avatar name={row.name ?? row.symbol} size={40} />
      <View style={styles.mid}>
        <Text style={styles.name} numberOfLines={1}>
          {row.name ?? row.symbol}
        </Text>
        <Text style={styles.tags} numberOfLines={1}>
          {row.note ? `${row.note} · ${row.order}` : row.order}
        </Text>
      </View>
      <SignalBadge action={row.action} />
    </Press>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: "row", gap: space.sm, marginBottom: space.sm },
  paper: { ...type.caption, color: colors.textMuted, marginBottom: space.xs },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: space.md, borderRadius: 12 },
  rank: { ...type.numStrong, fontSize: 15, color: colors.textMuted, width: 22 },
  mid: { flex: 1, marginLeft: space.md, marginRight: space.sm },
  name: { ...type.body, fontFamily: fonts.sansBold, fontSize: 16, color: colors.text },
  tags: { ...type.caption, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  moreBtn: { backgroundColor: colors.surface, borderRadius: 12, paddingVertical: space.md, alignItems: "center", marginTop: space.sm },
  more: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.text },
  empty: { ...type.caption, color: colors.textMuted, textAlign: "center", marginTop: space.md },
});
