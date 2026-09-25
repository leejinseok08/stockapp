from fastapi import APIRouter, Depends
from sqlmodel import Session

from ..db import get_session
from ..services.today import get_today
from .stocks import watchlist_symbols

router = APIRouter(tags=["today"])


@router.get("/today")
def today(session: Session = Depends(get_session)):
    return get_today(watchlist_symbols(session))
