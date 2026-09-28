# Handoff

Shared state between Claude Code and Codex. Whichever agent is working keeps this file current, so the other can pick up mid-task when the owner switches (usually because credits ran out, with no warning).

## Protocol
- Read this file and `git status` / `git log -10` before starting.
- Update "Current task" after each finished step, not only at the end: the session can stop at any moment.
- Commit small working steps with this file included. Leave uncommitted work only when it's listed under "Uncommitted".
- When a task is finished, move it to "Recently done" (keep the last ~5) and clear "Current task".
- Durable facts (rules, layout, recurring checks) go in `CLAUDE.md`, not here.

## Current task
Toss-style redesign, step 1 (owner chose "오늘 + 리포트 + 공통 인터랙션 first", 2026-09-28).
- Diagnosis: A1 오늘 hides my holdings mid-page, empty 신호 변경 on top; A2 swing jargon (BNF 이격도);
  A3 종목 rows too dense ("그 밖의 값"); A4 시장 7 sections, 수급 shows "KRX 로그인 설정 필요";
  A5 계좌 3 repeated cards; A6 report chart after long text (3,000pt). B1 only 9/24 Pressables
  have pressed feedback; B2 full-screen spinners, no skeletons; B3 no animation; B4 no refresh
  feedback; B5 haptics impossible in iOS PWA.
- Figma file (owner's drafts): https://www.figma.com/design/FU9m15qEPcvcalRN8hwaPe — frames
  01 오늘, 02 종목 리포트 (+ R5 이동평균 5/20/50/200 toggles, colors 5 #A594F9 · 20 #4FD1C5 ·
  50 #F2C94C · 200 #E8A33D), 03 공통 인터랙션, 04 종목, 05 시장, 06 계좌 — each "· 제안" with
  yellow notes. Visual QA done (clipping/overlap/▲▼ colors) on 2026-09-28.
- APPROVED in full by the owner (2026-09-28): T1-T5, R1-R5, S1-S3, M1-M5, C1-C4, I1-I4.
- Build order (commit after each, tick here): [x] I common (Press everywhere; Skeleton/Collapsible/FadeIn/useToast/Flash in motion.tsx, wired per screen)
  [x] 오늘 T1-T5 (swing rows pass `swing` info to StockDetail; report must show it in R)  [x] 리포트 R1-R5 (trend-chart points carry ma5/20/50/200 from 3y history; toggles saved as setting "chart-ma")
  [x] 종목 S1-S3  [ ] 시장 M1-M5  [ ] 계좌 C1-C4  [ ] render check all, deploy web.

## Uncommitted
None.

## Next up
- Owner: register the two Codex fallback automations (daily 10:00 and 23:30 KST) from
  `tools/outlook/CODEX_AUTOMATION.md`; not registered yet.
- After the first 09:00 / 22:30 runs: check they carried forward unchanged houses, marked `new` only on
  houses with fresh material, and used originals for fed/bok.
- Owner: confirm on the iPhone that the band under the tab bar is gone (status bar now black-translucent).

## Recently done
- 2026-09-28 시황 twice a day (09:00 / 22:30 KST): slots `YYYY-MM-DD-am|pm` (`outlook slot` command), carry-forward
  per house with a `new` flag, Claude routines at both times, Codex fallback doc for 10:00 / 23:30. W39 file
  renamed to `2026-09-27-pm.json`. Unwired `outlook.history()` (from the Atlas test) kept, slot-based.
- 2026-09-27 Signal colors unified (green/gray/red via `mobile/src/signal.ts` + `ToneTag`); 시장 tab shows the
  weekly view as one colored card, tap → `OutlookScreen` (reason, points, each house summary + detail +
  sources). Outlook schema: `reason`, house `summary`/`detail` (old `view` files still load).
- 2026-09-27 주간 시황 + 금리: `/market/rates` (ECOS + FRED), `/market/outlook`, 시장 tab sections, Claude
  routine `stockapp 주간 시황` (trig_01D5yKfamn3gB5UQjpCm1uf2, Fri 23:00 UTC = Sat 08:00 KST, claude-sonnet-5;
  pushes to main directly — verified). First real file: W39. Server and web deployed.
- 2026-09-27 Swing: US scan limited to the S&P 500, calm stocks ranked first to cut drawdown (`bd06f6f`).
- 2026-09-27 Swing: BUYs ranked by volatility, KR paused in an index uptrend (`4d308ab`).
- 2026-09-27 Swing: paper-trades every live signal; model account P/L at `/swing/paper` (`866f0a2`).
