"""The owner's ISA plan (KB증권 중개형 ISA) and this month's buy-day guide.

Plan: the same amount every month, split S&P500 40 : 나스닥100 30 : KODEX 미국반도체 30. The backtest
(docs/signal-research.md) found no timing or amount-scaling rule that beat this after costs.

Buy-day guide: the owner prefers to buy on a day that fell more than usual. Backtested, "buy the
session after a drop of at least 1x the usual daily move, else on the month's last session" trailed
buying on the first trading day by ~0.2% of final value (2005-2026), so it is shown as a preference
with that cost stated, not as an edge.
"""

import json
import logging
from datetime import datetime
from pathlib import Path

import pandas as pd

from .macro import KST, _daily_closes
from .market import _cached

log = logging.getLogger("stockapp.plan")

DAY_RULE_Z = 1.0  # drop of at least this many usual daily moves
DAY_RULE_LOOKBACK = 60  # sessions used for "usual" (std of daily returns)

SLEEVES = [
    {"id": "sp500", "name": "미국 S&P500", "weight": 0.40,
     "etfs": [{"symbol": "360750.KS", "name": "TIGER 미국S&P500"}, {"symbol": "379800.KS", "name": "KODEX 미국S&P500"}]},
    {"id": "ndx", "name": "미국 나스닥100", "weight": 0.30,
     "etfs": [{"symbol": "133690.KS", "name": "TIGER 미국나스닥100"}, {"symbol": "379810.KS", "name": "KODEX 미국나스닥100"}]},
    {"id": "semis", "name": "미국 반도체", "weight": 0.30,
     "etfs": [{"symbol": "390390.KS", "name": "KODEX 미국반도체"}]},
]

SUMMARY_PATH = Path(__file__).resolve().parents[1] / "data" / "backtest_summary.json"


def day_guide(closes: pd.Series, today: pd.Timestamp, z: float = DAY_RULE_Z, lookback: int = DAY_RULE_LOOKBACK) -> dict:
    """Did the latest session drop more than usual (-> buy next session), and did that already
    happen this month? Mirrors backtest.dip_day: each session is judged on returns up to itself."""
    r = closes.pct_change().dropna()
    usual = r.rolling(lookback).std()
    fired = r <= -z * usual
    month = r.index.to_period("M") == today.to_period("M")
    last = r.index[-1]
    return {
        "asOf": last.strftime("%Y-%m-%d"),
        "lastReturn": round(float(r.iloc[-1]) * 100, 2),
        "usualMove": round(float(usual.iloc[-1]) * 100, 2) if pd.notna(usual.iloc[-1]) else None,
        "threshold": round(float(-z * usual.iloc[-1]) * 100, 2) if pd.notna(usual.iloc[-1]) else None,
        "buyNextSession": bool(fired.iloc[-1]),
        "firedThisMonth": [d.strftime("%Y-%m-%d") for d in r.index[month & fired.to_numpy()]],
    }


def load_backtest_summary() -> dict | None:
    try:
        return json.loads(SUMMARY_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        log.warning("backtest summary unavailable: %s", e)
        return None


def get_plan() -> dict:
    def build():
        today = pd.Timestamp(datetime.now(KST).date())
        sleeves = []
        for s in SLEEVES:
            etf = s["etfs"][0]
            try:
                guide = {"etfSymbol": etf["symbol"], "etfName": etf["name"], **day_guide(_daily_closes(etf["symbol"]), today)}
            except Exception as e:
                log.warning("day guide %s failed: %s", etf["symbol"], e)
                guide = None
            sleeves.append({**s, "guide": guide})
        return {
            "account": "KB증권 중개형 ISA",
            "sleeves": sleeves,
            "rule": {
                "z": DAY_RULE_Z,
                "lookback": DAY_RULE_LOOKBACK,
                "text": f"전일 하락폭이 평소 하루 변동폭({DAY_RULE_LOOKBACK}거래일 표준편차)의 {DAY_RULE_Z:g}배 이상이면 다음 거래일에 매수, "
                        "이번 달에 그런 날이 없으면 마지막 거래일에 매수",
            },
            "backtest": load_backtest_summary(),
            "generatedAt": datetime.now(KST).isoformat(timespec="minutes"),
        }

    return _cached("plan", 600, build)
