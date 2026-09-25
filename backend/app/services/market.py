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


def _naver_quote(symbol: str) -> dict:
    """Korean listings: Naver is real time and uses the official close (after the closing auction);
    Yahoo is delayed and its last price can miss the auction by a tick or two."""
    import json
    import urllib.request

    code = symbol.split(".")[0]
    req = urllib.request.Request(f"https://m.stock.naver.com/api/stock/{code}/basic",
                                 headers={"User-Agent": "Mozilla/5.0"})
    d = json.loads(urllib.request.urlopen(req, timeout=8).read())
    price = float(d["closePrice"].replace(",", ""))
    move = float(d["compareToPreviousClosePrice"].replace(",", "").lstrip("-"))
    falling = (d.get("compareToPreviousPrice") or {}).get("name") in ("FALLING", "LOWER_LIMIT")
    change = -move if falling else move
    prev = price - change
    return {
        "symbol": symbol,
        "price": price,
        "previousClose": prev,
        "change": change,
        "changePercent": change / prev * 100 if prev else None,
        "currency": "KRW",
        "marketStatus": d.get("marketStatus"),
        "asOf": d.get("localTradedAt"),
        "source": "naver",
    }


def get_quote(symbol: str) -> dict:
    def fetch():
        if symbol.endswith((".KS", ".KQ")):
            try:
                return _naver_quote(symbol)
            except Exception:
                pass  # fall back to Yahoo below
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


def _get_trailing_pe(symbol: str) -> float | None:
    def fetch():
        return _num(yf.Ticker(symbol).info.get("trailingPE"))

    return _cached(f"pe:{symbol}", 6 * 3600, fetch)


def units_per_usd(currency: str | None) -> float | None:
    """How many units of `currency` one USD buys (e.g. KRW -> ~1390). Yahoo quotes this as `KRW=X`."""
    if not currency or currency == "USD":
        return 1.0

    def fetch():
        return _num(yf.Ticker(f"{currency}=X").fast_info.get("lastPrice"))

    return _cached(f"fx:{currency}", 600, fetch)


def get_compare_rows(symbols: list[str]) -> list[dict]:
    rows = []
    for symbol in symbols:
        quote = get_quote(symbol)
        try:
            pe = _get_trailing_pe(symbol)
        except Exception:
            pe = None  # yfinance .info is flaky; one bad symbol shouldn't sink the whole table
        try:
            rate = units_per_usd(quote.get("currency"))
        except Exception:
            rate = None
        cap = quote.get("marketCap")
        # Caps come in each listing's own currency; normalize so KRW and USD rows sort on one scale.
        cap_usd = cap / rate if cap is not None and rate else None
        rows.append({**quote, "trailingPE": pe, "marketCapUsd": cap_usd})
    return rows


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


def _clamp(v: float, lo: float = 0, hi: float = 100) -> float:
    return max(lo, min(hi, v))


def _avg(scores: list[float | None]) -> float | None:
    present = [s for s in scores if s is not None]
    return sum(present) / len(present) if present else None


def _compute_scores(ratios: dict) -> dict:
    """Simple heuristic 0-100 scores per category, Simply Wall St style.

    Not industry-relative (no peer comparison data available) — just maps
    each ratio onto a reasonable absolute scale so the radar chart has
    something meaningful to show.
    """
    pe = ratios["trailingPE"]
    pb = ratios["priceToBook"]
    valuation = _avg([
        _clamp(100 - (pe - 5) * 2.5) if pe is not None and pe > 0 else None,
        _clamp(100 - (pb - 0.5) * 10) if pb is not None and pb > 0 else None,
    ])

    profitability = _avg([
        _clamp(ratios["profitMargins"] * 250) if ratios["profitMargins"] is not None else None,
        _clamp(ratios["operatingMargins"] * 250) if ratios["operatingMargins"] is not None else None,
        _clamp(ratios["returnOnEquity"] * 250) if ratios["returnOnEquity"] is not None else None,
    ])

    de = ratios["debtToEquity"]
    health = _clamp(100 - de * 0.5) if de is not None else None

    growth = _avg([
        _clamp(50 + ratios["revenueGrowth"] * 150) if ratios["revenueGrowth"] is not None else None,
        _clamp(50 + ratios["earningsGrowth"] * 150) if ratios["earningsGrowth"] is not None else None,
    ])

    return {
        "valuation": valuation,
        "profitability": profitability,
        "health": health,
        "growth": growth,
    }


def get_fundamentals(symbol: str) -> dict:
    def fetch():
        t = yf.Ticker(symbol)
        info = t.info
        ratios = {
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
        }
        return {
            "symbol": symbol,
            "name": info.get("longName") or info.get("shortName"),
            "sector": info.get("sector"),
            "industry": info.get("industry"),
            "summary": info.get("longBusinessSummary"),
            "financialCurrency": info.get("financialCurrency") or info.get("currency"),
            "ratios": ratios,
            "scores": _compute_scores(ratios),
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


def get_logo(symbol: str) -> str | None:
    """Company logo from Naver Securities (PNG URL). Korean codes use the domestic API; US
    symbols try the NASDAQ code (".O") first, then the plain NYSE code. Cached for a week."""
    import json
    import urllib.request

    def fetch():
        if symbol.endswith((".KS", ".KQ")):
            urls = [f"https://m.stock.naver.com/api/stock/{symbol.split('.')[0]}/basic"]
        else:
            base = symbol.replace("-", ".")
            urls = [f"https://api.stock.naver.com/stock/{base}.O/basic", f"https://api.stock.naver.com/stock/{base}/basic"]
        for url in urls:
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
                d = json.loads(urllib.request.urlopen(req, timeout=6).read())
                if d.get("itemLogoPngUrl"):
                    return d["itemLogoPngUrl"]
            except Exception:
                continue
        return None

    return _cached(f"logo:{symbol}", 7 * 24 * 3600, fetch)
