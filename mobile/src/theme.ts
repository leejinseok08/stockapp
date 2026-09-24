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
};

export const fonts = {
  sans: "IBMPlexSansKR_400Regular",
  sansMedium: "IBMPlexSansKR_500Medium",
  sansBold: "IBMPlexSansKR_700Bold",
  mono: "IBMPlexMono_400Regular",
  monoMedium: "IBMPlexMono_500Medium",
  monoBold: "IBMPlexMono_600SemiBold",
};

// Tight inside a group, generous between groups.
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const type = {
  display: { fontFamily: fonts.monoBold, fontSize: 28, letterSpacing: -0.5 },
  title: { fontFamily: fonts.sansBold, fontSize: 20 },
  section: { fontFamily: fonts.sansMedium, fontSize: 12, letterSpacing: 0.5, color: colors.textMuted },
  body: { fontFamily: fonts.sans, fontSize: 14 },
  caption: { fontFamily: fonts.sans, fontSize: 11 },
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
