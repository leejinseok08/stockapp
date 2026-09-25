import json

import numpy as np
import pandas as pd

from app.services import screener
from app.services.swing import Bars, BY_KEY, features
from app.services.swing_bt import simulate


def _bars(closes, vol=1_000_000):
    idx = pd.bdate_range("2020-01-01", periods=len(closes))
    c = pd.Series(closes, index=idx, dtype=float)
    h = pd.DataFrame({"o": c.shift().fillna(c.iloc[0]), "h": c * 1.01, "l": c * 0.99, "c": c, "v": vol}, index=idx)
    h["o"] = np.minimum(h["o"], h["c"] * 0.995)  # bullish candles
    return Bars(features(h))


def test_breakout_fires_on_new_high_and_fills_next_open():
    closes = [100 + np.sin(i / 5) for i in range(300)] + [110, 111]
    b = _bars(closes)
    i = 300
    assert BY_KEY["breakout"].entry(b, i) == ("mkt",)
    trades = simulate(b, BY_KEY["breakout"], (0, 0), 0, b.n, 0)
    assert trades and trades[0][0] == i + 1  # filled at the next bar


def test_bnf_needs_a_10pct_gap_under_the_25_day_line():
    b = _bars([100.0] * 300 + [89.0])
    assert BY_KEY["bnf"].entry(b, 300) == ("mkt",)
    b2 = _bars([100.0] * 300 + [95.0])
    assert BY_KEY["bnf"].entry(b2, 300) is None


def test_liquidity_filter_blocks_thin_stocks():
    closes = [100 + np.sin(i / 5) for i in range(300)] + [110, 111]
    b = _bars(closes, vol=10)
    assert simulate(b, BY_KEY["breakout"], (0, 0), 0, b.n, 5e9) == []


def test_records_pass_only_when_both_periods_beat_holding(tmp_path, monkeypatch):
    stats = []
    for per, edge in (("2010~2018", 0.002), ("2019~", 0.001)):
        stats.append({"cost": "meritz", "market": "KR", "period": per, "tech": "bnf", "trades": 10, "win": 0.6,
                      "avg": 0.01, "median": 0.005, "pf": 1.4, "days": 3, "edge": edge})
    for per, edge in (("2010~2018", 0.002), ("2019~", -0.001)):
        stats.append({"cost": "meritz", "market": "KR", "period": per, "tech": "breakout", "trades": 10, "win": 0.5,
                      "avg": 0.01, "median": 0.0, "pf": 1.2, "days": 9, "edge": edge})
    f = tmp_path / "bt.json"
    f.write_text(json.dumps({"stats": stats, "portfolio": []}), encoding="utf-8")
    monkeypatch.setattr(screener, "BACKTEST", f)
    rec = screener.records()["KR"]
    assert rec["bnf"]["pass"] and not rec["breakout"]["pass"]
