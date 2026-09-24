from fastapi import APIRouter, HTTPException

from ..services.market import HISTORY_RANGES, get_compare_rows, get_fundamentals, get_history, get_news, get_quote, get_quotes
from ..tickers import UNIVERSE, UNIVERSE_BY_SYMBOL

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
