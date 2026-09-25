"""분할매수 backtest for individual stocks: how to put one position's money in after a trend BUY.

Frame (same for every technique):
- An episode starts when the trend rule (stockscan.trend_frame) flips to BUY and ends when it flips
  to SELL (or the data ends). Each episode gets capital 1.0.
- Signals are read at a close and executed at the next session's close (no look-ahead).
- Undeployed cash earns CASH_RATE; every buy pays COST.
- On SELL the whole position is sold; tranches not yet bought are cancelled.
- The baseline is 일시 매수: everything on the BUY day (what the app's trend rule does now).

Run: python -m app.services.splitbuy_bt [summary|json]
"""

import json
import sys
from pathlib import Path
from typing import Callable

import numpy as np
import pandas as pd
import yfinance as yf

from ..tickers import BIGTECH
from .stockscan import TREND, trend_frame

COST = 0.0005
CASH_RATE = 0.025
PERIODS = {"all": (None, None), "~2016": (None, "2016-12-31"), "2017~": ("2017-01-01", None)}
OUT = Path(__file__).resolve().parent.parent / "data" / "splitbuy_backtest.json"


def load(symbol: str) -> pd.DataFrame:
    h = yf.Ticker(symbol).history(period="max", interval="1d", auto_adjust=True)
    h.index = h.index.tz_localize(None)
    h = h[["Close", "High", "Low", "Volume"]].dropna()
    return h[h["Close"] > 0]


def indicators(h: pd.DataFrame) -> pd.DataFrame:
    c = h["Close"]
    f = pd.DataFrame(index=h.index)
    f["close"] = c
    f["ma20"], f["ma60"] = c.rolling(20).mean(), c.rolling(60).mean()
    f["ma60up"] = f["ma60"] > f["ma60"].shift(5)
    tr = pd.concat([h["High"] - h["Low"], (h["High"] - c.shift()).abs(), (h["Low"] - c.shift()).abs()], axis=1).max(axis=1)
    f["atr"] = tr.rolling(20).mean()
    r = c.pct_change()
    f["ret"], f["sd60"] = r, r.rolling(60).std().shift(1)
    d = c.diff()
    up, dn = d.clip(lower=0).ewm(alpha=1 / 14).mean(), (-d.clip(upper=0)).ewm(alpha=1 / 14).mean()
    f["rsi"] = 100 - 100 / (1 + up / dn)
    macd = c.ewm(span=12, adjust=False).mean() - c.ewm(span=26, adjust=False).mean()
    f["macdup"] = macd > macd.shift(5)
    f["volup"] = h["Volume"].rolling(5).mean() > h["Volume"].rolling(20).mean()
    f["hi60"] = c.rolling(60).max()
    # fmkorea "AI 매매 확률" 7 conditions: >=5 -> 적극(한 번에), 4 -> 분할, <=3 -> 관망.
    f["score"] = (
        (f["ma20"] > f["ma60"]).astype(int)
        + (c > f["ma20"]).astype(int)
        + f["ma60up"].astype(int)
        + f["volup"].astype(int)
        + ((c >= f["hi60"]) | ((c > f["ma20"]) & (c < f["ma20"] * 1.03))).astype(int)
        + (f["rsi"] < 70).astype(int)
        + f["macdup"].astype(int)
    )
    return f


# A technique sees the episode so far and says what fraction of the episode's capital to buy at the
# next close. `st` is a dict the technique can keep state in.
Technique = Callable[[pd.DataFrame, int, int, dict], float]


def lump(f, i0, i, st):
    return 1.0 if i == i0 else 0.0


def time_split(n: int, every: int) -> Technique:
    """n equal tranches, one every `every` sessions (시간 분할 / DCA-in)."""

    def t(f, i0, i, st):
        k = i - i0
        return 1.0 / n if k % every == 0 and k // every < n else 0.0

    return t


def grid(n: int, step: float, deadline: int | None = None) -> Technique:
    """1/n on the BUY day, then 1/n each time the close is `step` below the last buy (물타기 n분할).
    With a deadline, whatever is left goes in after that many sessions."""

    def t(f, i0, i, st):
        c = f["close"].iat[i]
        if i == i0:
            st.update(last=c, n=1)
            return 1.0 / n
        if deadline is not None and i - i0 == deadline and st["n"] < n:
            left = (n - st["n"]) / n
            st["n"] = n
            return left
        if st["n"] < n and c <= st["last"] * (1 - step):
            st.update(last=c, n=st["n"] + 1)
            return 1.0 / n
        return 0.0

    return t


def infinite(n: int = 40) -> Technique:
    """라오어 무한매수법 style: n parts, one session at a time. Half a part if the close is at or
    under the average cost, the other half if it is under avg x (1 + (10 - T/2)%)."""

    def t(f, i0, i, st):
        c = f["close"].iat[i]
        if i == i0:
            st.update(cost=0.0, units=0.0, spent=0.0)
            return _inf_buy(st, c, 1.0 / n)
        if st["spent"] >= 1 - 1e-9:
            return 0.0
        avg = st["cost"] / st["units"]
        T = np.ceil(st["spent"] * n * 10) / 10
        part = 0.0
        if c <= avg:
            part += 0.5 / n
        if c <= avg * (1 + (10 - T / 2) / 100):
            part += 0.5 / n
        part = min(part, 1 - st["spent"])
        return _inf_buy(st, c, part) if part > 0 else 0.0

    return t


def _inf_buy(st, c, frac):
    st["cost"] += frac
    st["units"] += frac / c
    st["spent"] += frac
    return frac


def pyramid(units: int = 4, step_n: float = 0.5) -> Technique:
    """Turtle pyramiding (불타기): 1 unit on BUY, one more each time the close is step_n x ATR above
    the last entry, up to `units`."""

    def t(f, i0, i, st):
        c = f["close"].iat[i]
        if i == i0:
            st.update(last=c, n=1)
            return 1.0 / units
        if st["n"] < units and c >= st["last"] + step_n * f["atr"].iat[i]:
            st.update(last=c, n=st["n"] + 1)
            return 1.0 / units
        return 0.0

    return t


def pullback(first: float, kind: str, deadline: int | None) -> Technique:
    """2회 분할 (원칙: 분할매수는 두 번까지): `first` on BUY, the rest on the first pullback after it.
    kind: ma20 = closed under the 20-day line and back above it; ma60 = within 2% of a rising 60-day
    line and above it; dip = fell >= 1.5x the usual daily move. Always above the 200-day line (the
    episode ends otherwise). With a deadline the rest goes in after that many sessions."""

    def t(f, i0, i, st):
        if i == i0:
            st.update(done=False, under=False)
            return first
        if st["done"]:
            return 0.0
        c, row = f["close"].iat[i], f.iloc[i]
        hit = False
        if kind == "ma20":
            if c < row["ma20"]:
                st["under"] = True
            elif st["under"]:
                hit = True
        elif kind == "ma60":
            hit = row["ma60up"] and row["ma60"] <= c <= row["ma60"] * 1.02
        elif kind == "dip":
            hit = row["ret"] <= -1.5 * row["sd60"]
        if hit or (deadline is not None and i - i0 >= deadline):
            st["done"] = True
            return 1 - first
        return 0.0

    return t


def gated(split: Technique, min_score: int = 5) -> Technique:
    """Technical score >= min_score on the BUY day -> 한 번에, else `split`."""

    def t(f, i0, i, st):
        if i == i0:
            st["lump"] = f["score"].iat[i0] >= min_score
        return lump(f, i0, i, st) if st["lump"] else split(f, i0, i, st)

    return t


TECHNIQUES: dict[str, tuple[Technique, str]] = {
    "일시 매수 (기준)": (lump, "현재 앱 규칙"),
    "시간 2분할 (4주 간격)": (time_split(2, 20), "Vanguard DCA 연구"),
    "시간 3분할 (주 1회)": (time_split(3, 5), "Vanguard DCA 연구"),
    "시간 10분할 (주 1회)": (time_split(10, 5), "Vanguard DCA 연구"),
    "물타기 10분할 (−3%마다)": (grid(10, 0.03), "하락폭 간격 분할"),
    "물타기 10분할 (−5%마다)": (grid(10, 0.05), "하락폭 간격 분할"),
    "물타기 10분할 (−5%마다, 40일 후 잔량)": (grid(10, 0.05, 40), "하락폭 간격 분할"),
    "무한매수법식 40분할": (infinite(40), "라오어 무한매수법"),
    "불타기 4유닛 (0.5 ATR마다)": (pyramid(4, 0.5), "터틀 트레이딩"),
    "2분할 50:50 · 20일선 눌림 (40일 후 잔량)": (pullback(0.5, "ma20", 40), "fmkorea 스윙·눌림목"),
    "2분할 50:50 · 20일선 눌림 (안 오면 끝)": (pullback(0.5, "ma20", None), "fmkorea 스윙·눌림목"),
    "2분할 50:50 · 60일선 지지 (40일 후 잔량)": (pullback(0.5, "ma60", 40), "fmkorea AI 매매 확률"),
    "2분할 50:50 · 60일선 지지 (안 오면 끝)": (pullback(0.5, "ma60", None), "fmkorea AI 매매 확률"),
    "2분할 50:50 · 큰 하락일 (40일 후 잔량)": (pullback(0.5, "dip", 40), "ISA 매수일 규칙과 같은 방식"),
    "2분할 1/3:2/3 · 20일선 눌림 (40일 후 잔량)": (pullback(1 / 3, "ma20", 40), "fmkorea 스윙·눌림목"),
    "점수 5↑ 한 번에, 아니면 20일선 2분할": (gated(pullback(0.5, "ma20", 40)), "fmkorea 7조건 점수"),
    "점수 5↑ 한 번에, 아니면 시간 3분할": (gated(time_split(3, 5)), "fmkorea 7조건 점수"),
}


def episodes(f: pd.DataFrame) -> list[tuple[int, int]]:
    """(first buy index, sell index) in positional terms: BUY read at close j -> buy at j+1;
    SELL read at close k -> sell at k+1 (or the last close)."""
    hold = trend_frame(f["close"], **TREND)["hold"].to_numpy()
    valid = f["close"].rolling(TREND["n"]).mean().shift(TREND["slope_days"]).notna().to_numpy()
    out, start = [], None
    for j in range(1, len(hold)):
        if not valid[j]:
            continue
        if hold[j] and not hold[j - 1] and start is None and j + 1 < len(hold):
            start = j + 1
        elif not hold[j] and hold[j - 1] and start is not None:
            out.append((start, min(j + 1, len(hold) - 1)))
            start = None
    if start is not None:
        out.append((start, len(hold) - 1))
    return out


def run_episode(f: pd.DataFrame, i0: int, i1: int, tech: Technique) -> dict:
    """Each fill at close i is decided at close i-1. The technique sees the episode as starting at
    the BUY signal close s = i0-1, so its first call (j == s) is the BUY-day tranche."""
    daily = (1 + CASH_RATE) ** (1 / 252) - 1
    cash, units, st, spent = 1.0, 0.0, {}, 0.0
    closes = f["close"].to_numpy()
    s = i0 - 1
    values = []
    for i in range(i0, i1 + 1):
        if i > i0:
            cash *= 1 + daily
        if i < i1:  # the sell day buys nothing
            frac = max(0.0, min(tech(f, s, i - 1, st), 1 - spent))
            if frac > 0:
                amt = min(frac, cash)
                units += amt * (1 - COST) / closes[i]
                cash -= amt
                spent += frac
        values.append(cash + units * closes[i])
    final = cash + units * closes[i1] * (1 - COST)
    v = np.array(values)
    dd = float((v / np.maximum.accumulate(v) - 1).min())
    # Worst point vs the money set aside for this position (what a 물타기 is meant to soften).
    return {"ret": final - 1, "deployed": spent, "dd": dd, "worstVsCapital": float(v.min() - 1), "days": i1 - i0}


def backtest(symbols=None) -> pd.DataFrame:
    rows = []
    for sym in symbols or BIGTECH:
        f = indicators(load(sym))
        for i0, i1 in episodes(f):
            # A technique's first call happens at the BUY fill day; indicators there are known at that close.
            for name, (tech, _) in TECHNIQUES.items():
                r = run_episode(f, i0, i1, tech)
                rows.append({"symbol": sym, "start": f.index[i0], "end": f.index[i1], "tech": name, **r})
    return pd.DataFrame(rows)


def summarize(df: pd.DataFrame) -> pd.DataFrame:
    out = []
    for pname, (a, b) in PERIODS.items():
        d = df
        if a:
            d = d[d["start"] >= a]
        if b:
            d = d[d["start"] <= b]
        base = d[d["tech"] == "일시 매수 (기준)"].set_index(["symbol", "start"])["ret"]
        for name, g in d.groupby("tech", sort=False):
            g = g.set_index(["symbol", "start"])
            diff = g["ret"] - base.reindex(g.index)
            # Compounding each stock's episodes back to back, averaged over stocks.
            growth = g.groupby(level=0)["ret"].apply(lambda r: float(np.prod(1 + r.to_numpy())))
            out.append({"period": pname, "tech": name, "episodes": len(g),
                        "avgRet": g["ret"].mean(), "vsLump": diff.mean(), "beatLump": (diff > 1e-9).mean(),
                        "avgDD": g["dd"].mean(), "avgWorstVsCapital": g["worstVsCapital"].mean(),
                        "worstVsCapital": g["worstVsCapital"].min(), "deployed": g["deployed"].mean(),
                        "compound": growth.mean()})
    return pd.DataFrame(out)


def main():
    df = backtest()
    s = summarize(df)
    mode = sys.argv[1] if len(sys.argv) > 1 else "summary"
    pd.set_option("display.width", 200)
    for pname in PERIODS:
        t = s[s["period"] == pname].drop(columns="period").set_index("tech")
        print(f"\n== {pname} ({int(t['episodes'].iloc[0])} episodes, big-tech 9) ==")
        fmt = t.copy()
        for c in ("avgRet", "vsLump", "avgDD", "avgWorstVsCapital", "worstVsCapital"):
            fmt[c] = fmt[c].map(lambda v: f"{v * 100:+.1f}%")
        fmt["beatLump"] = fmt["beatLump"].map(lambda v: f"{v * 100:.0f}%")
        fmt["deployed"] = fmt["deployed"].map(lambda v: f"{v * 100:.0f}%")
        fmt["compound"] = fmt["compound"].map(lambda v: f"{v:.2f}x")
        print(fmt.drop(columns="episodes").to_string())
    if mode == "json":
        OUT.write_text(json.dumps({"techniques": {k: v[1] for k, v in TECHNIQUES.items()},
                                   "summary": s.to_dict(orient="records")}, ensure_ascii=False, indent=1, default=str),
                       encoding="utf-8")
        print("wrote", OUT)


if __name__ == "__main__":
    main()
