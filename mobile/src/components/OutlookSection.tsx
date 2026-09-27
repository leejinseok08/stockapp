import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts, radius, space, type } from "../theme";
import type { Outlook, OutlookHouse } from "../types";

type Ready = Extract<Outlook, { available: true }>;

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

// The week's view from six houses (backend/app/services/outlook.py). One summary block, then each
// house in a line with its sources on demand. Tone words stay neutral in color: red/blue mean up/down.
export function OutlookSection({ outlook }: { outlook: Outlook }) {
  if (!outlook.available) {
    return <Text style={styles.note}>첫 주간 시황은 토요일 오전에 올라와요.</Text>;
  }
  const o = outlook;
  return (
    <View>
      <View style={styles.summary}>
        <View style={styles.summaryTop}>
          <Tone tone={o.stance} strong />
          <Text style={styles.stamp}>{md(o.asOf)} 기준 · {o.week.slice(5)}</Text>
        </View>
        <Text style={styles.headline}>{o.headline}</Text>
        {o.past.length > 0 && (
          <Text style={styles.trail}>
            {o.past.map((p) => `${p.week.slice(5)} ${p.stance}`).join(" → ")} → 이번 주 {o.stance}
          </Text>
        )}
      </View>

      {o.points.map((p, i) => (
        <View key={i} style={styles.point}>
          <Text style={styles.bullet}>·</Text>
          <Text style={styles.pointText}>{p}</Text>
        </View>
      ))}
      <View style={styles.isa}>
        <Text style={styles.isaLabel}>ISA</Text>
        <Text style={styles.pointText}>{o.isa}</Text>
      </View>

      <Text style={styles.group}>기관별</Text>
      {o.houses.map((h) => (
        <HouseRow key={h.id} house={h} />
      ))}

      {o.watch.length > 0 && (
        <>
          <Text style={styles.group}>다음 주 일정</Text>
          {o.watch.map((w, i) => (
            <View key={i} style={styles.watchRow}>
              <Text style={styles.watchDate}>{md(w.date)}</Text>
              <Text style={styles.pointText}>{w.event}</Text>
            </View>
          ))}
        </>
      )}
      <Text style={styles.legend}>
        원문 = 기관 공개 자료 · 보도 = 유료 리서치의 언론 인용 · {o.author === "codex" ? "Codex" : "Claude"} 정리
      </Text>
    </View>
  );
}

function HouseRow({ house }: { house: OutlookHouse }) {
  const [open, setOpen] = useState(false);
  const quiet = house.tone == null;
  return (
    <View style={styles.house}>
      <Pressable
        onPress={() => setOpen(!open)}
        disabled={quiet}
        accessibilityRole="button"
        accessibilityLabel={`${house.name} ${house.tone ?? "새 자료 없음"}. ${house.view}. ${quiet ? "" : open ? "출처 접기" : "출처 보기"}`}
        style={styles.houseTop}
      >
        <View style={{ flex: 1 }}>
          <View style={styles.houseTitle}>
            <Text style={[styles.houseName, quiet && styles.muted]}>{house.name}</Text>
            {house.tone && <Tone tone={house.tone} />}
          </View>
          <Text style={styles.view}>{house.view}</Text>
        </View>
        {!quiet && <Feather name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.textMuted} />}
      </Pressable>
      {open &&
        house.sources.map((s) => (
          <Pressable
            key={s.url}
            onPress={() => Linking.openURL(s.url)}
            accessibilityRole="link"
            accessibilityLabel={`${s.access} ${s.title} ${s.date}`}
            style={styles.source}
            hitSlop={6}
          >
            <Text style={[styles.access, s.access === "원문" && styles.accessOrig]}>{s.access}</Text>
            <Text style={styles.sourceTitle} numberOfLines={2}>
              {s.title} <Text style={styles.stamp}>{md(s.date)}</Text>
            </Text>
            <Feather name="external-link" size={13} color={colors.textMuted} />
          </Pressable>
        ))}
    </View>
  );
}

function Tone({ tone, strong }: { tone: string; strong?: boolean }) {
  return (
    <View style={[styles.tone, strong && styles.toneStrong]}>
      <Text style={[styles.toneText, strong && styles.toneTextStrong]}>{tone}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  note: { ...type.body, fontSize: 13, color: colors.textMuted },
  summary: { backgroundColor: colors.surface, borderRadius: radius.md, padding: space.lg, marginBottom: space.md },
  summaryTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headline: { fontFamily: fonts.sansBold, fontSize: 17, lineHeight: 24, color: colors.text, marginTop: space.sm },
  trail: { ...type.caption, color: colors.textMuted, marginTop: space.sm },
  stamp: { ...type.num, fontSize: 11, color: colors.textMuted },
  point: { flexDirection: "row", paddingVertical: 3 },
  bullet: { width: 14, ...type.body, color: colors.textMuted },
  pointText: { flex: 1, ...type.body, fontSize: 14, lineHeight: 21, color: colors.text },
  isa: { flexDirection: "row", alignItems: "baseline", gap: space.sm, marginTop: space.sm },
  isaLabel: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.textMuted, width: 26 },
  group: { ...type.caption, fontFamily: fonts.sansMedium, color: colors.textMuted, marginTop: space.xl, marginBottom: space.xs },
  house: { paddingVertical: space.sm },
  houseTop: { flexDirection: "row", alignItems: "center", gap: space.sm },
  houseTitle: { flexDirection: "row", alignItems: "center", gap: space.sm },
  houseName: { ...type.body, fontFamily: fonts.sansBold, color: colors.text },
  muted: { color: colors.textMuted, fontFamily: fonts.sansMedium },
  view: { ...type.caption, fontSize: 13, lineHeight: 19, color: colors.textMuted, marginTop: 2 },
  source: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: 6, paddingLeft: space.xs },
  access: { fontFamily: fonts.sansMedium, fontSize: 10, color: colors.textMuted, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.textMuted, borderRadius: radius.sm, paddingHorizontal: 5, paddingVertical: 1 },
  accessOrig: { color: colors.text, borderColor: colors.text },
  sourceTitle: { flex: 1, ...type.caption, fontSize: 12, color: colors.text },
  tone: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: colors.surface },
  toneStrong: { backgroundColor: colors.background, paddingHorizontal: 12, paddingVertical: 4 },
  toneText: { fontFamily: fonts.sansMedium, fontSize: 11, color: colors.text },
  toneTextStrong: { fontFamily: fonts.sansBold, fontSize: 14 },
  watchRow: { flexDirection: "row", paddingVertical: 4 },
  watchDate: { ...type.num, fontSize: 13, color: colors.textMuted, width: 44 },
  legend: { ...type.caption, color: colors.textMuted, marginTop: space.md, lineHeight: 17 },
});
