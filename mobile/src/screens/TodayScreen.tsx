import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../api";
import { minutesAgo, readCache, writeCache } from "../cache";
import { SignalBadge } from "../components/SignalBadge";
import { fmtMoney, fmtTrendPct } from "../format";
import { colors, fonts, space, trendColor, trendGlyph, type } from "../theme";
import type { RootStackParamList, Today, TodayItem, WatchlistEntry } from "../types";

const CACHE_KEY = "today";
const md = (d: string) => d.slice(5).replace("-", "/");

// First screen: open once a day, see in 30 seconds what needs attention (docs/app-design.md).
export default function TodayScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [data, setData] = useState<Today | null>(null);
  const [holdings, setHoldings] = useState<WatchlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [staleMinutes, setStaleMinutes] = useState<number | null>(null);

  const load = useCallback(async () => {
    api
      .watchlist()
      .then((w) => setHoldings(w.filter((i) => i.buyPrice && i.quantity)))
      .catch(() => {});
    try {
      const d = await api.today();
      setData(d);
      setStaleMinutes(null);
      writeCache(CACHE_KEY, d);
    } catch (e) {
      console.warn("today failed, falling back to cache", e);
      const cached = await readCache<Today>(CACHE_KEY);
      if (cached) {
        setData(cached.data);
        setStaleMinutes(minutesAgo(cached.savedAt));
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false));
    }, [load])
  );

  const open = (i: { symbol: string; name?: string | null }) =>
    navigation.navigate("StockDetail", { symbol: i.symbol, name: i.name ?? undefined });

  if (loading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.note}>서버가 잠들어 있으면 처음엔 1분 정도 걸려요</Text>
      </View>
    );
  }

  // One P/L line per listing currency; KRW and USD are never added together.
  const totals = new Map<string, { cost: number; value: number }>();
  for (const h of holdings) {
    const cur = h.currency ?? "USD";
    const t = totals.get(cur) ?? { cost: 0, value: 0 };
    t.cost += h.buyPrice! * h.quantity!;
    t.value += (h.price ?? h.buyPrice!) * h.quantity!;
    totals.set(cur, t);
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: space.xxl * 2 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
          tintColor={colors.accent}
        />
      }
    >
      <View style={styles.header}>
        <Text style={styles.title}>오늘</Text>
        <Text style={styles.stamp}>
          {staleMinutes != null
            ? `오프라인 · ${staleMinutes}분 전`
            : data
              ? `${data.generatedAt.slice(5, 16).replace("T", " ")} 기준`
              : ""}
        </Text>
      </View>

      {!data ? (
        <Text style={[styles.note, styles.pad]}>데이터를 불러오지 못했어요. 아래로 당겨 다시 시도해보세요.</Text>
      ) : (
        <>
          <Section title="신호 변경 · 다음 거래일에 실행">
            {data.changed.length === 0 ? (
              <Text style={styles.note}>오늘 바뀐 신호가 없어요.</Text>
            ) : (
              data.changed.map((i) => <SignalItem key={i.symbol} item={i} onPress={() => open(i)} />)
            )}
            {data.recent.length > 0 && (
              <>
                <Text style={styles.subhead}>최근 5거래일</Text>
                {data.recent.map((i) => (
                  <SignalItem key={i.symbol} item={i} onPress={() => open(i)} />
                ))}
              </>
            )}
          </Section>

          {data.risk && (
            <Section title="위험 경고">
              <Pressable
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                // Market is a sibling tab; navigate() from a tab screen reaches it directly.
                onPress={() => (navigation as unknown as { navigate: (n: string) => void }).navigate("Market")}
                accessibilityRole="button"
                accessibilityLabel={`위험 경고 ${data.risk.lit}/${data.risk.total} 점등, ${data.risk.level}. 시장 탭에서 자세히 보기`}
              >
                <Text style={styles.big}>
                  {data.risk.lit}/{data.risk.total} <Text style={styles.level}>{data.risk.level}</Text>
                </Text>
                <Text style={styles.sub}>{data.risk.litItems.length ? `점등: ${data.risk.litItems.join(", ")}` : "점등 없음"}</Text>
              </Pressable>
            </Section>
          )}

          <Section title="실적 발표 · 14일 내">
            {data.earnings.length === 0 ? (
              <Text style={styles.note}>
                2주 안에 발표하는 종목이 없어요.
                {data.nextEarnings ? ` 다음: ${md(data.nextEarnings.date)} ${data.nextEarnings.name ?? data.nextEarnings.symbol}` : ""}
              </Text>
            ) : (
              data.earnings.map((e) => (
                <Pressable
                  key={e.symbol + e.date}
                  style={({ pressed }) => [styles.line, pressed && styles.pressed]}
                  onPress={() => open(e)}
                  accessibilityRole="button"
                  accessibilityLabel={`${md(e.date)} ${e.name ?? e.symbol} 실적 발표`}
                >
                  <Text style={styles.date}>{md(e.date)}</Text>
                  <Text style={styles.name}>{e.name ?? e.symbol}</Text>
                </Pressable>
              ))
            )}
          </Section>
        </>
      )}

      <Section title="보유 손익">
        {totals.size === 0 ? (
          <Text style={styles.note}>종목 리포트의 "내 포지션"에 매수가·수량을 넣으면 여기에 표시돼요.</Text>
        ) : (
          Array.from(totals.entries()).map(([cur, t]) => {
            const pl = t.value - t.cost;
            const pct = t.cost > 0 ? (pl / t.cost) * 100 : null;
            return (
              <View key={cur} style={styles.line} accessible accessibilityLabel={`${cur} 평가 손익 ${fmtMoney(pl, cur)}`}>
                <Text style={styles.name}>{cur}</Text>
                <Text style={[styles.num, { color: trendColor(pl) }]}>
                  {trendGlyph(pl)} {fmtMoney(Math.abs(pl), cur)} · {fmtTrendPct(pct)}
                </Text>
              </View>
            );
          })
        )}
      </Section>

      <Text style={styles.footnote}>매매 신호와 의견은 규칙에 따른 참고 정보이며 투자 권유가 아닙니다.</Text>
    </ScrollView>
  );
}

function SignalItem({ item, onPress }: { item: TodayItem; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.line, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.name ?? item.symbol} ${item.action}, ${item.since ?? ""}부터. 리포트 보기`}
    >
      <SignalBadge action={item.action} />
      <Text style={[styles.name, { flex: 1, marginLeft: space.md }]}>
        {item.name ?? item.symbol} <Text style={styles.symbol}>{item.symbol}</Text>
      </Text>
      <Text style={styles.sub}>{item.since ? `${md(item.since)}~` : ""}</Text>
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl, backgroundColor: colors.background },
  pad: { paddingHorizontal: space.lg, marginTop: space.xl },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingHorizontal: space.lg, paddingTop: space.sm },
  title: { ...type.title, color: colors.text },
  stamp: { ...type.num, fontSize: 11, color: colors.textMuted },
  section: { paddingHorizontal: space.lg, marginTop: space.xl },
  sectionTitle: { ...type.section, marginBottom: space.sm },
  subhead: { ...type.caption, color: colors.textMuted, marginTop: space.md },
  row: { paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  line: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  pressed: { backgroundColor: colors.surface },
  big: { ...type.display, fontSize: 24, color: colors.text },
  level: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.textMuted },
  name: { ...type.body, fontFamily: fonts.sansMedium, color: colors.text },
  symbol: { ...type.num, fontSize: 11, color: colors.textMuted },
  date: { ...type.numStrong, fontSize: 13, color: colors.text, width: 56 },
  num: { ...type.numStrong, fontSize: 13, marginLeft: "auto" },
  sub: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  note: { ...type.caption, color: colors.textMuted, lineHeight: 17, marginTop: space.sm },
  footnote: { ...type.caption, color: colors.textMuted, paddingHorizontal: space.lg, marginTop: space.xl, lineHeight: 17 },
});
