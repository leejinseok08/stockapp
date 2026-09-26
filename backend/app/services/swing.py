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
        ix = index_close.reindex(f.index).ffill()
        ratio = c / ix
        f["rs"], f["rs_ma"] = ratio, ratio.rolling(60).mean()
        # stockbee: trade a setup only when the market favors it -> index above a rising 50-day line.
        ix50 = ix.rolling(50).mean()
        f["mkt"] = (ix > ix50) & (ix50 > ix50.shift(10))
        # VARS (10170380535): each day's move in units of its own volatility, stock minus index,
        # averaged over 21 days; compared with its 10-day average.
        unit_s = c.diff().abs().rolling(14).mean()
        unit_i = ix.diff().abs().rolling(14).mean()
        vars_ = (c.diff() / unit_s - ix.diff() / unit_i).rolling(21).mean()
        f["vars"], f["vars_ma"] = vars_, vars_.rolling(10).mean()
    else:
        f["rs"], f["rs_ma"] = np.nan, np.nan
        f["mkt"] = True
        f["vars"], f["vars_ma"] = np.nan, np.nan
    # --- 차트쟁이 reading list (O'Neil, Minervini, Weinstein, Darvas, Qullamaggie, stockbee) ---
    for n in (50, 150, 200):
        f[f"ma{n}"] = c.rolling(n).mean()
    f["ma200up"] = f["ma200"] > f["ma200"].shift(20)
    f["ma150up"] = f["ma150"] >= f["ma150"].shift(20)
    f["ma20up"] = f["ma20"] > f["ma20"].shift(5)
    f["lo250"] = lo.rolling(250).min().shift(1)
    for n in (10, 15, 35, 60):
        f[f"hi{n}"] = hi.rolling(n).max().shift(1)
        f[f"lo{n}"] = lo.rolling(n).min().shift(1)
        f[f"rng{n}"] = (f[f"hi{n}"] - f[f"lo{n}"]) / c.shift(1)
    f["gain60"] = c.shift(1) / c.shift(1).rolling(60).min() - 1
    f["vol50"] = v.rolling(50).mean().shift(1)
    f["dvol"] = c * v
    f["dvol50"] = f["dvol"].rolling(50).mean().shift(1)
    f["ret"] = c.pct_change()
    f["gap"] = f["o"] / c.shift(1) - 1
    f["adr"] = (hi / lo - 1).rolling(20).mean()
    f["close_pos"] = (c - lo) / rng  # where in the day's range it closed (0 low .. 1 high)
    f["ext50"] = (c - f["ma50"]) / f["atr"]  # Jeff Sun: extension from the 50-day line in ATRs
    f["ma200down"] = f["ma200"] < f["ma200"].shift(20)
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


# ---- 백곰아재 posts (fmkorea 10375810853) and the traders they point to -------------------------

def _half_at_2r_exit(b, i, pos, trail_ma="ma20", max_days=40):
    """Stop at the setup's stop price, half off at +2R (Jeff Sun: know your R before entering), the
    rest on a close under the trailing average."""
    r = row(b, i)
    stop = pos.s["stop"]
    if r("c") < stop or i - pos.i >= max_days:
        return [("mkt", pos.left)]
    if pos.sold and r("c") < r(trail_ma):
        return [("mkt", pos.left)]
    risk = pos.entry - stop
    return [] if pos.sold or risk <= 0 else [("lmt", 0.5, pos.entry + 2 * risk)]


def w_entry(b, i):
    """W돌파 (10091969315): two lows within 3% of each other at least 10 bars apart in the last 60
    bars, the peak between them at least 8% above; today's close breaks that peak. Market must help."""
    if i < 70 or not b["mkt"][i]:
        return None
    lo, hi, c = b["l"], b["h"], b["c"]
    a1 = i - 60 + int(np.argmin(lo[i - 60:i - 30]))
    a2 = i - 25 + int(np.argmin(lo[i - 25:i - 2]))
    l1, l2 = lo[a1], lo[a2]
    if a2 - a1 < 10 or abs(l2 / l1 - 1) > 0.03:
        return None
    peak = hi[a1:a2 + 1].max()
    if peak < max(l1, l2) * 1.08:
        return None
    return ("mkt",) if c[i] > peak >= c[i - 1] else None


def w_exit(b, i, pos):
    if "stop" not in pos.s:
        pos.s["stop"] = float(np.min(b["l"][pos.sig - 25:pos.sig]))
    return _half_at_2r_exit(b, i, pos)


def ur_entry(b, i):
    """U&R 언더컷 앤 랠리 (10091969315): in an uptrend that has broken out (a new 60-day high within the
    last 40 bars, rising 50-day line), price undercuts the prior swing low (lowest low of bars
    i-23..i-4) in the last 4 bars and today closes back above it on an up candle."""
    if i < 70 or not b["ma50"][i] > b["ma50"][i - 10]:
        return None
    lo, c = b["l"], b["c"]
    level = lo[i - 23:i - 3].min()
    undercut = lo[i - 3:i + 1].min() < level
    broke_out = np.nanmax(c[i - 40:i] - b["hi60"][i - 40:i]) > 0
    return ("mkt",) if undercut and broke_out and c[i] > level and b["bull"][i] else None


def ur_exit(b, i, pos):
    if "stop" not in pos.s:
        pos.s["stop"] = float(b["l"][pos.sig - 3:pos.sig + 1].min())
    return _half_at_2r_exit(b, i, pos, trail_ma="ma10", max_days=20)


def dvol_entry(b, i):
    """거래대금 스크립트 (10041533753): dollar volume at least 2x its 50-day average on an up day that
    closed in the upper half of its range, above the 50-day line."""
    r = row(b, i)
    ok = r("dvol") >= 2 * r("dvol50") and r("bull") and r("close_pos") >= 0.5 and r("c") > r("ma50")
    return ("mkt",) if ok else None


def dvol_exit(b, i, pos):
    r = row(b, i)
    if r("c") < b["l"][pos.sig] or (i - pos.i >= 3 and r("c") < r("ma10")) or i - pos.i >= 20:
        return [("mkt", pos.left)]
    return []


def _template(r):
    """Minervini trend template (챔피언처럼 생각하고 거래하라)."""
    return (r("c") > r("ma150") > r("ma200") and r("ma200up") and r("ma50") > r("ma150") and r("c") > r("ma50")
            and r("c") >= 1.25 * r("lo250") and r("c") >= 0.75 * r("hi250"))


def vcp_entry(b, i):
    """Minervini VCP: trend template, a tight 10-day range (<10%), close breaks it on 1.5x volume."""
    r = row(b, i)
    ok = r("mkt") and _template(r) and r("rng10") < 0.10 and r("c") > r("hi10") and r("v") >= 1.5 * r("vol50")
    return ("mkt",) if ok else None


def vcp_exit(b, i, pos):
    r = row(b, i)
    if r("c") < pos.entry * 0.92 or i - pos.i >= 60 or (pos.sold and r("c") < r("ma50")):
        return [("mkt", pos.left)]
    return [] if pos.sold else [("lmt", 0.5, pos.entry * 1.20)]


def qm_entry(b, i):
    """Qullamaggie breakout: 30%+ run in the last 3 months, then a tight 15-day base (<15%) above a rising
    20-day line; close breaks the base high on 1.5x volume."""
    r = row(b, i)
    ok = (r("mkt") and r("gain60") >= 0.30 and r("rng15") < 0.15 and r("c") > r("ma20") and r("ma20up")
          and r("c") > r("hi15") and r("v") >= 1.5 * r("vol20"))
    return ("mkt",) if ok else None


def qm_exit(b, i, pos):
    """Stop at the breakout day's low; sell a third after 3 sessions; trail the rest with the 10-day line."""
    r = row(b, i)
    if r("c") < b["l"][pos.sig] or i - pos.i >= 60:
        return [("mkt", pos.left)]
    if not pos.sold and i - pos.i >= 3:
        pos.sold = 1
        return [("mkt", min(1 / 3, pos.left))]
    return [("mkt", pos.left)] if pos.sold and r("c") < r("ma10") else []


def ep_entry(b, i):
    """Qullamaggie episodic pivot: gap up 10%+ on 3x volume that holds (closes above the open), from a
    stock not already extended (<30% in 3 months)."""
    r = row(b, i)
    ok = r("gap") >= 0.10 and r("v") >= 3 * r("vol50") and r("c") >= r("o") and r("gain60") < 0.30
    return ("mkt",) if ok else None


def ep_exit(b, i, pos):
    r = row(b, i)
    if r("c") < b["l"][pos.sig] or (i - pos.i >= 3 and r("c") < r("ma10")) or i - pos.i >= 60:
        return [("mkt", pos.left)]
    return []


def burst_entry(b, i):
    """stockbee momentum burst: +4% day on higher volume than yesterday, closing near the high, after a
    quiet day (yesterday under +2%), in a market that favors it."""
    r = row(b, i)
    ok = r("mkt") and r("ret") >= 0.04 and r("v") > b["v"][i - 1] and r("close_pos") >= 0.7 and b["ret"][i - 1] < 0.02
    return ("mkt",) if ok else None


def burst_exit(b, i, pos):
    r = row(b, i)
    return [("mkt", pos.left)] if r("c") < b["l"][pos.sig] or i - pos.i >= 4 else []


def darvas_entry(b, i):
    """Darvas box (나는 주식 투자로 250만불을 벌었다): near the 52-week high a box forms (10-day range under
    12%); close above the box top on 1.5x volume."""
    r = row(b, i)
    ok = r("mkt") and r("hi10") >= 0.95 * r("hi250") and r("rng10") < 0.12 and r("c") > r("hi10") and r("v") >= 1.5 * r("vol20")
    return ("mkt",) if ok else None


def darvas_exit(b, i, pos):
    """Out under the box bottom; once the trade is 10 sessions old the floor rises to the 10-day low."""
    r = row(b, i)
    floor = b["lo10"][pos.sig]
    if i - pos.i >= 10:
        floor = max(floor, float(np.min(b["l"][i - 9:i + 1])))
    return [("mkt", pos.left)] if r("c") < floor or i - pos.i >= 60 else []


def stage2_entry(b, i):
    """Weinstein stage 2 (주식투자 최적의 타이밍을 잡는 법): close crosses above a flat-or-rising 30-week
    (150-day) line and clears the 60-day high on 2x volume."""
    r = row(b, i)
    ok = (r("ma150up") and b["c"][i - 1] <= b["ma150"][i - 1] * 1.05 and r("c") > r("ma150") and r("c") > r("hi60")
          and r("v") >= 2 * r("vol50"))
    return ("mkt",) if ok else None


def stage2_exit(b, i, pos):
    r = row(b, i)
    return [("mkt", pos.left)] if r("c") < r("ma150") or r("c") < pos.entry * 0.85 else []


def oneil_entry(b, i):
    """O'Neil pivot breakout (최고의 주식 최적의 타이밍): a 35-day base 12-35% deep whose high is within 5%
    of the 52-week high; close through the base high on 1.4x volume in a healthy market."""
    r = row(b, i)
    depth = (r("hi35") - r("lo35")) / r("hi35") if r("hi35") else 0
    ok = (r("mkt") and 0.12 <= depth <= 0.35 and r("hi35") >= 0.95 * r("hi250") and r("c") > r("hi35")
          and r("v") >= 1.4 * r("vol50"))
    return ("mkt",) if ok else None


def oneil_exit(b, i, pos):
    r = row(b, i)
    if r("c") < pos.entry * 0.92 or i - pos.i >= 60:
        return [("mkt", pos.left)]
    return [("lmt", pos.left, pos.entry * 1.20)]


def vars_entry(b, i):
    """VARS (10170380535): volatility-adjusted strength vs the index is above zero and crosses above its
    average (the 'blue bars over the zero line' turning up)."""
    v, m = b["vars"], b["vars_ma"]
    return ("mkt",) if v[i] > 0 and v[i] > m[i] and v[i - 1] <= m[i - 1] else None


def vars_exit(b, i, pos):
    r = row(b, i)
    if r("vars") < 0 or r("c") < pos.entry * 0.92 or i - pos.i >= 40:
        return [("mkt", pos.left)]
    return []


def jeff(base_key: str):
    """Jeff Sun's rules around a breakout setup (jfsrev.substack.com, 10128673081): no entry against a
    falling 200-day line, none when already more than 4 ATR above the 50-day line, relative volume
    required; the stop sits 0.6 ATR under the entry (his "low of day within 60% of ATR", adapted to a
    next-open fill on daily bars); sell half into strength at 7 ATR above the 50-day line."""
    base = BY_KEY_BASE[base_key]

    def entry(b, i):
        r = row(b, i)
        if r("ma200down") or r("ext50") > 4 or r("v") < 1.5 * r("vol50"):
            return None
        return base.entry(b, i)

    def exit_(b, i, pos):
        r = row(b, i)
        if r("c") < pos.entry - 0.6 * b["atr"][pos.sig]:
            return [("mkt", pos.left)]
        if not pos.s.get("jeff_sold") and r("ext50") >= 7:
            pos.s["jeff_sold"] = True
            return [("mkt", min(0.5, pos.left))]
        return base.exit(b, i, pos)

    return entry, exit_


@dataclass
class Technique:
    key: str
    name: str
    source: str
    entry: Callable
    exit: Callable
    plan: str  # one line: how the trade is run
    needs_market: bool = False  # only fires while the index is above a rising 50-day line (stockbee)


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
    # 백곰아재 posts (fmkorea 10375810853) and the traders they point to
    Technique("w", "W돌파", "10091969315", w_entry, w_exit,
              "시장 상승 중 쌍바닥 가운데 고점 돌파 → 다음 날 시가 · 두 번째 바닥 손절 · 2R에 절반 · 20일선 이탈 매도", needs_market=True),
    Technique("ur", "언더컷 앤 랠리 (U&R)", "10091969315", ur_entry, ur_exit,
              "돌파한 상승 종목이 직전 저점을 살짝 깼다가 다시 올라선 날 → 다음 날 시가 · 깬 저점 손절 · 2R에 절반 · 10일선 이탈 매도"),
    Technique("dvol", "거래대금 급증 양봉", "10041533753", dvol_entry, dvol_exit,
              "50일선 위에서 거래대금 50일 평균 2배 양봉 → 다음 날 시가 · 신호봉 저가 손절 · 10일선 이탈 또는 20일"),
    Technique("vcp", "미너비니 VCP", "10041156182 · 챔피언처럼 생각하고 거래하라", vcp_entry, vcp_exit,
              "추세 템플릿 + 10일 수축(<10%) 상단 돌파·거래량 1.5배 → 다음 날 시가 · −8% 손절 · +20%에 절반 · 50일선 이탈 매도", needs_market=True),
    Technique("qm", "쿨라메기 돌파", "10041156182 · Qullamaggie", qm_entry, qm_exit,
              "3개월 30%↑ 후 15일 박스(<15%) 상단 돌파 → 다음 날 시가 · 돌파일 저가 손절 · 3일 뒤 1/3 · 10일선 이탈 매도", needs_market=True),
    Technique("ep", "에피소딕 피벗", "10041156182 · Qullamaggie", ep_entry, ep_exit,
              "거래량 3배 10%↑ 갭상승이 유지 → 다음 날 시가 · 갭 당일 저가 손절 · 10일선 이탈 매도"),
    Technique("burst", "모멘텀 버스트 4%", "10096541377 · stockbee", burst_entry, burst_exit,
              "시장 상승 중 +4% 거래량 증가 고가 마감 → 다음 날 시가 · 신호봉 저가 손절 · 4일 뒤 매도", needs_market=True),
    Technique("darvas", "다바스 박스", "10041156182 · 니콜라스 다비스", darvas_entry, darvas_exit,
              "52주 고가 부근 10일 박스(<12%) 상단 돌파·거래량 1.5배 → 다음 날 시가 · 박스 하단/10일 저가 이탈 매도", needs_market=True),
    Technique("stage2", "와인스타인 2단계", "10041156182 · 스탠 와인스타인", stage2_entry, stage2_exit,
              "30주선 위로 올라서며 60일 고가 돌파·거래량 2배 → 다음 날 시가 · 30주선 이탈 또는 −15% 매도"),
    Technique("oneil", "오닐 피벗 돌파", "10041156182 · 윌리엄 오닐", oneil_entry, oneil_exit,
              "52주 고가 근처 7주 베이스(깊이 12~35%) 상단 돌파·거래량 1.4배 → 다음 날 시가 · −8% 손절 · +20% 매도", needs_market=True),
    Technique("vars", "VARS 상대강도", "10170380535", vars_entry, vars_exit,
              "변동성 보정 지수 대비 강도가 0 위에서 평균선 상향 돌파 → 다음 날 시가 · 0 아래 또는 −8% 매도 · 최대 40일"),
]
BY_KEY_BASE = {t.key: t for t in TECHNIQUES}
JEFF_NOTE = " · 제프 선 규칙(200일선 하락·50일선 4ATR 초과면 안 삼, 거래량 1.5배, 진입가 −0.6ATR 손절, 7ATR에서 절반)"
for _k in ("vcp", "qm", "darvas", "oneil", "w", "ur"):
    _b = BY_KEY_BASE[_k]
    _e, _x = jeff(_k)
    TECHNIQUES.append(Technique(f"{_k}_jeff", f"{_b.name} + 제프 선", f"{_b.source} · 10128673081", _e, _x, _b.plan + JEFF_NOTE,
                                _b.needs_market))
REFERENCE = Technique("trend", "추세 규칙 (앱 기존)", "앱 BUY/SELL", trend_entry, trend_exit, "200일선 추세 BUY/SELL")
BY_KEY = {t.key: t for t in TECHNIQUES + [REFERENCE]}
