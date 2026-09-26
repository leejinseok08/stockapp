"""Paper trading of the swing signals, from the first scan after 2026-09-27 on (owner: "how much would
following them have made"). No backfill: only signals the live scan actually produced.

Every BUY the scan finds is logged per (stock, technique) unless that pair already has an unsettled
trade (one position per technique per stock, as in swing_bt). Each later scan replays the trade from
the stored signal date on the day's bars: fill at the next open (or the limit), exit by the same
technique's rule, 메리츠 costs as in the backtest. A settled trade is frozen; an open one carries its
return at the last close.

The model account (per market, 10 equal slots, ₩1,000만 / $10,000) takes each day's fills in the
order the app lists BUYs (screener: most volatile first), one slot per stock, skipping days the app
paused (KR while KOSPI trends up). A stock fired by several techniques follows screener.EXIT_PRIORITY.
"""

from collections import defaultdict
from datetime import datetime

import numpy as np
import pandas as pd
from sqlmodel import Session, select

from ..db import PaperTrade, engine
from .macro import KST
from .swing import BY_KEY, Bars, Pos

COSTS = {"KR": (0.0005, 0.0005 + 0.0020), "US": (0.0003, 0.0003)}  # swing_bt.COSTS["meritz"]
CAPITAL = {"KR": 10_000_000.0, "US": 10_000.0}
SLOTS = 10


def settle(b: Bars, tech, sig: int, order: tuple, cost: tuple) -> dict:
    """Replay one signal on bars b (signal at bar sig). Returns the trade's state as table fields."""
    buy_c, sell_c = cost
    o, h, low, c = b["o"], b["h"], b["l"], b["c"]
    fill = sig + 1
    if fill >= b.n:
        return {"status": "pending"}
    px = o[fill] if order[0] == "mkt" else (min(o[fill], order[1]) if low[fill] <= order[1] else None)
    if px is None:
        return {"status": "void", "exit_date": b.index[fill].strftime("%Y-%m-%d")}  # limit never traded
    pos = Pos(entry=float(px), i=fill, sig=sig)
    shares, proceeds = (1 - buy_c) / px, 0.0
    init = shares
    entry = {"entry_date": b.index[fill].strftime("%Y-%m-%d"), "entry_px": float(px)}
    for i in range(fill, b.n - 1):
        for kind, frac, *lvl in tech.exit(b, i, pos):
            if pos.left <= 1e-9:
                break
            frac = min(frac, pos.left)
            if kind == "mkt":
                q = o[i + 1]
            elif h[i + 1] >= lvl[0]:
                q = max(o[i + 1], lvl[0])
                pos.sold += 1
            else:
                continue
            proceeds += init * frac * q * (1 - sell_c)
            shares -= init * frac
            pos.left -= frac
        if pos.left <= 1e-9:
            return {**entry, "status": "closed", "exit_date": b.index[i + 1].strftime("%Y-%m-%d"), "ret": float(proceeds - 1)}
    mark = proceeds + shares * c[b.n - 1] * (1 - sell_c)
    return {**entry, "status": "open", "ret": float(mark - 1), "mark_date": b.index[b.n - 1].strftime("%Y-%m-%d")}


def unsettled(market: str) -> dict[str, list[dict]]:
    """{symbol: [trade fields]} for pending and open trades."""
    out: dict[str, list[dict]] = defaultdict(list)
    with Session(engine) as s:
        for t in s.exec(select(PaperTrade).where(PaperTrade.market == market, PaperTrade.status.in_(["pending", "open"]))):
            out[t.symbol].append(t.model_dump())
    return out


def update(b: Bars, trades: list[dict], market: str) -> list[dict]:
    """New fields for each trade of one stock, replayed on today's bars."""
    out = []
    for t in trades:
        sig = int(b.index.searchsorted(pd.Timestamp(t["signal_date"])))
        if sig >= b.n or b.index[sig].strftime("%Y-%m-%d") != t["signal_date"]:
            continue
        order = ("lmt", t["limit_px"]) if t["limit_px"] is not None else ("mkt",)
        out.append({"id": t["id"], **settle(b, BY_KEY[t["tech"]], sig, order, COSTS[market])})
    return out


def save(market: str, updates: list[dict], signals: list[dict]) -> int:
    """Write replayed fields, then log new signals that don't collide with an unsettled pair."""
    added = 0
    with Session(engine) as s:
        for u in updates:
            row = s.get(PaperTrade, u["id"])
            if row:
                for k, v in u.items():
                    if k != "id":
                        setattr(row, k, v)
                s.add(row)
        s.flush()
        busy = {(t.symbol, t.tech) for t in s.exec(
            select(PaperTrade).where(PaperTrade.market == market, PaperTrade.status.in_(["pending", "open"])))}
        seen = {(t.symbol, t.tech, t.signal_date) for t in s.exec(
            select(PaperTrade).where(PaperTrade.market == market, PaperTrade.signal_date.in_({r["date"] for r in signals} or {""})))}
        for r in signals:
            if (r["symbol"], r["tech"]) in busy or (r["symbol"], r["tech"], r["date"]) in seen:
                continue
            s.add(PaperTrade(market=market, symbol=r["symbol"], name=r.get("name"), tech=r["tech"], signal_date=r["date"],
                             rank=r["rank"], limit_px=r.get("limit"), pick=r.get("pick", True), status="pending"))
            busy.add((r["symbol"], r["tech"]))
            added += 1
        s.commit()
    return added


def account(trades: list[PaperTrade], market: str) -> dict:
    """The 10-slot model account over the logged trades. Open positions count at their last close."""
    from .screener import EXIT_PRIORITY

    prio = {k: n for n, k in enumerate(EXIT_PRIORITY)}
    filled = [t for t in trades if t.status in ("open", "closed") and t.entry_date and t.pick]
    by_day: dict[str, list[PaperTrade]] = defaultdict(list)
    for t in filled:
        by_day[t.entry_date].append(t)
    exits: dict[str, list] = defaultdict(list)
    cash, held, taken = CAPITAL[market], {}, []
    for day in sorted(set(by_day) | {t.exit_date for t in filled if t.status == "closed"}):
        for sym, amt, t in exits.pop(day, []):
            cash += amt * (1 + t.ret)
            held.pop(sym, None)
        if day not in by_day:
            continue
        equity = cash + sum(a for a, _ in held.values())
        for t in sorted(by_day[day], key=lambda t: (t.rank, prio.get(t.tech, 99))):
            if len(held) >= SLOTS or t.symbol in held:
                continue
            amt = min(cash, equity / SLOTS)
            if amt <= 0:
                break
            cash -= amt
            held[t.symbol] = (amt, t)
            taken.append((amt, t))
            if t.status == "closed":
                exits[t.exit_date].append((t.symbol, amt, t))
    value = cash + sum(a * (1 + (t.ret or 0)) for a, t in held.values())
    closed = [t for _, t in taken if t.status == "closed"]
    return {
        "capital": CAPITAL[market], "equity": value, "pnl": value - CAPITAL[market], "ret": value / CAPITAL[market] - 1,
        "trades": len(taken), "closed": len(closed), "win": float(np.mean([t.ret > 0 for t in closed])) if closed else None,
        "holding": [{"symbol": t.symbol, "name": t.name, "tech": BY_KEY[t.tech].short or BY_KEY[t.tech].name,
                     "entryDate": t.entry_date, "ret": t.ret} for _, t in held.values()],
    }


def summary() -> dict:
    """Per market: the model account and every logged signal's record by technique."""
    out = {}
    with Session(engine) as s:
        rows = list(s.exec(select(PaperTrade)))
    for market in ("KR", "US"):
        trades = [t for t in rows if t.market == market]
        if not trades:
            continue
        tech = []
        for key in sorted({t.tech for t in trades}):
            done = [t.ret for t in trades if t.tech == key and t.status == "closed"]
            live = [t for t in trades if t.tech == key and t.status == "open"]
            tech.append({"key": key, "name": BY_KEY[key].short or BY_KEY[key].name, "closed": len(done), "open": len(live),
                         "win": float(np.mean([r > 0 for r in done])) if done else None,
                         "avg": float(np.mean(done)) if done else None})
        out[market] = {"since": min(t.signal_date for t in trades), "signals": len(trades),
                       "account": account(trades, market), "techniques": tech,
                       "asOf": max((t.mark_date or t.exit_date or t.signal_date) for t in trades),
                       "generatedAt": datetime.now(KST).isoformat(timespec="minutes")}
    return out
