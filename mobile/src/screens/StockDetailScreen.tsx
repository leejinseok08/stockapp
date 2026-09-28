import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { api } from "../api";
import { PriceChart } from "../components/PriceChart";
import { DisclosureSection, DividendSection, SnowflakeSection } from "../components/FilingsSections";
import {
  Catalysts,
  ModelVsStreet,
  modelPreview,
  ReportTiles,
  Risks,
  ScenarioBar,
  SignalBasis,
  signalBasisPreview,
  Thesis,
} from "../components/ReportSection";
import { Avatar, Band, Chips, ToneTag } from "../components/ui";
import { readSetting, writeSetting } from "../cache";
import { fmtMoney, fmtNum, fmtPrice, fmtTrendPct } from "../format";
import { colors, fonts, space, tones, trendColor, type } from "../theme";
import type {
  Analysis,
  Disclosure,
  Dividends,
  FinancialLineKey,
  Fundamentals,
  HistoryPoint,
  NewsItem,
  Quote,
  Relative,
  RootStackParamList,
  ScanRow,
  Snowflake,
  TrendChart,
} from "../types";
import { Collapsible, Flash, Press, Skeleton } from "../components/motion";

const LINE_LABELS: [FinancialLineKey, string][] = [
  ["revenue", "매출"],
  ["operatingIncome", "영업이익"],
  ["netIncome", "순이익"],
  ["operatingCashFlow", "영업현금흐름"],
];

type Props = NativeStackScreenProps<RootStackParamList, "StockDetail">;

const RANGES: { key: string; label: string }[] = [
  { key: "1d", label: "1일" },
  { key: "5d", label: "5일" },
  { key: "1mo", label: "1개월" },
  { key: "6mo", label: "6개월" },
  { key: "1y", label: "1년" },
];

const MA_WINDOW = 20;

// Sessions shown per daily range, cut from the trend chart's last year.
const DAILY_SESSIONS: Record<string, number> = { "1mo": 22, "6mo": 126, "1y": 260 };
// R5 toggles. Red/blue/green are taken by price and signals, so the averages use other hues;
// 200 keeps the accent it always had.
const MA_OPTIONS = [5, 20, 50, 200] as const;
const MA_COLORS: Record<number, string> = { 5: "#A594F9", 20: "#4FD1C5", 50: "#F2C94C", 200: colors.accent };

function sma(values: number[], window: number): (number | null)[] {
  return values.map((_, i) => {
    if (i < window - 1) return null;
    const slice = values.slice(i - window + 1, i + 1);
    return slice.reduce((sum, v) => sum + v, 0) / window;
  });
}

export default function StockDetailScreen({ route, navigation }: Props) {
  const { symbol, name } = route.params;
  // 1년 is the default: it's the view that carries the 200-day line and the BUY/SELL marks.
  const [range, setRange] = useState("1y");
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [fundamentals, setFundamentals] = useState<Fundamentals | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);

  const [buyPriceText, setBuyPriceText] = useState("");
  const [quantityText, setQuantityText] = useState("");
  const [noteText, setNoteText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [relative, setRelative] = useState<Relative | null>(null);
  const [fin, setFin] = useState<{ row: ScanRow; inGroup: boolean } | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analysisFailed, setAnalysisFailed] = useState(false);
  const [trendChart, setTrendChart] = useState<TrendChart | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [snowflake, setSnowflake] = useState<Snowflake | null>(null);
  const [disclosures, setDisclosures] = useState<Disclosure[]>([]);
  const [dividends, setDividends] = useState<Dividends | null>(null);
  const [buyDateText, setBuyDateText] = useState("");
  const [inWatchlist, setInWatchlist] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [mas, setMas] = useState<number[]>([200]);

  // The chosen averages are remembered on the device.
  useEffect(() => {
    readSetting<number[]>("chart-ma").then((v) => v && setMas(v));
  }, []);
  const toggleMa = (w: number) =>
    setMas((cur) => {
      const next = cur.includes(w) ? cur.filter((x) => x !== w) : [...cur, w];
      writeSetting("chart-ma", next);
      return next;
    });

  useEffect(() => {
    api
      .analysis(symbol)
      .then(setAnalysis)
      .catch((e) => {
        console.warn("analysis load failed", e);
        setAnalysisFailed(true);
      });
    api.trendChart(symbol).then(setTrendChart).catch((e) => console.warn("trend chart load failed", e));
    // Live quote for every stock, watched or not (Korean listings come from Naver in real time).
    api
      .quotes([symbol])
      .then(([q]) => q && q.price != null && setQuote((prev) => ({ ...(prev ?? {}), ...q })))
      .catch(() => {});
    api.news(symbol).then((n) => setNews(n.slice(0, 6))).catch(() => {});
    api
      .snowflake(symbol)
      .then(setSnowflake)
      .catch(() => setSnowflake({ symbol, available: false, reason: "서버 응답 없음" }));
    if (/\.K[SQ]$/.test(symbol)) api.disclosures(symbol).then(setDisclosures).catch(() => {});
    api.dividends(symbol).then(setDividends).catch(() => {});
  }, [symbol]);

  useEffect(() => {
    api
      .relative(symbol)
      .then(setRelative)
      .catch((e) => console.warn("relative strength load failed", e));
    // Scores are percentiles within the big-tech group; outside it only the growth rates mean anything.
    api
      .scan()
      .then(async (group) => {
        const inGroup = group.rows.find((r) => r.symbol === symbol);
        if (inGroup) return setFin({ row: inGroup, inGroup: true });
        const single = await api.scan([symbol]);
        if (single.rows[0]) setFin({ row: single.rows[0], inGroup: false });
      })
      .catch((e) => console.warn("financial change load failed", e));
  }, [symbol]);

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
        setInWatchlist(!!entry);
        setBuyPriceText(entry?.buyPrice != null ? String(entry.buyPrice) : "");
        setQuantityText(entry?.quantity != null ? String(entry.quantity) : "");
        setNoteText(entry?.note ?? "");
        setBuyDateText(entry?.buyDate ?? "");
      })
      .catch((e) => console.warn("watchlist entry load failed", e));
  }, [symbol]);

  // Header 삭제: first tap arms it (3 s), second tap removes the stock from the list and goes back.
  useEffect(() => {
    if (!confirmDelete) return;
    const id = setTimeout(() => setConfirmDelete(false), 3000);
    return () => clearTimeout(id);
  }, [confirmDelete]);

  useEffect(() => {
    const remove = async () => {
      if (!confirmDelete) return setConfirmDelete(true);
      setDeleting(true);
      try {
        await api.removeFromWatchlist(symbol);
        navigation.goBack();
      } catch (e) {
        console.warn("remove failed", e);
        setDeleting(false);
        setConfirmDelete(false);
      }
    };
    navigation.setOptions({
      // Big-tech 9 stay on the list regardless, so only stocks the owner added get 삭제.
      headerRight: inWatchlist && fin && !fin.inGroup
        ? () => (
            <Press
              onPress={remove}
              disabled={deleting}
              hitSlop={10}
              style={{ paddingLeft: space.md, paddingRight: space.lg }}
              accessibilityRole="button"
              accessibilityLabel={confirmDelete ? "한 번 더 누르면 목록에서 삭제" : "목록에서 삭제"}
            >
              <Text style={[styles.deleteText, confirmDelete && styles.deleteArmed]}>
                {deleting ? "삭제 중…" : confirmDelete ? "삭제 확인" : "삭제"}
              </Text>
            </Press>
          )
        : undefined,
    });
  }, [navigation, inWatchlist, fin, confirmDelete, deleting, symbol]);

  const savePosition = async () => {
    setSaving(true);
    try {
      const buyPrice = buyPriceText.trim() ? parseFloat(buyPriceText) : null;
      const quantity = quantityText.trim() ? parseFloat(quantityText) : null;
      await api.addToWatchlist(symbol); // idempotent; PATCH needs the row to exist
      setInWatchlist(true);
      await api.updateWatchlistItem(symbol, {
        buyPrice: Number.isFinite(buyPrice) ? buyPrice : null,
        quantity: Number.isFinite(quantity) ? quantity : null,
        note: noteText.trim() || null,
        buyDate: /^\d{4}-\d{2}-\d{2}$/.test(buyDateText.trim()) ? buyDateText.trim() : null,
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
  // Stocks not on the watchlist have no quote here; their statements' currency is the listing's.
  const currency = quote?.currency ?? fundamentals?.financialCurrency ?? null;

  const buyPriceNum = parseFloat(buyPriceText);
  const quantityNum = parseFloat(quantityText);
  const hasPosition = Number.isFinite(buyPriceNum) && Number.isFinite(quantityNum) && buyPriceNum > 0;
  const plPercent = hasPosition && currentPrice != null ? ((currentPrice - buyPriceNum) / buyPriceNum) * 100 : null;

  const screenWidth = Dimensions.get("window").width;
  const chartWidth = screenWidth - space.lg * 2;

  // Daily ranges come from the trend chart (3 years behind it, so every average is real from the
  // first shown day); 1일/5일 are intraday bars without day averages.
  const daily = range === "1mo" || range === "6mo" || range === "1y";
  const tcPoints = trendChart?.points ?? [];
  const shown = daily && tcPoints.length > 1 ? tcPoints.slice(-(DAILY_SESSIONS[range] ?? tcPoints.length)) : null;
  const firstT = shown?.[0]?.t ?? 0;
  const shownCloses = shown ? shown.map((p) => p.close) : chart.closes;
  const periodChange =
    shownCloses.length > 1 && shownCloses[0] ? ((shownCloses[shownCloses.length - 1] - shownCloses[0]) / shownCloses[0]) * 100 : null;
  const swing = route.params.swing;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: space.xxl * 2 }}>
      <View style={styles.headerBlock}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Avatar name={name || fundamentals?.name || symbol} uri={analysis?.logo} size={32} />
          <Text style={styles.name} numberOfLines={1}>
            {fundamentals?.name || name || symbol}
          </Text>
          {!!fundamentals?.industry && (
            <Text style={styles.sector} numberOfLines={1}>
              {fundamentals.industry}
            </Text>
          )}
        </View>
        <Flash value={currentPrice} style={{ alignSelf: "flex-start", marginTop: space.md }}>
          <Text style={styles.price}>{fmtPrice(currentPrice, currency)}</Text>
        </Flash>
        <View style={styles.changes}>
          {quote?.changePercent != null && (
            <Text style={[styles.periodChange, { color: trendColor(quote.changePercent) }]}>
              {fmtTrendPct(quote.changePercent)} <Text style={styles.periodLabel}>오늘</Text>
            </Text>
          )}
          <Text style={[styles.periodChange, { color: trendColor(periodChange) }]}>
            {fmtTrendPct(periodChange)} <Text style={styles.periodLabel}>{RANGES.find((x) => x.key === range)?.label}</Text>
          </Text>
        </View>
      </View>

      {swing && (
        <View style={styles.swingCard} accessible accessibilityLabel={`스윙 ${swing.action}, ${swing.techniques.join(", ")}, ${swing.order}`}>
          <ToneTag tone={swing.action === "BUY" ? "good" : "caution"} label={`스윙 ${swing.action}`} />
          <Text style={styles.swingText}>
            {swing.techniques.join(" · ")}
            {swing.note ? ` · ${swing.note}` : ""} · {swing.order}
          </Text>
        </View>
      )}

      {/* R1: the chart right under the price */}
      <View style={styles.chartWrap}>
        {loading && !shown ? (
          <Skeleton width={chartWidth} height={190} />
        ) : shown ? (
          <PriceChart
            times={shown.map((p) => p.t)}
            closes={shownCloses}
            lines={MA_OPTIONS.filter((w) => mas.includes(w)).map((w) => ({
              values: shown.map((p) => (p[`ma${w}` as const] ?? null) as number | null),
              color: MA_COLORS[w],
            }))}
            marks={(trendChart?.marks ?? [])
              .filter((m) => m.t >= firstT)
              .map((m) => ({ i: shown.findIndex((p) => p.t === m.t), type: m.type }))
              .filter((m) => m.i >= 0)}
            currency={currency}
            width={chartWidth}
          />
        ) : (
          chart.closes.length > 1 && <PriceChart times={chart.times} closes={chart.closes} currency={currency} width={chartWidth} />
        )}
        <View style={styles.rangeRow}>
          <Chips options={RANGES} value={range} onChange={setRange} labelFor={(l) => `${l} 차트`} />
        </View>
        {/* R5: moving averages on/off (daily ranges) */}
        {daily && shown && (
          <View style={styles.maRow}>
            <Text style={styles.maTitle}>이동평균</Text>
            {MA_OPTIONS.map((w) => {
              const on = mas.includes(w);
              return (
                <Press
                  key={w}
                  onPress={() => toggleMa(w)}
                  hitSlop={4}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${w}일 이동평균 ${on ? "켜짐" : "꺼짐"}`}
                  style={[styles.maChip, on && { borderColor: MA_COLORS[w], backgroundColor: colors.surface }]}
                >
                  <View style={[styles.maSwatch, { backgroundColor: MA_COLORS[w], opacity: on ? 1 : 0.35 }]} />
                  <Text style={[styles.maText, on && styles.maTextOn]}>{w}일</Text>
                </Press>
              );
            })}
          </View>
        )}
        {shown && (
          <Text style={styles.legend}>
            ━ 가격 <Text style={{ color: tones.good.fg }}>▲ BUY</Text> <Text style={{ color: tones.caution.fg }}>▼ SELL</Text> (신호 다음 거래일) ·
            이동평균은 기간이 다 찬 날부터
          </Text>
        )}
      </View>

      {/* R2 + R3 */}
      <View style={styles.report}>
        {analysis ? (
          <>
            <ReportTiles a={analysis} />
            <ScenarioBar a={analysis} />
          </>
        ) : analysisFailed ? (
          <Text style={styles.note}>리포트를 만들지 못했어요.</Text>
        ) : (
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Skeleton width="32%" height={86} r={14} />
            <Skeleton width="32%" height={86} r={14} />
            <Skeleton width="32%" height={86} r={14} />
          </View>
        )}
      </View>

      <Band />

      {/* R4: everything else as one-line previews that open */}
      <View style={styles.details}>
        {analysis && analysis.thesis.length > 0 && (
          <Collapsible title="핵심 논거" preview={`${analysis.thesis.length}가지`} initiallyOpen>
            <Thesis a={analysis} />
          </Collapsible>
        )}
        {analysis && (
          <Collapsible title="신호 근거" preview={signalBasisPreview(analysis)}>
            <SignalBasis a={analysis} />
          </Collapsible>
        )}
        {analysis && (
          <Collapsible
            title="촉매"
            preview={analysis.catalysts[0] ? `${analysis.catalysts[0].date} ${analysis.catalysts[0].text}` : "확인된 일정 없음"}
          >
            <Catalysts a={analysis} />
          </Collapsible>
        )}
        {analysis && analysis.risks.length > 0 && (
          <Collapsible title="리스크" preview={`${analysis.risks.length}가지 · 논거가 깨지는 조건`}>
            <Risks a={analysis} />
          </Collapsible>
        )}
        {analysis && (
          <Collapsible title="자체 추정 vs 컨센서스" preview={modelPreview(analysis)}>
            <ModelVsStreet a={analysis} />
            <Text style={styles.note}>규칙 기반 자동 분석이며 투자 권유가 아닙니다. 경영진 면담·통화 내용은 반영하지 못해요.</Text>
          </Collapsible>
        )}

        {relative && relative.series.length > 1 && (
          <Collapsible title="지수 대비" preview={`${relative.benchmarkName} · 3개월 ${fmtTrendPct(relative.excess3m, 1)}p`}>
            <PriceChart
              times={relative.series.map((p) => p.t)}
              closes={relative.series.map((p) => p.ratio)}
              ma={relative.series.map((p) => p.ma)}
              width={chartWidth}
            />
            <Text style={styles.maLabel}>━ {relative.maWindow}일 평균 · 1년 전 = 100 · 선이 오르면 지수보다 강함</Text>
            {!!relative.verdict && <Text style={styles.verdict}>{relative.verdict}</Text>}
            <Ledger
              rows={[
                [
                  "현재",
                  relative.aboveMa == null
                    ? "-"
                    : `비율이 ${relative.maWindow}일 평균 ${relative.aboveMa ? "위" : "아래"}${relative.since ? ` (${relative.since}~)` : ""}`,
                ],
                ["초과 수익률 1개월", `${fmtTrendPct(relative.excess1m, 1)}p`],
                ["초과 수익률 3개월", `${fmtTrendPct(relative.excess3m, 1)}p`],
                ["초과 수익률 6개월", `${fmtTrendPct(relative.excess6m, 1)}p`],
              ]}
            />
            <Text style={styles.note}>
              투자총론 4편: 시장이 내릴 때 지수보다 더 빠지는 종목은 회복탄력성을 잃고 있을 가능성이 높아요. 지수보다 덜 빠졌다면
              손절하지 않는 게 원칙이에요.
            </Text>
          </Collapsible>
        )}

        {fin && (
          <Collapsible title="재무 변화" preview={`${fin.row.quarter ?? "-"} · 매출 전년비 ${fmtTrendPct(fin.row.lines.revenue?.yoy, 1)}`}>
            <Ledger
              rows={[
                ...LINE_LABELS.map(([key, label]): [string, string] => {
                  const l = fin.row.lines[key];
                  return [`${label} 전분기비 · 전년비`, `${fmtTrendPct(l?.qoq, 1)} · ${fmtTrendPct(l?.yoy, 1)}`];
                }),
                ["시가총액 / 영업이익(4분기)", fmtNum(fin.row.capToOpIncome, 1)],
                ...(fin.inGroup
                  ? ([["빅테크 9개 중 재무 점수", fin.row.score != null ? String(Math.round(fin.row.score)) : "-"]] as [string, string][])
                  : []),
              ]}
            />
            {fin.row.ocfNegativeTtm && <Text style={styles.verdict}>최근 4분기 영업현금흐름 합계가 적자예요 (TIP 9: 걸러야 할 회사).</Text>}
            <Text style={styles.note}>
              절대값보다 변화율을 봐요(TIP 30). 시가총액/영업이익은 낮을수록 영업이익 대비 싸다는 뜻이고, 추세가 줄어드는지가 중요해요.
            </Text>
          </Collapsible>
        )}

        {snowflake && (
          <Collapsible title="펀더멘털 스노우플레이크" preview={snowflake.available ? "공시 기준 5개 축" : "공시 데이터 없음"}>
            <SnowflakeSection data={snowflake} bare />
          </Collapsible>
        )}
        {dividends?.pays && (
          <Collapsible
            title="배당"
            preview={
              dividends.nextExDate
                ? `다음 ${dividends.nextExDate.slice(5).replace("-", "/")}${dividends.nextEstimated ? " (예상)" : ""}`
                : "지급 기록 있음"
            }
          >
            <DividendSection d={dividends} bare />
          </Collapsible>
        )}
        {disclosures.length > 0 && (
          <Collapsible title="공시" preview={disclosures[0].title}>
            <DisclosureSection items={disclosures} bare />
          </Collapsible>
        )}

        {(
          [
            ["손익계산서", fundamentals?.income],
            ["재무상태표", fundamentals?.balance],
            ["현금흐름표", fundamentals?.cashflow],
          ] as const
        ).map(([title, rows]) =>
          rows && rows.length ? (
            <Collapsible
              key={title}
              title={title}
              preview={`${Object.keys(rows[0].values)[0]?.slice(0, 7) ?? ""} · ${fundamentals?.financialCurrency ?? ""}`}
            >
              <StatementTable rows={rows} currency={fundamentals?.financialCurrency} />
            </Collapsible>
          ) : null
        )}

        {!!fundamentals?.summary && (
          <Collapsible title="기업 개요" preview={fundamentals.summary}>
            <Text style={styles.summaryText}>{fundamentals.summary}</Text>
          </Collapsible>
        )}

        {news.length > 0 && (
          <Collapsible title="뉴스" preview={news[0].title}>
            {news.map((n, i) => (
              <Press
                key={i}
                style={styles.newsRow}
                onPress={() => n.url && Linking.openURL(n.url)}
                accessibilityRole="link"
                accessibilityLabel={n.title}
              >
                <Text style={styles.newsTitle}>{n.title}</Text>
                {!!n.publisher && <Text style={styles.newsMeta}>{n.publisher}</Text>}
              </Press>
            ))}
          </Collapsible>
        )}

        <Collapsible title="내 포지션" preview={hasPosition ? `${quantityText}주 · 평단 ${fmtPrice(buyPriceNum, currency)}` : "매수가·수량 입력"}>
          <View style={styles.positionRow}>
            <Field label="매수가" value={buyPriceText} onChangeText={setBuyPriceText} />
            <Field label="수량" value={quantityText} onChangeText={setQuantityText} />
          </View>
          <Text style={styles.fieldLabel}>매수일 (YYYY-MM-DD, 지수 비교용)</Text>
          <TextInput
            style={[styles.input, styles.numInput]}
            value={buyDateText}
            onChangeText={setBuyDateText}
            placeholder="2026-01-02"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="매수일"
          />
          {plPercent != null && <Text style={[styles.plPreview, { color: trendColor(plPercent) }]}>평가 수익률 {fmtTrendPct(plPercent)}</Text>}
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
          <Press
            pressedBg={false}
            style={({ pressed }) => [styles.saveBtn, (pressed || saving) && { opacity: 0.7 }]}
            onPress={savePosition}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="포지션과 메모 저장"
          >
            <Text style={styles.saveBtnText}>{saving ? "저장 중…" : saved ? "저장됨" : "저장"}</Text>
          </Press>
        </Collapsible>
      </View>
    </ScrollView>
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

// The Collapsible carries the title; this is just the four latest periods.
function StatementTable({ rows, currency }: { rows: Fundamentals["income"]; currency?: string | null }) {
  const periods = Object.keys(rows[0].values).slice(0, 4);
  return (
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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { padding: space.xxl, alignItems: "center" },
  headerBlock: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.md },
  name: { ...type.body, fontFamily: fonts.sansMedium, color: colors.text },
  sector: { ...type.caption, color: colors.textMuted, flexShrink: 1 },
  changes: { flexDirection: "row", gap: space.md, marginTop: 4 },
  swingCard: { marginHorizontal: space.lg, marginBottom: space.md, flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: colors.surface, borderRadius: 12, padding: space.md },
  swingText: { flex: 1, ...type.caption, color: colors.text },
  maRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: space.sm, flexWrap: "wrap" },
  maTitle: { fontFamily: fonts.sansMedium, fontSize: 12, color: colors.textMuted, marginRight: 2 },
  maChip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.hairline, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  maSwatch: { width: 12, height: 3, borderRadius: 2 },
  maText: { fontFamily: fonts.sansMedium, fontSize: 12, color: colors.textMuted },
  maTextOn: { fontFamily: fonts.sansBold, color: colors.text },
  legend: { ...type.caption, fontSize: 11, color: colors.textMuted, marginTop: space.sm },
  details: { paddingHorizontal: space.lg },
  price: { ...type.hero, color: colors.text },
  periodChange: { ...type.numStrong, fontSize: 14, marginTop: 2 },
  periodLabel: { fontFamily: fonts.sans, fontSize: 11, color: colors.textMuted },
  rangeRow: { flexDirection: "row", marginTop: space.md },
  rangeBtn: { paddingVertical: space.xs, alignItems: "center" },
  rangeText: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.textMuted },
  rangeTextActive: { color: colors.text },
  rangeUnderline: { height: 2, alignSelf: "stretch", backgroundColor: colors.accent, marginTop: 4 },
  chartWrap: { paddingHorizontal: space.lg, marginTop: space.sm },
  maLabel: { ...type.num, fontSize: 11, color: colors.textMuted, marginTop: space.xs },
  report: { paddingHorizontal: space.lg, paddingTop: space.xl, paddingBottom: space.xl },
  newsRow: { paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  newsTitle: { ...type.body, fontSize: 13, color: colors.text, lineHeight: 19 },
  newsMeta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  verdict: { ...type.body, fontSize: 13, color: colors.text, marginTop: space.md, marginBottom: space.xs },
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
  deleteText: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.textMuted },
  deleteArmed: { color: colors.accent, fontFamily: fonts.sansBold },
  saveBtnText: { fontFamily: fonts.sansBold, color: colors.onAccent, fontSize: 14 },
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
