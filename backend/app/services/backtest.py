"""Monthly DCA backtest for the ISA targets: does a signal beat plain DCA after costs?

Every strategy gets the same money: on the first trading day of each month the base amount lands in
the account as cash, then the strategy decides how much to buy (multiplier x base, capped by cash on
hand) and optionally what fraction of holdings to move back to cash. Idle cash earns a parking-ETF
rate. Strategies differ only in timing, never in how much money came in.

Fills use dividend-adjusted ETF closes converted to KRW, which is what an unhedged KRW-listed ETF
tracks. Signals read the index itself, like the live endpoint, and only see data up to the previous
trading day.

The owner's ISA plan is S&P500 40 : 나스닥100 30 : KODEX 미국반도체 30 (see PORTFOLIO). KODEX 미국반도체
tracks MVIS US Listed Semiconductor 25, the same index as VanEck SMH, so the semis sleeve uses SMH
for both signal and fills. Caveat: before Dec 2011 SMH was the Semiconductor HOLDRS basket.

Run: python -m app.services.backtest [portfolio|optimize|dayrules|trend|trendjson|targets]
Ideas being tested are written up in docs/signal-research.md.
"""

import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, NamedTuple

import numpy as np
import pandas as pd
import yfinance as yf

from . import signals
from .macro import _trend_stats

CACHE_DIR = Path(__file__).resolve().parents[2] / ".cache"

FILL_ETF = {"sp500": "SPY", "ndx": "QQQ", "sox": "SOXX", "kospi": "069500.KS", "semis": "SMH"}
SEMIS = next(t for t in signals.TARGETS if t["id"] == "semis")
PORTFOLIO = {"sp500": 0.40, "ndx": 0.30, "semis": 0.30}
# First month tested. US is limited by USD/KRW history (Dec 2003) plus a year of warm-up,
# KOSPI by KODEX 200's listing (Jan 2007).
START = {"US": "2005-01-01", "KR": "2008-01-01"}
SPLIT = "2017-01-01"  # rules are judged in-sample before this date and validated after it

# One-way trading cost in the owner's account (KB증권 비대면 중개형 ISA): 0.015% base online fee
# (the 2026-08~12 event rate is 0.005%; assume the base) + ~0.02% half-spread on a KRW index ETF.
# ETFs pay no securities transaction tax.
COST = 0.00015 + 0.0002


def _history(ticker: str) -> pd.DataFrame:
    """Full daily Close/Volume history, cached on disk for a day."""
    f = CACHE_DIR / (ticker.replace("^", "_").replace("=", "_") + ".pkl")
    if f.exists() and time.time() - f.stat().st_mtime < 86400:
        return pd.read_pickle(f)
    df = yf.Ticker(ticker).history(period="max", auto_adjust=True)[["Close", "Volume"]].dropna()
    df.index = df.index.tz_localize(None).normalize()
    CACHE_DIR.mkdir(exist_ok=True)
    df.to_pickle(f)
    return df


@dataclass
class Market:
    target: dict
    index: pd.Series  # signal source, local currency
    etf: pd.DataFrame  # fill ETF Close/Volume, local currency
    fill_krw: pd.Series  # KRW paid per ETF unit
    vix: pd.Series
    krw: pd.Series  # KRW per USD


def load_market(target: dict) -> Market:
    etf = _history(FILL_ETF[target["id"]])
    krw = _history("KRW=X")["Close"]
    if target["region"] == "US":
        fill = etf["Close"] * krw.reindex(etf.index, method="ffill")
    else:
        fill = etf["Close"]
    return Market(target, _history(target["symbol"])["Close"], etf, fill.dropna(), _history("^VIX")["Close"], krw)


class Decision(NamedTuple):
    buy: float  # multiple of the base amount to buy this month
    trim: float = 0.0  # fraction of holdings to sell to cash first


@dataclass
class State:
    base: float
    cash: float = 0.0
    units: float = 0.0
    memo: dict = field(default_factory=dict)  # per-strategy scratch space


class View:
    """What a strategy may look at on `day`: everything strictly before it."""

    def __init__(self, m: Market, day: pd.Timestamp):
        self.m, self.day, self.target = m, day, m.target

    def _cut(self, s, n=None):
        s = s.iloc[: s.index.searchsorted(self.day)]
        return s.iloc[-n:] if n else s

    def index(self, n=None) -> pd.Series:
        return self._cut(self.m.index, n)

    def etf(self, n=None) -> pd.DataFrame:
        return self._cut(self.m.etf, n)

    def vix(self, n=None) -> pd.Series:
        return self._cut(self.m.vix, n)

    def krw(self, n=None) -> pd.Series:
        return self._cut(self.m.krw, n)

    def monthly(self) -> pd.Series:
        """Month-end index closes; the last one is the month that just ended."""
        return self.index().resample("ME").last().dropna()


Strategy = Callable[[View, State], Decision]


@dataclass
class Result:
    name: str
    ledger: pd.DataFrame  # one row per month: units, cash, invested, buy, trim
    value: pd.Series  # daily account value in KRW
    invested: pd.Series  # daily cumulative contributions

    def metrics(self) -> dict:
        v, inv = self.value, self.invested
        flows = self.ledger["invested"].diff().fillna(self.ledger["invested"].iloc[0])
        # Time-weighted daily returns: only the monthly contribution is an outside flow.
        contrib = flows.reindex(v.index).fillna(0.0)
        twr = ((v - contrib) / v.shift(1)).iloc[1:].replace([np.inf, -np.inf], np.nan).fillna(1.0)
        curve = twr.cumprod()
        cash_share = (self.ledger["cash"] / v.reindex(self.ledger.index)).mean()
        return {
            "final": float(v.iloc[-1]),
            "invested": float(inv.iloc[-1]),
            "xirr": _xirr(flows, v.index[-1], float(v.iloc[-1])),
            "worstVsPrincipal": float((v / inv - 1).min()),
            "mdd": float((curve / curve.cummax() - 1).min()),
            "avgCashShare": float(cash_share),
            "trims": int((self.ledger["trim"] > 0).sum()),
        }


def _xirr(flows: pd.Series, end: pd.Timestamp, final: float) -> float:
    """Annual money-weighted return: contributions out, final value back."""
    years = np.array([(d - flows.index[0]).days / 365.25 for d in flows.index])
    horizon = (end - flows.index[0]).days / 365.25
    amounts = flows.to_numpy()

    def npv(r):
        return final / (1 + r) ** horizon - float(np.sum(amounts / (1 + r) ** years))

    lo, hi = -0.99, 5.0
    for _ in range(200):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if npv(mid) > 0 else (lo, mid)
    return (lo + hi) / 2


def run_portfolio(markets: dict[str, Market], weights: dict[str, float], strategy: Strategy | None,
                  name: str, start=None, end=None, base=1_000_000.0, cost=COST, cash_rate=0.025,
                  rebalance=False) -> Result:
    """Monthly DCA over several sleeves. Each sleeve gets weight x base per month and runs `strategy`
    on its own signal and cash. With rebalance=True (plain buying only) the month's money goes to the
    sleeves furthest below their target weight instead.
    cost: one-way fee+spread per trade. cash_rate: yearly rate on idle cash (CD-rate parking ETF)."""
    assert not (rebalance and strategy is not None), "rebalance mode buys plainly"
    ids = list(weights)
    start = start or max(START[markets[i].target["region"]] for i in ids)
    px = pd.concat({i: markets[i].fill_krw for i in ids}, axis=1).loc[start:end].dropna()
    days = px.index
    firsts = days[np.r_[True, days.month[1:] != days.month[:-1]]]
    states = {i: State(base=base * weights[i]) for i in ids}
    rows = []
    for n, d in enumerate(firsts):
        p = px.loc[d]
        if rebalance:
            held = {i: states[i].units * p[i] + states[i].cash for i in ids}
            total = sum(held.values()) + base
            gap = {i: max(weights[i] * total - held[i], 0.0) for i in ids}
            g = sum(gap.values()) or 1.0
            contrib = {i: base * gap[i] / g for i in ids}
        else:
            contrib = {i: base * weights[i] for i in ids}
        bought, trimmed = 0.0, 0.0
        for i in ids:
            st = states[i]
            if n:
                st.cash *= (1 + cash_rate) ** (1 / 12)
            st.cash += contrib[i]
            dec = strategy(View(markets[i], d), st) if strategy else Decision(1.0)
            if dec.trim > 0 and st.units > 0:
                sold = st.units * min(dec.trim, 1.0)
                st.units -= sold
                st.cash += sold * p[i] * (1 - cost)
                trimmed = max(trimmed, dec.trim)
            amount = min(max(dec.buy, 0.0) * (contrib[i] if rebalance else st.base), st.cash)
            if amount > 0:
                st.units += amount * (1 - cost) / p[i]
                st.cash -= amount
            bought += amount
        rows.append({"day": d, "cash": sum(st.cash for st in states.values()), "invested": base * (n + 1),
                     "buy": bought / base, "trim": trimmed,
                     "units": sum(st.units for st in states.values()),
                     **{f"units:{i}": states[i].units for i in ids}})
    ledger = pd.DataFrame(rows).set_index("day")
    step = ledger.reindex(days, method="ffill")
    value = sum(step[f"units:{i}"] * px[i] for i in ids) + step["cash"]
    return Result(name, ledger, value, step["invested"])


def run(m: Market, strategy: Strategy, name: str, start=None, end=None, **kw) -> Result:
    """Single-target DCA."""
    return run_portfolio({m.target["id"]: m}, {m.target["id"]: 1.0}, strategy, name, start, end, **kw)


# A buy-day rule looks at the ETF's KRW closes strictly before `day` and says whether to buy today.
DayRule = Callable[[pd.Series], bool]


def dip_day(z=1.5, lookback=60) -> DayRule:
    """Yesterday's move was a drop of at least z times the usual daily move (std of the last
    `lookback` daily returns): "평소보다 많이 빠진 날" -> buy the next session."""

    def rule(closes: pd.Series) -> bool:
        r = closes.iloc[-(lookback + 1):].pct_change().dropna()
        return len(r) >= lookback and r.iloc[-1] <= -z * r.std()

    return rule


def below_ma_day(pct=0.03, n=20) -> DayRule:
    """Yesterday closed at least `pct` under its n-day average."""

    def rule(closes: pd.Series) -> bool:
        c = closes.iloc[-n:]
        return len(c) == n and c.iloc[-1] <= c.mean() * (1 - pct)

    return rule


def run_day_rule(markets: dict[str, Market], weights: dict[str, float], rule: DayRule | str, name: str,
                 start=None, end=None, base=1_000_000.0, cost=COST, cash_rate=0.025) -> Result:
    """Same money as plain DCA (weight x base per sleeve on the first trading day), but each sleeve
    waits inside the month for its own `rule` to fire and buys at that close; if it never fires the
    money goes in on the month's last trading day. Idle days earn the parking rate.
    rule="hindsight" buys at each month's lowest close: the best any day-picking rule could do."""
    ids = list(weights)
    start = start or max(START[markets[i].target["region"]] for i in ids)
    px = pd.concat({i: markets[i].fill_krw for i in ids}, axis=1).loc[start:end].dropna()
    full = {i: markets[i].fill_krw for i in ids}
    days = px.index
    month = days.to_period("M")
    units = {i: 0.0 for i in ids}
    cash = {i: 0.0 for i in ids}
    rows = []
    daily_rate = (1 + cash_rate) ** (1 / 252) - 1
    months = month.unique()
    for n, mo in enumerate(months):
        mdays = days[month == mo]
        for i in ids:
            cash[i] += base * weights[i]
            p = px.loc[mdays, i]
            if rule == "hindsight":
                buy_day = p.idxmin()
            else:
                buy_day = mdays[-1]
                for d in mdays:
                    hist = full[i].iloc[: full[i].index.searchsorted(d)]
                    if rule(hist):
                        buy_day = d
                        break
            waited = int((mdays < buy_day).sum())
            cash[i] *= (1 + daily_rate) ** waited
            units[i] += cash[i] * (1 - cost) / float(p.loc[buy_day])
            cash[i] = 0.0
        rows.append({"day": mdays[0], "cash": 0.0, "invested": base * (n + 1), "buy": 1.0, "trim": 0.0,
                     "units": sum(units.values()), **{f"units:{i}": units[i] for i in ids}})
    ledger = pd.DataFrame(rows).set_index("day")
    step = ledger.reindex(days, method="ffill")
    # Between the first trading day and the actual buy the month's money is cash; valuing it at
    # month-end granularity is close enough for comparing final values.
    value = sum(step[f"units:{i}"] * px[i] for i in ids)
    value = value.where(value > 0, step["invested"])
    return Result(name, ledger, value, step["invested"])


DAY_RULES: dict[str, DayRule | str] = {
    "drop >= 1.0x usual": dip_day(1.0),
    "drop >= 1.5x usual": dip_day(1.5),
    "drop >= 2.0x usual": dip_day(2.0),
    "2% under 20d avg": below_ma_day(0.02),
    "4% under 20d avg": below_ma_day(0.04),
    "month's lowest close (hindsight)": "hindsight",
}


def compare_day_rules(periods=None, **kw) -> pd.DataFrame:
    ms = portfolio_markets()
    rows = []
    for pname, (start, end) in (periods or PERIODS).items():
        plain_r = run_portfolio(ms, PORTFOLIO, None, "plain", start, end, **kw)
        base_final = plain_r.value.iloc[-1]
        rows.append({"period": pname, "rule": "first trading day (plain)", "vsPlain": 0.0, **plain_r.metrics()})
        for name, rule in DAY_RULES.items():
            m = run_day_rule(ms, PORTFOLIO, rule, name, start, end, **kw).metrics()
            rows.append({"period": pname, "rule": name, "vsPlain": m["final"] / base_final - 1, **m})
    return pd.DataFrame(rows)


# ---- individual stocks: daily trend buy/sell -----------------------------------------------------

# One-way costs outside the ISA: US stocks ~0.07% fee + FX spread already paid on deposit, so 0.1%;
# KR stocks 0.015% fee + 0.15% transaction tax on sales + spread, so 0.25%.
STOCK_COST = {"US": 0.001, "KR": 0.0025}


def run_trend(closes: pd.Series, name: str, start=None, end=None, base=1_000_000.0, cost=0.001,
              cash_rate=0.025, rule: dict | None = None) -> Result:
    """Monthly contributions into one stock. With `rule` (stockscan.trend_frame params) the position
    goes to cash on SELL and back in, with all saved cash, on BUY; contributions made while out wait
    as cash. rule=None is plain DCA. Trades execute at the close after the signal's close."""
    from .stockscan import trend_frame

    hold = trend_frame(closes, **rule)["hold"].shift(1).fillna(True) if rule else pd.Series(True, index=closes.index)
    px = closes.loc[start:end]
    days = px.index
    firsts = set(days[np.r_[True, days.month[1:] != days.month[:-1]]])
    daily = (1 + cash_rate) ** (1 / 252) - 1
    units = cash = invested = 0.0
    held_prev = True
    rows, trades = [], 0
    for d in days:
        p = float(px.loc[d])
        cash *= 1 + daily
        want = bool(hold.loc[d])
        if d in firsts:
            cash += base
            invested += base
        if held_prev and not want and units > 0:
            cash += units * p * (1 - cost)
            units = 0.0
            trades += 1
        if want and cash > 0:
            trades += int(not held_prev)
            units += cash * (1 - cost) / p
            cash = 0.0
        held_prev = want
        rows.append({"day": d, "units": units, "cash": cash, "invested": invested, "buy": 0.0, "trim": 0.0,
                     "inMarket": want})
    ledger = pd.DataFrame(rows).set_index("day")
    value = ledger["units"] * px + ledger["cash"]
    month_rows = ledger[ledger.index.isin(firsts)]
    r = Result(name, month_rows, value, ledger["invested"])
    r.extra = {"trades": trades, "timeInMarket": float(ledger["inMarket"].mean())}
    return r


TREND_VARIANTS = {f"sma{n}{'+macd' if m else ''}": {"n": n, "slope_days": 20, "macd_lookback": 5, "use_macd": m}
                  for n in (150, 200, 250) for m in (True, False)}


def compare_trend(symbols=None, periods=None, **kw) -> pd.DataFrame:
    from ..tickers import BIGTECH

    rows = []
    for sym in symbols or BIGTECH:
        closes = _history(sym)["Close"]
        region = "KR" if sym.endswith(".KS") else "US"
        first = max(pd.Timestamp("2005-01-01"), closes.index[0] + pd.Timedelta(days=400))
        for pname, (start, end) in (periods or PERIODS).items():
            s = max(pd.Timestamp(start), first) if start else first
            if end and s >= pd.Timestamp(end):
                continue
            plain_r = run_trend(closes, "plain", s, end, cost=STOCK_COST[region], **kw)
            base_final = plain_r.value.iloc[-1]
            rows.append({"symbol": sym, "period": pname, "rule": "plain DCA", "vsPlain": 0.0, "trades": 0,
                         "timeInMarket": 1.0, **plain_r.metrics()})
            for name, rule in TREND_VARIANTS.items():
                r = run_trend(closes, name, s, end, cost=STOCK_COST[region], rule=rule, **kw)
                rows.append({"symbol": sym, "period": pname, "rule": name, "vsPlain": r.value.iloc[-1] / base_final - 1,
                             **r.extra, **r.metrics()})
    return pd.DataFrame(rows)


# ---- strategies -------------------------------------------------------------------------------

def _clamp(v, lo=0.5, hi=1.5):
    return float(max(lo, min(hi, v)))


def plain(v: View, s: State) -> Decision:
    return Decision(1.0)


# The multipliers the app used to recommend for each score band (70+ / 40-69 / <40).
_V1_MULTIPLIER = {signals.BANDS[0][1]: 1.5, signals.BANDS[1][1]: 1.0, signals.BANDS[2][1]: 0.5}


def v1(v: View, s: State) -> Decision:
    """The live phase-2 score (without KRX flows, which have no history here)."""
    fx, hint = signals._fx_component(v.krw(252))
    extras = {"fear": signals._fear_component(v.vix(252)), "fx": fx, "fx_hint": hint, "flows": None}
    r = signals.score_target(v.target, _trend_stats(v.index(252)), extras)
    return Decision(_V1_MULTIPLIER.get(r["action"], 1.0))


def disparity(n=60, k=1.0) -> Strategy:
    """Shannon's demon + n-day disparity d (price / n-day mean x 100). k=1 is the post's rule,
    equity:cash = (200 - d):d around 100:100; larger k reacts harder."""

    def fn(v: View, s: State) -> Decision:
        c = v.index(n)
        d = float(c.iloc[-1] / c.mean() * 100)
        return Decision(_clamp(1 + k * (100 - d) / 100))

    return fn


disparity60 = disparity(60)


def _monthly_pctb(v: View, n=20, k=2.0) -> float | None:
    mc = v.monthly().iloc[-n:]
    if len(mc) < n:
        return None
    mid, sd = mc.mean(), mc.std(ddof=0)
    return float((mc.iloc[-1] - (mid - k * sd)) / (2 * k * sd)) if sd > 0 else None


def monthly_band(n=20, k=2.0) -> Strategy:
    """Monthly Bollinger(n, k): above the upper band buy 0.5x, below the lower band 1.5x."""

    def fn(v: View, s: State) -> Decision:
        pb = _monthly_pctb(v, n, k)
        if pb is None:
            return Decision(1.0)
        return Decision(0.5 if pb > 1 else 1.5 if pb < 0 else 1.0)

    return fn


monthly_bb = monthly_band()


def monthly_bb_trim(v: View, s: State) -> Decision:
    """As monthly_bb, plus: every month above the upper band move 1/3 of holdings to cash,
    and below the lower band put all idle cash back in."""
    pb = _monthly_pctb(v)
    if pb is None:
        return Decision(1.0)
    if pb > 1:
        return Decision(0.5, trim=1 / 3)
    if pb < 0:
        return Decision(s.cash / s.base)
    return Decision(1.0)


def _rsi(c: pd.Series, n=14) -> pd.Series:
    d = c.diff()
    up = d.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    return 100 - 100 / (1 + up / dn)


def rsi_relative(n=60, k=1.0) -> Strategy:
    """RSI judged against its own recent rhythm (%B of a Bollinger(n, 2) on RSI) instead of 70/30."""

    def fn(v: View, s: State) -> Decision:
        rsi = _rsi(v.index(n + 300)).iloc[-n:]
        mid, sd = rsi.mean(), rsi.std(ddof=0)
        pb = float((rsi.iloc[-1] - (mid - 2 * sd)) / (4 * sd)) if sd > 0 else 0.5
        return Decision(_clamp(1 + k * (0.5 - pb)))

    return fn


def _slope(x: pd.Series) -> float:
    return float(np.polyfit(np.arange(len(x)), x.to_numpy(dtype=float), 1)[0])


def obv_divergence(v: View, s: State) -> Decision:
    """Price falling while OBV rises = accumulation (buy more); the reverse = distribution."""
    e = v.etf(80)
    obv = (np.sign(e["Close"].diff().fillna(0)) * e["Volume"]).cumsum()
    p, o = _slope(e["Close"].iloc[-20:]), _slope(obv.iloc[-20:])
    if p < 0 < o:
        return Decision(1.5)
    if o < 0 < p:
        return Decision(0.5)
    return Decision(1.0)


def _falling_knife(v: View) -> bool:
    """Below a falling 10-month average and MACD still sloping down."""
    mc = v.monthly().iloc[-11:]
    if len(mc) < 11:
        return False
    sma_now, sma_prev = mc.iloc[-10:].mean(), mc.iloc[:10].mean()
    c = v.index(300)
    macd = c.ewm(span=12, adjust=False).mean() - c.ewm(span=26, adjust=False).mean()
    return bool(c.iloc[-1] < sma_now < sma_prev and macd.iloc[-1] < macd.iloc[-6])


def knife_guard(inner: Strategy, cap=1.0) -> Strategy:
    """Don't catch a falling knife: cap buying while it falls, then spend the saved cash once
    when it turns ("칼끝이 올라갈 때 딱 한 번")."""

    def fn(v: View, s: State) -> Decision:
        d = inner(v, s)
        falling = _falling_knife(v)
        was = s.memo.get("falling", False)
        s.memo["falling"] = falling
        if falling:
            return Decision(min(d.buy, cap), d.trim)
        if was:
            return Decision(max(d.buy, s.cash / s.base), d.trim)
        return d

    return fn


def cash_cap(inner: Strategy, months=6) -> Strategy:
    """Never sit on more than `months` of contributions: anything above that is bought now.
    Separates "when to buy" from plain cash drag. Not for trim strategies (it would buy straight back)."""

    def fn(v: View, s: State) -> Decision:
        d = inner(v, s)
        return Decision(max(d.buy, (s.cash - months * s.base) / s.base), d.trim)

    return fn


STRATEGIES: dict[str, Strategy] = {
    "plain": plain,
    "v1": v1,
    "v1+guard": knife_guard(v1),
    "disparity60": disparity60,
    "disparity60+guard": knife_guard(disparity60),
    "monthly_bb": monthly_bb,
    "monthly_bb_trim": monthly_bb_trim,
    "rsi_relative": rsi_relative(),
    "obv_divergence": obv_divergence,
    "plain+guard0.5": knife_guard(plain, cap=0.5),
    "v1+cap6": cash_cap(v1),
    "v1+guard+cap6": cash_cap(knife_guard(v1)),
    "monthly_bb+cap6": cash_cap(monthly_bb),
}

PERIODS = {"full": (None, None), "in": (None, "2016-12-31"), "out": (SPLIT, None)}


def _pct(v):
    return f"{v:+.1%}"


def compare(strategies=STRATEGIES, periods=PERIODS, targets=None, **kw) -> pd.DataFrame:
    """Each strategy on each target alone."""
    rows = []
    for t in targets or signals.TARGETS:
        m = load_market(t)
        for pname, (start, end) in periods.items():
            base_final = None
            for name, fn in strategies.items():
                r = run(m, fn, name, start=start, end=end, **kw).metrics()
                base_final = base_final or r["final"]
                rows.append({"target": t["id"], "period": pname, "strategy": name,
                             "vsPlain": r["final"] / base_final - 1, **r})
    return pd.DataFrame(rows)


def portfolio_markets() -> dict[str, Market]:
    by_id = {t["id"]: t for t in signals.TARGETS}
    return {i: load_market(by_id[i]) for i in PORTFOLIO}


def compare_portfolio(strategies=STRATEGIES, periods=PERIODS, **kw) -> pd.DataFrame:
    """The owner's 40/30/30 plan, each sleeve following its own signal."""
    ms = portfolio_markets()
    rows = []
    for pname, (start, end) in periods.items():
        runs = {"plain": run_portfolio(ms, PORTFOLIO, None, "plain", start, end, **kw),
                "plain (rebalance by new money)": run_portfolio(ms, PORTFOLIO, None, "rebal", start, end,
                                                                 rebalance=True, **kw)}
        runs |= {n: run_portfolio(ms, PORTFOLIO, fn, n, start, end, **kw)
                 for n, fn in strategies.items() if n != "plain"}
        base_final = runs["plain"].value.iloc[-1]
        for name, r in runs.items():
            m = r.metrics()
            rows.append({"period": pname, "strategy": name, "vsPlain": m["final"] / base_final - 1, **m})
    return pd.DataFrame(rows)


# Pre-registered search (docs/signal-research.md): coarse grids, one setting shared by all sleeves,
# chosen on the in-sample period only, by the average of a setting and its grid neighbours so a lone
# lucky spike can't win. The out-of-sample period is looked at once, for the chosen setting.
GRIDS = {
    "disparity": (disparity, {"n": [20, 60, 120], "k": [1.0, 2.0, 3.0]}),
    "disparity+guard": (lambda n, k: knife_guard(disparity(n, k)), {"n": [20, 60, 120], "k": [1.0, 2.0, 3.0]}),
    "rsi_relative": (rsi_relative, {"n": [40, 60, 120], "k": [1.0, 2.0, 3.0]}),
    "monthly_band": (monthly_band, {"n": [12, 20], "k": [1.5, 2.0]}),
}


def optimize(**kw) -> tuple[pd.DataFrame, pd.DataFrame]:
    ms = portfolio_markets()
    start, end = PERIODS["in"]
    plain_in = run_portfolio(ms, PORTFOLIO, None, "plain", start, end, **kw).metrics()
    rows = []
    for fam, (factory, grid) in GRIDS.items():
        k0, k1 = list(grid)
        for a in grid[k0]:
            for b in grid[k1]:
                params = {k0: a, k1: b}
                m = run_portfolio(ms, PORTFOLIO, factory(**params), fam, start, end, **kw).metrics()
                rows.append({"family": fam, **params, "vsPlain": m["final"] / plain_in["final"] - 1,
                             "worstGain": m["worstVsPrincipal"] - plain_in["worstVsPrincipal"],
                             "mddGain": m["mdd"] - plain_in["mdd"]})
    grid_df = pd.DataFrame(rows)

    def smoothed(r):
        _, grid = GRIDS[r.family]
        k0, k1 = list(grid)
        i0, i1 = grid[k0].index(r[k0]), grid[k1].index(r[k1])
        fam = grid_df[grid_df.family == r.family]
        dist = fam.apply(lambda x: abs(grid[k0].index(x[k0]) - i0) + abs(grid[k1].index(x[k1]) - i1), axis=1)
        return fam[dist <= 1].vsPlain.mean()

    grid_df["smoothed"] = grid_df.apply(smoothed, axis=1)
    picks = grid_df.loc[grid_df.groupby("family").smoothed.idxmax()]
    o_start, o_end = PERIODS["out"]
    plain_out = run_portfolio(ms, PORTFOLIO, None, "plain", o_start, o_end, **kw).metrics()
    out_rows = []
    for _, r in picks.iterrows():
        factory, grid = GRIDS[r.family]
        params = {k: r[k] for k in grid}
        m = run_portfolio(ms, PORTFOLIO, factory(**params), r.family, o_start, o_end, **kw).metrics()
        out_rows.append({"family": r.family, **params, "inVsPlain": r.vsPlain, "inSmoothed": r.smoothed,
                         "outVsPlain": m["final"] / plain_out["final"] - 1,
                         "outWorstGain": m["worstVsPrincipal"] - plain_out["worstVsPrincipal"],
                         "outMddGain": m["mdd"] - plain_out["mdd"]})
    return grid_df, pd.DataFrame(out_rows)


TREND_JSON = Path(__file__).resolve().parents[1] / "data" / "trend_backtest.json"


def write_trend_json(rule_name="sma200+macd") -> dict:
    """Per-stock backtest of the live trend rule, shown next to each stock's buy/sell call.
    Re-run after changing stockscan.TREND: python -m app.services.backtest trendjson"""
    from ..tickers import BIGTECH

    df = compare_trend(BIGTECH, {"full": PERIODS["full"]})
    out = {}
    for sym, g in df.groupby("symbol"):
        plain = g[g.rule == "plain DCA"].iloc[0]
        r = g[g.rule == rule_name].iloc[0]
        out[sym] = {
            "rule": rule_name,
            "period": f"{max(pd.Timestamp('2005-01-01'), _history(sym).index[0] + pd.Timedelta(days=400)):%Y-%m} ~ "
                      f"{_history(sym).index[-1]:%Y-%m}",
            "vsPlain": round(float(r.vsPlain), 4),
            "mdd": round(float(r.mdd), 4), "plainMdd": round(float(plain.mdd), 4),
            "worstVsPrincipal": round(float(r.worstVsPrincipal), 4),
            "plainWorstVsPrincipal": round(float(plain.worstVsPrincipal), 4),
            "trades": int(r.trades), "timeInMarket": round(float(r.timeInMarket), 3),
        }
    TREND_JSON.parent.mkdir(exist_ok=True)
    TREND_JSON.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return out


if __name__ == "__main__":
    import sys

    pd.set_option("display.width", 200)
    pd.set_option("display.max_rows", 500)
    CACHE_DIR.mkdir(exist_ok=True)
    mode = sys.argv[1] if len(sys.argv) > 1 else "portfolio"
    pct_cols = ["vsPlain", "xirr", "worstVsPrincipal", "mdd", "worstGain", "mddGain", "smoothed",
                "inVsPlain", "inSmoothed", "outVsPlain", "outWorstGain", "outMddGain"]
    fmt = {c: _pct for c in pct_cols} | {"avgCashShare": "{:.0%}".format}
    if mode == "targets":
        df = compare()
        df.to_csv(CACHE_DIR / "backtest_targets.csv", index=False, encoding="utf-8-sig")
        for col in ["vsPlain", "mdd", "worstVsPrincipal", "avgCashShare"]:
            t = df.pivot_table(index="strategy", columns=["period", "target"], values=col).reindex(list(STRATEGIES))
            print(f"\n== {col} ==")
            print((t * 100).round(1).to_string())
    elif mode == "portfolio":
        df = compare_portfolio()
        df.to_csv(CACHE_DIR / "backtest_portfolio.csv", index=False, encoding="utf-8-sig")
        for pname in PERIODS:
            t = df[df.period == pname].set_index("strategy")
            print(f"\n== portfolio 40/30/30, period: {pname} ==")
            print(t[["vsPlain", "xirr", "worstVsPrincipal", "mdd", "avgCashShare"]].to_string(formatters=fmt))
    elif mode == "trendjson":
        print(json.dumps(write_trend_json(), ensure_ascii=False, indent=2))
    elif mode == "trend":
        df = compare_trend()
        df.to_csv(CACHE_DIR / "backtest_trend.csv", index=False, encoding="utf-8-sig")
        order = ["plain DCA", *TREND_VARIANTS]
        for col in ["vsPlain", "mdd", "worstVsPrincipal"]:
            t = df.pivot_table(index="rule", columns=["period", "symbol"], values=col).reindex(order)
            print(f"\n== trend buy/sell on single stocks: {col} ==")
            print((t * 100).round(1).to_string())
        t = df[df.rule == "sma200+macd"].pivot_table(index="symbol", columns="period", values=["trades", "timeInMarket"])
        print("\n== sma200+macd: trades and share of days in the market ==")
        print(t.round(2).to_string())
    elif mode == "dayrules":
        df = compare_day_rules()
        df.to_csv(CACHE_DIR / "backtest_dayrules.csv", index=False, encoding="utf-8-sig")
        for pname in PERIODS:
            t = df[df.period == pname].set_index("rule")
            print(f"\n== buy-day rules, portfolio 40/30/30, period: {pname} ==")
            print(t[["vsPlain", "xirr", "worstVsPrincipal"]].to_string(formatters=fmt))
    elif mode == "optimize":
        grid_df, picks = optimize()
        grid_df.to_csv(CACHE_DIR / "optimize_grid.csv", index=False, encoding="utf-8-sig")
        print("== in-sample grid (2005-2016), portfolio vs plain ==")
        print(grid_df.to_string(index=False, formatters=fmt))
        print("\n== chosen on in-sample, checked once out-of-sample (2017-) ==")
        print(picks.to_string(index=False, formatters=fmt))
