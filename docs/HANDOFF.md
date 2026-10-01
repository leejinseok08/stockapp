# Handoff

Shared state between Claude Code and Codex. Whichever agent is working keeps this file current, so the other can pick up mid-task when the owner switches (usually because credits ran out, with no warning).

## Protocol
- Read this file and `git status` / `git log -10` before starting.
- Update "Current task" after each finished step, not only at the end: the session can stop at any moment.
- Commit small working steps with this file included. Leave uncommitted work only when it's listed under "Uncommitted".
- When a task is finished, move it to "Recently done" (keep the last ~5) and clear "Current task".
- Durable facts (rules, layout, recurring checks) go in `CLAUDE.md`, not here.

## Current task
Swing live check (owner, 2026-09-30): `verify.py` + `GET /swing/verify` deployed; snapshots start with the
2026-09-30 scans. Check after a few sessions that `verify:KR:*` rows have paper, mock and index, and that `fillGap`
fills in (mock avgPrice vs paper entry). Verdict comes after 30 closed trades per market.
Kiwoom (owner, 2026-09-29): code done and deployed (backend 2a50719 + app + worker crons), inert until keys exist.
2026-09-29: keys + ACCOUNT_TOKEN set in Render. Kiwoom's firewall blocked urllib's User-Agent ("Request Blocked",
fixed 7bb46d9). Mock works (KR ₩1,000만). US mock: no funds and exchange isn't offered on mock (docs/kiwoom.md) - owner
to ask Kiwoom how to fund US 모의투자. Real: 8050 until the owner registers 74.220.48.29 (GET /kiwoom/egress)
in the Kiwoom portal. Money rule: docs/kiwoom.md (ca60c57).
Next:
1. `GET /kiwoom/status` -> real/mock/accountToken all true; open 계좌 tab, enter the token, check KR + US balances.
   If 8010/8040/8050 errors: Render's outbound IPs aren't registered (or token IP changed) in the Kiwoom portal.
2. After the next scan: `/kiwoom/mock` shows planned orders; after the open, `sent` (or `failed` + message).
   Unverified against the live API: field names come from the spec json only (tests use them). Check
   kt00018/ust21070 parsing, US exchange lookup (usa10098), order codes (KR trde_tp 3/0, US 03/00).
3. Probe: `/kiwoom/probe` after a few days (failRate, sec, maxDiff vs yfinance) -> decide on the price source.

## Uncommitted
None.

## Next up
- Owner: the 시황 routines' cloud environment (env_01QUymjfSNck6Safoq24rGYU, claude.ai/code environment settings,
  not Render) blocks most sites (EGRESS_BLOCKED: federalreserve.gov, bok.or.kr, yahoo, cnbc, bloomberg, ...), so
  BofA/GS/Citi carried forward unchanged since 09-27. Needs those domains allowed. Checker now refuses a stance
  beyond every house without a "기관 …" first sentence (2026-10-01).
- Owner: register the two Codex fallback automations (daily 10:00 and 23:30 KST) from
  `tools/outlook/CODEX_AUTOMATION.md`; not registered yet.
- After the first 09:00 / 22:30 runs: check they carried forward unchanged houses, marked `new` only on
  houses with fresh material, and used originals for fed/bok.
- Owner: check the installed iPhone app's tab bar. The band under it is WebKit bug 301108 (iOS 26: standalone
  page is a status bar, 62pt, short; the strip below can't be painted — sizing #root to screen.height hid the tab
  bar, reverted). Now the tab bar drops its home-indicator padding when the page is cut short (RootNavigator
  `viewCutShort`), deployed 2026-09-29. The 62pt strip itself stays until Apple fixes it.

## Recently done
- 2026-09-29 Memory: OOM at 15:14 UTC 9/28 came from opening a report (DART corp list parsed as a full tree,
  ~130MB). Streamed now (~13MB), 866954f. Baseline 250-360MB of 512MB; watch Render events.
- 2026-09-29 Swipe back moves the stack header with the page (`SwipeHeader` in gestures.tsx, stack `header`
  option; shared per-route offset). Checked in headless Edge with touch emulation.
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
