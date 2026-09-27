# Handoff

Shared state between Claude Code and Codex. Whichever agent is working keeps this file current, so the other can pick up mid-task when the owner switches (usually because credits ran out, with no warning).

## Protocol
- Read this file and `git status` / `git log -10` before starting.
- Update "Current task" after each finished step, not only at the end: the session can stop at any moment.
- Commit small working steps with this file included. Leave uncommitted work only when it's listed under "Uncommitted".
- When a task is finished, move it to "Recently done" (keep the last ~5) and clear "Current task".
- Durable facts (rules, layout, recurring checks) go in `CLAUDE.md`, not here.

## Current task
Weekly market view (주간 시황) + BOK ECOS rates, agreed with the owner 2026-09-27:
- Sources: JPM, BofA, Goldman, Citi, Fed, 한국은행. Free originals: Fed/BOK documents, JPM AM (Guide to the Markets, Weekly Market Recap, Eye on the Market), Merrill/BofA Capital Market Outlook, GS insights, Citi Wealth Outlook. Paid research (JPM/GS/Citi Research, BofA FMS & Flow Show) only via press coverage, and the report must label which is which.
- Context only, never a buy/sell call (backtests: nothing beats plain DCA).
- Weekly scheduled task in BOTH Claude (cloud routine, Saturday morning KST) and Codex (a few hours later, only if that week's file is missing) writes a JSON into the repo (public), backend serves the latest, 시장 tab shows a card.
- ECOS: key works and is set on Render as `ECOS_API_KEY` (never in the repo; locally `$env:ECOS_API_KEY`). Stat codes: 기준금리 722Y001/D/0101000, 국고채 3년 817Y002/D/010200000, 10년 817Y002/D/010210000. Plan: backend rates module + 시장 tab card (기준금리, 국고채, 한미 금리차).
- Done so far: nothing in code yet.

## Uncommitted
None.

## Next up
- Build the above: ECOS rates module → weekly JSON schema + endpoint → 시장 tab card → Claude routine → Codex automation.

## Recently done
- 2026-09-27 Swing: US scan limited to the S&P 500, calm stocks ranked first to cut drawdown (`bd06f6f`).
- 2026-09-27 Swing: BUYs ranked by volatility, KR paused in an index uptrend (`4d308ab`).
- 2026-09-27 Swing: paper-trades every live signal; model account P/L at `/swing/paper` (`866f0a2`).
