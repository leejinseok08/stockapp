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

| `tones.good` / `neutral` / `caution` | #3DBE7B / #8A919B / #F0524F | Signal scale (below) |

## Signals (owner, 2026-09-27)

Every signal uses one three-step scale, so the same meaning always has the same color. The mapping
lives only in `src/signal.ts`; screens never pick a signal color themselves.

| Tone | Color | Signals |
|---|---|---|
| good | green | BUY, 매수, 시황 긍정, 시장 온도 조정·공포 |
| neutral | gray | 보유, 관망, 중립, 시장 온도 보통, 위험 게이지 평상 |
| caution | red | SELL, 매도, 시황 신중, 시장 온도 과열, 위험 게이지 관찰·경계 |

- Shown as `ToneTag` (dot + word on the tone's tint) or the word in the tone's color; the word is always
  there. Red is shared with price-up by the owner's choice (traffic light); prices always carry ▲/▼,
  signals never do, which keeps them apart.
- Glance first, detail on tap: a tab shows the signal as one color and one line; the explanation opens
  on its own screen (e.g. 시장 → 이번 주 시황 → OutlookScreen). Detail screens may use paragraphs.

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
- Radar chart is for the at-a-glance shape only; the exact scores are always shown next to it (snowflake: 6 pips per axis, each check with its filed number).
- Price charts have a touch/hover crosshair: vertical rule, dot on the line, one tooltip with date, close and the average line.
- Estimated values (e.g. next ex-dividend date inferred from past intervals) are labeled "예상".
- A KPI is always shown with its baseline (e.g. P/L next to cost basis).

## Interaction and accessibility

- Icons: Feather (`@expo/vector-icons`), line style. **No emoji as icons.**
- Every `Pressable` has `accessibilityRole` and `accessibilityLabel`; small targets get `hitSlop` so the touch area is at least 44pt.
- Motion: subtle only (≤250ms). The one loop is the skeleton pulse, and only while loading.
- Every tappable thing is a `Press` (`src/components/motion.tsx`): 98% scale + one-step-lighter
  background while held (`pressedBg={false}` where the background is itself data or a filled button).
- Loading: show the cached copy at once and update in place; `ScreenSkeleton` only when nothing is
  cached. No full-screen spinners.
- Sections that hold detail are `Collapsible` (title + one-line preview, body fades in). Tab content
  fades in on focus (`FadeIn`). After a pull-to-refresh, `useToast` says what changed and `Flash`
  tints a changed number (red up, blue down) for 0.8s.
- No haptics: an installed iOS web app can't vibrate.

## Anti-patterns (don't ship)

Inter/Roboto, purple/indigo gradients, cyan-on-dark, nested cards, emoji icons, gradient text on
numbers, smoothed financial lines, color-only up/down, paragraphs of explanation on screen.
