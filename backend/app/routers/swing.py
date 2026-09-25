import os

from fastapi import APIRouter, Header, HTTPException

from ..services import screener

router = APIRouter(prefix="/swing", tags=["swing"])


@router.get("")
def latest():
    """The latest stored scan per market (KR after 16:40 KST, US after 07:10 KST)."""
    return screener.latest()


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
