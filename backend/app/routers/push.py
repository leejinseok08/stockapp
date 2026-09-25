import os

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from ..services import push
from ..services.risk import get_risk
from ..services.today import get_today
from ..db import engine
from sqlmodel import Session
from .stocks import watchlist_symbols

router = APIRouter(prefix="/push", tags=["push"])


class Keys(BaseModel):
    p256dh: str
    auth: str


class Subscription(BaseModel):
    endpoint: str
    keys: Keys


@router.get("/vapid-public-key")
def vapid_public_key():
    key = push.public_key()
    if not key:
        raise HTTPException(status_code=503, detail="VAPID 키 미설정")
    return {"key": key}


@router.post("/subscribe")
def subscribe(sub: Subscription):
    push.save_subscription(sub.model_dump())
    return {"ok": True}


class Endpoint(BaseModel):
    endpoint: str


@router.post("/unsubscribe")
def unsubscribe(body: Endpoint):
    push.delete_subscription(body.endpoint)
    return {"ok": True}


@router.post("/test")
def test(body: Endpoint):
    n = push.send("StockApp 알림 켜짐", "매매 신호가 바뀌면 이렇게 알려드려요", only=body.endpoint)
    return {"sent": n}


@router.post("/run")
def run(x_cron_secret: str | None = Header(default=None)):
    """Called by the Cloudflare Worker cron after each market's close."""
    secret = os.getenv("CRON_SECRET")
    if not secret or x_cron_secret != secret:
        raise HTTPException(status_code=403, detail="forbidden")
    with Session(engine) as s:
        extra = watchlist_symbols(s)
    try:
        risk = get_risk()
    except Exception:
        risk = None
    return push.run_daily(get_today(extra), risk)
