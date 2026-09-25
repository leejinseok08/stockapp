"""Single-stock research note, laid out like a sell-side initiation's first page.

Structure follows the owner's references (docs/signal-research.md section 6: the Wall Street
analyzer template and a video walkthrough of an AI-written Chipotle report):
- the rating comes from valuation vs price, not from liking the company; start neutral, value it,
  conclude last
- bear/base/bull targets; conviction is high only when all three sit on the same side of the price
- company guidance, street consensus and this app's own model are never mixed: consensus EPS is an
  input, the multiple comes from the stock's own history, and street price targets are shown apart
- 2-3 thesis points, a near-term catalyst, and the risks that would break the thesis
Rule-based and data-driven only; it cannot interview management or read transcripts.
"""

import json
import logging
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf

from .market import _cached, _num
from .stockscan import _closes_3y, get_relative, trend_signal

log = logging.getLogger("stockapp.analysis")

RATING_BAND = 0.15  # base-case upside needed for a buy/sell call; smaller gaps aren't worth acting on
TREND_BACKTEST_PATH = Path(__file__).resolve().parents[1] / "data" / "trend_backtest.json"


def _safe(fn, default=None):
    try:
        return fn()
    except Exception as e:
        log.warning("analysis input failed: %s", e)
        return default


def pe_history(annual_eps: pd.Series, closes: pd.Series) -> list[dict]:
    """PER for each fiscal year: average close over the fiscal year / that year's diluted EPS.
    Loss years are skipped (a negative PER isn't a multiple anyone pays)."""
    out = []
    for end, eps in annual_eps.dropna().sort_index().items():
        start = end - pd.DateOffset(years=1)
        window = closes[(closes.index > start) & (closes.index <= end)]
        if eps > 0 and len(window) > 150:
            out.append({"year": end.strftime("%Y"), "eps": float(eps), "pe": float(window.mean() / eps)})
    return out


def pbr_history(equity: pd.Series, shares: pd.Series, closes: pd.Series) -> list[dict]:
    """PBR for each fiscal year: average close / (year-end equity / year-end shares)."""
    out = []
    for end, eq in equity.dropna().sort_index().items():
        sh = shares.get(end)
        window = closes[(closes.index > end - pd.DateOffset(years=1)) & (closes.index <= end)]
        if eq and eq > 0 and sh and sh > 0 and len(window) > 150:
            bvps = float(eq) / float(sh)
            out.append({"year": end.strftime("%Y"), "bvps": bvps, "pbr": float(window.mean() / bvps)})
    return out


def is_cyclical(annual_eps: list[float]) -> bool:
    """Earnings that swing 3x+ between years, or any loss year: past PERs mislead (a trough year's
    tiny EPS makes a huge PER), so the model trims those years and leans on book value too."""
    if any(e <= 0 for e in annual_eps):
        return True
    return len(annual_eps) >= 2 and max(annual_eps) / min(annual_eps) > 3


def scenarios(price: float, eps: dict, pes: list[dict], cyclical: bool = False,
              pbr: dict | None = None, street: dict | None = None) -> dict | None:
    """Bear = low EPS x lowest PER, base = average EPS x median PER, bull = high EPS x highest PER.

    Cycle correction (docs/app-design.md): drop PERs from years whose EPS was under half the median
    and average with a book-value target (BVPS x past PBR range). Street targets bound the result:
    bull no higher than the highest street target, bear no lower than the lowest."""
    if not pes or not eps.get("avg") or eps["avg"] <= 0:
        return None
    used, excluded = pes, []
    if cyclical and len(pes) >= 3:
        med_eps = float(np.median([p["eps"] for p in pes]))
        used = [p for p in pes if p["eps"] >= 0.5 * med_eps]
        excluded = [p["year"] for p in pes if p not in used]
    pe_vals = [p["pe"] for p in used]
    lo, mid, hi = min(pe_vals), float(np.median(pe_vals)), max(pe_vals)
    cases = {
        "bear": (eps.get("low") or eps["avg"]) * lo,
        "base": eps["avg"] * mid,
        "bull": (eps.get("high") or eps["avg"]) * hi,
    }
    method = "PER"
    pbr_range = None
    if cyclical and pbr and pbr.get("bvps") and pbr.get("history"):
        vals = [h["pbr"] for h in pbr["history"]]
        pbr_range = {"min": min(vals), "median": float(np.median(vals)), "max": max(vals)}
        by_book = {"bear": pbr_range["min"], "base": pbr_range["median"], "bull": pbr_range["max"]}
        cases = {k: (v + pbr["bvps"] * by_book[k]) / 2 for k, v in cases.items()}
        method = "PER·PBR 평균 (사이클 보정)"
    clamped = []
    if street and street.get("high") and cases["bull"] > street["high"]:
        cases["bull"] = street["high"]
        clamped.append("bull")
    if street and street.get("low") and cases["bear"] < street["low"]:
        cases["bear"] = street["low"]
        clamped.append("bear")
    cases["bear"] = min(cases["bear"], cases["base"])
    cases["bull"] = max(cases["bull"], cases["base"])
    return {k: {"price": v, "upside": v / price - 1} for k, v in cases.items()} | {
        "peRange": {"min": lo, "median": mid, "max": hi, "years": len(used)},
        "pbrRange": pbr_range, "method": method, "excludedYears": excluded, "clampedToStreet": clamped}


def rating(sc: dict | None) -> tuple[str | None, str | None]:
    if not sc:
        return None, None
    base = sc["base"]["upside"]
    call = "매수" if base >= RATING_BAND else "매도" if base <= -RATING_BAND else "중립"
    sides = {np.sign(sc[k]["upside"]) for k in ("bear", "base", "bull")}
    conviction = "높음" if len(sides) == 1 and call != "중립" else "보통"
    return call, conviction


def margin_trend(q_income: pd.DataFrame) -> dict | None:
    """Latest quarter vs the same quarter a year ago: is revenue growth reaching the margin?"""
    if q_income is None or q_income.empty or not {"Total Revenue", "Operating Income"} <= set(q_income.index):
        return None
    rev = q_income.loc["Total Revenue"].sort_index(ascending=False)
    op = q_income.loc["Operating Income"].sort_index(ascending=False)
    if len(rev) < 5 or not rev.iloc[0] or not rev.iloc[4]:
        return None
    return {
        "quarter": rev.index[0].strftime("%Y-%m"),
        "revenueYoY": float(rev.iloc[0] / rev.iloc[4] - 1),
        "opMargin": float(op.iloc[0] / rev.iloc[0]),
        "opMarginYearAgo": float(op.iloc[4] / rev.iloc[4]),
    }


def _pct(v: float) -> str:
    return f"{v * 100:+.0f}%"


def build_note(price: float, eps: dict, eps_source: str, pes: list[dict], margins: dict | None,
               street: dict | None, next_earnings: str | None, trend: dict | None, relative: dict | None,
               ocf_negative: bool, currency: str | None, annual_eps: list[float] | None = None,
               pbr: dict | None = None) -> dict:
    cyclical = is_cyclical(annual_eps if annual_eps is not None else [p["eps"] for p in pes])
    sc = scenarios(price, eps, pes, cyclical=cyclical, pbr=pbr, street=street)
    call, conviction = rating(sc)
    fwd_pe = price / eps["avg"] if eps.get("avg") and eps["avg"] > 0 else None
    thesis, risks, catalysts = [], [], []

    if sc and fwd_pe:
        med = sc["peRange"]["median"]
        thesis.append(
            f"가치평가: {eps_source} EPS 기준 PER {fwd_pe:.1f}배로, 과거 {sc['peRange']['years']}년 중앙값 {med:.1f}배 대비 "
            f"{'할인' if fwd_pe < med else '할증'} {abs(fwd_pe / med - 1) * 100:.0f}%. 기본 목표가 상승 여력 {_pct(sc['base']['upside'])}")
        if fwd_pe > sc["peRange"]["max"]:
            risks.append(f"현재 PER({fwd_pe:.1f}배)이 과거 {sc['peRange']['years']}년 최고({sc['peRange']['max']:.1f}배)보다 높음 — 이익이 기대만큼 안 나오면 멀티플 하락")
    if margins:
        up = margins["opMargin"] >= margins["opMarginYearAgo"]
        thesis.append(
            f"이익의 질: {margins['quarter']} 분기 매출 전년비 {_pct(margins['revenueYoY'])}, 영업이익률 "
            f"{margins['opMarginYearAgo'] * 100:.1f}% → {margins['opMargin'] * 100:.1f}% "
            f"({'매출 성장이 마진으로 이어짐' if up else '매출은 늘었지만 마진이 따라오지 못함'})")
        if not up:
            risks.append("영업이익률(마진)이 1년 전보다 낮음 — 매출 성장이 이익으로 이어지지 않을 위험")
    if relative and relative.get("verdict"):
        line = f"가격 흐름: {relative['benchmarkName']} 대비 3개월 초과 {relative['excess3m']:+.1f}%p, {relative['verdict']}" \
            if relative.get("excess3m") is not None else f"가격 흐름: {relative['verdict']}"
        thesis.append(line)
    if eps.get("low") and eps.get("high") and eps.get("avg") and eps["avg"] > 0:
        spread = (eps["high"] - eps["low"]) / eps["avg"]
        if spread > 0.5:
            risks.append(f"애널리스트 EPS 추정 범위가 넓음(평균 대비 {spread * 100:.0f}%) — 이익 전망의 불확실성이 큼")
    if cyclical:
        note = "이익 변동이 큰 사이클 종목 — 이익 바닥 해의 PER은 빼고"
        note += " PBR 기준 목표가와 평균냄" if sc and sc["pbrRange"] else " 계산함"
        risks.append(note + (f" (제외: {', '.join(sc['excludedYears'])})" if sc and sc["excludedYears"] else ""))
    if ocf_negative:
        risks.append("최근 4분기 영업현금흐름 합계 적자")
    if trend and trend["action"] in ("SELL", "WAIT"):
        risks.append("추세 신호가 현금(매도) 상태 — 200일선 아래에서 추세가 꺾여 있음")
    if next_earnings:
        catalysts.append({"date": next_earnings, "text": "다음 실적 발표 — 마진과 가이던스가 논거를 확인하거나 깨뜨릴 첫 시점"})

    return {
        "rating": call,
        "conviction": conviction,
        "price": price,
        "currency": currency,
        "scenarios": sc,
        "model": {"eps": eps, "epsSource": eps_source, "forwardPe": fwd_pe, "peHistory": pes,
                  "cyclical": cyclical, "bvps": (pbr or {}).get("bvps"), "pbrHistory": (pbr or {}).get("history")},
        "street": ({**street, "modelVsStreet": sc["base"]["price"] / street["median"] - 1}
                   if street and sc and street.get("median") else street),
        "margins": margins,
        "thesis": thesis[:3],
        "catalysts": catalysts,
        "risks": risks[:4],
    }


def _eps_inputs(t: yf.Ticker, q_income: pd.DataFrame, shares: float | None) -> tuple[dict, str]:
    """Street's next-fiscal-year EPS range; if Yahoo won't serve estimates (it often won't to cloud
    servers), fall back to trailing four quarters so the model still runs, and say so."""
    est = _safe(lambda: t.earnings_estimate)
    if est is not None and not est.empty and "+1y" in est.index and _num(est.loc["+1y", "avg"]):
        row = est.loc["+1y"]
        return {"low": _num(row.get("low")), "avg": _num(row.get("avg")), "high": _num(row.get("high"))}, "컨센서스 내년"
    if q_income is not None and "Diluted EPS" in q_income.index:
        s = q_income.loc["Diluted EPS"].sort_index(ascending=False).dropna()
        if len(s) >= 4:
            return {"low": None, "avg": float(s.iloc[:4].sum()), "high": None}, "최근 4분기"
    if q_income is not None and "Net Income" in q_income.index and shares:
        s = q_income.loc["Net Income"].sort_index(ascending=False).dropna()
        if len(s) >= 4:
            return {"low": None, "avg": float(s.iloc[:4].sum()) / shares, "high": None}, "최근 4분기"
    return {"low": None, "avg": None, "high": None}, "없음"


def _book_inputs(t: yf.Ticker, closes: pd.Series, shares_now: float | None) -> dict | None:
    """Current book value per share and each fiscal year's PBR, from the balance sheets."""
    bal = t.balance_sheet
    qbal = t.quarterly_balance_sheet
    eq_row = next((r for r in ("Stockholders Equity", "Common Stock Equity") if r in bal.index), None)
    sh_row = next((r for r in ("Ordinary Shares Number", "Share Issued") if r in bal.index), None)
    if not eq_row or not sh_row:
        return None
    history = pbr_history(bal.loc[eq_row], bal.loc[sh_row], closes)
    q_eq = qbal.loc[eq_row].sort_index(ascending=False).dropna() if eq_row in qbal.index else bal.loc[eq_row].dropna()
    shares = shares_now or _num(bal.loc[sh_row].sort_index(ascending=False).dropna().iloc[0])
    bvps = float(q_eq.iloc[0]) / shares if len(q_eq) and shares else None
    return {"bvps": bvps, "history": history} if bvps and bvps > 0 and history else None


def _next_earnings(t: yf.Ticker) -> str | None:
    cal = _safe(lambda: t.calendar) or {}
    dates = cal.get("Earnings Date") if isinstance(cal, dict) else None
    if dates:
        return pd.Timestamp(dates[0]).strftime("%Y-%m-%d")
    ed = _safe(lambda: t.get_earnings_dates(limit=8))
    if ed is not None and len(ed):
        future = [d for d in ed.index if d.tz_localize(None) >= pd.Timestamp.now().normalize()]
        if future:
            return min(future).strftime("%Y-%m-%d")
    return None


def trend_backtest(symbol: str) -> dict | None:
    try:
        return json.loads(TREND_BACKTEST_PATH.read_text(encoding="utf-8")).get(symbol)
    except (OSError, ValueError):
        return None


def get_analysis(symbol: str) -> dict:
    def build():
        t = yf.Ticker(symbol)
        closes = _closes_3y(symbol)
        long = _safe(lambda: t.history(period="6y", interval="1d")["Close"].dropna(), pd.Series(dtype=float))
        if len(long):
            long.index = long.index.tz_localize(None).normalize()
        q_income = _safe(lambda: t.quarterly_income_stmt)
        annual = _safe(lambda: t.income_stmt)
        fi = _safe(lambda: t.fast_info) or {}
        currency = _safe(lambda: fi.get("currency"))
        shares = _safe(lambda: _num(fi.get("shares")))
        price = float(closes.iloc[-1])
        eps, source = _eps_inputs(t, q_income, shares)
        annual_eps_s = annual.loc["Diluted EPS"] if annual is not None and "Diluted EPS" in annual.index else pd.Series(dtype=float)
        pes = pe_history(annual_eps_s, long)
        pbr = _safe(lambda: _book_inputs(t, long, shares))
        targets = _safe(lambda: t.analyst_price_targets) or {}
        street = ({k: _num(targets.get(k)) for k in ("low", "median", "mean", "high")}
                  if targets.get("median") else None)
        cf = _safe(lambda: t.quarterly_cashflow)
        ocf_negative = False
        if cf is not None and "Operating Cash Flow" in cf.index:
            ocf = cf.loc["Operating Cash Flow"].sort_index(ascending=False).dropna()
            ocf_negative = len(ocf) >= 4 and float(ocf.iloc[:4].sum()) < 0
        trend = _safe(lambda: trend_signal(closes))
        relative = _safe(lambda: get_relative(symbol))
        note = build_note(price, eps, source, pes, _safe(lambda: margin_trend(q_income)), street,
                          _next_earnings(t), trend, relative, ocf_negative, currency,
                          annual_eps=[float(v) for v in annual_eps_s.dropna()], pbr=pbr)
        return {"symbol": symbol, "asOf": closes.index[-1].strftime("%Y-%m-%d"), **note,
                "trend": trend, "trendBacktest": trend_backtest(symbol)}

    return _cached(f"analysis:{symbol}", 1800, build)
