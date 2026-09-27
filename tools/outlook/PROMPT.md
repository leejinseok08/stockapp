# Weekly market view (주간 시황) — instructions for the scheduled agent

Run by a Claude Code cloud routine (Saturday 08:00 KST) and, as the fallback, a Codex automation
(Saturday 12:00 KST). Both follow this file. The result appears in the stockapp 시장 tab.

## 0. Is this week already done?
1. `git pull origin main`.
2. `cd backend && python -m app.services.outlook week` prints this week (ISO week of today in Korea,
   e.g. Saturday 2026-10-03 → `2026-W40`, the Mon–Fri that just ended), today's date, and whether
   `backend/app/data/outlook/<week>.json` exists.
3. If it says `exists`, stop and report "already written".

## 1. Research (the last 7 days: previous Saturday through Friday)
Six houses. For each, find what it published or said in the window. Prefer originals; paid client
research is only reachable through press coverage.

| id | House | Free originals (access = "원문") | Paid, press only (access = "보도") |
|---|---|---|---|
| `fed` | 연준 | federalreserve.gov press releases, FOMC statement/minutes/SEP, Beige Book, speeches (feeds: federalreserve.gov/feeds/press_all.xml, speeches.xml) | — |
| `bok` | 한국은행 | bok.or.kr 통화정책방향 의결문·의사록, 경제전망, 보도자료, 총재 발언 | — |
| `jpm` | JPM | J.P. Morgan Asset Management Weekly Market Recap, Guide to the Markets, Eye on the Market (Cembalest) | J.P. Morgan Global Research (strategy, S&P targets, economics) |
| `bofa` | BofA | Merrill / BofA Private Bank CIO Capital Market Outlook, Bank of America Institute | BofA Global Research: Global Fund Manager Survey (monthly), Hartnett's Flow Show (weekly) |
| `gs` | 골드만삭스 | goldmansachs.com/insights (articles, Top of Mind when public), GS Asset Management | Goldman Sachs Global Investment Research |
| `citi` | 씨티 | Citi Wealth Outlook and CIO notes, Citi GPS | Citi Research |

Press coverage: Reuters, Bloomberg, CNBC, FT, WSJ, MarketWatch, 연합뉴스, 한국경제, 매일경제.

Rules:
- Originals first. For every free original in the table, open it (WebFetch) before looking for press.
  `fed` and `bok` sources must be federalreserve.gov / bok.or.kr pages whenever the fact comes from them
  (statement, speech, minutes, 보도자료); press is only for market pricing (e.g. futures odds) or when the
  original truly can't be opened, and then say so in the view.
- A house's source is the house itself or a news outlet. Never cite reposts on third-party sites (an
  advisor's blog or newsletter copying JPM's recap, a Substack summarizing Hartnett, …).
- Check each source's date is inside the window (a recap dated Monday usually covers the week before).
- `access: "원문"` only when you actually opened the original. A claim you saw only in an article is
  `"보도"` with the article's URL, even if the article quotes the house.
- Never invent a number, date or quote. If you can't find it, leave it out.
- A house with nothing new in the window: `"tone": null`, `"view": "이번 주 새 자료 없음"`, `"sources": []`.
- Older material (e.g. the quarterly Guide to the Markets) may be used only when it is still the house's
  latest view; give its real date.

## 2. Judge
- `stance` = the overall tone for risk assets (stocks) across the six, weighted by how recent and how
  direct the evidence is: `긍정` (mostly constructive), `중립` (mixed or wait-and-see), `신중` (mostly
  cautious: growth, inflation, valuation or credit worries dominate). Each house gets the same scale in
  `tone`.
- This is context, not advice. Never write 매수/매도/비중 확대/축소 or a price target of your own. The
  owner buys the same amount every month in an ISA (S&P500 40 : 나스닥100 30 : 미국반도체 30); the backtests
  found no timing rule that beats that, so the `isa` line only notes what matters for that plan this week
  (e.g. USD/KRW and hedged vs unhedged, 금리 차, an event before the buy days), never "buy more/less".
- Where houses disagree, say so in `points`.

## 3. Write `backend/app/data/outlook/<week>.json`
Korean, short, plain. UTF-8. Shape (limits are checked):
```json
{
  "week": "2026-W40",
  "asOf": "2026-10-03",
  "author": "claude",
  "stance": "중립",
  "headline": "한 줄 결론 (80자 이내)",
  "points": ["핵심 2~5줄, 줄당 120자 이내", "기관 간 이견도 여기에"],
  "isa": "ISA 적립식 관점에서 이번 주 볼 것 한 줄 (120자 이내)",
  "houses": [
    {"id": "fed", "tone": "중립", "view": "1~2문장 (160자 이내)",
     "sources": [{"title": "FOMC statement", "url": "https://...", "date": "2026-09-30", "access": "원문"}]},
    {"id": "bok", ...}, {"id": "jpm", ...}, {"id": "bofa", ...}, {"id": "gs", ...}, {"id": "citi", ...}
  ],
  "watch": [{"date": "2026-10-06", "event": "미국 9월 CPI (60자 이내)"}]
}
```
`author` is `"claude"` or `"codex"` (whoever you are). `watch`: scheduled events in the next 7 days that matter
(FOMC, 금통위, CPI, 고용, 대형 실적), up to 8; add a later FOMC or 금통위 only if nothing major falls
in the next 7 days.

## 4. Check, commit, push
1. `cd backend && python -m app.services.outlook check app/data/outlook/<week>.json` — fix every
   reported problem until it prints `ok`. (Only the standard library is needed.)
2. Commit only that file: `git add backend/app/data/outlook/<week>.json` and
   `git commit -m "Weekly outlook <week>"`.
3. `git pull --rebase origin main && git push origin main`. If pushing to main is refused, push a branch
   `outlook/<week>` instead and say so in your final message.
4. Do not change any other file.

Final message: the week, stance, headline, and which houses had nothing new.
