from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..db import WatchlistItem, get_session

from ..services.market import HISTORY_RANGES, get_compare_rows, get_fundamentals, get_history, get_news, get_quote, get_quotes
from ..services.analysis import get_analysis
from ..services.stockscan import get_list, get_relative, get_scan, get_trend, get_trend_chart
from ..tickers import BIGTECH, UNIVERSE, UNIVERSE_BY_SYMBOL

router = APIRouter(prefix="/stocks", tags=["stocks"])


@router.get("/universe")
def universe():
    return UNIVERSE


@router.get("/quotes")
def quotes(symbols: str):
    """Comma-separated symbols, e.g. ?symbols=NVDA,AMD,005930.KS"""
    return get_quotes([s.strip().upper() for s in symbols.split(",") if s.strip()])


@router.get("/compare")
def compare(symbols: str):
    """Comma-separated symbols; returns quote + trailing PE for sorting/comparison."""
    syms = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    rows = get_compare_rows(syms)
    return [{**row, **UNIVERSE_BY_SYMBOL.get(row["symbol"], {})} for row in rows]


def watchlist_symbols(session: Session) -> list[str]:
    return [i.symbol for i in session.exec(select(WatchlistItem)).all()]


@router.get("/list")
def stock_list(session: Session = Depends(get_session)):
    """종목 tab: big-tech group + the watchlist, each with today's trend call, rating and scores."""
    result = get_list(watchlist_symbols(session))
    quotes = {q["symbol"]: q for q in get_quotes([r["symbol"] for r in result["rows"]])}
    watched = set(watchlist_symbols(session))
    rows = []
    for r in result["rows"]:
        q = quotes.get(r["symbol"]) or {}
        rows.append({**r, **{k: v for k, v in UNIVERSE_BY_SYMBOL.get(r["symbol"], {}).items() if k != "symbol"},
                     "price": q.get("price"), "changePercent": q.get("changePercent"),
                     "quoteCurrency": q.get("currency"), "watched": r["symbol"] in watched})
    return {"rows": rows}


@router.get("/scan")
def scan(symbols: str | None = None):
    """Relative strength + financial change score for a peer group (default: Magnificent 7 + 삼성전자 + SK하이닉스)."""
    syms = [s.strip().upper() for s in symbols.split(",") if s.strip()] if symbols else BIGTECH
    result = get_scan(syms)
    for row in result["rows"]:
        row.update({k: v for k, v in UNIVERSE_BY_SYMBOL.get(row["symbol"], {}).items() if k != "symbol"})
    return result


@router.get("/{symbol}/analysis")
def analysis(symbol: str):
    """Research-note style call: rating, bear/base/bull targets, thesis, catalysts, risks, trend signal."""
    return get_analysis(symbol.upper())


@router.get("/{symbol}/trend")
def trend(symbol: str):
    return get_trend(symbol.upper())


@router.get("/{symbol}/trend-chart")
def trend_chart(symbol: str):
    """1 year of close + 200-day average with the BUY/SELL trade days marked."""
    return get_trend_chart(symbol.upper())


@router.get("/{symbol}/relative")
def relative(symbol: str):
    return get_relative(symbol.upper())


@router.get("/{symbol}/quote")
def quote(symbol: str):
    return get_quote(symbol.upper())


@router.get("/{symbol}/history")
def history(symbol: str, range: str = "1mo"):
    if range not in HISTORY_RANGES:
        raise HTTPException(status_code=400, detail=f"range must be one of {list(HISTORY_RANGES)}")
    return get_history(symbol.upper(), range)


@router.get("/{symbol}/fundamentals")
def fundamentals(symbol: str):
    return get_fundamentals(symbol.upper())


@router.get("/{symbol}/news")
def news(symbol: str):
    return get_news(symbol.upper())
