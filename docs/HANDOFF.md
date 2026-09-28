# Handoff

Shared state between Claude Code and Codex. Whichever agent is working keeps this file current, so the other can pick up mid-task when the owner switches (usually because credits ran out, with no warning).

## Protocol
- Read this file and `git status` / `git log -10` before starting.
- Update "Current task" after each finished step, not only at the end: the session can stop at any moment.
- Commit small working steps with this file included. Leave uncommitted work only when it's listed under "Uncommitted".
- When a task is finished, move it to "Recently done" (keep the last ~5) and clear "Current task".
- Durable facts (rules, layout, recurring checks) go in `CLAUDE.md`, not here.

## Current task
Codex Saturday automation: settings and prompt prepared in `tools/outlook/CODEX_AUTOMATION.md`.
Registration is still pending: this session has no scheduled-task creation tool or supported CLI
management command. Register in the desktop app, Saturday 12:00 Asia/Seoul, isolated worktree.
Do not report this task as active until the app confirms registration and the next run.

## Uncommitted
Existing owner/other-agent change: `backend/app/services/outlook.py` adds `history()`; untouched.

## Next up
- Owner: set up the Codex automation (Codex app → Automations, project folder stockapp, Saturday 12:00,
  copy settings/prompt from `tools/outlook/CODEX_AUTOMATION.md`; needs network access).
- Next Saturday (2026-10-03): check W40 used originals for fed/bok and no third-party reposts (rules added
  to PROMPT.md after W39 cited only press, including a blog repost of JPM's recap).

## Recently done
- 2026-09-27 Signal colors unified (green/gray/red via `mobile/src/signal.ts` + `ToneTag`); 시장 tab shows the
  weekly view as one colored card, tap → `OutlookScreen` (reason, points, each house summary + detail +
  sources). Outlook schema: `reason`, house `summary`/`detail` (old `view` files still load).
- 2026-09-27 주간 시황 + 금리: `/market/rates` (ECOS + FRED), `/market/outlook`, 시장 tab sections, Claude
  routine `stockapp 주간 시황` (trig_01D5yKfamn3gB5UQjpCm1uf2, Fri 23:00 UTC = Sat 08:00 KST, claude-sonnet-5;
  pushes to main directly — verified). First real file: W39. Server and web deployed.
- 2026-09-27 Swing: US scan limited to the S&P 500, calm stocks ranked first to cut drawdown (`bd06f6f`).
- 2026-09-27 Swing: BUYs ranked by volatility, KR paused in an index uptrend (`4d308ab`).
- 2026-09-27 Swing: paper-trades every live signal; model account P/L at `/swing/paper` (`866f0a2`).
