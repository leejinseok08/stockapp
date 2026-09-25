import pandas as pd

from app.services.extras import dividend_summary, naver_to_symbol
from app.services.filings import dart_rows_to_years, sec_annual, snowflake
from app.services.push import daily_messages


def test_sec_annual_keeps_full_year_10k_latest_filing():
    facts = {"facts": {"us-gaap": {"Revenues": {"units": {"USD": [
        {"form": "10-K", "fp": "FY", "start": "2024-01-01", "end": "2024-12-31", "val": 100, "filed": "2025-02-01"},
        {"form": "10-K", "fp": "FY", "start": "2024-01-01", "end": "2024-12-31", "val": 110, "filed": "2026-02-01"},
        {"form": "10-K", "fp": "FY", "start": "2024-10-01", "end": "2024-12-31", "val": 30, "filed": "2025-02-01"},
        {"form": "10-Q", "fp": "Q1", "start": "2025-01-01", "end": "2025-03-31", "val": 40, "filed": "2025-05-01"},
    ]}}}}}
    out = sec_annual(facts)
    assert list(out) == [2024]
    assert out[2024]["revenue"] == 110


def test_dart_rows_three_years_and_debt_sum():
    rows = [
        {"account_id": "ifrs-full_Revenue", "sj_div": "IS", "account_nm": "매출액",
         "thstrm_amount": "300", "frmtrm_amount": "200", "bfefrmtrm_amount": "100"},
        {"account_id": "ifrs-full_FinanceCosts", "sj_div": "IS", "account_nm": "금융비용", "thstrm_amount": "-5"},
        {"account_id": "x", "sj_div": "BS", "account_nm": "단기차입금", "thstrm_amount": "10"},
        {"account_id": "y", "sj_div": "BS", "account_nm": "사채", "thstrm_amount": "20"},
        {"account_id": "z", "sj_div": "BS", "account_nm": "사채할인발행차금", "thstrm_amount": "-1"},
    ]
    out = dart_rows_to_years(rows, 2025)
    assert out[2023]["revenue"] == 100 and out[2025]["revenue"] == 300
    assert out[2025]["interest"] == 5
    assert out[2025]["debt"] == 30


def _year(rev, ni, eps):
    return {"revenue": rev, "operatingIncome": ni * 1.2, "netIncome": ni, "eps": eps, "shares": ni / eps,
            "equity": rev, "liabilities": rev * 0.5, "currentAssets": rev, "currentLiabilities": rev * 0.5,
            "cash": rev * 0.3, "debt": rev * 0.1, "interest": 1, "ocf": ni * 1.3, "capex": ni * 0.3}


def test_snowflake_scores_are_bounded_and_explained():
    fin = {"currency": "USD", "years": {y: _year(100 * 1.2 ** i, 20 * 1.2 ** i, 2 * 1.2 ** i)
                                        for i, y in enumerate(range(2020, 2026))}}
    s = snowflake(fin, price=50, fy_prices={y: 40 for y in range(2020, 2026)})
    assert set(s["axes"]) == {"value", "growth", "past", "health", "dividend"}
    for a in s["axes"].values():
        assert 0 <= a["score"] <= 6 and len(a["checks"]) == 6
        assert all(c["detail"] for c in a["checks"])
    assert s["total"] == sum(a["score"] for a in s["axes"].values())
    assert s["axes"]["dividend"]["score"] == 0  # no dividends filed -> nothing passes


def test_naver_symbol_mapping():
    assert naver_to_symbol({"code": "005930", "typeCode": "KOSPI", "nationCode": "KOR"}) == "005930.KS"
    assert naver_to_symbol({"code": "247540", "typeCode": "KOSDAQ", "nationCode": "KOR"}) == "247540.KQ"
    assert naver_to_symbol({"code": "BRK.B", "typeCode": "NYSE", "nationCode": "USA"}) == "BRK-B"
    assert naver_to_symbol({"code": "7203", "nationCode": "JPN"}) is None


def test_dividend_summary_estimates_next_date():
    idx = pd.to_datetime(["2025-03-28", "2025-06-27", "2025-09-29", "2025-12-29", "2026-03-30", "2026-06-29"])
    s = dividend_summary(pd.Series([1, 1, 1, 1, 1, 2.0], index=idx), {}, pd.Timestamp("2026-09-25"))
    assert s["frequency"] == "분기" and s["nextEstimated"]
    assert s["nextExDate"] >= "2026-09-25"
    assert s["ttm"] == 5.0  # the four payments within a year
    announced = dividend_summary(pd.Series([1.0], index=idx[-1:]), {"Ex-Dividend Date": "2026-10-01"}, pd.Timestamp("2026-09-25"))
    assert announced["nextExDate"] == "2026-10-01" and not announced["nextEstimated"]
    assert dividend_summary(pd.Series([], dtype=float, index=pd.DatetimeIndex([])), {}, pd.Timestamp("2026-09-25")) == {"pays": False}


def test_push_messages_only_for_flips_and_alert_level():
    today = {"changed": [{"symbol": "NVDA", "name": "엔비디아", "action": "SELL"}]}
    risk = {"lit": 1, "total": 5, "level": "평상", "items": []}
    msgs = daily_messages(today, risk)
    assert len(msgs) == 1 and "엔비디아 SELL" in msgs[0][2]
    assert daily_messages({"changed": []}, {"lit": 3, "total": 5, "level": "경계", "items": [{"label": "VIX", "lit": True}]})[0][1].startswith("위험 경고 3/5")
