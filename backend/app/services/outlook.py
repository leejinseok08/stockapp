"""Market view (시황): six houses' research summed up twice a day, 09:00 and 22:30 KST.

The files are written by a scheduled agent (Claude routine, Codex automation as the fallback) that
follows tools/outlook/PROMPT.md, validated with `python -m app.services.outlook check <file>`, and
committed to app/data/outlook/<slot>.json, where a slot is `YYYY-MM-DD-am` (09:00 update) or
`YYYY-MM-DD-pm` (22:30 update). Context only: never a buy/sell call (the backtests in
docs/signal-research.md found no timing rule that beats plain DCA).
"""

import json
import logging
import os
import re
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

DIR = Path(__file__).resolve().parent.parent / "data" / "outlook"
log = logging.getLogger("stockapp.outlook")

# New updates are pushed with "[skip render]" so they don't redeploy (and cold-start) the server; the
# server reads them straight from GitHub instead, falling back to the files it was deployed with.
REPO = os.getenv("OUTLOOK_REPO", "leejinseok08/stockapp")
LIST_URL = f"https://api.github.com/repos/{REPO}/contents/backend/app/data/outlook?ref=main"
LIST_TTL = 300  # seconds between directory listings (GitHub allows 60 unauthenticated calls an hour)
_remote: dict[str, dict] = {}  # slot -> document; a slot's file never changes once written
KST = timezone(timedelta(hours=9))  # fixed offset: Windows Python has no tz database without tzdata

TONES = ("긍정", "중립", "신중")
HOUSES = {"jpm": "JPM", "bofa": "BofA", "gs": "골드만삭스", "citi": "씨티", "fed": "연준", "bok": "한국은행"}
ACCESS = ("원문", "보도")  # read the original / only through press coverage (paid client research)
SLOT = re.compile(r"^\d{4}-\d{2}-\d{2}-(am|pm)$")
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
PAST = 10  # earlier updates whose tone is shown as a trail (five days)


def validate(doc: dict) -> list[str]:
    """Every problem in one pass, so the agent can fix the file before committing it."""
    errs = []

    def text(v, where, limit):
        if not isinstance(v, str) or not v.strip():
            errs.append(f"{where}: empty or not text")
        elif len(v) > limit:
            errs.append(f"{where}: {len(v)} chars, keep it under {limit}")

    if not SLOT.match(str(doc.get("slot", ""))):
        errs.append("slot: YYYY-MM-DD-am (09:00 update) or YYYY-MM-DD-pm (22:30 update)")
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
            text(p, f"points[{i}]", 70)
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
            errs.append(f"{where}.tone: one of {TONES} or null when the house has no recent view")
        if not isinstance(h.get("new", False), bool):
            errs.append(f"{where}.new: true only when it has material since the previous update")
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

    # A stance further out than every house is carried by market evidence; the first sentence says so
    # (PROMPT.md step 2, owner 2026-10-01).
    tones = {h.get("tone") for h in houses if isinstance(h, dict) and h.get("tone") in TONES}
    stance = doc.get("stance")
    if tones and stance in ("긍정", "신중") and stance not in tones and isinstance(doc.get("reason"), str):
        first = re.split(r"(?<=[.다])\s", doc["reason"].strip(), maxsplit=1)[0]
        if "기관" not in first:
            errs.append(f"reason: stance {stance} but no house is {stance}; start reason with one sentence naming both, "
                        f"e.g. \"기관은 긍정 3·중립 3이지만 <market evidence with number and date>로 {stance}\", "
                        "or keep the stance within the houses' range")
    watch = doc.get("watch", [])
    if not isinstance(watch, list) or len(watch) > 8:
        errs.append("watch: up to 8 events")
    else:
        for i, w in enumerate(watch):
            if not DATE.match(str(w.get("date", ""))):
                errs.append(f"watch[{i}].date: YYYY-MM-DD")
            text(w.get("event"), f"watch[{i}].event", 60)
    return errs


def this_slot(now: datetime | None = None) -> tuple[str, str]:
    """The update this run belongs to, in Korea: before 16:00 = the 09:00 update (am), else 22:30 (pm).
    A 22:30 run that slips past midnight counts as the next morning's."""
    t = (now or datetime.now(timezone.utc)).astimezone(KST)
    return f"{t.date().isoformat()}-{'am' if t.hour < 16 else 'pm'}", t.date().isoformat()


def _files() -> list[Path]:
    # Slot names sort in time order (date, then am before pm).
    return sorted(p for p in DIR.glob("*.json") if SLOT.match(p.stem)) if DIR.exists() else []


def _fetch_json(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": "stockapp", "Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _remote_docs() -> list[dict]:
    """The newest PAST+1 documents on GitHub main, oldest first. Raises when GitHub can't be reached."""
    from .market import _cached

    listing = _cached("outlook:list", LIST_TTL, lambda: [
        (f["name"][:-5], f["download_url"]) for f in _fetch_json(LIST_URL)
        if f.get("name", "").endswith(".json") and SLOT.match(f["name"][:-5])
    ])
    wanted = sorted(listing)[-(PAST + 1):]
    for slot, url in wanted:
        if slot not in _remote:
            _remote[slot] = _fetch_json(url)
    for old in [k for k in _remote if k not in dict(wanted)]:
        del _remote[old]
    return [_remote[slot] for slot, _ in wanted]


def _local_docs() -> list[dict]:
    docs = []
    for f in _files()[-(PAST + 1):]:
        try:
            docs.append(json.loads(f.read_text(encoding="utf-8")))
        except Exception:
            continue
    return docs


def get_outlook() -> dict:
    """The latest update plus the tone of the ones before it (so a change of tone shows)."""
    try:
        docs = _remote_docs()
    except Exception as e:
        log.warning("outlook from GitHub failed, using deployed files: %s", e)
        docs = []
    local = _local_docs()
    if not docs or (local and local[-1].get("slot", "") > docs[-1].get("slot", "")):
        docs = local
    if not docs:
        return {"available": False}
    doc = json.loads(json.dumps(docs[-1]))  # a copy: the cached original stays untouched
    past = [{"slot": d["slot"], "stance": d["stance"]} for d in docs[:-1] if "slot" in d and "stance" in d]
    doc.setdefault("reason", "")
    for h in doc.get("houses", []):
        h["name"] = HOUSES.get(h.get("id"), h.get("id"))
        h.setdefault("new", False)
        if "summary" not in h:  # files before 2026-09-27 had one `view` line per house
            h["summary"], h["detail"] = h.pop("view", ""), ""
    return {"available": True, **doc, "past": past}


def history() -> list[dict]:
    """Every update on disk, newest first — slot / asOf / stance / headline for a list."""
    out = []
    for f in reversed(_files()):
        try:
            d = json.loads(f.read_text(encoding="utf-8"))
            out.append({"slot": d["slot"], "asOf": d["asOf"], "stance": d["stance"], "headline": d["headline"]})
        except Exception:
            continue
    return out


if __name__ == "__main__":
    if sys.argv[1:] == ["slot"]:
        slot, day = this_slot()
        path = DIR / f"{slot}.json"
        previous = _files()
        print(f"{slot} {day} {'exists' if path.exists() else 'missing'} {path.relative_to(DIR.parents[2])}")
        print(f"previous: {previous[-1].relative_to(DIR.parents[2]) if previous else 'none'}")
        sys.exit(0)
    if len(sys.argv) != 3 or sys.argv[1] != "check":
        sys.exit("usage: python -m app.services.outlook slot | check <file.json>")
    path = Path(sys.argv[2])
    doc = json.loads(path.read_text(encoding="utf-8"))
    errors = validate(doc)
    if path.stem != doc.get("slot"):
        errors.append(f"file name: must be {doc.get('slot')}.json")
    if errors:
        print("\n".join(errors))
        sys.exit(1)
    print(f"{path.name}: ok")
