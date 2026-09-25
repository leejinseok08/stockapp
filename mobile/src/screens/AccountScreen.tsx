import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../api";
import { IsaSection } from "../components/IsaSection";
import { Section } from "../components/ui";
import { disablePush, enablePush, pushState, type PushState } from "../push";
import { fmtMoney, fmtNum, fmtPrice, fmtTrendPct } from "../format";
import { colors, fonts, space, trendColor, trendGlyph, type } from "../theme";
import type { Performance, RootStackParamList, WatchlistEntry } from "../types";

const PUSH_TEXT: Record<PushState, string> = {
  unsupported: "이 브라우저는 알림을 지원하지 않아요",
  "needs-install": "iPhone은 홈 화면에 추가한 앱에서만 알림을 받을 수 있어요",
  denied: "알림이 차단돼 있어요 · 설정 > 알림에서 허용",
  off: "꺼짐",
  on: "켜짐 · 매매 신호 변경, 위험 경고 경계",
};

// 계좌 tab: holdings P/L per currency and the ISA account's limits and dates.
export default function AccountScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [items, setItems] = useState<WatchlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [perf, setPerf] = useState<Performance | null>(null);
  const [push, setPush] = useState<PushState | null>(null);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    pushState().then(setPush).catch(() => setPush("unsupported"));
  }, []);

  const togglePush = async () => {
    setPushBusy(true);
    try {
      setPush(push === "on" ? await disablePush() : await enablePush());
    } catch (e) {
      console.warn("push toggle failed", e);
    } finally {
      setPushBusy(false);
    }
  };

  const load = useCallback(async () => {
    try {
      const data = await api.watchlist();
      const held = data.filter((i) => i.buyPrice != null && i.quantity != null && i.buyPrice > 0 && i.quantity > 0);
      setItems(held);
      if (held.length) api.performance().then(setPerf).catch((e) => console.warn("performance failed", e));
    } catch (e) {
      console.warn("portfolio load failed", e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false));
    }, [load])
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  // Never add KRW and USD together: one total per listing currency.
  const totals = new Map<string, { cost: number; value: number }>();
  for (const i of items) {
    const cur = i.currency ?? "USD";
    const t = totals.get(cur) ?? { cost: 0, value: 0 };
    t.cost += i.buyPrice! * i.quantity!;
    t.value += (i.price ?? i.buyPrice!) * i.quantity!;
    totals.set(cur, t);
  }

  const perfBy = new Map((perf?.rows ?? []).map((r) => [r.symbol, r]));
  const krw = totals.get("KRW");
  const gainKRW = krw ? krw.value - krw.cost : null;
  const krwPl = perf ? perf.totalValueKRW - perf.totalCostKRW : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: space.xxl * 2 }}>
      <Text style={styles.title}>계좌</Text>
      {perf && perf.usdkrw != null && totals.size > 1 && (
        <View style={styles.summary} accessible accessibilityLabel={`원화 환산 평가금액 ${fmtMoney(perf.totalValueKRW, "KRW")}`}>
          <Text style={styles.summaryLabel}>원화 환산 합계</Text>
          <Text style={[styles.summaryValue, { color: colors.text }]}>{fmtMoney(perf.totalValueKRW, "KRW")}</Text>
          <Text style={[styles.summaryPct, { color: trendColor(krwPl) }]}>
            {trendGlyph(krwPl)} {fmtMoney(Math.abs(krwPl ?? 0), "KRW")} · {fmtTrendPct(perf.totalReturn != null ? perf.totalReturn * 100 : null)}
          </Text>
          <Text style={styles.fxNote}>
            USD/KRW {fmtPrice(perf.usdkrw, "KRW")} (오늘 환율로 매입·평가 모두 환산 · 환차손익 제외)
          </Text>
        </View>
      )}
      {Array.from(totals.entries()).map(([cur, t], idx) => {
        const pl = t.value - t.cost;
        const plPct = t.cost > 0 ? (pl / t.cost) * 100 : null;
        return (
          <View
            key={cur}
            style={[styles.summary, idx > 0 && styles.summaryStacked]}
            accessible
            accessibilityLabel={`${cur} 평가 손익 ${fmtMoney(pl, cur)}, ${fmtTrendPct(plPct)}`}
          >
            <Text style={styles.summaryLabel}>평가 손익 · {cur}</Text>
            <Text style={[styles.summaryValue, { color: trendColor(pl) }]}>
              {trendGlyph(pl)} {fmtMoney(Math.abs(pl), cur)}
            </Text>
            <Text style={[styles.summaryPct, { color: trendColor(pl) }]}>{fmtTrendPct(plPct)}</Text>
            <View style={styles.summaryRow}>
              <View>
                <Text style={styles.summarySubLabel}>매입금액</Text>
                <Text style={styles.summarySubValue}>{fmtMoney(t.cost, cur)}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.summarySubLabel}>평가금액</Text>
                <Text style={styles.summarySubValue}>{fmtMoney(t.value, cur)}</Text>
              </View>
            </View>
          </View>
        );
      })}

      {items.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.empty}>
            보유 종목이 없어요.{"\n"}종목 리포트의 "내 포지션"에 매수가·수량을 넣으면{"\n"}여기에 표시됩니다.
          </Text>
        </View>
      ) : (
        <>
          <Text style={styles.listHeader}>보유 종목</Text>
          {items.map((item) => {
            const cost = item.buyPrice! * item.quantity!;
            const value = (item.price ?? item.buyPrice!) * item.quantity!;
            const pl = value - cost;
            const plPct = cost > 0 ? (pl / cost) * 100 : null;
            return (
              <Pressable
                key={item.symbol}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface }]}
                onPress={() => navigation.navigate("StockDetail", { symbol: item.symbol, name: item.name })}
                accessibilityRole="button"
                accessibilityLabel={`${item.name ?? item.symbol}, 평가금액 ${fmtMoney(value, item.currency)}, ${fmtTrendPct(plPct)}`}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.name ?? item.symbol}</Text>
                  <Text style={styles.meta}>
                    {fmtNum(item.quantity, 0)}주 · 평단 {fmtPrice(item.buyPrice, item.currency)}
                  </Text>
                  {(() => {
                    const b = perfBy.get(item.symbol)?.benchmark;
                    const ex = perfBy.get(item.symbol)?.excess;
                    if (!b || ex == null) return null;
                    return (
                      <Text style={styles.bench}>
                        {item.buyDate}~ {b.name} {fmtTrendPct(b.return * 100, 1)} · 차이 {fmtTrendPct(ex * 100, 1)}p
                      </Text>
                    );
                  })()}
                </View>
                <View style={styles.right}>
                  <Text style={styles.value}>{fmtMoney(value, item.currency)}</Text>
                  <Text style={[styles.pl, { color: trendColor(pl) }]}>{fmtTrendPct(plPct)}</Text>
                </View>
              </Pressable>
            );
          })}
        </>
      )}

      {items.some((i) => !i.buyDate) && items.length > 0 && (
        <Text style={styles.hint}>매수일을 넣으면 같은 기간 지수(S&P500·코스피)와 비교해요 · 종목 리포트 &gt; 내 포지션</Text>
      )}

      <Section title="알림" desc="매수·매도 신호가 바뀌거나 위험 경고가 경계일 때 · 장 마감 후">
        <View style={styles.pushRow}>
          <Text style={styles.pushText}>{push ? PUSH_TEXT[push] : "확인 중…"}</Text>
          {(push === "on" || push === "off") && (
            <Pressable
              style={({ pressed }) => [styles.pushBtn, push === "on" && styles.pushBtnOff, (pressed || pushBusy) && { opacity: 0.7 }]}
              onPress={togglePush}
              disabled={pushBusy}
              accessibilityRole="button"
              accessibilityLabel={push === "on" ? "알림 끄기" : "알림 켜기"}
            >
              <Text style={[styles.pushBtnText, push === "on" && styles.pushBtnTextOff]}>
                {pushBusy ? "…" : push === "on" ? "끄기" : "켜기"}
              </Text>
            </Pressable>
          )}
        </View>
      </Section>

      <View style={styles.isa}>
        <IsaSection gainKRW={gainKRW} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  title: { ...type.title, color: colors.text, paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl },
  emptyBox: { alignItems: "center", paddingVertical: space.xxl, paddingHorizontal: space.xl },
  isa: { paddingHorizontal: space.lg, marginTop: space.xxl },
  empty: { ...type.body, color: colors.textMuted, textAlign: "center", lineHeight: 22 },
  summary: {
    marginHorizontal: space.lg,
    marginTop: space.sm,
    padding: space.lg,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  summaryStacked: { marginTop: space.md },
  summaryLabel: { ...type.section },
  summaryValue: { ...type.display, marginTop: space.sm },
  summaryPct: { ...type.numStrong, fontSize: 14, marginTop: 2 },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  summarySubLabel: { ...type.caption, color: colors.textMuted },
  summarySubValue: { ...type.numStrong, color: colors.text, fontSize: 14, marginTop: 2 },
  listHeader: { ...type.section, paddingHorizontal: space.lg, paddingTop: space.xl, paddingBottom: space.sm },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  name: { ...type.body, fontFamily: fonts.sansMedium, color: colors.text, fontSize: 15 },
  bench: { ...type.caption, fontSize: 11, color: colors.textMuted, marginTop: 2 },
  fxNote: { ...type.caption, color: colors.textMuted, marginTop: space.md },
  hint: { ...type.caption, color: colors.textMuted, paddingHorizontal: space.lg, paddingTop: space.md },
  pushRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  pushText: { ...type.body, fontSize: 13, color: colors.text, flex: 1 },
  pushBtn: { backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 8, paddingHorizontal: space.lg },
  pushBtnOff: { backgroundColor: colors.surface },
  pushBtnText: { fontFamily: fonts.sansBold, color: colors.onAccent, fontSize: 13 },
  pushBtnTextOff: { color: colors.text },
  meta: { ...type.num, fontSize: 11, color: colors.textMuted, marginTop: 2 },
  right: { alignItems: "flex-end" },
  value: { ...type.numStrong, color: colors.text, fontSize: 14 },
  pl: { ...type.num, fontSize: 12, marginTop: 2 },
});
