import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from app.db import PaperTrade
from app.services import paper
from app.services.swing import BY_KEY
from test_swing import _bars


@pytest.fixture
def db(monkeypatch):
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(eng)
    monkeypatch.setattr(paper, "engine", eng)
    return eng


def test_settle_pending_open_and_closed():
    b = _bars([100.0] * 300 + [89.0])
    assert paper.settle(b, BY_KEY["bnf"], 300, ("mkt",), (0, 0)) == {"status": "pending"}
    b = _bars([100.0] * 300 + [89.0, 88.0])
    t = paper.settle(b, BY_KEY["bnf"], 300, ("mkt",), (0, 0))
    assert t["status"] == "open" and t["entry_px"] == b["o"][301]
    b = _bars([100.0] * 300 + [89.0] + [88.0] * 5)  # BNF sells after 3 bars at the next open
    t = paper.settle(b, BY_KEY["bnf"], 300, ("mkt",), (0, 0))
    assert t["status"] == "closed" and t["exit_date"] == b.index[305].strftime("%Y-%m-%d")
    assert t["ret"] == pytest.approx(b["o"][305] / b["o"][301] - 1)


def test_save_skips_a_pair_that_is_still_open(db):
    sig = {"symbol": "A", "name": "A", "tech": "bnf", "date": "2026-09-28", "rank": 0, "limit": None}
    assert paper.save("KR", [], [sig]) == 1
    assert paper.save("KR", [], [{**sig, "date": "2026-09-29"}]) == 0  # still pending
    with Session(db) as s:
        tid = s.exec(select(PaperTrade)).one().id
    paper.save("KR", [{"id": tid, "status": "closed", "entry_date": "2026-09-29", "entry_px": 1.0,
                       "exit_date": "2026-10-02", "ret": 0.03}], [])
    assert paper.save("KR", [], [{**sig, "date": "2026-10-05"}]) == 1


def test_account_takes_top_ranked_into_ten_slots():
    def t(sym, rank, ret, status="closed"):
        return PaperTrade(market="KR", symbol=sym, tech="bnf", signal_date="2026-09-28", rank=rank, status=status,
                          entry_date="2026-09-29", entry_px=1.0, exit_date="2026-10-02" if status == "closed" else None, ret=ret)
    trades = [t(f"S{n}", n, 0.10 if n % 2 == 0 else -0.05) for n in range(12)]  # 12 fills, 10 slots
    a = paper.account(trades, "KR")
    assert a["trades"] == 10 and a["closed"] == 10
    assert a["pnl"] == pytest.approx(1_000_000 * (5 * 0.10 - 5 * 0.05))  # S10, S11 missed out
    live = paper.account([t("A", 0, 0.02, "open")], "KR")
    assert live["pnl"] == pytest.approx(20_000) and live["holding"][0]["symbol"] == "A"


def test_account_skips_paused_days_and_follows_exit_priority():
    def t(sym, tech, ret, pick=True):
        return PaperTrade(market="KR", symbol=sym, tech=tech, signal_date="2026-09-28", rank=0, pick=pick, status="closed",
                          entry_date="2026-09-29", entry_px=1.0, exit_date="2026-10-02", ret=ret)
    a = paper.account([t("A", "mfi_mid", -0.05), t("A", "bnf", 0.04), t("B", "bnf", 0.5, pick=False)], "KR")
    assert a["trades"] == 1 and a["pnl"] == pytest.approx(1_000_000 * 0.04)
