"""The swing signals, traded for real on the Kiwoom MOCK account (owner, 2026-09-29), next to the paper log.

After each scan (screener._finish), plan() writes the next session's orders:
- exits: for every stock the mock account holds on a followed trade, the technique's orders for the next
  session as the paper replay computed them (paper.next_exits): at the open, or a limit (take-profit);
  a trade the replay already closed but the account still holds is sold at the open.
- entries: that day's new signals the app would take (pick), calmest first as in the BUY list, one per
  stock, while slots are free. Size = the mock account's equity / screener.SLOTS (not the paper account's
  fixed ₩1,000만 / $10,000, owner), whole shares, within the orderable cash.
execute() sends them right after the open (worker cron: KR 09:01 KST, US 09:31 New York time).

The account is left to Kiwoom: fills, partial fills and prices are whatever the mock server did, which is
the point (the paper replay assumes the open). Orders are day orders; a limit that doesn't trade expires.
"""

import json
import logging
import math
from datetime import datetime
from zoneinfo import ZoneInfo

from sqlmodel import Session, select

from ..db import KiwoomOrder, PaperTrade, engine, get_state, put_state
from . import kiwoom
from .macro import KST

log = logging.getLogger("stockapp.kiwoom")

NY = ZoneInfo("America/New_York")
BUFFER = {"KR": 1.03, "US": 1.02}  # a market buy's price may gap up from the close used to size it


def _key(market: str, symbol: str) -> str:
    return kiwoom.kr_code(symbol) if market == "KR" else symbol.upper().replace("-", ".")


def _now() -> str:
    return datetime.now(KST).isoformat(timespec="seconds")


def _balance(market: str) -> dict:
    return kiwoom.kr_balance("mock") if market == "KR" else kiwoom.us_balance("mock")


def plan(market: str, updates: list[dict], closes: dict[str, float], as_of: str) -> dict | None:
    """Write the orders for the session after as_of. Returns what was planned, None when not configured."""
    from .screener import EXIT_PRIORITY, SLOTS

    if not kiwoom.configured("mock"):
        return None
    with Session(engine) as s:
        if s.exec(select(KiwoomOrder).where(KiwoomOrder.market == market, KiwoomOrder.session == as_of,
                                            KiwoomOrder.status.in_(["sent", "failed"]))).first():
            return {"skipped": "이미 실행한 계획"}  # a rerun of the same day's scan must not order twice
        for o in s.exec(select(KiwoomOrder).where(KiwoomOrder.market == market, KiwoomOrder.status == "planned")):
            o.status = "expired"
            s.add(o)
        s.commit()

    bal = _balance(market)
    _remember_start(market, bal)
    held = {_key(market, h["symbol"]): int(h["sellable"] or h["qty"]) for h in bal["holdings"]}
    by_id = {u["id"]: u for u in updates}
    orders: list[KiwoomOrder] = []
    with Session(engine) as s:
        # Followed positions: the last sent buy per held stock, and its size.
        followed: dict[str, KiwoomOrder] = {}
        for o in s.exec(select(KiwoomOrder).where(KiwoomOrder.market == market, KiwoomOrder.side == "buy",
                                                  KiwoomOrder.status == "sent").order_by(KiwoomOrder.id)):
            if held.get(_key(market, o.symbol), 0) > 0:
                followed[_key(market, o.symbol)] = o
        for k, buy in followed.items():
            u = by_id.get(buy.trade_id) or {}
            t = s.get(PaperTrade, buy.trade_id) if buy.trade_id else None
            status = u.get("status") or (t.status if t else None)
            left = held[k]
            if status in ("closed", "void"):
                orders.append(_order(market, buy, "sell", left, None, as_of))
                continue
            for _, frac, px, rest in u.get("next") or []:
                qty = left if rest else min(left, max(1, round(frac * buy.qty)))
                if qty > 0:
                    orders.append(_order(market, buy, "sell", qty, px, as_of))
                    left -= qty

        # Entries: today's new signals the app takes, one per stock, calmest first.
        prio = {k: n for n, k in enumerate(EXIT_PRIORITY)}
        fresh = s.exec(select(PaperTrade).where(PaperTrade.market == market, PaperTrade.status == "pending",
                                                PaperTrade.signal_date == as_of, PaperTrade.pick == True)).all()  # noqa: E712
        slots = SLOTS[market]
        free = slots - len(held)
        per_slot = (bal["equity"] or 0) / slots
        cash = bal["orderable"] or 0
        taken = set(held)
        for t in sorted(fresh, key=lambda t: (t.rank, prio.get(t.tech, 99))):
            k = _key(market, t.symbol)
            if free <= 0:
                break
            if k in taken:
                continue
            px = t.limit_px or closes.get(t.symbol)
            if not px:
                continue
            amount = min(per_slot, cash)
            qty = math.floor(amount / (px if t.limit_px else px * BUFFER[market]))
            if qty < 1:
                continue
            orders.append(KiwoomOrder(market=market, trade_id=t.id, symbol=t.symbol, name=t.name, side="buy", qty=qty,
                                      price=t.limit_px, session=as_of, status="planned", created=_now()))
            cash -= qty * px * (1 if t.limit_px else BUFFER[market])
            taken.add(k)
            free -= 1
        for o in orders:
            s.add(o)
        s.commit()
        planned = [_row(o) for o in orders]
    log.info("kiwoom mock %s plan for after %s: %d orders", market, as_of, len(planned))
    return {"session": as_of, "orders": planned}


def _order(market, buy: KiwoomOrder, side, qty, px, as_of) -> KiwoomOrder:
    return KiwoomOrder(market=market, trade_id=buy.trade_id, symbol=buy.symbol, name=buy.name, side=side, qty=int(qty),
                       price=px, session=as_of, status="planned", created=_now())


def _row(o: KiwoomOrder) -> dict:
    return {"id": o.id, "symbol": o.symbol, "name": o.name, "side": o.side, "qty": o.qty, "price": o.price,
            "session": o.session, "status": o.status, "ordNo": o.ord_no, "msg": o.msg, "sent": o.sent}


def market_open(market: str, now: datetime | None = None) -> bool:
    """Regular session right now (holidays aside: an order on a holiday is refused and marked failed)."""
    now = now or datetime.now(KST)
    if market == "KR":
        t = now.astimezone(KST)
        return t.weekday() < 5 and (9, 0) <= (t.hour, t.minute) < (15, 20)
    t = now.astimezone(NY)
    return t.weekday() < 5 and (9, 30) <= (t.hour, t.minute) < (16, 0)


def execute(market: str) -> dict:
    """Send the planned orders, sells first. Called by the worker right after the open."""
    if not kiwoom.configured("mock"):
        return {"skipped": "모의 키 미설정"}
    if not market_open(market):
        return {"skipped": "장 시간 아님"}
    sent = failed = 0
    with Session(engine) as s:
        rows = s.exec(select(KiwoomOrder).where(KiwoomOrder.market == market, KiwoomOrder.status == "planned")).all()
        for o in sorted(rows, key=lambda o: (o.side != "sell", o.id)):
            try:
                o.ord_no = kiwoom.order(market, o.side, o.symbol, o.qty, o.price)
                o.status, o.msg = "sent", None
                sent += 1
            except kiwoom.KiwoomError as e:
                o.status, o.msg = "failed", str(e)[:300]
                failed += 1
                log.warning("kiwoom mock %s %s %s: %s", market, o.side, o.symbol, e)
            o.sent = _now()
            s.add(o)
            s.commit()
    log.info("kiwoom mock %s execute: %d sent, %d failed", market, sent, failed)
    return {"sent": sent, "failed": failed}


def _remember_start(market: str, bal: dict) -> None:
    """The mock account's equity when following began, for its return next to the paper account's."""
    key = f"kiwoom:mock:start:{market}"
    if not get_state(key) and bal.get("equity"):
        put_state(key, json.dumps({"equity": bal["equity"], "date": datetime.now(KST).strftime("%Y-%m-%d")}), _now())


def summary() -> dict:
    """Per market: the mock account now, its return since following began, and recent orders."""
    out: dict = {"configured": kiwoom.configured("mock")}
    if not out["configured"]:
        return out
    bal = kiwoom.balance("mock")
    with Session(engine) as s:
        for market in ("KR", "US"):
            start = get_state(f"kiwoom:mock:start:{market}")
            start = json.loads(start.value) if start else None
            b = bal.get(market) or {}
            recent = s.exec(select(KiwoomOrder).where(KiwoomOrder.market == market, KiwoomOrder.status != "expired")
                            .order_by(KiwoomOrder.id.desc()).limit(30)).all()
            eq = b.get("equity")
            out[market] = {"balance": b, "since": start["date"] if start else None,
                           "ret": eq / start["equity"] - 1 if start and eq else None,
                           "orders": [_row(o) for o in recent]}
    return out
