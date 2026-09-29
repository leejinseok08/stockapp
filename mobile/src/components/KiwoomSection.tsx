// 계좌 tab: the owner's Kiwoom account (read-only) and the Kiwoom mock account that trades the swing
// signals, next to the paper account's return. The backend answers the real account only with the token
// saved once on this device (ACCOUNT_TOKEN in Render).
import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "../api";
import { readCache, readSetting, writeCache, writeSetting } from "../cache";
import { fmtMoney, fmtNum, fmtPrice, fmtTrendPct } from "../format";
import { colors, fonts, radius, space, trendColor, type } from "../theme";
import type { KiwoomAccount, KiwoomBalance, KiwoomMarketBalance, KiwoomMock, KiwoomOrder, SwingPaper } from "../types";
import { Press } from "./motion";
import { Avatar, Chips, Section } from "./ui";

type Market = "KR" | "US";
const MARKETS: { key: Market; label: string }[] = [
  { key: "KR", label: "국내" },
  { key: "US", label: "미국" },
];
const TOKEN_KEY = "kiwoomAccountToken";

const ok = (b: KiwoomBalance | undefined): b is KiwoomMarketBalance => !!b && !("error" in b && b.error);

export function KiwoomAccountSection() {
  const [token, setToken] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [data, setData] = useState<KiwoomAccount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [market, setMarket] = useState<Market>("US");

  const load = useCallback(async (t: string) => {
    try {
      const d = await api.kiwoomAccount(t);
      setData(d);
      setError(null);
      writeCache("kiwoomAccount", d);
    } catch (e: any) {
      const status = e?.response?.status;
      setError(status === 401 ? "토큰이 맞지 않아요" : status === 503 ? "서버에 ACCOUNT_TOKEN이 아직 없어요" : "불러오지 못했어요");
      if (status === 401) setToken(null);
    }
  }, []);

  useEffect(() => {
    readSetting<string>(TOKEN_KEY).then((t) => {
      if (!t) return;
      setToken(t);
      readCache<KiwoomAccount>("kiwoomAccount").then((c) => c && setData((d) => d ?? c.data));
      load(t);
    });
  }, [load]);

  const save = () => {
    const t = draft.trim();
    if (!t) return;
    writeSetting(TOKEN_KEY, t);
    setToken(t);
    setDraft("");
    load(t);
  };

  if (!token) {
    return (
      <Section title="키움 계좌" desc="조회 전용 · 이 기기에 한 번만 입력">
        <View style={styles.tokenRow}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="계좌 토큰"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            autoCapitalize="none"
            style={styles.input}
            accessibilityLabel="계좌 토큰"
            onSubmitEditing={save}
          />
          <Press onPress={save} style={styles.action} accessibilityRole="button" accessibilityLabel="계좌 토큰 저장">
            <Text style={styles.actionText}>연결</Text>
          </Press>
        </View>
        {!!error && <Text style={styles.note}>{error}</Text>}
      </Section>
    );
  }

  if (data && !data.configured) {
    return (
      <Section title="키움 계좌">
        <Text style={styles.note}>서버에 키움 실전 키가 들어가면 여기에 잔고가 표시돼요.</Text>
      </Section>
    );
  }

  const b = data?.configured ? data[market] : undefined;
  return (
    <Section
      title="키움 계좌"
      desc={data?.configured ? `조회 전용 · ${data.asOf.slice(5, 16).replace("T", " ")} 기준` : "불러오는 중"}
      right={<Chips options={MARKETS} value={market} onChange={setMarket} />}
    >
      {!!error && <Text style={styles.note}>{error}</Text>}
      {b && !ok(b) && <Text style={styles.note}>{b.error}</Text>}
      {ok(b) && <Balance b={b} />}
    </Section>
  );
}

function Balance({ b }: { b: KiwoomMarketBalance }) {
  const cur = b.currency;
  return (
    <View>
      <View style={styles.summary} accessible accessibilityLabel={`평가금액 ${fmtMoney(b.value, cur)}, 수익률 ${fmtTrendPct(b.ret != null ? b.ret * 100 : null)}`}>
        <View>
          <Text style={styles.label}>평가금액</Text>
          <Text style={styles.big}>{fmtMoney(b.value, cur)}</Text>
          <Text style={[styles.pl, { color: trendColor(b.pnl ?? 0) }]}>
            {fmtMoney(b.pnl, cur)} {fmtTrendPct(b.ret != null ? b.ret * 100 : null)}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.label}>예수금</Text>
          <Text style={styles.cash}>{fmtMoney(b.cash, cur)}</Text>
          {cur === "USD" && b.valueKrw != null && <Text style={styles.note}>원화 {fmtMoney(b.valueKrw, "KRW")}</Text>}
        </View>
      </View>
      {b.holdings.length === 0 && <Text style={styles.note}>보유 종목이 없어요.</Text>}
      {b.holdings.map((h) => (
        <View key={h.symbol} style={styles.row} accessible accessibilityLabel={`${h.name}, ${fmtNum(h.qty, 0)}주, ${fmtTrendPct(h.ret != null ? h.ret * 100 : null)}`}>
          <Avatar name={h.name || h.symbol} />
          <View style={styles.mid}>
            <Text style={styles.name} numberOfLines={1}>{h.name || h.symbol}</Text>
            <Text style={styles.meta}>
              {fmtNum(h.qty, 0)}주 · 평단 {fmtPrice(h.avgPrice, cur)}
            </Text>
          </View>
          <View style={styles.right}>
            <Text style={styles.value}>{fmtMoney(h.value, cur)}</Text>
            <Text style={[styles.small, { color: trendColor(h.ret ?? 0) }]}>{fmtTrendPct(h.ret != null ? h.ret * 100 : null)}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const SIDE = { buy: "매수", sell: "매도" } as const;
const STATUS = { planned: "예정", sent: "주문", failed: "실패" } as const;

export function KiwoomMockSection() {
  const [data, setData] = useState<KiwoomMock | null>(null);
  const [paper, setPaper] = useState<Partial<Record<Market, SwingPaper>> | null>(null);
  const [market, setMarket] = useState<Market>("KR");

  useEffect(() => {
    readCache<KiwoomMock>("kiwoomMock").then((c) => c && setData((d) => d ?? c.data));
    api
      .kiwoomMock()
      .then((d) => {
        setData(d);
        writeCache("kiwoomMock", d);
      })
      .catch((e) => console.warn("kiwoom mock failed", e));
    api.swingPaper().then(setPaper).catch(() => {});
  }, []);

  if (!data) return null;
  if (!data.configured) {
    return (
      <Section title="스윙 모의투자 · 키움">
        <Text style={styles.note}>서버에 키움 모의투자 키가 들어가면 스윙 신호를 모의계좌에서 실제로 주문해요.</Text>
      </Section>
    );
  }
  const m = data[market];
  const b = m?.balance;
  const p = paper?.[market]?.account;
  return (
    <Section
      title="스윙 모의투자 · 키움"
      desc="스윙 신호를 다음 장 시작 직후 키움 모의계좌에 주문"
      right={<Chips options={MARKETS} value={market} onChange={setMarket} />}
    >
      {b && !ok(b) && <Text style={styles.note}>{b.error}</Text>}
      {ok(b) && (
        <View style={styles.compare}>
          <Stat label={`키움 모의${m?.since ? ` · ${m.since.slice(5)}~` : ""}`} value={m?.ret} sub={fmtMoney(b.equity, b.currency)} />
          <Stat label="가상 계산" value={p?.ret} sub={p ? `${p.trades}건` : "-"} />
        </View>
      )}
      {(m?.orders ?? []).slice(0, 8).map((o) => (
        <OrderRow key={o.id} o={o} currency={market === "KR" ? "KRW" : "USD"} />
      ))}
      {m && m.orders.length === 0 && <Text style={styles.note}>아직 주문이 없어요 · 다음 스캔 뒤에 계획돼요</Text>}
    </Section>
  );
}

function Stat({ label, value, sub }: { label: string; value: number | null | undefined; sub: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.statValue, { color: value != null ? trendColor(value) : colors.textMuted }]}>
        {fmtTrendPct(value != null ? value * 100 : null)}
      </Text>
      <Text style={styles.meta}>{sub}</Text>
    </View>
  );
}

function OrderRow({ o, currency }: { o: KiwoomOrder; currency: string }) {
  return (
    <View style={styles.order} accessible accessibilityLabel={`${o.name ?? o.symbol} ${SIDE[o.side]} ${o.qty}주 ${STATUS[o.status]}`}>
      <Text style={[styles.side, { color: o.side === "buy" ? colors.up : colors.down }]}>{SIDE[o.side]}</Text>
      <View style={styles.mid}>
        <Text style={styles.orderName} numberOfLines={1}>{o.name ?? o.symbol}</Text>
        <Text style={styles.meta} numberOfLines={1}>
          {o.qty}주 · {o.price != null ? `지정가 ${fmtPrice(o.price, currency)}` : "시가"}
          {o.status === "failed" && o.msg ? ` · ${o.msg}` : ""}
        </Text>
      </View>
      <Text style={[styles.status, o.status === "failed" && { color: colors.up }]}>{STATUS[o.status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tokenRow: { flexDirection: "row", gap: space.sm, alignItems: "center" },
  input: {
    flex: 1, height: 44, borderRadius: radius.md, backgroundColor: colors.surface, color: colors.text,
    paddingHorizontal: space.md, fontFamily: fonts.sans, fontSize: 15,
  },
  action: { height: 44, paddingHorizontal: space.lg, borderRadius: radius.md, backgroundColor: colors.accent, justifyContent: "center" },
  actionText: { fontFamily: fonts.sansBold, fontSize: 15, color: colors.onAccent },
  summary: { flexDirection: "row", justifyContent: "space-between", backgroundColor: colors.surface, borderRadius: 16, padding: space.lg, marginBottom: space.sm },
  label: { fontFamily: fonts.sansMedium, fontSize: 12, color: colors.textMuted },
  big: { ...type.numStrong, fontSize: 22, color: colors.text, marginTop: 2 },
  pl: { ...type.numStrong, fontSize: 13, marginTop: 2 },
  cash: { ...type.numStrong, fontSize: 15, color: colors.text, marginTop: 2 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: space.md },
  mid: { flex: 1, marginLeft: space.md },
  name: { ...type.body, fontFamily: fonts.sansBold, color: colors.text, fontSize: 16 },
  meta: { ...type.caption, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  right: { alignItems: "flex-end" },
  value: { ...type.numStrong, color: colors.text, fontSize: 15 },
  small: { ...type.numStrong, fontSize: 12, marginTop: 2 },
  compare: { flexDirection: "row", gap: space.sm, marginBottom: space.sm },
  stat: { flex: 1, backgroundColor: colors.surface, borderRadius: 16, padding: space.md },
  statValue: { ...type.numStrong, fontSize: 20, marginTop: 4 },
  order: { flexDirection: "row", alignItems: "center", paddingVertical: space.sm },
  side: { fontFamily: fonts.sansBold, fontSize: 13, width: 32 },
  orderName: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.text },
  status: { fontFamily: fonts.sansMedium, fontSize: 12, color: colors.textMuted },
  note: { ...type.caption, color: colors.textMuted, marginTop: space.xs, lineHeight: 17 },
});
