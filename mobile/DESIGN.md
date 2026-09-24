# StockApp Design System

Every UI change should follow this file. References it was built from:
[ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) (fintech design-system search, React Native stack rules, chart guidance) and
[design-for-ai](https://github.com/ryanthedev/design-for-ai) (AI-tell avoidance, data-viz principles: Tufte, Cleveland & McGill, Cairo).

## Direction: "quiet trading ledger"

A personal instrument panel for reading numbers, not a marketing app. It should feel like a calm
terminal ledger: numbers first, hairline rules instead of boxes, one warm accent, nothing decorative.
Someone could disagree with this direction (it is deliberately dense and austere), which is the point.

**Why dark:** the app is checked often, often at night/pre-market, and is number-dense. Dark is a
decision tied to use context, not a default.

## Typography

| Role | Font | Why |
|---|---|---|
| UI text (Korean + Latin) | IBM Plex Sans KR | Engineering heritage fits a semiconductor/quant tool; full Hangul support. Not Inter/Roboto (the default-font tell). |
| All numbers | IBM Plex Mono, `tabular-nums` | Columns of prices line up digit-for-digit, so changes are scannable. |

Hierarchy comes from weight and size first, color last. Use `type.*` tokens from `src/theme.ts`.

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

- Rows separated by hairlines, not cards. At most **one** filled block (`surface`) per screen, for the single most important number (e.g. portfolio P/L; one block per currency, since KRW and USD are never summed). Never nest cards.

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

Inter/Roboto, purple/indigo gradients, cyan-on-dark, card grids of identical boxes, nested cards,
emoji icons, gradient text on numbers, smoothed financial lines, color-only up/down.
