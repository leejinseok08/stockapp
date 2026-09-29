# Handoff

Shared state between Claude Code and Codex. Whichever agent is working keeps this file current, so the other can pick up mid-task when the owner switches (usually because credits ran out, with no warning).

## Protocol
- Read this file and `git status` / `git log -10` before starting.
- Update "Current task" after each finished step, not only at the end: the session can stop at any moment.
- Commit small working steps with this file included. Leave uncommitted work only when it's listed under "Uncommitted".
- When a task is finished, move it to "Recently done" (keep the last ~5) and clear "Current task".
- Durable facts (rules, layout, recurring checks) go in `CLAUDE.md`, not here.

## Current task
None.

## Uncommitted
None.

## Next up
- Owner: register the two Codex fallback automations (daily 10:00 and 23:30 KST) from
  `tools/outlook/CODEX_AUTOMATION.md`; not registered yet.
- After the first 09:00 / 22:30 runs: check they carried forward unchanged houses, marked `new` only on
  houses with fresh material, and used originals for fed/bok.
- Owner: confirm on the iPhone (installed app) that the band under the tab bar is gone. 2026-09-29: black-translucent
  alone didn't fix it even after reinstalling (band = 62pt, iOS viewport short by the status bar); now #root is sized
  to screen.height in standalone portrait (inline script in mobile/public/index.html), deployed. If it still shows,
  next try html/body height 100vh.

## Recently done
- 2026-09-28 Swipes: tabs sideways, back from the left edge (gestures.tsx, DOM touch events, data-noswipe on
  charts/tables). Memory: 2 more OOM kills after the KR scan left ~510MB -> malloc_trim after scan batches and
  cache sweeps + MALLOC_ARENA_MAX=2 on Render. Check Render events for OOM over the next days. Docs-only
  commits: add [skip render].
- 2026-09-28 Latency: bounded self-sweeping cache (300 entries), swing scan in 100-symbol batches, outlook
  commits with [skip render] read from GitHub, slim /swing. 시황 detail O1-O6 (tone strip, 3-line reason,
  3 points, ISA card, houses fold). Points now ≤70 chars. Watch Render events for further OOM kills.
- 2026-09-28 Toss-style redesign, all approved items (Figma https://www.figma.com/design/FU9m15qEPcvcalRN8hwaPe):
  I1-I4 (motion.tsx: Press everywhere, Skeleton, Collapsible, FadeIn, useToast, Flash), 오늘 T1-T5,
  리포트 R1-R5 (trend-chart ma5/20/50/200), 종목 S1-S3, 시장 M1-M5, 계좌 C1-C4. Each render-checked locally.
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
