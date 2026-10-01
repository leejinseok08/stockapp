# 종목 코멘트 작성 (AI Berkshire 체크리스트)

The owner asks in Claude Code or Codex, e.g. "코멘트 써줘: NVDA" or "삼성전자 코멘트". Write the
judgment part of the 코멘트 tab for that stock, following AI Berkshire's `/investment-checklist`
(github.com/xbtlin/ai-berkshire, MIT, `skills/investment-checklist.md`). The numbers part (7-metric
quality screen, 좋은 사업, 안전마진, 결정 규율) is computed by the server from filings; don't repeat it,
use it.

No paid service: no LLM API from the server, no paid data. You (the agent) are the writer.

## 1. Start from the numbers
- Symbol in the app's form: `NVDA`, `BRK-B`, `005930.KS` (KOSPI), `247540.KQ` (KOSDAQ).
- `GET https://stockapp-ghmx.onrender.com/stocks/<SYMBOL>/comment` (if reachable): verdict, quality
  metrics, gates. Or run `backend/app/services/comment.py` locally. If neither works, use the filings
  directly (SEC 10-K / DART 사업보고서) and say so in a source.
- Information richness A/B/C (the skill's 1.5 step): with C, write "자료 부족" honestly rather than
  filling the gates.

## 2. Research (each fact with a dated source)
Business model in one sentence, market share and competitors, moat evidence (brand/pricing,
switching cost, network effect, scale, technology), management record (promises vs delivery, capital
allocation, ownership, governance), last 6 months' events. Primary sources first (filings, IR,
company releases), press second. Key numbers from two independent sources.

## 3. Write `backend/app/data/comments/<SYMBOL>.json`
```json
{
  "symbol": "NVDA",
  "asOf": "2026-10-01",
  "author": "claude",
  "verdict": "통과 | 회색지대 | 미통과",
  "oneLine": "≤80자, 결론 한 줄",
  "gates": {
    "competence": {"stars": 1-5, "text": "≤200자, 무엇으로 돈을 버는지 한 문장 + 10년 뒤"},
    "moat":       {"stars": 1-5, "text": "≤200자, 해자 종류와 증거, 넓어지는지 좁아지는지"},
    "management": {"stars": 1-5, "text": "≤200자, 약속 대비 실행, 자본배분, 지배구조"}
  },
  "masters": {
    "dyp": "≤160자 돤융핑: 사업의 본질, 좋은 사업인가",
    "buffett": "≤160자 버핏: 해자와 가격, 안전마진",
    "munger": "≤160자 멍거: 뒤집어 보기, 어떻게 망하나",
    "lilu": "≤160자 리루: 10년 확실성, 문명 흐름"
  },
  "risks": ["3~5개, 각 ≤80자, 망하는 길부터"],
  "mirror": ["사업의 본질", "해자", "경영진", "가격 대비 내재가치", "틀렸을 때 하방"],
  "mirrorPass": false,
  "sources": [{"title": "...", "url": "https://...", "date": "YYYY-MM-DD"}]
}
```
Rules from the skill:
- Stars are whole numbers 1-5 by the skill's scale (gates 1, 3, 4). Integrity problem → management 1
  and verdict 미통과.
- Verdict: 미통과 when any quick-veto line holds (can't say how it makes money, 3 years of negative
  FCF without improvement, management integrity stain, moat eroding irreversibly, needs a greater
  fool, reason is "everyone is buying"/"it went up", can't write the case in 200 characters).
  통과 only when the server's numbers don't fail and gates 1-5 hold. Otherwise 회색지대, and oneLine
  names the open question.
- Mirror test: five sentences; any one you can't complete honestly → `mirrorPass: false`.
- Korean, direct, no hedging filler. Estimates say "추정". No buy/sell order: the checklist screens out
  bad choices; the app's signals stay the trend rule.

## 4. Check and commit
```
cd backend; python -m app.services.comment check app/data/comments/<SYMBOL>.json
```
Fix every line it prints. Commit only that file with `[skip render]` in the message (the server reads
the comments folder from GitHub main, so no redeploy is needed) and push to main. The note shows on
the 코멘트 tab within about five minutes. Refresh a note when results or a major event change the
picture; the newest `asOf` wins.
