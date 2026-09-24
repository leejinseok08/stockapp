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
import { api } from "../api";
import { PriceChart } from "../components/PriceChart";
import { RadarChart } from "../components/RadarChart";
import { fmtMoney, fmtNum, fmtPrice, fmtTrendPct } from "../format";
import { colors, fonts, space, trendColor, type } from "../theme";
import type { Fundamentals, HistoryPoint, Quote, RootStackParamList } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "StockDetail">;

const RANGES: { key: string; label: string }[] = [
  { key: "1d", label: "1일" },
  { key: "5d", label: "5일" },
  { key: "1mo", label: "1개월" },
  { key: "6mo", label: "6개월" },
  { key: "1y", label: "1년" },
];

const MA_WINDOW = 20;

function sma(values: number[], window: number): (number | null)[] {
  return values.map((_, i) => {
    if (i < window - 1) return null;
    const slice = values.slice(i - window + 1, i + 1);
    return slice.reduce((sum, v) => sum + v, 0) / window;
  });
}

// yfinance ratios are fractions (0.25 = 25%).
function fmtRatioPct(v: number | null | undefined) {
  return v != null ? `${(v * 100).toFixed(1)}%` : "-";
}

export default function StockDetailScreen({ route }: Props) {
  const { symbol, name } = route.params;
  const [range, setRange] = useState("1mo");
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [fundamentals, setFundamentals] = useState<Fundamentals | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
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
        if (entry) setQuote(entry);
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

  const chart = useMemo(() => {
    const points = history.filter((p) => p.close != null);
    const closes = points.map((p) => p.close as number);
    const times = points.map((p) => p.t);
    const ma = closes.length >= MA_WINDOW ? sma(closes, MA_WINDOW) : undefined;
    const maLast = ma ? ma[ma.length - 1] : null;
    const first = closes[0];
    const last = closes[closes.length - 1];
    const periodChange = first != null && last != null && first !== 0 ? ((last - first) / first) * 100 : null;
    return { closes, times, ma, last, periodChange, maLast };
  }, [history]);

  // The live quote is the single source for "current price", so P/L matches the list screens.
  const currentPrice = quote?.price ?? chart.last ?? null;
  const currency = quote?.currency ?? null;

  const buyPriceNum = parseFloat(buyPriceText);
  const quantityNum = parseFloat(quantityText);
  const hasPosition = Number.isFinite(buyPriceNum) && Number.isFinite(quantityNum) && buyPriceNum > 0;
  const plPercent = hasPosition && currentPrice != null ? ((currentPrice - buyPriceNum) / buyPriceNum) * 100 : null;

  const screenWidth = Dimensions.get("window").width;
  const r = fundamentals?.ratios;
  const scores = fundamentals?.scores;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: space.xxl * 2 }}>
      <View style={styles.headerBlock}>
        <Text style={styles.name}>{fundamentals?.name || name || symbol}</Text>
        {!!(fundamentals?.sector || fundamentals?.industry) && (
          <Text style={styles.sector}>
            {[fundamentals?.sector, fundamentals?.industry].filter(Boolean).join(" · ")}
          </Text>
        )}
        <Text style={styles.price}>{fmtPrice(currentPrice, currency)}</Text>
        {quote?.changePercent != null && (
          <Text style={[styles.periodChange, { color: trendColor(quote.changePercent) }]}>
            {fmtTrendPct(quote.changePercent)}
            <Text style={styles.periodLabel}>  오늘</Text>
          </Text>
        )}
        <Text style={[styles.periodChange, { color: trendColor(chart.periodChange) }]}>
          {fmtTrendPct(chart.periodChange)}
          <Text style={styles.periodLabel}>  {RANGES.find((x) => x.key === range)?.label} 기준</Text>
        </Text>
      </View>

      <View style={styles.rangeRow} accessibilityRole="tablist">
        {RANGES.map((opt) => {
          const active = range === opt.key;
          return (
            <Pressable
              key={opt.key}
              style={styles.rangeBtn}
              onPress={() => setRange(opt.key)}
              hitSlop={6}
              accessibilityRole="tab"
              accessibilityLabel={`${opt.label} 차트`}
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.rangeText, active && styles.rangeTextActive]}>{opt.label}</Text>
              {active && <View style={styles.rangeUnderline} />}
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <>
          {chart.closes.length > 1 && (
            <View style={styles.chartWrap}>
              <PriceChart
                times={chart.times}
                closes={chart.closes}
                ma={chart.ma}
                currency={currency}
                width={screenWidth - space.lg * 2}
              />
              {chart.maLast != null && (
                <Text style={styles.maLabel}>
                  ━ {MA_WINDOW}{range === "1d" || range === "5d" ? "봉" : "일"} 이동평균 {fmtPrice(chart.maLast, currency)}
                </Text>
              )}
            </View>
          )}

          <Section title="내 포지션">
            <View style={styles.positionRow}>
              <Field label="매수가" value={buyPriceText} onChangeText={setBuyPriceText} />
              <Field label="수량" value={quantityText} onChangeText={setQuantityText} />
            </View>
            {plPercent != null && (
              <Text style={[styles.plPreview, { color: trendColor(plPercent) }]}>
                평가 수익률 {fmtTrendPct(plPercent)}
              </Text>
            )}
            <Text style={styles.fieldLabel}>메모</Text>
            <TextInput
              style={[styles.input, styles.noteInput]}
              value={noteText}
              onChangeText={setNoteText}
              placeholder="매수 이유, 목표가, 체크할 점"
              placeholderTextColor={colors.textMuted}
              multiline
              accessibilityLabel="메모"
            />
            <Pressable
              style={({ pressed }) => [styles.saveBtn, (pressed || saving) && { opacity: 0.7 }]}
              onPress={savePosition}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="포지션과 메모 저장"
            >
              <Text style={styles.saveBtnText}>{saving ? "저장 중…" : saved ? "저장됨" : "저장"}</Text>
            </Pressable>
          </Section>

          <Section title="펀더멘털 스코어">
            <View style={styles.radarWrap}>
              <RadarChart
                size={200}
                axes={[
                  { label: "밸류", value: scores?.valuation ?? null },
                  { label: "수익성", value: scores?.profitability ?? null },
                  { label: "건전성", value: scores?.health ?? null },
                  { label: "성장성", value: scores?.growth ?? null },
                ]}
              />
            </View>
            <ScoreBar label="밸류에이션" value={scores?.valuation} />
            <ScoreBar label="수익성" value={scores?.profitability} />
            <ScoreBar label="재무건전성" value={scores?.health} />
            <ScoreBar label="성장성" value={scores?.growth} />
            <Text style={styles.note}>업종 평균이 아닌 절대 기준으로 환산한 참고 점수입니다.</Text>
          </Section>

          <Section title="주요 지표">
            <Ledger
              rows={[
                ["PER", fmtNum(r?.trailingPE)],
                ["선행 PER", fmtNum(r?.forwardPE)],
                ["PBR", fmtNum(r?.priceToBook)],
                ["ROE", fmtRatioPct(r?.returnOnEquity)],
                ["영업이익률", fmtRatioPct(r?.operatingMargins)],
                ["순이익률", fmtRatioPct(r?.profitMargins)],
                ["매출 성장률", fmtRatioPct(r?.revenueGrowth)],
                ["이익 성장률", fmtRatioPct(r?.earningsGrowth)],
                ["부채비율 (D/E)", fmtNum(r?.debtToEquity)],
                ["배당수익률", fmtRatioPct(r?.dividendYield)],
                ["52주 최고", fmtNum(r?.fiftyTwoWeekHigh)],
                ["52주 최저", fmtNum(r?.fiftyTwoWeekLow)],
              ]}
            />
          </Section>

          <StatementSection title="손익계산서" rows={fundamentals?.income ?? []} currency={fundamentals?.financialCurrency} />
          <StatementSection title="재무상태표" rows={fundamentals?.balance ?? []} currency={fundamentals?.financialCurrency} />
          <StatementSection title="현금흐름표" rows={fundamentals?.cashflow ?? []} currency={fundamentals?.financialCurrency} />

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

function Field({ label, value, onChangeText }: { label: string; value: string; onChangeText: (t: string) => void }) {
  return (
    <View style={styles.positionField}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, styles.numInput]}
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={label}
      />
    </View>
  );
}

function ScoreBar({ label, value }: { label: string; value: number | null | undefined }) {
  const pct = value != null ? Math.max(0, Math.min(100, value)) : 0;
  return (
    <View style={styles.scoreRow} accessible accessibilityLabel={`${label} ${value != null ? Math.round(value) : "정보 없음"}점`}>
      <Text style={styles.scoreLabel}>{label}</Text>
      <View style={styles.scoreTrack}>
        <View style={[styles.scoreFill, { width: `${pct}%` }]} />
      </View>
      <Text style={styles.scoreValue}>{value != null ? Math.round(value) : "-"}</Text>
    </View>
  );
}

function Ledger({ rows }: { rows: [string, string][] }) {
  return (
    <View>
      {rows.map(([label, value]) => (
        <View style={styles.ledgerRow} key={label}>
          <Text style={styles.ledgerLabel}>{label}</Text>
          <Text style={styles.ledgerValue}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

function StatementSection({
  title,
  rows,
  currency,
}: {
  title: string;
  rows: Fundamentals["income"];
  currency?: string | null;
}) {
  if (!rows.length) return null;
  const periods = Object.keys(rows[0].values).slice(0, 4);
  return (
    <Section title={currency ? `${title} · ${currency}` : title}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={styles.tableRow}>
            <Text style={[styles.tableCell, styles.tableItemCell]} />
            {periods.map((p) => (
              <Text key={p} style={[styles.tableCell, styles.tableHeaderCell]}>
                {p.slice(0, 7)}
              </Text>
            ))}
          </View>
          {rows.map((row) => (
            <View style={styles.tableRow} key={row.item}>
              <Text style={[styles.tableCell, styles.tableItemCell]}>{row.item}</Text>
              {periods.map((p) => (
                <Text key={p} style={styles.tableCell}>
                  {fmtMoney(row.values[p] ?? null, currency)}
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
  center: { padding: space.xxl, alignItems: "center" },
  headerBlock: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.lg },
  name: { ...type.body, fontFamily: fonts.sansMedium, color: colors.text },
  sector: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  price: { ...type.display, color: colors.text, fontSize: 34, marginTop: space.md },
  periodChange: { ...type.numStrong, fontSize: 14, marginTop: 2 },
  periodLabel: { fontFamily: fonts.sans, fontSize: 11, color: colors.textMuted },
  rangeRow: {
    flexDirection: "row",
    paddingHorizontal: space.lg,
    gap: space.lg,
    marginBottom: space.sm,
  },
  rangeBtn: { paddingVertical: space.xs, alignItems: "center" },
  rangeText: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.textMuted },
  rangeTextActive: { color: colors.text },
  rangeUnderline: { height: 2, alignSelf: "stretch", backgroundColor: colors.accent, marginTop: 4 },
  chartWrap: { paddingHorizontal: space.lg, marginTop: space.sm },
  maLabel: { ...type.num, fontSize: 11, color: colors.accent, marginTop: space.xs },
  section: { paddingHorizontal: space.lg, marginTop: space.xxl },
  sectionTitle: { ...type.section, marginBottom: space.md },
  positionRow: { flexDirection: "row", gap: space.md },
  positionField: { flex: 1 },
  fieldLabel: { ...type.caption, color: colors.textMuted, marginBottom: space.xs, marginTop: space.sm },
  input: {
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: 8,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    fontFamily: fonts.sans,
    fontSize: 14,
  },
  numInput: { ...type.num, fontSize: 15 },
  noteInput: { minHeight: 64, textAlignVertical: "top" },
  plPreview: { ...type.numStrong, fontSize: 13, marginTop: space.md },
  saveBtn: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: space.md,
    alignItems: "center",
    marginTop: space.md,
  },
  saveBtnText: { fontFamily: fonts.sansBold, color: colors.onAccent, fontSize: 14 },
  radarWrap: { alignItems: "center", marginBottom: space.md },
  scoreRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6 },
  scoreLabel: { ...type.caption, color: colors.textMuted, width: 72 },
  scoreTrack: { flex: 1, height: 4, backgroundColor: colors.hairline, borderRadius: 2, overflow: "hidden" },
  scoreFill: { height: 4, backgroundColor: colors.text },
  scoreValue: { ...type.numStrong, color: colors.text, fontSize: 12, width: 32, textAlign: "right" },
  note: { ...type.caption, color: colors.textMuted, marginTop: space.sm },
  ledgerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  ledgerLabel: { ...type.body, fontSize: 13, color: colors.textMuted },
  ledgerValue: { ...type.numStrong, color: colors.text, fontSize: 13 },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  tableCell: {
    ...type.num,
    width: 92,
    color: colors.text,
    fontSize: 12,
    paddingVertical: 8,
    paddingRight: space.sm,
    textAlign: "right",
  },
  tableItemCell: { width: 150, fontFamily: fonts.sans, color: colors.textMuted, textAlign: "left" },
  tableHeaderCell: { fontFamily: fonts.monoMedium, color: colors.textMuted, fontSize: 11 },
  summaryText: { ...type.body, fontSize: 13, color: colors.textMuted, lineHeight: 21 },
});
