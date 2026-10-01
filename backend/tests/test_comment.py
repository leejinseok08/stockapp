import copy

import pandas as pd

from app.services import comment


def _year(rev, gp, op, ni, ocf, capex, eq, shares, interest=1.0, debt=10.0):
    return {"revenue": rev, "grossProfit": gp, "operatingIncome": op, "netIncome": ni, "ocf": ocf, "capex": capex,
            "equity": eq, "shares": shares, "interest": interest, "debt": debt}


def _fin(years):
    return {"source": "test", "url": "https://example.com", "currency": "USD",
            "years": {2020 + i: y for i, y in enumerate(years)}}


# High margin, high ROE, cash rich, buying back shares.
GREAT = _fin([_year(100 + 10 * i, 60 + 6 * i, 30 + 3 * i, 25 + 3 * i, 30 + 3 * i, 5, 100, 100 - i) for i in range(6)])


def test_great_business_passes_screen_and_gate():
    qs = comment.quality_screen(GREAT)
    assert qs["result"] == "통과"
    assert all(m["pass"] for m in qs["metrics"])
    biz = comment.good_business(GREAT)
    assert biz["stars"] == 5


def test_missing_data_is_neither_pass_nor_fail():
    fin = copy.deepcopy(GREAT)
    for y in fin["years"].values():
        y.pop("grossProfit")
    qs = comment.quality_screen(fin)
    gross = next(m for m in qs["metrics"] if m["key"] == "gross")
    assert gross["pass"] is None and gross["detail"] == "매출총이익 공시 없음"
    assert qs["result"] == "통과"  # one gap doesn't fail the screen


def test_dilution_and_low_roe_fail():
    fin = _fin([_year(100, 20, 5, 3, 4, 2, 100, 100 + 10 * i) for i in range(6)])
    qs = comment.quality_screen(fin)
    assert qs["result"] == "탈락"
    keys = {m["key"] for m in qs["metrics"] if m["pass"] is False}
    assert {"roe", "dilution", "net"} <= keys


def test_exemption_c_for_high_turnover_model():
    # Costco shape: thin margins, ROE over 20%, cash flow above profit.
    fin = _fin([_year(1000, 120, 35, 25, 40, 10, 100, 100) for _ in range(6)])
    qs = comment.quality_screen(fin)
    net = next(m for m in qs["metrics"] if m["key"] == "net")
    gross = next(m for m in qs["metrics"] if m["key"] == "gross")
    assert gross["pass"] is False and gross["exempt"].startswith("C")
    assert net["pass"] is False and net["exempt"].startswith("C")
    assert qs["result"] == "예외 통과"


def test_no_debt_counts_as_covered():
    fin = copy.deepcopy(GREAT)
    for y in fin["years"].values():
        y["interest"], y["debt"] = None, None
    cover = next(m for m in comment.quality_screen(fin)["metrics"] if m["key"] == "cover")
    assert cover["pass"] is True


def test_veto_on_three_years_negative_fcf():
    fin = _fin([_year(100, 50, 10, 5, 2, 10 + i, 100, 100) for i in range(6)])
    assert comment.quick_veto(fin)
    c = comment.build_comment(fin, None)
    assert c["verdict"] == "미통과"


def test_margin_of_safety_stars():
    note = lambda up: {"scenarios": {k: {"price": 1, "upside": up} for k in ("bear", "base", "bull")}}  # noqa: E731
    assert comment.margin_of_safety(note(1.2))["stars"] == 5   # price is 45% of value
    assert comment.margin_of_safety(note(0.5))["stars"] == 4
    assert comment.margin_of_safety(note(0.0))["stars"] == 3
    assert comment.margin_of_safety(note(-0.2))["stars"] == 2
    assert comment.margin_of_safety(note(-0.5))["stars"] == 1
    assert comment.margin_of_safety(None)["stars"] is None


def test_verdict_pass_needs_good_business_and_fair_price():
    note = {"scenarios": {k: {"price": 1, "upside": 0.2} for k in ("bear", "base", "bull")}}
    c = comment.build_comment(GREAT, note)
    assert c["verdict"] == "통과"
    assert [m["id"] for m in c["masters"]] == ["dyp", "buffett", "munger", "lilu"]
    dear = {"scenarios": {k: {"price": 1, "upside": -0.4} for k in ("bear", "base", "bull")}}
    assert comment.build_comment(GREAT, dear)["verdict"] == "회색지대"


def test_discipline_flags_run_up_near_high():
    closes = pd.Series([100 + i for i in range(252)])  # +151% and at the high
    d = comment.discipline(closes)
    assert len(d["flags"]) == 2


def _note():
    return {"symbol": "NVDA", "asOf": "2026-10-01", "author": "claude", "verdict": "회색지대", "oneLine": "좋은 사업, 비싼 가격",
            "gates": {k: {"stars": 4, "text": "근거"} for k in comment.GATES},
            "masters": {k: "한 줄" for k in comment.MASTERS},
            "risks": ["a", "b", "c"], "mirror": ["1", "2", "3", "4", "5"], "mirrorPass": False,
            "sources": [{"title": "10-K", "url": "https://sec.gov", "date": "2026-02-26"}]}


def test_validate_written_note():
    assert comment.validate(_note()) == []
    bad = _note()
    bad["gates"]["moat"]["stars"] = 3.5
    bad["mirror"] = ["1"]
    bad["symbol"] = "nvda"
    errs = comment.validate(bad)
    assert any("gates.moat.stars" in e for e in errs)
    assert any(e.startswith("mirror:") for e in errs)
    assert any(e.startswith("symbol") for e in errs)
