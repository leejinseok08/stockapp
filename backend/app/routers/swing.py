import os

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlmodel import Session, select

from ..db import WatchlistItem, get_session
from ..services import paper, screener
from ..services.market import _cached

router = APIRouter(prefix="/swing", tags=["swing"])


@router.get("")
def latest(full: bool = False):
    """The latest stored scan per market (KR after 16:40 KST, US after 07:10 KST). The app reads only
    the merged BUY list, so the per-technique groups and excluded records (most of the 65KB) are left
    out unless ?full=1."""
    return screener.latest() if full else {m: slim(s) for m, s in screener.latest().items()}


def slim(scan: dict) -> dict:
    if scan.get("buys") is None:  # a scan stored before the merged list existed still needs its groups
        return scan
    return {k: v for k, v in scan.items() if k not in ("groups", "excluded")}


@router.get("/sells")
def sells(session: Session = Depends(get_session)):
    """SELL on held positions that were bought on a passing technique's signal (buy date required)."""
    held = [{"symbol": i.symbol, "buyPrice": i.buy_price, "buyDate": i.buy_date}
            for i in session.exec(select(WatchlistItem)).all() if i.buy_price and i.quantity and i.buy_date]
    key = "swing-sells:" + "|".join(f"{h['symbol']},{h['buyPrice']},{h['buyDate']}" for h in sorted(held, key=lambda h: h["symbol"]))
    return _cached(key, 20 * 60, lambda: screener.sells(held))


@router.get("/paper")
def paper_summary():
    """Paper trading of the live signals since the first logged scan: model account and per technique."""
    return paper.summary()


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
