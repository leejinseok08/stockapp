# Kiwoom REST API — rules and what we learned

Guide: https://openapi.kiwoom.com/guide/apiguide · spec + samples: github.com/Kiwoom-Securities/Kiwoom-REST-API
(`kiwoom/_data/kiwoom_api_spec.json`: every API's request/response fields). All 337 APIs by menu:
`docs/kiwoom-api-index.md`. Our client: `backend/app/services/kiwoom.py`.

## Money rule (owner, 2026-09-29) — do not relax
Nothing may spend real money or start a paid service.
- The real account is **read-only**: `READ_ONLY` allowlist, and every id in `MONEY` (orders, amend/cancel,
  credit orders, gold spot, currency exchange `ust31302`) is refused on the real host before any request.
  `test_nothing_that_moves_money_reaches_the_real_host` guards it.
- Orders exist only for the mock account (`ORDERS` ⊂ `MONEY`, mock host only). Amend/cancel/credit/gold/exchange
  are refused even on mock.
- A new feature that would need a MONEY id on the real account, a paid market-data subscription, a paid Kiwoom
  service, or a paid plan anywhere (Render, Cloudflare, data vendors): don't build it; tell the owner it is
  blocked by this rule and why. Adding an id to `READ_ONLY` is fine only if it is a pure query.

## How the API behaves
- POST + JSON everywhere. Hosts: real `https://api.kiwoom.com`, mock `https://mockapi.kiwoom.com`; keys differ.
- Headers: `api-id` (TR code), `authorization: Bearer <token>`, `Content-Type: application/json;charset=UTF-8`.
  Paging: response headers `cont-yn: Y` + `next-key` → send both back.
- Business errors come as HTTP 200 with `return_code` ≠ 0 (sometimes 3 with "[8005:...]" inside `return_msg`).
- Token: `/oauth2/token` with appkey/secretkey, `expires_dt` (KST, YYYYMMDDHHMMSS). Re-issue on 8005 (expired),
  8010 (other IP).
- **Firewall**: Python urllib's default User-Agent is answered with an HTML "Request Blocked" 400. Send a normal UA.
- **IP**: the real host needs the caller's IP registered (8050 "IP가 등록되지 않았습니다"; portal > API 사용신청).
  The mock host doesn't. Render's egress: `GET /kiwoom/egress` (account token) → 74.220.48.29 on 2026-09-29.
- Limits: real 5/s per token (US 3/s 09:00-10:00 KST); **mock 1/s per TR**. `GAP` spaces calls per mode.
- Numbers are strings, zero-padded and signed ("-000000012345"); percents like "+12.34" (→ `_pct` → 0.1234).
  KR codes come back as "A005930".
- The API service is cancelled after 3 months without a real-host login (the daily account read covers it).

## Mock account findings (2026-09-29)
- Account 8135559511, KR: ₩10,000,000 cash.
- US: `ust21110`/`ust21070` answer "모의투자 해당조회내역이 없습니다" (no USD) and the mock host refuses
  `ust31300`/`ust31301` (exchange) with RC9000 "모의투자에서는 해당업무가 제공되지 않습니다". So US mock trading
  has no funds through the API; the planner sizes to 0 and places no US buys until funds exist.

## Diagnostics
`POST /kiwoom/raw?mode=real|mock&api_id=<READ_ONLY id>` with header `X-Account-Token` and a JSON body: one call as
Kiwoom answers it. Never accepts a MONEY id.
