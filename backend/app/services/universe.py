"""The whole-market list the swing screener scans: liquid stocks only (thin stocks lose their edge to
the spread). Korea: every KOSPI/KOSDAQ common stock with today's trading value >= 50억 원.
US: the 1,000 largest NASDAQ/NYSE stocks by market cap with trading value >= $50M.
Source: Naver Securities' market-cap listings (the same place the app gets names and logos)."""

import json
import logging
import urllib.request

from .market import _cached

log = logging.getLogger("stockapp.universe")

KR_MIN_VALUE = 5_000_000_000  # KRW per day
US_MIN_VALUE = 50_000_000  # USD per day
US_TOP = 1000


def _get(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Referer": "https://m.stock.naver.com"})
    return json.loads(urllib.request.urlopen(req, timeout=15).read())


def _num(s) -> float:
    try:
        return float(str(s).replace(",", ""))
    except (TypeError, ValueError):
        return 0.0


def kr_list() -> list[dict]:
    out = []
    for market, suffix in (("KOSPI", ".KS"), ("KOSDAQ", ".KQ")):
        page = 1
        while True:
            d = _get(f"https://m.stock.naver.com/api/stocks/marketValue/{market}?page={page}&pageSize=100")
            stocks = d.get("stocks") or []
            for s in stocks:
                if s.get("stockEndType") != "stock":
                    continue
                value = _num(s.get("accumulatedTradingValue")) * 1_000_000  # 백만원
                out.append({"symbol": s["itemCode"] + suffix, "name": s.get("stockName"), "market": "KR",
                            "exchange": market, "tradingValue": value, "cap": _num(s.get("marketValue")) * 1e8})
            if len(stocks) < 100 or page > 40:
                break
            page += 1
    return [s for s in out if s["tradingValue"] >= KR_MIN_VALUE]


def us_list() -> list[dict]:
    out = []
    for ex in ("NASDAQ", "NYSE"):
        for page in range(1, US_TOP // 100 + 1):
            d = _get(f"https://api.stock.naver.com/stock/exchange/{ex}/marketValue?page={page}&pageSize=100")
            for s in d.get("stocks") or []:
                if s.get("stockEndType") != "stock" or not s.get("symbolCode"):
                    continue
                price = _num(s.get("closePrice"))
                volume = _num(s.get("accumulatedTradingVolume"))
                out.append({"symbol": s["symbolCode"].replace(".", "-").replace(" ", "-"), "name": s.get("stockName"), "market": "US",
                            "exchange": ex, "tradingValue": price * volume, "cap": _num(s.get("marketValue"))})
    out.sort(key=lambda s: s["cap"], reverse=True)
    return [s for s in out[:US_TOP] if s["tradingValue"] >= US_MIN_VALUE]


def get_universe() -> list[dict]:
    def build():
        items = []
        for fn in (kr_list, us_list):
            try:
                items += fn()
            except Exception as e:
                log.warning("universe %s failed: %s", fn.__name__, e)
        return items

    return _cached("universe", 12 * 3600, build)
