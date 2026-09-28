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


def test_records_drop_techniques_that_win_less_than_half(tmp_path, monkeypatch):
    stats = [{"cost": "meritz", "market": "US", "period": per, "tech": "oneil", "trades": 10, "win": win,
              "avg": 0.02, "median": -0.01, "pf": 1.5, "days": 8, "edge": 0.003}
             for per, win in (("2010~2018", 0.55), ("2019~", 0.43))]
    f = tmp_path / "bt.json"
    f.write_text(json.dumps({"stats": stats, "portfolio": []}), encoding="utf-8")
    monkeypatch.setattr(screener, "BACKTEST", f)
    assert not screener.records()["US"]["oneil"]["pass"]


def test_replay_holds_then_sells_after_bnf_time_limit():
    # BNF fired on bar 300, bought at the next open; the rule sells after 3 bars if price stays down.
    held = _bars([100.0] * 300 + [89.0, 88.0])
    assert screener.replay(held, BY_KEY["bnf"], 301, 88.0) is None
    due = _bars([100.0] * 300 + [89.0, 88.0, 88.0, 88.0, 88.0])
    assert screener.replay(due, BY_KEY["bnf"], 301, 88.0) == {"order": "시가", "limit": None, "since": None}
    late = _bars([100.0] * 300 + [89.0] + [88.0] * 6)
    assert screener.replay(late, BY_KEY["bnf"], 301, 88.0)["since"] == late.index[305].strftime("%Y-%m-%d")


def test_replay_gives_the_limit_for_midline_exits():
    b = _bars([100.0] * 300 + [89.0, 88.0])
    order = screener.replay(b, BY_KEY["envelope"], 301, 88.0)
    assert order["order"] == "지정가" and abs(order["limit"] - b["ma20"][b.n - 1]) < 1e-9


def test_swing_response_drops_groups_when_buys_exist():
    from app.routers.swing import slim
    new = {"buys": [], "groups": [{"x": 1}], "excluded": [1], "paused": False}
    assert slim(new) == {"buys": [], "paused": False}
    old = {"groups": [{"x": 1}]}
    assert slim(old) == old


def test_cache_drops_expired_and_oldest(monkeypatch):
    from app.services import market
    monkeypatch.setattr(market, "_CACHE", type(market._CACHE)())
    monkeypatch.setattr(market, "MAX_ENTRIES", 3)
    clock = [1000.0]
    monkeypatch.setattr(market.time, "time", lambda: clock[0])
    monkeypatch.setattr(market, "_last_sweep", 0.0)
    market._cached("short", 10, lambda: "s")
    market._cached("a", 1e6, lambda: 1)
    clock[0] += 100  # "short" has expired; the next insert sweeps it
    market._cached("b", 1e6, lambda: 2)
    assert "short" not in market._CACHE
    market._cached("a", 1e6, lambda: "never")  # a hit refreshes recency
    market._cached("c", 1e6, lambda: 3)
    market._cached("d", 1e6, lambda: 4)  # over 3: the least recently used ("b") goes
    assert list(market._CACHE) == ["a", "c", "d"]
    assert market._cached("a", 1e6, lambda: "never") == 1
