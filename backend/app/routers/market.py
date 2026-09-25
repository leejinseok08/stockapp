import csv
import io
import logging

from fastapi import APIRouter, Depends
from fastapi.responses import PlainTextResponse
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlmodel import Session, select

from ..db import IS_SQLITE, MarketSnapshot, engine, get_session
from ..services.macro import get_overview, snapshot_rows
from ..services.heatmap import get_heatmap
from ..services.isa_plan import get_isa_plan
from ..services.risk import get_risk, risk_rows
from ..services.signals import get_signals, signal_rows

log = logging.getLogger("stockapp.market")
router = APIRouter(prefix="/market", tags=["market"])


@router.get("/overview")
def overview():
    return get_overview()


@router.get("/signals")
def signals():
    return get_signals()


@router.get("/risk")
def risk():
    return get_risk()


@router.get("/heatmap")
def heatmap():
    """Large caps by sector: size = market cap, color = today's move."""
    return get_heatmap()


def collect_snapshot(session: Session) -> int:
    """Upsert today's numbers; safe to call repeatedly (same date+series just overwrites)."""
    rows = snapshot_rows(get_overview()) + signal_rows(get_signals()) + risk_rows(get_risk())
    if not rows:
        return 0
    insert = sqlite_insert if IS_SQLITE else pg_insert
    stmt = insert(MarketSnapshot).values([{"date": d, "series": s, "value": v} for d, s, v in rows])
    stmt = stmt.on_conflict_do_update(index_elements=["date", "series"], set_={"value": stmt.excluded.value})
    session.exec(stmt)
    session.commit()
    return len(rows)


@router.post("/collect")
def collect(session: Session = Depends(get_session)):
    count = collect_snapshot(session)
    log.info("market snapshot collected: %d rows", count)
    return {"stored": count}


@router.get("/export.csv", response_class=PlainTextResponse)
def export_csv(session: Session = Depends(get_session)):
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["date", "series", "value"])
    for r in session.exec(select(MarketSnapshot).order_by(MarketSnapshot.date, MarketSnapshot.series)):
        writer.writerow([r.date, r.series, r.value])
    return PlainTextResponse(buf.getvalue(), media_type="text/csv")


def startup_collect() -> None:
    """One collection at boot so deploy logs show whether each data source works from the server."""
    try:
        ov = get_overview()
        ok_idx = sum(1 for i in ov["indices"] if i.get("last") is not None)
        ok_fx = sum(1 for c in ov["fx"]["currencies"] if c.get("quote") is not None)
        flows = ov["flows"]
        log.info(
            "data check: indices %d/%d, fx %d/%d, flows available=%s reason=%s",
            ok_idx, len(ov["indices"]), ok_fx, len(ov["fx"]["currencies"]),
            flows["available"], flows.get("reason"),
        )
        for t in get_signals()["targets"]:
            log.info(
                "signal %s: score=%s action=%s inputs=%s missing=%s",
                t["id"], t["score"], t["action"],
                {c["key"]: c["score"] for c in t["components"]}, t["missing"],
            )
        r = get_risk()
        log.info("risk gauge: %d/%d lit (%s), failed=%s", r["lit"], r["total"], r["level"], r["failed"])
        with Session(engine) as session:
            log.info("startup snapshot stored: %d rows", collect_snapshot(session))
        # Warm the big-tech analysis so the first 오늘/종목 screen after a deploy isn't a minute-long wait.
        from ..services.stockscan import get_scan
        from ..tickers import BIGTECH

        rows = get_scan(BIGTECH)["rows"]
        log.info("warmed %d stock analyses: %s", len(rows),
                 {r["symbol"]: ((r.get("trend") or {}).get("action"), (r.get("rating") or {}).get("rating")) for r in rows})
    except Exception:
        log.exception("startup data check failed")


@router.get("/isa-plan")
def isa_plan():
    """This month's ISA buys per ETF under the owner's buy-day rule (계좌 tab only, no alerts)."""
    return get_isa_plan()
