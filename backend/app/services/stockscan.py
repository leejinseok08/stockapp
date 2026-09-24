"""Single-stock checks from docs/signal-research.md section 6.

Relative strength (투자총론 4편): a stock is judged against its own market index. Rising faster than
the index in an up market = momentum; falling less than the index in a down market = resilience;
falling more than the index in a down market = the case where the post says to cut it and move the
money to the index.

Financial change score (TIP 18, 30, 9): quarterly growth rates rather than levels, ranked as
percentiles within the peer group so KRW and USD companies compare on ratios only.
"""

import logging
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import pandas as pd
import yfinance as yf

from .market import _cached, _num

log = logging.getLogger("stockapp.stockscan")

RS_MA = 50  # sessions for the ratio's moving average


def benchmark_for(symbol: str) -> tuple[str, str]:
    if symbol.endswith(".KS") or symbol.endswith(".KQ"):
        return "^KS11", "코스피"
    return "^GSPC", "S&P500"


def _closes_1y(ticker: str) -> pd.Series:
    def fetch():
        s = yf.Ticker(ticker).history(period="1y", interval="1d")["Close"].dropna()
        s.index = s.index.tz_localize(None).normalize()
        return s

    return _cached(f"close1y:{ticker}", 900, fetch)


def _ret(s: pd.Series, n: int) -> float | None:
    return float(s.iloc[-1] / s.iloc[-n - 1] - 1) * 100 if len(s) > n else None


def relative_strength(stock: pd.Series, bench: pd.Series) -> dict:
    df = pd.concat({"s": stock, "b": bench}, axis=1).dropna()
    ratio = df["s"] / df["b"]
    ratio = ratio / ratio.iloc[0] * 100
    ma = ratio.rolling(RS_MA).mean()
    above = ratio > ma
    valid = ma.notna()
    state = bool(above.iloc[-1]) if valid.iloc[-1] else None
    since = None
    if state is not None:
        flips = above[valid] != above[valid].shift()
        since = above[valid][flips].index[-1].strftime("%Y-%m-%d")
    s3, b3 = _ret(df["s"], 63), _ret(df["b"], 63)
    if s3 is None or b3 is None:
        verdict = None
    elif b3 < 0:
        verdict = ("시장 하락 중 역행 상승" if s3 > 0 else
                   "시장 하락 중 덜 빠짐 — 회복탄력성" if s3 >= b3 else
                   "시장 하락 중 더 빠짐 — 4편 기준 손절 후 지수로 이동을 검토할 구간")
    else:
        verdict = ("시장 상승 중 역행 하락" if s3 < 0 else
                   "시장보다 더 오름 — 상승 모멘텀" if s3 >= b3 else
                   "시장만큼 못 오름 — 모멘텀 약함")
    return {
        "aboveMa": state,
        "since": since,
        "excess1m": _diff(_ret(df["s"], 21), _ret(df["b"], 21)),
        "excess3m": _diff(s3, b3),
        "excess6m": _diff(_ret(df["s"], 126), _ret(df["b"], 126)),
        "stock3m": s3,
        "bench3m": b3,
        "verdict": verdict,
        "series": [
            {"t": int(t.timestamp() * 1000), "ratio": round(float(r), 3),
             "ma": round(float(m), 3) if pd.notna(m) else None}
            for t, r, m in zip(ratio.index, ratio, ma)
        ],
    }


def _diff(a, b):
    return a - b if a is not None and b is not None else None


def get_relative(symbol: str) -> dict:
    bench_symbol, bench_name = benchmark_for(symbol)

    def build():
        return {"symbol": symbol, "benchmark": bench_symbol, "benchmarkName": bench_name, "maWindow": RS_MA,
                **relative_strength(_closes_1y(symbol), _closes_1y(bench_symbol))}

    return _cached(f"rs:{symbol}", 900, build)


# ---- financial change ------------------------------------------------------------------------

LINES = {"revenue": ("income", "Total Revenue", "매출"),
         "operatingIncome": ("income", "Operating Income", "영업이익"),
         "netIncome": ("income", "Net Income", "순이익"),
         "operatingCashFlow": ("cashflow", "Operating Cash Flow", "영업현금흐름")}


def _growth(cur, prev) -> float | None:
    """Change vs an earlier value; against a negative base the sign flips, so divide by |prev|."""
    if cur is None or prev is None or prev == 0:
        return None
    return (cur - prev) / abs(prev) * 100


def financial_change(income: pd.DataFrame, cashflow: pd.DataFrame) -> dict:
    frames = {"income": income, "cashflow": cashflow}
    out, quarters = {}, None
    for key, (frame, row, _) in LINES.items():
        df = frames[frame]
        if df is None or df.empty or row not in df.index:
            out[key] = None
            continue
        s = df.loc[row].sort_index(ascending=False)
        vals = [_num(v) for v in s.to_numpy()]
        quarters = quarters or [c.strftime("%Y-%m") for c in s.index]
        out[key] = {
            "latest": vals[0],
            "qoq": _growth(vals[0], vals[1]) if len(vals) > 1 else None,
            "yoy": _growth(vals[0], vals[4]) if len(vals) > 4 else None,
            "ttm": sum(vals[:4]) if len(vals) >= 4 and all(v is not None for v in vals[:4]) else None,
        }
    ocf = out.get("operatingCashFlow")
    return {"quarter": quarters[0] if quarters else None, "lines": out,
            "ocfNegativeTtm": bool(ocf and ocf["ttm"] is not None and ocf["ttm"] < 0)}


def _stock_facts(symbol: str) -> dict:
    def fetch():
        t = yf.Ticker(symbol)
        info = t.info
        fc = financial_change(t.quarterly_income_stmt, t.quarterly_cashflow)
        op_ttm = (fc["lines"].get("operatingIncome") or {}).get("ttm")
        cap = _num(info.get("marketCap"))
        return {
            "symbol": symbol,
            "name": info.get("shortName") or info.get("longName"),
            "currency": info.get("financialCurrency") or info.get("currency"),
            "roe": _num(info.get("returnOnEquity")),
            "peg": _num(info.get("trailingPegRatio") or info.get("pegRatio")),
            "pbr": _num(info.get("priceToBook")),
            "psr": _num(info.get("priceToSalesTrailing12Months")),
            # TIP 30: market cap / operating income (lower = cheaper per unit of operating profit).
            "capToOpIncome": cap / op_ttm if cap and op_ttm and op_ttm > 0 else None,
            **fc,
        }

    return _cached(f"facts:{symbol}", 6 * 3600, fetch)


# TIP 18 weights: 8 growth rates x 5% (QoQ and YoY of revenue, operating income, net income, OCF)
# + ROE, PEG, PBR, PSR x 15%. Valuation ratios rank "lower is better"; missing inputs are dropped
# and the rest re-weighted.
SCORE_PARTS = [(f"{k}.{p}", 0.05, True) for k in LINES for p in ("qoq", "yoy")] + [
    ("roe", 0.15, True), ("peg", 0.15, False), ("pbr", 0.15, False), ("psr", 0.15, False)]


def _metric(row: dict, key: str):
    if "." in key:
        line, period = key.split(".")
        return (row["lines"].get(line) or {}).get(period)
    v = row.get(key)
    if key in ("peg", "pbr", "psr") and v is not None and v <= 0:
        return None  # negative multiples (losses) don't rank as "cheap"
    return v


def score_group(rows: list[dict]) -> list[dict]:
    """Percentile of each metric within the group, weighted per TIP 18, 0-100."""
    for key, _, higher_better in SCORE_PARTS:
        vals = pd.Series([_metric(r, key) for r in rows], dtype=float)
        pct = vals.rank(pct=True, ascending=higher_better) * 100
        for r, p in zip(rows, pct):
            r.setdefault("_pct", {})[key] = None if np.isnan(p) else float(p)
    for r in rows:
        parts = [(w, r["_pct"][k]) for k, w, _ in SCORE_PARTS if r["_pct"][k] is not None]
        total = sum(w for w, _ in parts)
        r["score"] = round(sum(w * p for w, p in parts) / total, 1) if total else None
        r["scoreCoverage"] = round(total, 2)
        r["percentiles"] = r.pop("_pct")
    return rows


def get_scan(symbols: list[str]) -> dict:
    def build():
        def one(sym):
            row = {"symbol": sym}
            try:
                row |= _stock_facts(sym)
            except Exception as e:
                log.warning("facts %s failed: %s", sym, e)
                row |= {"lines": {}, "quarter": None, "ocfNegativeTtm": False}
            try:
                rs = get_relative(sym)
                row["relative"] = {k: v for k, v in rs.items() if k != "series"}
            except Exception as e:
                log.warning("relative %s failed: %s", sym, e)
                row["relative"] = None
            return row

        with ThreadPoolExecutor(max_workers=4) as pool:
            rows = list(pool.map(one, symbols))
        rows = score_group(rows)
        rows.sort(key=lambda r: (r["score"] is None, -(r["score"] or 0)))
        return {"rows": rows, "weights": [{"key": k, "weight": w, "higherIsBetter": h} for k, w, h in SCORE_PARTS]}

    return _cached("scan:" + ",".join(symbols), 1800, build)
