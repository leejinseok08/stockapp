from datetime import datetime

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from app.db import KiwoomOrder, PaperTrade
from app.services import kiwoom, kiwoom_mock
from app.services.macro import KST


@pytest.fixture
def keys(monkeypatch):
    for k in ("KIWOOM_APP_KEY", "KIWOOM_APP_SECRET", "KIWOOM_MOCK_APP_KEY", "KIWOOM_MOCK_APP_SECRET"):
        monkeypatch.setenv(k, "x")
    monkeypatch.setattr(kiwoom, "GAP", 0)
    for c in kiwoom._clients.values():
        c.token, c.expires = None, None


@pytest.fixture
def server(monkeypatch, keys):
    """A fake Kiwoom: answers by api-id from a dict; records every call."""
    calls, answers = [], {}

    def post(url, body, headers, timeout=20):
        calls.append((url, headers.get("api-id"), body, dict(headers)))
        if url.endswith("/oauth2/token"):
            return {"return_code": 0, "token": f"T{len(calls)}", "expires_dt": "20991231235959"}, {}
        a = answers[headers["api-id"]]
        return (a(body, headers) if callable(a) else a), {}

    monkeypatch.setattr(kiwoom, "_post", post)
    return calls, answers


@pytest.fixture
def db(monkeypatch):
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(eng)
    monkeypatch.setattr(kiwoom_mock, "engine", eng)
    import app.db as dbmod
    monkeypatch.setattr(dbmod, "engine", eng)
    return eng


def test_numbers_codes_and_ticks():
    assert kiwoom.num("-000000012345") == -12345 and kiwoom.num("+1.25") == 1.25 and kiwoom.num("") is None
    assert kiwoom._pct("+12.34") == pytest.approx(0.1234)
    assert kiwoom.kr_code("005930.KS") == "005930" and kiwoom.kr_code("A005930") == "005930"
    assert kiwoom.kr_round(51_234, "buy") == 51_200 and kiwoom.kr_round(51_234, "sell") == 51_300
    assert kiwoom.kr_round(1_999.4, "buy") == 1_999 and kiwoom.kr_round(4_998, "sell") == 5_000


def test_real_account_cannot_order(keys):
    with pytest.raises(kiwoom.KiwoomError, match="조회만"):
        kiwoom.client("real").call("kt10000", {})
    with pytest.raises(kiwoom.KiwoomError, match="조회만"):
        kiwoom.client("real").call("ust20000", {})


def test_not_configured(monkeypatch):
    monkeypatch.delenv("KIWOOM_MOCK_APP_KEY", raising=False)
    with pytest.raises(kiwoom.NotConfigured):
        kiwoom.client("mock").call("kt00018", {})


def test_expired_token_is_reissued_once(server):
    calls, answers = server
    seen = []

    def bal(body, headers):
        seen.append(headers["authorization"])
        return {"return_code": 8005, "return_msg": "Token이 유효하지 않습니다"} if len(seen) == 1 else {"return_code": 0, "ok": 1}

    answers["kt00001"] = bal
    assert kiwoom.client("mock").call("kt00001", {"qry_tp": "3"})[0]["ok"] == 1
    assert seen[0] != seen[1]  # a new token the second time
    answers["kt00001"] = {"return_code": 1511, "return_msg": "필수 입력 값"}
    with pytest.raises(kiwoom.KiwoomError) as e:
        kiwoom.client("mock").call("kt00001", {})
    assert e.value.code == 1511


def test_balances_parse_the_spec_fields(server):
    _, answers = server
    answers["kt00018"] = {"return_code": 0, "tot_pur_amt": "000000001000000", "tot_evlt_amt": "000000001100000",
                          "tot_evlt_pl": "000000000100000", "tot_prft_rt": "+10.00", "prsm_dpst_aset_amt": "000000005000000",
                          "acnt_evlt_remn_indv_tot": [
                              {"stk_cd": "A005930", "stk_nm": "삼성전자", "rmnd_qty": "000000000000010", "trde_able_qty": "000000000000010",
                               "pur_pric": "000000000100000", "cur_prc": "000000110000", "evlt_amt": "000000001100000",
                               "pur_amt": "000000001000000", "evltv_prft": "000000000100000", "prft_rt": "+10.00"},
                              {"stk_cd": "A000660", "stk_nm": "매도끝", "rmnd_qty": "000000000000000"}]}
    answers["kt00001"] = {"return_code": 0, "entr": "000000003900000", "ord_alow_amt": "000000003800000"}
    kr = kiwoom.kr_balance("real")
    assert [h["symbol"] for h in kr["holdings"]] == ["005930"]
    assert kr["holdings"][0]["ret"] == pytest.approx(0.10) and kr["equity"] == 5_000_000 and kr["orderable"] == 3_800_000
    answers["ust21070"] = {"return_code": 0, "tot_prch_amt": "1000.00", "tot_pl_amt": "50.00", "tot_pl_rt": "5.00",
                           "tot_evlt_amt_krw": "1470000", "result_list": [
                               {"stex_nm": "NASDAQ", "stk_cd": "NVDA", "frgn_stk_nm": "NVIDIA", "poss_qty": "5", "sell_alowq": "5",
                                "frgn_stk_book_uv": "200.00", "now_pric": "210.00", "evlt_amt": "1050.00", "frgn_stk_book_amt": "1000.00",
                                "pl_amt": "50.00", "pl_rt": "5.00"}]}
    answers["ust21110"] = {"return_code": 0, "result_list": [{"crnc_code": "USD", "fc_entra": "500.00", "fc_ord_alowa": "480.00"}]}
    us = kiwoom.us_balance("real")
    assert us["holdings"][0]["symbol"] == "NVDA" and us["equity"] == pytest.approx(1550) and us["orderable"] == 480


def test_paging_follows_next_key(keys, monkeypatch):
    pages = iter([({"return_code": 0, "n": 1}, {"cont-yn": "Y", "next-key": "K"}), ({"return_code": 0, "n": 2}, {})])
    sent = []

    def post(url, body, headers, timeout=20):
        if url.endswith("/oauth2/token"):
            return {"return_code": 0, "token": "T", "expires_dt": "20991231235959"}, {}
        sent.append(headers.get("next-key"))
        return next(pages)

    monkeypatch.setattr(kiwoom, "_post", post)
    assert [p["n"] for p in kiwoom.client("mock").call("kt00018", {}, pages=5)] == [1, 2]
    assert sent == [None, "K"]


def test_orders_go_to_the_mock_host_with_the_right_codes(server):
    calls, answers = server
    answers["kt10000"] = {"return_code": 0, "ord_no": "0001"}
    answers["ust20001"] = {"return_code": 0, "ord_no": "0002"}
    answers["usa10098"] = {"return_code": 0, "list": [{"stk_cd": "BRK.B", "stex_tp": "NY"}]}
    assert kiwoom.order("KR", "buy", "005930.KS", 3, None) == "0001"
    _, api, body, _ = calls[-1]
    assert api == "kt10000" and body["trde_tp"] == "3" and body["stk_cd"] == "005930" and calls[-1][0].startswith("https://mockapi")
    assert kiwoom.order("US", "sell", "BRK-B", 2, 480.123) == "0002"
    _, api, body, _ = calls[-1]
    assert api == "ust20001" and body == {"stex_tp": "NY", "stk_cd": "BRK.B", "ord_qty": "2", "trde_tp": "00", "ord_uv": "480.13"}


def _trade(s, **kw):
    t = PaperTrade(**{"market": "KR", "tech": "bnf", "signal_date": "2026-09-29", "rank": 0, "status": "pending", **kw})
    s.add(t)
    s.commit()
    s.refresh(t)
    return t


def test_plan_sizes_entries_from_the_mock_account_and_follows_exits(db, keys, monkeypatch):
    monkeypatch.setattr(kiwoom_mock, "_balance", lambda m: {
        "holdings": [{"symbol": "000660", "qty": 10, "sellable": 10}], "equity": 20_000_000, "orderable": 5_000_000})
    monkeypatch.setattr(kiwoom_mock, "_remember_start", lambda m, b: None)
    with Session(db) as s:
        held = _trade(s, symbol="000660.KS", name="SK하이닉스", signal_date="2026-09-20", status="open")
        s.add(KiwoomOrder(market="KR", trade_id=held.id, symbol="000660.KS", side="buy", qty=10, session="2026-09-20",
                          status="sent", created="x"))
        a = _trade(s, symbol="005930.KS", name="삼성전자", rank=1)
        b = _trade(s, symbol="035420.KS", name="NAVER", rank=0, limit_px=200_000.0)
        _trade(s, symbol="111111.KS", rank=2, pick=False)  # paused day: logged, not taken
        s.commit()
        hid, aid, bid = held.id, a.id, b.id
    updates = [{"id": hid, "status": "open", "next": [("sell", 0.5, 300_000.0, False), ("sell", 0.5, None, True)]}]
    out = kiwoom_mock.plan("KR", updates, {"005930.KS": 60_000.0, "035420.KS": 210_000.0}, "2026-09-29")
    got = [(o["symbol"], o["side"], o["qty"], o["price"]) for o in out["orders"]]
    # KR: 20 slots -> ₩1,000,000 each; NAVER first (rank 0) at its limit, 삼성전자 at close x 1.03
    assert got == [("000660.KS", "sell", 5, 300_000.0), ("000660.KS", "sell", 5, None),
                   ("035420.KS", "buy", 5, 200_000.0), ("005930.KS", "buy", 16, None)]
    with Session(db) as s:
        o = s.exec(select(KiwoomOrder).where(KiwoomOrder.symbol == "035420.KS")).one()
        assert o.trade_id == bid and o.status == "planned"
    # a second scan of the same day replaces the plan; once sent, it is never planned twice
    assert len(kiwoom_mock.plan("KR", updates, {"005930.KS": 60_000.0, "035420.KS": 210_000.0}, "2026-09-29")["orders"]) == 4
    with Session(db) as s:
        assert len(s.exec(select(KiwoomOrder).where(KiwoomOrder.status == "expired")).all()) == 4
        for o in s.exec(select(KiwoomOrder).where(KiwoomOrder.status == "planned")):
            o.status = "sent"
            s.add(o)
        s.commit()
    assert kiwoom_mock.plan("KR", updates, {}, "2026-09-29") == {"skipped": "이미 실행한 계획"}
    assert aid


def test_plan_sells_what_the_replay_already_closed(db, keys, monkeypatch):
    monkeypatch.setattr(kiwoom_mock, "_balance", lambda m: {
        "holdings": [{"symbol": "000660", "qty": 7, "sellable": 7}], "equity": 1_000_000, "orderable": 0})
    monkeypatch.setattr(kiwoom_mock, "_remember_start", lambda m, b: None)
    with Session(db) as s:
        t = _trade(s, symbol="000660.KS", signal_date="2026-09-20", status="closed")
        s.add(KiwoomOrder(market="KR", trade_id=t.id, symbol="000660.KS", side="buy", qty=10, session="2026-09-20",
                          status="sent", created="x"))
        s.commit()
    out = kiwoom_mock.plan("KR", [], {}, "2026-09-29")
    assert [(o["side"], o["qty"], o["price"]) for o in out["orders"]] == [("sell", 7, None)]


def test_execute_sends_sells_first_only_while_open(db, keys, monkeypatch):
    with Session(db) as s:
        s.add(KiwoomOrder(market="US", symbol="NVDA", side="buy", qty=1, session="d", status="planned", created="x"))
        s.add(KiwoomOrder(market="US", symbol="AAPL", side="sell", qty=2, session="d", status="planned", created="x"))
        s.add(KiwoomOrder(market="US", symbol="BAD", side="buy", qty=1, session="d", status="planned", created="x"))
        s.commit()
    sent = []

    def order(market, side, symbol, qty, price):
        if symbol == "BAD":
            raise kiwoom.KiwoomError(1902, "종목 정보가 없습니다")
        sent.append(symbol)
        return "N" + symbol

    monkeypatch.setattr(kiwoom, "order", order)
    monkeypatch.setattr(kiwoom_mock, "market_open", lambda m: False)
    assert kiwoom_mock.execute("US") == {"skipped": "장 시간 아님"}
    monkeypatch.setattr(kiwoom_mock, "market_open", lambda m: True)
    assert kiwoom_mock.execute("US") == {"sent": 2, "failed": 1}
    assert sent == ["AAPL", "NVDA"]
    with Session(db) as s:
        bad = s.exec(select(KiwoomOrder).where(KiwoomOrder.symbol == "BAD")).one()
        assert bad.status == "failed" and "1902" in bad.msg


def test_market_hours():
    assert kiwoom_mock.market_open("KR", datetime(2026, 9, 29, 9, 1, tzinfo=KST))
    assert not kiwoom_mock.market_open("KR", datetime(2026, 10, 3, 10, 0, tzinfo=KST))  # Saturday
    assert kiwoom_mock.market_open("US", datetime(2026, 9, 29, 22, 31, tzinfo=KST))  # 09:31 EDT
    assert not kiwoom_mock.market_open("US", datetime(2026, 12, 1, 22, 31, tzinfo=KST))  # 08:31 EST


def test_account_needs_the_token(monkeypatch):
    from fastapi import HTTPException

    from app.routers import kiwoom as r

    monkeypatch.delenv("ACCOUNT_TOKEN", raising=False)
    with pytest.raises(HTTPException) as e:
        r.account("x")
    assert e.value.status_code == 503
    monkeypatch.setenv("ACCOUNT_TOKEN", "secret")
    with pytest.raises(HTTPException) as e:
        r.account("wrong")
    assert e.value.status_code == 401
    monkeypatch.delenv("KIWOOM_APP_KEY", raising=False)
    assert r.account("secret") == {"configured": False}
