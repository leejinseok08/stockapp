"""Search (any KR/US listing), dividends/distributions, and portfolio performance."""

import json
import logging
import urllib.parse
import urllib.request
from datetime import datetime

import pandas as pd
import yfinance as yf

from .macro import KST
from .market import _cached, _num, get_quote

log = logging.getLogger("stockapp.extras")


# ---- search ---------------------------------------------------------------------------------------

def naver_to_symbol(item: dict) -> str | None:
    """Naver autocomplete item -> the Yahoo-style symbol the rest of the app uses."""
    code, t = item.get("code"), item.get("typeCode")
    if not code:
        return None
    if item.get("nationCode") == "KOR":
        return f"{code}.KQ" if t == "KOSDAQ" else f"{code}.KS"
    if item.get("nationCode") == "USA":
        return code.replace(".", "-")
    return None


def search(q: str) -> list[dict]:
    q = q.strip()
    if not q:
        return []

    def fetch():
        url = f"https://ac.stock.naver.com/ac?q={urllib.parse.quote(q)}&target=stock"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Referer": "https://finance.naver.com"})
        items = json.loads(urllib.request.urlopen(req, timeout=8).read()).get("items", [])
        out = []
        for i in items:
            sym = naver_to_symbol(i)
            if sym:
                out.append({"symbol": sym, "name": i.get("name"), "market": i.get("typeName") or i.get("typeCode"),
                            "nation": i.get("nationCode")})
        return out[:15]

    return _cached(f"search:{q.lower()}", 3600, fetch)


# ---- dividends -------------------------------------------------------------------------------------

def dividend_summary(divs: pd.Series, calendar: dict | None, today: pd.Timestamp) -> dict:
    """Last payment, trailing-year total, frequency, and the next ex-date: the company's announced
    date when there is one, otherwise the usual interval after the last one (marked as an estimate)."""
    divs = divs.dropna()
    divs = divs[divs > 0]
    if divs.index.tz is not None:
        divs.index = divs.index.tz_localize(None)
    if divs.empty:
        return {"pays": False}
    recent = divs[divs.index >= divs.index[-1] - pd.Timedelta(days=730)]
    gaps = recent.index.to_series().diff().dt.days.dropna()
    gap = float(gaps.median()) if len(gaps) else 365.0
    freq = "월" if gap < 45 else "분기" if gap < 120 else "반기" if gap < 240 else "연"
    ttm = float(divs[divs.index > today - pd.Timedelta(days=365)].sum())
    nxt, estimated = None, False
    ex = (calendar or {}).get("Ex-Dividend Date")
    if ex is not None and pd.Timestamp(ex) >= today:
        nxt = pd.Timestamp(ex)
    else:
        guess = divs.index[-1] + pd.Timedelta(days=round(gap))
        while guess < today:
            guess += pd.Timedelta(days=round(gap))
        nxt, estimated = guess, True
    return {
        "pays": True,
        "lastExDate": divs.index[-1].strftime("%Y-%m-%d"),
        "lastAmount": float(divs.iloc[-1]),
        "ttm": ttm,
        "frequency": freq,
        "nextExDate": nxt.strftime("%Y-%m-%d") if nxt is not None else None,
        "nextEstimated": estimated,
        "history": [{"date": d.strftime("%Y-%m-%d"), "amount": float(v)} for d, v in divs.iloc[-8:].items()],
    }


def get_dividends(symbol: str) -> dict:
    def fetch():
        t = yf.Ticker(symbol)
        today = pd.Timestamp(datetime.now(KST).date())
        try:
            cal = t.calendar if isinstance(t.calendar, dict) else {}
        except Exception:
            cal = {}
        s = dividend_summary(t.dividends, cal, today)
        q = get_quote(symbol) or {}
        if s.get("pays") and q.get("price"):
            s["yieldTTM"] = s["ttm"] / q["price"]
        return {"symbol": symbol, "currency": q.get("currency"), **s}

    return _cached(f"div:{symbol}", 12 * 3600, fetch)


# ---- portfolio -------------------------------------------------------------------------------------

def _benchmark(symbol: str) -> str:
    return "^KS11" if symbol.endswith((".KS", ".KQ")) else "^GSPC"


def performance(holdings: list[dict]) -> dict:
    """Totals in KRW (USD converted at today's USD/KRW, stated) and, for positions with a buy date,
    the stock's return next to its home index's return over the same days."""
    usdkrw = (get_quote("KRW=X") or {}).get("price")
    rows, total_cost, total_value = [], 0.0, 0.0
    for h in holdings:
        q = get_quote(h["symbol"]) or {}
        price = q.get("price") or h["buyPrice"]
        cur = q.get("currency") or ("KRW" if h["symbol"].endswith((".KS", ".KQ")) else "USD")
        fx = 1.0 if cur == "KRW" else (usdkrw or 0) if cur == "USD" else None
        cost, value = h["buyPrice"] * h["quantity"], price * h["quantity"]
        ret = value / cost - 1 if cost else None
        bench = None
        if h.get("buyDate"):
            try:
                b = _benchmark(h["symbol"])
                c = yf.Ticker(b).history(start=h["buyDate"], interval="1d")["Close"].dropna()
                if len(c) > 1:
                    bench = {"symbol": b, "name": "코스피" if b == "^KS11" else "S&P500", "return": float(c.iloc[-1] / c.iloc[0] - 1)}
            except Exception as e:
                log.warning("benchmark %s failed: %s", h["symbol"], e)
        if fx:
            total_cost += cost * fx
            total_value += value * fx
        rows.append({"symbol": h["symbol"], "currency": cur, "cost": cost, "value": value, "return": ret,
                     "buyDate": h.get("buyDate"), "benchmark": bench,
                     "excess": ret - bench["return"] if ret is not None and bench else None,
                     "valueKRW": value * fx if fx else None})
    return {"usdkrw": usdkrw, "totalCostKRW": total_cost, "totalValueKRW": total_value,
            "totalReturn": total_value / total_cost - 1 if total_cost else None, "rows": rows}
