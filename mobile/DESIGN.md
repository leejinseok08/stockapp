# StockApp Design System

Every UI change should follow this file. References it was built from:
[ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) (fintech design-system search, React Native stack rules, chart guidance) and
[design-for-ai](https://github.com/ryanthedev/design-for-ai) (AI-tell avoidance, data-viz principles: Tufte, Cleveland & McGill, Cairo).

## Direction: Toss-style clarity on the app's own dark palette (2026-09-25)

Layout, type and component shapes follow Toss Securities (reference: wwit.design/2021/02/16/toss):
big bold titles, generous spacing, content grouped into sections separated by a thick band instead
of a hairline under every row, round logo avatars, change shown as a tinted pill, pill-shaped chips
for choices. **Colors stay as below** (dark background, red up / blue down, amber accent).

**Why dark:** the app is checked often, often at night/pre-market, and is number-dense.

## Typography

| Role | Font | Why |
|---|---|---|
| UI text and big numbers (prices, scores) | IBM Plex Sans KR, bold for headlines, `tabular-nums` | Toss reads numbers as headlines, not as code. |
| Small numbers in tables and rows | IBM Plex Mono, `tabular-nums` | Columns still line up digit-for-digit. |

Tokens: `type.hero` (price), `type.title` (screen title), `type.section` (bold section title), `type.body`, `type.caption`.

## Components (`src/components/ui.tsx`)

- `Section` — bold title + one-line description; draws the band above itself unless `first`.
- `ChangePill` — "▲ 1.25%" on `upSoft`/`downSoft`; the glyph stays so direction is never color alone.
- `Avatar` — company logo in a circle (Naver Securities image, `get_logo`); first letter(s) of the name when there is none.
- `Chips` — pill chips for ranges, sorts and toggles; the selected one is filled with `surface`.
- Descriptions are one line: what the thing is and what it's for. No explanatory paragraphs on screen;
  details belong in `docs/`.

## Color

| Token | Hex | Meaning |
|---|---|---|
| `background` | #0B0D10 | App background |
| `surface` | #15181C | Inputs, the one dominant summary block per screen |
| `hairline` | #23272E | Row separators |
| `text` / `textMuted` | #ECEDEE / #8A919B | Primary / secondary text |
| `up` | #F0524F | 상승 (Korean convention: red is up) |
| `down` | #5B8DEF | 하락 (blue is down) |
| `accent` | #E8A33D | Actions and selection only. Never used for up/down. |

Rules:
- Up/down is **never color alone**: always pair with ▲/▼ (`trendGlyph`). Red/blue is also safer than red/green for color-vision deficiency.
- The accent marks what you can press or what is selected. Price lines are neutral (`text`), so the accent never implies a direction.

## Layout

- Sections are separated by a thick `band`; rows inside a section are separated by spacing, not lines (tables may keep hairlines). Never nest cards.

## Numbers and currency

- Prices keep their listing currency: KRW has no decimals (`256,000`), USD has two (`182.40`). Use `fmtPrice`.
- Compact amounts: KRW reads in 억/조, other currencies in K/M/B/T with a symbol. Use `fmtMoney`. Never label a USD value with 조.
- Never add or rank amounts across currencies without converting; when ranking, normalize to USD and say so on screen.
- "Current price" always comes from the live quote, so every screen shows the same P/L.
- Left-align text and labels; right-align numbers. Center only empty states.
- Spacing: tight inside a group (`xs`/`sm`), generous between groups (`xl`/`xxl`).
- Home stays a list. Secondary features open from header icon buttons (overview first, detail on demand).

## Data visualization

- Line charts are **not smoothed** (bezier interpolation invents prices that never traded).
- Label series directly on or next to the chart instead of a separate legend where possible.
- No gradients, shadows, or fills that encode nothing (data-ink ratio).
- Radar chart is for the at-a-glance shape only; the exact scores are always shown as bars (position on a common scale is the most accurate encoding).
- A KPI is always shown with its baseline (e.g. P/L next to cost basis).

## Interaction and accessibility

- Icons: Feather (`@expo/vector-icons`), line style. **No emoji as icons.**
- Every `Pressable` has `accessibilityRole` and `accessibilityLabel`; small targets get `hitSlop` so the touch area is at least 44pt.
- Motion: subtle only (≤250ms), nothing that loops.

## Anti-patterns (don't ship)

Inter/Roboto, purple/indigo gradients, cyan-on-dark, nested cards, emoji icons, gradient text on
numbers, smoothed financial lines, color-only up/down, paragraphs of explanation on screen.
