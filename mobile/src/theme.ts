// Design tokens — see DESIGN.md for the rationale behind each choice.

export const colors = {
  background: "#0B0D10",
  surface: "#15181C",
  hairline: "#23272E",
  border: "#23272E",
  text: "#ECEDEE",
  textMuted: "#8A919B",
  // Korean market convention: red = 상승, blue = 하락. Always paired with ▲/▼.
  up: "#F0524F",
  down: "#5B8DEF",
  flat: "#8A919B",
  accent: "#E8A33D",
  onAccent: "#1A1204",
  accentSoft: "#2A2112",
  // Tinted backgrounds for change pills (same hues as up/down, low alpha over the background).
  upSoft: "#2B1618",
  downSoft: "#16203A",
  // Thick band between sections (Toss-style grouping instead of a hairline under every row).
  band: "#060708",
  // Pressed rows/cards (one step lighter than surface) and loading placeholders.
  pressed: "#1E2227",
  skeleton: "#1A1D22",
};

// Signal scale (DESIGN.md "Signals"): every signal in the app maps to one of three tones, so the
// same meaning always has the same color. Owner's choice (2026-09-27): traffic light. Red here means
// caution; price moves still always carry ▲/▼ so a red price and a red signal never read alike alone.
export type Tone = "good" | "neutral" | "caution";
export const tones: Record<Tone, { fg: string; soft: string; word: string }> = {
  good: { fg: "#3DBE7B", soft: "#10261B", word: "긍정" },
  neutral: { fg: "#8A919B", soft: "#1C2026", word: "중립" },
  caution: { fg: "#F0524F", soft: "#2B1618", word: "신중" },
};

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };

export const fonts = {
  sans: "IBMPlexSansKR_400Regular",
  sansMedium: "IBMPlexSansKR_500Medium",
  sansBold: "IBMPlexSansKR_700Bold",
  mono: "IBMPlexMono_400Regular",
  monoMedium: "IBMPlexMono_500Medium",
  monoBold: "IBMPlexMono_600SemiBold",
};

// Tight inside a group, generous between groups.
export const space = { xs: 4, sm: 8, md: 12, lg: 20, xl: 28, xxl: 36 };

export const type = {
  // Big numbers read like Toss: bold sans, tabular so they don't jiggle as they update.
  display: { fontFamily: fonts.sansBold, fontSize: 28, letterSpacing: -0.5, fontVariant: ["tabular-nums" as const] },
  hero: { fontFamily: fonts.sansBold, fontSize: 34, letterSpacing: -0.8, fontVariant: ["tabular-nums" as const] },
  title: { fontFamily: fonts.sansBold, fontSize: 24, letterSpacing: -0.4 },
  section: { fontFamily: fonts.sansBold, fontSize: 19, letterSpacing: -0.3, color: colors.text },
  body: { fontFamily: fonts.sans, fontSize: 15 },
  caption: { fontFamily: fonts.sans, fontSize: 12 },
  num: { fontFamily: fonts.mono, fontVariant: ["tabular-nums" as const] },
  numStrong: { fontFamily: fonts.monoMedium, fontVariant: ["tabular-nums" as const] },
};

export function trendColor(v: number | null | undefined): string {
  if (v == null || v === 0) return colors.flat;
  return v > 0 ? colors.up : colors.down;
}

export function trendGlyph(v: number | null | undefined): string {
  if (v == null || v === 0) return "";
  return v > 0 ? "▲" : "▼";
}
