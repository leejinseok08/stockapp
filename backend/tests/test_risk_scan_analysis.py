import numpy as np
import pandas as pd
import pytest

from app.services import analysis, risk, stockscan

DAYS = pd.bdate_range(end="2026-09-24", periods=300)


def s(values, index=DAYS):
    return pd.Series(np.asarray(values, dtype=float), index=index[-len(values):])


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


# ---- trend buy/sell -----------------------------------------------------------------------------

def test_trend_sells_a_falling_knife_and_buys_back_on_recovery():
    days = pd.bdate_range(end="2026-09-24", periods=700)
    prices = np.r_[np.linspace(100, 200, 300), np.linspace(200, 110, 200), np.linspace(110, 230, 200)]
    f = stockscan.trend_frame(pd.Series(prices, index=days))
    hold = f["hold"]
    assert hold.iloc[:300].all()  # never sells in the rally
    out = hold[~hold]
    assert len(out) and out.index[0] > days[300]  # goes to cash during the slide
    assert hold.iloc[-1]  # back in after the recovery
    flips = hold.ne(hold.shift()).iloc[1:].sum()
    assert flips == 2  # one sell, one buy


def test_trend_signal_reports_the_flip_day():
    days = pd.bdate_range(end="2026-09-24", periods=400)
    prices = pd.Series(np.r_[np.linspace(100, 200, 300), np.linspace(200, 120, 100)], index=days)
    f = stockscan.trend_frame(prices)
    first_out = f.index[(~f["hold"]).to_numpy().argmax()]
    sig = stockscan.trend_signal(prices.loc[:first_out])
    assert sig["action"] == "SELL" and sig["position"] == "현금"
    assert stockscan.trend_signal(prices)["action"] in ("WAIT", "SELL")


# ---- research note ------------------------------------------------------------------------------

def test_pe_history_and_scenarios():
    days = pd.bdate_range("2021-01-01", "2025-12-31")
    closes = pd.Series(100.0, index=days)
    eps = pd.Series([5.0, 10.0, -1.0, 4.0], index=pd.to_datetime(["2022-12-31", "2023-12-31", "2024-12-31", "2025-12-31"]))
    pes = analysis.pe_history(eps, closes)
    assert [p["year"] for p in pes] == ["2022", "2023", "2025"]  # loss year skipped
    assert [round(p["pe"]) for p in pes] == [20, 10, 25]
    sc = analysis.scenarios(100.0, {"low": 4.0, "avg": 5.0, "high": 6.0}, pes)
    assert sc["base"]["price"] == pytest.approx(5.0 * 20)
    assert sc["bear"]["price"] == pytest.approx(4.0 * 10)
    assert sc["bull"]["price"] == pytest.approx(6.0 * 25)


def test_rating_needs_a_real_gap_and_conviction_needs_agreement():
    def sc(bear, base, bull):
        return {k: {"upside": v} for k, v in (("bear", bear), ("base", base), ("bull", bull))}
    assert analysis.rating(sc(-0.3, -0.2, -0.05)) == ("매도", "높음")
    assert analysis.rating(sc(-0.3, 0.2, 0.6)) == ("매수", "보통")
    assert analysis.rating(sc(-0.1, 0.05, 0.3))[0] == "중립"
    assert analysis.rating(None) == (None, None)


def test_note_separates_street_from_model_and_flags_margin_squeeze():
    note = analysis.build_note(
        price=100.0, eps={"low": 4.0, "avg": 5.0, "high": 9.0}, eps_source="컨센서스 내년",
        pes=[{"year": "2023", "eps": 2.0, "pe": 15.0}, {"year": "2024", "eps": 8.0, "pe": 25.0}],
        margins={"quarter": "2026-06", "revenueYoY": 0.2, "opMargin": 0.20, "opMarginYearAgo": 0.25},
        street={"low": 80.0, "median": 120.0, "mean": 125.0, "high": 160.0},
        next_earnings="2026-10-28", trend={"action": "HOLD"}, relative=None, ocf_negative=False, currency="USD")
    assert note["scenarios"]["base"]["price"] == pytest.approx(100.0)  # 5 x median(15, 25)
    assert note["rating"] == "중립"
    assert note["street"]["modelVsStreet"] == pytest.approx(100 / 120 - 1)
    assert any("마진" in r for r in note["risks"])
    assert any("사이클" in r for r in note["risks"])  # EPS 2 -> 8 is a 4x swing
    assert note["model"]["cyclical"] is True
    assert note["catalysts"][0]["date"] == "2026-10-28"
    assert len(note["thesis"]) <= 3


def test_cycle_correction_drops_trough_pe_blends_book_value_and_respects_street():
    pes = [{"year": "2022", "eps": 10.0, "pe": 10.0}, {"year": "2023", "eps": 1.0, "pe": 90.0},
           {"year": "2024", "eps": 8.0, "pe": 12.0}, {"year": "2025", "eps": 12.0, "pe": 9.0}]
    eps = {"low": 8.0, "avg": 10.0, "high": 20.0}
    plain = analysis.scenarios(100.0, eps, pes)
    assert plain["bull"]["price"] == pytest.approx(20 * 90)  # the trough year's PER blows up the bull case
    fixed = analysis.scenarios(100.0, eps, pes, cyclical=True,
                               pbr={"bvps": 50.0, "history": [{"pbr": 1.0}, {"pbr": 2.0}, {"pbr": 3.0}]},
                               street={"low": 70.0, "high": 250.0})
    assert fixed["excludedYears"] == ["2023"]
    assert fixed["peRange"]["max"] == pytest.approx(12.0)
    assert fixed["base"]["price"] == pytest.approx((10 * 10 + 50 * 2) / 2)  # PER median 10, PBR median 2
    assert fixed["bull"]["price"] == pytest.approx(min((20 * 12 + 50 * 3) / 2, 250))
    assert fixed["bear"]["price"] == pytest.approx(max((8 * 9 + 50 * 1) / 2, 70))
    assert "bear" in fixed["clampedToStreet"]
    assert fixed["bear"]["price"] <= fixed["base"]["price"] <= fixed["bull"]["price"]


def test_is_cyclical():
    assert analysis.is_cyclical([1.0, 5.0])
    assert analysis.is_cyclical([3.0, -1.0, 4.0])
    assert not analysis.is_cyclical([3.0, 4.0, 5.0])


def test_trend_chart_marks_trade_days_after_the_signal():
    days = pd.bdate_range(end="2026-09-24", periods=700)
    prices = pd.Series(np.r_[np.linspace(100, 200, 300), np.linspace(200, 110, 200), np.linspace(110, 230, 200)], index=days)
    c = stockscan.trend_chart(prices, days=500)
    assert [m["type"] for m in c["marks"]] == ["SELL", "BUY"]
    hold = stockscan.trend_frame(prices)["hold"]
    first_cash_close = hold.index[(~hold).to_numpy().argmax()]
    sell_day = pd.Timestamp(c["marks"][0]["t"], unit="ms")
    assert sell_day == days[days.get_loc(first_cash_close) + 1]  # trade the session after the signal
    assert len(c["points"]) == 500


def test_today_summary_splits_new_and_recent_flips_and_upcoming_earnings():
    from app.services import today as td

    rows = [
        {"symbol": "A", "trend": {"action": "SELL", "since": "2026-09-24"}},
        {"symbol": "B", "trend": {"action": "HOLD", "since": "2026-09-21"}},
        {"symbol": "C", "trend": {"action": "HOLD", "since": "2026-05-01"}},
    ]
    risk = {"lit": 1, "total": 5, "level": "평상", "items": [{"label": "시장 폭", "lit": True}, {"label": "VIX", "lit": False}]}
    cats = [{"symbol": "A", "date": "2026-10-01", "text": "x"}, {"symbol": "C", "date": "2026-12-01", "text": "y"}]
    out = td.summarize(rows, risk, cats, pd.Timestamp("2026-09-24"))
    assert [i["symbol"] for i in out["changed"]] == ["A"]
    assert [i["symbol"] for i in out["recent"]] == ["B"]
    assert out["risk"]["litItems"] == ["시장 폭"]
    assert [e["symbol"] for e in out["earnings"]] == ["A"]


def test_rating_is_withheld_without_street_estimates():
    note = analysis.build_note(
        price=100.0, eps={"low": None, "avg": 5.0, "high": None}, eps_source="최근 4분기",
        pes=[{"year": "2023", "eps": 4.0, "pe": 30.0}, {"year": "2024", "eps": 5.0, "pe": 40.0}],
        margins=None, street=None, next_earnings=None, trend=None, relative=None, ocf_negative=False, currency="USD")
    assert note["rating"] is None and note["conviction"] is None
    assert note["scenarios"] is not None  # scenarios still shown for reference
    assert "보류" in note["risks"][0]


def test_consensus_falls_back_to_last_stored_values(monkeypatch):
    class T:
        earnings_estimate = None
        analyst_price_targets = {}

    stored = {"est:X:eps_avg": ("2026-09-20", 10.0), "est:X:eps_low": ("2026-09-20", 8.0),
              "est:X:eps_high": ("2026-09-20", 12.0), "est:X:tgt_median": ("2026-09-20", 150.0)}
    monkeypatch.setattr(analysis, "latest_snapshots", lambda prefix: stored)
    monkeypatch.setattr(analysis, "upsert_snapshots", lambda rows: 0)
    monkeypatch.setattr(analysis.time, "sleep", lambda s: None)
    c = analysis.consensus(T(), "X")
    assert c["eps"] == {"low": 8.0, "avg": 10.0, "high": 12.0} and c["epsAsOf"] == "2026-09-20"
    assert c["street"]["median"] == 150.0
    eps, src = analysis._eps_inputs(c, None, None)
    assert src.startswith("컨센서스") and "저장값" in src


def test_risk_items_carry_weekly_history_and_danger_zones():
    days = pd.bdate_range(end="2026-09-24", periods=500)
    item = risk.trend(pd.Series(np.linspace(80, 120, 500), index=days))
    assert 50 <= len(item["history"]) <= 54  # about one point per week for a year
    assert item["history"][-1]["v"] == pytest.approx(item["value"], abs=0.05)
    assert item["zones"] == [{"from": None, "to": 0.0}]
    v = risk.vix(pd.Series(np.full(300, 20.0), index=days[-300:]))
    assert {(z["from"], z["to"]) for z in v["zones"]} == {(30.0, None), (None, 12.0)}
