"""Backtest of every swing technique in swing.py on the liquid whole-market universe.

Universe: today's liquid list (universe.py: KR >= 50억/day, US top 1,000 caps >= $50M/day); a signal
only counts if the stock was liquid at that time too (20-day average trading value over the same
threshold). This is today's survivors, which flatters buying in general.

Execution: signal at close i -> fill at bar i+1 (open, or a limit price if the bar trades through
it). Exits the same way. Costs: 메리츠증권 Super365 (no fees through 2026; KR sell tax 0.20%) plus
spread; "after2026" adds the listed base fees.

What is measured, per technique:
- trade stats (win rate, average, median, profit factor, holding days)
- edge = average trade minus what simply holding the same stock for the same number of days returned
  on average over the period (did the rule pick better-than-average days?)
- a portfolio run: one account per market, 10 equal slots, signals in random order when more fire
  than slots are free, compared with holding the whole universe in equal weights.

Run: python -m app.services.swing_bt [summary|json]  (prices cached under ~/.stockapp_cache)
The first large-cap-only study is swing_bt_bigcaps.py.
"""

import json
import pickle
import random
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf

from .swing import BY_KEY, REFERENCE, TECHNIQUES, Bars, Pos, features
from .universe import KR_MIN_VALUE, US_MIN_VALUE, get_universe

CASH_RATE = 0.025
PERIODS = {"2010~2018": ("2010-01-01", "2018-12-31"), "2019~": ("2019-01-01", None)}
SLOTS = 10
CACHE = Path.home() / ".stockapp_cache"
OUT = Path(__file__).resolve().parent.parent / "data" / "swing_backtest.json"
INDEX = {"KR": "^KS11", "US": "^GSPC"}
MIN_VALUE = {"KR": KR_MIN_VALUE, "US": US_MIN_VALUE}
COSTS = {
    "meritz": {"KR": (0.0005, 0.0005 + 0.0020), "US": (0.0003, 0.0003)},
    "after2026": {"KR": (0.0005 + 0.00009, 0.0005 + 0.00009 + 0.0020), "US": (0.001, 0.001)},
}


def load_prices(symbols: list[str]) -> dict[str, pd.DataFrame]:
    CACHE.mkdir(exist_ok=True)
    path = CACHE / "swing_prices.pkl"
    have = pickle.loads(path.read_bytes()) if path.exists() else {}
    need = [s for s in symbols if s not in have]
    for k in range(0, len(need), 80):
        chunk = need[k:k + 80]
        df = yf.download(chunk, start="2008-01-01", interval="1d", auto_adjust=True, group_by="ticker",
                         threads=True, progress=False)
        for s in chunk:
            try:
                h = df[s][["Open", "High", "Low", "Close", "Volume"]].dropna()
            except KeyError:
                continue
            h = h[(h["Close"] > 0) & (h["Open"] > 0)]
            h.columns = ["o", "h", "l", "c", "v"]
            h.index = pd.DatetimeIndex(h.index).tz_localize(None)
            have[s] = h
        path.write_bytes(pickle.dumps(have))
        print(f"prices {min(k + 80, len(need))}/{len(need)}", flush=True)
        time.sleep(1)
    return {s: have[s] for s in symbols if s in have and len(have[s]) > 300}


def simulate(b: Bars, tech, cost, lo: int, hi: int, min_value: float) -> list[tuple]:
    """Trades as (entry bar, exit bar, net return)."""
    buy_c, sell_c = cost
    o, h, low, c = b["o"], b["h"], b["l"], b["c"]
    value20 = b["value20"]
    trades, pos, pending, entry_order = [], None, [], None
    basis = proceeds = shares = 0.0
    for i in range(max(lo, 260), hi):
        if entry_order is not None and pos is None:
            px = None
            if entry_order[0] == "mkt":
                px = o[i]
            elif low[i] <= entry_order[1]:
                px = min(o[i], entry_order[1])
            if px is not None:
                shares, basis, proceeds = (1 - buy_c) / px, 1.0, 0.0
                pos = Pos(entry=px, i=i, sig=i - 1)
                pending = []
        entry_order = None
        if pos is not None and pending:
            init = shares / pos.left
            for kind, frac, *lvl in pending:
                if pos.left <= 1e-9:
                    break
                frac = min(frac, pos.left)
                if kind == "mkt":
                    px = o[i]
                elif h[i] >= lvl[0]:
                    px = max(o[i], lvl[0])
                    pos.sold += 1
                else:
                    continue
                sh = init * frac
                proceeds += sh * px * (1 - sell_c)
                shares -= sh
                pos.left -= frac
            if pos.left <= 1e-9:
                trades.append((pos.i, i, proceeds / basis - 1))
                pos = None
        pending = []
        if i + 1 >= hi:
            break
        if pos is not None:
            pending = tech.exit(b, i, pos)
        elif value20[i] >= min_value:
            entry_order = tech.entry(b, i)
    if pos is not None:
        trades.append((pos.i, hi - 1, (proceeds + shares * c[hi - 1] * (1 - sell_c)) / basis - 1))
    return trades


def _hold_baseline(o: np.ndarray, lo: int, hi: int, k: int, cache: dict) -> float:
    """Average open-to-open return of holding k bars, over every start day in the period."""
    if k not in cache:
        seg = o[max(lo, 260):hi]
        cache[k] = float(np.mean(seg[k:] / seg[:-k] - 1)) if k > 0 and len(seg) > k else 0.0
    return cache[k]


def run(data: dict[str, tuple[str, Bars]], cost_name: str) -> pd.DataFrame:
    rows = []
    for n, (sym, (mkt, b)) in enumerate(data.items()):
        if n % 100 == 0:
            print(f"simulating {n}/{len(data)}", flush=True)
        for pname, (a, z) in PERIODS.items():
            lo = b.index.searchsorted(pd.Timestamp(a))
            hi = b.n if z is None else b.index.searchsorted(pd.Timestamp(z), side="right")
            if hi - max(lo, 260) < 120:
                continue
            base_cache: dict = {}
            for tech in TECHNIQUES + [REFERENCE]:
                for e, x, r in simulate(b, tech, COSTS[cost_name][mkt], lo, hi, MIN_VALUE[mkt]):
                    k = x - e
                    rows.append((cost_name, mkt, pname, tech.key, sym, b.index[e], b.index[x], r, k,
                                 _hold_baseline(b["o"], lo, hi, k, base_cache)))
    return pd.DataFrame(rows, columns=["cost", "market", "period", "tech", "symbol", "entry", "exit", "ret", "days", "base"])


def trade_stats(t: pd.DataFrame, n_stocks: dict) -> pd.DataFrame:
    years = {"2010~2018": 9.0, "2019~": (pd.Timestamp.today() - pd.Timestamp("2019-01-01")).days / 365}
    out = []
    for (cost, mkt, per, tech), g in t.groupby(["cost", "market", "period", "tech"], sort=False):
        r = g["ret"]
        gains, losses = r[r > 0].sum(), -r[r < 0].sum()
        out.append({"cost": cost, "market": mkt, "period": per, "tech": tech, "trades": len(r),
                    "perStockYear": len(r) / n_stocks[mkt] / years[per], "win": (r > 0).mean(), "avg": r.mean(),
                    "median": r.median(), "pf": gains / losses if losses > 0 else np.nan, "days": g["days"].mean(),
                    "edge": (r - g["base"]).mean()})
    return pd.DataFrame(out)


def portfolio(t: pd.DataFrame, data: dict, slots=SLOTS, seed=7) -> pd.DataFrame:
    out = []
    daily = (1 + CASH_RATE) ** (1 / 252) - 1
    closes = {s: pd.Series(b["c"], index=b.index) for s, (_, b) in data.items()}
    bh_cache = {}
    for (cost, mkt, per, tech), g in t.groupby(["cost", "market", "period", "tech"], sort=False):
        a, z = PERIODS[per]
        rnd = random.Random(seed)
        trades = sorted(((e, rnd.random(), x, r, s) for e, x, r, s in zip(g["entry"], g["exit"], g["ret"], g["symbol"])))
        days = pd.bdate_range(pd.Timestamp(a), pd.Timestamp(z) if z else pd.Timestamp.today())
        cash, open_, ti, curve = 1.0, [], 0, []
        for d in days:
            cash *= 1 + daily
            keep = []
            for x, amt, r, s, e0 in open_:
                if x <= d:
                    cash += amt * (1 + r)
                else:
                    keep.append((x, amt, r, s, e0))
            open_ = keep
            while ti < len(trades) and trades[ti][0] <= d:
                e, _, x, r, s = trades[ti]
                ti += 1
                if e < d or len(open_) >= slots:
                    continue
                equity = cash + sum(q[1] for q in open_)
                amt = min(cash, equity / slots)
                cash -= amt
                open_.append((x, amt, r, s, closes[s].asof(d)))
            curve.append(cash + sum(amt * closes[s].asof(d) / e0 for _, amt, _, s, e0 in open_))
        v = np.array(curve)
        years = len(v) / 252
        if (mkt, per) not in bh_cache:
            syms = [s for s, (m, _) in data.items() if m == mkt]
            px = pd.concat({s: closes[s].reindex(closes[s].index.union(days)).ffill().reindex(days) for s in syms}, axis=1)
            px = px.loc[:, px.iloc[0].notna()]
            bh_cache[(mkt, per)] = (px / px.iloc[0]).mean(axis=1).to_numpy()
        bh = bh_cache[(mkt, per)]
        out.append({"cost": cost, "market": mkt, "period": per, "tech": tech,
                    "cagr": v[-1] ** (1 / years) - 1, "mdd": float((v / np.maximum.accumulate(v) - 1).min()),
                    "bhCagr": bh[-1] ** (1 / years) - 1, "bhMdd": float((bh / np.maximum.accumulate(bh) - 1).min())})
    return pd.DataFrame(out)


def prepare() -> dict[str, tuple[str, Bars]]:
    uni = get_universe()
    prices = load_prices([u["symbol"] for u in uni] + list(INDEX.values()))
    idx = {m: prices[s]["c"] for m, s in INDEX.items() if s in prices}
    data = {}
    for u in uni:
        s = u["symbol"]
        if s in prices:
            data[s] = (u["market"], Bars(features(prices[s], idx.get(u["market"]))))
    return data


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "summary"
    data = prepare()
    n_stocks = {m: sum(1 for mm, _ in data.values() if mm == m) for m in ("KR", "US")}
    print("stocks:", n_stocks, flush=True)
    m = run(data, "meritz")
    # The event ending changes only costs, not signals: re-price each trade with the extra fees.
    extra = {mk: ((1 - COSTS["after2026"][mk][0]) / (1 - COSTS["meritz"][mk][0])) * ((1 - COSTS["after2026"][mk][1]) / (1 - COSTS["meritz"][mk][1]))
             for mk in ("KR", "US")}
    a26 = m.assign(cost="after2026", ret=(1 + m["ret"]) * m["market"].map(extra) - 1)
    t = pd.concat([m, a26])
    stats = trade_stats(t, n_stocks)
    port = portfolio(t[t["cost"] == "meritz"], data)
    names = {k: v.name for k, v in BY_KEY.items()}
    pd.set_option("display.width", 250)
    pct = lambda v: f"{v * 100:+.2f}%" if pd.notna(v) else "-"  # noqa: E731
    for (cost, mkt, per), g in stats.groupby(["cost", "market", "period"], sort=False):
        g = g.merge(port, on=["cost", "market", "period", "tech"], how="left")
        g = g.assign(name=g["tech"].map(names)).set_index("name").sort_values("edge", ascending=False)
        cols = ["trades", "perStockYear", "win", "avg", "median", "pf", "days", "edge", "cagr", "mdd", "bhCagr", "bhMdd"]
        f = g[cols].copy()
        for c in ("avg", "median", "edge", "cagr", "mdd", "bhCagr", "bhMdd"):
            f[c] = f[c].map(pct)
        f["win"] = f["win"].map(lambda v: f"{v * 100:.0f}%")
        for c in ("pf", "days", "perStockYear"):
            f[c] = f[c].map(lambda v: f"{v:.2f}" if pd.notna(v) else "-")
        print(f"\n== {cost} · {mkt} · {per} ({n_stocks[mkt]} stocks) ==")
        print(f.to_string())
    if mode == "json":
        OUT.write_text(json.dumps({
            "universe": n_stocks, "slots": SLOTS,
            "techniques": {k: {"name": v.name, "source": v.source, "plan": v.plan} for k, v in BY_KEY.items()},
            "stats": stats.to_dict(orient="records"), "portfolio": port.to_dict(orient="records"),
        }, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
        print("wrote", OUT)


if __name__ == "__main__":
    main()
