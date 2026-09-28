import { Feather } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React from "react";
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { md, slotLabel } from "../components/OutlookSection";
import { Section, ToneTag } from "../components/ui";
import { outlookTone } from "../signal";
import { colors, fonts, radius, space, tones, type } from "../theme";
import type { OutlookHouse, RootStackParamList } from "../types";
import { Press } from "../components/motion";

// The latest view in full (opened from the 시장 tab card): why the overall tone, the key points, each
// house's one-line summary + explanation + sources, and next week's events. Detail pages may carry
// paragraphs; the tabs stay one line per item (DESIGN.md).
export default function OutlookScreen({ route }: NativeStackScreenProps<RootStackParamList, "Outlook">) {
  const o = route.params.outlook;
  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: space.xxl * 2 }}>
      <View style={styles.head}>
        <View style={styles.headTop}>
          <ToneTag tone={outlookTone(o.stance)} label={o.stance} size="lg" />
          <Text style={styles.stamp}>
            {slotLabel(o.slot)} 업데이트
          </Text>
        </View>
        <Text style={styles.headline}>{o.headline}</Text>
        {o.past.length > 0 && (
          <View style={styles.trail} accessibilityLabel={`최근 판단 ${o.past.map((p) => p.stance).join(", ")}, 지금 ${o.stance}`}>
            {[...o.past, { slot: o.slot, stance: o.stance }].map((p) => (
              <View key={p.slot} style={styles.trailItem}>
                <View style={[styles.trailDot, { backgroundColor: tones[outlookTone(p.stance)].fg }]} />
                <Text style={styles.trailWeek}>{md(p.slot)}</Text>
                <Text style={styles.trailWeek}>{p.slot.endsWith("-am") ? "오전" : "밤"}</Text>
              </View>
            ))}
          </View>
        )}
        {!!o.reason && <Text style={styles.body}>{o.reason}</Text>}
      </View>

      <Section title="핵심">
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
      </Section>

      <Section title="기관별" desc="원문 = 기관 공개 자료 · 보도 = 유료 리서치의 언론 인용">
        {o.houses.map((h) => (
          <House key={h.id} house={h} />
        ))}
      </Section>

      {o.watch.length > 0 && (
        <Section title="다가오는 일정">
          {o.watch.map((w, i) => (
            <View key={i} style={styles.watchRow}>
              <Text style={styles.watchDate}>{md(w.date)}</Text>
              <Text style={styles.pointText}>{w.event}</Text>
            </View>
          ))}
        </Section>
      )}
      <Text style={styles.footnote}>{o.author === "codex" ? "Codex" : "Claude"} 정리 · 참고용, 투자 권유 아님</Text>
    </ScrollView>
  );
}

function House({ house }: { house: OutlookHouse }) {
  const quiet = house.tone == null;
  return (
    <View style={styles.house}>
      <View style={styles.houseTop}>
        <Text style={[styles.houseName, quiet && styles.muted]}>{house.name}</Text>
        {house.tone ? <ToneTag tone={outlookTone(house.tone)} label={house.tone} /> : <Text style={styles.quiet}>최근 자료 없음</Text>}
        {house.new && <Text style={styles.fresh}>새 소식</Text>}
      </View>
      {!quiet && (
        <>
          <Text style={styles.summary}>{house.summary}</Text>
          {!!house.detail && <Text style={styles.detail}>{house.detail}</Text>}
          {house.sources.map((s) => (
            <Press
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
            </Press>
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  head: { paddingHorizontal: space.lg, paddingTop: space.md },
  headTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headline: { fontFamily: fonts.sansBold, fontSize: 20, lineHeight: 28, color: colors.text, marginTop: space.md },
  stamp: { ...type.num, fontSize: 11, color: colors.textMuted },
  trail: { flexDirection: "row", gap: space.md, marginTop: space.md },
  trailItem: { alignItems: "center", gap: 4 },
  trailDot: { width: 10, height: 10, borderRadius: 5 },
  trailWeek: { ...type.num, fontSize: 10, lineHeight: 13, color: colors.textMuted, textAlign: "center" },
  body: { ...type.body, fontSize: 15, lineHeight: 24, color: colors.text, marginTop: space.lg },
  point: { flexDirection: "row", paddingVertical: 3 },
  bullet: { width: 14, ...type.body, color: colors.textMuted },
  pointText: { flex: 1, ...type.body, fontSize: 14, lineHeight: 21, color: colors.text },
  isa: { flexDirection: "row", alignItems: "baseline", gap: space.sm, marginTop: space.md },
  isaLabel: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.textMuted, width: 26 },
  house: { paddingVertical: space.md },
  houseTop: { flexDirection: "row", alignItems: "center", gap: space.sm },
  houseName: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.text },
  muted: { color: colors.textMuted },
  quiet: { ...type.caption, color: colors.textMuted },
  fresh: { fontFamily: fonts.sansBold, fontSize: 11, color: colors.text },
  summary: { fontFamily: fonts.sansBold, fontSize: 14, lineHeight: 21, color: colors.text, marginTop: space.sm },
  detail: { ...type.body, fontSize: 14, lineHeight: 22, color: colors.textMuted, marginTop: space.xs },
  source: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: 6, marginTop: 2 },
  access: { fontFamily: fonts.sansMedium, fontSize: 10, color: colors.textMuted, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.textMuted, borderRadius: radius.sm, paddingHorizontal: 5, paddingVertical: 1 },
  accessOrig: { color: colors.text, borderColor: colors.text },
  sourceTitle: { flex: 1, ...type.caption, fontSize: 12, color: colors.text },
  watchRow: { flexDirection: "row", paddingVertical: 4 },
  watchDate: { ...type.num, fontSize: 13, color: colors.textMuted, width: 44 },
  footnote: { ...type.caption, color: colors.textMuted, paddingHorizontal: space.lg, marginTop: space.xl },
});
