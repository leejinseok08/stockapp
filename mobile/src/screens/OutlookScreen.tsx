import { Feather } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useState } from "react";
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { Press } from "../components/motion";
import { md, slotLabel } from "../components/OutlookSection";
import { Band, Section, ToneTag } from "../components/ui";
import { outlookTone } from "../signal";
import { colors, fonts, radius, space, tones, type } from "../theme";
import type { OutlookHouse, OutlookTone, RootStackParamList } from "../types";

const SHORT: Record<string, string> = { 한국은행: "한은", 골드만삭스: "골드만" };
const SHOWN_POINTS = 3;

// The latest view in full (redesign O1-O6), glance first: the call, a headline and the six houses'
// tones as one strip; then why (three lines, more on tap), three key points, the ISA line, each house
// as one line that opens to its explanation and sources, and the next dated events.
export default function OutlookScreen({ route }: NativeStackScreenProps<RootStackParamList, "Outlook">) {
  const o = route.params.outlook;
  const [reasonOpen, setReasonOpen] = useState(false);
  const [allPoints, setAllPoints] = useState(false);
  const counts = (["긍정", "중립", "신중"] as OutlookTone[])
    .map((t) => [t, o.houses.filter((h) => h.tone === t).length] as const)
    .filter(([, n]) => n > 0);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: space.xxl * 2 }}>
      {/* O1 */}
      <View style={styles.head}>
        <View style={styles.headTop}>
          <ToneTag tone={outlookTone(o.stance)} label={o.stance} size="lg" />
          <Text style={styles.stamp}>{slotLabel(o.slot)} 업데이트</Text>
        </View>
        <Text style={styles.headline}>{o.headline}</Text>
        <View style={styles.strip} accessible accessibilityLabel={`기관 톤: ${counts.map(([t, n]) => `${t} ${n}`).join(", ")}`}>
          {o.houses.map((h) => {
            const t = tones[h.tone ? outlookTone(h.tone) : "neutral"];
            return (
              <View key={h.id} style={[styles.stripCell, { backgroundColor: h.tone ? t.soft : colors.surface }]}>
                <View style={[styles.stripDot, { backgroundColor: h.tone ? t.fg : colors.hairline }]} />
                <Text style={styles.stripName} numberOfLines={1}>
                  {SHORT[h.name] ?? h.name}
                </Text>
              </View>
            );
          })}
        </View>
        <Text style={styles.counts}>{counts.map(([t, n]) => `${t} ${n}`).join(" · ")}</Text>
        {o.past.length > 0 && (
          <View style={styles.trail} accessibilityLabel={`최근 판단 ${o.past.map((p) => p.stance).join(", ")}, 지금 ${o.stance}`}>
            {[...o.past, { slot: o.slot, stance: o.stance }].map((p) => (
              <View key={p.slot} style={styles.trailItem}>
                <View style={[styles.trailDot, { backgroundColor: tones[outlookTone(p.stance)].fg }]} />
                <Text style={styles.trailText}>{md(p.slot)}</Text>
                <Text style={styles.trailText}>{p.slot.endsWith("-am") ? "오전" : "밤"}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <Band />

      {/* O2 */}
      {!!o.reason && (
        <Section title={`왜 ${o.stance}인가`}>
          <Text style={styles.body} numberOfLines={reasonOpen ? undefined : 3}>
            {o.reason}
          </Text>
          <Press
            onPress={() => setReasonOpen(!reasonOpen)}
            pressedBg={false}
            hitSlop={8}
            style={styles.moreLink}
            accessibilityRole="button"
            accessibilityLabel={reasonOpen ? "접기" : "판단 이유 더보기"}
          >
            <Text style={styles.moreText}>{reasonOpen ? "접기" : "더보기"}</Text>
          </Press>
        </Section>
      )}

      {/* O3 */}
      <Section title={`핵심 ${Math.min(o.points.length, SHOWN_POINTS)}가지`}>
        {(allPoints ? o.points : o.points.slice(0, SHOWN_POINTS)).map((p, i) => (
          <View key={i} style={styles.point}>
            <Text style={styles.pointNum}>{i + 1}</Text>
            <Text style={styles.pointText}>{p}</Text>
          </View>
        ))}
        {o.points.length > SHOWN_POINTS && (
          <Press
            onPress={() => setAllPoints(!allPoints)}
            pressedBg={false}
            hitSlop={8}
            style={styles.moreLink}
            accessibilityRole="button"
            accessibilityLabel={allPoints ? "접기" : `${o.points.length - SHOWN_POINTS}개 더 보기`}
          >
            <Text style={styles.moreText}>{allPoints ? "접기" : `${o.points.length - SHOWN_POINTS}개 더 보기`}</Text>
          </Press>
        )}
        {/* O5 */}
        <View style={styles.isa}>
          <View style={styles.isaBadge}>
            <Text style={styles.isaBadgeText}>ISA</Text>
          </View>
          <Text style={styles.isaText}>{o.isa}</Text>
        </View>
      </Section>

      {/* O4 */}
      <Section title="기관별" desc="원문 = 기관 공개 자료 · 보도 = 유료 리서치의 언론 인용">
        {o.houses.map((h) => (
          <House key={h.id} house={h} />
        ))}
      </Section>

      {/* O6 */}
      {o.watch.length > 0 && (
        <Section title="다가오는 일정">
          {o.watch.map((w, i) => (
            <View key={i} style={styles.event}>
              <View style={styles.dateChip}>
                <Text style={styles.dateText}>{md(w.date)}</Text>
              </View>
              <Text style={styles.eventText}>{w.event}</Text>
            </View>
          ))}
        </Section>
      )}
      <Text style={styles.footnote}>{o.author === "codex" ? "Codex" : "Claude"} 정리 · 참고용, 투자 권유 아님</Text>
    </ScrollView>
  );
}

function House({ house }: { house: OutlookHouse }) {
  const [open, setOpen] = useState(false);
  const quiet = house.tone == null;
  return (
    <View style={styles.house}>
      <Press
        onPress={() => setOpen(!open)}
        disabled={quiet}
        pressedBg={false}
        style={styles.houseHead}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${house.name} ${house.tone ?? "자료 없음"}. ${house.summary}. ${quiet ? "" : open ? "접기" : "자세히"}`}
      >
        <View style={{ flex: 1 }}>
          <View style={styles.houseTitle}>
            <Text style={[styles.houseName, quiet && styles.muted]}>{house.name}</Text>
            {house.tone ? <ToneTag tone={outlookTone(house.tone)} label={house.tone} /> : <Text style={styles.quiet}>최근 자료 없음</Text>}
            {house.new && <Text style={styles.fresh}>새 소식</Text>}
          </View>
          {!quiet && (
            <Text style={styles.summary} numberOfLines={open ? undefined : 1}>
              {house.summary}
            </Text>
          )}
        </View>
        {!quiet && <Feather name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.textMuted} />}
      </Press>
      {open && (
        <View style={styles.houseBody}>
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
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  head: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.xl, gap: space.md },
  headTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headline: { fontFamily: fonts.sansBold, fontSize: 20, lineHeight: 28, color: colors.text },
  stamp: { ...type.num, fontSize: 11, color: colors.textMuted },
  strip: { flexDirection: "row", gap: 6 },
  stripCell: { flex: 1, alignItems: "center", gap: 4, borderRadius: 10, paddingVertical: 8 },
  stripDot: { width: 8, height: 8, borderRadius: 4 },
  stripName: { fontFamily: fonts.sansMedium, fontSize: 11, color: colors.text },
  counts: { ...type.caption, color: colors.textMuted, marginTop: -4 },
  trail: { flexDirection: "row", gap: space.md },
  trailItem: { alignItems: "center", gap: 2 },
  trailDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 2 },
  trailText: { ...type.num, fontSize: 10, color: colors.textMuted },
  body: { ...type.body, fontSize: 15, lineHeight: 24, color: colors.text },
  moreLink: { alignSelf: "flex-start", marginTop: space.sm },
  moreText: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.textMuted },
  point: { flexDirection: "row", gap: 10, paddingVertical: 4 },
  pointNum: { ...type.numStrong, fontSize: 14, color: colors.textMuted, width: 12 },
  pointText: { flex: 1, ...type.body, fontSize: 14, lineHeight: 21, color: colors.text },
  isa: { flexDirection: "row", gap: space.md, backgroundColor: colors.surface, borderRadius: 14, padding: space.lg, marginTop: space.lg },
  isaBadge: { backgroundColor: colors.hairline, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start" },
  isaBadgeText: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.text },
  isaText: { flex: 1, ...type.body, fontSize: 13, lineHeight: 20, color: colors.text },
  house: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  houseHead: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: 14 },
  houseTitle: { flexDirection: "row", alignItems: "center", gap: space.sm },
  houseName: { fontFamily: fonts.sansBold, fontSize: 15, color: colors.text },
  muted: { color: colors.textMuted },
  quiet: { ...type.caption, color: colors.textMuted },
  fresh: { fontFamily: fonts.sansBold, fontSize: 11, color: colors.text },
  summary: { ...type.caption, fontSize: 13, color: colors.textMuted, marginTop: 4 },
  houseBody: { paddingBottom: space.md },
  detail: { ...type.body, fontSize: 13, lineHeight: 20, color: colors.text },
  source: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: 6, marginTop: 2, borderRadius: radius.sm },
  access: { fontFamily: fonts.sansMedium, fontSize: 10, color: colors.textMuted, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.textMuted, borderRadius: radius.sm, paddingHorizontal: 5, paddingVertical: 1 },
  accessOrig: { color: colors.text, borderColor: colors.text },
  sourceTitle: { flex: 1, ...type.caption, fontSize: 12, color: colors.text },
  event: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: 6 },
  dateChip: { width: 64, alignItems: "center", backgroundColor: colors.surface, borderRadius: 10, paddingVertical: 6 },
  dateText: { ...type.numStrong, fontSize: 13, color: colors.text },
  eventText: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 14, color: colors.text },
  footnote: { ...type.caption, color: colors.textMuted, paddingHorizontal: space.lg, marginTop: space.xl },
});
