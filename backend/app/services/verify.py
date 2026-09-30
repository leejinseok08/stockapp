"""Live check of the swing strategy (owner, 2026-09-30: "is swing any good? verify it on the mock account from today").

The backtest picked the techniques; this asks whether they hold up on signals that fire from START on.
After each scan (screener._finish) snapshot() stores one row per market and session:
- the paper model account's equity (paper.account: every pick, filled at the next open, no slippage),
- the Kiwoom mock account's equity (real fills on Kiwoom's mock server; KR only while US mock has no funds),
- the market index close (screener.INDEX), the benchmark over the same days,
- the mock fill price of each followed buy still held, to measure the gap to the paper entry.

summary() (GET /swing/verify) judges each market once MIN_CLOSED trades entered since START have closed,
by the same bar the backtest used (avg > 0, win rate >= screener.MIN_WIN) plus: the paper account beat the
index over the window. Until then the verdict is "보류" with the counts so far.
"""

import json
import math
from datetime import datetime

import numpy as np
from sqlmodel import Session, select

from ..db import AppState, KiwoomOrder, PaperTrade, engine
from .macro import KST

START = "2026-09-30"  # first session of the check: trades entered on or after it, equity from its close
MIN_CLOSED = 30  # closed trades per market before a verdict (about 1-2 months of KR signals)
PREFIX = "verify:"


def _put(key: str, value: dict) -> None:
    with Session(engine) as s:
        row = s.get(AppState, key) or AppState(key=key, value="", updated="")
        row.value, row.updated = json.dumps(value), datetime.now(KST).isoformat(timespec="seconds")
        s.add(row)
        s.commit()


def snapshot(market: str, as_of: str, index_close: float | None) -> dict | None:
    """Store the day's equities and index close. Sessions before START are skipped."""
    from . import kiwoom, paper

    if as_of < START:
        return None
    with Session(engine) as s:
        trades = list(s.exec(select(PaperTrade).where(PaperTrade.market == market)))
    row: dict = {"market": market, "date": as_of, "index": index_close, "paper": paper.account(trades, market)["equity"] if trades else None,
                 "mock": None, "fills": {}}
    if kiwoom.configured("mock"):
        try:
            bal = kiwoom.kr_balance("mock") if market == "KR" else kiwoom.us_balance("mock")
            row["mock"] = bal.get("equity") or None
            avg = {kiwoom.kr_code(h["symbol"]) if market == "KR" else h["symbol"].upper(): h["avgPrice"] for h in bal["holdings"]}
            with Session(engine) as s:
                for o in s.exec(select(KiwoomOrder).where(KiwoomOrder.market == market, KiwoomOrder.side == "buy",
                                                          KiwoomOrder.status == "sent")):
                    k = kiwoom.kr_code(o.symbol) if market == "KR" else o.symbol.upper().replace("-", ".")
                    if o.trade_id and avg.get(k):
                        row["fills"][str(o.trade_id)] = avg[k]
        except Exception as e:  # the paper side still counts
            row["mockError"] = str(e)[:200]
    _put(f"{PREFIX}{market}:{as_of}", row)
    return row


def mdd(values: list[float]) -> float | None:
    """Largest fall from a running peak, as a negative fraction."""
    v = [x for x in values if x]
    if len(v) < 2:
        return None
    peak, worst = v[0], 0.0
    for x in v:
        peak = max(peak, x)
        worst = min(worst, x / peak - 1)
    return worst


def _ret(series: list[float | None]) -> float | None:
    v = [x for x in series if x]
    return v[-1] / v[0] - 1 if len(v) >= 2 else None


def judge(rets: list[float], paper_ret: float | None, index_ret: float | None, min_win: float) -> dict:
    """The verdict from closed trade returns and the window's account vs index return."""
    n = len(rets)
    avg = float(np.mean(rets)) if n else None
    win = float(np.mean([r > 0 for r in rets])) if n else None
    # 95% range of the per-trade average, to show how far a small sample can be from the truth
    half = 1.96 * float(np.std(rets, ddof=1)) / math.sqrt(n) if n >= 2 else None
    checks = {
        "avg": avg is not None and avg > 0,
        "win": win is not None and win >= min_win,
        "beatIndex": paper_ret is not None and index_ret is not None and paper_ret >= index_ret,
    }
    if n < MIN_CLOSED:
        verdict = "보류"
    else:
        verdict = "통과" if all(checks.values()) else "미달"
    return {"closed": n, "need": MIN_CLOSED, "avg": avg, "avgRange": [avg - half, avg + half] if half is not None else None,
            "win": win, "checks": checks, "verdict": verdict}


def summary() -> dict:
    """Per market: the window's returns and drawdowns (paper, mock, index), live vs backtest by technique,
    the mock fill gap, and the verdict."""
    from .screener import MIN_WIN, records
    from .swing import BY_KEY

    with Session(engine) as s:
        snaps = [json.loads(r.value) for r in s.exec(select(AppState).where(AppState.key.startswith(PREFIX)))]
        trades = list(s.exec(select(PaperTrade).where(PaperTrade.entry_date >= START)))
    rec = records()
    out: dict = {"start": START}
    for market in ("KR", "US"):
        days = sorted((r for r in snaps if r.get("market") == market), key=lambda r: r["date"])
        mine = [t for t in trades if t.market == market]
        picked = [t for t in mine if t.pick]
        closed = [t.ret for t in picked if t.status == "closed" and t.ret is not None]
        paper_s, mock_s, idx_s = ([r.get(k) for r in days] for k in ("paper", "mock", "index"))
        paper_ret, index_ret = _ret(paper_s), _ret(idx_s)
        tech = []
        for key in sorted({t.tech for t in mine}):
            done = [t.ret for t in mine if t.tech == key and t.status == "closed" and t.ret is not None]
            bt = (rec.get(market) or {}).get(key) or {}
            tech.append({"key": key, "name": BY_KEY[key].short or BY_KEY[key].name, "closed": len(done),
                         "open": sum(t.tech == key and t.status == "open" for t in mine),
                         "win": float(np.mean([r > 0 for r in done])) if done else None,
                         "avg": float(np.mean(done)) if done else None,
                         "btWin": bt.get("win"), "btAvg": bt.get("avg")})
        fills = {}
        for r in days:
            fills.update(r.get("fills") or {})
        entry = {str(t.id): t.entry_px for t in mine if t.entry_px}
        gaps = [fills[i] / entry[i] - 1 for i in fills if i in entry]
        out[market] = {
            "days": len(days), "from": days[0]["date"] if days else None, "to": days[-1]["date"] if days else None,
            "paper": {"ret": paper_ret, "mdd": mdd(paper_s)},
            "mock": {"ret": _ret(mock_s), "mdd": mdd(mock_s)},
            "index": {"ret": index_ret, "mdd": mdd(idx_s)},
            "fillGap": {"n": len(gaps), "avg": float(np.mean(gaps)) if gaps else None},
            "techniques": tech,
            **judge(closed, paper_ret, index_ret, MIN_WIN),
        }
    return out
