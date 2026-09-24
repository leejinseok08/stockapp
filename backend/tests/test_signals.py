import numpy as np
import pandas as pd
import pytest

import app.services.signals as signals
from app.services import market

IDX = pd.bdate_range(end="2026-09-24", periods=250)


def series(values):
    return pd.Series(np.asarray(values, dtype=float), index=IDX[-len(values):])


def ramp(start, end, n=250):
    return series(np.linspace(start, end, n))


@pytest.fixture(autouse=True)
def clear_cache():
    market._CACHE.clear()
    yield
    market._CACHE.clear()


def install(monkeypatch, closes: dict, flows: pd.DataFrame | None = None, krx=True):
    monkeypatch.setattr(signals, "_daily_closes", lambda t: closes[t])
    monkeypatch.setattr(signals, "_flow_frame", lambda m: flows)
    monkeypatch.setattr(signals, "krx_configured", lambda: krx)


def target(result, tid):
    return next(t for t in result["targets"] if t["id"] == tid)


def base_closes(index_series, vix, krw):
    return {"^GSPC": index_series, "^NDX": index_series, "SMH": index_series, "^KS11": index_series,
            "^VIX": vix, "KRW=X": krw}


def test_overheated_market_scores_low(monkeypatch):
    # Steady rally to a fresh high, calm VIX at its yearly low, won at its weakest (USD/KRW high).
    rally = ramp(100, 140)
    install(monkeypatch, base_closes(rally, ramp(30, 12), ramp(1300, 1450)))
    sp = target(signals.get_signals(), "sp500")
    assert sp["score"] < 40
    assert sp["action"] == "과열 구간"
    assert "multiplier" not in sp  # context only; the plan buys a fixed amount
    assert "환헤지" in sp["fxHint"]


def test_selloff_with_fear_and_strong_won_scores_high(monkeypatch):
    # 25% drawdown into the yearly low, VIX spiking to its high, won at its strongest.
    selloff = series(np.r_[np.linspace(100, 130, 200), np.linspace(130, 97, 50)])
    install(monkeypatch, base_closes(selloff, ramp(12, 40), ramp(1450, 1300)))
    sp = target(signals.get_signals(), "sp500")
    assert sp["score"] >= 70
    assert sp["action"] == "조정·공포 구간"
    assert "환노출" in sp["fxHint"]


def test_kospi_uses_foreign_flows_percentile(monkeypatch):
    flat = series(100 + np.sin(np.arange(250) / 10))
    days = pd.bdate_range(end="2026-09-24", periods=260)
    # Foreigners net-selling all year, then buying hard over the last 20 days.
    foreign = np.r_[np.full(240, -1e11), np.full(20, 5e11)]
    flows = pd.DataFrame({"foreign": foreign, "institution": 0.0, "individual": 0.0}, index=days)
    install(monkeypatch, base_closes(flat, ramp(15, 20), ramp(1350, 1400)), flows)
    ks = target(signals.get_signals(), "kospi")
    flow = next(c for c in ks["components"] if c["key"] == "flows")
    assert flow["score"] == 100  # today's 20-day sum is the highest of the year
    assert ks["missing"] == []
    assert sum(c["weight"] for c in ks["components"]) == pytest.approx(1.0, abs=0.01)


def test_missing_flows_are_reweighted_not_zeroed(monkeypatch):
    flat = series(100 + np.sin(np.arange(250) / 10))
    install(monkeypatch, base_closes(flat, ramp(15, 20), ramp(1350, 1400)), krx=False)
    ks = target(signals.get_signals(), "kospi")
    assert ks["missing"] == ["flows"]
    assert ks["score"] is not None
    assert sum(c["weight"] for c in ks["components"]) == pytest.approx(1.0, abs=0.01)


def test_signal_rows_for_snapshot(monkeypatch):
    install(monkeypatch, base_closes(ramp(100, 120), ramp(15, 20), ramp(1350, 1400)), krx=False)
    rows = signals.signal_rows(signals.get_signals())
    assert {s for _, s, _ in rows} == {"signal:sp500", "signal:ndx", "signal:semis", "signal:kospi"}
    assert all(d == "2026-09-24" for d, _, _ in rows)
