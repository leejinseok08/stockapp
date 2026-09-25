# StockApp — notes for Claude Code

Personal app for tracking semiconductor/AI stocks and timing monthly purchases in a Korean ISA account.
The owner is Korean; reply in Korean.

## Layout
- `backend/` FastAPI + yfinance + pykrx. Services: `market.py` (quotes, fundamentals), `macro.py` (indices, flows, FX), `signals.py` (market temperature, context only), `risk.py` (5-signal crash gauge, FRED/Yahoo), `stockscan.py` (daily trend BUY/SELL rule `TREND`, relative strength, financial change score, `get_list`), `analysis.py` (research note: rating, cycle-corrected bear/base/bull targets, thesis/catalysts/risks), `today.py` (오늘 tab), `backtest.py`. Key endpoints: `/today`, `/stocks/list`, `/stocks/{symbol}/analysis`, `/stocks/{symbol}/trend-chart`, `/market/*`. `filings.py` (snowflake from DART / SEC 10-K only; DART disclosures), `extras.py` (search, dividends, portfolio vs index), `push.py` (Web Push), `universe.py` + `swing.py` + `screener.py` (whole-market swing scan after each close, only techniques that pass `swing_bt.py`; `/swing`). `app/data/trend_backtest.json` is generated (`python -m app.services.backtest trendjson`) and shown next to each signal.
- `mobile/` Expo SDK 51 / React Native, TypeScript. Tabs 오늘 · 종목 · 시장 · 계좌; the stock report (StockDetail) opens on top. Layout and rules: `docs/app-design.md`.
- `docs/signal-research.md` (what was tested and why), `docs/isa.md` (the owner's ISA rules).
- `tools/drive_export.gs` Google Apps Script: daily `POST /market/collect` + saves CSV to Drive folder "StockApp Data".

## Run locally (Windows PowerShell)
```powershell
cd backend; py -3.11 -m venv .venv; .venv\Scripts\activate; pip install -r requirements.txt   # py -3.13 also works locally
uvicorn app.main:app --reload --port 8000        # SQLite file locally; no DATABASE_URL needed
# optional for 수급: $env:KRX_ID="..."; $env:KRX_PW="..."   (KRX now requires login)

cd mobile; npm install
$env:EXPO_PUBLIC_API_URL="http://localhost:8000"; npm run web   # browser preview
npx tsc --noEmit                                                # typecheck
```
Phone app = PWA on Cloudflare Pages: https://stockapp-i5a.pages.dev (project `stockapp`). Deploy from `mobile/` with `npm run deploy:web` (wrangler, logged in on this PC). `scripts/fix-web-assets.js` must run after export: Pages drops folders named node_modules, which is where Expo puts the fonts, and the app then hangs on a blank screen. Service worker is network-first for pages, so a deploy shows up on the next open.
Without `EXPO_PUBLIC_API_URL` the app uses the deployed backend https://stockapp-ghmx.onrender.com (Render, auto-deploys on push to main, Python pinned via `PYTHON_VERSION=3.11.9`).

## Rules
- All UI follows `mobile/DESIGN.md` (Toss-style layout on the app's dark palette: bold section titles, bands between sections, change pills, logo avatars, chips; red=up blue=down always with ▲▼, amber accent only for actions, one-line descriptions only, no emoji icons).
- Money: never sum or rank across currencies without converting. Use `fmtPrice` / `fmtMoney` in `mobile/src/format.ts` (KRW: no decimals, 억/조).
- Charts: no smoothing, never draw values that don't exist (e.g. moving average before a full window).
- Verify UI changes by rendering (`npm run web`), not only typecheck.

## Roadmap (ISA quant timing)
ISA can only hold KRW-listed products (e.g. TIGER 미국S&P500), so signals map to domestic ETFs and USD/KRW matters (hedged vs unhedged).
Owner's plan (KB증권 중개형 ISA, 일반형): same amount every month, S&P500 40 : 나스닥100 30 : KODEX 미국반도체 30 (MVIS semis = SMH). Any rule must beat that plain DCA in `backtest.optimize()` on both the in-sample and out-of-sample periods before the app acts on it.
1. ✅ Phase 1: market tab (indices, flows, FX), daily snapshots in DB, CSV export.
2. ✅ Phase 2: `app/services/signals.py` — rule-based 0–100 score per target (S&P500, NDX, SOX, KOSPI), components + weights + reasons shown in the app, 0.5x/1.0x/1.5x DCA multiplier, hedge hint from USD/KRW. Daily scores stored as `signal:<id>` rows. Tests: `cd backend; pytest`.
3. ✅ Phase 3: `app/services/backtest.py` — monthly DCA engine (same cash flows for every strategy, KRW fills from dividend-adjusted ETFs, no look-ahead, idle cash earns a parking rate). Run `python -m app.services.backtest [portfolio|optimize|dayrules|targets|summary]`. Result: nothing beats plain DCA after costs (multiplier −16%, 31 grid settings all lose, trimming −45~−88%, dip-day buying −0.2%). So the app shows scores/risk gauge as context only. The dip-day rule is the owner's preference (cost shown): `isa_plan.py` evaluates it live on the three KR ETFs and 계좌 > ISA lists this month's buy days, with no alerts. The app is organized around two jobs (owner, 2026-09-25): ISA = plain monthly DCA, context only (risk gauge, market temperature, FX, limits); individual stocks = BUY/SELL, reports, and 분할매수 alerts (rule being designed with the owner from the learned posts).
4. ✅ Individual stocks, first group = Magnificent 7 + 삼성전자 + SK하이닉스 (`tickers.BIGTECH`).

## Recurring checks
- 2027-01: KB ISA fee event ends (0.005% → base 0.015%?). Update `backtest.COST`, rerun `python -m app.services.backtest summary`, commit the JSON.
- ISA law: 2026 개편안 (연 4천만·총 2억·비과세 500만) not confirmed as of 2026-09; when it is, update `docs/isa.md` and the defaults in `mobile/src/components/IsaSection.tsx`.

## Production setup (done)
Render has `DATABASE_URL` (Neon), `KRX_ID`/`KRX_PW`, `PYTHON_VERSION`, `DART_API_KEY`, `SEC_CONTACT`, `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`, `CRON_SECRET` (values only in Render, never in the repo). Cloudflare Worker `stockapp-cron` (`tools/worker`, secret `CRON_SECRET`) pings `/health` every 10 min so Render doesn't sleep, and calls `POST /swing/run` (US at 07:10, KR at 16:40 KST) and `POST /push/run`. SEC refuses naver.com contact addresses (403 "Undeclared Automated Tool"), so `SEC_CONTACT` must use another domain. Apps Script `stockapp` runs daily at 07:00/16:30 KST and writes `StockApp Data/market_snapshots.csv` in Drive.
