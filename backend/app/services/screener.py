"""Swing screener: after each market's close, scan the liquid whole market (universe.py) for today's
signals of the swing techniques that held up in the backtest (swing_bt.py), and store the list.

Which techniques are shown is decided by the backtest file, not by hand: a technique is used in a
market only if, with 메리츠 costs, its trades beat simply holding the same stocks for the same number
of days (edge > 0), made money on average (avg > 0) and had a profit factor above 1, in both test
periods. Every candidate carries that record.

POST /swing/run?market=KR|US (cron) -> runs in a background thread and stores AppState "swing:<market>".
"""

import ctypes
import gc
import json
import logging
import threading
from datetime import datetime
from pathlib import Path

import pandas as pd
import yfinance as yf

from .market import _CACHE, _cached
from ..db import get_state, put_state
from . import kiwoom_mock, paper
from .macro import KST
from .swing import BY_KEY, TECHNIQUES, Bars, Pos, features
from .universe import KR_MIN_VALUE, US_MIN_VALUE, get_universe

log = logging.getLogger("stockapp.screener")
BACKTEST = Path(__file__).resolve().parent.parent / "data" / "swing_backtest.json"
INDEX = {"KR": "^KS11", "US": "^GSPC"}
MIN_VALUE = {"KR": KR_MIN_VALUE, "US": US_MIN_VALUE}
PER_TECHNIQUE = 8  # most liquid candidates kept per technique
BUYS_KEPT = 30  # stocks kept in the merged BUY list
# Research 9차 (docs/signal-research.md, owner's choice 2026-09-27 to cut drawdown): order BUYs by
# volatility (14-day ATR / close) LOW first; hold SLOTS stocks per market in equal weights; in KR take
# none while KOSPI is above a rising 50-day line. When one stock fires several techniques, the exit
# follows the first of EXIT_PRIORITY (higher per-trade edge in 2010~2018).
PAUSE_IN_UPTREND = {"KR": True, "US": False}
SLOTS = {"KR": 20, "US": 10}
EXIT_PRIORITY = ["bnf", "envelope", "band_mid", "obv", "mfi_mid", "bb_mid"]
MIN_WIN = 0.5  # owner (2026-09-26): drop techniques that lose more often than they win
_running: set[str] = set()


def records() -> dict:
    """{market: {tech: record}} for techniques that pass in both periods (edge, avg, pf, win rate)."""
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
            ok = all(r["edge"] > 0 and r["avg"] > 0 and (r["pf"] or 0) > 1 and r["win"] >= MIN_WIN for r in rows)
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
    idx = _download([INDEX[market]]).get(INDEX[market], pd.DataFrame()).get("c")
    names = {u["symbol"]: u["name"] for u in uni}
    lite = not any(t.key in ("rsi_own", "trend") for t in active)
    found: dict[str, list] = {t.key: [] for t in active}
    as_of = None
    followed = paper.unsettled(market)
    updates: list[dict] = []
    scanned = 0
    # 100 symbols at a time, each batch dropped before the next: holding the whole market's 18 months
    # at once pushed the 512MB server over its limit after a scan.
    for k in range(0, len(uni), 100):
        batch = uni[k:k + 100]
        prices = _download([u["symbol"] for u in batch])
        scanned += len(prices)
        for u in batch:
            h = prices.get(u["symbol"])
            if h is None:
                continue
            _scan_one(u, h, idx, lite, active, found, followed, updates, names, market)
            as_of = max(as_of or h.index[-1], h.index[-1])
        del prices
        _release()
    log.info("swing scan %s: %d prices downloaded", market, scanned)
    return _finish(market, rec, active, found, idx, as_of, scanned, followed, updates)


def _release() -> None:
    """Hand freed memory back to the OS. Python keeps what numpy/yfinance's threads freed, so without
    this a scan left the 512MB server at ~510MB (2026-09-28) and the next busy minute OOM-killed it."""
    gc.collect()
    try:
        ctypes.CDLL("libc.so.6").malloc_trim(0)
    except OSError:  # not glibc (Windows/macOS dev machines)
        pass


def _scan_one(u, h, idx, lite, active, found, followed, updates, names, market) -> None:
    b = Bars(features(h, idx, lite=lite))
    try:
        updates += paper.update(b, followed.pop(u["symbol"], []), market)
    except Exception as e:
        log.warning("swing paper %s %s: %s", market, u["symbol"], e)
    i = b.n - 1
    if b["value20"][i] < MIN_VALUE[market]:
        return
    for t in active:
        order = t.entry(b, i)
        if order:
            found[t.key].append({
                "symbol": u["symbol"], "name": names.get(u["symbol"]), "close": float(b["c"][i]),
                "order": "지정가" if order[0] == "lmt" else "시가",
                "limit": float(order[1]) if order[0] == "lmt" else None,
                "value20": float(b["value20"][i]), "atrp": float(b["atr"][i] / b["c"][i]),
                "date": b.index[i].strftime("%Y-%m-%d"),
            })


def _finish(market, rec, active, found, idx, as_of, scanned, followed, updates) -> dict:
    market_ok = None
    if idx is not None and len(idx) > 60:
        m50 = idx.rolling(50).mean()
        market_ok = bool(idx.iloc[-1] > m50.iloc[-1] and m50.iloc[-1] > m50.iloc[-11])
    groups = []
    for t in active:
        rows = sorted(found[t.key], key=lambda r: r["value20"], reverse=True)
        if rows:
            groups.append({"key": t.key, "name": t.name, "short": t.short or t.name, "source": t.source, "plan": t.plan, "record": rec[t.key],
                           "count": len(rows), "candidates": rows[:PER_TECHNIQUE]})
    # One BUY per stock, calmest first; none in a paused market.
    per: dict[str, dict] = {}
    for t in active:
        for r in found[t.key]:
            e = per.setdefault(r["symbol"], {**r, "techniques": []})
            e["techniques"].append(t.short or t.name)
    buys = sorted(per.values(), key=lambda r: r["atrp"] if r["atrp"] == r["atrp"] else 1.0)
    paused = bool(PAUSE_IN_UPTREND[market] and market_ok)
    # Paper log: stocks that left the universe still get replayed; then today's signals are logged.
    if followed:
        for sym, h in _download(list(followed)).items():
            updates += paper.update(Bars(features(h, idx, lite=True)), followed[sym], market)
    rank = {r["symbol"]: n for n, r in enumerate(buys)}
    signals = [{"symbol": r["symbol"], "name": r["name"], "tech": t.key, "date": r["date"], "rank": rank[r["symbol"]],
                "limit": r["limit"], "pick": not paused} for t in active for r in found[t.key]]
    try:
        log.info("swing paper %s: %d replayed, %d new", market, len(updates), paper.save(market, updates, signals))
    except Exception as e:  # the scan result matters more than the log
        log.exception("swing paper %s failed: %s", market, e)
    if as_of is not None:
        try:  # the next session's orders for the Kiwoom mock account, when its keys are set
            kiwoom_mock.plan(market, updates, {r["symbol"]: r["close"] for r in buys}, as_of.strftime("%Y-%m-%d"))
        except Exception as e:
            log.exception("kiwoom mock plan %s failed: %s", market, e)
    return {"market": market, "asOf": as_of.strftime("%Y-%m-%d") if as_of is not None else None,
            "scanned": scanned, "marketOk": market_ok, "paused": paused, "slots": SLOTS[market],
            "buyCount": 0 if paused else len(buys), "buys": [] if paused else buys[:BUYS_KEPT],
            "techniques": [{"key": t.key, "name": t.name, "short": t.short or t.name, "needsMarket": t.needs_market} for t in active],
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
            _CACHE.pop("swing:latest", None)  # the next /swing reads the new scan
            _release()
            log.info("swing scan %s: %d groups", market, len(result["groups"]))
        except Exception as e:
            log.exception("swing scan %s failed: %s", market, e)
        finally:
            _running.discard(market)

    threading.Thread(target=work, daemon=True).start()
    return True


def latest() -> dict:
    """Both markets' stored scans. Held in memory between scans: each database read costs about a
    second from the free server, and the result only changes twice a day."""
    return _cached("swing:latest", 3600, _latest)


def _latest() -> dict:
    out = {}
    for m in ("KR", "US"):
        row = get_state(f"swing:{m}")
        if row:
            out[m] = json.loads(row.value)
    return out


# ---- SELL on holdings --------------------------------------------------------------------------------

def market_of(symbol: str) -> str:
    return "KR" if symbol.endswith((".KS", ".KQ")) else "US"


def replay(b: Bars, tech, fill: int, entry_px: float) -> dict | None:
    """Run tech's exit rule on a position filled at bar `fill` (signal the bar before), the way the
    backtest does. Returns the sell order due now, or None while the rule still holds."""
    pos = Pos(entry=entry_px, i=fill, sig=fill - 1)
    h = b["h"]
    for i in range(fill, b.n):
        orders = tech.exit(b, i, pos)
        if i == b.n - 1:
            for kind, frac, *lvl in orders:
                if frac >= pos.left - 1e-9 or kind == "mkt":
                    return {"order": "지정가" if kind == "lmt" else "시가", "limit": float(lvl[0]) if lvl else None, "since": None}
            return None
        for kind, frac, *lvl in orders:
            if kind == "mkt" or h[i + 1] >= lvl[0]:
                pos.left -= min(frac, pos.left)
                pos.sold += kind == "lmt"
                if pos.left <= 1e-9:
                    # The rule already sold on bar i+1 and the position is still held: sell at the open.
                    return {"order": "시가", "limit": None, "since": b.index[i + 1].strftime("%Y-%m-%d")}
    return None


def sells(holdings: list[dict]) -> list[dict]:
    """holdings: {symbol, buyPrice, buyDate}. A holding is a swing position when a passing technique
    fired on the bar before its buy date; SELL when that technique's exit rule says so."""
    rec = records()
    held = [h for h in holdings if h.get("buyDate") and h.get("buyPrice")]
    if not held:
        return []
    markets = {market_of(h["symbol"]) for h in held}
    prices = _download([h["symbol"] for h in held] + [INDEX[m] for m in markets])
    names = {u["symbol"]: u["name"] for u in get_universe()}
    out = []
    for hd in held:
        s, mkt = hd["symbol"], market_of(hd["symbol"])
        if s not in prices:
            continue
        idx = prices.get(INDEX[mkt], pd.DataFrame()).get("c")
        b = Bars(features(prices[s], idx, lite=True))
        fill = int(b.index.searchsorted(pd.Timestamp(hd["buyDate"])))
        if fill < 1 or fill >= b.n:
            continue
        fired = [t for t in TECHNIQUES if rec.get(mkt, {}).get(t.key, {}).get("pass") and t.entry(b, fill - 1)]
        if not fired:
            continue
        t = min(fired, key=lambda t: EXIT_PRIORITY.index(t.key) if t.key in EXIT_PRIORITY else len(EXIT_PRIORITY))
        order = replay(b, t, fill, float(hd["buyPrice"]))
        if order:
            out.append({"symbol": s, "name": names.get(s), "market": mkt, "close": float(b["c"][b.n - 1]),
                        **order, "techniques": [t.short or t.name], "date": b.index[b.n - 1].strftime("%Y-%m-%d")})
    return out
