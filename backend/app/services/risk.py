"""Crash-warning gauge: how many of five well-known stress signals are lit right now.

Display only: it never drives a buy/sell call (docs/signal-research.md section 4 -- warnings give no
timing and false alarms are common; the answer to stress is sizing, not selling everything).
"""

import io
import logging
import urllib.request
from datetime import datetime

import pandas as pd
import yfinance as yf

from .macro import KST, _daily_closes
from .market import _cached

log = logging.getLogger("stockapp.risk")

FRED_CSV = "https://fred.stlouisfed.org/graph/fredgraph.csv?id={}"


def _fred(series_id: str) -> pd.Series:
    def fetch():
        with urllib.request.urlopen(FRED_CSV.format(series_id), timeout=20) as resp:
            df = pd.read_csv(io.StringIO(resp.read().decode("utf-8")), na_values=["."])
        s = df.set_index(pd.to_datetime(df.iloc[:, 0])).iloc[:, 1].dropna().astype(float)
        return s.loc[s.index >= s.index[-1] - pd.Timedelta(days=800)]

    return _cached(f"fred:{series_id}", 6 * 3600, fetch)


def _closes_2y(ticker: str) -> pd.Series:
    def fetch():
        return yf.Ticker(ticker).history(period="2y", interval="1d")["Close"].dropna()

    return _cached(f"daily2y:{ticker}", 900, fetch)


def _item(key, label, value, unit, lit, rule, reason, as_of, source, history=None, zones=None):
    """zones: value ranges that count as danger, {"from": low or None, "to": high or None}; the app
    shades them behind the one-year line so "how close to the line" reads at a glance."""
    return {"key": key, "label": label, "value": value, "unit": unit, "lit": bool(lit), "rule": rule,
            "reason": reason, "asOf": as_of, "source": source,
            "history": _weekly(history) if history is not None else [], "zones": zones or []}


def _weekly(s: pd.Series) -> list[dict]:
    """Last year, one point per week (Friday close), for a sparkline."""
    s = s.dropna()
    s = s.loc[s.index >= s.index[-1] - pd.Timedelta(days=365)]
    w = s.resample("W-FRI").last().dropna()
    if len(w) and w.index[-1] < s.index[-1]:
        w.loc[s.index[-1]] = s.iloc[-1]
    return [{"t": int(pd.Timestamp(t).timestamp() * 1000), "v": round(float(v), 3)} for t, v in w.items()]


def high_yield(s: pd.Series) -> dict:
    last, month_ago = float(s.iloc[-1]), float(s.iloc[-22]) if len(s) > 21 else float(s.iloc[0])
    rise = last - month_ago
    lit = last >= 5.0 or rise >= 1.0
    reason = f"{last:.2f}%, 1개월 {rise:+.2f}%p. " + (
        "신용시장이 위험을 먼저 반영하는 중" if lit else "정상 범위(3~4%대 이하)")
    return _item("hy", "하이일드 스프레드", round(last, 2), "%", lit, "5% 이상 또는 1개월 +1%p 이상",
                 reason, s.index[-1].strftime("%Y-%m-%d"), "FRED BAMLH0A0HYM2",
                 history=s, zones=[{"from": 5.0, "to": None}])


def yield_curve(s: pd.Series) -> dict:
    last = float(s.iloc[-1])
    year = s.loc[s.index >= s.index[-1] - pd.Timedelta(days=365)]
    normalized = last > 0 and float(year.min()) < 0
    if normalized:
        reason = f"{last:+.2f}%p. 최근 1년 안에 역전됐다가 정상화 — 역사적으로 침체가 뒤따른 패턴"
    elif last < 0:
        reason = f"{last:+.2f}%p. 역전 중 — 위험 신호는 역전 자체보다 이후 정상화 시점"
    else:
        reason = f"{last:+.2f}%p. 최근 1년 역전 없음"
    return _item("curve", "장단기 금리차 (10년-2년)", round(last, 2), "%p", normalized,
                 "1년 내 역전 후 정상화", reason, s.index[-1].strftime("%Y-%m-%d"), "FRED T10Y2Y",
                 history=s, zones=[{"from": None, "to": 0.0}])


def trend(closes: pd.Series) -> dict:
    last, ma = float(closes.iloc[-1]), float(closes.iloc[-200:].mean())
    gap = (last / ma - 1) * 100
    lit = last < ma
    reason = f"200일선 대비 {gap:+.1f}%. " + ("장기 추세 이탈" if lit else "장기 추세 위")
    gaps = (closes / closes.rolling(200).mean() - 1) * 100
    return _item("trend", "S&P500 200일선", round(gap, 1), "%", lit, "200일선 아래",
                 reason, closes.index[-1].strftime("%Y-%m-%d"), "Yahoo ^GSPC",
                 history=gaps, zones=[{"from": None, "to": 0.0}])


def vix(closes: pd.Series) -> dict:
    last = float(closes.iloc[-1])
    lit = last >= 30 or last <= 12
    if last >= 30:
        reason = f"{last:.1f}. 패닉 구간"
    elif last <= 12:
        reason = f"{last:.1f}. 지나친 안일함 — 급등 전 고요였던 경우가 많음"
    else:
        reason = f"{last:.1f}. 보통(12~30)"
    return _item("vix", "VIX", round(last, 1), "", lit, "30 이상 또는 12 이하",
                 reason, closes.index[-1].strftime("%Y-%m-%d"), "Yahoo ^VIX",
                 history=closes, zones=[{"from": 30.0, "to": None}, {"from": None, "to": 12.0}])


def breadth(rsp: pd.Series, spy: pd.Series) -> dict:
    ratio = (rsp / spy).dropna()
    change = (float(ratio.iloc[-1]) / float(ratio.iloc[-64]) - 1) * 100
    lit = change <= -3
    reason = f"동일가중(RSP)이 시총가중(SPY) 대비 3개월 {change:+.1f}%. " + (
        "소수 대형주가 지수를 끌어올리는 좁은 장" if lit else "상승이 넓게 퍼져 있음")
    changes = (ratio / ratio.shift(63) - 1) * 100
    return _item("breadth", "시장 폭 (RSP/SPY)", round(change, 1), "%", lit, "3개월 −3% 이하",
                 reason, ratio.index[-1].strftime("%Y-%m-%d"), "Yahoo RSP, SPY",
                 history=changes, zones=[{"from": None, "to": -3.0}])


LEVELS = [(3, "경계"), (2, "관찰"), (0, "평상")]


def summarize(items: list[dict]) -> dict:
    lit = sum(i["lit"] for i in items)
    level = next(name for min_lit, name in LEVELS if lit >= min_lit)
    return {"lit": lit, "total": len(items), "level": level, "items": items}


def get_risk() -> dict:
    def build():
        checks = [
            ("hy", lambda: high_yield(_fred("BAMLH0A0HYM2"))),
            ("curve", lambda: yield_curve(_fred("T10Y2Y"))),
            ("trend", lambda: trend(_closes_2y("^GSPC"))),
            ("vix", lambda: vix(_daily_closes("^VIX"))),
            ("breadth", lambda: breadth(_closes_2y("RSP"), _closes_2y("SPY"))),
        ]
        items, failed = [], []
        for key, fn in checks:
            try:
                items.append(fn())
            except Exception as e:
                log.warning("risk input %s failed: %s", key, e)
                failed.append(key)
        return {**summarize(items), "failed": failed,
                "generatedAt": datetime.now(KST).isoformat(timespec="minutes")}

    return _cached("risk", 1800, build)


def risk_rows(risk: dict) -> list[tuple[str, str, float]]:
    return [(i["asOf"], f"risk:{i['key']}", float(i["value"])) for i in risk["items"] if i.get("asOf")]
