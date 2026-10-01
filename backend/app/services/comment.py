"""종목 코멘트: the AI Berkshire value-investing checks (github.com/xbtlin/ai-berkshire, MIT) applied to
any listing the owner searches.

Two layers, so the comment never costs money (CLAUDE.md rule: no paid service, and an LLM API is one):
- Numbers, computed on every search from filed annual reports (filings.py: DART / SEC 10-K) plus the
  research note (analysis.py): AI Berkshire's `/quality-screen` (7 hard metrics + exemptions A-C) and
  the measurable gates of `/investment-checklist` (좋은 사업, 안전마진, 결정 규율, 즉시 기각). Four
  one-line takes, one per master, are written from those numbers.
- Judgment (능력권, 해자, 경영진, 거울 테스트), which needs reading and can't be computed: written by
  Claude Code / Codex on request following tools/comment/PROMPT.md, validated with
  `python -m app.services.comment check <file>`, committed to app/data/comments/<SYMBOL>.json. Read
  from GitHub main like the 시황 (outlook.py), so a note shows up without a redeploy.
Context only, not an order: the app's buy/sell signals stay the trend rule (stockscan.py).
"""

import json
import logging
import os
import re
import sys
import urllib.request
from pathlib import Path

import numpy as np

from .market import _cached

log = logging.getLogger("stockapp.comment")

DIR = Path(__file__).resolve().parent.parent / "data" / "comments"
REPO = os.getenv("OUTLOOK_REPO", "leejinseok08/stockapp")
LIST_URL = f"https://api.github.com/repos/{REPO}/contents/backend/app/data/comments?ref=main"
LIST_TTL = 300

VERDICTS = ("통과", "회색지대", "미통과")
GATES = {"competence": "능력권", "moat": "해자", "management": "경영진"}
MASTERS = {"dyp": "돤융핑", "buffett": "버핏", "munger": "멍거", "lilu": "리루"}
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


# ---- quality screen (/quality-screen) ------------------------------------------------------------

def _ratio(a, b):
    return a / b if a is not None and b not in (None, 0) else None


def _mean(vals):
    vals = [v for v in vals if v is not None]
    return float(np.mean(vals)) if vals else None


def _pct(v):
    return "-" if v is None else f"{v * 100:.1f}%"


def _metric(key, label, rule, value, ok, detail):
    """ok: True pass / False fail / None 데이터 부족 (the skill: missing data is never a pass or a fail)."""
    return {"key": key, "label": label, "rule": rule, "value": value, "pass": ok, "detail": detail, "exempt": None}


def quality_screen(fin: dict) -> dict:
    """AI Berkshire's 7 hard metrics on the filed years (up to six, so '10년' becomes the window we have
    and says so). Exemptions: A (ROE, investment phase), B (net margin, chosen low margin), C (gross and
    net margin, high-turnover model); C's business-model condition can't be read from numbers, so the
    exemption is marked as needing that check."""
    ys = sorted(fin["years"])
    Y = [fin["years"][y] for y in ys]
    n = len(ys)
    last5 = Y[-5:]
    roes = [_ratio(d.get("netIncome"), d.get("equity")) for d in Y if (d.get("equity") or 0) > 0]
    roe = _mean(roes)
    fcfs = [d["ocf"] - (d.get("capex") or 0) for d in last5 if d.get("ocf") is not None]
    fcf_sum = sum(fcfs) if fcfs else None
    last = Y[-1]
    interest, op = last.get("interest"), last.get("operatingIncome")
    cover = op / interest if op is not None and interest else None
    gms = [_ratio(d.get("grossProfit"), d.get("revenue")) for d in Y]
    gm = _mean(gms)
    ocf_ni = _mean([d["ocf"] / d["netIncome"] for d in last5 if d.get("ocf") is not None and (d.get("netIncome") or 0) > 0])
    nms = [_ratio(d.get("netIncome"), d.get("revenue")) for d in Y]
    nm = _mean(nms)
    sh = [(y, d.get("shares")) for y, d in zip(ys, Y) if d.get("shares")]
    sh = sh[-6:]  # five years of change at most
    dil = sh[-1][1] / sh[0][1] - 1 if len(sh) >= 2 else None
    win = f"{n}년" if n else "-"

    if cover is None and not interest and not last.get("debt"):
        cover_ok, cover_detail = True, "차입·이자비용 공시 없음"
    else:
        cover_ok, cover_detail = (cover >= 2 if cover is not None else None), "-" if cover is None else f"{cover:.1f}배"
    metrics = [
        _metric("roe", f"{win} 평균 ROE", "8% 이상", roe, roe >= 0.08 if roe is not None else None, _pct(roe)),
        _metric("fcf", f"최근 {len(fcfs)}년 누적 잉여현금흐름", "플러스", fcf_sum, fcf_sum > 0 if fcf_sum is not None else None,
                "-" if fcf_sum is None else ("플러스" if fcf_sum > 0 else "마이너스")),
        _metric("cover", "이자보상배율 (영업이익/이자)", "2배 이상", cover, cover_ok, cover_detail),
        _metric("gross", f"{win} 평균 매출총이익률", "15% 이상", gm, gm >= 0.15 if gm is not None else None,
                _pct(gm) if gm is not None else "매출총이익 공시 없음"),
        _metric("ocfni", "영업현금흐름/순이익 (5년 평균)", "0.7 이상", ocf_ni, ocf_ni >= 0.7 if ocf_ni is not None else None,
                "-" if ocf_ni is None else f"{ocf_ni:.2f}"),
        _metric("net", f"{win} 평균 순이익률", "5% 이상", nm, nm >= 0.05 if nm is not None else None, _pct(nm)),
        _metric("dilution", f"{(sh[-1][0] - sh[0][0]) if len(sh) >= 2 else '-'}년 주식 수 증가", "20% 이하", dil,
                dil <= 0.2 if dil is not None else None, _pct(dil)),
    ]
    m = {x["key"]: x for x in metrics}
    recent_ocf = [d.get("ocf") for d in Y[-2:]]
    recent_nm = [v for v in nms[-2:] if v is not None]

    # A: 투자기 — the skill also asks for listing under 10 years; filings don't carry the listing date,
    # so the two numeric conditions are required and the age is left to the reader.
    if m["roe"]["pass"] is False and gm is not None and gm > 0.3 and all(v is not None and v > 0 for v in recent_ocf):
        m["roe"]["exempt"] = "A 투자기: 총이익률 30% 초과, 최근 2년 영업현금흐름 플러스 (상장 10년 미만인지 확인)"
    if m["net"]["pass"] is False and gm is not None and gm > 0.3 and (
            (recent_nm and min(recent_nm) >= 0.05) or (len(nms) >= 3 and None not in nms[-3:] and nms[-1] > nms[-2] > nms[-3])):
        m["net"]["exempt"] = "B 의도된 저마진: 총이익률 30% 초과, 순이익률 회복·상승 중"
    if (m["gross"]["pass"] is False or m["net"]["pass"] is False) and roe is not None and roe > 0.2 and ocf_ni is not None and ocf_ni > 1:
        for k in ("gross", "net"):
            if m[k]["pass"] is False and not m[k]["exempt"]:
                m[k]["exempt"] = "C 고회전 박리: ROE 20% 초과, 현금흐름/순이익 1 초과 (회원제·플랫폼·고회전 모델인지 확인)"

    failed = [x for x in metrics if x["pass"] is False and not x["exempt"]]
    exempted = [x for x in metrics if x["pass"] is False and x["exempt"]]
    missing = [x for x in metrics if x["pass"] is None]
    if failed:
        result = "탈락"
    elif len(missing) >= 3:
        result = "판단 보류"
    elif exempted:
        result = "예외 통과"
    else:
        result = "통과"
    return {"result": result, "metrics": metrics, "years": n, "failed": [x["label"] for x in failed],
            "missing": [x["label"] for x in missing]}


# ---- checklist gates (/investment-checklist) -----------------------------------------------------

def good_business(fin: dict) -> dict:
    """Gate 2: ROE 5y > 15%, gross margin > 40%, FCF positive and near net income, light capex,
    interest-bearing debt under 3 years of net income. Stars = criteria met (5 needs ROE > 25%)."""
    Y = [fin["years"][y] for y in sorted(fin["years"])][-5:]
    roe = _mean([_ratio(d.get("netIncome"), d.get("equity")) for d in Y if (d.get("equity") or 0) > 0])
    gm = _mean([_ratio(d.get("grossProfit"), d.get("revenue")) for d in Y])
    fcf = sum(d["ocf"] - (d.get("capex") or 0) for d in Y if d.get("ocf") is not None) if any(d.get("ocf") is not None for d in Y) else None
    ni = sum(d.get("netIncome") or 0 for d in Y)
    capex = _mean([_ratio(d.get("capex"), d.get("ocf")) for d in Y if (d.get("ocf") or 0) > 0])
    last = Y[-1]
    debt_years = _ratio(last.get("debt") or 0, last.get("netIncome")) if (last.get("netIncome") or 0) > 0 else None
    checks = [
        {"label": "ROE 5년 평균 15% 초과", "pass": roe > 0.15 if roe is not None else None, "detail": _pct(roe)},
        {"label": "매출총이익률 40% 초과 (가격 결정력)", "pass": gm > 0.4 if gm is not None else None, "detail": _pct(gm)},
        {"label": "잉여현금흐름 플러스, 순이익의 70% 이상", "pass": (fcf > 0 and fcf >= 0.7 * ni) if fcf is not None and ni > 0 else None,
         "detail": "-" if fcf is None or ni <= 0 else f"순이익의 {fcf / ni * 100:.0f}%"},
        {"label": "설비투자가 영업현금흐름의 50% 미만 (경자산)", "pass": capex < 0.5 if capex is not None else None, "detail": _pct(capex)},
        {"label": "차입금이 순이익 3년치 미만", "pass": debt_years < 3 if debt_years is not None else None,
         "detail": "-" if debt_years is None else f"{debt_years:.1f}년치"},
    ]
    met = sum(1 for c in checks if c["pass"])
    known = sum(1 for c in checks if c["pass"] is not None)
    stars = None if known < 3 else (5 if met == 5 and roe and roe > 0.25 else max(1, min(met, 4)))
    return {"stars": stars, "checks": checks}


def margin_of_safety(note: dict | None) -> dict:
    """Gate 5 from the research note's base case (analysis.scenarios): price at <=50% of value 5,
    <=70% 4, around fair 3, dear 2, far too dear 1."""
    sc = (note or {}).get("scenarios")
    if not sc:
        return {"stars": None, "detail": "목표가를 계산할 이익 기록이 부족해요", "base": None}
    up = sc["base"]["upside"]
    ratio = 1 / (1 + up) if up > -1 else None  # price as a share of the base value
    stars = 5 if ratio and ratio <= 0.5 else 4 if ratio and ratio <= 0.7 else 3 if up >= -0.1 else 2 if up >= -0.3 else 1
    detail = f"기본 시나리오 가치의 {ratio * 100:.0f}% 가격" if ratio else "-"
    return {"stars": stars, "detail": detail, "base": sc["base"], "bear": sc["bear"], "bull": sc["bull"]}


def discipline(closes) -> dict:
    """Gate 6: is the urge to buy FOMO? Flags a 1-year run-up over 50% or a price within 5% of the
    52-week high."""
    if closes is None or len(closes) < 200:
        return {"flags": [], "ret1y": None, "fromHigh": None}
    last = float(closes.iloc[-1])
    ret = last / float(closes.iloc[-min(len(closes), 252)]) - 1
    high = float(closes.iloc[-252:].max())
    from_high = last / high - 1
    flags = []
    if ret > 0.5:
        flags.append(f"1년 {ret * 100:.0f}% 상승: '최근 많이 올라서' 사는 건 아닌지")
    if from_high > -0.05:
        flags.append("52주 고점 근처: 남들이 다 사는 자리인지")
    return {"flags": flags, "ret1y": ret, "fromHigh": from_high}


def quick_veto(fin: dict) -> list[str]:
    """The checklist's instant rejections that numbers can decide."""
    Y = [fin["years"][y] for y in sorted(fin["years"])]
    fcfs = [d["ocf"] - (d.get("capex") or 0) for d in Y if d.get("ocf") is not None]
    out = []
    if len(fcfs) >= 3 and all(v < 0 for v in fcfs[-3:]) and not fcfs[-1] > fcfs[-2] > fcfs[-3]:
        out.append("3년 연속 잉여현금흐름 마이너스, 개선 흐름도 없음")
    return out


def richness(fin: dict, qs: dict) -> dict:
    """정보 풍부도 A/B/C: how much of the screen rests on filed numbers."""
    known = 7 - len(qs["missing"])
    grade = "A" if qs["years"] >= 5 and known >= 6 else "B" if qs["years"] >= 3 and known >= 4 else "C"
    text = {"A": "공시 기록이 충분해요. 지표가 선명할수록 '모두가 아는 이야기'인지 의심하세요",
            "B": "기록이 일부 비어 있어요. 빈 칸은 통과도 탈락도 아니에요",
            "C": "기록이 부족해요. '자료가 적음'과 '이해할 수 없음'을 혼동하지 마세요"}[grade]
    return {"grade": grade, "text": text}


# ---- four takes from the numbers -----------------------------------------------------------------

def masters(qs: dict, biz: dict, mos: dict, fin: dict) -> list[dict]:
    m = {x["key"]: x for x in qs["metrics"]}
    gm, roe = m["gross"]["value"], m["roe"]["value"]
    ys = sorted(fin["years"])
    Y = [fin["years"][y] for y in ys]
    profit_years = sum(1 for d in Y if (d.get("netIncome") or 0) > 0)
    revs = [(y, d.get("revenue")) for y, d in zip(ys, Y) if d.get("revenue")]
    cagr = (revs[-1][1] / revs[0][1]) ** (1 / (revs[-1][0] - revs[0][0])) - 1 if len(revs) >= 2 and revs[0][1] > 0 and revs[-1][0] > revs[0][0] else None

    # 돤융핑 — 사업의 본질: does the business itself earn well?
    if gm is not None and gm > 0.4 and roe is not None and roe > 0.15:
        dyp = f"총이익률 {_pct(gm)}, ROE {_pct(roe)}. 가격을 정할 수 있는 좋은 사업의 숫자예요"
    elif roe is not None and roe > 0.15:
        dyp = f"ROE {_pct(roe)}로 자본은 잘 굴리지만 마진은 평범해요. 무엇으로 돈을 버는지 한 문장으로 말할 수 있어야 해요"
    elif roe is not None:
        dyp = f"ROE {_pct(roe)}. 숫자로는 아직 '좋은 사업'이라 하기 어려워요"
    else:
        dyp = "수익성 기록이 부족해 사업의 질을 숫자로 말하기 어려워요"

    # 버핏 — 가격과 안전마진
    if mos["stars"] is None:
        buffett = "이익 기록이 부족해 가치를 계산할 수 없어요. 계산이 안 되면 사지 않아요"
    elif mos["stars"] >= 4:
        buffett = f"{mos['detail']}. 좋은 사업이라면 안전마진이 있는 가격이에요"
    elif mos["stars"] == 3:
        buffett = f"{mos['detail']}. 적정가 근처라 안전마진은 크지 않아요"
    else:
        buffett = f"{mos['detail']}. 좋은 회사도 비싸게 사면 손해예요"

    # 멍거 — 뒤집어 보기: how could this go wrong?
    weak = [x["label"] for x in qs["metrics"] if x["pass"] is False]
    weak += [c["label"] for c in biz["checks"] if c["pass"] is False][:2]
    if weak:
        munger = "망하는 길부터 보면: " + ", ".join(dict.fromkeys(weak[:3])) + " 미달"
    else:
        munger = "재무 숫자에서 망할 길은 안 보여요. 남은 위험은 경쟁과 기술 변화예요"

    # 리루 — 10년 뒤에도 확실한가
    lilu = f"공시 {len(Y)}년 중 {profit_years}년 흑자"
    if cagr is not None:
        lilu += f", 매출 연 {cagr * 100:.1f}% 성장"
    if profit_years < len(Y):
        lilu += ". 적자 해가 있어 10년 확실성은 낮게 봐요"
    elif (cagr or 0) > 0:
        lilu += ". 꾸준함은 확인돼요. 10년 뒤에도 같은 일을 할지는 따로 따져야 해요"
    else:
        lilu += ". 흑자는 꾸준하지만 성장이 멈췄어요. 10년 뒤 더 커질지는 의문이에요"
    return [{"id": "dyp", "name": MASTERS["dyp"], "focus": "사업의 본질", "text": dyp},
            {"id": "buffett", "name": MASTERS["buffett"], "focus": "가격과 안전마진", "text": buffett},
            {"id": "munger", "name": MASTERS["munger"], "focus": "뒤집어 보기", "text": munger},
            {"id": "lilu", "name": MASTERS["lilu"], "focus": "장기 확실성", "text": lilu}]


def verdict(qs: dict, biz: dict, mos: dict, veto: list[str]) -> tuple[str, str]:
    """통과 = worth deep research; 미통과 = a red line; 회색지대 = the reader has to decide. Never a buy
    order: the skill's checklist only screens out bad choices."""
    if veto:
        return "미통과", veto[0]
    if qs["result"] == "탈락":
        return "미통과", f"걸러내기 탈락: {', '.join(qs['failed'][:2])}"
    if qs["result"] in ("통과", "예외 통과") and (biz["stars"] or 0) >= 4 and (mos["stars"] or 0) >= 3:
        return "통과", "좋은 사업이고 가격도 감당할 만해요. 해자·경영진은 직접 확인할 차례예요"
    if qs["result"] == "판단 보류":
        return "회색지대", "공시 기록이 부족해 숫자로 판단할 수 없어요"
    if (mos["stars"] or 0) <= 2:
        return "회색지대", "사업은 걸러내기를 통과했지만 가격이 비싸요"
    return "회색지대", "걸러내기는 통과했지만 '좋은 사업' 기준엔 못 미쳐요"


def build_comment(fin: dict, note: dict | None, closes=None) -> dict:
    qs = quality_screen(fin)
    biz = good_business(fin)
    mos = margin_of_safety(note)
    veto = quick_veto(fin)
    call, why = verdict(qs, biz, mos, veto)
    return {"verdict": call, "verdictReason": why, "richness": richness(fin, qs), "quality": qs,
            "gates": {"business": biz, "safety": mos, "discipline": discipline(closes)}, "veto": veto,
            "masters": masters(qs, biz, mos, fin)}


# ---- written notes (judgment) --------------------------------------------------------------------

SYMBOL = re.compile(r"^[A-Z0-9\-]+(\.(KS|KQ))?$")


def validate(doc: dict) -> list[str]:
    errs = []

    def text(v, where, limit):
        if not isinstance(v, str) or not v.strip():
            errs.append(f"{where}: empty or not text")
        elif len(v) > limit:
            errs.append(f"{where}: {len(v)} chars, keep it under {limit}")

    if not SYMBOL.match(str(doc.get("symbol", ""))):
        errs.append("symbol: app symbol, e.g. NVDA, BRK-B, 005930.KS, 247540.KQ")
    if not DATE.match(str(doc.get("asOf", ""))):
        errs.append("asOf: YYYY-MM-DD")
    if doc.get("author") not in ("claude", "codex"):
        errs.append("author: claude or codex")
    if doc.get("verdict") not in VERDICTS:
        errs.append(f"verdict: one of {VERDICTS}")
    text(doc.get("oneLine"), "oneLine", 80)
    gates = doc.get("gates") or {}
    for k in GATES:
        g = gates.get(k)
        if not isinstance(g, dict):
            errs.append(f"gates.{k}: {{stars, text}}")
            continue
        if g.get("stars") not in (1, 2, 3, 4, 5):
            errs.append(f"gates.{k}.stars: 1-5 (no half stars)")
        text(g.get("text"), f"gates.{k}.text", 200)
    ms = doc.get("masters") or {}
    for k in MASTERS:
        text(ms.get(k), f"masters.{k}", 160)
    risks = doc.get("risks")
    if not isinstance(risks, list) or not 3 <= len(risks) <= 5:
        errs.append("risks: 3 to 5 lines")
    else:
        for i, r in enumerate(risks):
            text(r, f"risks[{i}]", 80)
    mirror = doc.get("mirror")
    if not isinstance(mirror, list) or len(mirror) != 5:
        errs.append("mirror: exactly 5 sentences (business, moat, management, price, downside)")
    else:
        for i, r in enumerate(mirror):
            text(r, f"mirror[{i}]", 120)
    if not isinstance(doc.get("mirrorPass"), bool):
        errs.append("mirrorPass: true or false")
    sources = doc.get("sources")
    if not isinstance(sources, list) or not sources:
        errs.append("sources: at least one")
    else:
        for j, s in enumerate(sources):
            text(s.get("title"), f"sources[{j}].title", 140)
            if not str(s.get("url", "")).startswith("https://"):
                errs.append(f"sources[{j}].url: https link")
            if not DATE.match(str(s.get("date", ""))):
                errs.append(f"sources[{j}].date: YYYY-MM-DD")
    return errs


def _fetch_json(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": "stockapp", "Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _file_name(symbol: str) -> str:
    return f"{symbol}.json"


def written_note(symbol: str) -> dict | None:
    """The newest of the GitHub copy and the deployed copy, or None."""
    docs = []
    try:
        listing = _cached("comments:list", LIST_TTL, lambda: {f["name"]: (f["download_url"], f.get("sha")) for f in _fetch_json(LIST_URL)
                                                               if f.get("name", "").endswith(".json")})
        hit = listing.get(_file_name(symbol))
        if hit:
            url, sha = hit  # the sha changes with each new version of the file
            docs.append(_cached(f"comments:{symbol}:{sha}", 24 * 3600, lambda: _fetch_json(url)))
    except Exception as e:
        log.info("comments from GitHub unavailable: %s", e)
    path = DIR / _file_name(symbol)
    if path.exists():
        try:
            docs.append(json.loads(path.read_text(encoding="utf-8")))
        except ValueError:
            pass
    docs = [d for d in docs if not validate(d)]
    return max(docs, key=lambda d: d["asOf"]) if docs else None


def get_comment(symbol: str) -> dict:
    from .analysis import get_analysis
    from .filings import FilingsUnavailable, get_financials
    from .market import get_history, get_name, get_quote

    def build():
        out = {"symbol": symbol, "name": get_name(symbol)}
        try:
            out["quote"] = get_quote(symbol)
        except Exception:
            out["quote"] = None
        try:
            note = get_analysis(symbol)
        except Exception as e:
            log.info("comment %s: analysis failed: %s", symbol, e)
            note = None
        try:
            import pandas as pd
            hist = get_history(symbol, "1y")
            closes = pd.Series([h["close"] for h in hist if h["close"] is not None]) if hist else None
        except Exception:
            closes = None
        try:
            fin = get_financials(symbol)
        except FilingsUnavailable as e:
            fin, out["reason"] = None, str(e)
        except Exception as e:
            log.warning("comment %s: filings failed: %s", symbol, e)
            fin, out["reason"] = None, "공시 데이터를 불러오지 못했어요"
        if fin and fin.get("years"):
            out.update({"available": True, "source": fin["source"], "sourceUrl": fin["url"], "currency": fin["currency"],
                        "fiscalYears": [int(y) for y in sorted(fin["years"])], **build_comment(fin, note, closes)})
        else:
            out["available"] = False
        out["rating"] = (note or {}).get("rating")
        return out

    # The written note is looked up outside the 30-minute cache, so a new one shows within LIST_TTL.
    return {**_cached(f"comment:{symbol}", 1800, build), "written": written_note(symbol)}


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] != "check":
        sys.exit("usage: python -m app.services.comment check <file.json>")
    path = Path(sys.argv[2])
    doc = json.loads(path.read_text(encoding="utf-8"))
    errors = validate(doc)
    if path.name != _file_name(str(doc.get("symbol"))):
        errors.append(f"file name: must be {_file_name(str(doc.get('symbol')))}")
    if errors:
        print("\n".join(errors))
        sys.exit(1)
    print(f"{path.name}: ok")
