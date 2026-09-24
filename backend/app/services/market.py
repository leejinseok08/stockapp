import time
from typing import Any

import pandas as pd
import yfinance as yf

_CACHE: dict[str, tuple[float, Any]] = {}


def _cached(key: str, ttl: float, fn):
    now = time.time()
    hit = _CACHE.get(key)
    if hit and now - hit[0] < ttl:
        return hit[1]
    value = fn()
    _CACHE[key] = (now, value)
    return value


def _num(value) -> float | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def get_quote(symbol: str) -> dict:
    def fetch():
        fi = yf.Ticker(symbol).fast_info
        price = _num(fi.get("lastPrice"))
        prev = _num(fi.get("previousClose"))
        change = price - prev if price is not None and prev else None
        return {
            "symbol": symbol,
            "price": price,
            "previousClose": prev,
            "change": change,
            "changePercent": (change / prev * 100) if change is not None else None,
            "currency": fi.get("currency"),
            "marketCap": _num(fi.get("marketCap")),
            "volume": _num(fi.get("lastVolume")),
        }

    return _cached(f"quote:{symbol}", 15, fetch)


def get_quotes(symbols: list[str]) -> list[dict]:
    return [get_quote(s) for s in symbols]


HISTORY_RANGES = {
    "1d": ("1d", "5m"),
    "5d": ("5d", "30m"),
    "1mo": ("1mo", "1d"),
    "6mo": ("6mo", "1d"),
    "1y": ("1y", "1d"),
    "5y": ("5y", "1wk"),
}


def get_history(symbol: str, range_: str) -> list[dict]:
    period, interval = HISTORY_RANGES[range_]

    def fetch():
        df = yf.Ticker(symbol).history(period=period, interval=interval)
        return [
            {"t": int(ts.timestamp() * 1000), "close": _num(row["Close"])}
            for ts, row in df.iterrows()
        ]

    return _cached(f"hist:{symbol}:{range_}", 60, fetch)


_STATEMENT_ROWS = {
    "income": ["Total Revenue", "Gross Profit", "Operating Income", "Net Income", "EBITDA"],
    "balance": ["Total Assets", "Total Liabilities Net Minority Interest", "Stockholders Equity", "Cash And Cash Equivalents", "Total Debt"],
    "cashflow": ["Operating Cash Flow", "Capital Expenditure", "Free Cash Flow"],
}


def _statement(df: pd.DataFrame, rows: list[str]) -> list[dict]:
    if df is None or df.empty:
        return []
    periods = [c.strftime("%Y-%m-%d") for c in df.columns]
    out = []
    for row in rows:
        if row in df.index:
            out.append({
                "item": row,
                "values": dict(zip(periods, (_num(v) for v in df.loc[row]))),
            })
    return out


def get_fundamentals(symbol: str) -> dict:
    def fetch():
        t = yf.Ticker(symbol)
        info = t.info
        return {
            "symbol": symbol,
            "name": info.get("longName") or info.get("shortName"),
            "sector": info.get("sector"),
            "industry": info.get("industry"),
            "summary": info.get("longBusinessSummary"),
            "ratios": {
                "trailingPE": _num(info.get("trailingPE")),
                "forwardPE": _num(info.get("forwardPE")),
                "priceToBook": _num(info.get("priceToBook")),
                "returnOnEquity": _num(info.get("returnOnEquity")),
                "profitMargins": _num(info.get("profitMargins")),
                "operatingMargins": _num(info.get("operatingMargins")),
                "revenueGrowth": _num(info.get("revenueGrowth")),
                "earningsGrowth": _num(info.get("earningsGrowth")),
                "debtToEquity": _num(info.get("debtToEquity")),
                "dividendYield": _num(info.get("dividendYield")),
                "fiftyTwoWeekHigh": _num(info.get("fiftyTwoWeekHigh")),
                "fiftyTwoWeekLow": _num(info.get("fiftyTwoWeekLow")),
            },
            "income": _statement(t.income_stmt, _STATEMENT_ROWS["income"]),
            "balance": _statement(t.balance_sheet, _STATEMENT_ROWS["balance"]),
            "cashflow": _statement(t.cashflow, _STATEMENT_ROWS["cashflow"]),
        }

    return _cached(f"fund:{symbol}", 6 * 3600, fetch)


def _parse_news_item(item: dict, symbol: str) -> dict | None:
    content = item.get("content") or item
    title = content.get("title")
    if not title:
        return None
    url = (
        (content.get("canonicalUrl") or {}).get("url")
        or (content.get("clickThroughUrl") or {}).get("url")
        or content.get("link")
    )
    provider = (content.get("provider") or {}).get("displayName") or content.get("publisher")
    published = content.get("pubDate") or content.get("providerPublishTime")
    return {
        "symbol": symbol,
        "title": title,
        "url": url,
        "publisher": provider,
        "published": published,
    }


def get_news(symbol: str) -> list[dict]:
    def fetch():
        items = yf.Ticker(symbol).news or []
        return [n for n in (_parse_news_item(i, symbol) for i in items) if n]

    return _cached(f"news:{symbol}", 600, fetch)
