"""Swing techniques from the owner's fmkorea posts, as daily-bar rules shared by the backtest
(swing_bt.py) and the live screener (screener.py).

Every rule reads only the bar it is called on and earlier bars. An entry signal at close i is
executed at bar i+1: at the open ("mkt") or at a limit price if bar i+1 trades there ("lmt").
Exit orders work the same way. Positions track fractions of the original size so rules can sell
in parts.

Excluded: the scalping posts (3057166579, 3110775328, 3251845422 need minute bars and the order
book) and the hourly-chart tip (3010598884); allocation posts (섀넌·이격도, 펜타포트) belong to the ISA side.
"""

from dataclasses import dataclass, field
from typing import Callable

import numpy as np
import pandas as pd

from .stockscan import TREND, trend_frame


def features(h: pd.DataFrame, index_close: pd.Series | None = None, lite: bool = False) -> pd.DataFrame:
    """h: columns o, h, l, c, v (daily, adjusted). index_close: the home index for relative strength.
    lite skips the two slow columns (the trend rule's per-bar loop and the rolling RSI quantiles) for
    the live scan on the free server; techniques that need them (trend, rsi_own) don't fire then."""
    f = h.copy()
    c, hi, lo, v = f["c"], f["h"], f["l"], f["v"]
    for n in (5, 10, 20, 25, 60, 120):
        f[f"ma{n}"] = c.rolling(n).mean()
    f["ma60up"] = f["ma60"] > f["ma60"].shift(5)
    f["ma120up"] = f["ma120"] > f["ma120"].shift(5)
    f["hi250"] = hi.rolling(250).max().shift(1)
    f["hi20"] = hi.rolling(20).max().shift(1)
    f["lo20"] = lo.rolling(20).min().shift(1)
    tr = pd.concat([hi - lo, (hi - c.shift()).abs(), (lo - c.shift()).abs()], axis=1).max(axis=1)
    f["atr"] = tr.rolling(14).mean()
    rng = (hi - lo).replace(0, np.nan)
    f["body"] = (c - f["o"]).abs() / rng
    f["upper"] = (hi - np.maximum(c, f["o"])) / rng
    f["bull"] = c > f["o"]
    f["vol20"] = v.rolling(20).mean().shift(1)
    f["value20"] = (c * v).rolling(20).mean()
    d = c.diff()
    up, dn = d.clip(lower=0).ewm(alpha=1 / 14).mean(), (-d.clip(upper=0)).ewm(alpha=1 / 14).mean()
    f["rsi"] = 100 - 100 / (1 + up / dn)
    if lite:
        f["rsi_lo"] = f["rsi_hi"] = np.nan
    else:
        f["rsi_lo"] = f["rsi"].rolling(250).quantile(0.2).shift(1)
        f["rsi_hi"] = f["rsi"].rolling(250).quantile(0.8).shift(1)
    macd = c.ewm(span=12, adjust=False).mean() - c.ewm(span=26, adjust=False).mean()
    f["macd"] = macd
    f["macdup"] = macd > macd.shift(5)
    sd = c.rolling(20).std()
    f["bbu"], f["bbl"] = f["ma20"] + 2 * sd, f["ma20"] - 2 * sd
    # Bollinger (20, 2) and envelope (20, ±10%) averaged into one 0-100 scale (fmkorea 4030738378).
    low_avg = (f["bbl"] + f["ma20"] * 0.9) / 2
    up_avg = (f["bbu"] + f["ma20"] * 1.1) / 2
    f["bandpos"] = (c - low_avg) / (up_avg - low_avg) * 100
    # Floor-trader pivots from this bar, for the next bar.
    p = (hi + lo + c) / 3
    f["pp"], f["r1"], f["s1"] = p, 2 * p - lo, 2 * p - hi
    f["r2"], f["s2"] = p + (hi - lo), p - (hi - lo)
    obv = (np.sign(d.fillna(0)) * v).cumsum()
    f["obv20"] = obv - obv.shift(20)
    f["ret20"] = c / c.shift(20) - 1
    ll, hh = lo.rolling(14).min(), hi.rolling(14).max()
    f["stoch"] = ((c - ll) / (hh - ll) * 100).rolling(3).mean()
    tp = p
    mf = tp * v
    pos_mf = mf.where(tp > tp.shift(), 0).rolling(14).sum()
    neg_mf = mf.where(tp < tp.shift(), 0).rolling(14).sum()
    f["mfi"] = 100 - 100 / (1 + pos_mf / neg_mf.replace(0, np.nan))
    # fmkorea 10325555927: 7 technical conditions.
    f["score"] = (
        (f["ma20"] > f["ma60"]).astype(int) + (c > f["ma20"]).astype(int) + f["ma60up"].astype(int)
        + (v.rolling(5).mean() > v.rolling(20).mean()).astype(int)
        + ((c >= f["hi250"]) | ((c > f["ma20"]) & (c < f["ma20"] * 1.03))).astype(int)
        + (f["rsi"] < 70).astype(int) + f["macdup"].astype(int)
    )
    f["trend_hold"] = False if lite else trend_frame(c, **TREND)["hold"]
    # Long bullish candle (fmkorea 3723039708): the most recent one in the last 5 bars, as a box.
    big = f["bull"] & (f["body"] >= 0.6) & ((hi - lo) >= 1.5 * f["atr"]) & (v >= 1.5 * f["vol20"])
    box_hi = pd.Series(np.where(big, hi, np.nan), index=f.index).ffill(limit=5).shift(1)
    box_lo = pd.Series(np.where(big, f["o"], np.nan), index=f.index).ffill(limit=5).shift(1)
    f["box_hi"], f["box_lo"] = box_hi, box_lo
    if index_close is not None:
        ratio = c / index_close.reindex(f.index).ffill()
        f["rs"], f["rs_ma"] = ratio, ratio.rolling(60).mean()
    else:
        f["rs"], f["rs_ma"] = np.nan, np.nan
    return f


class Bars:
    """Column arrays with row access that is fast enough for a per-bar loop."""

    def __init__(self, f: pd.DataFrame):
        self.a = {k: f[k].to_numpy() for k in f.columns}
        self.index = f.index
        self.n = len(f)

    def __getitem__(self, k):
        return self.a[k]


@dataclass
class Pos:
    entry: float
    i: int  # fill bar
    sig: int  # signal bar
    left: float = 1.0
    sold: int = 0
    s: dict = field(default_factory=dict)


def row(b: Bars, i: int):
    a = b.a
    return lambda k: a[k][i]


def _cross_up(x, y, i):
    return x[i - 1] <= y[i - 1] and x[i] > y[i]


# ---- techniques: entry(b, i) -> None | ("mkt",) | ("lmt", price);  exit(b, i, pos) -> orders -------

def breakout_entry(b, i):
    r = row(b, i)
    return ("mkt",) if r("c") > r("hi250") and r("bull") else None


def breakout_exit(b, i, pos):
    r = row(b, i)
    if r("c") < r("ma20") or r("c") < pos.entry * 0.92 or i - pos.i >= 40:
        return [("mkt", pos.left)]
    if r("body") < 0.1 and r("c") > pos.entry:
        return [("mkt", min(0.5, pos.left))]
    return []


def momentum_entry(b, i):
    r = row(b, i)
    ok = r("bull") and r("upper") <= 0.15 and r("body") >= 0.6 and r("v") >= 1.5 * r("vol20") and r("ma20") < r("c") <= r("ma20") * 1.08
    return ("mkt",) if ok else None


def momentum_exit(b, i, pos):
    r = row(b, i)
    if r("upper") >= 0.5 or (not r("bull") and r("body") >= 0.6) or r("c") < b["l"][pos.sig] or i - pos.i >= 10:
        return [("mkt", pos.left)]
    return []


def pullback_entry(b, i):
    r = row(b, i)
    ok = r("ma20") > r("ma60") and r("ma60up") and r("c") > r("ma60") and r("l") <= r("ma20") * 1.01 and r("c") >= r("ma20") and r("rsi") < 70
    return ("mkt",) if ok else None


def pullback_exit(b, i, pos):
    r = row(b, i)
    if r("c") < r("ma60") or i - pos.i >= 15 or (pos.sold and r("c") < r("ma20")) or (not pos.sold and r("c") < r("ma20") * 0.98):
        return [("mkt", pos.left)]
    return [] if pos.sold else [("lmt", 0.5, pos.entry * 1.06)]


def pivot_sell_exit(b, i, pos):
    r = row(b, i)
    if r("c") < r("ma60") or r("c") < r("s1") or i - pos.i >= 15:
        return [("mkt", pos.left)]
    return [("lmt", min(1 / 3, pos.left), r("r1"))]


def bnf_entry(b, i):
    r = row(b, i)
    return ("mkt",) if r("c") <= r("ma25") * 0.90 else None


def bnf_exit(b, i, pos):
    r = row(b, i)
    return [("mkt", pos.left)] if r("c") >= r("ma25") * 0.98 or i - pos.i >= 3 else []


def box_entry(b, i):
    r = row(b, i)
    bh = r("box_hi")
    return ("mkt",) if bh == bh and r("c") > bh and b["c"][i - 1] <= bh else None


def box_exit(b, i, pos):
    r = row(b, i)
    stop = b["box_hi"][pos.sig]  # after the breakout the box top is the stop (3723039708)
    return [("mkt", pos.left)] if r("c") < stop or i - pos.i >= 10 else []


def macd_entry(b, i):
    m = b["macd"]
    return ("mkt",) if m[i] > m[i - 1] and m[i - 1] <= m[i - 2] else None


def macd_exit(b, i, pos):
    m = b["macd"]
    return [("mkt", pos.left)] if m[i] < m[i - 1] else []


def bb_mid_entry(b, i):
    r = row(b, i)
    touched = np.nanmin(b["l"][i - 10:i] - b["bbl"][i - 10:i]) <= 0
    return ("mkt",) if touched and _cross_up(b["c"], b["ma20"], i) else None


def bb_mid_exit(b, i, pos):
    r = row(b, i)
    return [("mkt", pos.left)] if r("c") >= r("bbu") or r("c") < r("bbl") or i - pos.i >= 20 else []


def bb_retest_entry(b, i):
    r = row(b, i)
    was_top = np.nanmax(b["c"][i - 10:i] - b["bbu"][i - 10:i]) >= 0
    ok = was_top and r("l") <= r("ma20") * 1.01 and r("c") > r("ma20") and r("bull")
    return ("mkt",) if ok else None


def bb_retest_exit(b, i, pos):
    r = row(b, i)
    return [("mkt", pos.left)] if r("c") >= r("bbu") or r("c") < r("ma20") * 0.97 or i - pos.i >= 15 else []


def knee_entry(b, i):
    return ("mkt",) if _cross_up(b["ma20"], b["ma60"], i) else None


def knee_exit(b, i, pos):
    r = row(b, i)
    if "floor" not in pos.s:
        pos.s["floor"] = b["lo20"][pos.sig]
    if r("c") < pos.s["floor"] or (r("ma20") < r("ma60")):
        return [("mkt", pos.left)]
    if not pos.sold and r("c") >= r("bbu"):
        pos.sold = 1
        return [("mkt", 0.5)]
    return []


def swing2_entry(b, i):
    r = row(b, i)
    return ("mkt",) if r("ma60up") and _cross_up(b["c"], b["ma60"], i) else None


def swing2_exit(b, i, pos):
    r = row(b, i)
    if "floor" not in pos.s:
        pos.s["floor"] = b["lo20"][pos.sig]
    return [("mkt", pos.left)] if r("c") < pos.s["floor"] or r("c") < r("ma10") and r("c") > pos.entry * 1.05 or i - pos.i >= 30 else []


def band_entry(b, i):
    return ("mkt",) if b["bandpos"][i] <= 20 else None


def band_exit(b, i, pos):
    p = b["bandpos"][i]
    return [("mkt", pos.left)] if p >= 80 or p < 0 or i - pos.i >= 20 else []


def env_entry(b, i):
    r = row(b, i)
    lower = r("ma20") * 0.90
    return ("mkt",) if r("l") <= lower < r("c") else None


def env_exit(b, i, pos):
    r = row(b, i)
    if r("c") < r("ma20") * 0.85 or i - pos.i >= 15:
        return [("mkt", pos.left)]
    return [("lmt", pos.left, r("ma20"))]


def pivot_buy_entry(b, i):
    r = row(b, i)
    # Close between the pivot and R2 (not flown away): bid at the pivot line just below (2911032041).
    return ("lmt", r("pp")) if r("pp") < r("c") < r("r2") and r("c") > r("ma20") else None


def pivot_buy_exit(b, i, pos):
    r = row(b, i)
    if r("c") < b["s2"][pos.sig] or i - pos.i >= 5:
        return [("mkt", pos.left)]
    return [("lmt", pos.left, r("r1"))]


def wick_entry(b, i):
    r = row(b, i)
    return ("mkt",) if r("bull") and r("upper") >= 0.5 and r("v") >= 1.5 * r("vol20") else None


def wick_exit(b, i, pos):
    r = row(b, i)
    if r("c") < b["l"][pos.sig] or i - pos.i >= 5:
        return [("mkt", pos.left)]
    return [("lmt", pos.left, b["h"][pos.sig])]


def obv_entry(b, i):
    r = row(b, i)
    return ("mkt",) if r("ret20") < -0.05 and r("obv20") > 0 else None


def obv_exit(b, i, pos):
    r = row(b, i)
    if "floor" not in pos.s:
        pos.s["floor"] = b["lo20"][pos.sig] * 0.97
    return [("mkt", pos.left)] if r("c") > r("hi20") or r("c") < pos.s["floor"] or i - pos.i >= 20 else []


def mfi_entry(b, i):
    r = row(b, i)
    return ("mkt",) if r("mfi") - r("stoch") >= 20 and r("stoch") < 50 else None


def mfi_exit(b, i, pos):
    r = row(b, i)
    return [("mkt", pos.left)] if r("stoch") >= 80 or r("c") < b["s2"][pos.sig] or i - pos.i >= 10 else []


def score_entry(b, i):
    s = b["score"]
    return ("mkt",) if s[i] >= 5 and s[i - 1] < 5 else None


def score_exit(b, i, pos):
    r = row(b, i)
    return [("mkt", pos.left)] if r("score") <= 3 or r("c") < pos.entry * 0.92 or i - pos.i >= 20 else []


def rsi_own_entry(b, i):
    r = row(b, i)
    return ("mkt",) if r("ma120up") and r("c") > r("ma120") and r("rsi") <= r("rsi_lo") else None


def rsi_own_exit(b, i, pos):
    r = row(b, i)
    return [("mkt", pos.left)] if r("rsi") >= r("rsi_hi") or r("c") < r("ma120") or i - pos.i >= 15 else []


def rs_entry(b, i):
    return ("mkt",) if _cross_up(b["rs"], b["rs_ma"], i) else None


def rs_exit(b, i, pos):
    return [("mkt", pos.left)] if b["rs"][i] < b["rs_ma"][i] else []


def trend_entry(b, i):
    t = b["trend_hold"]
    return ("mkt",) if t[i] and not t[i - 1] else None


def trend_exit(b, i, pos):
    return [("mkt", pos.left)] if not b["trend_hold"][i] else []


@dataclass
class Technique:
    key: str
    name: str
    source: str
    entry: Callable
    exit: Callable
    plan: str  # one line: how the trade is run


TECHNIQUES = [
    Technique("breakout", "신고가 돌파", "2994079353", breakout_entry, breakout_exit,
              "52주 신고가 양봉 → 다음 날 시가 매수 · 십자봉마다 절반 매도 · 20일선 아래 또는 −8% 손절 · 최대 40일"),
    Technique("momentum", "모멘텀 양봉", "3044045823", momentum_entry, momentum_exit,
              "윗꼬리 짧은 장대양봉+거래량 1.5배 → 다음 날 시가 · 긴 윗꼬리/장대음봉/신호봉 저가 이탈 시 매도 · 최대 10일"),
    Technique("pullback", "20일선 눌림목", "3044045823·3395409037", pullback_entry, pullback_exit,
              "정배열 종목이 20일선 지지 → 다음 날 시가 · +6%에 절반 · 20일선 이탈 매도 · 60일선 손절 · 최대 15일"),
    Technique("pivot_sell", "눌림목+피벗 분할매도", "3268703411", pullback_entry, pivot_sell_exit,
              "20일선 눌림목 매수 · 매일 피벗 1차저항에 1/3씩 매도 · 1차지지/60일선 이탈 손절 · 최대 15일"),
    Technique("bnf", "BNF 이격도", "3395409037", bnf_entry, bnf_exit,
              "25일선보다 10% 이상 급락 → 다음 날 시가 · 25일선 −2% 복귀 또는 3일 뒤 매도"),
    Technique("box", "장대양봉 상단 돌파", "3723039708", box_entry, box_exit,
              "거래량 실린 장대양봉의 고가를 5일 안에 돌파 → 다음 날 시가 · 그 고가 아래로 내려오면 손절 · 최대 10일"),
    Technique("macd", "MACD 기울기 전환", "2907814422", macd_entry, macd_exit,
              "MACD 기울기 상향 전환 → 다음 날 시가 · 하향 전환 시 매도"),
    Technique("bb_mid", "볼린저 기준선 돌파", "2949007710", bb_mid_entry, bb_mid_exit,
              "하단밴드 터치 후 기준선 상향 돌파 → 다음 날 시가 · 상단밴드 도달 매도 · 하단밴드 이탈 손절"),
    Technique("bb_retest", "볼린저 상단→기준선 재상승", "2949007710", bb_retest_entry, bb_retest_exit,
              "상단밴드에서 기준선까지 눌린 뒤 양봉 → 다음 날 시가 · 상단밴드 매도 · 기준선 −3% 손절"),
    Technique("knee", "무릎 매수·어깨 매도", "3023719092·3553990302", knee_entry, knee_exit,
              "20일선이 60일선 상향 돌파 → 다음 날 시가 · 상단밴드에서 절반 · 하향 돌파 시 나머지 · 직전 저점 이탈 손절"),
    Technique("swing2", "스윙 2번 전략", "3184080122", swing2_entry, swing2_exit,
              "상승 중인 60일선을 다시 넘는 날 → 다음 날 시가 · 전저점 손절 · +5% 이후 10일선 이탈 매도 · 최대 30일"),
    Technique("band", "밴드 합성 스케일 20/80", "4030738378", band_entry, band_exit,
              "볼린저·엔벨로프 합성 위치 20 이하 → 다음 날 시가 · 80 이상 매도 · 0 아래 손절 · 최대 20일"),
    Technique("envelope", "엔벨로프 하단 지지", "3402058640", env_entry, env_exit,
              "20일선 −10% 터치 후 위에서 마감 → 다음 날 시가 · 20일선 지정가 매도 · −15% 손절 · 최대 15일"),
    Technique("pivot_buy", "피벗 기준선 매수", "2911032041", pivot_buy_entry, pivot_buy_exit,
              "기준선~2차저항 사이 마감 → 다음 날 피벗 기준선 지정가 매수 · 1차저항 지정가 매도 · 2차지지 손절 · 최대 5일"),
    Technique("wick", "거래량 윗꼬리 양봉", "3142020848", wick_entry, wick_exit,
              "거래량 실린 긴 윗꼬리 양봉 → 다음 날 시가 · 그 꼬리 끝 지정가 매도 · 저가 이탈 손절 · 최대 5일"),
    Technique("obv", "OBV 다이버전스", "3648842815", obv_entry, obv_exit,
              "20일 −5% 하락인데 OBV 상승 → 다음 날 시가 · 20일 고가 돌파 매도 · 저점 −3% 손절 · 최대 20일"),
    Technique("mfi", "스토캐스틱·MFI 다이버전스", "3480180071", mfi_entry, mfi_exit,
              "MFI가 스토캐스틱보다 20 이상 높음(스토캐스틱 50 미만) → 다음 날 시가 · 스토캐스틱 80 매도 · 최대 10일"),
    Technique("score", "7조건 매매 확률 점수", "10325555927", score_entry, score_exit,
              "기술 7조건 중 5개 이상으로 올라선 날 → 다음 날 시가 · 3개 이하 또는 −8% 매도 · 최대 20일"),
    Technique("rsi_own", "종목별 RSI 과매도", "9959890244·9959902866", rsi_own_entry, rsi_own_exit,
              "120일선 위 상승 종목의 RSI가 자기 1년 하위 20% → 다음 날 시가 · 상위 20% 매도 · 120일선 이탈 손절"),
    Technique("rs", "지수 대비 골든크로스", "4424508460", rs_entry, rs_exit,
              "종목/지수 비율이 60일 평균 위로 → 다음 날 시가 · 아래로 내려오면 매도"),
]
REFERENCE = Technique("trend", "추세 규칙 (앱 기존)", "앱 BUY/SELL", trend_entry, trend_exit, "200일선 추세 BUY/SELL")
BY_KEY = {t.key: t for t in TECHNIQUES + [REFERENCE]}
