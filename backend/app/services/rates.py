"""Korean and US policy/bond rates side by side, and the KR−US gaps that move USD/KRW.

Korean series come from the Bank of Korea ECOS API (free key in ECOS_API_KEY, set on Render, never
in the repo); US series from FRED. Display only (시장 tab); nothing here drives a buy/sell call.
"""

import json
import logging
import os
import urllib.request
from datetime import datetime, timedelta

import pandas as pd

from .macro import KST
from .market import _cached
from .risk import _fred, _weekly

log = logging.getLogger("stockapp.rates")

ECOS_URL = "https://ecos.bok.or.kr/api/StatisticSearch/{key}/json/kr/1/{rows}/{stat}/{cycle}/{start}/{end}/{item}"

# (key, label, one-line description, source, fetch spec)
KR = [
    ("bok", "한국 기준금리", "한국은행 정책금리", ("722Y001", "D", "0101000")),
    ("ktb3", "국고채 3년", "통화정책 기대를 가장 잘 반영", ("817Y002", "D", "010200000")),
    ("ktb10", "국고채 10년", "장기 성장·물가 기대", ("817Y002", "D", "010210000")),
]
US = [
    ("fed", "미국 기준금리", "연준 목표범위 상단", "DFEDTARU"),
    ("ust10", "미국채 10년", "글로벌 장기금리 기준", "DGS10"),
]
# KR minus US: a wider negative gap tends to weaken the won (why ISA hedging matters).
GAPS = [
    ("gapPolicy", "기준금리 차", "한국 − 미국 · 음수 = 미국이 높음", "bok", "fed"),
    ("gap10", "10년물 금리 차", "한국 − 미국 · 음수 = 미국이 높음", "ktb10", "ust10"),
]


def _ecos(stat: str, cycle: str, item: str, days: int = 800) -> pd.Series:
    key = os.getenv("ECOS_API_KEY")
    if not key:
        raise RuntimeError("ECOS_API_KEY not set")

    def fetch():
        end = datetime.now(KST)
        url = ECOS_URL.format(key=key, rows=2000, stat=stat, cycle=cycle, item=item,
                              start=(end - timedelta(days=days)).strftime("%Y%m%d"), end=end.strftime("%Y%m%d"))
        with urllib.request.urlopen(url, timeout=20) as resp:
            body = json.loads(resp.read().decode("utf-8"))
        return parse_ecos(body)

    return _cached(f"ecos:{stat}:{item}", 6 * 3600, fetch)


def parse_ecos(body: dict) -> pd.Series:
    if "StatisticSearch" not in body:  # e.g. {"RESULT": {"CODE": "INFO-200", "MESSAGE": "해당하는 데이터가 없습니다."}}
        raise RuntimeError(f"ECOS: {body.get('RESULT', body)}")
    rows = body["StatisticSearch"]["row"]
    s = pd.Series({pd.to_datetime(r["TIME"], format="%Y%m%d"): float(r["DATA_VALUE"]) for r in rows
                   if r.get("DATA_VALUE") not in (None, "")})
    return s.sort_index()


def gap(a: pd.Series, b: pd.Series) -> pd.Series:
    """a − b on the days both published. Policy rates are step functions, so carrying the last
    decision forward is the rate actually in force, not an invented value."""
    both = pd.concat([a, b], axis=1, keys=["a", "b"]).dropna()
    return (both["a"] - both["b"]).round(3)


def _item(key, label, what, s: pd.Series, source: str) -> dict:
    s = s.dropna()
    last_day = s.index[-1]
    month_ago = s.asof(last_day - pd.Timedelta(days=30))
    return {
        "key": key, "label": label, "what": what, "source": source,
        "value": round(float(s.iloc[-1]), 3),
        "change1m": None if pd.isna(month_ago) else round(float(s.iloc[-1] - month_ago), 3),
        "asOf": last_day.strftime("%Y-%m-%d"),
        "history": _weekly(s),
    }


def get_rates() -> dict:
    series: dict[str, pd.Series] = {}
    items, failed = [], []
    for key, label, what, (stat, cycle, item) in KR:
        try:
            series[key] = _ecos(stat, cycle, item)
            items.append(_item(key, label, what, series[key], "한국은행 ECOS"))
        except Exception as e:
            log.warning("rates %s failed: %s", key, e)
            failed.append(label)
    for key, label, what, fred_id in US:
        try:
            series[key] = _fred(fred_id)
            items.append(_item(key, label, what, series[key], "FRED"))
        except Exception as e:
            log.warning("rates %s failed: %s", key, e)
            failed.append(label)

    gaps = []
    for key, label, what, a, b in GAPS:
        if a in series and b in series:
            if a in ("bok",):  # policy rate: carry the decision forward onto US publishing days
                s = gap(series[a].reindex(series[a].index.union(series[b].index)).ffill(), series[b])
            else:
                s = gap(series[a], series[b])
            if len(s):
                gaps.append(_item(key, label, what, s, "ECOS · FRED"))

    return {
        "items": items,
        "gaps": gaps,
        "failed": failed,
        "keyMissing": not os.getenv("ECOS_API_KEY"),
        "generatedAt": datetime.now(KST).isoformat(timespec="minutes"),
    }
