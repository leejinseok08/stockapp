import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { LineChart } from "react-native-chart-kit";
import { api } from "../api";
import { RadarChart } from "../components/RadarChart";
import { colors } from "../theme";
import type { Fundamentals, HistoryPoint, RootStackParamList, WatchlistEntry } from "../types";

function sma(values: number[], window: number): (number | null)[] {
  return values.map((_, i) => {
    if (i < window - 1) return null;
    const slice = values.slice(i - window + 1, i + 1);
    return slice.reduce((sum, v) => sum + v, 0) / window;
  });
}

type Props = NativeStackScreenProps<RootStackParamList, "StockDetail">;

const RANGES: { key: string; label: string }[] = [
  { key: "1d", label: "1일" },
  { key: "5d", label: "5일" },
  { key: "1mo", label: "1개월" },
  { key: "6mo", label: "6개월" },
  { key: "1y", label: "1년" },
];

function fmtPct(v: number | null) {
  return v != null ? `${(v * 100).toFixed(1)}%` : "-";
}
function fmtNum(v: number | null, digits = 2) {
  return v != null ? v.toFixed(digits) : "-";
}
function fmtBig(v: number | null) {
  if (v == null) return "-";
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${(v / 1e12).toFixed(2)}조`;
  if (abs >= 1e8) return `${(v / 1e8).toFixed(2)}억`;
  return v.toLocaleString();
}

export default function StockDetailScreen({ route }: Props) {
  const { symbol, name } = route.params;
  const [range, setRange] = useState("1mo");
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [fundamentals, setFundamentals] = useState<Fundamentals | null>(null);
  const [loading, setLoading] = useState(true);

  const [buyPriceText, setBuyPriceText] = useState("");
  const [quantityText, setQuantityText] = useState("");
  const [noteText, setNoteText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([api.history(symbol, range), api.fundamentals(symbol)])
      .then(([h, f]) => {
        setHistory(h);
        setFundamentals(f);
      })
      .catch((e) => console.warn("detail load failed", e))
      .finally(() => setLoading(false));
  }, [symbol, range]);

  useEffect(() => {
    api
      .watchlist()
      .then((list) => {
        const entry = list.find((w) => w.symbol === symbol);
        setBuyPriceText(entry?.buyPrice != null ? String(entry.buyPrice) : "");
        setQuantityText(entry?.quantity != null ? String(entry.quantity) : "");
        setNoteText(entry?.note ?? "");
      })
      .catch((e) => console.warn("watchlist entry load failed", e));
  }, [symbol]);

  const savePosition = async () => {
    setSaving(true);
    try {
      const buyPrice = buyPriceText.trim() ? parseFloat(buyPriceText) : null;
      const quantity = quantityText.trim() ? parseFloat(quantityText) : null;
      await api.updateWatchlistItem(symbol, {
        buyPrice: Number.isFinite(buyPrice) ? buyPrice : null,
        quantity: Number.isFinite(quantity) ? quantity : null,
        note: noteText.trim() || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.warn("save position failed", e);
    } finally {
      setSaving(false);
    }
  };

  const latestPrice = history.length ? history[history.length - 1].close : null;
  const buyPriceNum = parseFloat(buyPriceText);
  const quantityNum = parseFloat(quantityText);
  const hasPosition = Number.isFinite(buyPriceNum) && Number.isFinite(quantityNum) && buyPriceNum > 0;
  const plPercent = hasPosition && latestPrice != null ? ((latestPrice - buyPriceNum) / buyPriceNum) * 100 : null;

  const chartData = useMemo(() => {
    const points = history.filter((p) => p.close != null);
    const step = Math.max(1, Math.floor(points.length / 6));
    const labels = points.map((p, i) =>
      i % step === 0 ? new Date(p.t).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" }) : ""
    );
    const closes = points.map((p) => p.close as number);
    const datasets: { data: number[]; color: (opacity: number) => string; strokeWidth?: number }[] = [
      { data: closes, color: () => colors.accent, strokeWidth: 2 },
    ];
    if (closes.length >= 20) {
      const smaValues = sma(closes, 20);
      const firstValid = smaValues.find((v) => v != null) ?? closes[0] ?? 0;
      datasets.push({
        data: smaValues.map((v) => v ?? firstValid),
        color: () => colors.textMuted,
        strokeWidth: 1,
      });
    }
    return { labels, datasets, hasSma: closes.length >= 20 };
  }, [history]);

  const screenWidth = Dimensions.get("window").width;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.headerBlock}>
        <Text style={styles.symbol}>{symbol}</Text>
        {!!(fundamentals?.name || name) && (
          <Text style={styles.name}>{fundamentals?.name || name}</Text>
        )}
        {!!(fundamentals?.sector || fundamentals?.industry) && (
          <Text style={styles.sector}>
            {[fundamentals?.sector, fundamentals?.industry].filter(Boolean).join(" · ")}
          </Text>
        )}
      </View>

      <View style={styles.rangeRow}>
        {RANGES.map((r) => (
          <Pressable
            key={r.key}
            style={[styles.rangeBtn, range === r.key && styles.rangeBtnActive]}
            onPress={() => setRange(r.key)}
          >
            <Text style={[styles.rangeText, range === r.key && styles.rangeTextActive]}>{r.label}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <>
          {chartData.datasets[0].data.length > 1 && (
            <>
              <LineChart
                data={chartData}
                width={screenWidth - 16}
                height={220}
                withDots={false}
                withInnerLines={false}
                chartConfig={{
                  backgroundColor: colors.surface,
                  backgroundGradientFrom: colors.surface,
                  backgroundGradientTo: colors.surface,
                  decimalPlaces: 2,
                  color: () => colors.accent,
                  labelColor: () => colors.textMuted,
                  propsForBackgroundLines: { stroke: colors.border },
                }}
                bezier
                style={{ marginHorizontal: 8, borderRadius: 12 }}
              />
              {chartData.hasSma && (
                <View style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: colors.accent }]} />
                  <Text style={styles.legendText}>가격</Text>
                  <View style={[styles.legendDot, { backgroundColor: colors.textMuted, marginLeft: 12 }]} />
                  <Text style={styles.legendText}>20일 이동평균</Text>
                </View>
              )}
            </>
          )}

          <Section title="내 포지션 · 메모">
            <View style={styles.positionRow}>
              <View style={styles.positionField}>
                <Text style={styles.fieldLabel}>매수가</Text>
                <TextInput
                  style={styles.input}
                  value={buyPriceText}
                  onChangeText={setBuyPriceText}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
              <View style={styles.positionField}>
                <Text style={styles.fieldLabel}>수량</Text>
                <TextInput
                  style={styles.input}
                  value={quantityText}
                  onChangeText={setQuantityText}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            </View>
            {plPercent != null && (
              <Text style={[styles.plPreview, { color: plPercent >= 0 ? colors.up : colors.down }]}>
                평가 수익률 {plPercent >= 0 ? "+" : ""}
                {plPercent.toFixed(2)}%
              </Text>
            )}
            <Text style={styles.fieldLabel}>메모</Text>
            <TextInput
              style={[styles.input, styles.noteInput]}
              value={noteText}
              onChangeText={setNoteText}
              placeholder="이 종목에 대한 메모를 남겨보세요"
              placeholderTextColor={colors.textMuted}
              multiline
            />
            <Pressable style={styles.saveBtn} onPress={savePosition} disabled={saving}>
              <Text style={styles.saveBtnText}>{saving ? "저장 중..." : saved ? "저장됨 ✓" : "저장"}</Text>
            </Pressable>
          </Section>

          <Section title="펀더멘털 스코어">
            <View style={styles.radarWrap}>
              <RadarChart
                axes={[
                  { label: "밸류에이션", value: fundamentals?.scores.valuation ?? null },
                  { label: "수익성", value: fundamentals?.scores.profitability ?? null },
                  { label: "재무건전성", value: fundamentals?.scores.health ?? null },
                  { label: "성장성", value: fundamentals?.scores.growth ?? null },
                ]}
              />
            </View>
            <Text style={styles.scoreNote}>
              업계 평균 대비가 아닌 절대 기준의 참고용 점수입니다.
            </Text>
          </Section>

          <Section title="주요 지표">
            <Grid
              rows={[
                ["PER (trailing)", fmtNum(fundamentals?.ratios.trailingPE ?? null)],
                ["PER (forward)", fmtNum(fundamentals?.ratios.forwardPE ?? null)],
                ["PBR", fmtNum(fundamentals?.ratios.priceToBook ?? null)],
                ["ROE", fmtPct(fundamentals?.ratios.returnOnEquity ?? null)],
                ["영업이익률", fmtPct(fundamentals?.ratios.operatingMargins ?? null)],
                ["순이익률", fmtPct(fundamentals?.ratios.profitMargins ?? null)],
                ["매출성장률", fmtPct(fundamentals?.ratios.revenueGrowth ?? null)],
                ["이익성장률", fmtPct(fundamentals?.ratios.earningsGrowth ?? null)],
                ["부채비율(D/E)", fmtNum(fundamentals?.ratios.debtToEquity ?? null)],
                ["배당수익률", fmtPct(fundamentals?.ratios.dividendYield ?? null)],
                ["52주 최고", fmtNum(fundamentals?.ratios.fiftyTwoWeekHigh ?? null)],
                ["52주 최저", fmtNum(fundamentals?.ratios.fiftyTwoWeekLow ?? null)],
              ]}
            />
          </Section>

          <StatementSection title="손익계산서" rows={fundamentals?.income ?? []} />
          <StatementSection title="재무상태표" rows={fundamentals?.balance ?? []} />
          <StatementSection title="현금흐름표" rows={fundamentals?.cashflow ?? []} />

          {!!fundamentals?.summary && (
            <Section title="기업 개요">
              <Text style={styles.summaryText}>{fundamentals.summary}</Text>
            </Section>
          )}
        </>
      )}
    </ScrollView>
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

function Grid({ rows }: { rows: [string, string][] }) {
  return (
    <View style={styles.grid}>
      {rows.map(([label, value]) => (
        <View style={styles.gridItem} key={label}>
          <Text style={styles.gridLabel}>{label}</Text>
          <Text style={styles.gridValue}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

function StatementSection({ title, rows }: { title: string; rows: Fundamentals["income"] }) {
  if (!rows.length) return null;
  const periods = Object.keys(rows[0].values).slice(0, 4);
  return (
    <Section title={title}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={styles.tableRow}>
            <Text style={[styles.tableCell, styles.tableHeaderCell, { width: 160 }]}> </Text>
            {periods.map((p) => (
              <Text key={p} style={[styles.tableCell, styles.tableHeaderCell]}>
                {p}
              </Text>
            ))}
          </View>
          {rows.map((row) => (
            <View style={styles.tableRow} key={row.item}>
              <Text style={[styles.tableCell, { width: 160, color: colors.text }]}>{row.item}</Text>
              {periods.map((p) => (
                <Text key={p} style={styles.tableCell}>
                  {fmtBig(row.values[p] ?? null)}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </Section>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { padding: 40, alignItems: "center" },
  headerBlock: { padding: 16 },
  symbol: { color: colors.text, fontSize: 26, fontWeight: "800" },
  name: { color: colors.textMuted, fontSize: 15, marginTop: 2 },
  sector: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  rangeRow: { flexDirection: "row", paddingHorizontal: 12, gap: 8, marginBottom: 8 },
  rangeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  rangeBtnActive: { backgroundColor: colors.accent },
  rangeText: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  rangeTextActive: { color: "#fff" },
  section: { paddingHorizontal: 16, marginTop: 20 },
  legendRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 4 },
  legendText: { color: colors.textMuted, fontSize: 11 },
  positionRow: { flexDirection: "row", gap: 10 },
  positionField: { flex: 1 },
  fieldLabel: { color: colors.textMuted, fontSize: 11, marginBottom: 4, marginTop: 8 },
  input: {
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  noteInput: { minHeight: 60, textAlignVertical: "top" },
  plPreview: { fontSize: 13, fontWeight: "700", marginTop: 10 },
  saveBtn: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 12,
  },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  radarWrap: { alignItems: "center", paddingVertical: 8 },
  scoreNote: { color: colors.textMuted, fontSize: 11, textAlign: "center", marginTop: 4 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: "700", marginBottom: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  gridItem: {
    width: "47%",
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 10,
  },
  gridLabel: { color: colors.textMuted, fontSize: 11 },
  gridValue: { color: colors.text, fontSize: 15, fontWeight: "600", marginTop: 4 },
  tableRow: { flexDirection: "row" },
  tableCell: {
    width: 100,
    color: colors.textMuted,
    fontSize: 12,
    paddingVertical: 6,
    paddingRight: 8,
  },
  tableHeaderCell: { color: colors.text, fontWeight: "700" },
  summaryText: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
});
