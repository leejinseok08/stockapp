"""Annual financials straight from regulatory filings, and a Simply Wall St-style snowflake on top.

The owner's rule: fundamentals shown as scores must come from actual filings, not from a data
vendor's summary fields. Sources:
- US: SEC EDGAR XBRL company facts (10-K / 20-F annual values). SEC requires a declared contact in
  the User-Agent, read from SEC_CONTACT.
- KR: DART OpenAPI (사업보고서, 연결재무제표 전체 계정; 배당에 관한 사항), key in DART_API_KEY.
Prices (for PER, PBR, yield) are market data, not filings, and say so.
"""

import io
import json
import logging
import os
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime
from xml.etree import ElementTree

import numpy as np
import pandas as pd

from .market import _cached, _num, get_quote

log = logging.getLogger("stockapp.filings")

FIELDS = ["revenue", "operatingIncome", "netIncome", "eps", "ocf", "capex", "equity", "liabilities",
          "currentAssets", "currentLiabilities", "cash", "debt", "interest", "dps", "dividendsPaid", "shares"]


class FilingsUnavailable(Exception):
    pass


def _get(url: str, headers: dict | None = None, timeout: int = 30) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        # SEC answers 403 "Undeclared Automated Tool" when it doesn't accept the declared contact
        # (naver.com addresses are refused; other domains pass).
        if e.code == 403 and "sec.gov" in url:
            raise FilingsUnavailable("SEC가 연락처 이메일을 거부함 (SEC_CONTACT를 다른 도메인으로)") from e
        raise


# ---- SEC (US) ------------------------------------------------------------------------------------

SEC_TAGS = {
    "revenue": ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"],
    "operatingIncome": ["OperatingIncomeLoss"],
    "netIncome": ["NetIncomeLoss"],
    "eps": ["EarningsPerShareDiluted", "EarningsPerShareBasic"],
    "ocf": ["NetCashProvidedByUsedInOperatingActivities"],
    "capex": ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"],
    "equity": ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
    "liabilities": ["Liabilities"],
    "currentAssets": ["AssetsCurrent"],
    "currentLiabilities": ["LiabilitiesCurrent"],
    "cash": ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"],
    "debt": ["LongTermDebt", "LongTermDebtNoncurrent", "DebtInstrumentCarryingAmount"],
    "interest": ["InterestExpense", "InterestExpenseNonoperating"],
    "dps": ["CommonStockDividendsPerShareDeclared", "CommonStockDividendsPerShareCashPaid"],
    "dividendsPaid": ["PaymentsOfDividends", "PaymentsOfDividendsCommonStock"],
    "shares": ["WeightedAverageNumberOfDilutedSharesOutstanding"],
}


def _sec_headers() -> dict:
    contact = os.getenv("SEC_CONTACT")
    if not contact:
        raise FilingsUnavailable("SEC_CONTACT 미설정")
    return {"User-Agent": f"StockApp personal research {contact}", "Accept-Encoding": "identity"}


def _sec_cik(symbol: str) -> str:
    def fetch():
        data = json.loads(_get("https://www.sec.gov/files/company_tickers.json", _sec_headers()))
        return {v["ticker"].upper(): str(v["cik_str"]).zfill(10) for v in data.values()}

    table = _cached("sec:tickers", 7 * 24 * 3600, fetch)
    cik = table.get(symbol.upper().replace(".", "-")) or table.get(symbol.upper())
    if not cik:
        raise FilingsUnavailable(f"SEC에 {symbol} 없음")
    return cik


def sec_annual(facts: dict) -> dict[int, dict]:
    """Per fiscal year from a companyfacts document: annual-report values only (10-K/20-F, full
    year), deduplicated to the latest filing for each period end."""
    gaap = facts.get("facts", {}).get("us-gaap", {})
    out: dict[int, dict] = {}
    for field, tags in SEC_TAGS.items():
        for tag in tags:
            units = gaap.get(tag, {}).get("units", {})
            rows = next(iter(units.values()), None) if units else None
            if not rows:
                continue
            picked: dict[str, dict] = {}
            for r in rows:
                if r.get("form") not in ("10-K", "20-F", "10-K/A") or r.get("fp") != "FY":
                    continue
                if "start" in r:  # flows: keep full-year durations only
                    days = (pd.Timestamp(r["end"]) - pd.Timestamp(r["start"])).days
                    if not 350 <= days <= 380:
                        continue
                prev = picked.get(r["end"])
                if prev is None or r.get("filed", "") > prev.get("filed", ""):
                    picked[r["end"]] = r
            if not picked:
                continue
            for end, r in picked.items():
                year = pd.Timestamp(end).year
                slot = out.setdefault(year, {"periodEnd": end, "filed": r.get("filed"), "form": r.get("form")})
                slot.setdefault(field, float(r["val"]))
            break
    return out


def sec_financials(symbol: str) -> dict:
    def fetch():
        cik = _sec_cik(symbol)
        facts = json.loads(_get(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json", _sec_headers(), 60))
        years = sec_annual(facts)
        return {"source": "SEC EDGAR 10-K (XBRL)", "currency": "USD", "entity": facts.get("entityName"),
                "url": f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}&type=10-K",
                "years": {y: years[y] for y in sorted(years)[-6:]}}

    return _cached(f"sec:{symbol}", 24 * 3600, fetch)


# ---- DART (KR) -----------------------------------------------------------------------------------

DART = "https://opendart.fss.or.kr/api"
DART_ACCOUNTS = {
    "revenue": ["ifrs-full_Revenue"],
    "operatingIncome": ["dart_OperatingIncomeLoss"],
    "netIncome": ["ifrs-full_ProfitLossAttributableToOwnersOfParent", "ifrs-full_ProfitLoss"],
    "eps": ["ifrs-full_DilutedEarningsLossPerShare", "ifrs-full_BasicEarningsLossPerShare"],
    "ocf": ["ifrs-full_CashFlowsFromUsedInOperatingActivities"],
    "capex": ["ifrs-full_PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities"],
    "equity": ["ifrs-full_EquityAttributableToOwnersOfParent", "ifrs-full_Equity"],
    "liabilities": ["ifrs-full_Liabilities"],
    "currentAssets": ["ifrs-full_CurrentAssets"],
    "currentLiabilities": ["ifrs-full_CurrentLiabilities"],
    "cash": ["ifrs-full_CashAndCashEquivalents"],
    # Interest actually paid (cash flow statement) first: 금융비용 also carries FX losses.
    "interest": ["ifrs-full_InterestPaidClassifiedAsOperatingActivities", "ifrs-full_InterestPaidClassifiedAsFinancingActivities",
                 "ifrs-full_InterestExpense", "ifrs-full_FinanceCosts"],
    "dividendsPaid": ["ifrs-full_DividendsPaidClassifiedAsFinancingActivities"],
}


def _dart_key() -> str:
    key = os.getenv("DART_API_KEY")
    if not key:
        raise FilingsUnavailable("DART_API_KEY 미설정")
    return key


def dart_corp_code(stock_code: str) -> str:
    def fetch():
        raw = _get(f"{DART}/corpCode.xml?crtfc_key={_dart_key()}", timeout=60)
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            root = ElementTree.fromstring(z.read(z.namelist()[0]))
        return {e.findtext("stock_code").strip(): e.findtext("corp_code")
                for e in root.iter("list") if (e.findtext("stock_code") or "").strip()}

    table = _cached("dart:corpcodes", 7 * 24 * 3600, fetch)
    if stock_code not in table:
        raise FilingsUnavailable(f"DART에 {stock_code} 없음")
    return table[stock_code]


def _amount(s) -> float | None:
    if s in (None, "", "-"):
        return None
    try:
        return float(str(s).replace(",", ""))
    except ValueError:
        return None


def dart_rows_to_years(rows: list[dict], year: int) -> dict[int, dict]:
    """One 사업보고서 carries this year, last year and the year before (thstrm/frmtrm/bfefrmtrm)."""
    out: dict[int, dict] = {}
    by_id = {}
    for r in rows:
        by_id.setdefault(r.get("account_id"), r)
    cols = ((0, "thstrm_amount"), (1, "frmtrm_amount"), (2, "bfefrmtrm_amount"))
    for field, ids in DART_ACCOUNTS.items():
        r = next((by_id[i] for i in ids if i in by_id), None)
        if not r:
            continue
        for offset, col in cols:
            v = _amount(r.get(col))
            if v is not None:
                out.setdefault(year - offset, {}).setdefault(field, abs(v) if field == "interest" else v)
    # Borrowings are split over many company-specific accounts (단기차입금, 장기차입금, 사채, 유동성장기부채 ...):
    # sum the balance-sheet lines named that way.
    debt_rows = [r for r in rows if r.get("sj_div") == "BS" and any(w in (r.get("account_nm") or "") for w in ("차입금", "사채", "장기부채"))
                 and not any(w in (r.get("account_nm") or "") for w in ("할인", "상환", "충당"))]
    for offset, col in cols:
        vals = [_amount(r.get(col)) for r in debt_rows]
        vals = [v for v in vals if v is not None]
        if vals:
            out.setdefault(year - offset, {})["debt"] = sum(vals)
    return out


def dart_financials(symbol: str) -> dict:
    stock_code = symbol.split(".")[0]

    def fetch():
        key = _dart_key()
        corp = dart_corp_code(stock_code)
        this_year = datetime.now().year
        years: dict[int, dict] = {}
        found = 0
        # Each 사업보고서 covers three years, so reports three years apart give six years.
        tried: set[int] = set()
        candidates = list(range(this_year - 1, this_year - 9, -1))
        for y in candidates:
            if found >= 2:
                break
            if any(abs(y - t) < 3 for t in tried if years.get(t)):
                continue
            q = urllib.parse.urlencode({"crtfc_key": key, "corp_code": corp, "bsns_year": y, "reprt_code": "11011", "fs_div": "CFS"})
            d = json.loads(_get(f"{DART}/fnlttSinglAcntAll.json?{q}"))
            if d.get("status") != "000":
                continue
            found += 1
            tried.add(y)
            for yr, vals in dart_rows_to_years(d.get("list", []), y).items():
                slot = years.setdefault(yr, {"periodEnd": f"{yr}-12-31", "form": "사업보고서"})
                for k, v in vals.items():
                    slot.setdefault(k, v)
            # 배당에 관한 사항: 보통주 주당 현금배당금, three years per report
            qa = urllib.parse.urlencode({"crtfc_key": key, "corp_code": corp, "bsns_year": y, "reprt_code": "11011"})
            a = json.loads(_get(f"{DART}/alotMatter.json?{qa}"))
            for r in a.get("list", []) if a.get("status") == "000" else []:
                if "주당 현금배당금" in (r.get("se") or "") and "보통" in (r.get("stock_knd") or "보통"):
                    for offset, col in ((0, "thstrm"), (1, "frmtrm"), (2, "lwfr")):
                        v = _amount(r.get(col))
                        if v is not None:
                            years.setdefault(y - offset, {"periodEnd": f"{y - offset}-12-31"}).setdefault("dps", v)
        if not years:
            raise FilingsUnavailable("DART 사업보고서 없음")
        for yr, v in years.items():
            if v.get("netIncome") and v.get("eps"):
                v.setdefault("shares", v["netIncome"] / v["eps"])
        return {"source": "DART 사업보고서 (연결)", "currency": "KRW",
                "url": f"https://dart.fss.or.kr/dsab007/main.do?option=corp&textCrpCik={corp}",
                "years": {y: years[y] for y in sorted(years)[-6:]}}

    return _cached(f"dart:{symbol}", 24 * 3600, fetch)


def get_financials(symbol: str) -> dict:
    if symbol.endswith((".KS", ".KQ")):
        return dart_financials(symbol)
    return sec_financials(symbol)


def dart_disclosures(symbol: str, days: int = 90) -> list[dict]:
    """Recent DART filings for a Korean listing (title, date, link)."""
    def fetch():
        corp = dart_corp_code(symbol.split(".")[0])
        end = datetime.now()
        q = urllib.parse.urlencode({"crtfc_key": _dart_key(), "corp_code": corp, "page_count": 20,
                                    "bgn_de": (end - pd.Timedelta(days=days)).strftime("%Y%m%d"), "end_de": end.strftime("%Y%m%d")})
        d = json.loads(_get(f"{DART}/list.json?{q}"))
        return [{"title": r["report_nm"].strip(), "date": f"{r['rcept_dt'][:4]}-{r['rcept_dt'][4:6]}-{r['rcept_dt'][6:]}",
                 "filer": r.get("flr_nm"), "url": f"https://dart.fss.or.kr/dsaf001/main.do?rcpNo={r['rcept_no']}"}
                for r in d.get("list", [])] if d.get("status") == "000" else []

    return _cached(f"dartlist:{symbol}", 3600, fetch)


# ---- snowflake -----------------------------------------------------------------------------------

def _cagr(first, last, years):
    if first is None or last is None or first <= 0 or last <= 0 or years <= 0:
        return None
    return (last / first) ** (1 / years) - 1


def _check(label, ok, detail):
    return {"label": label, "pass": None if ok is None else bool(ok), "detail": detail}


def _pct(v):
    return "-" if v is None else f"{v * 100:.1f}%"


def _x(v):
    return "-" if v is None else f"{v:.1f}배"


def _money(v, currency):
    if v is None:
        return "-"
    a = abs(v)
    if currency == "KRW":
        return f"{v / 1e12:.1f}조" if a >= 1e12 else f"{v / 1e8:,.0f}억"
    return f"${v / 1e9:.1f}B" if a >= 1e9 else f"${v / 1e6:,.0f}M"


def snowflake(fin: dict, price: float, fy_prices: dict[int, float]) -> dict:
    """Five axes x six pass/fail checks (0-6 each), Simply Wall St style, from annual filings.
    SWS's 'Future' axis needs forecasts, which filings don't have; it is replaced by 최근 성장,
    measured from the latest reports. Checks without data count as not passed and say so."""
    ys = sorted(fin["years"])
    Y = {y: fin["years"][y] for y in ys}
    last = Y[ys[-1]]
    prev = Y[ys[-2]] if len(ys) > 1 else {}
    first = Y[ys[0]]
    n = ys[-1] - ys[0]
    g = lambda d, k: d.get(k)  # noqa: E731
    eps, shares = g(last, "eps"), g(last, "shares")
    mcap = price * shares if shares else None
    per = price / eps if eps and eps > 0 else None
    bvps = last["equity"] / shares if g(last, "equity") and shares else None
    pbr = price / bvps if bvps and bvps > 0 else None
    psr = mcap / last["revenue"] if mcap and g(last, "revenue") else None
    fcf = (g(last, "ocf") or 0) - (g(last, "capex") or 0) if g(last, "ocf") is not None else None

    def hist(metric):
        vals = []
        for y in ys:
            p, d = fy_prices.get(y), Y[y]
            sh = d.get("shares")
            if not p:
                continue
            if metric == "per" and d.get("eps") and d["eps"] > 0:
                vals.append(p / d["eps"])
            if metric == "pbr" and d.get("equity") and sh:
                vals.append(p / (d["equity"] / sh))
            if metric == "psr" and d.get("revenue") and sh:
                vals.append(p * sh / d["revenue"])
        return float(np.median(vals)) if vals else None

    per_med, pbr_med, psr_med = hist("per"), hist("pbr"), hist("psr")
    eps_cagr = _cagr(g(first, "eps"), eps, n)
    rev_cagr3 = _cagr(Y[ys[-4]].get("revenue") if len(ys) >= 4 else None, g(last, "revenue"), 3)
    peg = per / (eps_cagr * 100) if per and eps_cagr and eps_cagr > 0 else None
    growth = lambda k: (last[k] / prev[k] - 1) if g(last, k) and g(prev, k) and prev[k] > 0 else None  # noqa: E731
    margin = lambda d: d["operatingIncome"] / d["revenue"] if d.get("operatingIncome") is not None and d.get("revenue") else None  # noqa: E731
    roe = last["netIncome"] / last["equity"] if g(last, "netIncome") is not None and g(last, "equity") else None
    net_margin = last["netIncome"] / last["revenue"] if g(last, "netIncome") is not None and g(last, "revenue") else None
    de = last["liabilities"] / last["equity"] if g(last, "liabilities") and g(last, "equity") else None
    cur = last["currentAssets"] / last["currentLiabilities"] if g(last, "currentAssets") and g(last, "currentLiabilities") else None
    debt = g(last, "debt")
    cover = last["operatingIncome"] / last["interest"] if g(last, "operatingIncome") and g(last, "interest") else None
    dps = g(last, "dps")
    dps_hist = [Y[y].get("dps") for y in ys if Y[y].get("dps") is not None]
    yld = dps / price if dps and price else None
    payout = dps / eps if dps and eps and eps > 0 else None
    cash_payout = (g(last, "dividendsPaid") or 0) / fcf if fcf and fcf > 0 and g(last, "dividendsPaid") else None
    eps_hist = [Y[y].get("eps") for y in ys if Y[y].get("eps") is not None]
    ni_hist = [Y[y].get("netIncome") for y in ys if Y[y].get("netIncome") is not None]
    last_eps_g = growth("eps")

    axes = {
        "value": ("가치", [
            _check("PER이 과거 중앙값보다 낮음", per < per_med if per and per_med else None, f"{_x(per)} vs {_x(per_med)}"),
            _check("PBR이 과거 중앙값보다 낮음", pbr < pbr_med if pbr and pbr_med else None, f"{_x(pbr)} vs {_x(pbr_med)}"),
            _check("PSR이 과거 중앙값보다 낮음", psr < psr_med if psr and psr_med else None, f"{_x(psr)} vs {_x(psr_med)}"),
            _check("PEG 1 미만", peg < 1 if peg else None, "-" if peg is None else f"{peg:.2f}"),
            _check("잉여현금흐름 수익률 3% 이상", fcf / mcap > 0.03 if fcf is not None and mcap else None, _pct(fcf / mcap) if fcf is not None and mcap else "-"),
            _check("이익수익률(1/PER) 5% 이상", 1 / per > 0.05 if per else None, _pct(1 / per) if per else "-"),
        ]),
        "growth": ("최근 성장", [
            _check("최근 연도 매출 증가", growth("revenue") > 0 if growth("revenue") is not None else None, _pct(growth("revenue"))),
            _check("매출 증가율 10% 이상", growth("revenue") > 0.1 if growth("revenue") is not None else None, _pct(growth("revenue"))),
            _check("영업이익 증가", growth("operatingIncome") > 0 if growth("operatingIncome") is not None else None, _pct(growth("operatingIncome"))),
            _check("EPS 증가율 10% 이상", last_eps_g > 0.1 if last_eps_g is not None else None, _pct(last_eps_g)),
            _check("영업이익률 개선", margin(last) > margin(prev) if margin(last) is not None and margin(prev) is not None else None,
                   f"{_pct(margin(prev))} → {_pct(margin(last))}"),
            _check("3년 매출 연성장률 10% 이상", rev_cagr3 > 0.1 if rev_cagr3 is not None else None, _pct(rev_cagr3)),
        ]),
        "past": ("과거 실적", [
            _check(f"{n}년 EPS 연성장", eps_cagr > 0 if eps_cagr is not None else None, _pct(eps_cagr)),
            _check("최근 EPS 성장이 장기 평균보다 빠름", last_eps_g > eps_cagr if last_eps_g is not None and eps_cagr is not None else None,
                   f"{_pct(last_eps_g)} vs {_pct(eps_cagr)}"),
            _check("ROE 20% 이상", roe > 0.2 if roe is not None else None, _pct(roe)),
            _check("순이익률 10% 이상", net_margin > 0.1 if net_margin is not None else None, _pct(net_margin)),
            _check(f"최근 {len(ni_hist)}년 모두 흑자", all(v > 0 for v in ni_hist) if ni_hist else None, f"{sum(v > 0 for v in ni_hist)}/{len(ni_hist)}년"),
            _check("영업현금흐름이 순이익 이상", last["ocf"] >= last["netIncome"] if g(last, "ocf") is not None and g(last, "netIncome") is not None else None,
                   "이익의 질"),
        ]),
        "health": ("재무 건전성", [
            _check("부채비율 100% 미만", de < 1 if de is not None else None, _pct(de)),
            _check("유동비율 1 이상", cur >= 1 if cur is not None else None, _x(cur)),
            _check("현금이 장기차입금 이상", g(last, "cash") >= debt if g(last, "cash") is not None and debt is not None else (True if debt is None and g(last, "cash") else None),
                   "차입금 공시 없음" if debt is None else f"현금 {_money(g(last, 'cash'), fin['currency'])} / 차입 {_money(debt, fin['currency'])}"),
            _check("영업현금흐름이 차입금의 20% 이상", last["ocf"] >= 0.2 * debt if g(last, "ocf") is not None and debt else (True if debt is None and g(last, "ocf") else None),
                   f"{_money(g(last, 'ocf'), fin['currency'])} / {_money(debt, fin['currency'])}"),
            _check("이자보상배율 5배 이상", cover >= 5 if cover is not None else None, _x(cover)),
            _check("부채비율이 과거보다 개선", de < first["liabilities"] / first["equity"] if de is not None and first.get("liabilities") and first.get("equity") else None,
                   f"{_pct(first['liabilities'] / first['equity']) if first.get('liabilities') and first.get('equity') else '-'} → {_pct(de)}"),
        ]),
        "dividend": ("배당", [
            _check("배당 지급", dps is not None and dps > 0 if dps is not None else False, "-" if dps is None else f"주당 {dps:,.2f}"),
            _check("배당수익률 1.5% 이상", yld > 0.015 if yld is not None else False, _pct(yld)),
            _check("배당성향 75% 미만", payout < 0.75 if payout is not None else None, _pct(payout)),
            _check("배당금이 잉여현금흐름으로 충당", cash_payout < 0.9 if cash_payout is not None else None, _pct(cash_payout)),
            _check("배당 삭감 없음", all(b >= a for a, b in zip(dps_hist, dps_hist[1:])) if len(dps_hist) >= 3 else None, f"{len(dps_hist)}년 기록"),
            _check("배당 증가", dps_hist[-1] > dps_hist[0] if len(dps_hist) >= 3 else None, "-"),
        ]),
    }
    out = {k: {"label": lab, "score": sum(1 for c in checks if c["pass"]), "checks": checks} for k, (lab, checks) in axes.items()}
    return {"axes": out, "total": sum(a["score"] for a in out.values()),
            "metrics": {"per": per, "pbr": pbr, "psr": psr, "roe": roe, "netMargin": net_margin, "opMargin": margin(last),
                        "debtToEquity": de, "currentRatio": cur, "dividendYield": yld, "payout": payout, "marketCap": mcap}}


def get_snowflake(symbol: str) -> dict:
    def build():
        fin = get_financials(symbol)
        import yfinance as yf

        closes = yf.Ticker(symbol).history(period="7y", interval="1mo")["Close"].dropna()
        closes.index = closes.index.tz_localize(None)
        fy_prices = {}
        for y, d in fin["years"].items():
            end = pd.Timestamp(d.get("periodEnd") or f"{y}-12-31")
            window = closes[(closes.index > end - pd.DateOffset(years=1)) & (closes.index <= end)]
            if len(window):
                fy_prices[y] = float(window.mean())
        price = (get_quote(symbol) or {}).get("price") or float(closes.iloc[-1])
        sf = snowflake(fin, price, fy_prices)
        years = [{"year": y, **{k: fin["years"][y].get(k) for k in FIELDS}, "periodEnd": fin["years"][y].get("periodEnd"),
                  "form": fin["years"][y].get("form")} for y in sorted(fin["years"])]
        return {"symbol": symbol, "available": True, "source": fin["source"], "sourceUrl": fin["url"],
                "currency": fin["currency"], "price": price, "priceSource": "시세(시장 데이터)", **sf, "years": years}

    # Failures aren't cached, so a blocked or slow filing source is retried on the next open.
    try:
        return _cached(f"snowflake:{symbol}", 6 * 3600, build)
    except FilingsUnavailable as e:
        return {"symbol": symbol, "available": False, "reason": str(e)}
    except Exception as e:
        log.warning("snowflake %s failed: %s", symbol, e)
        return {"symbol": symbol, "available": False, "reason": "공시 데이터를 불러오지 못했어요"}
