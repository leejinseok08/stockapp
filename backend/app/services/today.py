"""The 오늘 tab: what changed today, in one call (docs/app-design.md).

- signal changes: stocks whose trend call flipped at the latest close (act next session), plus
  flips from the last few sessions so a missed day isn't lost
- risk gauge summary
- earnings dates within two weeks (the research note's catalysts)
Holdings P/L is computed on the phone from the watchlist it already has.
"""

from datetime import datetime

import pandas as pd

from .analysis import get_analysis
from .macro import KST
from .market import _cached
from .risk import get_risk
from .stockscan import get_list

RECENT_SESSIONS = 5
EARNINGS_DAYS = 14
DIVIDEND_DAYS = 30


def upcoming_dividends(rows: list[dict], today: pd.Timestamp) -> list[dict]:
    """Ex-dividend dates within DIVIDEND_DAYS for the listed stocks and ETFs; estimated ones say so."""
    from concurrent.futures import ThreadPoolExecutor

    from .extras import get_dividends

    def one(r):
        try:
            d = get_dividends(r["symbol"])
        except Exception:
            return None
        if not d.get("pays") or not d.get("nextExDate"):
            return None
        if not today <= pd.Timestamp(d["nextExDate"]) <= today + pd.Timedelta(days=DIVIDEND_DAYS):
            return None
        return {"symbol": r["symbol"], "name": r.get("name"), "logo": r.get("logo"), "date": d["nextExDate"],
                "estimated": d.get("nextEstimated"), "amount": d.get("lastAmount"), "currency": d.get("currency")}

    with ThreadPoolExecutor(max_workers=3) as ex:
        found = [x for x in ex.map(one, rows) if x]
    return sorted(found, key=lambda x: x["date"])


def summarize(rows: list[dict], risk: dict | None, catalysts: list[dict], today: pd.Timestamp) -> dict:
    changed, recent = [], []
    cutoff = today - pd.tseries.offsets.BDay(RECENT_SESSIONS)
    for r in rows:
        t = r.get("trend") or {}
        item = {"symbol": r["symbol"], "name": r.get("name"), "logo": r.get("logo"), "action": t.get("action"),
                "position": t.get("position"), "since": t.get("since"), "asOf": t.get("asOf"),
                "rating": (r.get("rating") or {}).get("rating")}
        if t.get("action") in ("BUY", "SELL"):
            changed.append(item)
        elif t.get("since") and pd.Timestamp(t["since"]) >= cutoff:
            recent.append(item)
    upcoming = sorted((c for c in catalysts if today <= pd.Timestamp(c["date"]) <= today + pd.Timedelta(days=EARNINGS_DAYS)),
                      key=lambda c: c["date"])
    return {
        "changed": changed,
        "recent": sorted(recent, key=lambda i: i["since"], reverse=True),
        "risk": {k: risk[k] for k in ("lit", "total", "level")} | {"litItems": [i["label"] for i in risk["items"] if i["lit"]]}
        if risk else None,
        "earnings": upcoming,
        # When nothing reports within two weeks, still say when the next one is.
        "nextEarnings": min((c for c in catalysts if pd.Timestamp(c["date"]) >= today), key=lambda c: c["date"], default=None),
    }


def get_today(extra: list[str]) -> dict:
    def build():
        today = pd.Timestamp(datetime.now(KST).date())
        rows = get_list(extra)["rows"]
        # Korean display names (the app's list, Naver for anything added through search), not Yahoo's.
        from ..tickers import UNIVERSE_BY_SYMBOL
        from .market import get_name

        rows = [{**r, "name": UNIVERSE_BY_SYMBOL.get(r["symbol"], {}).get("name") or get_name(r["symbol"]) or r.get("name")}
                for r in rows]
        catalysts = []
        for r in rows:
            try:
                for c in get_analysis(r["symbol"])["catalysts"]:
                    catalysts.append({"symbol": r["symbol"], "name": r.get("name"), "logo": r.get("logo"), **c})
            except Exception:
                pass
        try:
            risk = get_risk()
        except Exception:
            risk = None
        return {**summarize(rows, risk, catalysts, today), "dividends": upcoming_dividends(rows, today),
                "generatedAt": datetime.now(KST).isoformat(timespec="minutes")}

    return _cached("today:" + ",".join(sorted(extra)), 900, build)
