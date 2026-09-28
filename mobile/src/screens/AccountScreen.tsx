import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../api";
import { readCache, writeCache } from "../cache";
import { IsaSection } from "../components/IsaSection";
import { FadeIn, Flash, Press, ScreenSkeleton } from "../components/motion";
import { Avatar, Band, Section } from "../components/ui";
import { fmtMoney, fmtNum, fmtPrice, fmtTrendPct } from "../format";
import { disablePush, enablePush, pushState, type PushState } from "../push";
import { colors, fonts, space, trendColor, trendGlyph, type } from "../theme";
import type { Performance, RootStackParamList, WatchlistEntry } from "../types";

// Shown when the switch can't be offered.
const PUSH_BLOCKED: Partial<Record<PushState, string>> = {
  unsupported: "이 브라우저는 알림을 지원하지 않아요",
  "needs-install": "iPhone은 홈 화면에 추가한 앱에서만 알림을 받을 수 있어요",
  denied: "알림이 차단돼 있어요 · 설정 > 알림에서 허용",
};

// 계좌 tab (redesign C1-C4): one total with the KRW/USD split, holdings one line each, the ISA plan as
// status tags with a single call to fill in what's missing, and alerts as a switch.
export default function AccountScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [items, setItems] = useState<WatchlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [perf, setPerf] = useState<Performance | null>(null);
  const [push, setPush] = useState<PushState | null>(null);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    pushState().then(setPush).catch(() => setPush("unsupported"));
    readCache<Performance>("performance").then((c) => c && setPerf((p) => p ?? c.data));
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
      if (held.length)
        api
          .performance()
          .then((p) => {
            setPerf(p);
            writeCache("performance", p);
          })
          .catch((e) => console.warn("performance failed", e));
    } catch (e) {
      console.warn("portfolio load failed", e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false));
    }, [load])
  );

  if (loading && !items.length) return <ScreenSkeleton rows={3} />;

  // Never add KRW and USD without converting: per-currency totals, and the KRW total only via perf.
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

  return (
    <FadeIn>
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: space.xxl * 2 }}>
        <Text style={styles.title}>계좌</Text>

        {items.length === 0 ? (
          <View style={styles.hero}>
            <Text style={styles.heroLabel}>총 자산</Text>
            <Text style={styles.note}>보유 종목이 없어요. 종목 리포트의 "내 포지션"에 매수가·수량을 넣으면 여기에 표시돼요.</Text>
          </View>
        ) : (
          <Total perf={perf} totals={totals} />
        )}

        {items.length > 0 && (
          <Section title="보유 종목">
            {items.map((item) => {
              const cost = item.buyPrice! * item.quantity!;
              const value = (item.price ?? item.buyPrice!) * item.quantity!;
              const pl = value - cost;
              const plPct = cost > 0 ? (pl / cost) * 100 : null;
              const b = perfBy.get(item.symbol)?.benchmark;
              const ex = perfBy.get(item.symbol)?.excess;
              return (
                <Press
                  key={item.symbol}
                  style={styles.row}
                  onPress={() => navigation.navigate("StockDetail", { symbol: item.symbol, name: item.name })}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name ?? item.symbol}, 평가금액 ${fmtMoney(value, item.currency)}, ${fmtTrendPct(plPct)}`}
                >
                  <Avatar name={item.name ?? item.symbol} />
                  <View style={styles.mid}>
                    <Text style={styles.name}>{item.name ?? item.symbol}</Text>
                    <Text style={styles.meta}>
                      {fmtNum(item.quantity, 0)}주 · 평단 {fmtPrice(item.buyPrice, item.currency)}
                    </Text>
                    {b && ex != null && (
                      <Text style={styles.meta}>
                        {item.buyDate}~ {b.name} 대비 <Text style={{ color: trendColor(ex) }}>{fmtTrendPct(ex * 100, 1)}p</Text>
                      </Text>
                    )}
                  </View>
                  <View style={styles.right}>
                    <Text style={styles.value}>{fmtMoney(value, item.currency)}</Text>
                    <Text style={[styles.pl, { color: trendColor(pl) }]}>{fmtTrendPct(plPct)}</Text>
                  </View>
                </Press>
              );
            })}
            {items.some((i) => !i.buyDate) && (
              <Text style={styles.note}>매수일을 넣으면 같은 기간 지수와 비교해요 · 종목 리포트 › 내 포지션</Text>
            )}
          </Section>
        )}

        <Band />
        <View style={styles.isa}>
          <IsaSection gainKRW={gainKRW} />
        </View>

        {/* C4: alerts as a switch */}
        <Section title="알림">
          <View style={styles.pushRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.pushTitle}>신호·위험 경고 알림</Text>
              <Text style={styles.note}>
                {push && PUSH_BLOCKED[push] ? PUSH_BLOCKED[push] : "BUY/SELL이 바뀌거나 위험 경고가 경계일 때 · 장 마감 후"}
              </Text>
            </View>
            {(push === "on" || push === "off") && <Switch on={push === "on"} busy={pushBusy} onPress={togglePush} />}
          </View>
        </Section>
      </ScrollView>
    </FadeIn>
  );
}

// C1: one total in KRW (converted at today's rate) with the KRW/USD split underneath.
function Total({ perf, totals }: { perf: Performance | null; totals: Map<string, { cost: number; value: number }> }) {
  if (!perf || perf.usdkrw == null || totals.size < 2) {
    // One currency (or no FX yet): its own total, never mixed.
    const [cur, t] = [...totals.entries()][0];
    const pl = t.value - t.cost;
    return (
      <View style={styles.hero} accessible accessibilityLabel={`평가금액 ${fmtMoney(t.value, cur)}, 손익 ${fmtMoney(pl, cur)}`}>
        <Text style={styles.heroLabel}>총 자산 · {cur}</Text>
        <Text style={styles.heroValue}>{fmtMoney(t.value, cur)}</Text>
        <Text style={[styles.heroPl, { color: trendColor(pl) }]}>
          {trendGlyph(pl)} {fmtMoney(Math.abs(pl), cur)} {fmtTrendPct(t.cost ? (pl / t.cost) * 100 : null)}
        </Text>
      </View>
    );
  }
  const pl = perf.totalValueKRW - perf.totalCostKRW;
  const byCur = new Map<string, number>();
  for (const r of perf.rows) if (r.valueKRW != null) byCur.set(r.currency, (byCur.get(r.currency) ?? 0) + r.valueKRW);
  const krwShare = (byCur.get("KRW") ?? 0) / (perf.totalValueKRW || 1);
  const usd = totals.get("USD");
  const kr = totals.get("KRW");
  return (
    <View style={styles.hero} accessible accessibilityLabel={`총 자산 ${fmtMoney(perf.totalValueKRW, "KRW")}원, 총 수익 ${fmtMoney(pl, "KRW")}`}>
      <Text style={styles.heroLabel}>총 자산 · 원화 환산</Text>
      <Flash value={perf.totalValueKRW} style={{ alignSelf: "flex-start" }}>
        <Text style={styles.heroValue}>{fmtMoney(perf.totalValueKRW, "KRW")}원</Text>
      </Flash>
      <Text style={[styles.heroPl, { color: trendColor(pl) }]}>
        {trendGlyph(pl)} {fmtMoney(Math.abs(pl), "KRW")}{" "}
        {perf.totalReturn != null ? `${perf.totalReturn >= 0 ? "+" : "−"}${Math.abs(perf.totalReturn * 100).toFixed(2)}%` : ""}
        <Text style={styles.heroPlLabel}>  총 수익</Text>
      </Text>
      <View style={styles.split}>
        <View style={[styles.splitKrw, { flex: Math.max(krwShare, 0.001) }]} />
        <View style={{ flex: Math.max(1 - krwShare, 0.001) }} />
      </View>
      <View style={styles.splitLabels}>
        <Text style={styles.note}>
          원화 {kr ? fmtMoney(kr.value, "KRW") : "-"} ({Math.round(krwShare * 100)}%)
        </Text>
        <Text style={styles.note}>
          달러 {usd ? fmtMoney(usd.value, "USD") : "-"} ({Math.round((1 - krwShare) * 100)}%)
        </Text>
      </View>
      <Text style={styles.fxNote}>USD/KRW {fmtPrice(perf.usdkrw, "KRW")} · 매입·평가 모두 오늘 환율 (환차손익 제외)</Text>
    </View>
  );
}

function Switch({ on, busy, onPress }: { on: boolean; busy: boolean; onPress: () => void }) {
  return (
    <Press
      pressedBg={false}
      onPress={onPress}
      disabled={busy}
      hitSlop={8}
      accessibilityRole="switch"
      accessibilityState={{ checked: on, busy }}
      accessibilityLabel={`알림 ${on ? "켜짐" : "꺼짐"}`}
      style={[styles.switch, on && styles.switchOn, busy && { opacity: 0.6 }]}
    >
      <View style={[styles.knob, on && styles.knobOn]} />
    </Press>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  title: { ...type.title, color: colors.text, paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.md },
  hero: { marginHorizontal: space.lg, backgroundColor: colors.surface, borderRadius: 20, padding: space.lg, gap: 6 },
  heroLabel: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.textMuted },
  heroValue: { ...type.hero, color: colors.text },
  heroPl: { fontFamily: fonts.sansBold, fontSize: 15, fontVariant: ["tabular-nums"] },
  heroPlLabel: { fontFamily: fonts.sans, fontSize: 12, color: colors.textMuted },
  split: { flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: colors.hairline, marginTop: space.md },
  splitKrw: { backgroundColor: colors.text },
  splitLabels: { flexDirection: "row", justifyContent: "space-between" },
  fxNote: { ...type.caption, fontSize: 11, color: colors.textMuted, marginTop: space.xs },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: space.md, borderRadius: 12 },
  mid: { flex: 1, marginLeft: space.md },
  name: { ...type.body, fontFamily: fonts.sansBold, color: colors.text, fontSize: 16 },
  meta: { ...type.caption, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  right: { alignItems: "flex-end" },
  value: { ...type.numStrong, color: colors.text, fontSize: 15 },
  pl: { ...type.numStrong, fontSize: 12, marginTop: 2 },
  isa: { paddingHorizontal: space.lg, paddingTop: space.xl },
  note: { ...type.caption, color: colors.textMuted, marginTop: space.xs, lineHeight: 17 },
  pushRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  pushTitle: { fontFamily: fonts.sansBold, fontSize: 15, color: colors.text },
  switch: { width: 50, height: 30, borderRadius: 15, backgroundColor: colors.hairline, padding: 3, justifyContent: "center" },
  switchOn: { backgroundColor: colors.accent },
  knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.textMuted },
  knobOn: { backgroundColor: colors.onAccent, alignSelf: "flex-end" },
});
