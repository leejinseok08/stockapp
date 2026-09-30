import json

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.db import AppState, PaperTrade
from app.services import verify


@pytest.fixture
def db(monkeypatch):
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(eng)
    monkeypatch.setattr(verify, "engine", eng)
    monkeypatch.setattr("app.services.screener.records", lambda: {"KR": {"bnf": {"win": 0.6, "avg": 0.006}}})
    return eng


def test_mdd():
    assert verify.mdd([100, 120, 90, 130]) == pytest.approx(-0.25)
    assert verify.mdd([100]) is None


def test_judge_waits_for_enough_trades():
    j = verify.judge([0.01] * 5, 0.05, 0.01, 0.5)
    assert j["verdict"] == "보류" and all(j["checks"].values())
    assert verify.judge([0.01] * 30, 0.05, 0.01, 0.5)["verdict"] == "통과"
    j = verify.judge([0.01] * 30, 0.00, 0.01, 0.5)  # lost to the index
    assert j["verdict"] == "미달" and not j["checks"]["beatIndex"]


def test_summary_uses_only_the_window(db):
    with Session(db) as s:
        for i, (d, ret) in enumerate([("2026-09-29", 0.5), ("2026-10-01", 0.02), ("2026-10-02", -0.01)]):
            s.add(PaperTrade(market="KR", symbol=f"S{i}", tech="bnf", signal_date=d, rank=0, status="closed",
                             entry_date=d, entry_px=100.0, exit_date=d, ret=ret))
        for d, p, m, x in [("2026-09-30", 100.0, 200.0, 10.0), ("2026-10-01", 110.0, 180.0, 11.0), ("2026-10-02", 99.0, 190.0, 12.0)]:
            s.add(AppState(key=f"verify:KR:{d}", updated="", value=json.dumps(
                {"market": "KR", "date": d, "paper": p, "mock": m, "index": x, "fills": {"2": 101.0}})))
        s.commit()
    kr = verify.summary()["KR"]
    assert kr["closed"] == 2 and kr["avg"] == pytest.approx(0.005)  # the 09-29 entry is before START
    assert kr["paper"]["ret"] == pytest.approx(-0.01) and kr["paper"]["mdd"] == pytest.approx(-0.1)
    assert kr["index"]["ret"] == pytest.approx(0.2) and kr["checks"]["beatIndex"] is False
    assert kr["mock"]["ret"] == pytest.approx(-0.05)
    assert kr["fillGap"] == {"n": 1, "avg": pytest.approx(0.01)}  # trade id 2 entered at 100 on paper
    assert kr["techniques"][0]["btWin"] == 0.6
