# Market view (시황) — instructions for the scheduled agent

Updated twice a day, 09:00 and 22:30 KST: a Claude Code cloud routine at those times and, as the
fallback, a Codex automation an hour later (10:00, 23:30). Both follow this file. The result appears in
the stockapp 시장 tab.

- **09:00 update (`am`)**: what happened since 22:30 — the US session and its close, overnight speeches
  and research, Asia's open.
- **22:30 update (`pm`)**: what happened since 09:00 — the Korean session, Europe, US pre-market and the
  US open, research published during the day.

## 0. Is this update already done?
1. `git pull origin main`.
2. `cd backend && python -m app.services.outlook slot` prints this update's slot (`YYYY-MM-DD-am` or
   `-pm`, in Korea time), whether `backend/app/data/outlook/<slot>.json` exists, and the previous file.
3. If it says `exists`, stop and report "already written".
4. Read the previous file. It is your starting point: the window is from its time to now.

## 1. Research (since the previous update)
Six houses. Research does not come out every twelve hours, so most updates change only some of them.
For each house, look for anything new in the window; prefer originals, and paid client research is only
reachable through press coverage.

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
- **Carry forward.** A house with nothing new keeps its previous `tone`, `summary`, `detail` and
  `sources` unchanged, with `"new": false`. A house with new material gets rewritten with `"new": true`
  (its new sources dated inside the window; older sources may stay if still relevant).
- Originals first. For every free original in the table, open it (WebFetch) before looking for press.
  `fed` and `bok` sources must be federalreserve.gov / bok.or.kr pages whenever the fact comes from them
  (statement, speech, minutes, 보도자료); press is only for market pricing (e.g. futures odds) or when the
  original truly can't be opened, and then say so in the detail.
- A house's source is the house itself or a news outlet. Never cite reposts on third-party sites (an
  advisor's blog or newsletter copying JPM's recap, a Substack summarizing Hartnett, …).
- Check each new source's date is inside the window (a recap dated Monday usually covers the week before).
- `access: "원문"` only when you actually opened the original. A claim you saw only in an article is
  `"보도"` with the article's URL, even if the article quotes the house.
- Never invent a number, date or quote. If you can't find it, leave it out.
- A house with no view at all yet (no previous file, nothing found): `"tone": null`, `"summary"` and
  `"detail"`: `"최근 자료 없음"`, `"sources": []`.
- Budget: this runs twice a day. Spend searches on what changed; don't re-verify carried-forward houses.

## 2. Judge
- `stance` = the overall tone for risk assets (stocks) now, across the six houses and what markets did in
  the window, weighted by how recent and how direct the evidence is: `긍정` (mostly constructive), `중립`
  (mixed or wait-and-see), `신중` (mostly cautious: growth, inflation, valuation or credit worries
  dominate). Each house gets the same scale in `tone`. Don't flip the stance on one day's price move alone.
- This is context, not advice. Never write 매수/매도/비중 확대/축소 or a price target of your own. The
  owner buys the same amount every month in an ISA (S&P500 40 : 나스닥100 30 : 미국반도체 30); the backtests
  found no timing rule that beats that, so the `isa` line only notes what matters for that plan now
  (e.g. USD/KRW and hedged vs unhedged, 금리 차, an event before the buy days), never "buy more/less".
- Where houses disagree, say so in `points`. `points` lead with what changed since the previous update.

## 3. Write `backend/app/data/outlook/<slot>.json`
Korean, plain. UTF-8. The 시장 tab shows only `stance` (as one color) and `headline`; tapping it opens a
detail page with `reason`, `points`, `isa`, then each house's `summary` and `detail` with sources (a
"new" mark on houses with `"new": true`), then `watch`. So `headline` and `summary` are one glanceable
line; `reason` and `detail` explain: what was said, the evidence (numbers with their dates), and why it
leads to that tone. Shape (limits are checked):
```json
{
  "slot": "2026-09-29-am",
  "asOf": "2026-09-29",
  "author": "claude",
  "stance": "중립",
  "headline": "한 줄 결론 (80자 이내)",
  "reason": "왜 이 판단인지: 직전 대비 달라진 점과 기관들의 근거를 3~5문장으로 (600자 이내)",
  "points": ["직전 업데이트 이후 달라진 것부터, 2~5줄, 줄당 120자 이내", "기관 간 이견도 여기에"],
  "isa": "ISA 적립식 관점에서 지금 볼 것 한 줄 (120자 이내)",
  "houses": [
    {"id": "fed", "tone": "중립", "new": true, "summary": "한 줄 요약 (50자 이내)",
     "detail": "무엇을 말했나, 근거 수치와 날짜, 왜 이 톤인가: 2~5문장 (600자 이내)",
     "sources": [{"title": "Speech by Governor ...", "url": "https://...", "date": "2026-09-28", "access": "원문"}]},
    {"id": "bok", ...}, {"id": "jpm", ...}, {"id": "bofa", ...}, {"id": "gs", ...}, {"id": "citi", ...}
  ],
  "watch": [{"date": "2026-10-02", "event": "미국 9월 고용 (60자 이내)"}]
}
```
`author` is `"claude"` or `"codex"` (whoever you are). `watch`: scheduled events in the next 7 days that
matter (FOMC, 금통위, CPI, 고용, 대형 실적), up to 8, dropping ones that have passed.

## 4. Check, commit, push
1. `cd backend && python -m app.services.outlook check app/data/outlook/<slot>.json` — fix every
   reported problem until it prints `ok`. (Only the standard library is needed.)
2. Commit only that file: `git add backend/app/data/outlook/<slot>.json` and
   `git commit -m "Outlook <slot>"`.
3. `git pull --rebase origin main`. If `<slot>.json` now exists from someone else, drop your commit and
   report a duplicate; otherwise `git push origin main`. If pushing to main is refused, push a branch
   `outlook/<slot>` instead and say so in your final message.
4. Do not change any other file.

Final message: the slot, stance, headline, and which houses had something new.
