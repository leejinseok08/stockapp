import os

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlmodel import Session, select

from ..db import WatchlistItem, get_session
from ..services import screener
from ..services.market import _cached

router = APIRouter(prefix="/swing", tags=["swing"])


@router.get("")
def latest():
    """The latest stored scan per market (KR after 16:40 KST, US after 07:10 KST)."""
    return screener.latest()


@router.get("/sells")
def sells(session: Session = Depends(get_session)):
    """SELL on held positions that were bought on a passing technique's signal (buy date required)."""
    held = [{"symbol": i.symbol, "buyPrice": i.buy_price, "buyDate": i.buy_date}
            for i in session.exec(select(WatchlistItem)).all() if i.buy_price and i.quantity and i.buy_date]
    key = "swing-sells:" + "|".join(f"{h['symbol']},{h['buyPrice']},{h['buyDate']}" for h in sorted(held, key=lambda h: h["symbol"]))
    return _cached(key, 20 * 60, lambda: screener.sells(held))


@router.get("/records")
def records():
    """Backtest record per technique and market, and whether it passes."""
    return screener.records()


@router.post("/run")
def run(market: str, x_cron_secret: str | None = Header(default=None)):
    secret = os.getenv("CRON_SECRET")
    if not secret or x_cron_secret != secret:
        raise HTTPException(status_code=403, detail="forbidden")
    if market not in ("KR", "US"):
        raise HTTPException(status_code=400, detail="market must be KR or US")
    return {"started": screener.run_async(market)}
