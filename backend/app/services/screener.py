"""Swing screener: after each market's close, scan the liquid whole market (universe.py) for today's
signals of the swing techniques that held up in the backtest (swing_bt.py), and store the list.

Which techniques are shown is decided by the backtest file, not by hand: a technique is used in a
market only if, with 메리츠 costs, its trades beat simply holding the same stocks for the same number
of days (edge > 0), made money on average (avg > 0) and had a profit factor above 1, in both test
periods. Every candidate carries that record.

POST /swing/run?market=KR|US (cron) -> runs in a background thread and stores AppState "swing:<market>".
"""

import json
import logging
import threading
from datetime import datetime
from pathlib import Path

import pandas as pd
import yfinance as yf

from ..db import get_state, put_state
from .macro import KST
from .swing import BY_KEY, TECHNIQUES, Bars, features
from .universe import KR_MIN_VALUE, US_MIN_VALUE, get_universe

log = logging.getLogger("stockapp.screener")
BACKTEST = Path(__file__).resolve().parent.parent / "data" / "swing_backtest.json"
INDEX = {"KR": "^KS11", "US": "^GSPC"}
MIN_VALUE = {"KR": KR_MIN_VALUE, "US": US_MIN_VALUE}
PER_TECHNIQUE = 8  # most liquid candidates kept per technique
_running: set[str] = set()


def records() -> dict:
    """{market: {tech: record}} for techniques that pass in both periods."""
    if not BACKTEST.exists():
        return {}
    d = json.loads(BACKTEST.read_text(encoding="utf-8"))
    stats = [s for s in d["stats"] if s["cost"] == "meritz"]
    port = {(p["market"], p["period"], p["tech"]): p for p in d.get("portfolio", [])}
    out: dict = {}
    for mkt in ("KR", "US"):
        for t in TECHNIQUES:
            rows = [s for s in stats if s["market"] == mkt and s["tech"] == t.key]
            if len(rows) < 2:
                continue
            ok = all(r["edge"] > 0 and r["avg"] > 0 and (r["pf"] or 0) > 1 for r in rows)
            recent = next((r for r in rows if r["period"] == "2019~"), rows[-1])
            out.setdefault(mkt, {})[t.key] = {
                "pass": ok, "trades": recent["trades"], "win": recent["win"], "avg": recent["avg"],
                "median": recent["median"], "edge": recent["edge"], "days": recent["days"], "pf": recent["pf"],
                "portfolio": port.get((mkt, "2019~", t.key)),
                "periods": {r["period"]: {"edge": r["edge"], "avg": r["avg"], "win": r["win"]} for r in rows},
            }
    return out


def _download(symbols: list[str]) -> dict[str, pd.DataFrame]:
    out = {}
    for k in range(0, len(symbols), 100):
        chunk = symbols[k:k + 100]
        df = yf.download(chunk, period="18mo", interval="1d", auto_adjust=True, group_by="ticker", threads=True, progress=False)
        for s in chunk:
            try:
                h = df[s][["Open", "High", "Low", "Close", "Volume"]].dropna()
            except KeyError:
                continue
            h = h[(h["Close"] > 0) & (h["Open"] > 0)]
            h.columns = ["o", "h", "l", "c", "v"]
            h.index = pd.DatetimeIndex(h.index).tz_localize(None)
            if len(h) > 260:
                out[s] = h
    return out


def scan(market: str) -> dict:
    rec = records().get(market, {})
    active = [t for t in TECHNIQUES if rec.get(t.key, {}).get("pass")]
    uni = [u for u in get_universe() if u["market"] == market]
    prices = _download([u["symbol"] for u in uni] + [INDEX[market]])
    idx = prices.get(INDEX[market], pd.DataFrame()).get("c")
    names = {u["symbol"]: u["name"] for u in uni}
    lite = not any(t.key in ("rsi_own", "trend") for t in active)
    found: dict[str, list] = {t.key: [] for t in active}
    as_of = None
    log.info("swing scan %s: %d prices downloaded", market, len(prices))
    for u in uni:
        h = prices.get(u["symbol"])
        if h is None:
            continue
        b = Bars(features(h, idx, lite=lite))
        i = b.n - 1
        as_of = max(as_of or b.index[i], b.index[i])
        if b["value20"][i] < MIN_VALUE[market]:
            continue
        for t in active:
            order = t.entry(b, i)
            if order:
                found[t.key].append({
                    "symbol": u["symbol"], "name": names.get(u["symbol"]), "close": float(b["c"][i]),
                    "order": "지정가" if order[0] == "lmt" else "시가",
                    "limit": float(order[1]) if order[0] == "lmt" else None,
                    "value20": float(b["value20"][i]), "date": b.index[i].strftime("%Y-%m-%d"),
                })
    groups = []
    for t in active:
        rows = sorted(found[t.key], key=lambda r: r["value20"], reverse=True)
        if rows:
            groups.append({"key": t.key, "name": t.name, "source": t.source, "plan": t.plan, "record": rec[t.key],
                           "count": len(rows), "candidates": rows[:PER_TECHNIQUE]})
    return {"market": market, "asOf": as_of.strftime("%Y-%m-%d") if as_of is not None else None,
            "scanned": len(prices) - 1, "techniques": [{"key": t.key, "name": t.name} for t in active],
            "excluded": [{"key": t.key, "name": t.name, "record": rec.get(t.key)} for t in TECHNIQUES if t not in active],
            "groups": groups, "generatedAt": datetime.now(KST).isoformat(timespec="minutes")}


def run_async(market: str) -> bool:
    if market in _running:
        return False
    _running.add(market)

    def work():
        try:
            result = scan(market)
            put_state(f"swing:{market}", json.dumps(result, ensure_ascii=False), result["generatedAt"])
            log.info("swing scan %s: %d groups", market, len(result["groups"]))
        except Exception as e:
            log.exception("swing scan %s failed: %s", market, e)
        finally:
            _running.discard(market)

    threading.Thread(target=work, daemon=True).start()
    return True


def latest() -> dict:
    out = {}
    for m in ("KR", "US"):
        row = get_state(f"swing:{m}")
        if row:
            out[m] = json.loads(row.value)
    return out
