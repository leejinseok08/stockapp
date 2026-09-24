"""Market temperature (0-100) for each ISA target, with every input shown.

Higher score = cheaper / more fearful conditions. It used to scale the monthly DCA amount
(0.5x/1.0x/1.5x), but the phase-3 backtest (docs/signal-research.md) found that scaling lost ~16% of
final value to plain DCA on the owner's plan, so it is now context only and the plan (plan.py) buys a
fixed amount every month.
"""

import logging

import pandas as pd

from .macro import KST, _daily_closes, _flow_frame, _trend_stats, krx_configured
from .market import _cached

log = logging.getLogger("stockapp.signals")

# The first three are the owner's ISA plan; KOSPI is kept as a reference reading only.
# KODEX 미국반도체 tracks MVIS US Listed Semiconductor 25, the same index as VanEck SMH.
TARGETS = [
    {"id": "sp500", "symbol": "^GSPC", "name": "미국 S&P500", "etfExample": "TIGER·KODEX 미국S&P500", "region": "US", "reference": False},
    {"id": "ndx", "symbol": "^NDX", "name": "미국 나스닥100", "etfExample": "TIGER·KODEX 미국나스닥100", "region": "US", "reference": False},
    {"id": "semis", "symbol": "SMH", "name": "미국 반도체", "etfExample": "KODEX 미국반도체 (MVIS 반도체 25)", "region": "US", "reference": False},
    {"id": "kospi", "symbol": "^KS11", "name": "코스피", "etfExample": "KODEX 200 · 참고용", "region": "KR", "reference": True},
]

WEIGHTS = {
    "US": {"position": 0.30, "overheat": 0.20, "pullback": 0.15, "fear": 0.15, "fx": 0.20},
    "KR": {"position": 0.30, "overheat": 0.20, "pullback": 0.15, "flows": 0.35},
}

BANDS = [  # (min score, reading) -- a description of the market, not a buy instruction
    (70, "조정·공포 구간"),
    (40, "보통"),
    (0, "과열 구간"),
]


def _clamp(v: float) -> float:
    return max(0.0, min(100.0, v))


def _percentile(series: pd.Series, value: float) -> float:
    """Where `value` sits in the series' history, 0-100."""
    s = series.dropna()
    return float((s <= value).mean() * 100) if len(s) else 50.0


def _component(key, label, score, raw, reason):
    return {"key": key, "label": label, "score": round(score, 1), "raw": raw, "reason": reason}


def _price_components(stats: dict) -> list[dict]:
    comps = []
    r52 = stats.get("range52w")
    if r52 is not None:
        comps.append(_component(
            "position", "52주 위치", 100 - r52, round(r52, 1),
            f"52주 범위의 {r52:.0f}% 지점. 저점에 가까울수록 가점",
        ))
    ma = stats.get("vsMa200")
    if ma is not None:
        # +15% above the 200-day average scores 0, -15% below scores 100.
        comps.append(_component(
            "overheat", "200일선 과열", _clamp(50 - ma * 50 / 15), round(ma, 2),
            f"200일선 대비 {ma:+.1f}%. 멀리 위에 있을수록 감점",
        ))
    m1 = stats.get("change1m")
    if m1 is not None:
        # a -10% month scores 100, a +10% month scores 0.
        comps.append(_component(
            "pullback", "1개월 조정", _clamp(50 - m1 * 5), round(m1, 2),
            f"최근 1개월 {m1:+.1f}%. 조정이 클수록 가점",
        ))
    return comps


def _fear_component(vix: pd.Series) -> dict | None:
    if vix.empty:
        return None
    now = float(vix.iloc[-1])
    pct = _percentile(vix, now)
    return _component("fear", "VIX 공포지수", pct, round(now, 2), f"VIX {now:.1f}, 1년 중 상위 {100 - pct:.0f}%. 공포가 클수록 가점")


def _fx_component(krw: pd.Series) -> tuple[dict | None, str | None]:
    stats = _trend_stats(krw)
    r52 = stats.get("range52w")
    if r52 is None:
        return None, None
    rate = stats["last"]
    comp = _component(
        "fx", "원/달러 환율", 100 - r52, round(rate, 1),
        f"{rate:,.0f}원, 1년 범위의 {r52:.0f}% 지점. 환율이 낮을수록(원화 강세) 달러 자산을 싸게 삼",
    )
    if r52 >= 80:
        hint = "환율이 1년 중 높은 편이라 환헤지(H) 상품을 고려해볼 만해요"
    elif r52 <= 30:
        hint = "환율이 1년 중 낮은 편이라 환노출 상품이 유리한 구간이에요"
    else:
        hint = "환율은 중간 수준이에요"
    return comp, hint


def _flows_component() -> dict | None:
    if not krx_configured():
        return None
    df = _flow_frame("KOSPI")
    if len(df) < 60:
        return None
    rolling = df["foreign"].rolling(20).sum()
    now = float(rolling.iloc[-1])
    pct = _percentile(rolling, now)
    return _component(
        "flows", "외국인 20일 순매수", pct, now,
        f"20일 누적 {now / 1e12:+.2f}조원, 1년 중 {pct:.0f}번째 백분위. 외국인이 많이 살수록 가점",
    )


def score_target(target: dict, stats: dict, extras: dict) -> dict:
    """Pure scoring step, shared by the live endpoint and the backtest."""
    comps = _price_components(stats)
    hint = None
    if target["region"] == "US":
        comps += [c for c in (extras["fear"], extras["fx"]) if c]
        hint = extras["fx_hint"]
    elif extras["flows"]:
        comps.append(extras["flows"])

    weights = WEIGHTS[target["region"]]
    used = [c for c in comps if c["key"] in weights]
    total_w = sum(weights[c["key"]] for c in used)
    # Missing inputs (e.g. flows without KRX login) are dropped and the rest re-weighted.
    score = sum(c["score"] * weights[c["key"]] for c in used) / total_w if total_w else None
    for c in used:
        c["weight"] = round(weights[c["key"]] / total_w, 3) if total_w else 0

    band = next((b for b in BANDS if score is not None and score >= b[0]), None)
    return {
        **target,
        "asOf": stats.get("asOf"),
        "score": round(score, 1) if score is not None else None,
        "action": band[1] if band else None,
        "components": used,
        "missing": sorted(set(weights) - {c["key"] for c in used}),
        "fxHint": hint,
    }


def _score(target: dict, extras: dict) -> dict:
    return score_target(target, _trend_stats(_daily_closes(target["symbol"])), extras)


def get_signals() -> dict:
    def build():
        def safe(fn):
            try:
                return fn()
            except Exception as e:
                log.warning("signal input %s failed: %s", fn.__name__, e)
                return None

        def fear():
            return _fear_component(_daily_closes("^VIX"))

        def fx_():
            return _fx_component(_daily_closes("KRW=X"))

        fx = safe(fx_) or (None, None)
        extras = {"fear": safe(fear), "fx": fx[0], "fx_hint": fx[1], "flows": safe(_flows_component)}
        targets = []
        for t in TARGETS:
            try:
                targets.append(_score(t, extras))
            except Exception as e:
                log.warning("signal %s failed: %s", t["id"], e)
        return {
            "targets": targets,
            "bands": [{"min": b[0], "action": b[1]} for b in BANDS],
            "generatedAt": pd.Timestamp.now(tz=KST).isoformat(timespec="minutes"),
        }

    return _cached("signals", 600, build)


def signal_rows(signals: dict) -> list[tuple[str, str, float]]:
    return [
        (t["asOf"], f"signal:{t['id']}", t["score"])
        for t in signals["targets"]
        if t.get("asOf") and t.get("score") is not None
    ]
