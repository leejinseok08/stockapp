import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "../api";
import { readSetting, writeSetting } from "../cache";
import { fmtMoney } from "../format";
import { colors, fonts, space, type } from "../theme";
import type { IsaPlan } from "../types";
import { Collapsible, Press } from "./motion";
import { ToneTag } from "./ui";

const mdd = (d?: string) => (d ? d.slice(5).replace("-", "/") : "");

type IsaSettings = {
  joinDate: string; // YYYY-MM-DD
  monthly?: string; // 월 적립금, used by the 분할매수 card on 오늘
  paidThisYear: string;
  paidTotal: string;
  annualLimit: string;
  totalLimit: string;
  taxFree: string;
};

// 현행 일반형 기준. 2026 세제개편안(연 4천만·총 2억·비과세 500만)은 확정 전이라 기본값으로 쓰지 않음.
const DEFAULTS: IsaSettings = {
  joinDate: "",
  paidThisYear: "",
  paidTotal: "",
  annualLimit: "20000000",
  totalLimit: "100000000",
  taxFree: "2000000",
};

const SETTINGS_KEY = "isa";
const num = (s: string) => {
  const v = parseFloat(s.replace(/[^0-9.]/g, ""));
  return Number.isFinite(v) ? v : null;
};

function maturity(joinDate: string): { date: string; days: number; elapsed: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(joinDate.trim());
  if (!m) return null;
  const end = new Date(Number(m[1]) + 3, Number(m[2]) - 1, Number(m[3]));
  const start = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const days = Math.ceil((end.getTime() - Date.now()) / 86400000);
  const elapsed = (Date.now() - start.getTime()) / (end.getTime() - start.getTime());
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`, days, elapsed };
}

// gainKRW: unrealized P/L of the KRW-listed holdings (what ISA can hold), for the tax-free meter.
export function IsaSection({ gainKRW }: { gainKRW?: number | null }) {
  const [s, setS] = useState<IsaSettings>(DEFAULTS);
  const [editing, setEditing] = useState(false);
  const [plan, setPlan] = useState<IsaPlan | null>(null);

  useEffect(() => {
    api.isaPlan().then(setPlan).catch(() => {});
  }, []);

  useEffect(() => {
    readSetting<IsaSettings>(SETTINGS_KEY).then((v) => v && setS({ ...DEFAULTS, ...v }));
  }, []);

  const save = () => {
    writeSetting(SETTINGS_KEY, s);
    setEditing(false);
  };

  const paidYear = num(s.paidThisYear);
  const paidTotal = num(s.paidTotal);
  const annual = num(s.annualLimit);
  const total = num(s.totalLimit);
  const mat = maturity(s.joinDate);


  const monthly = num(s.monthly ?? "");
  // The fields the owner types in; while any is empty, one button asks for them instead of a
  // "설정에서 입력" on every row.
  const missing = !monthly || paidYear == null || !mat;

  return (
    <View>
      <Text style={styles.sectionTitle}>ISA · KB증권 중개형</Text>
      <Text style={styles.desc}>이번 달 매수와 한도 · 일반형</Text>
      {plan &&
        plan.items.map((i) => {
          const [tone, label] =
            i.status === "done"
              ? (["neutral", `${mdd(i.boughtOn)} 매수함`] as const)
              : i.status === "buy"
                ? (["good", `${i.buyToday ? "오늘" : mdd(i.buyOn)} 매수${i.reason === "monthEnd" ? " (월말)" : " 예정"}`] as const)
                : i.status === "wait"
                  ? (["neutral", "하락일 대기"] as const)
                  : (["neutral", "확인 안 됨"] as const);
          return (
            <View key={i.id} style={styles.planRow} accessible accessibilityLabel={`${i.name} 비중 ${Math.round(i.weight * 100)}%, ${label}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.planName}>{i.name}</Text>
                <Text style={styles.sub}>
                  비중 {Math.round(i.weight * 100)}%{monthly ? ` · ${fmtMoney(monthly * i.weight, "KRW")}` : ""}
                </Text>
              </View>
              <ToneTag tone={tone} label={label} />
            </View>
          );
        })}
      {plan && <Text style={styles.sub}>{plan.rule} · 알림 없음</Text>}

      {!!monthly && <Row label="월 적립금" value={fmtMoney(monthly, "KRW")} sub="ETF별 금액은 40 : 30 : 30" />}
      {paidYear != null && !!annual && (
        <Row
          label="올해 납입"
          value={`${fmtMoney(paidYear, "KRW")} / ${fmtMoney(annual, "KRW")}`}
          progress={paidYear / annual}
          sub={`${Math.round((paidYear / annual) * 100)}% 사용 · 남은 한도 ${fmtMoney(Math.max(annual - paidYear, 0), "KRW")}`}
        />
      )}
      {paidTotal != null && !!total && (
        <Row label="누적 납입" value={`${fmtMoney(paidTotal, "KRW")} / ${fmtMoney(total, "KRW")}`} progress={paidTotal / total} />
      )}
      {mat && (
        <Row
          label="의무가입 만료 (3년)"
          value={mat.date}
          progress={mat.elapsed}
          sub={mat.days > 0 ? `D-${mat.days} · 만료 전 해지하면 비과세 혜택이 사라져요` : "만료됨 · 해지·연장·연금 이전 가능"}
        />
      )}
      <Row
        label="비과세 한도"
        value={num(s.taxFree) != null ? fmtMoney(num(s.taxFree), "KRW") : "-"}
        progress={gainKRW != null && gainKRW > 0 && num(s.taxFree) ? gainKRW / num(s.taxFree)! : 0}
        sub={gainKRW != null ? `국내 상장 보유분 평가이익 ${fmtMoney(gainKRW, "KRW")}` : undefined}
      />

      {!editing && missing && (
        <Press pressedBg={false} style={styles.cta} onPress={() => setEditing(true)} accessibilityRole="button" accessibilityLabel="ISA 정보 입력하기">
          <Text style={styles.ctaText}>ISA 정보 입력하기</Text>
        </Press>
      )}

      {editing ? (
        <View style={styles.form}>
          <Field label="가입일 (YYYY-MM-DD)" value={s.joinDate} onChange={(v) => setS({ ...s, joinDate: v })} />
          <Field label="월 적립금 (원, 분할매수 금액 계산)" value={s.monthly ?? ""} onChange={(v) => setS({ ...s, monthly: v })} numeric />
          <Field label="올해 납입액 (원)" value={s.paidThisYear} onChange={(v) => setS({ ...s, paidThisYear: v })} numeric />
          <Field label="누적 납입액 (원)" value={s.paidTotal} onChange={(v) => setS({ ...s, paidTotal: v })} numeric />
          <Field label="연 납입한도 (원)" value={s.annualLimit} onChange={(v) => setS({ ...s, annualLimit: v })} numeric />
          <Field label="총 납입한도 (원)" value={s.totalLimit} onChange={(v) => setS({ ...s, totalLimit: v })} numeric />
          <Field label="비과세 한도 (원)" value={s.taxFree} onChange={(v) => setS({ ...s, taxFree: v })} numeric />
          <Press pressedBg={false} style={styles.saveBtn} onPress={save} accessibilityRole="button" accessibilityLabel="ISA 설정 저장">
            <Text style={styles.saveText}>저장</Text>
          </Press>
        </View>
      ) : (
        !missing && (
          <Press onPress={() => setEditing(true)} hitSlop={10} style={styles.editLink} accessibilityRole="button" accessibilityLabel="ISA 설정 편집">
            <Text style={styles.editText}>설정 편집</Text>
          </Press>
        )
      )}

      <Collapsible title="만기 · 세제 · 개편안" preview="안내">
        <Text style={styles.note}>
          손익을 합산해 해지 때 과세하고, 비과세 한도를 넘는 이익은 9.9% 분리과세예요. 만기 60일 안에 연금저축·IRP로 옮기면 이전액의
          10%(최대 300만 원)를 추가로 세액공제받아요.
        </Text>
        <Text style={styles.note}>
          기본 한도는 현행 기준이에요. 2026년 세제개편안(연 4천만·총 2억·비과세 500만)은 시행이 확정되지 않았으니 KB증권 앱에서
          본인 계좌 한도를 확인하고 설정에서 바꾸세요.
        </Text>
      </Collapsible>
    </View>
  );
}

function Row({ label, value, sub, progress }: { label: string; value: string; sub?: string; progress?: number }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label} ${value}${sub ? `, ${sub}` : ""}`}>
      <View style={styles.rowTop}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.value, !/\d/.test(value) && styles.valueText]}>{value}</Text>
      </View>
      {progress != null && (
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.max(0, Math.min(1, progress)) * 100}%` }]} />
        </View>
      )}
      {!!sub && <Text style={styles.sub}>{sub}</Text>}
    </View>
  );
}

function Field({ label, value, onChange, numeric }: { label: string; value: string; onChange: (v: string) => void; numeric?: boolean }) {
  return (
    <View style={{ marginTop: space.sm }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, numeric && styles.numInput]}
        value={value}
        onChangeText={onChange}
        keyboardType={numeric ? "number-pad" : "numbers-and-punctuation"}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { ...type.section },
  desc: { ...type.caption, color: colors.textMuted, marginTop: space.xs, marginBottom: space.sm },
  cta: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: space.lg },
  ctaText: { fontFamily: fonts.sansBold, fontSize: 15, color: colors.onAccent },
  row: { paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  label: { ...type.body, fontSize: 13, color: colors.textMuted },
  value: { ...type.numStrong, fontSize: 13, color: colors.text, textAlign: "right" },
  valueText: { fontFamily: fonts.sansMedium },
  planRow: { flexDirection: "row", alignItems: "center", paddingVertical: space.sm, gap: space.sm },
  planName: { ...type.body, fontFamily: fonts.sansBold, fontSize: 14, color: colors.text },
  planState: { ...type.caption, color: colors.textMuted },
  planBuy: { color: colors.accent, fontFamily: fonts.sansBold },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.hairline, marginTop: space.sm, overflow: "hidden" },
  fill: { height: 4, borderRadius: 2, backgroundColor: colors.text },
  sub: { ...type.caption, color: colors.textMuted, marginTop: space.xs, lineHeight: 16 },
  note: { ...type.caption, color: colors.textMuted, marginTop: space.md, lineHeight: 17 },
  editLink: { marginTop: space.md, alignSelf: "flex-start" },
  editText: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.accent },
  form: { marginTop: space.sm },
  fieldLabel: { ...type.caption, color: colors.textMuted, marginBottom: space.xs },
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
  saveBtn: { backgroundColor: colors.accent, borderRadius: 8, paddingVertical: space.md, alignItems: "center", marginTop: space.md },
  saveText: { fontFamily: fonts.sansBold, color: colors.onAccent, fontSize: 14 },
});
