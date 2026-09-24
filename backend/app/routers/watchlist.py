from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..db import WatchlistItem, get_session
from ..services.market import get_quotes
from ..tickers import UNIVERSE_BY_SYMBOL

router = APIRouter(prefix="/watchlist", tags=["watchlist"])


@router.get("")
def list_watchlist(session: Session = Depends(get_session)):
    symbols = [w.symbol for w in session.exec(select(WatchlistItem)).all()]
    quotes = {q["symbol"]: q for q in get_quotes(symbols)} if symbols else {}
    return [
        {**quotes.get(s, {"symbol": s}), **UNIVERSE_BY_SYMBOL.get(s, {})}
        for s in symbols
    ]


@router.post("/{symbol}")
def add_to_watchlist(symbol: str, session: Session = Depends(get_session)):
    symbol = symbol.upper()
    existing = session.exec(select(WatchlistItem).where(WatchlistItem.symbol == symbol)).first()
    if not existing:
        session.add(WatchlistItem(symbol=symbol))
        session.commit()
    return {"symbol": symbol, "added": True}


@router.delete("/{symbol}")
def remove_from_watchlist(symbol: str, session: Session = Depends(get_session)):
    symbol = symbol.upper()
    existing = session.exec(select(WatchlistItem).where(WatchlistItem.symbol == symbol)).first()
    if not existing:
        raise HTTPException(status_code=404, detail="not in watchlist")
    session.delete(existing)
    session.commit()
    return {"symbol": symbol, "removed": True}
