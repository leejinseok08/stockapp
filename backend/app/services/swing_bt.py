"""Swing trading backtest (2 days ~ 2 weeks holds) for the techniques in the owner's fmkorea posts.

Execution on daily bars, no look-ahead:
- An entry signal read at close i buys at the open of i+1.
- Exit signals read at a close sell at the next open. Limit take-profits (fixed % or pivot R1) fill
  during the next bar if its high reaches the level (at the open if it gaps above).
- Positions are all-in per stock; idle cash earns CASH_RATE. Each stock is simulated on its own.

Costs: 메리츠증권 Super365 (fee-free for KR/US trades and USD exchange through 2026-12), so the
cost is the KR sell tax (0.20% from 2026) plus spread/slippage. "after2026" adds the account's
listed base fees (KR 0.009%, US 0.07% per side) in case the event ends.
Not modeled: US capital gains tax (22% over 2.5M KRW/yr, realized gains only - which favors
buy-and-hold further) and dividends beyond the adjusted prices.

Run: python -m app.services.swing_bt [summary|json]
"""

import json
import sys
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import numpy as np
import pandas as pd
import yfinance as yf

from .heatmap import MARKETS
from .stockscan import TREND, trend_frame

CASH_RATE = 0.025
START = "2010-01-01"
PERIODS = {"2010~2018": ("2010-01-01", "2018-12-31"), "2019~": ("2019-01-01", None)}
OUT = Path(__file__).resolve().parent.parent / "data" / "swing_backtest.json"

COSTS = {
    # (buy side, sell side) as fractions of the traded amount
    "meritz": {"KR": (0.0005, 0.0005 + 0.0020), "US": (0.0003, 0.0003)},
    "after2026": {"KR": (0.0005 + 0.00009, 0.0005 + 0.00009 + 0.0020), "US": (0.0003 + 0.0007, 0.0003 + 0.0007)},
}


def universe() -> dict[str, str]:
    out = {}
    for m in MARKETS:
        for stocks in m["sectors"].values():
            for sym, _ in stocks:
                out[sym] = m["id"]
    return out


def load(symbol: str) -> pd.DataFrame:
    h = yf.Ticker(symbol).history(start="2008-01-01", interval="1d", auto_adjust=True)
    h.index = h.index.tz_localize(None)
    h = h[["Open", "High", "Low", "Close", "Volume"]].dropna()
    h = h[(h["Close"] > 0) & (h["Open"] > 0)]
    h.columns = ["o", "h", "l", "c", "v"]
    return h


def features(h: pd.DataFrame) -> pd.DataFrame:
    f = h.copy()
    c = f["c"]
    for n in (10, 20, 25, 60):
        f[f"ma{n}"] = c.rolling(n).mean()
    f["ma60up"] = f["ma60"] > f["ma60"].shift(5)
    f["hi250"] = f["h"].rolling(250).max().shift(1)
    f["lo10"] = f["l"].rolling(10).min().shift(1)
    rng = (f["h"] - f["l"]).replace(0, np.nan)
    f["body"] = (c - f["o"]).abs() / rng
    f["upper"] = (f["h"] - np.maximum(c, f["o"])) / rng
    f["bull"] = c > f["o"]
    f["vol20"] = f["v"].rolling(20).mean().shift(1)
    d = c.diff()
    up, dn = d.clip(lower=0).ewm(alpha=1 / 14).mean(), (-d.clip(upper=0)).ewm(alpha=1 / 14).mean()
    f["rsi"] = 100 - 100 / (1 + up / dn)
    # Floor-trader pivots from this bar, used for the next bar.
    p = (f["h"] + f["l"] + c) / 3
    f["r1"], f["s1"] = 2 * p - f["l"], 2 * p - f["h"]
    f["trend_hold"] = trend_frame(c, **TREND)["hold"]
    return f


@dataclass
class Pos:
    entry: float
    i: int  # entry bar
    left: float = 1.0  # fraction of the initial position still held
    sold: int = 0  # partial sells done
    extra: float = 0.0  # strategy scratch (e.g. entry candle low)


# Strategy = (entry(f, i) -> bool, exit(f, i, pos) -> list of orders for bar i+1)
# order: ("mkt", fraction_of_initial) sells at next open; ("lmt", fraction, price) sells if reached.
Order = tuple
Strategy = tuple[Callable[[pd.DataFrame, int], bool], Callable[[pd.DataFrame, int, Pos], list[Order]]]


class _Row:
    """One bar's values from the column arrays (DataFrame.iloc per bar is far too slow here)."""

    __slots__ = ("a", "i")

    def __init__(self, a, i):
        self.a, self.i = a, i

    def __getitem__(self, k):
        return self.a[k][self.i]


def _row(a, i):
    return _Row(a, i)


# 1. 신고가 돌파 (fm 2994079353): 52-week high breakout; sell half on the first doji, the rest on the
#    second; out on a close under the 20-day line or 8% under entry; at most 40 sessions.
def breakout_entry(f, i):
    r = _row(f, i)
    return bool(r["c"] > r["hi250"] and r["bull"])


def breakout_exit(f, i, pos):
    r = _row(f, i)
    if r["c"] < r["ma20"] or r["c"] < pos.entry * 0.92 or i - pos.i >= 40:
        return [("mkt", pos.left)]
    if r["body"] < 0.1 and r["c"] > pos.entry:
        return [("mkt", min(0.5, pos.left))]
    return []


# 2. 모멘텀 양봉 (fm 3044045823): a strong bullish candle with little upper wick, volume 1.5x, above the
#    20-day line but not stretched; out on a long upper wick or a big bearish candle, under the entry
#    candle's low, or after 10 sessions.
def momentum_entry(f, i):
    r = _row(f, i)
    return bool(r["bull"] and r["upper"] <= 0.15 and r["body"] >= 0.6 and r["v"] >= 1.5 * r["vol20"]
                and r["ma20"] < r["c"] <= r["ma20"] * 1.08)


def momentum_exit(f, i, pos):
    r = _row(f, i)
    if pos.extra == 0:
        pos.extra = f["l"][pos.i - 1]  # the signal candle's low
    if r["upper"] >= 0.5 or (not r["bull"] and r["body"] >= 0.6) or r["c"] < pos.extra or i - pos.i >= 10:
        return [("mkt", pos.left)]
    return []


# 3. 눌림목 스윙 (fm 3044045823, 3395409037, 10325555927): uptrend (20>60-day line, 60 rising, close above
#    60), today touched the 20-day line and closed on/above it, RSI not overheated. Sell half at +6%,
#    the rest on a close under the 20-day line; out under the 60-day line; at most 15 sessions.
def pullback_entry(f, i):
    r = _row(f, i)
    return bool(r["ma20"] > r["ma60"] and r["ma60up"] and r["c"] > r["ma60"]
                and r["l"] <= r["ma20"] * 1.01 and r["c"] >= r["ma20"] and r["rsi"] < 70)


def pullback_exit(f, i, pos):
    r = _row(f, i)
    if r["c"] < r["ma60"] or i - pos.i >= 15:
        return [("mkt", pos.left)]
    if pos.sold and r["c"] < r["ma20"]:
        return [("mkt", pos.left)]
    orders = []
    if not pos.sold:
        orders.append(("lmt", 0.5, pos.entry * 1.06))
    if not pos.sold and r["c"] < r["ma20"] * 0.98:
        return [("mkt", pos.left)]
    return orders


# 4. 눌림목 + 피벗 분할매도 (fm 3268703411): same entry; sell 1/3 of the original at each day's pivot R1
#    (up to three times); out under the 60-day line or the pivot S1 break; at most 15 sessions.
def pivot_exit(f, i, pos):
    r = _row(f, i)
    if r["c"] < r["ma60"] or r["c"] < r["s1"] or i - pos.i >= 15:
        return [("mkt", pos.left)]
    return [("lmt", min(1 / 3, pos.left), r["r1"])] if pos.left > 1e-9 else []


# 5. BNF 이격도 (fm 3395409037 mentions BNF's oversold trade): close 10% under the 25-day line -> buy;
#    sell when back within 2% of the line or after 3 sessions.
def bnf_entry(f, i):
    r = _row(f, i)
    return bool(r["c"] <= r["ma25"] * 0.90)


def bnf_exit(f, i, pos):
    r = _row(f, i)
    if r["c"] >= r["ma25"] * 0.98 or i - pos.i >= 3:
        return [("mkt", pos.left)]
    return []


# Reference: the app's own trend rule (days to months), executed at the next open here.
def trend_entry(f, i):
    return bool(f["trend_hold"][i] and not f["trend_hold"][i - 1])


def trend_exit(f, i, pos):
    return [("mkt", pos.left)] if not f["trend_hold"][i] else []


STRATEGIES: dict[str, tuple[Strategy, str]] = {
    "신고가 돌파": ((breakout_entry, breakout_exit), "fmkorea 2994079353 트레이딩 기법 1"),
    "모멘텀 양봉": ((momentum_entry, momentum_exit), "fmkorea 3044045823 모멘텀(불타기) 매매"),
    "눌림목 스윙": ((pullback_entry, pullback_exit), "fmkorea 3044045823·3395409037·10325555927"),
    "눌림목 + 피벗 분할매도": ((pullback_entry, pivot_exit), "fmkorea 3268703411 피벗지표 심화편"),
    "BNF 이격도": ((bnf_entry, bnf_exit), "fmkorea 3395409037 (BNF 과매도 기법)"),
    "추세 규칙 (앱 기존, 참고)": ((trend_entry, trend_exit), "앱 BUY/SELL"),
}


def simulate(f: pd.DataFrame, strat: Strategy, cost: tuple[float, float], start: str, end: str | None) -> dict:
    entry_fn, exit_fn = strat
    idx = f.index
    lo = idx.searchsorted(pd.Timestamp(start))
    hi = len(idx) if end is None else idx.searchsorted(pd.Timestamp(end), side="right")
    daily = (1 + CASH_RATE) ** (1 / 252) - 1
    buy_c, sell_c = cost
    A = {k: f[k].to_numpy() for k in f.columns}
    o, h, c = A["o"], A["h"], A["c"]
    equity, cash, shares = 1.0, 1.0, 0.0
    pos: Pos | None = None
    curve, trades, held = [], [], 0
    log = []  # (entry day, exit day, net return) for the portfolio simulation
    trade_cost_basis = 0.0
    trade_proceeds = 0.0
    pending: list[Order] = []
    pending_entry = False
    for i in range(max(lo, 260), hi):
        # --- fills at this bar (decided at the previous close) ---
        if pending_entry and pos is None:
            px = o[i]
            shares = cash * (1 - buy_c) / px
            trade_cost_basis = cash
            trade_proceeds = 0.0
            cash = 0.0
            pos = Pos(entry=px, i=i)
        pending_entry = False
        if pos is not None and pending:
            init_shares = shares / pos.left if pos.left > 0 else 0
            for kind, frac, *lvl in pending:
                if pos.left <= 1e-9:
                    break
                frac = min(frac, pos.left)
                if kind == "mkt":
                    px = o[i]
                else:
                    if h[i] < lvl[0]:
                        continue
                    px = max(o[i], lvl[0])
                    if kind == "lmt":
                        pos.sold += 1
                sell_sh = init_shares * frac
                cash += sell_sh * px * (1 - sell_c)
                trade_proceeds += sell_sh * px * (1 - sell_c)
                shares -= sell_sh
                pos.left -= frac
            if pos.left <= 1e-9:
                trades.append(trade_proceeds / trade_cost_basis - 1)
                log.append((idx[pos.i], idx[i], trades[-1]))
                pos, shares = None, 0.0
        pending = []
        # --- end of bar ---
        cash *= 1 + daily
        equity = cash + shares * c[i]
        curve.append(equity)
        if pos is not None:
            held += 1
            pending = exit_fn(A, i, pos)
        elif i + 1 < hi and entry_fn(A, i):
            pending_entry = True
    if pos is not None:  # close at the last price
        trades.append((trade_proceeds + shares * c[hi - 1] * (1 - sell_c)) / trade_cost_basis - 1)
        log.append((idx[pos.i], idx[hi - 1], trades[-1]))
    v = np.array(curve)
    years = len(v) / 252
    bh = c[hi - 1] / c[max(lo, 260)]
    bh_curve = c[max(lo, 260):hi] / c[max(lo, 260)]
    t = np.array(trades) if trades else np.array([0.0])
    gains, losses = t[t > 0].sum(), -t[t < 0].sum()
    return {
        "cagr": v[-1] ** (1 / years) - 1,
        "bhCagr": bh ** (1 / years) - 1,
        "mdd": float((v / np.maximum.accumulate(v) - 1).min()),
        "bhMdd": float((bh_curve / np.maximum.accumulate(bh_curve) - 1).min()),
        "trades": len(trades),
        "tradesPerYear": len(trades) / years,
        "win": float((t > 0).mean()) if trades else None,
        "avgTrade": float(t.mean()) if trades else None,
        "profitFactor": float(gains / losses) if losses > 0 else None,
        "exposure": held / len(v),
        "log": log,
    }


_DATA: dict[str, pd.DataFrame] = {}


def run(cost_name="meritz") -> pd.DataFrame:
    uni = universe()
    if not _DATA:
        with ThreadPoolExecutor(max_workers=6) as ex:
            _DATA.update(zip(uni, ex.map(lambda s: features(load(s)), uni)))
    data = _DATA
    rows = []
    for sym, mkt in uni.items():
        f = data[sym]
        for pname, (a, b) in PERIODS.items():
            if len(f[(f.index >= a) & ((f.index <= b) if b else True)]) < 300:
                continue
            for name, (strat, _) in STRATEGIES.items():
                r = simulate(f, strat, COSTS[cost_name][mkt], a, b)
                rows.append({"symbol": sym, "market": mkt, "period": pname, "strategy": name, "cost": cost_name, **r})
    return pd.DataFrame(rows)


def portfolio(df: pd.DataFrame, closes: dict[str, pd.Series], slots=5) -> pd.DataFrame:
    """How a trader would actually run it: one account per market split into `slots` equal slots;
    each entry signal takes a free slot (1/slots of current equity), first come first served
    (ties in symbol order); the slot returns to cash on exit. Compared with holding every stock of
    the same universe in equal weights for the same period. Idle cash earns CASH_RATE."""
    out = []
    daily = (1 + CASH_RATE) ** (1 / 252) - 1
    for (cost, mkt, per, strat), g in df.groupby(["cost", "market", "period", "strategy"], sort=False):
        a, b = PERIODS[per]
        days = pd.bdate_range(max(pd.Timestamp(a), pd.Timestamp(START)), pd.Timestamp(b) if b else pd.Timestamp.today())
        trades = sorted((e, x, r, sym) for sym, lg in zip(g["symbol"], g["log"]) for e, x, r in lg)
        cash, open_, taken, skipped = 1.0, [], 0, 0
        curve = []
        ti = 0
        for d in days:
            cash *= 1 + daily
            # exits first, then entries on the same day
            still = []
            for x, amt, r, sym, e0 in open_:
                if x <= d:
                    cash += amt * (1 + r)
                else:
                    still.append((x, amt, r, sym, e0))
            open_ = still
            while ti < len(trades) and trades[ti][0] <= d:
                e, x, r, sym = trades[ti]
                ti += 1
                if e < d:
                    continue
                if len(open_) < slots:
                    equity = cash + sum(o[1] for o in open_)
                    amt = min(cash, equity / slots)
                    cash -= amt
                    open_.append((x, amt, r, sym, closes[sym].asof(d)))
                    taken += 1
                else:
                    skipped += 1
            # open positions marked to the close; the exact net return is booked at exit
            curve.append(cash + sum(amt * closes[sym].asof(d) / e0 for _, amt, _, sym, e0 in open_))
        v = np.array(curve)
        years = len(v) / 252
        syms = [s for s in g["symbol"].unique()]
        # Last known close on each business day (the first day can be a market holiday).
        px = pd.concat({s: closes[s].reindex(closes[s].index.union(days)).ffill().reindex(days) for s in syms}, axis=1)
        px = px.loc[:, px.iloc[0].notna()]
        bh = (px / px.iloc[0]).mean(axis=1).to_numpy()
        out.append({"cost": cost, "market": mkt, "period": per, "strategy": strat,
                    "cagr": v[-1] ** (1 / years) - 1, "mdd": float((v / np.maximum.accumulate(v) - 1).min()),
                    "bhCagr": bh[-1] ** (1 / years) - 1, "bhMdd": float((bh / np.maximum.accumulate(bh) - 1).min()),
                    "taken": taken, "skipped": skipped})
    return pd.DataFrame(out)


def summarize(df: pd.DataFrame) -> pd.DataFrame:
    g = df.assign(vsBh=df["cagr"] - df["bhCagr"], beatBh=df["cagr"] > df["bhCagr"],
                  calmar=df["cagr"] / df["mdd"].abs(), bhCalmar=df["bhCagr"] / df["bhMdd"].abs())
    return g.groupby(["cost", "market", "period", "strategy"], sort=False).agg(
        stocks=("symbol", "count"), cagr=("cagr", "mean"), bhCagr=("bhCagr", "mean"), vsBh=("vsBh", "mean"),
        beatBh=("beatBh", "mean"), mdd=("mdd", "mean"), bhMdd=("bhMdd", "mean"), calmar=("calmar", "median"),
        bhCalmar=("bhCalmar", "median"), tradesPerYear=("tradesPerYear", "mean"), win=("win", "mean"),
        avgTrade=("avgTrade", "mean"), profitFactor=("profitFactor", "median"), exposure=("exposure", "mean"),
    ).reset_index()


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "summary"
    runs = [run("meritz"), run("after2026")]
    closes = {s: f["c"] for s, f in _DATA.items()}
    df = pd.concat(runs)
    s = summarize(df)
    port = portfolio(df, closes)
    pd.set_option("display.width", 250)
    pct = lambda v: f"{v * 100:+.1f}%" if pd.notna(v) else "-"  # noqa: E731
    for (cost, mkt, per), t in s.groupby(["cost", "market", "period"], sort=False):
        print(f"\n== {cost} · {mkt} · {per} ({int(t['stocks'].iloc[0])} stocks) ==")
        out = t.set_index("strategy")[["cagr", "bhCagr", "vsBh", "beatBh", "mdd", "bhMdd", "calmar", "bhCalmar",
                                        "tradesPerYear", "win", "avgTrade", "profitFactor", "exposure"]].copy()
        for col in ("cagr", "bhCagr", "vsBh", "mdd", "bhMdd", "avgTrade"):
            out[col] = out[col].map(pct)
        for col in ("beatBh", "win", "exposure"):
            out[col] = out[col].map(lambda v: f"{v * 100:.0f}%" if pd.notna(v) else "-")
        for col in ("calmar", "bhCalmar", "tradesPerYear", "profitFactor"):
            out[col] = out[col].map(lambda v: f"{v:.2f}" if pd.notna(v) else "-")
        print(out.to_string())
    print("\n== portfolio: 5 slots per market, first come first served vs equal-weight buy & hold ==")
    pp = port.copy()
    for col in ("cagr", "mdd", "bhCagr", "bhMdd"):
        pp[col] = pp[col].map(pct)
    print(pp.to_string(index=False))
    if mode == "json":
        OUT.write_text(json.dumps({"strategies": {k: v[1] for k, v in STRATEGIES.items()},
                                   "summary": s.to_dict(orient="records"), "portfolio": port.to_dict(orient="records")}, ensure_ascii=False, indent=1, default=str),
                       encoding="utf-8")
        print("wrote", OUT)


if __name__ == "__main__":
    main()
