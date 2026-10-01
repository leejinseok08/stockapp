// 코멘트 tab: search any KR/US listing and read its value-investing comment, built on AI Berkshire's
// checks (github.com/xbtlin/ai-berkshire): the 7-metric quality screen and the six-gate checklist,
// computed from filings on the server (comment.py). Judgment gates (능력권·해자·경영진, 거울 테스트)
// appear only when a written note exists for the stock (tools/comment/PROMPT.md).
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import React, { useEffect, useState } from "react";
import { Linking, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "../api";
import { readCache, readSetting, writeCache, writeSetting } from "../cache";
import { Collapsible, FadeIn, Press, ScreenSkeleton } from "../components/motion";
import { ChangePill, Section, ToneTag } from "../components/ui";
import { fmtPrice } from "../format";
import { verdictTone } from "../signal";
import { colors, fonts, radius, space, tones, type } from "../theme";
import type { CommentCheck, CommentMetric, RootStackParamList, SearchResult, StockComment } from "../types";

type Picked = { symbol: string; name: string };
const RECENT_KEY = "commentRecent";
const MAX_RECENT = 8;

export default function CommentScreen() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [recent, setRecent] = useState<Picked[]>([]);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [data, setData] = useState<StockComment | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    readSetting<Picked[]>(RECENT_KEY).then((r) => r && setRecent(r));
  }, []);

  // Any KOSPI/KOSDAQ/NYSE/NASDAQ listing, searched as you type (short pause first).
  useEffect(() => {
    const q = query.trim();
    if (!q) return setResults(null);
    const id = setTimeout(() => {
      api.search(q).then(setResults).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(id);
  }, [query]);

  const open = (p: Picked) => {
    setPicked(p);
    setQuery("");
    setResults(null);
    setError(false);
    setData(null);
    const next = [p, ...recent.filter((r) => r.symbol !== p.symbol)].slice(0, MAX_RECENT);
    setRecent(next);
    writeSetting(RECENT_KEY, next);
    // The last copy at once, then the fresh one in place.
    readCache<StockComment>(`comment:${p.symbol}`).then((c) => c && setData((d) => d ?? c.data));
    api
      .comment(p.symbol)
      .then((d) => {
        setData(d);
        writeCache(`comment:${p.symbol}`, d);
      })
      .catch(() => setError(true));
  };

  return (
    <FadeIn>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>코멘트</Text>
        </View>
        <View style={styles.searchBox}>
          <Feather name="search" size={16} color={colors.textMuted} />
          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder="종목명 또는 코드 (국내·미국 전체)"
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel="코멘트를 볼 종목 검색"
          />
          {!!query && (
            <Press onPress={() => setQuery("")} hitSlop={12} accessibilityRole="button" accessibilityLabel="검색어 지우기">
              <Feather name="x" size={16} color={colors.textMuted} />
            </Press>
          )}
        </View>

        {results ? (
          <ScrollView keyboardShouldPersistTaps="handled">
            {results.length === 0 && <Text style={styles.empty}>찾는 종목이 없어요</Text>}
            {results.map((r) => (
              <Press
                key={r.symbol}
                style={styles.resultRow}
                onPress={() => open({ symbol: r.symbol, name: r.name })}
                accessibilityRole="button"
                accessibilityLabel={`${r.name} 코멘트 보기`}
              >
                <Text style={styles.resultName}>{r.name}</Text>
                <Text style={styles.sub}>
                  {r.symbol} · {r.market}
                </Text>
              </Press>
            ))}
          </ScrollView>
        ) : picked ? (
          <CommentView picked={picked} data={data} error={error} onRetry={() => open(picked)} />
        ) : (
          <ScrollView>
            <Section title="종목 코멘트" desc="가치투자 대가 4인의 체크리스트로 본 한 줄 평" first>
              {recent.length > 0 && <Text style={styles.label}>최근 본 종목</Text>}
              <View style={styles.recentWrap}>
                {recent.map((r) => (
                  <Press
                    key={r.symbol}
                    style={styles.recentChip}
                    onPress={() => open(r)}
                    accessibilityRole="button"
                    accessibilityLabel={`${r.name} 코멘트 다시 보기`}
                  >
                    <Text style={styles.recentText}>{r.name}</Text>
                  </Press>
                ))}
              </View>
              {recent.length === 0 && <Text style={styles.empty}>위에서 종목을 검색하세요</Text>}
            </Section>
            <Footnote />
          </ScrollView>
        )}
      </View>
    </FadeIn>
  );
}

function CommentView({ picked, data, error, onRetry }: { picked: Picked; data: StockComment | null; error: boolean; onRetry: () => void }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  if (!data) {
    if (error)
      return (
        <View style={styles.center}>
          <Text style={styles.empty}>코멘트를 불러오지 못했어요</Text>
          <Press onPress={onRetry} style={styles.retry} accessibilityRole="button" accessibilityLabel="다시 시도">
            <Text style={styles.retryText}>다시 시도</Text>
          </Press>
        </View>
      );
    return <ScreenSkeleton rows={6} />;
  }
  const w = data.written;
  const verdict = w?.verdict ?? (data.available ? data.verdict : null);
  const q = data.quote;
  return (
    <ScrollView>
      <View style={styles.hero}>
        <Press
          onPress={() => navigation.navigate("StockDetail", { symbol: data.symbol, name: data.name ?? picked.name })}
          accessibilityRole="button"
          accessibilityLabel={`${picked.name} 리포트 열기`}
          pressedBg={false}
          style={styles.heroTop}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.heroName}>{data.name ?? picked.name}</Text>
            <Text style={styles.sub}>
              {data.symbol}
              {q?.price != null ? ` · ${fmtPrice(q.price, q.currency)}` : ""}
            </Text>
          </View>
          {q?.changePercent != null && <ChangePill value={q.changePercent} />}
          <Feather name="chevron-right" size={18} color={colors.textMuted} style={{ marginLeft: space.sm }} />
        </Press>
        {verdict ? (
          <View style={styles.verdictRow}>
            <ToneTag tone={verdictTone(verdict)} label={verdict} size="lg" />
          </View>
        ) : null}
        <Text style={styles.oneLine}>
          {w?.oneLine ?? (data.available ? data.verdictReason : data.reason ?? "공시 데이터가 없어 판단할 수 없어요")}
        </Text>
        {data.available && (
          <Text style={styles.caption}>
            정보 풍부도 {data.richness.grade} · {data.richness.text}
          </Text>
        )}
      </View>

      {(w || data.available) && (
        <Section title="네 대가의 한 줄" desc={w ? `AI 코멘트 · ${w.asOf}` : "공시 숫자로 쓴 평"}>
          {(data.available ? data.masters : MASTER_ORDER).map((m) => (
            <View key={m.id} style={styles.masterRow}>
              <Text style={styles.masterName}>
                {m.name} <Text style={styles.masterFocus}>{m.focus}</Text>
              </Text>
              <Text style={styles.body}>{w?.masters[m.id] ?? ("text" in m ? m.text : "")}</Text>
            </View>
          ))}
        </Section>
      )}

      {data.available && (
        <Section
          title="걸러내기 7개 지표"
          desc={`${data.quality.result} · 공시 ${data.quality.years}년 (${data.source})`}
        >
          {data.quality.metrics.map((m) => (
            <MetricRow key={m.key} m={m} />
          ))}
        </Section>
      )}

      {(w || data.available) && (
        <Section title="체크리스트 6관문" desc="별 다섯이 최고, 숫자로 못 보는 관문은 AI 코멘트로">
          <GateRow name="1 능력권" stars={w?.gates.competence.stars ?? null} text={w?.gates.competence.text} />
          <GateRow name="2 좋은 사업" stars={data.available ? data.gates.business.stars : null} missing="계산 불가" />
          {data.available && (
            <Collapsible title="기준 5개" preview={`${data.gates.business.checks.filter((c) => c.pass).length}/5 충족`}>
              {data.gates.business.checks.map((c) => (
                <CheckRow key={c.label} c={c} />
              ))}
            </Collapsible>
          )}
          <GateRow name="3 해자" stars={w?.gates.moat.stars ?? null} text={w?.gates.moat.text} />
          <GateRow name="4 경영진" stars={w?.gates.management.stars ?? null} text={w?.gates.management.text} />
          <GateRow
            name="5 안전마진"
            stars={data.available ? data.gates.safety.stars : null}
            missing="계산 불가"
            text={data.available ? data.gates.safety.detail : undefined}
          />
          <GateRow
            name="6 결정 규율"
            stars={null}
            hideStars
            text={
              data.available
                ? data.gates.discipline.flags.length
                  ? data.gates.discipline.flags.join(" · ")
                  : data.gates.discipline.ret1y == null
                    ? "가격 기록이 없어 확인하지 못했어요"
                    : "급등·고점 신호 없음. 5년 거래정지에도 괜찮은지 스스로 물어보세요"
                : undefined
            }
          />
          {data.available && data.veto.length > 0 && <Text style={styles.veto}>즉시 기각: {data.veto.join(", ")}</Text>}
        </Section>
      )}

      {w && (
        <>
          <Section title="리스크" desc="망할 수 있는 길부터">
            {w.risks.map((r, i) => (
              <Text key={i} style={styles.bullet}>
                {i + 1}. {r}
              </Text>
            ))}
          </Section>
          <Section
            title="거울 테스트"
            desc="다섯 문장으로 말하지 못하면 사지 않는다"
            right={<ToneTag tone={w.mirrorPass ? "good" : "caution"} label={w.mirrorPass ? "통과" : "미통과"} />}
          >
            {w.mirror.map((s, i) => (
              <Text key={i} style={styles.bullet}>
                {i + 1}. {s}
              </Text>
            ))}
          </Section>
          <Section title="출처" desc={`${w.author === "claude" ? "Claude" : "Codex"} 작성 · ${w.asOf}`}>
            {w.sources.map((s) => (
              <Press
                key={s.url}
                onPress={() => Linking.openURL(s.url)}
                accessibilityRole="link"
                accessibilityLabel={`${s.title} 원문 열기`}
                style={styles.sourceRow}
              >
                <Text style={styles.sourceText} numberOfLines={2}>
                  {s.title}
                </Text>
                <Text style={styles.sub}>{s.date}</Text>
              </Press>
            ))}
          </Section>
        </>
      )}
      {!w && data.available && (
        <Text style={styles.footnote}>능력권·해자·경영진과 거울 테스트는 AI 코멘트가 작성된 종목에만 나와요.</Text>
      )}
      {data.available && (
        <Press onPress={() => Linking.openURL(data.sourceUrl)} accessibilityRole="link" accessibilityLabel="공시 원문 열기">
          <Text style={styles.link}>공시 원문: {data.source}</Text>
        </Press>
      )}
      <Footnote />
    </ScrollView>
  );
}

const MASTER_ORDER = [
  { id: "dyp", name: "돤융핑", focus: "사업의 본질" },
  { id: "buffett", name: "버핏", focus: "가격과 안전마진" },
  { id: "munger", name: "멍거", focus: "뒤집어 보기" },
  { id: "lilu", name: "리루", focus: "장기 확실성" },
] as const;

const starText = (n: number | null | undefined) => (n == null ? "-" : "★".repeat(n) + "☆".repeat(5 - n));

function PassIcon({ pass }: { pass: boolean | null }) {
  const name = pass == null ? "minus" : pass ? "check" : "x";
  const color = pass == null ? tones.neutral.fg : pass ? tones.good.fg : tones.caution.fg;
  return <Feather name={name} size={16} color={color} accessibilityLabel={pass == null ? "데이터 부족" : pass ? "통과" : "미달"} />;
}

function MetricRow({ m }: { m: CommentMetric }) {
  return (
    <View style={styles.metricRow}>
      <PassIcon pass={m.exempt ? true : m.pass} />
      <View style={{ flex: 1, marginLeft: space.sm }}>
        <Text style={styles.metricLabel}>{m.label}</Text>
        <Text style={styles.sub}>기준 {m.rule}</Text>
        {!!m.exempt && <Text style={styles.exempt}>예외 {m.exempt}</Text>}
      </View>
      <Text style={styles.metricValue}>{m.detail}</Text>
    </View>
  );
}

function CheckRow({ c }: { c: CommentCheck }) {
  return (
    <View style={styles.metricRow}>
      <PassIcon pass={c.pass} />
      <Text style={[styles.metricLabel, { flex: 1, marginLeft: space.sm }]}>{c.label}</Text>
      <Text style={styles.metricValue}>{c.detail}</Text>
    </View>
  );
}

// missing: what to show without stars (judgment gates wait for a written note; numeric ones can't be computed).
function GateRow({ name, stars, text, hideStars, missing = "AI 코멘트 필요" }: { name: string; stars: number | null; text?: string; hideStars?: boolean; missing?: string }) {
  return (
    <View style={styles.gateRow}>
      <View style={styles.gateTop}>
        <Text style={styles.gateName}>{name}</Text>
        {!hideStars && <Text style={[styles.stars, stars == null && { color: colors.textMuted }]}>{stars == null ? missing : starText(stars)}</Text>}
      </View>
      {!!text && <Text style={styles.gateText}>{text}</Text>}
    </View>
  );
}

function Footnote() {
  return (
    <Press
      onPress={() => Linking.openURL("https://github.com/xbtlin/ai-berkshire")}
      accessibilityRole="link"
      accessibilityLabel="AI Berkshire 원본 열기"
    >
      <Text style={styles.footnote}>
        AI Berkshire(MIT)의 걸러내기·체크리스트를 공시 숫자에 적용했어요. 걸러내기는 나쁜 선택을 빼는 용도이고, 통과가 매수 신호는
        아니에요. 투자 권유가 아닙니다.
      </Text>
    </Press>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm },
  title: { ...type.title, color: colors.text },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
  },
  search: { flex: 1, color: colors.text, paddingVertical: 12, fontFamily: fonts.sans, fontSize: 15 },
  resultRow: { paddingVertical: space.md, paddingHorizontal: space.lg },
  resultName: { ...type.body, fontFamily: fonts.sansMedium, color: colors.text },
  sub: { ...type.num, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  caption: { ...type.caption, color: colors.textMuted, lineHeight: 17 },
  label: { ...type.caption, color: colors.textMuted, marginBottom: space.sm },
  recentWrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  recentChip: { backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  recentText: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.text },
  empty: { ...type.body, color: colors.textMuted, textAlign: "center", paddingVertical: space.xl },
  center: { flex: 1, alignItems: "center", paddingTop: space.xxl },
  retry: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: space.lg, paddingVertical: space.sm },
  retryText: { fontFamily: fonts.sansBold, color: colors.onAccent },
  hero: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.xl },
  heroTop: { flexDirection: "row", alignItems: "center" },
  heroName: { ...type.section, fontSize: 22 },
  verdictRow: { marginTop: space.lg },
  oneLine: { ...type.body, fontFamily: fonts.sansBold, fontSize: 17, color: colors.text, marginTop: space.md, marginBottom: space.xs, lineHeight: 24 },
  masterRow: { marginBottom: space.lg },
  masterName: { fontFamily: fonts.sansBold, fontSize: 15, color: colors.text, marginBottom: 3 },
  masterFocus: { fontFamily: fonts.sans, fontSize: 12, color: colors.textMuted },
  body: { ...type.body, color: colors.text, lineHeight: 22 },
  metricRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: space.sm },
  metricLabel: { ...type.body, fontSize: 14, color: colors.text },
  metricValue: { ...type.numStrong, fontSize: 13, color: colors.text, marginLeft: space.sm, textAlign: "right" },
  exempt: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  gateRow: { paddingVertical: space.sm },
  gateTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  gateName: { fontFamily: fonts.sansBold, fontSize: 15, color: colors.text },
  stars: { fontFamily: fonts.sans, fontSize: 14, color: colors.text, letterSpacing: 1 },
  gateText: { ...type.body, fontSize: 14, color: colors.textMuted, marginTop: 3, lineHeight: 20 },
  veto: { ...type.body, fontSize: 14, color: tones.caution.fg, marginTop: space.sm },
  bullet: { ...type.body, color: colors.text, lineHeight: 22, marginBottom: space.sm },
  sourceRow: { paddingVertical: space.sm },
  sourceText: { ...type.body, fontSize: 14, color: colors.text },
  link: { ...type.caption, color: colors.accent, paddingHorizontal: space.lg, paddingTop: space.lg },
  footnote: { ...type.caption, color: colors.textMuted, padding: space.lg, lineHeight: 17 },
});
