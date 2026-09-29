import hmac
import os
import threading

from fastapi import APIRouter, Header, HTTPException

from ..services import kiwoom, kiwoom_mock, kiwoom_probe
from ..services.market import _cached

router = APIRouter(prefix="/kiwoom", tags=["kiwoom"])


def _cron(secret: str | None) -> None:
    want = os.getenv("CRON_SECRET")
    if not want or not secret or not hmac.compare_digest(secret, want):
        raise HTTPException(status_code=403, detail="forbidden")


@router.get("/status")
def status():
    return {"real": kiwoom.configured("real"), "mock": kiwoom.configured("mock"),
            "accountToken": bool(os.getenv("ACCOUNT_TOKEN"))}


@router.get("/account")
def account(x_account_token: str | None = Header(default=None)):
    """The owner's real account (KR + US), read-only. The API is public, so it answers only with the
    ACCOUNT_TOKEN the app stores once (계좌 tab)."""
    want = os.getenv("ACCOUNT_TOKEN")
    if not want:
        raise HTTPException(status_code=503, detail="ACCOUNT_TOKEN 미설정")
    if not x_account_token or not hmac.compare_digest(x_account_token, want):
        raise HTTPException(status_code=401, detail="계좌 토큰이 맞지 않아요")
    if not kiwoom.configured("real"):
        return {"configured": False}
    return {"configured": True, **_cached("kiwoom:real", 60, lambda: kiwoom.balance("real"))}


def _owner(token: str | None) -> None:
    want = os.getenv("ACCOUNT_TOKEN")
    if not want or not token or not hmac.compare_digest(token, want):
        raise HTTPException(status_code=401, detail="계좌 토큰이 맞지 않아요")


@router.post("/raw")
def raw(mode: str, api_id: str, body: dict | None = None, x_account_token: str | None = Header(default=None)):
    """Diagnostics: one read-only call as Kiwoom answers it (never an order, on either account)."""
    _owner(x_account_token)
    if mode not in ("real", "mock") or api_id not in kiwoom.READ_ONLY:
        raise HTTPException(status_code=400, detail="조회 전용 api-id만")
    try:
        return {"pages": kiwoom.client(mode).call(api_id, body or {})}
    except kiwoom.KiwoomError as e:
        return {"error": str(e)}


@router.get("/egress")
def egress(x_account_token: str | None = Header(default=None)):
    """The addresses this server reaches the internet from (to register in the Kiwoom portal)."""
    import urllib.request

    _owner(x_account_token)
    seen = {}
    for _ in range(8):
        try:
            ip = urllib.request.urlopen("https://api.ipify.org", timeout=10).read().decode().strip()
            seen[ip] = seen.get(ip, 0) + 1
        except OSError as e:
            seen[f"error: {e}"] = 1
    return seen


@router.get("/mock")
def mock():
    """The mock account that trades the swing signals, with its recent orders."""
    return _cached("kiwoom:mock", 60, kiwoom_mock.summary)


@router.post("/mock/execute")
def mock_execute(market: str, x_cron_secret: str | None = Header(default=None)):
    _cron(x_cron_secret)
    if market not in ("KR", "US"):
        raise HTTPException(status_code=400, detail="market must be KR or US")
    return kiwoom_mock.execute(market)


@router.get("/probe")
def probe():
    hist = kiwoom_probe.history()
    return {**kiwoom_probe.verdict(), "last": hist[-1] if hist else None}


@router.post("/probe/run")
def probe_run(x_cron_secret: str | None = Header(default=None)):
    _cron(x_cron_secret)
    threading.Thread(target=kiwoom_probe.run, daemon=True).start()
    return {"started": True}
