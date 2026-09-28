import copy
import json

import pandas as pd
import pytest

from app.services import outlook, rates


# ---- rates ---------------------------------------------------------------------------------------
def test_parse_ecos_skips_blank_values_and_sorts():
    body = {"StatisticSearch": {"row": [
        {"TIME": "20260923", "DATA_VALUE": "4.0"},
        {"TIME": "20260921", "DATA_VALUE": "4.1"},
        {"TIME": "20260922", "DATA_VALUE": ""},
    ]}}
    s = rates.parse_ecos(body)
    assert list(s.index.strftime("%Y-%m-%d")) == ["2026-09-21", "2026-09-23"]
    assert list(s) == [4.1, 4.0]


def test_parse_ecos_error_raises():
    with pytest.raises(RuntimeError):
        rates.parse_ecos({"RESULT": {"CODE": "INFO-200", "MESSAGE": "해당하는 데이터가 없습니다."}})


def test_gap_only_on_shared_days():
    kr = pd.Series([3.0, 3.1, 3.2], index=pd.to_datetime(["2026-09-21", "2026-09-22", "2026-09-23"]))
    us = pd.Series([4.0, 4.3], index=pd.to_datetime(["2026-09-22", "2026-09-24"]))
    g = rates.gap(kr, us)
    assert list(g.index.strftime("%Y-%m-%d")) == ["2026-09-22"]
    assert g.iloc[0] == pytest.approx(-0.9)


# ---- outlook -------------------------------------------------------------------------------------
def _house(id_, tone="중립"):
    return {"id": id_, "tone": tone, "summary": "요약 한 줄", "detail": "자세한 설명 두세 문장.",
            "sources": [{"title": "t", "url": "https://example.com", "date": "2026-09-25", "access": "원문"}]}


GOOD = {
    "slot": "2026-09-26-pm", "asOf": "2026-09-26", "author": "claude", "stance": "중립",
    "headline": "금리 부담 속 중립", "reason": "왜 중립인지 설명.", "points": ["하나", "둘"], "isa": "환노출 유지, 적립 그대로",
    "houses": [_house(i) for i in outlook.HOUSES],
    "watch": [{"date": "2026-10-02", "event": "미국 고용"}],
}


def test_validate_accepts_good_doc():
    assert outlook.validate(GOOD) == []


def test_validate_reports_each_problem():
    bad = copy.deepcopy(GOOD)
    bad["stance"] = "매수"
    bad["houses"] = bad["houses"][:5]
    bad["houses"][0]["sources"][0]["access"] = "유료"
    bad["houses"][1]["sources"] = []
    errs = outlook.validate(bad)
    assert any(e.startswith("stance") for e in errs)
    assert any("exactly one each" in e for e in errs)
    assert any(e.endswith(".access: one of ('원문', '보도')") for e in errs)
    assert any("needs at least one source" in e for e in errs)


def test_validate_new_flag_must_be_bool():
    doc = copy.deepcopy(GOOD)
    doc["houses"][0]["new"] = "yes"
    assert any(e.endswith(".new: true only when it has material since the previous update") for e in outlook.validate(doc))


def test_validate_allows_quiet_house():
    doc = copy.deepcopy(GOOD)
    doc["houses"] = [{"id": "citi", "tone": None, "summary": "이번 주 새 자료 없음", "detail": "이번 주 새 자료 없음", "sources": []} if h["id"] == "citi" else h
                     for h in doc["houses"]]
    assert outlook.validate(doc) == []


def test_get_outlook_latest_with_past_stances(tmp_path, monkeypatch):
    monkeypatch.setattr(outlook, "DIR", tmp_path)
    assert outlook.get_outlook() == {"available": False}
    # am sorts before pm on the same day; stray files that aren't a slot are ignored.
    (tmp_path / ".gitkeep").write_text("")
    for slot, stance in [("2026-09-27-pm", "신중"), ("2026-09-28-am", "긍정"), ("2026-09-28-pm", "중립")]:
        (tmp_path / f"{slot}.json").write_text(json.dumps({**GOOD, "slot": slot, "stance": stance}), encoding="utf-8")
    got = outlook.get_outlook()
    assert got["slot"] == "2026-09-28-pm"
    assert got["past"] == [{"slot": "2026-09-27-pm", "stance": "신중"}, {"slot": "2026-09-28-am", "stance": "긍정"}]
    assert [h["slot"] for h in outlook.history()] == ["2026-09-28-pm", "2026-09-28-am", "2026-09-27-pm"]
    assert {h["name"] for h in got["houses"]} == set(outlook.HOUSES.values())


def test_this_slot_in_korean_time():
    from datetime import datetime, timezone
    utc = lambda *a: datetime(*a, tzinfo=timezone.utc)
    assert outlook.this_slot(utc(2026, 9, 28, 0, 0)) == ("2026-09-28-am", "2026-09-28")  # 09:00 KST
    assert outlook.this_slot(utc(2026, 9, 28, 1, 0)) == ("2026-09-28-am", "2026-09-28")  # Codex fallback 10:00
    assert outlook.this_slot(utc(2026, 9, 28, 13, 30)) == ("2026-09-28-pm", "2026-09-28")  # 22:30 KST
    assert outlook.this_slot(utc(2026, 9, 28, 14, 30)) == ("2026-09-28-pm", "2026-09-28")  # fallback 23:30


def test_get_outlook_reads_old_view_files(tmp_path, monkeypatch):
    monkeypatch.setattr(outlook, "DIR", tmp_path)
    old = copy.deepcopy(GOOD)
    old.pop("reason")
    for h in old["houses"]:
        h["view"] = h.pop("summary")
        h.pop("detail")
    (tmp_path / "2026-09-27-pm.json").write_text(json.dumps(old), encoding="utf-8")
    got = outlook.get_outlook()
    assert got["reason"] == ""
    assert got["houses"][0]["summary"] == "요약 한 줄" and got["houses"][0]["detail"] == ""
