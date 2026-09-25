"""분할매수: the owner's buy-day rule for the ISA plan, evaluated live.

Each month's money is split by PORTFOLIO (S&P500 40 : 나스닥100 30 : 반도체 30) and each ETF is
bought on its own day: the session after a close that fell at least 1.0x its usual daily move
(std of the last 60 daily returns), or near month-end if that never happens. This is
backtest.dip_day(1.0) run on the ETFs the owner actually buys. Backtest: -0.2% vs buying on the
first trading day (docs/signal-research.md, 3차) - kept as the owner's preference, cost shown.

The app shows a card only on a buy day; every other day there is nothing to show.
Month-end fallback uses the second-to-last weekday so a single holiday at the very end of the
month can't skip it (weekdays only; Korean holidays aren't modeled).
"""

from datetime import datetime

import pandas as pd
import yfinance as yf

from .backtest import PORTFOLIO, dip_day
from .macro import KST
from .market import _cached

Z, LOOKBACK = 1.0, 60
RULE = dip_day(Z, LOOKBACK)
BACKTEST_VS_PLAIN = -0.002  # docs/signal-research.md: drop >= 1.0x usual, whole period

ETFS = {
    "sp500": {"symbol": "360750.KS", "name": "TIGER 미국S&P500", "sleeve": "S&P500"},
    "ndx": {"symbol": "133690.KS", "name": "TIGER 미국나스닥100", "sleeve": "나스닥100"},
    "semis": {"symbol": "390390.KS", "name": "KODEX 미국반도체", "sleeve": "미국 반도체"},
}


def _weekdays(month: pd.Period) -> pd.DatetimeIndex:
    return pd.bdate_range(month.start_time, month.end_time)


MARKET_CLOSE_HOUR = 16  # KRX closes 15:30; Yahoo has the close by 16:00


def evaluate(closes: pd.Series, today: pd.Timestamp, hour: int = 12) -> dict:
    """Where this ETF stands in the current buying cycle, from its daily closes (index = dates).

    The next session N is today if the latest close is from an earlier day, else the next weekday.
    After the close with no close for today, today was a holiday, so N is the next weekday.
    The cycle is N's month: if a buy day already passed in that month the month is done; if the
    latest close triggers the rule, buy at N; if N is the month-end fallback day, buy at N."""
    closes = closes.dropna()
    closes.index = pd.DatetimeIndex(closes.index).tz_localize(None).normalize()
    last = closes.index[-1]
    if last < today and today.weekday() < 5 and hour < MARKET_CLOSE_HOUR:
        nxt = today
    else:
        nxt = max(last, today) + pd.offsets.BDay(1)
    month = nxt.to_period("M")
    days = _weekdays(month)
    fallback = days[-2] if len(days) >= 2 else days[-1]
    # Sessions of this month that already happened: the first dip day, or the fallback day, was the buy.
    for d in closes.index[closes.index.to_period("M") == month]:
        if RULE(closes.loc[: d - pd.Timedelta(days=1)]):
            return {"status": "done", "boughtOn": d.strftime("%Y-%m-%d"), "reason": "dip"}
        if d >= fallback:
            return {"status": "done", "boughtOn": d.strftime("%Y-%m-%d"), "reason": "monthEnd"}

    r = closes.iloc[-(LOOKBACK + 1):].pct_change().dropna()
    move, usual = float(r.iloc[-1]), float(r.std())
    base = {"lastClose": float(closes.iloc[-1]), "lastDate": last.strftime("%Y-%m-%d"),
            "move": move, "usual": usual, "ratio": (-move / usual) if usual else None,
            "buyOn": nxt.strftime("%Y-%m-%d"), "buyToday": nxt == today}
    if RULE(closes):
        return {"status": "buy", "reason": "dip", **base}
    if nxt >= fallback:
        return {"status": "buy", "reason": "monthEnd", **base}
    return {"status": "wait", **base}


def get_split_buy() -> dict:
    def build():
        now = datetime.now(KST)
        today = pd.Timestamp(now.date())
        items = []
        for sid, etf in ETFS.items():
            try:
                closes = yf.Ticker(etf["symbol"]).history(period="6mo", interval="1d", auto_adjust=False)["Close"]
                st = evaluate(closes, today, now.hour)
            except Exception as e:
                st = {"status": "error", "error": str(e)[:120]}
            items.append({"id": sid, **etf, "weight": PORTFOLIO[sid], **st})
        buys = [i for i in items if i["status"] == "buy"]
        return {
            "active": bool(buys),
            "items": items,
            "rule": f"전일 하락이 평소 하루 변동(60일)의 {Z:g}배 이상 → 다음 거래일 매수, 없으면 월말",
            "backtestVsPlain": BACKTEST_VS_PLAIN,
            "generatedAt": datetime.now(KST).isoformat(timespec="minutes"),
        }

    return _cached("splitbuy", 900, build)
