// 분할매수 card on 오늘. Rendered only on a buy day (backend app/services/splitbuy.py); on every
// other day the owner sees nothing, by design (a standing panel read as noise).
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { readSetting } from "../cache";
import { fmtMoney, fmtTrendPct } from "../format";
import { colors, fonts, radius, space, trendColor, type } from "../theme";
import type { SplitBuy } from "../types";
import { Section } from "./ui";

const md = (d: string) => d.slice(5).replace("-", "/");
const pct = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v * 100).toFixed(1)}%`;

export function SplitBuyCard({ data }: { data: SplitBuy }) {
  const [monthly, setMonthly] = useState<number | null>(null);
  useEffect(() => {
    readSetting<{ monthly?: string }>("isa").then((s) => {
      const v = parseFloat((s?.monthly ?? "").replace(/[^0-9.]/g, ""));
      setMonthly(Number.isFinite(v) && v > 0 ? v : null);
    });
  }, []);

  const buys = data.items.filter((i) => i.status === "buy");
  const others = data.items.filter((i) => i.status !== "buy");
  const today = buys.every((i) => i.buyToday);
  const when = today ? "오늘" : `${md(buys[0].buyOn!)} (다음 거래일)`;

  return (
    <Section first title="분할매수" desc="이번 달 적립금을 ETF별로 나눠 사는 날에만 떠요">
      <View style={styles.card}>
        <Text style={styles.when}>
          {when} <Text style={styles.whenSub}>살 차례 · {buys.length}개</Text>
        </Text>

        {buys.map((i) => (
          <View key={i.id} style={styles.row} accessible accessibilityLabel={`${i.name} 이번 달 몫 ${Math.round(i.weight * 100)}% 매수`}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{i.name}</Text>
              <Text style={styles.reason}>
                {i.reason === "dip" ? (
                  <>
                    {md(i.lastDate!)} <Text style={{ color: trendColor(i.move) }}>{fmtTrendPct(i.move! * 100, 1)}</Text> · 평소 하루
                    변동의 {i.ratio!.toFixed(1)}배
                  </>
                ) : (
                  "이번 달 하락일 없음 → 월말 매수"
                )}
              </Text>
            </View>
            <View style={styles.right}>
              <Text style={styles.amount}>{monthly ? fmtMoney(monthly * i.weight, "KRW") : `${Math.round(i.weight * 100)}%`}</Text>
              <Text style={styles.act}>매수</Text>
            </View>
          </View>
        ))}

        <Text style={styles.subhead}>방법</Text>
        <Text style={styles.how}>1. 이번 달 몫을 한 번에 · 장중 지정가(현재가 근처)</Text>
        <Text style={styles.how}>2. 나머지 ETF는 각자 하락일까지 대기, 없으면 월말</Text>
        <Text style={styles.how}>3. 금액은 늘리거나 줄이지 않아요 (정액 적립)</Text>
        {!monthly && <Text style={styles.hint}>금액을 보려면 계좌 &gt; ISA 설정에서 월 적립금 입력</Text>}

        {others.length > 0 && (
          <Text style={styles.month}>
            이번 달{" "}
            {others
              .map((i) => `${i.sleeve} ${i.status === "done" ? `${md(i.boughtOn!)} 완료` : i.status === "wait" ? "대기" : "확인 안 됨"}`)
              .join(" · ")}
          </Text>
        )}
        <Text style={styles.cost}>
          규칙: {data.rule} · 과거 성적 첫 거래일 매수 대비 {pct(data.backtestVsPlain)} (선호 방식)
        </Text>
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.accentSoft, padding: space.lg },
  when: { fontFamily: fonts.sansBold, fontSize: 22, color: colors.text, letterSpacing: -0.4 },
  whenSub: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.textMuted },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  name: { ...type.body, fontFamily: fonts.sansBold, color: colors.text },
  reason: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  right: { alignItems: "flex-end", marginLeft: space.md },
  amount: { ...type.numStrong, fontSize: 15, color: colors.text },
  act: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.accent, marginTop: 2 },
  subhead: { ...type.caption, fontFamily: fonts.sansMedium, color: colors.textMuted, marginTop: space.md, marginBottom: space.xs },
  how: { ...type.body, fontSize: 13, color: colors.text, lineHeight: 20 },
  hint: { ...type.caption, color: colors.accent, marginTop: space.sm },
  month: { ...type.caption, color: colors.textMuted, marginTop: space.md },
  cost: { ...type.caption, color: colors.textMuted, marginTop: space.xs, lineHeight: 16 },
});
