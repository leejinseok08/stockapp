"""Stock heatmap for the 시장 tab: large caps grouped by sector, sized by market cap, colored by
today's move. Moves use the same quote as every other screen (Naver for Korea, Yahoo for the US) so
the numbers agree across the app. Caps change slowly, so they are cached for half a day."""

import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

import yfinance as yf

from .macro import KST
from .market import _cached, _num, get_quote

log = logging.getLogger("stockapp.heatmap")

MARKETS = [
    {"id": "US", "name": "미국 대형주", "currency": "USD", "sectors": {
        "기술": [("AAPL", "Apple"), ("MSFT", "Microsoft"), ("NVDA", "NVIDIA"), ("AVGO", "Broadcom"), ("ORCL", "Oracle"),
                ("AMD", "AMD"), ("CRM", "Salesforce"), ("ADBE", "Adobe"), ("QCOM", "Qualcomm"), ("MU", "Micron"),
                ("AMAT", "Applied Mat."), ("INTC", "Intel")],
        "커뮤니케이션": [("GOOGL", "Alphabet"), ("META", "Meta"), ("NFLX", "Netflix"), ("TMUS", "T-Mobile")],
        "소비재": [("AMZN", "Amazon"), ("TSLA", "Tesla"), ("HD", "Home Depot"), ("COST", "Costco"), ("WMT", "Walmart"),
                 ("MCD", "McDonald's"), ("PG", "P&G"), ("KO", "Coca-Cola")],
        "금융": [("BRK-B", "Berkshire"), ("JPM", "JPMorgan"), ("V", "Visa"), ("MA", "Mastercard"), ("BAC", "BofA")],
        "헬스케어": [("LLY", "Eli Lilly"), ("UNH", "UnitedHealth"), ("JNJ", "J&J"), ("ABBV", "AbbVie"), ("MRK", "Merck")],
        "에너지·산업재": [("XOM", "Exxon"), ("CVX", "Chevron"), ("GE", "GE Aero"), ("CAT", "Caterpillar")],
    }},
    {"id": "KR", "name": "한국 대형주", "currency": "KRW", "sectors": {
        "반도체": [("005930.KS", "삼성전자"), ("000660.KS", "SK하이닉스"), ("042700.KS", "한미반도체")],
        "2차전지·화학": [("373220.KS", "LG에너지솔루션"), ("006400.KS", "삼성SDI"), ("051910.KS", "LG화학")],
        "바이오": [("207940.KS", "삼성바이오로직스"), ("068270.KS", "셀트리온")],
        "자동차": [("005380.KS", "현대차"), ("000270.KS", "기아"), ("012330.KS", "현대모비스")],
        "금융": [("105560.KS", "KB금융"), ("055550.KS", "신한지주")],
        "인터넷": [("035420.KS", "NAVER"), ("035720.KS", "카카오")],
        "방산·조선": [("012450.KS", "한화에어로스페이스"), ("329180.KS", "HD현대중공업")],
        "소재·지주": [("005490.KS", "POSCO홀딩스"), ("028260.KS", "삼성물산")],
    }},
]


def _cap(symbol: str) -> float | None:
    return _cached(f"cap:{symbol}", 12 * 3600, lambda: _num(yf.Ticker(symbol).fast_info.get("marketCap")))


def build_market(m: dict) -> dict:
    symbols = [s for stocks in m["sectors"].values() for s, _ in stocks]
    with ThreadPoolExecutor(max_workers=8) as pool:
        caps = dict(zip(symbols, pool.map(lambda s: _safe(_cap, s), symbols)))
        quotes = pool.map(lambda s: _safe(get_quote, s), symbols)
        moves = {s: q["changePercent"] for s, q in zip(symbols, quotes) if q and q.get("changePercent") is not None}
    sectors = []
    for name, stocks in m["sectors"].items():
        cells = [{"symbol": s, "name": n, "cap": caps.get(s), "change": moves.get(s)}
                 for s, n in stocks if caps.get(s)]
        if cells:
            sectors.append({"name": name, "stocks": sorted(cells, key=lambda c: -c["cap"])})
    sectors.sort(key=lambda sec: -sum(c["cap"] for c in sec["stocks"]))
    return {"id": m["id"], "name": m["name"], "currency": m["currency"], "sectors": sectors}


def _safe(fn, *args):
    try:
        return fn(*args)
    except Exception as e:
        log.warning("heatmap input %s%s failed: %s", fn.__name__, args[:1], e)
        return None


def get_heatmap() -> dict:
    return _cached("heatmap", 300, lambda: {
        "markets": [build_market(m) for m in MARKETS],
        "generatedAt": datetime.now(KST).isoformat(timespec="minutes"),
    })
