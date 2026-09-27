"""Weekly market view (주간 시황): six houses' research summed up once a week.

The files are written by a scheduled agent (Claude routine, Codex automation as the fallback) that
follows tools/outlook/PROMPT.md, validated with `python -m app.services.outlook check <file>`, and
committed to app/data/outlook/<ISO week>.json. Context only: never a buy/sell call (the backtests
in docs/signal-research.md found no timing rule that beats plain DCA).
"""

import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

DIR = Path(__file__).resolve().parent.parent / "data" / "outlook"

TONES = ("긍정", "중립", "신중")
HOUSES = {"jpm": "JPM", "bofa": "BofA", "gs": "골드만삭스", "citi": "씨티", "fed": "연준", "bok": "한국은행"}
ACCESS = ("원문", "보도")  # read the original / only through press coverage (paid client research)
WEEK = re.compile(r"^\d{4}-W\d{2}$")
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def validate(doc: dict) -> list[str]:
    """Every problem in one pass, so the agent can fix the file before committing it."""
    errs = []

    def text(v, where, limit):
        if not isinstance(v, str) or not v.strip():
            errs.append(f"{where}: empty or not text")
        elif len(v) > limit:
            errs.append(f"{where}: {len(v)} chars, keep it under {limit}")

    if not WEEK.match(str(doc.get("week", ""))):
        errs.append("week: use ISO week like 2026-W39")
    if not DATE.match(str(doc.get("asOf", ""))):
        errs.append("asOf: use YYYY-MM-DD")
    if doc.get("author") not in ("claude", "codex"):
        errs.append("author: claude or codex")
    if doc.get("stance") not in TONES:
        errs.append(f"stance: one of {TONES}")
    text(doc.get("headline"), "headline", 80)
    text(doc.get("reason"), "reason", 600)
    points = doc.get("points")
    if not isinstance(points, list) or not 2 <= len(points) <= 5:
        errs.append("points: 2 to 5 lines")
    else:
        for i, p in enumerate(points):
            text(p, f"points[{i}]", 120)
    text(doc.get("isa"), "isa", 120)

    houses = doc.get("houses")
    if not isinstance(houses, list):
        errs.append("houses: list of the six houses")
        houses = []
    ids = [h.get("id") for h in houses if isinstance(h, dict)]
    if sorted(ids) != sorted(HOUSES):
        errs.append(f"houses: exactly one each of {list(HOUSES)}, got {ids}")
    for h in houses:
        if not isinstance(h, dict):
            continue
        where = f"houses[{h.get('id')}]"
        if h.get("tone") is not None and h.get("tone") not in TONES:
            errs.append(f"{where}.tone: one of {TONES} or null when nothing new this week")
        text(h.get("summary"), f"{where}.summary", 50)
        text(h.get("detail"), f"{where}.detail", 600)
        sources = h.get("sources")
        if not isinstance(sources, list):
            errs.append(f"{where}.sources: list (may be empty only when tone is null)")
            continue
        if h.get("tone") is not None and not sources:
            errs.append(f"{where}.sources: a view needs at least one source")
        for j, s in enumerate(sources):
            sw = f"{where}.sources[{j}]"
            text(s.get("title"), f"{sw}.title", 140)
            if not str(s.get("url", "")).startswith("https://"):
                errs.append(f"{sw}.url: https link")
            if not DATE.match(str(s.get("date", ""))):
                errs.append(f"{sw}.date: YYYY-MM-DD")
            if s.get("access") not in ACCESS:
                errs.append(f"{sw}.access: one of {ACCESS}")

    watch = doc.get("watch", [])
    if not isinstance(watch, list) or len(watch) > 8:
        errs.append("watch: up to 8 events")
    else:
        for i, w in enumerate(watch):
            if not DATE.match(str(w.get("date", ""))):
                errs.append(f"watch[{i}].date: YYYY-MM-DD")
            text(w.get("event"), f"watch[{i}].event", 60)
    return errs


def this_week(now: datetime | None = None) -> tuple[str, str]:
    """ISO week and date in Korea. Fixed +9 offset: Windows Python has no tz database without tzdata."""
    d = (now or datetime.now(timezone.utc)).astimezone(timezone(timedelta(hours=9))).date()
    y, w, _ = d.isocalendar()
    return f"{y}-W{w:02d}", d.isoformat()


def _files() -> list[Path]:
    return sorted(DIR.glob("*-W*.json")) if DIR.exists() else []


def get_outlook() -> dict:
    """The latest week plus the stance of the weeks before it (so a change of tone shows)."""
    files = _files()
    if not files:
        return {"available": False}
    doc = json.loads(files[-1].read_text(encoding="utf-8"))
    past = []
    for f in files[-9:-1]:
        try:
            d = json.loads(f.read_text(encoding="utf-8"))
            past.append({"week": d["week"], "stance": d["stance"]})
        except Exception:
            continue
    doc.setdefault("reason", "")
    for h in doc.get("houses", []):
        h["name"] = HOUSES.get(h.get("id"), h.get("id"))
        if "summary" not in h:  # files before 2026-09-27 had one `view` line per house
            h["summary"], h["detail"] = h.pop("view", ""), ""
    return {"available": True, **doc, "past": past}


if __name__ == "__main__":
    if sys.argv[1:] == ["week"]:
        week, day = this_week()
        path = DIR / f"{week}.json"
        print(f"{week} {day} {'exists' if path.exists() else 'missing'} {path.relative_to(DIR.parents[2])}")
        sys.exit(0)
    if len(sys.argv) != 3 or sys.argv[1] != "check":
        sys.exit("usage: python -m app.services.outlook week | check <file.json>")
    path = Path(sys.argv[2])
    doc = json.loads(path.read_text(encoding="utf-8"))
    errors = validate(doc)
    if path.stem != doc.get("week"):
        errors.append(f"file name: must be {doc.get('week')}.json")
    if errors:
        print("\n".join(errors))
        sys.exit(1)
    print(f"{path.name}: ok")
