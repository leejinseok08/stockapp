"""Kiwoom Securities REST API (owner's account, 2026-09-29). Spec: github.com/Kiwoom-Securities/Kiwoom-REST-API.

Two key pairs, set only in Render: the real account (KIWOOM_APP_KEY / KIWOOM_APP_SECRET) is read-only here —
the client refuses any api-id outside READ_ONLY, so no code path can place a real order — and the mock
account (KIWOOM_MOCK_APP_KEY / KIWOOM_MOCK_APP_SECRET) takes the swing signals' orders (kiwoom_mock.py).

Kiwoom answers business errors with HTTP 200 and a non-zero return_code; a token only works from the IP that
issued it (8010) and expires (8005), so either code re-issues the token once and retries. Limits: 5 queries
per second per token (3 during 09:00-10:00 KST for US stocks); calls are spaced by GAP seconds.
"""

import json
import logging
import os
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from .macro import KST

log = logging.getLogger("stockapp.kiwoom")

HOSTS = {"real": "https://api.kiwoom.com", "mock": "https://mockapi.kiwoom.com"}
ENV = {"real": ("KIWOOM_APP_KEY", "KIWOOM_APP_SECRET"), "mock": ("KIWOOM_MOCK_APP_KEY", "KIWOOM_MOCK_APP_SECRET")}
GAP = 0.35  # seconds between calls on one token (under 3 per second)
AUTH_RETRY = {8005, 8010, 8031, 8103}  # expired / other IP / wrong server / token check failed

# The only api-ids the real account may call: balances, deposits, exchange lookup, daily bars.
READ_ONLY = {
    "kt00018",  # 국내 계좌평가잔고내역
    "kt00001",  # 국내 예수금상세현황
    "ust21070",  # 미국주식 원장잔고확인
    "ust21110",  # 해외주식 예수금
    "usa10098",  # 미국주식 거래소구분 조회
    "ka10081",  # 국내 주식일봉차트
    "usa06012",  # 미국주식 일 차트
}
ORDERS = {"kt10000", "kt10001", "ust20000", "ust20001"}  # mock only

PATHS = {
    "kt00018": "/api/dostk/acnt", "kt00001": "/api/dostk/acnt", "ka10081": "/api/dostk/chart",
    "kt10000": "/api/dostk/ordr", "kt10001": "/api/dostk/ordr",
    "ust21070": "/api/us/acnt", "ust21110": "/api/us/acnt", "usa10098": "/api/us/stkinfo", "usa06012": "/api/us/chart",
    "ust20000": "/api/us/ordr", "ust20001": "/api/us/ordr",
}


class KiwoomError(Exception):
    def __init__(self, code: int | None, msg: str):
        super().__init__(f"[{code}] {msg}" if code is not None else msg)
        self.code = code
        self.msg = msg


class NotConfigured(KiwoomError):
    def __init__(self, mode: str):
        super().__init__(None, f"키움 {'실전' if mode == 'real' else '모의'} 키 미설정")


def configured(mode: str) -> bool:
    k, s = ENV[mode]
    return bool(os.getenv(k) and os.getenv(s))


def num(v) -> float | None:
    """Kiwoom numbers are strings: zero-padded and signed ('-000000012345', '+1.25', '')."""
    if v is None:
        return None
    t = str(v).strip().replace(",", "")
    if not t:
        return None
    try:
        return float(t)
    except ValueError:
        return None


def _code(v) -> int | None:
    try:
        return int(str(v).strip())
    except (TypeError, ValueError):
        return None


def _post(url: str, body: dict, headers: dict, timeout: int = 20) -> tuple[dict, dict]:
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "application/json;charset=UTF-8", **headers})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read() or b"{}"), {k.lower(): v for k, v in r.headers.items()}
    except urllib.error.HTTPError as e:
        raw = e.read() or b""
        try:
            data = json.loads(raw or b"{}")
        except ValueError:
            data = {}
        if not data:
            text = raw.decode("utf-8", "replace").strip()[:200]
            raise KiwoomError(e.code, f"HTTP {e.code} {text}".strip()) from e
        return data, {"status": str(e.code)}


@dataclass
class Client:
    mode: str  # "real" | "mock"
    token: str | None = None
    expires: datetime | None = None
    last: float = 0.0
    lock: threading.Lock = field(default_factory=threading.Lock)

    def _issue(self) -> None:
        k, s = ENV[self.mode]
        try:
            data, _ = _post(HOSTS[self.mode] + "/oauth2/token",
                            {"grant_type": "client_credentials", "appkey": os.getenv(k), "secretkey": os.getenv(s)}, {})
        except KiwoomError as e:
            raise KiwoomError(e.code, f"토큰 발급: {e.msg}") from e
        code = _code(data.get("return_code"))
        if code not in (None, 0) or not data.get("token"):
            raise KiwoomError(code, str(data.get("return_msg") or "토큰 발급 실패"))
        self.token = data["token"]
        try:
            self.expires = datetime.strptime(data["expires_dt"], "%Y%m%d%H%M%S").replace(tzinfo=KST)
        except (KeyError, ValueError):
            self.expires = datetime.now(KST) + timedelta(hours=12)

    def call(self, api_id: str, body: dict, pages: int = 1) -> list[dict]:
        """One response per page (cont-yn / next-key paging). Raises KiwoomError on a business error."""
        if not configured(self.mode):
            raise NotConfigured(self.mode)
        if self.mode == "real" and api_id not in READ_ONLY:
            raise KiwoomError(None, f"실전 계좌는 조회만 허용: {api_id}")
        if api_id in ORDERS and self.mode != "mock":
            raise KiwoomError(None, f"주문은 모의투자만: {api_id}")
        out, extra = [], {}
        with self.lock:
            for _ in range(pages):
                data, headers = self._one(api_id, body, extra)
                out.append(data)
                if headers.get("cont-yn") != "Y" or not headers.get("next-key"):
                    break
                extra = {"cont-yn": "Y", "next-key": headers["next-key"]}
        return out

    def _one(self, api_id: str, body: dict, extra: dict, retry: bool = True) -> tuple[dict, dict]:
        if not self.token or not self.expires or datetime.now(KST) > self.expires - timedelta(minutes=5):
            self._issue()
        wait = self.last + GAP - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        self.last = time.monotonic()
        data, headers = _post(HOSTS[self.mode] + PATHS[api_id], body,
                              {"api-id": api_id, "authorization": f"Bearer {self.token}", **extra})
        code = _code(data.get("return_code"))
        if retry and (code in AUTH_RETRY or headers.get("status") == "401"):
            self.token = None
            return self._one(api_id, body, extra, retry=False)
        if code not in (None, 0):
            raise KiwoomError(code, str(data.get("return_msg") or "요청 실패"))
        return data, headers


_clients = {m: Client(m) for m in HOSTS}


def client(mode: str) -> Client:
    return _clients[mode]


# ---- balances ------------------------------------------------------------------------------------

def kr_code(symbol: str) -> str:
    """'005930.KS' -> '005930'; Kiwoom's 'A005930' -> '005930'."""
    s = symbol.split(".")[0]
    return s[1:] if len(s) == 7 and s[0] in "AJQ" else s


def kr_balance(mode: str) -> dict:
    c = client(mode)
    rows, head = [], {}
    for page in c.call("kt00018", {"qry_tp": "1", "dmst_stex_tp": "KRX"}, pages=5):
        head = head or page
        rows += page.get("acnt_evlt_remn_indv_tot") or []
    cash = c.call("kt00001", {"qry_tp": "3"})[0]
    holdings = [{
        "symbol": kr_code(r.get("stk_cd", "")), "name": (r.get("stk_nm") or "").strip(),
        "qty": num(r.get("rmnd_qty")) or 0, "sellable": num(r.get("trde_able_qty")) or 0,
        "avgPrice": num(r.get("pur_pric")), "price": num(r.get("cur_prc")),
        "value": num(r.get("evlt_amt")), "cost": num(r.get("pur_amt")),
        "pnl": num(r.get("evltv_prft")), "ret": _pct(r.get("prft_rt")),
    } for r in rows if (num(r.get("rmnd_qty")) or 0) > 0]
    value = sum(h["value"] or 0 for h in holdings)
    deposit = num(cash.get("entr")) or 0
    orderable = num(cash.get("ord_alow_amt"))
    return {
        "currency": "KRW", "holdings": holdings, "value": value, "cost": num(head.get("tot_pur_amt")),
        "pnl": num(head.get("tot_evlt_pl")), "ret": _pct(head.get("tot_prft_rt")),
        "cash": deposit, "orderable": orderable if orderable is not None else deposit,
        "equity": num(head.get("prsm_dpst_aset_amt")) or value + deposit,
    }


def us_balance(mode: str) -> dict:
    c = client(mode)
    rows, head = [], {}
    for page in c.call("ust21070", {"stex_tp": "", "stk_cd": ""}, pages=5):
        head = head or page
        rows += page.get("result_list") or []
    usd = next((r for r in (c.call("ust21110", {})[0].get("result_list") or []) if r.get("crnc_code") == "USD"), {})
    holdings = [{
        "symbol": (r.get("stk_cd") or "").strip(), "name": (r.get("frgn_stk_nm") or "").strip(),
        "exchange": (r.get("stex_nm") or "").strip(),
        "qty": num(r.get("poss_qty")) or 0, "sellable": num(r.get("sell_alowq")) or 0,
        "avgPrice": num(r.get("frgn_stk_book_uv")), "price": num(r.get("now_pric")),
        "value": num(r.get("evlt_amt")), "cost": num(r.get("frgn_stk_book_amt")),
        "pnl": num(r.get("pl_amt")), "ret": _pct(r.get("pl_rt")),
        "valueKrw": num(r.get("evlt_amt_krw")), "pnlKrw": num(r.get("pl_amt_krw")),
    } for r in rows if (num(r.get("poss_qty")) or 0) > 0]
    value = sum(h["value"] or 0 for h in holdings)
    cash = num(usd.get("fc_entra")) or 0
    orderable = num(usd.get("fc_ord_alowa"))
    return {
        "currency": "USD", "holdings": holdings, "value": value, "cost": num(head.get("tot_prch_amt")),
        "pnl": num(head.get("tot_pl_amt")), "ret": _pct(head.get("tot_pl_rt")),
        "valueKrw": num(head.get("tot_evlt_amt_krw")), "pnlKrw": num(head.get("tot_pl_amt_krw")),
        "cash": cash, "orderable": orderable if orderable is not None else cash, "equity": value + cash,
    }


def _pct(v) -> float | None:
    """Kiwoom percentages ('+12.34') as fractions (0.1234), the app's convention."""
    x = num(v)
    return None if x is None else x / 100


def balance(mode: str) -> dict:
    """Both markets; a market that fails carries its error instead of failing the other."""
    out: dict = {"mode": mode, "asOf": datetime.now(KST).isoformat(timespec="minutes")}
    for market, fn in (("KR", kr_balance), ("US", us_balance)):
        try:
            out[market] = fn(mode)
        except KiwoomError as e:
            log.warning("kiwoom %s %s balance: %s", mode, market, e)
            out[market] = {"error": str(e)}
    return out


# ---- US exchange codes (orders and charts need NASDAQ / NYSE / AMEX) -------------------------------

_exchanges: dict[str, str] = {}


def us_exchange(symbol: str, mode: str = "mock") -> str:
    sym = symbol.upper().replace("-", ".")
    if sym not in _exchanges:
        rows = client(mode).call("usa10098", {"stk_cd": sym})[0].get("list") or []
        hit = next((r for r in rows if (r.get("stk_cd") or "").strip().upper() == sym), rows[0] if rows else None)
        if not hit or not hit.get("stex_tp"):
            raise KiwoomError(1903, f"거래소 구분을 찾지 못함: {symbol}")
        _exchanges[sym] = hit["stex_tp"].strip()
    return _exchanges[sym]


# ---- orders (mock only) --------------------------------------------------------------------------

KR_TICKS = [(2_000, 1), (5_000, 5), (20_000, 10), (50_000, 50), (200_000, 100), (500_000, 500)]


def kr_tick(price: float) -> int:
    for bound, tick in KR_TICKS:
        if price < bound:
            return tick
    return 1_000


def kr_round(price: float, side: str) -> int:
    """A limit price on the KRX tick grid: buys round down, sells round up (never a worse fill)."""
    t = kr_tick(price)
    q = price / t
    return int((int(q) if side == "buy" else -int(-q // 1)) * t)


def order(market: str, side: str, symbol: str, qty: int, price: float | None) -> str:
    """Send one order to the MOCK account; returns Kiwoom's order number. price None = market order."""
    c = client("mock")
    if market == "KR":
        body = {"dmst_stex_tp": "KRX", "stk_cd": kr_code(symbol), "ord_qty": str(qty),
                "trde_tp": "3" if price is None else "0", "ord_uv": "" if price is None else str(kr_round(price, side))}
        data = c.call("kt10000" if side == "buy" else "kt10001", body)[0]
    else:
        px = None if price is None else (int(price * 100) if side == "buy" else -int(-price * 100 // 1)) / 100
        body = {"stex_tp": us_exchange(symbol), "stk_cd": symbol.upper().replace("-", "."), "ord_qty": str(qty),
                "trde_tp": "03" if px is None else "00", "ord_uv": "" if px is None else f"{px:.2f}"}
        data = c.call("ust20000" if side == "buy" else "ust20001", body)[0]
    return str(data.get("ord_no") or "")
