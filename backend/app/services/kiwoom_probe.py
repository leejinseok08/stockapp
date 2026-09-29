"""Would Kiwoom be a better price source than yfinance / pykrx? (owner, 2026-09-29: "switch only if stable")

Once a day (worker, after the KR scan) this fetches the same daily bars from Kiwoom and from yfinance for a
fixed sample and records per source: failures, seconds per symbol, and how far Kiwoom's closes are from
yfinance's over the last 20 sessions. Nothing reads Kiwoom prices yet; /kiwoom/probe shows the record.
"""

import json
import logging
import time
from datetime import datetime, timedelta

import yfinance as yf

from ..db import get_state, put_state
from . import kiwoom
from .macro import KST

log = logging.getLogger("stockapp.kiwoom")

SAMPLE = {"KR": ["005930.KS", "000660.KS", "035420.KS", "373220.KS", "247540.KQ"],
          "US": ["NVDA", "AAPL", "MSFT", "JPM", "BRK-B"]}
KEEP = 60  # days of results


def _mode() -> str | None:
    return "real" if kiwoom.configured("real") else "mock" if kiwoom.configured("mock") else None


def kiwoom_closes(market: str, symbol: str, mode: str) -> dict[str, float]:
    """{YYYY-MM-DD: close} for about the last 3 months, split-adjusted."""
    c = kiwoom.client(mode)
    if market == "KR":
        page = c.call("ka10081", {"stk_cd": kiwoom.kr_code(symbol), "base_dt": datetime.now(KST).strftime("%Y%m%d"),
                                  "upd_stkpc_tp": "1"})[0]
        rows = page.get("stk_dt_pole_chart_qry") or []
    else:
        start = (datetime.now(KST) - timedelta(days=90)).strftime("%Y%m%d")
        sym = symbol.upper().replace("-", ".")
        page = c.call("usa06012", {"stex_tp": kiwoom.us_exchange(sym, mode), "stk_cd": sym, "strt_dt": start,
                                   "upd_stkpc_tp": "1", "exrt_appl_tp": "0"})[0]
        rows = page.get("result_list") or []
    out = {}
    for r in rows:
        d, px = str(r.get("dt") or ""), kiwoom.num(r.get("cur_prc"))
        if len(d) == 8 and px:
            out[f"{d[:4]}-{d[4:6]}-{d[6:]}"] = abs(px)
    return out


def yf_closes(symbol: str) -> dict[str, float]:
    h = yf.Ticker(symbol).history(period="3mo", auto_adjust=False)
    return {i.strftime("%Y-%m-%d"): float(v) for i, v in h["Close"].dropna().items()}


def run() -> dict:
    mode = _mode()
    if not mode:
        return {"skipped": "키움 키 미설정"}
    day = {"date": datetime.now(KST).strftime("%Y-%m-%d"), "mode": mode, "markets": {}}
    for market, symbols in SAMPLE.items():
        res = {"kiwoom": {"fail": 0, "sec": 0.0}, "yf": {"fail": 0, "sec": 0.0}, "maxDiff": 0.0, "compared": 0, "errors": []}
        for sym in symbols:
            got = {}
            for src, fn in (("kiwoom", lambda: kiwoom_closes(market, sym, mode)), ("yf", lambda: yf_closes(sym))):
                t0 = time.monotonic()
                try:
                    got[src] = fn()
                    if not got[src]:
                        raise ValueError("빈 응답")
                except Exception as e:
                    res[src]["fail"] += 1
                    res["errors"].append(f"{src} {sym}: {str(e)[:120]}")
                res[src]["sec"] += time.monotonic() - t0
            if len(got) == 2:
                common = sorted(set(got["kiwoom"]) & set(got["yf"]))[-20:]
                for d in common:
                    diff = abs(got["kiwoom"][d] / got["yf"][d] - 1)
                    res["maxDiff"] = max(res["maxDiff"], diff)
                res["compared"] += len(common)
        for src in ("kiwoom", "yf"):
            res[src]["sec"] = round(res[src]["sec"] / len(symbols), 2)
        day["markets"][market] = res
    hist = history()
    hist = [h for h in hist if h["date"] != day["date"]] + [day]
    put_state("kiwoom:probe", json.dumps(hist[-KEEP:], ensure_ascii=False), datetime.now(KST).isoformat(timespec="minutes"))
    log.info("kiwoom probe: %s", json.dumps(day["markets"], ensure_ascii=False)[:500])
    return day


def history() -> list[dict]:
    row = get_state("kiwoom:probe")
    return json.loads(row.value) if row else []


def verdict() -> dict:
    """The record so far, summed per market and source."""
    hist = history()
    out = {"days": len(hist), "since": hist[0]["date"] if hist else None, "markets": {}}
    for market in SAMPLE:
        days = [h["markets"][market] for h in hist if market in h.get("markets", {})]
        if not days:
            continue
        n = len(SAMPLE[market]) * len(days)
        out["markets"][market] = {
            src: {"failRate": sum(d[src]["fail"] for d in days) / n, "sec": round(sum(d[src]["sec"] for d in days) / len(days), 2)}
            for src in ("kiwoom", "yf")
        } | {"maxDiff": max(d["maxDiff"] for d in days)}
    return out
