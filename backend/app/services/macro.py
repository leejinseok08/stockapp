"""Market-wide numbers for timing ISA purchases: indices, investor flows (수급), currency strength."""

import logging
import os
from datetime import datetime, timedelta, timezone

import pandas as pd
import yfinance as yf

from .market import _cached, _num

log = logging.getLogger("stockapp.macro")
KST = timezone(timedelta(hours=9))

INDICES = [
    {"symbol": "^GSPC", "name": "S&P 500", "region": "US"},
    {"symbol": "^NDX", "name": "나스닥 100", "region": "US"},
    {"symbol": "^SOX", "name": "필라델피아 반도체", "region": "US"},
    # KODEX 미국반도체 tracks MVIS US Listed Semiconductor 25, the same index as SMH (dividend-adjusted ETF price).
    {"symbol": "SMH", "name": "미국 반도체 (SMH)", "region": "US"},
    {"symbol": "^KS11", "name": "코스피", "region": "KR"},
    {"symbol": "^KQ11", "name": "코스닥", "region": "KR"},
]

# Yahoo quotes these as units of the currency per 1 USD (except EUR, quoted as USD per EUR).
CURRENCIES = [
    {"code": "KRW", "name": "원", "ticker": "KRW=X", "usd_base": True},
    {"code": "JPY", "name": "엔", "ticker": "JPY=X", "usd_base": True},
    {"code": "CNY", "name": "위안", "ticker": "CNY=X", "usd_base": True},
    {"code": "TWD", "name": "대만 달러", "ticker": "TWD=X", "usd_base": True},
    {"code": "EUR", "name": "유로", "ticker": "EURUSD=X", "usd_base": False},
]
DXY = {"ticker": "DX-Y.NYB", "name": "달러 인덱스"}

FLOW_MARKETS = ["KOSPI", "KOSDAQ"]
FLOW_COLUMNS = {"외국인합계": "foreign", "기관합계": "institution", "개인": "individual"}


def _pct(a: float | None, b: float | None) -> float | None:
    if a is None or b is None or b == 0:
        return None
    return (a / b - 1) * 100


def _daily_closes(ticker: str) -> pd.Series:
    def fetch():
        df = yf.Ticker(ticker).history(period="1y", interval="1d", auto_adjust=False)
        return df["Close"].dropna()

    return _cached(f"daily:{ticker}", 900, fetch)


def _trend_stats(closes: pd.Series) -> dict:
    """Level and momentum from a daily close series (needs ~1y for the 200-day average)."""
    if closes.empty:
        return {}
    last = float(closes.iloc[-1])
    prev = float(closes.iloc[-2]) if len(closes) > 1 else None
    month_ago = float(closes.iloc[-22]) if len(closes) > 21 else None
    ma200 = float(closes.iloc[-200:].mean()) if len(closes) >= 200 else None
    hi, lo = float(closes.max()), float(closes.min())
    return {
        "last": last,
        "asOf": closes.index[-1].strftime("%Y-%m-%d"),
        "change1d": _pct(last, prev),
        "change1m": _pct(last, month_ago),
        "vsMa200": _pct(last, ma200),
        # 0 = at the 52-week low, 100 = at the 52-week high
        "range52w": (last - lo) / (hi - lo) * 100 if hi > lo else None,
    }


def get_indices() -> list[dict]:
    out = []
    for idx in INDICES:
        try:
            stats = _trend_stats(_daily_closes(idx["symbol"]))
        except Exception as e:
            log.warning("index %s failed: %s", idx["symbol"], e)
            stats = {}
        out.append({**idx, **stats})
    return out


def get_currencies() -> dict:
    """Strength of each currency against USD. Positive = the currency got stronger."""
    rows = []
    for cur in CURRENCIES:
        try:
            s = _trend_stats(_daily_closes(cur["ticker"]))
        except Exception as e:
            log.warning("fx %s failed: %s", cur["ticker"], e)
            s = {}
        sign = -1 if cur["usd_base"] else 1  # KRW=X rising means the won weakened
        flip = lambda v: sign * v if v is not None else None  # noqa: E731
        rows.append({
            "code": cur["code"],
            "name": cur["name"],
            "quote": s.get("last"),
            "quoteLabel": f"USD/{cur['code']}" if cur["usd_base"] else f"{cur['code']}/USD",
            "asOf": s.get("asOf"),
            "strength1d": flip(s.get("change1d")),
            "strength1m": flip(s.get("change1m")),
        })
    rows.sort(key=lambda r: (r["strength1m"] is None, -(r["strength1m"] or 0)))
    try:
        dxy = {"name": DXY["name"], **_trend_stats(_daily_closes(DXY["ticker"]))}
    except Exception as e:
        log.warning("dxy failed: %s", e)
        dxy = {"name": DXY["name"]}
    return {"dollarIndex": dxy, "currencies": rows}


def krx_configured() -> bool:
    return bool(os.getenv("KRX_ID") and os.getenv("KRX_PW"))


def _flow_frame(market: str, days: int = 400) -> pd.DataFrame:
    # A year+ of history so signals can rank today's flows against the past, not just show them.
    from pykrx import stock  # heavy import; only when flows are requested

    def fetch():
        today = datetime.now(KST)
        start = (today - timedelta(days=days)).strftime("%Y%m%d")
        df = stock.get_market_trading_value_by_date(start, today.strftime("%Y%m%d"), market)
        return df[list(FLOW_COLUMNS)].rename(columns=FLOW_COLUMNS)

    return _cached(f"flow:{market}", 1800, fetch)


def get_flows() -> dict:
    """Net buying (KRW) by investor type, per market. Needs KRX_ID/KRX_PW (KRX now requires login)."""
    if not krx_configured():
        return {"available": False, "reason": "krx_login_required", "markets": []}
    markets = []
    for market in FLOW_MARKETS:
        try:
            df = _flow_frame(market)
        except Exception as e:
            log.warning("flows %s failed: %s", market, e)
            continue
        if df.empty:
            continue
        last20 = df.tail(20)
        markets.append({
            "market": market,
            "asOf": last20.index[-1].strftime("%Y-%m-%d"),
            "sum5d": {k: float(last20[k].tail(5).sum()) for k in FLOW_COLUMNS.values()},
            "sum20d": {k: float(last20[k].sum()) for k in FLOW_COLUMNS.values()},
            "daily": [
                {"date": d.strftime("%Y-%m-%d"), **{k: float(row[k]) for k in FLOW_COLUMNS.values()}}
                for d, row in last20.iterrows()
            ],
        })
    if not markets:
        return {"available": False, "reason": "fetch_failed", "markets": []}
    return {"available": True, "markets": markets}


def get_overview() -> dict:
    return _cached(
        "macro:overview",
        600,
        lambda: {
            "indices": get_indices(),
            "fx": get_currencies(),
            "flows": get_flows(),
            "generatedAt": datetime.now(KST).isoformat(timespec="minutes"),
        },
    )


def snapshot_rows(overview: dict) -> list[tuple[str, str, float]]:
    """Flatten the overview into (date, series, value) rows for long-term storage and backtests."""
    rows: list[tuple[str, str, float]] = []

    def add(date, series, value):
        v = _num(value)
        if date and v is not None:
            rows.append((date, series, v))

    for idx in overview["indices"]:
        add(idx.get("asOf"), f"index:{idx['symbol']}:close", idx.get("last"))
    for cur in overview["fx"]["currencies"]:
        add(cur.get("asOf"), f"fx:{cur['quoteLabel']}", cur.get("quote"))
    dxy = overview["fx"]["dollarIndex"]
    add(dxy.get("asOf"), "fx:DXY", dxy.get("last"))
    for m in overview["flows"].get("markets", []):
        for point in m["daily"]:
            for investor in FLOW_COLUMNS.values():
                add(point["date"], f"flow:{m['market']}:{investor}", point[investor])
    return rows
