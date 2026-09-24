import numpy as np
import pandas as pd
import pytest

from app.services import plan, risk, stockscan

DAYS = pd.bdate_range(end="2026-09-24", periods=300)


def s(values, index=DAYS):
    return pd.Series(np.asarray(values, dtype=float), index=index[-len(values):])


# ---- plan: buy-day guide ------------------------------------------------------------------------

def wiggle(n=300, amp=0.01):
    """Alternating +/- amp daily returns, so the usual daily move is ~amp."""
    r = np.where(np.arange(n) % 2 == 0, amp, -amp)
    return 100 * np.cumprod(1 + r)


def test_day_guide_fires_after_a_bigger_than_usual_drop():
    closes = s(np.r_[wiggle(299), wiggle(299)[-1] * 0.97])
    g = plan.day_guide(closes, pd.Timestamp("2026-09-24"))
    assert g["buyNextSession"] is True
    assert g["lastReturn"] == pytest.approx(-3.0)
    assert g["asOf"] == "2026-09-24"
    assert "2026-09-24" in g["firedThisMonth"]


def test_day_guide_ignores_ordinary_moves_and_other_months():
    closes = s(wiggle(300, 0.01))
    g = plan.day_guide(closes, pd.Timestamp("2026-09-24"))
    assert g["buyNextSession"] is False
    assert g["usualMove"] == pytest.approx(1.0, abs=0.05)
    assert g["firedThisMonth"] == [] or all(d.startswith("2026-09") for d in g["firedThisMonth"])


def test_plan_weights_add_up_and_match_backtest():
    from app.services import backtest
    assert sum(x["weight"] for x in plan.SLEEVES) == pytest.approx(1.0)
    assert {x["id"]: x["weight"] for x in plan.SLEEVES} == backtest.PORTFOLIO


# ---- risk gauge ---------------------------------------------------------------------------------

def test_high_yield_lit_on_level_or_jump():
    assert risk.high_yield(s(np.full(60, 3.0)))["lit"] is False
    assert risk.high_yield(s(np.full(60, 5.2)))["lit"] is True
    assert risk.high_yield(s(np.r_[np.full(40, 3.0), np.full(20, 4.2)]))["lit"] is True


def test_yield_curve_lit_only_after_normalizing_from_inversion():
    days = pd.date_range(end="2026-09-24", periods=500)
    inverted_then_positive = s(np.r_[np.full(300, 0.5), np.full(100, -0.3), np.full(100, 0.2)], days)
    still_inverted = s(np.r_[np.full(400, 0.5), np.full(100, -0.3)], days)
    never = s(np.full(500, 0.4), days)
    assert risk.yield_curve(inverted_then_positive)["lit"] is True
    assert risk.yield_curve(still_inverted)["lit"] is False
    assert risk.yield_curve(never)["lit"] is False


def test_trend_vix_breadth_rules():
    assert risk.trend(s(np.linspace(100, 80, 250)))["lit"] is True
    assert risk.trend(s(np.linspace(80, 100, 250)))["lit"] is False
    assert risk.vix(s([31.0]))["lit"] and risk.vix(s([11.5]))["lit"] and not risk.vix(s([18.0]))["lit"]
    spy = s(np.linspace(100, 110, 100))
    assert risk.breadth(s(np.linspace(100, 104, 100)), spy)["lit"] is True  # equal-weight lagging
    assert risk.breadth(s(np.linspace(100, 112, 100)), spy)["lit"] is False


def test_levels():
    items = [{"lit": True}] * 3 + [{"lit": False}] * 2
    assert risk.summarize(items)["level"] == "경계"
    assert risk.summarize(items[2:])["level"] == "평상"  # 1 lit


# ---- stock scan ---------------------------------------------------------------------------------

def test_relative_strength_flags_falling_more_than_a_falling_market():
    bench = s(np.linspace(100, 90, 250))
    weak = s(np.linspace(100, 70, 250))
    r = stockscan.relative_strength(weak, bench)
    assert r["aboveMa"] is False
    assert r["excess3m"] < 0
    assert "손절" in r["verdict"]
    strong = stockscan.relative_strength(s(np.linspace(100, 95, 250)), bench)
    assert "회복탄력성" in strong["verdict"]
    assert strong["series"][0]["ratio"] == pytest.approx(100)
    assert strong["series"][0]["ma"] is None  # no average before a full window


def quarterly(rows: dict) -> pd.DataFrame:
    cols = pd.to_datetime(["2026-06-30", "2026-03-31", "2025-12-31", "2025-09-30", "2025-06-30"])
    return pd.DataFrame(rows, index=cols).T


def test_financial_change_growth_and_ocf_warning():
    inc = quarterly({"Total Revenue": [130, 120, 110, 105, 100], "Operating Income": [20, 10, 8, 6, -10],
                     "Net Income": [10, 10, 5, 5, 5]})
    cf = quarterly({"Operating Cash Flow": [-5, -5, -5, 4, 3]})
    fc = stockscan.financial_change(inc, cf)
    L = fc["lines"]
    assert fc["quarter"] == "2026-06"
    assert L["revenue"]["qoq"] == pytest.approx(130 / 120 * 100 - 100)
    assert L["revenue"]["yoy"] == pytest.approx(30.0)
    assert L["operatingIncome"]["yoy"] == pytest.approx(300.0)  # from -10 to +20, measured against |-10|
    assert fc["ocfNegativeTtm"] is True  # -5-5-5+4 < 0


def test_group_score_is_percentile_weighted_and_skips_bad_multiples():
    def row(sym, g, roe, peg):
        lines = {k: {"qoq": g, "yoy": g} for k in stockscan.LINES}
        return {"symbol": sym, "lines": lines, "roe": roe, "peg": peg, "pbr": None, "psr": None}

    rows = stockscan.score_group([row("A", 50, 0.3, 1.0), row("B", 10, 0.1, 2.0), row("C", 30, 0.2, -1.0)])
    by = {r["symbol"]: r for r in rows}
    assert by["A"]["score"] > by["C"]["score"] > by["B"]["score"]
    assert by["C"]["percentiles"]["peg"] is None  # negative PEG isn't "cheap"
    assert by["A"]["scoreCoverage"] == pytest.approx(0.4 + 0.15 + 0.15)


def test_ratios_computed_from_statements_when_info_is_empty():
    fc = {"lines": {"netIncome": {"ttm": 20.0}, "revenue": {"ttm": 200.0}}}
    r = stockscan.ratios_from_statements(1000.0, fc, 100.0)
    assert r == {"roe": pytest.approx(0.2), "pbr": pytest.approx(10.0), "psr": pytest.approx(5.0)}
    # Negative equity or missing cap: no ratio rather than a misleading one.
    assert stockscan.ratios_from_statements(1000.0, fc, -5.0)["pbr"] is None
    assert stockscan.ratios_from_statements(None, fc, 100.0)["psr"] is None
