from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..db import WatchlistItem, get_session
from ..services.extras import performance
from ..services.market import get_quotes
from ..tickers import UNIVERSE_BY_SYMBOL

router = APIRouter(prefix="/watchlist", tags=["watchlist"])


def _serialize(item: WatchlistItem, quote: dict | None) -> dict:
    return {
        **(quote or {"symbol": item.symbol}),
        **UNIVERSE_BY_SYMBOL.get(item.symbol, {}),
        "buyPrice": item.buy_price,
        "quantity": item.quantity,
        "note": item.note,
        "buyDate": item.buy_date,
    }


@router.get("")
def list_watchlist(session: Session = Depends(get_session)):
    items = session.exec(select(WatchlistItem)).all()
    quotes = {q["symbol"]: q for q in get_quotes([i.symbol for i in items])} if items else {}
    return [_serialize(i, quotes.get(i.symbol)) for i in items]


@router.post("/{symbol}")
def add_to_watchlist(symbol: str, session: Session = Depends(get_session)):
    symbol = symbol.upper()
    existing = session.exec(select(WatchlistItem).where(WatchlistItem.symbol == symbol)).first()
    if not existing:
        session.add(WatchlistItem(symbol=symbol))
        session.commit()
    return {"symbol": symbol, "added": True}


class WatchlistItemUpdate(BaseModel):
    buyPrice: float | None = None
    quantity: float | None = None
    note: str | None = None
    buyDate: str | None = None


@router.get("/performance")
def portfolio_performance(session: Session = Depends(get_session)):
    """KRW total (USD at today's rate, stated) and each position vs its home index since the buy date."""
    items = [i for i in session.exec(select(WatchlistItem)).all() if i.buy_price and i.quantity]
    return performance([{"symbol": i.symbol, "buyPrice": i.buy_price, "quantity": i.quantity, "buyDate": i.buy_date}
                        for i in items])


@router.patch("/{symbol}")
def update_watchlist_item(symbol: str, body: WatchlistItemUpdate, session: Session = Depends(get_session)):
    symbol = symbol.upper()
    existing = session.exec(select(WatchlistItem).where(WatchlistItem.symbol == symbol)).first()
    if not existing:
        raise HTTPException(status_code=404, detail="not in watchlist")
    fields = body.model_dump(exclude_unset=True)
    if "buyPrice" in fields:
        existing.buy_price = fields["buyPrice"]
    if "quantity" in fields:
        existing.quantity = fields["quantity"]
    if "note" in fields:
        existing.note = fields["note"]
    if "buyDate" in fields:
        existing.buy_date = fields["buyDate"] or None
    session.add(existing)
    session.commit()
    session.refresh(existing)
    return _serialize(existing, None)


@router.delete("/{symbol}")
def remove_from_watchlist(symbol: str, session: Session = Depends(get_session)):
    symbol = symbol.upper()
    existing = session.exec(select(WatchlistItem).where(WatchlistItem.symbol == symbol)).first()
    if not existing:
        raise HTTPException(status_code=404, detail="not in watchlist")
    session.delete(existing)
    session.commit()
    return {"symbol": symbol, "removed": True}
