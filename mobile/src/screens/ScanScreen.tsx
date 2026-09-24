import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../api";
import { minutesAgo, readCache, writeCache } from "../cache";
import { fmtTrendPct } from "../format";
import { colors, fonts, space, trendColor, type } from "../theme";
import type { RootStackParamList, Scan, ScanRow } from "../types";

const CACHE_KEY = "bigtech-scan";

// Magnificent 7 + 삼성전자 + SK하이닉스, ranked by the TIP 18 financial change score.
export default function ScanScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [data, setData] = useState<Scan | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [staleMinutes, setStaleMinutes] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api.scan();
      setData(d);
      setStaleMinutes(null);
      writeCache(CACHE_KEY, d);
    } catch (e) {
      console.warn("scan failed, falling back to cache", e);
      const cached = await readCache<Scan>(CACHE_KEY);
      if (cached) {
        setData(cached.data);
        setStaleMinutes(minutesAgo(cached.savedAt));
      }
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.note}>9개 기업의 분기 재무제표를 모으는 중이에요 (처음엔 1분 정도)</Text>
      </View>
    );
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
      {staleMinutes != null && <Text style={styles.stale}>오프라인 · {staleMinutes}분 전 데이터</Text>}
      <View style={styles.headRow}>
        <Text style={[styles.head, { flex: 1, textAlign: "left" }]}>종목 · 지수 대비</Text>
        <Text style={styles.head}>재무 점수</Text>
      </View>
      {data?.rows.map((r) => (
        <ScanItem key={r.symbol} row={r} onPress={() => navigation.navigate("StockDetail", { symbol: r.symbol, name: r.name })} />
      )) ?? <Text style={styles.note}>데이터를 불러오지 못했어요. 아래로 당겨 다시 시도해보세요.</Text>}
      <Text style={styles.footnote}>
        재무 점수: 이 9개 종목 안에서의 백분위를 가중 평균한 값(0~100)이에요. 절대 평가가 아니라 그룹 안 상대 순위예요.
        가중치는 최근 분기 매출·영업이익·순이익·영업현금흐름의 전분기 대비와 전년 동기 대비 증가율이 각 5%, ROE·PEG·PBR·PSR이
        각 15%입니다(PEG·PBR·PSR은 낮을수록 높은 점수). 빠진 항목은 제외하고 다시 계산해요.{"\n"}
        지수 대비: 종목 가격 ÷ 지수(미국은 S&P500, 한국은 코스피) 비율이 50일 평균 위면 단기적으로 지수보다 강한
        상태예요. 판정 문구는 최근 3개월 초과 수익률 기준입니다.
      </Text>
    </ScrollView>
  );
}

function ScanItem({ row, onPress }: { row: ScanRow; onPress: () => void }) {
  const rel = row.relative;
  const rev = row.lines.revenue;
  const op = row.lines.operatingIncome;
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${row.name ?? row.symbol}, 재무 점수 ${row.score != null ? Math.round(row.score) : "없음"}, ${
        rel?.verdict ?? ""
      }. 눌러서 상세 보기`}
    >
      <View style={styles.top}>
        <View style={{ flex: 1 }}>
          <Text style={styles.symbol}>
            {row.symbol} <Text style={styles.name}>{row.name}</Text>
          </Text>
        </View>
        <Text style={styles.score}>{row.score != null ? Math.round(row.score) : "-"}</Text>
      </View>
      <Text style={styles.line}>
        {row.quarter ?? "-"} 분기 · 매출 전년비{" "}
        <Text style={{ color: trendColor(rev?.yoy) }}>{fmtTrendPct(rev?.yoy, 1)}</Text> · 영업이익 전분기비{" "}
        <Text style={{ color: trendColor(op?.qoq) }}>{fmtTrendPct(op?.qoq, 1)}</Text>
      </Text>
      {rel && (
        <Text style={styles.line}>
          {rel.benchmarkName} 대비 비율 {rel.aboveMa == null ? "-" : rel.aboveMa ? "50일선 위" : "50일선 아래"}
          {rel.since ? ` (${rel.since.slice(5).replace("-", "/")}~)` : ""} · 3개월 초과{" "}
          <Text style={{ color: trendColor(rel.excess3m) }}>{fmtTrendPct(rel.excess3m, 1)}p</Text>
        </Text>
      )}
      {!!rel?.verdict && <Text style={styles.verdict}>{rel.verdict}</Text>}
      {row.ocfNegativeTtm && <Text style={styles.warn}>최근 4분기 영업현금흐름 합계 적자 · TIP 9 기준 제외 대상</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl, backgroundColor: colors.background },
  stale: { ...type.caption, color: colors.accent, paddingHorizontal: space.lg, paddingTop: space.sm },
  headRow: { flexDirection: "row", paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.xs },
  head: { fontFamily: fonts.sansMedium, fontSize: 10, color: colors.textMuted, textAlign: "right" },
  row: {
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  top: { flexDirection: "row", alignItems: "baseline" },
  symbol: { ...type.numStrong, fontSize: 15, color: colors.text },
  name: { fontFamily: fonts.sans, fontSize: 12, color: colors.textMuted },
  score: { ...type.display, fontSize: 22, color: colors.text },
  line: { ...type.caption, color: colors.textMuted, marginTop: space.xs },
  verdict: { ...type.caption, color: colors.text, marginTop: 2 },
  warn: { ...type.caption, fontFamily: fonts.sansBold, color: colors.text, marginTop: 2 },
  note: { ...type.caption, color: colors.textMuted, marginTop: space.md, textAlign: "center", paddingHorizontal: space.lg },
  footnote: { ...type.caption, color: colors.textMuted, paddingHorizontal: space.lg, marginTop: space.xl, lineHeight: 17 },
});
