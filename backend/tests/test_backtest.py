import numpy as np
import pandas as pd
import pytest

from app.services import backtest as bt

DAYS = pd.bdate_range("2019-01-01", "2021-12-31")
US = {"id": "sp500", "symbol": "^GSPC", "name": "S&P500", "region": "US"}


def market(prices, fx=1.0) -> bt.Market:
    p = pd.Series(np.asarray(prices, dtype=float), index=DAYS)
    etf = pd.DataFrame({"Close": p, "Volume": 1000.0})
    krw = pd.Series(fx, index=DAYS)
    return bt.Market(US, p, etf, p * krw, pd.Series(20.0, index=DAYS), krw)


def test_plain_dca_accounting_with_costs():
    m = market(np.full(len(DAYS), 100.0))
    r = bt.run(m, bt.plain, "plain", start="2020-01-01", end="2020-12-31", base=1000, cost=0.001, cash_rate=0)
    assert len(r.ledger) == 12
    assert r.ledger["units"].iloc[-1] == pytest.approx(12 * 1000 * 0.999 / 100)
    assert r.ledger["cash"].iloc[-1] == pytest.approx(0)
    assert r.metrics()["invested"] == 12_000


def test_strategy_never_sees_the_trade_day():
    seen = []

    def spy(v, s):
        seen.append((v.day, v.index().index[-1]))
        return bt.Decision(1.0)

    bt.run(market(np.linspace(100, 200, len(DAYS))), spy, "spy", start="2020-01-01", end="2020-06-30")
    assert all(last < day for day, last in seen)


def test_unspent_cash_earns_interest_and_counts_in_value():
    m = market(np.full(len(DAYS), 100.0))
    r = bt.run(m, lambda v, s: bt.Decision(0.0), "hold", start="2020-01-01", end="2020-12-31",
               base=1000, cash_rate=0.12)
    assert r.ledger["units"].iloc[-1] == 0
    assert r.value.iloc[-1] > 12_000  # 11 months of interest on a growing pile


def test_buying_is_capped_by_cash_on_hand():
    m = market(np.full(len(DAYS), 100.0))
    r = bt.run(m, lambda v, s: bt.Decision(1.5), "greedy", start="2020-01-01", end="2020-03-31",
               base=1000, cost=0, cash_rate=0)
    assert r.ledger["buy"].tolist() == [1.0, 1.0, 1.0]


def test_trim_moves_holdings_to_cash():
    m = market(np.full(len(DAYS), 100.0))
    trim_in_march = lambda v, s: bt.Decision(1.0, trim=0.5 if v.day.month == 3 else 0.0)
    r = bt.run(m, trim_in_march, "trim", start="2020-01-01", end="2020-03-31", base=1000, cost=0, cash_rate=0)
    assert r.ledger["units"].iloc[-1] == pytest.approx(10 + 10)  # 20 held, half sold, then 10 bought
    assert r.ledger["cash"].iloc[-1] == pytest.approx(1000)


def test_us_fills_are_converted_to_krw():
    m = market(np.full(len(DAYS), 100.0), fx=1300.0)
    r = bt.run(m, bt.plain, "plain", start="2020-01-01", end="2020-01-31", base=1_300_000, cost=0)
    assert r.ledger["units"].iloc[-1] == pytest.approx(10)


def test_knife_guard_caps_in_a_downtrend_then_spends_savings_once():
    # Two years of rally, a year-long slide, then a sharp recovery.
    prices = np.r_[np.linspace(100, 200, 500), np.linspace(200, 100, 150), np.linspace(100, 180, len(DAYS) - 650)]
    m = market(prices)
    guarded = bt.knife_guard(bt.plain, cap=0.5)
    r = bt.run(m, guarded, "g", start="2020-06-01", base=1000, cost=0, cash_rate=0)
    buys = r.ledger["buy"]
    assert (buys == 0.5).any()  # capped while falling
    assert buys.max() > 1.5  # saved cash spent when it turned
    assert (buys > 1.0).sum() == 1  # ...once
    assert r.ledger["cash"].iloc[-1] < 1000


def test_disparity_maps_to_shannon_ratio():
    flat = market(np.full(len(DAYS), 100.0))
    assert bt.disparity60(bt.View(flat, DAYS[300]), bt.State(base=1)).buy == pytest.approx(1.0)
    # 20% under its 60-day average -> equity side 120 -> 1.2x
    p = np.full(len(DAYS), 100.0)
    p[299] = 100 * 0.8 / (1 - 0.2 / 60)  # last close before DAYS[300]
    mean = (100 * 59 + p[299]) / 60
    d = p[299] / mean * 100
    v = bt.View(market(p), DAYS[300])
    assert bt.disparity60(v, bt.State(base=1)).buy == pytest.approx((200 - d) / 100)
