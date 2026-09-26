// 스윙 후보 on 오늘: after each market's close the server scans the liquid whole market for the
// swing techniques that held up in the backtest (backend app/services/screener.py). Each technique
// shows its record next to its candidates; techniques that failed the backtest are not shown.
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { fmtPrice } from "../format";
import { colors, fonts, space, type } from "../theme";
import type { SwingScan } from "../types";
import { Avatar, Chips, Section } from "./ui";

const SHOW = 3;
const pct = (v: number, d = 1) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v * 100).toFixed(d)}%`;

export function SwingSection({
  scans,
  onOpen,
}: {
  scans: Partial<Record<"KR" | "US", SwingScan>>;
  onOpen: (symbol: string, name?: string | null) => void;
}) {
  const markets = (["KR", "US"] as const).filter((m) => scans[m]);
  const [market, setMarket] = useState<"KR" | "US">(markets[0] ?? "KR");
  const [open, setOpen] = useState<string | null>(null);
  const scan = scans[market];
  if (!markets.length || !scan) return null;
  const cur = market === "KR" ? "KRW" : "USD";

  return (
    <Section
      title="스윙 후보"
      desc={`${scan.asOf?.slice(5).replace("-", "/") ?? ""} 마감 · 거래대금 상위 ${scan.scanned}종목 · 과거 성적을 통과한 기법만`}
      right={
        markets.length > 1 ? (
          <Chips
            options={markets.map((m) => ({ key: m, label: m === "KR" ? "국내" : "미국" }))}
            value={market}
            onChange={(m) => setMarket(m as "KR" | "US")}
          />
        ) : undefined
      }
    >
      {scan.techniques.length === 0 ? (
        <Text style={styles.note}>백테스트에서 그냥 보유보다 나은 기법이 없어 후보를 보여주지 않아요.</Text>
      ) : scan.groups.length === 0 ? (
        <Text style={styles.note}>오늘 조건에 맞는 종목이 없어요 ({scan.techniques.map((t) => t.name).join(" · ")}).</Text>
      ) : (
        [...scan.groups].sort((a, b) => b.record.edge - a.record.edge).map((g) => {
          const all = open === g.key;
          const shown = all ? g.candidates : g.candidates.slice(0, SHOW);
          return (
          <View key={g.key} style={styles.group}>
            <Pressable
              onPress={() => setOpen(all ? null : g.key)}
              accessibilityRole="button"
              accessibilityLabel={`${g.name} 후보 ${g.count}개, ${all ? "접기" : "더 보기"}`}
            >
              <Text style={styles.tech}>
                {g.name} <Text style={styles.count}>{g.count}개 {g.candidates.length > SHOW ? (all ? "▴" : "▾") : ""}</Text>
              </Text>
            </Pressable>
            <Text style={styles.record}>
              과거 {g.record.trades.toLocaleString()}회 · 승률 {Math.round(g.record.win * 100)}% · 회당 {pct(g.record.avg)} (그냥 보유보다{" "}
              {pct(g.record.edge, 2)}) · 평균 {g.record.days.toFixed(0)}일
            </Text>
            <Text style={styles.plan}>{g.plan}</Text>
            {shown.map((c) => (
              <Pressable
                key={c.symbol}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface }]}
                onPress={() => onOpen(c.symbol, c.name)}
                accessibilityRole="button"
                accessibilityLabel={`${c.name ?? c.symbol} ${g.name} 후보, 종가 ${fmtPrice(c.close, cur)}`}
              >
                <Avatar name={c.name ?? c.symbol} size={28} />
                <Text style={styles.name} numberOfLines={1}>
                  {c.name ?? c.symbol}
                </Text>
                <View style={styles.right}>
                  <Text style={styles.price}>{fmtPrice(c.close, cur)}</Text>
                  <Text style={styles.order}>{c.limit != null ? `지정가 ${fmtPrice(c.limit, cur)}` : "다음 날 시가"}</Text>
                </View>
              </Pressable>
            ))}
            {all && g.count > g.candidates.length && <Text style={styles.more}>거래대금 순 상위 {g.candidates.length}개만 표시</Text>}
          </View>
          );
        })
      )}
      {scan.marketOk === false && scan.techniques.some((t) => t.needsMarket) && (
        <Text style={styles.note}>
          {scan.techniques.filter((t) => t.needsMarket).map((t) => t.name).join(", ")}: 지수가 오르는 50일선 위에 있을 때만 신호가 나와요 · 지금은 조건
          밖이라 쉬는 중
        </Text>
      )}
      <Text style={styles.note}>
        학습한 기법 {scan.techniques.length + scan.excluded.length}개 중 {scan.excluded.length}개는 과거 성적 미달로 제외 · 현재 상장 종목만으로 검증해
        성적이 실제보다 좋게 나왔을 수 있어요
      </Text>
    </Section>
  );
}

const styles = StyleSheet.create({
  note: { ...type.caption, color: colors.textMuted, marginTop: space.sm, lineHeight: 17 },
  group: { marginBottom: space.lg },
  tech: { ...type.body, fontFamily: fonts.sansBold, color: colors.text },
  count: { fontFamily: fonts.sans, fontSize: 12, color: colors.textMuted },
  record: { ...type.caption, color: colors.text, marginTop: 2 },
  plan: { ...type.caption, color: colors.textMuted, marginTop: 2, lineHeight: 16 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: space.sm, gap: space.sm },
  name: { ...type.body, fontSize: 14, color: colors.text, flex: 1 },
  right: { alignItems: "flex-end" },
  price: { ...type.numStrong, fontSize: 13, color: colors.text },
  order: { ...type.caption, fontSize: 11, color: colors.textMuted },
  more: { ...type.caption, color: colors.textMuted },
});
