# StockApp — notes for Claude Code

Personal app for tracking semiconductor/AI stocks and timing monthly purchases in a Korean ISA account.
The owner is Korean; reply in Korean.

## Layout
- `backend/` FastAPI + yfinance + pykrx. `app/services/market.py` (quotes, fundamentals), `app/services/macro.py` (indices, investor flows, currency strength), `app/routers/*`.
- `mobile/` Expo SDK 51 / React Native, TypeScript. Tabs: 관심종목, 시장, 뉴스; stack screens: StockDetail, Portfolio, Compare.
- `tools/drive_export.gs` Google Apps Script: daily `POST /market/collect` + saves CSV to Drive folder "StockApp Data".

## Run locally (Windows PowerShell)
```powershell
cd backend; py -3.11 -m venv .venv; .venv\Scripts\activate; pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000        # SQLite file locally; no DATABASE_URL needed
# optional for 수급: $env:KRX_ID="..."; $env:KRX_PW="..."   (KRX now requires login)

cd mobile; npm install
$env:EXPO_PUBLIC_API_URL="http://localhost:8000"; npm run web   # browser preview
npx tsc --noEmit                                                # typecheck
```
Without `EXPO_PUBLIC_API_URL` the app uses the deployed backend https://stockapp-ghmx.onrender.com (Render, auto-deploys on push to main, Python pinned via `PYTHON_VERSION=3.11.9`).

## Rules
- All UI follows `mobile/DESIGN.md` ("quiet trading ledger": IBM Plex Sans KR / Plex Mono tabular numbers, red=up blue=down always with ▲▼, amber accent only for actions, hairline rows not cards, no emoji icons).
- Money: never sum or rank across currencies without converting. Use `fmtPrice` / `fmtMoney` in `mobile/src/format.ts` (KRW: no decimals, 억/조).
- Charts: no smoothing, never draw values that don't exist (e.g. moving average before a full window).
- Verify UI changes by rendering (`npm run web`), not only typecheck.

## Roadmap (ISA quant timing)
ISA can only hold KRW-listed products (e.g. TIGER 미국S&P500), so signals map to domestic ETFs and USD/KRW matters (hedged vs unhedged).
Strategy frame: signal-weighted monthly DCA (0.5x–1.5x of the base amount), benchmarked against plain DCA.
1. ✅ Phase 1: market tab (indices, flows, FX), daily snapshots in DB, CSV export.
2. ✅ Phase 2: `app/services/signals.py` — rule-based 0–100 score per target (S&P500, NDX, SOX, KOSPI), components + weights + reasons shown in the app, 0.5x/1.0x/1.5x DCA multiplier, hedge hint from USD/KRW. Daily scores stored as `signal:<id>` rows. Tests: `cd backend; pytest`.
3. Phase 3: backtest (vectorbt) vs plain DCA incl. costs; alerts only for signals that beat it.

## Production setup (done)
Render has `DATABASE_URL` (Neon), `KRX_ID`/`KRX_PW`, `PYTHON_VERSION`. Apps Script `stockapp` runs daily at 07:00/16:30 KST and writes `StockApp Data/market_snapshots.csv` in Drive.
